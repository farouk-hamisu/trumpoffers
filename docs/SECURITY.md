# Security and data handling

Trump Offers is a rewards, recruitment and digital-card platform. This document describes the security model, what the project deliberately does not do, and the controls to review before any public deployment.

---

## 1. Platform status and disclaimers

Keep the following accurate in any deployment:

- Reward balances and claims are platform records. Money moves only when a payout provider or bank is configured and an administrator confirms settlement.
- Withdrawals are reviewed by an administrator. Approval, processing and completion are separate states; completion must not be marked before the payout is confirmed.
- Bank details submitted for a withdrawal are encrypted at rest with `pgcrypto`. Card details are tokenised by the payment provider and are never stored by Trump Offers.
- Virtual cards are presentation only. The card number is generated for display and verification; it is not a payment instrument. The project never asks for a PIN, CVV, full real card number or online-banking credentials.
- Careers listings in the seed data are illustrative. Replace them with real roles before using the recruitment flow publicly.
- The platform is not a bank, lender, remittance service or financial adviser.

Payment-provider integration is configuration-dependent. When no provider is configured, card connection and provider payouts fail closed with an explicit message rather than reporting false success. Do not remove those messages or the settlement confirmation requirement.

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
| `reward_claims` | Own rows or admin | **RPC only** | Admin | — |
| `withdrawals` | Own rows or admin | **RPC only** | Admin (RPC) | — |
| `withdrawal_methods` | Public when enabled | Admin | Admin | — |
| `crypto_networks` | Public when enabled | Admin | Admin | — |
| `payment_accounts` | Own rows or admin | Own via adapter | Own (revoke) or admin | — |
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

- A partial unique index allows at most one active reward claim per member.
- `profiles` has a `protect_profile_privileges()` trigger that blocks a member from changing their own `status`, `email` or profile `id`, even if an update policy exists. Administrator roles live in `user_roles` and are managed separately.
- `is_admin()` is `security definer` with a pinned `search_path`, avoiding recursive RLS evaluation on `user_roles`.
- Admin-only actions that are not exposed as RPCs (role grants, member deletion) are SQL-editor operations.

### Privileged RPCs

| Function | Callable by | Purpose |
| --- | --- | --- |
| `create_reward_claim()` | `authenticated` | Creates one active reward claim |
| `request_withdrawal(...)` | `authenticated` | Validates amount, method, bank/crypto/card details and available balance; reserves funds and writes status history |
| `admin_update_withdrawal_status(...)` | Admin only | Enforces status transitions, provider confirmation, balance deduction and audit logging |
| `admin_get_withdrawal_details(uuid)` | Admin only | Decrypts bank details for review |
| `admin_add_withdrawal_note(uuid,text)` | Admin only | Writes an internal note and audit entry |
| `submit_job_application(...)` | `anon`, `authenticated` | Submits an application, optionally linking the signed-in user |
| `track_application(text,text)` | `anon`, `authenticated` | Returns limited status for an exact reference + email pair |
| `create_card_application(text,text)` | `authenticated` | Creates a card request with a generated number |
| `verify_demo_card(text,text)` | `anon`, `authenticated` | Returns a public-safe payload for reference + last four |
| `is_admin()` | `anon`, `authenticated` | RLS predicate |
| `next_reference(text)` | No client access | Atomic reference generation; used inside definer RPCs |
| `grant_admin(text)` | No client access | First-admin bootstrap from the SQL editor |

Each RPC uses `security definer`, pins `search_path = public, pg_temp`, validates inputs, derives the user from `auth.uid()` rather than trusting caller-supplied IDs, and has explicit `revoke`/`grant` statements.

`track_application` and `verify_demo_card` intentionally require **two factors** (reference + email, reference + last four). They return only status-level data, never full CVs, full card numbers or other members' records.

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

- **CSP** with `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'` and `upgrade-insecure-requests`.
- **HSTS** (two years, subdomains, preload) once HTTPS is permanent.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy` disabling camera, microphone, geolocation, payment and USB.
- `Cross-Origin-Opener-Policy: same-origin`.

There are no third-party runtime scripts, no external fonts, no CDN images and no service worker. This keeps the attack surface and CSP exceptions small.

If you add analytics, embeds or a payment provider later, update the CSP explicitly and review the privacy notice. Do not weaken `script-src` to `'unsafe-inline'`.

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
- rewards: balance, claims, withdrawals with encrypted bank details, tokenised card references and masked destination labels;
- recruitment: application details and an uploaded CV;
- cards: chosen design, cardholder name, generated display number;
- contact: name, email, phone, subject and message.

Guidelines:

- Do not add fields for full card numbers, PINs, CVVs, government IDs or passwords. Bank account details are accepted only through the withdrawal RPC and stored encrypted.
- The withdrawal form validates IBAN checksums and wallet-address formats. Keep that validation.
- Publish a privacy notice with lawful basis, retention periods, processors (Supabase, hosting, email) and contact details. Review the supplied `privacy.html` with counsel.
- Define CV retention (for example, six months after a decision) and delete objects and records on schedule.
- Support access and deletion requests: delete the auth user to cascade member data; remove stored CVs separately.
- Avoid placing sensitive personal data in internal notes or activity descriptions.
- If you operate in a regulated jurisdiction, assess whether the recruitment and rewards flows trigger additional obligations.

---

## 10. Abuse scenarios and mitigations

| Scenario | Mitigation |
| --- | --- |
| Member tries to read another member's claim/card | RLS scopes rows to `auth.uid()`; admin predicate for staff |
| Member calls an admin mutation directly | No update policy for non-admins; RPCs check ownership; role grants are SQL-only |
| Member forges a claim amount | `create_reward_claim()` ignores client input and reads the account balance |
| Member requests more than available | RPC sums in-flight withdrawals and rejects excess |
| User uploads a CV to a public path | Bucket is private; only admin select policy exists |
| User guesses a card number | Verification requires reference + last four and returns only last four |
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
- [ ] Withdrawal validation rejects invalid IBANs, malformed wallet addresses and missing payout details.
- [ ] Payment provider keys are configured server-side; without them, card connection and provider payouts fail closed.
- [ ] Administrator completion requires explicit payout confirmation and writes an audit entry.
- [ ] Privacy notice, terms and retention policy reviewed.
- [ ] Rate limiting/CAPTCHA considered for public forms.
- [ ] Backups enabled; restore tested.
- [ ] Dependency review: vendored Supabase client version is current; no abandoned third-party code.
- [ ] Incident contacts and rollback procedure documented.

---

## 13. Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Contact the operator of the deployment using the security address published on the site (the seed uses `security@trumpoffers.com`). Include reproduction steps, affected URL, and impact. Allow reasonable time for a fix before disclosure.
