import express from 'express';
import { verifySignature } from '../middlewares/signatureMiddleware.js';
import {
  insertRecord,
  updateRecord,
  deleteRecord,
  findRecord,
  findMany
} from '../services/vaultEngineService.js';
import AuditLog from '../models/AuditLog.js';

const router = express.Router();

// Apply signature verification middleware to all developer routes
router.use(verifySignature);

/**
 * 1. Create Vault Data
 * POST /api/v1/developer/vault
 * Body: { collectionId, userId, payload, permissions }
 */
router.post('/vault', async (req, res, next) => {
  try {
    if (!req.apiKeyPermissions.includes('create')) {
      return res.status(403).json({ error: 'Access Denied: API Key does not have create permission.' });
    }
    const { collectionId, userId, payload, permissions } = req.body;

    if (!collectionId || !userId || !payload) {
      return res.status(400).json({ error: 'Missing required parameters: collectionId, userId, payload' });
    }

    const record = await insertRecord(
      collectionId,
      payload,
      permissions,
      userId,
      'DEVELOPER_API_SESSION', // Mark as API session
      req.ip,
      req.headers['user-agent'] || 'Developer SDK'
    );

    // Create custom Developer operational Audit Log
    await AuditLog.create({
      userId,
      userType: 'user',
      action: 'DEV_API_VAULT_CREATED',
      details: {
        applicationId: req.applicationId,
        collectionId,
        recordId: record._id,
        payloadKeys: Object.keys(payload)
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || 'Developer SDK'
    });

    res.status(201).json({ success: true, record });
  } catch (error) {
    if (error.message && error.message.includes('Access Denied')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * 5. List Vault Data
 * GET /api/v1/developer/vault/list
 * Query: collectionId, userId
 */
router.get('/vault/list', async (req, res, next) => {
  try {
    if (!req.apiKeyPermissions.includes('read')) {
      return res.status(403).json({ error: 'Access Denied: API Key does not have read permission.' });
    }
    const { collectionId, userId } = req.query;

    if (!collectionId || !userId) {
      return res.status(400).json({ error: 'Missing required parameters: collectionId, userId' });
    }

    const records = await findMany(
      collectionId,
      {},
      userId,
      'DEVELOPER_API_SESSION',
      req.ip,
      req.headers['user-agent'] || 'Developer SDK'
    );

    res.json({ success: true, records });
  } catch (error) {
    if (error.message && error.message.includes('Access Denied')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * 2. Read Vault Data
 * GET /api/v1/developer/vault/:id
 * Query or Header: x-user-id or userId
 */
router.get('/vault/:id', async (req, res, next) => {
  try {
    if (!req.apiKeyPermissions.includes('read')) {
      return res.status(403).json({ error: 'Access Denied: API Key does not have read permission.' });
    }
    const recordId = req.params.id;
    const userId = req.headers['x-user-id'] || req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required parameter: userId (passed in headers as x-user-id or in query string)' });
    }

    const record = await findRecord(
      recordId,
      userId,
      'DEVELOPER_API_SESSION',
      req.ip,
      req.headers['user-agent'] || 'Developer SDK'
    );

    await AuditLog.create({
      userId,
      userType: 'user',
      action: 'DEV_API_VAULT_READ',
      details: {
        applicationId: req.applicationId,
        recordId
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || 'Developer SDK'
    });

    res.json({ success: true, record });
  } catch (error) {
    if (error.message && error.message.includes('Access Denied')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * 3. Update Vault Data
 * PUT /api/v1/developer/vault/:id
 * Body: { userId, payload }
 */
router.put('/vault/:id', async (req, res, next) => {
  try {
    if (!req.apiKeyPermissions.includes('update')) {
      return res.status(403).json({ error: 'Access Denied: API Key does not have update permission.' });
    }
    const recordId = req.params.id;
    const { userId, payload } = req.body;

    if (!userId || !payload) {
      return res.status(400).json({ error: 'Missing required parameters: userId, payload' });
    }

    const record = await updateRecord(
      recordId,
      payload,
      userId,
      'DEVELOPER_API_SESSION',
      req.ip,
      req.headers['user-agent'] || 'Developer SDK'
    );

    await AuditLog.create({
      userId,
      userType: 'user',
      action: 'DEV_API_VAULT_UPDATED',
      details: {
        applicationId: req.applicationId,
        recordId,
        updatedKeys: Object.keys(payload)
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || 'Developer SDK'
    });

    res.json({ success: true, record });
  } catch (error) {
    if (error.message && error.message.includes('Access Denied')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * 4. Delete Vault Data
 * DELETE /api/v1/developer/vault/:id
 * Body or Query: userId
 */
router.delete('/vault/:id', async (req, res, next) => {
  try {
    if (!req.apiKeyPermissions.includes('delete')) {
      return res.status(403).json({ error: 'Access Denied: API Key does not have delete permission.' });
    }
    const recordId = req.params.id;
    const userId = req.headers['x-user-id'] || req.query.userId || req.body.userId;

    if (!userId) {
      return res.status(400).json({ error: 'Missing required parameter: userId' });
    }

    await deleteRecord(
      recordId,
      userId,
      'DEVELOPER_API_SESSION',
      req.ip,
      req.headers['user-agent'] || 'Developer SDK'
    );

    await AuditLog.create({
      userId,
      userType: 'user',
      action: 'DEV_API_VAULT_DELETED',
      details: {
        applicationId: req.applicationId,
        recordId
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] || 'Developer SDK'
    });

    res.json({ success: true, message: 'Record deleted successfully' });
  } catch (error) {
    if (error.message && error.message.includes('Access Denied')) {
      return res.status(403).json({ error: error.message });
    }
    next(error);
  }
});



export default router;
