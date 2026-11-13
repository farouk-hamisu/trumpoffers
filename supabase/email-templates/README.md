# Auth email templates

These are the branded Supabase Auth templates used by Trump Offers. They are
stored here for review and version history; Supabase does not read this folder
at runtime. Apply them in **Authentication → Emails** or with the Management
API (`PATCH /v1/projects/<ref>/config/auth`).

| File | Supabase field |
| --- | --- |
| `confirmation.html` | `mailer_templates_confirmation_content` |
| `recovery.html` | `mailer_templates_recovery_content` |

Matching subjects:

- Confirmation: `Confirm your Trump Offers account`
- Recovery: `Reset your Trump Offers password`

## Rules

- Keep Go template variables intact: `{{ .ConfirmationURL }}` is the action
  link. `{{ .Token }}`, `{{ .Email }}` and `{{ .SiteURL }}` are also available.
- Inline styles only — no external CSS, fonts or images.
- One call to action, no marketing copy, no attachments. Supabase advises
  against mixing auth mail with promotional content.
- Never include passwords, card data, PINs or one-time codes in the template.
- Test both templates after any SMTP change by registering with a disposable
  address and completing the confirmation and reset flows.
