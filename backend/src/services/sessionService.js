import crypto from 'crypto';
import Session from '../models/Session.js';
import AuditLog from '../models/AuditLog.js';
import AiEvent from '../models/AiEvent.js';
import { parseUserAgent, getClientIp } from './deviceService.js';

// Default session duration: 24 hours (overridable per-org by admin)
const DEFAULT_SESSION_HOURS = 24;

/**
 * Create a new session after successful login
 * @param {object} user - User document
 * @param {object} req - Express request (for IP + UA)
 * @param {number} [timeoutHours] - Session lifetime in hours (from org config, defaults to 24h)
 * @returns {Promise<Session>}
 */
export const createSession = async (user, req, timeoutHours = DEFAULT_SESSION_HOURS) => {
  const userAgent = req.headers['user-agent'] || '';
  const ipAddress = getClientIp(req);
  let { browser, os, deviceType, deviceId } = parseUserAgent(userAgent);

  const clientDeviceName = req.headers['x-masc-device-name'] || '';
  if (clientDeviceName.toLowerCase().includes('brave') || userAgent.toLowerCase().includes('brave')) {
    browser = 'Brave';
  }

  // Use persistent client-side deviceId if provided to allow robust device recognition
  const clientDeviceId = req.body?.telemetry?.deviceId || req.body?.deviceId;
  if (clientDeviceId) {
    deviceId = clientDeviceId;
  }

  // Generate a unique session token
  const sessionToken = crypto.randomBytes(40).toString('hex');

  // Check Organization settings for concurrent session permission
  const Organization = Session.model('Organization');
  const org = await Organization.findOne();
  const allowConcurrent = org ? org.allowConcurrentSessions : true;

  if (!allowConcurrent) {
    // Clean up any existing active sessions for the same user on the same device/browser
    if (deviceId) {
      await Session.updateMany(
        { userId: user._id, deviceId, status: 'active' },
        { status: 'revoked' }
      );
    } else {
      await Session.updateMany(
        { userId: user._id, browser, os, deviceType, status: 'active' },
        { status: 'revoked' }
      );
    }
  }

  const sessionDurationMs = timeoutHours * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + sessionDurationMs);

  const resolvedLocation = req?.resolvedLocation || 'Unknown';

  const session = await Session.create({
    userId: user._id,
    sessionToken,
    deviceId,
    browser,
    os,
    deviceType,
    ipAddress,
    loginTime: new Date(),
    lastActivity: new Date(),
    location: resolvedLocation,
    expiresAt,
    status: 'active',
    riskScore: 0
  });

  // Log session creation to audit
  try {
    await AuditLog.create({
      userId: user._id,
      userType: 'user',
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      action: 'SESSION_LOGIN',
      details: {
        sessionId: session._id,
        deviceId,
        browser,
        os,
        deviceType,
        ipAddress,
        location: resolvedLocation
      },
      ipAddress,
      userAgent
    });
  } catch (auditError) {
    console.error('[SESSION SERVICE] Audit log failed:', auditError.message);
  }

  return session;
};

/**
 * Validate an existing session token
 * @param {string} sessionToken
 * @returns {Promise<Session|null>}
 */
export const validateSession = async (sessionToken) => {
  if (!sessionToken) return null;

  const session = await Session.findOne({ sessionToken });

  if (!session) return null;
  if (session.status !== 'active') return null;
  if (session.expiresAt < new Date()) {
    // Mark as expired
    session.status = 'expired';
    await session.save();
    return null;
  }

  return session;
};

/**
 * Refresh (touch) a session's lastActivity time
 * @param {string} sessionToken
 * @returns {Promise<void>}
 */
export const refreshSession = async (sessionToken) => {
  await Session.findOneAndUpdate(
    { sessionToken, status: 'active' },
    { lastActivity: new Date() }
  );
};

/**
 * Revoke a specific session (by session ID)
 * @param {string} sessionId - MongoDB _id of the session
 * @param {string} userId - User's _id (to ensure ownership)
 * @returns {Promise<boolean>}
 */
export const revokeSession = async (sessionId, userId) => {
  const result = await Session.findOneAndUpdate(
    { _id: sessionId, userId },
    { status: 'revoked' },
    { new: true }
  );
  return !!result;
};

/**
 * Revoke all sessions for a user except the current one
 * @param {string} userId
 * @param {string} currentSessionToken - Token to keep active
 * @returns {Promise<number>} Number of sessions revoked
 */
