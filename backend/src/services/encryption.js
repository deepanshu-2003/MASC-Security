import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

// Helper to retrieve the encryption key from environment variable
const getEncryptionKey = () => {
  const rawKey = process.env.VAULT_ENCRYPTION_KEY || 'dummy_vault_key_32chars_here____';
  // Ensure the key is exactly 32 bytes for aes-256
  return Buffer.alloc(32, rawKey, 'utf8');
};

/**
 * Encrypts a string value using AES-256-CBC
 * @param {string} text - The cleartext string to encrypt
 * @returns {string} - The formatted string containing hex(iv):hex(ciphertext)
 */
export const encryptValue = (text) => {
  if (text === null || text === undefined) return '';
  const str = String(text);
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  
  let encrypted = cipher.update(str, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return `${iv.toString('hex')}:${encrypted}`;
};

/**
 * Decrypts a previously encrypted string using AES-256-CBC
 * @param {string} encryptedText - The formatted string iv:ciphertext
 * @returns {string} - The decrypted cleartext
 */
export const decryptValue = (encryptedText) => {
  if (!encryptedText) return '';
  
  const parts = String(encryptedText).split(':');
  if (parts.length !== 2) {
    // If the format doesn't match, return as-is (e.g. if it was stored unencrypted)
    return encryptedText;
  }
  
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('[ENCRYPTION SERVICE] Decryption failed, returning original value:', error.message);
    return encryptedText;
  }
};

/**
 * Generates a SHA-256 hash of a string value (one-way hash)
 * @param {string} text - Cleartext string
 * @returns {string} - Hex string of SHA-256 hash
 */
export const hashValue = (text) => {
  if (text === null || text === undefined) return '';
  return crypto.createHash('sha256').update(String(text)).digest('hex');
};
