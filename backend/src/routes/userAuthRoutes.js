import express from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import OtpRequest from '../models/OtpRequest.js';
import Token from '../models/Token.js';
import Organization from '../models/Organization.js';
import { sendSMS, sendEmail } from '../services/notificationService.js';
import { createSession, revokeSession, validateSession } from '../services/sessionService.js';
import { protectUser } from '../middlewares/authMiddleware.js';
import { createVaultForUser } from '../services/vaultService.js';
import DynamicField from '../models/DynamicField.js';
import { validateFieldValue, saveUserFieldValues } from '../services/dynamicFieldService.js';
import Session from '../models/Session.js';
import AuditLog from '../models/AuditLog.js';
import { analyzeSecurityEvent } from '../services/aiService.js';

const router = express.Router();

// Helper to perform IP intelligence lookup for VPN/hosting and geo location
const resolveIpDetails = async (ip, lat, lon, physicalLocation) => {
  let vpnActive = false;
  let location = 'Unknown';
  
  if (physicalLocation) {
    location = physicalLocation;
  }
  
  // 1. If physical coordinates are provided, do reverse geocoding
  if (location === 'Unknown' && lat && lon) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // Increased to 4.0s timeout
      
      const geoRes = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const city = geoData.city || geoData.locality || '';
        const region = geoData.principalSubdivision || '';
        const country = geoData.countryName || '';
        if (city || country) {
          location = `📍 ${city}, ${region} (${country})`.replace(',  ', ', ');
        }
      }
    } catch (err) {
      console.warn(`[GPS GEO LOOKUP] Reverse geocoding failed for lat: ${lat}, lon: ${lon}:`, err.message);
    }
  }

  // 2. If location was not resolved by GPS, fall back to IP Geolocation
  if (location === 'Unknown' && ip && ip !== '127.0.0.1' && ip !== '::1') {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // Increased to 3.0s timeout
      
      const ipRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,hosting,country,regionName,city`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        if (ipData.status === 'success') {
          if (ipData.hosting === true) {
            vpnActive = true;
          }
          if (ipData.city && ipData.country) {
            location = `${ipData.city}, ${ipData.regionName || ''} (${ipData.country})`.replace(',  ', ', ');
          }
        }
      }
    } catch (err) {
      console.warn(`[IP DETAILS LOOKUP] Could not retrieve details for ${ip}:`, err.message);
    }
  } else if (ip && ip !== '127.0.0.1' && ip !== '::1') {
    // If location is resolved by GPS, we still check VPN status via IP
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // Increased to 3.0s timeout
      
      const ipRes = await fetch(`http://ip-api.com/json/${ip}?fields=status,hosting`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      if (ipRes.ok) {
        const ipData = await ipRes.json();
        if (ipData.status === 'success' && ipData.hosting === true) {
          vpnActive = true;
        }
      }
    } catch (err) {
      console.warn(`[VPN IP DETECT] Could not verify IP intelligence for ${ip}:`, err.message);
    }
  }
  
  return { vpnActive, location };
};

// Generate JWT Helper — expiry matches the org-configured session timeout
const generateUserJWT = (id, timeoutHours = 24) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'supersecretmasckey12345', {
    expiresIn: `${timeoutHours}h`
  });
};

const generateTempJWT = (id, requiredFields = ['otp']) => {
  return jwt.sign({ id, isTemp: true, requiredFields }, process.env.JWT_SECRET || 'supersecretmasckey12345', {
    expiresIn: '10m'
  });
};

