# Security and data handling

Trump Offers is a rewards, recruitment and digital-card platform. This document describes the security model, what the project deliberately does not do, and the controls to review before any public deployment.

---

## 1. Platform status and disclaimers

Keep the following accurate in any deployment:

- Reward balances and reward credits are platform records. Money moves only when a payout provider or bank is configured and an administrator confirms settlement.
- Rewards are credited automatically during provisioning. `private.credit_reward()` updates the balance, writes a `reward` entry to `balance_ledger`, sends the member a notification and records activity. An idempotency key prevents duplicate credits.
- Withdrawals are reviewed by an administrator. Approval, processing and completion are separate states; completion must not be marked before the payout is confirmed.
- **Connect Your Card** is the only withdrawal method. Manual payout cards are stored with the full number encrypted in the private schema (`private.payment_card_secrets`); public tables hold only the brand, last four and expiry. When a hosted card provider is configured, tokenised provider references are used instead.
- Before a payout card is connected, the browser Luhn-checks the number and resolves its BIN/IIN through the project's `bin-lookup` Edge Function (or a configured proxy), which calls `lookup.binlist.net` server-side. Only the first 6–8 digits leave the browser; the full number and CVV never do. A match only identifies the issuer, network, card type and country. The non-sensitive result is saved as `payment_accounts.bin_verification` and checked for consistency before the encrypted number is stored. A BIN hit is **not** proof that the card is active, belongs to the member or has funds.
- Structured responses to the administrator-managed card form (bank name, phone number and any added fields) live in `payment_accounts.extra` and are snapshotted into the encrypted withdrawal details at request time. `card_form_fields` defines the member-facing fields and is writable only through administrator RPCs.
- Virtual membership cards are presentation only. The card number is generated for display and verification; it is not a payment instrument. The project never asks for a PIN, CVV, online-banking password or full banking credentials. A real payout card number is accepted only through the dedicated encrypted card-connect form.
- Expiry dates are enforced at two points: `connect_payment_card` rejects a card whose expiry has already passed, and `request_withdrawal` re-checks the stored expiry so a card that expired after it was connected cannot be used. A card stays valid through the last day of its expiry month. The system trusts the expiry the member enters; it cannot confirm the printed date or whether the issuer has cancelled the card.
- Payout card numbers are never returned to members after connection. Only an administrator can decrypt a card, through `admin_get_payment_card(uuid)`, and every reveal is written to `admin_audit_logs`.
- Careers listings in the seed data are illustrative. Replace them with real roles before using the recruitment flow publicly.
- The platform is not a bank, lender, remittance service or financial adviser.

Payment-provider integration is configuration-dependent. When no hosted provider is configured, members can still connect a payout card manually; the number is encrypted and used for administrator-reviewed card withdrawals. Payout settlement still requires a provider, bank or manual operations confirmation. Do not report provider success unless it occurred, and do not remove the settlement confirmation requirement.

---

## 2. Trust boundaries

```text
Browser (static site + anon key)
   │  Supabase Auth JWT
   ▼
PostgREST / Storage / RPCs  ──  RLS + security-definer functions
   │
   ▼
PostgreSQL
```

- The **anon key is public by design**. It only grants what RLS allows.
- The **service-role key bypasses RLS** and must never appear in this repository, `.env` used for a static build, `js/env.js`, or any browser bundle.
- The admin UI guard is a usability feature. The real authorization boundary is `public.is_admin()` in RLS policies and the role checks inside privileged RPCs.
- Storage policies are part of the same boundary; a guessed object path does not grant access to a private bucket.

---

## 3. Authentication

- Supabase Auth handles password hashing, sessions, refresh tokens and password reset.
- Email/password is the only enabled method. Anonymous sign-ins are disabled.
- Sessions persist in the browser via the Supabase client; sign-out revokes the local session.
- `profileFor()` loads the profile and roles after sign-in. Suspended accounts are signed out immediately, and the remote adapter refuses to continue when `profiles.status !== 'active'`.
- Password reset responses are deliberately generic ("if that address is registered…") to avoid account enumeration.
- Login supports a `next` parameter; `safeNext()` restricts redirects to same-site relative paths, preventing open redirects.

**Recommendations for production**

- Enable email confirmation and a custom SMTP provider.
- Set a minimum password length of at least 8, ideally 12, and enable leaked-password protection.
- Consider MFA for administrator accounts (Supabase supports TOTP).
- Review Auth logs for repeated failures and unusual sign-up bursts.
- Never seed the preview credentials into a live project.

---

