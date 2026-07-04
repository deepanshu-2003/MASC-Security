import mongoose from 'mongoose';
import VaultCluster from '../models/VaultCluster.js';
import VaultCollection from '../models/VaultCollection.js';
import VaultRecord from '../models/VaultRecord.js';
import UserSet from '../models/UserSet.js';
import VaultBlockRule from '../models/VaultBlockRule.js';
import User from '../models/User.js';
import Session from '../models/Session.js';
import AuditLog from '../models/AuditLog.js';
import { encryptValue, decryptValue } from './encryption.js';
import { createVaultForUser } from './vaultService.js';
import Vault from '../models/Vault.js';

// Helper to log Vault operations
export const logVaultOperation = async ({
  userId,
  action,
  sessionToken = '',
  ipAddress = '',
  userAgent = '',
  vaultId = '',
  collectionId = '',
  recordId = '',
  result = 'success',
  details = {}
}) => {
  try {
    const user = await User.findById(userId);
    await AuditLog.create({
      userId,
      userType: user ? (['admin', 'manager'].includes(user.role) ? 'admin' : 'user') : 'user',
      userName: user ? `${user.firstName} ${user.lastName}` : 'System',
      userEmail: user ? user.email : '',
      action,
      sessionToken,
      vaultId: vaultId || (user ? user.vaultId : ''),
      collectionId: collectionId ? collectionId.toString() : '',
      recordId: recordId ? recordId.toString() : '',
      result,
      details,
      ipAddress,
      userAgent
    });
  } catch (err) {
    console.error('[VAULT SERVICE AUDIT ERROR] Failed to write audit log:', err.message);
  }
};

// Check permissions object helper
const checkPermissionsObject = (permissions, userId, userSetIds, role, isOwner, action) => {
  if (!permissions) return false;
  // 1. User-specific permissions override default/role/user-set permissions
  if (permissions.users && permissions.users.length > 0) {
    const userPerm = permissions.users.find(u => u.userId.toString() === userId.toString());
    if (userPerm) {
      return userPerm.actions.includes(action);
    }
  }

  // 2. Owner permissions
  if (isOwner) {
    if (permissions.ownerActions && permissions.ownerActions.includes(action)) {
      return true;
    }
  }

  // 3. User Sets permissions
  if (permissions.userSets && permissions.userSets.length > 0) {
    const userSetPerms = permissions.userSets.filter(us => userSetIds.includes(us.userSetId.toString()));
    for (const usp of userSetPerms) {
      if (usp.actions.includes(action)) {
        return true;
      }
    }
  }

  // 4. Role permissions
  if (permissions.roles && permissions.roles.length > 0) {
    const rolePerm = permissions.roles.find(r => r.role === role);
    if (rolePerm && rolePerm.actions.includes(action)) {
      return true;
    }
  }

  // Admin bypass if roles list doesn't explicitly restrict
  if (role === 'admin') {
    return true;
  }

  return false;
};

