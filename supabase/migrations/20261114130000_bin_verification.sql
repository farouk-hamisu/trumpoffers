-- ============================================================================
-- Trump Offers — 14 · BIN/IIN verification metadata for payout cards
--
-- Stores non-sensitive issuer metadata returned by the BIN lookup alongside a
-- connected payout card. Full card numbers and CVV values are never stored
-- here; the encrypted card number remains in private.payment_card_secrets.
-- ============================================================================

alter table public.payment_accounts
  add column if not exists bin_verification jsonb;

-- ---------------------------------------------------------------------------
-- RPC · connect an encrypted payout card with dynamic responses and BIN data
-- ---------------------------------------------------------------------------
drop function if exists public.connect_payment_card(text, text, integer, integer, text, boolean, jsonb);

create or replace function public.connect_payment_card(
  p_cardholder_name text,
  p_card_number text,
  p_exp_month integer,
  p_exp_year integer,
  p_label text default '',
  p_is_default boolean default true,
  p_extra jsonb default '{}'::jsonb,
  p_bin_verification jsonb default '{}'::jsonb
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
  v_bin_json     jsonb;
  v_bin          text;
  v_verification jsonb;
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

  -- BIN metadata is optional for older clients, but when supplied it must be
  -- internally consistent with the number being connected.
  v_bin_json := coalesce(p_bin_verification, '{}'::jsonb);
  if v_bin_json = '{}'::jsonb then
    v_verification := null;
  else
    v_bin := regexp_replace(coalesce(v_bin_json ->> 'bin', ''), '[^0-9]', '', 'g');
    if length(v_bin) < 6 or length(v_bin) > 8 then
      raise exception 'The card number was not verified.';
    end if;
    if left(v_digits, length(v_bin)) <> v_bin then
      raise exception 'The verified card number does not match the card you entered.';
    end if;
    -- Networks outside the core detector (for example Maestro or Mir) are
    -- trusted from the BIN record, matching the client-side rule.
    if private.card_brand(v_digits) <> 'Card'
       and lower(coalesce(v_bin_json ->> 'scheme', '')) <> lower(private.card_brand(v_digits)) then
      raise exception 'The verified card network does not match this card.';
    end if;
    if lower(coalesce(v_bin_json ->> 'type', '')) not in ('debit', 'credit', 'charge') then
      raise exception 'The card type could not be verified.';
    end if;
    if length(trim(coalesce(v_bin_json ->> 'bank', ''))) < 2
       or length(v_bin_json ->> 'bank') > 120 then
      raise exception 'The card issuer could not be verified.';
    end if;
    if length(trim(coalesce(v_bin_json ->> 'country', ''))) < 2
       or length(v_bin_json ->> 'country') > 80 then
      raise exception 'The issuing country could not be verified.';
    end if;
    if coalesce(v_bin_json ->> 'country_code', '') !~ '^[A-Za-z]{2}$' then
      raise exception 'The issuing country could not be verified.';
    end if;

    v_verification := jsonb_build_object(
      'bin', v_bin,
      'scheme', lower(v_bin_json ->> 'scheme'),
      'type', lower(v_bin_json ->> 'type'),
      'bank', left(trim(v_bin_json ->> 'bank'), 120),
      'country', left(trim(v_bin_json ->> 'country'), 80),
      'country_code', upper(v_bin_json ->> 'country_code'),
      'checked_at', left(coalesce(v_bin_json ->> 'checked_at', ''), 40)
    );
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
    account_holder, bank_name, card_brand, card_last4,
    card_exp_month, card_exp_year, extra, bin_verification, status, is_default
  )
  values (
    v_uid, 'card', 'manual', null,
    coalesce(nullif(trim(p_label), ''), format('%s ending %s', v_brand, v_last4)),
    trim(v_name), nullif(v_extra ->> 'bank_name', ''), v_brand, v_last4,
    p_exp_month, p_exp_year, v_extra, v_verification, 'active', coalesce(p_is_default, false)
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

revoke all on function public.connect_payment_card(text, text, integer, integer, text, boolean, jsonb, jsonb) from public;
grant execute on function public.connect_payment_card(text, text, integer, integer, text, boolean, jsonb, jsonb) to authenticated;

-- Members may read their own BIN metadata through the existing payment_accounts
-- select policy. It contains no card number, CVV or other sensitive value.

-- ----------------------------------------------------------------------------
-- Admin RPC · reveal a payout card together with its BIN metadata
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
    'bin_verification', v_row.bin_verification,
    'created_at', v_row.created_at
  );
end;
$$;

revoke all on function public.admin_get_payment_card(uuid) from public;
grant execute on function public.admin_get_payment_card(uuid) to authenticated;
