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
