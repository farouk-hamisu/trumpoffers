-- ============================================================================
-- Trump Offers — 08 · Storage buckets and policies
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'resumes',
    'resumes',
    false,
    5242880,
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  ),
  (
    'site-media',
    'site-media',
    true,
    52428800,
    array['video/mp4', 'image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- Private resumes: anyone may submit an application (with or without an
-- account), but only administrators may read or remove stored files.
-- ----------------------------------------------------------------------------
drop policy if exists "resumes_public_upload" on storage.objects;
create policy "resumes_public_upload"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'resumes'
    and (storage.foldername(name))[1] = 'applications'
  );

drop policy if exists "resumes_admin_read" on storage.objects;
create policy "resumes_admin_read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'resumes' and public.is_admin());

drop policy if exists "resumes_admin_delete" on storage.objects;
create policy "resumes_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'resumes' and public.is_admin());

-- ----------------------------------------------------------------------------
-- Public site media (intro video and campaign imagery).
-- ----------------------------------------------------------------------------
drop policy if exists "site_media_public_read" on storage.objects;
create policy "site_media_public_read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'site-media');

drop policy if exists "site_media_admin_insert" on storage.objects;
create policy "site_media_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'site-media' and public.is_admin());

drop policy if exists "site_media_admin_update" on storage.objects;
create policy "site_media_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'site-media' and public.is_admin())
  with check (bucket_id = 'site-media' and public.is_admin());

drop policy if exists "site_media_admin_delete" on storage.objects;
create policy "site_media_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'site-media' and public.is_admin());
