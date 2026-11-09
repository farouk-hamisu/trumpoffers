/**
 * Trump Offers — withdrawal desk.
 */

import { getApi } from '../lib/api.js';
import { initAppShell } from '../lib/shell.js';
import {
  $,
  $$,
  escapeHTML,
  formatCurrency,
  formatDateTime,
  badge,
  openModal,
  copyText,
  toast,
  setLoading,
  clearFormErrors,
  fieldError,
  focusFirstError,
} from '../lib/utils.js';
import { icon } from '../icons.js';

const METHOD_LABELS = {
  bank_transfer: { label: 'Bank transfer', arrival: '2–3 business days' },
  digital_wallet: { label: 'Digital wallet', arrival: 'Within 24 hours' },
  card_credit: { label: 'Card credit', arrival: '1–2 business days' },
};

let api;
let session;
let account = null;

function showAlert(message, type = 'error') {
  const host = $('[data-withdraw-alert]');
  if (!host) return;
  host.innerHTML = message
    ? `<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(
        type === 'error' ? 'alert-triangle' : 'check-circle'
      )}<div>${escapeHTML(message)}</div></div>`
    : '';
}

function selectedMethod() {
  return document.querySelector('input[name="method"]:checked')?.value || 'bank_transfer';
}

function updateSummary() {
  const raw = Number($('#withdraw-amount')?.value || 0);
  const amount = Number.isFinite(raw) && raw > 0 ? raw : 0;
  const method = METHOD_LABELS[selectedMethod()] || METHOD_LABELS.bank_transfer;
  const amountHost = $('[data-summary-amount]');
  if (amountHost) amountHost.innerHTML = `${formatCurrency(amount, { cents: amount % 1 !== 0 })} <small>USD</small>`;
  const availableHost = $('[data-summary-available]');
  if (availableHost) availableHost.textContent = account ? formatCurrency(account.available_balance) : '—';
  const methodHost = $('[data-summary-method]');
  if (methodHost) methodHost.textContent = method.label;
  const arrivalHost = $('[data-summary-arrival]');
  if (arrivalHost) arrivalHost.textContent = method.arrival;
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
    <thead><tr><th>Reference</th><th>Destination</th><th>Method</th><th>Amount</th><th>Submitted</th><th>Status</th></tr></thead>
    <tbody>${withdrawals
      .map(
        (w) => `<tr>
          <td class="cell-mono">${escapeHTML(w.reference)}</td>
          <td><span class="cell-strong">${escapeHTML(w.destination_label || '—')}</span><span class="cell-sub">${escapeHTML(w.account_name || '')}</span></td>
          <td>${escapeHTML(METHOD_LABELS[w.method]?.label || w.method)}</td>
          <td class="cell-amount">${formatCurrency(w.amount)}</td>
          <td>${formatDateTime(w.created_at)}</td>
          <td>${badge('withdrawal', w.status)}</td>
        </tr>`
      )
      .join('')}</tbody>
  </table></div>`;
}

async function refresh() {
  const [nextAccount, withdrawals] = await Promise.all([api.getRewardAccount(), api.getWithdrawals()]);
  account = nextAccount;
  renderHistory(withdrawals);
  updateSummary();
}

async function boot() {
  session = await initAppShell({ page: 'withdraw', title: 'Withdraw funds', crumb: 'Member' });
  if (!session) return;
  api = await getApi();

  const form = $('#withdraw-form');
  form.elements.accountName.value = session.profile.full_name || '';
  await refresh();

  const amountInput = $('#withdraw-amount');
  amountInput?.addEventListener('input', updateSummary);
  $$('input[name="method"]').forEach((radio) => radio.addEventListener('change', updateSummary));

  $$('[data-amount]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const value = btn.dataset.amount === 'max' ? Math.floor(account?.available_balance || 0) : Number(btn.dataset.amount);
      amountInput.value = String(value);
      updateSummary();
      amountInput.focus();
    })
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    showAlert('');
    const amount = Number(amountInput.value);
    const destinationLabel = form.elements.destination.value.trim();
    const accountName = form.elements.accountName.value.trim();
    const method = selectedMethod();
    let valid = true;

    if (!Number.isFinite(amount) || amount < 100) {
      fieldError(amountInput, 'The minimum withdrawal amount is $100.');
      valid = false;
    } else if (account && amount > Number(account.available_balance)) {
      fieldError(amountInput, `That exceeds your available balance of ${formatCurrency(account.available_balance)}.`);
      valid = false;
    }
    if (!destinationLabel) {
      fieldError(form.elements.destination, 'Add a masked destination label.');
      valid = false;
    } else if (/\d{8,}/.test(destinationLabel.replace(/[^\d]/g, ''))) {
      fieldError(form.elements.destination, 'Use a masked label only. Do not enter full banking details.');
      valid = false;
    }
    if (!accountName) {
      fieldError(form.elements.accountName, 'Enter the account holder name.');
      valid = false;
    }
    if (!form.elements.confirm.checked) {
      fieldError(form.elements.confirm, 'Please confirm your withdrawal authorization.');
      valid = false;
    }
    if (!valid) {
      focusFirstError(form);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      const withdrawal = await api.createWithdrawal({ amount, method, destinationLabel, accountName });
      const methodMeta = METHOD_LABELS[method] || METHOD_LABELS.bank_transfer;
      $('[data-withdraw-ref]').textContent = withdrawal.reference;
      $('[data-withdraw-amount]').textContent = formatCurrency(withdrawal.amount);
      $('[data-withdraw-method]').textContent = methodMeta.label;
      $('[data-withdraw-destination]').textContent = withdrawal.destination_label;
      $('[data-withdraw-estimate]').textContent = methodMeta.arrival;
      openModal('withdraw-modal');
      form.reset();
      form.elements.accountName.value = session.profile.full_name || '';
      updateSummary();
      await refresh();
      toast('Withdrawal request submitted.', 'success');
    } catch (error) {
      showAlert(error.message || 'We could not submit the withdrawal.');
    } finally {
      setLoading(button, false);
    }
  });

  $('[data-withdraw-copy]')?.addEventListener('click', () => {
    copyText($('[data-withdraw-ref]')?.textContent?.trim() || '');
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
