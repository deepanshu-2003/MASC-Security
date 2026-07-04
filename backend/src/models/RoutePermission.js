import mongoose from 'mongoose';

const routePermissionSchema = new mongoose.Schema(
  {
    path: {
      type: String,
      required: true,
      trim: true
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    action: {
      type: String,
      enum: ['allow', 'block'],
      default: 'block'
    },
    users: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    userSets: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UserSet'
      }
    ],
    roles: [
      {
        type: String
      }
    ]
  },
  {
    timestamps: true
  }
);

// Ensure path is unique per organization
routePermissionSchema.index({ organizationId: 1, path: 1 }, { unique: true });

const RoutePermission = mongoose.model('RoutePermission', routePermissionSchema);
export default RoutePermission;
