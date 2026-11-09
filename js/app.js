/**
 * Trump Offers — application bootstrap.
 */

import { initHeader, initFooter } from './components.js';
import { initModals, reveal, setupAccordion, setupCopyButtons, setupTilt, $$ } from './lib/utils.js';

async function boot() {
  document.documentElement.classList.add('js');
  initModals();
  setupAccordion();
  setupCopyButtons();

  await Promise.allSettled([initHeader(), initFooter()]);
  setupTilt();
  reveal();

  $$('[data-year]').forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  document.body.classList.add('is-ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

export { reveal };
