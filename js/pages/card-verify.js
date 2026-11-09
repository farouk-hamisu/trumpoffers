/**
 * Trump Offers — digital card verification.
 */

import { getApi } from '../lib/api.js';
import {
  $,
  escapeHTML,
  getParam,
  badge,
  statusMeta,
  setLoading,
  clearFormErrors,
  fieldError,
  focusFirstError,
  formatDate,
} from '../lib/utils.js';
import { icon } from '../icons.js';

const DESIGN_CLASS = {
  champagne: 'ho-card--champagne',
  obsidian: 'ho-card--obsidian',
  heritage: 'ho-card--heritage',
};

function showAlert(message, type = 'error') {
  const host = $('[data-verify-alert]');
  if (!host) return;
  host.innerHTML = message
    ? `<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(
        type === 'error' ? 'alert-triangle' : 'check-circle'
      )}<div>${escapeHTML(message)}</div></div>`
    : '';
}

function updatePreview(result) {
  const card = $('#verify-card-preview');
  if (!card) return;
  card.classList.remove('ho-card--champagne', 'ho-card--obsidian', 'ho-card--heritage');
  const cls = DESIGN_CLASS[result.design];
  if (cls) card.classList.add(cls);
  const name = $('[data-verify-name]');
  if (name) name.textContent = result.cardholder_name || 'VERIFIED MEMBER';
  const number = $('[data-verify-number]');
  if (number) number.innerHTML = `<span>••••</span><span>••••</span><span>••••</span><span>${escapeHTML(result.last4 || '••••')}</span>`;
}

function renderResult(result) {
  const host = $('#verify-result');
  if (!host) return;
  host.hidden = false;
  const meta = statusMeta('card', result.status);
  host.innerHTML = `
    <div class="verify-result__status">
      ${icon(result.status === 'approved' ? 'check-circle' : 'shield')}
      <h3>Credential confirmed</h3>
    </div>
    <p>An active Trump Offers membership card matches that reference and last-four pair.</p>
    <dl class="card-result__rows" style="margin-top:16px">
      <div class="card-result__row"><span>Reference</span><strong>${escapeHTML(result.reference)}</strong></div>
      <div class="card-result__row"><span>Cardholder</span><strong>${escapeHTML(result.cardholder_name)}</strong></div>
      <div class="card-result__row"><span>Design</span><strong>${escapeHTML(result.design)}</strong></div>
      <div class="card-result__row"><span>Last four</span><strong>•••• ${escapeHTML(result.last4)}</strong></div>
      <div class="card-result__row"><span>Status</span><strong>${badge('card', result.status)}</strong></div>
      <div class="card-result__row"><span>Created</span><strong>${formatDate(result.created_at, { short: true })}</strong></div>
    </dl>
    <p class="fine" style="margin-top:14px">Status: ${escapeHTML(meta.label)}. ${result.note ? escapeHTML(result.note) : ''}</p>
    <div class="notice-bar" style="margin-top:16px;border-color:var(--line-ink);background:rgba(198,162,91,.06);color:var(--ink-muted)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></svg>
      Credential verified. Official member of Trump Offers Privileged Network.
    </div>`;
  updatePreview(result);
}

function renderMissing() {
  const host = $('#verify-result');
  if (!host) return;
  host.hidden = false;
  host.innerHTML = `<div class="verify-result__status">${icon('search')}<h3>No matching record</h3></div>
    <p>We could not verify a membership card with those details. Check the reference and last four digits exactly as issued.</p>`;
  showAlert('No membership record matched those details.', 'error');
}

async function boot() {
  const form = $('#verify-form');
  const ref = getParam('ref');
  const last4 = getParam('last4');
  if (ref) form.elements.reference.value = ref;
  if (last4) form.elements.last4.value = last4;

  const submit = async () => {
    clearFormErrors(form);
    showAlert('');
    const reference = form.elements.reference.value.trim();
    const digits = form.elements.last4.value.trim();
    let valid = true;
    if (!reference) {
      fieldError(form.elements.reference, 'Enter the card reference.');
      valid = false;
    }
    if (!/^\d{4}$/.test(digits)) {
      fieldError(form.elements.last4, 'Enter the final four digits.');
      valid = false;
    }
    if (!valid) {
      focusFirstError(form);
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true, 'Verifying');
    try {
      const api = await getApi();
      const result = await api.verifyCard(reference, digits);
      if (!result) renderMissing();
      else renderResult(result);
    } catch (error) {
      showAlert(error.message || 'We could not verify that card.');
    } finally {
      setLoading(button, false);
    }
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  if (ref && last4) submit();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
