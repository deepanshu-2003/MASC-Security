import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    status: {
      type: String,
      enum: ['active', 'suspended'],
      default: 'active'
    }
  },
  {
    timestamps: true
  }
);

// Enforce unique application name per organization
applicationSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const Application = mongoose.model('Application', applicationSchema);
export default Application;
