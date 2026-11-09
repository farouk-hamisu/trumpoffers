/**
 * Trump Offers — reward claim experience.
 */

import { getApi } from '../lib/api.js';
import { initAppShell } from '../lib/shell.js';
import {
  $,
  $$,
  escapeHTML,
  formatCurrency,
  formatDateTime,
  futureLabel,
  badge,
  statusMeta,
  openModal,
  copyText,
  toast,
  setLoading,
  sleep,
} from '../lib/utils.js';
import { icon } from '../icons.js';

const ACTIVE = ['confirmed', 'verifying', 'processing'];
const STAGES = {
  1: 'Review',
  2: 'Confirm',
  3: 'Verify',
  4: 'Received',
};

let api;
let session;
let claims = [];
let claimInProgress = null;

function setStage(stage) {
  $$('.claim-stage').forEach((el) => el.classList.toggle('is-active', Number(el.dataset.stage) === stage));
  $$('#claim-steps .claim-step').forEach((el) => {
    const n = Number(el.dataset.step);
    el.classList.toggle('is-done', n < stage);
    el.classList.toggle('is-active', n === stage);
  });
}

function showAlert(message, type = 'error') {
  const host = $('[data-claim-alert]');
  if (!host) return;
  host.innerHTML = message
    ? `<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(
        type === 'error' ? 'alert-triangle' : 'check-circle'
      )}<div>${escapeHTML(message)}</div></div>`
    : '';
}

function renderHistory() {
  const host = $('[data-claim-history]');
  const count = $('[data-claim-count]');
  if (count) count.textContent = `${claims.length} claim${claims.length === 1 ? '' : 's'}`;
  if (!host) return;
  if (!claims.length) {
    host.innerHTML = `<div class="empty">
      <div class="empty__title">No claims yet</div>
      <p class="empty__text">When you submit a demonstration claim, the reference and status will appear here.</p>
    </div>`;
    return;
  }
  host.innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Reference</th><th>Amount</th><th>Submitted</th><th>Status</th><th>Progress</th></tr></thead>
    <tbody>${claims
      .map(
        (c) => `<tr>
          <td class="cell-mono">${escapeHTML(c.reference)}</td>
          <td class="cell-amount">${formatCurrency(c.amount)}</td>
          <td>${formatDateTime(c.created_at)}</td>
          <td>${badge('claim', c.status)}</td>
          <td>${Number(c.progress || 0)}%</td>
        </tr>`
      )
      .join('')}</tbody>
  </table></div>`;
}

function renderActive() {
  const host = $('[data-active-claim]');
  if (!host) return;
  if (!claimInProgress) {
    host.innerHTML = `<div class="empty" style="border:0;padding:12px 0">
      <div class="empty__title" style="font-size:1.2rem">Nothing in progress</div>
      <p class="empty__text">Your next claim will appear here with its reference and estimated completion.</p>
    </div>`;
    return;
  }
  host.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start">
      <div>
        <div class="claim-reference" style="margin-top:0">${escapeHTML(claimInProgress.reference)}</div>
        <p class="fine" style="margin-top:8px">${formatCurrency(claimInProgress.amount)} · ${statusMeta('claim', claimInProgress.status).label}</p>
      </div>
      ${badge('claim', claimInProgress.status)}
    </div>
    <div class="claim-progress" style="margin-top:18px">
      <div class="claim-progress__top"><span>Progress</span><span>${Number(claimInProgress.progress || 0)}%</span></div>
      <div class="claim-progress__bar"><span style="width:${Number(claimInProgress.progress || 0)}%"></span></div>
    </div>
    <p class="fine" style="margin-top:14px">Estimated completion ${futureLabel(claimInProgress.estimated_completion_at)}.</p>`;
}

async function refresh() {
  const [nextClaims, account] = await Promise.all([api.getClaims(), api.getRewardAccount()]);
  claims = nextClaims;
  claimInProgress = claims.find((c) => ACTIVE.includes(c.status)) || null;
  renderHistory();
  renderActive();

  const balanceHost = $('[data-reward-balance]');
  if (balanceHost) balanceHost.textContent = formatCurrency(account.balance);
  const openBtn = $('[data-claim-open]');
  const hint = $('[data-claim-hint]');
  if (openBtn && claimInProgress) {
    openBtn.disabled = true;
    openBtn.textContent = 'Claim in progress';
    if (hint) hint.textContent = 'You already have a demonstration claim in verification.';
  }
}

function resetModal() {
  setStage(1);
  showAlert('');
  $$('[data-claim-check]').forEach((c) => (c.checked = false));
  const next = $('[data-claim-next]');
  if (next) next.disabled = true;
  const name = $('[data-claim-name]');
  const email = $('[data-claim-email]');
  if (name) name.textContent = session.profile.full_name || 'Member';
  if (email) email.textContent = session.profile.email || '';
}

async function boot() {
  session = await initAppShell({ page: 'rewards', title: 'Rewards', crumb: 'Member' });
  if (!session) return;
  api = await getApi();
  await refresh();

  $('[data-claim-open]')?.addEventListener('click', () => {
    if (claimInProgress) {
      toast('You already have a claim in progress.', 'info');
      return;
    }
    resetModal();
    openModal('claim-modal');
  });

  $$('[data-claim-check]').forEach((box) => {
    box.addEventListener('change', () => {
      const all = $$('[data-claim-check]').every((c) => c.checked);
      const next = $('[data-claim-next]');
      if (next) next.disabled = !all;
    });
  });

  $('[data-claim-next]')?.addEventListener('click', () => setStage(2));
  $('[data-claim-back]')?.addEventListener('click', () => setStage(1));

  $('[data-claim-submit]')?.addEventListener('click', async (e) => {
    const button = e.currentTarget;
    setLoading(button, true);
    setStage(3);
    showAlert('');
    try {
      const claim = await api.createClaim();
      await sleep(900);
      const ref = $('[data-claim-ref]');
      if (ref) ref.textContent = claim.reference;
      const est = $('[data-claim-estimate]');
      if (est) {
        est.textContent = `Estimated completion ${futureLabel(claim.estimated_completion_at)} — ${formatDateTime(
          claim.estimated_completion_at
        )}. No real funds are involved.`;
      }
      await refresh();
      setStage(4);
      toast('Demonstration claim received.', 'success');
    } catch (error) {
      showAlert(error.message || 'We could not submit the claim.');
      setStage(2);
    } finally {
      setLoading(button, false);
    }
  });

  $('[data-claim-copy]')?.addEventListener('click', () => {
    copyText($('[data-claim-ref]')?.textContent?.trim() || '');
  });

  $('#claim-modal')?.addEventListener('click', (e) => {
    if (e.target.closest('[data-modal-close]') && claimInProgress === null) {
      // Closing before submission is safe; the flow resets on next open.
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
