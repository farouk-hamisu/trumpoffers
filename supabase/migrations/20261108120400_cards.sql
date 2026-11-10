-- ============================================================================
-- Trump Offers — 05 · Card studio
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
-- Generated card number with a valid Luhn check digit.
-- The number is display-only and is not a payment instrument.
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
-- RPC · create a card application
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
    raise exception 'Sign in to create a card.' using errcode = '42501';
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
    'Card issued for presentation only. It is not a payment instrument.'
  )
  returning * into v_row;

  insert into public.notifications (user_id, title, body, type)
  values (
    v_uid,
    'Card request received',
    format('Your card request %s is awaiting administrator review.', v_ref),
    'card'
  );

  insert into public.activity_logs (user_id, action, entity_type, description)
  values (v_uid, 'card.created', 'card_application',
    format('Card application %s submitted.', v_ref));

  return v_row;
end;
$$;

revoke all on function public.create_card_application(text, text) from public;
grant execute on function public.create_card_application(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- RPC · verify a card by reference + last four (public-safe payload)
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
    case when new.status = 'approved' then 'Card approved' else 'Card application update' end,
    case
      when new.status = 'approved' then format('Your card %s has been approved. The card is not a payment instrument and cannot be used for transactions.', new.reference)
      else format('Your card application %s is now marked “%s”.', new.reference, replace(new.status, '_', ' '))
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
