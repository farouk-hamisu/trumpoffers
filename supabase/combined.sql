-- ============================================================================
-- Trump Offers — complete Supabase setup
--
-- Paste this entire file into the Supabase SQL editor and run it once.
-- It is the ordered concatenation of every file in supabase/migrations/.
-- Re-running is safe: objects are created idempotently and seed rows upsert.
-- ============================================================================

begin;


-- ----------------------------------------------------------------------------
-- Source: supabase/migrations/20261108120000_extensions_helpers.sql
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Trump Offers — 01 · Extensions, helpers and reference sequences
-- ============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- updated_at helper
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Maintains updated_at on mutable Trump Offers records.';

-- ----------------------------------------------------------------------------
-- Human-readable reference sequences (TO-RW-26-000001, TO-CD-26-000233, …)
-- Only security-definer RPCs may consume these values.
-- ----------------------------------------------------------------------------
create table if not exists public.reference_sequences (
  prefix      text        not null,
  period      text        not null,
  last_value  bigint      not null default 0 check (last_value >= 0),
  updated_at  timestamptz not null default now(),
  primary key (prefix, period)
);

alter table public.reference_sequences enable row level security;
revoke all on table public.reference_sequences from anon, authenticated;

create or replace function public.next_reference(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period text := to_char(now(), 'YY');
  v_value  bigint;
begin
  insert into public.reference_sequences (prefix, period, last_value, updated_at)
  values (p_prefix, v_period, 1, now())
  on conflict (prefix, period) do update
    set last_value = public.reference_sequences.last_value + 1,
        updated_at = now()
  returning last_value into v_value;

  return format('%s-%s-%s', p_prefix, v_period, lpad(v_value::text, 6, '0'));
end;
$$;

revoke all on function public.next_reference(text) from public;
comment on function public.next_reference(text) is
  'Atomically issues a Trump Offers reference such as TO-RW-26-000001.';

-- ----------------------------------------------------------------------------
-- Source: supabase/migrations/20261108120100_profiles_roles.sql
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Trump Offers — 02 · Profiles, roles and administrator checks
-- ============================================================================

create table if not exists public.profiles (
  id          uuid        primary key references auth.users (id) on delete cascade,
  email       text        not null,
  full_name   text        not null default '',
  phone       text,
  location    text,
  avatar_url  text,
  status      text        not null default 'active'
                          check (status in ('active', 'suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists profiles_email_lower_idx
  on public.profiles (lower(email));

create index if not exists profiles_created_at_idx
  on public.profiles (created_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- Roles. A member is an authenticated user without an admin role.
-- ----------------------------------------------------------------------------
create table if not exists public.user_roles (
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  role        text        not null check (role in ('user', 'admin')),
  granted_at  timestamptz not null default now(),
  primary key (user_id, role)
);

create index if not exists user_roles_role_idx on public.user_roles (role);

-- ----------------------------------------------------------------------------
-- Administrator predicate. SECURITY DEFINER avoids recursive RLS evaluation
-- when policies on profiles join user_roles.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;
comment on function public.is_admin() is
  'True when the current JWT belongs to an administrator.';

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

drop policy if exists profiles_select_own_or_admin on public.profiles;
create policy profiles_select_own_or_admin
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin
  on public.profiles for delete
  to authenticated
  using (public.is_admin());

drop policy if exists user_roles_select_own_or_admin on public.user_roles;
create policy user_roles_select_own_or_admin
  on public.user_roles for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists user_roles_insert_admin on public.user_roles;
create policy user_roles_insert_admin
  on public.user_roles for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists user_roles_update_admin on public.user_roles;
create policy user_roles_update_admin
  on public.user_roles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists user_roles_delete_admin on public.user_roles;
create policy user_roles_delete_admin
  on public.user_roles for delete
  to authenticated
  using (public.is_admin());

-- ----------------------------------------------------------------------------
-- Members may edit their profile, but never their own status or email.
-- ----------------------------------------------------------------------------
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status is distinct from old.status then
      raise exception 'Only an administrator may change account status.'
        using errcode = '42501';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Email changes must be made through account settings.'
        using errcode = '42501';
    end if;
    if new.id is distinct from old.id then
      raise exception 'Profile identifiers are immutable.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileges on public.profiles;
create trigger profiles_protect_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- ----------------------------------------------------------------------------
-- Convenience view for the console (security_invoker keeps RLS in force).
-- ----------------------------------------------------------------------------
create or replace view public.member_directory
with (security_invoker = true)
as
select
  p.id,
  p.email,
  p.full_name,
  p.phone,
  p.location,
  p.status,
  p.created_at,
  coalesce(
    (select array_agg(ur.role order by ur.role) from public.user_roles ur where ur.user_id = p.id),
    array['user']::text[]
  ) as roles
from public.profiles p;

grant select on public.member_directory to authenticated;

-- Table privileges are intentionally broad for authenticated users; RLS is
-- the authorisation boundary. Explicit grants keep the migrations portable
-- across Supabase projects that do not inherit broad default privileges.
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_roles to authenticated;

comment on view public.member_directory is
  'Read-only member directory for administrators; row-level security applies.';

-- ----------------------------------------------------------------------------
-- Source: supabase/migrations/20261108120200_rewards.sql
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Trump Offers — 03 · Rewards, claims, withdrawals and notifications
-- ============================================================================

create table if not exists public.reward_accounts (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null unique references public.profiles (id) on delete cascade,
  balance       numeric(12,2) not null default 30000 check (balance >= 0),
  currency      text        not null default 'USD',
  is_simulated  boolean     not null default true,
  status        text        not null default 'active'
                            check (status in ('active', 'frozen')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists reward_accounts_set_updated_at on public.reward_accounts;
create trigger reward_accounts_set_updated_at
  before update on public.reward_accounts
  for each row execute function public.set_updated_at();

create table if not exists public.reward_claims (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references public.profiles (id) on delete cascade,
  reference               text        not null unique,
  reward                  text        not null default 'Trump Offers reward',
  amount                  numeric(12,2) not null check (amount >= 0),
  status                  text        not null default 'confirmed'
                                      check (status in ('confirmed', 'verifying', 'processing', 'completed', 'cancelled')),
  stage                   integer     not null default 1 check (stage between 1 and 4),
  progress                integer     not null default 8 check (progress between 0 and 100),
  note                    text        not null default '',
  processing_started_at   timestamptz,
  estimated_completion_at timestamptz,
  completed_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists reward_claims_user_created_idx
  on public.reward_claims (user_id, created_at desc);

create unique index if not exists reward_claims_one_active_idx
  on public.reward_claims (user_id)
  where status in ('confirmed', 'verifying', 'processing');

drop trigger if exists reward_claims_set_updated_at on public.reward_claims;
create trigger reward_claims_set_updated_at
  before update on public.reward_claims
  for each row execute function public.set_updated_at();

create table if not exists public.withdrawals (
  id                      uuid        primary key default gen_random_uuid(),
  user_id                 uuid        not null references public.profiles (id) on delete cascade,
  reference               text        not null unique,
  amount                  numeric(12,2) not null check (amount > 0),
  method                  text        not null
                                      check (method in ('bank_transfer', 'digital_wallet', 'card_credit')),
  destination_label       text        not null default '',
  account_name            text        not null default '',
  status                  text        not null default 'pending'
                                      check (status in ('pending', 'reviewing', 'processing', 'paid', 'rejected')),
  note                    text        not null default '',
  estimated_completion_at timestamptz,
  processed_at            timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists withdrawals_user_created_idx
  on public.withdrawals (user_id, created_at desc);

drop trigger if exists withdrawals_set_updated_at on public.withdrawals;
create trigger withdrawals_set_updated_at
  before update on public.withdrawals
  for each row execute function public.set_updated_at();

create table if not exists public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  title       text        not null,
  body        text        not null default '',
  type        text        not null default 'system'
                          check (type in ('reward', 'withdrawal', 'application', 'card', 'account', 'system')),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

create table if not exists public.activity_logs (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references public.profiles (id) on delete set null,
  action       text        not null,
  entity_type  text        not null default 'system',
  description  text        not null default '',
  created_at   timestamptz not null default now()
);

create index if not exists activity_logs_created_idx
  on public.activity_logs (created_at desc);

create index if not exists activity_logs_user_created_idx
  on public.activity_logs (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.reward_accounts enable row level security;
alter table public.reward_claims enable row level security;
alter table public.withdrawals enable row level security;
alter table public.notifications enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists reward_accounts_select_own_or_admin on public.reward_accounts;
create policy reward_accounts_select_own_or_admin
  on public.reward_accounts for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists reward_accounts_update_admin on public.reward_accounts;
create policy reward_accounts_update_admin
  on public.reward_accounts for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists reward_claims_select_own_or_admin on public.reward_claims;
create policy reward_claims_select_own_or_admin
  on public.reward_claims for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists reward_claims_update_admin on public.reward_claims;
create policy reward_claims_update_admin
  on public.reward_claims for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists withdrawals_select_own_or_admin on public.withdrawals;
create policy withdrawals_select_own_or_admin
  on public.withdrawals for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists withdrawals_update_admin on public.withdrawals;
create policy withdrawals_update_admin
  on public.withdrawals for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists notifications_select_own_or_admin on public.notifications;
create policy notifications_select_own_or_admin
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists activity_logs_select_own_or_admin on public.activity_logs;
create policy activity_logs_select_own_or_admin
  on public.activity_logs for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- Status-change notifications for administrative updates
-- ----------------------------------------------------------------------------
create or replace function public.on_claim_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications (user_id, title, body, type)
  values (
    new.user_id,
    'Reward claim update',
    format('Claim %s is now marked “%s”.', new.reference, replace(new.status, '_', ' ')),
    'reward'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (
    auth.uid(),
    'claim.status',
    'reward_claim',
    format('Claim %s set to %s.', new.reference, new.status)
  );
  return new;
end;
$$;

drop trigger if exists reward_claims_notify_status on public.reward_claims;
create trigger reward_claims_notify_status
  after update of status on public.reward_claims
  for each row
  when (new.status is distinct from old.status)
  execute function public.on_claim_status_changed();

create or replace function public.on_withdrawal_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications (user_id, title, body, type)
  values (
    new.user_id,
    'Withdrawal update',
    case
      when new.status = 'paid' then format('Withdrawal %s has been marked complete.', new.reference)
      else format('Withdrawal %s is now marked “%s”.', new.reference, replace(new.status, '_', ' '))
    end,
    'withdrawal'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (
    auth.uid(),
    'withdrawal.status',
    'withdrawal',
    format('Withdrawal %s set to %s.', new.reference, new.status)
  );
  return new;
end;
$$;

drop trigger if exists withdrawals_notify_status on public.withdrawals;
create trigger withdrawals_notify_status
  after update of status on public.withdrawals
  for each row
  when (new.status is distinct from old.status)
  execute function public.on_withdrawal_status_changed();

-- ----------------------------------------------------------------------------
-- RPC · create a reward claim
-- ----------------------------------------------------------------------------
create or replace function public.create_reward_claim()
returns public.reward_claims
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid     uuid := auth.uid();
  v_account public.reward_accounts;
  v_hours   integer;
  v_ref     text;
  v_claim   public.reward_claims;
begin
  if v_uid is null then
    raise exception 'Sign in to claim a reward.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_uid and status = 'active'
  ) then
    raise exception 'This account is not active.' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.reward_claims
    where user_id = v_uid
      and status in ('confirmed', 'verifying', 'processing')
  ) then
    raise exception 'You already have a reward claim in progress.';
  end if;

  select * into v_account
  from public.reward_accounts
  where user_id = v_uid;

  if not found then
    raise exception 'Your reward account is not available.';
  end if;

  v_hours := floor(random() * 6 + 5)::integer; -- 5–10 hour verification window
  v_ref := public.next_reference('TO-RW');

  insert into public.reward_claims (
    user_id, reference, reward, amount, status, stage, progress, note,
    processing_started_at, estimated_completion_at
  )
  values (
    v_uid,
    v_ref,
    'Trump Offers reward',
    v_account.balance,
    'verifying',
    2,
    22,
    'Verification in progress. Funds are not transferred until the claim is completed.',
    now(),
    now() + (v_hours * interval '1 hour')
  )
  returning * into v_claim;

  insert into public.notifications (user_id, title, body, type)
  values (
    v_uid,
    'Reward claim received',
    format('Claim %s is being verified. Estimated processing window: %s hours.', v_ref, v_hours),
    'reward'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (v_uid, 'claim.created', 'reward_claim', format('Reward claim %s submitted.', v_ref));

  return v_claim;
end;
$$;

revoke all on function public.create_reward_claim() from public;
grant execute on function public.create_reward_claim() to authenticated;

-- ----------------------------------------------------------------------------
-- RPC · request a withdrawal (superseded by the withdrawals v2 schema)
-- ----------------------------------------------------------------------------
create or replace function public.request_withdrawal(
  p_amount numeric,
  p_method text,
  p_destination_label text,
  p_account_name text
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := auth.uid();
  v_account   public.reward_accounts;
  v_active    numeric(12,2);
  v_available numeric(12,2);
  v_ref       text;
  v_row       public.withdrawals;
begin
  if v_uid is null then
    raise exception 'Sign in to request a withdrawal.' using errcode = '42501';
  end if;

  if p_amount is null or p_amount < 100 then
    raise exception 'The minimum withdrawal is $100.';
  end if;

  if p_method not in ('bank_transfer', 'digital_wallet', 'card_credit') then
    raise exception 'Select a withdrawal method.';
  end if;

  if p_destination_label is null or length(trim(p_destination_label)) < 2 then
    raise exception 'Add a masked destination label.';
  end if;

  if p_destination_label ~ '\d{8,}' then
    raise exception 'Please use a masked destination and never enter full banking details.';
  end if;

  if p_account_name is null or length(trim(p_account_name)) < 2 then
    raise exception 'Add the account holder name.';
  end if;

  select * into v_account
  from public.reward_accounts
  where user_id = v_uid;

  if not found then
    raise exception 'Your reward account is not available.';
  end if;

  select coalesce(sum(amount), 0) into v_active
  from public.withdrawals
  where user_id = v_uid
    and status in ('pending', 'reviewing', 'processing');

  v_available := v_account.balance - v_active;

  if p_amount > v_available then
    raise exception 'That amount exceeds your available balance.';
  end if;

  v_ref := public.next_reference('TO-WD');

  insert into public.withdrawals (
    user_id, reference, amount, method, destination_label, account_name,
    status, note, estimated_completion_at
  )
  values (
    v_uid, v_ref, p_amount, p_method, trim(p_destination_label), trim(p_account_name),
    'processing',
    'Withdrawal submitted for processing.',
    now() + interval '3 days'
  )
  returning * into v_row;

  insert into public.notifications (user_id, title, body, type)
  values (
    v_uid,
    'Withdrawal submitted',
    format('Withdrawal %s is processing.', v_ref),
    'withdrawal'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (v_uid, 'withdrawal.created', 'withdrawal', format('Withdrawal %s requested.', v_ref));

  return v_row;
end;
$$;

revoke all on function public.request_withdrawal(numeric, text, text, text) from public;
grant execute on function public.request_withdrawal(numeric, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Table privileges (RLS remains the boundary)
-- ----------------------------------------------------------------------------
grant select on public.reward_accounts, public.reward_claims, public.withdrawals,
  public.notifications, public.activity_logs to authenticated;
grant update on public.notifications to authenticated;
grant update on public.reward_accounts, public.reward_claims, public.withdrawals to authenticated;

-- ----------------------------------------------------------------------------
-- Source: supabase/migrations/20261108120300_recruitment.sql
-- ----------------------------------------------------------------------------

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

-- ----------------------------------------------------------------------------
-- Source: supabase/migrations/20261108120400_cards.sql
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Trump Offers — 05 · Card studio
-- ============================================================================

create table if not exists public.card_applications (
  id                     uuid        primary key default gen_random_uuid(),
  user_id                uuid        not null references public.profiles (id) on delete cascade,
  reference              text        not null unique,
  design                 text        not null
                                     check (design in ('noir', 'champagne', 'obsidian', 'heritage')),
  cardholder_name        text        not null,
  fictional_card_number  text        not null check (fictional_card_number ~ '^[0-9]{16}$'),
  expiry_month           integer     not null check (expiry_month between 1 and 12),
  expiry_year            integer     not null check (expiry_year between 2026 and 2045),
  status                 text        not null default 'submitted'
                                     check (status in ('submitted', 'under_review', 'approved', 'rejected')),
  note                   text        not null default '',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists card_applications_user_created_idx
  on public.card_applications (user_id, created_at desc);

create unique index if not exists card_applications_number_idx
  on public.card_applications (fictional_card_number);

drop trigger if exists card_applications_set_updated_at on public.card_applications;
create trigger card_applications_set_updated_at
  before update on public.card_applications
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.card_applications enable row level security;

drop policy if exists card_applications_select_own_or_admin on public.card_applications;
create policy card_applications_select_own_or_admin
  on public.card_applications for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists card_applications_update_admin on public.card_applications;
create policy card_applications_update_admin
  on public.card_applications for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.card_applications to authenticated;
grant update on public.card_applications to authenticated;

-- ----------------------------------------------------------------------------
-- Generated card number with a valid Luhn check digit.
-- The number is display-only and is not a payment instrument.
-- ----------------------------------------------------------------------------
create or replace function public.generate_demo_card_number()
returns text
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_base  text;
  v_sum   integer := 0;
  v_digit integer;
  v_alt   boolean := true;
  i       integer;
begin
  v_base := '4539' || lpad((floor(random() * 100000000000))::bigint::text, 11, '0');

  for i in reverse length(v_base)..1 loop
    v_digit := substr(v_base, i, 1)::integer;
    if v_alt then
      v_digit := v_digit * 2;
      if v_digit > 9 then
        v_digit := v_digit - 9;
      end if;
    end if;
    v_sum := v_sum + v_digit;
    v_alt := not v_alt;
  end loop;

  return v_base || ((10 - (v_sum % 10)) % 10)::text;
end;
$$;

-- ----------------------------------------------------------------------------
-- RPC · create a card application
-- ----------------------------------------------------------------------------
create or replace function public.create_card_application(
  p_design text,
  p_cardholder_name text
)
returns public.card_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
  v_ref  text;
  v_row  public.card_applications;
begin
  if v_uid is null then
    raise exception 'Sign in to create a card.' using errcode = '42501';
  end if;

  if p_design not in ('noir', 'champagne', 'obsidian', 'heritage') then
    raise exception 'Select a card design.';
  end if;

  v_name := upper(regexp_replace(coalesce(p_cardholder_name, ''), '\s+', ' ', 'g'));

  if length(trim(v_name)) < 2 then
    raise exception 'Enter the cardholder name.';
  end if;

  if length(v_name) > 26 then
    raise exception 'Cardholder names are limited to 26 characters.';
  end if;

  v_ref := public.next_reference('TO-CD');

  insert into public.card_applications (
    user_id, reference, design, cardholder_name,
    fictional_card_number, expiry_month, expiry_year, status, note
  )
  values (
    v_uid,
    v_ref,
    p_design,
    trim(v_name),
    public.generate_demo_card_number(),
    extract(month from (now() + interval '3 years'))::integer,
    extract(year from (now() + interval '3 years'))::integer,
    'submitted',
    'Card issued for presentation only. It is not a payment instrument.'
  )
  returning * into v_row;

  insert into public.notifications (user_id, title, body, type)
  values (
    v_uid,
    'Card request received',
    format('Your card request %s is awaiting administrator review.', v_ref),
    'card'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (v_uid, 'card.created', 'card_application',
    format('Card application %s submitted.', v_ref));

  return v_row;
end;
$$;

revoke all on function public.create_card_application(text, text) from public;
grant execute on function public.create_card_application(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC · verify a card by reference + last four (public-safe payload)
-- ----------------------------------------------------------------------------
create or replace function public.verify_demo_card(
  p_reference text,
  p_last4 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.card_applications;
begin
  if p_reference is null or p_last4 is null or p_last4 !~ '^[0-9]{4}$' then
    return null;
  end if;

  select * into v_row
  from public.card_applications
  where lower(reference) = lower(trim(p_reference))
    and right(fictional_card_number, 4) = p_last4
  limit 1;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'found', true,
    'reference', v_row.reference,
    'status', v_row.status,
    'cardholder_name', v_row.cardholder_name,
    'design', v_row.design,
    'last4', right(v_row.fictional_card_number, 4),
    'created_at', v_row.created_at,
    'note', v_row.note
  );
end;
$$;

revoke all on function public.verify_demo_card(text, text) from public;
grant execute on function public.verify_demo_card(text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Status-change notification
-- ----------------------------------------------------------------------------
create or replace function public.on_card_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications (user_id, title, body, type)
  values (
    new.user_id,
    case when new.status = 'approved' then 'Card approved' else 'Card application update' end,
    case
      when new.status = 'approved' then format('Your card %s has been approved. The card is not a payment instrument and cannot be used for transactions.', new.reference)
      else format('Your card application %s is now marked “%s”.', new.reference, replace(new.status, '_', ' '))
    end,
    'card'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (
    auth.uid(),
    'card.status',
    'card_application',
    format('Card application %s set to %s.', new.reference, new.status)
  );
  return new;
end;
$$;

drop trigger if exists card_applications_notify_status on public.card_applications;
create trigger card_applications_notify_status
  after update of status on public.card_applications
  for each row
  when (new.status is distinct from old.status)
  execute function public.on_card_status_changed();

-- ----------------------------------------------------------------------------
-- Source: supabase/migrations/20261108120500_contact_settings.sql
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Trump Offers — 06 · Concierge messages and site configuration
-- ============================================================================

create table if not exists public.contact_messages (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  email       text        not null,
  phone       text,
  subject     text        not null,
  message     text        not null,
  status      text        not null default 'new' check (status in ('new', 'read', 'archived')),
  created_at  timestamptz not null default now()
);

create index if not exists contact_messages_created_idx
  on public.contact_messages (created_at desc);

create index if not exists contact_messages_status_idx
  on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;

drop policy if exists contact_messages_insert_public on public.contact_messages;
create policy contact_messages_insert_public
  on public.contact_messages for insert
  to anon, authenticated
  with check (
    status = 'new'
    and length(trim(name)) between 2 and 120
    and email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$'
    and length(trim(subject)) between 2 and 160
    and length(trim(message)) between 10 and 4000
    and (phone is null or length(trim(phone)) <= 32)
  );

drop policy if exists contact_messages_select_admin on public.contact_messages;
create policy contact_messages_select_admin
  on public.contact_messages for select
  to authenticated
  using (public.is_admin());

drop policy if exists contact_messages_update_admin on public.contact_messages;
create policy contact_messages_update_admin
  on public.contact_messages for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists contact_messages_delete_admin on public.contact_messages;
create policy contact_messages_delete_admin
  on public.contact_messages for delete
  to authenticated
  using (public.is_admin());

grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;

-- ----------------------------------------------------------------------------
-- Site settings. Values are JSON so booleans remain booleans in the client.
-- ----------------------------------------------------------------------------
create table if not exists public.site_settings (
  key         text        primary key,
  value       jsonb       not null default 'null'::jsonb,
  is_public   boolean     not null default true,
  updated_at  timestamptz not null default now()
);

drop trigger if exists site_settings_set_updated_at on public.site_settings;
create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function public.set_updated_at();

alter table public.site_settings enable row level security;

drop policy if exists site_settings_select_public on public.site_settings;
create policy site_settings_select_public
  on public.site_settings for select
  to anon, authenticated
  using (is_public or public.is_admin());

drop policy if exists site_settings_insert_admin on public.site_settings;
create policy site_settings_insert_admin
  on public.site_settings for insert
  to authenticated
  with check (public.is_admin());

drop policy if exists site_settings_update_admin on public.site_settings;
create policy site_settings_update_admin
  on public.site_settings for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists site_settings_delete_admin on public.site_settings;
create policy site_settings_delete_admin
  on public.site_settings for delete
  to authenticated
  using (public.is_admin());

grant select on public.site_settings to anon, authenticated;
grant insert, update, delete on public.site_settings to authenticated;

-- ----------------------------------------------------------------------------
-- Source: supabase/migrations/20261108120600_provisioning.sql
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Trump Offers — 07 · Account provisioning triggers
-- Runs after every dependent table exists.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, phone, location)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'location', '')
  )
  on conflict (id) do update
    set email = coalesce(nullif(excluded.email, ''), public.profiles.email),
        full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name);

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id, role) do nothing;

  insert into public.reward_accounts (user_id, balance, currency, is_simulated, status)
  values (new.id, 30000, 'USD', true, 'active')
  on conflict (user_id) do nothing;

  insert into public.notifications (user_id, title, body, type)
  values (
    new.id,
    'Welcome to Trump Offers',
    'Your account is ready. Explore rewards, open roles and the card studio at your own pace.',
    'account'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (new.id, 'account.created', 'profile', 'Trump Offers account created.');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Backfill for any accounts that existed before this migration was applied.
-- ----------------------------------------------------------------------------
insert into public.profiles (id, email, full_name, phone, location)
select
  u.id,
  coalesce(u.email, ''),
  coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), ''),
  nullif(u.raw_user_meta_data ->> 'phone', ''),
  nullif(u.raw_user_meta_data ->> 'location', '')
from auth.users u
on conflict (id) do nothing;

insert into public.user_roles (user_id, role)
select p.id, 'user'
from public.profiles p
on conflict (user_id, role) do nothing;

insert into public.reward_accounts (user_id, balance, currency, is_simulated, status)
select p.id, 30000, 'USD', true, 'active'
from public.profiles p
on conflict (user_id) do nothing;

-- ----------------------------------------------------------------------------
-- Promote an administrator. Intentionally NOT executable by anon/authenticated:
-- run it from the SQL editor or a privileged migration.
--
--   select public.grant_admin('admin@trumpoffers.com');
-- ----------------------------------------------------------------------------
create or replace function public.grant_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from public.profiles
  where lower(email) = lower(trim(p_email));

  if v_id is null then
    raise exception 'No profile exists for that email address. Create the account first.';
  end if;

  insert into public.user_roles (user_id, role)
  values (v_id, 'admin')
  on conflict (user_id, role) do nothing;

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (v_id, 'role.granted', 'user_role', 'Administrator role granted.');

  return v_id;
end;
$$;

revoke all on function public.grant_admin(text) from public, anon, authenticated;

comment on function public.grant_admin(text) is
  'Privileged helper for bootstrapping the first administrator. Run from the SQL editor.';

-- ----------------------------------------------------------------------------
-- Source: supabase/migrations/20261108120700_storage.sql
-- ----------------------------------------------------------------------------

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

-- ----------------------------------------------------------------------------
-- Source: supabase/migrations/20261108120800_seed.sql
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Trump Offers — 09 · Initial site configuration and vacancies
-- Safe to re-run: existing customisations are never overwritten.
-- ============================================================================

insert into public.site_settings (key, value, is_public)
values
  ('site_name', to_jsonb('Trump Offers'::text), true),
  ('tagline', to_jsonb('Opportunities. Rewards. Possibilities.'::text), true),
  ('hero_headline', to_jsonb('Opportunities. Rewards. Possibilities.'::text), true),
  ('hero_support', to_jsonb('Explore opportunities, discover career possibilities and experience a modern rewards platform designed around simplicity and accessibility.'::text), true),
  ('support_email', to_jsonb('concierge@trumpoffers.com'::text), true),
  ('support_phone', to_jsonb('+1 (212) 555-0184'::text), true),
  ('address', to_jsonb('One Trump Place, Suite 1200, New York, NY 10004'::text), true),
  ('office_hours', to_jsonb('Monday–Friday, 9:00–18:00 ET'::text), true),
  ('intro_video_url', to_jsonb('assets/videos/trump-intro.mp4'::text), true),
  ('intro_video_enabled', to_jsonb(true), true),
  ('intro_autoplay', to_jsonb(false), true),
  ('announcement', to_jsonb(''::text), true),
  ('linkedin_url', to_jsonb('https://www.linkedin.com/'::text), true),
  ('instagram_url', to_jsonb('https://www.instagram.com/'::text), true)
on conflict (key) do nothing;

insert into public.job_vacancies (
  slug, title, department, employment_type, work_mode, location,
  salary_min, salary_max, currency, summary, description,
  responsibilities, requirements, benefits, deadline, status, featured, created_at
)
values
  (
    'private-client-advisor',
    'Private Client Advisor',
    'Client Services',
    'Full-time',
    'Hybrid',
    'New York, NY',
    118000,
    145000,
    'USD',
    'Guide members through their rewards journey with discretion, clarity and an unusual level of care.',
    'Trump Offers is building a new kind of rewards and opportunity platform. As a Private Client Advisor, you will be the considered voice members meet at every important moment — from their first reward claim to their first introduction to a hiring partner.

This is a relationship role in the truest sense. You will work across a small portfolio of members, anticipate needs before they are articulated, and turn complexity into calm. You will partner closely with Operations, Product and Recruitment to make sure every promise the platform makes is kept.',
    array[
      'Own a portfolio of member relationships across rewards, cards and career introductions.',
      'Guide members through platform workflows with clear, jargon-free communication.',
      'Translate recurring member feedback into concise product and operations briefs.',
      'Partner with recruitment teams to coordinate warm candidate introductions.',
      'Maintain meticulous records and uphold the platform’s privacy standards.'
    ],
    array[
      '4+ years in private banking, premium hospitality, client services or a related field.',
      'Exceptional written communication and a naturally discreet manner.',
      'Comfort working with modern productivity and CRM tools.',
      'A calm, structured approach to competing priorities.',
      'Authorization to work in the United States.'
    ],
    array[
      'Competitive base salary and performance award',
      'Comprehensive health and wellbeing cover',
      'Hybrid schedule with a beautiful Manhattan studio',
      'Annual learning and travel allowance'
    ],
    current_date + 38,
    'open',
    true,
    now() - interval '6 days'
  ),
  (
    'product-designer-digital-card',
    'Product Designer, Digital Card',
    'Product Design',
    'Full-time',
    'Remote',
    'London, United Kingdom',
    96000,
    124000,
    'USD',
    'Shape the most tactile, considered digital card experience in the rewards category.',
    'We are looking for a product designer with a sharp editorial eye and a respect for the quiet details that make a product feel expensive. You will own the end-to-end design of the Trump Offers card: application, presentation, verification and administration.

You will work directly with engineering and brand, moving from wide explorations to production-ready specifications without losing the idea. We care deeply about craft, but we care more about clarity.',
    array[
      'Design end-to-end flows for the card, from application to verification.',
      'Build and maintain a small, rigorous design system for the card surfaces.',
      'Prototype interactions and test them with members and internal teams.',
      'Pair with engineers to protect quality through implementation.',
      'Present work clearly to senior stakeholders.'
    ],
    array[
      'A portfolio demonstrating strong visual and interaction design.',
      '3+ years designing consumer or fintech products.',
      'Fluency in Figma, prototyping and design-system practice.',
      'A thoughtful approach to accessibility and responsive behaviour.',
      'Excellent written communication in English.'
    ],
    array[
      'Remote-first with quarterly team gatherings',
      'Home-office and equipment budget',
      'Private health cover and pension contribution',
      'Four-day summer weeks'
    ],
    current_date + 24,
    'open',
    true,
    now() - interval '3 days'
  ),
  (
    'rewards-operations-associate',
    'Rewards Operations Associate',
    'Operations',
    'Full-time',
    'On-site',
    'New York, NY',
    64000,
    78000,
    'USD',
    'Keep every claim, withdrawal and card application moving with precision.',
    'The Rewards Operations Associate sits at the centre of the platform. You will review records, maintain service levels, and make sure members always know exactly where things stand.

You will be joining a small operations team with a broad mandate. Expect to improve processes as often as you run them, and to work closely with the administrators who oversee the platform.',
    array[
      'Review and progress reward claims and withdrawal requests.',
      'Maintain claim records, reference numbers and status accuracy.',
      'Escalate anomalies and document resolutions clearly.',
      'Support member enquiries with accurate, kind responses.',
      'Contribute to operational playbooks and service-level reporting.'
    ],
    array[
      '1–3 years in operations, financial services or customer support.',
      'Meticulous attention to detail and strong numeracy.',
      'Comfort with spreadsheets and operations dashboards.',
      'Clear written communication and a steady temperament.',
      'New York based or willing to relocate.'
    ],
    array[
      'Performance-linked annual award',
      'Medical, dental and vision cover',
      'Commuter and wellness allowances',
      'Structured development pathway'
    ],
    current_date + 31,
    'open',
    true,
    now() - interval '8 days'
  ),
  (
    'recruitment-partner',
    'Recruitment Partner',
    'People & Culture',
    'Full-time',
    'Remote',
    'United States',
    82000,
    98000,
    'USD',
    'Connect exceptional people with the teams building a more considered rewards platform.',
    'As Recruitment Partner you will own hiring across product, operations and client services. You will design calm, respectful processes and represent Trump Offers with the same care our members experience.

This role suits someone who believes recruitment is a craft: part listening, part storytelling and part operating discipline.',
    array[
      'Own full-cycle hiring for product, operations and client teams.',
      'Partner with hiring managers on role design and interview structure.',
      'Build thoughtful candidate communications and feedback loops.',
      'Maintain accurate applicant records and reporting.',
      'Champion an equitable, accessible hiring experience.'
    ],
    array[
      '3+ years of in-house or agency recruitment experience.',
      'Evidence of hiring for both technical and operational roles.',
      'Strong interviewing and stakeholder-management skills.',
      'Comfort with applicant tracking systems and data hygiene.',
      'Based in the United States.'
    ],
    array[
      'Remote-first with a connected team culture',
      'Annual learning stipend',
      'Health and wellbeing cover',
      'Generous paid leave'
    ],
    current_date + 45,
    'open',
    false,
    now() - interval '11 days'
  ),
  (
    'brand-content-strategist',
    'Brand & Content Strategist',
    'Marketing',
    'Contract',
    'Hybrid',
    'London, United Kingdom',
    70000,
    90000,
    'USD',
    'Write the words that make a platform feel considered, credible and human.',
    'We are looking for a brand writer and content strategist for a twelve-month contract. You will shape the voice of Trump Offers across product, web and member communications.

The ideal candidate has a portfolio of editorial or premium brand work, a dislike of filler, and the discipline to make every sentence earn its place.',
    array[
      'Define and maintain the Trump Offers tone of voice.',
      'Write product copy, member communications and editorial features.',
      'Partner with design on campaign concepts and art direction.',
      'Review copy across the platform for clarity and consistency.',
      'Build a lightweight content style guide.'
    ],
    array[
      'A portfolio of premium brand, editorial or product writing.',
      '5+ years in copywriting or content strategy.',
      'Exceptional editing instincts and attention to detail.',
      'Comfort working across time zones.',
      'Available for a twelve-month contract.'
    ],
    array[
      'Day rate commensurate with experience',
      'Hybrid studio access in London',
      'Quarterly team gatherings',
      'A genuinely calm working culture'
    ],
    current_date + 19,
    'open',
    false,
    now() - interval '2 days'
  ),
  (
    'risk-compliance-analyst',
    'Risk & Compliance Analyst',
    'Risk',
    'Full-time',
    'On-site',
    'Singapore',
    88000,
    106000,
    'USD',
    'Design the controls that keep a rewards environment safe, honest and well-governed.',
    'You will help define the standards that govern a rewards platform: data minimisation, clear disclosures, secure access and reliable audit trails.

This is a hands-on role for someone who enjoys turning principles into practical controls and can explain them to non-specialists.',
    array[
      'Maintain the platform risk register and control documentation.',
      'Review data handling and access practices against policy.',
      'Support incident response and audit preparation.',
      'Advise product teams on disclosure and consumer-protection requirements.',
      'Produce clear monthly risk reporting for leadership.'
    ],
    array[
      '3+ years in risk, compliance or audit within financial services.',
      'Working knowledge of data-protection frameworks.',
      'Strong analytical writing and documentation skills.',
      'Ability to influence without authority.',
      'Based in Singapore or willing to relocate.'
    ],
    array[
      'Competitive salary and annual award',
      'Comprehensive medical cover',
      'Professional certification support',
      'Central Singapore office'
    ],
    current_date + 52,
    'open',
    false,
    now() - interval '9 days'
  )
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Source: supabase/migrations/20261109120000_withdrawals_v2.sql
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Trump Offers — 10 · Withdrawal v2: methods, review, audit and settlement
--
-- Adds:
--   * method-specific withdrawal data (bank, crypto, card)
--   * tokenised payment accounts
--   * status history and administrative audit logs
--   * configurable methods, crypto assets and networks
--   * hardened request/approval RPCs with balance reservation
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.app_secrets (
  name       text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);
revoke all on private.app_secrets from public;

insert into private.app_secrets (name, value)
select 'payment_encryption_key', encode(extensions.gen_random_bytes(32), 'hex')
where not exists (
  select 1 from private.app_secrets where name = 'payment_encryption_key'
);

create or replace function private.payment_key()
returns text
language sql
stable
security definer
set search_path = private, pg_temp
as $$
  select value from private.app_secrets where name = 'payment_encryption_key';
$$;
revoke all on function private.payment_key() from public;

-- ----------------------------------------------------------------------------
-- Withdrawal methods and crypto networks (public configuration)
-- ----------------------------------------------------------------------------
create table if not exists public.withdrawal_methods (
  method          text primary key check (method in ('bank_transfer', 'crypto', 'card')),
  label           text not null,
  description     text not null default '',
  min_amount      numeric(12,2) not null default 100 check (min_amount >= 0),
  max_amount      numeric(12,2) not null default 30000 check (max_amount > 0),
  fee_type        text not null default 'none' check (fee_type in ('none', 'flat', 'percent')),
  fee_value       numeric(12,4) not null default 0 check (fee_value >= 0),
  processing_time text not null default '',
  enabled         boolean not null default true,
  sort_order      integer not null default 0
);

insert into public.withdrawal_methods
  (method, label, description, min_amount, max_amount, fee_type, fee_value, processing_time, enabled, sort_order)
values
  ('bank_transfer', 'Bank transfer', 'A direct transfer to your bank account.', 100, 30000, 'none', 0, '2–3 business days', true, 1),
  ('crypto', 'Cryptocurrency', 'A digital-asset payout to a wallet you control.', 100, 30000, 'none', 0, 'Usually within 24 hours of approval', true, 2),
  ('card', 'Card credit', 'A credit to a payout card connected in the withdrawal desk.', 100, 30000, 'none', 0, '1–2 business days after approval', true, 3)
on conflict (method) do update
  set label = excluded.label,
      description = excluded.description,
      min_amount = excluded.min_amount,
      max_amount = excluded.max_amount,
      fee_type = excluded.fee_type,
      fee_value = excluded.fee_value,
      processing_time = excluded.processing_time,
      enabled = excluded.enabled,
      sort_order = excluded.sort_order;

alter table public.withdrawal_methods enable row level security;
drop policy if exists withdrawal_methods_public_read on public.withdrawal_methods;
create policy withdrawal_methods_public_read
  on public.withdrawal_methods for select
  to anon, authenticated
  using (true);
grant select on public.withdrawal_methods to anon, authenticated;

create table if not exists public.crypto_networks (
  asset             text not null,
  network           text not null,
  label             text not null,
  description       text not null default '',
  fee_estimate_usd  numeric(12,2) not null default 0 check (fee_estimate_usd >= 0),
  min_confirmations integer not null default 1,
  enabled           boolean not null default true,
  sort_order        integer not null default 0,
  primary key (asset, network)
);

insert into public.crypto_networks
  (asset, network, label, description, fee_estimate_usd, min_confirmations, enabled, sort_order)
values
  ('USDT', 'TRC20', 'Tether USD · TRC20', 'Tron network. Low fees, widely supported.', 1.00, 20, true, 1),
  ('USDT', 'ERC20', 'Tether USD · ERC20', 'Ethereum network. Higher network fees.', 8.00, 12, true, 2),
  ('USDT', 'BEP20', 'Tether USD · BEP20', 'BNB Smart Chain. Low fees.', 0.60, 15, true, 3),
  ('BTC', 'Bitcoin', 'Bitcoin · Bitcoin network', 'Native Bitcoin network.', 2.00, 3, true, 4),
  ('ETH', 'ERC20', 'Ethereum · ERC20', 'Ethereum network.', 8.00, 12, true, 5),
  ('USDC', 'ERC20', 'USD Coin · ERC20', 'Ethereum network.', 8.00, 12, true, 6),
  ('USDC', 'TRC20', 'USD Coin · TRC20', 'Tron network.', 1.00, 20, true, 7),
  ('BNB', 'BEP20', 'BNB · BEP20', 'BNB Smart Chain.', 0.60, 15, true, 8)
on conflict (asset, network) do update
  set label = excluded.label,
      description = excluded.description,
      fee_estimate_usd = excluded.fee_estimate_usd,
      min_confirmations = excluded.min_confirmations,
      enabled = excluded.enabled,
      sort_order = excluded.sort_order;

alter table public.crypto_networks enable row level security;
drop policy if exists crypto_networks_public_read on public.crypto_networks;
create policy crypto_networks_public_read
  on public.crypto_networks for select
  to anon, authenticated
  using (true);
grant select on public.crypto_networks to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Withdrawal table extensions
-- ----------------------------------------------------------------------------
alter table public.withdrawals
  add column if not exists currency text not null default 'USD',
  add column if not exists fee_amount numeric(12,2) not null default 0,
  add column if not exists net_amount numeric(12,2),
  add column if not exists bank_name text,
  add column if not exists bank_code text,
  add column if not exists account_number_last4 text,
  add column if not exists account_reference text,
  add column if not exists payment_details_encrypted bytea,
  add column if not exists crypto_asset text,
  add column if not exists crypto_network text,
  add column if not exists wallet_address text,
  add column if not exists card_brand text,
  add column if not exists card_last4 text,
  add column if not exists payment_account_id uuid,
  add column if not exists provider text not null default 'manual',
  add column if not exists provider_reference text,
  add column if not exists provider_status text,
  add column if not exists idempotency_key text,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists user_confirmed_at timestamptz;

alter table public.withdrawals drop constraint if exists withdrawals_status_check;
alter table public.withdrawals drop constraint if exists withdrawals_method_check;

update public.withdrawals set status = 'completed' where status = 'paid';
update public.withdrawals set method = 'crypto' where method = 'digital_wallet';
update public.withdrawals set method = 'card' where method = 'card_credit';

alter table public.withdrawals
  add constraint withdrawals_status_check
  check (status in ('pending', 'reviewing', 'approved', 'processing', 'completed', 'rejected', 'cancelled'));

alter table public.withdrawals
  add constraint withdrawals_method_check
  check (method in ('bank_transfer', 'crypto', 'card'));

create unique index if not exists withdrawals_idempotency_idx
  on public.withdrawals (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists withdrawals_status_created_idx
  on public.withdrawals (status, created_at desc);

-- ----------------------------------------------------------------------------
-- Tokenised payment accounts
-- ----------------------------------------------------------------------------
create table if not exists public.payment_accounts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  type              text not null check (type in ('bank', 'crypto', 'card')),
  provider          text not null default 'manual',
  provider_token    text,
  label             text not null default '',
  account_holder    text,
  bank_name         text,
  bank_code         text,
  account_last4     text,
  iban_last4        text,
  crypto_asset      text,
  crypto_network    text,
  wallet_address    text,
  card_brand        text,
  card_last4        text,
  card_exp_month    integer check (card_exp_month between 1 and 12),
  card_exp_year     integer check (card_exp_year between 2024 and 2100),
  status            text not null default 'active' check (status in ('active', 'revoked')),
  is_default        boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists payment_accounts_user_idx
  on public.payment_accounts (user_id, created_at desc);

drop trigger if exists payment_accounts_set_updated_at on public.payment_accounts;
create trigger payment_accounts_set_updated_at
  before update on public.payment_accounts
  for each row execute function public.set_updated_at();

alter table public.withdrawals
  drop constraint if exists withdrawals_payment_account_fk;
alter table public.withdrawals
  add constraint withdrawals_payment_account_fk
  foreign key (payment_account_id) references public.payment_accounts (id) on delete set null;

alter table public.payment_accounts enable row level security;
drop policy if exists payment_accounts_select_own_or_admin on public.payment_accounts;
create policy payment_accounts_select_own_or_admin
  on public.payment_accounts for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists payment_accounts_insert_own on public.payment_accounts;
create policy payment_accounts_insert_own
  on public.payment_accounts for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists payment_accounts_update_own on public.payment_accounts;
create policy payment_accounts_update_own
  on public.payment_accounts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists payment_accounts_delete_own on public.payment_accounts;
create policy payment_accounts_delete_own
  on public.payment_accounts for delete
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.payment_accounts to authenticated;

-- ----------------------------------------------------------------------------
-- Withdrawal status history and administrative audit
-- ----------------------------------------------------------------------------
create table if not exists public.withdrawal_status_history (
  id             uuid primary key default gen_random_uuid(),
  withdrawal_id  uuid not null references public.withdrawals (id) on delete cascade,
  from_status    text,
  to_status      text not null,
  note           text not null default '',
  actor_id       uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists withdrawal_status_history_idx
  on public.withdrawal_status_history (withdrawal_id, created_at);

alter table public.withdrawal_status_history enable row level security;
drop policy if exists withdrawal_status_history_select_own_or_admin on public.withdrawal_status_history;
create policy withdrawal_status_history_select_own_or_admin
  on public.withdrawal_status_history for select
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.withdrawals w
      where w.id = withdrawal_id and w.user_id = auth.uid()
    )
  );

grant select on public.withdrawal_status_history to authenticated;

create table if not exists public.admin_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references public.profiles (id) on delete set null,
  action       text not null,
  entity_type  text not null default 'withdrawal',
  entity_id    uuid,
  details      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs (created_at desc);

alter table public.admin_audit_logs enable row level security;
drop policy if exists admin_audit_logs_select_admin on public.admin_audit_logs;
create policy admin_audit_logs_select_admin
  on public.admin_audit_logs for select
  to authenticated
  using (public.is_admin());

grant select on public.admin_audit_logs to authenticated;

-- ----------------------------------------------------------------------------
-- Validation helpers
-- ----------------------------------------------------------------------------
create or replace function private.valid_iban(p_value text)
returns boolean
language plpgsql
immutable
set search_path = pg_temp
as $$
declare
  v_clean text;
  v_rearr text;
  v_digits text;
  v_mod integer := 0;
  i integer;
  ch text;
begin
  v_clean := upper(regexp_replace(coalesce(p_value, ''), '\s', '', 'g'));
  if v_clean !~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$' then
    return false;
  end if;
  v_rearr := substr(v_clean, 5) || substr(v_clean, 1, 4);
  v_digits := '';
  for i in 1..length(v_rearr) loop
    ch := substr(v_rearr, i, 1);
    if ch ~ '[A-Z]' then
      v_digits := v_digits || (ascii(ch) - 55)::text;
    else
      v_digits := v_digits || ch;
    end if;
  end loop;
  for i in 1..length(v_digits) loop
    v_mod := (v_mod * 10 + substr(v_digits, i, 1)::integer) % 97;
  end loop;
  return v_mod = 1;
end;
$$;
revoke all on function private.valid_iban(text) from public;

create or replace function private.valid_wallet(p_asset text, p_network text, p_address text)
returns boolean
language sql
immutable
set search_path = pg_temp
as $$
  select case
    when p_address is null or length(trim(p_address)) = 0 then false
    when p_network in ('ERC20', 'BEP20') then p_address ~ '^0x[a-fA-F0-9]{40}$'
    when p_network = 'TRC20' then p_address ~ '^T[1-9A-HJ-NP-Za-km-z]{33}$'
    when p_network = 'Bitcoin' then p_address ~ '^(bc1[a-zA-HJ-NP-Z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$'
    else false
  end;
$$;
revoke all on function private.valid_wallet(text, text, text) from public;

-- ----------------------------------------------------------------------------
-- Profile self-healing for accounts created before the trigger existed
-- ----------------------------------------------------------------------------
create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_meta  jsonb;
  v_row   public.profiles;
begin
  if v_uid is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;

  select email, coalesce(raw_user_meta_data, '{}'::jsonb)
    into v_email, v_meta
  from auth.users
  where id = v_uid;

  if not found then
    raise exception 'Authentication account not found.' using errcode = '42501';
  end if;

  insert into public.profiles (id, email, full_name, phone, location)
  values (
    v_uid,
    coalesce(v_email, ''),
    coalesce(nullif(v_meta ->> 'full_name', ''), ''),
    nullif(v_meta ->> 'phone', ''),
    nullif(v_meta ->> 'location', '')
  )
  on conflict (id) do update
    set email = coalesce(nullif(excluded.email, ''), public.profiles.email);

  insert into public.user_roles (user_id, role)
  values (v_uid, 'user')
  on conflict (user_id, role) do nothing;

  insert into public.reward_accounts (user_id, balance, currency, is_simulated, status)
  values (v_uid, 30000, 'USD', true, 'active')
  on conflict (user_id) do nothing;

  select * into v_row from public.profiles where id = v_uid;
  return v_row;
end;
$$;
revoke all on function public.ensure_profile() from public;
grant execute on function public.ensure_profile() to authenticated;

-- ----------------------------------------------------------------------------
-- Request a withdrawal (method-specific, reserved balance, idempotent)
-- ----------------------------------------------------------------------------
drop function if exists public.request_withdrawal(numeric, text, text, text);

create or replace function public.request_withdrawal(
  p_amount numeric,
  p_method text,
  p_account_name text,
  p_currency text default 'USD',
  p_bank_name text default null,
  p_bank_code text default null,
  p_account_number text default null,
  p_account_reference text default null,
  p_crypto_asset text default null,
  p_crypto_network text default null,
  p_wallet_address text default null,
  p_card_payment_account_id uuid default null,
  p_idempotency_key text default null
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_profile    public.profiles;
  v_account    public.reward_accounts;
  v_method     public.withdrawal_methods;
  v_network    public.crypto_networks;
  v_reserved   numeric(12,2);
  v_available  numeric(12,2);
  v_fee        numeric(12,2) := 0;
  v_ref        text;
  v_row        public.withdrawals;
  v_existing   public.withdrawals;
  v_payment    public.payment_accounts;
  v_destination text;
  v_last4      text;
  v_details    jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to request a withdrawal.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.status <> 'active' then
    raise exception 'This account is not active.' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
    from public.withdrawals
    where user_id = v_uid and idempotency_key = p_idempotency_key;
    if found then
      return v_existing;
    end if;
  end if;

  select * into v_method
  from public.withdrawal_methods
  where method = p_method and enabled;
  if not found then
    raise exception 'Select an available withdrawal method.';
  end if;

  if p_amount is null or p_amount < v_method.min_amount then
    raise exception 'The minimum withdrawal amount is %.', v_method.min_amount;
  end if;
  if p_amount > v_method.max_amount then
    raise exception 'The maximum withdrawal amount is %.', v_method.max_amount;
  end if;

  select * into v_account
  from public.reward_accounts
  where user_id = v_uid
  for update;
  if not found or v_account.status <> 'active' then
    raise exception 'Your reward account is not available.';
  end if;

  select coalesce(sum(amount), 0) into v_reserved
  from public.withdrawals
  where user_id = v_uid
    and status in ('pending', 'reviewing', 'approved', 'processing');

  v_available := v_account.balance - v_reserved;
  if p_amount > v_available then
    raise exception 'That amount exceeds your available balance of %.', v_available;
  end if;

  if v_method.fee_type = 'flat' then
    v_fee := v_method.fee_value;
  elsif v_method.fee_type = 'percent' then
    v_fee := round(p_amount * v_method.fee_value / 100, 2);
  end if;

  if p_method = 'bank_transfer' then
    if p_account_name is null or length(trim(p_account_name)) < 2 then
      raise exception 'Enter the account holder name.';
    end if;
    if p_bank_name is null or length(trim(p_bank_name)) < 2 then
      raise exception 'Enter the bank name.';
    end if;
    if p_account_number is null or length(regexp_replace(p_account_number, '\s', '', 'g')) < 6 then
      raise exception 'Enter a valid account number.';
    end if;
    if upper(regexp_replace(p_account_number, '\s', '', 'g')) ~ '^[A-Z]{2}[0-9]{2}' then
      if not private.valid_iban(p_account_number) then
        raise exception 'That IBAN is not valid. Check the country code and digits.';
      end if;
    elsif regexp_replace(p_account_number, '\s', '', 'g') !~ '^[0-9]{6,34}$' then
      raise exception 'Account numbers must contain between 6 and 34 digits.';
    end if;
    v_last4 := right(regexp_replace(p_account_number, '\s', '', 'g'), 4);
    v_destination := format('Bank •••• %s', v_last4);
    v_details := jsonb_build_object(
      'account_number', regexp_replace(p_account_number, '\s', '', 'g'),
      'bank_name', trim(p_bank_name),
      'bank_code', nullif(trim(coalesce(p_bank_code, '')), ''),
      'account_reference', nullif(trim(coalesce(p_account_reference, '')), '')
    );
  elsif p_method = 'crypto' then
    if p_crypto_asset is null or p_crypto_network is null then
      raise exception 'Select a cryptocurrency and network.';
    end if;
    select * into v_network
    from public.crypto_networks
    where asset = p_crypto_asset and network = p_crypto_network and enabled;
    if not found then
      raise exception 'That asset and network combination is not supported.';
    end if;
    if not private.valid_wallet(p_crypto_asset, p_crypto_network, p_wallet_address) then
      raise exception 'The wallet address is not valid for % on %.', p_crypto_asset, p_crypto_network;
    end if;
    v_destination := format('%s · %s', p_crypto_asset, p_crypto_network);
    v_details := jsonb_build_object(
      'crypto_asset', p_crypto_asset,
      'crypto_network', p_crypto_network,
      'wallet_address', trim(p_wallet_address)
    );
  elsif p_method = 'card' then
    if p_card_payment_account_id is null then
      raise exception 'Connect an eligible card before requesting a card withdrawal.';
    end if;
    select * into v_payment
    from public.payment_accounts
    where id = p_card_payment_account_id
      and user_id = v_uid
      and type = 'card'
      and status = 'active';
    if not found then
      raise exception 'That connected card is not available.';
    end if;
    v_destination := format('%s •••• %s', coalesce(v_payment.card_brand, 'Card'), coalesce(v_payment.card_last4, ''));
    v_details := jsonb_build_object(
      'payment_account_id', v_payment.id,
      'provider', v_payment.provider,
      'provider_token', v_payment.provider_token,
      'card_brand', v_payment.card_brand,
      'card_last4', v_payment.card_last4
    );
  end if;

  v_ref := public.next_reference('TO-WD');

  insert into public.withdrawals (
    user_id, reference, amount, currency, method, destination_label, account_name,
    fee_amount, net_amount, bank_name, bank_code, account_number_last4, account_reference,
    payment_details_encrypted, crypto_asset, crypto_network, wallet_address,
    card_brand, card_last4, payment_account_id, status, note,
    idempotency_key, estimated_completion_at, user_confirmed_at
  )
  values (
    v_uid, v_ref, p_amount, upper(coalesce(nullif(trim(p_currency), ''), 'USD')), p_method,
    v_destination, trim(p_account_name), v_fee, p_amount - v_fee,
    nullif(trim(coalesce(p_bank_name, '')), ''),
    nullif(trim(coalesce(p_bank_code, '')), ''),
    v_last4, nullif(trim(coalesce(p_account_reference, '')), ''),
    case when v_details is null then null
         else extensions.pgp_sym_encrypt(v_details::text, private.payment_key())
    end,
    p_crypto_asset, p_crypto_network,
    case when p_method = 'crypto' then trim(p_wallet_address) else null end,
    v_payment.card_brand, v_payment.card_last4, v_payment.id,
    'pending', '', p_idempotency_key, now() + interval '3 days', now()
  )
  returning * into v_row;

  insert into public.withdrawal_status_history (withdrawal_id, from_status, to_status, note, actor_id)
  values (v_row.id, null, 'pending', 'Withdrawal request submitted.', v_uid);

  insert into public.notifications (user_id, title, body, type)
  values (
    v_uid,
    'Withdrawal request received',
    format('Withdrawal %s for %s %s is pending review. You can follow its progress from your dashboard.', v_ref, v_row.currency, to_char(p_amount, 'FM999,999,990.00')),
    'withdrawal'
  );

  insert into public.notifications (user_id, title, body, type)
  select p.id, 'Withdrawal awaiting review',
         format('Withdrawal %s from %s requires review.', v_ref, v_profile.full_name), 'withdrawal'
  from public.profiles p
  join public.user_roles r on r.user_id = p.id and r.role = 'admin';

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (v_uid, 'withdrawal.created', 'withdrawal', format('Withdrawal %s requested.', v_ref));

  return v_row;
end;
$$;
revoke all on function public.request_withdrawal(numeric, text, text, text, text, text, text, text, text, text, text, uuid, text) from public;
grant execute on function public.request_withdrawal(numeric, text, text, text, text, text, text, text, text, text, text, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Administrative status transitions
-- ----------------------------------------------------------------------------
create or replace function public.admin_update_withdrawal_status(
  p_id uuid,
  p_status text,
  p_note text default '',
  p_provider_reference text default null,
  p_provider_confirmed boolean default false
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin   uuid := auth.uid();
  v_row     public.withdrawals;
  v_balance numeric(12,2);
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  select * into v_row from public.withdrawals where id = p_id for update;
  if not found then
    raise exception 'Withdrawal not found.';
  end if;

  if p_status not in ('pending', 'reviewing', 'approved', 'processing', 'completed', 'rejected', 'cancelled') then
    raise exception 'Unknown withdrawal status.';
  end if;

  if p_status = v_row.status then
    return v_row;
  end if;

  if not (
    (v_row.status = 'pending' and p_status in ('reviewing', 'approved', 'rejected', 'cancelled'))
    or (v_row.status = 'reviewing' and p_status in ('approved', 'rejected', 'cancelled'))
    or (v_row.status = 'approved' and p_status in ('processing', 'rejected', 'cancelled'))
    or (v_row.status = 'processing' and p_status in ('completed', 'rejected'))
  ) then
    raise exception 'A withdrawal cannot move from % to %.', v_row.status, p_status;
  end if;

  if p_status = 'completed' then
    if not p_provider_confirmed then
      raise exception 'Confirm that the payout has been settled before completing this withdrawal.';
    end if;
    update public.reward_accounts
      set balance = balance - v_row.amount
      where user_id = v_row.user_id and balance >= v_row.amount
      returning balance into v_balance;
    if not found then
      raise exception 'The member has insufficient balance to complete this withdrawal.';
    end if;
  end if;

  update public.withdrawals
  set status = p_status,
      note = case when p_note is null or p_note = '' then note else p_note end,
      provider_reference = coalesce(p_provider_reference, provider_reference),
      provider_status = case when p_status = 'completed' then 'confirmed' else provider_status end,
      reviewed_by = case when p_status in ('reviewing', 'approved', 'rejected') then v_admin else reviewed_by end,
      reviewed_at = case when p_status in ('reviewing', 'approved', 'rejected') then now() else reviewed_at end,
      approved_at = case when p_status = 'approved' then now() else approved_at end,
      completed_at = case when p_status = 'completed' then now() else completed_at end,
      processed_at = case when p_status = 'completed' then now() else processed_at end,
      rejection_reason = case when p_status = 'rejected' then coalesce(nullif(p_note, ''), 'Request declined.') else rejection_reason end
  where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;
revoke all on function public.admin_update_withdrawal_status(uuid, text, text, text, boolean) from public;
grant execute on function public.admin_update_withdrawal_status(uuid, text, text, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Internal administrative notes (no status transition)
-- ----------------------------------------------------------------------------
create or replace function public.admin_add_withdrawal_note(
  p_id uuid,
  p_note text
)
returns public.withdrawals
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_row   public.withdrawals;
  v_note  text := nullif(trim(coalesce(p_note, '')), '');
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  if v_note is null then
    raise exception 'Enter an internal note.';
  end if;

  update public.withdrawals
  set note = v_note
  where id = p_id
  returning * into v_row;
  if not found then
    raise exception 'Withdrawal not found.';
  end if;

  insert into public.withdrawal_status_history (withdrawal_id, from_status, to_status, note, actor_id)
  values (v_row.id, v_row.status, v_row.status, v_note, v_admin);

  insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, details)
  values (v_admin, 'withdrawal.note', 'withdrawal', p_id, jsonb_build_object('note', v_note));

  return v_row;
end;
$$;
revoke all on function public.admin_add_withdrawal_note(uuid, text) from public;
grant execute on function public.admin_add_withdrawal_note(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Decrypt payment details for an authorised administrator
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_withdrawal_details(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_row   public.withdrawals;
  v_bank  jsonb;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  select * into v_row from public.withdrawals where id = p_id;
  if not found then
    raise exception 'Withdrawal not found.';
  end if;

  if v_row.payment_details_encrypted is not null then
    v_bank := extensions.pgp_sym_decrypt(v_row.payment_details_encrypted, private.payment_key())::jsonb;
  end if;

  insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, details)
  values (v_admin, 'withdrawal.details_viewed', 'withdrawal', p_id, '{}'::jsonb);

  return jsonb_build_object(
    'id', v_row.id,
    'reference', v_row.reference,
    'method', v_row.method,
    'details', coalesce(v_bank, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.admin_get_withdrawal_details(uuid) from public;
grant execute on function public.admin_get_withdrawal_details(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Status history, notification and audit trigger
-- ----------------------------------------------------------------------------
create or replace function public.on_withdrawal_status_changed()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_body text;
begin
  insert into public.withdrawal_status_history (withdrawal_id, from_status, to_status, note, actor_id)
  values (new.id, old.status, new.status, coalesce(new.note, ''), auth.uid());

  v_body := case new.status
    when 'pending' then format('Withdrawal %s is pending review.', new.reference)
    when 'reviewing' then format('Withdrawal %s is being reviewed by our operations desk.', new.reference)
    when 'approved' then format('Withdrawal %s has been approved and is awaiting processing.', new.reference)
    when 'processing' then format('Withdrawal %s is processing with our payment provider.', new.reference)
    when 'completed' then format('Withdrawal %s has been completed and the payout confirmed.', new.reference)
    when 'rejected' then format('Withdrawal %s was declined. %s', new.reference, coalesce(nullif(new.rejection_reason, ''), 'Contact support for details.'))
    when 'cancelled' then format('Withdrawal %s was cancelled.', new.reference)
    else format('Withdrawal %s is now %s.', new.reference, replace(new.status, '_', ' '))
  end;

  insert into public.notifications (user_id, title, body, type)
  values (new.user_id, 'Withdrawal update', v_body, 'withdrawal');

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (new.user_id, 'withdrawal.status', 'withdrawal', format('Withdrawal %s set to %s.', new.reference, new.status));

  if auth.uid() is not null then
    insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'withdrawal.status', 'withdrawal', new.id,
            jsonb_build_object('from', old.status, 'to', new.status));
  end if;

  return new;
end;
$$;

drop trigger if exists withdrawals_notify_status on public.withdrawals;
create trigger withdrawals_notify_status
  after update of status on public.withdrawals
  for each row
  when (new.status is distinct from old.status)
  execute function public.on_withdrawal_status_changed();

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant select on public.withdrawals to authenticated;
grant update on public.withdrawals to authenticated;
grant select, insert on public.withdrawal_status_history to authenticated;
grant select on public.admin_audit_logs to authenticated;


-- ----------------------------------------------------------------------------
-- Source: supabase/migrations/20261110120000_payment_cards.sql
-- ----------------------------------------------------------------------------

-- ============================================================================
-- Trump Offers — 11 · Manual payout cards
--
-- Adds an encrypted card-on-file flow for deployments that have no payment
-- provider. Full card numbers live in the private schema, are never exposed by
-- PostgREST, and are decrypted only by an admin-only RPC that writes an audit
-- entry. CVVs, PINs and online-banking credentials are never accepted.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Private card secret store
-- ----------------------------------------------------------------------------
create table if not exists private.payment_card_secrets (
  payment_account_id    uuid primary key
                        references public.payment_accounts (id) on delete cascade,
  card_number_encrypted bytea not null,
  card_fingerprint      text not null,
  created_at            timestamptz not null default now()
);

drop index if exists private.payment_card_secrets_fingerprint_idx;
create index if not exists payment_card_secrets_fingerprint_idx
  on private.payment_card_secrets (card_fingerprint);

revoke all on private.payment_card_secrets from public;
revoke all on private.payment_card_secrets from anon, authenticated;

comment on table private.payment_card_secrets is
  'Encrypted full card numbers for manual payouts. Never exposed through the API; use admin_get_payment_card().';

-- ----------------------------------------------------------------------------
-- Card helpers
-- ----------------------------------------------------------------------------
create or replace function private.luhn_valid(p_number text)
returns boolean
language plpgsql
immutable
set search_path = private, pg_temp
as $$
declare
  v_sum   integer := 0;
  v_digit integer;
  v_alt   boolean := false;
  i       integer;
begin
  if p_number is null or p_number !~ '^[0-9]{13,19}$' then
    return false;
  end if;

  for i in reverse length(p_number)..1 loop
    v_digit := substr(p_number, i, 1)::integer;
    if v_alt then
      v_digit := v_digit * 2;
      if v_digit > 9 then
        v_digit := v_digit - 9;
      end if;
    end if;
    v_sum := v_sum + v_digit;
    v_alt := not v_alt;
  end loop;

  return v_sum % 10 = 0;
end;
$$;

create or replace function private.card_brand(p_number text)
returns text
language sql
immutable
set search_path = private, pg_temp
as $$
  select case
    when p_number ~ '^4' then 'Visa'
    when p_number ~ '^(5[1-5]|222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)' then 'Mastercard'
    when p_number ~ '^3[47]' then 'American Express'
    when p_number ~ '^(6011|65|64[4-9])' then 'Discover'
    when p_number ~ '^35' then 'JCB'
    when p_number ~ '^3(0[0-5]|[68])' then 'Diners Club'
    when p_number ~ '^62' then 'UnionPay'
    else 'Card'
  end;
$$;

-- ----------------------------------------------------------------------------
-- Member immutability
--
-- Direct API inserts are reserved for hosted-provider tokens. Manual payout
-- cards are created only by connect_payment_card(), and members cannot update
-- or delete payment accounts directly. Revocation is administrator-only.
-- ----------------------------------------------------------------------------
drop policy if exists payment_accounts_insert_own on public.payment_accounts;
create policy payment_accounts_insert_own
  on public.payment_accounts for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      type <> 'card'
      or (provider <> 'manual' and provider_token is not null)
    )
  );

drop policy if exists payment_accounts_update_own on public.payment_accounts;
drop policy if exists payment_accounts_delete_own on public.payment_accounts;
revoke update, delete on public.payment_accounts from authenticated;

-- ----------------------------------------------------------------------------
-- RPC · connect an encrypted payout card
-- ----------------------------------------------------------------------------
create or replace function public.connect_payment_card(
  p_cardholder_name text,
  p_card_number text,
  p_exp_month integer,
  p_exp_year integer,
  p_label text default '',
  p_is_default boolean default true
)
returns public.payment_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid          uuid := auth.uid();
  v_profile      public.profiles;
  v_digits       text;
  v_brand        text;
  v_last4        text;
  v_fingerprint  text;
  v_active_count integer;
  v_row          public.payment_accounts;
  v_name         text;
begin
  if v_uid is null then
    raise exception 'Sign in to connect a payout card.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.status <> 'active' then
    raise exception 'This account is not active.' using errcode = '42501';
  end if;

  v_name := regexp_replace(coalesce(p_cardholder_name, ''), '\s+', ' ', 'g');
  if length(trim(v_name)) < 2 then
    raise exception 'Enter the cardholder name.';
  end if;
  if length(v_name) > 64 then
    raise exception 'Cardholder names are limited to 64 characters.';
  end if;

  v_digits := regexp_replace(coalesce(p_card_number, ''), '[^0-9]', '', 'g');
  if length(v_digits) < 13 or length(v_digits) > 19 then
    raise exception 'Enter a valid card number.';
  end if;
  if not private.luhn_valid(v_digits) then
    raise exception 'That card number is not valid.';
  end if;

  if p_exp_month is null or p_exp_month < 1 or p_exp_month > 12 then
    raise exception 'Select a valid expiry month.';
  end if;
  if p_exp_year is null
     or p_exp_year < extract(year from now())::integer
     or p_exp_year > extract(year from now())::integer + 20 then
    raise exception 'Select a valid expiry year.';
  end if;
  if p_exp_year = extract(year from now())::integer
     and p_exp_month < extract(month from now())::integer then
    raise exception 'That card has expired.';
  end if;

  v_brand := private.card_brand(v_digits);
  v_last4 := right(v_digits, 4);
  v_fingerprint := encode(
    extensions.digest(v_digits || private.payment_key(), 'sha256'),
    'hex'
  );

  select count(*) into v_active_count
  from public.payment_accounts
  where user_id = v_uid and type = 'card' and status = 'active';

  if v_active_count >= 5 then
    raise exception 'You can keep at most five active payout cards.';
  end if;

  if exists (
    select 1
    from private.payment_card_secrets s
    join public.payment_accounts a on a.id = s.payment_account_id
    where s.card_fingerprint = v_fingerprint
      and a.user_id = v_uid
      and a.status = 'active'
  ) then
    raise exception 'That card is already connected.';
  end if;

  if p_is_default then
    update public.payment_accounts
    set is_default = false
    where user_id = v_uid and type = 'card' and status = 'active';
  end if;

  insert into public.payment_accounts (
    user_id, type, provider, provider_token, label,
    account_holder, card_brand, card_last4,
    card_exp_month, card_exp_year, status, is_default
  )
  values (
    v_uid, 'card', 'manual', null,
    coalesce(nullif(trim(p_label), ''), format('%s ending %s', v_brand, v_last4)),
    trim(v_name), v_brand, v_last4,
    p_exp_month, p_exp_year, 'active', coalesce(p_is_default, false)
  )
  returning * into v_row;

  insert into private.payment_card_secrets (
    payment_account_id, card_number_encrypted, card_fingerprint
  )
  values (
    v_row.id,
    extensions.pgp_sym_encrypt(v_digits, private.payment_key()),
    v_fingerprint
  );

  insert into public.notifications (user_id, title, body, type)
  values (
    v_uid,
    'Payout card connected',
    format('Your %s ending %s is connected for manual payouts. Card details are visible only to authorised administrators.', v_brand, v_last4),
    'withdrawal'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (
    v_uid,
    'payment_account.card_added',
    'payment_account',
    format('%s ending %s connected for payouts.', v_brand, v_last4)
  );

  return v_row;
end;
$$;

revoke all on function public.connect_payment_card(text, text, integer, integer, text, boolean) from public;
grant execute on function public.connect_payment_card(text, text, integer, integer, text, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC · list cards for the administrator console
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_payment_cards()
returns table (
  id             uuid,
  user_id        uuid,
  member_name    text,
  member_email   text,
  account_holder text,
  card_brand     text,
  card_last4     text,
  card_exp_month integer,
  card_exp_year  integer,
  label          text,
  provider       text,
  status         text,
  is_default     boolean,
  created_at     timestamptz,
  updated_at     timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    a.id,
    a.user_id,
    coalesce(p.full_name, 'Member') as member_name,
    coalesce(p.email, '') as member_email,
    a.account_holder,
    a.card_brand,
    a.card_last4,
    a.card_exp_month,
    a.card_exp_year,
    a.label,
    a.provider,
    a.status,
    a.is_default,
    a.created_at,
    a.updated_at
  from public.payment_accounts a
  left join public.profiles p on p.id = a.user_id
  where a.type = 'card'
    and public.is_admin()
  order by a.created_at desc;
$$;

revoke all on function public.admin_list_payment_cards() from public;
grant execute on function public.admin_list_payment_cards() to authenticated;

-- ----------------------------------------------------------------------------
-- RPC · decrypt one card for an authorised administrator (audited)
-- ----------------------------------------------------------------------------
create or replace function public.admin_get_payment_card(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin  uuid := auth.uid();
  v_row    public.payment_accounts;
  v_secret private.payment_card_secrets;
  v_number text;
  v_member public.profiles;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  select * into v_row
  from public.payment_accounts
  where id = p_id and type = 'card';

  if not found then
    raise exception 'Payout card not found.';
  end if;

  select * into v_secret
  from private.payment_card_secrets
  where payment_account_id = p_id;

  if found then
    v_number := extensions.pgp_sym_decrypt(v_secret.card_number_encrypted, private.payment_key());
  end if;

  select * into v_member from public.profiles where id = v_row.user_id;

  insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, details)
  values (
    v_admin,
    'payment_card.viewed',
    'payment_account',
    p_id,
    jsonb_build_object('brand', v_row.card_brand, 'last4', v_row.card_last4)
  );

  return jsonb_build_object(
    'id', v_row.id,
    'user_id', v_row.user_id,
    'member_name', coalesce(v_member.full_name, 'Member'),
    'member_email', coalesce(v_member.email, ''),
    'cardholder_name', v_row.account_holder,
    'brand', v_row.card_brand,
    'last4', v_row.card_last4,
    'exp_month', v_row.card_exp_month,
    'exp_year', v_row.card_exp_year,
    'number', v_number,
    'label', v_row.label,
    'provider', v_row.provider,
    'status', v_row.status,
    'is_default', v_row.is_default,
    'created_at', v_row.created_at
  );
end;
$$;

revoke all on function public.admin_get_payment_card(uuid) from public;
grant execute on function public.admin_get_payment_card(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC · revoke a card from the administrator console
-- ----------------------------------------------------------------------------
create or replace function public.admin_revoke_payment_card(p_id uuid)
returns public.payment_accounts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_row   public.payment_accounts;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  update public.payment_accounts
  set status = 'revoked', is_default = false
  where id = p_id and type = 'card'
  returning * into v_row;

  if not found then
    raise exception 'Payout card not found.';
  end if;

  insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, details)
  values (
    v_admin,
    'payment_card.revoked',
    'payment_account',
    p_id,
    jsonb_build_object('brand', v_row.card_brand, 'last4', v_row.card_last4)
  );

  insert into public.notifications (user_id, title, body, type)
  values (
    v_row.user_id,
    'Payout card revoked',
    format('Your %s ending %s was removed as a payout destination.', v_row.card_brand, v_row.card_last4),
    'withdrawal'
  );

  return v_row;
end;
$$;

revoke all on function public.admin_revoke_payment_card(uuid) from public;
grant execute on function public.admin_revoke_payment_card(uuid) to authenticated;

commit;
