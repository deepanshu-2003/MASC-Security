import React, { useState } from 'react';
import { useMascTheme } from './MascThemeProvider';
import { loadReCaptcha } from './recaptcha';
import { useMascToast } from './MascToast';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

// Geolocation helper function (prompts user for GPS coordinates)
const getGeoLocationCoords = () => {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      return resolve(null);
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        let physicalLocation = '';
        
        try {
          const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`);
          if (res.ok) {
            const data = await res.json();
            const city = data.city || data.locality || '';
            const region = data.principalSubdivision || '';
            const country = data.countryName || '';
            if (city || country) {
              physicalLocation = `📍 ${city}, ${region} (${country})`.replace(',  ', ', ');
            }
          }
        } catch (err) {
          console.warn('Client-side reverse geocoding failed:', err.message);
        }
        
        resolve({ lat, lon, physicalLocation });
      },
      (error) => {
        console.warn('Geolocation query failed or was blocked by user:', error.message);
        resolve(null);
      },
      { timeout: 5000 }
    );
  });
};

export function MascUserLogin({ onLoginSuccess, onForgotPasswordClick }) {
  const { addToast } = useMascToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Adaptive OTP state
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [emailOtpCode, setEmailOtpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [maskedMobile, setMaskedMobile] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [requiredFields, setRequiredFields] = useState([]);

  // Advanced Security Telemetry Simulation Settings
  const [showTelemetryDrawer, setShowTelemetryDrawer] = useState(false);
  const [telemetry, setTelemetry] = useState({
    deviceSecure: true,
    networkSecure: true,
    isPublicNetwork: false,
    deviceKnown: true,
    vpnActive: false,
    deviceName: 'Moose Workstation 01',
    clientIp: '198.51.100.42'
  });

  const organization = useMascTheme();

  const handleCheckboxChange = (key) => {
    setTelemetry(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTextChange = (key, value) => {
    setTelemetry(prev => ({ ...prev, [key]: value }));
  };

  const getRealTelemetry = async () => {
    // Generate/retrieve real persistent device ID fingerprint
    let deviceId = localStorage.getItem('masc_device_id');
    if (!deviceId) {
      deviceId = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
      localStorage.setItem('masc_device_id', deviceId);
    }

    // Real device OS & browser name
    const ua = navigator.userAgent.toLowerCase();
    let browser = 'Chrome';
    if (ua.includes('firefox')) browser = 'Firefox';
    else if (ua.includes('safari') && !ua.includes('chrome')) browser = 'Safari';
    else if (ua.includes('edge') || ua.includes('edg')) browser = 'Edge';

    let os = 'Windows';
    if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS';
    else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
    else if (ua.includes('android')) os = 'Android';
    else if (ua.includes('linux')) os = 'Linux';

    const deviceName = `${browser} on ${os}`;

    // Security specifications check
    const deviceSecure = window.isSecureContext && navigator.cookieEnabled;
    const networkSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isPublicNetwork = window.location.protocol === 'http:' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    
    // Real timezone mapping for backend VPN mismatch check
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Fetch client public IP address (for localhost testing and verification)
    let clientIp = '';
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      if (res.ok) {
        const data = await res.json();
        clientIp = data.ip || '';
      }
    } catch (err) {
      console.warn('Failed to query public IP lookup:', err.message);
    }

    return {
      deviceName,
      deviceId,
      deviceSecure,
      networkSecure,
      isPublicNetwork,
      timezone,
      clientIp
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email.trim() || !password) {
      addToast('Please fill in email and password credentials', 'error');
      setError('Please fill in email and password credentials');
      return;
    }

    setLoading(true);
    try {
      let recaptchaToken = '';
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
      }

      const realTelemetry = await getRealTelemetry();
      if (organization?.requirePhysicalLocation) {
        const coords = await getGeoLocationCoords();
        if (coords) {
          realTelemetry.lat = coords.lat;
          realTelemetry.lon = coords.lon;
          if (coords.physicalLocation) {
            realTelemetry.physicalLocation = coords.physicalLocation;
          }
        }
      }

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email, 
          password, 
          recaptchaToken,
          telemetry: realTelemetry
        })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Check if adaptive OTP verification is required
      if (data.step === 'otp_verification' || data.step === 'adaptive_verification') {
        setTempToken(data.tempToken);
        setMaskedMobile(data.mobile || '');
        setMaskedEmail(data.email || '');
        setRequiredFields(data.requiredFields || ['otp']);
        setShowOtpForm(true);
        addToast('Adaptive verification challenge triggered. Check your phone/email.', 'warning');
        setLoading(false);
        return;
      }

      // Standard Allow access bypass
      localStorage.setItem('masc_user_token', data.token);
      localStorage.setItem('masc_session_token', data.sessionToken);
      localStorage.setItem('masc_user', JSON.stringify(data.user));
      localStorage.setItem('masc_client_ip', data.sessionIp || realTelemetry.clientIp || '127.0.0.1');
      localStorage.setItem('masc_device_name', realTelemetry.deviceName);

      addToast('Logged in successfully!', 'success');
      
      if (onLoginSuccess) {
        setTimeout(() => onLoginSuccess(data), 1500);
      }
    } catch (err) {
      addToast(err.message, 'error');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!otpCode.trim() && requiredFields.includes('otp')) {
      addToast('Please enter the SMS verification code from your phone.', 'error');
      setError('Please enter the SMS verification code from your phone.');
      return;
    }
    if (!emailOtpCode.trim() && requiredFields.includes('email')) {
      addToast('Please enter the email verification code.', 'error');
      setError('Please enter the email verification code.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          otp: otpCode.trim() || undefined,
          emailOtp: emailOtpCode.trim() || undefined,
          tempToken,
          telemetry
        })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'OTP Verification failed');
      }

      localStorage.setItem('masc_user_token', data.token);
      localStorage.setItem('masc_session_token', data.sessionToken);
      localStorage.setItem('masc_user', JSON.stringify(data.user));
      localStorage.setItem('masc_client_ip', telemetry.clientIp);
      localStorage.setItem('masc_device_name', telemetry.deviceName);

      addToast('MFA verified successfully! Redirecting...', 'success');

      if (onLoginSuccess) {
        setTimeout(() => onLoginSuccess(data), 1500);
      }
    } catch (err) {
      addToast(err.message, 'error');
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOtp = () => {
    setShowOtpForm(false);
    setOtpCode('');
    setEmailOtpCode('');
    setError('');
    setSuccess('');
    setRequiredFields([]);
    setTempToken('');
  };

  return (
    <div className="glass-panel" style={{ padding: '32px', borderRadius: 'var(--radius-xl)', maxWidth: '440px', margin: '40px auto', textAlign: 'left' }}>
      <h3 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px', textAlign: 'center' }}>
        {showOtpForm ? 'Adaptive Verification' : 'Sign in'}
      </h3>
      {showOtpForm && (
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
          Verify identity context sent to registered phone {maskedMobile}.
        </p>
      )}

      {!showOtpForm ? (
        /* A. SIGN IN FORM */
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600' }}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(''); }}
              placeholder="johndoe@email.com"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
              required
              disabled={loading}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              placeholder="••••••••"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
              required
              disabled={loading}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-4px' }}>
            <button
              type="button"
              onClick={onForgotPasswordClick}
              style={{ border: 'none', background: 'transparent', color: 'var(--primary-start)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
            >
              Forgot Password?
            </button>
          </div>


          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      ) : (
        /* B. ADAPTIVE OTP VERIFICATION FORM */
        <form onSubmit={handleVerifyOtp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Channel info banners */}
          {requiredFields.includes('otp') && maskedMobile && (
            <div style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: '13px', color: 'var(--text-dark)' }}>
              📱 SMS code sent to <strong>{maskedMobile}</strong>
            </div>
          )}
          {requiredFields.includes('email') && maskedEmail && (
            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 'var(--radius-md)', padding: '10px 14px', fontSize: '13px', color: 'var(--text-dark)' }}>
              ✉️ Email code sent to <strong>{maskedEmail}</strong>
            </div>
          )}

          {/* SMS OTP Field */}
          {requiredFields.includes('otp') && (
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600' }}>SMS Verification Code</label>
              <input
                type="text"
                maxLength="6"
                value={otpCode}
                onChange={(e) => { setOtpCode(e.target.value.replace(/[^0-9]/g, '')); setError(''); }}
                placeholder="000000"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none', fontSize: '20px', letterSpacing: '8px', textAlign: 'center', fontWeight: '800' }}
                required={requiredFields.includes('otp')}
                disabled={loading}
                autoFocus
              />
            </div>
          )}

          {/* Email OTP Field */}
          {requiredFields.includes('email') && (
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600' }}>Email Verification Code</label>
              <input
                type="text"
                maxLength="6"
                value={emailOtpCode}
                onChange={(e) => { setEmailOtpCode(e.target.value.replace(/[^0-9]/g, '')); setError(''); }}
                placeholder="000000"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none', fontSize: '20px', letterSpacing: '8px', textAlign: 'center', fontWeight: '800' }}
                required={requiredFields.includes('email')}
                disabled={loading}
              />
            </div>
          )}



          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            disabled={loading}
          >
            {loading ? 'Verifying...' : 'Verify & Sign In'}
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCancelOtp}
            style={{ width: '100%' }}
            disabled={loading}
          >
            Back to Sign In
          </button>
        </form>
      )}
    </div>
  );
}
