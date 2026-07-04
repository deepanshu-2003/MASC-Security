import express from 'express';
import Organization from '../models/Organization.js';
import DynamicField from '../models/DynamicField.js';
import DynamicFieldValue from '../models/DynamicFieldValue.js';
import AuditLog from '../models/AuditLog.js';
import { protectAdmin, protectUser } from '../middlewares/authMiddleware.js';
import { saveUserFieldValues, getUserFieldValues } from '../services/dynamicFieldService.js';

const router = express.Router();

// ==========================================
// PUBLIC & USER ENDPOINTS
// ==========================================

// 1. GET /placement/:placement
// Fetch active definitions for a specific placement (e.g. registration, profile)
router.get('/placement/:placement', async (req, res, next) => {
  try {
    const { placement } = req.params;
    const org = await Organization.findOne();
    if (!org) {
      return res.status(404).json({ error: 'System organization not found' });
    }

    const query = {
      organizationId: org._id,
      status: 'active'
    };
    if (placement === 'profile') {
      query.placement = { $in: ['profile', 'registration'] };
    } else {
      query.placement = placement;
    }

    const fields = await DynamicField.find(query).sort({ order: 1 });

    res.json({
      success: true,
      fields
    });
  } catch (error) {
    next(error);
  }
});

// 2. GET /values
// Protected User route: Fetch current logged-in user's submitted values
router.get('/values', protectUser, async (req, res, next) => {
  try {
    const values = await getUserFieldValues(req.user.organizationId, req.user._id);
    res.json({
      success: true,
      values
    });
  } catch (error) {
    next(error);
  }
});

// 3. POST /values
// Protected User route: Submit/Update current logged-in user's field values
router.post('/values', protectUser, async (req, res, next) => {
  try {
    const { values } = req.body;
    if (!values || typeof values !== 'object') {
      return res.status(400).json({ error: 'Values object is required' });
    }

    await saveUserFieldValues(req.user.organizationId, req.user._id, values);

    // Create Audit Log entry
    await AuditLog.create({
      userId: req.user._id,
      userType: 'user',
      userName: `${req.user.firstName} ${req.user.lastName}`,
      userEmail: req.user.email,
      action: 'DYNAMIC_FIELDS_SUBMITTED',
      details: {
        submittedFieldNames: Object.keys(values)
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: 'Custom field values saved successfully.'
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
      details: error.details || []
    });
  }
});

// ==========================================
// ADMIN DASHBOARD CRUD ENDPOINTS
// ==========================================

// Apply protectAdmin to all admin endpoints below
router.use(protectAdmin);

// 4. GET /
// Fetch all field definitions for the organization
router.get('/', async (req, res, next) => {
  try {
    const org = await Organization.findOne();
    if (!org) {
      return res.status(404).json({ error: 'System organization not found' });
    }

    const fields = await DynamicField.find({ organizationId: org._id }).sort({ order: 1 });
    res.json({
      success: true,
      fields
    });
  } catch (error) {
    next(error);
  }
});

// 5. POST /
// Create a new field definition
router.post('/', async (req, res, next) => {
  try {
    const org = await Organization.findOne();
    if (!org) {
      return res.status(404).json({ error: 'System organization not found' });
    }

    const {
      name,
      label,
      type,
      required,
      readOnly,
      hidden,
      placeholder,
      description,
      defaultValue,
      options,
      validation,
      placement,
      security,
      status,
      order
    } = req.body;

    if (!name || !label || !type) {
      return res.status(400).json({ error: 'Name, label, and type are required' });
    }

    // Verify unique name
    const existing = await DynamicField.findOne({ organizationId: org._id, name: name.trim() });
    if (existing) {
      return res.status(400).json({ error: `Field with name "${name}" already exists` });
    }

    const field = await DynamicField.create({
      organizationId: org._id,
      name: name.trim(),
      label: label.trim(),
      type,
      required: !!required,
      readOnly: !!readOnly,
      hidden: !!hidden,
      placeholder: placeholder || '',
      description: description || '',
      defaultValue: defaultValue !== undefined ? defaultValue : '',
      options: Array.isArray(options) ? options : [],
      validation: validation || {},
      placement: placement || 'profile',
      security: security || { storeType: 'normal', maskValue: false, showHideToggle: false },
      status: status || 'active',
      order: Number(order) || 0
    });

    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: `${req.admin.firstName} ${req.admin.lastName}`,
      userEmail: req.admin.email,
      action: 'DYNAMIC_FIELD_CREATED',
      details: {
        fieldId: field._id,
        fieldName: field.name,
        fieldType: field.type
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.status(201).json({
      success: true,
      message: 'Dynamic field definition created successfully',
      field
    });
  } catch (error) {
    next(error);
  }
});

// 6. PUT /:id
// Update a field definition
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const field = await DynamicField.findById(id);
    if (!field) {
      return res.status(404).json({ error: 'Field definition not found' });
    }

    const {
      label,
      required,
      readOnly,
      hidden,
      placeholder,
      description,
      defaultValue,
      options,
      validation,
      placement,
      security,
      status,
      order
    } = req.body;

    if (label !== undefined) field.label = label.trim();
    if (required !== undefined) field.required = !!required;
    if (readOnly !== undefined) field.readOnly = !!readOnly;
    if (hidden !== undefined) field.hidden = !!hidden;
    if (placeholder !== undefined) field.placeholder = placeholder;
    if (description !== undefined) field.description = description;
    if (defaultValue !== undefined) field.defaultValue = defaultValue;
    if (options !== undefined) field.options = Array.isArray(options) ? options : [];
    if (validation !== undefined) field.validation = validation;
    if (placement !== undefined) field.placement = placement;
    if (security !== undefined) field.security = security;
    if (status !== undefined) field.status = status;
    if (order !== undefined) field.order = Number(order) || 0;

    await field.save();

    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: `${req.admin.firstName} ${req.admin.lastName}`,
      userEmail: req.admin.email,
      action: 'DYNAMIC_FIELD_UPDATED',
      details: {
        fieldId: field._id,
        fieldName: field.name,
        status: field.status
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: 'Field definition updated successfully',
      field
    });
  } catch (error) {
    next(error);
  }
});

