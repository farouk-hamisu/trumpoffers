/**
 * Trump Offers — card number (BIN/IIN) verification.
 *
 * BINList identifies the card network, issuer, card type and country from the
 * first 6–8 digits of a card number. It cannot confirm that a card is active,
 * belongs to the person submitting it, or has funds available.
 *
 * Only the BIN is sent to the lookup service. The full card number never
 * leaves this module's caller, is never logged, and is never stored here.
 */

import { config } from '../config.js';

const BINLIST_URL = 'https://lookup.binlist.net';
const CACHE_PREFIX = 'to.bin.v1.';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // issuer metadata is stable
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 5;
const MIN_GAP_MS = 1200;
const TIMEOUT_MS = 7000;
const MAX_ATTEMPTS = 2;

export class BinLookupError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'BinLookupError';
    this.code = code;
    this.retryable = Boolean(options.retryable);
    this.status = options.status || null;
  }
}

/* ------------------------------------------------------------------ helpers */

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function readStore(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage can be unavailable in private mode; caching is best effort */
  }
}

function removeStore(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function cleanText(value, max = 120) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/**
 * Luhn checksum. Returns false for anything outside 12–19 digits.
 */
export function luhnValid(value) {
  const digits = digitsOnly(value);
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = Number(digits[i]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * BINList accepts 6–8 digits. Six covers most networks; eight is used as a
 * fallback when the six-digit lookup has no record.
 */
export function extractBin(value) {
  const digits = digitsOnly(value);
  return digits.length >= 6 ? digits.slice(0, 6) : '';
}

export function maskCardNumber(value) {
  const digits = digitsOnly(value);
  if (!digits.length) return '';
  return `•••• •••• •••• ${digits.slice(-4)}`;
}

/* --------------------------------------------------------------- rate limit */

function rateTimestamps() {
  const raw = readStore(`${CACHE_PREFIX}rate`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((at) => Number.isFinite(at) && now - at < RATE_WINDOW_MS);
  } catch {
    return [];
  }
}

function saveRateTimestamps(list) {
  writeStore(`${CACHE_PREFIX}rate`, JSON.stringify(list.slice(-RATE_MAX * 2)));
}

async function reserveRateSlot() {
  const now = Date.now();
  const stamps = rateTimestamps();

  if (stamps.length >= RATE_MAX) {
    const retryAt = stamps[0] + RATE_WINDOW_MS;
    if (retryAt > now) {
      throw new BinLookupError(
        'rate_limited',
        'Too many card checks. Wait a minute and try again.',
        { retryable: true, status: 429 }
      );
    }
    stamps.shift();
  }

  const last = stamps[stamps.length - 1] || 0;
  const gap = last + MIN_GAP_MS - now;
  if (gap > 0) await wait(gap);

  stamps.push(Date.now());
  saveRateTimestamps(stamps);
}

/* ------------------------------------------------------------------- lookup */

function cacheKey(bin) {
  return `${CACHE_PREFIX}${bin}`;
}

function readCache(bin) {
  const raw = readStore(cacheKey(bin));
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw);
    if (!entry || !Number.isFinite(entry.at) || !entry.data) return null;
    if (Date.now() - entry.at > CACHE_TTL_MS) {
      removeStore(cacheKey(bin));
      return null;
    }
    return entry.data;
  } catch {
    removeStore(cacheKey(bin));
    return null;
  }
}

function writeCache(bin, data) {
  writeStore(cacheKey(bin), JSON.stringify({ at: Date.now(), data }));
}

function lookupUrl(bin) {
  const base = (config.binLookupUrl || '').trim().replace(/\/$/, '');
  if (base) return `${base}/lookup/${encodeURIComponent(bin)}`;
  return `${BINLIST_URL}/${encodeURIComponent(bin)}`;
}

async function requestBin(bin, attempt = 1) {
  await reserveRateSlot();

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(lookupUrl(bin), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });

    if (response.status === 404) {
      throw new BinLookupError('not_found', 'This card number could not be verified.');
    }
    if (response.status === 429) {
      throw new BinLookupError(
        'rate_limited',
        'Too many card checks. Wait a minute and try again.',
        { retryable: true, status: 429 }
      );
    }
    if (response.status === 403) {
      throw new BinLookupError(
        'blocked',
        'The card verification service is unavailable. Try again shortly.',
        { retryable: true, status: 403 }
      );
    }
    if (!response.ok) {
      throw new BinLookupError(
        'upstream',
        'The card verification service is unavailable. Try again shortly.',
        { retryable: response.status >= 500, status: response.status }
      );
    }

    const data = await response.json();
    if (!data || typeof data !== 'object') {
      throw new BinLookupError('invalid_response', 'The card verification response was invalid.');
    }
    writeCache(bin, data);
    return data;
  } catch (error) {
    if (error instanceof BinLookupError) {
      if (error.retryable && attempt < MAX_ATTEMPTS) {
        await wait(700 * attempt);
        return requestBin(bin, attempt + 1);
      }
      throw error;
    }
    if (error?.name === 'AbortError') {
      throw new BinLookupError(
        'timeout',
        'Card verification timed out. Check your connection and try again.',
        { retryable: attempt < MAX_ATTEMPTS }
      );
    }
    throw new BinLookupError(
      'network',
      'We could not reach the card verification service. Try again shortly.',
      { retryable: attempt < MAX_ATTEMPTS }
    );
  } finally {
    window.clearTimeout(timer);
  }
}

