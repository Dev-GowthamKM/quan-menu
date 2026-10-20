-- Courier connection (Shiprocket): parcels booked from the admin, tracking updates pushed
-- by the courier's webhook, and parcels that come back undelivered (return to origin, RTO).
--
-- The Next.js server talks to Shiprocket with credentials from environment variables. The
-- database records bookings and applies tracking updates with the same rules as the
-- manual fulfilment buttons, so a status can never move backwards or skip a payment check.

-- ---------------------------------------------------------------------------
-- Settings and shipment fields
-- ---------------------------------------------------------------------------
alter table public.store_settings
  add column shiprocket_enabled boolean not null default false,
  -- The pickup address nickname set up in Shiprocket (Settings > Pickup addresses).
  add column shiprocket_pickup_location text not null default 'Primary'
    check (char_length(btrim(shiprocket_pickup_location)) between 1 and 80),
  -- PIN code of that pickup address, used to look up courier delivery estimates.
  add column shiprocket_pickup_postcode text not null default ''
    check (shiprocket_pickup_postcode = '' or shiprocket_pickup_postcode ~ '^[1-9][0-9]{5}$'),
  add column shiprocket_courier_choice text not null default 'recommended'
    check (shiprocket_courier_choice in ('recommended', 'cheapest', 'fastest')),
  -- Default parcel size, and the weight used for items without a weight of their own.
  add column package_defaults jsonb not null
    default '{"length_cm": 30, "breadth_cm": 25, "height_cm": 5, "item_weight_grams": 400}'
    check (jsonb_typeof(package_defaults) = 'object');

alter table public.shipments
  add column provider text not null default 'manual' check (provider in ('manual', 'shiprocket')),
  add column provider_order_id text check (char_length(provider_order_id) <= 40),
  add column provider_shipment_id text check (char_length(provider_shipment_id) <= 40),
  add column pickup_scheduled_for timestamptz,
  add column estimated_delivery date,
  add column package jsonb not null default '{}' check (jsonb_typeof(package) = 'object'),
  add column courier_status text not null default '' check (char_length(courier_status) <= 120),
  add column courier_status_at timestamptz,
  -- The latest tracking scans, newest first (at most 25).
  add column courier_events jsonb not null default '[]' check (jsonb_typeof(courier_events) = 'array');
alter table public.shipments drop constraint shipments_status_check;
alter table public.shipments add constraint shipments_status_check
  check (status in ('packed', 'shipped', 'delivered', 'returned', 'cancelled'));
create unique index shipments_provider_shipment_key on public.shipments (provider, provider_shipment_id)
  where provider_shipment_id is not null;
create index shipments_tracking_idx on public.shipments (provider, tracking_number) where tracking_number <> '';

-- Every tracking update received, keyed so a repeated delivery is applied once.
create table public.courier_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_key text not null check (char_length(event_key) <= 200),
  status text not null default '',
  shipment_id uuid references public.shipments (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  payload jsonb not null default '{}',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, event_key)
);
create index courier_events_received_idx on public.courier_events (received_at desc);
alter table public.courier_events enable row level security;
revoke all on public.courier_events from anon, authenticated;
create policy courier_events_staff_read on public.courier_events for select to authenticated using ((select public.is_staff()));
grant select on public.courier_events to authenticated;

-- ---------------------------------------------------------------------------
-- Fulfilment, shared by staff buttons and courier updates
-- ---------------------------------------------------------------------------

