import mongoose from 'mongoose';

const vaultClusterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    description: {
      type: String,
      default: ''
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    scopeType: {
      type: String,
      enum: ['local', 'global'],
      default: 'global'
    },
    vaultId: {
      type: String,
      default: null
    },
    blocked: {
      type: Boolean,
      default: false
    },
    permissions: {
      users: [
        {
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          actions: [String]
        }
      ],
      userSets: [
        {
          userSetId: { type: mongoose.Schema.Types.ObjectId, ref: 'UserSet' },
          actions: [String]
        }
      ],
      roles: [
        {
          role: { type: String },
          actions: [String]
        }
      ],
      ownerActions: {
        type: [String],
        default: ['read', 'create', 'update', 'delete']
      }
    }
  },
  {
    timestamps: true
  }
);

const VaultCluster = mongoose.model('VaultCluster', vaultClusterSchema);
export default VaultCluster;
