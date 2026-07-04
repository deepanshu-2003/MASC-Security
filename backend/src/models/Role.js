import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    permissions: [
      {
        resource: {
          type: String, // e.g. "vault", "courses", "attendance"
          required: true
        },
        access: {
          type: String,
          enum: ['allow', 'deny', 'read-only'],
          default: 'deny'
        }
      }
    ],
    isSystem: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

const Role = mongoose.model('Role', roleSchema);
export default Role;
