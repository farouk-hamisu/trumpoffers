/**
 * Trump Offers — single vacancy.
 */

import { getApi } from '../lib/api.js';
import { $, escapeHTML, formatCurrency, formatDate, getParam, toast } from '../lib/utils.js';
import { icon } from '../icons.js';

function paragraphs(text = '') {
  return String(text)
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((p) => `<p>${escapeHTML(p)}</p>`)
    .join('');
}

function list(items = []) {
  if (!items?.length) return '';
  return `<ul>${items.map((i) => `<li>${escapeHTML(i)}</li>`).join('')}</ul>`;
}

function missing() {
  const main = $('#main');
  if (!main) return;
  main.innerHTML = `<div class="missing-state">
    ${icon('briefcase')}
    <h1>This role is no longer listed.</h1>
    <p>It may have been filled or withdrawn. Explore the current opportunities or introduce yourself to our team.</p>
    <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:24px">
      <a class="btn btn--gold btn--sm" href="careers.html">View open roles</a>
      <a class="btn btn--ghost btn--sm" href="contact.html">Contact us</a>
    </div>
  </div>`;
}

async function boot() {
  const slug = getParam('slug');
  if (!slug) {
    missing();
    return;
  }
  let job = null;
  try {
    const api = await getApi();
    job = await api.getJobBySlug(slug);
  } catch (error) {
    console.warn('[Trump Offers] role unavailable:', error.message);
  }
  if (!job || job.status !== 'open') {
    missing();
    return;
  }

  document.title = `${job.title} — Trump Offers`;

  const title = $('[data-job-title]');
  if (title) title.innerHTML = `${escapeHTML(job.title.split(' ').slice(0, -1).join(' '))} <em>${escapeHTML(job.title.split(' ').slice(-1)[0] || '')}</em>`;
  const crumb = $('[data-job-crumb]');
  if (crumb) crumb.textContent = job.title;
  const dept = $('[data-job-dept]');
  if (dept) dept.textContent = `${job.department} · ${job.location}`;
  const summary = $('[data-job-summary]');
  if (summary) summary.textContent = job.summary;

  const body = $('[data-job-body]');
  if (body) {
    body.innerHTML = `
      <h2>About the role</h2>
      ${paragraphs(job.description)}
      ${job.responsibilities?.length ? `<h2>What you will do</h2>${list(job.responsibilities)}` : ''}
      ${job.requirements?.length ? `<h2>What we are looking for</h2>${list(job.requirements)}` : ''}
      ${job.benefits?.length ? `<h2>What we offer</h2>${list(job.benefits)}` : ''}
      <div class="legal-callout">
        This is a demonstration vacancy within the Trump Offers platform. The role, salary and process are illustrative. No employment offer is guaranteed by submitting an application.
      </div>`;
  }

  const side = $('[data-job-side]');
  if (side) {
    side.innerHTML = `
      <div class="job-side__title">${escapeHTML(job.title)}</div>
      <div class="job-side__rows">
        <div class="job-side__row"><span>Department</span><strong>${escapeHTML(job.department)}</strong></div>
        <div class="job-side__row"><span>Location</span><strong>${escapeHTML(job.location)}</strong></div>
        <div class="job-side__row"><span>Work mode</span><strong>${escapeHTML(job.work_mode || 'Hybrid')}</strong></div>
        <div class="job-side__row"><span>Employment</span><strong>${escapeHTML(job.employment_type)}</strong></div>
        <div class="job-side__row"><span>Salary</span><strong>${formatCurrency(job.salary_min)} – ${formatCurrency(job.salary_max)}</strong></div>
        <div class="job-side__row"><span>Closes</span><strong>${job.deadline ? formatDate(`${job.deadline}T12:00:00`, { short: true }) : 'Open until filled'}</strong></div>
      </div>
      <a class="btn btn--gold btn--block" href="apply.html?job=${encodeURIComponent(job.slug)}">Apply for this role ${icon('arrow-up-right')}</a>
      <p class="job-side__note">Applications receive a unique reference and a three to four business-day review estimate.</p>
      <div class="job-side__share">
        <span>Share this role</span>
        <button type="button" data-share>Copy link</button>
      </div>`;
    side.querySelector('[data-share]')?.addEventListener('click', async () => {
      const url = location.href;
      try {
        if (navigator.share) {
          await navigator.share({ title: job.title, text: job.summary, url });
        } else {
          await navigator.clipboard.writeText(url);
          toast('Role link copied.', 'success');
        }
      } catch {
        toast('Copy the address from your browser to share this role.', 'info');
      }
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
