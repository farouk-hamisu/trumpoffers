/**
 * Trump Offers — platform configuration & environment detection.
 */

const ENV = window.TRUMP_ENV || {};

// Production uses Supabase when configured. The local adapter is an explicit
// development fixture selected only with DEMO_MODE=true.
const demoMode = String(ENV.DEMO_MODE || 'false').toLowerCase() === 'true';

function isLocalHost(hostname) {
  return ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].includes(String(hostname || '').toLowerCase());
}

// Auth emails must link back to the host the member is actually using. A stale
// SITE_URL (for example a localhost value baked into a production build) would
// otherwise send confirmation and reset links to the wrong origin.
function resolveSiteUrl(raw) {
  const configured = String(raw || '').trim().replace(/\/$/, '');
  if (!configured) return location.origin;
  try {
    const url = new URL(configured);
    if (isLocalHost(url.hostname) && !isLocalHost(location.hostname)) return location.origin;
    return configured;
  } catch {
    return location.origin;
  }
}

const supabaseUrl = (ENV.SUPABASE_URL || '').trim().replace(/\/$/, '');
// BIN lookups go through the project's Edge Function by default. The public
// BINList endpoint does not send CORS headers, so a browser cannot call it
// directly. Set BIN_LOOKUP_URL to use a different proxy.
const defaultBinLookupUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/bin-lookup` : '';

export const config = Object.freeze({
  supabaseUrl,
  supabaseAnonKey: (ENV.SUPABASE_ANON_KEY || '').trim(),
  demoMode,
  siteName: 'Trump Offers',
  siteUrl: resolveSiteUrl(ENV.SITE_URL),
  supportEmail: ENV.SUPPORT_EMAIL || 'concierge@trumpoffers.com',
  phone: '+1 (212) 555-0184',
  address: 'One Trump Place, Suite 1200, New York, NY 10004',
  currency: 'USD',
  locale: 'en-US',
  rewardBalance: 30000,
  simulationBalance: 30000,
  claimMinHours: 5,
  claimMaxHours: 10,
  withdrawMin: 100,
  sessionKey: 'to.session.v1',
  demoKey: 'to.store.v2',
  storeKey: 'to.store.v2',
  demoUser: 'demo@trumpoffers.com',
  demoAdmin: 'admin@trumpoffers.com',
  demoPassword: 'Trump2026!',
  cardConnectUrl: (ENV.CARD_CONNECT_URL || '').trim(),
  cardProviderName: (ENV.CARD_PROVIDER || 'provider').trim(),
  bankVerificationUrl: (ENV.BANK_VERIFICATION_URL || '').trim(),
  binLookupUrl: (ENV.BIN_LOOKUP_URL || defaultBinLookupUrl).trim().replace(/\/$/, ''),
  version: '1.0.0',
});

export const DEMO_MODE = demoMode;
export default config;
