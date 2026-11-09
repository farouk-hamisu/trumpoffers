/**
 * Trump Offers — member application shell.
 * Renders the authenticated sidebar and topbar and guards the page.
 */

import { $, $$, escapeHTML, initials } from './utils.js';
import { icon, brandMark, logotype } from '../icons.js';
import { requireUser, getApi } from './api.js';

const NAV = [
  {
    label: 'Member',
    items: [
      { key: 'dashboard', label: 'Overview', href: 'dashboard.html', icon: 'dashboard' },
      { key: 'rewards', label: 'Rewards', href: 'rewards.html', icon: 'gift' },
      { key: 'withdraw', label: 'Withdraw funds', href: 'withdraw.html', icon: 'wallet' },
      { key: 'card', label: 'Digital card', href: 'card.html', icon: 'card' },
    ],
  },
  {
    label: 'Opportunities',
    items: [
      { key: 'careers', label: 'Open roles', href: 'careers.html', icon: 'briefcase' },
      { key: 'track', label: 'Track application', href: 'track.html', icon: 'search' },
    ],
  },
  {
    label: 'Account',
    items: [
      { key: 'notifications', label: 'Notifications', href: 'dashboard.html#notifications', icon: 'bell' },
      { key: 'settings', label: 'Profile & security', href: 'dashboard.html#account', icon: 'user' },
    ],
  },
];

function sidebarHTML(session, page) {
  const p = session.profile;
  return `<div class="app-sidebar__brand">
      <a class="brand" href="index.html" aria-label="Trump Offers — home">${brandMark()}${logotype()}</a>
    </div>
    <nav class="app-sidebar__nav" aria-label="Member navigation">
      ${NAV.map(
        (group) => `<div class="app-nav__label">${group.label}</div>
        ${group.items
          .map((item) => {
            const active = item.key === page ? ' is-active' : '';
            const current = item.key === page ? ' aria-current="page"' : '';
            return `<a class="app-nav__link${active}" href="${item.href}"${current}>${icon(item.icon)}<span>${item.label}</span></a>`;
          })
          .join('')}`
      ).join('')}
      ${p.role === 'admin' ? `<div class="app-nav__label">Administration</div>
        <a class="app-nav__link" href="admin/index.html">${icon('shield')}<span>Admin console</span></a>` : ''}
    </nav>
    <div class="app-sidebar__foot">
      <div class="sidebar-help">
        <div class="sidebar-help__title">Concierge desk</div>
        <p>Questions about a claim, withdrawal or application? Our team replies within one business day.</p>
        <a href="contact.html">Contact the concierge</a>
      </div>
      <div class="sidebar-user">
        <span class="avatar avatar--sm">${escapeHTML(initials(p.full_name))}</span>
        <div class="sidebar-user__meta">
          <div class="sidebar-user__name">${escapeHTML(p.full_name || 'Member')}</div>
          <div class="sidebar-user__role">${p.role === 'admin' ? 'Administrator' : 'Private member'}</div>
        </div>
        <button class="sidebar-user__out" type="button" data-shell-signout aria-label="Sign out">${icon('logout')}</button>
      </div>
    </div>`;
}

function topbarHTML(title, crumb, unread) {
  return `<div class="app-topbar__left">
      <button class="app-menu-btn" type="button" data-app-menu aria-label="Open member navigation" aria-expanded="false" aria-controls="app-sidebar">${icon('menu')}</button>
      <span class="app-topbar__title">${escapeHTML(crumb || 'Member')} <strong>${escapeHTML(title || '')}</strong></span>
    </div>
    <div class="app-topbar__right">
      <a class="topbar-icon" href="index.html" aria-label="View public site">${icon('globe')}</a>
      <a class="topbar-icon" href="dashboard.html#notifications" aria-label="Notifications">
        ${icon('bell')}${unread ? '<span class="topbar-icon__dot"></span>' : ''}
      </a>
    </div>`;
}

function setupDrawer() {
  const sidebar = $('#app-sidebar');
  const backdrop = $('[data-app-backdrop]');
  const btn = $('[data-app-menu]');
  const close = () => {
    sidebar?.classList.remove('is-open');
    backdrop?.classList.remove('is-open');
    btn?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('no-scroll');
  };
  btn?.addEventListener('click', () => {
    const open = !sidebar.classList.contains('is-open');
    sidebar.classList.toggle('is-open', open);
    backdrop?.classList.toggle('is-open', open);
    btn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('no-scroll', open);
  });
  backdrop?.addEventListener('click', close);
  $$('#app-sidebar a').forEach((a) => a.addEventListener('click', close));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 1024) close();
  });
}

function setupSignOut() {
  $$('[data-shell-signout]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        const api = await getApi();
        await api.auth.signOut();
      } catch (error) {
        console.warn(error);
      }
      location.href = 'index.html';
    })
  );
}

/**
 * Guard the page and paint the shell.
 * @param {{ page?: string, title?: string, crumb?: string, next?: string }} options
 * @returns {Promise<object|null>} session
 */
export async function initAppShell(options = {}) {
  const session = await requireUser(options.next || location.pathname.split('/').pop() + location.search);
  if (!session) return null;

  const sidebar = $('#app-sidebar');
  const topbar = $('#app-topbar');
  if (!sidebar || !topbar) return session;

  let unread = 0;
  try {
    const api = await getApi();
    const notifications = await api.getNotifications();
    unread = notifications.filter((n) => !n.read_at).length;
  } catch {
    /* The shell should render even when notifications cannot be loaded. */
  }

  sidebar.innerHTML = sidebarHTML(session, options.page || '');
  topbar.innerHTML = topbarHTML(options.title, options.crumb, unread);

  if (!$('[data-app-backdrop]')) {
    const backdrop = document.createElement('div');
    backdrop.className = 'app-backdrop';
    backdrop.dataset.appBackdrop = '';
    document.querySelector('.app-shell')?.appendChild(backdrop);
  }
  setupDrawer();
  setupSignOut();
  return session;
}

export function emptyState(iconName, title, body, action = '') {
  return `<div class="missing-state">
    ${icon(iconName)}
    <h1>${escapeHTML(title)}</h1>
    <p>${escapeHTML(body)}</p>
    ${action}
  </div>`;
}
