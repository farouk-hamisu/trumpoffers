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
