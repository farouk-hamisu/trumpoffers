-- ============================================================================
-- Trump Offers — 12 · Card-only withdrawals and admin-managed card fields
--
-- Adds:
--   * a single, card-only withdrawal method ("Connect Your Card")
--   * administrator-managed dynamic card form fields
--   * structured card form responses stored on payment_accounts.extra
--   * a balance ledger recording reservations, releases and settlements
--   * hardened request/approval RPCs that never mark a request successful
--     before an administrator confirms the payout has actually settled
-- ============================================================================

-- ----------------------------------------------------------------------------
-- One withdrawal method: Connect Your Card
-- ----------------------------------------------------------------------------
delete from public.withdrawal_methods where method in ('bank_transfer', 'crypto');

update public.withdrawal_methods
set label = 'Connect Your Card',
    description = 'Withdraw to a card you have connected and verified.',
    processing_time = '1–2 business days after approval',
    enabled = true,
    sort_order = 1,
    min_amount = 100,
    max_amount = 30000,
    fee_type = 'none',
    fee_value = 0
where method = 'card';

-- Safety net for a database that has never been seeded.
insert into public.withdrawal_methods
  (method, label, description, min_amount, max_amount, fee_type, fee_value, processing_time, enabled, sort_order)
values
  ('card', 'Connect Your Card', 'Withdraw to a card you have connected and verified.', 100, 30000, 'none', 0, '1–2 business days after approval', true, 1)
on conflict (method) do nothing;

-- ----------------------------------------------------------------------------
-- Structured extras on connected cards
-- ----------------------------------------------------------------------------
alter table public.payment_accounts
  add column if not exists extra jsonb not null default '{}'::jsonb;

comment on column public.payment_accounts.extra is
  'Validated responses to the administrator-managed card form fields. Never contains CVV, PIN or online-banking credentials.';

