/**
 * Device Service - Parse browser User-Agent into readable device info
 * Uses built-in string parsing to avoid dependencies.
 */

/**
 * Parse User-Agent string into device information
 * @param {string} userAgent - HTTP User-Agent header value
 * @returns {{ browser: string, os: string, deviceType: string, deviceId: string }}
 */
export const parseUserAgent = (userAgent = '') => {
  const ua = userAgent.toLowerCase();

  // --- Browser Detection ---
  let browser = 'Unknown Browser';
  if (ua.includes('brave')) {
    browser = 'Brave';
  } else if (ua.includes('edg/') || ua.includes('edge/')) {
    browser = 'Microsoft Edge';
  } else if (ua.includes('opr/') || ua.includes('opera')) {
    browser = 'Opera';
  } else if (ua.includes('chrome/') && !ua.includes('chromium')) {
    browser = 'Google Chrome';
  } else if (ua.includes('firefox/')) {
    browser = 'Mozilla Firefox';
  } else if (ua.includes('safari/') && !ua.includes('chrome')) {
    browser = 'Apple Safari';
  } else if (ua.includes('msie') || ua.includes('trident/')) {
    browser = 'Internet Explorer';
  } else if (ua.includes('curl')) {
    browser = 'cURL';
  } else if (ua.includes('postman')) {
    browser = 'Postman';
  }

  // --- OS Detection ---
  let os = 'Unknown OS';
  if (ua.includes('windows nt 10') || ua.includes('windows nt 11')) {
    os = 'Windows 10/11';
  } else if (ua.includes('windows nt 6.1')) {
    os = 'Windows 7';
  } else if (ua.includes('windows')) {
    os = 'Windows';
  } else if (ua.includes('iphone')) {
    os = 'iOS (iPhone)';
  } else if (ua.includes('ipad')) {
    os = 'iOS (iPad)';
  } else if (ua.includes('android')) {
    os = 'Android';
  } else if (ua.includes('mac os x') || ua.includes('macos')) {
    os = 'macOS';
  } else if (ua.includes('linux')) {
    os = 'Linux';
  } else if (ua.includes('ubuntu')) {
    os = 'Ubuntu';
  }

  // --- Device Type Detection ---
  let deviceType = 'desktop';
  if (ua.includes('mobile') || ua.includes('iphone') || ua.includes('android') && !ua.includes('tablet')) {
    deviceType = 'mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    deviceType = 'tablet';
  }

  // --- Device ID: create a deterministic fingerprint from UA + OS combination ---
  // This is NOT cryptographically unique but helps identify "same device" logins
  const deviceId = generateDeviceId(userAgent);

  return { browser, os, deviceType, deviceId };
};

/**
 * Generate a simple deterministic device ID from user agent
 * @param {string} userAgent
 * @returns {string}
 */
const generateDeviceId = (userAgent = '') => {
  // Simple hash function for device fingerprint
  let hash = 0;
  for (let i = 0; i < userAgent.length; i++) {
    const char = userAgent.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `DEV-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
};

/**
 * Get the real client IP from request object
 * Handles proxies, load balancers, etc.
 * @param {object} req - Express request object
 * @returns {string}
 */
export const getClientIp = (req) => {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
};
