import express from 'express';
import crypto from 'crypto';
import { protectAdmin } from '../middlewares/authMiddleware.js';
import Application from '../models/Application.js';
import ApiKey from '../models/ApiKey.js';
import AuditLog from '../models/AuditLog.js';

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
    console.error('[ADMIN APPLICATION AUDIT LOG ERROR]:', err.message);
  }
};

/**
 * GET /api/v1/admin/applications
 * List all applications under the admin's organization
 */
router.get('/admin/applications', protectAdmin, async (req, res, next) => {
  try {
    const apps = await Application.find({ organizationId: req.admin.organizationId }).sort({ createdAt: -1 });
    res.json({ success: true, applications: apps });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/applications
 * Create a new developer application
 */
router.post('/admin/applications', protectAdmin, async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Application name is required' });
    }

    // Check if duplicate name exists in same organization
    const existingApp = await Application.findOne({
      organizationId: req.admin.organizationId,
      name: name.trim()
    });

    if (existingApp) {
      return res.status(400).json({ error: `Application named "${name}" already exists` });
    }

    const app = await Application.create({
      name: name.trim(),
      organizationId: req.admin.organizationId
    });

    await logAdminAction(req, 'APPLICATION_CREATED', { applicationId: app._id, name: app.name });

    res.status(201).json({ success: true, application: app });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/admin/applications/:id
 * Delete an application and clean up its API keys
 */
router.delete('/admin/applications/:id', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const app = await Application.findOneAndDelete({
      _id: id,
      organizationId: req.admin.organizationId
    });

    if (!app) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Remove associated API keys
    await ApiKey.deleteMany({ applicationId: id });

    await logAdminAction(req, 'APPLICATION_DELETED', { applicationId: id, name: app.name });

    res.json({ success: true, message: `Application "${app.name}" and its keys deleted successfully` });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/admin/api-keys
 * List all API keys generated for applications under the organization
 */
router.get('/admin/api-keys', protectAdmin, async (req, res, next) => {
  try {
    const keys = await ApiKey.find({ organizationId: req.admin.organizationId })
      .populate('applicationId', 'name')
      .sort({ createdAt: -1 });

    res.json({ success: true, apiKeys: keys });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/api-keys
 * Create a new API key pair for an application
 */
router.post('/admin/api-keys', protectAdmin, async (req, res, next) => {
  try {
    const { applicationId } = req.body;
    if (!applicationId) {
      return res.status(400).json({ error: 'Application ID is required' });
    }

    // Verify application ownership
    const app = await Application.findOne({
      _id: applicationId,
      organizationId: req.admin.organizationId
    });

    if (!app) {
      return res.status(404).json({ error: 'Application not found or unauthorized' });
    }

    // Generate secure keys
    const apiKey = `masc_apk_${crypto.randomBytes(16).toString('hex')}`;
    const apiSecret = `masc_sec_${crypto.randomBytes(32).toString('hex')}`;

    const newKey = await ApiKey.create({
      apiKey,
      apiSecret,
      applicationId,
      organizationId: req.admin.organizationId,
      status: 'active'
    });

    await logAdminAction(req, 'API_KEY_GENERATED', {
      apiKeyId: newKey._id,
      applicationId,
      applicationName: app.name
    });

    res.status(201).json({ success: true, apiKey: newKey });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/admin/api-keys/:id/rotate
 * Rotate API Key - generates a new apiSecret
 */
router.post('/admin/api-keys/:id/rotate', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const keyRecord = await ApiKey.findOne({
      _id: id,
      organizationId: req.admin.organizationId
    });

    if (!keyRecord) {
      return res.status(404).json({ error: 'API Key credential not found' });
    }

    const newSecret = `masc_sec_${crypto.randomBytes(32).toString('hex')}`;

    keyRecord.apiSecret = newSecret;
    keyRecord.rotatedAt = new Date();
    await keyRecord.save();

    await logAdminAction(req, 'API_KEY_ROTATED', {
      apiKeyId: id,
      applicationId: keyRecord.applicationId
    });

    res.json({ success: true, message: 'API Key rotated successfully', apiKey: keyRecord });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/v1/admin/api-keys/:id
 * Revoke/delete an API key
 */
router.delete('/admin/api-keys/:id', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    const keyRecord = await ApiKey.findOneAndDelete({
      _id: id,
      organizationId: req.admin.organizationId
    });

    if (!keyRecord) {
      return res.status(404).json({ error: 'API Key not found or unauthorized' });
    }

    await logAdminAction(req, 'API_KEY_REVOKED', {
      apiKeyId: id,
      applicationId: keyRecord.applicationId
    });

    res.json({ success: true, message: 'API Key revoked and deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/v1/admin/api-keys/:id
 * Update API Key permissions
 */
router.put('/admin/api-keys/:id', protectAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;

    const keyRecord = await ApiKey.findOne({
      _id: id,
      organizationId: req.admin.organizationId
    });

    if (!keyRecord) {
      return res.status(404).json({ error: 'API Key not found' });
    }

    if (permissions !== undefined) {
      keyRecord.permissions = permissions;
    }

    await keyRecord.save();

    await logAdminAction(req, 'API_KEY_PERMISSIONS_UPDATED', {
      apiKeyId: id,
      applicationId: keyRecord.applicationId,
      permissions
    });

    res.json({ success: true, message: 'API Key permissions updated successfully', apiKey: keyRecord });
  } catch (error) {
    next(error);
  }
});

export default router;
