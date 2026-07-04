import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import AiEvent from '../models/AiEvent.js';
import AuditLog from '../models/AuditLog.js';
import Session from '../models/Session.js';
import User from '../models/User.js';
import { parseUserAgent } from './deviceService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pythonScriptPath = path.join(__dirname, '..', '..', '..', 'ai_engine', 'ai_risk_analyzer.py');
const venvPythonPath = path.join(__dirname, '..', '..', '..', 'ai_engine', 'venv', 'Scripts', 'python.exe');

/**
 * Spawns the Python risk analyzer and passes event telemetry via stdin
 */
const runPythonRiskAnalyzer = (eventData) => {
  return new Promise((resolve, reject) => {
    const pythonExecutable = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python';
    const pythonProcess = spawn(pythonExecutable, [pythonScriptPath]);
    
    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python process exited with code ${code}. Error: ${stderrData}`));
      }
      try {
        const parsed = JSON.parse(stdoutData.trim());
        if (parsed.error) {
          return reject(new Error(`Python analyzer error: ${parsed.error}`));
        }
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse Python stdout: ${stdoutData}. Error: ${err.message}`));
      }
    });

    pythonProcess.stdin.write(JSON.stringify(eventData));
    pythonProcess.stdin.end();
  });
};

/**
 * Assesses the risk of a security event based on heuristics calculated in Python.
 * Triggers mitigations (e.g. force logouts) for critical events.
 * 
 * @param {Object} params - Event properties
 */
export const analyzeSecurityEvent = async ({
  userId,
  email,
  action,
  details = {},
  ip = '',
  userAgent = '',
  deviceSecure,
  networkSecure,
  isPublicNetwork,
  deviceKnown,
  vpnActive
}) => {
  let currentEmail = email || '';

  // Retrieve user email if userId is available
  if (userId && !currentEmail) {
    const user = await User.findById(userId);
    if (user) currentEmail = user.email;
  }

  // Retrieve historic counts and status checks for heuristics
  const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
  
  const failedCount = await AuditLog.countDocuments({
    userEmail: currentEmail,
    action: 'FAILED_LOGIN',
    'details.resolved': { $ne: true },
    createdAt: { $gte: fifteenMinsAgo }
  });
  const failed_login_count = failedCount + (action === 'FAILED_LOGIN' ? 1 : 0);

  const denialsCount = await AuditLog.countDocuments({
    userId,
    action: 'ACCESS_DENIED',
    createdAt: { $gte: fifteenMinsAgo }
  });
  const denied_route_count = denialsCount + (action === 'ACCESS_DENIED' ? 1 : 0);

  const activeSessionsCount = await Session.countDocuments({ userId, status: 'active' });

  // Evaluate secondary modifiers (device/IP shift)
  let ip_changed = false;
  let ua_changed = false;

  const previousSession = await Session.findOne({ 
    userId, 
    status: { $in: ['active', 'revoked'] } 
  }).sort({ createdAt: -1 });

  if (previousSession) {
    const { browser: currentBrowser, os: currentOs } = parseUserAgent(userAgent);
    ip_changed = previousSession.ipAddress !== ip;
    ua_changed = previousSession.browser !== currentBrowser || previousSession.os !== currentOs;
  }

  // Retrieve user's login history to build baseline profile for anomaly detection
  let historyLogs = [];
  try {
    const historicalDocs = await AuditLog.find({
      userEmail: currentEmail,
      action: 'USER_LOGIN'
    }).sort({ createdAt: -1 }).limit(30);

    historyLogs = historicalDocs.map(doc => {
      const details = doc.details || {};
      return {
        device_secure: details.deviceSecure !== undefined ? details.deviceSecure : true,
        network_secure: details.networkSecure !== undefined ? details.networkSecure : true,
        is_public_network: !!details.isPublicNetwork,
        device_known: details.deviceKnown !== undefined ? details.deviceKnown : true,
        vpn_active: !!details.vpnActive,
        ip_changed: details.ip_changed || false,
        ua_changed: details.ua_changed || false
      };
    });
  } catch (historyErr) {
    console.error('[AI SERVICE] Failed to query user audit log history:', historyErr.message);
  }

  // Construct Python analyzer payload
  const eventPayload = {
    action,
    email: currentEmail,
    ip,
    userAgent,
    failed_login_count,
    denied_route_count,
    active_sessions_count: activeSessionsCount,
    ip_changed,
    ua_changed,
    resource: details.resource || '',
    device_secure: deviceSecure !== undefined ? deviceSecure : true,
    network_secure: networkSecure !== undefined ? networkSecure : true,
    is_public_network: !!isPublicNetwork,
    device_known: deviceKnown !== undefined ? deviceKnown : true,
    vpn_active: !!vpnActive,
    history: historyLogs
  };

  let score = 10;
  let severity = 'safe';
  let description = 'AI Analysis initiated.';
  let recommendation = 'No immediate action required.';

  try {
    const pythonResult = await runPythonRiskAnalyzer(eventPayload);
    score = pythonResult.score;
    severity = pythonResult.severity;
    description = pythonResult.description;
    recommendation = pythonResult.recommendation;
  } catch (err) {
    console.error('[AI ENGINE ERROR] Python risk evaluation failed, falling back to local defaults:', err.message);
    // Simple fallback: mirrors Python severity bands (safe / moderate / critical)
    if (failed_login_count >= 5) {
      score = 90;
      severity = 'critical';
      description = `Critical risk: High frequency of recent failed login attempts (${failed_login_count}) detected.`;
      recommendation = 'Critical Threat: Enforce immediate access block or terminate active sessions.';
    } else if (failed_login_count >= 3) {
      score = 50;
      severity = 'moderate';
      description = `Moderate risk: Repeated recent failed login attempts (${failed_login_count}) detected.`;
      recommendation = 'Moderate Risk: Request multi-factor OTP verification challenge.';
    }
  }

  // Save the observation event in Database
  const aiEvent = await AiEvent.create({
    userId,
    email: currentEmail,
    action,
    score,
    severity,
    description,
    recommendation,
    details,
    status: 'pending'
  });

  // Update active sessions' riskScore and isSuspicious flag
  if (userId) {
    try {
      await Session.updateMany(
        { userId, status: 'active' },
        { 
          riskScore: score,
          isSuspicious: severity === 'suspicious' || severity === 'critical'
        }
      );
    } catch (sessionErr) {
      console.error('[AI ENGINE ERROR] Failed to sync session riskScore:', sessionErr.message);
    }
  }

  // Active mitigation: Terminate active sessions on Critical AI alerts
  if (severity === 'critical' && userId) {
    try {
      await Session.updateMany(
        { userId, status: 'active' },
        { status: 'force_logout' }
      );
      console.log(`[AI ENGINE ACTIVE MITIGATION] Force terminated all active sessions for User: ${userId} due to Critical risk score (${score})`);
    } catch (sessionErr) {
      console.error('[AI ENGINE ERROR] Automated session logout failed:', sessionErr.message);
    }
  }

  return aiEvent;
};

