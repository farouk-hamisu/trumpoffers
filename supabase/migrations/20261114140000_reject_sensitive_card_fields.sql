-- ============================================================================
-- Trump Offers — 15 · Reject sensitive card fields and scrub stored values
--
-- CVV, CVC, PIN and password values must never be collected or stored. This
-- migration removes any administrator-created field with a sensitive key or
-- label, blocks new ones, scrubs existing payment-account responses and
-- rewrites encrypted withdrawal snapshots without the sensitive values.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper · does a field key or label describe a sensitive card value?
-- ----------------------------------------------------------------------------
create or replace function private.is_sensitive_card_key(p_value text)
returns boolean
language sql
immutable
set search_path = pg_temp
as $$
  select regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '_', 'g')
         ~ '(^|_)(cvv|cvc|cvv2|cvc2|card_verification|card_verification_value|security_code|card_security_code|pin|password|ssn|social_security_number)(_|$)';
$$;

-- ----------------------------------------------------------------------------
-- Remove any existing sensitive fields before installing the guard
-- ----------------------------------------------------------------------------
delete from public.card_form_fields
where private.is_sensitive_card_key(field_key)
   or private.is_sensitive_card_key(label)
   or private.is_sensitive_card_key(placeholder)
   or private.is_sensitive_card_key(help_text);

-- ----------------------------------------------------------------------------
-- Guard · block sensitive fields on insert or update
-- ----------------------------------------------------------------------------
create or replace function private.reject_sensitive_card_field()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if private.is_sensitive_card_key(new.field_key)
     or private.is_sensitive_card_key(new.label)
     or private.is_sensitive_card_key(new.placeholder)
     or private.is_sensitive_card_key(new.help_text) then
    raise exception 'CVV, CVC, PIN, password and security-code fields are not allowed.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists card_form_fields_reject_sensitive on public.card_form_fields;
create trigger card_form_fields_reject_sensitive
  before insert or update on public.card_form_fields
  for each row execute function private.reject_sensitive_card_field();

-- ----------------------------------------------------------------------------
-- Server-side validation · refuse sensitive keys even if a caller sends them
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
  if exists (
    select 1
    from jsonb_object_keys(coalesce(p_extra, '{}'::jsonb)) as k
    where private.is_sensitive_card_key(k)
  ) then
    raise exception 'CVV, CVC, PIN, password and security-code values are never accepted.'
      using errcode = '22023';
  end if;

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
-- Scrub connected-card responses
-- ----------------------------------------------------------------------------
update public.payment_accounts a
set extra = coalesce(
  (
    select jsonb_object_agg(e.key, e.value)
    from jsonb_each(a.extra) e
    where not private.is_sensitive_card_key(e.key)
  ),
  '{}'::jsonb
)
where jsonb_typeof(a.extra) = 'object'
  and exists (
    select 1
    from jsonb_each(a.extra) e
    where private.is_sensitive_card_key(e.key)
  );

-- ----------------------------------------------------------------------------
-- Scrub encrypted withdrawal snapshots (decrypt, remove, re-encrypt)
-- ----------------------------------------------------------------------------
do $$
declare
  v_row   record;
  v_details jsonb;
  v_extra jsonb;
  v_clean jsonb;
begin
  for v_row in
    select id, payment_details_encrypted
    from public.withdrawals
    where payment_details_encrypted is not null
  loop
    begin
      v_details := extensions.pgp_sym_decrypt(
        v_row.payment_details_encrypted,
        private.payment_key()
      )::jsonb;
    exception when others then
      -- Leave payloads that cannot be decrypted untouched rather than
      -- destroying an administrator's only copy.
      continue;
    end;

    if jsonb_typeof(v_details -> 'card_extra') = 'object' then
      v_extra := v_details -> 'card_extra';
      if exists (
        select 1 from jsonb_each(v_extra) e
        where private.is_sensitive_card_key(e.key)
      ) then
        select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
        into v_clean
        from jsonb_each(v_extra) e
        where not private.is_sensitive_card_key(e.key);

        update public.withdrawals
        set payment_details_encrypted = extensions.pgp_sym_encrypt(
          jsonb_set(v_details, '{card_extra}', v_clean)::text,
          private.payment_key()
        )
        where id = v_row.id;
      end if;
    end if;
  end loop;
end;
$$;
