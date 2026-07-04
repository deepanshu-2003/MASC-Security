import React, { useState, useEffect } from 'react';
import { useMascAuth } from './useMascAuth';
import { MascUserLogin } from './MascUserLogin';
import { MascUserRegister } from './MascUserRegister';
import { MascForgotPassword } from './MascForgotPassword';
import { MascResetPassword } from './MascResetPassword';
import { MascDynamicForm } from './MascDynamicForm';
import { useMascToast } from './MascToast';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';

export function MascUserPortal({
  homeComponent,
  children,
  onLogin,
  onLogout,
  onError,
  customToggles = [],
  onToggleChange,
  dropdownOptions = [],
  onOptionSelect,
  enableProfileSettings = true
}) {
  const { addToast } = useMascToast();
  const {
    user,
    userToken,
    userSessionToken,
    organization,
    loading,
    userLogout,
    changePassword,
    updateProfile,
    sessionExpiredReason,
    clearSessionExpiredReason
  } = useMascAuth({
    onLogin: (u) => {
      console.log('Successfully logged in user:', u.email);
      onLogin?.(u);
    },
    onLogout: () => {
      console.log('User signed out');
      onLogout?.();
    },
    onError: (err) => {
      console.error('Authentication boundary error:', err.message);
      onError?.(err);
    }
  });

  // Active view state (defaults to the matching pathname option, first custom option, or 'profile')
  const [currentView, setCurrentView] = useState(() => {
    const pathname = typeof window !== 'undefined' ? window.location.pathname : '/';
    const matchedOpt = (dropdownOptions || []).find(opt => opt.value === pathname);
    if (matchedOpt) {
      return matchedOpt.value;
    }
    if (pathname === '/profile') {
      return 'profile';
    }
    if (dropdownOptions && dropdownOptions.length > 0) {
      return dropdownOptions[0].value;
    }
    return 'profile';
  });

  // Dropdown open state
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Auth sub-views
  const [userView, setUserView] = useState('login'); // 'login', 'register', 'forgot', 'reset'
  const [resetToken, setResetToken] = useState(null);

  // Show toast and redirect to login when session expires or is terminated
  useEffect(() => {
    if (sessionExpiredReason) {
      addToast(sessionExpiredReason, 'error');
      clearSessionExpiredReason();
      setUserView('login');
    }
  }, [sessionExpiredReason]);

  // Proactive Session Health Polling (runs every 30s)
  useEffect(() => {
    if (!userToken || !userSessionToken) return;

    const pollSession = async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/validate-session`, {
          headers: {
            Authorization: `Bearer ${userToken}`,
            'x-session-token': userSessionToken
          }
        });
        if (res.status === 401 || res.status === 403) {
          // Handled automatically by our fetch interceptor
        }
      } catch (err) {
        // Silent catch for network issues
      }
    };

    pollSession();
    const interval = setInterval(pollSession, 30 * 1000);
    return () => clearInterval(interval);
  }, [userToken, userSessionToken]);

  // UI customization options (persisted via localStorage)
  const [showAvatar, setShowAvatar] = useState(() => {
    const val = localStorage.getItem('masc_ui_show_avatar');
    return val !== null ? JSON.parse(val) : true;
  });
  const [showFirstName, setShowFirstName] = useState(() => {
    const val = localStorage.getItem('masc_ui_show_firstname');
    return val !== null ? JSON.parse(val) : true;
  });
  const [darkMode, setDarkMode] = useState(() => {
    const val = localStorage.getItem('masc_ui_darkmode');
    return val !== null ? JSON.parse(val) : false;
  });

  // User dynamically-added toggles
  const [userCustomToggles, setUserCustomToggles] = useState(() => {
    const val = localStorage.getItem('masc_ui_user_custom_toggles');
    return val !== null ? JSON.parse(val) : [];
  });

  // Dynamic custom toggle states lookup map
  const [customToggleStates, setCustomToggleStates] = useState({});
  const [newToggleLabel, setNewToggleLabel] = useState('');

  // Name editing states
  const [isEditingName, setIsEditingName] = useState(false);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [nameLoading, setNameLoading] = useState(false);
  const [nameSuccess, setNameSuccess] = useState('');
  const [nameError, setNameError] = useState('');

  // Dynamic custom profile attributes
  const [profileFields, setProfileFields] = useState([]);
  const [profileValues, setProfileValues] = useState({});
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [isEditingDetails, setIsEditingDetails] = useState(false);

  // Change password form states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [pwdError, setPwdError] = useState('');

  // Save UI options to localStorage and update body classes
  useEffect(() => {
    localStorage.setItem('masc_ui_show_avatar', JSON.stringify(showAvatar));
  }, [showAvatar]);

  useEffect(() => {
    localStorage.setItem('masc_ui_show_firstname', JSON.stringify(showFirstName));
  }, [showFirstName]);

  useEffect(() => {
    localStorage.setItem('masc_ui_darkmode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark-theme');
    } else {
      document.documentElement.classList.remove('dark-theme');
    }
  }, [darkMode]);

  // Initialize and synchronize states for all custom toggles
  useEffect(() => {
    const states = {};
    (customToggles || []).forEach(t => {
      const saved = localStorage.getItem(`masc_ui_custom_${t.name}`);
      states[t.name] = saved !== null ? JSON.parse(saved) : (t.defaultChecked !== undefined ? t.defaultChecked : false);
    });
    userCustomToggles.forEach(t => {
      const saved = localStorage.getItem(`masc_ui_custom_${t.name}`);
      states[t.name] = saved !== null ? JSON.parse(saved) : (t.defaultChecked !== undefined ? t.defaultChecked : false);
    });
    setCustomToggleStates(states);
  }, [customToggles, userCustomToggles]);

  // Sync state values on load/login
  useEffect(() => {
    if (user) {
      setEditFirstName(user.firstName);
      setEditLastName(user.lastName);
      fetchProfileDynamicFields();
    }
  }, [user]);

  // Check URL query parameters on load for reset token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tkn = params.get('resetToken');
    if (tkn) {
      setResetToken(tkn);
      setUserView('reset');
    }
  }, []);

  // Fetch custom dynamic fields definitions & values
  const fetchProfileDynamicFields = async () => {
    if (!userToken) return;
    setProfileLoading(true);
    setProfileError('');
    setProfileSuccess('');
    try {
      const resFields = await fetch(`${API_BASE}/dynamic-fields/placement/profile`);
      const dataFields = await resFields.json();
      if (!resFields.ok) throw new Error(dataFields.error || 'Failed to fetch fields');
      setProfileFields(dataFields.fields || []);

      const resValues = await fetch(`${API_BASE}/dynamic-fields/values`, {
        headers: { Authorization: `Bearer ${userToken}` }
      });
      const dataValues = await resValues.json();
      if (!resValues.ok) throw new Error(dataValues.error || 'Failed to fetch user values');

      const seedValues = {};
      dataFields.fields.forEach(field => {
        seedValues[field.name] = dataValues.values?.[field.name]?.value !== undefined
          ? dataValues.values[field.name].value
          : (field.defaultValue || '');
      });
      setProfileValues(seedValues);
    } catch (err) {
      setProfileError(err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  // Save profile dynamic field values to backend
  const handleSaveProfileFields = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!userToken) return;
    setProfileSaving(true);
    setProfileError('');
    setProfileSuccess('');
    try {
      const res = await fetch(`${API_BASE}/dynamic-fields/values`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`
        },
        body: JSON.stringify({ values: profileValues })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save details');
      }
      setProfileSuccess('Details saved successfully!');
      addToast('Profile details saved.', 'success');
      setIsEditingDetails(false);
      await fetchProfileDynamicFields();
    } catch (err) {
      setProfileError(err.message);
      addToast(err.message, 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  // Handle first/last name update request
  const handleNameUpdate = async (e) => {
    e.preventDefault();
    setNameSuccess('');
    setNameError('');

    if (!editFirstName.trim() || !editLastName.trim()) {
      setNameError('First name and last name are required.');
      return;
    }

    setNameLoading(true);
    try {
      await updateProfile(editFirstName.trim(), editLastName.trim());
      setNameSuccess('Name updated successfully!');
      addToast('Profile name updated.', 'success');
      setIsEditingName(false);
    } catch (err) {
      setNameError(err.message || 'Failed to update profile name.');
      addToast(err.message || 'Failed to update profile name.', 'error');
    } finally {
      setNameLoading(false);
    }
  };

  // Handle password change request
  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    setPwdSuccess('');
    setPwdError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPwdError('All password fields are required.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match.');
      return;
    }

    if (newPassword.length < 6) {
      setPwdError('New password must be at least 6 characters.');
      return;
    }

    setPwdLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwdSuccess('Password changed successfully!');
      addToast('Your security credentials have been updated.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPwdError(err.message || 'Failed to update password.');
      addToast(err.message || 'Incorrect current password.', 'error');
    } finally {
      setPwdLoading(false);
    }
  };

  // Handle interactive addition of custom toggles
  const handleAddCustomToggle = (e) => {
    e.preventDefault();
    if (!newToggleLabel.trim()) return;

    const name = newToggleLabel.toLowerCase().replace(/[^a-z0-9]/g, '_');
    if (
      userCustomToggles.some(t => t.name === name) ||
      (customToggles || []).some(t => t.name === name)
    ) {
      addToast('A toggle with this name already exists.', 'error');
      return;
    }

    const newToggleObj = { name, label: newToggleLabel.trim(), defaultChecked: false };
    const updatedUserToggles = [...userCustomToggles, newToggleObj];
    setUserCustomToggles(updatedUserToggles);
    localStorage.setItem('masc_ui_user_custom_toggles', JSON.stringify(updatedUserToggles));

    // Initialize checking state
    setCustomToggleStates(prev => {
      const next = { ...prev, [name]: false };
      localStorage.setItem(`masc_ui_custom_${name}`, JSON.stringify(false));
      onToggleChange?.(name, false);
      return next;
    });

    setNewToggleLabel('');
    addToast(`Added custom toggle "${newToggleLabel.trim()}"`, 'success');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', justifyContent: 'center', alignItems: 'center', background: '#FAFAFC', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="status-dot online" style={{ width: '16px', height: '16px', margin: '0 auto 16px', animation: 'pulse 1.5s infinite' }}></div>
          <h2>Securing MASC Session Pipeline...</h2>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', transition: 'background-color 0.3s ease, color 0.3s ease' }}>

      {/* Dark Theme Styles injection */}
      <style>{`
        .dark-theme {
          --background: #0B0F19;
          --surface: #151D30;
          --surface-hover: #1E293B;
          --text: #94A3B8;
          --text-dark: #F8FAFC;
          --text-muted: #64748B;
          --border: rgba(255, 255, 255, 0.08);
          --border-focus: rgba(124, 58, 237, 0.6);
          --shadow-sm: 0 2px 4px rgba(0, 0, 0, 0.2);
          --shadow-md: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
          --shadow-lg: 0 20px 40px -10px rgba(0, 0, 0, 0.4);
          --shadow-glass: 0 8px 32px 0 rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.05);
        }

        .toggle-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          background: rgba(0, 0, 0, 0.02);
          border: 1px solid var(--border);
        }
        .dark-theme .toggle-container {
          background: rgba(255, 255, 255, 0.01);
        }
        
        .switch {
          position: relative;
          display: inline-block;
          width: 46px;
          height: 24px;
        }
        .switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #CBD5E1;
          transition: .3s;
          border-radius: 24px;
        }
        .slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          bottom: 3px;
          background-color: white;
          transition: .3s;
          border-radius: 50%;
        }
        input:checked + .slider {
          background: var(--primary-gradient);
        }
        input:checked + .slider:before {
          transform: translateX(22px);
        }
        
        .edit-input {
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          background: rgba(255, 255, 255, 0.6);
          font-size: 14px;
          color: var(--text-dark);
          outline: none;
        }
        .dark-theme .edit-input {
          background: rgba(21, 29, 48, 0.6);
        }

        /* Profile Dropdown Header Styles */
        .profile-trigger {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          padding: 6px 12px;
          border-radius: var(--radius-sm);
          border: 1px solid transparent;
          transition: all 0.2s;
          user-select: none;
        }
        .profile-trigger:hover {
          background: rgba(0, 0, 0, 0.04);
          border-color: var(--border);
        }
        .dark-theme .profile-trigger:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .header-dropdown-menu {
          position: absolute;
          right: 0;
          top: 100%;
          margin-top: 8px;
          width: 210px;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          box-shadow: var(--shadow-md);
          display: flex;
          flex-direction: column;
          padding: 6px 0;
          z-index: 999;
          animation: slideDown 0.15s ease-out;
        }
        .dark-theme .header-dropdown-menu {
          background: rgba(21, 29, 48, 0.95);
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .dropdown-item {
          padding: 10px 16px;
          font-size: 14px;
          font-weight: 600;
          color: var(--text-dark);
          text-align: left;
          border: none;
          background: transparent;
          cursor: pointer;
          transition: background-color 0.2s;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .dropdown-item:hover {
          background: rgba(0, 0, 0, 0.05);
          color: var(--primary-start);
        }
        .dark-theme .dropdown-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--primary-start);
        }
        .dropdown-divider {
          height: 1px;
          background: var(--border);
          margin: 6px 0;
        }
      `}</style>

      {/* Clicking outside dropdown closes it overlay */}
      {dropdownOpen && (
        <div
          onClick={() => setDropdownOpen(false)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 998, background: 'transparent' }}
        />
      )}

      {/* Background Decorative Blur Blobs */}
      <div className="bg-blobs">
        <div className="blob blob-1" style={{ opacity: darkMode ? 0.08 : 0.15 }}></div>
        <div className="blob blob-2" style={{ opacity: darkMode ? 0.08 : 0.15 }}></div>
      </div>

      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 40px', background: 'rgba(255, 255, 255, 0.8)', backdropFilter: 'blur(12px)', borderBottom: '1px solid var(--border)', zIndex: 1000, transition: 'background-color 0.3s' }} className={darkMode ? 'dark-theme' : ''}>
        <div className="logo-container" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className="logo-icon" style={{
            width: '36px', height: '36px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--primary-gradient)',
            color: 'white',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', fontWeight: '800'
          }}>
            {organization?.name ? organization.name[0].toUpperCase() : 'M'}
          </div>
          <div>
            <span className="logo-text" style={{ fontSize: '16px', fontWeight: '800', color: 'var(--text-dark)' }}>
              {organization?.name || 'MASC Security'}
            </span>
            <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginTop: '-2px' }}>Powered by MASC Security</span>
          </div>
        </div>

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', position: 'relative' }}>
            <div className="profile-trigger" onClick={() => setDropdownOpen(!dropdownOpen)}>
              {showFirstName && (
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-dark)' }}>
                  Hi, {user.firstName}
                </span>
              )}
              {showAvatar && (
                <div style={{
                  width: '36px', height: '36px',
                  borderRadius: '50%',
                  background: 'var(--primary-gradient)',
                  color: 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '14px', fontWeight: '700'
                }}>
                  {user.firstName[0].toUpperCase()}{user.lastName[0].toUpperCase()}
                </div>
              )}
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>▼</span>
            </div>

            {/* Profile Dropdown Menu */}
            {dropdownOpen && (
              <div className="header-dropdown-menu">
                {enableProfileSettings && (
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      setCurrentView('profile');
                      if (typeof window !== 'undefined') {
                        window.history.pushState({}, '', '/profile');
                      }
                      setDropdownOpen(false);
                    }}
                  >
                    👤 Profile Settings
                  </button>
                )}

                {/* Custom Developer Options */}
                {dropdownOptions.map(opt => (
                  <button
                    key={opt.value}
                    className="dropdown-item"
                    onClick={() => {
                      setCurrentView(opt.value);
                      if (typeof window !== 'undefined') {
                        const path = opt.value === 'home' ? '/' : opt.value;
                        window.history.pushState({}, '', path);
                      }
                      setDropdownOpen(false);
                      onOptionSelect?.(opt.value);
                    }}
                  >
                    {opt.label}
                  </button>
                ))}

                <div className="dropdown-divider" />
                <button
                  className="dropdown-item"
                  onClick={() => {
                    setDropdownOpen(false);
                    userLogout();
                  }}
                  style={{ color: 'var(--danger)' }}
                >
                  🚪 Sign Out
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Main Content View */}
      <main style={{ flex: 1, padding: '32px 20px', maxWidth: '800px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', zIndex: 10 }}>
        {user ? (
          /* LOGGED IN USER INTERFACE */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {currentView === 'profile' && enableProfileSettings ? (
              /* A. PROFILE & SETTINGS VIEW */
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

                {/* 1. Name & details card */}
                <div className="glass-panel" style={{ padding: '32px', display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {showAvatar && (
                    <div style={{
                      width: '80px', height: '80px',
                      borderRadius: '50%',
                      background: 'var(--primary-gradient)',
                      color: 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '28px', fontWeight: '800',
                      boxShadow: 'var(--shadow-md)',
                      flexShrink: 0
                    }}>
                      {user.firstName[0].toUpperCase()}{user.lastName[0].toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: '240px' }}>
                    <span className="badge" style={{ marginBottom: '8px' }}>User Portal</span>

                    {isEditingName ? (
                      <form onSubmit={handleNameUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '4px' }}>
                        {nameError && <div style={{ color: 'var(--danger)', fontSize: '12px', fontWeight: '600' }}>{nameError}</div>}
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <input
                            type="text"
                            placeholder="First Name"
                            className="edit-input"
                            value={editFirstName}
                            onChange={(e) => setEditFirstName(e.target.value)}
                            style={{ flex: 1 }}
                          />
                          <input
                            type="text"
                            placeholder="Last Name"
                            className="edit-input"
                            value={editLastName}
                            onChange={(e) => setEditLastName(e.target.value)}
                            style={{ flex: 1 }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button type="submit" className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '12px' }} disabled={nameLoading}>
                            {nameLoading ? 'Saving...' : 'Save Name'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => { setIsEditingName(false); setEditFirstName(user.firstName); setEditLastName(user.lastName); }}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                          <h1 style={{ fontSize: '26px', fontWeight: '800', margin: 0, color: 'var(--text-dark)' }}>
                            {user.firstName} {user.lastName}
                          </h1>
                          <button onClick={() => setIsEditingName(true)} style={{ border: 'none', background: 'transparent', color: 'var(--primary-start)', cursor: 'pointer', fontSize: '13px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            ✏️ Edit Name
                          </button>
                        </div>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          Email: <strong style={{ color: 'var(--text-dark)' }}>{user.email}</strong>
                        </p>
                        <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                          Mobile: <strong style={{ color: 'var(--text-dark)' }}>{user.mobile || 'Not set'}</strong> | Role: <span style={{ textTransform: 'uppercase', fontWeight: '700', color: 'var(--primary-start)' }}>{user.role}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 2. Profile Details Form & Display */}
                {profileFields.length > 0 && (
                  <div className="glass-panel" style={{ padding: '32px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
                      <h3 style={{ fontSize: '18px', fontWeight: '750', color: 'var(--text-dark)', margin: 0 }}>
                        📋 Details
                      </h3>
                      {!isEditingDetails && profileFields.some(f => !f.readOnly) && (
                        <button
                          onClick={() => setIsEditingDetails(true)}
                          className="btn btn-secondary"
                          style={{ padding: '6px 14px', fontSize: '12px' }}
                        >
                          ✏️ Edit Details
                        </button>
                      )}
                    </div>

                    {profileError && (
                      <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px', marginBottom: '16px' }}>
                        {profileError}
                      </div>
                    )}
                    {profileSuccess && (
                      <div style={{ padding: '10px 14px', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.25)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '13px', marginBottom: '16px' }}>
                        {profileSuccess}
                      </div>
                    )}

                    {profileLoading ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                        Loading details...
                      </div>
                    ) : isEditingDetails ? (
                      <form onSubmit={handleSaveProfileFields}>
                        <MascDynamicForm
                          fields={profileFields}
                          values={profileValues}
                          onChange={(name, val) => setProfileValues(prev => ({ ...prev, [name]: val }))}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => {
                              setIsEditingDetails(false);
                              fetchProfileDynamicFields(); // reset
                            }}
                            style={{ padding: '10px 24px' }}
                          >
                            Cancel
                          </button>
                          <button type="submit" className="btn btn-primary" style={{ padding: '10px 24px' }} disabled={profileSaving}>
                            {profileSaving ? 'Saving...' : 'Save Details'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {profileFields.map(field => {
                          const val = profileValues[field.name];
                          return (
                            <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                                {field.label || field.name}
                              </span>
                              <div style={{
                                padding: '12px 16px',
                                background: 'rgba(0,0,0,0.02)',
                                border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-sm)',
                                color: val ? 'var(--text-dark)' : 'var(--text-muted)',
                                fontSize: '14px',
                                fontStyle: val ? 'normal' : 'italic'
                              }}>
                                {Array.isArray(val) ? val.join(', ') : (val || 'Not set')}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* 3. UI Customization Toggles Card */}

                {/* 4. Change Password Card */}
                <div className="glass-panel" style={{ padding: '32px' }}>
                  <h3 style={{ fontSize: '18px', fontWeight: '750', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', color: 'var(--text-dark)' }}>
                    🔑 Change Password
                  </h3>

                  <form onSubmit={handlePasswordUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {pwdError && (
                      <div style={{ padding: '10px 14px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: 'var(--radius-sm)', color: 'var(--danger)', fontSize: '13px', fontWeight: '600' }}>
                        {pwdError}
                      </div>
                    )}
                    {pwdSuccess && (
                      <div style={{ padding: '10px 14px', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.25)', borderRadius: 'var(--radius-sm)', color: 'var(--success)', fontSize: '13px', fontWeight: '600' }}>
                        {pwdSuccess}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)' }}>Current Password</label>
                      <input
                        type="password"
                        placeholder="Enter current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        style={{ padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', outline: 'none', color: 'var(--text-dark)' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)' }}>New Password</label>
                      <input
                        type="password"
                        placeholder="Enter new password (min 6 characters)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        style={{ padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', outline: 'none', color: 'var(--text-dark)' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-muted)' }}>Confirm New Password</label>
                      <input
                        type="password"
                        placeholder="Retype new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        style={{ padding: '12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', outline: 'none', color: 'var(--text-dark)' }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                      <button type="submit" className="btn btn-primary" style={{ padding: '10px 24px', opacity: pwdLoading ? 0.7 : 1 }} disabled={pwdLoading}>
                        {pwdLoading ? 'Updating Password...' : 'Update Password'}
                      </button>
                    </div>
                  </form>
                </div>

              </div>
            ) : (
              /* B. CUSTOM DEVELOPER-DEFINED VIEWS */
              <div>
                {homeComponent ? homeComponent : (
                  typeof children === 'function' ? children(currentView) : children
                )}
              </div>
            )}

          </div>
        ) : (
          /* AUTHENTICATION PAGES (Unauthenticated View) */
          <div style={{ maxWidth: '440px', width: '100%', margin: '0 auto' }}>
            {userView === 'login' && (
              <div>
                <MascUserLogin
                  onLoginSuccess={(data) => {
                    console.log('Logged in successfully:', data);
                    setUserView('login');
                  }}
                  onForgotPasswordClick={() => setUserView('forgot')}
                />
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Don't have an account? </span>
                  <button
                    onClick={() => setUserView('register')}
                    style={{ border: 'none', background: 'transparent', color: 'var(--primary-start)', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}
                  >
                    Register
                  </button>
                </div>
              </div>
            )}

            {userView === 'register' && (
              <div>
                <MascUserRegister
                  onRegisterSuccess={() => setUserView('login')}
                />
                <div style={{ textAlign: 'center', marginTop: '20px' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Already have an account? </span>
                  <button
                    onClick={() => setUserView('login')}
                    style={{ border: 'none', background: 'transparent', color: 'var(--primary-start)', fontWeight: '600', cursor: 'pointer', fontSize: '14px' }}
                  >
                    Sign In
                  </button>
                </div>
              </div>
            )}

            {userView === 'forgot' && (
              <MascForgotPassword
                onBackToLogin={() => setUserView('login')}
              />
            )}

            {userView === 'reset' && (
              <MascResetPassword
                token={resetToken}
                onResetSuccess={() => {
                  setResetToken(null);
                  setUserView('login');
                  window.history.replaceState({}, document.title, '/');
                }}
              />
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ padding: '24px 0', borderTop: '1px solid var(--border)', background: 'rgba(255, 255, 255, 0.5)', backdropFilter: 'blur(8px)', textAlign: 'center', zIndex: 10, transition: 'background-color 0.3s ease' }}>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
          © 2026 Acme Corp. Powered by <strong>MASC Security SDK</strong>.
        </p>
      </footer>
    </div>
  );
}
