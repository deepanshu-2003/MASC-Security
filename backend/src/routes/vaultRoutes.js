import express from 'express';
import { protectAdmin, protectUser, authorize } from '../middlewares/authMiddleware.js';
import { verifySignature } from '../middlewares/signatureMiddleware.js';
import {
  getVaultByUserId,
  createVaultForUser,
  updateVaultSection,
  resetVault,
  repairVaults
} from '../services/vaultService.js';
import Vault from '../models/Vault.js';
import AuditLog from '../models/AuditLog.js';
import VaultCluster from '../models/VaultCluster.js';
import VaultCollection from '../models/VaultCollection.js';
import VaultRecord from '../models/VaultRecord.js';
import UserSet from '../models/UserSet.js';
import VaultBlockRule from '../models/VaultBlockRule.js';
import User from '../models/User.js';
import {
  createCluster,
  createCollection,
  deleteCollection,
  insertRecord,
  updateRecord,
  deleteRecord,
  findRecord,
  findMany,
  count,
  createUserSet,
  renameUserSet,
  deleteUserSet,
  addUserToSet,
  removeUserFromSet,
  grantPermission,
  revokePermission,
  blockResource,
  unblockResource,
  exportCollection,
  audit,
  decryptPayload,
  validateVaultAccess
} from '../services/vaultEngineService.js';

const router = express.Router();

// 1. GET /api/v1/vault/me
// Protected User route: Fetch current logged-in user's own vault
router.get('/me', protectUser, verifySignature, authorize('vault'), async (req, res, next) => {
  try {
    await validateVaultAccess({
      actorId: req.user._id,
      action: 'read',
      sessionToken: req.headers['x-session-token'] || ''
    });

    let vault = await getVaultByUserId(req.user._id);
    if (!vault) {
      // Auto-create if somehow missing
      vault = await createVaultForUser(req.user._id);
    }

    // Convert to plain object to enforce view permissions
    const vaultObj = vault.toObject();
    const permissions = vaultObj.permissions || {};

    const vaultView = permissions.vault || { view: true };
    if (!vaultView.view) {
      vaultObj.items = [];
    }

    const coursesView = permissions.courses || { view: true };
    if (!coursesView.view) {
      vaultObj.courses = [];
    }

    const attendanceView = permissions.attendance || { view: true };
    if (!attendanceView.view) {
      vaultObj.attendance = [];
    }

    const salarySlipsView = permissions.salarySlips || { view: true };
    if (!salarySlipsView.view) {
      vaultObj.salarySlips = [];
    }

    res.json({
      success: true,
      vault: vaultObj
    });
  } catch (error) {
    next(error);
  }
});

// 1b. PUT /api/v1/vault/me
// Protected User route: Update current user's own vault items or sections
router.put('/me', protectUser, verifySignature, authorize('vault'), async (req, res, next) => {
  try {
    await validateVaultAccess({
      actorId: req.user._id,
      action: 'update',
      sessionToken: req.headers['x-session-token'] || ''
    });

    const { section, data } = req.body;

    if (!section) {
      return res.status(400).json({ error: 'Section identifier is required' });
    }

    // Check if the user is allowed to update this section based on their own vault permissions
    const vaultObj = await getVaultByUserId(req.user._id);
    if (!vaultObj) {
      return res.status(404).json({ error: 'Vault not found' });
    }
    
    // Check permission logic
    const sectionPerms = vaultObj.permissions?.get(section) || { view: true, create: true, update: true, delete: true };
    
    if (section === 'items') {
      const currentItems = vaultObj.items || [];
      const newItems = data || [];
      if (newItems.length > currentItems.length) {
        if (!sectionPerms.create) {
          return res.status(403).json({ error: 'Access Denied: You do not have permission to create credentials in your local vault.' });
        }
      } else if (newItems.length < currentItems.length) {
        if (!sectionPerms.delete) {
          return res.status(403).json({ error: 'Access Denied: You do not have permission to delete credentials from your local vault.' });
        }
      } else {
        if (!sectionPerms.update) {
          return res.status(403).json({ error: 'Access Denied: You do not have permission to update credentials in your local vault.' });
        }
      }
    } else {
      if (!sectionPerms.update) {
        return res.status(403).json({ error: `Access Denied: You do not have update permissions for section [${section}].` });
      }
    }

    const updatedVault = await updateVaultSection(req.user._id, section, data);

    // Create Audit Log
    await AuditLog.create({
      userId: req.user._id,
      userType: 'user',
      userName: `${req.user.firstName} ${req.user.lastName}`,
      userEmail: req.user.email,
      action: 'VAULT_UPDATED',
      details: {
        section
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: `Vault section [${section}] updated successfully.`,
      vault: updatedVault
    });
  } catch (error) {
    next(error);
  }
});

// 2. GET /api/v1/vault/admin/users/:userId
// Protected Admin route: Get a user's vault
router.get('/admin/users/:userId', protectAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    let vault = await getVaultByUserId(userId);
    if (!vault) {
      vault = await createVaultForUser(userId);
    }
    res.json({
      success: true,
      vault
    });
  } catch (error) {
    next(error);
  }
});

