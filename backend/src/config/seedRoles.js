import mongoose from 'mongoose';
import Role from '../models/Role.js';
import Organization from '../models/Organization.js';
import VaultCluster from '../models/VaultCluster.js';
import VaultCollection from '../models/VaultCollection.js';
import User from '../models/User.js';
import Vault from '../models/Vault.js';

export const seedRoles = async () => {
  try {
    // Delete legacy/unwanted roles
    await Role.deleteMany({ name: { $in: ['student', 'instructor'] } });

    const defaultRoles = [
      {
        name: 'admin',
        description: 'Administrator role with full access',
        isSystem: true,
        permissions: [
          { resource: 'vault', access: 'allow' }
        ]
      },
      {
        name: 'manager',
        description: 'Manager role with restricted configuration access',
        isSystem: true,
        permissions: [
          { resource: 'vault', access: 'deny' }
        ]
      },
      {
        name: 'user',
        description: 'Standard member account with access to secure storage',
        isSystem: true,
        permissions: [
          { resource: 'vault', access: 'deny' }
        ]
      }
    ];

    for (const r of defaultRoles) {
      const exists = await Role.findOne({ name: r.name });
      if (!exists) {
        await Role.create(r);
        console.log(`[SEED] Created default role "${r.name}"`);
      } else {
        exists.description = r.description;
        // Do not overwrite existing permissions to preserve admin changes
        if (!exists.permissions || exists.permissions.length === 0) {
          exists.permissions = r.permissions;
        }
        exists.isSystem = true;
        await exists.save();
      }
    }
    console.log('[SEED] System roles ("admin", "manager", "user") updated/seeded.');

    // Seed default Global System Cluster
    const org = await Organization.findOne();
    if (org) {
      // Find the first admin or user to use as createdBy, or generate a fallback
      let adminUser = await User.findOne({ role: 'admin' });
      if (!adminUser) {
        adminUser = await User.findOne();
      }
      const creatorId = adminUser ? adminUser._id : new mongoose.Types.ObjectId();

      let cluster = await VaultCluster.findOne({ name: 'Global System', organizationId: org._id });
      if (!cluster) {
        let globalVault = await Vault.findOne({ userId: null });
        if (!globalVault) {
          globalVault = await Vault.create({
            userId: null,
            vaultId: 'VLT-GLOBAL',
            status: 'active'
          });
        }

        cluster = await VaultCluster.create({
          name: 'Global System',
          description: 'System-wide cluster for global configuration and variables',
          organizationId: org._id,
          createdBy: creatorId,
          scopeType: 'global',
          vaultId: globalVault.vaultId
        });
        console.log('[SEED] Created "Global System" Vault Cluster');
      }

    }
  } catch (error) {
    console.error('[SEED ERROR] Failed to seed default roles:', error.stack || error.message);
  }
};

