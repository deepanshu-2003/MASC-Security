import mongoose from 'mongoose';

const vaultBlockRuleSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    targetType: {
      type: String,
      enum: ['cluster', 'collection', 'record', 'field', 'user', 'userSet'],
      required: true
    },
    targetId: {
      type: String,
      required: true
    },
    clusterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VaultCluster',
      required: false
    },
    collectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VaultCollection',
      required: false
    },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true
  }
);

const VaultBlockRule = mongoose.model('VaultBlockRule', vaultBlockRuleSchema);
export default VaultBlockRule;
