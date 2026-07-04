import React, { useState, useEffect } from 'react';
import { useMascAuth } from './useMascAuth';
import { useMascToast } from './MascToast';
import { MascAuthModal } from './MascAuthModal';

/**
 * Route Permission Guard evaluating route-level access rules defined by the administrator.
 */
export function MascRoutePermissionGuard({ path, children }) {
  const { userToken, userSessionToken, loading: authLoading } = useMascAuth();
  const { addToast } = useMascToast();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

  const checkAccess = async () => {
    if (authLoading) return;
    if (!userToken) {
      setAllowed(false);
      setChecking(false);
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(`${API_BASE}/rules/evaluate?path=${encodeURIComponent(path)}`, {
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'x-session-token': userSessionToken || localStorage.getItem('masc_session_token') || ''
        }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to evaluate route rules');
      }
      
      if (data.routes && data.routes[path] !== undefined) {
        setAllowed(data.routes[path]);
      } else {
        setAllowed(true);
      }
    } catch (err) {
      setErrorMsg(err.message);
      setAllowed(false);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkAccess();
  }, [path, userToken, authLoading]);

  if (authLoading || checking) {
    return (
      <div style={{ textAlign: 'center', padding: '80px', color: 'var(--text-muted)' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '50%',
          border: '3px solid var(--border)', borderTopColor: 'var(--primary-start)',
          animation: 'spin 1s linear infinite', margin: '0 auto 16px'
        }}></div>
        <p style={{ fontSize: '15px', fontWeight: '600' }}>Evaluating Route Access Rules...</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div style={{
        maxWidth: '560px',
        margin: '60px auto',
        textAlign: 'center',
        animation: 'mascGuardFadeIn 0.4s ease-out'
      }}>
        <div className="glass-panel" style={{ padding: '40px', borderRadius: 'var(--radius-xl)' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '28px',
            margin: '0 auto 20px auto',
            boxShadow: '0 4px 14px rgba(239, 68, 68, 0.15)'
          }}>
            🚫
          </div>

          <h3 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '10px', color: 'var(--text-dark)' }}>Access Blocked by Route Policy</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '28px' }}>
            Your security profile does not satisfy the Route Access rules defined by your administrator for the path: <code style={{ color: 'var(--primary-start)', background: 'rgba(0,0,0,0.02)', padding: '2px 6px', borderRadius: '4px' }}>{path}</code>
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <button
              onClick={() => setAuthModalOpen(true)}
              className="btn btn-primary"
              style={{ padding: '10px 24px', fontSize: '13px', fontWeight: '700' }}
            >
              🔐 Authenticate Now
            </button>
          </div>
        </div>

        <MascAuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          defaultView="login"
          onSuccess={() => {
            window.location.reload();
          }}
        />

        <style>{`
          @keyframes mascGuardFadeIn {
            from { opacity: 0; transform: translateY(15px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    );
  }

  return <>{children}</>;
}
