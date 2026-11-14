# Setup

This guide takes the project from a clean checkout to a working Supabase-backed deployment. For a no-backend review, see the quick start in the [README](../README.md).

> **This checkout is already configured** with its Supabase URL and publishable key in `.env` and `js/env.js`. The database itself must still be initialised by running `supabase/combined.sql` (or the migrations) in the project's SQL editor. Until then, sign-in reports that the database is not initialised.

---

## 1. Prerequisites

- A [Supabase](https://supabase.com) account and project.
- Node.js 20+ for `npm run env` and the validation scripts.
- Optional: Supabase CLI (`supabase --version`). Everything can also be applied through the Supabase SQL editor.
- A static host or local static server. The project has no bundler and no runtime dependencies beyond the vendored Supabase client.

---

## 2. Run the site locally

```bash
cd trumoffers
npm run dev
# http://localhost:8080
```

The site is configured for **Supabase production mode** by default. It talks directly to the project named in `.env` and `js/env.js`, so the database must be initialised (section 4) before registration or sign-in can succeed.

There are no demo accounts. Create your own account through `register.html` after the schema is applied.

For interface work without a backend, a developer can opt into the local adapter by setting `DEMO_MODE=true` in `.env` and running `npm run env`. This is a development-only fixture: it is never enabled by a URL parameter, it is not part of the production interface, and the local seed accounts are not documented or displayed anywhere on the site.

---

## 3. Create the Supabase project

1. In the Supabase dashboard, create a project and note:
   - **Project URL** — `https://<ref>.supabase.co`
   - **Anon / publishable key** — safe for the browser.
2. Do **not** copy the service-role key into this project. It bypasses RLS and must never reach the browser.

---

## 4. Apply the migrations

The migrations are ordered by timestamp and must be applied in filename order:

| File | Contents |
| --- | --- |
| `20261108120000_extensions_helpers.sql` | `pgcrypto`, `set_updated_at`, reference sequences |
| `20261108120100_profiles_roles.sql` | Profiles, roles, `is_admin()`, profile RLS |
| `20261108120200_rewards.sql` | Reward accounts, claims, withdrawals, notifications, activity, claim/withdrawal RPCs |
| `20261108120300_recruitment.sql` | Vacancies, applications, application notification trigger, submit/track RPCs |
| `20261108120400_cards.sql` | Card applications, display-number generator, create/verify RPCs |
| `20261108120500_contact_settings.sql` | Contact inbox and public site settings |
| `20261108120600_provisioning.sql` | New-user provisioning trigger and privileged `grant_admin()` |
| `20261108120700_storage.sql` | `resumes` and `site-media` buckets with policies |
| `20261108120800_seed.sql` | Seed settings and sample vacancies |
| `20261109120000_withdrawals_v2.sql` | Withdrawal methods, crypto networks, encrypted payout details, payment accounts, status history, audit logs and hardened withdrawal/admin RPCs |
| `20261110120000_payment_cards.sql` | Encrypted manual payout cards, card validation helpers, card connection and audited admin card RPCs |
| `20261113120000_card_only_withdrawals.sql` | Card-only withdrawal methods, administrator-managed card form fields, structured card responses, balance ledger, hardened request/approval RPCs |
| `20261114120000_automatic_rewards.sql` | Automatic welcome reward, reward ledger entries, duplicate protection, member ledger policy and `admin_issue_reward()` |
| `20261114130000_bin_verification.sql` | BIN/IIN issuer metadata on payout cards and the updated `connect_payment_card` RPC |
| `20261114140000_reject_sensitive_card_fields.sql` | Blocks CVV/CVC/PIN/password card fields and scrubs stored responses |
| `20261114150000_card_expiry.sql` | Re-checks a connected card's expiry when a withdrawal is requested |

### Option A — One-paste SQL editor (fastest)

Open `supabase/combined.sql`, paste the whole file into the Supabase **SQL editor** and run it once. It is the ordered concatenation of every migration inside a single transaction, so a failure rolls back cleanly. Re-running it is safe.

You can also apply it with `psql` if you have the database connection string:

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/combined.sql
```

### Option B — Supabase CLI

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

To run everything locally with Docker:

```bash
supabase start
supabase db reset        # applies migrations from supabase/migrations
```

`supabase/config.toml` is already configured for local ports, auth redirects to `http://localhost:8080` and email confirmations disabled for local development.

### Option C — Individual migration files

Open each file in `supabase/migrations/` in timestamp order and run it in the SQL editor. Run one file at a time and confirm success before continuing. The scripts are idempotent where practical (`if not exists`, `on conflict`, `drop policy if exists`), but the seed file is intended to be run once.

> **Do not** reorder the files. Profiles must exist before reward accounts; `is_admin()` must exist before the policies that call it; the storage policies depend on `is_admin()`.

### What the migrations create

- All public tables with `check` constraints, foreign keys, indexes and `updated_at` triggers.
- Row Level Security on every table.
- Status-change triggers that write member notifications and activity entries.
- `security definer` RPCs with a pinned `search_path` and explicit `revoke`/`grant` statements.
- Encrypted manual payout cards in `private.payment_card_secrets`; the only decryption path is an audited admin RPC.
- A single **Connect Your Card** withdrawal method, administrator-managed `card_form_fields` and structured responses in `payment_accounts.extra`.
- `balance_ledger` reservation, release and settlement entries for withdrawal auditing.
- Storage bucket definitions and policies.
- Seed `site_settings` and vacancies.

---

## 5. Configure environment values

```bash
cp .env.example .env
```

Edit `.env`:

```dotenv
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<anon-or-publishable-key>
SITE_URL=https://your-domain.example
DEMO_MODE=false
SUPPORT_EMAIL=concierge@trumpoffers.com
# Optional hosted card provider. Leave blank to use the encrypted manual payout-card form.
CARD_CONNECT_URL=
CARD_PROVIDER=
# Optional bank-verification provider. Leave blank to fail closed until configured.
BANK_VERIFICATION_URL=
# Optional BIN/IIN lookup proxy (Supabase Edge Function or equivalent).
# Leave blank to use ${SUPABASE_URL}/functions/v1/bin-lookup.
BIN_LOOKUP_URL=
# Brevo Conversations live chat (public id; set LIVECHAT_ENABLED=false to hide it)
LIVECHAT_ENABLED=true
BREVO_CONVERSATIONS_ID=6af29e2f9894c8cc930ccf0a
```

Then generate the browser config:

```bash
npm run env
```

This writes `js/env.js` with only public values. Deployment platforms can inject the same variables at build time; the script reads `process.env` first and falls back to `.env`.

**Mode behaviour**

| `DEMO_MODE` | Result |
| --- | --- |
| `false` (default) | Supabase production mode. The browser uses `SUPABASE_URL` and `SUPABASE_ANON_KEY`; there is no local fallback |
| `true` | Local development fixture. Data lives in `localStorage`; use only on a developer machine |

Production never falls back silently. If the Supabase values are missing or invalid in production mode, authenticated features surface an explicit error instead of switching adapters.

**Card BIN verification**

`withdraw.html` Luhn-checks a payout card in the browser and looks up its first 6–8 digits (BIN/IIN) before the card can be connected. The lookup only sends the BIN. The returned network, card type, issuer and country are checked against the details the member entered and saved as `payment_accounts.bin_verification`; the full card number and CVV are never sent to the lookup service or returned to the browser.

For a controlled server-side path, deploy the included proxy:

```bash
supabase functions deploy bin-lookup --no-verify-jwt
```

The browser uses `${SUPABASE_URL}/functions/v1/bin-lookup` by default, so no extra environment value is needed. To use a different proxy, set:

```dotenv
BIN_LOOKUP_URL=https://your-proxy.example/lookup
```

The function caches issuer metadata and rate-limits callers. The public `lookup.binlist.net` endpoint does not send CORS headers, so deploy the proxy (or an equivalent backend) before enabling card connections. A successful lookup identifies the issuer only; it does not prove the card is active, belongs to the member or has funds.

**Live chat**

The Brevo Conversations widget is bootstrapped by `js/livechat.js` on every page. The official snippet is not pasted into the HTML because the CSP blocks inline scripts. In the Brevo dashboard, add every domain that serves the site (for example `trumpoffers.com` and `www.trumpoffers.com`) to the Conversations widget's allowed domains. A widget that is disabled for the current host or account shuts itself down after loading; the page itself continues to work. `LIVECHAT_ENABLED=false` removes the widget without changing the CSP; the allowed Brevo origin stays in the CSP so it can be re-enabled without a redeploy of the headers.

---

## 6. Configure Supabase Auth

In **Authentication → URL Configuration**:

- **Site URL:** your canonical origin, e.g. `https://trumpoffers.com`.
- **Redirect URLs:**
  - `https://trumpoffers.com/**` (covers `login.html`, `login.html?mode=update`, `dashboard.html` and any future path)
  - `http://localhost:8080/login.html` and `http://localhost:8080/login.html?mode=update` for local use.

The password reset flow sends the user to `login.html?mode=update`, where `js/pages/login.js` presents the new-password form.

**Production recommendations**

- Enable email confirmation.
- Configure custom SMTP before launch. Supabase's built-in mailer caps the whole project at 2 emails/hour, only reliably delivers to project team addresses, and is not intended for production. See **Email delivery** below.
- Set a minimum password length of 8+ and enable leaked-password protection if available.
- Keep anonymous sign-ins disabled; public application and contact submissions use RPCs and RLS insert policies, not anonymous accounts.

`supabase/config.toml` disables email confirmation only for local development. Dashboard settings take precedence in the hosted project.

### Email delivery (Resend)

Supabase → **Authentication → Emails → SMTP Settings**:

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend API key (`re_…`, server-side only) |
| Sender email | `no-reply@<verified-domain>` |
| Sender name | `Trump Offers` |

Verify the sending domain in Resend first (DKIM + SPF, DMARC recommended). Until it is verified Resend only delivers to your own account address.

Then raise **Authentication → Rate Limits → Emails per hour**. Custom SMTP starts at 30/hour; 100/hour is safe below Resend's throughput. The provider plan's daily cap still applies, so size the Resend plan for expected signup volume.

The branded confirmation and recovery templates are kept in [`supabase/email-templates/`](../supabase/email-templates/) and must be pasted into **Authentication → Emails** or applied through the Management API. A confirmation email should never contain marketing copy, attachments or more than one call to action.

The email-link redirect is driven by `SITE_URL`. If it is left at `http://localhost:8080` in a production build, confirmation and reset links point at the wrong host; `js/config.js` falls back to the browser origin when that mismatch is detected, but the deployment variable should still be corrected.

---

## 7. Create the first administrator

1. Sign up through `register.html` using the address that should own the console.
2. Confirm the email if confirmations are enabled.
3. In the Supabase **SQL editor**, run:

   ```sql
   select public.grant_admin('you@example.com');
   ```

   The function returns the profile UUID and inserts the `admin` role. It is intentionally **not** executable by `anon` or `authenticated`; run it from the SQL editor or a privileged migration only.

4. Sign in at `/admin/login.html`. Non-admin accounts are redirected to the member dashboard with an "administrator access only" notice.

The `handle_new_user` trigger provisions a profile, a `user` role, a reward account and an automatic $30,000 welcome reward for every new auth user. The welcome reward is written to `balance_ledger` with a unique key so it cannot be credited twice. If you are upgrading an existing database, apply `20261114120000_automatic_rewards.sql`; it adds the welcome history for existing accounts without changing their balances.

### Additional administrators

Repeat steps 1–3, or insert directly from the SQL editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from public.profiles where lower(email) = lower('second@example.com')
on conflict do nothing;
```

To revoke administrator access while keeping the member account:

```sql
delete from public.user_roles
where role = 'admin'
  and user_id = (select id from public.profiles where lower(email) = lower('second@example.com'));
```

---

## 8. Storage

Migrations create both buckets. Verify under **Storage**:

| Bucket | Public | Limit | MIME types |
| --- | --- | --- | --- |
| `resumes` | No | 5 MB | PDF, DOC, DOCX |
| `site-media` | Yes | 50 MB | MP4, JPEG, PNG, WebP |

Policies allow public CV uploads under `applications/{uuid}/{filename}`, administrator-only CV reads and deletes, public read of site media, and administrator-only site-media writes. Details and troubleshooting: [STORAGE.md](STORAGE.md).

---

## 9. Seed content

`20261108120800_seed.sql` inserts public site settings and sample vacancies. Review it before production and replace:

- support email, phone, address and office hours;
- social links;
- the intro video URL;
- sample vacancies and salary ranges.

Site settings are editable in **Admin → Website & video**. Vacancies are editable in **Admin → Vacancies**.

If you prefer an empty careers page, delete the sample vacancies after applying the seed:

```sql
delete from public.job_vacancies
where slug in (
  'private-client-advisor',
  'rewards-operations-associate',
  'product-designer-digital-card'
);
```

Deleting a vacancy with applications is blocked by the `on delete restrict` foreign key; close it instead.

---

## 10. Verify the installation

Use a private browser window and check:

1. **Registration** creates a profile, role, reward account and an automatic $30,000 welcome reward (inspect `profiles`, `user_roles`, `reward_accounts`, `balance_ledger`).
2. **Reward** issuance adds the amount to the balance, writes a `reward` ledger row and a notification titled “Reward Added Successfully!”. Issuing the same reward key twice does not credit twice.
3. **Withdrawal** rejects amounts below $100 and invalid card forms; available balance excludes in-flight requests; an approved request completes only after administrator confirmation.
4. **Application** submits with and without a signed-in session, stores a CV under `applications/…`, and tracking matches reference + email only.
5. **Card** creates a 16-digit display number with a valid Luhn check digit; verification returns only the last four digits and never the full number.
6. **Contact** inserts a message visible in the admin inbox.
7. **Admin** status changes generate the expected member notification and activity entry.
8. **RLS**: as member A, a direct API query must not return member B's claims, withdrawals, applications, cards or notifications.

```bash
npm run check     # validates every local href/src/srcset and CSS asset reference
```

---

## 11. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| "The Supabase database is not initialised yet" | The schema has not been applied; run `supabase/combined.sql` in the SQL editor |
| Site cannot reach Supabase | `SUPABASE_URL` or key is empty/invalid in `js/env.js`; run `npm run env` after editing `.env` |
| "Your member profile is not available" | `handle_new_user` trigger missing or user created before migrations; backfill the profile |
| Admin login redirects to the dashboard | Account lacks the `admin` role; run `grant_admin` |
| Password reset link fails | Add `SITE_URL/login.html?mode=update` to Supabase redirect URLs |
| Video upload fails in admin | Uploads require Supabase Storage; confirm the `site-media` bucket exists. A hosted URL always works |
| CV upload denied | Wrong folder prefix, file over 5 MB, or unsupported MIME type |
| CORS / network error against Supabase | Wrong project URL, or the anon key belongs to another project |
| `npm run env` warns "not configured" | The URL must be `https://<ref>.supabase.co`; custom domains need the regex adjusted |
| Console reports blocked inline script | CSP is strict (`script-src 'self'`); do not add inline scripts, use module files |

---

## 12. Resetting a local environment

```bash
supabase db reset                              # local database + migrations + seed
rm -rf .env js/env.js && npm run env           # clear browser config
```

In the browser, clear site data to remove any cached Supabase session. The local development fixture (`DEMO_MODE=true`) can be reset from **Admin → Website & video → Reset local cache**; that control is hidden in production mode.