// 3. PUT /api/v1/vault/admin/users/:userId
// Protected Admin route: Update a user's vault items or sections
router.put('/admin/users/:userId', protectAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { section, data } = req.body;

    if (!section) {
      return res.status(400).json({ error: 'Section identifier is required' });
    }

    const vault = await updateVaultSection(userId, section, data);

    // Create Audit Log
    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: `${req.admin.firstName} ${req.admin.lastName}`,
      userEmail: req.admin.email,
      action: 'VAULT_UPDATED',
      details: {
        targetUserId: userId,
        section
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: `Vault section [${section}] updated successfully.`,
      vault
    });
  } catch (error) {
    next(error);
  }
});

// 4. POST /api/v1/vault/admin/repair
// Protected Admin route: Run repair process to seed missing vaults for all users
router.post('/admin/repair', protectAdmin, async (req, res, next) => {
  try {
    const repairedCount = await repairVaults();

    // Create Audit Log
    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: `${req.admin.firstName} ${req.admin.lastName}`,
      userEmail: req.admin.email,
      action: 'VAULT_REPAIRED',
      details: {
        repairedCount
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: `Vault repair operation complete. Generated ${repairedCount} missing vaults.`,
      repairedCount
    });
  } catch (error) {
    next(error);
  }
});

// 5. POST /api/v1/vault/admin/reset/:userId
// Protected Admin route: Reset a user's vault to default state
router.post('/admin/reset/:userId', protectAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const vault = await resetVault(userId);

    // Create Audit Log
    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: `${req.admin.firstName} ${req.admin.lastName}`,
      userEmail: req.admin.email,
      action: 'VAULT_RESET',
      details: {
        targetUserId: userId
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: 'Vault reset to default values successfully.',
      vault
    });
  } catch (error) {
    next(error);
  }
});

