# Administrator guide

The console lives at **`/admin/`** (`admin/index.html`) with a dedicated sign-in at **`/admin/login.html`**. It is a static client, but every read and write is authorised by Supabase Auth and RLS. Hiding a button is never the security boundary.

---

## Access and roles

- A signed-in account needs the `admin` role in `public.user_roles`.
- Unauthenticated visitors are redirected to `admin/login.html` with a `next` parameter.
- Signed-in non-admins are redirected to `../dashboard.html?notice=admin-only`.
- Member accounts can be suspended; the remote adapter checks `profiles.status` on session restore and sign-in, signs the account out, and shows a suspension message.
- The first administrator is created with `select public.grant_admin('you@example.com');` from the Supabase SQL editor. See [SETUP.md](SETUP.md#7-create-the-first-administrator).

**Production mode:** the console is Supabase-only. There are no seeded accounts. Register your administrator through the public registration form, confirm the email, then grant the role from the SQL editor as described in [SETUP.md](SETUP.md#7-create-the-first-administrator). Local preview is available only when a developer explicitly sets `DEMO_MODE=true`.

---

## Layout

- Fixed sidebar on desktop, slide-over drawer on mobile.
- Global **Refresh** button reloads the current view.
- Pending counts appear beside Rewards, Applications, Cards and Messages.
- Hash routing (`#overview`, `#users`, `#rewards`, `#recruitment`, `#applications`, `#cards`, `#messages`, `#settings`) supports deep links and browser back/forward.
- A session card at the bottom of the sidebar shows the signed-in administrator and a sign-out control.

---

## Overview

Displays:

- total members, claims, applications, cards and messages;
- pending application, card and message counts;
- a 180-day chart of claims (gold line) and registrations (dashed ink line);
- recent activity entries.

Use **Refresh figures** after changing data in another tab.

---

## Members

Search by name or email and filter by role (`user` / `admin`) and status (`active` / `suspended`).

The table shows contact details, location, role, status, join date and one action:

- **Suspend** — sets `profiles.status = 'suspended'`. The member is signed out on the next session check and cannot sign in.
- **Reinstate** — returns the account to `active`.

Suspension does not delete data. The console does not expose member deletion or password changes; use the Supabase dashboard for account deletion and Supabase Auth for password recovery. Role changes are intentionally SQL-only to reduce the risk of privilege escalation through the UI.

---

## Rewards & withdrawals

Claims and withdrawals are shown in separate registers with independent search and status filters.

### Reward claims

Statuses: `confirmed → verifying → processing → completed`, plus `cancelled`.

- The member's fixed reward balance is **$30,000**; it is created with the account.
- `create_reward_claim()` permits one active claim per member and assigns a 5–10 hour verification window.
- Opening a claim shows the reference, member, amount, estimate, note, status selector and internal note.
- **Save status** updates the record. Setting `completed` also sets progress to 100, stage 4 and `completed_at`; `processing` sets 64%/stage 3; `verifying` sets 22%/stage 2.
- A database trigger writes a member notification when the status changes. `activity_logs` records the action.

### Withdrawals

Statuses: `pending → reviewing → approved → processing → completed`, plus `rejected` and `cancelled`.

- Requests have a minimum of $100. Bank details are validated and encrypted at rest; crypto addresses are validated per network; card payouts require a tokenised card from the configured provider.
- The register supports search by reference, member, method and destination, plus a status filter.
- Opening a request shows the amount, fee, net payout, payout destination, provider reference, internal note, rejection reason, complete status history and administrative controls.
- **Move to review**, **Approve**, **Mark processing** and **Mark completed** enforce the allowed transition graph. **Reject** requires a reason.
- **Mark completed** requires the administrator to confirm that the payout was settled by the provider, bank or blockchain. The provider reference is recorded. Approval alone never marks funds as sent.
- **Save note** records an internal note without changing the status.
- The RPC deducts the amount from the member's balance only on completion, and writes both status history and an `admin_audit_logs` entry.

There is no automatic status progression. Provider payouts require configured credentials; when a provider is not configured the request remains in review or processing and completion must be confirmed manually.

---

## Vacancies

The register shows title, department, location, type, salary, status and actions.

- **New role** opens a form for title, slug, department, employment type, work mode, location, salary range, currency, summary, description, responsibilities, requirements, benefits, deadline, featured flag and status.
- **Edit** reopens the same form with existing values.
- **Delete** requires confirmation. A vacancy with applications cannot be deleted (`on delete restrict`); close it instead.
- Statuses: `open` (public), `draft` (admin only), `closed` (hidden from the public list and application RPC).

Only `open` vacancies are returned to the public careers page, and `submit_job_application()` rejects applications to non-open roles.

Responsibilities, requirements and benefits are entered one item per line and stored as Postgres text arrays.

---

## Applications

Search and filter the candidate register. Each row opens a detail drawer with:

- reference, candidate, email, phone, location, role, submission time and resume name;
- qualifications and experience;
- **Open resume** — requests a 120-second signed URL and opens it in a new tab;
- status selector and review notes.

Statuses: `submitted → under_review → shortlisted → interview → accepted`, plus `rejected` ("Not selected").

**Save decision** updates the status and notes. Linked member accounts receive a notification; guests can track the same status from `track.html` using reference + email. Review notes are shown on the public tracking result.

CVs are never exposed publicly. See [STORAGE.md](STORAGE.md).

---

## Card requests

Each request shows the selected design, cardholder name, generated number, expiry, status and request date.

- **Approve design** sets `approved`, activates the public verification result and notifies the member. This does **not** create a payment instrument.
- **Decline** sets `rejected` with the decision note.
- The full generated number is visible to administrators for review. The public verification RPC returns only the last four digits.
- New requests start as `submitted`; `under_review` is available through SQL or future automation but the console's two primary actions are approve/decline.

Card numbers are generated in Postgres with a valid Luhn check digit and a `4539` prefix, and are unique. They are display-only and are not payment instruments.

---

## Messages

The inbox shows sender, subject, received time, status and a preview. Opening a message displays the full body and offers:

- **Archive** — status `archived`;
- **Restore to inbox** — status `read`.

Reply by email using the address in the message. The console does not send outbound email. Public submissions are rate-limited only by your Supabase/edge protections; add a CAPTCHA or edge rate limit if spam becomes a problem.

---

## Website & video

This form writes public `site_settings`:

| Setting | Used on |
| --- | --- |
| `site_name`, `tagline` | Header, footer, metadata |
| `support_email`, `support_phone` | Contact page, footer, legal pages |
| `address`, `office_hours` | Contact page and footer |
| `announcement` | Optional site banner |
| `linkedin_url`, `instagram_url` | Footer social links (blank hides them) |
| `intro_video_url` | Homepage introduction film |
| `intro_video_enabled` | Shows/hides the full-screen intro |
| `intro_autoplay` | Autoplay with sound control, or require a play tap |

**Upload MP4** stores the file in the public `site-media` bucket and updates `intro_video_url`. A hosted URL can be used instead.

The **Environment** panel shows whether the console is in development-fixture or Supabase mode, where data is stored, whether the intro is enabled and the app version.

The **Reset local cache** action exists only in the development fixture (`DEMO_MODE=true`) and is hidden in production.

---

## Status reference

| Entity | Values |
| --- | --- |
| Member | `active`, `suspended` |
| Claim | `confirmed`, `verifying`, `processing`, `completed`, `cancelled` |
| Withdrawal | `pending`, `reviewing`, `approved`, `processing`, `completed`, `rejected`, `cancelled` |
| Application | `submitted`, `under_review`, `shortlisted`, `interview`, `accepted`, `rejected` |
| Card | `submitted`, `under_review`, `approved`, `rejected` |
| Message | `new`, `read`, `archived` |
| Vacancy | `open`, `draft`, `closed` |

Changing a status where a trigger exists sends a member notification and records activity. Keep member-facing notes factual; the review note on applications and the decision note on cards are visible to the member.

---

## Operational routine

**Daily**

- Review new messages and pending applications.
- Advance claims and withdrawals that are due.
- Check card requests and approve or decline with a useful note.

**Weekly**

- Audit the member register for unexpected administrator roles.
- Close expired vacancies and update deadlines.
- Confirm the intro video still loads on mobile.

**Monthly**

- Review Supabase Auth users, storage usage and database size.
- Delete CVs past the retention period.
- Check the security and dependency checklist in [SECURITY.md](SECURITY.md).

---

## Keyboard and accessibility

- All dialogs close with `Escape` and trap focus while open.
- The mobile drawer closes with `Escape`, the backdrop, or after navigation.
- Tables have column headers; form controls have labels; status changes announce via toast.
- Avoid pasting unredacted personal data into internal notes.

---

## Common questions

**Why can't I change a member's role in the console?**
Role grants are deliberately SQL-only. Use `grant_admin` / a direct `user_roles` statement from the SQL editor. This keeps privilege escalation out of a browser session.

**Why doesn't the claim progress move by itself?**
The estimate is an informational window. An administrator advances the status. This is intentional so the register stays predictable and auditable.

**Why is a withdrawal amount unavailable?**
The RPC subtracts all `pending`, `reviewing`, `approved` and `processing` withdrawals from the balance. Complete or reject earlier requests to free the amount.

**Can I delete a member?**
Not from the console. Delete the auth user in Supabase; cascades remove the profile, reward account, claims, withdrawals, notifications and card requests. Applications keep their record with `user_id` set to null.

**Where do notifications appear?**
The member dashboard bell/list and the notification panel (`dashboard.html#notifications`). They are created by status-change triggers and by the RPCs that create records.
