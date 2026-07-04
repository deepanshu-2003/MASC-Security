import express from 'express';
import Role from '../models/Role.js';
import User from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import AiEvent from '../models/AiEvent.js';
import { protectAdmin } from '../middlewares/authMiddleware.js';
import { getUserFieldValues, saveUserFieldValues } from '../services/dynamicFieldService.js';
import Session from '../models/Session.js';
import Organization from '../models/Organization.js';

const router = express.Router();

// Helper to log administrative actions
const createAuditLog = async (req, action, details) => {
  try {
    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: req.admin.name,
      userEmail: req.admin.email,
      action,
      details,
      ipAddress: req.ip || req.connection.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });
  } catch (error) {
    console.error('[AUDIT LOG ERROR] Failed to create audit log:', error.message);
  }
};

// 1. GET /api/v1/roles - List all roles
router.get('/roles', protectAdmin, async (req, res, next) => {
  try {
    const roles = await Role.find().sort({ createdAt: -1 });
    res.json(roles);
  } catch (error) {
    next(error);
  }
});

// 2. POST /api/v1/roles - Create custom role
router.post('/roles', protectAdmin, async (req, res, next) => {
  try {
    const { name, description, permissions } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Role name is required' });
    }

    const trimmedName = name.toLowerCase().trim();

    // Check if role name already exists
    const existingRole = await Role.findOne({ name: trimmedName });
    if (existingRole) {
      return res.status(400).json({ error: `Role "${name}" already exists` });
    }

    const newRole = await Role.create({
      name: trimmedName,
      description,
      permissions: permissions || [],
      isSystem: false
    });

    await createAuditLog(req, 'ROLE_CREATE', { roleId: newRole._id, name: trimmedName, permissions });

    res.status(201).json(newRole);
  } catch (error) {
    next(error);
  }
});

// 3. PUT /api/v1/roles/:id - Update role permissions
router.put('/roles/:id', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { description, permissions } = req.body;

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    if (description !== undefined) role.description = description;
    if (permissions !== undefined) role.permissions = permissions;

    await role.save();

    await createAuditLog(req, 'ROLE_UPDATE', { roleId: role._id, name: role.name, permissions });

    res.json(role);
  } catch (error) {
    next(error);
  }
});

// 4. DELETE /api/v1/roles/:id - Delete custom role
router.delete('/roles/:id', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const role = await Role.findById(id);
    if (!role) {
      return res.status(404).json({ error: 'Role not found' });
    }

    if (role.isSystem) {
      return res.status(400).json({ error: 'Cannot delete system-defined roles' });
    }

    await Role.findByIdAndDelete(id);

    await createAuditLog(req, 'ROLE_DELETE', { roleId: id, name: role.name });

    res.json({ success: true, message: `Role "${role.name}" deleted successfully` });
  } catch (error) {
    next(error);
  }
});

// 5. GET /api/v1/users - List all users
router.get('/users', protectAdmin, async (req, res, next) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
    
    const usersWithRisk = await Promise.all(users.map(async (u) => {
      const latestObservation = await AiEvent.findOne({ email: u.email }).sort({ createdAt: -1 });
      const currentRiskScore = latestObservation ? latestObservation.score : 10;
      const currentRiskSeverity = latestObservation ? latestObservation.severity : 'safe';
      
      const userObj = u.toObject();
      userObj.currentRiskScore = currentRiskScore;
      userObj.currentRiskSeverity = currentRiskSeverity;
      return userObj;
    }));

    res.json(usersWithRisk);
  } catch (error) {
    next(error);
  }
});

// 5.1 GET /api/v1/users/:id/custom-fields - Fetch dynamic custom fields for specific user
router.get('/users/:id/custom-fields', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userObj = await User.findById(id);
    if (!userObj) {
      return res.status(404).json({ error: 'User not found' });
    }
    const values = await getUserFieldValues(userObj.organizationId, userObj._id);
    const lastSession = await Session.findOne({ userId: userObj._id }).sort({ lastActivity: -1 });
    res.json({
      success: true,
      values,
      lastSession
    });
  } catch (error) {
    next(error);
  }
});

