/**
 * Trump Offers — homepage behaviour.
 */

import { getApi, currentUser } from '../lib/api.js';
import { $, $$, escapeHTML, formatCurrency, reveal, setupTilt } from '../lib/utils.js';
import { icon } from '../icons.js';

const INTRO_SEEN = 'to.intro.seen';

function salaryLabel(job) {
  return `${formatCurrency(job.salary_min)} – ${formatCurrency(job.salary_max)}`;
}

function jobRow(job) {
  return `<a class="job-row" href="job-details.html?slug=${encodeURIComponent(job.slug)}">
    <div>
      <div class="job-row__meta">
        <span>${escapeHTML(job.department)}</span>
        <span>${escapeHTML(job.location)} · ${escapeHTML(job.work_mode || 'Hybrid')}</span>
        <span>${escapeHTML(job.employment_type)}</span>
      </div>
      <div class="job-row__title">${escapeHTML(job.title)}</div>
    </div>
    <div class="job-row__side">
      <span class="job-row__salary">${salaryLabel(job)}</span>
      <span class="job-row__arrow">${icon('arrow-up-right')}</span>
    </div>
  </a>`;
}

async function loadJobs() {
  try {
    const api = await getApi();
    const jobs = await api.getJobs();
    const openCount = jobs.length;
    $$('[data-open-roles]').forEach((el) => {
      el.textContent = String(openCount).padStart(2, '0');
    });
    const featured = (jobs.filter((j) => j.featured).length >= 3 ? jobs.filter((j) => j.featured) : jobs).slice(0, 3);
    const host = $('[data-featured-jobs]');
    if (host && featured.length) {
      host.innerHTML = featured.map(jobRow).join('');
    }
  } catch (error) {
    console.warn('[Trump Offers] featured roles unavailable:', error.message);
  }
}

function initIntro(settings) {
  const intro = $('#intro');
  if (!intro) return;
  const video = $('#intro-video');
  const openBtn = $('[data-intro-open]');
  const progress = $('[data-intro-progress]');
  const soundBtn = $('[data-intro-sound]');
  const skipButtons = $$('[data-intro-skip]');
  let openedAt = 0;
  let failed = false;

  const enabled = settings?.intro_video_enabled !== false;
  const src = settings?.intro_video_url || 'assets/videos/trump-intro.mp4';

  if (!enabled && openBtn) openBtn.classList.add('hidden');

  function setLoader(pct) {
    if (progress) progress.style.width = `${Math.max(6, Math.min(100, pct))}%`;
  }

  function loadVideo() {
    if (video.dataset.loaded === 'true') return;
    video.dataset.loaded = 'true';
    video.src = src;
    video.load();
  }

  function close(destination) {
    if (!intro.classList.contains('is-open')) return;
    video.pause();
    intro.classList.remove('is-open');
    intro.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    sessionStorage.setItem(INTRO_SEEN, '1');
    if (destination) location.href = destination;
  }

  function afterFilm() {
    const next = sessionStorage.getItem('to.next') || 'dashboard.html';
    sessionStorage.removeItem('to.next');
    close(next);
  }

  function fallback() {
    failed = true;
    intro.classList.add('has-fallback');
    intro.classList.add('is-ready');
    video.pause();
  }

  async function start() {
    intro.classList.add('is-open');
    intro.setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    openedAt = Date.now();
    loadVideo();
    setLoader(12);
    // Attempt muted autoplay; browsers that block it show a retry control.
    video.muted = true;
    video.currentTime = 0;
    try {
      await video.play();
      video.muted = false;
      video.volume = 0.65;
      updateSound(true);
    } catch {
      video.muted = true;
      updateSound(false);
      // Keep the film ready; the browser will allow a tap to start it.
      intro.classList.add('is-ready');
    }
    setTimeout(() => {
      if (!video.paused) intro.classList.add('is-ready');
    }, 700);
  }

  function updateSound(on) {
    if (!soundBtn) return;
    soundBtn.innerHTML = on
      ? `${icon('volume')}<span>Sound on</span>`
      : `${icon('mute')}<span>Sound off</span>`;
    soundBtn.setAttribute('aria-label', on ? 'Mute film' : 'Unmute film');
  }

  video?.addEventListener('loadeddata', () => {
    setLoader(80);
    if (!failed) intro.classList.add('is-ready');
  });
  video?.addEventListener('canplay', () => setLoader(100));
  video?.addEventListener('progress', () => {
    if (video.buffered.length && video.duration) {
      setLoader((video.buffered.end(video.buffered.length - 1) / video.duration) * 100);
    }
  });
  video?.addEventListener('playing', () => {
    intro.classList.remove('has-fallback');
    setTimeout(() => intro.classList.add('is-ready'), 280);
  });
  video?.addEventListener('ended', afterFilm);
  video?.addEventListener('error', fallback);

  // If the browser refuses audio after muted autoplay, any click enables it.
  video?.addEventListener('click', () => {
    if (video.muted) {
      video.muted = false;
      updateSound(true);
    }
  });

  openBtn?.addEventListener('click', start);
  skipButtons.forEach((b) => b.addEventListener('click', () => close('')));
  soundBtn?.addEventListener('click', () => {
    video.muted = !video.muted;
    if (!video.muted) video.volume = 0.65;
    updateSound(!video.muted);
    if (video.paused) video.play().catch(() => {});
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && intro.classList.contains('is-open')) close('');
  });

  // Grace period: if the file never produces metadata, offer the fallback.
  setTimeout(() => {
    if (intro.classList.contains('is-open') && video.readyState === 0) fallback();
  }, 9000);

  if (enabled && settings?.intro_autoplay === true && !sessionStorage.getItem(INTRO_SEEN)) {
    setTimeout(start, 900);
  }
}

async function boot() {
  setupTilt();
  const api = await getApi();
  let settings = {};
  try {
    settings = await api.getSettings();
  } catch (error) {
    console.warn('[Trump Offers] settings unavailable:', error.message);
  }
  initIntro(settings);
  loadJobs();
  reveal();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
