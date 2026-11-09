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
  reward                  text        not null default 'Trump demonstration reward',
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
    format('Demonstration claim %s is now marked “%s”.', new.reference, replace(new.status, '_', ' ')),
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
      when new.status = 'paid' then format('Demonstration withdrawal %s has been marked complete. No real funds were transferred.', new.reference)
      else format('Demonstration withdrawal %s is now marked “%s”.', new.reference, replace(new.status, '_', ' '))
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
-- RPC · create a simulated reward claim
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

  v_hours := floor(random() * 6 + 5)::integer; -- 5–10 hour simulated window
  v_ref := public.next_reference('TO-RW');

  insert into public.reward_claims (
    user_id, reference, reward, amount, status, stage, progress, note,
    processing_started_at, estimated_completion_at
  )
  values (
    v_uid,
    v_ref,
    'Trump demonstration reward',
    v_account.balance,
    'verifying',
    2,
    22,
    'Demonstration verification in progress. No real funds are involved.',
    now(),
    now() + (v_hours * interval '1 hour')
  )
  returning * into v_claim;

  insert into public.notifications (user_id, title, body, type)
  values (
    v_uid,
    'Reward claim received',
    format('Claim %s is being verified in the demonstration environment. Estimated processing window: %s hours.', v_ref, v_hours),
    'reward'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (v_uid, 'claim.created', 'reward_claim', format('Demonstration reward claim %s submitted.', v_ref));

  return v_claim;
end;
$$;

revoke all on function public.create_reward_claim() from public;
grant execute on function public.create_reward_claim() to authenticated;

-- ----------------------------------------------------------------------------
-- RPC · request a simulated withdrawal
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
    raise exception 'The minimum demonstration withdrawal is $100.';
  end if;

  if p_method not in ('bank_transfer', 'digital_wallet', 'card_credit') then
    raise exception 'Select a demonstration withdrawal method.';
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
    raise exception 'That amount exceeds your available demonstration balance.';
  end if;

  v_ref := public.next_reference('TO-WD');

  insert into public.withdrawals (
    user_id, reference, amount, method, destination_label, account_name,
    status, note, estimated_completion_at
  )
  values (
    v_uid, v_ref, p_amount, p_method, trim(p_destination_label), trim(p_account_name),
    'processing',
    'Simulated withdrawal submitted for demonstration processing.',
    now() + interval '3 days'
  )
  returning * into v_row;

  insert into public.notifications (user_id, title, body, type)
  values (
    v_uid,
    'Withdrawal submitted',
    format('Demonstration withdrawal %s is processing. No real transfer will occur.', v_ref),
    'withdrawal'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (v_uid, 'withdrawal.created', 'withdrawal', format('Demonstration withdrawal %s requested.', v_ref));

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
-- Trump Offers — 05 · Demonstration card studio
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
-- Fictional card number generator with a valid Luhn check digit.
-- The number is intended solely for a non-functional demonstration card.
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
-- RPC · create a fictional card application
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
    raise exception 'Sign in to create a demonstration card.' using errcode = '42501';
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
    'Fictional card issued for demonstration only. It is not a payment instrument.'
  )
  returning * into v_row;

  insert into public.notifications (user_id, title, body, type)
  values (
    v_uid,
    'Card request received',
    format('Your demonstration card request %s is awaiting administrator review.', v_ref),
    'card'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (v_uid, 'card.created', 'card_application',
    format('Demonstration card application %s submitted.', v_ref));

  return v_row;
end;
$$;

revoke all on function public.create_card_application(text, text) from public;
grant execute on function public.create_card_application(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC · verify a fictional card by reference + last four (public-safe payload)
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
    case when new.status = 'approved' then 'Demonstration card approved' else 'Card application update' end,
    case
      when new.status = 'approved' then format('Your demonstration card %s has been approved. The card is fictional and cannot be used for payment.', new.reference)
      else format('Your demonstration card application %s is now marked “%s”.', new.reference, replace(new.status, '_', ' '))
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
  on conflict (id) do nothing;

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
    'Your demonstration account is ready. Explore rewards, open roles and the card studio at your own pace.',
    'account'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (new.id, 'account.created', 'profile', 'Trump Offers demonstration account created.');

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
  ('hero_support', to_jsonb('Explore opportunities, discover career possibilities and experience a modern demonstration rewards platform designed around simplicity and accessibility.'::text), true),
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
      'Guide members through demonstration workflows with clear, jargon-free communication.',
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
    'We are looking for a product designer with a sharp editorial eye and a respect for the quiet details that make a product feel expensive. You will own the end-to-end design of the Trump demonstration card: application, presentation, verification and administration.

You will work directly with engineering and brand, moving from wide explorations to production-ready specifications without losing the idea. We care deeply about craft, but we care more about clarity.',
    array[
      'Design end-to-end flows for the demonstration card, from application to verification.',
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
    'Keep every demonstration claim, withdrawal and card application moving with precision.',
    'The Rewards Operations Associate sits at the centre of the platform. You will review demonstration records, maintain service levels, and make sure members always know exactly where things stand.

You will be joining a small operations team with a broad mandate. Expect to improve processes as often as you run them, and to work closely with the administrators who oversee the platform.',
    array[
      'Review and progress demonstration reward claims and withdrawal requests.',
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
    'Write the words that make a demonstration platform feel considered, credible and human.',
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
    'Design the controls that keep a simulated rewards environment safe, honest and well-governed.',
    'You will help define the standards that govern a demonstration rewards platform: data minimisation, clear disclosures, secure access and reliable audit trails.

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


commit;