export async function lookupBin(bin) {
  const clean = digitsOnly(bin).slice(0, 8);
  if (clean.length < 6) {
    return {
      ok: false,
      code: 'invalid_bin',
      message: 'Enter a valid card number.',
    };
  }

  const cached = readCache(clean);
  if (cached) return { ok: true, data: cached, cached: true };

  try {
    const data = await requestBin(clean);
    return { ok: true, data, cached: false };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof BinLookupError ? error.code : 'network',
      message:
        error instanceof BinLookupError
          ? error.message
          : 'We could not reach the card verification service. Try again shortly.',
      retryable: Boolean(error?.retryable),
    };
  }
}

/* -------------------------------------------------------------- normalising */

const SCHEME_ALIASES = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  'american express': 'American Express',
  amex: 'American Express',
  discover: 'Discover',
  jcb: 'JCB',
  'diners club': 'Diners Club',
  diners: 'Diners Club',
  unionpay: 'UnionPay',
  maestro: 'Maestro',
  elo: 'Elo',
  hipercard: 'Hipercard',
  mir: 'Mir',
};

export function cardBrand(value) {
  const digits = digitsOnly(value);
  if (/^4/.test(digits)) return 'Visa';
  if (/^(5[1-5]|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)/.test(digits)) return 'Mastercard';
  if (/^3[47]/.test(digits)) return 'American Express';
  if (/^(6011|65|64[4-9])/.test(digits)) return 'Discover';
  if (/^35/.test(digits)) return 'JCB';
  if (/^3(0[0-5]|[68])/.test(digits)) return 'Diners Club';
  if (/^62/.test(digits)) return 'UnionPay';
  return 'Card';
}

function normaliseScheme(value) {
  const key = String(value || '').trim().toLowerCase();
  return SCHEME_ALIASES[key] || (key ? key.replace(/\b\w/g, (c) => c.toUpperCase()) : '');
}

function normaliseType(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'debit' || key === 'credit' || key === 'charge') return key;
  return '';
}

function significantTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !['the', 'and', 'bank', 'n.a', 'na', 'inc', 'ltd', 'plc'].includes(token));
}

function banksMatch(entered, issuer) {
  const enteredTokens = significantTokens(entered);
  if (!enteredTokens.length) return true; // nothing entered to compare
  const issuerTokens = [...new Set(significantTokens(issuer))];
  return enteredTokens.some((token) =>
    issuerTokens.some(
      (issuerToken) =>
        issuerToken === token ||
        (token.length >= 4 && issuerToken.startsWith(token)) ||
        (issuerToken.length >= 4 && token.startsWith(issuerToken))
    )
  );
}

