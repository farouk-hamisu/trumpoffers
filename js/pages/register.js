/**
 * Trump Offers — member registration.
 */

import { getApi, currentUser } from '../lib/api.js';
import {
  $,
  validateEmail,
  validatePhone,
  fieldError,
  clearFormErrors,
  bindFieldClearing,
  setLoading,
  focusFirstError,
} from '../lib/utils.js';
import { icon } from '../icons.js';

function alertBox(message, type = 'error') {
  const host = $('[data-auth-alert]');
  if (!host) return;
  host.innerHTML = message
    ? `<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(
        type === 'error' ? 'alert-triangle' : 'check-circle'
      )}<div>${message}</div></div>`
    : '';
}

async function boot() {
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  const session = await currentUser();
  if (session) {
    location.replace('dashboard.html');
    return;
  }

  const form = $('#register-form');
  bindFieldClearing(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    alertBox('');
    const values = {
      fullName: form.elements.fullName.value.trim(),
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      location: form.elements.location.value.trim(),
      password: form.elements.password.value,
      confirm: form.elements.confirm.value,
    };
    let valid = true;

    if (values.fullName.length < 2) {
      fieldError(form.elements.fullName, 'Enter your full name.');
      valid = false;
    }
    if (!values.email) {
      fieldError(form.elements.email, 'Enter your email address.');
      valid = false;
    } else if (!validateEmail(values.email)) {
      fieldError(form.elements.email, 'Enter a valid email address.');
      valid = false;
    }
    if (values.phone && !validatePhone(values.phone)) {
      fieldError(form.elements.phone, 'Enter a valid phone number, or leave this blank.');
      valid = false;
    }
    if (values.password.length < 8) {
      fieldError(form.elements.password, 'Use a password with at least 8 characters.');
      valid = false;
    }
    if (values.password !== values.confirm) {
      fieldError(form.elements.confirm, 'The passwords do not match.');
      valid = false;
    }
    if (!form.elements.terms.checked) {
      fieldError(form.elements.terms, 'Please confirm you understand the demonstration terms.');
      valid = false;
    }
    if (!valid) {
      focusFirstError(form);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true, 'Creating account');
    try {
      const api = await getApi();
      const result = await api.auth.signUp(values);
      if (result.requiresConfirmation) {
        form.hidden = true;
        alertBox(
          `Your account has been created. Check <strong>${values.email}</strong> for the confirmation link, then sign in.`,
          'success'
        );
        const switchText = $('.auth__switch');
        if (switchText) switchText.innerHTML = '<a href="login.html">Continue to sign in</a>';
        setLoading(button, false);
        return;
      }
      location.replace('dashboard.html');
    } catch (error) {
      alertBox(error.message || 'We could not create your account.');
      setLoading(button, false);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