/**
 * Generates natural language AI security summary and recommendation checklist.
 * Integrates directly with Gemini API (if key is active) or templates static backup digests.
 */
export const getAiPlatformRecommendations = async () => {
  const unresolvedEvents = await AiEvent.find({ status: 'pending' }).sort({ createdAt: -1 });
  const criticalCount = unresolvedEvents.filter(e => e.severity === 'critical').length;
  const suspiciousCount = unresolvedEvents.filter(e => e.severity === 'suspicious').length;
  const moderateCount = unresolvedEvents.filter(e => e.severity === 'moderate').length;

  const summaryStats = `Unresolved anomalies breakdown: ${criticalCount} Critical, ${suspiciousCount} Suspicious, ${moderateCount} Moderate.`;

  const apiKey = process.env.GEMINI_API_KEY;

  // Fallback Template if API key is missing or dummy
  const generateBackupList = () => {
    const list = [
      { id: 1, text: 'Enable SMS MFA / Twilio OTP configuration globally to secure user authentication entry points.', priority: 'high' },
      { id: 2, text: 'Force reset passwords for users with Critical FAILED_LOGIN alerts (multiple incorrect password entries logged).', priority: 'high' },
      { id: 3, text: 'Perform security permission reviews for accounts experiencing consecutive ACCESS_DENIED events on private endpoints.', priority: 'medium' },
      { id: 4, text: 'Restrict active concurrent sessions limit to max 3 devices per member to block concurrent session creep.', priority: 'medium' },
      { id: 5, text: 'Review live active sessions and terminate older device connections in the Control center.', priority: 'low' }
    ];
    return {
      recommendations: list,
      aiSummary: `Platform Risk Level is Moderate. ${summaryStats} The AI engine suggests enforcing stricter rate-limits and verifying device fingerprint credentials.`
    };
  };

  if (!apiKey || apiKey.startsWith('dummy_') || apiKey === 'dummy_gemini_api_key_here') {
    return generateBackupList();
  }

  // Query Google Gemini API directly via fetch
  try {
    const prompt = `You are a cybersecurity assistant auditing the MASC Security Portal.
Here are the unresolved security alerts logged by the AI Engine:
${unresolvedEvents.map(e => `- [${e.severity.toUpperCase()}] ${e.description} Recommendation advice: ${e.recommendation}`).join('\n')}

Format your response in plain JSON matching this format:
{
  "aiSummary": "A concise paragraph summarizing the current overall platform threat level and immediate anomalies.",
  "recommendations": [
    { "id": 1, "text": "Specific recommendation action text (max 20 words).", "priority": "high/medium/low" }
  ]
}
Return only valid JSON. Do not include markdown wraps (like \`\`\`json).`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      throw new Error(`Gemini status: ${response.status}`);
    }

    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    // Parse response
    const parsed = JSON.parse(textResponse.trim());
    return {
      aiSummary: parsed.aiSummary,
      recommendations: parsed.recommendations
    };
  } catch (err) {
    console.warn('[AI SERVICE] Gemini API failed or parsed invalid response, returning fallback checklist:', err.message);
    return generateBackupList();
  }
};

/**
 * Spawns the Python ai_trainer and passes the training dataset via stdin
 */
export const runModelTraining = (dataset) => {
  return new Promise((resolve, reject) => {
    const trainerScriptPath = path.join(__dirname, '..', '..', '..', 'ai_engine', 'ai_trainer.py');
    const pythonExecutable = fs.existsSync(venvPythonPath) ? venvPythonPath : 'python';
    
    const pythonProcess = spawn(pythonExecutable, [trainerScriptPath]);
    
    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    pythonProcess.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`Python trainer exited with code ${code}. Error: ${stderrData}`));
      }
      try {
        const parsed = JSON.parse(stdoutData.trim());
        if (parsed.error) {
          return reject(new Error(`Python trainer error: ${parsed.error}`));
        }
        resolve(parsed);
      } catch (err) {
        reject(new Error(`Failed to parse Python stdout: ${stdoutData}. Error: ${err.message}`));
      }
    });

    pythonProcess.stdin.write(JSON.stringify({ dataset }));
    pythonProcess.stdin.end();
  });
};
