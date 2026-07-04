import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    vaultId: {
      type: String,
      default: '' // populated if vault mode is enabled in later phases
    },
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    mobile: {
      type: String,
      required: true,
      trim: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    emailVerified: {
      type: Boolean,
      default: false
    },
    mobileVerified: {
      type: Boolean,
      default: false
    },
    role: {
      type: String,
      default: 'user'
    },
    department: {
      type: String,
      default: 'General'
    },
    permissionOverrides: [
      {
        resource: {
          type: String,
          required: true
        },
        access: {
          type: String,
          enum: ['allow', 'deny', 'read-only'],
          required: true
        }
      }
    ],
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active'
    }
  },
  {
    timestamps: true
  }
);

// Enforce unique email per organization
userSchema.index({ organizationId: 1, email: 1 }, { unique: true });

// Enforce unique mobile number per organization
userSchema.index({ organizationId: 1, mobile: 1 }, { unique: true });

// Method to verify password
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.passwordHash);
};

// Pre-save hook to hash password if modified
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error) {
    next(error);
  }
});

const User = mongoose.model('User', userSchema);
export default User;
