import mongoose from 'mongoose';

const organizationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    logoUrl: {
      type: String,
      default: ''
    },
    theme: {
      type: String,
      enum: ['light', 'dark'],
      default: 'light'
    },
    primaryGradientStart: {
      type: String,
      default: '#7C3AED'
    },
    primaryGradientEnd: {
      type: String,
      default: '#A855F7'
    },
    secondaryGradientStart: {
      type: String,
      default: '#9333EA'
    },
    secondaryGradientEnd: {
      type: String,
      default: '#C084FC'
    },
    accentColor: {
      type: String,
      default: '#8B5CF6'
    },
    typography: {
      type: String,
      default: 'Outfit'
    },
    vaultMode: {
      type: Boolean,
      default: false
    },
    maxVerificationAttempts: {
      type: Number,
      default: 3
    },
    lowRiskPolicy: {
      type: String,
      enum: ['allow', 'otp', 'email', 'both', 'block'],
      default: 'allow'
    },
    mediumRiskPolicy: {
      type: String,
      enum: ['allow', 'otp', 'email', 'both', 'block'],
      default: 'allow'
    },
    highRiskPolicy: {
      type: String,
      enum: ['allow', 'otp', 'email', 'both', 'block'],
      default: 'block'
    },
    verifySessionOnEachRequest: {
      type: Boolean,
      default: false
    },
    allowConcurrentSessions: {
      type: Boolean,
      default: true
    },
    requirePhysicalLocation: {
      type: Boolean,
      default: false
    },
    sessionTimeoutHours: {
      type: Number,
      default: 24,  // Default: sessions expire after 24 hours
      min: 1,
      max: 720      // Max: 30 days
    },
    managerPermissions: {
      canEditUsers: { type: Boolean, default: false },
      canSuspendUsers: { type: Boolean, default: false },
      canViewUserLogs: { type: Boolean, default: true },
      canAccessVaultGovernance: { type: Boolean, default: false },
      canAccessRouteRules: { type: Boolean, default: false },
      canAccessBranding: { type: Boolean, default: false }
    }
  },
  {
    timestamps: true
  }
);

const Organization = mongoose.model('Organization', organizationSchema);
export default Organization;
