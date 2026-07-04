/**
 * helper to calculate HMAC signature using native crypto (Browser & Node compatible)
 */
async function signPayload(secret, timestamp, nonce, body) {
  const message = `${timestamp}${nonce}${body ? JSON.stringify(body) : ''}`;
  
  // Check for window/globalThis subtle crypto
  const cryptoLib = typeof window !== 'undefined' ? window.crypto : (globalThis.crypto);
  if (cryptoLib && cryptoLib.subtle) {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(message);
    const key = await cryptoLib.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await cryptoLib.subtle.sign('HMAC', key, messageData);
    return Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  // Fallback to Node's commonJS/ESM crypto module
  try {
    const crypto = await import('crypto');
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
  } catch (e) {
    throw new Error('No crypto provider available for signature calculation');
  }
}

/**
 * Enterprise-Grade SDK client for Developer application operational actions
 */
export class MascDecryptedVaultClient {
  constructor({ apiKey, apiSecret, applicationId, tenantId, apiBaseUrl }) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.applicationId = applicationId;
    this.tenantId = tenantId;
    this.apiBaseUrl = apiBaseUrl || 'http://localhost:5000/api/v1';
  }

  async _request(method, endpoint, body = null, userId = null) {
    const timestamp = String(Date.now());
    const nonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const signature = await signPayload(this.apiSecret, timestamp, nonce, body);

    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey,
      'x-signature': signature,
      'x-timestamp': timestamp,
      'x-nonce': nonce,
      'x-application-id': this.applicationId,
      'x-tenant-id': this.tenantId
    };

    if (userId) {
      headers['x-user-id'] = userId;
    }

    const options = {
      method,
      headers
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const res = await fetch(`${this.apiBaseUrl}${endpoint}`, options);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP error! status: ${res.status}`);
    }
    return data;
  }

  async createVault(collectionId, userId, payload, permissions = null) {
    return this._request('POST', '/developer/vault', { collectionId, userId, payload, permissions });
  }

  async readVault(recordId, userId) {
    return this._request('GET', `/developer/vault/${recordId}`, null, userId);
  }

  async updateVault(recordId, userId, payload) {
    return this._request('PUT', `/developer/vault/${recordId}`, { userId, payload });
  }

  async deleteVault(recordId, userId) {
    return this._request('DELETE', `/developer/vault/${recordId}`, null, userId);
  }

  async listVault(collectionId, userId) {
    return this._request('GET', `/developer/vault/list?collectionId=${collectionId}&userId=${userId}`);
  }
}
