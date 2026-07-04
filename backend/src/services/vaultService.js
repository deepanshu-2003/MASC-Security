import crypto from 'crypto';
import Vault from '../models/Vault.js';
import User from '../models/User.js';
import VaultCluster from '../models/VaultCluster.js';
import VaultCollection from '../models/VaultCollection.js';
import VaultRecord from '../models/VaultRecord.js';

/**
 * Creates a new Vault for a user, generates a unique vaultId,
 * saves it, and attaches the vaultId to the user.
 * @param {string} userId - Mongoose User ID
 * @returns {Promise<Object>} The created Vault document
 */
export const createVaultForUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Check if vault already exists
  let vault = await Vault.findOne({ userId });
  if (vault) {
    // If user's vaultId is empty, sync it
    if (!user.vaultId) {
      user.vaultId = vault.vaultId;
      await user.save();
    }
    return vault;
  }

  // Generate unique vault ID
  let vaultId = '';
  let isUnique = false;
  while (!isUnique) {
    const hex = crypto.randomBytes(3).toString('hex').toUpperCase();
    vaultId = `VLT-${hex}`;
    const existing = await Vault.findOne({ vaultId });
    if (!existing) {
      isUnique = true;
    }
  }

  // Create vault
  vault = await Vault.create({
    userId,
    vaultId,
    status: 'active'
  });

  // Attach vaultId to user
  user.vaultId = vaultId;
  await user.save();

  return vault;
};

/**
 * Retrieves the Vault document for a given user.
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>} The Vault document or null
 */
export const getVaultByUserId = async (userId) => {
  return await Vault.findOne({ userId });
};

/**
 * Updates a specific section or property of a user's vault.
 * @param {string} userId - User ID
 * @param {string} section - Section name (e.g. 'items', 'profile', 'courses')
 * @param {any} data - New content for that section
 * @returns {Promise<Object>} Updated Vault document
 */
export const updateVaultSection = async (userId, section, data) => {
  const vault = await Vault.findOne({ userId });
  if (!vault) {
    throw new Error('Vault not found for this user');
  }

  // Set the data for the section
  // If it's a Map type or custom object, we update accordingly
  if (section === 'items') {
    vault.items = data;
  } else {
    vault.set(section, data);
  }

  await vault.save();
  return vault;
};

/**
 * Resets a user's vault back to standard system defaults.
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Reset Vault document
 */
export const resetVault = async (userId) => {
  const vault = await Vault.findOne({ userId });
  if (!vault) {
    throw new Error('Vault not found');
  }

  // Clear sections and restore standard items & default permissions
  vault.profile = new Map();
  vault.userLogs = [];
  // Clean up user's dynamic local salary slips cluster, collection, and records
  const user = await User.findById(userId);
  if (user) {
    const clusterName = `Salary Slips - ${user.firstName} ${user.lastName}`;
    const cluster = await VaultCluster.findOne({ createdBy: userId, name: clusterName });
    if (cluster) {
      const collections = await VaultCollection.find({ clusterId: cluster._id });
      for (const col of collections) {
        await VaultRecord.deleteMany({ collectionId: col._id });
      }
      await VaultCollection.deleteMany({ clusterId: cluster._id });
      await VaultCluster.findByIdAndDelete(cluster._id);
    }
  }

  vault.permissions = {
    vault: { view: true, create: true, update: true, delete: true, export: true },
    salarySlips: { view: true, create: true, update: true, delete: true, export: true }
  };

  await vault.save();
  return vault;
};

/**
 * Scan all registered users. For any users missing a Vault,
 * generate a Vault and attach the vaultId.
 * @returns {Promise<number>} Count of repaired vaults
 */
export const repairVaults = async () => {
  const users = await User.find();
  let count = 0;

  for (const user of users) {
    const vaultExists = await Vault.findOne({ userId: user._id });
    if (!vaultExists || !user.vaultId) {
      await createVaultForUser(user._id);
      count++;
    }
  }

  return count;
};
