import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Role from '../models/Role.js';
import AuditLog from '../models/AuditLog.js';
import Organization from '../models/Organization.js';
import Session from '../models/Session.js';
import { validateSession, refreshSession } from '../services/sessionService.js';
import { analyzeSecurityEvent } from '../services/aiService.js';

export const protectAdmin = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretmasckey12345');

      // ── Critical: Reject user tokens used on admin routes ──────────────────
      // Admin JWTs must carry adminLogin:true — this separates admin and user
      // token namespaces so a compromised user token cannot escalate privileges.
      if (!decoded.adminLogin) {
        return res.status(403).json({
          error: 'Admin access requires an admin-issued token.',
          code: 'ADMIN_TOKEN_INVALID'
        });
      }

      req.admin = await User.findById(decoded.id).select('-passwordHash');

      if (!req.admin) {
        return res.status(401).json({ error: 'Not authorized, administrator not found' });
      }

      if (!['admin', 'manager'].includes(req.admin.role)) {
        return res.status(403).json({ error: 'Not authorized, administrator privileges required' });
      }

      if (req.admin.status !== 'active') {
        return res.status(403).json({ error: 'Account has been suspended or deactivated' });
      }

      if (req.admin.role === 'manager') {
        const path = (req.baseUrl || '') + (req.path || '');
        const method = req.method;

        const isAllowedUserRoute = path.includes('/users') && (method === 'GET' || method === 'PUT');
        const isAllowedSessionRoute = path.includes('/sessions/admin') && (method === 'GET' || method === 'DELETE');
        const isAllowedAuditLogs = path.includes('/audit-logs') && method === 'GET';
        const isAllowedRolesGet = path.includes('/roles') && method === 'GET';
        const isAllowedDynamicFieldsGet = path.includes('/dynamic-fields') && method === 'GET';
        const isAllowedDashboard = path.includes('/dashboard-stats') && method === 'GET';
        const isAllowedLogout = path.includes('/admin/logout') && method === 'POST';
        const isAllowedBrandingGet = path.includes('/branding') && method === 'GET';

        let isAllowed = isAllowedUserRoute || isAllowedSessionRoute || isAllowedAuditLogs || isAllowedRolesGet || isAllowedDynamicFieldsGet || isAllowedDashboard || isAllowedLogout || isAllowedBrandingGet;

        // Check org-level manager permissions for vault governance routes
        if (!isAllowed) {
          const isVaultRoute = path.includes('/vault') || path.includes('/clusters') || path.includes('/collections') || path.includes('/blocks') || path.includes('/permissions') || path.includes('/user-sets') || path.includes('/vault-audit-logs');
          if (isVaultRoute) {
            const org = await Organization.findOne().lean();
            if (org?.managerPermissions?.canAccessVaultGovernance) {
              isAllowed = true;
            }
          }
        }

        // Check org-level manager permissions for route rules
        if (!isAllowed) {
          const isRouteRulesRoute = path.includes('/route-rules');
          if (isRouteRulesRoute) {
            const org = await Organization.findOne().lean();
            if (org?.managerPermissions?.canAccessRouteRules) {
              isAllowed = true;
            }
          }
        }

        // Check org-level manager permissions for branding config updates
        if (!isAllowed) {
          const isBrandingUpdateRoute = path.includes('/branding') && (method === 'PUT' || method === 'POST');
          if (isBrandingUpdateRoute) {
            const org = await Organization.findOne().lean();
            if (org?.managerPermissions?.canAccessBranding) {
              isAllowed = true;
            }
          }
        }

        if (!isAllowed) {
          return res.status(403).json({ error: 'Not authorized, this operation is restricted to System Administrators.' });
        }
      }

      next();
    } catch (error) {
      console.error('JWT validation error (admin):', error.message);
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Admin session expired. Please sign in again.', code: 'ADMIN_TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Not authorized, token failed', code: 'TOKEN_INVALID' });
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token provided' });
  }
};