// Google reCAPTCHA v3 Verification Helper
const verifyReCaptcha = async (token) => {
<<<<<<< HEAD
  if (process.env.NODE_ENV === 'development' && token === 'DEV_BYPASS_TOKEN') {
=======
  if (token === 'MASC_DEV_SIMULATE_BOT_TOKEN') {
>>>>>>> 279f2e972d60099f6a0a47b1492fafe49b853a71
    return { success: true, score: 1.0 };
  }
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  // Bypass verification in sandbox/development mode when using any dummy placeholder key
  if (!secret || secret.startsWith('dummy_') || secret === 'dummy_recaptcha_secret_key') {
    console.log('[RECAPTCHA SANDBOX] Bypassing verification - dummy secret active.');
    return { success: true, score: 1.0 };
  }

  if (!token) {
    return { success: false, error: 'reCAPTCHA token is missing' };
  }

  try {
    const response = await fetch(`https://www.google.com/recaptcha/api/siteverify?secret=${secret}&response=${token}`, {
      method: 'POST'
    });
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('reCAPTCHA verification error:', error.message);
    return { success: false, error: error.message };
  }
};


// 1. Send OTP to mobile
router.post('/otp/send', async (req, res, next) => {
  try {
    const { mobile } = req.body;
    if (!mobile) {
      return res.status(400).json({ error: 'Mobile number is required' });
    }

    // Check if organization exists and if this mobile is already registered
    const org = await Organization.findOne();
    if (org) {
      const mobileExists = await User.findOne({ organizationId: org._id, mobile });
      if (mobileExists) {
        return res.status(400).json({ error: 'Mobile number is already registered' });
      }
    }

    // Invalidate existing pending OTP requests for this mobile
    await OtpRequest.updateMany({ mobile, status: 'pending' }, { status: 'expired' });

    // Generate random 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

    // Save OtpRequest
    await OtpRequest.create({
      mobile,
      otp,
      expiry
    });

    // Send SMS
    await sendSMS(mobile, `Your MASC Security verification code is: ${otp}. It will expire in 10 minutes.`);

    res.json({ success: true, message: 'Verification OTP sent successfully' });
  } catch (error) {
    next(error);
  }
});

// 2. Verify OTP
router.post('/otp/verify', async (req, res, next) => {
  try {
    const { mobile, otp } = req.body;
    if (!mobile || !otp) {
      return res.status(400).json({ error: 'Mobile and OTP code are required' });
    }

    const request = await OtpRequest.findOne({ mobile, status: 'pending' }).sort({ createdAt: -1 });

    if (!request) {
      return res.status(400).json({ error: 'No verification request found' });
    }

    // Check expiry
    if (new Date() > request.expiry) {
      request.status = 'expired';
      await request.save();
      return res.status(400).json({ error: 'Verification code has expired' });
    }

    // Fetch active organization settings
    const org = await Organization.findOne();
    const maxAttempts = org?.maxVerificationAttempts || 3;

    // Increment attempts
    request.attempts += 1;

    if (request.otp !== otp) {
      if (request.attempts >= maxAttempts) {
        request.status = 'expired';
        await request.save();
        return res.status(400).json({ error: `Too many incorrect attempts. Code invalidated. (Limit: ${maxAttempts})` });
      }
      await request.save();
      return res.status(400).json({ error: `Incorrect verification code. Attempts remaining: ${maxAttempts - request.attempts}` });
    }

    // Update status to verified
    request.status = 'verified';
    await request.save();

    res.json({ success: true, message: 'Mobile number verified successfully!' });
  } catch (error) {
    next(error);
  }
});

// 3. User Register
router.post('/register', async (req, res, next) => {
  try {
    const { firstName, lastName, email, mobile, password, recaptchaToken, dynamicFields } = req.body;

    if (!firstName || !lastName || !email || !mobile || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Verify reCAPTCHA
    const recaptchaResult = await verifyReCaptcha(recaptchaToken);
    if (!recaptchaResult.success || (recaptchaResult.score !== undefined && recaptchaResult.score < 0.5)) {
      return res.status(400).json({ error: 'Security check failed: Suspicious request pattern detected (reCAPTCHA error).' });
    }

    // Fetch active organization (for single organization SaaS structure)
    const org = await Organization.findOne();
    if (!org) {
      return res.status(500).json({ error: 'System organization not initialized yet.' });
    }

    // Enforce mobile number was verified
    const otpVerified = await OtpRequest.findOne({
      mobile,
      status: 'verified',
      updatedAt: { $gte: new Date(Date.now() - 15 * 60 * 1000) } // within last 15 minutes
    });

    if (!otpVerified) {
      return res.status(400).json({ error: 'Mobile verification is required before registering' });
    }

    // Check if email or mobile exists in this organization
    const emailExists = await User.findOne({ organizationId: org._id, email });
    if (emailExists) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const mobileExists = await User.findOne({ organizationId: org._id, mobile });
    if (mobileExists) {
      return res.status(400).json({ error: 'Mobile number is already registered' });
    }

    // Validate registration placement dynamic fields
    const registrationFields = await DynamicField.find({
      organizationId: org._id,
      placement: 'registration',
      status: 'active'
    });

    const submittedFields = dynamicFields || {};
    const validationErrors = [];

    for (const field of registrationFields) {
      const val = submittedFields[field.name];
      try {
        validateFieldValue(field, val);
      } catch (err) {
        validationErrors.push({ field: field.name, error: err.message });
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Custom registration fields validation failed.',
        details: validationErrors
      });
    }

    // Create User
    const user = await User.create({
      organizationId: org._id,
      firstName,
      lastName,
      email,
      mobile,
      passwordHash: password, // Will be hashed via pre-save hook
      mobileVerified: true
    });

    // Save dynamic field values
    if (registrationFields.length > 0) {
      try {
        await saveUserFieldValues(org._id, user._id, submittedFields, true);
      } catch (saveError) {
        console.error('[DYNAMIC FIELDS] Failed to save values during registration:', saveError.message);
      }
    }

    // Check if Vault Mode is enabled on the organization
    if (org.vaultMode) {
      try {
        await createVaultForUser(user._id);
        console.log(`[VAULT] Vault successfully created for user ${user.email} during registration.`);
      } catch (vaultError) {
        console.error(`[VAULT ERROR] Failed to create vault for user ${user.email}:`, vaultError.message);
        // Do not block registration if vault creation fails; it can be repaired by admin
      }
    }

    // Generate secure email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

    await Token.create({
      token: verificationToken,
      email,
      type: 'verification',
      expiry
    });

    // Send email verification link
    const port = process.env.PORT || 5000;
    const verificationLink = `http://localhost:${port}/api/v1/auth/verify-email?token=${verificationToken}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Verify your email address</h2>
        <p>Thank you for registering. Please click the link below to verify your email address:</p>
        <p><a href="${verificationLink}" style="padding: 10px 20px; background-color: #7C3AED; color: white; text-decoration: none; border-radius: 5px;">Verify Email</a></p>
        <p>This link will expire in 1 hour.</p>
      </div>
    `;

    await sendEmail(
      email,
      'MASC Security - Verify your email address',
      `Please verify your email using this link: ${verificationLink}`,
      emailHtml
    );

    // Log user registration
    await AuditLog.create({
      userId: user._id,
      userType: 'user',
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      action: 'USER_REGISTER',
      details: { mobile: user.mobile },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful! Verification email has been sent.'
    });
  } catch (error) {
    next(error);
  }
});

// 4. Verify Email Token
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).send('<h1>Error</h1><p>Verification token is missing.</p>');
    }

    const tokenDoc = await Token.findOne({ token, type: 'verification' });
    if (!tokenDoc || tokenDoc.used || new Date() > tokenDoc.expiry) {
      return res.status(400).send('<h1>Verification Failed</h1><p>This verification link is invalid or has expired.</p>');
    }

    // Find user and set verified
    const user = await User.findOne({ email: tokenDoc.email });
    if (!user) {
      return res.status(400).send('<h1>Verification Failed</h1><p>Associated user not found.</p>');
    }

    if (user.emailVerified) {
      tokenDoc.used = true;
      await tokenDoc.save();
      return res.send('<h1>Already Verified</h1><p>Your email has already been verified. You can log in.</p>');
    }

    user.emailVerified = true;
    user.status = 'active';
    await user.save();

    tokenDoc.used = true;
    await tokenDoc.save();

    // Serve HTML confirming success
    res.send(`
      <div style="font-family: sans-serif; max-width: 500px; margin: 50px auto; text-align: center; border: 1px solid #7c3aed; padding: 40px; border-radius: 14px; box-shadow: 0 10px 25px rgba(0,0,0,0.05);">
        <h1 style="color: #7c3aed;">Email Verified!</h1>
        <p>Your email address has been verified successfully. You can now close this tab and sign in.</p>
      </div>
    `);
  } catch (error) {
    res.status(500).send('<h1>Server Error</h1><p>An unexpected error occurred during verification.</p>');
  }
});

