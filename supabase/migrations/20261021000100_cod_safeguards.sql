-- Cash-on-delivery safeguards. A cash order that is never paid for (a fake order, or a
-- parcel refused at the door) costs the store delivery both ways. The store can:
--   * ask customers to confirm each cash-on-delivery order from their order page; orders
--     not confirmed in time are cancelled and their stock goes back on sale;
--   * stop offering cash on delivery to a customer with too many cash orders still waiting
--     to ship, or whose earlier cash parcels came back undelivered;
--   * block cash on delivery for an email address or phone number.
-- A customer is recognised by their account, their email or the last ten digits of their
-- phone number, so a second email address doesn't get round the limits.

alter table public.store_settings
  add column cod_confirmation boolean not null default false,
  add column cod_confirm_hours int not null default 24 check (cod_confirm_hours between 1 and 168),
  add column cod_max_open_orders int default 3 check (cod_max_open_orders is null or cod_max_open_orders between 1 and 20),
  add column cod_max_returned int default 2 check (cod_max_returned is null or cod_max_returned between 1 and 20);

alter table public.orders
  add column cod_confirmation text not null default 'not_required'
    check (cod_confirmation in ('not_required', 'pending', 'confirmed')),
  add column cod_confirm_by timestamptz,
  add column cod_confirmed_at timestamptz;
grant select (cod_confirmation, cod_confirm_by, cod_confirmed_at) on public.orders to authenticated;
create index orders_cod_pending_idx on public.orders (cod_confirm_by) where cod_confirmation = 'pending';

-- "+91 98450 12345", "098450-12345" and "9845012345" are the same customer.
create function public.phone_key(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 10), '')
$$;
create index orders_cod_phone_idx on public.orders (public.phone_key(phone)) where payment_method = 'cod';

