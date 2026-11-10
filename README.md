# Trump Offers

A premium platform for **rewards, recruitment and digital cards**, built as a multi-page site with HTML5, CSS3, vanilla JavaScript and Supabase.

> **Platform records and provider-dependent payouts.** Trump Offers does not custody money or issue payment instruments, and never asks for a PIN, CVV or full card number. Withdrawals are reviewed by an administrator and completed only after confirmed settlement. Card connection and provider payouts require configured credentials; without them those actions fail closed with an explicit message. See [docs/SECURITY.md](docs/SECURITY.md).

---

## What is included

### Public and member experience

| Page | Purpose |
| --- | --- |
| `index.html` | Editorial homepage with a configurable full-screen introduction film, rewards and careers showcases, 3D card preview, FAQ and footer |
| `register.html` | Account creation with validation and profile provisioning |
| `login.html` | Sign in, password reset request and recovery-password mode |
| `dashboard.html` | Member overview: balance, active claim, recent withdrawals, notifications and activity |
| `rewards.html` | $30,000 reward balance, multi-step claim workflow, live claim progress and claim history |
| `withdraw.html` | Bank, cryptocurrency and card withdrawals with encrypted details, validation, review, history and status tracking |
| `careers.html` | Live vacancies pulled from the database with department and location filters |
| `job-details.html` | Full vacancy description, responsibilities, requirements and benefits |
| `apply.html` | Application form with CV upload, validation and a unique `TO-JB-*` reference |
| `track.html` | Application tracking by exact reference + email, with a five-step status timeline and 3–4 business-day estimate |
| `card.html` | Card studio: four designs, cardholder name, generated display details and request history |
| `card-verify.html` | Public verification of a card by reference + last four digits |
| `contact.html` | Contact form, office details, response expectations and support channels |
| `privacy.html`, `terms.html` | Full legal copy with sticky section navigation |
| `404.html` | Branded not-found page |

### Admin console (`/admin/`)

- Role-protected dashboard with key figures, a 180-day claims/registrations chart, activity feed and pending-work counts.
- Member register with search, role/status filters and suspend/reinstate actions.
- Reward claims and withdrawal requests with status workflows, notes and member notifications.
- Vacancy CRUD (create, edit, publish, close, delete).
- Application review with status changes, review notes and signed CV downloads.
- Card request approval/rejection.
- Contact inbox with read/handled states.
- Website configuration: identity, support details, announcement, social links and the introduction video (URL or direct MP4 upload to Supabase Storage).

### Backend

- Complete, ordered SQL migrations in `supabase/migrations/` — tables, constraints, indexes, triggers, RLS policies, security-definer RPCs, storage buckets/policies and seed data.
- Supabase Auth for email/password accounts, password reset and session persistence.
- Two interchangeable adapters behind one API:
  - **Supabase** (`js/lib/remote.js`) for production.
  - **Local preview** (`js/lib/local.js`) with seeded data in `localStorage` when Supabase is not configured.
- Brevo Conversations live chat on public, auth and admin pages, loaded from a local bootstrap so the CSP blocks inline scripts.
- Deployment configs for Vercel, Netlify and Cloudflare Pages with CSP, HSTS and hardening headers.

---

## Quick start

Requirements: Node.js 20+ (only for the helper scripts) and any static file server.

```bash
cd trumoffers
npm run dev            # python3 -m http.server 8080
# open http://localhost:8080
```

This checkout is configured for **Supabase production mode** in `.env` and `js/env.js`. Apply the database setup in `supabase/combined.sql` before signing in. Create your account through `register.html`; there are no pre-seeded member or administrator credentials.

For local interface development without a backend, set `DEMO_MODE=true` in `.env`, run `npm run env`, and register a local account through the normal form. Local preview is a development-only mode; it is never enabled by a URL parameter and is not shown in the production interface.

---

## Connect Supabase

1. Create a Supabase project.
2. Apply the database setup. The fastest route is to paste `supabase/combined.sql` into the Supabase SQL editor; the individual migrations in `supabase/migrations/` are the same statements in filename order. See [docs/SETUP.md](docs/SETUP.md).
3. Copy `.env.example` to `.env`, add the project URL and **anon** key, then run `npm run env`.
4. Create your own administrator account through the site, then promote it from the SQL editor:

   ```sql
   select public.grant_admin('you@example.com');
   ```

5. Configure Auth site URL and redirect URLs, and confirm the `resumes` and `site-media` buckets exist. See [docs/STORAGE.md](docs/STORAGE.md).

Never place a service-role key in `.env`, `js/env.js` or any browser file.

---

## Project structure

