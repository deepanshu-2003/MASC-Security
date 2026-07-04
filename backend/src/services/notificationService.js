import dotenv from 'dotenv';
dotenv.config();

// Standard output log formatting helper
const logSandboxMessage = (title, details) => {
  console.log('\n' + '='.repeat(60));
  console.log(`[DEVELOPER SANDBOX] ${title}`);
  console.log('='.repeat(60));
  Object.entries(details).forEach(([key, val]) => {
    console.log(`${key.padEnd(20)}: ${val}`);
  });
  console.log('='.repeat(60) + '\n');
};

/**
 * Send SMS verification via Twilio or Fallback Console log
 * @param {string} to - Destination phone number
 * @param {string} body - SMS message body text
 */
export const sendSMS = async (to, body) => {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER } = process.env;

  // Check if core Twilio credentials (SID + Auth Token) are configured
  const hasTwilioCredentials =
    TWILIO_ACCOUNT_SID &&
    TWILIO_ACCOUNT_SID !== 'dummy_twilio_account_sid' &&
    TWILIO_ACCOUNT_SID.startsWith('AC') &&
    TWILIO_AUTH_TOKEN &&
    TWILIO_AUTH_TOKEN !== 'dummy_twilio_auth_token';

  if (hasTwilioCredentials) {
    // Warn loudly if the phone number is still the placeholder value
    const isPhonePlaceholder =
      !TWILIO_PHONE_NUMBER ||
      TWILIO_PHONE_NUMBER === 'dummy_twilio_phone_number' ||
      TWILIO_PHONE_NUMBER === '+10000000000';

    if (isPhonePlaceholder) {
      console.error('\n' + '█'.repeat(60));
      console.error('[TWILIO ERROR] TWILIO_PHONE_NUMBER is not configured!');
      console.error('  Current value : ' + (TWILIO_PHONE_NUMBER || '(empty)'));
      console.error('  Fix           : Set a real Twilio phone number in .env');
      console.error('  Example       : TWILIO_PHONE_NUMBER=+14155552671');
      console.error('  Get a number  : https://console.twilio.com/us1/develop/phone-numbers/manage/incoming');
      console.error('█'.repeat(60) + '\n');
      // Still fall through to sandbox log below so OTP is visible in dev
      logSandboxMessage('SMS OTP TRANSMISSION (Twilio phone not set)', {
        'Recipient Phone': to,
        'Message Body': body,
        'Fix Required': 'Set TWILIO_PHONE_NUMBER in backend/.env to a real Twilio number'
      });
      return;
    }

    // Attempt real Twilio dispatch
    try {
      const twilioModule = await import('twilio');
      const client = twilioModule.default(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

      const message = await client.messages.create({
        body,
        from: TWILIO_PHONE_NUMBER,
        to
      });
      console.log(`[SMS] ✅ Twilio message sent successfully. SID: ${message.sid}`);
      return message;
    } catch (error) {
      // Log full Twilio error detail to console
      console.error('\n' + '█'.repeat(60));
      console.error('[TWILIO ERROR] Failed to send SMS');
      console.error('  To            : ' + to);
      console.error('  From          : ' + TWILIO_PHONE_NUMBER);
      console.error('  Error Message : ' + error.message);
      if (error.code)    console.error('  Error Code    : ' + error.code);
      if (error.moreInfo) console.error('  More Info     : ' + error.moreInfo);
      if (error.status)  console.error('  HTTP Status   : ' + error.status);
      console.error('█'.repeat(60) + '\n');

      // Fallback: print OTP to console so dev/testing is not blocked
      logSandboxMessage('SMS OTP TRANSMISSION (Twilio Failed — Fallback)', {
        'Recipient Phone': to,
        'Message Body': body,
        'Twilio Error': error.message,
        'Error Code': error.code || 'N/A',
        'Fix': error.code === 21608
          ? 'Your trial account can only send to verified numbers. Verify this number at https://console.twilio.com'
          : 'Check Twilio console for more details: https://console.twilio.com'
      });
    }
  } else {
    // No valid Twilio credentials at all — sandbox log
    console.warn('[SMS] Twilio credentials not configured. OTP logged to console only.');
    logSandboxMessage('SMS OTP TRANSMISSION', {
      'Recipient Phone': to,
      'Message Body': body,
      'Info': 'Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER in backend/.env'
    });
  }
};


/**
 * Send email verification link via Nodemailer or Fallback Console log
 * @param {string} to - Destination email address
 * @param {string} subject - Email subject line
 * @param {string} text - Plain text body
 * @param {string} html - HTML rich body
 */
export const sendEmail = async (to, subject, text, html) => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;

  const isSMTPConfigured = SMTP_HOST && SMTP_HOST !== 'dummy_smtp_host' &&
                           SMTP_PORT && SMTP_PORT !== 'dummy_smtp_port' &&
                           SMTP_USER && SMTP_USER !== 'dummy_smtp_user' &&
                           SMTP_PASS && SMTP_PASS !== 'dummy_smtp_pass';

  if (isSMTPConfigured) {
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT),
        secure: parseInt(SMTP_PORT) === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      });

      const info = await transporter.sendMail({
        from: SMTP_FROM || '"MASC Security" <noreply@masc.security>',
        to,
        subject,
        text,
        html
      });
      console.log(`[EMAIL] Nodemailer message sent: ${info.messageId}`);
      return info;
    } catch (error) {
      console.error('[EMAIL ERROR] Nodemailer send failed:', error.message);
      logSandboxMessage('EMAIL TRANSMISSION (Nodemailer Failed Fallback)', {
        'Recipient Email': to,
        'Subject': subject,
        'Message Text': text,
        'Error': error.message
      });
    }
  } else {
    // Sandbox log fallback
    logSandboxMessage('EMAIL DISPATCH', {
      'Recipient Email': to,
      'Subject': subject,
      'Plain Text Body': text,
      'Info': 'Set SMTP environment variables in .env for production email dispatch.'
    });
  }
};
