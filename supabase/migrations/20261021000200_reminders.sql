-- Reminders: "notify me" when a sold-out size is back, one reminder about a bag left
-- behind, and price drops on wishlisted products. They go through the email outbox like
-- order emails. Bag and price emails carry an unsubscribe link; anyone who uses it is
-- recorded in email_suppressions and gets no further reminders.

alter table public.store_settings
  add column stock_alerts_enabled boolean not null default true,
  add column cart_reminders_enabled boolean not null default false,
  add column cart_reminder_hours int not null default 3 check (cart_reminder_hours between 1 and 72),
  add column price_alerts_enabled boolean not null default true;

create table public.email_suppressions (
  email text primary key check (public.is_email(email) and email = lower(email)),
  reason text not null default 'unsubscribed' check (char_length(reason) <= 80),
  created_at timestamptz not null default now()
);
alter table public.email_suppressions enable row level security;
revoke all on public.email_suppressions from anon, authenticated;
create policy email_suppressions_staff_read on public.email_suppressions for select to authenticated using ((select public.is_staff()));
grant select on public.email_suppressions to authenticated;

create function public.email_suppressed(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.email_suppressions where email = lower(btrim(coalesce(p_email, ''))))
$$;

-- ---------------------------------------------------------------------------
-- Back in stock
-- ---------------------------------------------------------------------------
create table public.stock_alerts (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  email text not null check (public.is_email(email) and email = lower(email)),
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  notified_at timestamptz
);
create unique index stock_alerts_waiting_key on public.stock_alerts (variant_id, email) where notified_at is null;
create index stock_alerts_email_idx on public.stock_alerts (email) where notified_at is null;
alter table public.stock_alerts enable row level security;
revoke all on public.stock_alerts from anon, authenticated;
create policy stock_alerts_staff_read on public.stock_alerts for select to authenticated using ((select public.is_staff()));
grant select on public.stock_alerts to authenticated;

-- "Notify me when it's back" for a sold-out size (server only).
create function public.stock_alert_subscribe(p_variant_id uuid, p_email text, p_user_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.product_variants;
  p public.products;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_email(v_email) then
    raise exception 'invalid_email' using errcode = '22023', hint = 'Enter a valid email address.';
  end if;
  if not (select stock_alerts_enabled from public.store_settings where id = 1) then
    raise exception 'alerts_off' using errcode = 'P0001', hint = 'Back-in-stock alerts aren''t available right now.';
  end if;
  select * into v from public.product_variants where id = p_variant_id;
  if v.id is null or not v.is_active or not public.product_visible(v.product_id) then
    raise exception 'not_found' using errcode = 'P0002', hint = 'This item is no longer available.';
  end if;
  select * into p from public.products where id = v.product_id;
  if v.stock_quantity - v.reserved_quantity > 0 then
    return jsonb_build_object('in_stock', true);
  end if;
  if (select count(*) from public.stock_alerts where email = v_email and notified_at is null) >= 30 then
    raise exception 'too_many_alerts' using errcode = 'P0001', hint = 'You''re already waiting for 30 items. We''ll email you as they come back.';
  end if;
  insert into public.stock_alerts (variant_id, product_id, email, user_id)
  values (v.id, v.product_id, v_email, p_user_id)
  on conflict (variant_id, email) where notified_at is null do nothing;
  return jsonb_build_object('in_stock', false, 'title', p.title, 'size', v.size, 'color', v.color);
end $$;

-- When a size comes back (restock, cancellation, return, or an unpaid order releasing it),
-- everyone waiting for it gets one email.
create function public.variants_notify_restock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  p public.products;
  v_image text;
begin
  if (old.stock_quantity - old.reserved_quantity) > 0 or (new.stock_quantity - new.reserved_quantity) <= 0 or not new.is_active then
    return new;
  end if;
  if not exists (select 1 from public.stock_alerts where variant_id = new.id and notified_at is null) then
    return new;
  end if;
  if not (select stock_alerts_enabled from public.store_settings where id = 1) or not public.product_visible(new.product_id) then
    return new;
  end if;
  select * into p from public.products where id = new.product_id;
  select im.url into v_image from public.product_images im
  where im.product_id = p.id order by (im.color is not null and im.color = new.color) desc, im.position limit 1;
  -- These were asked for, so they go out even to people who unsubscribed from reminders.
  for a in
    select id, email from public.stock_alerts where variant_id = new.id and notified_at is null order by created_at limit 1000
  loop
    insert into public.email_outbox (to_email, template, order_id, data)
    values (a.email, 'back_in_stock', null, jsonb_build_object(
      'product_title', p.title, 'slug', p.slug, 'size', new.size, 'color', new.color,
      'price', coalesce(new.price, p.price), 'image_url', v_image));
    update public.stock_alerts set notified_at = now() where id = a.id;
  end loop;
  return new;
end $$;
create trigger product_variants_notify_restock after update of stock_quantity, reserved_quantity on public.product_variants
  for each row execute function public.variants_notify_restock();

-- ---------------------------------------------------------------------------
-- A bag left behind
-- ---------------------------------------------------------------------------
alter table public.carts
  add column contact_email text check (contact_email is null or public.is_email(contact_email)),
  add column reminder_sent_at timestamptz;

-- Checkout choices for the visitor's cart (server only): {"whatsapp_opt_in": true,
-- "email": "..."}. The email lets a guest get a reminder about the bag.
create or replace function public.cart_set_contact(p_user_id uuid, p_token text, p_contact jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cart uuid := public.cart_find(p_user_id, p_token, false);
  v_email text := lower(btrim(coalesce(p_contact ->> 'email', '')));
begin
  if v_cart is null or jsonb_typeof(p_contact) <> 'object' then
    return;
  end if;
  update public.carts set
    whatsapp_opt_in = case when p_contact ? 'whatsapp_opt_in'
                           then coalesce((p_contact ->> 'whatsapp_opt_in')::boolean, false) else whatsapp_opt_in end,
    contact_email = case when public.is_email(v_email) then v_email else contact_email end
  where id = v_cart;
end $$;

-- Queues one reminder per bag that has sat untouched for the store's chosen hours (and not
-- more than a week), with something still in stock, for a known email address.
create function public.queue_cart_reminders(p_limit int default 200) returns int
language plpgsql security definer set search_path = '' as $$
declare
  s public.store_settings;
  c record;
  v_items jsonb;
  v_count int := 0;