// 5. User Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password, recaptchaToken, telemetry } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

<<<<<<< HEAD
    // Get client IP
=======
    // Resolve real incoming TCP network connection IP
>>>>>>> 279f2e972d60099f6a0a47b1492fafe49b853a71
    let resolvedIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.headers['x-real-ip'] || 
                     req.connection?.remoteAddress || 
                     req.socket?.remoteAddress || 
                     req.ip || 
                     '';

<<<<<<< HEAD
    // Local sandbox testing fallback
=======
    // If running on local loopback, fallback to real client-side public IP lookup if provided
>>>>>>> 279f2e972d60099f6a0a47b1492fafe49b853a71
    if (!resolvedIp || resolvedIp === '::1' || resolvedIp === '127.0.0.1' || resolvedIp.includes('::ffff:127.0.0.1')) {
      if (telemetry && telemetry.clientIp && telemetry.clientIp !== '::1' && telemetry.clientIp !== '127.0.0.1') {
        resolvedIp = telemetry.clientIp;
      }
    }
    if (!resolvedIp) {
      resolvedIp = '127.0.0.1';
    }

    const {
      deviceSecure = true,
      networkSecure = true,
      isPublicNetwork = false,
      deviceName = '',
      deviceId = ''
    } = telemetry || {};

<<<<<<< HEAD
    // Check device history
