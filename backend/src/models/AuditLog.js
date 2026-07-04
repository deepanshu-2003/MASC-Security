import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: false
    },
    userType: {
      type: String,
      enum: ['admin', 'user'],
      required: true
    },
    userName: {
      type: String,
      default: ''
    },
    userEmail: {
      type: String,
      default: ''
    },
    action: {
      type: String, // e.g., ROLE_CREATE, ROLE_UPDATE, ROLE_DELETE, USER_ROLE_UPDATE, USER_OVERRIDE, ACCESS_DENIED
      required: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    ipAddress: {
      type: String,
      default: ''
    },
    userAgent: {
      type: String,
      default: ''
    },
    sessionToken: {
      type: String,
      required: false
    },
    vaultId: {
      type: String,
      required: false
    },
    collectionId: {
      type: String,
      required: false
    },
    recordId: {
      type: String,
      required: false
    },
    result: {
      type: String,
      required: false
    }
  },
  { timestamps: true }
);

const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
