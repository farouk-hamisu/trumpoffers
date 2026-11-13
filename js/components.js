/**
 * Trump Offers — shared chrome (header, mobile navigation, footer).
 */

import { $, $$, escapeHTML } from './lib/utils.js';
import { currentUser, getApi, config } from './lib/api.js';
import { icon, brandMark, logotype } from './icons.js';

export function brandHTML(href = 'index.html', cls = '') {
  return `<a class="brand ${cls}" href="${href}" aria-label="Trump Offers — home">${brandMark()}${logotype()}</a>`;
}

const NAV = [
  { label: 'Home', href: 'index.html', page: 'home' },
  {
    label: 'Platform',
    page: 'platform',
    children: [
      { label: 'Rewards experience', href: 'rewards.html', note: 'Explore' },
      { label: 'Digital card studio', href: 'card.html', note: 'Design' },
      { label: 'How it works', href: 'index.html#how', note: 'Process' },
      { label: 'Why Trump', href: 'index.html#why', note: 'About' },
    ],
  },
  { label: 'Careers', href: 'careers.html', page: 'careers' },
  { label: 'Contact', href: 'contact.html', page: 'contact' },
];

function navHTML(page) {
  return NAV.map((item) => {
    if (item.children) {
      return `<div class="nav-drop">
        <button class="site-nav__link ${item.page === page ? 'is-active' : ''}" aria-haspopup="true" aria-expanded="false" data-drop-toggle>
          ${item.label}${icon('chevron-down', 'site-nav__chev')}
        </button>
        <div class="nav-drop__panel" role="menu">
          ${item.children
            .map(
              (c) =>
                `<a class="nav-drop__link" href="${c.href}" role="menuitem">${c.label}<span>${c.note}</span></a>`
            )
            .join('')}
        </div>
      </div>`;
    }
    const active = item.page === page ? ' aria-current="page"' : '';
    return `<a class="site-nav__link" href="${item.href}"${active}>${item.label}</a>`;
  }).join('');
}

function accountActionsHTML(session) {
  if (!session) {
    return `<a class="header-signin" href="login.html">Sign in</a>
      <a class="btn btn--gold btn--sm" href="register.html">Join Trump ${icon('arrow-up-right')}</a>`;
  }
  const p = session.profile;
  const first = (p.full_name || 'Member').split(' ')[0];
  return `<div class="header-account">
    <button class="header-account__btn" data-account-toggle aria-haspopup="true" aria-expanded="false">
      <span class="avatar avatar--sm">${escapeHTML(
        (p.full_name || 'M')
          .split(' ')
          .map((n) => n[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()
      )}</span>
      <span class="header-account__name">${escapeHTML(first)}</span>
      ${icon('chevron-down', 'header-account__chev')}
    </button>
    <div class="account-menu" data-account-menu>
      <div class="account-menu__head">
        <div class="account-menu__name">${escapeHTML(p.full_name || 'Member')}</div>
        <div class="account-menu__email">${escapeHTML(p.email || '')}</div>
      </div>
      <a class="account-menu__link" href="dashboard.html">${icon('dashboard')}Dashboard</a>
      <a class="account-menu__link" href="rewards.html">${icon('gift')}Rewards</a>
      <a class="account-menu__link" href="withdraw.html">${icon('wallet')}Withdraw</a>
      <a class="account-menu__link" href="card.html">${icon('card')}Card studio</a>
      ${p.role === 'admin' ? `<a class="account-menu__link" href="admin/index.html">${icon('shield')}Admin console</a>` : ''}
      <a class="account-menu__link account-menu__link--danger" href="#" data-sign-out>${icon('logout')}Sign out</a>
    </div>
  </div>`;
}

function mobileNavHTML() {
  const links = [
    ['Home', 'index.html'],
    ['Rewards', 'rewards.html'],
    ['Careers', 'careers.html'],
    ['Digital card', 'card.html'],
    ['How it works', 'index.html#how'],
    ['Contact', 'contact.html'],
  ];
  return `<nav class="mobile-nav" id="mobile-nav" aria-label="Mobile navigation" aria-hidden="true">
    <div class="mobile-nav__links">
      ${links
        .map(
          ([label, href], i) =>
            `<a class="mobile-nav__link" href="${href}" style="--i:${i}"><span>${label}</span><small>0${i + 1}</small></a>`
        )
        .join('')}
    </div>
    <div class="mobile-nav__foot" data-mobile-account></div>
  </nav>`;
}

function footerHTML() {
  const year = new Date().getFullYear();
  return `<div class="container">
    <div class="footer-main">
      <div class="footer-brand">
        ${brandHTML('index.html')}
        <p>Rewards, career opportunities and digital membership cards in one simple account.</p>
        <div class="footer-contact">
          <a href="mailto:${config.supportEmail}" data-site-email>${config.supportEmail}</a>
          <a href="tel:+12125550184" data-site-phone>${config.phone}</a>
          <span>${config.address}</span>
        </div>
      </div>
      <div class="footer-col">
        <div class="footer-col__title">Platform</div>
        <ul>
          <li><a href="rewards.html">Rewards experience</a></li>
          <li><a href="card.html">Digital card studio</a></li>
          <li><a href="dashboard.html">Member dashboard</a></li>
          <li><a href="careers.html">Career opportunities</a></li>
          <li><a href="index.html#how">How it works</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <div class="footer-col__title">Company</div>
        <ul>
          <li><a href="index.html#about">Our approach</a></li>
          <li><a href="careers.html">Careers</a></li>
          <li><a href="track.html">Track an application</a></li>
          <li><a href="contact.html">Contact us</a></li>
          <li><a href="index.html#faq">Questions</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <div class="footer-col__title">Access & legal</div>
        <ul>
          <li><a href="register.html">Create an account</a></li>
          <li><a href="login.html">Member sign in</a></li>
          <li><a href="privacy.html">Privacy policy</a></li>
          <li><a href="terms.html">Terms & conditions</a></li>
          <li><a href="admin/login.html">Administrator</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${year} Trump Offers. All rights reserved.</span>
      <div class="footer-social" aria-label="Social links">
        <a href="https://www.linkedin.com/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 0 1 4 0v4"/></svg></a>
        <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" aria-label="Instagram"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5v.01"/></svg></a>
        <a href="mailto:${config.supportEmail}" aria-label="Email Trump Offers">${icon('mail')}</a>
      </div>
    </div>
    <div class="footer-disclaimer">
      Trump Offers is a rewards and membership platform. Membership, rewards and digital cards are subject to our terms and security checks.
    </div>
  </div>
  <div class="footer-wordmark" aria-hidden="true">TRUMP</div>`;
}

