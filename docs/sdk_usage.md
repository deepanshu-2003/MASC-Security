# MASC Security Frontend React SDK Usage Guide

The **MASC Security React SDK** provides drop-in React components, hooks, and a JavaScript client to quickly integrate authentication, profile governance, dynamic forms, theme branding, and a client-side encrypted vault.

---

## 🛠️ Installation & Setup

To use the SDK, import components from the SDK directory:

```js
import { 
  MascAuthProvider, 
  MascThemeProvider, 
  useMascAuth 
} from './sdk';
```

### 1. Wrapping the Application Provider
For components and hooks to access authentication and theme state, you must wrap your main application tree with `MascAuthProvider` and `MascThemeProvider`:

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { MascAuthProvider, MascThemeProvider, MascToastProvider } from './sdk';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <MascToastProvider>
      <MascAuthProvider options={{
        onLogin: (user) => console.log('Member logged in:', user),
        onLogout: () => console.log('Member logged out'),
        onSessionExpired: () => alert('Your secure session expired! Please re-login.')
      }}>
        <MascThemeProvider>
          <App />
        </MascThemeProvider>
      </MascAuthProvider>
    </MascToastProvider>
  </React.StrictMode>
);
```

---

## 🔑 UI Components Reference

### 1. Setup Wizard (`MascSetupWizard`)
Displayed automatically if the database has not been initialized. It gathers initial admin credentials, organization name, branding details, and sets up custom colors.

```jsx
import { MascSetupWizard, useMascAuth } from './sdk';

function SetupPage() {
  const { setupRequired, runSetupWizard } = useMascAuth();

  if (!setupRequired) return <p>Database already configured.</p>;

  return (
    <MascSetupWizard 
      onComplete={(result) => {
        console.log('Setup finished, admin logged in:', result);
      }}
      error={null}
    />
  );
}
```

* **Props**:
  - `onComplete`: Callback function triggered after successfully finalizing organization and root admin credentials.
  - `error`: Custom error string to pass down to alert banners if something fails during the request.

---

### 2. Admin Login (`MascAdminLogin`)
Provides a sign-in form specifically configured for platform administrators. Supports two-factor authentication email OTP challenge out of the box.

```jsx
import { MascAdminLogin, useMascAuth } from './sdk';

function AdminLoginPage() {
  const { login, verifyAdminOtp, error } = useMascAuth();

  return (
    <MascAdminLogin 
      onLogin={login}
      verifyAdminOtp={verifyAdminOtp}
      error={error}
    />
  );
}
```

* **Props**:
  - `onLogin`: Async function that submits the email and password parameters.
  - `verifyAdminOtp`: Async function checking the 6-digit OTP code against the server's temp token.
  - `error`: Error state passed directly into the form card layout.

---

### 3. User Login (`MascUserLogin`)
Drop-in login widget for general member authentication. It captures browser telemetry features (e.g. device status, public network flags, IP addresses) and reversed GPS coordinates to submit to the AI risk analyzer.

```jsx
import { MascUserLogin } from './sdk';

function LoginPage() {
  const handleLoginSuccess = (loginData) => {
    console.log('User session authorized:', loginData.user);
    window.location.href = '/dashboard';
  };

  const handleForgotPassword = () => {
    window.location.href = '/forgot-password';
  };

  return (
    <MascUserLogin 
      onLoginSuccess={handleLoginSuccess}
      onForgotPasswordClick={handleForgotPassword}
    />
  );
}
```

* **Props**:
  - `onLoginSuccess`: Callback containing the backend response object (includes JWT `token`, `sessionToken`, and `user` payload).
  - `onForgotPasswordClick`: Function called when clicking the "Forgot Password" link to toggle routing views.

---

### 4. User Registration (`MascUserRegister`)
Renders the standard registration fields (First Name, Last Name, Email, Password, Mobile) alongside any dynamic fields configured by the admin. It handles phone number parsing using `react-phone-number-input` and includes Twilio verification OTP tests.

```jsx
import { MascUserRegister } from './sdk';

function RegisterPage() {
  const handleRegisterSuccess = (res) => {
    alert('Account created successfully! Please sign in.');
    window.location.href = '/login';
  };

  return (
    <MascUserRegister 
      onRegisterSuccess={handleRegisterSuccess}
    />
  );
}
```

---

### 5. Forgot & Reset Password Components
`MascForgotPassword` handles email OTP recovery links, while `MascResetPassword` renders password updates once redirect links are validated.

```jsx
import { MascForgotPassword } from './sdk';

function RecoveryPage() {
  return (
    <MascForgotPassword 
      onBackToLogin={() => window.location.href = '/login'}
    />
  );
}
```

```jsx
import { MascResetPassword } from './sdk';

function ResetPage() {
  // Capture token parameter from query string url: /reset-password?token=XYZ
  const queryParams = new URLSearchParams(window.location.search);
  const token = queryParams.get('token');

  return (
    <MascResetPassword 
      token={token}
      onResetSuccess={() => {
        alert('Password updated!');
        window.location.href = '/login';
      }}
    />
  );
}
```

---

### 6. Auth Modal Overlay (`MascAuthModal`)
Wraps the login, registration, and forgot password frames inside a blurry portal layer (`backdrop-filter`) to trigger inline sign-in dialogs without loading new pages.

```jsx
import React, { useState } from 'react';
import { MascAuthModal } from './sdk';

