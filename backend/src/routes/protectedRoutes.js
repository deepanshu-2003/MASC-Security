import express from 'express';
import { protectUser, authorize } from '../middlewares/authMiddleware.js';
import { verifySignature } from '../middlewares/signatureMiddleware.js';
import Organization from '../models/Organization.js';
import Vault from '../models/Vault.js';
import { createVaultForUser } from '../services/vaultService.js';
import VaultCluster from '../models/VaultCluster.js';
import VaultCollection from '../models/VaultCollection.js';
import VaultRecord from '../models/VaultRecord.js';
import { insertRecord, updateRecord, deleteRecord, decryptPayload, validateVaultAccess } from '../services/vaultEngineService.js';

const router = express.Router();


// Helper to retrieve user's vault if organization vaultMode is enabled
const getVaultIfEnabled = async (userId) => {
  const org = await Organization.findOne();
  if (org && org.vaultMode) {
    let vault = await Vault.findOne({ userId });
    if (!vault) {
      // Automatic self-repair/generation if vault is missing for active session
      vault = await createVaultForUser(userId);
    }
    return vault;
  }
  return null;
};

// 1. Vault Endpoint
router.get('/vault', protectUser, authorize('vault'), async (req, res, next) => {
  try {
    const vaultObj = await Vault.findOne({ userId: req.user._id });
    if (vaultObj) {
      const sectionPerms = vaultObj.permissions?.get('vault') || { view: true };
      if (!sectionPerms.view) {
        return res.status(403).json({ error: 'Access Denied: Admin policy blocks access to view your secure vault.' });
      }
    }

    const vault = await getVaultIfEnabled(req.user._id);
    if (vault) {
      return res.json({
        resource: 'vault',
        data: {
          vaultId: vault.vaultId,
          owner: `${req.user.firstName} ${req.user.lastName}`,
          securityLevel: 'AES-256 System Encryption',
          items: vault.items
        }
      });
    }

    // Fallback: Default mock data if vaultMode is disabled
    res.json({
      resource: 'vault',
      data: {
        vaultId: `VLT-${req.user._id.toString().slice(-6).toUpperCase()}`,
        owner: `${req.user.firstName} ${req.user.lastName}`,
        securityLevel: 'AES-256 System Encryption (Sandbox Mock)',
        items: []
      }
    });
  } catch (error) {
    next(error);
  }
});



// 4. Salary Slips Endpoint (decrypted records from advanced vault collection "celerySlip" inside local cluster)
router.get('/salary-slips', protectUser, verifySignature, authorize('salarySlips'), async (req, res, next) => {
  try {
    if (req.apiKeyPermissions && !req.apiKeyPermissions.includes('read')) {
      return res.status(403).json({ error: 'Access Denied: API Key does not have read permission.' });
    }
    const vaultObj = await Vault.findOne({ userId: req.user._id });
    if (vaultObj) {
      const sectionPerms = vaultObj.permissions?.get('salarySlips') || { view: true };
      if (!sectionPerms.view) {
        return res.status(403).json({ error: 'Access Denied: Admin policy blocks access to view salary slips.' });
      }
    }

    // Find user's local cluster
    const clusterName = `Salary Slips - ${req.user.firstName} ${req.user.lastName}`;
    const cluster = await VaultCluster.findOne({ createdBy: req.user._id, name: clusterName });
    if (!cluster) {
      return res.json({ resource: 'salarySlips', data: [] });
    }

    // Find "celerySlip" collection
    const collection = await VaultCollection.findOne({ clusterId: cluster._id, name: 'celerySlip' });
    if (!collection) {
      return res.json({ resource: 'salarySlips', data: [] });
    }

    // Validate access to the collection (checking block rules)
    await validateVaultAccess({
      actorId: req.user._id,
      action: 'read',
      collectionId: collection._id,
      sessionToken: req.headers['x-session-token'] || ''
    });

    // Fetch records in this collection
    const records = await VaultRecord.find({ collectionId: collection._id }).sort({ createdAt: -1 });

    // Decrypt records
    const slips = records.map(rec => {
      const encryptedData = JSON.parse(rec.encryptedData || '{}');
      const decrypted = decryptPayload(encryptedData);
      return {
        _id: rec._id,
        ...decrypted
      };
    });

    res.json({
      resource: 'salarySlips',
      data: slips
    });
  } catch (error) {
    next(error);
  }
});

