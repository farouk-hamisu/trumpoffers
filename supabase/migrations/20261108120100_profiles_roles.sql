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