// 6. GET /api/v1/vault/admin/export/:userId
// Protected Admin route: Export a user's vault as downloadable JSON
router.get('/admin/export/:userId', protectAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const vault = await getVaultByUserId(userId);
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    // Set download attachment headers
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=vault_${vault.vaultId}.json`);

    // Create Audit Log
    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: `${req.admin.firstName} ${req.admin.lastName}`,
      userEmail: req.admin.email,
      action: 'VAULT_EXPORTED',
      details: {
        targetUserId: userId,
        vaultId: vault.vaultId
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.send(JSON.stringify(vault.toObject(), null, 2));
  } catch (error) {
    next(error);
  }
});

// 7. DELETE /api/v1/vault/admin/users/:userId
// Protected Admin route: Archive or soft-delete a vault
router.delete('/admin/users/:userId', protectAdmin, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const vault = await Vault.findOne({ userId });
    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    vault.status = 'archived';
    await vault.save();

    // Create Audit Log
    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: `${req.admin.firstName} ${req.admin.lastName}`,
      userEmail: req.admin.email,
      action: 'VAULT_ARCHIVED',
      details: {
        targetUserId: userId
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: 'Vault archived successfully.',
      vault
    });
  } catch (error) {
    next(error);
  }
});

// --- Advanced Governance Vault Engine routes ---

const handleServiceError = (error, res, next) => {
  if (error.message && error.message.startsWith('Access Denied')) {
    return res.status(403).json({ error: error.message });
  }
  next(error);
};

// POST /api/v1/vault/clusters
router.post('/clusters', protectUser, async (req, res, next) => {
  try {
    const { name, description, scopeType, vaultId } = req.body;
    const orgId = req.user.organizationId;
    const cluster = await createCluster(name, description, orgId, req.user._id, scopeType, vaultId);
    res.status(201).json({ success: true, cluster });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// POST /api/v1/vault/collections
router.post('/collections', protectUser, async (req, res, next) => {
  try {
    const { clusterId, name, permissions } = req.body;
    const orgId = req.user.organizationId;
    const collection = await createCollection(clusterId, name, permissions, orgId, req.user._id);
    res.status(201).json({ success: true, collection });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// DELETE /api/v1/vault/collections/:collectionId
router.delete('/collections/:collectionId', protectUser, async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    await deleteCollection(collectionId, req.user._id);
    res.json({ success: true, message: 'Collection deleted successfully' });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// POST /api/v1/vault/collections/:collectionId/records
router.post('/collections/:collectionId/records', protectUser, async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    const { payload, permissions } = req.body;
    const sessionToken = req.session ? req.session.sessionToken : '';
    const record = await insertRecord(
      collectionId,
      payload,
      permissions,
      req.user._id,
      sessionToken,
      req.ip,
      req.headers['user-agent']
    );
    res.status(201).json({ success: true, record });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// PUT /api/v1/vault/records/:recordId
router.put('/records/:recordId', protectUser, async (req, res, next) => {
  try {
    const { recordId } = req.params;
    const { payload } = req.body;
    const sessionToken = req.session ? req.session.sessionToken : '';
    const record = await updateRecord(
      recordId,
      payload,
      req.user._id,
      sessionToken,
      req.ip,
      req.headers['user-agent']
    );
    res.json({ success: true, record });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// DELETE /api/v1/vault/records/:recordId
router.delete('/records/:recordId', protectUser, async (req, res, next) => {
  try {
    const { recordId } = req.params;
    const sessionToken = req.session ? req.session.sessionToken : '';
    await deleteRecord(
      recordId,
      req.user._id,
      sessionToken,
      req.ip,
      req.headers['user-agent']
    );
    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// GET /api/v1/vault/records/:recordId
router.get('/records/:recordId', protectUser, async (req, res, next) => {
  try {
    const { recordId } = req.params;
    const sessionToken = req.session ? req.session.sessionToken : '';
    const record = await findRecord(
      recordId,
      req.user._id,
      sessionToken,
      req.ip,
      req.headers['user-agent']
    );
    res.json({ success: true, record });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// GET /api/v1/vault/collections/:collectionId/records
router.get('/collections/:collectionId/records', protectUser, async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    const sessionToken = req.session ? req.session.sessionToken : '';
    const records = await findMany(
      collectionId,
      {},
      req.user._id,
      sessionToken,
      req.ip,
      req.headers['user-agent']
    );
    res.json({ success: true, records });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// GET /api/v1/vault/collections/:collectionId/count
router.get('/collections/:collectionId/count', protectUser, async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    const total = await count(collectionId, {}, req.user._id);
    res.json({ success: true, count: total });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// POST /api/v1/vault/user-sets
router.post('/user-sets', protectAdmin, async (req, res, next) => {
  try {
    const { name, members } = req.body;
    const orgId = req.admin.organizationId;
    
    let cleanMembers = [];
    if (members && members.length > 0) {
      const dbUsers = await User.find({ _id: { $in: members } });
      cleanMembers = dbUsers.filter(u => u.role !== 'admin').map(u => u._id);
    }

    const userSet = await createUserSet(name, cleanMembers, orgId, req.admin._id);
    res.status(201).json({ success: true, userSet });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// PUT /api/v1/vault/user-sets/:userSetId
router.put('/user-sets/:userSetId', protectAdmin, async (req, res, next) => {
  try {
    const { userSetId } = req.params;
    const { name } = req.body;
    const userSet = await renameUserSet(userSetId, name, req.admin._id);
    res.json({ success: true, userSet });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// DELETE /api/v1/vault/user-sets/:userSetId
router.delete('/user-sets/:userSetId', protectAdmin, async (req, res, next) => {
  try {
    const { userSetId } = req.params;
    await deleteUserSet(userSetId, req.admin._id);
    res.json({ success: true, message: 'User Set deleted successfully' });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// POST /api/v1/vault/user-sets/:userSetId/members
router.post('/user-sets/:userSetId/members', protectAdmin, async (req, res, next) => {
  try {
    const { userSetId } = req.params;
    const { userId } = req.body;
    
    const u = await User.findById(userId);
    if (u && (u.role === 'admin' || u.role === 'manager')) {
      return res.status(400).json({ error: 'Cannot add an Admin or Manager user to a User Set' });
    }

    const userSet = await addUserToSet(userSetId, userId, req.admin._id);
    res.json({ success: true, userSet });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// DELETE /api/v1/vault/user-sets/:userSetId/members/:userId
router.delete('/user-sets/:userSetId/members/:userId', protectAdmin, async (req, res, next) => {
  try {
    const { userSetId, userId } = req.params;
    const userSet = await removeUserFromSet(userSetId, userId, req.admin._id);
    res.json({ success: true, userSet });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// POST /api/v1/vault/permissions/grant
router.post('/permissions/grant', protectAdmin, async (req, res, next) => {
  try {
    const { resourceType, resourceId, granteeType, granteeId, actions } = req.body;
    
    // Absolute protection: Admin permissions are immutable and cannot be targeted
    if (granteeType === 'role' && granteeId === 'admin') {
      return res.status(400).json({ error: 'Admin role permissions are immutable and cannot be modified' });
    }
    if (granteeType === 'user') {
      const u = await User.findById(granteeId);
      if (u && u.role === 'admin') {
        return res.status(400).json({ error: 'Admin user permissions are immutable and cannot be modified' });
      }
    }

    // Manager userSet restriction
    if (req.admin.role === 'manager' && granteeType === 'userSet') {
      const containsManager = await (async () => {
        const us = await UserSet.findById(granteeId);
        if (!us || !us.members) return false;
        for (const mId of us.members) {
          if (mId.toString() === req.admin._id.toString()) return true;
          const u = await User.findById(mId);
          if (u && u.role === 'manager') return true;
        }
        return false;
      })();
      if (containsManager) {
        return res.status(403).json({ error: 'Managers are not allowed to configure permissions for a User Set containing manager accounts' });
      }
    }

    const isLocal = await (async () => {
      if (resourceType === 'cluster') {
        const cluster = await VaultCluster.findById(resourceId);
        return cluster?.scopeType === 'local';
      } else if (resourceType === 'collection') {
        const collection = await VaultCollection.findById(resourceId).populate('clusterId');
        const cluster = collection?.clusterId;
        return cluster?.scopeType === 'local';
      }
      return false;
    })();

    if (isLocal) {
      if (granteeType === 'user') {
        const u = await User.findById(granteeId);
        if (!u || (u.role !== 'admin' && u.role !== 'manager')) {
          return res.status(400).json({ error: 'Local resources only support Admin or Manager user overrides' });
        }
      } else if (granteeType === 'role') {
        if (granteeId !== 'admin' && granteeId !== 'manager') {
          return res.status(400).json({ error: 'Local resources only support Admin or Manager role overrides' });
        }
      } else {
        return res.status(400).json({ error: 'Local resources do not support User Set overrides' });
      }
    }

    const resource = await grantPermission(resourceType, resourceId, granteeType, granteeId, actions, req.admin._id);
    res.json({ success: true, resource });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// POST /api/v1/vault/permissions/revoke
router.post('/permissions/revoke', protectAdmin, async (req, res, next) => {
  try {
    const { resourceType, resourceId, granteeType, granteeId, actions } = req.body;

    // Absolute protection: Admin permissions are immutable and cannot be targeted
    if (granteeType === 'role' && granteeId === 'admin') {
      return res.status(400).json({ error: 'Admin role permissions are immutable and cannot be modified' });
    }
    if (granteeType === 'user') {
      const u = await User.findById(granteeId);
      if (u && u.role === 'admin') {
        return res.status(400).json({ error: 'Admin user permissions are immutable and cannot be modified' });
      }
    }

    // Manager userSet restriction
    if (req.admin.role === 'manager' && granteeType === 'userSet') {
      const containsManager = await (async () => {
        const us = await UserSet.findById(granteeId);
        if (!us || !us.members) return false;
        for (const mId of us.members) {
          if (mId.toString() === req.admin._id.toString()) return true;
          const u = await User.findById(mId);
          if (u && u.role === 'manager') return true;
        }
        return false;
      })();
      if (containsManager) {
        return res.status(403).json({ error: 'Managers are not allowed to configure permissions for a User Set containing manager accounts' });
      }
    }

    const isLocal = await (async () => {
      if (resourceType === 'cluster') {
        const cluster = await VaultCluster.findById(resourceId);
        return cluster?.scopeType === 'local';
      } else if (resourceType === 'collection') {
        const collection = await VaultCollection.findById(resourceId).populate('clusterId');
        const cluster = collection?.clusterId;
        return cluster?.scopeType === 'local';
      }
      return false;
    })();

    if (isLocal) {
      if (granteeType === 'user') {
        const u = await User.findById(granteeId);
        if (!u || (u.role !== 'admin' && u.role !== 'manager')) {
          return res.status(400).json({ error: 'Local resources only support Admin or Manager user overrides' });
        }
      } else if (granteeType === 'role') {
        if (granteeId !== 'admin' && granteeId !== 'manager') {
          return res.status(400).json({ error: 'Local resources only support Admin or Manager role overrides' });
        }
      } else {
        return res.status(400).json({ error: 'Local resources do not support User Set overrides' });
      }
    }

    const resource = await revokePermission(resourceType, resourceId, granteeType, granteeId, actions, req.admin._id);
    res.json({ success: true, resource });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// POST /api/v1/vault/blocks
router.post('/blocks', protectAdmin, async (req, res, next) => {
  try {
    const { targetType, targetId, collectionId } = req.body;

    if (targetType === 'role' && targetId === 'admin') {
      return res.status(400).json({ error: 'Cannot create a block targeting Admin role' });
    }
    if (targetType === 'user') {
      const u = await User.findById(targetId);
      if (u && u.role === 'admin') {
        return res.status(400).json({ error: 'Cannot create a block targeting Admin users' });
      }
    }

    // Manager restrictions
    if (req.admin.role === 'manager') {
      if (targetType === 'role' && targetId === 'manager') {
        return res.status(403).json({ error: 'Managers are not allowed to configure blocks targeting the Manager role' });
      }
      if (targetType === 'user') {
        const u = await User.findById(targetId);
        if (u && (u.role === 'manager' || u._id.toString() === req.admin._id.toString())) {
          return res.status(403).json({ error: 'Managers are not allowed to configure blocks targeting manager accounts' });
        }
      }
      if (targetType === 'userSet') {
        const containsManager = await (async () => {
          const us = await UserSet.findById(targetId);
          if (!us || !us.members) return false;
          for (const mId of us.members) {
            if (mId.toString() === req.admin._id.toString()) return true;
            const u = await User.findById(mId);
            if (u && u.role === 'manager') return true;
          }
          return false;
        })();
        if (containsManager) {
          return res.status(403).json({ error: 'Managers are not allowed to configure blocks targeting a User Set containing manager accounts' });
        }
      }
    }

    const block = await blockResource(targetType, targetId, collectionId, req.admin._id);
    res.status(201).json({ success: true, block });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// DELETE /api/v1/vault/blocks
router.delete('/blocks', protectAdmin, async (req, res, next) => {
  try {
    const { targetType, targetId, collectionId } = req.body;

    if (targetType === 'role' && targetId === 'admin') {
      return res.status(400).json({ error: 'Cannot remove a block targeting Admin role' });
    }
    if (targetType === 'user') {
      const u = await User.findById(targetId);
      if (u && u.role === 'admin') {
        return res.status(400).json({ error: 'Cannot remove a block targeting Admin users' });
      }
    }

    // Manager restrictions
    if (req.admin.role === 'manager') {
      if (targetType === 'role' && targetId === 'manager') {
        return res.status(403).json({ error: 'Managers are not allowed to modify blocks targeting the Manager role' });
      }
      if (targetType === 'user') {
        const u = await User.findById(targetId);
        if (u && (u.role === 'manager' || u._id.toString() === req.admin._id.toString())) {
          return res.status(403).json({ error: 'Managers are not allowed to modify blocks targeting manager accounts' });
        }
      }
      if (targetType === 'userSet') {
        const containsManager = await (async () => {
          const us = await UserSet.findById(targetId);
          if (!us || !us.members) return false;
          for (const mId of us.members) {
            if (mId.toString() === req.admin._id.toString()) return true;
            const u = await User.findById(mId);
            if (u && u.role === 'manager') return true;
          }
          return false;
        })();
        if (containsManager) {
          return res.status(403).json({ error: 'Managers are not allowed to modify blocks targeting a User Set containing manager accounts' });
        }
      }
    }

    await unblockResource(targetType, targetId, collectionId, req.admin._id);
    res.json({ success: true, message: 'Resource unblocked successfully' });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// GET /api/v1/vault/collections/:collectionId/export
router.get('/collections/:collectionId/export', protectUser, async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    const sessionToken = req.session ? req.session.sessionToken : '';
    const data = await exportCollection(
      collectionId,
      req.user._id,
      sessionToken,
      req.ip,
      req.headers['user-agent']
    );
    res.json({ success: true, data });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// GET /api/v1/vault/vault-audit-logs
router.get('/vault-audit-logs', protectAdmin, async (req, res, next) => {
  try {
    const { action, vaultId, collectionId, result } = req.query;
    const query = {};
    if (action) query.action = action;
    if (vaultId) query.vaultId = vaultId;
    if (collectionId) query.collectionId = collectionId;
    if (result) query.result = result;

    const logs = await audit(query, req.admin._id);
    res.json({ success: true, logs });
  } catch (error) {
    handleServiceError(error, res, next);
  }
});

// ---- Admin Governance Listing Endpoints ----

// GET /api/v1/vault/admin/clusters - List all clusters
router.get('/admin/clusters', protectAdmin, async (req, res, next) => {
  try {
    const clusters = await VaultCluster.find({ organizationId: req.admin.organizationId })
      .populate('permissions.users.userId', 'firstName lastName email role')
      .populate('permissions.userSets.userSetId', 'name')
      .sort({ createdAt: -1 });

    const populated = await Promise.all(clusters.map(async (c) => {
      const obj = c.toObject();
      if (c.scopeType === 'local' && c.vaultId) {
        const vault = await Vault.findOne({ vaultId: c.vaultId }).populate('userId', 'firstName lastName email');
        if (vault && vault.userId) {
          obj.userInfo = {
            _id: vault.userId._id,
            name: `${vault.userId.firstName} ${vault.userId.lastName}`,
            email: vault.userId.email
          };
        }
      }
      return obj;
    }));

    res.json({ success: true, clusters: populated });
  } catch (error) { next(error); }
});

// POST /api/v1/vault/admin/clusters - Admin creates a new cluster
router.post('/admin/clusters', protectAdmin, async (req, res, next) => {
  try {
    const { name, description, scopeType, vaultId, permissions } = req.body;
    const orgId = req.admin.organizationId;
    const cluster = await createCluster(name, description, orgId, req.admin._id, scopeType, vaultId, permissions);
    res.status(201).json({ success: true, cluster });
  } catch (error) { next(error); }
});

// POST /api/v1/vault/admin/clusters/:clusterId/block - Admin blocks a cluster
router.post('/admin/clusters/:clusterId/block', protectAdmin, async (req, res, next) => {
  try {
    const { clusterId } = req.params;
    const cluster = await VaultCluster.findByIdAndUpdate(clusterId, { blocked: true }, { new: true });
    if (!cluster) return res.status(404).json({ error: 'Cluster not found' });
    res.json({ success: true, cluster });
  } catch (error) { next(error); }
});

// POST /api/v1/vault/admin/clusters/:clusterId/unblock - Admin unblocks a cluster
router.post('/admin/clusters/:clusterId/unblock', protectAdmin, async (req, res, next) => {
  try {
    const { clusterId } = req.params;
    const cluster = await VaultCluster.findByIdAndUpdate(clusterId, { blocked: false }, { new: true });
    if (!cluster) return res.status(404).json({ error: 'Cluster not found' });
    res.json({ success: true, cluster });
  } catch (error) { next(error); }
});

// GET /api/v1/vault/admin/collections - List all collections (with cluster info)
router.get('/admin/collections', protectAdmin, async (req, res, next) => {
  try {
    const collections = await VaultCollection.find({ organizationId: req.admin.organizationId })
      .populate('clusterId', 'name scopeType')
      .populate('permissions.users.userId', 'firstName lastName email role')
      .populate('permissions.userSets.userSetId', 'name')
      .sort({ createdAt: -1 });
    // Attach record count per collection
    const withCounts = await Promise.all(collections.map(async (col) => {
      const recordCount = await VaultRecord.countDocuments({ collectionId: col._id });
      return { ...col.toObject(), recordCount };
    }));
    res.json({ success: true, collections: withCounts });
  } catch (error) { next(error); }
});

// POST /api/v1/vault/admin/collections - Admin creates a new collection
router.post('/admin/collections', protectAdmin, async (req, res, next) => {
  try {
    const { clusterId, name, permissions } = req.body;
    const orgId = req.admin.organizationId;
    const collection = await createCollection(clusterId, name, permissions, orgId, req.admin._id);
    res.status(201).json({ success: true, collection });
  } catch (error) { next(error); }
});

// POST /api/v1/vault/admin/collections/:collectionId/block - Admin blocks a collection
router.post('/admin/collections/:collectionId/block', protectAdmin, async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    const collection = await VaultCollection.findByIdAndUpdate(collectionId, { blocked: true }, { new: true });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    res.json({ success: true, collection });
  } catch (error) { next(error); }
});

// POST /api/v1/vault/admin/collections/:collectionId/unblock - Admin unblocks a collection
router.post('/admin/collections/:collectionId/unblock', protectAdmin, async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    const collection = await VaultCollection.findByIdAndUpdate(collectionId, { blocked: false }, { new: true });
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    res.json({ success: true, collection });
  } catch (error) { next(error); }
});

// GET /api/v1/vault/admin/user-sets - List all user sets with member details
router.get('/admin/user-sets', protectAdmin, async (req, res, next) => {
  try {
    const userSets = await UserSet.find({ organizationId: req.admin.organizationId })
      .sort({ createdAt: -1 });
    // Populate member details
    const populated = await Promise.all(userSets.map(async (us) => {
      const members = await User.find({ _id: { $in: us.members } })
        .select('firstName lastName email role');
      return { ...us.toObject(), memberDetails: members };
    }));
    res.json({ success: true, userSets: populated });
  } catch (error) { next(error); }
});

// GET /api/v1/vault/admin/block-rules - List all block rules
router.get('/admin/block-rules', protectAdmin, async (req, res, next) => {
  try {
    const rules = await VaultBlockRule.find({ organizationId: req.admin.organizationId })
      .populate('blockedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.json({ success: true, rules });
  } catch (error) { next(error); }
});

// GET /api/v1/vault/admin/collections/:collectionId/records - List records in collection
router.get('/admin/collections/:collectionId/records', protectAdmin, async (req, res, next) => {
  try {
    const { collectionId } = req.params;
    const records = await VaultRecord.find({ collectionId })
      .select('_id collectionId ownerId encryptedData permissionMetadata createdAt updatedAt')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ success: true, records });
  } catch (error) { next(error); }
});

// GET /api/v1/vault/admin/records/:recordId - Admin decrypts and views a single record
router.get('/admin/records/:recordId', protectAdmin, async (req, res, next) => {
  try {
    const { recordId } = req.params;
    const record = await VaultRecord.findById(recordId);
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Decrypt record payload (Admin has unrestricted access, no field blocks applied)
    const encryptedData = JSON.parse(record.encryptedData || '{}');
    const decrypted = decryptPayload(encryptedData);

    res.json({
      success: true,
      record: {
        _id: record._id,
        collectionId: record.collectionId,
        ownerId: record.ownerId,
        data: decrypted,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/vault/admin/user-sets - Admin creates a user set
router.post('/admin/user-sets', protectAdmin, async (req, res, next) => {
  try {
    const { name, members } = req.body;
    
    let cleanMembers = [];
    if (members && members.length > 0) {
      const dbUsers = await User.find({ _id: { $in: members } });
      cleanMembers = dbUsers.filter(u => u.role !== 'admin').map(u => u._id);
    }

    const userSet = await createUserSet(name, cleanMembers, req.admin.organizationId, req.admin._id);
    res.status(201).json({ success: true, userSet });
  } catch (error) { next(error); }
});

// DELETE /api/v1/vault/admin/user-sets/:userSetId - Admin deletes a user set
router.delete('/admin/user-sets/:userSetId', protectAdmin, async (req, res, next) => {
  try {
    const { userSetId } = req.params;
    await deleteUserSet(userSetId, req.admin._id);
    res.json({ success: true, message: 'User Set deleted' });
  } catch (error) { next(error); }
});

// POST /api/v1/vault/admin/user-sets/:userSetId/members - Add member to user set
router.post('/admin/user-sets/:userSetId/members', protectAdmin, async (req, res, next) => {
  try {
    const { userSetId } = req.params;
    const { userId } = req.body;

    const u = await User.findById(userId);
    if (u && (u.role === 'admin' || u.role === 'manager')) {
      return res.status(400).json({ error: 'Cannot add an Admin or Manager user to a User Set' });
    }

    const userSet = await addUserToSet(userSetId, userId, req.admin._id);
    res.json({ success: true, userSet });
  } catch (error) { next(error); }
});

// DELETE /api/v1/vault/admin/user-sets/:userSetId/members/:userId - Remove member
router.delete('/admin/user-sets/:userSetId/members/:userId', protectAdmin, async (req, res, next) => {
  try {
    const { userSetId, userId } = req.params;
    const userSet = await removeUserFromSet(userSetId, userId, req.admin._id);
    res.json({ success: true, userSet });
  } catch (error) { next(error); }
});

// GET /api/v1/vault/admin/governance - Combined governance snapshot (clusters + collections)
router.get('/admin/governance', protectAdmin, async (req, res, next) => {
  try {
    const orgId = req.admin.organizationId;
    const [clusters, collections] = await Promise.all([
      VaultCluster.find({ organizationId: orgId }).sort({ createdAt: -1 }),
      VaultCollection.find({ organizationId: orgId })
        .populate('clusterId', 'name')
        .sort({ createdAt: -1 })
    ]);
    res.json({ success: true, clusters, collections });
  } catch (error) { next(error); }
});


export default router;
