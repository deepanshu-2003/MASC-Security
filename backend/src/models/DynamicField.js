import mongoose from 'mongoose';

const dynamicFieldSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    label: {
      type: String,
      required: true,
      trim: true
    },
    type: {
      type: String,
      required: true,
      enum: [
        'text',           // Single Line Text
        'textarea',       // Multi Line Text
        'email',          // Email
        'mobile',         // Mobile Number
        'number',         // Number
        'password',       // Password
        'secure_password', // Secure Password
        'encrypted_text',  // Encrypted Text
        'date',           // Date
        'datetime',       // Date & Time
        'dropdown',       // Dropdown
        'multiselect',    // Multi Select
        'checkbox',       // Checkbox
        'radio',          // Radio Button
        'url',            // URL
        'file',           // File Upload
        'image',          // Image Upload
        'hidden'          // Hidden Field
      ]
    },
    required: {
      type: Boolean,
      default: false
    },
    readOnly: {
      type: Boolean,
      default: false
    },
    hidden: {
      type: Boolean,
      default: false
    },
    placeholder: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: ''
    },
    defaultValue: {
      type: mongoose.Schema.Types.Mixed,
      default: ''
    },
    options: {
      type: [String],
      default: []
    },
    validation: {
      minLength: { type: Number },
      maxLength: { type: Number },
      pattern: { type: String }, // Regex pattern string
      min: { type: Number }, // For number range
      max: { type: Number }, // For number range
      allowedFileTypes: { type: [String], default: [] },
      maxFileSize: { type: Number } // In MB
    },
    placement: {
      type: String,
      required: true,
      enum: ['registration', 'first_login', 'profile', 'dashboard', 'vault', 'custom'],
      default: 'profile'
    },
    security: {
      storeType: {
        type: String,
        enum: ['normal', 'encrypt', 'hash'],
        default: 'normal'
      },
      maskValue: {
        type: Boolean,
        default: false
      },
      showHideToggle: {
        type: Boolean,
        default: false
      }
    },
    status: {
      type: String,
      enum: ['active', 'disabled'],
      default: 'active'
    },
    order: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

// Enforce unique name per organization
dynamicFieldSchema.index({ organizationId: 1, name: 1 }, { unique: true });

const DynamicField = mongoose.model('DynamicField', dynamicFieldSchema);
export default DynamicField;
