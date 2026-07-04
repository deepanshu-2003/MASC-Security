import React, { useState } from 'react';
import { useMascToast } from './MascToast';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export function MascForgotPassword({ onBackToLogin }) {
  const { addToast } = useMascToast();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    

    if (!email.trim()) {
      addToast('Please input your email address', 'error');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch reset link');
      }

      addToast('If the email is registered, a reset link will appear in the server logs.', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '32px', borderRadius: 'var(--radius-xl)', maxWidth: '400px', margin: '40px auto', textAlign: 'left' }}>
      <h3 style={{ fontSize: '24px', fontWeight: '800', marginBottom: '8px', textAlign: 'center' }}>Recover Password</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '24px', textAlign: 'center' }}>
        We will dispatch a password recovery link to your email.
      </p>





      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', fontWeight: '600' }}>Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value);  }}
            placeholder="johndoe@email.com"
            style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', outline: 'none' }}
            required
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: '8px' }}
          disabled={loading}
        >
          {loading ? 'Dispatching...' : 'Send Recovery Link'}
        </button>

        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <button
            type="button"
            onClick={onBackToLogin}
            style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
          >
            Back to Sign In
          </button>
        </div>

      </form>
    </div>
  );
}