// Helper for validating access (JWT/Session are checked in middleware, here we check overrides and block rules)
export const validateVaultAccess = async ({
  actorId,
  sessionToken,
  action,
  clusterId = null,
  collectionId = null,
  recordId = null,
  fieldName = null
}) => {
  const actor = await User.findById(actorId);
  if (!actor) {
    throw new Error('Access Denied: User not found');
  }
  if (actor.status !== 'active') {
    throw new Error('Access Denied: User account is suspended or deactivated');
  }

  // Ensure actor has a Vault ID
  if (!actor.vaultId) {
    await createVaultForUser(actor._id);
    const updatedActor = await User.findById(actorId);
    actor.vaultId = updatedActor.vaultId;
  }

  // Validate Session if sessionToken is supplied (and is not a developer API session)
  if (sessionToken && sessionToken !== 'DEVELOPER_API_SESSION') {
    const session = await Session.findOne({ sessionToken }).populate('userId');
    if (!session) {
      throw new Error('Access Denied: Session not found');
    }
    if (session.status !== 'active') {
      throw new Error(`Access Denied: Session status is ${session.status}`);
    }
    if (session.expiresAt < new Date()) {
      throw new Error('Access Denied: Session expired');
    }

    const sessionUser = session.userId;
    if (!sessionUser) {
      throw new Error('Access Denied: Session user not found');
    }

    // Resolve target vault ID and scope to compare
    let targetVaultId = null;
    let isLocalVault = false;
    if (recordId) {
      const rec = await VaultRecord.findById(recordId);
      const parentCol = rec ? await VaultCollection.findById(rec.collectionId) : null;
      const parentClust = parentCol ? await VaultCluster.findById(parentCol.clusterId) : null;
      if (rec) targetVaultId = rec.vaultId;
      if (parentClust && parentClust.scopeType === 'local') {
        isLocalVault = true;
      }
    } else if (collectionId) {
      const col = await VaultCollection.findById(collectionId);
      const clust = col ? await VaultCluster.findById(col.clusterId) : null;
      if (clust) {
        targetVaultId = clust.vaultId;
        if (clust.scopeType === 'local') {
          isLocalVault = true;
        }
      }
    } else if (clusterId) {
      const clust = await VaultCluster.findById(clusterId);
      if (clust) {
        targetVaultId = clust.vaultId;
        if (clust.scopeType === 'local') {
          isLocalVault = true;
        }
      }
    }

    if (isLocalVault) {
      const isSessionUserAdmin = sessionUser.role === 'admin';
      const isSessionUserOwner = targetVaultId ? (sessionUser.vaultId === targetVaultId) : (sessionUser._id.toString() === actorId.toString());

      if (!isSessionUserAdmin && !isSessionUserOwner) {
        throw new Error('Access Denied: Session user is not authorized to access this local vault resource');
      }
    }
  } else if (!sessionToken && sessionToken !== 'DEVELOPER_API_SESSION') {
    // Check if accessing a local vault resource (which requires sessionToken on user panel)
    let isLocalVault = false;
    if (recordId) {
      const rec = await VaultRecord.findById(recordId);
      const parentCol = rec ? await VaultCollection.findById(rec.collectionId) : null;
      const parentClust = parentCol ? await VaultCluster.findById(parentCol.clusterId) : null;
      if (parentClust && parentClust.scopeType === 'local') {
        isLocalVault = true;
      }
    } else if (collectionId) {
      const col = await VaultCollection.findById(collectionId);
      const clust = col ? await VaultCluster.findById(col.clusterId) : null;
      if (clust && clust.scopeType === 'local') {
        isLocalVault = true;
      }
    } else if (clusterId) {
      const clust = await VaultCluster.findById(clusterId);
      if (clust && clust.scopeType === 'local') {
        isLocalVault = true;
      }
    }

    if (isLocalVault && actor.role !== 'admin') {
      throw new Error('Access Denied: Session Token is required for user panel vault operations');
    }
  }


  // Fetch actor's user sets (cast actorId to ObjectId for array query)
  const userSets = await UserSet.find({ members: new mongoose.Types.ObjectId(actorId) });
  const userSetIds = userSets.map(s => s._id.toString());

  // Check general User block (not scoped to a collection)
  const userBlock = await VaultBlockRule.findOne({
    organizationId: actor.organizationId,
    targetType: 'user',
    targetId: actorId.toString(),
    $or: [{ collectionId: null }, { collectionId: { $exists: false } }]
  });
  if (userBlock && actor.role !== 'admin') {
    throw new Error('Access Denied: User is blocked from Vault access');
  }

  // Check general User Set blocks (not scoped to a collection)
  if (userSetIds.length > 0) {
    const userSetBlock = await VaultBlockRule.findOne({
      organizationId: actor.organizationId,
      targetType: 'userSet',
      targetId: { $in: userSetIds },
      $or: [{ collectionId: null }, { collectionId: { $exists: false } }]
    });
    if (userSetBlock && actor.role !== 'admin') {
      throw new Error('Access Denied: User Set is blocked from Vault access');
    }
  }

  // Resolve collection ID if only record ID is provided
  let record = null;
  let collectionIdToCheck = collectionId;

  if (recordId) {
    record = await VaultRecord.findById(recordId);
    if (!record) {
      throw new Error('Access Denied: Record not found');
    }
    if (record.blocked && actor.role !== 'admin') {
      throw new Error('Access Denied: Record is blocked');
    }
    const recordBlock = await VaultBlockRule.findOne({
      organizationId: actor.organizationId,
      targetType: 'record',
      targetId: recordId.toString()
    });
    if (recordBlock && actor.role !== 'admin') {
      throw new Error('Access Denied: Record is blocked');
    }
    if (!collectionIdToCheck) {
      collectionIdToCheck = record.collectionId;
    }
  }

  // Validate collection block & retrieval
  let collection = null;
  if (collectionIdToCheck) {
    collection = await VaultCollection.findById(collectionIdToCheck);
    if (!collection) {
      throw new Error('Access Denied: Collection not found');
    }
    if (collection.blocked && actor.role !== 'admin') {
      throw new Error('Access Denied: Collection is blocked');
    }

    // Check collection-scoped user block
    const scopedUserBlock = await VaultBlockRule.findOne({
      organizationId: actor.organizationId,
      targetType: 'user',
      targetId: actorId.toString(),
      collectionId: collectionIdToCheck.toString()
    });
    if (scopedUserBlock && actor.role !== 'admin') {
      throw new Error('Access Denied: User is blocked from accessing this collection');
    }

    // Check collection-scoped user set blocks
    if (userSetIds.length > 0) {
      const scopedUserSetBlock = await VaultBlockRule.findOne({
        organizationId: actor.organizationId,
        targetType: 'userSet',
        targetId: { $in: userSetIds },
        collectionId: collectionIdToCheck.toString()
      });
      if (scopedUserSetBlock && actor.role !== 'admin') {
        throw new Error('Access Denied: User Set is blocked from accessing this collection');
      }
    }

    const collectionBlock = await VaultBlockRule.findOne({
      organizationId: actor.organizationId,
      targetType: 'collection',
      targetId: collectionIdToCheck.toString()
    });
    if (collectionBlock && actor.role !== 'admin') {
      throw new Error('Access Denied: Collection is blocked');
    }
    collectionId = collectionIdToCheck;
  }

  // Validate cluster block & permissions
  let cluster = null;
  let clusterIdToCheck = clusterId;
  if (collection && !clusterIdToCheck) {
    clusterIdToCheck = collection.clusterId;
  }

  if (clusterIdToCheck) {
    cluster = await VaultCluster.findById(clusterIdToCheck);
    if (!cluster) {
      throw new Error('Access Denied: Cluster not found');
    }
    if (cluster.blocked && actor.role !== 'admin') {
      throw new Error('Access Denied: Vault Cluster is blocked by Admin');
    }

    // Ensure standard user can only access their own local vault
    if (cluster.scopeType === 'local' && cluster.vaultId !== actor.vaultId && actor.role !== 'admin') {
      throw new Error("Access Denied: You cannot access another user's local vault");
    }

    // Check cluster-scoped user block via VaultBlockRule
    const clusterBlock = await VaultBlockRule.findOne({
      organizationId: actor.organizationId,
      targetType: 'cluster',
      targetId: clusterIdToCheck.toString()
    });
    if (clusterBlock && actor.role !== 'admin') {
      throw new Error('Access Denied: Vault Cluster is blocked');
    }

    // Check cluster-level permissions
    const isClusterOwner = cluster.organizationId.toString() === actor.organizationId.toString();
    const clusterAuthorized = checkPermissionsObject(cluster.permissions, actorId, userSetIds, actor.role, isClusterOwner, action);
    if (!clusterAuthorized) {
      throw new Error(`Access Denied: Cluster-level permissions reject [${action}]`);
    }
  }

  // Validate specific field block
  if (fieldName && collectionId) {
    const fieldBlock = await VaultBlockRule.findOne({
      organizationId: actor.organizationId,
      targetType: 'field',
      targetId: fieldName,
      collectionId
    });
    if (fieldBlock && actor.role !== 'admin') {
      throw new Error(`Access Denied: Field [${fieldName}] is blocked`);
    }
  }

  // Validate permissions logic
  if (record) {
    // If the record's vaultId belongs to a local cluster and does not match the actor's, block access for non-admins
    if (record.vaultId !== actor.vaultId && actor.role !== 'admin') {
      const parentCol = await VaultCollection.findById(record.collectionId);
      const parentClust = parentCol ? await VaultCluster.findById(parentCol.clusterId) : null;
      if (parentClust && parentClust.scopeType === 'local') {
        throw new Error("Access Denied: You cannot access another user's local vault record");
      }
    }

    const isOwner = record.ownerId.toString() === actorId.toString();

    // Check if the user has a specific user-level permission override on the parent collection.
    // Parent collection-level user overrides take precedence over record-level permissions.
    let colUserOverride = null;
    if (collection && collection.permissions && collection.permissions.users) {
      colUserOverride = collection.permissions.users.find(u => u.userId.toString() === actorId.toString());
    }

    let authorized = false;
    if (colUserOverride) {
      authorized = colUserOverride.actions.includes(action);
    } else {
      authorized = checkPermissionsObject(record.permissionMetadata, actorId, userSetIds, actor.role, isOwner, action);
      if (!authorized && collection) {
        authorized = checkPermissionsObject(collection.permissions, actorId, userSetIds, actor.role, isOwner, action);
      }
    }

    if (!authorized) {
      throw new Error(`Access Denied: Record-level permissions reject [${action}]`);
    }
  } else if (collection) {
    const isOwner = collection.organizationId.toString() === actor.organizationId.toString(); // Fallback owner context
    const authorized = checkPermissionsObject(collection.permissions, actorId, userSetIds, actor.role, isOwner, action);
    if (!authorized) {
      throw new Error(`Access Denied: Collection-level permissions reject [${action}]`);
    }
  }

  return { actor, collection, record, cluster, userSetIds };
};

