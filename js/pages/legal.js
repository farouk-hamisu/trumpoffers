/**
 * Trump Offers — legal pages: scroll-spy for the section navigation.
 */

import { $$ } from '../lib/utils.js';

function boot() {
  const links = $$('[data-legal-nav] a');
  if (!links.length || !('IntersectionObserver' in window)) return;

  const map = new Map();
  links.forEach((link) => {
    const id = link.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (target) map.set(target, link);
  });
  if (!map.size) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((l) => l.classList.remove('is-active'));
        map.get(entry.target)?.classList.add('is-active');
      });
    },
    { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
  );

  map.forEach((_, target) => observer.observe(target));
  links[0]?.classList.add('is-active');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
