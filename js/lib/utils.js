/**
 * Trump Offers — shared utilities.
 */

import { icon } from '../icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatCurrency(amount, opts = {}) {
  const n = Number(amount || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  }).format(n);
}

export function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(Number(n || 0));
}

export function formatDate(value, opts = {}) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: opts.short ? 'short' : 'long',
    day: 'numeric',
    year: 'numeric',
    ...opts,
  }).format(d);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)} · ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(d)}`;
}

export function timeAgo(value) {
  if (!value) return '';
  const d = new Date(value);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 45) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(value, { short: true });
}

export function futureLabel(value) {
  if (!value) return '—';
  const ms = new Date(value).getTime() - Date.now();
  if (ms <= 0) return 'Due now';
  const hours = Math.round(ms / 3600000);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

export function initials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase() || 'HO';
}

export function maskCardNumber(number = '') {
  const clean = String(number).replace(/\s+/g, '');
  if (clean.length < 8) return '•••• •••• •••• ••••';
  return `${clean.slice(0, 4)} •••• •••• ${clean.slice(-4)}`;
}

export function groupCardNumber(number = '') {
  return String(number).replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

export const STATUS = {
  claim: {
    confirmed: { label: 'Confirmed', tone: 'plain' },
    verifying: { label: 'Verifying', tone: 'warning' },
    processing: { label: 'Processing', tone: 'info' },
    completed: { label: 'Completed', tone: 'success' },
    cancelled: { label: 'Cancelled', tone: 'danger' },
  },
  withdrawal: {
    pending: { label: 'Pending', tone: 'warning' },
    reviewing: { label: 'Under review', tone: 'info' },
    approved: { label: 'Approved', tone: 'info' },
    processing: { label: 'Processing', tone: 'info' },
    completed: { label: 'Completed', tone: 'success' },
    rejected: { label: 'Rejected', tone: 'danger' },
    cancelled: { label: 'Cancelled', tone: 'plain' },
  },
  application: {
    submitted: { label: 'Submitted', tone: 'plain' },
    under_review: { label: 'Under review', tone: 'warning' },
    shortlisted: { label: 'Shortlisted', tone: 'info' },
    interview: { label: 'Interview', tone: 'info' },
    accepted: { label: 'Accepted', tone: 'success' },
    rejected: { label: 'Not selected', tone: 'danger' },
  },
  card: {
    submitted: { label: 'Submitted', tone: 'plain' },
    under_review: { label: 'Under review', tone: 'warning' },
    approved: { label: 'Approved', tone: 'success' },
    rejected: { label: 'Declined', tone: 'danger' },
  },
  user: {
    active: { label: 'Active', tone: 'success' },
    suspended: { label: 'Suspended', tone: 'danger' },
  },
  message: {
    new: { label: 'New', tone: 'warning' },
    read: { label: 'Read', tone: 'plain' },
    archived: { label: 'Archived', tone: 'plain' },
  },
  job: {
    open: { label: 'Open', tone: 'success' },
    draft: { label: 'Draft', tone: 'plain' },
    closed: { label: 'Closed', tone: 'plain' },
  },
  paymentCard: {
    active: { label: 'Active', tone: 'success' },
    revoked: { label: 'Revoked', tone: 'danger' },
  },
};

export function statusMeta(type, value) {
  return (STATUS[type] && STATUS[type][value]) || { label: value || '—', tone: 'plain' };
}

export function badge(type, value) {
  const meta = statusMeta(type, value);
  const tone = meta.tone === 'plain' ? '' : ` badge--${meta.tone}`;
  return `<span class="badge${tone}">${escapeHTML(meta.label)}</span>`;
}

export function humanize(value = '') {
  return String(value)
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(String(email || '').trim());
}

export function validatePhone(phone) {
  return /^[+()\d\s.-]{7,24}$/.test(String(phone || '').trim());
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function randomId(prefix = 'to') {
  if (crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getParam(name) {
  return new URLSearchParams(location.search).get(name);
}

export function setParam(name, value) {
  const url = new URL(location.href);
  url.searchParams.set(name, value);
  history.replaceState({}, '', url);
}

export function safeNext(value, fallback = 'dashboard.html') {
  if (!value) return fallback;
  if (/^(https?:)?\/\//i.test(value) || value.startsWith('javascript:')) return fallback;
  return value;
}

/* --------------------------------------------------------------------------
   Toasts
   -------------------------------------------------------------------------- */

function toastStack() {
  let stack = $('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    stack.setAttribute('role', 'status');
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  return stack;
}

export function toast(message, type = 'info', timeout = 4600) {
  const stack = toastStack();
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<span class="toast__icon">${icon(type === 'error' ? 'alert-triangle' : type === 'success' ? 'check-circle' : 'info')}</span><div>${escapeHTML(message)}</div>`;
  stack.appendChild(el);
  window.setTimeout(() => {
    el.classList.add('is-out');
    window.setTimeout(() => el.remove(), 320);
  }, timeout);
}

/* --------------------------------------------------------------------------
   Modals
   -------------------------------------------------------------------------- */

export function openModal(id) {
  const modal = typeof id === 'string' ? document.getElementById(id) : id;
  if (!modal) return null;
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  const focusable = modal.querySelector('input, select, textarea, button, a[href]');
  if (focusable) window.setTimeout(() => focusable.focus(), 100);
  return modal;
}