// Encryption and Decryption helpers
export const encryptPayload = (payload) => {
  const encrypted = {};
  for (const [key, value] of Object.entries(payload)) {
    encrypted[key] = encryptValue(value !== null && value !== undefined ? String(value) : '');
  }
  return encrypted;
};

export const decryptPayload = (encryptedPayload, blockedFields = []) => {
  const decrypted = {};
  for (const [key, value] of Object.entries(encryptedPayload)) {
    if (blockedFields.includes(key)) {
      continue;
    }
    decrypted[key] = decryptValue(value);
  }
  return decrypted;
};

/* --- Vault APIs --- */

export const createCluster = async (name, description, organizationId, actorId, scopeType, vaultId, permissions = null) => {
  // 1. Determine scopeType if not explicitly passed
  let resolvedScope = scopeType;
  if (!resolvedScope) {
    const isLocalName = name.startsWith('Salary Slips -') || name.startsWith('Local Vault -');
    resolvedScope = isLocalName ? 'local' : 'global';
  }

  // 2. Resolve vaultId
  let resolvedVaultId = vaultId;
  if (!resolvedVaultId) {
    if (resolvedScope === 'local') {
      // Find or create user vault
      let userVault = await Vault.findOne({ userId: actorId });
      if (!userVault) {
        userVault = await createVaultForUser(actorId);
      }
      resolvedVaultId = userVault.vaultId;
    } else {
      // Find or create global system vault (not associated with any user)
      let globalVault = await Vault.findOne({ userId: null });
      if (!globalVault) {
        globalVault = await Vault.create({
          userId: null,
          vaultId: 'VLT-GLOBAL',
          status: 'active'
        });
      }
      resolvedVaultId = globalVault.vaultId;
    }
  }

  const defaultPermissions = permissions || {
    users: [],
    userSets: [],
    roles: [
      { role: 'admin', actions: ['read', 'create', 'update', 'delete'] },
      { role: 'manager', actions: ['read', 'create', 'update'] }
    ],
    ownerActions: ['read', 'create', 'update', 'delete']
  };

  const cluster = await VaultCluster.create({
    name,
    description,
    organizationId,
    createdBy: actorId,
    scopeType: resolvedScope,
    vaultId: resolvedVaultId,
    permissions: defaultPermissions
  });
  return cluster;
};

