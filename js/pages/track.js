/**
 * Trump Offers — public application tracking.
 */

import { getApi } from '../lib/api.js';
import {
  $,
  escapeHTML,
  formatDate,
  formatDateTime,
  getParam,
  validateEmail,
  fieldError,
  clearFormErrors,
  bindFieldClearing,
  focusFirstError,
  setLoading,
  badge,
  statusMeta,
} from '../lib/utils.js';
import { icon } from '../icons.js';

const ORDER = ['submitted', 'under_review', 'shortlisted', 'interview', 'accepted'];

function addBusinessDays(date, days) {
  const d = new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return d;
}

function showAlert(message, type = 'error') {
  const host = $('[data-track-alert]');
  if (!host) return;
  host.innerHTML = message
    ? `<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(
        type === 'error' ? 'alert-triangle' : 'check-circle'
      )}<div>${escapeHTML(message)}</div></div>`
    : '';
}

function timeline(status) {
  if (status === 'rejected') {
    return `<div class="status-track">
      <div class="status-track__step is-done"><span class="status-track__dot">${icon('check')}</span><span class="status-track__label">Submitted</span></div>
      <div class="status-track__step is-done"><span class="status-track__dot">${icon('check')}</span><span class="status-track__label">Reviewed</span></div>
      <div class="status-track__step is-active"><span class="status-track__dot"></span><span class="status-track__label">Not selected</span></div>
    </div>`;
  }
  const current = ORDER.indexOf(status);
  return `<div class="status-track">
    ${['Submitted', 'Under review', 'Shortlisted', 'Interview', 'Decision']
      .map((label, i) => {
        const done = i < current || status === 'accepted';
        const active = i === current && status !== 'accepted';
        return `<div class="status-track__step${done ? ' is-done' : ''}${active ? ' is-active' : ''}">
          <span class="status-track__dot">${done ? icon('check') : ''}</span>
          <span class="status-track__label">${label}</span>
        </div>`;
      })
      .join('')}
  </div>`;
}

function renderResult(result) {
  const host = $('#track-result');
  if (!host) return;
  const expected = addBusinessDays(result.created_at, 4);
  const overdue = expected.getTime() < Date.now() && !['accepted', 'rejected'].includes(result.status);
  host.innerHTML = `
    <p class="apply-form__step" style="color:var(--gold-deep)">Application found</p>
    <h2>${escapeHTML(result.job_title)}</h2>
    <div class="track-result__ref">${escapeHTML(result.reference)}</div>
    <div class="track-result__job">
      <span>Applicant</span>
      <strong>${escapeHTML(result.full_name)}</strong>
    </div>
    ${timeline(result.status)}
    <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">
      <div>${badge('application', result.status)}</div>
      <span class="fine">Submitted ${formatDateTime(result.created_at)}</span>
    </div>
    <p class="form-note form-note--light" style="margin-top:16px">
      ${overdue ? 'Your application has passed the standard review window. The team will be in touch shortly.' : `Estimated review complete by <strong>${formatDate(expected)}</strong> (3–4 business days).`}
    </p>
    ${result.review_notes ? `<div class="legal-callout" style="font-size:0.78rem"><strong style="color:var(--ink-text)">Note from the team:</strong> ${escapeHTML(result.review_notes)}</div>` : ''}
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
      <a class="btn btn--outline-dark btn--sm" href="careers.html">Browse open roles</a>
      <a class="btn btn--outline-dark btn--sm" href="contact.html">Contact recruitment</a>
    </div>`;
}

function renderNotFound(reference) {
  const host = $('#track-result');
  if (!host) return;
  host.innerHTML = `<div class="track-result__empty" style="min-height:260px">
    ${icon('search')}
    <p><strong style="color:var(--ink-text)">No application found.</strong><br>We could not match ${escapeHTML(reference)} with that email address. Check both details and try again.</p>
  </div>`;
}

async function boot() {
  const form = $('#track-form');
  bindFieldClearing(form);
  const refParam = getParam('ref');
  const emailParam = getParam('email');
  if (refParam) form.elements.reference.value = refParam;
  if (emailParam) form.elements.email.value = emailParam;

  const submit = async () => {
    clearFormErrors(form);
    showAlert('');
    const reference = form.elements.reference.value.trim();
    const email = form.elements.email.value.trim();
    let valid = true;
    if (!reference) {
      fieldError(form.elements.reference, 'Enter your application reference.');
      valid = false;
    }
    if (!validateEmail(email)) {
      fieldError(form.elements.email, 'Enter the email address used to apply.');
      valid = false;
    }
    if (!valid) {
      focusFirstError(form);
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true, 'Searching');
    try {
      const api = await getApi();
      const result = await api.trackApplication(reference, email);
      if (!result) {
        renderNotFound(reference);
        showAlert('No application matched those details.', 'error');
      } else {
        renderResult(result);
      }
    } catch (error) {
      showAlert(error.message || 'We could not look up that application.');
    } finally {
      setLoading(button, false);
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  if (refParam && emailParam) submit();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
