/**
 * Trump Offers — digital card studio.
 */

import { getApi, currentUser, loginUrl } from '../lib/api.js';
import {
  $,
  $$,
  escapeHTML,
  formatDate,
  groupCardNumber,
  badge,
  toast,
  setLoading,
  clearFormErrors,
  fieldError,
  focusFirstError,
} from '../lib/utils.js';
import { icon } from '../icons.js';

const DESIGNS = {
  noir: { label: 'Trump Noir', cls: '' },
  champagne: { label: 'Champagne', cls: 'ho-card--champagne' },
  obsidian: { label: 'Obsidian', cls: 'ho-card--obsidian' },
  heritage: { label: 'Heritage', cls: 'ho-card--heritage' },
};

let api;
let session;

function showAlert(message, type = 'error') {
  const host = $('[data-card-alert]');
  if (!host) return;
  host.innerHTML = message
    ? `<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(
        type === 'error' ? 'alert-triangle' : 'check-circle'
      )}<div>${escapeHTML(message)}</div></div>`
    : '';
}

function currentDesign() {
  return document.querySelector('input[name="design"]:checked')?.value || 'noir';
}

function applyDesign(design) {
  const preview = $('#card-preview');
  if (!preview) return;
  preview.classList.remove('ho-card--champagne', 'ho-card--obsidian', 'ho-card--heritage');
  const cls = DESIGNS[design]?.cls;
  if (cls) preview.classList.add(cls);
}

function setNumber(number) {
  const host = $('[data-card-number]');
  if (!host) return;
  const parts = number ? groupCardNumber(number).split(' ') : ['••••', '••••', '••••', '••••'];
  host.innerHTML = parts.map((p) => `<span>${escapeHTML(p)}</span>`).join('');
}

function updatePreview({ name, design, number, month, year } = {}) {
  const nameHost = $('[data-card-name]');
  if (nameHost && name !== undefined) nameHost.textContent = (name || 'YOUR NAME').toUpperCase();
  const expHost = $('[data-card-expiry]');
  if (expHost) expHost.textContent = month ? `${String(month).padStart(2, '0')} / ${String(year).slice(-2)}` : '— / —';
  if (design) applyDesign(design);
  if (number !== undefined) setNumber(number);
}

function resultFor(card) {
  const design = DESIGNS[card.design] || DESIGNS.noir;
  $('[data-card-ref]').textContent = card.reference;
  $('[data-card-design]').textContent = design.label;
  $('[data-card-holder]').textContent = card.cardholder_name;
  $('[data-card-full-number]').textContent = groupCardNumber(card.fictional_card_number);
  $('[data-card-exp]').textContent = `${String(card.expiry_month).padStart(2, '0')} / ${String(card.expiry_year).slice(-2)}`;
  const status = $('[data-card-status]');
  status.innerHTML = badge('card', card.status);
  const verify = $('[data-card-verify]');
  if (verify && card.fictional_card_number) {
    verify.href = `card-verify.html?ref=${encodeURIComponent(card.reference)}&last4=${card.fictional_card_number.slice(-4)}`;
  }
  const result = $('#card-result');
  if (result) result.hidden = false;
  updatePreview({
    name: card.cardholder_name,
    design: card.design,
    number: card.fictional_card_number,
    month: card.expiry_month,
    year: card.expiry_year,
  });
}

function renderApplications(cards) {
  const wrap = $('[data-card-applications]');
  const list = $('[data-card-list]');
  if (!wrap || !list || !cards.length) return;
  wrap.hidden = false;
  list.innerHTML = cards
    .map(
      (c) => `<div class="card-app-row">
        <div class="card-app-row__design">
          <span class="card-app-row__swatch swatch--${escapeHTML(c.design)}"></span>
          <div>
            <div class="card-app-row__name">${escapeHTML(DESIGNS[c.design]?.label || c.design)} · ${escapeHTML(c.cardholder_name)}</div>
            <div class="card-app-row__ref">${escapeHTML(c.reference)}</div>
          </div>
        </div>
        <div class="card-app-row__date">${formatDate(c.created_at, { short: true })}</div>
        <div>${badge('card', c.status)}</div>
      </div>`
    )
    .join('');
}

async function boot() {
  session = await currentUser();
  api = await getApi();
  const form = $('#card-form');

  $$('input[name="design"]').forEach((radio) =>
    radio.addEventListener('change', () => applyDesign(radio.value))
  );

  const nameInput = $('#card-name-input');
  nameInput?.addEventListener('input', () => {
    const name = nameInput.value.toUpperCase().slice(0, 26);
    const host = $('[data-card-name]');
    if (host) host.textContent = name || 'YOUR NAME';
  });
  if (session?.profile?.full_name) {
    nameInput.value = session.profile.full_name.toUpperCase();
    updatePreview({ name: session.profile.full_name });
  }

  if (session) {
    const hint = $('[data-card-auth-hint]');
    if (hint) hint.textContent = 'Your request will be reviewed by a demonstration administrator.';
    try {
      const cards = await api.getCardApplications();
      renderApplications(cards);
      const latest = cards[0];
      if (latest) {
        updatePreview({
          design: latest.design,
          month: latest.expiry_month,
          year: latest.expiry_year,
          number: latest.status === 'approved' ? latest.fictional_card_number : null,
        });
        if (latest.status === 'approved') resultFor(latest);
      }
    } catch (error) {
      console.warn(error);
    }
  } else {
    const hint = $('[data-card-auth-hint]');
    if (hint) hint.textContent = 'You will be asked to sign in before the request is submitted.';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showAlert('');
    clearFormErrors(form);
    const name = nameInput.value.trim();
    if (name.length < 2) {
      fieldError(nameInput, 'Enter the cardholder name.');
      focusFirstError(form);
      return;
    }
    if (!form.elements.confirm.checked) {
      fieldError(form.elements.confirm, 'Please confirm you understand the card is fictional.');
      focusFirstError(form);
      return;
    }
    if (!session) {
      toast('Sign in to submit your card request.', 'info');
      window.setTimeout(() => location.assign(loginUrl('card.html')), 500);
      return;
    }

    const button = form.querySelector('[data-card-submit]');
    setLoading(button, true, 'Creating your card');
    try {
      const card = await api.createCardApplication({
        design: currentDesign(),
        cardholderName: name.toUpperCase().slice(0, 26),
      });
      resultFor(card);
      toast('Demonstration card request submitted.', 'success');
      const cards = await api.getCardApplications();
      renderApplications(cards);
      $('#card-result')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
      showAlert(error.message || 'We could not create the card.');
    } finally {
      setLoading(button, false);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
