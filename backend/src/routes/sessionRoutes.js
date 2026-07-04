import express from 'express';
import Session from '../models/Session.js';
import AuditLog from '../models/AuditLog.js';
import { protectUser } from '../middlewares/authMiddleware.js';
import { protectAdmin } from '../middlewares/authMiddleware.js';
import {
  getUserSessions,
  getAllSessions,
  revokeSession,
  revokeOtherSessions,
  forceLogoutAllSessions,
  adminForceLogoutSession
} from '../services/sessionService.js';

const router = express.Router();

// =====================================================
// USER SESSION ENDPOINTS
// =====================================================

// GET /api/v1/sessions/me - View own active sessions
router.get('/me', protectUser, async (req, res, next) => {
  try {
    const sessions = await getUserSessions(req.user._id);

    const currentSessionToken = req.headers['x-session-token'] || null;

    const sessionsFormatted = sessions.map(session => ({
      id: session._id,
      browser: session.browser,
      os: session.os,
      deviceType: session.deviceType,
      deviceId: session.deviceId,
      ipAddress: session.ipAddress,
      loginTime: session.loginTime,
      lastActivity: session.lastActivity,
      expiresAt: session.expiresAt,
      status: session.status,
      riskScore: session.riskScore,
      isCurrent: currentSessionToken && session.sessionToken === currentSessionToken
    }));

    res.json({ sessions: sessionsFormatted });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/sessions/:id - User revokes a specific session
router.delete('/:id', protectUser, async (req, res, next) => {
  try {
    const { id } = req.params;
    const revoked = await revokeSession(id, req.user._id);

    if (!revoked) {
      return res.status(404).json({ error: 'Session not found or not owned by you' });
    }

    // Audit log
    await AuditLog.create({
      userId: req.user._id,
      userType: 'user',
      userName: `${req.user.firstName} ${req.user.lastName}`,
      userEmail: req.user.email,
      action: 'SESSION_REVOKE',
      details: { sessionId: id, reason: 'User manually revoked session' },
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({ success: true, message: 'Session revoked successfully' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/sessions/me/others - Logout all other sessions
router.delete('/me/others', protectUser, async (req, res, next) => {
  try {
    const currentSessionToken = req.headers['x-session-token'] || null;
    const count = await revokeOtherSessions(req.user._id, currentSessionToken);

    await AuditLog.create({
      userId: req.user._id,
      userType: 'user',
      userName: `${req.user.firstName} ${req.user.lastName}`,
      userEmail: req.user.email,
      action: 'SESSION_REVOKE_ALL_OTHERS',
      details: { sessionsRevoked: count },
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({ success: true, message: `${count} other session(s) have been signed out` });
  } catch (error) {
    next(error);
  }
});

// =====================================================
// ADMIN SESSION ENDPOINTS
// =====================================================

// GET /api/v1/admin/sessions - View all sessions (admin)
router.get('/admin/all', protectAdmin, async (req, res, next) => {
  try {
    const { status, userId } = req.query;
    const filters = {};
    if (status) filters.status = status;
    if (userId) filters.userId = userId;

    const sessions = await getAllSessions(filters);
    res.json({ sessions });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/admin/sessions/:id - Admin force-logouts a specific session
router.delete('/admin/:id', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const session = await Session.findById(id).populate('userId', 'firstName lastName email');

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const revoked = await adminForceLogoutSession(id);
    if (!revoked) {
      return res.status(400).json({ error: 'Could not terminate session' });
    }

    // Audit
    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: req.admin.name,
      userEmail: req.admin.email,
      action: 'ADMIN_FORCE_LOGOUT',
      details: {
        sessionId: id,
        targetUserId: session.userId?._id,
        targetUserEmail: session.userId?.email
      },
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({ success: true, message: 'Session force-terminated successfully' });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/v1/admin/users/:userId/sessions - Admin force-logouts all sessions for a user
router.delete('/admin/users/:userId/all', protectAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const count = await forceLogoutAllSessions(userId);

    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: req.admin.name,
      userEmail: req.admin.email,
      action: 'ADMIN_FORCE_LOGOUT_ALL',
      details: { targetUserId: userId, sessionsTerminated: count },
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({ success: true, message: `${count} session(s) force-terminated for user` });
  } catch (error) {
    next(error);
  }
});

export default router;