function HomeLandingPage() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div>
      <h1>Welcome to the Platform</h1>
      <button onClick={() => setModalOpen(true)}>Secure Login</button>

      <MascAuthModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultView="login"
        onSuccess={() => {
          setModalOpen(false);
          window.location.reload();
        }}
      />
    </div>
  );
}
```

---

### 7. User Portal (`MascUserPortal`)
An all-in-one member console component. It automatically renders sidebar navigation menus including:
- **Vault Collection Viewer**: View, edit, read, and delete records based on authorization scopes.
- **Session Intelligence**: Map view showing geolocated login locations, device types, active VPN indicators, and options to revoke specific active sessions.
- **Profile Configuration**: Form options for modifying custom fields, managing first/last name, and updating user passwords.

```jsx
import { MascUserPortal } from './sdk';

function Dashboard() {
  return (
    <MascUserPortal 
      enableProfileSettings={true}
      homeComponent={<div>Welcome to your dashboard home!</div>}
      onLogout={() => window.location.href = '/'}
    />
  );
}
```

---

### 8. Secure Route Guards (`MascRouteGuard` & `MascRoutePermissionGuard`)
Protect private pages at the frontend application router.

- **`MascRouteGuard`**: Inspects local auth tokens. If unauthenticated, displays an "Access Denied" boundary cards and includes a trigger to open the `MascAuthModal`.
- **`MascRoutePermissionGuard`**: Validates the path dynamically against the organization's backend routing policies (`GET /rules/evaluate`).

```jsx
import { MascRouteGuard, MascRoutePermissionGuard } from './sdk';
import SecureDataView from './SecureDataView';

function AppRouter() {
  return (
    <div>
      {/* Protects page ensuring user has 'user' or 'admin' auth token */}
      <MascRouteGuard requiredRole="user">
        {/* Further checks backend route rules for path '/sensitive-data' */}
        <MascRoutePermissionGuard path="/sensitive-data">
          <SecureDataView />
        </MascRoutePermissionGuard>
      </MascRouteGuard>
    </div>
  );
}
```

---

## ⚓ Hooks & Context Reference

### 1. `useMascAuth()`
Gives components quick access to active credentials, user sessions, loading indicators, and auth operations:

```js
const {
  // Admin Context
  admin,
  token,
  setupRequired,
  setupCredentials,
  login,               // (email, password) => Promise
  verifyAdminOtp,      // (tempToken, otp) => Promise
  logout,

  // Member User Context
  user,
  userToken,
  userSessionToken,
  userLogin,           // (email, password, recaptcha) => Promise
  userLogout,
  userRegister,        // (registerData) => Promise
  changePassword,      // (current, new) => Promise
  updateProfile,       // (first, last) => Promise

  // UI state
  loading,
  error
} = useMascAuth();
```

### 2. `useMascTheme()`
Retrieves the organization branding model (logo URLs, custom gradient codes) to customize local styles:
```js
const theme = useMascTheme();
console.log('Logo URI:', theme.orgLogoUrl);
```

### 3. `useMascToast()`
Allows custom components to display uniform alert toast overlays:
```js
const { addToast } = useMascToast();
addToast('Document saved successfully!', 'success'); // 'success' | 'error' | 'warning' | 'info'
```

---

## 🛡️ Developer HMAC Vault Client (`MascDecryptedVaultClient`)

When writing programmatic scripts, API services, or server-side actions, use the `MascDecryptedVaultClient` class to perform authorized CRUD tasks on vaults using SHA-256 HMAC request signing:

```js
import { MascDecryptedVaultClient } from './sdk';

// Initialize Client with API credentials
const client = new MascDecryptedVaultClient({
  apiKey: 'YOUR_API_KEY',
  apiSecret: 'YOUR_API_SECRET',
  applicationId: 'YOUR_APPLICATION_ID',
  tenantId: 'YOUR_TENANT_ID',
  apiBaseUrl: 'http://localhost:5000/api/v1' // optional
});

async function testVaultOperations(userId, collectionId) {
  try {
    // 1. Create a secure vault record
    const payload = { ssn: '000-12-3456', routingNumber: '123456789' };
    const createRes = await client.createVault(collectionId, userId, payload);
    const recordId = createRes.record._id;
    console.log('Created vault record ID:', recordId);

    // 2. Read decrypted vault record
    const readRes = await client.readVault(recordId, userId);
    console.log('Decrypted details:', readRes.record.decryptedPayload);

    // 3. Update vault record payload
    const updateRes = await client.updateVault(recordId, userId, {
      ssn: '000-12-9999',
      routingNumber: '123456789'
    });
    console.log('Update status:', updateRes.success);

    // 4. List all records for the user in a collection
    const listRes = await client.listVault(collectionId, userId);
    console.log(`Found ${listRes.records.length} records in collection.`);

    // 5. Delete vault record
    await client.deleteVault(recordId, userId);
    console.log('Record removed from secure vault.');

  } catch (err) {
    console.error('Vault SDK operation failed:', err.message);
  }
}
```
