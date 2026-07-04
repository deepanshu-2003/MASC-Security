# MASC Security Backend API Integration Guide

This guide is for developers who want to bypass the frontend React SDK components and interact directly with the MASC Security backend REST API, or integrate custom microservices, servers, or external frontend platforms.

---

## 🔒 API Authentication & HMAC Request Signing

Direct API requests to MASC Security endpoints are split into two categories:
1. **Public/Session Auth Enforced**: Uses standard `Authorization: Bearer <JWT>` header alongside an optional `x-session-token` for member operations (e.g. login, register, own profile, session logs).
2. **Developer Security Boundaries**: Applied to `/api/v1/developer/*` routes. These require cryptographically signed requests using a SHA-256 HMAC signature calculated from your **API Key** and **API Secret**.

### HMAC Request Headers
For signed developer endpoints, you must include the following headers in every HTTP request:

| Header | Description |
|--------|-------------|
| `x-api-key` | The API Key generated from the MASC Admin Dashboard. |
| `x-signature` | The calculated hex-encoded SHA-256 HMAC signature. |
| `x-timestamp` | The Unix epoch timestamp of the request (in milliseconds or seconds). Must be within 5 minutes of server time (replay window). |
| `x-nonce` | A cryptographically random unique string. If a nonce is reused, the request is flagged as a replay attack and blocked. |
| `x-application-id`| The Application ID this action is attached to. |
| `x-tenant-id` | The Organization ID this action is executing within. |
| `x-user-id` | (Optional) The database ID of the user context (required for reading or deleting user records). |

### Signature Calculation Algorithm
To compute the value for `x-signature`:
1. Concatenate the timestamp string, nonce string, and stringified JSON request body (if a body exists):
   $$\text{payload} = \text{timestamp} + \text{nonce} + \text{bodyStr}$$
   *Note: If there is no request body, `bodyStr` must be an empty string `""`.*
2. Generate an HMAC SHA-256 signature of the payload using your **API Secret** as the key.
3. Encode the output as a hexadecimal string.

---

### Implementation Examples

#### 🟢 Node.js / JavaScript
```javascript
const crypto = require('crypto');

function generateMascHeaders({ apiKey, apiSecret, applicationId, tenantId, body, userId }) {
  const timestamp = String(Date.now());
  const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
  const bodyStr = body && Object.keys(body).length > 0 ? JSON.stringify(body) : '';
  const message = `${timestamp}${nonce}${bodyStr}`;
  
  const signature = crypto
    .createHmac('sha256', apiSecret)
    .update(message)
    .digest('hex');

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'x-signature': signature,
    'x-timestamp': timestamp,
    'x-nonce': nonce,
    'x-application-id': applicationId,
    'x-tenant-id': tenantId
  };

  if (userId) {
    headers['x-user-id'] = userId;
  }

  return headers;
}
```

#### 🐍 Python 3
```python
import time
import random
import string
import json
import hmac
import hashlib

def generate_masc_headers(api_key, api_secret, app_id, tenant_id, body=None, user_id=None):
    timestamp = str(int(time.time() * 1000))
    
    # Generate random nonce
    chars = string.ascii_lowercase + string.digits
    nonce = ''.join(random.choice(chars) for _ in range(24))
    
    body_str = json.dumps(body, separators=(',', ':')) if body else ""
    message = f"{timestamp}{nonce}{body_str}".encode('utf-8')
    
    signature = hmac.new(
        api_secret.encode('utf-8'),
        message,
        hashlib.sha256
    ).hexdigest()
    
    headers = {
        'Content-Type': 'application/json',
        'x-api-key': api_key,
        'x-signature': signature,
        'x-timestamp': timestamp,
        'x-nonce': nonce,
        'x-application-id': app_id,
        'x-tenant-id': tenant_id
    }
    
    if user_id:
        headers['x-user-id'] = user_id
        
    return headers
```

