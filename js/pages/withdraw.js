/**
 * Trump Offers — withdrawal desk.
 *
 * Card-only withdrawals. The card form is driven by administrator-managed
 * fields loaded from the database, so adding or editing a field requires no
 * redeploy. The server remains the authority for balances, limits and status
 * transitions; this file only presents and validates the request.
 */

import { getApi, config } from '../lib/api.js';
import { initAppShell } from '../lib/shell.js';
import {
  $,
  $$,
  escapeHTML,
  formatCurrency,
  formatDateTime,
  badge,
  openModal,
  closeModal,
  initModals,
  copyText,
  toast,
  setLoading,
  clearFormErrors,
  fieldError,
  focusFirstError,
  getParam,
} from '../lib/utils.js';
import { icon } from '../icons.js';

const CARD_METHOD = {
  method: 'card',
  label: 'Connect Your Card',
  processing_time: '1–2 business days after approval',
  min_amount: 100,
  max_amount: 30000,
  fee_type: 'none',
  fee_value: 0,
  enabled: true,
};

const FALLBACK_CARD_FIELDS = [
  { field_key: 'bank_name', label: 'Bank name', placeholder: 'e.g. Chase Bank', help_text: 'The bank that issued the card.', input_type: 'text', required: true, max_length: 80 },
  { field_key: 'phone_number', label: 'Phone number', placeholder: '+1 555 000 0000', help_text: 'A number the bank can reach you on if the payout needs verification.', input_type: 'tel', required: true, max_length: 32 },
];

let api;
let session;
let account = null;
let methods = [CARD_METHOD];
let paymentAccounts = [];
let cardFields = FALLBACK_CARD_FIELDS;
let pendingPayload = null;

function showAlert(message, type = 'error') {
  const host = $('[data-withdraw-alert]');
  if (!host) return;
  host.innerHTML = message
    ? `<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(
        type === 'error' ? 'alert-triangle' : 'check-circle'
      )}<div>${escapeHTML(message)}</div></div>`
    : '';
}

function methodConfig() {
  return methods.find((m) => m.method === 'card') || CARD_METHOD;
}

function compact(value) {
  return String(value || '').replace(/\s+/g, '');
}

function cardDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function luhnValid(value) {
  const digits = cardDigits(value);
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (alt) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function cardBrand(value) {
  const digits = cardDigits(value);
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^(6011|65|64[4-9])/.test(digits)) return 'Discover';
  if (/^35/.test(digits)) return 'JCB';
  if (/^3(0[0-5]|[68])/.test(digits)) return 'Diners Club';
  if (/^62/.test(digits)) return 'UnionPay';
  return 'Card';
}

