import mongoose from 'mongoose';

const tokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    type: {
      type: String,
      enum: ['verification', 'reset'],
      required: true
    },
    expiry: {
      type: Date,
      required: true
    },
    used: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

// Auto-delete records after 2 hours to keep DB tidy
tokenSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7200 });

const Token = mongoose.model('Token', tokenSchema);
export default Token;