// 6. PUT /api/v1/users/:id/role - Update user role assignment
router.put('/users/:id/role', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    const roleName = role.toLowerCase().trim();
    if (!['admin', 'manager', 'user'].includes(roleName)) {
      return res.status(400).json({ error: 'Role must be exactly admin, manager, or user' });
    }

    const requester = req.admin; // User object attached by protectAdmin
    const targetUser = await User.findById(id);
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Role assignment and authority transfer logic
    if (requester.role === 'admin') {
      if (roleName === 'admin') {
        // Transfer admin authority - Admin will be only one!
        if (requester._id.toString() === targetUser._id.toString()) {
          return res.status(400).json({ error: 'You are already the admin.' });
        }

        requester.role = 'manager';
        await requester.save();

        targetUser.role = 'admin';
        await targetUser.save();

        await createAuditLog(req, 'AUTHORITY_TRANSFER_ADMIN', {
          fromUserId: requester._id,
          toUserId: targetUser._id,
          toUserEmail: targetUser.email
        });

        return res.json({
          success: true,
          message: 'Admin authority transferred successfully. You are now a manager.',
          user: { id: targetUser._id, email: targetUser.email, role: targetUser.role },
          demotedRequester: { id: requester._id, role: requester.role }
        });
      } else {
        // Standard admin role assignment
        const oldRole = targetUser.role;
        targetUser.role = roleName;
        await targetUser.save();

        await createAuditLog(req, 'USER_ROLE_UPDATE', {
          targetUserId: id,
          targetUserEmail: targetUser.email,
          oldRole,
          newRole: roleName
        });

        return res.json({ success: true, user: { id: targetUser._id, email: targetUser.email, role: targetUser.role } });
      }
    } else if (requester.role === 'manager') {
      // Manager can only transfer manager authority to a user
      if (roleName !== 'manager') {
        return res.status(403).json({ error: 'Managers can only transfer manager authority to a user.' });
      }

      if (targetUser.role !== 'user') {
        return res.status(400).json({ error: 'Managers can only transfer authority to user accounts.' });
      }

      if (requester._id.toString() === targetUser._id.toString()) {
        return res.status(400).json({ error: 'You are already a manager.' });
      }

      // Transfer manager authority
      requester.role = 'user';
      await requester.save();

      targetUser.role = 'manager';
      await targetUser.save();

      await createAuditLog(req, 'AUTHORITY_TRANSFER_MANAGER', {
        fromUserId: requester._id,
        toUserId: targetUser._id,
        toUserEmail: targetUser.email
      });

      return res.json({
        success: true,
        message: 'Manager authority transferred successfully. You are now a standard user.',
        user: { id: targetUser._id, email: targetUser.email, role: targetUser.role },
        demotedRequester: { id: requester._id, role: requester.role }
      });
    } else {
      return res.status(403).json({ error: 'Not authorized to change roles.' });
    }
  } catch (error) {
    next(error);
  }
});

// 7. PUT /api/v1/users/:id/overrides - Update user specific permission overrides
router.put('/users/:id/overrides', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { permissionOverrides } = req.body;

    if (req.admin.role !== 'admin') {
      return res.status(403).json({ error: 'Only the administrator can configure policy overrides.' });
    }

    if (!Array.isArray(permissionOverrides)) {
      return res.status(400).json({ error: 'permissionOverrides must be an array' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.permissionOverrides = permissionOverrides;
    await user.save();

    await createAuditLog(req, 'USER_OVERRIDE', {
      targetUserId: id,
      targetUserEmail: user.email,
      overrides: permissionOverrides
    });

    res.json({ success: true, permissionOverrides: user.permissionOverrides });
  } catch (error) {
    next(error);
  }
});

// 8. GET /api/v1/audit-logs - List all audit logs
router.get('/audit-logs', protectAdmin, async (req, res, next) => {
  try {
    const { email } = req.query;
    const query = {};
    if (email) {
      query.userEmail = email;
    }
    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(100);
    res.json(logs);
  } catch (error) {
    next(error);
  }
});

// 8b. POST /api/v1/audit-logs/flush - Flush audit logs for selected target, with admin validation
router.post('/audit-logs/flush', protectAdmin, async (req, res, next) => {
  try {
    const { target, userId, password } = req.body;

    if (req.admin.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can perform this operation.' });
    }

    if (!password) {
      return res.status(400).json({ error: 'Administrator password is required for verification.' });
    }

    // Verify administrator password
    const adminUser = await User.findById(req.admin._id);
    const isValid = await adminUser.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect administrator password.' });
    }

    let resultMsg = '';
    if (target === 'everyone') {
      const deleteResult = await AuditLog.deleteMany({});
      resultMsg = `Successfully flushed all ${deleteResult.deletedCount} audit logs.`;
    } else if (target === 'low-risk') {
      // Find all users in the system
      const users = await User.find({});
      const lowRiskEmails = [];
      const lowRiskIds = [];

      for (const u of users) {
        // Find latest AiEvent for this user
        const latestObservation = await AiEvent.findOne({ userId: u._id }).sort({ createdAt: -1 });
        const score = latestObservation ? latestObservation.score : 10;
        const severity = latestObservation ? latestObservation.severity : 'safe';

        // Low risk criteria: score < 35 and severity !== 'critical', 'moderate', 'suspicious'
        const isLowRisk = score < 35 && !['critical', 'moderate', 'suspicious'].includes(severity);
        if (isLowRisk) {
          if (u.email && u.email.trim() !== '') lowRiskEmails.push(u.email);
          if (u._id) lowRiskIds.push(u._id);
        }
      }

      // Delete logs matching low risk users (safe construct)
      const query = { $or: [] };
      if (lowRiskIds.length > 0) {
        query.$or.push({ userId: { $in: lowRiskIds } });
      }
      if (lowRiskEmails.length > 0) {
        query.$or.push({ userEmail: { $in: lowRiskEmails } });
      }

      if (query.$or.length === 0) {
        resultMsg = 'Successfully flushed 0 audit logs for low-risk users (no low-risk users found).';
      } else {
        const deleteResult = await AuditLog.deleteMany(query);
        resultMsg = `Successfully flushed ${deleteResult.deletedCount} audit logs for low-risk users.`;
      }
    } else if (target === 'user') {
      if (!userId) {
        return res.status(400).json({ error: 'User ID is required when flushing a particular user.' });
      }
      const targetUser = await User.findById(userId);
      if (!targetUser) {
        return res.status(404).json({ error: 'Target user not found.' });
      }

      // Safe construct for particular user log deletion
      const query = { $or: [] };
      if (targetUser._id) {
        query.$or.push({ userId: targetUser._id });
      }
      if (targetUser.email && targetUser.email.trim() !== '') {
        query.$or.push({ userEmail: targetUser.email });
      }

      if (query.$or.length === 0) {
        return res.status(400).json({ error: 'Target user has no valid identifier to flush.' });
      }

      const deleteResult = await AuditLog.deleteMany(query);
      resultMsg = `Successfully flushed ${deleteResult.deletedCount} audit logs for user ${targetUser.email}.`;
    } else {
      return res.status(400).json({ error: 'Invalid flush target.' });
    }

    // Write a new audit log to log the flush action!
    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: req.admin.name,
      userEmail: req.admin.email,
      action: 'AUDIT_LOG_FLUSH',
      details: { target, flushedUser: userId || undefined },
      ipAddress: req.ip || req.connection.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
      result: 'success'
    });

    res.json({ success: true, message: resultMsg });
  } catch (error) {
    next(error);
  }
});

