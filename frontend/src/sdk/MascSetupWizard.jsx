import React, { useState, useEffect } from 'react';
import { useMascToast } from './MascToast';

export function MascSetupWizard({ onComplete, error: apiError }) {
  const { addToast } = useMascToast();
  useEffect(() => {
    if (apiError) {
      addToast(apiError, 'error');
    }
  }, [apiError]);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    adminName: '',
    adminEmail: '',
    adminPassword: '',
    adminPasswordConfirm: '',
    orgName: '',
    orgLogoUrl: '',
    primaryStart: '#7C3AED',
    primaryEnd: '#A855F7',
    secondaryStart: '#9333EA',
    secondaryEnd: '#C084FC',
    accent: '#8B5CF6'
  });
  
  const [validationError, setValidationError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
  };

  const handleColorChange = (name, value) => {
    setFormData((prev) => {
      const updated = { ...prev, [name]: value };
      // Apply color picker updates dynamically in the DOM so the admin can see their brand choice live
      if (name === 'primaryStart') document.documentElement.style.setProperty('--primary-start', value);
      if (name === 'primaryEnd') document.documentElement.style.setProperty('--primary-end', value);
      if (name === 'secondaryStart') document.documentElement.style.setProperty('--secondary-start', value);
      if (name === 'secondaryEnd') document.documentElement.style.setProperty('--secondary-end', value);
      if (name === 'accent') document.documentElement.style.setProperty('--accent', value);
      return updated;
    });
  };

  const validateStep = () => {
    if (step === 1) {
      if (!formData.adminName.trim()) return 'Name is required';
      if (!formData.adminEmail.trim()) return 'Email is required';
      if (!/\S+@\S+\.\S+/.test(formData.adminEmail)) return 'Invalid email address';
      if (formData.adminPassword.length < 6) return 'Password must be at least 6 characters';
      if (formData.adminPassword !== formData.adminPasswordConfirm) return 'Passwords do not match';
    } else if (step === 2) {
      if (!formData.orgName.trim()) return 'Organization name is required';
    }
    return '';
  };

  const handleNext = () => {
    const err = validateStep();
    if (err) {
      addToast(err, 'error');
      return;
    }
    setStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setStep((prev) => prev - 1);
    
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      await onComplete(formData);
    } catch (err) {
      addToast(err.message || 'Setup wizard failed', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '60px auto', padding: '10px' }}>
      <div className="glass-panel" style={{ padding: '40px', borderRadius: 'var(--radius-xl)' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: '28px', marginBottom: '8px', fontWeight: '800' }}>Setup Wizard</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
            Initialize your modular MASC Security platform.
          </p>
        </div>

        {/* Progress Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '40px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '15px', left: '0', right: '0', height: '2px', background: 'var(--border)', zIndex: '0' }}></div>
          <div style={{ position: 'absolute', top: '15px', left: '0', width: `${((step - 1) / 3) * 100}%`, height: '2px', background: 'var(--primary-gradient)', zIndex: '0', transition: 'var(--transition-normal)' }}></div>
          
          {[1, 2, 3, 4].map((s) => (
            <div
              key={s}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: step >= s ? 'var(--primary-gradient)' : 'white',
                color: step >= s ? 'white' : 'var(--text-muted)',
                border: step >= s ? 'none' : '2px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '14px',
                zIndex: '1',
                transition: 'var(--transition-normal)'
              }}
            >
              {s}
            </div>
          ))}
        </div>





        <form onSubmit={handleSubmit}>
          
          {/* Step 1: Create Admin */}
          {step === 1 && (
            <div>
              <h3 style={{ fontSize: '18px', marginBottom: '20px', fontWeight: '600' }}>1. Create Administrator Account</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>Admin Name</label>
                  <input
                    type="text"
                    name="adminName"
                    value={formData.adminName}
                    onChange={handleInputChange}
                    placeholder="Enter your name"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none', transition: 'var(--transition-fast)' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>Email Address</label>
                  <input
                    type="email"
                    name="adminEmail"
                    value={formData.adminEmail}
                    onChange={handleInputChange}
                    placeholder="admin@company.com"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>Password</label>
                  <input
                    type="password"
                    name="adminPassword"
                    value={formData.adminPassword}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>Confirm Password</label>
                  <input
                    type="password"
                    name="adminPasswordConfirm"
                    value={formData.adminPasswordConfirm}
                    onChange={handleInputChange}
                    placeholder="••••••••"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Create Organization */}
          {step === 2 && (
            <div>
              <h3 style={{ fontSize: '18px', marginBottom: '20px', fontWeight: '600' }}>2. Create Organization Profile</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>Company Name</label>
                  <input
                    type="text"
                    name="orgName"
                    value={formData.orgName}
                    onChange={handleInputChange}
                    placeholder="e.g. MASC Technologies"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>Logo Image URL (Optional)</label>
                  <input
                    type="text"
                    name="orgLogoUrl"
                    value={formData.orgLogoUrl}
                    onChange={handleInputChange}
                    placeholder="https://example.com/logo.png"
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Configure Branding */}
          {step === 3 && (
            <div>
              <h3 style={{ fontSize: '18px', marginBottom: '20px', fontWeight: '600' }}>3. White-Label Branding Setup</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '10px', fontSize: '14px', fontWeight: '600', color: 'var(--text-dark)' }}>
                    Primary Branding Gradient
                  </label>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Start Color</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="color"
                          value={formData.primaryStart}
                          onChange={(e) => handleColorChange('primaryStart', e.target.value)}
                          style={{ border: 'none', background: 'transparent', width: '32px', height: '32px', cursor: 'pointer' }}
                        />
                        <input
                          type="text"
                          value={formData.primaryStart}
                          onChange={(e) => handleColorChange('primaryStart', e.target.value)}
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                        />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>End Color</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="color"
                          value={formData.primaryEnd}
                          onChange={(e) => handleColorChange('primaryEnd', e.target.value)}
                          style={{ border: 'none', background: 'transparent', width: '32px', height: '32px', cursor: 'pointer' }}
                        />
                        <input
                          type="text"
                          value={formData.primaryEnd}
                          onChange={(e) => handleColorChange('primaryEnd', e.target.value)}
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '10px', fontSize: '14px', fontWeight: '600', color: 'var(--text-dark)' }}>
                    Secondary Branding Gradient
                  </label>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Start Color</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="color"
                          value={formData.secondaryStart}
                          onChange={(e) => handleColorChange('secondaryStart', e.target.value)}
                          style={{ border: 'none', background: 'transparent', width: '32px', height: '32px', cursor: 'pointer' }}
                        />
                        <input
                          type="text"
                          value={formData.secondaryStart}
                          onChange={(e) => handleColorChange('secondaryStart', e.target.value)}
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                        />
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>End Color</span>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="color"
                          value={formData.secondaryEnd}
                          onChange={(e) => handleColorChange('secondaryEnd', e.target.value)}
                          style={{ border: 'none', background: 'transparent', width: '32px', height: '32px', cursor: 'pointer' }}
                        />
                        <input
                          type="text"
                          value={formData.secondaryEnd}
                          onChange={(e) => handleColorChange('secondaryEnd', e.target.value)}
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '600', color: 'var(--text-dark)' }}>
                    Accent Theme Color
                  </label>
                  <div style={{ display: 'flex', gap: '8px', maxWidth: '240px' }}>
                    <input
                      type="color"
                      value={formData.accent}
                      onChange={(e) => handleColorChange('accent', e.target.value)}
                      style={{ border: 'none', background: 'transparent', width: '32px', height: '32px', cursor: 'pointer' }}
                    />
                    <input
                      type="text"
                      value={formData.accent}
                      onChange={(e) => handleColorChange('accent', e.target.value)}
                      style={{ width: '100%', padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review & Launch */}
          {step === 4 && (
            <div>
              <h3 style={{ fontSize: '18px', marginBottom: '20px', fontWeight: '600' }}>4. Review Configuration</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(255,255,255,0.4)', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>ADMIN ACCOUNT</span>
                  <strong style={{ fontSize: '15px', color: 'var(--text-dark)' }}>{formData.adminName}</strong> ({formData.adminEmail})
                </div>
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>ORGANIZATION</span>
                  <strong style={{ fontSize: '15px', color: 'var(--text-dark)' }}>{formData.orgName}</strong>
                </div>
                {formData.orgLogoUrl && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>LOGO URL</span>
                    <span style={{ fontSize: '13px', wordBreak: 'break-all' }}>{formData.orgLogoUrl}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block' }}>BRAND GRADIENTS</span>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '6px' }}>
                    <div style={{ flex: 1, height: '36px', borderRadius: 'var(--radius-sm)', background: `linear-gradient(135deg, ${formData.primaryStart} 0%, ${formData.primaryEnd} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px', fontWeight: '600' }}>
                      Primary
                    </div>
                    <div style={{ flex: 1, height: '36px', borderRadius: 'var(--radius-sm)', background: `linear-gradient(135deg, ${formData.secondaryStart} 0%, ${formData.secondaryEnd} 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '12px', fontWeight: '600' }}>
                      Secondary
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px' }}>
            {step > 1 ? (
              <button type="button" onClick={handleBack} className="btn btn-secondary" disabled={isSubmitting}>
                Back
              </button>
            ) : (
              <div></div>
            )}
            
            {step < 4 ? (
              <button type="button" onClick={handleNext} className="btn btn-primary">
                Continue
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Configuring System...' : 'Launch Platform'}
              </button>
            )}
          </div>

        </form>
      </div>
    </div>
  );
}
