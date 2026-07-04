import mongoose from 'mongoose';

const userSetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ]
  },
  {
    timestamps: true
  }
);

// Unique user set name per organization
userSetSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const UserSet = mongoose.model('UserSet', userSetSchema);
export default UserSet;
