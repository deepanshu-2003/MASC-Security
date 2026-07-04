# MASC Security Platform

<div align="center">
<<<<<<< HEAD
=======
  <!-- <img src="frontend/public/logo.png" alt="MASC Security Logo" width="120" /> -->
>>>>>>> 279f2e972d60099f6a0a47b1492fafe49b853a71
  <h3>Enterprise-Grade Security & Adaptive Authentication Platform</h3>
  <p>A full-stack, white-label security platform with AI-powered adaptive authentication, encrypted vault storage, and granular permission governance.</p>
</div>

---

## 🚀 Overview

MASC Security is a production-ready, multi-layer security platform that organizations can deploy as a private-labeled member portal. It provides:

- **Adaptive Multi-Factor Authentication** — AI-driven risk scoring triggers step-up verification only when needed
- **AES-256 Encrypted Data Vault** — Per-user encrypted storage with fine-grained permission governance
- **RBAC + Permission Overrides** — Role-based access control with per-user policy exceptions
- **Dynamic Custom Fields** — Fully configurable registration and profile forms without code changes
- **Session Intelligence** — Real-time active session management with geo-location and VPN detection
- **AI Security Engine** — Random Forest model that scores every login event for threat level
- **Developer SDK** — Drop-in React components and JS utilities for seamless frontend integration
- **White-Label Branding** — Logo, color gradients, and typography fully configurable per organization

---

<<<<<<< HEAD
## 🏗️ Architecture & Documentation

For a detailed view of the system design, components, and integration methods, review the official documentation:

- 🏗️ **[Platform Architecture Guide](docs/architecture.md)** — Architectural design, flowcharts, security controls, and AI scoring patterns.
- 🔑 **[React SDK Integration Guide](docs/sdk_usage.md)** — Full guide to drop-in UI components, contexts, React hooks, and the developer vault client.
- 📡 **[Direct Backend API Guide](docs/backend_integration.md)** — HMAC signature calculations and direct REST API endpoint specifications.
=======
## 🏗️ Architecture
>>>>>>> 279f2e972d60099f6a0a47b1492fafe49b853a71

```
MASC Security/
├── backend/          # Express.js REST API (Node.js)
├── frontend/         # React + Vite frontend (Admin + User Portal)
├── ai_engine/        # Python FastAPI — ML risk scoring service
<<<<<<< HEAD
└── docs/             # Platform & API documentation
=======
└── SDK_DOCUMENTATION.md
>>>>>>> 279f2e972d60099f6a0a47b1492fafe49b853a71
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Node.js, Express.js, MongoDB (Mongoose) |
| Frontend | React 18, Vite, Vanilla CSS |
| AI Engine | Python 3.11, FastAPI, scikit-learn (Random Forest) |
| Authentication | JWT, bcrypt, Google reCAPTCHA v3 |
| Notifications | Twilio SMS, Nodemailer SMTP |
| Encryption | AES-256-CBC (Node.js `crypto`) |

---

## ⚡ Quick Start

### Prerequisites

- Node.js ≥ 18
- Python ≥ 3.11
- MongoDB (local or Atlas)
- Twilio account (for SMS OTP)
- SMTP provider (Gmail, SendGrid, etc.)
- Google reCAPTCHA v3 credentials

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/masc-security.git
cd masc-security

# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install

# AI Engine
cd ../ai_engine && pip install -r requirements.txt
```

### 2. Configure Environment

```bash
# Copy the template
cp backend/.env.example backend/.env
```

Fill in all values in `backend/.env`:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/masc-security
JWT_SECRET=<generate with: openssl rand -hex 32>
RECAPTCHA_SECRET_KEY=<your v3 secret>
RECAPTCHA_SITE_KEY=<your v3 site key>
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...
FRONTEND_URL=http://localhost:5173
AI_ENGINE_URL=http://localhost:8000
```

### 3. Start All Services

```bash
# Terminal 1 — AI Engine
cd ai_engine && uvicorn main:app --reload --port 8000

# Terminal 2 — Backend API
cd backend && npm run dev

# Terminal 3 — Frontend
cd frontend && npm run dev
```

Open **http://localhost:5173** and run the **Setup Wizard** to create your first admin account.

---

## 🔑 Core Features

### Adaptive Authentication
Login events are scored by the AI engine (0–100). The admin configures policies for each risk band:
- **Low (0–34):** Allow
- **Medium (35–74):** Allow / Require OTP / Require Email / Require Both
- **High (75–100):** Allow / Require verification / Block entirely

### Data Vault
Each user gets an AES-256 encrypted vault. Admins can:
- Create clusters and collections
- Grant/revoke per-section view/edit/delete permissions
- Block access for individual users, user sets, or roles
- Export and audit all vault operations

<<<<<<< HEAD
### Developer SDK & API
Third-party React apps can either drop in components or use the programmatic HMAC-signed SDK client. External servers can calculate raw signatures to call the API directly:
```js
import { MascDecryptedVaultClient } from './sdk';
const client = new MascDecryptedVaultClient({ apiKey, apiSecret, tenantId, applicationId });
await client.createVault(collectionId, userId, payload);
```
See the **[React SDK Integration Guide](docs/sdk_usage.md)** for details.
=======
### Developer SDK
Third-party apps integrate via API key + HMAC signature:
```js
import { MascSDK } from './sdk';
const sdk = new MascSDK({ apiKey, apiSecret, tenantId });
await sdk.vault.create(collectionId, userId, payload);
```
>>>>>>> 279f2e972d60099f6a0a47b1492fafe49b853a71

### Dynamic Custom Fields
Admins configure registration and profile fields (text, number, select, checkbox, file, mobile) through the UI — no code changes required.

---

## 📡 API Reference

<<<<<<< HEAD
All endpoints live under `/api/v1/`. See the **[Direct Backend API Guide](docs/backend_integration.md)** for the complete API reference and signature computation details.
=======
All endpoints live under `/api/v1/`. See [SDK_DOCUMENTATION.md](SDK_DOCUMENTATION.md) for the full reference.
>>>>>>> 279f2e972d60099f6a0a47b1492fafe49b853a71

| Module | Base Path |
|--------|-----------|
| Admin Auth | `/api/v1/auth/admin` |
| Member Auth | `/api/v1/auth` |
| Users & RBAC | `/api/v1/users`, `/api/v1/roles` |
| Vault | `/api/v1/vault` |
| Dynamic Fields | `/api/v1/dynamic-fields` |
| Sessions | `/api/v1/sessions` |
| AI Engine | `/api/v1/ai` |
| Developer API | `/api/v1/developer` |

---

## 🛡️ Security Notes

- Never commit `.env` files — they are gitignored
- Rotate all default API keys generated by the Setup Wizard before going to production
- Set `NODE_ENV=production` in your production deployment
- Review `backend/.env.example` for all required environment variables

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  Built with ❤️ — MASC Security Platform
</div>