// 4b. Generate Salary Slip Endpoint (inserts record inside collection "celerySlip" of local cluster)
router.post('/salary-slips/generate', protectUser, verifySignature, authorize('salarySlips'), async (req, res, next) => {
  try {
    console.log('DEBUG: apiKeyPermissions attached to request:', req.apiKeyPermissions);
    if (req.apiKeyPermissions && !req.apiKeyPermissions.includes('create')) {
      return res.status(403).json({ error: 'Access Denied: API Key does not have create permission.' });
    }
    const vaultObj = await Vault.findOne({ userId: req.user._id });
    if (!vaultObj) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    // Check if vault's section permissions allow creation
    const sectionPerms = vaultObj.permissions?.get('salarySlips') || { create: true };
    if (sectionPerms.create === false) {
      return res.status(403).json({ error: 'Access Denied: You do not have permission to generate salary slips in your vault.' });
    }

    // Ensure user's local cluster exists
    const clusterName = `Salary Slips - ${req.user.firstName} ${req.user.lastName}`;
    let cluster = await VaultCluster.findOne({ createdBy: req.user._id, name: clusterName });
    if (!cluster) {
      cluster = await VaultCluster.create({
        name: clusterName,
        description: `Local salary slips cluster for ${req.user.firstName} ${req.user.lastName}`,
        organizationId: req.user.organizationId,
        createdBy: req.user._id,
        scopeType: 'local',
        vaultId: vaultObj.vaultId
      });
    }

    // Ensure "celerySlip" collection exists inside the cluster
    let collection = await VaultCollection.findOne({ clusterId: cluster._id, name: 'celerySlip' });
    if (!collection) {
      collection = await VaultCollection.create({
        name: 'celerySlip',
        description: `Encrypted celery slip pay stub records for user ${req.user.firstName}`,
        clusterId: cluster._id,
        organizationId: req.user.organizationId,
        createdBy: req.user._id,
        status: 'active'
      });
    }

    // Generate random salary data
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const currentMonth = months[new Date().getMonth()] + ' ' + new Date().getFullYear();
    const netSalary = Math.floor(Math.random() * (120000 - 45000 + 1)) + 45000;
    const basicSalary = Math.round(netSalary * 0.55);
    const hra = Math.round(netSalary * 0.25);
    const allowances = Math.round(netSalary * 0.2);
    const deductions = Math.round(netSalary * 0.08);
    const pf = Math.round(netSalary * 0.06);
    const tds = Math.round(netSalary * 0.05);

    const payload = {
      month: currentMonth,
      netSalary: String(netSalary),
      basicSalary: String(basicSalary),
      hra: String(hra),
      allowances: String(allowances),
      deductions: String(deductions),
      pf: String(pf),
      tds: String(tds),
      paymentDate: new Date().toISOString(),
      notes: 'Automatically generated secure pay stub stored as AES-256 encrypted Vault Record.'
    };

    // Insert record inside advanced vault engine
    const record = await insertRecord(
      collection._id,
      payload,
      collection.permissions,
      req.user._id,
      req.headers['x-session-token'] || '',
      req.ip,
      req.headers['user-agent'] || ''
    );

    res.status(201).json({
      success: true,
      message: 'Salary slip generated successfully',
      salarySlip: {
        _id: record._id,
        ...payload
      }
    });
  } catch (error) {
    next(error);
  }
});

// 4c. Update Salary Slip Endpoint (updates record inside collection "celerySlip" of local cluster)
router.put('/salary-slips/:id', protectUser, verifySignature, authorize('salarySlips'), async (req, res, next) => {
  try {
    if (req.apiKeyPermissions && !req.apiKeyPermissions.includes('update')) {
      return res.status(403).json({ error: 'Access Denied: API Key does not have update permission.' });
    }
    const recordId = req.params.id;
    const { netSalary, month, paymentDate } = req.body;
    if (!netSalary) {
      return res.status(400).json({ error: 'Missing required parameter: netSalary' });
    }

    const basicSalary = Math.round(Number(netSalary) * 0.55);
    const hra = Math.round(Number(netSalary) * 0.25);
    const allowances = Math.round(Number(netSalary) * 0.2);
    const deductions = Math.round(Number(netSalary) * 0.08);
    const pf = Math.round(Number(netSalary) * 0.06);
    const tds = Math.round(Number(netSalary) * 0.05);

    const payload = {
      month: month || 'July 2026',
      netSalary: String(netSalary),
      basicSalary: String(basicSalary),
      hra: String(hra),
      allowances: String(allowances),
      deductions: String(deductions),
      pf: String(pf),
      tds: String(tds),
      paymentDate: paymentDate || new Date().toISOString(),
      notes: 'Updated secure pay stub stored as AES-256 encrypted Vault Record.'
    };

    const record = await updateRecord(
      recordId,
      payload,
      req.user._id,
      req.headers['x-session-token'] || '',
      req.ip,
      req.headers['user-agent'] || ''
    );

    res.json({
      success: true,
      message: 'Salary slip updated successfully',
      salarySlip: {
        _id: record._id,
        ...payload
      }
    });
  } catch (error) {
    next(error);
  }
});

// 4d. Delete Salary Slip Endpoint (deletes record inside collection "celerySlip" of local cluster)
router.delete('/salary-slips/:id', protectUser, verifySignature, authorize('salarySlips'), async (req, res, next) => {
  try {
    if (req.apiKeyPermissions && !req.apiKeyPermissions.includes('delete')) {
      return res.status(403).json({ error: 'Access Denied: API Key does not have delete permission.' });
    }
    const recordId = req.params.id;

    await deleteRecord(
      recordId,
      req.user._id,
      req.headers['x-session-token'] || '',
      req.ip,
      req.headers['user-agent'] || ''
    );

    res.json({
      success: true,
      message: 'Salary slip deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
