import mongoose from 'mongoose';

const aiEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true
    },
    email: {
      type: String,
      default: ''
    },
    action: {
      type: String,
      required: true // e.g. FAILED_LOGIN, LOCATION_DRIFT, CONCURRENT_SESSIONS, DENIED_ROUTE, SUSPICIOUS_ACTIVITY
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    },
    severity: {
      type: String,
      enum: ['safe', 'moderate', 'suspicious', 'critical'],
      required: true
    },
    description: {
      type: String,
      required: true
    },
    recommendation: {
      type: String,
      default: ''
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: ['pending', 'resolved', 'dismissed'],
      default: 'pending',
      index: true
    }
  },
  { timestamps: true }
);

const AiEvent = mongoose.model('AiEvent', aiEventSchema);
export default AiEvent;
