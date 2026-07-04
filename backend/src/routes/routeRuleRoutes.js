import express from 'express';
import { protectAdmin, protectUser } from '../middlewares/authMiddleware.js';
import RoutePermission from '../models/RoutePermission.js';
import AuditLog from '../models/AuditLog.js';
import User from '../models/User.js';
import UserSet from '../models/UserSet.js';
import { evaluateRouteAccess } from '../services/ruleEngineService.js';

const router = express.Router();

// Helper to log admin actions
const logAdminAction = async (req, action, details) => {
  try {
    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: `${req.admin.firstName} ${req.admin.lastName}`,
      userEmail: req.admin.email,
      action,
      details,
      ipAddress: req.ip || '',
      userAgent: req.headers['user-agent'] || ''
    });
  } catch (err) {
    console.error('[ADMIN RULE AUDIT LOG ERROR]:', err.message);
  }
};

/**
 * GET /api/v1/admin/route-rules
 * Retrieve all Route permissions
 */
// Helper to check if manager is trying to configure route rules targeting managers/admins
const checkRouteRuleManagerViolation = async (req, users, userSets, roles) => {
  if (req.admin.role !== 'manager') return null;

  // 1. Roles check
  if (roles && (roles.includes('manager') || roles.includes('admin'))) {
    return 'Managers are not allowed to configure route rules targeting Manager or Admin roles';
  }

  // 2. Users check
  if (users && users.length > 0) {
    for (const uId of users) {
      if (uId.toString() === req.admin._id.toString()) {
        return 'Managers are not allowed to configure route rules targeting their own account';
      }
      const u = await User.findById(uId);
      if (u && (u.role === 'manager' || u.role === 'admin')) {
        return 'Managers are not allowed to configure route rules targeting manager or admin accounts';
      }
    }
  }

  // 3. User Sets check
  if (userSets && userSets.length > 0) {
    for (const usId of userSets) {
      const us = await UserSet.findById(usId);
      if (us && us.members) {
        for (const mId of us.members) {
          if (mId.toString() === req.admin._id.toString()) {
            return 'Managers are not allowed to configure route rules targeting a User Set containing their own account';
          }
          const u = await User.findById(mId);
          if (u && (u.role === 'manager' || u.role === 'admin')) {
            return 'Managers are not allowed to configure route rules targeting a User Set containing manager or admin accounts';
          }
        }
      }
    }
  }

  return null;
};

router.get('/admin/route-rules', protectAdmin, async (req, res, next) => {
  try {
    const rules = await RoutePermission.find({ organizationId: req.admin.organizationId })
      .populate('users', 'firstName lastName email')
      .populate('userSets', 'name')
      .sort({ createdAt: -1 });
    res.json({ success: true, rules });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/route-rules
 * Create or update Route rules
 */
router.post('/admin/route-rules', protectAdmin, async (req, res, next) => {
  try {
    const { path, action, users, userSets, roles } = req.body;

    if (!path) {
      return res.status(400).json({ error: 'Path is required' });
    }

    const cleanRoles = (roles || []).filter(r => r !== 'admin');
    
    let cleanUsers = [];
    if (users && users.length > 0) {
      const dbUsers = await User.find({ _id: { $in: users } });
      cleanUsers = dbUsers.filter(u => u.role !== 'admin').map(u => u._id);
    }

    let rule = await RoutePermission.findOne({
      organizationId: req.admin.organizationId,
      path: path.trim()
    });

    if (req.admin.role === 'manager') {
      const combinedUsers = Array.from(new Set([...(users || []), ...(rule ? rule.users.map(u => u.toString()) : [])]));
      const combinedUserSets = Array.from(new Set([...(userSets || []), ...(rule ? rule.userSets.map(us => us.toString()) : [])]));
      const combinedRoles = Array.from(new Set([...(roles || []), ...(rule ? rule.roles : [])]));
      
      const violationError = await checkRouteRuleManagerViolation(req, combinedUsers, combinedUserSets, combinedRoles);
      if (violationError) {
        return res.status(403).json({ error: violationError });
      }
    }    

    if (rule) {
      rule.action = action || 'block';
      rule.users = cleanUsers;
      rule.userSets = userSets || [];
      rule.roles = cleanRoles;
      await rule.save();
      await logAdminAction(req, 'ROUTE_RULE_UPDATED', { path: rule.path, ruleId: rule._id });
    } else {
      rule = await RoutePermission.create({
        path: path.trim(),
        organizationId: req.admin.organizationId,
        action: action || 'block',
        users: cleanUsers,
        userSets: userSets || [],
        roles: cleanRoles
      });
      await logAdminAction(req, 'ROUTE_RULE_CREATED', { path: rule.path, ruleId: rule._id });
    }

    res.json({ success: true, rule });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/admin/route-rules/:id
 * Delete a Route rule
 */
router.delete('/admin/route-rules/:id', protectAdmin, async (req, res, next) => {
  try {
    const rule = await RoutePermission.findOne({
      _id: req.params.id,
      organizationId: req.admin.organizationId
    });

    if (!rule) {
      return res.status(404).json({ error: 'Route rule not found' });
    }

    if (req.admin.role === 'manager') {
      const violationError = await checkRouteRuleManagerViolation(req, rule.users, rule.userSets, rule.roles);
      if (violationError) {
        return res.status(403).json({ error: `Managers are not allowed to delete this route rule: ${violationError}` });
      }
    }

    await RoutePermission.deleteOne({ _id: rule._id });

    await logAdminAction(req, 'ROUTE_RULE_DELETED', { path: rule.path, ruleId: rule._id });
    res.json({ success: true, message: 'Route rule deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/rules/evaluate
 * Evaluates route access for the logged-in user or admin
 */
router.get('/rules/evaluate', protectUser, async (req, res, next) => {
  try {
    const user = req.user;

    const paths = [
      '/dashboard',
      '/courses',
      '/courses/:id',
      '/employees',
      '/payroll',
      '/admin',
      '/settings',
      '/reports',
      '/app'
    ];

    const routeEvaluation = {};

    for (const p of paths) {
      routeEvaluation[p] = await evaluateRouteAccess(p, user);
    }

    if (req.query.path) {
      const qp = req.query.path.trim();
      routeEvaluation[qp] = await evaluateRouteAccess(qp, user);
    }

    res.json({
      success: true,
      routes: routeEvaluation
    });
  } catch (error) {
    next(error);
  }
});

export default router;
