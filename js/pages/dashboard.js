/**
 * Trump Offers — member overview.
 */

import { getApi } from '../lib/api.js';
import { initAppShell } from '../lib/shell.js';
import {
  $,
  $$,
  escapeHTML,
  formatCurrency,
  formatDate,
  formatDateTime,
  futureLabel,
  timeAgo,
  badge,
  statusMeta,
  initials,
  openModal,
  closeModal,
  toast,
  setLoading,
  clearFormErrors,
  fieldError,
  focusFirstError,
} from '../lib/utils.js';
import { icon } from '../icons.js';

const CLAIM_STEPS = [
  { key: 'confirmed', label: 'Confirmed', icon: 'check' },
  { key: 'verifying', label: 'Verifying', icon: 'shield' },
  { key: 'processing', label: 'Processing', icon: 'clock' },
  { key: 'completed', label: 'Completed', icon: 'seal' },
];

const ACTIVE_STATUSES = ['confirmed', 'verifying', 'processing'];

function activeClaim(claims) {
  return claims.find((c) => ACTIVE_STATUSES.includes(c.status)) || null;
}

function claimTrack(claim) {
  const order = CLAIM_STEPS.map((s) => s.key);
  const current = order.indexOf(claim.status);
  return `<div class="status-track">
    ${CLAIM_STEPS.map((step, i) => {
      const done = i < current || claim.status === 'completed';
      const active = i === current && claim.status !== 'completed';
      return `<div class="status-track__step${done ? ' is-done' : ''}${active ? ' is-active' : ''}">
        <span class="status-track__dot">${done ? icon('check') : ''}</span>
        <span class="status-track__label">${step.label}</span>
      </div>`;
    }).join('')}
  </div>`;
}

function renderClaim(claims) {
  const host = $('[data-claim-panel]');
  if (!host) return;
  const claim = activeClaim(claims);
  if (!claim) {
    const latest = claims[0];
    host.innerHTML = `<div class="empty">
      <div class="empty__title">${latest ? 'No claim in progress' : 'Your reward is waiting'}</div>
      <p class="empty__text">${latest ? `Your last claim ${escapeHTML(latest.reference)} is ${escapeHTML(statusMeta('claim', latest.status).label.toLowerCase())}. You can begin a new claim at any time.` : 'Begin the multi-step reward claim to process your $30,000 reward balance through verification.'}</p>
      <a class="btn btn--gold btn--sm" href="rewards.html" style="margin-top:18px">${latest ? 'Begin a new claim' : 'Review your reward'}</a>
    </div>`;
    return;
  }
  host.innerHTML = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap">
      <div>
        <div class="claim-reference" style="margin-top:0">${escapeHTML(claim.reference)} ${icon('receipt')}</div>
        <p class="fine" style="margin-top:8px">${escapeHTML(claim.note || 'Reward claim in progress.')}</p>
      </div>
      <div style="text-align:right">
        ${badge('claim', claim.status)}
        <div style="margin-top:8px;font-family:var(--serif);font-size:1.6rem">${formatCurrency(claim.amount)}</div>
      </div>
    </div>
    ${claimTrack(claim)}
    <div class="claim-progress" style="max-width:none">
      <div class="claim-progress__top"><span>Processing progress</span><span>${Number(claim.progress || 0)}%</span></div>
      <div class="claim-progress__bar"><span style="width:${Number(claim.progress || 0)}%"></span></div>
    </div>
    <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:16px" class="fine">
      <span>Estimated completion ${futureLabel(claim.estimated_completion_at)}</span>
      <span>${formatDateTime(claim.estimated_completion_at)}</span>
    </div>`;
}

function renderApplications(applications) {
  const host = $('[data-applications-panel]');
  if (!host) return;
  if (!applications.length) {
    host.innerHTML = `<div class="empty">
      <div class="empty__title">No applications yet</div>
      <p class="empty__text">Explore open opportunities and submit an application with a unique tracking reference.</p>
      <a class="btn btn--ghost btn--sm" href="careers.html" style="margin-top:18px">View open roles</a>
    </div>`;
    return;
  }
  host.innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Role</th><th>Reference</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
    <tbody>${applications
      .map(
        (a) => `<tr>
          <td><span class="cell-strong">${escapeHTML(a.job_title || 'Role')}</span><span class="cell-sub">${escapeHTML(a.location || 'Trump Offers')}</span></td>
          <td class="cell-mono">${escapeHTML(a.reference)}</td>
          <td>${formatDate(a.created_at, { short: true })}</td>
          <td>${badge('application', a.status)}</td>
          <td><a class="icon-btn" href="${a.job_slug ? `job-details.html?slug=${encodeURIComponent(a.job_slug)}` : 'careers.html'}" aria-label="View role">${icon('arrow-up-right')}</a></td>
        </tr>`
      )
      .join('')}</tbody>
  </table></div>`;
}

