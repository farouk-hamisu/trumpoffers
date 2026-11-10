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
