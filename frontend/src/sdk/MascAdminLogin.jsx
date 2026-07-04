import React, { useState } from 'react';
import { useMascToast } from './MascToast';

export function MascAdminLogin({ onLogin, verifyAdminOtp, error: apiError }) {
  const { addToast } = useMascToast();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp]           = useState('');
  const [tempToken, setTempToken] = useState('');
  const [showOtp, setShowOtp]   = useState(false);
  const [localError, setLocalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    

    if (showOtp) {
      if (!otp.trim()) {
        addToast('Please enter the verification code.', 'error');
        return;
      }
      setIsSubmitting(true);
      try {
        await verifyAdminOtp(tempToken, otp.trim());
      } catch (err) {
        addToast(err.message || 'OTP Verification failed.', 'error');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!email.trim() || !password) {
      addToast('Please enter both your email and password.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await onLogin(email.trim(), password);
      if (result && result.step === 'otp_verification') {
        setTempToken(result.tempToken);
        setShowOtp(true);
      }
    } catch (err) {
      addToast(err.message || 'Login failed. Please check your credentials.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  

  return (
    <div style={{ maxWidth: '450px', margin: '80px auto', padding: '10px' }}>
      <div className="glass-panel" style={{ padding: '40px', borderRadius: 'var(--radius-xl)' }}>
        
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '52px', height: '52px', borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--primary-start), var(--primary-end))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px', fontSize: '22px', boxShadow: '0 0 24px rgba(124,58,237,0.35)'
          }}>🔐</div>
          <h2 style={{ fontSize: '28px', marginBottom: '8px', fontWeight: '800' }}>
            {showOtp ? 'Two-Factor Verification' : 'Admin Sign In'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
            {showOtp ? `Enter the 6-digit code sent to ${email}` : 'MASC Security Administration portal'}
          </p>
        </div>



        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {showOtp ? (
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>
                Email Verification Code (OTP)
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => { setOtp(e.target.value);  }}
                placeholder="Enter 6-digit code"
                style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none', background: 'white', color: 'black', letterSpacing: '2px', textAlign: 'center', fontSize: '18px', fontWeight: '700' }}
                required
                maxLength={10}
                disabled={isSubmitting}
                autoFocus
              />
            </div>
          ) : (
            <>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value) }}
                  placeholder="admin@company.com"
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none', background: 'white', color: 'black' }}
                  required
                  disabled={isSubmitting}
                  autoComplete="username"
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: '600', color: 'var(--text-dark)' }}>
                  Password
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value) }}
                    placeholder="••••••••••••"
                    style={{ width: '100%', padding: '12px 44px 12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none', background: 'white', color: 'black' }}
                    required
                    disabled={isSubmitting}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)' }}
                    tabIndex={-1}
                  >
                    {showPassword ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '10px' }}
            disabled={isSubmitting}
          >
            {isSubmitting ? (showOtp ? 'Verifying...' : 'Signing In...') : (showOtp ? 'Verify & Login' : 'Sign In')}
          </button>

          {showOtp && (
            <button
              type="button"
              onClick={() => {
                setShowOtp(false);
                setOtp('');
                
              }}
              style={{ background: 'none', border: 'none', color: 'var(--primary-start)', fontSize: '13px', cursor: 'pointer', textAlign: 'center', marginTop: '-8px', textDecoration: 'underline' }}
            >
              Back to Password Sign In
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
