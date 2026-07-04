import React, { useState } from 'react';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

/**
 * Renders dynamic form fields based on backend configurations.
 * Handles inputs, states, inline validations, and secure toggle buttons.
 *
 * @param {Array} fields - Array of DynamicField definitions
 * @param {Object} values - Key-value map of current form values
 * @param {Function} onChange - Callback function on value change: (fieldName, value)
 * @param {Boolean} disabled - Disables all input elements
 */
export function MascDynamicForm({ fields, values, onChange, disabled }) {
  // Eye toggles for individual secure fields (keyed by field name)
  const [unmaskedFields, setUnmaskedFields] = useState({});

  const toggleMask = (fieldName) => {
    setUnmaskedFields(prev => ({
      ...prev,
      [fieldName]: !prev[fieldName]
    }));
  };

  if (!fields || fields.length === 0) {
    return null;
  }

  // Group check for a multiselect helper (handles string and array gracefully)
  const handleMultiSelectChange = (fieldName, option, isChecked, currentVal) => {
    let currentList = [];
    if (Array.isArray(currentVal)) {
      currentList = [...currentVal];
    } else if (typeof currentVal === 'string' && currentVal.trim() !== '') {
      currentList = currentVal.split(',').map(s => s.trim());
    }

    if (isChecked) {
      if (!currentList.includes(option)) currentList.push(option);
    } else {
      currentList = currentList.filter(item => item !== option);
    }
    onChange(fieldName, currentList);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {fields.map((field) => {
        const value = values[field.name] !== undefined ? values[field.name] : (field.defaultValue || '');
        const isSecureType = field.type === 'password' || field.type === 'secure_password' || field.type === 'encrypted_text';
        const showEyeToggle = isSecureType || (field.security && field.security.showHideToggle);
        const isMasked = field.security && field.security.maskValue;
        const isCurrentlyMasked = isMasked && !unmaskedFields[field.name];
        
        // Input type selection
        let inputType = 'text';
        if (field.type === 'email') inputType = 'email';
        if (field.type === 'number') inputType = 'number';
        if (field.type === 'date') inputType = 'date';
        if (field.type === 'datetime') inputType = 'datetime-local';
        if (field.type === 'url') inputType = 'url';
        if (isSecureType) {
          inputType = unmaskedFields[field.name] ? 'text' : 'password';
        }

        // Label layout
        const renderLabel = () => (
          <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '12px', fontWeight: '600', color: 'var(--text-dark)' }}>
            <span>
              {field.label}
              {field.required && <span style={{ color: 'var(--danger)', marginLeft: '4px' }}>*</span>}
            </span>
            {field.description && (
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: '400' }}>
                {field.description}
              </span>
            )}
          </label>
        );

        // Render inputs based on configured type
        if (field.type === 'hidden') {
          return (
            <input
              key={field._id}
              type="hidden"
              value={value}
            />
          );
        }

        return (
          <div key={field._id} style={{ display: 'flex', flexDirection: 'column' }}>
            {renderLabel()}

            {/* 1. TEXTAREA */}
            {field.type === 'textarea' && (
              <textarea
                value={value}
                onChange={(e) => onChange(field.name, e.target.value)}
                placeholder={field.placeholder}
                required={field.required}
                readOnly={field.readOnly}
                disabled={disabled}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  outline: 'none',
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'var(--text-dark)',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  minHeight: '80px',
                  resize: 'vertical'
                }}
              />
            )}

            {/* 2. DROPDOWN */}
            {field.type === 'dropdown' && (
              <select
                value={value}
                onChange={(e) => onChange(field.name, e.target.value)}
                required={field.required}
                disabled={disabled || field.readOnly}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  outline: 'none',
                  background: 'var(--bg-panel)',
                  color: 'var(--text-dark)',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                <option value="">-- Select Option --</option>
                {field.options && field.options.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}

            {/* 3. MULTI SELECT */}
            {field.type === 'multiselect' && (
              <div style={{
                maxHeight: '120px',
                overflowY: 'auto',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                background: 'rgba(255, 255, 255, 0.02)'
              }}>
                {field.options && field.options.map(opt => {
                  let isChecked = false;
                  if (Array.isArray(value)) {
                    isChecked = value.includes(opt);
                  } else if (typeof value === 'string') {
                    isChecked = value.split(',').map(s => s.trim()).includes(opt);
                  }
                  return (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => handleMultiSelectChange(field.name, opt, e.target.checked, value)}
                        disabled={disabled || field.readOnly}
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
            )}

            {/* 4. CHECKBOX (SINGLE) */}
            {field.type === 'checkbox' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', fontSize: '14px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!value}
                  onChange={(e) => onChange(field.name, e.target.checked)}
                  required={field.required}
                  disabled={disabled || field.readOnly}
                />
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>I agree/enable this option</span>
              </label>
            )}

            {/* 5. RADIO BUTTONS */}
            {field.type === 'radio' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', padding: '6px 0' }}>
                {field.options && field.options.map(opt => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name={field.name}
                      value={opt}
                      checked={value === opt}
                      onChange={() => onChange(field.name, opt)}
                      disabled={disabled || field.readOnly}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            )}

            {/* 5b. MOBILE NUMBER (with Country Flags) */}
            {field.type === 'mobile' && (
              <PhoneInput
                placeholder={field.placeholder || "Enter phone number"}
                value={value}
                onChange={(val) => onChange(field.name, val || '')}
                defaultCountry="US"
                disabled={disabled || field.readOnly}
                style={{
                  width: '100%'
                }}
              />
            )}

            {/* 6. FILE UPLOAD (Functional Base64 Uploader) */}
            {(field.type === 'file' || field.type === 'image') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Real File Input */}
                <input
                  type="file"
                  accept={field.type === 'image' ? 'image/*' : '*/*'}
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        onChange(field.name, event.target.result); // Base64 data URL
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                  disabled={disabled || field.readOnly}
                  style={{ display: 'none' }}
                  id={`file-upload-${field._id}`}
                />
                
                {/* Upload Trigger Area */}
                {!value ? (
                  <label
                    htmlFor={`file-upload-${field._id}`}
                    style={{
                      border: '2px dashed var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '20px',
                      textAlign: 'center',
                      cursor: disabled || field.readOnly ? 'not-allowed' : 'pointer',
                      background: 'rgba(255,255,255,0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '8px',
                      color: 'var(--text-muted)',
                      fontSize: '13px',
                      transition: 'border-color 0.2s, background-color 0.2s'
                    }}
                  >
                    <span style={{ fontSize: '24px' }}>📤</span>
                    <span>Click to upload {field.type === 'image' ? 'an image' : 'a file'}</span>
                  </label>
                ) : (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    background: 'rgba(255,255,255,0.03)',
                    gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                      {field.type === 'image' && String(value).startsWith('data:image/') ? (
                        <img
                          src={value}
                          alt="Preview"
                          style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                        />
                      ) : (
                        <span style={{ fontSize: '20px' }}>📄</span>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: '13px', color: 'var(--text-dark)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {String(value).startsWith('data:') ? 'Attached File' : value}
                        </span>
                        {String(value).startsWith('data:') && (
                          <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: '600' }}>✓ Loaded</span>
                        )}
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {String(value).startsWith('data:') && (
                        <a
                          href={value}
                          download={field.type === 'image' ? 'uploaded_image.png' : 'uploaded_file'}
                          className="btn btn-secondary"
                          style={{ padding: '6px 10px', fontSize: '11px', textDecoration: 'none', display: 'flex', alignItems: 'center' }}
                        >
                          ⬇️ Save Local
                        </a>
                      )}
                      {!(disabled || field.readOnly) && (
                        <button
                          type="button"
                          onClick={() => onChange(field.name, '')}
                          style={{
                            border: 'none',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: 'var(--danger)',
                            padding: '6px 10px',
                            fontSize: '11px',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          🗑️ Remove
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 7. STANDARD INPUT (TEXT, EMAIL, PASSWORD, NUMBER, DATE, DATETIME, URL) */}
            {field.type !== 'textarea' &&
             field.type !== 'dropdown' &&
             field.type !== 'multiselect' &&
             field.type !== 'checkbox' &&
             field.type !== 'radio' &&
             field.type !== 'file' &&
             field.type !== 'image' &&
             field.type !== 'mobile' && (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type={inputType}
                  value={isCurrentlyMasked ? '••••••••' : value}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  placeholder={field.placeholder}
                  required={field.required}
                  readOnly={field.readOnly || isCurrentlyMasked}
                  disabled={disabled}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    paddingRight: showEyeToggle ? '40px' : '14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    outline: 'none',
                    background: 'rgba(255, 255, 255, 0.05)',
                    color: 'var(--text-dark)',
                    fontSize: '14px'
                  }}
                />
                {showEyeToggle && (
                  <button
                    type="button"
                    onClick={() => toggleMask(field.name)}
                    disabled={disabled}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px'
                    }}
                    title={unmaskedFields[field.name] ? 'Hide Value' : 'Show Value'}
                  >
                    {unmaskedFields[field.name] ? '👁️' : '👁️‍🗨️'}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