export const protectUser = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1];

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretmasckey12345');

      // Get user from the token
      req.user = await User.findById(decoded.id).select('-passwordHash');
      
      if (!req.user) {
        return res.status(401).json({ error: 'Not authorized, user not found' });
      }

      if (req.user.status !== 'active') {
        return res.status(403).json({ error: 'User account has been suspended or deactivated' });
      }

      // --- Phase 4: Session Validation ---
      // Check if a session token is provided in headers
      const sessionToken = req.headers['x-session-token'] || decoded.sessionToken;
      if (sessionToken) {
        const session = await Session.findOne({ sessionToken });
        if (!session) {
          return res.status(401).json({ 
            error: 'Session not found. Please log in again.',
            code: 'SESSION_INVALID'
          });
        }

        // Check if session was force-loggedout
        if (session.status === 'force_logout') {
          // Log force logout in AuditLog
          await AuditLog.create({
            userId: req.user?._id || decoded.id,
            userType: 'user',
            userName: req.user ? `${req.user.firstName} ${req.user.lastName}` : 'User',
            userEmail: req.user ? req.user.email : '',
            action: 'SESSION_FORCE_TERMINATED',
            details: { sessionToken, reason: 'Session force-terminated by administrator' },
            ipAddress: req.headers['x-masc-client-ip'] || req.ip || req.connection?.remoteAddress || '',
            userAgent: req.headers['x-masc-device-name'] || req.headers['user-agent'] || ''
          });

          return res.status(401).json({ 
            error: 'Your session was terminated by an administrator.',
            code: 'FORCE_LOGOUT'
          });
        }

        // Check if session was revoked
        if (session.status === 'revoked') {
          return res.status(401).json({ 
            error: 'Session has been revoked.',
            code: 'SESSION_INVALID'
          });
        }

        // Check if session is expired
        if (session.status === 'expired' || session.expiresAt < new Date()) {
          if (session.status !== 'expired') {
            session.status = 'expired';
            await session.save();
          }
          return res.status(401).json({ 
            error: 'Session expired. Please log in again.',
            code: 'TOKEN_EXPIRED'
          });
        }

        // --- Continuous Session Hijacking Verification ---
        const org = await Organization.findOne() || { verifySessionOnEachRequest: false };
        if (org.verifySessionOnEachRequest) {
          const clientIp = req.headers['x-masc-client-ip'] || req.ip || req.connection?.remoteAddress || '';
          const deviceName = req.headers['x-masc-device-name'] || req.headers['user-agent'] || '';

          const ipMismatch = session.ipAddress && clientIp && session.ipAddress !== clientIp;
          const deviceMismatch = session.userAgent && deviceName && session.userAgent !== deviceName;

          if (ipMismatch || deviceMismatch) {
            // Revoke session in database
            session.status = 'revoked';
            await session.save();

            // Log session hijack event in AuditLog
            await AuditLog.create({
              userId: req.user?._id || decoded.id,
              userType: 'user',
              userName: req.user ? `${req.user.firstName} ${req.user.lastName}` : 'User',
              userEmail: req.user ? req.user.email : '',
              action: 'SESSION_HIJACK_DETECTED',
              details: {
                sessionToken,
                expectedIp: session.ipAddress,
                actualIp: clientIp,
                expectedDevice: session.userAgent,
                actualDevice: deviceName
              },
              ipAddress: clientIp,
              userAgent: req.headers['user-agent'] || ''
            });

            // Trigger AI alert
            analyzeSecurityEvent({
              userId: req.user?._id || decoded.id,
              email: req.user?.email || '',
              action: 'SESSION_HIJACK_DETECTED',
              details: { expectedIp: session.ipAddress, actualIp: clientIp },
              ip: clientIp,
              userAgent: req.headers['user-agent'] || ''
            }).catch(err => console.error('[AI SERVICE ERROR] Failed to analyze hijack:', err.message));

            return res.status(401).json({
              error: 'SESSION_HIJACK_DETECTED',
              message: 'Zero Trust Security verification failed: IP or device mismatch detected.'
            });
          }
        }

        // Attach session to request
        req.session = session;

        // Refresh session activity timestamp (non-blocking)
        refreshSession(sessionToken).catch(err => 
          console.error('[AUTH] Session refresh failed:', err.message)
        );
      }
      // Note: If no sessionToken is provided, we still allow JWT-only auth
      // (backward compat with existing flows). Phase 5+ can enforce sessions strictly.

      next();
    } catch (error) {
      console.error('JWT validation error (user):', error.message);
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Your session has expired. Please sign in again.', code: 'TOKEN_EXPIRED' });
      }
      return res.status(401).json({ error: 'Not authorized, token failed', code: 'TOKEN_INVALID' });
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Not authorized, no token provided' });
  }
};

export const authorize = (resource) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Not authorized' });
      }

      if (user.role === 'admin') {
        return next();
      }

      let accessLevel = null;

      // 1. Check User-specific Overrides first (take precedence)
      if (user.permissionOverrides && user.permissionOverrides.length > 0) {
        const override = user.permissionOverrides.find(o => o.resource === resource);
        if (override) {
          accessLevel = override.access;
        }
      }

      // 2. If no override, check Role permissions
      if (!accessLevel) {
        const userRole = await Role.findOne({ name: user.role });
        if (userRole && userRole.permissions && userRole.permissions.length > 0) {
          const rolePermission = userRole.permissions.find(p => p.resource === resource);
          if (rolePermission) {
            accessLevel = rolePermission.access;
          }
        }
      }

      // 3. Fallback: Deny by default
      if (!accessLevel) {
        accessLevel = 'deny';
      }

      // 4. Validate Access Level against HTTP method
      let isAuthorized = false;
      if (accessLevel === 'allow') {
        isAuthorized = true;
      } else if (accessLevel === 'read-only') {
        if (req.method === 'GET' || req.method === 'HEAD') {
          isAuthorized = true;
        }
      }

      if (isAuthorized) {
        return next();
      }

      // Log ACCESS_DENIED in Audit Log
      await AuditLog.create({
        userId: user._id,
        userType: 'user',
        userName: `${user.firstName} ${user.lastName}`,
        userEmail: user.email,
        action: 'ACCESS_DENIED',
        details: {
          resource,
          method: req.method,
          url: req.originalUrl,
          reason: `Access level was: ${accessLevel}`
        },
        ipAddress: req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      });

      // Analyze security event asynchronously via AI Engine
      analyzeSecurityEvent({
        userId: user._id,
        email: user.email,
        action: 'ACCESS_DENIED',
        details: { resource },
        ip: req.ip || req.connection?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || ''
      }).catch(err => console.error('[AI SERVICE ERROR] Failed to analyze access denial:', err.message));

      return res.status(403).json({
        error: `Access Denied: You do not have permission to access resource [${resource}].`
      });
    } catch (error) {
      console.error('Authorization middleware error:', error);
      return res.status(500).json({ error: 'Internal server authorization error' });
    }
  };
};
