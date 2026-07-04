import mongoose from 'mongoose';

const apiKeySchema = new mongoose.Schema(
  {
    apiKey: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    apiSecret: {
      type: String,
      required: true
    },
    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application',
      required: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'revoked'],
      default: 'active'
    },
    permissions: {
      type: [String],
      enum: ['create', 'read', 'update', 'delete'],
      default: ['create', 'read', 'update', 'delete']
    },
    rotatedAt: {
      type: Date
    },
    lastUsedAt: {
      type: Date
    }
  },
  {
    timestamps: true
  }
);

const ApiKey = mongoose.model('ApiKey', apiKeySchema);
export default ApiKey;
