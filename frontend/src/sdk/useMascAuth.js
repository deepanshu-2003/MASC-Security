import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { loadReCaptcha } from './recaptcha';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

const MascAuthContext = createContext(null);

export function MascAuthProvider({ children, options }) {
  const auth = useMascAuthShared(options);
  return React.createElement(MascAuthContext.Provider, { value: auth }, children);
}

export function useMascAuth(options = {}) {
  const context = useContext(MascAuthContext);
  if (context) {
    return context;
  }
  return useMascAuthShared(options);
}

function useMascAuthShared(options = {}) {
  const { onLogin, onLogout, onError, onSessionExpired } = options;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Admin Authentication State
  const [admin, setAdmin] = useState(null);
  const adminRef = useRef(admin);
  adminRef.current = admin;

  const [token, setToken] = useState(localStorage.getItem('masc_token') || null);
  const [organization, setOrganization] = useState(null);
  const [setupRequired, setSetupRequired] = useState(true);
  const [setupCredentials, setSetupCredentials] = useState(null);

  // User (Member) Authentication State
  const [user, setUser] = useState(null);
  const userRef = useRef(user);
  userRef.current = user;

  const [userToken, setUserToken] = useState(localStorage.getItem('masc_user_token') || null);
  const [userSessionToken, setUserSessionToken] = useState(localStorage.getItem('masc_session_token') || null);

  // General States
  const [initLoading, setInitLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sessionExpiredReason, setSessionExpiredReason] = useState(null); // null = no expiry, string = expired message

  // Initialize and check setup requirement and get session/branding
  useEffect(() => {
    const initAuth = async () => {
      setInitLoading(true);
      setLoading(true);
      setError(null);
      try {
        // 1. Check if setup is required
        const setupRes = await fetch(`${API_BASE}/setup/check`);
        if (setupRes.ok) {
          const setupData = await setupRes.json();
          setSetupRequired(setupData.setupRequired);
          if (setupData.setupRequired) {
            // Clear all local storage if setup is required
            localStorage.removeItem('masc_token');
            localStorage.removeItem('masc_admin');
            localStorage.removeItem('masc_user_token');
            localStorage.removeItem('masc_user');
            localStorage.removeItem('masc_session_token');
            setToken(null);
            setAdmin(null);
            setUser(null);
            setUserToken(null);
            setUserSessionToken(null);
          }
        }

        // 2. Fetch public branding settings
        const brandRes = await fetch(`${API_BASE}/branding`);
        if (brandRes.ok) {
          const brandData = await brandRes.json();
          setOrganization(brandData);
          applyBranding(brandData);
        }

        // 3. Validate stored admin token against the backend before trusting it.
        //    This catches: expired tokens, old tokens without adminLogin claim,
        //    revoked tokens, and any other invalid state.
        const storedAdmin = localStorage.getItem('masc_admin');
        const currentAdminToken = localStorage.getItem('masc_token');
        if (currentAdminToken && storedAdmin) {
          try {
            const validateRes = await fetch(`${API_BASE}/admin/dashboard-stats`, {
              headers: { Authorization: `Bearer ${currentAdminToken}` }
            });
            if (validateRes.ok) {
              // Token is valid — restore admin session
              const parsed = JSON.parse(storedAdmin);
              if (parsed && !parsed.role) parsed.role = 'admin';
              setAdmin(parsed);
            } else {
              // Token rejected by backend (expired, wrong claims, etc.) — force re-login
              console.warn('[SDK AUTH] Stored admin token rejected by backend — clearing session.');
              localStorage.removeItem('masc_token');
              localStorage.removeItem('masc_admin');
              setAdmin(null);
              setToken(null);
            }
          } catch (_) {
            // Network error during validation — clear session to be safe
            localStorage.removeItem('masc_token');
            localStorage.removeItem('masc_admin');
            setAdmin(null);
            setToken(null);
          }
        } else if (storedAdmin || currentAdminToken) {
          // One part missing — clear both to enforce consistency
          localStorage.removeItem('masc_token');
          localStorage.removeItem('masc_admin');
          setAdmin(null);
          setToken(null);
        }


        // 4. Populate stored member user if user token matches
        const storedUser = localStorage.getItem('masc_user');
        const currentUserToken = localStorage.getItem('masc_user_token');
        if (currentUserToken && storedUser) {
          setUser(JSON.parse(storedUser));
        } else if (storedUser || currentUserToken) {
          // If token or user is missing, clear all to automatically logout
          localStorage.removeItem('masc_user');
          localStorage.removeItem('masc_user_token');
          localStorage.removeItem('masc_session_token');
          setUser(null);
          setUserToken(null);
          setUserSessionToken(null);
        }
      } catch (err) {
        console.error('[SDK AUTH] Initialization error:', err);
        setError('Connection to security server failed');
        onError?.(err);
      } finally {
        setInitLoading(false);
        setLoading(false);
      }
    };

    initAuth();
  }, [token, userToken]);

  // Periodically and event-driven check for token existence.
  // If user details exist but token is missing, automatically log out.
  useEffect(() => {
    const verifyTokenPresence = () => {
      const storedAdmin = localStorage.getItem('masc_admin');
      const currentAdminToken = localStorage.getItem('masc_token');
      
      // 1. Admin login sync
      if (currentAdminToken && storedAdmin && !adminRef.current) {
        const parsed = JSON.parse(storedAdmin);
        setAdmin(parsed);
        setToken(currentAdminToken);
        optionsRef.current.onLogin?.(parsed);
      }
      // Admin logout sync
      else if (storedAdmin && !currentAdminToken) {
        localStorage.removeItem('masc_token');
        localStorage.removeItem('masc_admin');
        setAdmin(null);
        setToken(null);
        optionsRef.current.onLogout?.();
      }

      const storedUser = localStorage.getItem('masc_user');
      const currentUserToken = localStorage.getItem('masc_user_token');
      const currentSessionToken = localStorage.getItem('masc_session_token');
      
      // 2. User login sync
      if (currentUserToken && storedUser && !userRef.current) {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        setUserToken(currentUserToken);
        setUserSessionToken(currentSessionToken);
        optionsRef.current.onLogin?.(parsed);
      }
      // User logout sync
      else if (storedUser && !currentUserToken) {
        localStorage.removeItem('masc_user');
        localStorage.removeItem('masc_user_token');
        localStorage.removeItem('masc_session_token');
        setUser(null);
        setUserToken(null);
        setUserSessionToken(null);
        optionsRef.current.onLogout?.();
      }
    };

    // Run verification immediately
    verifyTokenPresence();

    // Set up listeners for storage change and window focus
    window.addEventListener('storage', verifyTokenPresence);
    window.addEventListener('focus', verifyTokenPresence);

    // Also run a periodic check every 2 seconds
    const interval = setInterval(verifyTokenPresence, 2000);

    return () => {
      window.removeEventListener('storage', verifyTokenPresence);
      window.removeEventListener('focus', verifyTokenPresence);
      clearInterval(interval);
    };
  }, []);

  // Intercept window.fetch to inject simulated telemetry headers and handle session expiration/hijacking
  // Registered synchronously to prevent any race condition during React's mount/render lifecycle
  if (typeof window !== 'undefined' && !window.fetch.isMascIntercepted) {
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      init = init || {};
      init.headers = init.headers || {};

      let url = typeof input === 'string' ? input : input?.url || '';
      if (url.startsWith(API_BASE) || url.includes('/api/v1') || url.startsWith('/api/')) {
        // Calculate real device characteristics dynamically from browser context
        const ua = navigator.userAgent.toLowerCase();
        let browser = 'Chrome';
        if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
          browser = 'Brave';
        } else if (ua.includes('firefox')) {
          browser = 'Firefox';
        } else if (ua.includes('safari') && !ua.includes('chrome')) {
          browser = 'Safari';
        } else if (ua.includes('edge') || ua.includes('edg')) {
          browser = 'Edge';
        }

        let os = 'Windows';
        if (ua.includes('macintosh') || ua.includes('mac os')) os = 'macOS';
        else if (ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
        else if (ua.includes('android')) os = 'Android';
        else if (ua.includes('linux')) os = 'Linux';

        const deviceName = `${browser} on ${os}`;
        
        const clientIp = localStorage.getItem('masc_client_ip');
        if (clientIp) {
          if (init.headers instanceof Headers) {
            init.headers.set('x-masc-client-ip', clientIp);
          } else {
            init.headers['x-masc-client-ip'] = clientIp;
          }
        }

        if (deviceName) {
          if (init.headers instanceof Headers) {
            init.headers.set('x-masc-device-name', deviceName);
          } else {
            init.headers['x-masc-device-name'] = deviceName;
          }
        }
        
        const sessionToken = localStorage.getItem('masc_session_token');
        if (sessionToken) {
          if (init.headers instanceof Headers) {
            init.headers.set('x-session-token', sessionToken);
          } else {
            init.headers['x-session-token'] = sessionToken;
          }
        }
      }

      const response = await originalFetch(input, init);

      if (response.status === 401 || response.status === 403) {
        try {
          const clone = response.clone();
          const data = await clone.json();
          const errCode = data.code || '';
          const errStr = (data.error || data.message || '').toLowerCase();
          const isTokenExpired = errCode === 'TOKEN_EXPIRED' || errCode === 'ADMIN_TOKEN_EXPIRED';
          const isHijack = errCode === 'SESSION_HIJACK_DETECTED' || errStr.includes('hijack');
          const isSessionInvalid = errCode === 'SESSION_INVALID' || errCode === 'FORCE_LOGOUT';

          if (isTokenExpired || isHijack || isSessionInvalid) {
            const currentAdminToken = localStorage.getItem('masc_token');
            const currentUserToken = localStorage.getItem('masc_user_token');
            const headers = init.headers || {};
            const authHeader = headers['Authorization'] || headers['authorization'] || '';
            const passedToken = authHeader.startsWith('Bearer') ? authHeader.split(' ')[1] : null;

            if (passedToken && passedToken === currentAdminToken) {
              localStorage.removeItem('masc_token');
              localStorage.removeItem('masc_admin');
              setToken(null);
              setAdmin(null);
              if (isTokenExpired) setSessionExpiredReason('Your session has expired. Please sign in again.');
              optionsRef.current.onSessionExpired?.();
              optionsRef.current.onLogout?.();
            } else if (passedToken && passedToken === currentUserToken) {
              localStorage.removeItem('masc_user');
              localStorage.removeItem('masc_user_token');
              localStorage.removeItem('masc_session_token');
              localStorage.removeItem('masc_client_ip');
              localStorage.removeItem('masc_device_name');
              setUser(null);
              setUserToken(null);
              setUserSessionToken(null);
              if (isTokenExpired) {
                setSessionExpiredReason('Your session has expired. Please sign in again.');
              } else if (isHijack) {
                setSessionExpiredReason('Security alert: Session terminated due to suspicious activity.');
              } else if (isSessionInvalid) {
                setSessionExpiredReason(errCode === 'FORCE_LOGOUT' ? 'Your session was terminated by an administrator.' : 'Session expired or revoked.');
              }
              optionsRef.current.onSessionExpired?.();
              optionsRef.current.onLogout?.();
            }
          }
        } catch (e) {
          try {
            const currentAdminToken = localStorage.getItem('masc_token');
            const currentUserToken = localStorage.getItem('masc_user_token');
            const headers = init.headers || {};
            const authHeader = headers['Authorization'] || headers['authorization'] || '';
            const passedToken = authHeader.startsWith('Bearer') ? authHeader.split(' ')[1] : null;

            if (passedToken && passedToken === currentAdminToken) {
              localStorage.removeItem('masc_token');
              localStorage.removeItem('masc_admin');
              setToken(null);
              setAdmin(null);
            } else if (passedToken && passedToken === currentUserToken) {
              localStorage.removeItem('masc_user');
              localStorage.removeItem('masc_user_token');
              localStorage.removeItem('masc_session_token');
              localStorage.removeItem('masc_client_ip');
              localStorage.removeItem('masc_device_name');
              setUser(null);
              setUserToken(null);
              setUserSessionToken(null);
              optionsRef.current.onLogout?.();
            }
          } catch (err) {
            console.error('Fetch recovery cleanup failed:', err.message);
          }
        }
      }
      return response;
    };
    window.fetch.isMascIntercepted = true;
  }

  const applyBranding = (org) => {
    if (!org) return;
    document.documentElement.style.setProperty('--primary-start', org.primaryGradientStart || '#7C3AED');
    document.documentElement.style.setProperty('--primary-end', org.primaryGradientEnd || '#A855F7');
    document.documentElement.style.setProperty('--secondary-start', org.secondaryGradientStart || '#9333EA');
    document.documentElement.style.setProperty('--secondary-end', org.secondaryGradientEnd || '#C084FC');
    document.documentElement.style.setProperty('--accent', org.accentColor || '#8B5CF6');
  };

  // ==========================================
  // ADMIN AUTH METHODS
  // ==========================================

  const login = async (email, password) => {
    setLoading(true);
    setError(null);
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

      const response = await fetch(`${API_BASE}/auth/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, recaptchaToken })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.step === 'otp_verification') {
        return data;
      }

      const adminData = data.admin || {};
      if (!adminData.role) adminData.role = 'admin';
      
      localStorage.setItem('masc_token', data.token);
      localStorage.setItem('masc_admin', JSON.stringify(adminData));
      setToken(data.token);
      setAdmin(adminData);
      
      if (data.organization) {
        setOrganization(data.organization);
        applyBranding(data.organization);
      }
      return data;
    } catch (err) {
      setError(err.message);
      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const verifyAdminOtp = async (tempToken, otp) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/admin/login/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tempToken, otp })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'OTP verification failed');
      }

      const adminData = data.admin || {};
      if (!adminData.role) adminData.role = 'admin';
      
      localStorage.setItem('masc_token', data.token);
      localStorage.setItem('masc_admin', JSON.stringify(adminData));
      setToken(data.token);
      setAdmin(adminData);
      
      if (data.organization) {
        setOrganization(data.organization);
        applyBranding(data.organization);
      }
      return data;
    } catch (err) {
      setError(err.message);
      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };



  const logout = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/auth/admin/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (err) {
      console.error('Logout request failed:', err);
    } finally {
      localStorage.removeItem('masc_token');
      localStorage.removeItem('masc_admin');
      setToken(null);
      setAdmin(null);
      setLoading(false);
    }
  };

  const runSetupWizard = async (wizardData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/setup/wizard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wizardData)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Setup failed');
      }

      if (data.defaultCredentials) {
        setSetupCredentials(data.defaultCredentials);
      }
      setSetupRequired(false);
      return await login(wizardData.adminEmail, wizardData.adminPassword);
    } catch (err) {
      setError(err.message);
      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateBranding = async (brandingData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/branding`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(brandingData)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update branding');
      }

      setOrganization(data);
      applyBranding(data);
      return data;
    } catch (err) {
      setError(err.message);
      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // ==========================================
  // USER (MEMBER) AUTH METHODS
  // ==========================================

  const userLogin = async (email, password, recaptchaToken) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, recaptchaToken })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store states
      localStorage.setItem('masc_user_token', data.token);
      localStorage.setItem('masc_user', JSON.stringify(data.user));
      setUserToken(data.token);
      setUser(data.user);

      if (data.sessionToken) {
        localStorage.setItem('masc_session_token', data.sessionToken);
        setUserSessionToken(data.sessionToken);
      }

      onLogin?.(data.user);
      return data;
    } catch (err) {
      setError(err.message);
      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const userLogout = async () => {
    setLoading(true);
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${userToken}`,
          'x-session-token': userSessionToken || ''
        }
      }).catch(err => console.error('[SDK AUTH] Backend logout request failed:', err.message));
    } catch (err) {
      console.error('[SDK AUTH] User logout failed:', err);
    } finally {
      localStorage.removeItem('masc_user');
      localStorage.removeItem('masc_user_token');
      localStorage.removeItem('masc_session_token');
      
      setUser(null);
      setUserToken(null);
      setUserSessionToken(null);

      onLogout?.();
      setLoading(false);
    }
  };

  const userRegister = async (registerData) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerData)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      return data;
    } catch (err) {
      setError(err.message);
      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handleSessionExpired = () => {
    localStorage.removeItem('masc_user');
    localStorage.removeItem('masc_user_token');
    localStorage.removeItem('masc_session_token');
    setUser(null);
    setUserToken(null);
    setUserSessionToken(null);
    onSessionExpired?.();
  };

  const changePassword = async (currentPassword, newPassword) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
          'x-session-token': userSessionToken || ''
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update password');
      }
      return data;
    } catch (err) {
      setError(err.message);
      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (firstName, lastName) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
          'x-session-token': userSessionToken || ''
        },
        body: JSON.stringify({ firstName, lastName })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to update profile');
      }

      localStorage.setItem('masc_user', JSON.stringify(data.user));
      setUser(data.user);
      return data;
    } catch (err) {
      setError(err.message);
      onError?.(err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    // Admin state
    admin,
    setAdmin,
    token,
    organization,
    setupRequired,
    setupCredentials,
    setSetupCredentials,
    login,
    verifyAdminOtp,
    logout,
    runSetupWizard,
    updateBranding,


    // User state
    user,
    userToken,
    userSessionToken,
    userLogin,
    userLogout,
    userRegister,
    handleSessionExpired,
    changePassword,
    updateProfile,

    // General state
    loading: initLoading,
    error,
    sessionExpiredReason,
    clearSessionExpiredReason: () => setSessionExpiredReason(null)
  };
}