function updateMobileAccount(session) {
  const foot = $('[data-mobile-account]');
  if (!foot) return;
  if (!session) {
    foot.innerHTML = `<a class="btn btn--gold btn--block" href="register.html">Create your account</a>
      <a class="btn btn--ghost btn--block mt-2" href="login.html">Sign in</a>
      <div class="mobile-nav__meta"><span>${escapeHTML(config.supportEmail)}</span><span>New York · London</span></div>`;
  } else {
    foot.innerHTML = `<a class="btn btn--gold btn--block" href="dashboard.html">Open dashboard</a>
      <button class="btn btn--ghost btn--block mt-2" data-sign-out>Sign out</button>
      <div class="mobile-nav__meta"><span>${escapeHTML(session.profile.full_name)}</span><span>${escapeHTML(session.profile.email)}</span></div>`;
  }
}

function signOutHandler() {
  document.addEventListener('click', async (e) => {
    const trigger = e.target.closest('[data-sign-out]');
    if (!trigger) return;
    e.preventDefault();
    try {
      const api = await getApi();
      await api.auth.signOut();
    } catch (error) {
      console.warn(error);
    }
    location.href = 'index.html';
  });
}

export async function initHeader() {
  const host = $('#site-header');
  if (!host) return;
  const page = document.body.dataset.page || '';
  host.innerHTML = `<header class="site-header ${document.body.dataset.headerSolid === 'true' ? 'is-solid' : ''}">
    <div class="site-header__inner">
      ${brandHTML('index.html')}
      <nav class="site-nav" aria-label="Primary navigation">${navHTML(page)}</nav>
      <div class="site-header__actions" data-header-actions>
        <a class="header-signin" href="login.html">Sign in</a>
        <a class="btn btn--gold btn--sm" href="register.html">Join Trump ${icon('arrow-up-right')}</a>
        <button class="menu-toggle" id="menu-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </header>
  ${mobileNavHTML()}`;

  const header = $('.site-header');
  const toggle = $('#menu-toggle');
  const mobile = $('#mobile-nav');

  const onScroll = () => {
    if (window.scrollY > 24) header.classList.add('is-scrolled');
    else if (document.body.dataset.headerSolid !== 'true') header.classList.remove('is-scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const closeMobile = () => {
    if (!mobile) return;
    mobile.classList.remove('is-open');
    mobile.setAttribute('aria-hidden', 'true');
    toggle?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('no-scroll');
  };

  toggle?.addEventListener('click', () => {
    const open = !mobile.classList.contains('is-open');
    mobile.classList.toggle('is-open', open);
    mobile.setAttribute('aria-hidden', String(!open));
    toggle.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('no-scroll', open);
  });

  $$('#mobile-nav a').forEach((a) => a.addEventListener('click', closeMobile));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMobile();
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 900) closeMobile();
  });

  // Desktop dropdown accessibility
  $$('[data-drop-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const drop = btn.closest('.nav-drop');
      const open = drop.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', String(open));
    });
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-drop')) {
      $$('.nav-drop.is-open').forEach((d) => {
        d.classList.remove('is-open');
        $('[data-drop-toggle]', d)?.setAttribute('aria-expanded', 'false');
      });
    }
    if (!e.target.closest('.header-account')) {
      $('[data-account-menu]')?.classList.remove('is-open');
      $('[data-account-toggle]')?.setAttribute('aria-expanded', 'false');
    }
  });

  const session = await currentUser();
  const actions = $('[data-header-actions]');
  if (actions) {
    actions.innerHTML = accountActionsHTML(session);
    const menuBtn = actions.querySelector('[data-account-toggle]');
    menuBtn?.addEventListener('click', () => {
      const menu = $('[data-account-menu]');
      const open = menu.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', String(open));
    });
    const menuToggle = actions.querySelector('#menu-toggle');
    menuToggle?.addEventListener('click', () => toggle?.click());
  }
  updateMobileAccount(session);
  signOutHandler();
}

export async function initFooter() {
  const host = $('#site-footer');
  if (!host) return;
  host.className = 'site-footer';
  host.innerHTML = footerHTML();
  try {
    const api = await getApi();
    const settings = await api.getSettings();
    if (settings.support_email) {
      $$('[data-site-email]').forEach((a) => {
        a.href = `mailto:${settings.support_email}`;
        a.textContent = settings.support_email;
      });
    }
    if (settings.support_phone) {
      $$('[data-site-phone]').forEach((a) => {
        a.href = `tel:${String(settings.support_phone).replace(/[^+\d]/g, '')}`;
        a.textContent = settings.support_phone;
      });
    }
  } catch {
    /* Chrome should remain usable if settings are temporarily unavailable. */
  }
}
