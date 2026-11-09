/**
 * Trump Offers — administrator sign in.
 */

import { getApi, currentUser } from '../lib/api.js';
import {
  $,
  escapeHTML,
  validateEmail,
  fieldError,
  clearFormErrors,
  bindFieldClearing,
  setLoading,
  focusFirstError,
} from '../lib/utils.js';
import { icon } from '../icons.js';

function alertBox(message, type = 'error') {
  const host = $('[data-admin-alert]');
  if (!host) return;
  host.innerHTML = message
    ? `<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(
        type === 'error' ? 'alert-triangle' : 'check-circle'
      )}<div>${escapeHTML(message)}</div></div>`
    : '';
}

async function boot() {
  const form = $('#admin-login-form');
  if (!form) return;
  bindFieldClearing(form);

  const session = await currentUser();
  if (session?.profile?.role === 'admin') {
    location.replace('index.html');
    return;
  }
  if (session) {
    alertBox('You are signed in as a member. Sign out to enter the administrator console.');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    alertBox('');

    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    let valid = true;
    if (!email) {
      fieldError(form.elements.email, 'Enter your email address.');
      valid = false;
    } else if (!validateEmail(email)) {
      fieldError(form.elements.email, 'Enter a valid email address.');
      valid = false;
    }
    if (!password) {
      fieldError(form.elements.password, 'Enter your password.');
      valid = false;
    }
    if (!valid) {
      focusFirstError(form);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true, 'Verifying access');
    try {
      const api = await getApi();
      const signed = await api.auth.signIn({ email, password });
      if (signed.profile?.role !== 'admin') {
        await api.auth.signOut();
        alertBox('This account does not have administrator access.');
        setLoading(button, false);
        return;
      }
      location.replace('index.html');
    } catch (error) {
      alertBox(error.message || 'We could not complete sign in.');
      setLoading(button, false);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
