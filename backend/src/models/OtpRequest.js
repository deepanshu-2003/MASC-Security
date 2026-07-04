import mongoose from 'mongoose';

const otpRequestSchema = new mongoose.Schema(
  {
    mobile: {
      type: String,
      required: false,
      trim: true
    },
    email: {
      type: String,
      required: false,
      trim: true
    },
    otp: {
      type: String,
      required: true
    },
    expiry: {
      type: Date,
      required: true
    },
    attempts: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['pending', 'verified', 'expired'],
      default: 'pending'
    }
  },
  {
    timestamps: true
  }
);

// Auto-delete records after 15 minutes to save storage and enforce lifecycle
otpRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 900 });

const OtpRequest = mongoose.model('OtpRequest', otpRequestSchema);
export default OtpRequest;
