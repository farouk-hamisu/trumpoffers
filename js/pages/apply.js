/**
 * Trump Offers — job application form.
 */

import { getApi, currentUser } from '../lib/api.js';
import {
  $,
  escapeHTML,
  formatCurrency,
  formatDate,
  validateEmail,
  validatePhone,
  fieldError,
  clearFormErrors,
  bindFieldClearing,
  focusFirstError,
  setLoading,
  fileSize,
  copyText,
  toast,
  getParam,
} from '../lib/utils.js';
import { icon } from '../icons.js';

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ['.pdf', '.doc', '.docx'];

let job = null;
let file = null;

function showAlert(message, type = 'error') {
  const host = $('[data-apply-alert]');
  if (!host) return;
  host.innerHTML = message
    ? `<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${icon(
        type === 'error' ? 'alert-triangle' : 'check-circle'
      )}<div>${escapeHTML(message)}</div></div>`
    : '';
}

function fileExt(name = '') {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

function setFile(next) {
  file = next;
  const input = $('#resume-input');
  const row = $('#upload-file');
  const name = $('[data-file-name]');
  const zone = $('#upload-zone');
  if (!next) {
    if (input) input.value = '';
    row?.classList.remove('is-visible');
    zone?.classList.remove('is-dragover');
    return;
  }
  if (name) name.textContent = `${next.name} · ${fileSize(next.size)}`;
  row?.classList.add('is-visible');
}

function validateFile(candidate) {
  if (!candidate) return 'Please attach your resume.';
  if (!ALLOWED.includes(fileExt(candidate.name))) return 'Attach a PDF, DOC or DOCX file.';
  if (candidate.size > MAX_BYTES) return 'Your resume must be 5 MB or smaller.';
  return '';
}

async function loadJob() {
  const slug = getParam('job');
  const host = $('[data-apply-job]');
  if (!slug) {
    job = null;
  } else {
    try {
      const api = await getApi();
      job = await api.getJobBySlug(slug);
    } catch (error) {
      console.warn(error);
    }
  }
  if (!job) {
    $('.apply-layout')?.remove();
    const success = $('#apply-success');
    if (success) success.hidden = true;
    const container = $('.container', $('#main'));
    if (container) {
      container.innerHTML = `<div class="missing-state">
        ${icon('briefcase')}
        <h1>Choose a role first.</h1>
        <p>The application form is linked to a specific open role. Browse the current opportunities and select one to begin.</p>
        <a class="btn btn--gold btn--sm" href="careers.html">View open roles</a>
      </div>`;
    }
    return false;
  }
  document.title = `Apply · ${job.title} — Trump Offers`;
  if (host) {
    host.innerHTML = `
      <p class="eyebrow">Now applying</p>
      <h2>${escapeHTML(job.title)}</h2>
      <div class="apply-job-card__meta">
        <div><span>Department</span><strong>${escapeHTML(job.department)}</strong></div>
        <div><span>Location</span><strong>${escapeHTML(job.location)}</strong></div>
        <div><span>Work mode</span><strong>${escapeHTML(job.work_mode || 'Hybrid')}</strong></div>
        <div><span>Employment</span><strong>${escapeHTML(job.employment_type)}</strong></div>
        <div><span>Salary</span><strong>${formatCurrency(job.salary_min)} – ${formatCurrency(job.salary_max)}</strong></div>
        <div><span>Closes</span><strong>${job.deadline ? formatDate(`${job.deadline}T12:00:00`, { short: true }) : 'Open until filled'}</strong></div>
      </div>
      <a class="link-arrow" href="job-details.html?slug=${encodeURIComponent(job.slug)}" style="margin-top:20px">Read the full role ${icon('arrow-up-right')}</a>`;
  }
  return true;
}

async function boot() {
  const ok = await loadJob();
  if (!ok) return;

  const session = await currentUser();
  const form = $('#apply-form');
  bindFieldClearing(form);
  if (session?.profile) {
    form.elements.fullName.value = session.profile.full_name || '';
    form.elements.email.value = session.profile.email || '';
    form.elements.phone.value = session.profile.phone || '';
    form.elements.location.value = session.profile.location || '';
  }

  const input = $('#resume-input');
  const zone = $('#upload-zone');

  input?.addEventListener('change', () => {
    const candidate = input.files?.[0] || null;
    const error = validateFile(candidate);
    if (error && candidate) {
      toast(error, 'error');
      setFile(null);
      return;
    }
    setFile(candidate);
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    zone?.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.add('is-dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    zone?.addEventListener(evt, (e) => {
      e.preventDefault();
      zone.classList.remove('is-dragover');
    })
  );
  zone?.addEventListener('drop', (e) => {
    const candidate = e.dataTransfer?.files?.[0];
    const error = validateFile(candidate);
    if (error) {
      if (candidate) toast(error, 'error');
      return;
    }
    setFile(candidate);
  });

  $('#remove-file')?.addEventListener('click', () => setFile(null));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormErrors(form);
    showAlert('');
    const values = {
      fullName: form.elements.fullName.value.trim(),
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      location: form.elements.location.value.trim(),
      qualifications: form.elements.qualifications.value.trim(),
      experience: form.elements.experience.value.trim(),
    };
    let valid = true;
    if (values.fullName.length < 2) {
      fieldError(form.elements.fullName, 'Enter your full name.');
      valid = false;
    }
    if (!validateEmail(values.email)) {
      fieldError(form.elements.email, 'Enter a valid email address.');
      valid = false;
    }
    if (!validatePhone(values.phone)) {
      fieldError(form.elements.phone, 'Enter a valid phone number.');
      valid = false;
    }
    if (!values.location) {
      fieldError(form.elements.location, 'Enter your location.');
      valid = false;
    }
    if (!values.qualifications) {
      fieldError(form.elements.qualifications, 'Add your qualifications.');
      valid = false;
    }
    if (values.experience.length < 40) {
      fieldError(form.elements.experience, 'Add a little more detail — at least a few sentences.');
      valid = false;
    }
    const fileError = validateFile(file);
    if (fileError) {
      fieldError(input, fileError);
      valid = false;
    }
    if (!form.elements.consent.checked) {
      fieldError(form.elements.consent, 'Please confirm your consent to continue.');
      valid = false;
    }
    if (!valid) {
      focusFirstError(form);
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    setLoading(button, true, 'Submitting application');
    try {
      const api = await getApi();
      const result = await api.submitApplication({
        vacancyId: job.id,
        vacancySlug: job.slug,
        ...values,
        file,
        resumeName: file.name,
        resumeMime: file.type || 'application/octet-stream',
        resumeSize: file.size,
      });
      const reference = result.reference || result.application?.reference;
      $('.apply-layout').hidden = true;
      const success = $('#apply-success');
      success.hidden = false;
      $('[data-apply-ref]').textContent = reference;
      const trackLink = $('[data-track-link]');
      if (trackLink) trackLink.href = `track.html?ref=${encodeURIComponent(reference)}&email=${encodeURIComponent(values.email)}`;
      $('[data-apply-copy]')?.addEventListener('click', () => copyText(reference));
      success.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('Application received.', 'success');
    } catch (error) {
      showAlert(error.message || 'We could not submit your application.');
      setLoading(button, false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
