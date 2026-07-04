import express from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import User from '../models/User.js';
import Organization from '../models/Organization.js';
import Application from '../models/Application.js';
import ApiKey from '../models/ApiKey.js';
import { createVaultForUser } from '../services/vaultService.js';

const router = express.Router();

// GET /api/v1/setup/check
// Check if initial admin exists
router.get('/check', async (req, res, next) => {
  try {
    const adminCount = await User.countDocuments({ role: 'admin' });
    const setupRequired = adminCount === 0;
    if (setupRequired) {
      // Enforce "no admin no org": clear all orgs, users, sessions, vaults and logs
      const db = mongoose.connection.db;
      if (db) {
        await db.collection('organizations').deleteMany({});
        await db.collection('users').deleteMany({});
        await db.collection('vaults').deleteMany({});
        await db.collection('sessions').deleteMany({});
        await db.collection('auditlogs').deleteMany({});
        await db.collection('aievents').deleteMany({});
      }
      console.log('[SETUP] Enforced "no admin no org" database reset.');
    }
    res.json({ setupRequired });
  } catch (error) {
    next(error);
  }
});

// POST /api/v1/setup/wizard
// Execute initial setup
router.post('/wizard', async (req, res, next) => {
  try {
    // Check if setup was already done
    const adminCount = await User.countDocuments({ role: 'admin' });
    if (adminCount > 0) {
      return res.status(400).json({ error: 'Setup already completed.' });
    }

    // Clean up any stale data to enforce clean database reset on wizard execute
    const db = mongoose.connection.db;
    if (db) {
      await db.collection('organizations').deleteMany({});
      await db.collection('users').deleteMany({});
      await db.collection('vaults').deleteMany({});
      await db.collection('sessions').deleteMany({});
      await db.collection('auditlogs').deleteMany({});
      await db.collection('aievents').deleteMany({});
    }

    const {
      adminName,
      adminEmail,
      adminPassword,
      orgName,
      orgLogoUrl,
      primaryStart,
      primaryEnd,
      secondaryStart,
      secondaryEnd,
      accent
    } = req.body;

    if (!adminName || !adminEmail || !adminPassword || !orgName) {
      return res.status(400).json({ error: 'Admin Name, Email, Password and Organization Name are required.' });
    }

    // ── Strong Password Enforcement ──────────────────────────────────────────
    // Admin password must be strong — this is the most privileged account
    const passwordErrors = [];
    if (adminPassword.length < 12)            passwordErrors.push('at least 12 characters');
    if (!/[A-Z]/.test(adminPassword))         passwordErrors.push('one uppercase letter');
    if (!/[a-z]/.test(adminPassword))         passwordErrors.push('one lowercase letter');
    if (!/[0-9]/.test(adminPassword))         passwordErrors.push('one number');
    if (!/[^A-Za-z0-9]/.test(adminPassword))  passwordErrors.push('one special character (!@#$%^&* etc.)');

    if (passwordErrors.length > 0) {
      return res.status(400).json({
        error: `Admin password is too weak. It must contain: ${passwordErrors.join(', ')}.`
      });
    }


    // Create Organization
    const organization = await Organization.create({
      name: orgName,
      logoUrl: orgLogoUrl || '',
      primaryGradientStart: primaryStart || '#7C3AED',
      primaryGradientEnd: primaryEnd || '#A855F7',
      secondaryGradientStart: secondaryStart || '#9333EA',
      secondaryGradientEnd: secondaryEnd || '#C084FC',
      accentColor: accent || '#8B5CF6'
    });

    // Create Admin User
    const nameParts = adminName.trim().split(/\s+/);
    const firstName = nameParts[0] || 'Admin';
    const lastName = nameParts.slice(1).join(' ') || 'User';

    const admin = await User.create({
      organizationId: organization._id,
      firstName,
      lastName,
      email: adminEmail,
      mobile: '+10000000000', // System default placeholder mobile for admin account
      passwordHash: adminPassword, // Will be hashed via User pre-save hook
      role: 'admin',
      emailVerified: true,
      mobileVerified: true,
      status: 'active'
    });

    // Auto-create vault if needed (optional but good practice)
    try {
      await createVaultForUser(admin._id);
    } catch (vaultErr) {
      console.error('[SETUP WIZARD] Failed to create initial admin vault:', vaultErr.message);
    }

    // Create Default Developer Application Entity
    const defaultApp = await Application.create({
      name: 'Default Operational Application',
      organizationId: organization._id
    });

    // Generate Starting API Key Pair for SDK Integration
    const apiKey = `masc_apk_${crypto.randomBytes(16).toString('hex')}`;
    const apiSecret = `masc_sec_${crypto.randomBytes(32).toString('hex')}`;

    const defaultApiKey = await ApiKey.create({
      apiKey,
      apiSecret,
      applicationId: defaultApp._id,
      organizationId: organization._id,
      status: 'active'
    });

    res.status(201).json({
      success: true,
      message: 'Setup completed successfully!',
      organization: {
        id: organization._id,
        name: organization.name,
        primaryGradientStart: organization.primaryGradientStart,
        primaryGradientEnd: organization.primaryGradientEnd
      },
      defaultCredentials: {
        applicationId: defaultApp._id,
        applicationName: defaultApp.name,
        apiKey: defaultApiKey.apiKey,
        apiSecret: apiSecret,
        tenantId: organization._id
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;