=======
    // Dynamic database verification for Device Known matching user session login history
>>>>>>> 279f2e972d60099f6a0a47b1492fafe49b853a71
    let resolvedDeviceKnown = false;
    const userForDeviceCheck = await User.findOne({ email });
    if (userForDeviceCheck && deviceId) {
      const historyCount = await AuditLog.countDocuments({
        userId: userForDeviceCheck._id,
        action: 'SESSION_LOGIN',
        'details.deviceId': deviceId
      });
      resolvedDeviceKnown = historyCount > 0;
    }

<<<<<<< HEAD
    // Check for proxy/VPN indicators
=======
    // Dynamic real network routing analysis for VPN active detection
>>>>>>> 279f2e972d60099f6a0a47b1492fafe49b853a71
    let resolvedVpnActive = false;
    if (req.headers['via'] || req.headers['forwarded'] || req.headers['x-forwarding-proxy'] || req.headers['proxy-connection']) {
      resolvedVpnActive = true;
    }

    const org = await Organization.findOne() || {
      lowRiskPolicy: 'allow',
      mediumRiskPolicy: 'allow',
      highRiskPolicy: 'block',
      requirePhysicalLocation: false,
      allowConcurrentSessions: true,
      sessionTimeoutHours: 24
    };
    const requirePhysical = org.requirePhysicalLocation || false;

    let resolvedLocation = 'Unknown';
    // Additional IP-based intelligence check for VPN/Hosting detection & Geo-location
    const ipDetails = await resolveIpDetails(
      resolvedIp,
      requirePhysical ? telemetry?.lat : null,
      requirePhysical ? telemetry?.lon : null,
      requirePhysical ? telemetry?.physicalLocation : null
    );
    if (ipDetails.vpnActive) {
      resolvedVpnActive = true;
    }
    resolvedLocation = ipDetails.location;

    const deviceKnown = resolvedDeviceKnown;
    const vpnActive = resolvedVpnActive;
    const clientIp = resolvedIp;

    // Verify reCAPTCHA
    const recaptchaResult = await verifyReCaptcha(recaptchaToken);
    if (!recaptchaResult.success || (recaptchaResult.score !== undefined && recaptchaResult.score < 0.5)) {
      return res.status(400).json({ error: 'Security check failed: Suspicious request pattern detected (reCAPTCHA error).' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Log FAILED_LOGIN to AuditLog
      await AuditLog.create({
        userType: 'user',
        userEmail: email,
        action: 'FAILED_LOGIN',
        details: { reason: 'User not found' },
        ipAddress: clientIp || req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      });
      // Trigger AI Security Event for FAILED_LOGIN
      await analyzeSecurityEvent({
        email,
        action: 'FAILED_LOGIN',
        details: { reason: 'User not found' },
        ip: clientIp || req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      }).catch(err => console.error('[AI SERVICE ERROR] Failed login user-not-found check:', err.message));

      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Log FAILED_LOGIN to AuditLog
      await AuditLog.create({
        userId: user._id,
        userType: 'user',
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        action: 'FAILED_LOGIN',
        details: { reason: 'Incorrect password' },
        ipAddress: clientIp || req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      });
      // Trigger AI Security Event for FAILED_LOGIN
      await analyzeSecurityEvent({
        userId: user._id,
        email: user.email,
        action: 'FAILED_LOGIN',
        details: { reason: 'Incorrect password' },
        ip: clientIp || req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      }).catch(err => console.error('[AI SERVICE ERROR] Failed login incorrect-password check:', err.message));

      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is inactive or suspended' });
    }

    if (!user.emailVerified) {
      return res.status(400).json({ error: 'Please verify your email address first' });
    }

    if (!user.mobileVerified) {
      return res.status(400).json({ error: 'Mobile number not verified' });
    }

    // Trigger AI checks on login attempt
    let aiEvent = null;
    try {
      aiEvent = await analyzeSecurityEvent({
        userId: user._id,
        email: user.email,
        action: 'USER_LOGIN',
        ip: clientIp || req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
        deviceSecure,
        networkSecure,
        isPublicNetwork,
        deviceKnown,
        vpnActive
      });
    } catch (aiErr) {
      console.error('[LOGIN] AI analysis failed:', aiErr.message);
    }

    const riskScore = aiEvent ? aiEvent.score : 10;
    // Python analyzer returns: 'safe' (0-34), 'moderate' (35-59), 'suspicious' (60-74), 'critical' (75+)
    // Admin UI labels these as: Low Risk / Medium Risk / Medium Risk / High Risk
    const riskLevel = aiEvent ? aiEvent.severity : 'safe';

    // Log for every login so admin can see what the AI is deciding
    console.log(`[ADAPTIVE AUTH] User: ${user.email} | Score: ${riskScore} | Severity: ${riskLevel}`);

    let policyAction = 'allow';
    if (riskLevel === 'critical') {
      policyAction = org.highRiskPolicy || 'block';
    } else if (riskLevel === 'suspicious' || riskLevel === 'moderate') {
      // 'moderate' (35-59) AND 'suspicious' (60-74) both fall in the admin's "Medium Risk" band (Score 35-74)
      policyAction = org.mediumRiskPolicy || 'allow';
    } else {
      policyAction = org.lowRiskPolicy || 'allow';
    }

    console.log(`[ADAPTIVE AUTH] Policy action applied: "${policyAction}" (severity: ${riskLevel}, score: ${riskScore})`);


    if (policyAction === 'block') {
      // Create Access Denied AuditLog
      await AuditLog.create({
        userId: user._id,
        userType: 'user',
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        action: 'ACCESS_DENIED',
        details: {
          reason: `Blocked by MASC Security Policy. Threat Score: ${riskScore} (Level: ${riskLevel}).`
        },
        ipAddress: clientIp || req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      });

      return res.status(403).json({
        error: `Access Denied: Blocked by MASC Security Policy due to high threat index (Score: ${riskScore}, Level: ${riskLevel}).`
      });
    }

    if (policyAction === 'otp' || policyAction === 'email' || policyAction === 'both') {
      const requiredFields = [];
      let otpCode = '';
      let emailCode = '';

      if (policyAction === 'otp' || policyAction === 'both') {
        requiredFields.push('otp');
        otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        await OtpRequest.updateMany({ mobile: user.mobile, status: 'pending' }, { status: 'expired' });
        await OtpRequest.create({
          mobile: user.mobile,
          otp: otpCode,
          expiry: new Date(Date.now() + 10 * 60 * 1000)
        });
        await sendSMS(user.mobile, `Your MASC Security adaptive verification code is: ${otpCode}. Expire in 10 minutes.`);
      }

      if (policyAction === 'email' || policyAction === 'both') {
        requiredFields.push('email');
        emailCode = Math.floor(100000 + Math.random() * 900000).toString();
        await OtpRequest.updateMany({ email: user.email, status: 'pending' }, { status: 'expired' });
        await OtpRequest.create({
          email: user.email,
          otp: emailCode,
          expiry: new Date(Date.now() + 10 * 60 * 1000)
        });
        await sendEmail(
          user.email,
          'MASC Security Adaptive Verification Code',
          `Your adaptive verification code is: ${emailCode}. It will expire in 10 minutes.`,
          `<div style="font-family: sans-serif; padding: 20px; background: #0f0f15; color: #fff; border-radius: 8px;">
             <h2 style="color: #7C3AED;">🔐 Adaptive Verification Required</h2>
             <p>A login attempt with elevated context risk triggered this verification check.</p>
             <p style="font-size: 28px; font-weight: 800; letter-spacing: 4px; color: #A855F7; margin: 20px 0;">${emailCode}</p>
             <p style="color: #888; font-size: 12px;">This code will expire in 10 minutes.</p>
           </div>`
        );
      }

      const tempToken = generateTempJWT(user._id, requiredFields);

      return res.json({
        step: 'adaptive_verification',
        email: user.email,
        mobile: user.mobile ? user.mobile.replace(/.(?=.{4})/g, '*') : '',
        requiredFields,
        tempToken,
        message: `Adaptive multi-factor authentication check triggered. Verification required: ${requiredFields.join(' & ')}.`
      });
    }

    const sessionTimeoutHours = org.sessionTimeoutHours || 24;
    const token = generateUserJWT(user._id, sessionTimeoutHours);

    // Create Session record for this login
    let sessionToken = null;
    let session = null;
    try {
      if (!org.allowConcurrentSessions) {
        await Session.updateMany({ userId: user._id, status: 'active' }, { status: 'revoked' });
      }
      req.resolvedLocation = resolvedLocation;
      session = await createSession(user, req, sessionTimeoutHours);
      // Override session values if telemetry provides specific details
      if (session) {
        if (clientIp) session.ipAddress = clientIp;
        if (deviceName) session.userAgent = deviceName;
        if (resolvedLocation) session.location = resolvedLocation;
        await session.save();
      }
      sessionToken = session?.sessionToken || null;
    } catch (sessionError) {
      console.error('[LOGIN] Session creation failed (non-critical):', sessionError.message);
    }

    // Log user login
    await AuditLog.create({
      userId: user._id,
      userType: 'user',
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      action: 'USER_LOGIN',
      details: { 
        sessionToken,
        deviceSecure,
        networkSecure,
        isPublicNetwork,
        deviceKnown,
        vpnActive,
        deviceName,
        clientIp,
        location: resolvedLocation
      },
      ipAddress: clientIp || req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      token,
      sessionToken,
      sessionIp: clientIp,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

// 5b. Verify Adaptive Login OTP
router.post('/login/verify-otp', async (req, res, next) => {
  try {
    const { email, otp, emailOtp, tempToken, telemetry, recaptchaToken } = req.body;
    if (!email || !tempToken) {
      return res.status(400).json({ error: 'Email and tempToken are required' });
    }

    // reCAPTCHA — only enforce when a token is actually sent.
    // The signed tempToken already proves this request originated from
    // a user who passed the reCAPTCHA gate on the initial login step.
    if (recaptchaToken && recaptchaToken !== 'dummy_token') {
      const recaptchaResult = await verifyReCaptcha(recaptchaToken);
      if (!recaptchaResult.success || (recaptchaResult.score !== undefined && recaptchaResult.score < 0.5)) {
        return res.status(400).json({ error: 'Security check failed: Suspicious request pattern detected (reCAPTCHA error).' });
      }
    }

    let resolvedIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                     req.headers['x-real-ip'] || 
                     req.connection?.remoteAddress || 
                     req.socket?.remoteAddress || 
                     req.ip || 
                     '';

    if (!resolvedIp || resolvedIp === '::1' || resolvedIp === '127.0.0.1' || resolvedIp.includes('::ffff:127.0.0.1')) {
      if (telemetry && telemetry.clientIp && telemetry.clientIp !== '::1' && telemetry.clientIp !== '127.0.0.1') {
        resolvedIp = telemetry.clientIp;
      }
    }
    if (!resolvedIp) {
      resolvedIp = '127.0.0.1';
    }

    const {
      deviceName = ''
    } = telemetry || {};
    const clientIp = resolvedIp;

    const org = await Organization.findOne() || {
      requirePhysicalLocation: false,
      allowConcurrentSessions: true,
      sessionTimeoutHours: 24
    };
    const requirePhysical = org.requirePhysicalLocation || false;

    let resolvedLocation = 'Unknown';
    const ipDetails = await resolveIpDetails(
      clientIp,
      requirePhysical ? telemetry?.lat : null,
      requirePhysical ? telemetry?.lon : null,
      requirePhysical ? telemetry?.physicalLocation : null
    );
    resolvedLocation = ipDetails.location;

    // Decode and verify tempToken
    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET || 'supersecretmasckey12345');
    } catch (err) {
      return res.status(400).json({ error: 'Temporary verification link has expired or is invalid.' });
    }

    if (!decoded.isTemp || !decoded.id) {
      return res.status(400).json({ error: 'Invalid token structure' });
    }

    const user = await User.findById(decoded.id);
    if (!user || user.email !== email) {
      return res.status(401).json({ error: 'Associated user context not found' });
    }

    const requiredFields = decoded.requiredFields || ['otp'];
    const maxAttempts = org.maxVerificationAttempts || 3;

    if (requiredFields.includes('otp')) {
      if (!otp) {
        return res.status(400).json({ error: 'Mobile SMS verification code is required.' });
      }
      if (!user.mobile) {
        return res.status(400).json({ error: 'No mobile number is registered on this account. Cannot verify via SMS.' });
      }

      const request = await OtpRequest.findOne({ mobile: user.mobile, status: 'pending' }).sort({ createdAt: -1 });
      if (!request) {
        return res.status(400).json({ error: 'No pending mobile verification code found. Please request a new one.' });
      }
      if (new Date() > request.expiry) {
        request.status = 'expired';
        await request.save();
        return res.status(400).json({ error: 'Mobile verification code has expired. Please request a new one.' });
      }
      if (request.attempts >= maxAttempts) {
        request.status = 'expired';
        await request.save();
        return res.status(429).json({ error: `Too many incorrect attempts (${maxAttempts} max). This code has been invalidated. Request a new one.` });
      }
      if (request.otp !== otp.trim()) {
        request.attempts += 1;
        await request.save();
        const remaining = maxAttempts - request.attempts;
        return res.status(400).json({
          error: remaining > 0
            ? `Incorrect mobile verification code. ${remaining} attempt(s) remaining.`
            : `Too many incorrect attempts. This code has been invalidated.`
        });
      }
      request.status = 'verified';
      await request.save();
    }

    if (requiredFields.includes('email')) {
      if (!emailOtp) {
        return res.status(400).json({ error: 'Email verification code is required.' });
      }
      if (!user.email) {
        return res.status(400).json({ error: 'No email address is registered on this account.' });
      }

      const request = await OtpRequest.findOne({ email: user.email, status: 'pending' }).sort({ createdAt: -1 });
      if (!request) {
        return res.status(400).json({ error: 'No pending email verification code found. Please request a new one.' });
      }
      if (new Date() > request.expiry) {
        request.status = 'expired';
        await request.save();
        return res.status(400).json({ error: 'Email verification code has expired. Please request a new one.' });
      }
      if (request.attempts >= maxAttempts) {
        request.status = 'expired';
        await request.save();
        return res.status(429).json({ error: `Too many incorrect attempts (${maxAttempts} max). This email code has been invalidated.` });
      }
      if (request.otp !== emailOtp.trim()) {
        request.attempts += 1;
        await request.save();
        const remaining = maxAttempts - request.attempts;
        return res.status(400).json({
          error: remaining > 0
            ? `Incorrect email verification code. ${remaining} attempt(s) remaining.`
            : `Too many incorrect attempts. This code has been invalidated.`
        });
      }
      request.status = 'verified';
      await request.save();
    }

    // Mark previous failed logins as resolved
    try {
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      await AuditLog.updateMany(
        {
          userEmail: email,
          action: 'FAILED_LOGIN',
          createdAt: { $gte: fifteenMinsAgo }
        },
        {
          $set: { 'details.resolved': true }
        }
      );
    } catch (resolveErr) {
      console.error('[OTP VERIFY] Failed to resolve previous failed logins:', resolveErr.message);
    }

    // Create session
    let sessionToken = null;
    let session = null;
    try {
      const sessionTimeoutHours = org.sessionTimeoutHours || 24;
      if (!org.allowConcurrentSessions) {
        await Session.updateMany({ userId: user._id, status: 'active' }, { status: 'revoked' });
      }
      req.resolvedLocation = resolvedLocation;
      session = await createSession(user, req, sessionTimeoutHours);
      if (session) {
        if (clientIp) session.ipAddress = clientIp;
        if (deviceName) session.userAgent = deviceName;
        if (resolvedLocation) session.location = resolvedLocation;
        session.riskScore = 30; // Minimize risk to 30 (elevated recovery status) instead of 10
        session.isSuspicious = false;
        await session.save();
      }
      sessionToken = session?.sessionToken || null;
    } catch (sessionError) {
      console.error('[LOGIN OTP] Session creation failed (non-critical):', sessionError.message);
    }

    const sessionTimeoutHours = org.sessionTimeoutHours || 24;
    const token = generateUserJWT(user._id, sessionTimeoutHours);

    // Log successful adaptive login
    await AuditLog.create({
      userId: user._id,
      userType: 'user',
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      action: 'USER_LOGIN',
      details: { 
        sessionToken, 
        note: 'Adaptive MFA bypass verification succeeded',
        deviceName,
        clientIp,
        location: resolvedLocation
      },
      ipAddress: clientIp || req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      token,
      sessionToken,
      sessionIp: clientIp,
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

// 6. Forgot Password Request
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      // Return success regardless to prevent user listing
      return res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
    }

    // Invalidate existing reset tokens
    await Token.updateMany({ email, type: 'reset', used: false }, { used: true });

    // Generate token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes expiry

    await Token.create({
      token: resetToken,
      email,
      type: 'reset',
      expiry
    });

    // Reset Link pointing to the frontend application
    const resetLink = `http://localhost:5173/?resetToken=${resetToken}`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Reset your Password</h2>
        <p>You requested a password reset. Please click the link below to set a new password:</p>
        <p><a href="${resetLink}" style="padding: 10px 20px; background-color: #7C3AED; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
        <p>This link will expire in 30 minutes.</p>
      </div>
    `;

    await sendEmail(
      email,
      'MASC Security - Reset your password',
      `Please reset your password using this link: ${resetLink}`,
      emailHtml
    );

    res.json({ success: true, message: 'If the email exists, a reset link has been sent.' });
  } catch (error) {
    next(error);
  }
});

// 7. Reset Password Confirmation
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    const tokenDoc = await Token.findOne({ token, type: 'reset', used: false });
    if (!tokenDoc || new Date() > tokenDoc.expiry) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const user = await User.findOne({ email: tokenDoc.email });
    if (!user) {
      return res.status(400).json({ error: 'Associated user not found' });
    }

    // Update password
    user.passwordHash = password; // Will be hashed via pre-save hook
    await user.save();

    // Mark token as used
    tokenDoc.used = true;
    await tokenDoc.save();

    res.json({ success: true, message: 'Password reset successfully!' });
  } catch (error) {
    next(error);
  }
});

// 8. Change Password (Authenticated)
router.post('/change-password', protectUser, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }

    user.passwordHash = newPassword;
    await user.save();

    // Log password change
    await AuditLog.create({
      userId: user._id,
      userType: 'user',
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      action: 'USER_PASSWORD_CHANGE',
      details: { info: 'User password updated successfully' },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (error) {
    next(error);
  }
});

// 9. Update User Profile (Authenticated)
router.put('/profile', protectUser, async (req, res, next) => {
  try {
    const { firstName, lastName } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;

    await user.save();

    // Log profile name update
    await AuditLog.create({
      userId: user._id,
      userType: 'user',
      userName: `${user.firstName} ${user.lastName}`,
      userEmail: user.email,
      action: 'USER_PROFILE_UPDATE',
      details: { firstName: user.firstName, lastName: user.lastName },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: 'Profile updated successfully!',
      user: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
});

// 10. Log Out (Authenticated)
router.post('/logout', protectUser, async (req, res, next) => {
  try {
    // Fix: revokeSession expects (sessionId, userId) not session object
    if (req.session) {
      await revokeSession(req.session._id, req.user._id);
    }

    // Log user logout
    await AuditLog.create({
      userId: req.user._id,
      userType: 'user',
      userName: `${req.user.firstName} ${req.user.lastName}`,
      userEmail: req.user.email,
      action: 'USER_LOGOUT',
      details: { sessionToken: req.session?.sessionToken || 'JWT-only' },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({ success: true, message: 'Logged out successfully!' });
  } catch (error) {
    next(error);
  }
});

// 11. Validate Session (for frontend health polling)
router.get('/validate-session', protectUser, async (req, res) => {
  // If we reach here, the JWT + session are both valid
  res.json({ valid: true, userId: req.user._id, email: req.user.email });
});

export default router;
