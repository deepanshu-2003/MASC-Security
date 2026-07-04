import express from 'express';
import Organization from '../models/Organization.js';
import User from '../models/User.js';
import Session from '../models/Session.js';
import AiEvent from '../models/AiEvent.js';
import { protectAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// GET /api/v1/admin/dashboard-stats
// Returns count of active users, active sessions, and pending risk events
router.get('/admin/dashboard-stats', protectAdmin, async (req, res, next) => {
  try {
    const activeUsersCount = await User.countDocuments({ status: 'active' });
    const activeSessionsCount = await Session.countDocuments({ status: 'active', expiresAt: { $gt: new Date() } });
    const riskEventsCount = await AiEvent.countDocuments({ status: 'pending' });

    res.json({
      activeUsersCount,
      activeSessionsCount,
      riskEventsCount
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/v1/admin/branding
// Public route - allows login page/dashboard to apply white labeling before authenticating
router.get('/branding', async (req, res, next) => {
  try {
    let organization = await Organization.findOne();
    if (!organization) {
      // Return default branding configurations if none exists in DB
      return res.json({
        name: 'MASC Security',
        logoUrl: '',
        theme: 'light',
        primaryGradientStart: '#7C3AED',
        primaryGradientEnd: '#A855F7',
        secondaryGradientStart: '#9333EA',
        secondaryGradientEnd: '#C084FC',
        accentColor: '#8B5CF6',
        typography: 'Outfit',
        vaultMode: false,
        maxVerificationAttempts: 3,
        lowRiskPolicy: 'allow',
        mediumRiskPolicy: 'allow',
        highRiskPolicy: 'block',
        verifySessionOnEachRequest: false,
        requirePhysicalLocation: false,
        recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || ''
      });
    }
    const orgObj = organization.toObject();
    orgObj.recaptchaSiteKey = process.env.RECAPTCHA_SITE_KEY || '';
    res.json(orgObj);
  } catch (error) {
    next(error);
  }
});

// PUT /api/v1/admin/branding
// Protected route - only authenticated admins can alter branding setup
router.put('/branding', protectAdmin, async (req, res, next) => {
  try {
    const {
      name,
      logoUrl,
      theme,
      primaryGradientStart,
      primaryGradientEnd,
      secondaryGradientStart,
      secondaryGradientEnd,
      accentColor,
      typography,
      vaultMode,
      maxVerificationAttempts,
      lowRiskPolicy,
      mediumRiskPolicy,
      highRiskPolicy,
      verifySessionOnEachRequest,
      allowConcurrentSessions,
      requirePhysicalLocation,
      sessionTimeoutHours,
      managerPermissions
    } = req.body;

    let organization = await Organization.findOne();

    if (!organization) {
      // Create new one if somehow doesn't exist
      organization = new Organization({});
    }

    if (name !== undefined) organization.name = name;
    if (logoUrl !== undefined) organization.logoUrl = logoUrl;
    if (theme !== undefined) organization.theme = theme;
    if (primaryGradientStart !== undefined) organization.primaryGradientStart = primaryGradientStart;
    if (primaryGradientEnd !== undefined) organization.primaryGradientEnd = primaryGradientEnd;
    if (secondaryGradientStart !== undefined) organization.secondaryGradientStart = secondaryGradientStart;
    if (secondaryGradientEnd !== undefined) organization.secondaryGradientEnd = secondaryGradientEnd;
    if (accentColor !== undefined) organization.accentColor = accentColor;
    if (typography !== undefined) organization.typography = typography;
    if (vaultMode !== undefined) organization.vaultMode = vaultMode;
    if (maxVerificationAttempts !== undefined) organization.maxVerificationAttempts = Number(maxVerificationAttempts);
    if (lowRiskPolicy !== undefined) organization.lowRiskPolicy = lowRiskPolicy;
    if (mediumRiskPolicy !== undefined) organization.mediumRiskPolicy = mediumRiskPolicy;
    if (highRiskPolicy !== undefined) organization.highRiskPolicy = highRiskPolicy;
    if (verifySessionOnEachRequest !== undefined) organization.verifySessionOnEachRequest = !!verifySessionOnEachRequest;
    if (allowConcurrentSessions !== undefined) organization.allowConcurrentSessions = !!allowConcurrentSessions;
    if (requirePhysicalLocation !== undefined) organization.requirePhysicalLocation = !!requirePhysicalLocation;
    if (sessionTimeoutHours !== undefined) {
      const parsed = Number(sessionTimeoutHours);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 720) {
        organization.sessionTimeoutHours = parsed;
      }
    }
    if (managerPermissions !== undefined && typeof managerPermissions === 'object') {
      if (managerPermissions.canEditUsers !== undefined) organization.managerPermissions.canEditUsers = !!managerPermissions.canEditUsers;
      if (managerPermissions.canSuspendUsers !== undefined) organization.managerPermissions.canSuspendUsers = !!managerPermissions.canSuspendUsers;
      if (managerPermissions.canViewUserLogs !== undefined) organization.managerPermissions.canViewUserLogs = !!managerPermissions.canViewUserLogs;
      if (managerPermissions.canAccessVaultGovernance !== undefined) organization.managerPermissions.canAccessVaultGovernance = !!managerPermissions.canAccessVaultGovernance;
      if (managerPermissions.canAccessRouteRules !== undefined) organization.managerPermissions.canAccessRouteRules = !!managerPermissions.canAccessRouteRules;
      if (managerPermissions.canAccessBranding !== undefined) organization.managerPermissions.canAccessBranding = !!managerPermissions.canAccessBranding;
    }

    await organization.save();
    res.json(organization);
  } catch (error) {
    next(error);
  }
});

export default router;