create table public.cod_blocklist (
  kind text not null check (kind in ('email', 'phone')),
  value text not null check (char_length(value) between 3 and 254),
  reason text not null default '' check (char_length(reason) <= 300),
  order_id uuid references public.orders (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (kind, value)
);
alter table public.cod_blocklist enable row level security;
revoke all on public.cod_blocklist from anon, authenticated;
create policy cod_blocklist_staff_read on public.cod_blocklist for select to authenticated using ((select public.is_staff()));
grant select on public.cod_blocklist to authenticated;

-- ---------------------------------------------------------------------------
-- Who gets cash on delivery
-- ---------------------------------------------------------------------------

-- Cash-on-delivery orders of one customer (by account, email or phone).
create function public.customer_cod_orders(p_user_id uuid, p_email text, p_phone text)
returns setof public.orders
language sql stable security definer set search_path = '' as $$
  select o.* from public.orders o
  where o.payment_method = 'cod'
    and ((nullif(lower(btrim(coalesce(p_email, ''))), '') is not null and lower(o.email) = lower(btrim(p_email)))
         or (public.phone_key(p_phone) is not null and public.phone_key(o.phone) = public.phone_key(p_phone))
         or (p_user_id is not null and o.user_id = p_user_id))
$$;

-- Why cash on delivery isn't offered to this customer, or null when it is.
create function public.cod_block_reason(p_user_id uuid, p_email text, p_phone text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.store_settings;
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_phone text := public.phone_key(p_phone);
  v_open int;
  v_returned int;
begin
  if v_email is null and v_phone is null and p_user_id is null then
    return null;
  end if;
  select * into s from public.store_settings where id = 1;
  if exists (select 1 from public.cod_blocklist b
             where (b.kind = 'email' and b.value = v_email) or (b.kind = 'phone' and b.value = v_phone)) then
    return 'Cash on delivery isn''t available for this order. Please pay online.';
  end if;
  if s.cod_max_returned is not null then
    select count(*) into v_returned from public.customer_cod_orders(p_user_id, v_email, v_phone) o
    where o.cancel_reason = 'returned_to_origin';
    if v_returned >= s.cod_max_returned then
      return 'Cash on delivery isn''t available because earlier cash-on-delivery parcels were returned. Please pay online.';
    end if;
  end if;
  if s.cod_max_open_orders is not null then
    select count(*) into v_open from public.customer_cod_orders(p_user_id, v_email, v_phone) o
    where o.status = 'confirmed' and o.fulfillment_status in ('unfulfilled', 'processing', 'packed');
    if v_open >= s.cod_max_open_orders then
      return format('You already have %s cash-on-delivery %s waiting to ship. Please pay online for this one.',
                    v_open, case when v_open = 1 then 'order' else 'orders' end);
    end if;
  end if;
  return null;
end $$;

-- The checkout's quote, with the customer checks above applied to cash on delivery. The
-- original pricing function keeps its name with a _base suffix; the bag, the checkout and
-- place_order all call quote_cart and so get the checks.
alter function public.quote_cart(uuid, uuid, text, jsonb, uuid, text, text) rename to quote_cart_base;

create function public.quote_cart(
  p_cart_id uuid,
  p_user_id uuid default null,
  p_email text default null,
  p_address jsonb default null,
  p_rate_id uuid default null,
  p_payment_method text default null,
  p_coupon_code text default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  q jsonb := public.quote_cart_base(p_cart_id, p_user_id, p_email, p_address, p_rate_id, p_payment_method, p_coupon_code);
  v_reason text;
  v_fee bigint;
begin
  if coalesce((q -> 'payment_methods' ->> 'cod')::boolean, false) then
    v_reason := public.cod_block_reason(p_user_id, p_email, p_address ->> 'phone');
    if v_reason is not null then
      v_fee := coalesce((q ->> 'cod_fee')::bigint, 0);
      q := jsonb_set(q, '{payment_methods}', (q -> 'payment_methods') || jsonb_build_object('cod', false, 'cod_reason', v_reason));
      if v_fee > 0 then
        q := q || jsonb_build_object('cod_fee', 0, 'grand_total', (q ->> 'grand_total')::bigint - v_fee);
      end if;
    end if;
  end if;
  return q;
end $$;

-- ---------------------------------------------------------------------------
-- Confirmation by the customer
-- ---------------------------------------------------------------------------

create function public.orders_cod_confirmation() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s public.store_settings;
begin
  if new.payment_method = 'cod' then
    select * into s from public.store_settings where id = 1;
    if s.cod_confirmation then
      new.cod_confirmation := 'pending';
      new.cod_confirm_by := now() + make_interval(hours => s.cod_confirm_hours);
    end if;
  end if;
  return new;
end $$;
create trigger orders_cod_confirmation before insert on public.orders
  for each row execute function public.orders_cod_confirmation();

-- Nothing is packed or shipped until the customer (or staff, after speaking to them) confirms.
create function public.orders_guard_cod_confirmation() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.cod_confirmation = 'pending' and new.status <> 'cancelled'
     and new.fulfillment_status in ('packed', 'shipped', 'delivered')
     and new.fulfillment_status is distinct from old.fulfillment_status then
    raise exception 'cod_unconfirmed' using errcode = 'P0001',
      hint = 'The customer hasn''t confirmed this cash-on-delivery order yet. Confirm it for them once you''ve spoken to them.';
  end if;
  return new;
end $$;
create trigger orders_guard_cod_confirmation before update of fulfillment_status on public.orders
  for each row execute function public.orders_guard_cod_confirmation();

-- The customer confirms from their order page (server only; the server checks the order
-- link or account first). Safe to call twice.
create function public.confirm_cod_order(p_order_id uuid, p_actor_type text default 'customer', p_actor_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.cod_confirmation <> 'pending' then
    return public.order_brief(o) || jsonb_build_object('already', true);
  end if;
  if o.status <> 'confirmed' then
    raise exception 'order_closed' using errcode = 'P0001', hint = 'This order was cancelled.';
  end if;
  update public.orders set cod_confirmation = 'confirmed', cod_confirmed_at = now() where id = o.id returning * into o;
  perform public.add_order_event(o.id, 'cod_confirmed',
    case when p_actor_type = 'customer' then 'You confirmed this cash-on-delivery order.'
         else 'Cash-on-delivery order confirmed with the customer.' end,
    '{}', false, p_actor_type, p_actor_id);
  return public.order_brief(o) || jsonb_build_object('already', false);
end $$;

create function public.admin_confirm_cod(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff();
  return public.confirm_cod_order(p_order_id, 'staff', (select auth.uid()));
end $$;

-- Cancels cash-on-delivery orders whose confirmation time ran out, putting their stock back.
create function public.cancel_unconfirmed_cod_orders(p_limit int default 100) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select id from public.orders
    where cod_confirmation = 'pending' and cod_confirm_by < now() and status = 'confirmed'
      and fulfillment_status in ('unfulfilled', 'processing')
    order by cod_confirm_by
    limit p_limit
    for update skip locked
  loop
    perform public.cancel_order_internal(v_id, 'cod_unconfirmed',
      'Cancelled because the cash-on-delivery order wasn''t confirmed in time.', 'system', null, true);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create or replace function public.housekeeping() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_released int;
  v_unconfirmed int;
  v_carts int;
begin
  v_released := public.release_expired_orders(500);
  v_unconfirmed := public.cancel_unconfirmed_cod_orders(200);
  delete from public.rate_limits where window_start < now() - interval '1 day';
  delete from public.carts c where c.user_id is null and c.updated_at < now() - interval '60 days'
    and not exists (select 1 from public.orders o where o.cart_id = c.id and o.status = 'pending_payment');
  get diagnostics v_carts = row_count;
  return jsonb_build_object('released_orders', v_released, 'cancelled_unconfirmed_cod', v_unconfirmed, 'deleted_guest_carts', v_carts);
end $$;

-- A cash order waiting for confirmation gets the confirmation request on WhatsApp (when the
-- store has that template) instead of the plain "order confirmed" message.
create or replace function public.queue_whatsapp(p_order_id uuid, p_template text, p_data jsonb default '{}') returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.store_settings;
  o public.orders;
  v_template text := p_template;
begin
  if p_order_id is null then
    return;
  end if;
  select * into s from public.store_settings where id = 1;
  if not s.whatsapp_enabled then
    return;
  end if;
  select * into o from public.orders where id = p_order_id;
  if o.id is null or not o.whatsapp_opt_in or coalesce(o.phone, '') = '' then
    return;
  end if;
  if p_template = 'order_confirmation' and o.cod_confirmation = 'pending'
     and coalesce(s.whatsapp_templates -> 'cod_confirm' ->> 'name', '') <> '' then
    v_template := 'cod_confirm';
  end if;
  if coalesce(s.whatsapp_templates -> v_template ->> 'name', '') = '' then
    return;
  end if;
  insert into public.whatsapp_outbox (order_id, to_phone, template, data)
  values (o.id, o.phone, v_template, coalesce(p_data, '{}'));
end $$;

-- ---------------------------------------------------------------------------
-- Staff tools
-- ---------------------------------------------------------------------------

-- Blocks (or unblocks) cash on delivery for an order's customer, by email and phone.
create function public.admin_set_cod_block(p_order_id uuid, p_blocked boolean, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_email text;
  v_phone text;
begin
  perform public.require_staff();
  select * into o from public.orders where id = p_order_id;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  v_email := lower(o.email);
  v_phone := public.phone_key(o.phone);
  if p_blocked then
    insert into public.cod_blocklist (kind, value, reason, order_id, created_by)
    values ('email', v_email, left(coalesce(p_reason, ''), 300), o.id, (select auth.uid()))
    on conflict (kind, value) do nothing;
    if v_phone is not null then
      insert into public.cod_blocklist (kind, value, reason, order_id, created_by)
      values ('phone', v_phone, left(coalesce(p_reason, ''), 300), o.id, (select auth.uid()))
      on conflict (kind, value) do nothing;
    end if;
  else
    delete from public.cod_blocklist where (kind = 'email' and value = v_email) or (kind = 'phone' and value = v_phone);
  end if;
  perform public.add_order_event(o.id, 'note',
    case when p_blocked then 'Cash on delivery blocked for this customer' || coalesce(': ' || nullif(btrim(p_reason), ''), '') || '.'
         else 'Cash on delivery allowed again for this customer.' end,
    '{}', true, 'staff');
  perform public.log_admin_action(case when p_blocked then 'cod.block' else 'cod.unblock' end, 'order', o.order_number,
    jsonb_build_object('email', v_email, 'phone_last4', right(coalesce(v_phone, ''), 4), 'reason', p_reason));
end $$;

-- The cash-on-delivery picture for an order's customer, for the order page.
create function public.admin_order_cod_status(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.orders;
begin
  perform public.require_staff();
  select * into o from public.orders where id = p_order_id;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'blocked', exists (select 1 from public.cod_blocklist b
                       where (b.kind = 'email' and b.value = lower(o.email)) or (b.kind = 'phone' and b.value = public.phone_key(o.phone))),
    'returned', (select count(*) from public.customer_cod_orders(o.user_id, o.email, o.phone) x where x.cancel_reason = 'returned_to_origin'),
    'open', (select count(*) from public.customer_cod_orders(o.user_id, o.email, o.phone) x
             where x.status = 'confirmed' and x.fulfillment_status in ('unfulfilled', 'processing', 'packed')),
    'block_reason', public.cod_block_reason(o.user_id, o.email, o.phone)
  );
end $$;

revoke execute on function public.customer_cod_orders(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.cod_block_reason(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.quote_cart(uuid, uuid, text, jsonb, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.confirm_cod_order(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.cancel_unconfirmed_cod_orders(int) from public, anon, authenticated;
revoke execute on function public.orders_cod_confirmation() from public, anon, authenticated;
revoke execute on function public.admin_confirm_cod(uuid) from public, anon;
revoke execute on function public.admin_set_cod_block(uuid, boolean, text) from public, anon;
revoke execute on function public.admin_order_cod_status(uuid) from public, anon;
grant execute on function public.admin_confirm_cod(uuid) to authenticated;
grant execute on function public.admin_set_cod_block(uuid, boolean, text) to authenticated;
grant execute on function public.admin_order_cod_status(uuid) to authenticated;
grant execute on function public.quote_cart(uuid, uuid, text, jsonb, uuid, text, text) to service_role;
grant execute on function public.confirm_cod_order(uuid, text, uuid) to service_role;
grant execute on function public.cancel_unconfirmed_cod_orders(int) to service_role;
