-- ============================================================================
-- Trump Offers — 04 · Recruitment: vacancies and applications
-- ============================================================================

create table if not exists public.job_vacancies (
  id                uuid        primary key default gen_random_uuid(),
  slug              text        not null unique,
  title             text        not null,
  department        text        not null,
  employment_type   text        not null default 'Full-time',
  work_mode         text        not null default 'Hybrid',
  location          text        not null,
  salary_min        numeric(12,2) not null default 0 check (salary_min >= 0),
  salary_max        numeric(12,2) not null default 0 check (salary_max >= 0),
  currency          text        not null default 'USD',
  summary           text        not null default '',
  description       text        not null default '',
  responsibilities  text[]      not null default '{}',
  requirements      text[]      not null default '{}',
  benefits          text[]      not null default '{}',
  deadline          date,
  status            text        not null default 'open' check (status in ('open', 'draft', 'closed')),
  featured          boolean     not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint job_vacancies_salary_range check (salary_max = 0 or salary_min <= salary_max)
);

create index if not exists job_vacancies_status_idx
  on public.job_vacancies (status, featured desc, created_at desc);

drop trigger if exists job_vacancies_set_updated_at on public.job_vacancies;
create trigger job_vacancies_set_updated_at
  before update on public.job_vacancies
  for each row execute function public.set_updated_at();