function renderWithdrawals(withdrawals) {
  const host = $('[data-withdrawals-panel]');
  if (!host) return;
  if (!withdrawals.length) {
    host.innerHTML = `<div class="empty">
      <div class="empty__title">No withdrawals yet</div>
      <p class="empty__text">Connect a card and submit your first request to see it here.</p>
      <a class="btn btn--ghost btn--sm" href="withdraw.html" style="margin-top:18px">Open withdrawal desk</a>
    </div>`;
    return;
  }
  host.innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Reference</th><th>Destination</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead>
    <tbody>${withdrawals
      .slice(0, 6)
      .map(
        (w) => `<tr>
          <td class="cell-mono">${escapeHTML(w.reference)}</td>
          <td><span class="cell-strong">${escapeHTML(w.destination_label || '—')}</span><span class="cell-sub">${escapeHTML(
          w.bank_name || w.account_name || ''
        )}</span></td>
          <td class="cell-amount">${formatCurrency(w.amount)}</td>
          <td>${formatDateTime(w.created_at)}</td>
          <td>${badge('withdrawal', w.status)}</td>
        </tr>`
      )
      .join('')}</tbody>
  </table></div>`;
}

function renderActivity(activity) {
  const host = $('[data-activity-list]');
  if (!host) return;
  if (!activity.length) {
    host.innerHTML = '<div class="empty"><div class="empty__title">A quiet account</div><p class="empty__text">Activity will appear here as you use the platform.</p></div>';
    return;
  }
  const iconFor = (action = '') => {
    if (action.startsWith('claim')) return 'gift';
    if (action.startsWith('withdrawal')) return 'wallet';
    if (action.startsWith('application')) return 'briefcase';
    if (action.startsWith('card')) return 'card';
    if (action.startsWith('auth')) return 'lock';
    if (action.startsWith('profile')) return 'user';
    return 'sparkle';
  };
  host.innerHTML = activity
    .map(
      (a) => `<div class="activity-item">
        <span class="activity-item__icon">${icon(iconFor(a.action))}</span>
        <div class="activity-item__body">
          <div class="activity-item__title">${escapeHTML(a.description)}</div>
          <div class="activity-item__meta">${timeAgo(a.created_at)} · ${escapeHTML(a.entity_type || 'account')}</div>
        </div>
      </div>`
    )
    .join('');
}

function renderNotifications(notifications) {
  const host = $('[data-notif-list]');
  if (!host) return;
  if (!notifications.length) {
    host.innerHTML = '<div class="empty" style="margin-top:16px"><p class="empty__text">No notifications yet.</p></div>';
    return;
  }
  host.innerHTML = notifications
    .slice(0, 6)
    .map(
      (n) => `<div class="notif-item${n.read_at ? ' is-read' : ''}">
        <span class="notif-item__dot"></span>
        <div>
          <div class="notif-item__title">${escapeHTML(n.title)}</div>
          <div class="notif-item__text">${escapeHTML(n.body)}</div>
          <div class="notif-item__time">${timeAgo(n.created_at)}</div>
        </div>
      </div>`
    )
    .join('');
}

function renderAccount(profile) {
  const host = $('[data-account-details]');
  if (!host) return;
  host.innerHTML = `
    <div class="detail-row"><dt>Member</dt><dd>${escapeHTML(profile.full_name || '—')}</dd></div>
    <div class="detail-row"><dt>Email</dt><dd title="${escapeHTML(profile.email || '')}">${escapeHTML(profile.email || '—')}</dd></div>
    <div class="detail-row"><dt>Phone</dt><dd>${escapeHTML(profile.phone || 'Not provided')}</dd></div>
    <div class="detail-row"><dt>Location</dt><dd>${escapeHTML(profile.location || 'Not provided')}</dd></div>
    <div class="detail-row"><dt>Status</dt><dd>${badge('user', profile.status || 'active')}</dd></div>
    <div class="detail-row"><dt>Member since</dt><dd>${formatDate(profile.created_at)}</dd></div>`;
}

function updateSummary({ account, claims, withdrawals, applications, cards, notifications, profile }) {
  const active = activeClaim(claims);
  const first = (profile.full_name || 'Member').split(' ')[0];
  $$('[data-first-name]').forEach((el) => (el.textContent = `${first}.`));

  if (account) {
    const balance = Number(account.available_balance ?? account.balance ?? 30000);
    const host = $('[data-balance]');
    if (host) host.innerHTML = `${formatCurrency(balance)}<sup>USD</sup>`;
    if (account.balance !== account.available_balance) {
      $('[data-balance-note]').textContent = `${formatCurrency(account.balance)} total reward balance · ${formatCurrency(account.balance - balance)} reserved for pending withdrawals.`;
    }
  }

  const activeHost = $('[data-active-claim]');
  if (activeHost) activeHost.textContent = active ? statusMeta('claim', active.status).label : 'None';
  const activeFoot = $('[data-active-claim-foot]');
  if (activeFoot) activeFoot.textContent = active ? `${active.reference} · ${futureLabel(active.estimated_completion_at)}` : 'No request in progress';

  const pendingWithdrawals = withdrawals.filter((w) =>
    ['pending', 'reviewing', 'approved', 'processing'].includes(w.status)
  );
  const statW = $('[data-stat-withdrawals]');
  if (statW) statW.textContent = String(withdrawals.length).padStart(2, '0');
  const footW = $('[data-stat-withdrawals-foot]');
  if (footW) footW.textContent = pendingWithdrawals.length ? `${pendingWithdrawals.length} in progress` : withdrawals.length ? 'All requests settled' : 'No requests yet';

  const statA = $('[data-stat-applications]');
  if (statA) statA.textContent = String(applications.length).padStart(2, '0');
  const footA = $('[data-stat-applications-foot]');
  if (footA) footA.textContent = applications.length ? `${applications.filter((a) => ['submitted', 'under_review'].includes(a.status)).length} awaiting review` : 'No applications yet';

  const statC = $('[data-stat-cards]');
  if (statC) statC.textContent = String(cards.length).padStart(2, '0');
  const footC = $('[data-stat-cards-foot]');
  if (footC) footC.textContent = cards.length ? cards[0].status === 'approved' ? 'Card approved' : 'In review' : 'No card request yet';

  const since = $('[data-stat-since]');
  if (since) since.textContent = profile.created_at ? new Date(profile.created_at).getFullYear() : '—';

  const unread = notifications.filter((n) => !n.read_at);
  const title = $('[data-notif-title]');
  const text = $('[data-notif-text]');
  if (title) title.textContent = unread.length ? `${unread.length} unread update${unread.length === 1 ? '' : 's'}` : 'You are all caught up';
  if (text) text.textContent = notifications[0] ? notifications[0].title : 'No notifications yet.';
}

async function boot() {
  const session = await initAppShell({ page: 'dashboard', title: 'Overview', crumb: 'Member' });
  if (!session) return;
  renderAccount(session.profile);

  const api = await getApi();
  const results = await Promise.allSettled([
    api.getRewardAccount(),
    api.getClaims(),
    api.getWithdrawals(),
    api.getApplications(),
    api.getCardApplications(),
    api.getNotifications(),
    api.getActivity(),
  ]);
  const [account, claims, withdrawals, applications, cards, notifications, activity] = results.map((r) =>
    r.status === 'fulfilled' ? r.value : []
  );
  const accountValue = results[0].status === 'fulfilled' ? results[0].value : null;

  renderClaim(claims);
  renderApplications(applications);
  renderWithdrawals(withdrawals);
  renderActivity(activity);
  renderNotifications(notifications);
  updateSummary({
    account: accountValue,
    claims,
    withdrawals,
    applications,
    cards,
    notifications,
    profile: session.profile,
  });

  $('[data-mark-read]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    setLoading(btn, true);
    try {
      await api.markNotificationsRead();
      toast('Notifications marked as read.', 'success');
      const updated = await api.getNotifications();
      renderNotifications(updated);
      updateSummary({
        account: accountValue,
        claims,
        withdrawals,
        applications,
        cards,
        notifications: updated,
        profile: session.profile,
      });
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  const profileForm = $('#profile-form');
  const openProfile = () => {
    profileForm.elements.full_name.value = session.profile.full_name || '';
    profileForm.elements.phone.value = session.profile.phone || '';
    profileForm.elements.location.value = session.profile.location || '';
    clearFormErrors(profileForm);
    openModal('profile-modal');
  };
  $('[data-edit-profile]')?.addEventListener('click', openProfile);

  profileForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(profileForm);
    const name = profileForm.elements.full_name.value.trim();
    if (name.length < 2) {
      fieldError(profileForm.elements.full_name, 'Enter your full name.');
      focusFirstError(profileForm);
      return;
    }
    const button = profileForm.querySelector('button[type="submit"]');
    setLoading(button, true);
    try {
      const updated = await api.auth.updateProfile({
        full_name: name,
        phone: profileForm.elements.phone.value.trim(),
        location: profileForm.elements.location.value.trim(),
      });
      Object.assign(session.profile, updated);
      renderAccount(session.profile);
      updateSummary({
        account: accountValue,
        claims,
        withdrawals,
        applications,
        cards,
        notifications,
        profile: session.profile,
      });
      closeModal('profile-modal');
      toast('Your details have been updated.', 'success');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(button, false);
    }
  });

  // Deep links from the shell: #notifications and #account.
  if (location.hash === '#notifications' || location.hash === '#account') {
    const target = document.querySelector(location.hash);
    window.setTimeout(() => target?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