// 7. DELETE /:id
// Delete a field definition (and optionally associated user values)
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const field = await DynamicField.findById(id);
    if (!field) {
      return res.status(404).json({ error: 'Field definition not found' });
    }

    // Delete definition
    await DynamicField.deleteOne({ _id: id });
    // Clear user values for this definition
    await DynamicFieldValue.deleteMany({ fieldId: id });

    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: `${req.admin.firstName} ${req.admin.lastName}`,
      userEmail: req.admin.email,
      action: 'DYNAMIC_FIELD_DELETED',
      details: {
        fieldId: id,
        fieldName: field.name
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: `Field "${field.name}" and all user values deleted successfully.`
    });
  } catch (error) {
    next(error);
  }
});

// 8. POST /:id/clone
// Clone an existing field definition
router.post('/:id/clone', async (req, res, next) => {
  try {
    const { id } = req.params;
    const original = await DynamicField.findById(id);
    if (!original) {
      return res.status(404).json({ error: 'Original field definition not found' });
    }

    // Generate unique clone name
    let suffix = 1;
    let cloneName = `${original.name}_clone`;
    let exists = await DynamicField.findOne({ organizationId: original.organizationId, name: cloneName });
    while (exists) {
      suffix++;
      cloneName = `${original.name}_clone_${suffix}`;
      exists = await DynamicField.findOne({ organizationId: original.organizationId, name: cloneName });
    }

    const cloned = await DynamicField.create({
      organizationId: original.organizationId,
      name: cloneName,
      label: `${original.label} (Cloned)`,
      type: original.type,
      required: original.required,
      readOnly: original.readOnly,
      hidden: original.hidden,
      placeholder: original.placeholder,
      description: original.description,
      defaultValue: original.defaultValue,
      options: original.options,
      validation: original.validation,
      placement: original.placement,
      security: original.security,
      status: original.status,
      order: original.order + 1
    });

    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: `${req.admin.firstName} ${req.admin.lastName}`,
      userEmail: req.admin.email,
      action: 'DYNAMIC_FIELD_CLONED',
      details: {
        originalFieldId: id,
        clonedFieldId: cloned._id,
        clonedFieldName: cloned.name
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.status(201).json({
      success: true,
      message: 'Field definition cloned successfully.',
      field: cloned
    });
  } catch (error) {
    next(error);
  }
});

// 9. POST /reorder
// Reorder multiple fields at once
router.post('/reorder', async (req, res, next) => {
  try {
    const { orderings } = req.body; // Array of { id, order }
    if (!Array.isArray(orderings)) {
      return res.status(400).json({ error: 'Orderings must be an array of { id, order } items' });
    }

    const org = await Organization.findOne();
    if (!org) {
      return res.status(404).json({ error: 'System organization not found' });
    }

    for (const item of orderings) {
      if (item.id && item.order !== undefined) {
        await DynamicField.updateOne(
          { _id: item.id, organizationId: org._id },
          { $set: { order: Number(item.order) || 0 } }
        );
      }
    }

    res.json({
      success: true,
      message: 'Field layout ordering updated successfully.'
    });
  } catch (error) {
    next(error);
  }
});

// 10. GET /export
// Export dynamic field configurations as downloadable JSON
router.get('/export', async (req, res, next) => {
  try {
    const org = await Organization.findOne();
    if (!org) {
      return res.status(404).json({ error: 'System organization not found' });
    }

    const fields = await DynamicField.find({ organizationId: org._id }).sort({ order: 1 });

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=dynamic_fields_export.json');

    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: `${req.admin.firstName} ${req.admin.lastName}`,
      userEmail: req.admin.email,
      action: 'DYNAMIC_FIELDS_EXPORTED',
      details: {
        exportedFieldsCount: fields.length
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    // Strip database IDs for clean imports elsewhere
    const cleanFields = fields.map(f => {
      const o = f.toObject();
      delete o._id;
      delete o.organizationId;
      delete o.createdAt;
      delete o.updatedAt;
      delete o.__v;
      return o;
    });

    res.send(JSON.stringify(cleanFields, null, 2));
  } catch (error) {
    next(error);
  }
});

// 11. POST /import
// Import field configurations from JSON payload
router.post('/import', async (req, res, next) => {
  try {
    const { fields } = req.body;
    if (!Array.isArray(fields)) {
      return res.status(400).json({ error: 'Fields payload must be an array' });
    }

    const org = await Organization.findOne();
    if (!org) {
      return res.status(404).json({ error: 'System organization not found' });
    }

    let importedCount = 0;
    let updatedCount = 0;

    for (const fieldData of fields) {
      if (!fieldData.name || !fieldData.label || !fieldData.type) {
        continue;
      }

      // Check if exists
      const existing = await DynamicField.findOne({ organizationId: org._id, name: fieldData.name });

      const updatePayload = {
        label: fieldData.label,
        type: fieldData.type,
        required: !!fieldData.required,
        readOnly: !!fieldData.readOnly,
        hidden: !!fieldData.hidden,
        placeholder: fieldData.placeholder || '',
        description: fieldData.description || '',
        defaultValue: fieldData.defaultValue !== undefined ? fieldData.defaultValue : '',
        options: Array.isArray(fieldData.options) ? fieldData.options : [],
        validation: fieldData.validation || {},
        placement: fieldData.placement || 'profile',
        security: fieldData.security || { storeType: 'normal', maskValue: false, showHideToggle: false },
        status: fieldData.status || 'active',
        order: Number(fieldData.order) || 0
      };

      if (existing) {
        await DynamicField.updateOne({ _id: existing._id }, { $set: updatePayload });
        updatedCount++;
      } else {
        await DynamicField.create({
          organizationId: org._id,
          name: fieldData.name,
          ...updatePayload
        });
        importedCount++;
      }
    }

    await AuditLog.create({
      userId: req.admin._id,
      userType: 'admin',
      userName: `${req.admin.firstName} ${req.admin.lastName}`,
      userEmail: req.admin.email,
      action: 'DYNAMIC_FIELDS_IMPORTED',
      details: {
        importedCount,
        updatedCount
      },
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || ''
    });

    res.json({
      success: true,
      message: `Configurations imported: ${importedCount} created, ${updatedCount} updated.`,
      importedCount,
      updatedCount
    });
  } catch (error) {
    next(error);
  }
});

export default router;