#### 🐹 Go
```go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/rand"
	"time"
)

func GenerateMascHeaders(apiKey, apiSecret, appId, tenantId string, body interface{}, userId string) (map[string]string, error) {
	timestamp := fmt.Sprintf("%d", time.Now().UnixNano()/int64(time.Millisecond))
	
	// Nonce generation
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, 24)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	nonce := string(b)
	
	bodyStr := ""
	if body != nil {
		jsonBytes, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		bodyStr = string(jsonBytes)
	}
	
	payload := timestamp + nonce + bodyStr
	
	mac := hmac.New(sha256.New, []byte(apiSecret))
	mac.Write([]byte(payload))
	signature := hex.EncodeToString(mac.Sum(nil))
	
	headers := map[string]string{
		"Content-Type":     "application/json",
		"x-api-key":        apiKey,
		"x-signature":      signature,
		"x-timestamp":      timestamp,
		"x-nonce":          nonce,
		"x-application-id": appId,
		"x-tenant-id":      tenantId,
	}
	
	if userId != "" {
		headers["x-user-id"] = userId
	}
	
	return headers, nil
}
```

---

## 📡 Authentication API Endpoints

### 1. Request SMS verification code (Sign-up validation)
* **Path**: `POST /api/v1/auth/otp/send`
* **Body**:
  ```json
  {
    "mobile": "+1234567890"
  }
  ```
* **Response (Success)**:
  ```json
  {
    "success": true,
    "message": "Verification OTP sent successfully"
  }
  ```

### 2. Verify SMS verification code
* **Path**: `POST /api/v1/auth/otp/verify`
* **Body**:
  ```json
  {
    "mobile": "+1234567890",
    "otp": "123456"
  }
  ```
* **Response (Success)**:
  ```json
  {
    "success": true,
    "message": "Mobile number verified successfully!"
  }
  ```

### 3. Member User Registration
* **Path**: `POST /api/v1/auth/register`
* **Body**:
  ```json
  {
    "firstName": "John",
    "lastName": "Doe",
    "email": "johndoe@example.com",
    "mobile": "+1234567890",
    "password": "SecurePassword123",
    "recaptchaToken": "g-recaptcha-response-token",
    "dynamicFields": {
      "department": "Engineering",
      "employeeId": "EMP-9821"
    }
  }
  ```
* **Response (Success)**:
  ```json
  {
    "success": true,
    "message": "Registration successful! Verification email has been sent."
  }
  ```

---

### 4. Member User Login (Adaptive Workflow)
* **Path**: `POST /api/v1/auth/login`
* **Body**:
  ```json
  {
    "email": "johndoe@example.com",
    "password": "SecurePassword123",
    "recaptchaToken": "g-recaptcha-response-token",
    "telemetry": {
      "deviceSecure": true,
      "networkSecure": true,
      "isPublicNetwork": false,
      "deviceName": "Chrome on Windows",
      "deviceId": "DEV-3B9A",
      "clientIp": "198.51.100.42",
      "lat": 37.7749,
      "lon": -122.4194,
      "physicalLocation": "📍 San Francisco, California (United States)"
    }
  }
  ```

#### Flow Redirect Scenarios:
Depending on the calculated risk score (evaluated by the Python Random Forest model) and administrative policies:

* **Scenario A: Low Risk (Allow)**
  Returns direct access credentials.
  ```json
  {
    "token": "eyJhbGciOi...",
    "sessionToken": "sess_89adbf7c...",
    "sessionIp": "198.51.100.42",
    "user": {
      "id": "64b0f9...",
      "firstName": "John",
      "lastName": "Doe",
      "email": "johndoe@example.com",
      "mobile": "+1234567890",
      "role": "member"
    }
  }
  ```

* **Scenario B: Medium Risk (Adaptive Challenge Required)**
  Returns a `tempToken` to authenticate step-up OTP queries.
  ```json
  {
    "step": "adaptive_verification",
    "email": "johndoe@example.com",
    "mobile": "*****7890",
    "requiredFields": ["otp"],
    "tempToken": "eyJhbGciOi...(temp token with 10m expiry)",
    "message": "Adaptive multi-factor authentication check triggered. Verification required: otp."
  }
  ```

* **Scenario C: High Risk (Block)**
  Request is blocked instantly.
  ```json
  {
    "error": "Access Denied: Blocked by MASC Security Policy due to high threat index (Score: 88, Level: critical)."
  }
  ```

### 5. Verify Adaptive Challenge
* **Path**: `POST /api/v1/auth/login/verify-otp`
* **Body**:
  ```json
  {
    "email": "johndoe@example.com",
    "tempToken": "eyJhbGciOi...(temp token from login response)",
    "otp": "654321",
    "telemetry": {
      "deviceName": "Chrome on Windows",
      "clientIp": "198.51.100.42"
    }
  }
  ```
* **Response**: Returns standard session token details (same format as Scenario A).

---

