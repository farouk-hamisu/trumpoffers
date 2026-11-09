-- ============================================================================
-- Trump Offers — 01 · Extensions, helpers and reference sequences
-- ============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ----------------------------------------------------------------------------
-- updated_at helper
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Maintains updated_at on mutable Trump Offers records.';

-- ----------------------------------------------------------------------------
-- Human-readable reference sequences (TO-RW-26-000001, TO-CD-26-000233, …)
-- Only security-definer RPCs may consume these values.
-- ----------------------------------------------------------------------------
create table if not exists public.reference_sequences (
  prefix      text        not null,
  period      text        not null,
  last_value  bigint      not null default 0 check (last_value >= 0),
  updated_at  timestamptz not null default now(),
  primary key (prefix, period)
);

alter table public.reference_sequences enable row level security;
revoke all on table public.reference_sequences from anon, authenticated;

create or replace function public.next_reference(p_prefix text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_period text := to_char(now(), 'YY');
  v_value  bigint;
begin
  insert into public.reference_sequences (prefix, period, last_value, updated_at)
  values (p_prefix, v_period, 1, now())
  on conflict (prefix, period) do update
    set last_value = public.reference_sequences.last_value + 1,
        updated_at = now()
  returning last_value into v_value;

  return format('%s-%s-%s', p_prefix, v_period, lpad(v_value::text, 6, '0'));
end;
$$;

revoke all on function public.next_reference(text) from public;
comment on function public.next_reference(text) is
  'Atomically issues a Trump Offers reference such as TO-RW-26-000001.';
