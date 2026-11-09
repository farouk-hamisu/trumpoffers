/**
 * Trump Offers — careers directory.
 */

import { getApi } from '../lib/api.js';
import { $, $$, escapeHTML, formatCurrency, getParam } from '../lib/utils.js';
import { icon } from '../icons.js';

let jobs = [];
const filters = { dept: 'all', mode: 'all', type: 'all', q: '' };

function salary(job) {
  return `${formatCurrency(job.salary_min)} – ${formatCurrency(job.salary_max)}`;
}

function deadlineLabel(job) {
  if (!job.deadline) return '';
  return `Closes ${new Date(`${job.deadline}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

function featuredHTML(job) {
  return `<article class="featured-job" data-reveal>
    <div class="featured-job__media">
      <img src="assets/images/interview-800.webp" srcset="assets/images/interview-800.webp 800w, assets/images/interview-1600.webp 1600w" sizes="(max-width: 760px) 100vw, 55vw" alt="An interview in progress at Trump Offers" width="800" height="533" loading="lazy">
    </div>
    <div class="featured-job__body">
      <span class="featured-job__flag">Featured role</span>
      <p class="eyebrow" style="color:var(--gold)">${escapeHTML(job.department)}</p>
      <h2><a href="job-details.html?slug=${encodeURIComponent(job.slug)}">${escapeHTML(job.title)}</a></h2>
      <div class="featured-job__meta">
        <span>${icon('pin')}${escapeHTML(job.location)}</span>
        <span>${icon('briefcase')}${escapeHTML(job.work_mode || 'Hybrid')}</span>
        <span>${icon('clock')}${escapeHTML(job.employment_type)}</span>
      </div>
      <p>${escapeHTML(job.summary)}</p>
      <div class="featured-job__actions">
        <a class="btn btn--gold btn--sm" href="job-details.html?slug=${encodeURIComponent(job.slug)}">View role ${icon('arrow-up-right')}</a>
        <span class="featured-job__salary">${salary(job)} per annum</span>
      </div>
    </div>
  </article>`;
}

function jobHTML(job) {
  return `<article class="job-card" data-reveal>
    <div>
      <div class="job-card__top">
        <span class="dept">${escapeHTML(job.department)}</span>
        <span>${escapeHTML(job.location)}</span>
        <span>${escapeHTML(job.work_mode || 'Hybrid')}</span>
        <span>${escapeHTML(job.employment_type)}</span>
      </div>
      <h3 class="job-card__title"><a href="job-details.html?slug=${encodeURIComponent(job.slug)}">${escapeHTML(job.title)}</a></h3>
      <p class="job-card__summary">${escapeHTML(job.summary)}</p>
      <div class="job-card__tags">
        <span class="tag">${escapeHTML(job.department)}</span>
        <span class="tag">${escapeHTML(job.work_mode || 'Hybrid')}</span>
      </div>
    </div>
    <div class="job-card__side">
      <div>
        <div class="job-card__salary">${salary(job)}<small>Per annum · USD</small></div>
        <div class="job-card__deadline" style="text-align:right;margin-top:6px">${deadlineLabel(job)}</div>
      </div>
      <a class="job-card__apply" href="job-details.html?slug=${encodeURIComponent(job.slug)}">View &amp; apply ${icon('arrow-right')}</a>
    </div>
  </article>`;
}

function matches(job) {
  if (filters.dept !== 'all' && job.department !== filters.dept) return false;
  if (filters.mode !== 'all' && (job.work_mode || '') !== filters.mode) return false;
  if (filters.type !== 'all' && job.employment_type !== filters.type) return false;
  if (filters.q) {
    const haystack = `${job.title} ${job.department} ${job.location} ${job.summary}`.toLowerCase();
    if (!haystack.includes(filters.q.toLowerCase())) return false;
  }
  return true;
}

function renderChips() {
  const host = $('[data-careers-departments]');
  if (!host) return;
  const departments = [...new Set(jobs.map((j) => j.department))].sort();
  host.innerHTML =
    `<button class="filter-chip${filters.dept === 'all' ? ' is-active' : ''}" type="button" data-dept="all">All roles <span style="opacity:.55">${jobs.length}</span></button>` +
    departments
      .map((dept) => {
        const count = jobs.filter((j) => j.department === dept).length;
        return `<button class="filter-chip${filters.dept === dept ? ' is-active' : ''}" type="button" data-dept="${escapeHTML(dept)}">${escapeHTML(dept)} <span style="opacity:.55">${count}</span></button>`;
      })
      .join('');
  $$('[data-dept]', host).forEach((btn) =>
    btn.addEventListener('click', () => {
      filters.dept = btn.dataset.dept;
      renderChips();
      render();
    })
  );
}

function render() {
  const listHost = $('[data-careers-list]');
  const featuredHost = $('[data-careers-featured]');
  if (!listHost) return;
  const filtered = jobs.filter(matches);
  const isDefault = filters.dept === 'all' && filters.mode === 'all' && filters.type === 'all' && !filters.q;
  const featured = isDefault ? jobs.find((j) => j.featured) : null;

  if (featuredHost) featuredHost.innerHTML = featured ? featuredHTML(featured) : '';
  const listed = featured ? filtered.filter((j) => j.id !== featured.id) : filtered;

  if (!listed.length && !featured) {
    listHost.innerHTML = `<div class="empty" style="border-color:var(--line-ink)">
      <div class="empty__title" style="color:var(--ink-text)">No roles match that search</div>
      <p class="empty__text" style="color:var(--ink-faint)">Try a broader department, work mode or location — or write to our team directly.</p>
      <a class="btn btn--outline-dark btn--sm" href="contact.html" style="margin-top:18px">Contact us</a>
    </div>`;
    return;
  }
  listHost.innerHTML = listed.map(jobHTML).join('');
  if (!listed.length) {
    listHost.innerHTML = `<div class="empty" style="border-color:var(--line-ink)">
      <p class="empty__text" style="color:var(--ink-faint)">That is the only open role in this selection. Use “All roles” to see everything.</p>
    </div>`;
  }
}

async function boot() {
  const api = await getApi();
  try {
    jobs = await api.getJobs();
  } catch (error) {
    console.warn('[Trump Offers] roles unavailable:', error.message);
    const list = $('[data-careers-list]');
    if (list) {
      list.innerHTML = `<div class="empty" style="border-color:var(--line-ink)"><div class="empty__title" style="color:var(--ink-text)">Roles are temporarily unavailable</div><p class="empty__text" style="color:var(--ink-faint)">Please try again shortly or contact the concierge desk.</p></div>`;
    }
    return;
  }

  $$('[data-open-roles]').forEach((el) => (el.textContent = String(jobs.length).padStart(2, '0')));
  renderChips();
  render();

  $('#filter-mode')?.addEventListener('change', (e) => {
    filters.mode = e.target.value;
    render();
  });
  $('#filter-type')?.addEventListener('change', (e) => {
    filters.type = e.target.value;
    render();
  });
  let t;
  $('#careers-search-input')?.addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => {
      filters.q = e.target.value.trim();
      render();
    }, 180);
  });

  if (getParam('dept')) {
    filters.dept = getParam('dept');
    renderChips();
    render();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
