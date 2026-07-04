import React, { useState, useEffect } from 'react';
import { MascUserLogin } from './MascUserLogin';
import { MascUserRegister } from './MascUserRegister';
import { MascForgotPassword } from './MascForgotPassword';

/**
 * Overlay modal wrapper enabling floating sign in / register forms anywhere in client app.
 * Reuses existing SDK auth view panels.
 */
export function MascAuthModal({ isOpen, onClose, defaultView = 'login', onSuccess }) {
  const [view, setView] = useState(defaultView);

  // Sync view when defaultView changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setView(defaultView);
    }
  }, [isOpen, defaultView]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.4)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      {/* Modal Container */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: '520px',
        animation: 'mascModalScaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
      }}>
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '32px',
            right: '32px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border)',
            borderRadius: '50%',
            width: '32px',
            height: '32px',
            color: 'var(--text-dark)',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            opacity: 0.8,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => {
            e.target.style.opacity = 1;
            e.target.style.background = 'rgba(255,255,255,0.1)';
          }}
          onMouseLeave={(e) => {
            e.target.style.opacity = 0.8;
            e.target.style.background = 'rgba(255, 255, 255, 0.05)';
          }}
        >
          ✕
        </button>

        {/* Auth Subviews */}
        {view === 'login' && (
          <MascUserLogin
            onLoginSuccess={(data) => {
              onSuccess?.(data);
              onClose();
            }}
            onForgotPasswordClick={() => setView('forgot')}
          />
        )}

        {view === 'register' && (
          <MascUserRegister
            onRegisterSuccess={() => {
              setView('login');
            }}
          />
        )}

        {view === 'forgot' && (
          <MascForgotPassword
            onBackToLogin={() => setView('login')}
          />
        )}

        {/* Sub-navigation footer inside modal */}
        <div style={{
          marginTop: '-12px',
          textAlign: 'center',
          fontSize: '13px',
          color: 'var(--text-muted)',
          background: 'rgba(255, 255, 255, 0.01)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--border)',
          borderTop: 'none',
          padding: '16px',
          borderRadius: '0 0 var(--radius-xl) var(--radius-xl)',
          maxWidth: '500px',
          margin: '-12px auto 0 auto'
        }}>
          {view === 'login' && (
            <span>
              Don't have an account?{' '}
              <button
                onClick={() => setView('register')}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: '700', padding: 0, textDecoration: 'underline' }}
              >
                Register here
              </button>
            </span>
          )}
          {view === 'register' && (
            <span>
              Already registered?{' '}
              <button
                onClick={() => setView('login')}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: '700', padding: 0, textDecoration: 'underline' }}
              >
                Sign In
              </button>
            </span>
          )}
          {view === 'forgot' && (
            <span>
              Remember credentials?{' '}
              <button
                onClick={() => setView('login')}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: '700', padding: 0, textDecoration: 'underline' }}
              >
                Back to Sign In
              </button>
            </span>
          )}
        </div>
      </div>

      <style>{`
        @keyframes mascModalScaleIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
