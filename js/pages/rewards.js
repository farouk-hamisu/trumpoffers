/**
 * Trump Offers — rewards and transaction history.
 * Rewards are credited by the platform automatically; this page only reads
 * the member balance and their recorded transactions.
 */

import { getApi } from '../lib/api.js';
import { initAppShell } from '../lib/shell.js';
import { $, escapeHTML, formatCurrency, formatDateTime, toast } from '../lib/utils.js';

let api;
let session;

function entryLabel(entry) {
  if (entry.entry_type === 'reward') return 'Reward added';
  if (entry.entry_type === 'settlement') return 'Withdrawal';
  return 'Adjustment';
}

function renderHistory(entries) {
  const host = $('[data-reward-history]');
  const count = $('[data-reward-count]');
  if (count) count.textContent = `${entries.length} transaction${entries.length === 1 ? '' : 's'}`;
  if (!host) return;

  if (!entries.length) {
    host.innerHTML = `<div class="empty">
      <div class="empty__title">No transactions yet</div>
      <p class="empty__text">Rewards added to your account will appear here.</p>
    </div>`;
    return;
  }

  host.innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Date</th><th>Description</th><th>Amount</th><th>Balance</th></tr></thead>
    <tbody>${entries
      .map((entry) => {
        const amount = Number(entry.amount || 0);
        const signed = entry.entry_type === 'settlement' ? -Math.abs(amount) : amount;
        return `<tr>
          <td>${formatDateTime(entry.created_at)}</td>
          <td><span class="cell-strong">${escapeHTML(entryLabel(entry))}</span><span class="cell-sub">${escapeHTML(
          entry.note || ''
        )}</span></td>
          <td class="cell-amount">${signed < 0 ? '−' : '+'}${formatCurrency(Math.abs(signed), {
          cents: Math.abs(signed) % 1 !== 0,
        })}</td>
          <td>${entry.balance_after == null ? '—' : formatCurrency(entry.balance_after, { cents: true })}</td>
        </tr>`;
      })
      .join('')}</tbody>
  </table></div>`;
}

function announceLatestReward(entries) {
  const latest = entries.find((entry) => entry.entry_type === 'reward');
  if (!latest || !session?.profile?.id) return;
  const key = `to.reward-seen.${session.profile.id}`;
  if (localStorage.getItem(key) === latest.id) return;
  toast('Reward Added Successfully!', 'success');
  localStorage.setItem(key, latest.id);
}

async function refresh() {
  const [account, entries] = await Promise.all([api.getRewardAccount(), api.getRewardTransactions()]);
  const balanceHost = $('[data-reward-balance]');
  if (balanceHost) balanceHost.textContent = formatCurrency(account.balance, { cents: true });
  renderHistory(entries);
  announceLatestReward(entries);
}

async function boot() {
  session = await initAppShell({ page: 'rewards', title: 'Rewards', crumb: 'Member' });
  if (!session) return;
  api = await getApi();
  try {
    await refresh();
  } catch (error) {
    toast(error.message || 'Rewards could not be loaded.', 'error');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