-- ----------------------------------------------------------------------------
-- Administrator-managed card form fields
-- ----------------------------------------------------------------------------
create table if not exists public.card_form_fields (
  id          uuid primary key default gen_random_uuid(),
  field_key   text not null unique check (field_key ~ '^[a-z][a-z0-9_]{0,40}$'),
  label       text not null,
  placeholder text not null default '',
  help_text   text not null default '',
  input_type  text not null default 'text'
              check (input_type in ('text', 'tel', 'number', 'email', 'textarea')),
  required    boolean not null default true,
  enabled     boolean not null default true,
  max_length  integer not null default 80 check (max_length between 1 and 500),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists card_form_fields_set_updated_at on public.card_form_fields;
create trigger card_form_fields_set_updated_at
  before update on public.card_form_fields
  for each row execute function public.set_updated_at();

insert into public.card_form_fields
  (field_key, label, placeholder, help_text, input_type, required, enabled, max_length, sort_order)
values
  ('bank_name', 'Bank name', 'e.g. Chase Bank', 'The bank that issued the card.', 'text', true, true, 80, 1),
  ('phone_number', 'Phone number', '+1 555 000 0000', 'A number the bank can reach you on if the payout needs verification.', 'tel', true, true, 32, 2),
  ('account_country', 'Bank account country', 'United States', 'The country where the card and bank account are registered.', 'text', false, true, 80, 3)
on conflict (field_key) do nothing;

alter table public.card_form_fields enable row level security;

drop policy if exists card_form_fields_read_enabled on public.card_form_fields;
create policy card_form_fields_read_enabled
  on public.card_form_fields for select
  to authenticated
  using (enabled or public.is_admin());

revoke all on public.card_form_fields from anon, authenticated;
grant select on public.card_form_fields to authenticated;

-- ----------------------------------------------------------------------------
-- Server-side validation of dynamic responses
-- ----------------------------------------------------------------------------
create or replace function private.validate_card_extra(p_extra jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_field public.card_form_fields;
  v_raw   text;
  v_value text;
  v_out   jsonb := '{}'::jsonb;
begin
  for v_field in
    select * from public.card_form_fields where enabled order by sort_order, created_at
  loop
    v_raw := coalesce(p_extra ->> v_field.field_key, '');
    v_value := trim(regexp_replace(v_raw, '\s+', ' ', 'g'));

    if v_value = '' then
      if v_field.required then
        raise exception 'Enter %s.', lower(v_field.label);
      end if;
      continue;
    end if;

    if length(v_value) > v_field.max_length then
      raise exception '%s must be %s characters or fewer.', v_field.label, v_field.max_length;
    end if;

    if v_field.input_type = 'number' and v_value !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception '%s must be a number.', v_field.label;
    end if;

    if v_field.input_type = 'email' and v_value !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Enter a valid %s.', lower(v_field.label);
    end if;

    if v_field.input_type = 'tel'
       and (v_value !~ '^[0-9+()\-.\s]{7,32}$' or length(regexp_replace(v_value, '[^0-9]', '', 'g')) < 7) then
      raise exception 'Enter a valid %s.', lower(v_field.label);
    end if;

    v_out := v_out || jsonb_build_object(v_field.field_key, v_value);
  end loop;

  return v_out;
end;
$$;
revoke all on function private.validate_card_extra(jsonb) from public;

-- ----------------------------------------------------------------------------
-- Member RPC · read the enabled card form fields
-- ----------------------------------------------------------------------------
create or replace function public.get_card_form_fields()
returns setof public.card_form_fields
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select * from public.card_form_fields
  where enabled and auth.uid() is not null
  order by sort_order, created_at;
$$;
revoke all on function public.get_card_form_fields() from public;
grant execute on function public.get_card_form_fields() to authenticated;

-- ----------------------------------------------------------------------------
-- Admin RPCs · card form field management
-- ----------------------------------------------------------------------------
create or replace function public.admin_list_card_form_fields()
returns setof public.card_form_fields
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  return query
    select * from public.card_form_fields order by sort_order, created_at;
end;
$$;
revoke all on function public.admin_list_card_form_fields() from public;
grant execute on function public.admin_list_card_form_fields() to authenticated;

create or replace function public.admin_create_card_form_field(
  p_label text,
  p_field_key text default null,
  p_placeholder text default '',
  p_help_text text default '',
  p_input_type text default 'text',
  p_required boolean default true,
  p_enabled boolean default true,
  p_max_length integer default 80
)
returns public.card_form_fields
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_key   text;
  v_row   public.card_form_fields;
  v_order integer;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  if p_label is null or length(trim(p_label)) < 2 then
    raise exception 'Enter a field label.';
  end if;
  if p_input_type not in ('text', 'tel', 'number', 'email', 'textarea') then
    raise exception 'Unsupported input type.';
  end if;
  if p_max_length is null or p_max_length < 1 or p_max_length > 500 then
    raise exception 'Maximum length must be between 1 and 500.';
  end if;

  v_key := lower(regexp_replace(coalesce(nullif(trim(p_field_key), ''), p_label), '[^a-zA-Z0-9]+', '_', 'g'));
  v_key := trim(both '_' from v_key);
  if v_key = '' then
    raise exception 'Enter a valid field label.';
  end if;
  if v_key !~ '^[a-z]' then
    v_key := 'field_' || v_key;
  end if;
  v_key := left(v_key, 41);

  select coalesce(max(sort_order), 0) + 1 into v_order from public.card_form_fields;

  insert into public.card_form_fields
    (field_key, label, placeholder, help_text, input_type, required, enabled, max_length, sort_order)
  values
    (v_key, trim(p_label), coalesce(p_placeholder, ''), coalesce(p_help_text, ''),
     p_input_type, coalesce(p_required, true), coalesce(p_enabled, true), p_max_length, v_order)
  returning * into v_row;

  insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, details)
  values (v_admin, 'card_form_field.created', 'card_form_field', v_row.id,
          jsonb_build_object('field_key', v_row.field_key, 'label', v_row.label));

  return v_row;
exception
  when unique_violation then
    raise exception 'A field with that key already exists. Choose a different key.';
end;
$$;
revoke all on function public.admin_create_card_form_field(text, text, text, text, text, boolean, boolean, integer) from public;
grant execute on function public.admin_create_card_form_field(text, text, text, text, text, boolean, boolean, integer) to authenticated;

create or replace function public.admin_update_card_form_field(
  p_id uuid,
  p_label text default null,
  p_placeholder text default null,
  p_help_text text default null,
  p_input_type text default null,
  p_required boolean default null,
  p_enabled boolean default null,
  p_max_length integer default null,
  p_sort_order integer default null
)
returns public.card_form_fields
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_row   public.card_form_fields;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  select * into v_row from public.card_form_fields where id = p_id for update;
  if not found then
    raise exception 'Card form field not found.';
  end if;

  if p_input_type is not null and p_input_type not in ('text', 'tel', 'number', 'email', 'textarea') then
    raise exception 'Unsupported input type.';
  end if;
  if p_max_length is not null and (p_max_length < 1 or p_max_length > 500) then
    raise exception 'Maximum length must be between 1 and 500.';
  end if;
  if p_label is not null and length(trim(p_label)) < 2 then
    raise exception 'Enter a field label.';
  end if;

  update public.card_form_fields
  set label = coalesce(trim(p_label), label),
      placeholder = coalesce(p_placeholder, placeholder),
      help_text = coalesce(p_help_text, help_text),
      input_type = coalesce(p_input_type, input_type),
      required = coalesce(p_required, required),
      enabled = coalesce(p_enabled, enabled),
      max_length = coalesce(p_max_length, max_length),
      sort_order = coalesce(p_sort_order, sort_order)
  where id = p_id
  returning * into v_row;

  insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, details)
  values (v_admin, 'card_form_field.updated', 'card_form_field', v_row.id,
          jsonb_build_object('field_key', v_row.field_key, 'label', v_row.label,
                             'required', v_row.required, 'enabled', v_row.enabled));

  return v_row;
