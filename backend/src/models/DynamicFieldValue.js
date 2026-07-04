import mongoose from 'mongoose';

const dynamicFieldValueSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    fieldId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DynamicField',
      required: true
    },
    fieldName: {
      type: String,
      required: true
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

// Unique value representation per user and field definition
dynamicFieldValueSchema.index({ userId: 1, fieldId: 1 }, { unique: true });
dynamicFieldValueSchema.index({ organizationId: 1, userId: 1 });

const DynamicFieldValue = mongoose.model('DynamicFieldValue', dynamicFieldValueSchema);
export default DynamicFieldValue;
