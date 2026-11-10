/**
 * Trump Offers — member sign in, recovery and password update.
 */

import { getApi, currentUser } from '../lib/api.js';
import {
  $,
  $$,
  getParam,
  safeNext,
  validateEmail,
  fieldError,
  clearFormErrors,
  bindFieldClearing,
  setLoading,
  focusFirstError,
} from '../lib/utils.js';
import { icon } from '../icons.js';

const panels = {
  signin: $('#auth-signin'),
  reset: $('#auth-reset'),
  update: $('#auth-update'),
};

function showMode(mode) {
  Object.entries(panels).forEach(([key, el]) => {
    if (el) el.hidden = key !== mode;
  });
  const firstInput = panels[mode]?.querySelector('input');
  if (firstInput) window.setTimeout(() => firstInput.focus(), 60);
  panels[mode]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function alertBox(message, type = 'error') {
  $$('[data-auth-alert]').forEach((host) => {
    host.innerHTML = message
      ? `<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(
          type === 'error' ? 'alert-triangle' : 'check-circle'
        )}<div>${message}</div></div>`
      : '';
  });
}

function isRecoveryLink() {
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  return getParam('mode') === 'update' || hash.get('type') === 'recovery';
}

function bindModeLinks() {
  $$('[data-auth-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      alertBox('');
      const mode = btn.dataset.authMode;
      showMode(mode);
      if (mode === 'reset') $('#reset-email').value = $('#signin-email').value || '';
    });
  });
}

function bindValidation(form) {
  bindFieldClearing(form);
  form.querySelectorAll('input').forEach((input) => {
    input.addEventListener('blur', () => {
      if (input.type === 'email' && input.value && !validateEmail(input.value)) {
        fieldError(input, 'Enter a valid email address.');
      }
    });
  });
}

async function boot() {
  $$('[data-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  bindModeLinks();
  bindValidation($('#signin-form'));
  bindValidation($('#reset-form'));
  bindValidation($('#update-form'));

  const recovery = isRecoveryLink();
  const session = await currentUser();
  const next = safeNext(getParam('next'), 'dashboard.html');

  if (recovery) {
    showMode('update');
  } else if (session) {
    location.replace(next);
    return;
  }

  if (getParam('reset') === 'sent') alertBox('If that address is registered, a reset link is on its way.', 'success');

  $('#signin-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
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
    setLoading(button, true);
    try {
      const api = await getApi();
      const signed = await api.auth.signIn({ email, password });
      const destination =
        signed.profile?.role === 'admin' && /admin/i.test(next) ? next : next === 'login.html' ? 'dashboard.html' : next;
      location.replace(safeNext(destination, 'dashboard.html'));
    } catch (error) {
      alertBox(error.message || 'We could not complete sign in.');
      const resendWrap = $('[data-resend-wrap]');
      if (resendWrap) resendWrap.hidden = !/confirm your email/i.test(error.message || '');
      setLoading(button, false);
    }
  });

  $('[data-resend-confirmation]')?.addEventListener('click', async () => {
    const email = $('#signin-email')?.value.trim() || '';
    if (!email || !validateEmail(email)) {
      fieldError($('#signin-email'), 'Enter the email address you registered with.');
      focusFirstError($('#signin-form'));
      return;
    }
    const button = $('[data-resend-confirmation]');
    setLoading(button, true, 'Sending…');
    try {
      const api = await getApi();
      const result = await api.auth.resendConfirmation(email);
      alertBox(result.message || 'A new confirmation email has been sent.', 'success');
      const resendWrap = $('[data-resend-wrap]');
      if (resendWrap) resendWrap.hidden = true;
    } catch (error) {
      alertBox(error.message || 'We could not resend the confirmation email.');
    } finally {
      setLoading(button, false);
    }
  });

  $('#reset-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    clearFormErrors(form);
    alertBox('');
    const email = form.elements.email.value.trim();
    if (!email || !validateEmail(email)) {
      fieldError(form.elements.email, 'Enter a valid email address.');
      focusFirstError(form);
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      const api = await getApi();
      const result = await api.auth.resetPassword({ email });
      alertBox(result.message || 'If that address is registered, a reset link is on its way.', 'success');
      form.reset();
    } catch (error) {
      alertBox(error.message || 'We could not send a reset link.');
    } finally {
      setLoading(button, false);
    }
  });

  $('#update-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    clearFormErrors(form);
    alertBox('');
    const password = form.elements.password.value;
    const confirm = form.elements.confirm.value;
    let valid = true;
    if (password.length < 8) {
      fieldError(form.elements.password, 'Use a password with at least 8 characters.');
      valid = false;
    }
    if (password !== confirm) {
      fieldError(form.elements.confirm, 'The passwords do not match.');
      valid = false;
    }
    if (!valid) {
      focusFirstError(form);
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      const api = await getApi();
      if (typeof api.auth.updatePassword !== 'function') {
        throw new Error('Password updates are not available for this session. Request a new reset link and try again.');
      }
      await api.auth.updatePassword(password);
      alertBox('Your password has been updated. Taking you to your dashboard…', 'success');
      window.setTimeout(() => location.replace('dashboard.html'), 1100);
    } catch (error) {
      alertBox(error.message || 'We could not update your password.');
      setLoading(button, false);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