const COUNTRY_ALIASES = {
  us: 'us',
  usa: 'us',
  'u.s.': 'us',
  'u.s.a.': 'us',
  'united states': 'us',
  'united states of america': 'us',
  uk: 'gb',
  'u.k.': 'gb',
  gbr: 'gb',
  'united kingdom': 'gb',
  'great britain': 'gb',
};

function normalizeCountry(value) {
  const key = String(value || '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return COUNTRY_ALIASES[key] || key;
}

function countriesMatch(entered, country, countryCode) {
  const expected = normalizeCountry(entered);
  if (!expected) return true;
  const name = normalizeCountry(country);
  const code = countryCode.toLowerCase();
  return expected === name || expected === code || name.includes(expected) || expected.includes(name);
}

/* -------------------------------------------------------------------- verify */

/**
 * Verify a card number against its BIN record.
 *
 * @param {string} value card number as typed
 * @param {{ bank?: string, country?: string }} [details] non-sensitive details
 *   entered on the form, used only for consistency checks
 * @returns {Promise<{ok: true, meta: object} | {ok: false, code: string, message: string}>}
 */
export async function verifyCardNumber(value, details = {}) {
  const digits = digitsOnly(value);

  if (!luhnValid(digits)) {
    return { ok: false, code: 'luhn', message: 'Enter a valid card number.' };
  }

  const bin = extractBin(digits);
  let result = await lookupBin(bin);
  let verifiedBin = bin;

  if (!result.ok && result.code === 'not_found' && digits.length >= 8) {
    verifiedBin = digits.slice(0, 8);
    result = await lookupBin(verifiedBin);
  }

  if (!result.ok) {
    if (result.code === 'not_found' || result.code === 'invalid_response') {
      return {
        ok: false,
        code: 'unverified',
        message: 'We could not verify this card. Check the number and try again.',
      };
    }
    return { ok: false, code: result.code, message: result.message };
  }

  const info = result.data || {};
  const scheme = normaliseScheme(info.scheme);
  const type = normaliseType(info.type);
  // The direct BINList response nests issuer details; the Edge Function proxy
  // returns the same values flattened. Accept both shapes.
  const bank = cleanText(typeof info.bank === 'string' ? info.bank : info.bank?.name, 120);
  const country = cleanText(
    typeof info.country === 'string' ? info.country : info.country?.name,
    80
  );
  const countryCode = cleanText(
    info.country_code || info.country?.alpha2 || info.country?.code,
    2
  ).toUpperCase();

  if (!scheme || !type || !bank || !country || !countryCode) {
    return {
      ok: false,
      code: 'unidentified',
      message: "We could not identify this card's issuer. Check the number and try again.",
    };
  }

  const detected = cardBrand(digits);
  if (detected !== 'Card' && detected.toLowerCase() !== scheme.toLowerCase()) {
    return {
      ok: false,
      code: 'brand_mismatch',
      message: 'This card number does not match its card network. Check the number and try again.',
    };
  }

  if (!banksMatch(details.bank || '', bank)) {
    return {
      ok: false,
      code: 'bank_mismatch',
      message: 'The bank name does not match this card. Check the details and try again.',
    };
  }

  const enteredCountry = cleanText(details.country || '', 80);
  if (enteredCountry && !countriesMatch(enteredCountry, country, countryCode)) {
    return {
      ok: false,
      code: 'country_mismatch',
      message: 'The issuing country does not match this card. Check the details and try again.',
    };
  }

  return {
    ok: true,
    meta: {
      bin: digits.slice(0, verifiedBin.length),
      scheme,
      type,
      bank,
      country,
      country_code: countryCode,
      checked_at: new Date().toISOString(),
      source: result.cached ? 'cache' : 'binlist',
    },
  };
}

export function describeBin(meta) {
  if (!meta) return '';
  const type = meta.type ? meta.type.replace(/^./, (c) => c.toUpperCase()) : '';
  return [meta.scheme, type, meta.bank, meta.country].filter(Boolean).join(' · ');
}