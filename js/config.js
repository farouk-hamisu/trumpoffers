/**
 * Trump Offers — configuration & environment detection.
 */

const ENV = window.TRUMP_ENV || {};

// Production is Supabase-only. Local preview must be enabled explicitly with
// DEMO_MODE=true for development; it is never activated by a URL parameter.
const demoMode = String(ENV.DEMO_MODE || 'false').toLowerCase() === 'true';

export const config = Object.freeze({
  supabaseUrl: (ENV.SUPABASE_URL || '').trim().replace(/\/$/, ''),
  supabaseAnonKey: (ENV.SUPABASE_ANON_KEY || '').trim(),
  demoMode,
  siteName: 'Trump Offers',
  siteUrl: (ENV.SITE_URL || '').trim().replace(/\/$/, '') || location.origin,
  supportEmail: ENV.SUPPORT_EMAIL || 'concierge@trumpoffers.com',
  phone: '+1 (212) 555-0184',
  address: 'One Trump Place, Suite 1200, New York, NY 10004',
  currency: 'USD',
  locale: 'en-US',
  simulationBalance: 30000,
  claimMinHours: 5,
  claimMaxHours: 10,
  withdrawMin: 100,
  sessionKey: 'to.session.v1',
  demoKey: 'to.demo.v2',
  demoUser: 'demo@trumpoffers.com',
  demoAdmin: 'admin@trumpoffers.com',
  demoPassword: 'Trump2026!',
  version: '1.0.0',
});

export const DEMO_MODE = demoMode;
export default config;
