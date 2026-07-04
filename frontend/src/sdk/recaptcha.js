/**
 * Dynamic script loader helper for Google reCAPTCHA v3
 * @param {string} siteKey - Public reCAPTCHA Site Key
 * @returns {Promise<object>} - Resolves with window.grecaptcha client
 */
export const loadReCaptcha = (siteKey) => {
  return new Promise((resolve, reject) => {
    if (window.grecaptcha) {
      window.grecaptcha.ready(() => {
        resolve(window.grecaptcha);
      });
      return;
    }

    const scriptId = 'masc-recaptcha-script';
    let script = document.getElementById(scriptId);

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }

    script.onload = () => {
      if (window.grecaptcha) {
        window.grecaptcha.ready(() => {
          resolve(window.grecaptcha);
        });
      } else {
        reject(new Error('Google reCAPTCHA failed to initialize'));
      }
    };

    script.onerror = () => {
      reject(new Error('Google reCAPTCHA script failed to load'));
    };
  });
};