begin
  select * into s from public.store_settings where id = 1;
  if not s.cart_reminders_enabled then
    return 0;
  end if;
  for c in
    select ca.id, lower(coalesce(u.email, ca.contact_email)) as email
    from public.carts ca
    left join auth.users u on u.id = ca.user_id
    where (ca.reminder_sent_at is null or ca.reminder_sent_at < ca.updated_at)
      and ca.updated_at < now() - make_interval(hours => s.cart_reminder_hours)
      and ca.updated_at > now() - interval '7 days'
      and coalesce(u.email, ca.contact_email) is not null
      and exists (select 1 from public.cart_items ci where ci.cart_id = ca.id)
      and not public.email_suppressed(coalesce(u.email, ca.contact_email))
      and not exists (select 1 from public.orders o
                      where o.cart_id = ca.id and o.status in ('confirmed', 'completed') and o.created_at > ca.updated_at - interval '1 minute')
    order by ca.updated_at
    limit p_limit
    for update of ca skip locked
  loop
    select jsonb_agg(x order by x ->> 'title') into v_items from (
      select jsonb_build_object(
        'title', p.title, 'size', v.size, 'color', v.color, 'quantity', ci.quantity,
        'price', coalesce(v.price, p.price),
        'image_url', (select im.url from public.product_images im
                      where im.product_id = p.id order by (im.color is not null and im.color = v.color) desc, im.position limit 1)
      ) as x
      from public.cart_items ci
      join public.product_variants v on v.id = ci.variant_id
      join public.products p on p.id = v.product_id
      where ci.cart_id = c.id and v.is_active and public.product_visible(p.id) and v.stock_quantity - v.reserved_quantity > 0
      limit 6
    ) items;
    update public.carts set reminder_sent_at = now() where id = c.id;
    if v_items is not null then
      insert into public.email_outbox (to_email, template, order_id, data)
      values (c.email, 'cart_reminder', null, jsonb_build_object('cart_id', c.id, 'items', v_items));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

