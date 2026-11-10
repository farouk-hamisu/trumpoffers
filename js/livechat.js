/**
 * Trump Offers — Brevo Conversations live-chat bootstrap.
 *
 * The official Brevo snippet uses an inline script, which the platform CSP
 * blocks. This local file performs the same bootstrap so the only third-party
 * origin that has to be allowed is the Conversations widget itself.
 *
 * Override the account id with window.TRUMP_ENV.BREVO_CONVERSATIONS_ID, or set
 * LIVECHAT_ENABLED=false to remove the widget (for example on a privacy-first
 * build). The chat is supplementary: if the loader fails, the page continues
 * to work normally.
 */
(function (window, document) {
  'use strict';

  var DEFAULT_CONVERSATIONS_ID = '6af29e2f9894c8cc930ccf0a';
  var env = window.TRUMP_ENV || {};

  var enabled = env.LIVECHAT_ENABLED;
  if (typeof enabled === 'string') {
    enabled = enabled.trim().toLowerCase();
    enabled = enabled !== 'false' && enabled !== '0' && enabled !== 'off';
  }
  if (enabled === false) return;

  var conversationsId = String(env.BREVO_CONVERSATIONS_ID || DEFAULT_CONVERSATIONS_ID).trim();
  // Brevo ids are lowercase hexadecimal strings. Refuse anything else rather
  // than handing an unexpected value to the third-party loader.
  if (!/^[a-f0-9]{16,64}$/i.test(conversationsId)) {
    if (window.console && console.warn) {
      console.warn('Trump Offers: live chat disabled because the Brevo Conversations ID is invalid.');
    }
    return;
  }

  // Queue calls made before the asynchronous loader is ready, matching the
  // contract used by the official snippet.
  window.BrevoConversationsID = conversationsId;
  if (typeof window.BrevoConversations !== 'function') {
    window.BrevoConversations = function () {
      (window.BrevoConversations.q = window.BrevoConversations.q || []).push(arguments);
    };
  }

  var script = document.createElement('script');
  script.async = true;
  script.src = 'https://conversations-widget.brevo.com/brevo-conversations.js';
  script.referrerPolicy = 'strict-origin-when-cross-origin';
  script.onerror = function () {
    // Chat is not essential. Remove the failed node so retries or later page
    // navigation start from a clean state.
    if (script.parentNode) script.parentNode.removeChild(script);
  };
  (document.head || document.documentElement).appendChild(script);
})(window, document);
