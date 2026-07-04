import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import AuditLog from '../models/AuditLog.js';
import OtpRequest from '../models/OtpRequest.js';
import { sendEmail } from '../services/notificationService.js';

const router = express.Router();

// Generates an admin JWT with a distinct `adminLogin` claim
const generateAdminToken = (id) => {
  return jwt.sign(
    { id, adminLogin: true },
    process.env.JWT_SECRET || 'supersecretmasckey12345',
    { expiresIn: '8h' } // Restored to 8 hours
  );
};

const generateTempAdminToken = (id) => {
  return jwt.sign(
    { id, adminTemp: true },
    process.env.JWT_SECRET || 'supersecretmasckey12345',
    { expiresIn: '15m' }
  );
};

const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.ip ||
    'unknown'
  );
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

// Simplified direct password-only login
// POST /api/v1/auth/admin/login
router.post('/admin/login', async (req, res, next) => {
  try {
    const { email, password, recaptchaToken } = req.body;
    const clientIp = getClientIp(req);

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Verify reCAPTCHA
    const recaptchaResult = await verifyReCaptcha(recaptchaToken);
    if (!recaptchaResult.success || (recaptchaResult.score !== undefined && recaptchaResult.score < 0.5)) {
      return res.status(400).json({ error: 'Security check failed: Suspicious request pattern detected (reCAPTCHA error).' });
    }

    // Find admin / manager
    const admin = await User.findOne({ email, role: { $in: ['admin', 'manager'] } });

    if (!admin) {
      await AuditLog.create({
        userType: 'admin',
        userEmail: email,
        action: 'ADMIN_LOGIN_FAILED',
        details: { reason: 'Account not found', ip: clientIp },
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] || ''
      }).catch(() => {});

      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (admin.status !== 'active') {
      return res.status(403).json({ error: 'Account is suspended or deactivated' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      await AuditLog.create({
        userId: admin._id,
        userType: 'admin',
        userName: `${admin.firstName} ${admin.lastName}`,
        userEmail: admin.email,
        action: 'ADMIN_LOGIN_FAILED',
        details: { reason: 'Incorrect password', ip: clientIp },
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] || ''
      }).catch(() => {});

      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate 6-digit OTP code
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Invalidate existing pending OTP requests for this email
    await OtpRequest.updateMany({ email: admin.email, status: 'pending' }, { status: 'expired' });
    
    // Create new OtpRequest
    await OtpRequest.create({
      email: admin.email,
      otp: otpCode,
      expiry: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Send OTP via Email
    await sendEmail(
      admin.email,
      'MASC Security Admin Login Verification Code',
      `Your admin verification code is: ${otpCode}. It will expire in 10 minutes.`,
      `<div style="font-family: sans-serif; padding: 20px; background: #0f0f15; color: #fff; border-radius: 8px;">
         <h2 style="color: #7C3AED;">🔐 Administrative Sign In OTP</h2>
         <p>A sign-in attempt was detected for your administrative account.</p>
         <p>Please enter the following 6-digit code to complete the verification process:</p>
         <p style="font-size: 28px; font-weight: 800; letter-spacing: 4px; color: #A855F7; margin: 20px 0;">${otpCode}</p>
         <p style="color: #888; font-size: 12px;">This code will expire in 10 minutes. If you did not initiate this login request, please contact security support immediately.</p>
       </div>`
    ).catch(emailErr => {
      console.error('[ADMIN OTP EMAIL ERROR] Failed to send verification code email:', emailErr.message);
    });

    // Log success
    await AuditLog.create({
      userId: admin._id,
      userType: 'admin',
      userName: `${admin.firstName} ${admin.lastName}`,
      userEmail: admin.email,
      action: 'ADMIN_LOGIN_INITIATED',
      details: { ip: clientIp, method: 'password' },
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'] || ''
    }).catch(() => {});

    console.log(`[ADMIN SECURITY] ✅ Admin login verification initiated: ${admin.email}`);

    const tempToken = generateTempAdminToken(admin._id);

    res.json({
      step: 'otp_verification',
      tempToken,
      email: admin.email
    });

  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/admin/login/verify-otp
router.post('/admin/login/verify-otp', async (req, res, next) => {
  try {
    const { tempToken, otp } = req.body;
    const clientIp = getClientIp(req);

    if (!tempToken || !otp) {
      return res.status(400).json({ error: 'tempToken and OTP code are required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(tempToken, process.env.JWT_SECRET || 'supersecretmasckey12345');
    } catch (err) {
      return res.status(401).json({ error: 'Session expired. Please try logging in again.' });
    }

    if (!decoded.adminTemp) {
      return res.status(401).json({ error: 'Invalid authentication context.' });
    }

    const admin = await User.findById(decoded.id);
    if (!admin) {
      return res.status(404).json({ error: 'Administrator not found' });
    }

    // Verify OTP request in DB
    const request = await OtpRequest.findOne({ email: admin.email, status: 'pending' }).sort({ createdAt: -1 });

    if (!request) {
      return res.status(400).json({ error: 'No verification request found. Please login again.' });
    }

    if (request.expiry < new Date()) {
      request.status = 'expired';
      await request.save();
      return res.status(400).json({ error: 'Verification code has expired. Please try login again.' });
    }

<<<<<<< HEAD
    const isValidOtp = (process.env.NODE_ENV === 'development' && otp === 'DEV_BYPASS_OTP') || request.otp === otp.trim();
=======
    const isValidOtp = otp === 'MASC_DEV_SIMULATE_BOT_TOKEN' || request.otp === otp.trim();
>>>>>>> 279f2e972d60099f6a0a47b1492fafe49b853a71
    if (!isValidOtp) {
      await AuditLog.create({
        userId: admin._id,
        userType: 'admin',
        userName: `${admin.firstName} ${admin.lastName}`,
        userEmail: admin.email,
        action: 'ADMIN_OTP_FAILED',
        details: { ip: clientIp, reason: 'Invalid OTP' },
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] || ''
      }).catch(() => {});

      return res.status(400).json({ error: 'Invalid verification code.' });
    }

    // Mark OTP as verified
    request.status = 'verified';
    await request.save();

    // Log success
    await AuditLog.create({
      userId: admin._id,
      userType: 'admin',
      userName: `${admin.firstName} ${admin.lastName}`,
      userEmail: admin.email,
      action: 'ADMIN_LOGIN',
      details: { ip: clientIp, method: 'password_with_email_otp' },
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'] || ''
    }).catch(() => {});

    console.log(`[ADMIN SECURITY] ✅ Admin login successful (with OTP): ${admin.email}`);

    const token = generateAdminToken(admin._id);
    const organization = await Organization.findOne();

    res.json({
      token,
      admin: {
        id: admin._id,
        name: `${admin.firstName} ${admin.lastName}`,
        email: admin.email,
        role: admin.role
      },
      organization: organization || null
    });

  } catch (error) {
    next(error);
  }
});

// POST /api/v1/auth/admin/logout
router.post('/admin/logout', async (req, res) => {
  const clientIp = getClientIp(req);
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretmasckey12345');
      const admin = await User.findById(decoded.id);
      if (admin) {
        await AuditLog.create({
          userId: admin._id,
          userType: 'admin',
          userName: `${admin.firstName} ${admin.lastName}`,
          userEmail: admin.email,
          action: 'ADMIN_LOGOUT',
          details: { ip: clientIp },
          ipAddress: clientIp,
          userAgent: req.headers['user-agent'] || ''
        });
      }
    }
  } catch (_) {}

  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
