/**
 * Trump Offers — withdrawal desk.
 *
 * The form renders method-specific fields, validates locally, requires an
 * explicit review step, then submits a single idempotent request. The server
 * remains the authority for balances, limits and status transitions.
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

const FALLBACK_METHODS = [
  { method: 'bank_transfer', label: 'Bank transfer', processing_time: '2–3 business days', min_amount: 100, max_amount: 30000, fee_type: 'none', fee_value: 0, enabled: true },
  { method: 'crypto', label: 'Cryptocurrency', processing_time: 'Usually within 24 hours of approval', min_amount: 100, max_amount: 30000, fee_type: 'none', fee_value: 0, enabled: true },
  { method: 'card', label: 'Card credit', processing_time: '1–2 business days after approval', min_amount: 100, max_amount: 30000, fee_type: 'none', fee_value: 0, enabled: true },
];

const FALLBACK_NETWORKS = [
  { asset: 'USDT', network: 'TRC20', label: 'Tether USD · TRC20', description: 'Tron network. Low fees, widely supported.', fee_estimate_usd: 1, enabled: true },
  { asset: 'USDT', network: 'ERC20', label: 'Tether USD · ERC20', description: 'Ethereum network. Higher network fees.', fee_estimate_usd: 8, enabled: true },
  { asset: 'USDT', network: 'BEP20', label: 'Tether USD · BEP20', description: 'BNB Smart Chain. Low fees.', fee_estimate_usd: 0.6, enabled: true },
  { asset: 'BTC', network: 'Bitcoin', label: 'Bitcoin · Bitcoin network', description: 'Native Bitcoin network.', fee_estimate_usd: 2, enabled: true },
  { asset: 'ETH', network: 'ERC20', label: 'Ethereum · ERC20', description: 'Ethereum network.', fee_estimate_usd: 8, enabled: true },
  { asset: 'USDC', network: 'ERC20', label: 'USD Coin · ERC20', description: 'Ethereum network.', fee_estimate_usd: 8, enabled: true },
  { asset: 'USDC', network: 'TRC20', label: 'USD Coin · TRC20', description: 'Tron network.', fee_estimate_usd: 1, enabled: true },
  { asset: 'BNB', network: 'BEP20', label: 'BNB · BEP20', description: 'BNB Smart Chain.', fee_estimate_usd: 0.6, enabled: true },
];

const ASSET_META = {
  USDT: { name: 'Tether', symbol: '₮', color: '#26a17b' },
  BTC: { name: 'Bitcoin', symbol: '₿', color: '#f7931a' },
  ETH: { name: 'Ethereum', symbol: 'Ξ', color: '#627eea' },
  USDC: { name: 'USD Coin', symbol: '$', color: '#2775ca' },
  BNB: { name: 'BNB', symbol: '◆', color: '#f3ba2f' },
};

const WALLET_HINTS = {
  ERC20: 'Ethereum-style address beginning with 0x (40 hexadecimal characters).',
  BEP20: 'BNB Smart Chain address beginning with 0x (40 hexadecimal characters).',
  TRC20: 'Tron address beginning with T (34 characters).',
  Bitcoin: 'Bitcoin address beginning with 1, 3 or bc1.',
};

let api;
let session;
let account = null;
let methods = FALLBACK_METHODS;
let networks = FALLBACK_NETWORKS;
let paymentAccounts = [];
let selectedAsset = '';
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

function selectedMethod() {
  return document.querySelector('input[name="method"]:checked')?.value || 'bank_transfer';
}

function methodConfig(value = selectedMethod()) {
  return methods.find((m) => m.method === value) || FALLBACK_METHODS.find((m) => m.method === value) || FALLBACK_METHODS[0];
}

function networkFor(asset = selectedAsset, network = $('#crypto-network')?.value) {
  return networks.find((n) => n.asset === asset && n.network === network) || null;
}

function compact(value) {
  return String(value || '').replace(/\s+/g, '');
}

function validIban(value) {
  const clean = compact(value).toUpperCase();
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(clean)) return false;
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  let digits = '';
  for (const ch of rearranged) digits += /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
  let mod = 0;
  for (const digit of digits) mod = (mod * 10 + Number(digit)) % 97;
  return mod === 1;
}

function validWallet(network, address) {
  const value = String(address || '').trim();
  if (!value) return false;
  if (network === 'ERC20' || network === 'BEP20') return /^0x[a-fA-F0-9]{40}$/.test(value);
  if (network === 'TRC20') return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
  if (network === 'Bitcoin') return /^(bc1[a-zA-HJ-NP-Z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(value);
  return false;
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


function methodFee(method, amount) {
  if (!method) return 0;
  if (method.fee_type === 'flat') return Number(method.fee_value || 0);
  if (method.fee_type === 'percent') return Math.round(Number(amount) * Number(method.fee_value || 0)) / 100;
  return 0;
}

function amountValue() {
  const raw = Number($('#withdraw-amount')?.value || 0);
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

function bankNameValue() {
  const select = $('#bank-name');
  if (!select) return '';
  if (select.value === 'Other') return $('#bank-name-other')?.value.trim() || '';
  return select.value.trim();
}

function destinationPreview(method = selectedMethod()) {
  if (method === 'bank_transfer') {
    const number = compact($('#bank-account-number')?.value);
    const bank = bankNameValue();
    if (!bank && number.length < 4) return 'Not yet entered';
    return `${bank || 'Bank'} •••• ${number.slice(-4) || '----'}`;
  }
  if (method === 'crypto') {
    const asset = selectedAsset;
    const network = $('#crypto-network')?.value || '';
    const address = String($('#crypto-wallet')?.value || '').trim();
    if (!asset) return 'Select an asset';
    if (!address) return `${asset} · ${network}`;
    return `${asset} · ${network} · ${address.slice(0, 6)}…${address.slice(-4)}`;
  }
  const selected = selectedCardAccount();
  return selected ? `${selected.card_brand || 'Card'} •••• ${selected.card_last4 || ''}` : 'No card connected';
}

function selectedCardAccount() {
  const id = $('input[name="cardPaymentAccountId"]')?.value;
  return activeCardAccounts().find((p) => p.id === id) || null;
}

function updateSummary() {
  const amount = amountValue();
  const method = methodConfig();
  const fee = methodFee(method, amount);
  const network = method.method === 'crypto' ? networkFor() : null;

  const amountHost = $('[data-summary-amount]');
  if (amountHost) amountHost.innerHTML = `${formatCurrency(amount, { cents: amount % 1 !== 0 })} <small>USD</small>`;
  const availableHost = $('[data-summary-available]');
  if (availableHost) availableHost.textContent = account ? formatCurrency(account.available_balance) : '—';
  const methodHost = $('[data-summary-method]');
  if (methodHost) methodHost.textContent = method.label;
  const destinationHost = $('[data-summary-destination]');
  if (destinationHost) destinationHost.textContent = destinationPreview(method.method);
  const feeHost = $('[data-summary-fee]');
  if (feeHost) feeHost.textContent = fee > 0 ? formatCurrency(fee, { cents: true }) : 'None';
  const networkRow = $('[data-summary-network-row]');
  if (networkRow) networkRow.hidden = method.method !== 'crypto';
  const networkFeeHost = $('[data-summary-network-fee]');
  if (networkFeeHost) {
    networkFeeHost.textContent = network ? `${formatCurrency(network.fee_estimate_usd, { cents: true })} (est.)` : '—';
  }
  const netHost = $('[data-summary-net]');
  if (netHost) netHost.textContent = amount ? formatCurrency(Math.max(0, amount - fee), { cents: amount % 1 !== 0 || fee > 0 }) : '—';
  const arrivalHost = $('[data-summary-arrival]');
  if (arrivalHost) arrivalHost.textContent = method.processing_time || '—';

  $$('[data-method-time]').forEach((el) => {
    const meta = methodConfig(el.dataset.methodTime);
    el.textContent = meta.processing_time || '';
  });
}

function renderAssets() {
  const host = $('[data-crypto-assets]');
  if (!host) return;
  const assets = [...new Set(networks.map((n) => n.asset))];
  host.innerHTML = assets
    .map((asset) => {
      const meta = ASSET_META[asset] || { name: asset, symbol: asset.slice(0, 1), color: '#c6a25b' };
      return `<button class="asset" type="button" role="radio" aria-checked="false" data-asset="${escapeHTML(asset)}" style="--asset-color:${meta.color}">
        <span class="asset__mark">${escapeHTML(meta.symbol)}</span>
        <span class="asset__text"><strong>${escapeHTML(asset)}</strong><small>${escapeHTML(meta.name)}</small></span>
      </button>`;
    })
    .join('');
  $$('[data-asset]', host).forEach((btn) => btn.addEventListener('click', () => selectAsset(btn.dataset.asset)));
  if (assets.length) selectAsset(assets[0]);
}

function selectAsset(asset) {
  selectedAsset = asset;
  $$('[data-asset]').forEach((btn) => {
    const active = btn.dataset.asset === asset;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-checked', active ? 'true' : 'false');
  });
  const input = $('input[name="cryptoAsset"]');
  if (input) input.value = asset;
  renderNetworks();
}

function renderNetworks() {
  const select = $('#crypto-network');
  if (!select) return;
  const options = networks.filter((n) => n.asset === selectedAsset);
  select.innerHTML = options
    .map((n) => `<option value="${escapeHTML(n.network)}">${escapeHTML(n.label)}</option>`)
    .join('');
  updateNetworkDetail();
}

function updateNetworkDetail() {
  const network = networkFor();
  const hint = $('[data-network-hint]');
  if (hint) hint.textContent = network?.description || 'Select an asset to see supported networks.';
  const fee = $('[data-network-fee]');
  if (fee) fee.value = network ? `${formatCurrency(network.fee_estimate_usd, { cents: true })} (estimate)` : '—';
  const walletHint = $('[data-wallet-hint]');
  if (walletHint) walletHint.textContent = WALLET_HINTS[$('#crypto-network')?.value] || 'Enter the destination wallet address.';
}

function activeCardAccounts() {
  return paymentAccounts.filter((p) => p.type === 'card' && p.status === 'active');
}

function renderCardAccounts() {
  const host = $('[data-card-accounts]');
  if (!host) return;
  const accounts = activeCardAccounts();
  if (!accounts.length) {
    host.innerHTML = `<div class="empty empty--compact"><div class="empty__title">No card connected</div><p class="empty__text">Connect a payout card to receive a card credit. Card details are encrypted and visible only to authorised payout administrators.</p></div>`;
    const input = $('input[name="cardPaymentAccountId"]');
    if (input) input.value = '';
    return;
  }
  host.innerHTML = accounts
    .map(
      (p) => `<label class="card-account">
        <input type="radio" name="cardAccount" value="${escapeHTML(p.id)}">
        <span class="card-account__body">
          <span class="card-account__brand">${escapeHTML(p.card_brand || 'Card')}</span>
          <span class="card-account__number">•••• ${escapeHTML(p.card_last4 || '••••')}</span>
          <span class="card-account__meta">${escapeHTML(p.account_holder || session?.profile?.full_name || '')}${p.card_exp_month ? ` · Expires ${String(p.card_exp_month).padStart(2, '0')}/${String(p.card_exp_year || '').slice(-2)}` : ''}</span>
          <span class="card-account__status">${escapeHTML(p.provider === 'fixture' ? 'Tokenised (development fixture)' : 'Encrypted card on file')}</span>
        </span>
      </label>`
    )
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
    <thead><tr><th>Reference</th><th>Destination</th><th>Method</th><th>Amount</th><th>Submitted</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>${withdrawals
      .map(
        (w) => `<tr>
          <td class="cell-mono">${escapeHTML(w.reference)}</td>
          <td><span class="cell-strong">${escapeHTML(w.destination_label || '—')}</span><span class="cell-sub">${escapeHTML(w.account_name || '')}</span></td>
          <td>${escapeHTML(methodConfig(w.method).label)}</td>
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
              <div><div class="timeline__title">${escapeHTML(h.to_status === h.from_status ? 'Administrative note' : methodStatusLabel(h.to_status))}</div>
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
    host.innerHTML = `<div class="alert alert--error" role="alert">${icon('alert-triangle')}<div>${escapeHTML(error.message)}</div></div>`;
  }
}

function methodStatusLabel(status = '') {
  const labels = {
    pending: 'Pending review',
    reviewing: 'Under review',
    approved: 'Approved',
    processing: 'Processing',
    completed: 'Completed',
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

function switchMethodPanel() {
  const method = selectedMethod();
  $$('[data-method-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.methodPanel !== method;
  });
  updateSummary();
}

function validateAndBuild() {
  const form = $('#withdraw-form');
  clearFormErrors(form);
  showAlert('');
  const method = selectedMethod();
  const meta = methodConfig(method);
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

  let payload = {
    amount,
    method,
    idempotencyKey: crypto.randomUUID ? crypto.randomUUID() : `wd-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    currency: 'USD',
  };

  if (method === 'bank_transfer') {
    const accountName = $('#bank-account-name')?.value.trim();
    const bankName = bankNameValue();
    const accountNumber = compact($('#bank-account-number')?.value);
    if (!accountName || accountName.length < 2) {
      fieldError($('#bank-account-name'), 'Enter the account holder name.');
      valid = false;
    }
    if (!bankName || bankName.length < 2) {
      fieldError($('#bank-name'), 'Select or enter your bank.');
      valid = false;
    }
    if (accountNumber.length < 6) {
      fieldError($('#bank-account-number'), 'Enter a valid account number or IBAN.');
      valid = false;
    } else if (/^[A-Za-z]{2}[0-9]{2}/.test(accountNumber)) {
      if (!validIban(accountNumber)) {
        fieldError($('#bank-account-number'), 'That IBAN is not valid. Check the country code and digits.');
        valid = false;
      }
    } else if (!/^[0-9]{6,34}$/.test(accountNumber)) {
      fieldError($('#bank-account-number'), 'Account numbers must contain between 6 and 34 digits.');
      valid = false;
    }
    payload = {
      ...payload,
      currency: $('#bank-currency')?.value || 'USD',
      accountName,
      bankName,
      accountNumber,
      bankCode: '',
      accountReference: $('#bank-reference')?.value.trim() || '',
    };
  } else if (method === 'crypto') {
    const network = $('#crypto-network')?.value || '';
    const walletAddress = $('#crypto-wallet')?.value.trim() || '';
    if (!selectedAsset || !network) {
      fieldError($('#crypto-network'), 'Select a cryptocurrency and network.');
      valid = false;
    } else if (!validWallet(network, walletAddress)) {
      fieldError($('#crypto-wallet'), `Enter a valid ${selectedAsset} address for the ${network} network.`);
      valid = false;
    }
    payload = {
      ...payload,
      accountName: session.profile.full_name || '',
      cryptoAsset: selectedAsset,
      cryptoNetwork: network,
      walletAddress,
    };
  } else if (method === 'card') {
    const card = selectedCardAccount();
    if (!card) {
      showAlert('Connect an eligible card before requesting a card withdrawal.');
      valid = false;
    }
    payload = {
      ...payload,
      accountName: card?.account_holder || session.profile.full_name || '',
      cardPaymentAccountId: card?.id || null,
    };
  }

  if (!form.elements.confirm.checked) {
    fieldError(form.elements.confirm, 'Please confirm your withdrawal authorisation.');
    valid = false;
  }

  if (!valid) {
    focusFirstError(form);
    return null;
  }
  return payload;
}

function reviewRows(payload) {
  const meta = methodConfig(payload.method);
  const amount = Number(payload.amount);
  const fee = methodFee(meta, amount);
  const rows = [
    ['Amount', formatCurrency(amount, { cents: amount % 1 !== 0 })],
    ['Method', meta.label],
    ['Processing fee', fee > 0 ? formatCurrency(fee, { cents: true }) : 'None'],
    ['Net payout', formatCurrency(Math.max(0, amount - fee), { cents: amount % 1 !== 0 || fee > 0 })],
    ['Estimated arrival', meta.processing_time || '—'],
  ];
  if (payload.method === 'bank_transfer') {
    rows.push(
      ['Account holder', payload.accountName],
      ['Bank', payload.bankName],
      ['Account', `•••• ${compact(payload.accountNumber).slice(-4)}`],
      ['Account currency', payload.currency],
      ...(payload.accountReference ? [['Reference', payload.accountReference]] : [])
    );
  } else if (payload.method === 'crypto') {
    const network = networkFor(payload.cryptoAsset, payload.cryptoNetwork);
    rows.push(
      ['Asset', payload.cryptoAsset],
      ['Network', payload.cryptoNetwork],
      ['Wallet', `${payload.walletAddress.slice(0, 10)}…${payload.walletAddress.slice(-6)}`],
      ['Network fee (est.)', network ? formatCurrency(network.fee_estimate_usd, { cents: true }) : '—']
    );
  } else if (payload.method === 'card') {
    const card = selectedCardAccount();
    rows.push(
      ['Card', `${card?.card_brand || 'Card'} •••• ${card?.card_last4 || ''}`],
      ['Cardholder', payload.accountName],
      ['Connection', card?.provider === 'fixture' ? 'Development fixture' : 'Encrypted card on file']
    );
  }
  return rows;
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

async function submitPending() {
  if (!pendingPayload) return;
  const button = $('[data-confirm-withdrawal]');
  setLoading(button, true, 'Submitting…');
  try {
    const withdrawal = await api.createWithdrawal(pendingPayload);
    const meta = methodConfig(withdrawal.method);
    closeModal('withdraw-review-modal');
    $('[data-withdraw-ref]').textContent = withdrawal.reference;
    $('[data-withdraw-amount]').textContent = formatCurrency(withdrawal.amount, { cents: withdrawal.amount % 1 !== 0 });
    $('[data-withdraw-method]').textContent = meta.label;
    $('[data-withdraw-destination]').textContent = withdrawal.destination_label || '—';
    $('[data-withdraw-estimate]').textContent = meta.processing_time || '—';
    openModal('withdraw-modal');
    pendingPayload = null;
    resetForm();
    await refresh();
    toast('Withdrawal request submitted.', 'success');
  } catch (error) {
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
  const name = $('#bank-account-name');
  if (name) name.value = session?.profile?.full_name || '';
  const cardInput = $('input[name="cardPaymentAccountId"]');
  if (cardInput) cardInput.value = activeCardAccounts()[0]?.id || '';
  const cardRadio = form.querySelector('input[name="cardAccount"]');
  if (cardRadio) cardRadio.checked = true;
  if (activeCardAccounts().length) {
    $$('input[name="cardAccount"]').forEach((r) => (r.checked = r.value === activeCardAccounts()[0].id));
  }
  selectedAsset = '';
  renderAssets();
  switchMethodPanel();
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
  hint.textContent = digits.length >= 4
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
    });
    paymentAccounts = (await api.getPaymentAccounts()) || [];
    renderCardAccounts();
    const input = $('input[name="cardPaymentAccountId"]');
    if (input && created?.id) input.value = created.id;
    switchMethodPanel();
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
  const nameInput = $('#bank-account-name');
  if (nameInput) nameInput.value = session.profile.full_name || '';

  try {
    const configData = await api.getWithdrawalMethods();
    if (configData?.methods?.length) methods = configData.methods;
    if (configData?.networks?.length) networks = configData.networks;
  } catch (error) {
    console.warn('[Trump Offers] withdrawal configuration unavailable, using defaults:', error.message);
  }

  try {
    paymentAccounts = (await api.getPaymentAccounts()) || [];
  } catch (error) {
    console.warn('[Trump Offers] payment accounts unavailable:', error.message);
    paymentAccounts = [];
  }

  await importReturnedCard();
  renderAssets();
  renderCardAccounts();
  switchMethodPanel();
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
  $('#crypto-network')?.addEventListener('change', () => {
    updateNetworkDetail();
    updateSummary();
  });
  $('#crypto-wallet')?.addEventListener('input', updateSummary);
  $('#bank-account-number')?.addEventListener('input', updateSummary);
  $('#bank-name')?.addEventListener('change', () => {
    const other = $('[data-other-bank]');
    if (other) other.hidden = $('#bank-name').value !== 'Other';
    updateSummary();
  });
  $('#bank-name-other')?.addEventListener('input', updateSummary);
  $('#bank-currency')?.addEventListener('change', updateSummary);
  $$('input[name="method"]').forEach((radio) =>
    radio.addEventListener('change', () => {
      switchMethodPanel();
      showAlert('');
    })
  );
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