```
.
├── index.html                 Public homepage
├── *.html                     Auth, member, careers, card, legal pages
├── 404.html
├── admin/
│   ├── login.html             Administrator sign-in
│   └── index.html             Admin console shell
├── assets/
│   ├── fonts/                 Self-hosted Cormorant Garamond + Inter (WOFF2)
│   ├── icons/                 Favicon, ICO and Apple touch icon
│   ├── images/                Optimised WebP imagery, OG image, originals
│   ├── vendor/supabase.js     Vendored Supabase UMD client
│   └── videos/                Introduction film
├── css/
│   ├── fonts.css, base.css, layout.css
│   ├── home.css, app.css, admin.css
├── js/
│   ├── env.js                 Generated public runtime config
│   ├── config.js, icons.js, components.js, app.js
│   ├── lib/
│   │   ├── api.js             Backend selection and route guards
│   │   ├── remote.js          Supabase adapter
│   │   ├── local.js           localStorage preview adapter
│   │   ├── shell.js           Authenticated member shell
│   │   └── utils.js           Formatting, validation, modals, toasts
│   └── pages/                 One module per page
├── supabase/
│   ├── config.toml
│   ├── combined.sql           One-paste setup for the Supabase SQL editor
│   └── migrations/            Ordered schema, RLS, RPC, storage and seed SQL
├── scripts/
│   ├── generate-env.mjs       .env → js/env.js
│   ├── check-project.mjs      Local link/asset validator
│   └── og-template.html       Source used to render the OG image
├── docs/                      Setup, storage, admin, deployment, security
├── vercel.json, netlify.toml, _headers, _redirects
├── robots.txt, sitemap.xml
└── .env.example, package.json
```

---

## Data model at a glance

| Table | Purpose |
| --- | --- |
| `profiles` | Member identity, contact details and account status |
| `user_roles` | `user` / `admin` grants, checked by `public.is_admin()` |
| `reward_accounts` | $30,000 reward balance and account status |
| `reward_claims` | Claim references, stage/progress and verification window |
| `withdrawals` | Bank, crypto and card payout requests with encrypted details and settlement state |
| `withdrawal_methods` | Configurable methods, limits, fees and processing windows |
| `crypto_networks` | Supported assets, networks and wallet-address validation |
| `payment_accounts` | Tokenised card and payout destinations |
| `withdrawal_status_history` | Append-only status and note history |
| `admin_audit_logs` | Administrative action audit trail |
| `notifications` | In-app status notifications for members |
| `activity_logs` | Audit trail for member and administrator actions |
| `job_vacancies` | Careers listings |
| `job_applications` | Applications, CV metadata, review status and notes |
| `card_applications` | Card designs, generated display numbers and approval status |
| `contact_messages` | Contact form inbox |
| `site_settings` | Public site copy, contact details and intro video configuration |
| `reference_sequences` | Atomic human-readable reference counters |

RPCs: `create_reward_claim`, `request_withdrawal`, `admin_update_withdrawal_status`, `admin_get_withdrawal_details`, `admin_add_withdrawal_note`, `submit_job_application`, `track_application`, `create_card_application`, `verify_demo_card`. The privileged `grant_admin(email)` helper is intentionally not executable by `anon` or `authenticated`.

References use the format `TO-RW-26-000001`, `TO-WD-26-000001`, `TO-JB-26-000001`, `TO-CD-26-000001`.

---

## Scripts

```bash
npm run dev      # static server on :8080
npm run env      # regenerate js/env.js from .env (or platform env vars)
npm run check    # validate local links and asset references
```

`npm run build` is an alias for `npm run env`, used by the deployment configs.

---

## Documentation

- [Setup](docs/SETUP.md) — Supabase project, migrations, auth, first administrator, verification.
- [Storage](docs/STORAGE.md) — buckets, policies, uploads, video configuration.
- [Admin guide](docs/ADMIN.md) — every console view and status workflow.
- [Deployment](docs/DEPLOYMENT.md) — Vercel, Netlify, Cloudflare Pages, headers and domains.
- [Security](docs/SECURITY.md) — RLS model, secrets, data handling and operational checklist.

---

## Design and engineering notes

- Black, charcoal and ivory palette with restrained metallic gold; Cormorant Garamond display type and Inter for UI.
- Editorial asymmetry, arch-framed imagery, fine rules and numbered labels rather than generic gradient cards.
- Responsive at 390 px, 768 px and 1440 px; keyboard-accessible dialogs, visible focus states, skip links and reduced-motion support.
- No frontend frameworks, no CSS frameworks, no CDN runtime dependencies. Fonts, imagery, the Supabase client and the intro film are self-hosted.
- All imagery is licensed stock photography, optimised to WebP at 800 px and 1600 px widths.
- The site has no build step beyond generating `js/env.js`; deploy the directory as static files.

---

## Licence

Unlicensed project. Review the stock photography and font licences before commercial use. See `docs/SECURITY.md` for the platform-status and data-handling requirements that must remain accurate in any deployment.
