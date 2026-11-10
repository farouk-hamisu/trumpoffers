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