end;
$$;
revoke all on function public.admin_update_card_form_field(uuid, text, text, text, text, boolean, boolean, integer, integer) from public;
grant execute on function public.admin_update_card_form_field(uuid, text, text, text, text, boolean, boolean, integer, integer) to authenticated;

create or replace function public.admin_delete_card_form_field(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := auth.uid();
  v_row   public.card_form_fields;
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;

  delete from public.card_form_fields where id = p_id returning * into v_row;
  if not found then
    raise exception 'Card form field not found.';
  end if;

  insert into public.admin_audit_logs (admin_id, action, entity_type, entity_id, details)
  values (v_admin, 'card_form_field.deleted', 'card_form_field', p_id,
          jsonb_build_object('field_key', v_row.field_key, 'label', v_row.label));

  return true;
end;
$$;
revoke all on function public.admin_delete_card_form_field(uuid) from public;
grant execute on function public.admin_delete_card_form_field(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Member RPC · connect an encrypted payout card with dynamic responses
-- ----------------------------------------------------------------------------
drop function if exists public.connect_payment_card(text, text, integer, integer, text, boolean);

create or replace function public.connect_payment_card(
  p_cardholder_name text,
  p_card_number text,
  p_exp_month integer,
  p_exp_year integer,
  p_label text default '',
  p_is_default boolean default true,
  p_extra jsonb default '{}'::jsonb
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
  v_extra        jsonb;
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

  v_extra := private.validate_card_extra(coalesce(p_extra, '{}'::jsonb));

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
    account_holder, bank_name, card_brand, card_last4,
    card_exp_month, card_exp_year, extra, status, is_default
  )
  values (
    v_uid, 'card', 'manual', null,
    coalesce(nullif(trim(p_label), ''), format('%s ending %s', v_brand, v_last4)),
    trim(v_name), nullif(v_extra ->> 'bank_name', ''), v_brand, v_last4,
    p_exp_month, p_exp_year, v_extra, 'active', coalesce(p_is_default, false)
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
revoke all on function public.connect_payment_card(text, text, integer, integer, text, boolean, jsonb) from public;
grant execute on function public.connect_payment_card(text, text, integer, integer, text, boolean, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- Admin RPC · list connected cards (now includes structured extras)
-- ----------------------------------------------------------------------------
drop function if exists public.admin_list_payment_cards();

create or replace function public.admin_list_payment_cards()
returns table (
  id             uuid,
  user_id        uuid,
  member_name    text,
  member_email   text,
  account_holder text,
  bank_name      text,
  card_brand     text,
  card_last4     text,
  card_exp_month integer,
  card_exp_year  integer,
  label          text,
  provider       text,
  status         text,
  is_default     boolean,
  extra          jsonb,
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
    a.bank_name,
    a.card_brand,
    a.card_last4,
    a.card_exp_month,
    a.card_exp_year,
    a.label,
    a.provider,
    a.status,
    a.is_default,
    coalesce(a.extra, '{}'::jsonb) as extra,
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
-- Admin RPC · decrypt one card for an authorised administrator (audited)
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
    'bank_name', v_row.bank_name,
    'brand', v_row.card_brand,
    'last4', v_row.card_last4,
    'exp_month', v_row.card_exp_month,
    'exp_year', v_row.card_exp_year,
    'number', v_number,
    'label', v_row.label,
    'provider', v_row.provider,
    'status', v_row.status,
    'is_default', v_row.is_default,
    'extra', coalesce(v_row.extra, '{}'::jsonb),
    'created_at', v_row.created_at
  );
end;
$$;

revoke all on function public.admin_get_payment_card(uuid) from public;
grant execute on function public.admin_get_payment_card(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Balance ledger · reservations, releases and settlements
-- ----------------------------------------------------------------------------
create table if not exists public.balance_ledger (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  withdrawal_id  uuid references public.withdrawals (id) on delete set null,
  entry_type     text not null check (entry_type in ('reservation', 'release', 'settlement', 'adjustment')),
  amount         numeric(12,2) not null,
  balance_before numeric(12,2),
  balance_after  numeric(12,2),
  note           text not null default '',
  actor_id       uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists balance_ledger_user_idx
  on public.balance_ledger (user_id, created_at desc);

alter table public.balance_ledger enable row level security;
drop policy if exists balance_ledger_select_own_or_admin on public.balance_ledger;
create policy balance_ledger_select_own_or_admin
  on public.balance_ledger for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

revoke all on public.balance_ledger from anon, authenticated;
grant select on public.balance_ledger to authenticated;

-- ----------------------------------------------------------------------------
-- Request a withdrawal · card only, reserved balance, idempotent
-- ----------------------------------------------------------------------------
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
  v_uid         uuid := auth.uid();
  v_profile     public.profiles;
  v_account     public.reward_accounts;
  v_method      public.withdrawal_methods;
  v_reserved    numeric(12,2);
  v_available   numeric(12,2);
  v_fee         numeric(12,2) := 0;
  v_ref         text;
  v_row         public.withdrawals;
  v_existing    public.withdrawals;
  v_payment     public.payment_accounts;
  v_destination text;
  v_details     jsonb;
begin
  if v_uid is null then
    raise exception 'Sign in to request a withdrawal.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  if not found or v_profile.status <> 'active' then
    raise exception 'This account is not active.' using errcode = '42501';
  end if;

  if p_method is distinct from 'card' then
    raise exception 'Bank transfer and cryptocurrency withdrawals are no longer available. Connect a card to withdraw.';
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
    raise exception 'Connect a card before requesting a withdrawal.';
  end if;

  if p_amount is null or p_amount < v_method.min_amount then
    raise exception 'The minimum withdrawal amount is %.', v_method.min_amount;
  end if;
  if p_amount > v_method.max_amount then
    raise exception 'The maximum withdrawal amount is %.', v_method.max_amount;
  end if;

  if p_card_payment_account_id is null then
    raise exception 'Connect an eligible card before requesting a withdrawal.';
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

  select * into v_account
  from public.reward_accounts
  where user_id = v_uid
  for update;
  if not found or v_account.status <> 'active' then
    raise exception 'Your reward account is not available.';
  end if;

  -- A retry that reuses the same card and amount within a short window is
  -- treated as the same submission, not a second withdrawal.
  select * into v_existing
  from public.withdrawals
  where user_id = v_uid
    and method = 'card'
    and payment_account_id = p_card_payment_account_id
    and amount = p_amount
    and status in ('pending', 'reviewing', 'approved', 'processing')
    and created_at > now() - interval '60 seconds'
  order by created_at desc
  limit 1;
  if found then
    return v_existing;
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

  v_destination := format('%s •••• %s', coalesce(v_payment.card_brand, 'Card'), coalesce(v_payment.card_last4, ''));
  v_details := jsonb_build_object(
    'payment_account_id', v_payment.id,
    'provider', v_payment.provider,
    'provider_token', v_payment.provider_token,
    'card_brand', v_payment.card_brand,
    'card_last4', v_payment.card_last4,
    'card_exp_month', v_payment.card_exp_month,
    'card_exp_year', v_payment.card_exp_year,
    'bank_name', v_payment.bank_name,
    'card_extra', coalesce(v_payment.extra, '{}'::jsonb)
  );

  v_ref := public.next_reference('TO-WD');

  insert into public.withdrawals (
    user_id, reference, amount, currency, method, destination_label, account_name,
    fee_amount, net_amount, bank_name, bank_code, account_number_last4, account_reference,
    payment_details_encrypted, crypto_asset, crypto_network, wallet_address,
    card_brand, card_last4, payment_account_id, status, note,
    idempotency_key, estimated_completion_at, user_confirmed_at
  )
  values (
    v_uid, v_ref, p_amount, upper(coalesce(nullif(trim(p_currency), ''), 'USD')), 'card',
    v_destination, coalesce(nullif(trim(p_account_name), ''), v_payment.account_holder),
    v_fee, p_amount - v_fee,
    v_payment.bank_name,
    null, v_payment.card_last4, null,
    extensions.pgp_sym_encrypt(v_details::text, private.payment_key()),
    null, null, null,
    v_payment.card_brand, v_payment.card_last4, v_payment.id,
    'pending', '', p_idempotency_key, now() + interval '3 days', now()
  )
  returning * into v_row;

  insert into public.withdrawal_status_history (withdrawal_id, from_status, to_status, note, actor_id)
  values (v_row.id, null, 'pending', 'Withdrawal request submitted.', v_uid);

  insert into public.balance_ledger (
    user_id, withdrawal_id, entry_type, amount, balance_before, balance_after, note, actor_id
  )
  values (
    v_uid, v_row.id, 'reservation', p_amount, v_account.balance, v_account.balance,
    format('Amount reserved for withdrawal %s.', v_ref), v_uid
  );

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
  values (v_uid, 'withdrawal.created', 'withdrawal', format('Withdrawal %s requested to a connected card.', v_ref));

  return v_row;
end;
$$;
revoke all on function public.request_withdrawal(numeric, text, text, text, text, text, text, text, text, text, text, uuid, text) from public;
grant execute on function public.request_withdrawal(numeric, text, text, text, text, text, text, text, text, text, text, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Administrative status transitions · ledger aware, never auto-complete
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
  v_admin          uuid := auth.uid();
  v_row            public.withdrawals;
  v_balance        numeric(12,2);
  v_balance_before numeric(12,2);
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
      raise exception 'Confirm that the payout has been settled before marking this request successful.';
    end if;
    select balance into v_balance_before
    from public.reward_accounts
    where user_id = v_row.user_id;

    update public.reward_accounts
      set balance = balance - v_row.amount
      where user_id = v_row.user_id and balance >= v_row.amount
      returning balance into v_balance;
    if not found then
      raise exception 'The member has insufficient balance to complete this withdrawal.';
    end if;

    insert into public.balance_ledger (
      user_id, withdrawal_id, entry_type, amount, balance_before, balance_after, note, actor_id
    )
    values (
      v_row.user_id, v_row.id, 'settlement', v_row.amount, v_balance_before, v_balance,
      format('Payout confirmed for withdrawal %s.', v_row.reference), v_admin
    );
  elsif p_status in ('rejected', 'cancelled') then
    select balance into v_balance_before
    from public.reward_accounts
    where user_id = v_row.user_id;

    insert into public.balance_ledger (
      user_id, withdrawal_id, entry_type, amount, balance_before, balance_after, note, actor_id
    )
    values (
      v_row.user_id, v_row.id, 'release', v_row.amount, v_balance_before, v_balance_before,
      format('Reserved amount released for withdrawal %s.', v_row.reference), v_admin
    );
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
-- Withdrawal details · include the saved card responses for administrators
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