## 💻 Session Management API

For these endpoints, you must include the active user JWT token in the headers as: `Authorization: Bearer <JWT_TOKEN>`.

### 1. List Active Sessions
* **Path**: `GET /api/v1/sessions/active`
* **Response**:
  ```json
  [
    {
      "_id": "64b1a03f...",
      "deviceName": "Firefox on macOS",
      "ipAddress": "198.51.100.42",
      "location": "San Francisco, CA (US)",
      "vpnActive": false,
      "status": "active",
      "createdAt": "2026-07-04T09:12:00.000Z"
    }
  ]
  ```

### 2. Revoke specific session
* **Path**: `DELETE /api/v1/sessions/:sessionId`
* **Response**:
  ```json
  {
    "success": true,
    "message": "Session successfully terminated"
  }
  ```

---

## 🛡️ Developer Secure Vault API

These endpoints are configured under `/api/v1/developer/vault` and require **HMAC Signature Calculations**.

### 1. Create Vault Record
* **Path**: `POST /api/v1/developer/vault`
* **Body**:
  ```json
  {
    "collectionId": "64b19dfa...",
    "userId": "64b0f9...",
    "payload": {
      "ssn": "000-12-3456",
      "taxId": "TX-9982"
    },
    "permissions": {
      "userOverride": true
    }
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "record": {
      "_id": "64b1a0bc...",
      "collectionId": "64b19dfa...",
      "userId": "64b0f9...",
      "encryptedPayload": "u7d89asd... (AES encrypted hex string)",
      "iv": "98adfc91..."
    }
  }
  ```

### 2. Read Vault Record
* **Path**: `GET /api/v1/developer/vault/:recordId`
* **Headers**: Include `x-user-id` (the target user ID context).
* **Response**:
  ```json
  {
    "success": true,
    "record": {
      "_id": "64b1a0bc...",
      "collectionId": "64b19dfa...",
      "userId": "64b0f9...",
      "decryptedPayload": {
        "ssn": "000-12-3456",
        "taxId": "TX-9982"
      }
    }
  }
  ```

### 3. Update Vault Record
* **Path**: `PUT /api/v1/developer/vault/:recordId`
* **Body**:
  ```json
  {
    "userId": "64b0f9...",
    "payload": {
      "ssn": "000-12-8888",
      "taxId": "TX-9982"
    }
  }
  ```
* **Response**:
  ```json
  {
    "success": true,
    "record": {
      "_id": "64b1a0bc...",
      "updated": true
    }
  }
  ```

### 4. List Vault Records
* **Path**: `GET /api/v1/developer/vault/list?collectionId=COL_ID&userId=USER_ID`
* **Response**:
  ```json
  {
    "success": true,
    "records": [
      {
        "_id": "64b1a0bc...",
        "decryptedPayload": {
          "ssn": "000-12-8888",
          "taxId": "TX-9982"
        }
      }
    ]
  }
  ```

### 5. Delete Vault Record
* **Path**: `DELETE /api/v1/developer/vault/:recordId`
* **Headers**: Include `x-user-id` (the target user ID context).
* **Response**:
  ```json
  {
    "success": true,
    "message": "Record deleted successfully"
  }
  ```

---

## 🎛️ Dynamic Field APIs

Dynamic fields allow adding configuration items to registration or profile pages without changes to code databases.

### 1. Fetch Dynamic Fields by Placement
* **Path**: `GET /api/v1/dynamic-fields/placement/:placementName`
  *(Note: placementName can be `registration` or `profile`)*
* **Response**:
  ```json
  {
    "success": true,
    "fields": [
      {
        "_id": "64b19efd...",
        "name": "department",
        "label": "Department",
        "type": "select",
        "required": true,
        "options": ["Engineering", "HR", "Sales"],
        "defaultValue": "Engineering"
      }
    ]
  }
  ```

---

## 🛡️ Security Rule Evaluation APIs

Used to evaluate if a user is authorized to visit a specific frontend path.

### 1. Evaluate Route Permission
* **Path**: `GET /api/v1/rules/evaluate?path=:encodedPath`
* **Headers**: `Authorization: Bearer <JWT_TOKEN>` and `x-session-token`
* **Response**:
  ```json
  {
    "routes": {
      "/sensitive-data": true
    }
  }
  ```
  *Note: returns `{ "/path": false }` if the user's role does not satisfy the path security criteria defined in the Admin dashboard.*
