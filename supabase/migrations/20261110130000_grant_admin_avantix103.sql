-- ============================================================================
-- Trump Offers — 12 · Promote a member to administrator
--
-- One-off data migration: grants the `admin` role to avantix103@gmail.com,
-- which already has an account on the production project. It is idempotent, so
-- re-running it changes nothing and does not duplicate the activity entry.
--
-- This is environment data, not schema. It is intentionally NOT part of
-- supabase/combined.sql, so a fresh deployment does not create an administrator
-- for a person who may not exist there.
--
-- Privacy: the role row and the activity entry are the only writes. No profile
-- fields, balances, withdrawal history or credentials are touched.
-- ============================================================================

do $$
declare
  v_email    text := 'avantix103@gmail.com';
  v_user_id  uuid;
  v_inserted integer;
begin
  select id
    into v_user_id
    from public.profiles
   where lower(email) = lower(v_email);

  if v_user_id is null then
    -- Expected on a fresh environment: this is production account data, not
    -- schema. Warn loudly instead of blocking `supabase db push` on databases
    -- where the member has not signed up.
    raise warning
      'No profile exists for %; skipping administrator grant.',
      v_email;
    return;
  end if;

  insert into public.user_roles (user_id, role)
  values (v_user_id, 'admin')
  on conflict (user_id, role) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    insert into public.activity_logs (user_id, action, entity_type, description)
    values (v_user_id, 'role.granted', 'user_role', 'Administrator role granted.');
  end if;

  raise notice 'Administrator role ensured for % (%).', v_email, v_user_id;
end;
$$;