export const createCollection = async (clusterId, name, permissions, organizationId, actorId) => {
  if (!clusterId) {
    throw new Error('A collection cannot be created without a parent cluster.');
  }
  const clusterExists = await VaultCluster.findById(clusterId);
  if (!clusterExists) {
    throw new Error('A collection cannot be created without a valid existing cluster.');
  }

  // Validate cluster level access
  await validateVaultAccess({ actorId, action: 'create', clusterId });

  const defaultPermissions = permissions || {
    users: [],
    userSets: [],
    roles: [
      { role: 'admin', actions: ['read', 'create', 'update', 'delete'] },
      { role: 'manager', actions: ['read', 'create', 'update'] }
    ],
    ownerActions: ['read', 'create', 'update', 'delete']
  };

  const collection = await VaultCollection.create({
    name,
    clusterId,
    organizationId,
    permissions: defaultPermissions
  });
  return collection;
};

export const deleteCollection = async (collectionId, actorId) => {
  await validateVaultAccess({ actorId, action: 'delete', collectionId });
  const collection = await VaultCollection.findByIdAndDelete(collectionId);
  // Also delete all records under this collection
  await VaultRecord.deleteMany({ collectionId });
  return collection;
};

export const insertRecord = async (collectionId, payload, permissions, actorId, sessionToken = '', ip = '', ua = '') => {
  if (!collectionId) {
    throw new Error('A record cannot be created without a parent collection.');
  }
  const collectionExists = await VaultCollection.findById(collectionId);
  if (!collectionExists) {
    throw new Error('A record cannot be created without a valid existing collection.');
  }

  let result = 'success';
  let recordId = null;
  let vaultId = '';

  try {
    const { actor, collection } = await validateVaultAccess({ actorId, sessionToken, action: 'create', collectionId });
    
    vaultId = actor.vaultId;
    const cluster = await VaultCluster.findById(collection.clusterId);
    if (cluster && cluster.scopeType === 'global') {
      vaultId = cluster.vaultId || 'VLT-GLOBAL';
    }

    const encryptedData = JSON.stringify(encryptPayload(payload));

    const defaultPerms = permissions || collection.permissions;

    const record = await VaultRecord.create({
      collectionId,
      vaultId,
      ownerId: actorId,
      encryptedData,
      encryptionMetadata: { algorithm: 'aes-256-cbc', iv: 'aes-256-cbc' }, // IV is part of formatting in encryptValue
      permissionMetadata: defaultPerms,
      auditMetadata: { createdBy: actorId, updatedBy: actorId }
    });

    recordId = record._id;

    await logVaultOperation({
      userId: actorId,
      action: 'VAULT_RECORD_INSERT',
      sessionToken,
      ipAddress: ip,
      userAgent: ua,
      vaultId,
      collectionId,
      recordId,
      result,
      details: { payloadKeys: Object.keys(payload) }
    });

    return record;
  } catch (err) {
    result = err.message.includes('Access Denied') ? 'access_denied' : 'error';
    await logVaultOperation({
      userId: actorId,
      action: 'VAULT_RECORD_INSERT_FAILED',
      sessionToken,
      ipAddress: ip,
      userAgent: ua,
      vaultId,
      collectionId,
      result,
      details: { error: err.message }
    });
    throw err;
  }
};

