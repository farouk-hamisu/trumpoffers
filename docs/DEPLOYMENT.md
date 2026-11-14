# Deployment

Trump Offers is a static site. The only build step rewrites `js/env.js` from environment variables. Fonts, imagery, the Supabase client and the intro film are self-hosted, so there is no CDN dependency and no mixed-content risk.

---

## 1. Before deploying

### Configure the runtime

Set these variables in the hosting platform (or in `.env` for a manual deploy):

| Variable | Required | Example |
| --- | --- | --- |
| `SUPABASE_URL` | Yes for live mode | `https://abcdefghij.supabase.co` |
| `SUPABASE_ANON_KEY` | Yes for live mode | `eyJhbGciOi…` or `sb_publishable_…` |
| `SITE_URL` | Yes | `https://trumpoffers.com` |
| `DEMO_MODE` | No | `false` (default and required for production); `true` is a development-only fixture |
| `SUPPORT_EMAIL` | No | `concierge@trumpoffers.com` |
| `BIN_LOOKUP_URL` | No | Optional proxy override. Blank uses `${SUPABASE_URL}/functions/v1/bin-lookup` |

Then generate the browser config:

```bash
npm run build
```

`js/env.js` is overwritten with the public values. Never add a service-role key. If `DEMO_MODE=false` and Supabase is not configured, authenticated features will not fall back to preview.

### Update site identity

Search the project for the placeholder domain and replace it if you deploy elsewhere:

```bash
grep -rn "trumpoffers.com" --include="*.html" --include="*.xml" --include="*.txt" .
```

Update:

- canonical links and Open Graph URLs in every page;
- `sitemap.xml` and `robots.txt`;
- `SITE_URL` and the Supabase Auth redirect URLs;
- support, legal and security addresses in the footer, contact and legal pages;
- `og:image` to an absolute HTTPS URL (`https://your-domain/assets/images/og-image.jpg`) so social scrapers can fetch it.

### Confirm the backend