function formatCardNumber(value) {
  const digits = cardDigits(value).slice(0, 19);
  if (/^3[47]/.test(digits)) {
    return [digits.slice(0, 4), digits.slice(4, 10), digits.slice(10, 15)].filter(Boolean).join(' ');
  }
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function amountValue() {
  const raw = Number($('#withdraw-amount')?.value || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function activeCardAccounts() {
  return paymentAccounts.filter((p) => p.type === 'card' && p.status === 'active');
}

function selectedCardAccount() {
  const id = $('input[name="cardPaymentAccountId"]')?.value;
  return activeCardAccounts().find((p) => p.id === id) || null;
}

function cardBankName(card) {
  return card?.extra?.bank_name || card?.bank_name || '';
}

function destinationPreview() {
  const selected = selectedCardAccount();
  if (!selected) return 'No card connected';
  const bank = cardBankName(selected);
  return `${selected.card_brand || 'Card'} •••• ${selected.card_last4 || ''}${bank ? ` · ${bank}` : ''}`;
}

function updateSummary() {
  const amount = amountValue();
  const meta = methodConfig();

  const amountHost = $('[data-summary-amount]');
  if (amountHost) amountHost.innerHTML = `${formatCurrency(amount, { cents: amount % 1 !== 0 })} <small>USD</small>`;
  const availableHost = $('[data-summary-available]');
  if (availableHost) availableHost.textContent = account ? formatCurrency(account.available_balance) : '—';
  const methodHost = $('[data-summary-method]');
  if (methodHost) methodHost.textContent = meta.label;
  const destinationHost = $('[data-summary-destination]');
  if (destinationHost) destinationHost.textContent = destinationPreview();
  const feeHost = $('[data-summary-fee]');
  if (feeHost) feeHost.textContent = Number(meta.fee_value || 0) > 0 ? formatCurrency(meta.fee_value, { cents: true }) : 'None';
  const netHost = $('[data-summary-net]');
  if (netHost) netHost.textContent = amount ? formatCurrency(Math.max(0, amount)) : '—';
  const arrivalHost = $('[data-summary-arrival]');
  if (arrivalHost) arrivalHost.textContent = meta.processing_time || '—';
}

function renderCardFields() {
  const host = $('[data-dynamic-card-fields]');
  if (!host) return;
  if (!cardFields.length) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = cardFields
    .map((field) => {
      const key = field.field_key;
      const id = `card-extra-${key}`;
      const required = field.required ? ' required' : '';
      const optional = field.required ? '' : ' <span class="field__optional">Optional</span>';
      const help = field.help_text ? `<span class="field__hint">${escapeHTML(field.help_text)}</span>` : '';
      const common = `class="input" id="${escapeHTML(id)}" name="extra[${escapeHTML(key)}]" data-card-field data-field-key="${escapeHTML(
        key
      )}" maxlength="${Number(field.max_length || 80)}" placeholder="${escapeHTML(field.placeholder || '')}"${required}`;
      let control;
      if (field.input_type === 'textarea') {
        control = `<textarea class="textarea" id="${escapeHTML(id)}" name="extra[${escapeHTML(
          key
        )}]" data-card-field data-field-key="${escapeHTML(key)}" maxlength="${Number(
          field.max_length || 80
        )}" rows="3" placeholder="${escapeHTML(field.placeholder || '')}"${required}></textarea>`;
      } else {
        const type = ['text', 'tel', 'number', 'email'].includes(field.input_type) ? field.input_type : 'text';
        control = `<input ${common} type="${type}"${type === 'tel' ? ' inputmode="tel" autocomplete="tel"' : ''}>`;
      }
      return `<div class="field">
        <label class="field__label" for="${escapeHTML(id)}">${escapeHTML(field.label)}${optional}</label>
        ${control}
        ${help}
      </div>`;
    })
    .join('');
}

function collectExtra(form) {
  const extra = {};
  form.querySelectorAll('[data-card-field]').forEach((input) => {
    const key = input.dataset.fieldKey;
    extra[key] = String(input.value || '').trim();
  });
  return extra;
}

function validateExtra(form) {
  let valid = true;
  cardFields.forEach((field) => {
    const input = form.querySelector(`[data-field-key="${field.field_key}"]`);
    if (!input) return;
    const value = String(input.value || '').trim();
    if (!value) {
      if (field.required) {
        fieldError(input, `Enter ${field.label.toLowerCase()}.`);
        valid = false;
      }
      return;
    }
    if (value.length > Number(field.max_length || 80)) {
      fieldError(input, `${field.label} must be ${field.max_length || 80} characters or fewer.`);
      valid = false;
    } else if (field.input_type === 'number' && !/^[0-9]+(\.[0-9]+)?$/.test(value)) {
      fieldError(input, `${field.label} must be a number.`);
      valid = false;
    } else if (field.input_type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(value)) {
      fieldError(input, `Enter a valid ${field.label.toLowerCase()}.`);
      valid = false;
    } else if (
      field.input_type === 'tel' &&
      (value.replace(/\D/g, '').length < 7 || !/^[0-9+()\-.\s]{7,32}$/.test(value))
    ) {
      fieldError(input, `Enter a valid ${field.label.toLowerCase()}.`);
      valid = false;
    }
  });
  return valid;
}

function renderCardAccounts() {
  const host = $('[data-card-accounts]');
  if (!host) return;
  const accounts = activeCardAccounts();
  const statusHost = $('[data-card-status]');
  const submit = $('[data-submit-withdrawal]');

  if (!accounts.length) {
    host.innerHTML = `<div class="empty empty--compact">
      <div class="empty__title">Connect your card to continue</div>
      <p class="empty__text">You must connect a valid card before a withdrawal can be requested. Select <strong>Connect a payout card</strong> below to add your bank and card details.</p>
    </div>`;
    const input = $('input[name="cardPaymentAccountId"]');
    if (input) input.value = '';
    if (statusHost) {
      statusHost.innerHTML = `<div class="alert alert--error" role="alert">${icon(
        'alert-triangle'
      )}<div>No card is connected. Connect a card before submitting a withdrawal.</div></div>`;
    }
    if (submit) submit.disabled = true;
    return;
  }

  host.innerHTML = accounts
    .map((p) => {
      const bank = cardBankName(p);
      const phone = p.extra?.phone_number || '';
      const meta = [p.account_holder || session?.profile?.full_name || '', bank, phone].filter(Boolean).join(' · ');
      return `<label class="card-account">
        <input type="radio" name="cardAccount" value="${escapeHTML(p.id)}">
        <span class="card-account__body">
          <span class="card-account__brand">${escapeHTML(p.card_brand || 'Card')}${p.is_default ? ' · Default' : ''}</span>
          <span class="card-account__number">•••• ${escapeHTML(p.card_last4 || '••••')}</span>
          <span class="card-account__meta">${escapeHTML(meta)}</span>
          <span class="card-account__status">${escapeHTML(
            p.provider === 'fixture' ? 'Tokenised (development fixture)' : 'Encrypted card on file'
          )}${p.card_exp_month ? ` · Expires ${String(p.card_exp_month).padStart(2, '0')}/${String(p.card_exp_year || '').slice(-2)}` : ''}</span>
        </span>
      </label>`;
    })
    .join('');
  const input = $('input[name="cardPaymentAccountId"]');
  if (input) input.value = accounts[0].id;
  const radios = host.querySelectorAll('input[name="cardAccount"]');
  if (radios[0]) radios[0].checked = true;
  radios.forEach((r) =>
    r.addEventListener('change', () => {
      if (input) input.value = r.value;
      updateSummary();
    })
  );
  if (statusHost) statusHost.innerHTML = '';
  if (submit) submit.disabled = false;
}

function renderHistory(withdrawals) {
  const host = $('[data-withdraw-history]');
  const count = $('[data-withdraw-count]');
  if (count) count.textContent = `${withdrawals.length} request${withdrawals.length === 1 ? '' : 's'}`;
  if (!host) return;
  if (!withdrawals.length) {
    host.innerHTML = `<div class="empty"><div class="empty__title">No withdrawals yet</div><p class="empty__text">Submitted requests will appear here with a reference and status.</p></div>`;
    return;
  }
  host.innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Reference</th><th>Destination</th><th>Amount</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>${withdrawals
      .map(
        (w) => `<tr>
          <td class="cell-mono">${escapeHTML(w.reference)}</td>
          <td><span class="cell-strong">${escapeHTML(w.destination_label || '—')}</span><span class="cell-sub">${escapeHTML(
          w.bank_name || w.account_name || ''
        )}</span></td>
          <td class="cell-amount">${formatCurrency(w.amount)}</td>
          <td>${formatDateTime(w.created_at)}</td>
          <td>${badge('withdrawal', w.status)}</td>
          <td><button class="link-btn" type="button" data-withdraw-view="${escapeHTML(w.id)}">View</button></td>
        </tr>`
      )
      .join('')}</tbody>
  </table></div>`;
  $$('[data-withdraw-view]', host).forEach((btn) =>
    btn.addEventListener('click', () => showTimeline(btn.dataset.withdrawView))
  );
}

async function showTimeline(id) {
  const host = $('[data-withdraw-timeline]');
  if (!host) return;
  host.innerHTML = `<div class="skeleton" style="height:120px"></div>`;
  openModal('withdraw-detail-modal');
  try {
    const history = await api.getWithdrawalHistory(id);
    const withdrawal = (await api.getWithdrawals()).find((w) => w.id === id);
    const rows = history.length
      ? history
          .map(
            (h) => `<div class="timeline__item">
              <span class="timeline__dot"></span>
              <div><div class="timeline__title">${escapeHTML(
                h.to_status === h.from_status ? 'Administrative note' : statusLabel(h.to_status)
              )}</div>
              <div class="timeline__time">${formatDateTime(h.created_at)}</div>
              ${h.note ? `<p class="timeline__note">${escapeHTML(h.note)}</p>` : ''}</div>
            </div>`
          )
          .join('')
      : '<p class="fine">No status events have been recorded yet.</p>';
    host.innerHTML = `
      ${
        withdrawal
          ? `<div class="admin-detail" style="margin-bottom:18px">
              <div class="admin-detail__row"><span>Reference</span><strong class="cell-mono">${escapeHTML(withdrawal.reference)}</strong></div>
              <div class="admin-detail__row"><span>Amount</span><strong>${escapeHTML(formatCurrency(withdrawal.amount))}</strong></div>
              <div class="admin-detail__row"><span>Destination</span><strong>${escapeHTML(withdrawal.destination_label || '—')}</strong></div>
              <div class="admin-detail__row"><span>Current status</span><strong>${badge('withdrawal', withdrawal.status)}</strong></div>
            </div>`
          : ''
      }
      <div class="timeline">${rows}</div>`;
  } catch (error) {
    host.innerHTML = `<div class="alert alert--error" role="alert">${icon('alert-triangle')}<div>${escapeHTML(
      error.message
    )}</div></div>`;
  }
}

function statusLabel(status = '') {
  const labels = {
    pending: 'Pending approval',
    reviewing: 'Under review',
    approved: 'Approved — awaiting payment',
    processing: 'Processing payment',
    completed: 'Successful',
    rejected: 'Rejected',
    cancelled: 'Cancelled',
  };
  return labels[status] || status.replaceAll('_', ' ');
}

async function refresh() {
  const [nextAccount, withdrawals] = await Promise.all([api.getRewardAccount(), api.getWithdrawals()]);
  account = nextAccount;
  renderHistory(withdrawals);
  updateSummary();
}

function validateAndBuild() {
  const form = $('#withdraw-form');
  clearFormErrors(form);
  showAlert('');
  const meta = methodConfig();
  const amount = amountValue();
  let valid = true;

  if (!Number.isFinite(amount) || amount < Number(meta.min_amount)) {
    fieldError($('#withdraw-amount'), `The minimum withdrawal amount is ${formatCurrency(meta.min_amount)}.`);
    valid = false;
  } else if (amount > Number(meta.max_amount)) {
    fieldError($('#withdraw-amount'), `The maximum withdrawal amount is ${formatCurrency(meta.max_amount)}.`);
    valid = false;
  } else if (account && amount > Number(account.available_balance)) {
    fieldError($('#withdraw-amount'), `That exceeds your available balance of ${formatCurrency(account.available_balance)}.`);
    valid = false;
  }

  const card = selectedCardAccount();
  if (!card) {
    showAlert('Connect a valid card before requesting a withdrawal.');
    valid = false;
  }

  if (!form.elements.confirm.checked) {
    fieldError(form.elements.confirm, 'Please confirm your withdrawal authorisation.');
    valid = false;
  }

  if (!valid) {
    focusFirstError(form);
    return null;
  }

  return {
    amount,
    method: 'card',
    currency: 'USD',
    accountName: card.account_holder || session.profile.full_name || '',
    cardPaymentAccountId: card.id,
    idempotencyKey: crypto.randomUUID
      ? crypto.randomUUID()
      : `wd-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  };
}

function reviewRows(payload) {
  const meta = methodConfig();
  const card = selectedCardAccount();
  const amount = Number(payload.amount);
  return [
    ['Amount', formatCurrency(amount, { cents: amount % 1 !== 0 })],
    ['Method', meta.label],
    ['Processing fee', 'None'],
    ['Net payout', formatCurrency(amount, { cents: amount % 1 !== 0 })],
    ['Estimated arrival', meta.processing_time || '—'],
    ['Card', `${card?.card_brand || 'Card'} •••• ${card?.card_last4 || ''}`],
    ['Cardholder', payload.accountName],
    ['Bank', cardBankName(card) || '—'],
    ['Connection', card?.provider === 'fixture' ? 'Development fixture' : 'Encrypted card on file'],
  ];
}

function openReview(payload) {
  const host = $('[data-review-rows]');
  if (!host) return;
  host.innerHTML = reviewRows(payload)
    .map(
      ([label, value]) =>
        `<div class="claim-review__row"><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(String(value))}</dd></div>`
    )
    .join('');
  pendingPayload = payload;
  openModal('withdraw-review-modal');
}

function showProcessing() {
  const screen = $('[data-processing-screen]');
  if (!screen) return;
  screen.hidden = false;
  document.body.classList.add('no-scroll');
}

function hideProcessing() {
  const screen = $('[data-processing-screen]');
  if (!screen) return;
  screen.hidden = true;
  document.body.classList.remove('no-scroll');
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function showConfirmation(withdrawal) {
  $('[data-withdraw-ref]').textContent = withdrawal.reference;
  $('[data-withdraw-reference]').textContent = withdrawal.reference;
  $('[data-withdraw-amount]').textContent = formatCurrency(withdrawal.amount, { cents: withdrawal.amount % 1 !== 0 });
  $('[data-withdraw-destination]').textContent = withdrawal.destination_label || '—';
  $('[data-withdraw-date]').textContent = formatDateTime(withdrawal.created_at);
  const statusHost = $('[data-withdraw-status-badge]');
  if (statusHost) statusHost.innerHTML = badge('withdrawal', withdrawal.status);
  openModal('withdraw-modal');
}

async function submitPending() {
  if (!pendingPayload) return;
  const button = $('[data-confirm-withdrawal]');
  setLoading(button, true, 'Submitting…');
  showProcessing();
  try {
    // Keep the processing state visible long enough to feel deliberate without
    // implying that money has already moved.
    const [withdrawal] = await Promise.all([api.createWithdrawal(pendingPayload), delay(2400)]);
    hideProcessing();
    closeModal('withdraw-review-modal');
    showConfirmation(withdrawal);
    pendingPayload = null;
    resetForm();
    await refresh();
    toast('Withdrawal request submitted and awaiting approval.', 'success');
  } catch (error) {
    hideProcessing();
    showAlert(error.message || 'We could not submit the withdrawal.');
    toast(error.message || 'We could not submit the withdrawal.', 'error');
  } finally {
    setLoading(button, false);
  }
}

function resetForm() {
  const form = $('#withdraw-form');
  if (!form) return;
  form.reset();
  const cardInput = $('input[name="cardPaymentAccountId"]');
  if (cardInput) cardInput.value = activeCardAccounts()[0]?.id || '';
  if (activeCardAccounts().length) {
    $$('input[name="cardAccount"]').forEach((r) => (r.checked = r.value === activeCardAccounts()[0].id));
  }
  updateSummary();
}

function populateCardExpiryYears() {
  const select = $('#card-exp-year');
  if (!select) return;
  const year = new Date().getFullYear();
  select.innerHTML = `<option value="">Year</option>${Array.from({ length: 21 }, (_, i) => year + i)
    .map((y) => `<option value="${y}">${y}</option>`)
    .join('')}`;
}

function showCardConnectAlert(message, type = 'error') {
  const host = $('[data-card-connect-alert]');
  if (!host) return;
  host.innerHTML = message
    ? `<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(
        type === 'error' ? 'alert-triangle' : 'check-circle'
      )}<div>${escapeHTML(message)}</div></div>`
    : '';
}

function updateCardBrandHint() {
  const hint = $('[data-card-brand-hint]');
  if (!hint) return;
  const input = $('#card-number');
  const digits = cardDigits(input?.value);
  hint.textContent =
    digits.length >= 4
      ? `${cardBrand(digits)} detected. The full number is encrypted and never shown to members after connection.`
      : 'Visa, Mastercard, American Express, Discover and other major networks.';
}

function openCardConnect() {
  const providerUrl = config.cardConnectUrl || '';
  if (providerUrl) {
    const url = new URL(providerUrl);
    url.searchParams.set('return_url', `${location.origin}${location.pathname}`);
    url.searchParams.set('reference', `TO-CARD-${Date.now()}`);
    location.href = url.toString();
    return;
  }
  showCardConnectAlert('');
  const form = $('#card-connect-form');
  if (form) {
    form.reset();
    const name = form.elements.cardholderName;
    if (name) name.value = session?.profile?.full_name || '';
  }
  renderCardFields();
  populateCardExpiryYears();
  updateCardBrandHint();
  openModal('card-connect-modal');
}

async function submitCardConnect(event) {
  event.preventDefault();
  const form = event.currentTarget;
  clearFormErrors(form);
  showCardConnectAlert('');
  const name = form.elements.cardholderName.value.trim();
  const digits = cardDigits(form.elements.cardNumber.value);
  const month = Number(form.elements.expMonth.value);
  const year = Number(form.elements.expYear.value);
  const now = new Date();
  let valid = true;

  if (name.length < 2) {
    fieldError(form.elements.cardholderName, 'Enter the cardholder name.');
    valid = false;
  }
  if (!luhnValid(digits)) {
    fieldError(form.elements.cardNumber, 'Enter a valid card number.');
    valid = false;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    fieldError(form.elements.expMonth, 'Select the expiry month.');
    valid = false;
  }
  if (!Number.isInteger(year) || year < now.getFullYear() || year > now.getFullYear() + 20) {
    fieldError(form.elements.expYear, 'Select a valid expiry year.');
    valid = false;
  } else if (year === now.getFullYear() && month < now.getMonth() + 1) {
    fieldError(form.elements.expMonth, 'That card has expired.');
    valid = false;
  }
  if (!validateExtra(form)) valid = false;

  if (!valid) {
    focusFirstError(form);
    return;
  }

  const button = $('[data-card-connect-submit]');
  setLoading(button, true, 'Connecting…');
  try {
    const created = await api.connectPaymentCard({
      cardholderName: name,
      cardNumber: digits,
      expMonth: month,
      expYear: year,
      label: form.elements.label.value.trim(),
      isDefault: true,
      extra: collectExtra(form),
    });
    paymentAccounts = (await api.getPaymentAccounts()) || [];
    renderCardAccounts();
    const input = $('input[name="cardPaymentAccountId"]');
    if (input && created?.id) input.value = created.id;
    closeModal('card-connect-modal');
    form.reset();
    const cardRadio = document.querySelector(`input[name="cardAccount"][value="${created?.id || ''}"]`);
    if (cardRadio) cardRadio.checked = true;
    updateSummary();
    toast('Payout card connected.', 'success');
  } catch (error) {
    showCardConnectAlert(error.message || 'The card could not be connected.');
  } finally {
    setLoading(button, false);
  }
}

async function importReturnedCard() {
  const token = getParam('card_token');
  if (!token) return;
  const brand = getParam('card_brand') || 'Card';
  const last4 = getParam('card_last4') || '';
  try {
    await api.savePaymentAccount({
      type: 'card',
      provider: config.cardProviderName || 'provider',
      providerToken: token,
      label: `${brand} ending ${last4}`,
      accountHolder: session.profile.full_name || '',
      cardBrand: brand,
      cardLast4: last4,
      cardExpMonth: Number(getParam('card_exp_month')) || null,
      cardExpYear: Number(getParam('card_exp_year')) || null,
      isDefault: true,
    });
    paymentAccounts = await api.getPaymentAccounts();
    renderCardAccounts();
    toast('Card connected securely.', 'success');
  } catch (error) {
    toast(error.message || 'The card could not be connected.', 'error');
  } finally {
    const url = new URL(location.href);
    ['card_token', 'card_brand', 'card_last4', 'card_exp_month', 'card_exp_year'].forEach((key) => url.searchParams.delete(key));
    history.replaceState({}, '', url.toString());
  }
}

async function boot() {
  initModals();
  session = await initAppShell({ page: 'withdraw', title: 'Withdraw funds', crumb: 'Member' });
  if (!session) return;
  api = await getApi();

  const form = $('#withdraw-form');

  try {
    const configData = await api.getWithdrawalMethods();
    if (configData?.methods?.length) {
      methods = configData.methods.filter((m) => m.method === 'card');
      if (!methods.length) methods = [CARD_METHOD];
    }
  } catch (error) {
    console.warn('[Trump Offers] withdrawal configuration unavailable, using defaults:', error.message);
  }

  try {
    const fields = await api.getCardFormFields();
    if (Array.isArray(fields) && fields.length) cardFields = fields;
  } catch (error) {
    console.warn('[Trump Offers] card form fields unavailable, using defaults:', error.message);
  }

  try {
    paymentAccounts = (await api.getPaymentAccounts()) || [];
  } catch (error) {
    console.warn('[Trump Offers] payment accounts unavailable:', error.message);
    paymentAccounts = [];
  }

  await importReturnedCard();
  renderCardFields();
  renderCardAccounts();
  updateSummary();
  try {
    await refresh();
  } catch (error) {
    showAlert(error.message || 'Your withdrawal details could not be loaded.');
    const host = $('[data-withdraw-history]');
    if (host) {
      host.innerHTML = `<div class="empty"><div class="empty__title">History unavailable</div><p class="empty__text">${escapeHTML(
        error.message || 'Please try again shortly.'
      )}</p></div>`;
    }
  }

  $('#withdraw-amount')?.addEventListener('input', updateSummary);
  $$('[data-amount]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const min = Number(methodConfig().min_amount || 100);
      const max = Math.min(Number(methodConfig().max_amount || 30000), Number(account?.available_balance || 0));
      const value = btn.dataset.amount === 'max' ? Math.floor(max) : Number(btn.dataset.amount);
      const input = $('#withdraw-amount');
      if (input) input.value = String(Math.max(min, Math.min(max, value)));
      updateSummary();
      input?.focus();
    })
  );
  $('[data-connect-card]')?.addEventListener('click', openCardConnect);
  $('#card-connect-form')?.addEventListener('submit', submitCardConnect);
  $('#card-number')?.addEventListener('input', (e) => {
    const input = e.currentTarget;
    const caret = input.selectionStart ?? input.value.length;
    const digitsBefore = cardDigits(input.value.slice(0, caret)).length;
    const formatted = formatCardNumber(input.value);
    input.value = formatted;
    let position = 0;
    let seen = 0;
    while (position < formatted.length && seen < digitsBefore) {
      if (/\d/.test(formatted[position])) seen += 1;
      position += 1;
    }
    input.setSelectionRange(position, position);
    updateCardBrandHint();
  });
  populateCardExpiryYears();
  $('[data-confirm-withdrawal]')?.addEventListener('click', submitPending);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const payload = validateAndBuild();
    if (payload) openReview(payload);
  });

  $('[data-withdraw-copy]')?.addEventListener('click', () => {
    copyText($('[data-withdraw-ref]')?.textContent?.trim() || '');
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
