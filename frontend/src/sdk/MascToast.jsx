import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function MascToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      {/* Toast Overlay Container */}
      <div style={{
        position: 'fixed',
        top: '24px',
        right: '24px',
        zIndex: 99999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        pointerEvents: 'none',
        maxWidth: '380px',
        width: '100%'
      }}>
        {toasts.map((toast) => {
          let emoji = 'ℹ️';
          let borderGlow = 'rgba(124, 58, 237, 0.3)';
          let iconColor = 'var(--accent)';

          if (toast.type === 'success') {
            emoji = '✅';
            borderGlow = 'rgba(34, 197, 94, 0.4)';
            iconColor = 'var(--success)';
          } else if (toast.type === 'error') {
            emoji = '❌';
            borderGlow = 'rgba(239, 68, 68, 0.4)';
            iconColor = 'var(--danger)';
          } else if (toast.type === 'warning') {
            emoji = '⚠️';
            borderGlow = 'rgba(245, 158, 11, 0.4)';
            iconColor = 'var(--warning)';
          }

          return (
            <div
              key={toast.id}
              style={{
                pointerEvents: 'auto',
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '16px 20px',
                background: 'rgba(255, 255, 255, 0.05)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid var(--border)',
                boxShadow: `0 8px 32px 0 rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(255, 255, 255, 0.03), 0 2px 10px 0 ${borderGlow}`,
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-dark)',
                fontSize: '14px',
                fontWeight: '600',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                animation: 'mascToastSlideIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards'
              }}
            >
              <span style={{ fontSize: '18px', color: iconColor }}>{emoji}</span>
              <span style={{ flex: 1, lineHeight: '1.4' }}>{toast.message}</span>
              <button
                onClick={() => removeToast(toast.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.7,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.opacity = 1}
                onMouseLeave={(e) => e.target.style.opacity = 0.7}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      {/* Insert Global Animation Keyframes into Document */}
      <style>{`
        @keyframes mascToastSlideIn {
          from {
            opacity: 0;
            transform: translateX(120%) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useMascToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useMascToast must be used within a MascToastProvider');
  }
  return context;
}
