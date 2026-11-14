-- ============================================================================
-- Trump Offers — 16 · Reject expired payout cards at withdrawal time
--
-- connect_payment_card() already rejects an expired expiry date. A card that
-- was valid when it was connected can expire later, so request_withdrawal()
-- now re-checks the stored expiry before reserving funds.
-- ============================================================================

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

  -- Reject a card that has expired since it was connected. Cards are valid
  -- through the last day of their expiry month.
  if v_payment.card_exp_year is not null and v_payment.card_exp_month is not null
     and (
       v_payment.card_exp_year < extract(year from now())::integer
       or (
         v_payment.card_exp_year = extract(year from now())::integer
         and v_payment.card_exp_month < extract(month from now())::integer
       )
     ) then
    raise exception 'That payout card has expired. Connect a new card to continue.';
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