## 4. Authorization and RLS

RLS is enabled on every public table. Summary:

| Table | Select | Insert | Update | Delete |
| --- | --- | --- | --- | --- |
| `profiles` | Own row or admin | Admin | Own row or admin | Admin |
| `user_roles` | Own roles or admin | Admin | Admin | Admin |
| `reward_accounts` | Own row or admin | Via provisioning trigger | Admin | — |
| `reward_claims` | Own rows or admin (legacy) | — | Admin | — |
| `withdrawals` | Own rows or admin | **RPC only** | Admin (RPC) | — |
| `withdrawal_methods` | Public when enabled | Admin | Admin | — |
| `crypto_networks` | Public when enabled | Admin | Admin | — |
| `payment_accounts` | Own rows or admin | Hosted-provider token only; manual cards via **RPC** | Admin (revoke via RPC) | — |
| `card_form_fields` | Enabled rows for members; all for admin | Admin (RPC) | Admin (RPC) | Admin (RPC) |
| `balance_ledger` | Own reward/settlement entries or admin | **RPC only** | — | — |
| `private.payment_card_secrets` | No client access | Via RPC | — | — |
| `withdrawal_status_history` | Own rows or admin | Via RPC/trigger | — | — |
| `admin_audit_logs` | Admin | Via RPC | — | — |
| `notifications` | Own rows or admin | Via triggers/RPCs | Own (mark read) | — |
| `activity_logs` | Own rows or admin | Via triggers/RPCs | — | — |
| `job_vacancies` | Public when `open`, all for admin | Admin | Admin | Admin |
| `job_applications` | Own rows or admin | **RPC only** | Admin | — |
| `card_applications` | Own rows or admin | **RPC only** | Admin | — |
| `contact_messages` | Admin | Public insert | Admin | Admin |
| `site_settings` | Public when `is_public` | Admin | Admin | Admin |
| `reference_sequences` | No client access | No | No | No |

Additional controls:

- A unique index on `balance_ledger.idempotency_key` prevents duplicate reward credits. Members cannot see internal reservation/release rows; administrators see the full ledger.
- `profiles` has a `protect_profile_privileges()` trigger that blocks a member from changing their own `status`, `email` or profile `id`, even if an update policy exists. Administrator roles live in `user_roles` and are managed separately.
- `is_admin()` is `security definer` with a pinned `search_path`, avoiding recursive RLS evaluation on `user_roles`.
- Admin-only actions that are not exposed as RPCs (role grants, member deletion) are SQL-editor operations.

### Privileged RPCs

| Function | Callable by | Purpose |
| --- | --- | --- |
| `admin_issue_reward(uuid,numeric,text,text)` | Admin only | Credits a reward, writes the ledger, notification and audit entries; rejects duplicate keys |
| `request_withdrawal(...)` | `authenticated` | Card-only: validates amount, connected card, dynamic responses and available balance; reserves funds and writes status history and a reservation ledger entry |
| `admin_update_withdrawal_status(...)` | Admin only | Enforces status transitions, explicit settlement confirmation, balance deduction and ledger/audit entries |
| `admin_get_withdrawal_details(uuid)` | Admin only | Decrypts the saved card and form responses for review |
| `admin_add_withdrawal_note(uuid,text)` | Admin only | Writes an internal note and audit entry |
| `get_card_form_fields()` | `authenticated` | Returns enabled card form fields in display order |
| `connect_payment_card(text,text,integer,integer,text,boolean,jsonb,jsonb)` | `authenticated` | Validates and Luhn-checks a payout card, validates dynamic responses and BIN metadata consistency, stores the encrypted number privately and returns only masked account data |
| `admin_list_payment_cards()` | Admin only | Lists payout cards with member details, masked card data and saved form responses |
| `admin_get_payment_card(uuid)` | Admin only | Decrypts one payout card and writes an audit entry |
| `admin_revoke_payment_card(uuid)` | Admin only | Revokes a payout card, notifies the member and writes an audit entry |
| `admin_list_card_form_fields()` | Admin only | Lists every card form field, including disabled fields |
| `admin_create_card_form_field(...)` | Admin only | Creates a card form field and writes an audit entry |
| `admin_update_card_form_field(...)` | Admin only | Updates a card form field and writes an audit entry |
| `admin_delete_card_form_field(uuid)` | Admin only | Deletes a card form field and writes an audit entry |
| `submit_job_application(...)` | `anon`, `authenticated` | Submits an application, optionally linking the signed-in user |
| `track_application(text,text)` | `anon`, `authenticated` | Returns limited status for an exact reference + email pair |
| `create_card_application(text,text)` | `authenticated` | Creates a card request with a generated number |
| `verify_demo_card(text,text)` | `anon`, `authenticated` | Returns a public-safe payload for reference + last four |
| `is_admin()` | `anon`, `authenticated` | RLS predicate |
| `next_reference(text)` | No client access | Atomic reference generation; used inside definer RPCs |
| `grant_admin(text)` | No client access | First-admin bootstrap from the SQL editor |