export const updateRecord = async (recordId, payload, actorId, sessionToken = '', ip = '', ua = '') => {
  let result = 'success';
  let vaultId = '';
  let collectionId = null;

  try {
    const { actor, record } = await validateVaultAccess({ actorId, sessionToken, action: 'update', recordId });
    vaultId = actor.vaultId;
    collectionId = record.collectionId;

    // Decrypt old payload to merge updates
    const oldEncrypted = JSON.parse(record.encryptedData);
    const decryptedOld = decryptPayload(oldEncrypted);
    const merged = { ...decryptedOld, ...payload };

    const encryptedData = JSON.stringify(encryptPayload(merged));

    record.encryptedData = encryptedData;
    record.auditMetadata.updatedBy = actorId;
    await record.save();

    await logVaultOperation({
      userId: actorId,
      action: 'VAULT_RECORD_UPDATE',
      sessionToken,
      ipAddress: ip,
      userAgent: ua,
      vaultId,
      collectionId,
      recordId,
      result,
      details: { updatedKeys: Object.keys(payload) }
    });

    return record;
  } catch (err) {
    result = err.message.includes('Access Denied') ? 'access_denied' : 'error';
    await logVaultOperation({
      userId: actorId,
      action: 'VAULT_RECORD_UPDATE_FAILED',
      sessionToken,
      ipAddress: ip,
      userAgent: ua,
      vaultId,
      recordId,
      result,
      details: { error: err.message }
    });
    throw err;
  }
};

export const deleteRecord = async (recordId, actorId, sessionToken = '', ip = '', ua = '') => {
  let result = 'success';
  let vaultId = '';
  let collectionId = null;

  try {
    const { actor, record } = await validateVaultAccess({ actorId, sessionToken, action: 'delete', recordId });
    vaultId = actor.vaultId;
    collectionId = record.collectionId;

    await VaultRecord.findByIdAndDelete(recordId);

    await logVaultOperation({
      userId: actorId,
      action: 'VAULT_RECORD_DELETE',
      sessionToken,
      ipAddress: ip,
      userAgent: ua,
      vaultId,
      collectionId,
      recordId,
      result
    });

    return { success: true };
  } catch (err) {
    result = err.message.includes('Access Denied') ? 'access_denied' : 'error';
    await logVaultOperation({
      userId: actorId,
      action: 'VAULT_RECORD_DELETE_FAILED',
      sessionToken,
      ipAddress: ip,
      userAgent: ua,
      vaultId,
      recordId,
      result,
      details: { error: err.message }
    });
    throw err;
  }
};

