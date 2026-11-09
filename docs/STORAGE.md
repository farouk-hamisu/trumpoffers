# Storage

Trump Offers uses two Supabase Storage buckets. Both are declared in `supabase/migrations/20261108120700_storage.sql`; no manual bucket creation is required if the migrations ran successfully.

| Bucket | Visibility | Size limit | Allowed MIME types | Used by |
| --- | --- | --- | --- | --- |
| `resumes` | Private | 5 MB | PDF, DOC, DOCX | Job applications |
| `site-media` | Public | 50 MB | MP4, JPEG, PNG, WebP | Introduction film and campaign media |

Storage RLS is enabled by Supabase on `storage.objects`; the migration adds narrowly scoped policies.

---

## Resumes

### Upload path

```text
resumes/applications/<uuid>/<sanitised-filename>
```

The client generates the UUID (`crypto.randomUUID()`), so each submission gets an isolated folder. The filename is sanitised to remove path separators and unsafe characters. Uploads are non-upserting: an existing object is never overwritten.

### Policies

| Policy | Role | Operation | Rule |
| --- | --- | --- | --- |
| `resumes_public_upload` | `anon`, `authenticated` | `insert` | Bucket is `resumes` and the first folder is `applications` |
| `resumes_admin_read` | `authenticated` | `select` | Bucket is `resumes` **and** `public.is_admin()` |
| `resumes_admin_delete` | `authenticated` | `delete` | Bucket is `resumes` **and** `public.is_admin()` |

There is deliberately **no public read policy and no update policy**. A candidate may upload but cannot list, read, replace or delete files. Administrators read a CV through a short-lived signed URL.

### Reading a CV in the console

`js/lib/remote.js → getResumeUrl(path)` calls:

```js
supabase.storage.from('resumes').createSignedUrl(path, 120)
```

The URL expires after **120 seconds**. The admin application drawer opens it in a new tab with `rel="noopener"`. Because signed URL creation is authorised by the admin's own JWT and the storage select policy, a stolen path alone is not enough to read a CV.

### Upload limits and validation

The client checks extension and size before upload (`js/pages/apply.js`):

- extensions: `.pdf`, `.doc`, `.docx`
- maximum: 5 MB

The bucket enforces the same MIME allow-list and 5 MB limit server-side. Supabase also enforces the project-wide storage limit. If you raise the bucket limit, update `MAX_BYTES` and the bucket definition together.

The application record stores `resume_path`, `resume_name`, `resume_mime` and `resume_size`. These metadata fields are visible only to the applicant and administrators.

### Data lifecycle

CVs contain personal data. At minimum:

- Keep the bucket private.
- Do not email or copy CVs outside the console.
- Delete CVs for rejected or withdrawn applications according to your retention policy.
- When deleting an application, delete the stored object first.

Administrators can remove an object only through the service role, the dashboard, or a privileged function. The console currently supports downloading, not deleting, stored CVs.

---

## Site media

### Introduction film

The homepage video is controlled by three `site_settings` keys:

| Key | Value |
| --- | --- |
| `intro_video_url` | Relative path or absolute URL, e.g. `assets/videos/trump-intro.mp4` |
| `intro_video_enabled` | `true` / `false` |
| `intro_autoplay` | `true` / `false` |

There are two supported sources:

1. **Bundled or hosted URL** — set `intro_video_url` in **Admin → Website & video**. A relative path resolves against the site root; an absolute HTTPS URL is used as-is.

   If you host the film on a third-party CDN, add that origin to `media-src` in the CSP (`_headers` / `vercel.json`) or the browser will block playback in production.
2. **Direct upload** — in a Supabase-backed deployment, choose an MP4 in the admin settings form. `uploadIntroVideo()` writes to:

   ```text
   site-media/intro/<timestamp>-<sanitised-filename>
   ```

   with `contentType: video/mp4` and `upsert: false`, then stores the public URL in `intro_video_url`.

Uploads are limited to MP4 and 50 MB. The bundled film is a silent 1280×720 H.264 MP4 and is a good size reference. Keep the file under ~10 MB for fast starts on mobile data; compressing with a lower bitrate is preferable to shortening the film.

### Policies

| Policy | Role | Operation | Rule |
| --- | --- | --- | --- |
| `site_media_public_read` | `anon`, `authenticated` | `select` | Bucket is `site-media` |
| `site_media_admin_insert` | `authenticated` | `insert` | Bucket is `site-media` and `public.is_admin()` |
| `site_media_admin_update` | `authenticated` | `update` | Bucket is `site-media` and `public.is_admin()` |
| `site_media_admin_delete` | `authenticated` | `delete` | Bucket is `site-media` and `public.is_admin()` |

Only administrators may write. Public objects are served from the project's storage CDN over HTTPS. Old uploads are not deleted automatically; remove obsolete files from the dashboard if storage usage matters.

### Replacing the film

1. Upload the new MP4 in **Admin → Website & video** (or set a URL).
2. Save configuration and open the homepage in a private window.
3. Confirm the film plays, the skip control works, and the fallback poster appears if the video cannot load.

The overlay remembers a per-session dismissal and respects `prefers-reduced-motion`; it never blocks access to the page content permanently. Mobile browsers may block autoplay with sound, so the player starts muted and exposes a sound control.

---

## Bucket verification

Run in the SQL editor:

```sql
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('resumes', 'site-media');

select policyname, cmd, roles
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like any (array['resumes%', 'site_media%'])
order by policyname;
```

Expected: two buckets and seven policies.

To list objects as an administrator from the dashboard, open **Storage → resumes → applications**. A normal member session should not see the bucket contents at all.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `new row violates row-level security policy` on CV upload | Path does not start with `applications/`, or bucket name is wrong | Keep the generated `applications/<uuid>/<file>` path |
| `mime type ... is not supported` | File is not PDF/DOC/DOCX, or browser sent `application/octet-stream` | Use a supported file; on unusual systems set the correct file association |
| `The resource already exists` | Filename collision in the same UUID folder | Retry; the client generates a fresh UUID per submission |
| Admin CV link returns 400/403 | Session expired, or the signed URL is older than 120 seconds | Refresh the application drawer |
| Video upload button disabled | Supabase Storage is not available | Confirm the `site-media` bucket exists, or enter a hosted video URL |
| Video upload fails at 50 MB | Bucket/project limit | Compress the MP4; keep it well below the limit |
| Video URL loads but nothing plays | Unsupported codec (e.g. HEVC) or missing range support | Use H.264/AAC MP4; the bundled file is H.264 |
| Public media returns 404 | Path changed after upload, or object was deleted | Re-upload and save the new URL |

---

## Cost and retention notes

- Storage and egress are billed by Supabase. Keep the intro film compressed and avoid duplicate uploads.
- Signed URLs are short-lived but still grant temporary access; do not log them.
- CVs are the highest-sensitivity objects in the project. Define a retention period (for example, six months after a hiring decision), delete expired objects, and document the policy in your privacy notice.
