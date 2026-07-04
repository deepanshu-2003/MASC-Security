import crypto from 'crypto';
import ApiKey from '../models/ApiKey.js';
import Nonce from '../models/Nonce.js';

/**
 * Middleware to verify Application Layer API signatures
 */
export const verifySignature = async (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const signature = req.headers['x-signature'];
    const timestampStr = req.headers['x-timestamp'];
    const nonce = req.headers['x-nonce'];
    const applicationId = req.headers['x-application-id'];
    const tenantId = req.headers['x-tenant-id'];

    // 1. Check required headers
    if (!apiKey || !signature || !timestampStr || !nonce) {
      return res.status(400).json({
        error: 'Missing required authentication headers: x-api-key, x-signature, x-timestamp, x-nonce'
      });
    }

    // 2. Validate Timestamp (Replay protection window: 5 minutes)
    const timestamp = isNaN(Number(timestampStr)) ? Date.parse(timestampStr) : Number(timestampStr);
    if (isNaN(timestamp)) {
      return res.status(400).json({ error: 'Invalid x-timestamp format' });
    }

    const now = Date.now();
    // Normalize both to seconds if the header was sent in milliseconds
    const nowSec = Math.floor(now / 1000);
    const tsSec = timestamp > 9999999999 ? Math.floor(timestamp / 1000) : timestamp;
    const diff = Math.abs(nowSec - tsSec);

    if (diff > 300) {
      return res.status(401).json({
        error: 'Request timestamp expired (must be within 5 minutes of server time)',
        details: { serverTime: nowSec, requestTime: tsSec, diff }
      });
    }

    // 3. Retrieve and Validate API Key
    const keyRecord = await ApiKey.findOne({ apiKey, status: 'active' });
    if (!keyRecord) {
      return res.status(401).json({ error: 'Invalid or revoked API Key' });
    }

    if (tenantId && keyRecord.organizationId.toString() !== tenantId.toString()) {
      return res.status(401).json({ error: 'Tenant ID mismatch' });
    }

    if (applicationId && keyRecord.applicationId.toString() !== applicationId.toString()) {
      return res.status(401).json({ error: 'Application ID mismatch' });
    }

    // 4. Validate Nonce (Replay protection lookup)
    const existingNonce = await Nonce.findOne({ nonce });
    if (existingNonce) {
      return res.status(401).json({ error: 'Replay attack detected: Nonce already used' });
    }

    // Save nonce to database to mark as used (with automated 5-minute MongoDB TTL expire)
    await Nonce.create({ nonce });

    // 5. Calculate and Verify HMAC Signature
    // Signature payload is: timestamp + nonce + stringified_body
    const bodyStr = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '';
    const payload = `${timestampStr}${nonce}${bodyStr}`;

    const computedSignature = crypto
      .createHmac('sha256', keyRecord.apiSecret)
      .update(payload)
      .digest('hex');

    if (computedSignature !== signature) {
      return res.status(401).json({
        error: 'Invalid request signature (HMAC validation failed)'
      });
    }

    // Update lastUsedAt asynchronously
    ApiKey.updateOne({ _id: keyRecord._id }, { lastUsedAt: new Date() }).catch(err =>
      console.error('[SIGNATURE MIDDLEWARE] Failed to update key lastUsedAt:', err.message)
    );

    // Attach verified variables to request
    req.applicationId = applicationId || keyRecord.applicationId.toString();
    req.organizationId = tenantId || keyRecord.organizationId.toString();
    req.apiKeyId = keyRecord._id;
    req.apiKeyPermissions = keyRecord.permissions || ['create', 'read', 'update', 'delete'];

    next();
  } catch (error) {
    console.error('[SIGNATURE MIDDLEWARE ERROR]:', error);
    res.status(500).json({ error: 'Internal signature verification error' });
  }
};
