/**
 * Trump Offers — administrator console.
 * Role-guarded views over the same facade used by member pages.
 */

import { requireAdmin, getApi, isDemo, config } from '../lib/api.js';
import {
  $,
  $$,
  escapeHTML,
  formatCurrency,
  formatDate,
  formatDateTime,
  timeAgo,
  initials,
  badge,
  humanize,
  validateEmail,
  fieldError,
  clearFormErrors,
  bindFieldClearing,
  focusFirstError,
  setLoading,
  toast,
  openModal,
  closeModal,
  initModals,
} from '../lib/utils.js';
import { icon } from '../icons.js';

const VIEWS = {
  overview: { title: 'Overview' },
  users: { title: 'Members' },
  rewards: { title: 'Rewards & withdrawals' },
  recruitment: { title: 'Vacancies' },
  applications: { title: 'Applications' },
  cards: { title: 'Card requests' },
  messages: { title: 'Messages' },
  settings: { title: 'Website & video' },
};

const DESIGNS = {
  noir: 'Trump Noir',
  champagne: 'Champagne',
  obsidian: 'Obsidian',
  heritage: 'Heritage',
};

const state = {
  view: 'overview',
  overview: null,
  users: [],
  claims: [],
  withdrawals: [],
  jobs: [],
  applications: [],
  cards: [],
  messages: [],
  settings: {},
};

let api = null;
let session = null;

/* ------------------------------------------------------------------ helpers */

function hydrateIcons(root = document) {
  $$('[data-icon-btn]', root).forEach((el) => {
    if (el.dataset.iconReady === '1') return;
    el.innerHTML = icon(el.dataset.iconBtn);
    el.dataset.iconReady = '1';
  });
  $$('[data-icon]', root).forEach((el) => {
    if (el.dataset.navIconReady === '1') return;
    el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon));
    el.dataset.navIconReady = '1';
  });
}

function emptyRow(cols, message = 'Nothing to show yet.') {
  return `<tr><td colspan="${cols}" class="admin-table__empty">${escapeHTML(message)}</td></tr>`;
}

function nameCell(name, email) {
  return `<span class="cell-strong">${escapeHTML(name || 'Member')}</span><span class="cell-sub">${escapeHTML(email || '')}</span>`;
}

function statusOptions(type, current) {
  const map = {
    claim: ['confirmed', 'verifying', 'processing', 'completed', 'cancelled'],
    withdrawal: ['pending', 'reviewing', 'approved', 'processing', 'completed', 'rejected', 'cancelled'],
    application: ['submitted', 'under_review', 'shortlisted', 'interview', 'accepted', 'rejected'],
    card: ['submitted', 'under_review', 'approved', 'rejected'],
    message: ['new', 'read', 'archived'],
  };
  return (map[type] || [])
    .map((value) => {
      const meta = statusLabel(type, value);
      return `<option value="${value}"${value === current ? ' selected' : ''}>${escapeHTML(meta)}</option>`;
    })
    .join('');
}

function statusLabel(type, value) {
  const labels = {
    claim: {
      confirmed: 'Confirmed',
      verifying: 'Verifying',
      processing: 'Processing',
      completed: 'Completed',
      cancelled: 'Cancelled',
    },
    withdrawal: {
      pending: 'Pending',
      reviewing: 'Under review',
      approved: 'Approved',
      processing: 'Processing',
      completed: 'Completed',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
    },
    application: {
      submitted: 'Submitted',
      under_review: 'Under review',
      shortlisted: 'Shortlisted',
      interview: 'Interview',
      accepted: 'Accepted',
      rejected: 'Not selected',
    },
    card: {
      submitted: 'Submitted',
      under_review: 'Under review',
      approved: 'Approved',
      rejected: 'Declined',
    },
    message: { new: 'New', read: 'Read', archived: 'Archived' },
  };
  return (labels[type] && labels[type][value]) || humanize(value || '—');
}

