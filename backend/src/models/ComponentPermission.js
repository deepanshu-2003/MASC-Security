import mongoose from 'mongoose';

const componentPermissionSchema = new mongoose.Schema(
  {
    componentId: {
      type: String,
      required: true,
      trim: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    allowUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    blockUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    allowUserSets: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserSet'
      }
    ],
    blockUserSets: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserSet'
      }
    ],
    allowRoles: [
      {
        type: String
      }
    ],
    blockRoles: [
      {
        type: String
      }
    ]
  },
  {
    timestamps: true
  }
);

// Ensure componentId is unique per organization
componentPermissionSchema.index({ organizationId: 1, componentId: 1 }, { unique: true });

const ComponentPermission = mongoose.model('ComponentPermission', componentPermissionSchema);
export default ComponentPermission;
