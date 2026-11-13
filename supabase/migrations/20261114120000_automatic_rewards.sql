-- ============================================================================
-- Trump Offers — 13 · Automatic rewards and reward transaction history
--
-- Rewards are credited automatically. Members no longer submit a claim.
-- Administrators can still issue and monitor rewards, and every credit is
-- written to the balance ledger with an idempotency key to prevent duplicates.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Ledger support for reward credits
-- ----------------------------------------------------------------------------
alter table public.balance_ledger
  add column if not exists idempotency_key text;

create unique index if not exists balance_ledger_idempotency_key_idx
  on public.balance_ledger (idempotency_key)
  where idempotency_key is not null;

alter table public.balance_ledger
  drop constraint if exists balance_ledger_entry_type_check;

alter table public.balance_ledger
  add constraint balance_ledger_entry_type_check
  check (entry_type in ('reservation', 'release', 'settlement', 'adjustment', 'reward'));

-- Members see rewards and settled withdrawals, not internal reservation
-- bookkeeping. Administrators continue to see the complete ledger.
drop policy if exists balance_ledger_select_own_or_admin on public.balance_ledger;
create policy balance_ledger_select_own_or_admin
  on public.balance_ledger for select
  to authenticated
  using (
    public.is_admin()
    or (
      user_id = auth.uid()
      and entry_type in ('reward', 'settlement', 'adjustment')
    )
  );

-- ----------------------------------------------------------------------------
-- Internal · credit a reward once
-- ----------------------------------------------------------------------------
create or replace function private.credit_reward(
  p_user_id uuid,
  p_amount numeric,
  p_note text,
  p_actor_id uuid default null,
  p_idempotency_key text default null,
  p_notify boolean default true
)
returns public.balance_ledger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.reward_accounts;
  v_entry   public.balance_ledger;
  v_before  numeric(12,2);
  v_note    text := coalesce(nullif(trim(p_note), ''), 'Reward added');
begin
  if p_user_id is null then
    raise exception 'Select a member.';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then
    raise exception 'Enter a reward amount between $0.01 and $1,000,000.';
  end if;

  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

    select * into v_entry
    from public.balance_ledger
    where idempotency_key = p_idempotency_key;

    if found then
      return v_entry;
    end if;
  end if;

  select * into v_account
  from public.reward_accounts
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'This member does not have a reward account.';
  end if;

  v_before := v_account.balance;

  update public.reward_accounts
  set balance = balance + p_amount
  where user_id = p_user_id
  returning * into v_account;

  insert into public.balance_ledger (
    user_id, entry_type, amount, balance_before, balance_after,
    note, actor_id, idempotency_key
  )
  values (
    p_user_id, 'reward', p_amount, v_before, v_account.balance,
    v_note, p_actor_id, p_idempotency_key
  )
  returning * into v_entry;

  if p_notify then
    insert into public.notifications (user_id, title, body, type)
    values (
      p_user_id,
      'Reward Added Successfully!',
      format(
        'A reward of %s has been added to your balance.',
        to_char(p_amount, 'FM$999,999,990.00')
      ),
      'reward'
    );
  end if;

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (
    p_user_id,
    'reward.credited',
    'reward',
    format('Reward of %s added to the account balance.', to_char(p_amount, 'FM$999,999,990.00'))
  );

  return v_entry;
end;
$$;

revoke all on function private.credit_reward(uuid, numeric, text, uuid, text, boolean) from public;

-- ----------------------------------------------------------------------------
-- New members receive the welcome reward automatically
-- ----------------------------------------------------------------------------
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
  values (new.id, 0, 'USD', true, 'active')
  on conflict (user_id) do nothing;

  perform private.credit_reward(
    new.id,
    30000,
    'Welcome reward',
    new.id,
    'welcome:' || new.id::text,
    true
  );

  insert into public.notifications (user_id, title, body, type)
  values (
    new.id,
    'Welcome to Trump Offers',
    'Your account is ready. Your reward balance is available to use.',
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
-- Backfill the welcome reward for accounts created before this migration.
-- Balances are not changed; only the corresponding history entry is added.
-- ----------------------------------------------------------------------------
insert into public.balance_ledger (
  user_id, entry_type, amount, balance_before, balance_after,
  note, idempotency_key, created_at
)
select
  a.user_id,
  'reward',
  30000,
  0,
  30000,
  'Welcome reward',
  'welcome:' || a.user_id::text,
  a.created_at
from public.reward_accounts a
where not exists (
  select 1
  from public.balance_ledger l
  where l.idempotency_key = 'welcome:' || a.user_id::text
);

-- ----------------------------------------------------------------------------
-- Admin RPC · issue a reward
-- ----------------------------------------------------------------------------
create or replace function public.admin_issue_reward(
  p_user_id uuid,
  p_amount numeric,
  p_note text default '',
  p_idempotency_key text default null
)
returns public.balance_ledger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_profile public.profiles;
  v_entry public.balance_ledger;
  v_key text;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Member not found.';
  end if;

  v_key := coalesce(
    nullif(trim(p_idempotency_key), ''),
    'admin:' || gen_random_uuid()::text
  );

  v_entry := private.credit_reward(
    p_user_id,
    p_amount,
    coalesce(nullif(trim(p_note), ''), 'Reward issued by support'),
    v_admin,
    v_key,
    true
  );

  insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, details)
  values (
    v_admin,
    'reward.issued',
    'reward',
    v_entry.id,
    jsonb_build_object(
      'user_id', p_user_id,
      'amount', p_amount,
      'note', coalesce(nullif(trim(p_note), ''), 'Reward issued by support'),
      'idempotency_key', v_key
    )
  );

  return v_entry;
end;
$$;

revoke all on function public.admin_issue_reward(uuid, numeric, text, text) from public;
grant execute on function public.admin_issue_reward(uuid, numeric, text, text) to authenticated;