export const revokeOtherSessions = async (userId, currentSessionToken) => {
  const result = await Session.updateMany(
    {
      userId,
      sessionToken: { $ne: currentSessionToken },
      status: 'active'
    },
    { status: 'revoked' }
  );
  return result.modifiedCount;
};

/**
 * Force-logout all sessions for a user (admin action)
 * @param {string} userId
 * @returns {Promise<number>} Number of sessions terminated
 */
export const forceLogoutAllSessions = async (userId) => {
  const result = await Session.updateMany(
    { userId, status: 'active' },
    { status: 'force_logout' }
  );
  return result.modifiedCount;
};

/**
 * Force-logout a specific session (admin action)
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
export const adminForceLogoutSession = async (sessionId) => {
  const result = await Session.findByIdAndUpdate(
    sessionId,
    { status: 'force_logout' },
    { new: true }
  );
  return !!result;
};

/**
 * Consolidate duplicate active sessions (keep only the newest active session per user per device/browser)
 * @param {string} [userId] - Optional user ID filter
 */
export const consolidateActiveSessions = async (userId = null) => {
  try {
    const Organization = Session.model('Organization');
    const org = await Organization.findOne();
    const allowConcurrent = org ? org.allowConcurrentSessions : true;
    if (allowConcurrent) {
      return; // Do not consolidate or revoke concurrent sessions if they are allowed by the admin
    }

    const query = { status: 'active' };
    if (userId) query.userId = userId;

    const activeSessions = await Session.find(query).sort({ lastActivity: -1 });
    const uniqueKeys = new Set();
    const sessionsToRevoke = [];

    for (const s of activeSessions) {
      const key = `${s.userId.toString()}-${s.deviceId || `${s.browser}-${s.os}-${s.deviceType}`}`;
      if (uniqueKeys.has(key)) {
        sessionsToRevoke.push(s._id);
      } else {
        uniqueKeys.add(key);
      }
    }

    if (sessionsToRevoke.length > 0) {
      await Session.updateMany(
        { _id: { $in: sessionsToRevoke } },
        { status: 'revoked' }
      );
    }
  } catch (err) {
    console.error('[SESSION SERVICE] Session consolidation failed:', err.message);
  }
};

/**
 * Get all active sessions for a user
 * @param {string} userId
 * @returns {Promise<Session[]>}
 */
export const getUserSessions = async (userId) => {
  // Auto-expire sessions whose expiresAt is in the past
  await Session.updateMany(
    { userId, status: 'active', expiresAt: { $lt: new Date() } },
    { status: 'expired' }
  );

  // Consolidate duplicate active sessions on the same device
  await consolidateActiveSessions(userId);

  return Session.find({ userId, status: 'active' })
    .sort({ lastActivity: -1 });
};

/**
 * Get all sessions across all users (admin view)
 * @param {object} filters - optional filters { status, userId }
 * @returns {Promise<Session[]>}
 */
export const getAllSessions = async (filters = {}) => {
  // Auto-expire all active sessions whose expiresAt is in the past
  await Session.updateMany(
    { status: 'active', expiresAt: { $lt: new Date() } },
    { status: 'expired' }
  );

  // Consolidate duplicate active sessions for all users
  await consolidateActiveSessions();

  const query = {};
  if (filters.status) query.status = filters.status;
  if (filters.userId) query.userId = filters.userId;

  const sessions = await Session.find(query)
    .populate('userId', 'firstName lastName email role')
    .sort({ lastActivity: -1 })
    .limit(200);

  // Sync each session's riskScore with the latest AI event score for that user
  const updatePromises = sessions.map(async (session) => {
    if (!session.userId || !session.userId._id) return session;
    try {
      const latestEvent = await AiEvent.findOne({ userId: session.userId._id })
        .sort({ createdAt: -1 })
        .select('score severity');
      if (latestEvent && latestEvent.score !== session.riskScore) {
        session.riskScore = latestEvent.score;
        session.isSuspicious = latestEvent.severity === 'suspicious' || latestEvent.severity === 'critical';
        await Session.updateOne({ _id: session._id }, { riskScore: latestEvent.score, isSuspicious: session.isSuspicious });
      }
    } catch (err) {
      // Non-blocking: log error but still return session
      console.error('[SESSION SERVICE] Failed to sync riskScore for session:', session._id, err.message);
    }
    return session;
  });

  return Promise.all(updatePromises);
};
