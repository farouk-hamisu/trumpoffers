/**
 * Trump Offers — contact / concierge desk.
 */

import { getApi } from '../lib/api.js';
import {
  $,
  escapeHTML,
  validateEmail,
  validatePhone,
  fieldError,
  clearFormErrors,
  bindFieldClearing,
  focusFirstError,
  setLoading,
  toast,
} from '../lib/utils.js';
import { icon } from '../icons.js';

function showAlert(message, type = 'error') {
  const host = $('[data-contact-alert]');
  if (!host) return;
  host.innerHTML = message
    ? `<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(
        type === 'error' ? 'alert-triangle' : 'check-circle'
      )}<div>${escapeHTML(message)}</div></div>`
    : '';
}

function boot() {
  const form = $('#contact-form');
  if (!form) return;
  const success = $('#contact-success');
  bindFieldClearing(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    showAlert('');

    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    const phone = form.elements.phone.value.trim();
    const subject = form.elements.subject.value.trim();
    const message = form.elements.message.value.trim();
    const consent = form.elements.consent.checked;

    let valid = true;
    if (name.length < 2) {
      fieldError(form.elements.name, 'Enter your full name.');
      valid = false;
    }
    if (!validateEmail(email)) {
      fieldError(form.elements.email, 'Enter a valid email address.');
      valid = false;
    }
    if (phone && !validatePhone(phone)) {
      fieldError(form.elements.phone, 'Enter a valid phone number, or leave blank.');
      valid = false;
    }
    if (!subject) {
      fieldError(form.elements.subject, 'Choose a subject.');
      valid = false;
    }
    if (message.length < 20) {
      fieldError(form.elements.message, 'Add a little more detail — at least 20 characters.');
      valid = false;
    }
    if (!consent) {
      showAlert('Please confirm your consent before sending your message.');
      form.elements.consent.focus();
      return;
    }

    if (!valid) {
      focusFirstError(form);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true, 'Sending message');
    try {
      const api = await getApi();
      await api.sendContactMessage({ name, email, phone, subject, message });
      form.reset();
      form.hidden = true;
      form.classList.add('is-hidden');
      success.hidden = false;
      $('.contact-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Message sent to the concierge desk.', 'success');
    } catch (error) {
      showAlert(error.message || 'We could not send your message. Please try again.');
      setLoading(button, false);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
