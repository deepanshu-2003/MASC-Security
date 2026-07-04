import mongoose from 'mongoose';

const vaultRecordSchema = new mongoose.Schema(
  {
    collectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'VaultCollection',
      required: true
    },
    vaultId: {
      type: String,
      required: true
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    encryptedData: {
      type: String,
      required: true
    },
    encryptionMetadata: {
      algorithm: { type: String, default: 'aes-256-cbc' },
      iv: { type: String, required: true }
    },
    permissionMetadata: {
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
    },
    auditMetadata: {
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    blocked: {
      type: Boolean,
      default: false
    },
    blockedFields: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true
  }
);

const VaultRecord = mongoose.model('VaultRecord', vaultRecordSchema);
export default VaultRecord;
