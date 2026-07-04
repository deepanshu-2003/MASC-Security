import DynamicField from '../models/DynamicField.js';
import DynamicFieldValue from '../models/DynamicFieldValue.js';
import { encryptValue, decryptValue, hashValue } from './encryption.js';

/**
 * Validates a value against its field definition validation rules.
 * @param {Object} fieldDef - The DynamicField model document
 * @param {any} value - The input value to validate
 */
export const validateFieldValue = (fieldDef, value) => {
  const isValueEmpty = value === undefined || value === null || String(value).trim() === '';

  // 1. Required validation
  if (fieldDef.required && isValueEmpty) {
    throw new Error(`Field "${fieldDef.label}" is required.`);
  }

  if (isValueEmpty) {
    return; // Skip other validations if optional and empty
  }

  // 2. Type-specific validations
  if (fieldDef.type === 'number') {
    const num = Number(value);
    if (isNaN(num)) {
      throw new Error(`Field "${fieldDef.label}" must be a number.`);
    }
    if (fieldDef.validation) {
      if (fieldDef.validation.min !== undefined && num < fieldDef.validation.min) {
        throw new Error(`Field "${fieldDef.label}" must be at least ${fieldDef.validation.min}.`);
      }
      if (fieldDef.validation.max !== undefined && num > fieldDef.validation.max) {
        throw new Error(`Field "${fieldDef.label}" must be at most ${fieldDef.validation.max}.`);
      }
    }
  }

  if (fieldDef.type === 'email') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(String(value))) {
      throw new Error(`Field "${fieldDef.label}" must be a valid email address.`);
    }
  }

  if (fieldDef.type === 'url') {
    try {
      // Basic check
      if (!String(value).startsWith('http://') && !String(value).startsWith('https://')) {
        throw new Error('Must start with http:// or https://');
      }
      new URL(String(value));
    } catch (_) {
      throw new Error(`Field "${fieldDef.label}" must be a valid URL (e.g. https://example.com).`);
    }
  }

  if (fieldDef.type === 'mobile') {
    const cleanPhone = String(value).replace(/[\s-()]/g, '');
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(cleanPhone)) {
      throw new Error(`Field "${fieldDef.label}" must be a valid phone number.`);
    }
  }

  // 3. Min/Max length and Regex validations
  if (typeof value === 'string' && fieldDef.validation) {
    if (fieldDef.validation.minLength !== undefined && value.length < fieldDef.validation.minLength) {
      throw new Error(`Field "${fieldDef.label}" must be at least ${fieldDef.validation.minLength} characters.`);
    }
    if (fieldDef.validation.maxLength !== undefined && value.length > fieldDef.validation.maxLength) {
      throw new Error(`Field "${fieldDef.label}" must be at most ${fieldDef.validation.maxLength} characters.`);
    }
    if (fieldDef.validation.pattern) {
      let regex;
      try {
        regex = new RegExp(fieldDef.validation.pattern);
      } catch (err) {
        console.error('[DYNAMIC FIELDS] Invalid pattern regex configured:', err.message);
      }
      if (regex && !regex.test(value)) {
        throw new Error(`Field "${fieldDef.label}" format is invalid.`);
      }
    }
  }
};

/**
 * Saves (creates/updates) dynamic field values for a user.
 * @param {string} organizationId - Organization ID
 * @param {string} userId - User ID
 * @param {Object} valuesMap - Key-value map of fieldName -> value
 */
export const saveUserFieldValues = async (organizationId, userId, valuesMap, allowReadOnly = false) => {
  const fields = await DynamicField.find({ organizationId, status: 'active' });
  const errors = [];

  // Iterate over active field definitions to validate and prepare saving
  for (const field of fields) {
    // Skip fields not explicitly provided in the valuesMap payload
    if (!(field.name in valuesMap)) {
      continue;
    }

    const value = valuesMap[field.name];

    // Readonly fields should not be overwritten by standard forms
    if (field.readOnly && !allowReadOnly) {
      continue;
    }

    try {
      // Validate
      validateFieldValue(field, value);

      // Skip storing if empty and not required
      if (value === undefined || value === null || String(value).trim() === '') {
        // If it was already saved, we can clear it or delete the record
        await DynamicFieldValue.deleteOne({ userId, fieldId: field._id });
        continue;
      }

      // Secure storage processing
      let valueToStore = value;
      if (field.security) {
        if (field.security.storeType === 'encrypt') {
          valueToStore = encryptValue(value);
        } else if (field.security.storeType === 'hash') {
          valueToStore = hashValue(value);
        }
      }

      // Update or insert
      await DynamicFieldValue.findOneAndUpdate(
        { userId, fieldId: field._id },
        {
          organizationId,
          userId,
          fieldId: field._id,
          fieldName: field.name,
          value: valueToStore
        },
        { upsert: true, new: true }
      );
    } catch (err) {
      errors.push({ field: field.name, error: err.message });
    }
  }

  if (errors.length > 0) {
    const errorStr = errors.map(e => e.error).join(', ');
    const firstErr = new Error(errorStr);
    firstErr.details = errors;
    throw firstErr;
  }
};

/**
 * Retrieves and processes dynamic field values for a user.
 * Decrypts encrypted items and handles masking metadata.
 * @param {string} organizationId - Organization ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Object map of fieldName -> processed value representation
 */
export const getUserFieldValues = async (organizationId, userId) => {
  const fields = await DynamicField.find({ organizationId, status: 'active' }).sort({ order: 1 });
  const values = await DynamicFieldValue.find({ userId });

  const result = {};

  for (const field of fields) {
    const valDoc = values.find(v => String(v.fieldId) === String(field._id));
    
    if (!valDoc) {
      result[field.name] = {
        value: field.defaultValue || '',
        isMasked: false,
        storeType: field.security?.storeType || 'normal'
      };
      continue;
    }

    let processedValue = valDoc.value;
    const storeType = field.security?.storeType || 'normal';

    if (storeType === 'encrypt') {
      processedValue = decryptValue(valDoc.value);
    } else if (storeType === 'hash') {
      // Hashed values are write-only
      processedValue = '••••••••';
    }

    result[field.name] = {
      value: processedValue,
      isMasked: field.security?.maskValue || false,
      storeType
    };
  }

  return result;
};
