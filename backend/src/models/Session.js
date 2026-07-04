import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    // Reference to the user
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // Unique session token (JWT or generated ID)
    sessionToken: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    // Device fingerprint info
    deviceId: {
      type: String,
      default: 'unknown'
    },
    browser: {
      type: String,
      default: 'unknown'
    },
    os: {
      type: String,
      default: 'unknown'
    },
    deviceType: {
      type: String,
      enum: ['desktop', 'mobile', 'tablet', 'unknown'],
      default: 'unknown'
    },

    // Network info
    ipAddress: {
      type: String,
      default: ''
    },

    // Timing
    loginTime: {
      type: Date,
      default: Date.now
    },
    lastActivity: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 } // MongoDB TTL index - auto-removes expired
    },

    // Session state
    status: {
      type: String,
      enum: ['active', 'expired', 'revoked', 'force_logout'],
      default: 'active'
    },

    // AI-ready risk scoring (future use)
    riskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },

    // Human-readable location
    location: {
      type: String,
      default: 'Unknown'
    },

    // Whether this session was flagged for suspicious activity
    isSuspicious: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Instance method: check if session is still valid
sessionSchema.methods.isValid = function () {
  return this.status === 'active' && this.expiresAt > new Date();
};

const Session = mongoose.model('Session', sessionSchema);

export default Session;
