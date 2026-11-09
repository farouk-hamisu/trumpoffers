/**
 * Trump Offers — inline icon set.
 * Consistent 24px grid, 1.5 stroke, currentColor.
 */

const P = {
  'arrow-right': '<path d="M4 12h15M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M20 12H5M11 18l-6-6 6-6"/>',
  'arrow-up-right': '<path d="M7 17 17 7M8 7h9v9"/>',
  'arrow-down': '<path d="M12 4v15M6 13l6 6 6-6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'chevron-left': '<path d="m15 6-6 6 6 6"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="1"/><path d="M3.5 10h17M8 3v5M16 3v5"/>',
  pin: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.4"/>',
  briefcase: '<rect x="3" y="7.5" width="18" height="12.5" rx="1"/><path d="M8.5 7.5V5h7v2.5M3 12.5h18M10.5 12.5v2h3v-2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  dollar: '<path d="M12 3v18M16 7.5c0-1.7-1.8-3-4-3s-4 1.1-4 2.8c0 2 2 2.8 4 3.2s4 1.2 4 3.2-1.8 2.8-4 2.8-4-1.3-4-3"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="m8 12.2 2.6 2.6 5.4-5.6"/>',
  shield: '<path d="M12 21s7-3.2 7-9V5l-7-2.5L5 5v7c0 5.8 7 9 7 9Z"/><path d="m9 11.5 2 2 4-4.5"/>',
  card: '<rect x="2.5" y="5.5" width="19" height="13" rx="1.5"/><path d="M2.5 9.5h19M6 15h4"/>',
  wallet: '<path d="M4 7.5h15a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H4A1.5 1.5 0 0 1 2.5 18V6A1.5 1.5 0 0 1 4 4.5h12"/><path d="M15.5 13h4"/>',
  bell: '<path d="M18 8.5a6 6 0 0 0-12 0c0 6-2.5 7.5-2.5 7.5h17S18 14.5 18 8.5Z"/><path d="M10 19.5a2.2 2.2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M2.8 19.5a6.2 6.2 0 0 1 12.4 0M16 5.6a3.1 3.1 0 0 1 0 6M17.8 14a5.4 5.4 0 0 1 3.4 5"/>',
  logout: '<path d="M9 4H4.5v16H9M15 8l4 4-4 4M19 12H9"/>',
  dashboard: '<rect x="3" y="3" width="7.5" height="7.5"/><rect x="13.5" y="3" width="7.5" height="7.5"/><rect x="3" y="13.5" width="7.5" height="7.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5"/>',
  gift: '<rect x="3.5" y="9" width="17" height="11.5" rx="1"/><path d="M2.5 6h19v3h-19zM12 6v14.5M12 6C10.5 2.5 6 3 6 5.4 6 7 9 6 12 6Zm0 0c1.5-3.5 6-3 6-.6C18 7 15 6 12 6Z"/>',
  chart: '<path d="M3.5 20.5h17M6.5 17V9M11.5 17V4.5M16.5 17v-6M21 17v-9"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
  file: '<path d="M6 2.5h8L19 7v14.5H6z"/><path d="M14 2.5V7h5M9 11h7M9 15h7M9 18h4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  video: '<rect x="2.5" y="5.5" width="14" height="13" rx="1.5"/><path d="m16.5 10 5-3v10l-5-3"/>',
  mail: '<rect x="2.5" y="5" width="19" height="14" rx="1"/><path d="m3 6 9 7 9-7"/>',
  'mail-open': '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="m3 10.5 9 6 9-6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V4H4v12h4"/>',
  plus: '<path d="M12 4v16M4 12h16"/>',
  edit: '<path d="M4 20h4L20 8l-4-4L4 16z"/><path d="m14.5 5.5 4 4"/>',
  trash: '<path d="M3.5 6.5h17M9 3.5h6M5.5 6.5l1 14h11l1-14M10 10.5v6M14 10.5v6"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.5 7.5A7.5 7.5 0 0 1 20 12M17.5 16.5A7.5 7.5 0 0 1 4 12"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
  volume: '<path d="M4 9.5h4l5-4v13l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M4 9.5h4l5-4v13l-5-4H4zM16 9l5 6M21 9l-5 6"/>',
  x: '<path d="M5 5l14 14M19 5 5 19"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  lock: '<rect x="4.5" y="10" width="15" height="10.5" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  upload: '<path d="M12 17V3M7 8l5-5 5 5M4 20h16"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 13v7H4V6h7"/>',
  bank: '<path d="M3 9.5 12 3l9 6.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18M2 18h20"/>',
  phone: '<path d="M7 3.5H4.5a1.5 1.5 0 0 0-1.5 1.6C3.6 14.2 9.8 20.4 18.9 21a1.5 1.5 0 0 0 1.6-1.5V17l-4.5-1.5-1.7 2a14.8 14.8 0 0 1-5.3-5.3l2-1.7z"/>',
  'alert-triangle': '<path d="M12 3.5 22 20H2z"/><path d="M12 9v4.5M12 17h.01"/>',
  sparkle: '<path d="M12 2.5c.5 5.4 4.1 9 9.5 9.5-5.4.5-9 4.1-9.5 9.5-.5-5.4-4.1-9-9.5-9.5 5.4-.5 9-4.1 9.5-9.5Z"/>',
  home: '<path d="M3.5 11 12 4l8.5 7v9.5H14V14h-4v6.5H3.5z"/>',
  award: '<circle cx="12" cy="9" r="5.5"/><path d="m8.5 14-1.5 7 5-2.5 5 2.5-1.5-7"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.3 4 5.3 4 8.5s-1.5 6.2-4 8.5c-2.5-2.3-4-5.3-4-8.5s1.5-6.2 4-8.5Z"/>',
  send: '<path d="m22 2-9 20-3-8-8-3z"/><path d="M22 2 10 14"/>',
  filter: '<path d="M3 4h18l-7 8v8l-4 2v-10z"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3v13H4z"/><circle cx="12" cy="13" r="4"/>',
  receipt: '<path d="M5 3v18l3-2 2 2 2-2 2 2 2-2 3 2V3z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  landmark: '<path d="M3 9.5 12 3l9 6.5M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/>',
  smartphone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2"/><path d="M10 18.5h4"/>',
  fingerprint: '<path d="M12 4.5A7.5 7.5 0 0 0 4.5 12v3M12 4.5A7.5 7.5 0 0 1 19.5 12v5M8 11a4 4 0 0 1 8 0v5M12 11v7M5.5 19c.8-2.5 1-4 1-7M18.5 20c.5-3 .5-5 .5-8"/>',
  key: '<circle cx="8" cy="12" r="4.5"/><path d="m12.5 12 8 0M17 12v3M20 12v2"/>',
  'trend-up': '<path d="m3 17 6-6 4 4 8-8M15 7h6v6"/>',
  'arrow-exchange': '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
  'map': '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14"/>',
  'clock-hour': '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  'seal': '<path d="m12 2 2.6 2.1 3.3-.3.8 3.2 2.8 1.8-1.3 3.1 1.3 3.1-2.8 1.8-.8 3.2-3.3-.3L12 22l-2.6-2.1-3.3.3-.8-3.2L2.5 15l1.3-3.1L2.5 8.8l2.8-1.8.8-3.2 3.3.3z"/><path d="m8.5 12 2.3 2.3 4.7-5"/>',
};

export function icon(name, cls = '') {
  const path = P[name] || P.info;
  const klass = cls ? ` class="${cls}"` : '';
  return `<svg${klass} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export function brandMark(cls = 'brand__mark') {
  return `<svg class="${cls}" viewBox="0 0 48 48" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="1.1"><path d="M24 2.5 45.5 24 24 45.5 2.5 24Z"/><path d="M15 15.5h18M24 15.5v17" stroke-width="1.6"/></svg>`;
}

export function logotype() {
  return `<span class="brand__text"><span class="brand__name">TRUMP</span><span class="brand__sub">OFFERS</span></span>`;
}

export default icon;