-- The reminder's "Return to your bag" link adds that bag's items to the visitor's own bag
-- (on any device), as far as stock allows (server only; the server checks the link).
create function public.cart_restore(p_from_cart uuid, p_user_id uuid, p_token text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_cart uuid := public.cart_find(p_user_id, p_token, true);
  it record;
  v_qty int;
  v_added int := 0;
begin
  if v_cart is null or v_cart = p_from_cart then
    return 0;
  end if;
  for it in
    select ci.variant_id, ci.quantity, v.stock_quantity - v.reserved_quantity as available
    from public.cart_items ci join public.product_variants v on v.id = ci.variant_id
    where ci.cart_id = p_from_cart and v.is_active and public.product_visible(v.product_id)
  loop
    v_qty := least(it.quantity, it.available, 20);
    if v_qty > 0 then
      insert into public.cart_items (cart_id, variant_id, quantity) values (v_cart, it.variant_id, v_qty)
      on conflict (cart_id, variant_id) do update set quantity = greatest(public.cart_items.quantity, excluded.quantity), updated_at = now();
      v_added := v_added + 1;
    end if;
  end loop;
  update public.carts set updated_at = now() where id = v_cart;
  return v_added;
end $$;

-- ---------------------------------------------------------------------------
-- Price drops on the wishlist
-- ---------------------------------------------------------------------------
alter table public.wishlist_items
  add column price_at_add public.money_minor,
  add column alerted_price public.money_minor;
update public.wishlist_items wi set price_at_add = coalesce(p.min_price, p.price)
from public.products p where p.id = wi.product_id and wi.price_at_add is null;

create function public.wishlist_items_price() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.price_at_add := coalesce(new.price_at_add, (select coalesce(p.min_price, p.price) from public.products p where p.id = new.product_id));
  return new;
end $$;
create trigger wishlist_items_price before insert on public.wishlist_items
  for each row execute function public.wishlist_items_price();

alter table public.profiles
  add column price_alerts boolean not null default false,
  add column price_alert_sent_at timestamptz;
grant update (price_alerts) on public.profiles to authenticated;

-- One email per customer (at most every three days) listing wishlisted products now at
-- least 5% cheaper than when they saved them, or than the last alert.
create function public.queue_price_alerts(p_limit int default 200) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_items jsonb;
  v_count int := 0;
begin
  if not (select price_alerts_enabled from public.store_settings where id = 1) then
    return 0;
  end if;
  for r in
    select w.id as wishlist_id, pr.id as user_id, lower(u.email) as email
    from public.wishlists w
    join public.profiles pr on pr.id = w.user_id
    join auth.users u on u.id = w.user_id
    where pr.price_alerts and u.email is not null
      and (pr.price_alert_sent_at is null or pr.price_alert_sent_at < now() - interval '3 days')
      and not public.email_suppressed(u.email)
      and exists (
        select 1 from public.wishlist_items wi join public.products p on p.id = wi.product_id
        where wi.wishlist_id = w.id and public.product_visible(p.id) and p.available_stock > 0
          and coalesce(p.min_price, p.price) * 100 <= coalesce(wi.alerted_price, wi.price_at_add) * 95)
    limit p_limit
    for update of pr skip locked
  loop
    select jsonb_agg(x) into v_items from (
      select jsonb_build_object(
        'title', p.title, 'slug', p.slug, 'was', coalesce(wi.alerted_price, wi.price_at_add), 'now', coalesce(p.min_price, p.price),
        'image_url', (select im.url from public.product_images im where im.product_id = p.id order by im.position limit 1)
      ) as x
      from public.wishlist_items wi join public.products p on p.id = wi.product_id
      where wi.wishlist_id = r.wishlist_id and public.product_visible(p.id) and p.available_stock > 0
        and coalesce(p.min_price, p.price) * 100 <= coalesce(wi.alerted_price, wi.price_at_add) * 95
      order by (coalesce(wi.alerted_price, wi.price_at_add) - coalesce(p.min_price, p.price)) desc
      limit 6
    ) drops;
    update public.wishlist_items wi set alerted_price = coalesce(p.min_price, p.price)
    from public.products p
    where p.id = wi.product_id and wi.wishlist_id = r.wishlist_id
      and coalesce(p.min_price, p.price) * 100 <= coalesce(wi.alerted_price, wi.price_at_add) * 95;
    update public.profiles set price_alert_sent_at = now() where id = r.user_id;
    insert into public.email_outbox (to_email, template, order_id, data)
    values (r.email, 'price_drop', null, jsonb_build_object('items', v_items));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- The unsubscribe link (server only, after checking the link's signature).
create function public.email_unsubscribe(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_email(v_email) then
    return;
  end if;
  insert into public.email_suppressions (email) values (v_email) on conflict (email) do nothing;
  update public.profiles set price_alerts = false where lower(email) = v_email;
end $$;

create or replace function public.housekeeping() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_released int;
  v_unconfirmed int;
  v_cart_reminders int;
  v_price_alerts int;
  v_carts int;
begin
  v_released := public.release_expired_orders(500);
  v_unconfirmed := public.cancel_unconfirmed_cod_orders(200);
  v_cart_reminders := public.queue_cart_reminders(200);
  v_price_alerts := public.queue_price_alerts(200);
  delete from public.rate_limits where window_start < now() - interval '1 day';
  delete from public.carts c where c.user_id is null and c.updated_at < now() - interval '60 days'
    and not exists (select 1 from public.orders o where o.cart_id = c.id and o.status = 'pending_payment');
  get diagnostics v_carts = row_count;
  return jsonb_build_object('released_orders', v_released, 'cancelled_unconfirmed_cod', v_unconfirmed,
    'cart_reminders', v_cart_reminders, 'price_alerts', v_price_alerts, 'deleted_guest_carts', v_carts);
end $$;

revoke execute on function public.email_suppressed(text) from public, anon, authenticated;
revoke execute on function public.stock_alert_subscribe(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.variants_notify_restock() from public, anon, authenticated;
revoke execute on function public.cart_set_contact(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.queue_cart_reminders(int) from public, anon, authenticated;
revoke execute on function public.cart_restore(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.wishlist_items_price() from public, anon, authenticated;
revoke execute on function public.queue_price_alerts(int) from public, anon, authenticated;
revoke execute on function public.email_unsubscribe(text) from public, anon, authenticated;
grant execute on function public.stock_alert_subscribe(uuid, text, uuid) to service_role;
grant execute on function public.cart_set_contact(uuid, text, jsonb) to service_role;
grant execute on function public.queue_cart_reminders(int) to service_role;
grant execute on function public.cart_restore(uuid, uuid, text) to service_role;
grant execute on function public.queue_price_alerts(int) to service_role;
grant execute on function public.email_unsubscribe(text) to service_role;
