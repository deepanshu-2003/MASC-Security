import React, { useState } from 'react';
import { useMascAuth } from './useMascAuth';
import { MascAuthModal } from './MascAuthModal';

/**
 * Route guard component protecting private views/components.
 * Displays a white-labeled warning alert or triggers inline auth overlay if unauthorized.
 */
export function MascRouteGuard({ children, requiredRole }) {
  const { user, userToken, admin, token, loading } = useMascAuth();
  const [authModalOpen, setAuthModalOpen] = useState(false);

  if (loading) {
    return (
      <div style={{ padding: '80px', textAlign: 'center', color: 'var(--text-muted)' }}>
        🛡️ Validating secure credentials context...
      </div>
    );
  }

  // Determine authorization based on requiredRole
  let isAuthorized = false;
  if (requiredRole === 'admin') {
    isAuthorized = !!(admin && token);
  } else if (requiredRole === 'user') {
    isAuthorized = !!(user && userToken);
  } else {
    // Basic auth check (either admin or user is active)
    isAuthorized = !!(userToken || token);
  }

  if (isAuthorized) {
    return <>{children}</>;
  }

  // Render Access Denied Warning Card with premium white-label overlays
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
          🛡️
        </div>

        <h3 style={{ fontSize: '22px', fontWeight: '800', marginBottom: '10px' }}>Security Boundary Enforcement</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: '1.6', marginBottom: '28px' }}>
          Access to this resource requires active authorization credentials. 
          {requiredRole ? ` An assigned role of [${requiredRole.toUpperCase()}] is required to pass.` : ''}
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

      {/* Floating Auth modal triggers on button click */}
      <MascAuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        defaultView="login"
        onSuccess={() => {
          // Success callback triggers route refresh or re-render
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