export function closeModal(id) {
  const modal = typeof id === 'string' ? document.getElementById(id) : id;
  if (!modal) return;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  if (!document.querySelector('.modal.is-open')) document.body.classList.remove('no-scroll');
}

export function initModals(root = document) {
  $$('.modal', root).forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target.closest('[data-modal-close]') || e.target.classList.contains('modal__backdrop')) {
        closeModal(modal);
      }
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const open = $('.modal.is-open');
      if (open) closeModal(open);
    }
  });
}

/* --------------------------------------------------------------------------
   Forms
   -------------------------------------------------------------------------- */

export function fieldError(input, message) {
  if (!input) return;
  const field = input.closest('.field');
  if (!field) return;
  field.classList.add('has-error');
  input.setAttribute('aria-invalid', 'true');
  let error = field.querySelector('.field__error');
  if (!error) {
    error = document.createElement('span');
    error.className = 'field__error';
    field.appendChild(error);
  }
  error.textContent = message;
}

export function clearFieldError(input) {
  if (!input) return;
  const field = input.closest('.field');
  if (!field) return;
  field.classList.remove('has-error');
  input.removeAttribute('aria-invalid');
}

export function clearFormErrors(form) {
  $$('.field.has-error', form).forEach((f) => f.classList.remove('has-error'));
  $$('[aria-invalid]', form).forEach((f) => f.removeAttribute('aria-invalid'));
}

export function bindFieldClearing(form) {
  if (!form) return;
  form.addEventListener('input', (e) => {
    if (e.target.matches('input, select, textarea')) clearFieldError(e.target);
  });
}

export function validateRequired(form, fields) {
  let valid = true;
  fields.forEach(({ name, message = 'This field is required.' }) => {
    const input = form.elements.namedItem(name);
    if (!input) return;
    const value = String(input.value || '').trim();
    if (!value) {
      fieldError(input, message);
      valid = false;
    }
  });
  return valid;
}

export function setLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    button.dataset.label = button.innerHTML;
    button.classList.add('btn--loading');
    button.disabled = true;
    if (label) {
      button.innerHTML = label;
    }
  } else {
    button.classList.remove('btn--loading');
    button.disabled = false;
    if (button.dataset.label) {
      button.innerHTML = button.dataset.label;
      delete button.dataset.label;
    }
  }
}

export function formData(form) {
  const data = {};
  const fd = new FormData(form);
  for (const [key, value] of fd.entries()) data[key] = value;
  return data;
}

export function focusFirstError(form) {
  const first = form.querySelector('.field.has-error input, .field.has-error select, .field.has-error textarea');
  if (first) first.focus();
}

/* --------------------------------------------------------------------------
   Misc UI
   -------------------------------------------------------------------------- */

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Reference copied to clipboard.', 'success');
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    toast('Reference copied to clipboard.', 'success');
  }
}

export function fileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function downloadText(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function animateCount(el, target, duration = 1400) {
  if (!el) return;
  if (prefersReducedMotion()) {
    el.textContent = target;
    return;
  }
  const start = performance.now();
  const from = 0;
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * eased).toLocaleString('en-US');
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

export function reveal(root = document) {
  const items = $$('[data-reveal]', root);
  if (!items.length) return;
  if (prefersReducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );
  items.forEach((el, i) => {
    if (!el.style.getPropertyValue('--reveal-delay')) {
      el.style.setProperty('--reveal-delay', `${(i % 4) * 70}ms`);
    }
    observer.observe(el);
  });
}

export function setupAccordion(root = document) {
  $$('[data-accordion]', root).forEach((accordion) => {
    const buttons = $$('.accordion__btn', accordion);
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.accordion__item');
        const open = item.classList.contains('is-open');
        $$('.accordion__item', accordion).forEach((i) => {
          i.classList.remove('is-open');
          const b = $('.accordion__btn', i);
          if (b) b.setAttribute('aria-expanded', 'false');
        });
        if (!open) {
          item.classList.add('is-open');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  });
}

export function setupTilt(root = document) {
  const cards = $$('[data-tilt]', root);
  cards.forEach((card) => {
    if (card.dataset.tiltBound) return;
    card.dataset.tiltBound = '1';
    const max = 9;
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || prefersReducedMotion()) return;
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const ry = (px - 0.5) * max * 2;
      const rx = (0.5 - py) * max * 2;
      card.style.setProperty('--rotate-x', `${rx}deg`);
      card.style.setProperty('--rotate-y', `${ry}deg`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.setProperty('--rotate-x', '0deg');
      card.style.setProperty('--rotate-y', '0deg');
    });
    card.addEventListener('click', (e) => {
      if (e.target.closest('button, a')) return;
      card.classList.toggle('is-flipped');
    });
  });
}

export function setupCopyButtons(root = document) {
  $$('[data-copy]', root).forEach((btn) => {
    btn.addEventListener('click', () => copyText(btn.dataset.copy));
  });
}

export function setupAlertDismiss(root = document) {
  $$('[data-dismiss]', root).forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('[data-alert]')?.remove());
  });
}

export function iconHTML(name, cls) {
  return icon(name, cls);
}
