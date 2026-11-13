/**
 * Trump Offers — member overview.
 */

import {getApi} from '../lib/api.js';
import {initAppShell} from '../lib/shell.js';
import {
  $,
  $$,
  escapeHTML,
  formatCurrency,
  formatDate,
  formatDateTime,
  timeAgo,
  badge,
  memberWithdrawalBadge,
  initials,
  openModal,
  closeModal,
  toast,
  setLoading,
  clearFormErrors,
  fieldError,
  focusFirstError,
} from '../lib/utils.js';
import {icon} from '../icons.js';

function renderRewards(entries) {
  const host = $('[data-reward-panel]');
  if (!host) return;
  if (!entries.length) {
    host.innerHTML = `<div class="empty">
      <div class="empty__title">No rewards yet</div>
      <p class="empty__text">Rewards added to your account will appear here.</p>
    </div>`;
    return;
  }
  host.innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Date</th><th>Description</th><th>Amount</th></tr></thead>
    <tbody>${entries
      .slice(0, 5)
      .map((entry) => {
        const amount = Number(entry.amount || 0);
        const signed = entry.entry_type === 'settlement' ? -Math.abs(amount) : amount;
        return `<tr>
          <td>${formatDateTime(entry.created_at)}</td>
          <td><span class="cell-strong">${entry.entry_type === 'reward' ? 'Reward added' : 'Withdrawal'}</span><span class="cell-sub">${escapeHTML(
          entry.note || ''
        )}</span></td>
          <td class="cell-amount">${signed < 0 ? '−' : '+'}${formatCurrency(Math.abs(signed), {
          cents: Math.abs(signed) % 1 !== 0,
        })}</td>
        </tr>`;
      })
      .join('')}</tbody>
  </table></div>`;
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
          <td>${formatDate(a.created_at, {short: true})}</td>
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
          <td>${memberWithdrawalBadge(w.status)}</td>
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
    if (action.startsWith('claim') || action.startsWith('reward')) return 'gift';
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

function updateSummary({account, rewards, withdrawals, applications, cards, notifications, profile}) {
  const first = (profile.full_name || 'Member').split(' ')[0];
  $$('[data-first-name]').forEach((el) => (el.textContent = `${first}.`));

  if (account) {
    const balance = Number(account.available_balance ?? account.balance ?? 0);
    const host = $('[data-balance]');
    if (host) host.innerHTML = `${formatCurrency(balance)}`;
    const note = $('[data-balance-note]');
    if (note) note.textContent = 'Available to withdraw.';
  }

  const latestReward = rewards.find((entry) => entry.entry_type === 'reward');
  const rewardHost = $('[data-latest-reward]');
  if (rewardHost) {
    rewardHost.textContent = latestReward
      ? `+${formatCurrency(latestReward.amount, {cents: Number(latestReward.amount) % 1 !== 0})}`
      : '—';
  }
  const rewardFoot = $('[data-latest-reward-foot]');
  if (rewardFoot) {
    rewardFoot.textContent = latestReward
      ? `${latestReward.note || 'Reward added'} · ${formatDate(latestReward.created_at, {short: true})}`
      : 'No rewards yet';
  }

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

function announceLatestReward(entries, userId) {
  const latest = entries.find((entry) => entry.entry_type === 'reward');
  if (!latest || !userId) return;
  const key = `to.reward-seen.${userId}`;
  if (localStorage.getItem(key) === latest.id) return;
  toast('Reward Added Successfully!', 'success');
  localStorage.setItem(key, latest.id);
}

async function boot() {
  const session = await initAppShell({page: 'dashboard', title: 'Overview', crumb: 'Member'});
  if (!session) return;
  renderAccount(session.profile);

  const api = await getApi();
  const results = await Promise.allSettled([
    api.getRewardAccount(),
    api.getRewardTransactions(),
    api.getWithdrawals(),
    api.getApplications(),
    api.getCardApplications(),
    api.getNotifications(),
    api.getActivity(),
  ]);
  const [account, rewards, withdrawals, applications, cards, notifications, activity] = results.map((r) =>
    r.status === 'fulfilled' ? r.value : []
  );
  const accountValue = results[0].status === 'fulfilled' ? results[0].value : null;

  renderRewards(rewards);
  announceLatestReward(rewards, session.profile.id);
  renderApplications(applications);
  renderWithdrawals(withdrawals);
  renderActivity(activity);
  renderNotifications(notifications);
  updateSummary({
    account: accountValue,
    rewards,
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
        rewards,
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
        rewards,
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
    window.setTimeout(() => target?.scrollIntoView({behavior: 'smooth', block: 'start'}), 350);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