create table if not exists public.job_applications (
  id             uuid        primary key default gen_random_uuid(),
  vacancy_id     uuid        not null references public.job_vacancies (id) on delete restrict,
  user_id        uuid        references public.profiles (id) on delete set null,
  reference      text        not null unique,
  full_name      text        not null,
  email          text        not null,
  phone          text,
  location       text,
  qualifications text        not null default '',
  experience     text        not null default '',
  resume_path    text,
  resume_name    text,
  resume_mime    text,
  resume_size    bigint      check (resume_size is null or resume_size between 0 and 10485760),
  status         text        not null default 'submitted'
                             check (status in ('submitted', 'under_review', 'shortlisted', 'interview', 'accepted', 'rejected')),
  review_notes   text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists job_applications_created_idx
  on public.job_applications (created_at desc);

create index if not exists job_applications_user_idx
  on public.job_applications (user_id, created_at desc);

create index if not exists job_applications_email_idx
  on public.job_applications (lower(email));

create index if not exists job_applications_vacancy_idx
  on public.job_applications (vacancy_id);

drop trigger if exists job_applications_set_updated_at on public.job_applications;
create trigger job_applications_set_updated_at
  before update on public.job_applications
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.job_vacancies enable row level security;
alter table public.job_applications enable row level security;

drop policy if exists job_vacancies_select_public on public.job_vacancies;
create policy job_vacancies_select_public
  on public.job_vacancies for select
  to anon, authenticated
  using (status = 'open' or public.is_admin());

drop policy if exists job_vacancies_insert_admin on public.job_vacancies;
create policy job_vacancies_insert_admin
  on public.job_vacancies for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists job_vacancies_update_admin on public.job_vacancies;
create policy job_vacancies_update_admin
  on public.job_vacancies for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists job_vacancies_delete_admin on public.job_vacancies;
create policy job_vacancies_delete_admin
  on public.job_vacancies for delete
  to authenticated
  using (public.is_admin());

drop policy if exists job_applications_select_own_or_admin on public.job_applications;
create policy job_applications_select_own_or_admin
  on public.job_applications for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists job_applications_update_admin on public.job_applications;
create policy job_applications_update_admin
  on public.job_applications for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Status-change notification
-- ----------------------------------------------------------------------------
create or replace function public.on_application_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.user_id is not null then
    insert into public.notifications (user_id, title, body, type)
    values (
      new.user_id,
      'Application update',
      format('Your application %s is now marked “%s”.', new.reference, replace(new.status, '_', ' ')),
      'application'
    );
  end if;

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (
    auth.uid(),
    'application.status',
    'job_application',
    format('Application %s set to %s.', new.reference, new.status)
  );
  return new;
end;
$$;

drop trigger if exists job_applications_notify_status on public.job_applications;
create trigger job_applications_notify_status
  after update of status on public.job_applications
  for each row
  when (new.status is distinct from old.status)
  execute function public.on_application_status_changed();

-- ----------------------------------------------------------------------------
-- RPC · submit an application (guest or signed-in candidate)
-- ----------------------------------------------------------------------------
create or replace function public.submit_job_application(
  p_vacancy_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_location text,
  p_qualifications text,
  p_experience text,
  p_resume_path text default null,
  p_resume_name text default null,
  p_resume_mime text default null,
  p_resume_size bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job   public.job_vacancies;
  v_uid   uuid := auth.uid();
  v_ref   text;
  v_row   public.job_applications;
  v_title text;
begin
  select * into v_job
  from public.job_vacancies
  where id = p_vacancy_id;

  if not found or v_job.status <> 'open' then
    raise exception 'This vacancy is no longer accepting applications.';
  end if;

  if p_full_name is null or length(trim(p_full_name)) < 2 then
    raise exception 'Enter your full name.';
  end if;

  if p_email is null or p_email !~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' then
    raise exception 'Enter a valid email address.';
  end if;

  if p_experience is null or length(trim(p_experience)) < 20 then
    raise exception 'Add a little more detail to your experience.';
  end if;

  if v_uid is not null and not exists (select 1 from public.profiles where id = v_uid) then
    v_uid := null;
  end if;

  v_ref := public.next_reference('TO-JB');

  insert into public.job_applications (
    vacancy_id, user_id, reference, full_name, email, phone, location,
    qualifications, experience, resume_path, resume_name, resume_mime, resume_size,
    status
  )
  values (
    p_vacancy_id, v_uid, v_ref, trim(p_full_name), lower(trim(p_email)), nullif(trim(p_phone), ''),
    nullif(trim(p_location), ''), coalesce(p_qualifications, ''), trim(p_experience),
    p_resume_path, p_resume_name, p_resume_mime, p_resume_size, 'submitted'
  )
  returning * into v_row;

  if v_uid is not null then
    insert into public.notifications (user_id, title, body, type)
    values (
      v_uid,
      'Application received',
      format('Your application for %s is in review. Reference %s. Estimated review period: 3–4 business days.', v_job.title, v_ref),
      'application'
    );

    insert into public.activity_logs (user_id, action, entity_type, description)
    values (v_uid, 'application.submitted', 'job_application',
      format('Application submitted for %s.', v_job.title));
  end if;

  v_title := v_job.title;

  return jsonb_build_object(
    'reference', v_ref,
    'application', to_jsonb(v_row) || jsonb_build_object('job_title', v_title)
  );
end;
$$;

revoke all on function public.submit_job_application(uuid, text, text, text, text, text, text, text, text, text, bigint) from public;
grant execute on function public.submit_job_application(uuid, text, text, text, text, text, text, text, text, text, bigint) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- RPC · track an application by exact reference + email pair
-- ----------------------------------------------------------------------------
create or replace function public.track_application(p_reference text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.job_applications;
  v_job_title text;
begin
  select a.* into v_row
  from public.job_applications a
  where lower(a.reference) = lower(trim(p_reference))
    and lower(a.email) = lower(trim(p_email))
  limit 1;

  if not found then
    return null;
  end if;

  select title into v_job_title
  from public.job_vacancies
  where id = v_row.vacancy_id;

  return jsonb_build_object(
    'reference', v_row.reference,
    'status', v_row.status,
    'created_at', v_row.created_at,
    'job_title', coalesce(v_job_title, 'Trump Offers'),
    'full_name', v_row.full_name,
    'review_notes', v_row.review_notes
  );
end;
$$;

revoke all on function public.track_application(text, text) from public;
grant execute on function public.track_application(text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Privileges
-- ----------------------------------------------------------------------------
grant select on public.job_vacancies to anon, authenticated;
grant insert, update, delete on public.job_vacancies to authenticated;
grant select on public.job_applications to authenticated;
grant update on public.job_applications to authenticated;
