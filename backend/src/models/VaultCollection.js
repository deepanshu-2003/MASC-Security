import mongoose from 'mongoose';

const vaultCollectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    clusterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VaultCluster',
      required: false
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
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

const VaultCollection = mongoose.model('VaultCollection', vaultCollectionSchema);
export default VaultCollection;
