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
- Hash routing (`#overview`, `#users`, `#rewards`, `#recruitment`, `#applications`, `#cards`, `#payouts`, `#cardform`, `#messages`, `#settings`) supports deep links and browser back/forward.
- A session card at the bottom of the sidebar shows the signed-in administrator and a sign-out control.

---

## Overview

Displays:

- total members, reward credits, applications, cards and messages;
- pending application, card and message counts;
- a 180-day activity chart and registrations;
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

Reward credits, legacy claims and withdrawals are shown in separate registers with independent search and status filters.

### Rewards

Rewards are credited automatically. Members do not submit a claim.

- Every new account receives a **$30,000 welcome reward** during provisioning.
- **Issue reward** opens a form to choose a member, enter an amount and add a description. The reward is added to the balance immediately.
- Each credit writes a `balance_ledger` row with a unique idempotency key, a member notification titled **Reward Added Successfully!**, an activity entry and an admin audit entry.
- The **Reward credits** register lists automatic and manual credits with member, description, amount, date and balance after.
- The legacy claim register remains available for historical records only. New claims are not created.

### Withdrawals

Statuses: `pending → reviewing → approved → processing → completed`, plus `rejected` and `cancelled`.

- **Connect Your Card** is the only member-facing withdrawal method. Bank transfer and cryptocurrency methods are retired; historical rows keep their original values.
- Requests have a minimum of $100. A request can only use an active card the member has connected and verified; the request captures a masked snapshot of that card and the dynamic form responses submitted with it.
- The register supports search by reference, member, method and destination, plus a status filter.
- Opening a request shows the amount, fee, net payout, card destination, saved bank/phone/extra responses, provider reference, internal note, rejection reason, complete status history and administrative controls. Card withdrawals also offer **Reveal full card**, which decrypts the stored number and writes an audit entry.
- **Move to review**, **Approve request**, **Start processing** and **Confirm payment & mark successful** enforce the allowed transition graph. **Reject** requires a reason and releases the reserved amount.
- **Confirm payment & mark successful** requires the administrator to tick the settlement confirmation box and record the provider reference. Approval never marks a request successful on its own; only confirmed settlement does.
- **Save note** records an internal note without changing the status.
- The RPC deducts the amount from the member's balance only on settlement, and writes status history, a `balance_ledger` settlement entry and an `admin_audit_logs` entry. Rejections and cancellations write a release entry instead.
- Members see simplified labels: **Pending**, **Processing**, **Successful**, **Declined** or **Cancelled**. The badge changes to **Successful** only after confirmed settlement.
- The member confirmation screen shows **Funds Sent Successfully!** only when the request is `completed`. A newly submitted request shows **Withdrawal Submitted**.

There is no automatic status progression. Provider payouts require configured credentials; when a provider is not configured the request remains in review or processing and completion must be confirmed manually.

### Payout cards

The **Payout cards** view lists every card members have connected for card withdrawals.

- Cards are shown masked by default: member, cardholder, network, last four, expiry, status and connection date. Search covers member, email, cardholder, label and last four.
- **Reveal** decrypts the full number through `admin_get_payment_card()`. Every reveal is recorded in `admin_audit_logs`; never copy the number into notes, email or chat.
- **Revoke** marks the card unusable for new requests, clears its default flag, notifies the member and writes an audit entry. Existing withdrawal requests keep their masked snapshot.
- CVV, PIN, passwords and online-banking credentials are never collected. Do not ask members to send card details by email or chat; send them to the withdrawal desk card form.
- Members can keep up to five active payout cards. Duplicate cards for the same member are rejected by the RPC.

### Card form fields

The **Card form fields** view controls the extra fields members complete when they connect a payout card. Changes take effect immediately without a redeploy.

- Add, edit, enable/disable or delete a field. Each field has a label, key, input type (`text`, `tel`, `number`, `email` or `textarea`), placeholder, helper text, required flag, maximum length and display order.
- The seeded fields are **Bank name** (required), **Phone number** (required) and **Bank account country** (optional). Card number, expiry and cardholder name remain fixed secure core fields and cannot be removed here.
- Field keys are generated from the label when left blank. Keys must be unique and are immutable after creation so existing saved responses stay readable.
- Validation runs in the member browser and again in `connect_payment_card()`; an administrator cannot weaken server-side LEN/Luhn, expiry or required-field checks from this screen.
- Deleting a field removes it from the member form but keeps responses already saved on connected cards and withdrawal snapshots.

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
| Legacy claim | `confirmed`, `verifying`, `processing`, `completed`, `cancelled` |
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
- Advance withdrawals that are due and confirm payment only after settlement.
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

**Do members need to claim rewards?**
No. Rewards are credited automatically. An administrator can issue an extra reward from **Rewards & withdrawals → Issue reward**, and every credit is recorded in the reward ledger.

**Why is a withdrawal amount unavailable?**
The RPC subtracts all `pending`, `reviewing`, `approved` and `processing` withdrawals from the balance. Complete or reject earlier requests to free the amount.

**Can I delete a member?**
Not from the console. Delete the auth user in Supabase; cascades remove the profile, reward account, claims, withdrawals, notifications and card requests. Applications keep their record with `user_id` set to null.

**Where do notifications appear?**
The member dashboard bell/list and the notification panel (`dashboard.html#notifications`). They are created by status-change triggers and by the RPCs that create records.