-- The rules of admin_set_fulfillment, without the role check, so courier updates can use
-- them too. Internal: callers check permissions.
create function public.set_fulfillment_internal(
  p_order_id uuid,
  p_status public.fulfillment_status,
  p_carrier text,
  p_tracking_number text,
  p_tracking_url text,
  p_note text,
  p_notify boolean,
  p_actor_type text,
  p_actor_id uuid
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_ship public.shipments;
  v_template text;
  v_url text := nullif(btrim(coalesce(p_tracking_url, '')), '');
  v_carrier text := nullif(btrim(coalesce(p_carrier, '')), '');
  v_number text := nullif(btrim(coalesce(p_tracking_number, '')), '');
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.status not in ('confirmed', 'completed') then
    raise exception 'order_not_fulfillable' using errcode = 'P0001',
      hint = case when o.status = 'pending_payment' then 'This order is still waiting for payment.' else 'This order was cancelled.' end;
  end if;
  if p_status = 'returned' then
    if o.fulfillment_status not in ('shipped', 'delivered') then
      raise exception 'invalid_transition' using errcode = 'P0001', hint = 'Only shipped or delivered orders can be marked returned.';
    end if;
  elsif public.fulfillment_rank(p_status) < public.fulfillment_rank(o.fulfillment_status) then
    raise exception 'invalid_transition' using errcode = 'P0001',
      hint = format('This order is already %s.', replace(o.fulfillment_status::text, '_', ' '));
  end if;
  if v_url is not null and v_url !~ '^https?://' then
    raise exception 'invalid_tracking_url' using errcode = '22023', hint = 'The tracking link must start with https://';
  end if;

  if p_status in ('shipped', 'delivered') or v_number is not null or v_carrier is not null then
    select * into v_ship from public.shipments
    where order_id = o.id and status <> 'cancelled' order by created_at desc limit 1;
    if p_status = 'shipped' and v_carrier is null and nullif(v_ship.carrier, '') is null then
      raise exception 'carrier_required' using errcode = '22023', hint = 'Enter the courier name when marking an order shipped.';
    end if;
    if v_url is null and v_number is not null then
      select replace(tracking_url_template, '{tracking}', v_number) into v_url
      from public.shipping_providers where lower(name) = lower(coalesce(v_carrier, v_ship.carrier, '')) and tracking_url_template <> '';
    end if;
    if v_ship.id is null then
      insert into public.shipments (order_id, carrier, tracking_number, tracking_url, status, shipped_at, delivered_at, created_by)
      values (o.id, coalesce(v_carrier, ''), coalesce(v_number, ''), coalesce(v_url, ''),
              case when p_status in ('shipped', 'delivered', 'returned') then p_status::text else 'packed' end,
              case when p_status in ('shipped', 'delivered') then now() end,
              case when p_status = 'delivered' then now() end,
              p_actor_id)
      returning * into v_ship;
    else
      update public.shipments set
        carrier = coalesce(v_carrier, carrier),
        tracking_number = coalesce(v_number, tracking_number),
        tracking_url = coalesce(v_url, tracking_url),
        status = case when p_status in ('shipped', 'delivered', 'returned') then p_status::text else status end,
        shipped_at = case when p_status in ('shipped', 'delivered') then coalesce(shipped_at, now()) else shipped_at end,
        delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end
      where id = v_ship.id
      returning * into v_ship;
    end if;
  end if;

  update public.orders set
    fulfillment_status = p_status,
    shipped_at = case when p_status in ('shipped', 'delivered') then coalesce(shipped_at, now()) else shipped_at end,
    delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    status = case when p_status = 'delivered' then 'completed'::public.order_status else status end
  where id = o.id
  returning * into o;

  perform public.add_order_event(o.id, 'fulfillment',
    case p_status
      when 'processing' then 'We are preparing your order.'
      when 'packed' then 'Your order is packed.'
      when 'shipped' then 'Shipped' || coalesce(' with ' || nullif(v_ship.carrier, ''), '') ||
                          case when coalesce(v_ship.tracking_number, '') <> '' then ' (tracking ' || v_ship.tracking_number || ')' else '' end || '.'
      when 'delivered' then 'Delivered.'
      when 'returned' then 'Returned to us.'
      else 'Fulfilment updated.'
    end,
    jsonb_build_object('status', p_status, 'carrier', v_ship.carrier, 'tracking_number', v_ship.tracking_number,
                       'tracking_url', v_ship.tracking_url),
    false, p_actor_type, p_actor_id);
  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    perform public.add_order_event(o.id, 'note', left(btrim(p_note), 2000), '{}', true, p_actor_type, p_actor_id);
  end if;
  if p_notify and p_status in ('shipped', 'delivered') then
    v_template := case p_status when 'shipped' then 'order_shipped' else 'order_delivered' end;
    perform public.queue_email(o.email, v_template, o.id, jsonb_build_object(
      'carrier', v_ship.carrier, 'tracking_number', v_ship.tracking_number, 'tracking_url', v_ship.tracking_url));
  end if;
  return o;
end $$;

create or replace function public.admin_set_fulfillment(
  p_order_id uuid,
  p_status public.fulfillment_status,
  p_carrier text default null,
  p_tracking_number text default null,
  p_tracking_url text default null,
  p_note text default null,
  p_notify boolean default true
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff();
  return public.order_brief(public.set_fulfillment_internal(
    p_order_id, p_status, p_carrier, p_tracking_number, p_tracking_url, p_note, p_notify, 'staff', (select auth.uid())));
end $$;

-- A parcel that came back undelivered. Its stock goes back on sale; an unpaid
-- cash-on-delivery order is cancelled, a paid one is flagged for a refund or a new delivery.
-- Internal: callers check permissions. Safe to call twice.
create function public.mark_rto_internal(p_order_id uuid, p_note text, p_actor_type text, p_actor_id uuid)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  it record;
  v_unpaid_cod boolean;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.fulfillment_status = 'returned' then
    return o;
  end if;
  if o.status not in ('confirmed', 'completed') or o.fulfillment_status <> 'shipped' then
    raise exception 'not_in_transit' using errcode = 'P0001',
      hint = 'Only orders that have shipped and not been delivered can be marked as returned to origin.';
  end if;
  v_unpaid_cod := o.payment_method = 'cod' and o.payment_status = 'unpaid';

  perform public.set_stock_context('return', 'Order ' || o.order_number || ' returned undelivered', o.id);
  for it in
    select variant_id, product_id, sum(quantity - quantity_returned)::int as qty from public.order_items
    where order_id = o.id and variant_id is not null and quantity > quantity_returned
    group by variant_id, product_id order by variant_id
  loop
    update public.product_variants set stock_quantity = stock_quantity + it.qty where id = it.variant_id;
    update public.products set sales_count = greatest(sales_count - it.qty, 0) where id = it.product_id;
  end loop;
  perform public.clear_stock_context();
  update public.order_items set quantity_returned = quantity where order_id = o.id;
  update public.shipments set status = 'returned'
  where id = (select id from public.shipments where order_id = o.id and status <> 'cancelled' order by created_at desc limit 1);

  update public.orders set
    fulfillment_status = 'returned',
    status = case when v_unpaid_cod then 'cancelled'::public.order_status else status end,
    payment_status = case when v_unpaid_cod then 'voided'::public.order_payment_status else payment_status end,
    cancelled_at = case when v_unpaid_cod then now() else cancelled_at end,
    cancel_reason = case when v_unpaid_cod then 'returned_to_origin' else cancel_reason end,
    needs_attention = case when v_unpaid_cod then needs_attention else true end,
    attention_reason = case
      when v_unpaid_cod then attention_reason
      when o.payment_status in ('paid', 'partially_refunded') then 'The parcel came back undelivered. Refund the customer or send it again.'
      else 'The parcel came back undelivered.' end
  where id = o.id
  returning * into o;
  if v_unpaid_cod then
    update public.coupon_redemptions set voided_at = now() where order_id = o.id and voided_at is null;
  end if;

  perform public.add_order_event(o.id, 'returned_to_origin',
    case when v_unpaid_cod
      then 'The parcel came back to us undelivered, so this cash-on-delivery order was cancelled.'
      else 'The parcel came back to us undelivered.' end,
    '{}', false, p_actor_type, p_actor_id);
  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    perform public.add_order_event(o.id, 'note', left(btrim(p_note), 2000), '{}', true, p_actor_type, p_actor_id);
  end if;
  if v_unpaid_cod then
    perform public.queue_email(o.email, 'order_cancelled', o.id,
      jsonb_build_object('reason', 'The courier could not deliver the parcel and returned it to us.'));
  end if;
  return o;
end $$;

create function public.admin_mark_rto(p_order_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff();
  return public.order_brief(public.mark_rto_internal(p_order_id, p_note, 'staff', (select auth.uid())));
end $$;

-- ---------------------------------------------------------------------------
-- Bookings made by staff through the server
-- ---------------------------------------------------------------------------

-- Records (or updates) a courier booking. The server calls it after each step with the
-- courier (order created, AWB assigned, pickup scheduled), so a failure part-way leaves
-- what was already booked on record and a retry carries on from there.
create function public.admin_record_courier_booking(p_order_id uuid, p_booking jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_ship public.shipments;
  v_old public.shipments;
  v_provider text := coalesce(nullif(p_booking ->> 'provider', ''), 'shiprocket');
  v_provider_order text := nullif(btrim(coalesce(p_booking ->> 'provider_order_id', '')), '');
  v_provider_ship text := nullif(btrim(coalesce(p_booking ->> 'provider_shipment_id', '')), '');
  v_awb text := nullif(btrim(coalesce(p_booking ->> 'awb', '')), '');
  v_courier text := nullif(btrim(coalesce(p_booking ->> 'courier', '')), '');
  v_url text := nullif(btrim(coalesce(p_booking ->> 'tracking_url', '')), '');
  v_pickup timestamptz := nullif(p_booking ->> 'pickup_scheduled_for', '')::timestamptz;
  v_etd date := nullif(p_booking ->> 'estimated_delivery', '')::date;
begin
  perform public.require_staff();
  if v_provider <> 'shiprocket' then
    raise exception 'invalid_provider' using errcode = '22023';
  end if;
  if v_provider_ship is null then
    raise exception 'missing_shipment_id' using errcode = '22023';
  end if;
  if v_url is not null and v_url !~ '^https://' then
    raise exception 'invalid_tracking_url' using errcode = '22023', hint = 'The tracking link must start with https://';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.status not in ('confirmed', 'completed') then
    raise exception 'order_not_fulfillable' using errcode = 'P0001',
      hint = case when o.status = 'pending_payment' then 'This order is still waiting for payment.' else 'This order was cancelled.' end;
  end if;

  select * into v_old from public.shipments where provider = v_provider and provider_shipment_id = v_provider_ship for update;
  if v_old.id is not null and v_old.order_id <> o.id then
    raise exception 'shipment_mismatch' using errcode = 'P0001', hint = 'That courier shipment belongs to another order.';
  end if;
  if v_old.id is null then
    if o.fulfillment_status not in ('unfulfilled', 'processing', 'packed') then
      raise exception 'already_shipped' using errcode = 'P0001', hint = 'This order has already shipped.';
    end if;
    insert into public.shipments (order_id, provider, provider_order_id, provider_shipment_id, carrier, tracking_number,
                                  tracking_url, status, pickup_scheduled_for, estimated_delivery, package, created_by)
    values (o.id, v_provider, v_provider_order, v_provider_ship, coalesce(v_courier, ''), coalesce(v_awb, ''),
            coalesce(v_url, ''), 'packed', v_pickup, v_etd,
            case when jsonb_typeof(p_booking -> 'package') = 'object' then p_booking -> 'package' else '{}' end,
            (select auth.uid()))
    returning * into v_ship;
  else
    update public.shipments set
      provider_order_id = coalesce(v_provider_order, provider_order_id),
      carrier = coalesce(v_courier, carrier),
      tracking_number = coalesce(v_awb, tracking_number),
      tracking_url = coalesce(v_url, tracking_url),
      pickup_scheduled_for = coalesce(v_pickup, pickup_scheduled_for),
      estimated_delivery = coalesce(v_etd, estimated_delivery),
      package = case when jsonb_typeof(p_booking -> 'package') = 'object' then p_booking -> 'package' else package end
    where id = v_old.id
    returning * into v_ship;
  end if;

  if v_awb is not null and coalesce(v_old.tracking_number, '') = '' then
    perform public.add_order_event(o.id, 'courier_booked',
      format('Courier booked with Shiprocket: %s, AWB %s.', coalesce(nullif(v_ship.carrier, ''), 'courier'), v_awb),
      jsonb_build_object('awb', v_awb, 'courier', v_ship.carrier), true, 'staff');
    if public.fulfillment_rank(o.fulfillment_status) < public.fulfillment_rank('packed') then
      o := public.set_fulfillment_internal(o.id, 'packed', null, null, null, null, false, 'staff', (select auth.uid()));
    end if;
  end if;
  if v_pickup is not null and v_old.pickup_scheduled_for is null then
    perform public.add_order_event(o.id, 'courier_pickup',
      format('Pickup scheduled for %s.', to_char(v_pickup at time zone 'Asia/Kolkata', 'DD Mon YYYY')),
      jsonb_build_object('pickup_scheduled_for', v_pickup), true, 'staff');
  end if;
  return to_jsonb(v_ship);
end $$;

create function public.admin_cancel_courier_booking(p_order_id uuid, p_shipment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ship public.shipments;
begin
  perform public.require_staff();
  select * into v_ship from public.shipments where id = p_shipment_id and order_id = p_order_id for update;
  if v_ship.id is null then
    raise exception 'shipment_not_found' using errcode = 'P0002';
  end if;
  if v_ship.status <> 'packed' then
    raise exception 'cannot_cancel_shipment' using errcode = 'P0001',
      hint = 'This parcel has already left with the courier, so the booking cannot be cancelled.';
  end if;
  update public.shipments set status = 'cancelled', courier_status = 'Booking cancelled', courier_status_at = now()
  where id = v_ship.id returning * into v_ship;
  perform public.add_order_event(p_order_id, 'courier_cancelled',
    'Courier booking cancelled' || case when v_ship.tracking_number <> '' then ' (AWB ' || v_ship.tracking_number || ')' else '' end || '.',
    '{}', true, 'staff');
  return to_jsonb(v_ship);
end $$;

-- ---------------------------------------------------------------------------
-- Tracking updates from the courier (server only)
-- ---------------------------------------------------------------------------

-- p_status is the server's normalised status: in_transit, out_for_delivery, delivered,
-- undelivered, rto_initiated, rto_delivered, cancelled, exception or other.
create function public.courier_update(
  p_provider text,
  p_event_key text,
  p_awb text,
  p_status text,
  p_label text,
  p_location text default '',
  p_event_at timestamptz default null,
  p_etd date default null,
  p_payload jsonb default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.courier_events;
  v_ship public.shipments;
  o public.orders;
  v_at timestamptz := coalesce(p_event_at, now());
  v_label text := left(coalesce(nullif(btrim(p_label), ''), initcap(replace(coalesce(p_status, ''), '_', ' '))), 120);
  v_result text := 'recorded';
begin
  insert into public.courier_events (provider, event_key, status, payload)
  values (p_provider, left(p_event_key, 200), coalesce(p_status, ''), coalesce(p_payload, '{}'))
  on conflict (provider, event_key) do nothing
  returning * into v_event;
  if v_event.id is null then
    select * into v_event from public.courier_events where provider = p_provider and event_key = left(p_event_key, 200) for update;
    if v_event.processed_at is not null then
      return jsonb_build_object('ok', true, 'duplicate', true);
    end if;
  end if;

  select * into v_ship from public.shipments
  where provider = p_provider and tracking_number = btrim(coalesce(p_awb, '')) and btrim(coalesce(p_awb, '')) <> ''
  order by (status = 'cancelled'), created_at desc
  limit 1
  for update;
  if v_ship.id is null then
    update public.courier_events set error = 'No shipment has this tracking number.' where id = v_event.id;
    return jsonb_build_object('ok', false, 'error', 'unknown_awb');
  end if;

  update public.shipments set
    courier_status = case when v_at >= coalesce(courier_status_at, '-infinity'::timestamptz) then v_label else courier_status end,
    courier_status_at = greatest(coalesce(courier_status_at, v_at), v_at),
    estimated_delivery = coalesce(p_etd, estimated_delivery),
    courier_events = (
      select coalesce(jsonb_agg(x.e order by (x.e ->> 'at')::timestamptz desc), '[]')
      from (
        select e from jsonb_array_elements(courier_events || jsonb_build_array(jsonb_build_object(
          'status', v_label, 'location', left(coalesce(p_location, ''), 120), 'at', v_at))) e
        order by (e ->> 'at')::timestamptz desc
        limit 25
      ) x
    )
  where id = v_ship.id
  returning * into v_ship;

  select * into o from public.orders where id = v_ship.order_id for update;
  if v_ship.status <> 'cancelled' and o.status in ('confirmed', 'completed') then
    case p_status
      when 'in_transit', 'out_for_delivery' then
        if public.fulfillment_rank(o.fulfillment_status) < public.fulfillment_rank('shipped') then
          o := public.set_fulfillment_internal(o.id, 'shipped', v_ship.carrier, v_ship.tracking_number, v_ship.tracking_url,
                                               null, true, 'provider', null);
          v_result := 'shipped';
        end if;
      when 'delivered' then
        if o.fulfillment_status in ('unfulfilled', 'processing', 'packed', 'shipped') then
          o := public.set_fulfillment_internal(o.id, 'delivered', v_ship.carrier, v_ship.tracking_number, v_ship.tracking_url,
                                               null, true, 'provider', null);
          v_result := 'delivered';
        end if;
      when 'rto_delivered' then
        if o.fulfillment_status = 'shipped' then
          o := public.mark_rto_internal(o.id, null, 'provider', null);
          v_result := 'returned_to_origin';
        end if;
      when 'rto_initiated', 'undelivered', 'exception' then
        if o.fulfillment_status in ('packed', 'shipped') then
          update public.orders set
            needs_attention = true,
            attention_reason = left(case p_status
              when 'rto_initiated' then 'The courier is returning this parcel to you: '
              when 'undelivered' then 'Delivery attempt failed: '
              else 'The courier reported a problem: ' end || v_label, 300)
          where id = o.id;
          perform public.add_order_event(o.id, 'courier_issue', 'Courier: ' || v_label ||
            case when coalesce(p_location, '') <> '' then ' (' || p_location || ')' else '' end, '{}', true, 'provider');
          v_result := 'flagged';
        end if;
      when 'cancelled' then
        if v_ship.status = 'packed' then
          update public.shipments set status = 'cancelled' where id = v_ship.id;
          perform public.add_order_event(o.id, 'courier_cancelled',
            'The courier cancelled the booking (AWB ' || v_ship.tracking_number || '). Book a courier again.', '{}', true, 'provider');
          v_result := 'cancelled';
        end if;
      else
        null;
    end case;
  end if;

  update public.courier_events set processed_at = now(), error = null, shipment_id = v_ship.id, order_id = v_ship.order_id
  where id = v_event.id;
  return jsonb_build_object('ok', true, 'result', v_result, 'order_id', v_ship.order_id, 'order_number', o.order_number);
end $$;

-- The customer's view of an order: courier booking details stay internal.
create or replace function public.order_detail(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order', to_jsonb(o) - 'idempotency_key' - 'cart_id' - 'needs_attention' - 'attention_reason',
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at, i.id) from public.order_items i where i.order_id = o.id), '[]'),
    'shipments', coalesce((
      select jsonb_agg(to_jsonb(sh) - 'provider_order_id' - 'provider_shipment_id' - 'package' - 'created_by' order by sh.created_at)
      from public.shipments sh where sh.order_id = o.id and sh.status <> 'cancelled'), '[]'),
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object('id', rf.id, 'amount', rf.amount, 'status', rf.status, 'created_at', rf.created_at,
                                          'processed_at', rf.processed_at) order by rf.created_at)
      from public.refunds rf where rf.order_id = o.id), '[]'),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('kind', e.kind, 'message', e.message, 'created_at', e.created_at) order by e.created_at, e.id)
      from public.order_events e where e.order_id = o.id and not e.is_internal), '[]'),
    'returns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'status', r.status, 'reason', r.reason, 'created_at', r.created_at,
        'refund_amount', r.refund_amount,
        'items', coalesce((select jsonb_agg(jsonb_build_object('order_item_id', ri.order_item_id, 'quantity', ri.quantity))
                           from public.return_request_items ri where ri.return_request_id = r.id), '[]')
      ) order by r.created_at)
      from public.return_requests r where r.order_id = o.id), '[]')
  )
  from public.orders o
  where o.id = p_order_id
$$;

revoke execute on function public.set_fulfillment_internal(uuid, public.fulfillment_status, text, text, text, text, boolean, text, uuid) from public, anon, authenticated;
revoke execute on function public.mark_rto_internal(uuid, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.courier_update(text, text, text, text, text, text, timestamptz, date, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_mark_rto(uuid, text) from public, anon;
revoke execute on function public.admin_record_courier_booking(uuid, jsonb) from public, anon;
revoke execute on function public.admin_cancel_courier_booking(uuid, uuid) from public, anon;
grant execute on function public.admin_mark_rto(uuid, text) to authenticated;
grant execute on function public.admin_record_courier_booking(uuid, jsonb) to authenticated;
grant execute on function public.admin_cancel_courier_booking(uuid, uuid) to authenticated;