Each RPC uses `security definer`, pins `search_path = public, pg_temp`, validates inputs, derives the user from `auth.uid()` rather than trusting caller-supplied IDs, and has explicit `revoke`/`grant` statements.

`track_application` and `verify_demo_card` intentionally require **two factors** (reference + email, reference + last four). They return only status-level data, never full CVs, virtual card numbers or other members' records.

Payout cards are different from the virtual membership card studio. `connect_payment_card` stores the full number only in `private.payment_card_secrets`, encrypted with `private.payment_key()`, and never returns it to the member. `admin_get_payment_card` is the sole decryption path and requires `public.is_admin()`. Duplicate active cards for the same member are rejected by the fingerprint check.

Card form fields are configuration, not trusted input. `card_form_fields` is writable only through the administrator RPCs; members can read enabled rows and submit responses, which the server validates against the field definitions before saving to `payment_accounts.extra`. The fixed core fields (card number, expiry, cardholder) are never configurable. A database trigger rejects CVV, CVC, PIN, password, security-code and SSN fields by key or label; `private.validate_card_extra()` rejects the same keys in submitted responses, and the sensitive-field migration removes existing rows and scrubs stored snapshots.

Withdrawals use a reservation model. `request_withdrawal` checks the member's balance minus all active withdrawals, then writes a `reservation` row to `balance_ledger`. Rejection or cancellation writes a `release` row. Only confirmed settlement writes a `settlement` row and debits `reward_accounts.balance`. Members can read their own ledger rows; inserts happen only inside the security-definer RPCs.

> **PCI DSS note.** Storing card numbers directly brings the deployment into PCI DSS scope. Use a hosted, tokenising provider wherever possible. If manual payout cards are enabled, restrict database and backup access to trusted operators, keep `private.payment_key()` out of client code and logs, preserve audit-log retention, and never allow card numbers in notes, email, chat or application logs. Rotating `private.payment_key()` makes existing encrypted card numbers unreadable.

### What RLS does not solve

- Rate limiting and abuse prevention. Add CAPTCHA/Turnstile or edge rate limits to contact, applications and tracking if the site is public.
- Malicious content in text fields. The UI escapes output; do not render user text with `innerHTML` without `escapeHTML()`.
- Email deliverability or spam inboxes.
- Denial-of-service against public RPCs. Use hosting/Supabase protections.

---

## 5. Input handling and XSS

- User-controlled strings are passed through `escapeHTML()` before insertion into templates. The codebase does not use a client-side templating engine with automatic escaping, so this discipline matters.
- Attribute values are escaped where interpolated; links built from user data use `encodeURIComponent`.
- Forms validate on the client for UX, and the RPCs validate again on the server. Never rely on the client check alone.
- File names are sanitised before storage paths are built. Upload paths are constrained by storage policies.
- Modals and drawers create DOM from templates but do not evaluate scripts.
- `safeNext()` prevents off-site redirects from `?next=` values.

When adding features:

- Prefer `textContent` for user values.
- Never inject HTML from a database field unless it is sanitised and intentionally trusted.
- Treat `site_settings` edited by admins as trusted content, but still escape it in public pages unless HTML is explicitly supported.
- Do not add inline event handlers or inline scripts; the CSP blocks them.

---

## 6. Storage security

| Bucket | Read | Write | Notes |
| --- | --- | --- | --- |
| `resumes` | Admin only | Public upload under `applications/*` | Private; admin signed URLs expire after 120 seconds |
| `site-media` | Public | Admin only | Intro video and campaign media |

- CV uploads are limited to PDF/DOC/DOCX and 5 MB by both client and bucket policy.
- There is no public list, update or delete on `resumes`.
- Object names include a UUID folder, reducing collisions and guessability. Path secrecy is not the security control; RLS is.
- Signed URLs should never be logged, stored or shared outside the admin session.

See [STORAGE.md](STORAGE.md) for policies, lifecycle and troubleshooting.

---

## 7. Transport and browser hardening

Deployment configs set:

