import mongoose from 'mongoose';

const vaultSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      sparse: true,
      unique: true
    },
    vaultId: {
      type: String,
      required: true,
      unique: true
    },
    status: {
      type: String,
      enum: ['active', 'archived', 'deleted'],
      default: 'active'
    },
    // Standard sections containing structured arrays or objects
    profile: {
      type: mongoose.Schema.Types.Map,
      of: mongoose.Schema.Types.Mixed,
      default: {}
    },
    userLogs: {
      type: Array,
      default: []
    },
    // Secure items representing the credentials list in the member dashboard
    items: {
      type: [
        {
          id: { type: Number, required: true },
          title: { type: String, required: true },
          value: { type: String, required: true }
        }
      ],
      default: []
    },
    // Section-level permissions configuration map
    permissions: {
      type: Map,
      of: {
        view: { type: Boolean, default: true },
        create: { type: Boolean, default: true },
        update: { type: Boolean, default: true },
        delete: { type: Boolean, default: true },
        export: { type: Boolean, default: true }
      },
      default: {
        vault: { view: true, create: true, update: true, delete: true, export: true },
        salarySlips: { view: true, create: true, update: true, delete: true, export: true }
      }
    }
  },
  {
    timestamps: true
  }
);

const Vault = mongoose.model('Vault', vaultSchema);
export default Vault;