function methodLabel(method = '') {
  return (
    {
      bank_transfer: 'Bank transfer',
      crypto: 'Cryptocurrency',
      card: 'Card credit',
      wire: 'Wire transfer',
      paypal: 'PayPal',
      wise: 'Wise',
    }[method] || humanize(method)
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function activityIcon(action = '') {
  if (/card/.test(action)) return 'card';
  if (/withdraw/.test(action)) return 'wallet';
  if (/application|job/.test(action)) return 'briefcase';
  if (/claim|reward/.test(action)) return 'gift';
  if (/settings|video/.test(action)) return 'settings';
  if (/auth|session/.test(action)) return 'key';
  if (/user|account|profile/.test(action)) return 'user';
  return 'info';
}

function showDetail({ title, sub = '', body, actions = [] }) {
  const modal = $('#detail-modal');
  if (!modal) return;
  $('#detail-modal-title').textContent = title;
  const subHost = $('[data-detail-sub]', modal);
  if (subHost) subHost.innerHTML = sub;
  $('[data-detail-body]', modal).innerHTML = body;
  const actionHost = $('[data-detail-actions]', modal);
  actionHost.innerHTML = actions
    .map(
      (a, i) =>
        `<button class="btn ${a.className || 'btn--ghost'} btn--sm" type="button" data-detail-action="${i}">${escapeHTML(
          a.label
        )}</button>`
    )
    .join('');
  actions.forEach((a, i) => {
    actionHost.querySelector(`[data-detail-action="${i}"]`)?.addEventListener('click', () => a.onClick?.(modal));
  });
  openModal(modal);
  hydrateIcons(modal);
}

function detailRows(rows) {
  return `<div class="admin-detail">${rows
    .filter(Boolean)
    .map(
      ([label, value]) =>
        `<div class="admin-detail__row"><span>${escapeHTML(label)}</span><strong>${value ?? '—'}</strong></div>`
    )
    .join('')}</div>`;
}

function resolvePublic(path) {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) return path;
  if (path.startsWith('/')) return `..${path}`;
  if (path.startsWith('../') || path.startsWith('./')) return path;
  return `../${path.replace(/^\/+/, '')}`;
}

/* --------------------------------------------------------------- navigation */

function setActiveView(view) {
  $$('[data-view-link]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.viewLink === view);
    if (link.dataset.viewLink === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $$('[data-view]').forEach((section) => {
    section.classList.toggle('is-active', section.dataset.view === view);
  });
  const title = $('[data-topbar-title]');
  if (title) title.textContent = VIEWS[view]?.title || 'Console';
  document.title = `${VIEWS[view]?.title || 'Console'} — Trump Offers Admin`;
}

async function openView(view, { force = false } = {}) {
  if (!VIEWS[view]) view = 'overview';
  state.view = view;
  setActiveView(view);
  closeDrawer();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  try {
    await loadView(view);
  } catch (error) {
    console.error(error);
    toast(error.message || 'This view could not be loaded.', 'error');
  }
}

async function loadView(view) {
  switch (view) {
    case 'overview':
      return loadOverview();
    case 'users':
      return loadUsers();
    case 'rewards':
      return loadRewards();
    case 'recruitment':
      return loadRecruitment();
    case 'applications':
      return loadApplications();
    case 'cards':
      return loadCards();
    case 'messages':
      return loadMessages();
    case 'settings':
      return loadSettings();
    default:
      return loadOverview();
  }
}

/* ---------------------------------------------------------------- overview */

async function loadOverview() {
  const [overview, cards, applications, messages] = await Promise.all([
    api.getAdminOverview(),
    api.getAllCardsAdmin(),
    api.getAllApplicationsAdmin(),
    api.getMessagesAdmin(),
  ]);
  state.overview = overview;
  state.cards = cards;
  state.applications = applications;
  state.messages = messages;
  renderOverview();
  updateCounts();
}

function renderOverview() {
  const o = state.overview;
  if (!o) return;
  const first = (session?.profile?.full_name || 'Administrator').split(' ')[0];
  const title = $('#overview-title');
  if (title) title.innerHTML = `Good ${greeting()}, <em>${escapeHTML(first)}</em>.`;

  const values = {
    users: o.users,
    claims: o.claims,
    activeClaims: o.activeClaims,
    applications: o.applications,
    pendingApplications: o.pendingApplications,
    cards: o.cards,
    pendingCards: o.pendingCards,
  };
  Object.entries(values).forEach(([key, value]) => {
    $$(`[data-stat="${key}"]`).forEach((el) => {
      const count = Number(value || 0);
      el.textContent = count < 10
        ? String(count).padStart(2, '0')
        : new Intl.NumberFormat('en-US').format(count);
    });
  });

  renderChart(o.chart);

  const activity = $('[data-activity]');
  if (activity) {
    const rows = (o.recentActivity || []).slice(0, 8);
    activity.innerHTML = rows.length
      ? rows
          .map(
            (a) => `<div class="admin-activity__item">
              <span class="admin-activity__icon">${icon(activityIcon(a.action))}</span>
              <div class="admin-activity__body">
                <div class="admin-activity__title">${escapeHTML(a.description || humanize(a.action || 'Activity'))}</div>
                <div class="admin-activity__meta">${escapeHTML(a.member_name || 'System')} · ${escapeHTML(humanize(a.action || ''))}</div>
              </div>
              <span class="admin-activity__time">${escapeHTML(timeAgo(a.created_at))}</span>
            </div>`
          )
          .join('')
      : '<div class="admin-table__empty">No activity recorded yet.</div>';
  }

  const queue = [
    ...state.cards
      .filter((c) => ['submitted', 'under_review'].includes(c.status))
      .map((c) => ({
        kind: 'card',
        id: c.id,
        icon: 'card',
        title: `Card request · ${DESIGNS[c.design] || humanize(c.design)}`,
        meta: `${c.member_name || 'Member'} · ${c.reference}`,
        time: c.created_at,
      })),
    ...state.applications
      .filter((a) => ['submitted', 'under_review', 'shortlisted', 'interview'].includes(a.status))
      .map((a) => ({
        kind: 'application',
        id: a.id,
        icon: 'briefcase',
        title: `${a.full_name || 'Candidate'} · ${a.job_title || 'Role'}`,
        meta: `${a.reference} · ${statusLabel('application', a.status)}`,
        time: a.created_at,
      })),
  ]
    .sort((a, b) => new Date(b.time) - new Date(a.time))
    .slice(0, 6);

  const queueHost = $('[data-overview-queue]');
  if (queueHost) {
    queueHost.innerHTML = queue.length
      ? `<div class="admin-activity admin-activity--padded">${queue
          .map(
            (q) => `<button class="admin-activity__item admin-activity__item--button" type="button" data-${
              q.kind === 'card' ? 'card' : 'app'
            }-open="${escapeHTML(q.id)}">
              <span class="admin-activity__icon">${icon(q.icon)}</span>
              <span class="admin-activity__body">
                <span class="admin-activity__title">${escapeHTML(q.title)}</span>
                <span class="admin-activity__meta">${escapeHTML(q.meta)}</span>
              </span>
              <span class="admin-activity__time">${escapeHTML(timeAgo(q.time))}</span>
            </button>`
          )
          .join('')}</div>`
      : '<div class="admin-table__empty">Nothing awaiting a decision.</div>';
  }

  const inbox = $('[data-overview-messages]');
  if (inbox) {
    const rows = state.messages.filter((m) => m.status === 'new').slice(0, 4);
    inbox.innerHTML = rows.length
      ? rows
          .map(
            (m) => `<button class="admin-activity__item admin-activity__item--button" type="button" data-message-open="${escapeHTML(
              m.id
            )}">
              <span class="admin-activity__icon">${icon('mail')}</span>
              <span class="admin-activity__body">
                <span class="admin-activity__title">${escapeHTML(m.subject)}</span>
                <span class="admin-activity__meta">${escapeHTML(m.name)} · ${escapeHTML(m.email)}</span>
              </span>
              <span class="admin-activity__time">${escapeHTML(timeAgo(m.created_at))}</span>
            </button>`
          )
          .join('')
      : '<div class="admin-table__empty">The inbox is clear.</div>';
  }
  hydrateIcons();
}

function renderChart(chart) {
  const host = $('[data-chart]');
  const labelsHost = $('[data-chart-labels]');
  if (!host) return;
  const labels = chart?.labels || [];
  const claims = chart?.claims || [];
  const users = chart?.users || [];
  if (!labels.length) {
    host.innerHTML = '<div class="admin-table__empty">No chart data yet.</div>';
    return;
  }
  const w = 720;
  const h = 220;
  const padX = 18;
  const padY = 20;
  const max = Math.max(1, ...claims, ...users);
  const x = (i) => padX + (i * (w - padX * 2)) / Math.max(1, labels.length - 1);
  const y = (v) => h - padY - (v / max) * (h - padY * 2);
  const line = (series) =>
    series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const area = (series) =>
    `${line(series)} L${x(series.length - 1).toFixed(1)} ${h - padY} L${x(0).toFixed(1)} ${h - padY} Z`;
  const grid = [0, 1, 2, 3]
    .map((i) => {
      const gy = padY + (i * (h - padY * 2)) / 3;
      return `<line x1="${padX}" y1="${gy}" x2="${w - padX}" y2="${gy}" stroke="rgba(24,23,26,0.09)" stroke-width="1"/>`;
    })
    .join('');
  const dots = claims
    .map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="#96743a"/>`)
    .join('');
  host.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="presentation" preserveAspectRatio="none">
    <defs>
      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(198,162,91,0.22)"/>
        <stop offset="100%" stop-color="rgba(198,162,91,0)"/>
      </linearGradient>
    </defs>
    ${grid}
    <path d="${area(claims)}" fill="url(#chartFill)"/>
    <path d="${line(users)}" fill="none" stroke="rgba(24,23,26,0.45)" stroke-width="1.6" stroke-dasharray="4 4"/>
    <path d="${line(claims)}" fill="none" stroke="#96743a" stroke-width="2"/>
    ${dots}
  </svg>
  <div class="admin-chart__legend"><span><i class="dot dot--gold"></i>Claims</span><span><i class="dot dot--ink"></i>Registrations</span></div>`;
  if (labelsHost) labelsHost.innerHTML = labels.map((l) => `<span>${escapeHTML(l)}</span>`).join('');
}

function updateCounts() {
  const o = state.overview;
  if (!o) return;
  const counts = {
    activeClaims: o.activeClaims,
    pendingApplications: o.pendingApplications,
    pendingCards: o.pendingCards,
    newMessages: o.newMessages,
  };
  Object.entries(counts).forEach(([key, value]) => {
    $$(`[data-count="${key}"]`).forEach((el) => {
      el.textContent = value > 99 ? '99+' : String(value || 0);
      el.hidden = !value;
    });
  });
}

/* ------------------------------------------------------------------- users */

async function loadUsers() {
  state.users = await api.auth.listUsers('');
  renderUsers();
}

function renderUsers() {
  const body = $('[data-users-body]');
  if (!body) return;
  const q = ($('[data-users-search]')?.value || '').trim().toLowerCase();
  const role = $('[data-users-role]')?.value || '';
  const status = $('[data-users-status]')?.value || '';
  const rows = state.users.filter((u) => {
    if (role && u.role !== role) return false;
    if (status && u.status !== status) return false;
    if (q && !`${u.full_name} ${u.email}`.toLowerCase().includes(q)) return false;
    return true;
  });
  body.innerHTML = rows.length
    ? rows
        .map((u) => {
          const isSelf = u.id === session?.profile?.id;
          const suspended = u.status === 'suspended';
          return `<tr>
            <td><span class="cell-strong">${escapeHTML(u.full_name || 'Member')}</span><span class="cell-sub">${escapeHTML(
              u.location || 'Location not set'
            )}</span></td>
            <td>${escapeHTML(u.email || '')}<span class="cell-sub">${escapeHTML(u.phone || 'No phone')}</span></td>
            <td>${escapeHTML(u.location || '—')}</td>
            <td>${u.role === 'admin' ? '<span class="badge">Administrator</span>' : '<span class="badge badge--info">Member</span>'}</td>
            <td>${badge('user', u.status || 'active')}</td>
            <td class="cell-mono">${escapeHTML(formatDate(u.created_at, { short: true }))}</td>
            <td>${
              isSelf
                ? '<span class="admin-table__self">Current account</span>'
                : `<button class="btn btn--ghost btn--sm" type="button" data-user-toggle="${
                    u.id
                  }" data-target="${suspended ? 'active' : 'suspended'}">${suspended ? 'Reinstate' : 'Suspend'}</button>`
            }</td>
          </tr>`;
        })
        .join('')
    : emptyRow(7, 'No members match those filters.');
}

/* ----------------------------------------------------------------- rewards */

async function loadRewards() {
  const [claims, withdrawals] = await Promise.all([api.getAllClaimsAdmin(), api.getAllWithdrawalsAdmin()]);
  state.claims = claims;
  state.withdrawals = withdrawals;
  renderClaims();
  renderWithdrawals();
}

function renderClaims() {
  const body = $('[data-claims-body]');
  if (!body) return;
  const q = ($('[data-claims-search]')?.value || '').trim().toLowerCase();
  const status = $('[data-claims-status]')?.value || '';
  const rows = state.claims.filter((c) => {
    if (status && c.status !== status) return false;
    if (q && !`${c.reference} ${c.member_name} ${c.member_email} ${c.reward || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
  body.innerHTML = rows.length
    ? rows
        .map(
          (c) => `<tr>
            <td class="cell-mono">${escapeHTML(c.reference)}</td>
            <td>${nameCell(c.member_name, c.member_email)}</td>
            <td>${escapeHTML(c.reward || 'Executive reward')}</td>
            <td class="cell-amount">${escapeHTML(formatCurrency(c.amount))}</td>
            <td>${badge('claim', c.status)}</td>
            <td class="cell-mono">${escapeHTML(formatDate(c.created_at, { short: true }))}</td>
            <td><div class="admin-table__actions">
              <button class="admin-icon-btn" type="button" data-claim-open="${escapeHTML(c.id)}" aria-label="View claim" title="View claim">${icon(
            'eye'
          )}</button>
              <select class="status-select" data-claim-status="${escapeHTML(c.id)}" aria-label="Claim status">${statusOptions(
            'claim',
            c.status
          )}</select>
            </div></td>
          </tr>`
        )
        .join('')
    : emptyRow(7, 'No claims match those filters.');
}

function renderWithdrawals() {
  const body = $('[data-withdrawals-body]');
  if (!body) return;
  const q = ($('[data-withdrawals-search]')?.value || '').trim().toLowerCase();
  const status = $('[data-withdrawals-status]')?.value || '';
  const rows = state.withdrawals.filter((w) => {
    if (status && w.status !== status) return false;
    if (
      q &&
      !`${w.reference} ${w.member_name} ${w.member_email} ${w.method} ${w.destination_label || ''} ${w.bank_name || ''} ${w.crypto_asset || ''} ${w.wallet_address || ''}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    return true;
  });
  body.innerHTML = rows.length
    ? rows
        .map(
          (w) => `<tr>
            <td class="cell-mono">${escapeHTML(w.reference)}</td>
            <td>${nameCell(w.member_name, w.member_email)}</td>
            <td>${escapeHTML(methodLabel(w.method))}</td>
            <td>${escapeHTML(w.destination_label || '—')}<span class="cell-sub">${escapeHTML(w.account_name || '')}</span></td>
            <td class="cell-amount">${escapeHTML(formatCurrency(w.amount))}</td>
            <td>${badge('withdrawal', w.status)}</td>
            <td class="cell-mono">${escapeHTML(formatDate(w.created_at, { short: true }))}</td>
            <td><div class="admin-table__actions">
              <button class="btn btn--ghost btn--sm" type="button" data-withdrawal-open="${escapeHTML(w.id)}">Review</button>
            </div></td>
          </tr>`
        )
        .join('')
    : emptyRow(8, 'No withdrawals match those filters.');
}

/* ------------------------------------------------------------- recruitment */

async function loadRecruitment() {
  const [jobs, applications] = await Promise.all([api.getAllJobsAdmin(), api.getAllApplicationsAdmin()]);
  state.jobs = jobs;
  state.applications = applications;
  renderJobs();
}

function renderJobs() {
  const body = $('[data-jobs-body]');
  if (!body) return;
  body.innerHTML = state.jobs.length
    ? state.jobs
        .map((j) => {
          const count = state.applications.filter((a) => a.vacancy_id === j.id).length;
          return `<tr>
            <td><span class="cell-strong">${escapeHTML(j.title)}</span><span class="cell-sub">${escapeHTML(
            j.summary || ''
          )}</span></td>
            <td>${escapeHTML(j.department || '—')}</td>
            <td>${escapeHTML(j.location || '—')}<span class="cell-sub">${escapeHTML(j.work_mode || '')}</span></td>
            <td>${escapeHTML(j.employment_type || '—')}</td>
            <td>${badge('job', j.status || 'open')}${j.featured ? ' <span class="badge">Featured</span>' : ''}</td>
            <td>${count}</td>
            <td><div class="admin-table__actions">
              <a class="admin-icon-btn" href="../job-details.html?slug=${encodeURIComponent(
                j.slug
              )}" target="_blank" rel="noopener" aria-label="View public role" title="View public role">${icon('external')}</a>
              <button class="admin-icon-btn" type="button" data-job-edit="${escapeHTML(j.id)}" aria-label="Edit role" title="Edit role">${icon(
            'edit'
          )}</button>
              <button class="admin-icon-btn" type="button" data-job-delete="${escapeHTML(j.id)}" aria-label="Delete role" title="Delete role">${icon(
            'trash'
          )}</button>
            </div></td>
          </tr>`;
        })
        .join('')
    : emptyRow(7, 'No vacancies have been created yet.');
}

/* ------------------------------------------------------------ applications */

async function loadApplications() {
  state.applications = await api.getAllApplicationsAdmin();
  renderApplications();
}

function renderApplications() {
  const body = $('[data-apps-body]');
  if (!body) return;
  const q = ($('[data-apps-search]')?.value || '').trim().toLowerCase();
  const status = $('[data-apps-status]')?.value || '';
  const rows = state.applications.filter((a) => {
    if (status && a.status !== status) return false;
    if (
      q &&
      !`${a.reference} ${a.full_name} ${a.email} ${a.job_title || ''}`.toLowerCase().includes(q)
    )
      return false;
    return true;
  });
  body.innerHTML = rows.length
    ? rows
        .map(
          (a) => `<tr>
            <td class="cell-mono">${escapeHTML(a.reference)}</td>
            <td>${nameCell(a.full_name, a.email)}</td>
            <td>${escapeHTML(a.job_title || 'Role')}</td>
            <td>${badge('application', a.status)}</td>
            <td>${
              a.resume_name
                ? `<button class="admin-link" type="button" data-app-resume="${escapeHTML(a.id)}">${escapeHTML(
                    a.resume_name
                  )}</button>`
                : '<span class="cell-sub">Not attached</span>'
            }</td>
            <td class="cell-mono">${escapeHTML(formatDate(a.created_at, { short: true }))}</td>
            <td><div class="admin-table__actions">
              <button class="admin-icon-btn" type="button" data-app-open="${escapeHTML(a.id)}" aria-label="Open application" title="Review application">${icon(
            'eye'
          )}</button>
            </div></td>
          </tr>`
        )
        .join('')
    : emptyRow(7, 'No applications match those filters.');
}

/* ------------------------------------------------------------------- cards */

async function loadCards() {
  state.cards = await api.getAllCardsAdmin();
  renderCards();
}

function renderCards() {
  const body = $('[data-cards-body]');
  if (!body) return;
  const q = ($('[data-cards-search]')?.value || '').trim().toLowerCase();
  const status = $('[data-cards-status]')?.value || '';
  const rows = state.cards.filter((c) => {
    if (status && c.status !== status) return false;
    if (q && !`${c.reference} ${c.member_name} ${c.member_email} ${c.design} ${c.cardholder_name}`.toLowerCase().includes(q))
      return false;
    return true;
  });
  body.innerHTML = rows.length
    ? rows
        .map(
          (c) => `<tr>
            <td class="cell-mono">${escapeHTML(c.reference)}</td>
            <td>${nameCell(c.member_name, c.member_email)}</td>
            <td>${escapeHTML(DESIGNS[c.design] || humanize(c.design || ''))}</td>
            <td>${escapeHTML(c.cardholder_name || '—')}</td>
            <td>${badge('card', c.status)}</td>
            <td class="cell-mono">${escapeHTML(formatDate(c.created_at, { short: true }))}</td>
            <td><div class="admin-table__actions">
              <button class="admin-icon-btn" type="button" data-card-open="${escapeHTML(c.id)}" aria-label="Review card" title="Review card">${icon(
            'eye'
          )}</button>
            </div></td>
          </tr>`
        )
        .join('')
    : emptyRow(7, 'No card requests match those filters.');
}

/* ---------------------------------------------------------------- messages */

async function loadMessages() {
  state.messages = await api.getMessagesAdmin();
  renderMessages();
}

function renderMessages() {
  const body = $('[data-messages-body]');
  if (!body) return;
  const q = ($('[data-messages-search]')?.value || '').trim().toLowerCase();
  const status = $('[data-messages-status]')?.value || '';
  const rows = state.messages.filter((m) => {
    if (status && m.status !== status) return false;
    if (q && !`${m.name} ${m.email} ${m.subject} ${m.message}`.toLowerCase().includes(q)) return false;
    return true;
  });
  body.innerHTML = rows.length
    ? rows
        .map((m) => {
          const preview = String(m.message || '').replace(/\s+/g, ' ').slice(0, 84);
          return `<tr>
            <td>${nameCell(m.name, m.email)}</td>
            <td><span class="cell-strong">${escapeHTML(m.subject || 'Enquiry')}</span></td>
            <td><span class="cell-sub" style="margin-top:0">${escapeHTML(preview)}${m.message.length > 84 ? '…' : ''}</span></td>
            <td>${badge('message', m.status)}</td>
            <td class="cell-mono">${escapeHTML(timeAgo(m.created_at))}</td>
            <td><div class="admin-table__actions">
              <button class="admin-icon-btn" type="button" data-message-open="${escapeHTML(m.id)}" aria-label="Open message" title="Open message">${icon(
            'mail-open'
          )}</button>
            </div></td>
          </tr>`;
        })
        .join('')
    : emptyRow(6, 'No messages match those filters.');
}

/* ---------------------------------------------------------------- settings */

async function loadSettings() {
  state.settings = await api.getSettings();
  const form = $('[data-settings-form]');
  if (!form) return;
  const s = state.settings;
  const set = (name, value) => {
    const field = form.elements[name];
    if (!field) return;
    if (field.type === 'checkbox') field.checked = Boolean(value);
    else field.value = value ?? '';
  };
  [
    'site_name',
    'tagline',
    'support_email',
    'support_phone',
    'address',
    'office_hours',
    'announcement',
    'intro_video_url',
    'linkedin_url',
    'instagram_url',
  ].forEach((key) => set(key, s[key]));
  set('intro_video_enabled', s.intro_video_enabled);
  set('intro_autoplay', String(Boolean(s.intro_autoplay)));

  renderVideoPreview(s.intro_video_url);
  $('[data-env-mode]').textContent = isDemo ? 'Local Engine (active)' : 'Supabase (live)';
  $('[data-env-storage]').textContent = isDemo ? 'Persistent Local Storage' : 'PostgreSQL + Storage';
  $('[data-env-video]').textContent = s.intro_video_enabled ? 'Enabled' : 'Disabled';
  $('[data-env-version]').textContent = config.version;

  const reset = $('[data-reset-cache]') || $('[data-reset-demo]');
  if (reset) reset.hidden = !isDemo;
  const fileInput = $('[data-video-file]');
  const hint = $('[data-video-hint]');
  if (fileInput && hint) {
    fileInput.disabled = isDemo;
    hint.textContent = isDemo
      ? 'Video uploads require Supabase Storage. Use a hosted URL instead.'
      : 'MP4, up to 50 MB. Stored in the public site-media bucket.';
  }
}

function renderVideoPreview(path) {
  const host = $('[data-video-preview]');
  if (!host) return;
  const url = resolvePublic(path);
  host.innerHTML = url
    ? `<video src="${escapeHTML(url)}" controls muted playsinline preload="metadata"></video>`
    : `<div class="placeholder"><div>${icon('video')}<br>No video configured. Add a hosted URL or upload an MP4.</div></div>`;
}

/* ------------------------------------------------------------------ actions */

async function toggleUser(id, target) {
  try {
    await api.auth.setUserStatus(id, target);
    await loadUsers();
    toast(target === 'active' ? 'Member reinstated.' : 'Member suspended.', 'success');
    if (state.overview) await loadOverview();
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function openClaim(id) {
  const c = state.claims.find((x) => x.id === id);
  if (!c) return;
  const body = `${detailRows([
    ['Reference', `<span class="cell-mono">${escapeHTML(c.reference)}</span>`],
    ['Member', escapeHTML(c.member_name || 'Member')],
    ['Email', escapeHTML(c.member_email || '—')],
    ['Reward', escapeHTML(c.reward || 'Executive reward')],
    ['Amount', escapeHTML(formatCurrency(c.amount))],
    ['Created', escapeHTML(formatDateTime(c.created_at))],
    ['Estimated completion', escapeHTML(c.estimated_completion_at ? formatDateTime(c.estimated_completion_at) : '—')],
    ['Note', escapeHTML(c.note || '—')],
  ])}
  <div class="field" style="margin-top:18px"><label class="field__label" for="claim-detail-status">Status</label>
    <select class="select" id="claim-detail-status">${statusOptions('claim', c.status)}</select>
  </div>
  <div class="field" style="margin-top:12px"><label class="field__label" for="claim-detail-note">Internal note</label>
    <textarea class="textarea" id="claim-detail-note" rows="2">${escapeHTML(c.note || '')}</textarea>
  </div>`;
  showDetail({
    title: 'Reward claim',
    sub: 'Advancing the status notifies the member and updates their reward account balance.',
    body,
    actions: [
      {
        label: 'Save status',
        className: 'btn--gold',
        onClick: async (modal) => {
          const status = $('#claim-detail-status', modal).value;
          const note = $('#claim-detail-note', modal).value.trim();
          try {
            await api.updateClaimStatus(id, status, note);
            closeModal(modal);
            await loadRewards();
            toast('Claim updated.', 'success');
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      },
      { label: 'Close', onClick: (modal) => closeModal(modal) },
    ],
  });
}

async function openWithdrawal(id) {
  const w = state.withdrawals.find((x) => x.id === id);
  if (!w) return;

  let detail = null;
  let history = [];
  try {
    [detail, history] = await Promise.all([api.getWithdrawalDetail(id), api.getWithdrawalHistory(id)]);
  } catch (error) {
    toast(error.message || 'The withdrawal details could not be loaded.', 'error');
    return;
  }
  const d = detail?.details || {};
  const isManual = !w.provider || w.provider === 'manual';

  const destinationRows = [];
  if (w.method === 'bank_transfer') {
    destinationRows.push(
      ['Account holder', escapeHTML(d.account_holder || w.account_name || '—')],
      ['Bank', escapeHTML(d.bank_name || w.bank_name || '—')],
      ['Account number', escapeHTML(d.account_number || (w.account_number_last4 ? `•••• ${w.account_number_last4}` : '—'))],
      ['Bank code', escapeHTML(d.bank_code || w.bank_code || '—')],
      ['Payment reference', escapeHTML(d.account_reference || w.account_reference || '—')],
      ['Account currency', escapeHTML(w.currency || 'USD')]
    );
  } else if (w.method === 'crypto') {
    destinationRows.push(
      ['Asset', escapeHTML(d.crypto_asset || w.crypto_asset || '—')],
      ['Network', escapeHTML(d.crypto_network || w.crypto_network || '—')],
      ['Wallet address', `<span class="cell-mono" style="word-break:break-all">${escapeHTML(d.wallet_address || w.wallet_address || '—')}</span>`]
    );
  } else if (w.method === 'card') {
    destinationRows.push(
      ['Card', escapeHTML(`${d.card_brand || w.card_brand || 'Card'} •••• ${d.card_last4 || w.card_last4 || ''}`)],
      ['Cardholder', escapeHTML(w.account_name || '—')],
      ['Provider', escapeHTML(w.provider || 'manual')]
    );
  }

  const historyHtml = history.length
    ? `<div class="wb-timeline">${history
        .map(
          (h) => `<div class="wb-timeline__item">
            <span class="wb-timeline__dot"></span>
            <div>
              <div class="wb-timeline__title">${escapeHTML(
                h.from_status === h.to_status ? 'Administrative note' : statusLabel('withdrawal', h.to_status)
              )}</div>
              <div class="wb-timeline__time">${escapeHTML(formatDateTime(h.created_at))}</div>
              ${h.note ? `<p class="wb-timeline__note">${escapeHTML(h.note)}</p>` : ''}
            </div>
          </div>`
        )
        .join('')}</div>`
    : '<p class="fine">No status events recorded yet.</p>';

  const body = `${detailRows([
    ['Reference', `<span class="cell-mono">${escapeHTML(w.reference)}</span>`],
    ['Member', escapeHTML(w.member_name || 'Member')],
    ['Email', `<a href="mailto:${escapeHTML(w.member_email || '')}">${escapeHTML(w.member_email || '—')}</a>`],
    ['Amount', escapeHTML(formatCurrency(w.amount, { cents: true }))],
    ['Processing fee', escapeHTML(formatCurrency(w.fee_amount || 0, { cents: true }))],
    ['Net payout', escapeHTML(formatCurrency(w.net_amount ?? w.amount, { cents: true }))],
    ['Method', escapeHTML(methodLabel(w.method))],
    ['Destination', escapeHTML(w.destination_label || '—')],
    ['Status', badge('withdrawal', w.status)],
    ['Requested', escapeHTML(formatDateTime(w.created_at))],
    ['Reviewed', escapeHTML(w.reviewed_at ? formatDateTime(w.reviewed_at) : '—')],
    ['Completed', escapeHTML(w.completed_at ? formatDateTime(w.completed_at) : '—')],
    ['Payout provider', escapeHTML(w.provider || 'manual')],
    ['Provider reference', escapeHTML(w.provider_reference || '—')],
  ])}
  <div class="admin-detail__section">
    <div class="admin-detail__section-title">Payout destination</div>
    ${detailRows(destinationRows)}
  </div>
  <div class="admin-detail__section">
    <div class="admin-detail__section-title">Administrative controls</div>
    <div class="field">
      <label class="field__label" for="withdrawal-provider-reference">Provider reference</label>
      <input class="input" id="withdrawal-provider-reference" type="text" value="${escapeHTML(w.provider_reference || '')}" placeholder="Payout ID, transaction hash or bank reference">
    </div>
    <div class="field" style="margin-top:14px">
      <label class="field__label" for="withdrawal-detail-note">Internal note</label>
      <textarea class="textarea" id="withdrawal-detail-note" rows="2" placeholder="Visible to administrators only">${escapeHTML(w.note || '')}</textarea>
    </div>
    <div class="field" style="margin-top:14px">
      <label class="field__label" for="withdrawal-rejection-reason">Rejection reason</label>
      <textarea class="textarea" id="withdrawal-rejection-reason" rows="2" placeholder="Used when rejecting the request; shared with the member">${escapeHTML(w.rejection_reason || '')}</textarea>
    </div>
    <label class="checkbox" style="margin-top:16px">
      <input type="checkbox" id="withdrawal-provider-confirmed">
      <span>I confirm the payout has been sent or settled by the payout provider, bank or blockchain. Completion must not be marked before this confirmation.</span>
    </label>
    ${
      isManual
        ? '<p class="fine" style="margin-top:8px">This request uses manual settlement. Record the provider or bank reference before completing it.</p>'
        : ''
    }
  </div>
  <div class="admin-detail__section">
    <div class="admin-detail__section-title">Status history</div>
    ${historyHtml}
  </div>`;

  const actions = [];
  const noteValue = (modal) => $('#withdrawal-detail-note', modal)?.value.trim() || '';
  const providerRef = (modal) => $('#withdrawal-provider-reference', modal)?.value.trim() || '';
  const confirmed = (modal) => Boolean($('#withdrawal-provider-confirmed', modal)?.checked);
  const transition = (label, status, className = 'btn--ghost') => ({
    label,
    className,
    onClick: async (modal) => {
      if (status === 'completed' && !confirmed(modal)) {
        toast('Confirm the payout has been settled before marking this request complete.', 'error');
        return;
      }
      const note =
        status === 'rejected'
          ? $('#withdrawal-rejection-reason', modal)?.value.trim() || noteValue(modal)
          : noteValue(modal);
      try {
        await api.updateWithdrawalStatus(id, status, note, confirmed(modal), providerRef(modal));
        closeModal(modal);
        await loadRewards();
        toast(`Withdrawal ${status === 'completed' ? 'completed' : `moved to ${status.replaceAll('_', ' ')}`}.`, 'success');
      } catch (error) {
        toast(error.message, 'error');
      }
    },
  });

  if (w.status === 'pending') actions.push(transition('Move to review', 'reviewing'));
  if (['pending', 'reviewing'].includes(w.status)) actions.push(transition('Approve', 'approved', 'btn--gold'));
  if (w.status === 'approved') actions.push(transition('Mark processing', 'processing'));
  if (w.status === 'processing') actions.push(transition('Mark completed', 'completed', 'btn--gold'));
  if (['pending', 'reviewing', 'approved', 'processing'].includes(w.status)) actions.push(transition('Reject', 'rejected'));
  actions.push({
    label: 'Save note',
    onClick: async (modal) => {
      const note = noteValue(modal);
      if (!note) {
        toast('Enter an internal note first.', 'error');
        return;
      }
      try {
        await api.addWithdrawalNote(id, note);
        closeModal(modal);
        await loadRewards();
        toast('Internal note saved.', 'success');
      } catch (error) {
        toast(error.message, 'error');
      }
    },
  });
  actions.push({ label: 'Close', onClick: (modal) => closeModal(modal) });

  showDetail({
    title: `Withdrawal ${w.reference}`,
    sub: `${methodLabel(w.method)} · ${formatCurrency(w.amount)} · ${statusLabel('withdrawal', w.status)}`,
    body,
    actions,
  });
}

async function openApplication(id) {
  const a = state.applications.find((x) => x.id === id);
  if (!a) return;
  const body = `${detailRows([
    ['Reference', `<span class="cell-mono">${escapeHTML(a.reference)}</span>`],
    ['Candidate', escapeHTML(a.full_name || 'Candidate')],
    ['Email', `<a href="mailto:${escapeHTML(a.email)}">${escapeHTML(a.email)}</a>`],
    ['Phone', escapeHTML(a.phone || '—')],
    ['Location', escapeHTML(a.location || '—')],
    ['Role', escapeHTML(a.job_title || 'Role')],
    ['Submitted', escapeHTML(formatDateTime(a.created_at))],
    ['Resume', a.resume_name ? escapeHTML(a.resume_name) : 'Not attached'],
  ])}
  <div class="admin-detail__note"><strong>Qualifications.</strong><br>${escapeHTML(a.qualifications || '—')}</div>
  <div class="admin-detail__note"><strong>Experience.</strong><br>${escapeHTML(a.experience || '—')}</div>
  <div class="field" style="margin-top:18px"><label class="field__label" for="app-detail-status">Status</label>
    <select class="select" id="app-detail-status">${statusOptions('application', a.status)}</select>
  </div>
  <div class="field" style="margin-top:12px"><label class="field__label" for="app-detail-note">Review notes</label>
    <textarea class="textarea" id="app-detail-note" rows="3">${escapeHTML(a.review_notes || '')}</textarea>
  </div>`;
  showDetail({
    title: `${a.full_name || 'Candidate'} — ${a.job_title || 'Application'}`,
    sub: 'Status changes notify the candidate where an account is linked.',
    body,
    actions: [
      ...(a.resume_path
        ? [
            {
              label: 'Open resume',
              onClick: async () => {
                try {
                  const url = await api.getResumeUrl(a.resume_path);
                  if (url) window.open(url, '_blank', 'noopener');
                  else toast('Resume link is unavailable.', 'error');
                } catch (error) {
                  toast(error.message, 'error');
                }
              },
            },
          ]
        : []),
      {
        label: 'Save decision',
        className: 'btn--gold',
        onClick: async (modal) => {
          const status = $('#app-detail-status', modal).value;
          const note = $('#app-detail-note', modal).value.trim();
          try {
            await api.updateApplicationStatus(id, status, note);
            closeModal(modal);
            await loadApplications();
            toast('Application updated.', 'success');
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      },
      { label: 'Close', onClick: (modal) => closeModal(modal) },
    ],
  });
}

async function openCard(id) {
  const c = state.cards.find((x) => x.id === id);
  if (!c) return;
  const num = c.card_number || c.fictional_card_number;
  const number = num
    ? String(num).replace(/(.{4})/g, '$1 ').trim()
    : '—';
  const expiry = c.expiry_month
    ? `${String(c.expiry_month).padStart(2, '0')} / ${String(c.expiry_year || '').slice(-2)}`
    : '—';
  const body = `${detailRows([
    ['Reference', `<span class="cell-mono">${escapeHTML(c.reference)}</span>`],
    ['Member', escapeHTML(c.member_name || 'Member')],
    ['Email', escapeHTML(c.member_email || '—')],
    ['Design', escapeHTML(DESIGNS[c.design] || humanize(c.design || ''))],
    ['Cardholder', escapeHTML(c.cardholder_name || '—')],
    ['Card number', `<span class="cell-mono">${escapeHTML(number)}</span>`],
    ['Expiry', escapeHTML(expiry)],
    ['Status', badge('card', c.status)],
    ['Requested', escapeHTML(formatDateTime(c.created_at))],
  ])}
  <div class="field" style="margin-top:16px"><label class="field__label" for="card-decision-note">Decision note</label>
    <textarea class="textarea" id="card-decision-note" rows="2">${escapeHTML(c.note || '')}</textarea>
  </div>
  <div class="admin-detail__note">Official membership card credential. Approving a design activates the public verification result for this reference.</div>`;
  const actions = [];
  if (c.status !== 'approved') {
    actions.push({
      label: 'Approve design',
      className: 'btn--gold',
      onClick: async (modal) => {
        const note = $('#card-decision-note', modal).value.trim() || 'Approved by administrator.';
        try {
          await api.updateCardStatus(id, 'approved', note);
          closeModal(modal);
          await loadCards();
          toast('Card design approved.', 'success');
        } catch (error) {
          toast(error.message, 'error');
        }
      },
    });
  }
  if (c.status !== 'rejected') {
    actions.push({
      label: 'Decline',
      className: 'btn--danger',
      onClick: async (modal) => {
        const note = $('#card-decision-note', modal).value.trim() || 'Declined by administrator.';
        try {
          await api.updateCardStatus(id, 'rejected', note);
          closeModal(modal);
          await loadCards();
          toast('Card request declined.', 'success');
        } catch (error) {
          toast(error.message, 'error');
        }
      },
    });
  }
  actions.push({ label: 'Close', onClick: (modal) => closeModal(modal) });
  showDetail({
    title: 'Digital membership card request',
    sub: 'Review the design and cardholder credential details.',
    body,
    actions,
  });
}

async function openMessage(id) {
  const m = state.messages.find((x) => x.id === id);
  if (!m) return;
  const body = `${detailRows([
    ['From', escapeHTML(m.name || 'Visitor')],
    ['Email', `<a href="mailto:${escapeHTML(m.email)}">${escapeHTML(m.email)}</a>`],
    ['Phone', escapeHTML(m.phone || '—')],
    ['Subject', escapeHTML(m.subject || 'Enquiry')],
    ['Received', escapeHTML(formatDateTime(m.created_at))],
    ['Status', badge('message', m.status)],
  ])}
  <div class="admin-detail__note" style="white-space:pre-wrap">${escapeHTML(m.message || '')}</div>`;
  showDetail({
    title: m.subject || 'Member message',
    sub: 'Reply directly by email. Archiving keeps the record without marking it new.',
    body,
    actions: [
      {
        label: m.status === 'archived' ? 'Restore to inbox' : 'Archive',
        onClick: async (modal) => {
          try {
            await api.updateMessageStatus(id, m.status === 'archived' ? 'read' : 'archived');
            closeModal(modal);
            await loadMessages();
            toast('Message updated.', 'success');
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      },
      { label: 'Close', onClick: (modal) => closeModal(modal) },
    ],
  });
  if (m.status === 'new') {
    try {
      await api.updateMessageStatus(id, 'read');
      const cached = state.messages.find((x) => x.id === id);
      if (cached) cached.status = 'read';
      renderMessages();
      state.overview = null;
    } catch (error) {
      console.warn(error);
    }
  }
}

/* --------------------------------------------------------------- job editor */

function openJobModal(job = null) {
  const modal = $('#job-modal');
  const form = $('#job-form');
  if (!modal || !form) return;
  form.reset();
  clearFormErrors(form);
  form.elements.id.value = job?.id || '';
  $('#job-modal-title').textContent = job ? 'Edit role' : 'Add a role';
  if (job) {
    ['title', 'department', 'location', 'work_mode', 'employment_type', 'status', 'salary_min', 'salary_max', 'deadline', 'slug', 'summary', 'description']
      .forEach((key) => {
        if (form.elements[key]) form.elements[key].value = job[key] ?? '';
      });
    form.elements.responsibilities.value = (job.responsibilities || []).join('\n');
    form.elements.requirements.value = (job.requirements || []).join('\n');
    form.elements.benefits.value = (job.benefits || []).join('\n');
    form.elements.featured.checked = Boolean(job.featured);
  } else {
    form.elements.status.value = 'open';
    form.elements.work_mode.value = 'Hybrid';
    form.elements.employment_type.value = 'Full-time';
  }
  openModal(modal);
  window.setTimeout(() => form.elements.title.focus(), 120);
}

async function submitJob(e) {
  e.preventDefault();
  const form = e.currentTarget;
  clearFormErrors(form);
  const values = {
    id: form.elements.id.value || undefined,
    title: form.elements.title.value.trim(),
    department: form.elements.department.value.trim(),
    location: form.elements.location.value.trim(),
    work_mode: form.elements.work_mode.value,
    employment_type: form.elements.employment_type.value,
    status: form.elements.status.value,
    salary_min: Number(form.elements.salary_min.value || 0),
    salary_max: Number(form.elements.salary_max.value || 0),
    deadline: form.elements.deadline.value || null,
    slug: form.elements.slug.value.trim(),
    summary: form.elements.summary.value.trim(),
    description: form.elements.description.value.trim(),
    responsibilities: form.elements.responsibilities.value.split('\n').map((s) => s.trim()).filter(Boolean),
    requirements: form.elements.requirements.value.split('\n').map((s) => s.trim()).filter(Boolean),
    benefits: form.elements.benefits.value.split('\n').map((s) => s.trim()).filter(Boolean),
    featured: form.elements.featured.checked,
    currency: 'USD',
  };
  let valid = true;
  if (values.title.length < 3) {
    fieldError(form.elements.title, 'Enter a role title.');
    valid = false;
  }
  if (!values.department) {
    fieldError(form.elements.department, 'Enter a department.');
    valid = false;
  }
  if (!values.location) {
    fieldError(form.elements.location, 'Enter a location.');
    valid = false;
  }
  if (!values.summary) {
    fieldError(form.elements.summary, 'Add a short summary.');
    valid = false;
  }
  if (!values.description) {
    fieldError(form.elements.description, 'Add a role description.');
    valid = false;
  }
  if (values.salary_min && values.salary_max && values.salary_min > values.salary_max) {
    fieldError(form.elements.salary_max, 'Maximum must be at least the minimum.');
    valid = false;
  }
  if (!valid) {
    focusFirstError(form);
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  setLoading(button, true, 'Saving role');
  try {
    await api.saveJob(values);
    closeModal($('#job-modal'));
    await loadRecruitment();
    toast(values.id ? 'Role updated.' : 'Role created.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(button, false);
  }
}

function confirmDeleteJob(id) {
  const job = state.jobs.find((j) => j.id === id);
  if (!job) return;
  showDetail({
    title: 'Delete this role?',
    sub: 'This removes the vacancy from the public careers page. Existing applications are retained.',
    body: detailRows([
      ['Role', escapeHTML(job.title)],
      ['Department', escapeHTML(job.department || '—')],
      ['Status', badge('job', job.status || 'open')],
    ]),
    actions: [
      {
        label: 'Delete role',
        className: 'btn--danger',
        onClick: async (modal) => {
          try {
            await api.deleteJob(id);
            closeModal(modal);
            await loadRecruitment();
            toast('Role deleted.', 'success');
          } catch (error) {
            toast(error.message, 'error');
          }
        },
      },
      { label: 'Cancel', onClick: (modal) => closeModal(modal) },
    ],
  });
}

/* ----------------------------------------------------------------- settings */

async function submitSettings(e) {
  e.preventDefault();
  const form = e.currentTarget;
  clearFormErrors(form);
  const patch = {
    site_name: form.elements.site_name.value.trim(),
    tagline: form.elements.tagline.value.trim(),
    support_email: form.elements.support_email.value.trim(),
    support_phone: form.elements.support_phone.value.trim(),
    address: form.elements.address.value.trim(),
    office_hours: form.elements.office_hours.value.trim(),
    announcement: form.elements.announcement.value.trim(),
    intro_video_url: form.elements.intro_video_url.value.trim(),
    linkedin_url: form.elements.linkedin_url.value.trim(),
    instagram_url: form.elements.instagram_url.value.trim(),
    intro_video_enabled: form.elements.intro_video_enabled.checked,
    intro_autoplay: form.elements.intro_autoplay.value === 'true',
  };
  if (patch.support_email && !validateEmail(patch.support_email)) {
    fieldError(form.elements.support_email, 'Enter a valid support email.');
    focusFirstError(form);
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  setLoading(button, true, 'Saving');
  try {
    state.settings = await api.saveSettings(patch);
    renderVideoPreview(patch.intro_video_url);
    $('[data-env-video]').textContent = patch.intro_video_enabled ? 'Enabled' : 'Disabled';
    toast('Website configuration saved.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    setLoading(button, false);
  }
}

async function uploadVideo(file) {
  if (!file) return;
  if (isDemo) {
    toast('Uploads require a connected Supabase project.', 'error');
    return;
  }
  if (file.type !== 'video/mp4') {
    toast('Choose an MP4 file.', 'error');
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    toast('The video must be 50 MB or smaller.', 'error');
    return;
  }
  toast('Uploading introduction video…', 'info');
  try {
    const url = await api.uploadIntroVideo(file);
    const form = $('[data-settings-form]');
    if (form) form.elements.intro_video_url.value = url;
    renderVideoPreview(url);
    toast('Video uploaded and saved.', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
}

function confirmResetDemo() {
  showDetail({
    title: 'Reset local data cache?',
    sub: 'This clears the local database cache and restores initial records.',
    body:
      '<div class="admin-detail__note">You will be signed out and local storage will be refreshed.</div>',
    actions: [
      {
        label: 'Reset local cache',
        className: 'btn--danger',
        onClick: () => {
          api.resetDemoData?.();
          location.href = 'login.html';
        },
      },
      { label: 'Cancel', onClick: (modal) => closeModal(modal) },
    ],
  });
}

/* ------------------------------------------------------------------- shell */

function openDrawer() {
  $('#admin-sidebar')?.classList.add('is-open');
  $('[data-admin-backdrop]')?.classList.add('is-open');
  $('[data-admin-menu]')?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('no-scroll');
}

function closeDrawer() {
  $('#admin-sidebar')?.classList.remove('is-open');
  $('[data-admin-backdrop]')?.classList.remove('is-open');
  $('[data-admin-menu]')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('no-scroll');
}

function bindShell() {
  $('[data-admin-menu]')?.addEventListener('click', () => {
    if ($('#admin-sidebar')?.classList.contains('is-open')) closeDrawer();
    else openDrawer();
  });
  $('[data-admin-backdrop]')?.addEventListener('click', closeDrawer);
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) closeDrawer();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  $$('[data-view-link]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const view = link.dataset.viewLink;
      if (location.hash === `#${view}`) openView(view);
      else location.hash = view;
    });
  });

  $('[data-admin-signout]')?.addEventListener('click', async () => {
    try {
      await api.auth.signOut();
    } catch (error) {
      console.warn(error);
    }
    location.href = 'login.html';
  });

  $$('[data-admin-refresh]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await loadView(state.view);
      toast('Console refreshed.', 'success');
    })
  );

  window.addEventListener('hashchange', () => {
    const view = location.hash.replace('#', '') || 'overview';
    if (view !== state.view) openView(view);
  });

  $('[data-new-job]')?.addEventListener('click', () => openJobModal());
  $('#job-form')?.addEventListener('submit', submitJob);
  $('[data-reset-cache], [data-reset-demo]')?.addEventListener('click', confirmResetDemo);

  $('[data-settings-form]')?.addEventListener('submit', submitSettings);
  $('[data-video-file]')?.addEventListener('change', (e) => uploadVideo(e.target.files?.[0]));

  $('[data-users-search]')?.addEventListener('input', renderUsers);
  $('[data-users-role]')?.addEventListener('change', renderUsers);
  $('[data-users-status]')?.addEventListener('change', renderUsers);

  $('[data-claims-search]')?.addEventListener('input', renderClaims);
  $('[data-claims-status]')?.addEventListener('change', renderClaims);
  $('[data-withdrawals-search]')?.addEventListener('input', renderWithdrawals);
  $('[data-withdrawals-status]')?.addEventListener('change', renderWithdrawals);

  $('[data-apps-search]')?.addEventListener('input', renderApplications);
  $('[data-apps-status]')?.addEventListener('change', renderApplications);

  $('[data-cards-search]')?.addEventListener('input', renderCards);
  $('[data-cards-status]')?.addEventListener('change', renderCards);

  $('[data-messages-search]')?.addEventListener('input', renderMessages);
  $('[data-messages-status]')?.addEventListener('change', renderMessages);

  document.addEventListener('click', async (e) => {
    const userBtn = e.target.closest('[data-user-toggle]');
    if (userBtn) return toggleUser(userBtn.dataset.userToggle, userBtn.dataset.target);

    const jobEdit = e.target.closest('[data-job-edit]');
    if (jobEdit) return openJobModal(state.jobs.find((j) => j.id === jobEdit.dataset.jobEdit));

    const jobDelete = e.target.closest('[data-job-delete]');
    if (jobDelete) return confirmDeleteJob(jobDelete.dataset.jobDelete);

    const appOpen = e.target.closest('[data-app-open]');
    if (appOpen) return openApplication(appOpen.dataset.appOpen);

    const appResume = e.target.closest('[data-app-resume]');
    if (appResume) {
      const app = state.applications.find((a) => a.id === appResume.dataset.appResume);
      if (!app?.resume_path) {
        toast('The resume file lives in private storage when Supabase is connected.', 'info');
        return;
      }
      try {
        const url = await api.getResumeUrl(app.resume_path);
        if (url) window.open(url, '_blank', 'noopener');
        else toast('Resume link is unavailable.', 'error');
      } catch (error) {
        toast(error.message, 'error');
      }
      return;
    }

    const cardOpen = e.target.closest('[data-card-open]');
    if (cardOpen) return openCard(cardOpen.dataset.cardOpen);

    const messageOpen = e.target.closest('[data-message-open]');
    if (messageOpen) return openMessage(messageOpen.dataset.messageOpen);

    const claimOpen = e.target.closest('[data-claim-open]');
    if (claimOpen) return openClaim(claimOpen.dataset.claimOpen);

    const withdrawalOpen = e.target.closest('[data-withdrawal-open]');
    if (withdrawalOpen) return openWithdrawal(withdrawalOpen.dataset.withdrawalOpen);
  });

  document.addEventListener('change', async (e) => {
    const claim = e.target.closest('[data-claim-status]');
    if (claim) {
      try {
        await api.updateClaimStatus(claim.dataset.claimStatus, claim.value);
        const cached = state.claims.find((c) => c.id === claim.dataset.claimStatus);
        if (cached) cached.status = claim.value;
        renderClaims();
        toast('Claim status updated.', 'success');
      } catch (error) {
        toast(error.message, 'error');
        await loadRewards();
      }
      return;
    }
  });
}

/* -------------------------------------------------------------------- boot */

async function boot() {
  initModals();
  session = await requireAdmin('index.html');
  if (!session) return;

  api = await getApi();
  const profile = session.profile;
  $$('[data-admin-initials]').forEach((el) => (el.textContent = initials(profile.full_name)));
  $$('[data-admin-name]').forEach((el) => (el.textContent = profile.full_name || 'Administrator'));
  $$('[data-admin-first]').forEach((el) => (el.textContent = (profile.full_name || 'Administrator').split(' ')[0]));
  bindFieldClearing($('#job-form'));

  hydrateIcons();
  bindShell();

  const initial = location.hash.replace('#', '') || 'overview';
  await openView(VIEWS[initial] ? initial : 'overview');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