- **CSP** with `default-src 'self'`, `script-src 'self' https://conversations-widget.brevo.com`, `frame-src https://conversations-widget.brevo.com`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'` and `upgrade-insecure-requests`.
- **HSTS** (two years, subdomains, preload) once HTTPS is permanent.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` disabling camera, microphone, geolocation, payment and USB.
- `Cross-Origin-Opener-Policy: same-origin`.

Apart from the Brevo Conversations live-chat loader, there are no third-party runtime scripts, no external fonts, no CDN images and no service worker. The live chat is bootstrapped by the local `js/livechat.js`; the official inline snippet is not used because inline scripts are blocked. Only the Conversations widget origin is allowed, and the CSP does not permit its other CDN hosts or inline scripts. Set `LIVECHAT_ENABLED=false` in the public environment to remove it.

Brevo's loader is third-party code. Review its privacy and security posture before enabling it, keep the widget ID in `js/livechat.js` or the public environment, and do not add `'unsafe-inline'` to `script-src` or a wildcard `*.brevo.com` allowlist to make it work. If you add analytics, embeds or a payment provider later, update the CSP explicitly and review the privacy notice.

---

## 8. Secrets and configuration

| Secret | Where it belongs |
| --- | --- |
| Supabase URL | Public; `js/env.js` / hosting env |
| Supabase anon key | Public; `js/env.js` / hosting env |
| Supabase service-role key | **Never in this project's client build**; server/SQL only |
| SMTP credentials | Supabase dashboard / hosting secret store |
| Admin passwords | Password manager; never in source, tickets or screenshots |

Practices:

- Keep `.env` out of version control (`.gitignore` covers it).
- Rotate the anon key only if abused; rotating it requires a rebuild.
- Do not commit real customer data, CVs or exports.
- Review `git diff` before publishing; deployment history is often public on static hosts.
- Use separate Supabase projects for staging and production.

---

## 9. Privacy and data minimisation

Collected data:

- account: name, email, phone (optional), location (optional), password hash (Supabase);
- rewards: balance, reward credits, withdrawals with encrypted card and form-response details, tokenised card references and masked destination labels;
- recruitment: application details and an uploaded CV;
- cards: chosen design, cardholder name, generated display number;
- payout cards: cardholder name, brand, last four, expiry, administrator-defined form responses (for example bank name and phone number) and an encrypted full number for administrator-reviewed card withdrawals;
- contact: name, email, phone, subject and message.

Guidelines:

- Do not add fields for PINs, CVVs, government IDs or banking passwords. Card and withdrawal details are accepted only through the RPCs and stored encrypted. Payout card numbers are accepted only through `connect_payment_card` and stored encrypted in the private schema.
- The card form validates Luhn check digits, expiry dates and each administrator-defined field client-side and again in the RPC. Keep both layers; the browser checks are a convenience, not the security boundary.
- Do not place full card numbers, CVVs or banking passwords in card form fields, internal notes, email or chat. The configured fields are for ordinary payout-routing details only.
- Publish a privacy notice with lawful basis, retention periods, processors (Supabase, hosting, email) and contact details. Review the supplied `privacy.html` with counsel.
- Define CV retention (for example, six months after a decision) and delete objects and records on schedule.
- Support access and deletion requests: delete the auth user to cascade member data; remove stored CVs separately.
- Avoid placing sensitive personal data in internal notes or activity descriptions.
- If you operate in a regulated jurisdiction, assess whether the recruitment and rewards flows trigger additional obligations.

---

## 10. Abuse scenarios and mitigations

| Scenario | Mitigation |
| --- | --- |
| Member tries to read another member's reward or card | RLS scopes rows to `auth.uid()`; admin predicate for staff |
| Member calls an admin mutation directly | No update policy for non-admins; RPCs check ownership; role grants are SQL-only |
| Member tries to credit their own balance | Only `private.credit_reward()` and `admin_issue_reward()` can write reward entries; both are controlled server-side and the admin RPC checks `is_admin()` |
| Member requests more than available | RPC sums in-flight withdrawals and rejects excess |
| Member tries to mark their own withdrawal successful | `withdrawals` updates are admin-only; settlement requires `admin_update_withdrawal_status` with explicit provider confirmation |
| Member submits a duplicate withdrawal or reconnects the same card | 60-second idempotency/duplicate guard on requests and an encrypted-fingerprint duplicate check on cards |
| Member tries to connect an invalid or unmatched card | Client Luhn + BIN check, then server-side Luhn, expiry, duplicate, brand/type/issuer consistency and dynamic-field validation; failures block the connection |
| BIN lookup is abused to enumerate cards | Only the first 6–8 digits are sent; lookups are cached and rate-limited in the browser and per caller at the edge |
| BIN hit is mistaken for an authorised card | UI and documentation state that a lookup identifies the issuer only; withdrawals still require administrator settlement confirmation |
| Member tries to withdraw to an expired card | The card list marks expired cards, blocks their selection and `request_withdrawal` re-checks the stored expiry server-side |
| User uploads a CV to a public path | Bucket is private; only admin select policy exists |
| User guesses a virtual card number | Verification requires reference + last four and returns only status-level data |
| Member tries to read a stored payout card | RLS exposes masked metadata only; full numbers live in `private.payment_card_secrets` with no API grant |
| Administrator reveals a payout card | Decryption is admin-only and writes an `admin_audit_logs` entry |
| User enumerates applications | Tracking requires exact reference + matching email and returns limited fields |
| Spam contact/application submissions | Add CAPTCHA/rate limiting at the edge; monitor inbox volume |
| XSS through a message or note | Escape all output; CSP blocks inline scripts |
| Stolen anon key | It is public and constrained by RLS; rotate if abused and review policies |
| Stolen admin session | Short session lifetime, sign-out, MFA recommended, monitor Auth logs |
| Open redirect via `?next=` | `safeNext()` restricts to same-site paths |

---

## 11. Incident response

1. **Contain** — suspend affected accounts, rotate the anon key if needed, disable sign-ups, revoke sessions.
2. **Assess** — review Supabase Auth, API and Storage logs; identify affected tables and objects.
3. **Preserve** — export relevant audit records; do not destroy evidence.
4. **Notify** — follow applicable breach-notification rules and your privacy policy; contact affected users if personal data was exposed.
5. **Remediate** — fix the policy/function, add a regression test, redeploy, and re-run the RLS checks.
6. **Review** — document cause, impact and follow-up actions.

A service-role key in client code is a critical incident: rotate it immediately, audit all writes, and assume full database access.

---

## 12. Pre-launch security checklist

- [ ] `.env` is untracked; no service-role key anywhere in the repo or built output.
- [ ] Production Supabase project is separate from staging.
- [ ] Migrations applied in order; `grant_admin` is not executable by `anon`/`authenticated`.
- [ ] At least one real administrator; preview credentials absent.
- [ ] Email confirmation and SMTP configured; reset redirect URLs correct.
- [ ] RLS smoke test: member A cannot read member B's claims, withdrawals, applications, cards or notifications.
- [ ] CV bucket private; signed URL expiry short; no public listing.
- [ ] Site-media writes restricted to admins.
- [ ] CSP, HSTS, nosniff, frame denial and permissions policy present in production.
- [ ] No inline scripts added; console clean on every page.
- [ ] Withdrawal validation rejects missing connected cards, invalid Luhn/expiry values, missing required dynamic fields and amounts above the available balance.
- [ ] Payout-card verification rejects Luhn failures, unknown BINs, issuer/network/country mismatches, sends only the BIN to the lookup service and saves no full number in `bin_verification`.
- [ ] Expired payout cards cannot be connected and cannot be used for a withdrawal; the card list marks them, blocks selection and `request_withdrawal` re-checks the stored expiry.
- [ ] `card_form_fields` changes are audited; only `admin_*` RPCs can write them and members can read enabled rows only.
- [ ] CVV/CVC/PIN/password fields cannot be created, submitted or stored; the sensitive-field trigger is installed and stored responses contain no sensitive keys.
- [ ] `balance_ledger` records reservation, release and settlement entries; settlement debits the balance and rejection/cancellation does not.
- [ ] Payment provider keys are configured server-side when hosted-card connection or automated settlement is required. Without them, manual payout cards remain available and provider payouts fail closed.
- [ ] `private.payment_card_secrets` has no grants to `anon` or `authenticated`; only the audited admin RPC decrypts card numbers.
- [ ] Administrator completion requires explicit payout confirmation and writes an audit entry.
- [ ] Privacy notice, terms and retention policy reviewed.
- [ ] Rate limiting/CAPTCHA considered for public forms.
- [ ] Backups enabled; restore tested.
- [ ] Dependency review: vendored Supabase client version is current; no abandoned third-party code.
- [ ] Incident contacts and rollback procedure documented.

---

## 13. Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the operator of the deployment using the security address published on the site (the seed uses `security@trumpoffers.com`). Include reproduction steps, affected URL, and impact. Allow reasonable time for a fix before disclosure.