- Migrations applied in order.
- `resumes` and `site-media` buckets present.
- At least one administrator promoted with `grant_admin`.
- Auth site URL and redirect URLs point at the production domain.
- Email confirmation and SMTP configured.
- RLS smoke test completed from a non-admin account. See [SETUP.md](SETUP.md#10-verify-the-installation).

---

## 2. Vercel

`vercel.json` is included.

1. Push the project to a Git repository.
2. In Vercel, **Add New → Project** and import the repository.
3. If the site lives in a subdirectory, set **Root Directory** to that folder.
4. Framework preset: **Other**.
5. Build command: `npm run build`.
6. Output directory: `.`.
7. Add the environment variables above for **Production** (and Preview if desired).
8. Deploy, then add the custom domain under **Settings → Domains**.

`vercel.json` supplies:

- the Content-Security-Policy and hardening headers;
- immutable caching for `/assets/*`;
- revalidation for HTML;
- redirects from `/admin` and `/admin/` to `/admin/index.html`.

Vercel evaluates `vercel.json` at the edge; environment variables are available to the build command. Confirm in the deployment log that the build wrote `js/env.js` and did not warn that Supabase is unconfigured.

---

## 3. Netlify

`netlify.toml` and `_headers` are included.

1. **Add new site → Import an existing project**.
2. Select the repository and branch.
3. Set **Base directory** if the site is in a subfolder.
4. Build command: `npm run build`; publish directory: `.`.
5. Add environment variables under **Site configuration → Environment variables**.
6. Deploy and add the domain under **Domain management**.

Netlify reads `_headers` from the publish root for CSP/HSTS and cache rules, and `netlify.toml` provides the `/admin` redirect. If you move the site into a subdirectory, ensure `_headers` remains in the published root.

---

## 4. Cloudflare Pages

1. **Workers & Pages → Create → Pages → Connect to Git**.
2. Build command: `npm run build`; build output directory: `.`.
3. Add the same environment variables.
4. Deploy and attach a custom domain.

Cloudflare Pages honours `_headers` for security and cache headers. It does **not** use `netlify.toml`; the included `_redirects` file provides the `/admin` convenience redirect and is also read by Netlify.

Cloudflare's default upload limit is 25 MiB per file. The bundled intro film is well below that; keep replacement videos under the limit or host them in Supabase Storage.

---

## 5. Other static hosts

Any host that serves files over HTTPS works:

- Nginx, Apache, Caddy, GitHub Pages, S3 + CloudFront, Firebase Hosting.
- Serve `index.html` for `/` and preserve real paths for `.html` files.
- Add the headers from `_headers` manually. At minimum: CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.
- Ensure MP4 files support HTTP range requests (most static hosts do). Without range support the intro may not seek or start reliably.
- Do not enable directory listings.

---

## 6. Security headers

The deployed headers should match `_headers` / `vercel.json`:

```text
Content-Security-Policy: default-src 'self';
  script-src 'self' https://conversations-widget.brevo.com;
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://*.supabase.co;
  media-src 'self' blob: https://*.supabase.co;
  font-src 'self';
  connect-src 'self' https://*.supabase.co wss://*.supabase.co;
  frame-src https://conversations-widget.brevo.com;
  object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';
  upgrade-insecure-requests
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
Cross-Origin-Opener-Policy: same-origin
X-Permitted-Cross-Domain-Policies: none
```

Notes:

- `script-src 'self' https://conversations-widget.brevo.com` means **no inline `<script>` blocks**. The only third-party script is the Brevo Conversations loader, injected by `js/livechat.js`; `frame-src` allows its chat iframe. Adding analytics or another embed requires updating the CSP deliberately.
- The official Brevo inline snippet is intentionally not pasted into the HTML. `js/livechat.js` performs the same bootstrap from a local file. Set `LIVECHAT_ENABLED=false` in the public environment to disable chat without changing the CSP.
- `style-src 'unsafe-inline'` is required by the existing inline `style` attributes used for layout details. Do not loosen `script-src`.
- Connect/image/media directives allow any Supabase project over HTTPS and WSS. If you use a custom Supabase domain, replace `*.supabase.co`. BIN lookups use the project Edge Function, so the public BINList origin is not allowed in the browser CSP.
- Payout-card BIN lookups must only carry the first 6–8 digits. The lookup service is not an authorisation check: a hit identifies the issuer, not an active card or available funds. Deploy `supabase/functions/bin-lookup` before enabling card connections; it provides the server-side cache, CORS control and per-caller rate limiting. If you point `BIN_LOOKUP_URL` at another host, add that host to `connect-src`.
- HSTS is safe only once the domain is permanently HTTPS. Start with a shorter `max-age` if you are migrating, then raise it.
- `frame-ancestors 'none'` and `X-Frame-Options: DENY` prevent embedding. Keep both for compatibility.

Verify with:

```bash
curl -sI https://your-domain/ | grep -iE 'content-security|strict-transport|x-content|x-frame|referrer|permissions'
```

---

## 7. Caching

- `/assets/*` — one year, immutable. Asset filenames are stable, so replacing an image requires a new filename or a cache purge.
- HTML — `max-age=0, must-revalidate` so deploys appear immediately.
- `js/env.js` — served as a normal file; ensure it is revalidated. It is not under `/assets`, so the HTML rule and host defaults apply.
- Supabase Storage — managed by Supabase.

If you change the intro film at the same path, purge the CDN cache or upload it under a new filename.

---

## 8. Auth redirects and email

In Supabase **Authentication → URL Configuration**:

```text
Site URL:      https://your-domain
Redirect URLs: https://your-domain/**
               http://localhost:8080/login.html
               http://localhost:8080/login.html?mode=update
```

The wildcard covers `login.html`, `login.html?mode=update`, `dashboard.html` and future paths. For a staging deployment, add its URLs too. Password reset links that do not match an allowed redirect will fail silently or land on the wrong host.

Custom SMTP is required for production. Supabase's built-in mailer limits the project to 2 emails/hour and is best-effort only. With Resend: host `smtp.resend.com`, port `465`, username `resend`, password = Resend API key, sender `no-reply@<verified-domain>`. Then raise the email rate limit (100/hour is reasonable) and keep the provider's daily cap in mind. Branded templates live in `supabase/email-templates/`.

Test registration, confirmation and reset from a fresh browser profile after any SMTP change.

---

## 9. Domain, SEO and metadata

- `robots.txt` disallows `/admin/`, dashboards, rewards, withdrawals, cards, apply and track. Authenticated pages also carry guards; robots rules are not a security control.
- `sitemap.xml` lists only public pages. Update it when adding public routes.
- Every public page has a canonical URL and description. Update them if the production domain differs.
- The OG image is 1200×630 at `assets/images/og-image.jpg`. Use an absolute URL in `og:image` for reliable previews.
- Serve the site at the apex domain or `www`, not both; redirect the other.

---

## 10. Post-deploy verification

Run through this list against the production URL:

1. Homepage loads over HTTPS with no mixed-content warnings; the intro plays or can be skipped; the poster appears if the video is blocked.
2. Header/footer links resolve; no 404s; `404.html` renders for unknown paths if the host supports custom error pages.
3. Register → confirm → sign in → dashboard.
4. Reward credit, withdrawal, application, card request and contact submission succeed against Supabase.
5. Application tracking works with reference + email; card verification works with reference + last four.
6. Admin sign-in works; a normal member cannot open the console.
7. CV upload succeeds and opens via a signed URL; the bucket is not publicly listable.
8. Video upload works (or the hosted URL plays) and persists after a refresh.
9. Response headers match section 6; HSTS is present.
10. Browser console is clean on every page (no CSP violations, failed requests or JS errors).
11. Responsive check at 390 px, 768 px and 1440 px.
12. Lighthouse: reasonable performance on mobile, accessible names, no layout shift from the intro overlay.

---

## 11. Rollback

- Static hosts keep immutable deployments. Promote the previous deployment in Vercel/Netlify/Cloudflare.
- `js/env.js` is generated, so a rollback of code must be paired with the matching environment variables.
- Database migrations are forward-only in this project. Before applying new migrations in production, take a Supabase backup or use a branch database. To undo a migration, write and test a new down-migration; do not edit an applied migration in place.

---

## 12. Scaling and limits

- Static hosting scales automatically. Supabase Free/Pro limits apply to Auth MAU, database size, storage and egress.
- The admin overview issues several count queries per load; it is designed for small teams. Add indexes (already present on the common filters) or a materialised summary if the dataset grows.
- Public forms are protected by validation and RLS, not rate limiting. Add a CAPTCHA/Turnstile or edge rate limiting before promoting the site widely.
- Cron-based status progression is intentionally not included. Use `pg_cron` or an Edge Function if you later want automatic withdrawal advancement, and audit the change carefully.