export const findRecord = async (recordId, actorId, sessionToken = '', ip = '', ua = '') => {
  let result = 'success';
  let vaultId = '';
  let collectionId = null;

  try {
    const { actor, record } = await validateVaultAccess({ actorId, sessionToken, action: 'read', recordId });
    vaultId = actor.vaultId;
    collectionId = record.collectionId;

    // Fetch field blocks for this collection/organization
    const fieldBlocks = await VaultBlockRule.find({
      organizationId: actor.organizationId,
      targetType: 'field',
      collectionId
    });
    const blockedFields = fieldBlocks.map(f => f.targetId);

    const encryptedData = JSON.parse(record.encryptedData);
    const decrypted = decryptPayload(encryptedData, blockedFields);

    await logVaultOperation({
      userId: actorId,
      action: 'VAULT_RECORD_READ',
      sessionToken,
      ipAddress: ip,
      userAgent: ua,
      vaultId,
      collectionId,
      recordId,
      result
    });

    // Return decrypted payload with metadata
    return {
      _id: record._id,
      collectionId: record.collectionId,
      vaultId: record.vaultId,
      ownerId: record.ownerId,
      data: decrypted,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  } catch (err) {
    result = err.message.includes('Access Denied') ? 'access_denied' : 'error';
    await logVaultOperation({
      userId: actorId,
      action: 'VAULT_RECORD_READ_FAILED',
      sessionToken,
      ipAddress: ip,
      userAgent: ua,
      vaultId,
      recordId,
      result,
      details: { error: err.message }
    });
    throw err;
  }
};

export const findMany = async (collectionId, query = {}, actorId, sessionToken = '', ip = '', ua = '') => {
  let result = 'success';
  let vaultId = '';

  try {
    const { actor, collection } = await validateVaultAccess({ actorId, sessionToken, action: 'read', collectionId });
    vaultId = actor.vaultId;

    // Fetch field blocks
    const fieldBlocks = await VaultBlockRule.find({
      organizationId: actor.organizationId,
      targetType: 'field',
      collectionId
    });
    const blockedFields = fieldBlocks.map(f => f.targetId);

    // Apply vaultId scoping based on parent cluster scope
    const cluster = collection ? await VaultCluster.findById(collection.clusterId) : null;
    const additionalQuery = {};
    if (cluster && cluster.scopeType === 'local') {
      additionalQuery.vaultId = actor.vaultId;
    } else if (cluster && cluster.scopeType === 'global') {
      additionalQuery.vaultId = cluster.vaultId || 'VLT-GLOBAL';
    }

    // Find records in collection
    const records = await VaultRecord.find({ collectionId, ...query, ...additionalQuery });
    const decryptedRecords = [];

    for (const record of records) {
      try {
        // Validate record specific overrides/blocks
        await validateVaultAccess({ actorId, sessionToken, action: 'read', recordId: record._id });
        const encryptedData = JSON.parse(record.encryptedData);
        const decrypted = decryptPayload(encryptedData, blockedFields);
        decryptedRecords.push({
          _id: record._id,
          collectionId: record.collectionId,
          vaultId: record.vaultId,
          ownerId: record.ownerId,
          data: decrypted,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt
        });
      } catch (skipErr) {
        // If a specific record block or permission reject occurs, skip or omit it
        continue;
      }
    }

    await logVaultOperation({
      userId: actorId,
      action: 'VAULT_COLLECTION_READ_MANY',
      sessionToken,
      ipAddress: ip,
      userAgent: ua,
      vaultId,
      collectionId,
      result,
      details: { count: decryptedRecords.length }
    });

    return decryptedRecords;
  } catch (err) {
    result = err.message.includes('Access Denied') ? 'access_denied' : 'error';
    await logVaultOperation({
      userId: actorId,
      action: 'VAULT_COLLECTION_READ_MANY_FAILED',
      sessionToken,
      ipAddress: ip,
      userAgent: ua,
      vaultId,
      collectionId,
      result,
      details: { error: err.message }
    });
    throw err;
  }
};

export const count = async (collectionId, query = {}, actorId, sessionToken = '', ip = '', ua = '') => {
  try {
    const { actor, collection } = await validateVaultAccess({ actorId, action: 'read', collectionId });
    const cluster = collection ? await VaultCluster.findById(collection.clusterId) : null;
    const additionalQuery = {};
    if (cluster && cluster.scopeType === 'local') {
      additionalQuery.vaultId = actor.vaultId;
    } else if (cluster && cluster.scopeType === 'global') {
      additionalQuery.vaultId = cluster.vaultId || 'VLT-GLOBAL';
    }
    const total = await VaultRecord.countDocuments({ collectionId, ...query, ...additionalQuery });
    return total;
  } catch (err) {
    throw err;
  }
};

/* --- User Sets --- */

export const createUserSet = async (name, members = [], organizationId, actorId) => {
  const userSet = await UserSet.create({
    name,
    organizationId,
    members
  });
  return userSet;
};

export const renameUserSet = async (userSetId, newName, actorId) => {
  const userSet = await UserSet.findByIdAndUpdate(
    userSetId,
    { name: newName },
    { new: true }
  );
  return userSet;
};

export const deleteUserSet = async (userSetId, actorId) => {
  const userSet = await UserSet.findByIdAndDelete(userSetId);
  return userSet;
};

export const addUserToSet = async (userSetId, userId, actorId) => {
  const userSet = await UserSet.findById(userSetId);
  if (!userSet) throw new Error('User Set not found');

  if (!userSet.members.includes(userId)) {
    userSet.members.push(userId);
    await userSet.save();
  }
  return userSet;
};

export const removeUserFromSet = async (userSetId, userId, actorId) => {
  const userSet = await UserSet.findById(userSetId);
  if (!userSet) throw new Error('User Set not found');

  userSet.members = userSet.members.filter(m => m.toString() !== userId.toString());
  await userSet.save();
  return userSet;
};

/* --- Permissions & Granting --- */

export const grantPermission = async (resourceType, resourceId, granteeType, granteeId, actions, actorId) => {
  if (resourceType === 'record') {
    throw new Error('Record-level permissions cannot be configured. Admin can only configure permissions at the collection or cluster level.');
  }

  if (resourceType === 'collection') {
    const collection = await VaultCollection.findById(resourceId);
    if (!collection) throw new Error('Collection not found');

    if (granteeType === 'user') {
      const existing = collection.permissions.users.find(u => u.userId.toString() === granteeId.toString());
      if (existing) {
        existing.actions = Array.from(new Set([...existing.actions, ...actions]));
      } else {
        collection.permissions.users.push({ userId: granteeId, actions });
      }
    } else if (granteeType === 'userSet') {
      const existing = collection.permissions.userSets.find(us => us.userSetId.toString() === granteeId.toString());
      if (existing) {
        existing.actions = Array.from(new Set([...existing.actions, ...actions]));
      } else {
        collection.permissions.userSets.push({ userSetId: granteeId, actions });
      }
    } else if (granteeType === 'role') {
      const existing = collection.permissions.roles.find(r => r.role === granteeId);
      if (existing) {
        existing.actions = Array.from(new Set([...existing.actions, ...actions]));
      } else {
        collection.permissions.roles.push({ role: granteeId, actions });
      }
    }
    await collection.save();
    return collection;
  }

  if (resourceType === 'cluster') {
    const cluster = await VaultCluster.findById(resourceId);
    if (!cluster) throw new Error('Cluster not found');

    if (granteeType === 'user') {
      const existing = cluster.permissions.users.find(u => u.userId.toString() === granteeId.toString());
      if (existing) {
        existing.actions = Array.from(new Set([...existing.actions, ...actions]));
      } else {
        cluster.permissions.users.push({ userId: granteeId, actions });
      }
    } else if (granteeType === 'userSet') {
      const existing = cluster.permissions.userSets.find(us => us.userSetId.toString() === granteeId.toString());
      if (existing) {
        existing.actions = Array.from(new Set([...existing.actions, ...actions]));
      } else {
        cluster.permissions.userSets.push({ userSetId: granteeId, actions });
      }
    } else if (granteeType === 'role') {
      const existing = cluster.permissions.roles.find(r => r.role === granteeId);
      if (existing) {
        existing.actions = Array.from(new Set([...existing.actions, ...actions]));
      } else {
        cluster.permissions.roles.push({ role: granteeId, actions });
      }
    }
    await cluster.save();
    return cluster;
  }

  throw new Error('Invalid resource type');
};

export const revokePermission = async (resourceType, resourceId, granteeType, granteeId, actions, actorId) => {
  if (resourceType === 'record') {
    throw new Error('Record-level permissions cannot be configured. Admin can only configure permissions at the collection or cluster level.');
  }

  if (resourceType === 'collection') {
    const collection = await VaultCollection.findById(resourceId);
    if (!collection) throw new Error('Collection not found');

    if (granteeType === 'user') {
      let existing = collection.permissions.users.find(u => u.userId.toString() === granteeId.toString());
      if (!existing) {
        const parentCluster = await VaultCluster.findById(collection.clusterId);
        if (parentCluster && parentCluster.scopeType === 'local' && parentCluster.vaultId) {
          const vault = await Vault.findOne({ vaultId: parentCluster.vaultId });
          if (vault && vault.userId.toString() === granteeId.toString()) {
            existing = { userId: granteeId, actions: ['read', 'create', 'update', 'delete'] };
            collection.permissions.users.push(existing);
          }
        }
      }
      if (existing) {
        existing.actions = existing.actions.filter(a => !actions.includes(a));
        if (existing.actions.length === 0) {
          collection.permissions.users = collection.permissions.users.filter(u => u.userId.toString() !== granteeId.toString());
        }
      }
    } else if (granteeType === 'userSet') {
      const existing = collection.permissions.userSets.find(us => us.userSetId.toString() === granteeId.toString());
      if (existing) {
        existing.actions = existing.actions.filter(a => !actions.includes(a));
        if (existing.actions.length === 0) {
          collection.permissions.userSets = collection.permissions.userSets.filter(us => us.userSetId.toString() !== granteeId.toString());
        }
      }
    } else if (granteeType === 'role') {
      const existing = collection.permissions.roles.find(r => r.role === granteeId);
      if (existing) {
        existing.actions = existing.actions.filter(a => !actions.includes(a));
        if (existing.actions.length === 0) {
          collection.permissions.roles = collection.permissions.roles.filter(r => r.role !== granteeId);
        }
      }
    }
    await collection.save();
    return collection;
  }

  if (resourceType === 'cluster') {
    const cluster = await VaultCluster.findById(resourceId);
    if (!cluster) throw new Error('Cluster not found');

    if (granteeType === 'user') {
      let existing = cluster.permissions.users.find(u => u.userId.toString() === granteeId.toString());
      if (!existing) {
        if (cluster.scopeType === 'local' && cluster.vaultId) {
          const vault = await Vault.findOne({ vaultId: cluster.vaultId });
          if (vault && vault.userId.toString() === granteeId.toString()) {
            existing = { userId: granteeId, actions: ['read', 'create', 'update', 'delete'] };
            cluster.permissions.users.push(existing);
          }
        }
      }
      if (existing) {
        existing.actions = existing.actions.filter(a => !actions.includes(a));
        if (existing.actions.length === 0) {
          cluster.permissions.users = cluster.permissions.users.filter(u => u.userId.toString() !== granteeId.toString());
        }
      }
    } else if (granteeType === 'userSet') {
      const existing = cluster.permissions.userSets.find(us => us.userSetId.toString() === granteeId.toString());
      if (existing) {
        existing.actions = existing.actions.filter(a => !actions.includes(a));
        if (existing.actions.length === 0) {
          cluster.permissions.userSets = cluster.permissions.userSets.filter(us => us.userSetId.toString() !== granteeId.toString());
        }
      }
    } else if (granteeType === 'role') {
      const existing = cluster.permissions.roles.find(r => r.role === granteeId);
      if (existing) {
        existing.actions = existing.actions.filter(a => !actions.includes(a));
        if (existing.actions.length === 0) {
          cluster.permissions.roles = cluster.permissions.roles.filter(r => r.role !== granteeId);
        }
      }
    }
    await cluster.save();
    return cluster;
  }

  throw new Error('Invalid resource type');
};

/* --- Resource Blocking --- */

export const blockResource = async (targetType, targetId, collectionId = null, actorId) => {
  const actor = await User.findById(actorId);
  const block = await VaultBlockRule.create({
    organizationId: actor.organizationId,
    targetType,
    targetId,
    collectionId,
    blockedBy: actorId
  });
  return block;
};

export const unblockResource = async (targetType, targetId, collectionId = null, actorId) => {
  const query = { targetType, targetId };
  if (collectionId) {
    query.collectionId = collectionId;
  }
  const result = await VaultBlockRule.deleteOne(query);
  return result;
};

/* --- Export --- */

export const exportCollection = async (collectionId, actorId, sessionToken = '', ip = '', ua = '') => {
  let result = 'success';
  let vaultId = '';

  try {
    const { actor } = await validateVaultAccess({ actorId, sessionToken, action: 'export', collectionId });
    vaultId = actor.vaultId;

    // Find and decrypt all records
    const records = await VaultRecord.find({ collectionId });
    const exportedData = [];

    // Fetch field blocks
    const fieldBlocks = await VaultBlockRule.find({
      organizationId: actor.organizationId,
      targetType: 'field',
      collectionId
    });
    const blockedFields = fieldBlocks.map(f => f.targetId);

    for (const record of records) {
      try {
        await validateVaultAccess({ actorId, sessionToken, action: 'export', recordId: record._id });
        const encryptedData = JSON.parse(record.encryptedData);
        const decrypted = decryptPayload(encryptedData, blockedFields);
        exportedData.push({
          recordId: record._id,
          ownerId: record.ownerId,
          data: decrypted,
          createdAt: record.createdAt
        });
      } catch (skipErr) {
        continue;
      }
    }

    await logVaultOperation({
      userId: actorId,
      action: 'VAULT_COLLECTION_EXPORT',
      sessionToken,
      ipAddress: ip,
      userAgent: ua,
      vaultId,
      collectionId,
      result,
      details: { exportCount: exportedData.length }
    });

    return exportedData;
  } catch (err) {
    result = err.message.includes('Access Denied') ? 'access_denied' : 'error';
    await logVaultOperation({
      userId: actorId,
      action: 'VAULT_COLLECTION_EXPORT_FAILED',
      sessionToken,
      ipAddress: ip,
      userAgent: ua,
      vaultId,
      collectionId,
      result,
      details: { error: err.message }
    });
    throw err;
  }
};

/* --- Audit Query --- */

export const audit = async (query = {}, actorId) => {
  const actor = await User.findById(actorId);
  if (!actor || !['admin', 'manager'].includes(actor.role)) {
    throw new Error('Access Denied: Only administrators can query audit logs');
  }
  // Return recent audit logs
  return await AuditLog.find(query).sort({ createdAt: -1 }).limit(100);
};
