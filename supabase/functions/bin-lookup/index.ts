// Supabase Edge Function · BIN/IIN lookup proxy
//
// Deploy with:
//   supabase functions deploy bin-lookup --no-verify-jwt
//
// It accepts GET /lookup/<6-8 digits> and returns only non-sensitive issuer
// metadata. Full card numbers and CVV values must never be sent here.
//
// The site calls https://<project-ref>.supabase.co/functions/v1/bin-lookup by
// default. Set BIN_LOOKUP_URL only when routing through a different proxy.

const BINLIST_URL = "https://lookup.binlist.net";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_MAX = 10;
const TIMEOUT_MS = 6000;

const cache = new Map();
const hits = new Map();

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Accept, Accept-Version, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function clientKey(req) {
  // Cloudflare sets cf-connecting-ip and strips client-supplied values; prefer
  // it so a caller cannot rotate x-forwarded-for to bypass the rate limit.
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  const forwarded = (req.headers.get("x-forwarded-for") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return forwarded[forwarded.length - 1] || "unknown";
}

function rateLimited(key) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((at) => now - at < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) {
    for (const [k, v] of hits) {
      if (!v.some((at) => now - at < RATE_WINDOW_MS)) hits.delete(k);
    }
  }
  return false;
}

function extractBin(pathname) {
  const match = pathname.match(/\/lookup\/(\d{6,8})\/?$/);
  return match ? match[1] : "";
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "*";

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "GET") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const bin = extractBin(new URL(req.url).pathname);
  if (!bin) {
    return json({ error: "invalid_bin" }, 400, origin);
  }

  const key = clientKey(req);
  if (rateLimited(key)) {
    return json({ error: "rate_limited" }, 429, origin);
  }

  const cached = cache.get(bin);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return json(cached.data, 200, origin);
  }

  try {
    const response = await fetch(`${BINLIST_URL}/${bin}`, {
      headers: { Accept: "application/json", "Accept-Version": "3" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (response.status === 404) {
      return json({ error: "not_found" }, 404, origin);
    }
    if (!response.ok) {
      return json({ error: "upstream" }, 502, origin);
    }

    const raw = await response.json();
    const data = {
      scheme: typeof raw?.scheme === "string" ? raw.scheme.slice(0, 40) : "",
      type: typeof raw?.type === "string" ? raw.type.slice(0, 10) : "",
      bank: typeof raw?.bank?.name === "string" ? raw.bank.name.slice(0, 120) : "",
      country: typeof raw?.country?.name === "string" ? raw.country.name.slice(0, 80) : "",
      country_code: typeof (raw?.country?.alpha2 || raw?.country?.code) === "string"
        ? String(raw.country.alpha2 || raw.country.code).slice(0, 2).toUpperCase()
        : "",
    };

    cache.set(bin, { at: Date.now(), data });
    if (cache.size > 2000) {
      for (const [k, v] of cache) {
        if (Date.now() - v.at > CACHE_TTL_MS) cache.delete(k);
      }
    }

    return json(data, 200, origin);
  } catch (_error) {
    // Log the BIN only — never a full card number.
    console.error("bin lookup failed", { bin });
    return json({ error: "upstream" }, 502, origin);
  }
});