// 9. PUT /api/v1/users/:id/status - Suspend or reactivate a user account
router.put('/users/:id/status', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Status must be "active" or "suspended"' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent admin from suspending themselves
    if (req.admin._id.toString() === user._id.toString()) {
      return res.status(400).json({ error: 'You cannot change your own account status.' });
    }

    // Prevent managers from modifying admin or other manager accounts
    if (req.admin.role === 'manager' && (user.role === 'admin' || user.role === 'manager')) {
      return res.status(403).json({ error: 'Managers can only modify user-level accounts.' });
    }

    // Check org-level manager permissions for suspending users
    if (req.admin.role === 'manager') {
      const org = await Organization.findOne();
      if (!org?.managerPermissions?.canSuspendUsers) {
        return res.status(403).json({ error: 'Manager suspend permission is disabled by the administrator.' });
      }
    }

    const previousStatus = user.status;
    user.status = status;
    await user.save();

    await createAuditLog(req, 'USER_STATUS_CHANGE', {
      targetUserId: id,
      targetUserEmail: user.email,
      previousStatus,
      newStatus: status
    });

    res.json({
      success: true,
      message: `User account ${status === 'active' ? 'reactivated' : 'suspended'} successfully.`,
      user: { id: user._id, email: user.email, status: user.status }
    });
  } catch (error) {
    next(error);
  }
});

// 9.5 PUT /api/v1/users/:id - Update user details (admin action)
router.put('/users/:id', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, mobile, department, emailVerified, mobileVerified, dynamicFields } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent managers from editing admin or other manager accounts
    if (req.admin.role === 'manager' && (user.role === 'admin' || user.role === 'manager')) {
      return res.status(403).json({ error: 'Managers can only modify user-level accounts.' });
    }

    // Check org-level manager permissions for editing users
    if (req.admin.role === 'manager') {
      const org = await Organization.findOne();
      if (!org?.managerPermissions?.canEditUsers) {
        return res.status(403).json({ error: 'Manager edit permission is disabled by the administrator.' });
      }
    }

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (mobile) user.mobile = mobile;
    if (department !== undefined) user.department = department;
    if (emailVerified !== undefined) user.emailVerified = emailVerified;
    if (mobileVerified !== undefined) user.mobileVerified = mobileVerified;

    if (dynamicFields && typeof dynamicFields === 'object') {
      try {
        await saveUserFieldValues(user.organizationId, user._id, dynamicFields, true);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    await user.save();

    await createAuditLog(req, 'USER_PROFILE_UPDATED_BY_ADMIN', {
      targetUserId: user._id,
      targetUserEmail: user.email,
      updates: { firstName, lastName, email, mobile, department, emailVerified, mobileVerified, dynamicFields }
    });

    res.json({
      success: true,
      message: 'User profile updated successfully.',
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
        department: user.department,
        emailVerified: user.emailVerified,
        mobileVerified: user.mobileVerified,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;

