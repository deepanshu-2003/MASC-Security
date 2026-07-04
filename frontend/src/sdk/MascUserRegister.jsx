import React, { useState, useEffect } from 'react';
import { useMascToast } from './MascToast';
import PhoneInput from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { useMascTheme } from './MascThemeProvider';
import { loadReCaptcha } from './recaptcha';
import { MascDynamicForm } from './MascDynamicForm';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export function MascUserRegister({ onRegisterSuccess }) {
  const { addToast } = useMascToast();
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    mobile: '',
    password: ''
  });

  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Phase 6: Dynamic Registration Fields
  const [dynamicFields, setDynamicFields] = useState([]);
  const [dynamicValues, setDynamicValues] = useState({});

  const organization = useMascTheme();

  useEffect(() => {
    const fetchRegistrationFields = async () => {
      try {
        const res = await fetch(`${API_BASE}/dynamic-fields/placement/registration`);
        const data = await res.json();
        if (res.ok && data.fields) {
          setDynamicFields(data.fields);
          // Seed defaults
          const defaults = {};
          data.fields.forEach(field => {
            defaults[field.name] = field.defaultValue || '';
          });
          setDynamicValues(defaults);
        }
      } catch (err) {
        console.error('Failed to load dynamic registration fields:', err.message);
      }
    };
    fetchRegistrationFields();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
  };

  const handleSendOTP = async () => {
    if (!formData.mobile.trim()) {
      addToast('Mobile number is required to send verification code', 'error');
      return;
    }
    setLoading(true);
    
    try {
      const res = await fetch(`${API_BASE}/auth/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: formData.mobile })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send verification code');
      
      setOtpSent(true);
      addToast('Verification code sent to your phone.', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) {
      addToast('Please input the 6-digit OTP code', 'error');
      return;
    }
    setLoading(true);
    
    try {
      const res = await fetch(`${API_BASE}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mobile: formData.mobile, otp })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Incorrect OTP code');
      
      setOtpVerified(true);
      
      addToast('Mobile number verified successfully!', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    

    const { firstName, lastName, email, mobile, password } = formData;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !mobile.trim() || !password) {
      addToast('Please fill in all registration fields', 'error');
      return;
    }

    if (!otpVerified) {
      addToast('Mobile number must be verified before registering', 'error');
      return;
    }

    setLoading(true);
    try {
      let recaptchaToken = '';
      // Priority: org config site key → VITE env var → dummy fallback
      const envSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY;
      const siteKey = (organization?.recaptchaSiteKey && organization.recaptchaSiteKey !== 'dummy_recaptcha_site_key')
        ? organization.recaptchaSiteKey
        : (envSiteKey && envSiteKey !== 'dummy_recaptcha_v3_site_key') ? envSiteKey : null;

      if (siteKey) {
        try {
          const grecaptcha = await loadReCaptcha(siteKey);
          recaptchaToken = await grecaptcha.execute(siteKey, { action: 'submit' });
        } catch (err) {
          console.warn('reCAPTCHA failed to load/execute:', err.message);
        }
      } else {
        recaptchaToken = 'dummy_token';
        console.log('[reCAPTCHA SANDBOX] Using bypass token - configure VITE_RECAPTCHA_SITE_KEY for production.');
      }

      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, recaptchaToken, dynamicFields: dynamicValues })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      addToast('Account registered successfully! Please click the verification link sent to your email to activate your account.', 'success');
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        mobile: '',
        password: ''
      });
      setOtp('');
      setOtpSent(false);
      setOtpVerified(false);
      setDynamicValues({});
      
      if (onRegisterSuccess) {
        setTimeout(onRegisterSuccess, 5000);
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '32px', borderRadius: 'var(--radius-xl)', maxWidth: '500px', margin: '20px auto', textAlign: 'left' }}>
      <h3 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px', textAlign: 'center' }}>User Registration</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
        Create your white-labeled secure member credentials.
      </p>





      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="masc-grid-2col" style={{ gap: '12px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600' }}>First Name</label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleInputChange}
              placeholder="John"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
              required
              disabled={loading || otpVerified}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600' }}>Last Name</label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleInputChange}
              placeholder="Doe"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
              required
              disabled={loading || otpVerified}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600' }}>Email Address</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            placeholder="johndoe@email.com"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
            required
            disabled={loading || otpVerified}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600' }}>Password</label>
          <input
            type="password"
            name="password"
            value={formData.password}
            onChange={handleInputChange}
            placeholder="••••••••"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
            required
            disabled={loading || otpVerified}
          />
        </div>

        {/* Mobile Input with Inline OTP actions */}
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600' }}>Mobile Number</label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <PhoneInput
              placeholder="Enter phone number"
              value={formData.mobile}
              onChange={(value) => {
                setFormData(prev => ({ ...prev, mobile: value || '' }));
                
              }}
              defaultCountry="US"
              disabled={loading || otpVerified}
              style={{ flex: 1 }}
            />
            {!otpVerified && (
              <button
                type="button"
                onClick={handleSendOTP}
                className="btn btn-secondary"
                style={{ padding: '10px 14px', fontSize: '12px', whiteSpace: 'nowrap' }}
                disabled={loading}
              >
                {otpSent ? 'Resend code' : 'Verify mobile'}
              </button>
            )}
          </div>
        </div>

        {/* OTP Verification Input Section */}
        {otpSent && !otpVerified && (
          <div style={{ background: 'rgba(124, 58, 237, 0.03)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--primary-start)' }}>
            <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', fontWeight: '600', color: 'var(--primary-start)' }}>
              Enter 6-Digit SMS Verification Code
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                maxLength="6"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                placeholder="123456"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none', textAlign: 'center', letterSpacing: '4px', fontSize: '18px', fontWeight: '700' }}
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleVerifyOTP}
                className="btn btn-primary"
                style={{ padding: '8px 16px', fontSize: '12px' }}
                disabled={loading}
              >
                Verify Code
              </button>
            </div>
          </div>
        )}

        {/* Custom Registration Dynamic Fields */}
        {dynamicFields.length > 0 && (
          <div style={{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '14px' }}>Additional Required Information</h4>
            <MascDynamicForm
              fields={dynamicFields}
              values={dynamicValues}
              onChange={(name, val) => setDynamicValues(prev => ({ ...prev, [name]: val }))}
              disabled={loading}
            />
          </div>
        )}

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '20px' }}
          disabled={loading || !otpVerified}
        >
          {loading ? 'Submitting registration...' : 'Register Account'}
        </button>

      </form>
    </div>
  );
}
