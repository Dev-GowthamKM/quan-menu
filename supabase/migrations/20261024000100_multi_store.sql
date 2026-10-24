-- Multi-store: one platform runs many stores, each with its own catalog, customers,
-- orders, settings, staff and web address. The existing store becomes the first one
-- (the "home" store) and keeps all of its data.
--
-- How a request picks its store: the app sends an x-store-id header with every database
-- call, and current_store_id() reads it (PostgREST passes request headers to SQL).
-- Without the header (the SQL editor, scheduled jobs, the app before this change) it is
-- the home store. The header only chooses which store a request works with; it never
-- grants anything:
--   * every row carries store_id, and every row-level security policy adds
--     "store_id = current_store_id()" to what it allowed before;
--   * is_staff() and friends now mean staff of the current store, so a header naming a
--     store the user doesn't work for gets them nothing;
--   * a guard trigger on every table refuses writes during a request to any store other
--     than the request's, which also covers SECURITY DEFINER functions;
--   * composite foreign keys keep references within a store (a product can only use
--     its own store's brand, a bag only holds its own store's items, and so on).
-- Customer accounts (auth.users, profiles) are shared by the platform; store_customers
-- records which stores a person shops at, and staff see only their store's customers.

-- ---------------------------------------------------------------------------
-- Stores
-- ---------------------------------------------------------------------------
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (public.is_slug(slug) and char_length(slug) <= 40),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  status text not null default 'active' check (status in ('active', 'suspended')),
  is_home boolean not null default false,
  -- Order numbers are the prefix and a per-store counter: TA100001, TA100002, ...
  order_prefix text not null unique check (order_prefix ~ '^[A-Z]{2,4}$'),
  order_counter bigint not null default 100000 check (order_counter >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index stores_one_home on public.stores (is_home) where is_home;

-- The web addresses a store answers on. Requests for any other host get the home store.
create table public.store_domains (
  hostname text primary key
    check (hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{2,5})?$' and char_length(hostname) <= 253),
  store_id uuid not null references public.stores (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index store_domains_store_idx on public.store_domains (store_id);
create unique index store_domains_one_primary on public.store_domains (store_id) where is_primary;

-- People who run the platform: they create stores and act as an owner in every store.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Which stores a customer account shops at. Staff see a customer once they're on this
-- list for the staff's store: signed up or signed in there, or ordered there.
create table public.store_customers (
  store_id uuid not null references public.stores (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (store_id, user_id)
);
create index store_customers_user_idx on public.store_customers (user_id);

-- The existing store becomes the home store, with order numbers carrying on.
insert into public.stores (slug, name, is_home, order_prefix, order_counter)
select coalesce(nullif(btrim(left(public.slugify(s.store_name), 40), '-'), ''), 'main'), left(s.store_name, 80), true, 'TA',
       (select case when q.is_called then q.last_value else q.last_value - 1 end from public.order_number_seq q)
from public.store_settings s
where s.id = 1;

-- ---------------------------------------------------------------------------
-- The request's store
-- ---------------------------------------------------------------------------
create function public.home_store_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.stores where is_home
$$;

-- The store named by the request's x-store-id header, or null outside a request.
create function public.request_store_id() returns uuid
language plpgsql stable set search_path = '' as $$
declare
  v text := nullif(current_setting('request.headers', true), '')::json ->> 'x-store-id';
begin
  if v is null or v = '' then
    return null;
  end if;
  if v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'invalid_store' using errcode = '22023', hint = 'The store header is not a store id.';
  end if;
  return v::uuid;
end $$;

create function public.current_store_id() returns uuid
language sql stable set search_path = '' as $$
  select coalesce(public.request_store_id(), public.home_store_id())
$$;

create function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins where user_id = (select auth.uid()))
$$;

-- ---------------------------------------------------------------------------
-- store_id on every table. Existing rows belong to the home store (a constant default
-- fills them without rewriting or firing triggers); new rows take the request's store,
-- and rows that hang off another row (a variant, an order line, a payment) take their
-- parent's store, whatever was asked for.
-- ---------------------------------------------------------------------------
do $$
declare
  v_home uuid := public.home_store_id();
  t text;
begin
  -- Tables whose rows belong directly to a store.
  foreach t in array array[
    'brands', 'categories', 'collections', 'size_guides', 'products', 'coupons', 'shipping_zones', 'shipping_providers',
    'postal_code_rules', 'carts', 'wishlists', 'customer_addresses', 'orders', 'contact_messages', 'newsletter_subscribers',
    'email_suppressions', 'cod_blocklist', 'customer_notes', 'store_settings', 'user_roles',
    -- and tables whose rows hang off a parent row
    'product_variants', 'product_images', 'collection_products', 'cart_items', 'wishlist_items', 'shipping_rates',
    'order_items', 'order_events', 'payments', 'refunds', 'shipments', 'return_requests', 'return_request_items',
    'coupon_redemptions', 'whatsapp_outbox', 'email_outbox', 'inventory_movements', 'stock_alerts', 'product_reviews'
  ] loop
    execute format('alter table public.%I add column store_id uuid not null default %L references public.stores (id) on delete cascade', t, v_home);
    execute format('alter table public.%I alter column store_id set default public.current_store_id()', t);
  end loop;
  -- Rows that may not belong to any store (provider events nobody claimed, platform actions).
  foreach t in array array['payment_events', 'courier_events', 'audit_logs'] loop
    execute format('alter table public.%I add column store_id uuid default %L references public.stores (id) on delete cascade', t, v_home);
    execute format('alter table public.%I alter column store_id set default public.current_store_id()', t);
  end loop;
end $$;

-- A child row's store is its parent's: inherit_store('<parent table>', '<parent id column>').
create function public.inherit_store() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_parent uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
  v_store uuid;
begin
  if v_parent is not null then
    execute format('select store_id from public.%I where id = $1', tg_argv[0]) into v_store using v_parent;
  end if;
  new.store_id := coalesce(v_store, new.store_id, public.current_store_id());
  return new;
end $$;

do $$
declare
  r record;
begin
  for r in select * from (values
    ('product_variants', 'products', 'product_id'),
    ('product_images', 'products', 'product_id'),
    ('collection_products', 'collections', 'collection_id'),
    ('cart_items', 'carts', 'cart_id'),
    ('wishlist_items', 'wishlists', 'wishlist_id'),
    ('shipping_rates', 'shipping_zones', 'zone_id'),
    ('order_items', 'orders', 'order_id'),
    ('order_events', 'orders', 'order_id'),
    ('payments', 'orders', 'order_id'),
    ('payment_events', 'orders', 'order_id'),
    ('refunds', 'orders', 'order_id'),
    ('shipments', 'orders', 'order_id'),
    ('return_requests', 'orders', 'order_id'),
    ('return_request_items', 'return_requests', 'return_request_id'),
    ('coupon_redemptions', 'orders', 'order_id'),
    ('whatsapp_outbox', 'orders', 'order_id'),
    ('email_outbox', 'orders', 'order_id'),
    ('courier_events', 'orders', 'order_id'),
    ('inventory_movements', 'products', 'product_id'),
    ('stock_alerts', 'products', 'product_id'),
    ('product_reviews', 'products', 'product_id')
  ) as x(child, parent, col) loop
    execute format(
      'create trigger store_inherit before insert or update of %I, store_id on public.%I for each row execute function public.inherit_store(%L, %L)',
      r.col, r.child, r.parent, r.col);
  end loop;
end $$;

-- During a request, writes may only touch the request's store. Functions that work across
-- stores on purpose (creating a store) set app.cross_store for their transaction.
create function public.guard_store() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_store uuid := public.request_store_id();
begin
  if v_store is null or current_setting('app.cross_store', true) = 'on' then
    return coalesce(new, old);
  end if;
  if (tg_op <> 'INSERT' and old.store_id is distinct from v_store)
     or (tg_op <> 'DELETE' and new.store_id is distinct from v_store) then
    raise exception 'wrong_store' using errcode = '42501', hint = 'That belongs to another store.';
  end if;
  return coalesce(new, old);
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'brands', 'categories', 'collections', 'size_guides', 'products', 'coupons', 'shipping_zones', 'shipping_providers',
    'postal_code_rules', 'carts', 'wishlists', 'customer_addresses', 'orders', 'contact_messages', 'newsletter_subscribers',
    'email_suppressions', 'cod_blocklist', 'customer_notes', 'store_settings', 'user_roles', 'product_variants',
    'product_images', 'collection_products', 'cart_items', 'wishlist_items', 'shipping_rates', 'order_items', 'order_events',
    'payments', 'payment_events', 'refunds', 'shipments', 'return_requests', 'return_request_items', 'coupon_redemptions',
    'whatsapp_outbox', 'email_outbox', 'courier_events', 'inventory_movements', 'stock_alerts', 'product_reviews', 'audit_logs'
  ] loop
    -- Named to fire after every other BEFORE trigger, once store_id is final.
    execute format('create trigger zz_store_guard before insert or update or delete on public.%I for each row execute function public.guard_store()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Uniqueness within a store: two stores can both sell /products/linen-shirt.
-- ---------------------------------------------------------------------------
alter table public.brands drop constraint brands_slug_key, add constraint brands_slug_key unique (store_id, slug);
alter table public.categories drop constraint categories_slug_key, add constraint categories_slug_key unique (store_id, slug);
alter table public.collections drop constraint collections_slug_key, add constraint collections_slug_key unique (store_id, slug);
alter table public.products drop constraint products_slug_key, add constraint products_slug_key unique (store_id, slug);
drop index public.product_variants_sku_key;
create unique index product_variants_sku_key on public.product_variants (store_id, upper(sku));
alter table public.coupons drop constraint coupons_code_key, add constraint coupons_code_key unique (store_id, code);
alter table public.shipping_providers drop constraint shipping_providers_name_key,
  add constraint shipping_providers_name_key unique (store_id, name);
alter table public.postal_code_rules drop constraint postal_code_rules_pkey, add primary key (store_id, postal_code);
alter table public.newsletter_subscribers drop constraint newsletter_subscribers_email_key,
  add constraint newsletter_subscribers_email_key unique (store_id, email);
alter table public.email_suppressions drop constraint email_suppressions_pkey, add primary key (store_id, email);
alter table public.cod_blocklist drop constraint cod_blocklist_pkey, add primary key (store_id, kind, value);
alter table public.carts drop constraint carts_user_id_key, add constraint carts_user_id_key unique (store_id, user_id),
  drop constraint carts_token_hash_key, add constraint carts_token_hash_key unique (store_id, token_hash);
alter table public.wishlists drop constraint wishlists_user_id_key, add constraint wishlists_user_id_key unique (store_id, user_id);
drop index public.customer_addresses_one_default;
create unique index customer_addresses_one_default on public.customer_addresses (store_id, user_id) where is_default;
alter table public.user_roles drop constraint user_roles_pkey, add primary key (store_id, user_id);
create index user_roles_user_idx on public.user_roles (user_id);

-- Indexes for the store filter every query now carries.
do $$
declare
  t text;
begin
  foreach t in array array[
    'size_guides', 'shipping_zones', 'customer_addresses', 'orders', 'contact_messages', 'customer_notes', 'product_images',
    'order_items', 'order_events', 'payments', 'payment_events', 'refunds', 'shipments', 'return_requests',
    'coupon_redemptions', 'whatsapp_outbox', 'email_outbox', 'courier_events', 'inventory_movements', 'stock_alerts',
    'product_reviews', 'audit_logs', 'collection_products', 'cart_items', 'wishlist_items', 'shipping_rates',
    'return_request_items'
  ] loop
    execute format('create index %I on public.%I (store_id)', t || '_store_idx', t);
  end loop;
end $$;
create index products_store_listing_idx on public.products (store_id, status, published_at);
create index orders_store_placed_idx on public.orders (store_id, placed_at desc);

-- ---------------------------------------------------------------------------
-- References stay within a store. Each parent gets a (store_id, id) key, and each
-- reference becomes a composite foreign key with the same delete behaviour as before.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'brands', 'categories', 'size_guides', 'products', 'product_variants', 'collections', 'carts', 'wishlists',
    'shipping_zones', 'shipping_rates', 'orders', 'order_items', 'payments', 'return_requests', 'coupons', 'shipments'
  ] loop
    execute format('alter table public.%I add constraint %I unique (store_id, id)', t, t || '_store_id_key');
  end loop;
end $$;

do $$
declare
  r record;
begin
  for r in select * from (values
    -- table, old constraint, column, parent, on delete
    ('products', 'products_brand_id_fkey', 'brand_id', 'brands', 'set null (brand_id)'),
    ('products', 'products_category_id_fkey', 'category_id', 'categories', 'set null (category_id)'),
    ('products', 'products_size_guide_id_fkey', 'size_guide_id', 'size_guides', 'set null (size_guide_id)'),
    ('categories', 'categories_parent_id_fkey', 'parent_id', 'categories', 'restrict'),
    ('categories', 'categories_size_guide_id_fkey', 'size_guide_id', 'size_guides', 'set null (size_guide_id)'),
    ('product_variants', 'product_variants_product_id_fkey', 'product_id', 'products', 'cascade'),
    ('product_images', 'product_images_product_id_fkey', 'product_id', 'products', 'cascade'),
    ('collection_products', 'collection_products_collection_id_fkey', 'collection_id', 'collections', 'cascade'),
    ('collection_products', 'collection_products_product_id_fkey', 'product_id', 'products', 'cascade'),
    ('cart_items', 'cart_items_cart_id_fkey', 'cart_id', 'carts', 'cascade'),
    ('cart_items', 'cart_items_variant_id_fkey', 'variant_id', 'product_variants', 'cascade'),
    ('wishlist_items', 'wishlist_items_wishlist_id_fkey', 'wishlist_id', 'wishlists', 'cascade'),
    ('wishlist_items', 'wishlist_items_product_id_fkey', 'product_id', 'products', 'cascade'),
    ('wishlist_items', 'wishlist_items_variant_id_fkey', 'variant_id', 'product_variants', 'set null (variant_id)'),
    ('shipping_rates', 'shipping_rates_zone_id_fkey', 'zone_id', 'shipping_zones', 'cascade'),
    ('orders', 'orders_cart_id_fkey', 'cart_id', 'carts', 'set null (cart_id)'),
    ('orders', 'orders_shipping_rate_id_fkey', 'shipping_rate_id', 'shipping_rates', 'set null (shipping_rate_id)'),
    ('order_items', 'order_items_order_id_fkey', 'order_id', 'orders', 'cascade'),
    ('order_items', 'order_items_product_id_fkey', 'product_id', 'products', 'set null (product_id)'),
    ('order_items', 'order_items_variant_id_fkey', 'variant_id', 'product_variants', 'set null (variant_id)'),
    ('order_events', 'order_events_order_id_fkey', 'order_id', 'orders', 'cascade'),
    ('payments', 'payments_order_id_fkey', 'order_id', 'orders', 'cascade'),
    ('payment_events', 'payment_events_order_id_fkey', 'order_id', 'orders', 'set null (order_id)'),
    ('refunds', 'refunds_order_id_fkey', 'order_id', 'orders', 'cascade'),
    ('refunds', 'refunds_payment_id_fkey', 'payment_id', 'payments', 'set null (payment_id)'),
    ('refunds', 'refunds_return_request_id_fkey', 'return_request_id', 'return_requests', 'set null (return_request_id)'),
    ('shipments', 'shipments_order_id_fkey', 'order_id', 'orders', 'cascade'),
    ('return_requests', 'return_requests_order_id_fkey', 'order_id', 'orders', 'cascade'),
    ('return_request_items', 'return_request_items_return_request_id_fkey', 'return_request_id', 'return_requests', 'cascade'),
    ('return_request_items', 'return_request_items_order_item_id_fkey', 'order_item_id', 'order_items', 'cascade'),
    ('coupon_redemptions', 'coupon_redemptions_order_id_fkey', 'order_id', 'orders', 'cascade'),
    ('coupon_redemptions', 'coupon_redemptions_coupon_id_fkey', 'coupon_id', 'coupons', 'cascade'),
    ('email_outbox', 'email_outbox_order_id_fkey', 'order_id', 'orders', 'cascade'),
    ('whatsapp_outbox', 'whatsapp_outbox_order_id_fkey', 'order_id', 'orders', 'cascade'),
    ('courier_events', 'courier_events_order_id_fkey', 'order_id', 'orders', 'set null (order_id)'),
    ('courier_events', 'courier_events_shipment_id_fkey', 'shipment_id', 'shipments', 'set null (shipment_id)'),
    ('cod_blocklist', 'cod_blocklist_order_id_fkey', 'order_id', 'orders', 'set null (order_id)'),
    ('stock_alerts', 'stock_alerts_variant_id_fkey', 'variant_id', 'product_variants', 'cascade'),
    ('stock_alerts', 'stock_alerts_product_id_fkey', 'product_id', 'products', 'cascade'),
    ('product_reviews', 'product_reviews_product_id_fkey', 'product_id', 'products', 'cascade'),
    ('product_reviews', 'product_reviews_order_id_fkey', 'order_id', 'orders', 'set null (order_id)'),
    ('inventory_movements', 'inventory_movements_variant_id_fkey', 'variant_id', 'product_variants', 'set null (variant_id)'),
    ('inventory_movements', 'inventory_movements_product_id_fkey', 'product_id', 'products', 'set null (product_id)'),
    ('inventory_movements', 'inventory_movements_order_fk', 'order_id', 'orders', 'set null (order_id)')
  ) as x(tbl, old_fk, col, parent, on_delete) loop
    execute format('alter table public.%I drop constraint %I', r.tbl, r.old_fk);
    execute format('alter table public.%I add constraint %I foreign key (store_id, %I) references public.%I (store_id, id) on delete %s',
                   r.tbl, r.old_fk, r.col, r.parent, r.on_delete);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Settings: one row per store.
-- ---------------------------------------------------------------------------
alter table public.store_settings drop constraint store_settings_id_check;
create sequence public.store_settings_id_seq as smallint start 2 owned by public.store_settings.id;
alter table public.store_settings alter column id set default nextval('public.store_settings_id_seq');
alter table public.store_settings add constraint store_settings_store_key unique (store_id);

-- ---------------------------------------------------------------------------
-- Order numbers per store.
-- ---------------------------------------------------------------------------
alter table public.orders alter column order_number drop default;
drop sequence public.order_number_seq;

create function public.orders_number() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.order_number is null then
    update public.stores set order_counter = order_counter + 1 where id = new.store_id
    returning order_prefix || order_counter into new.order_number;
  end if;
  return new;
end $$;
create trigger orders_number before insert on public.orders
  for each row execute function public.orders_number();

-- ---------------------------------------------------------------------------
-- Staff work per store. Owners of the existing store run the platform too.
-- ---------------------------------------------------------------------------
insert into public.platform_admins (user_id) select user_id from public.user_roles where role = 'owner';

-- Everyone with a profile so far is a customer of the home store.
insert into public.store_customers (store_id, user_id, created_at)
select public.home_store_id(), p.id, p.created_at from public.profiles p
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Roles are per store. Platform admins count as an owner in every store.
-- ---------------------------------------------------------------------------
create or replace function public.has_role(p_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.store_id = public.current_store_id() and r.role = any (p_roles)
  ) or public.is_platform_admin()
$$;

create or replace function public.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select role from public.user_roles where user_id = (select auth.uid()) and store_id = public.current_store_id()),
    case when public.is_platform_admin() then 'owner'::public.app_role end
  )
$$;

-- ---------------------------------------------------------------------------
-- Row-level security: what each policy allowed before, within the current store.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Catalog: published rows to everyone, everything to the store's staff.
create policy brands_public_read on public.brands for select to anon, authenticated
  using (store_id = (select public.current_store_id()) and (is_published or (select public.is_staff())));
create policy brands_staff_write on public.brands for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy categories_public_read on public.categories for select to anon, authenticated
  using (store_id = (select public.current_store_id()) and (is_published or (select public.is_staff())));
create policy categories_staff_write on public.categories for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy collections_public_read on public.collections for select to anon, authenticated
  using (store_id = (select public.current_store_id())
         and ((is_published and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
              or (select public.is_staff())));
create policy collections_staff_write on public.collections for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy collection_products_public_read on public.collection_products for select to anon, authenticated
  using (store_id = (select public.current_store_id()) and (public.product_visible(product_id) or (select public.is_staff())));
create policy collection_products_staff_write on public.collection_products for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy size_guides_public_read on public.size_guides for select to anon, authenticated
  using (store_id = (select public.current_store_id()));
create policy size_guides_staff_write on public.size_guides for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy products_public_read on public.products for select to anon, authenticated
  using (store_id = (select public.current_store_id())
         and ((status = 'active' and published_at <= now()) or (select public.is_staff())));
create policy products_staff_write on public.products for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy product_variants_public_read on public.product_variants for select to anon, authenticated
  using (store_id = (select public.current_store_id()) and (public.product_visible(product_id) or (select public.is_staff())));
create policy product_variants_staff_write on public.product_variants for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy product_images_public_read on public.product_images for select to anon, authenticated
  using (store_id = (select public.current_store_id()) and (public.product_visible(product_id) or (select public.is_staff())));
create policy product_images_staff_write on public.product_images for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy product_reviews_public_read on public.product_reviews for select to anon, authenticated
  using (store_id = (select public.current_store_id())
         and (status = 'published' or user_id = (select auth.uid()) or (select public.is_staff())));
create policy product_reviews_staff_update on public.product_reviews for update to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy product_reviews_staff_delete on public.product_reviews for delete to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy inventory_movements_staff_read on public.inventory_movements for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy stock_alerts_staff_read on public.stock_alerts for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));

-- Discounts and shipping: staff read, admins change.
create policy coupons_staff_read on public.coupons for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy coupons_admin_write on public.coupons for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_admin()))
  with check (store_id = (select public.current_store_id()) and (select public.is_admin()));
create policy coupon_redemptions_staff_read on public.coupon_redemptions for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy shipping_zones_read on public.shipping_zones for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy shipping_zones_admin_write on public.shipping_zones for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_admin()))
  with check (store_id = (select public.current_store_id()) and (select public.is_admin()));
create policy shipping_rates_read on public.shipping_rates for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy shipping_rates_admin_write on public.shipping_rates for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_admin()))
  with check (store_id = (select public.current_store_id()) and (select public.is_admin()));
create policy postal_code_rules_read on public.postal_code_rules for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy postal_code_rules_admin_write on public.postal_code_rules for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_admin()))
  with check (store_id = (select public.current_store_id()) and (select public.is_admin()));
create policy shipping_providers_read on public.shipping_providers for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy shipping_providers_admin_write on public.shipping_providers for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_admin()))
  with check (store_id = (select public.current_store_id()) and (select public.is_admin()));

-- Customers: their own addresses, wishlist and orders in this store. Staff read the store's.
create policy customer_addresses_own on public.customer_addresses for all to authenticated
  using (store_id = (select public.current_store_id()) and user_id = (select auth.uid()))
  with check (store_id = (select public.current_store_id()) and user_id = (select auth.uid()));
create policy customer_addresses_staff_read on public.customer_addresses for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));

create policy wishlists_own on public.wishlists for all to authenticated
  using (store_id = (select public.current_store_id()) and user_id = (select auth.uid()))
  with check (store_id = (select public.current_store_id()) and user_id = (select auth.uid()));
create policy wishlist_items_own on public.wishlist_items for all to authenticated
  using (store_id = (select public.current_store_id())
         and exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())))
  with check (store_id = (select public.current_store_id())
              and exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())));

create policy orders_read on public.orders for select to authenticated
  using (store_id = (select public.current_store_id()) and (user_id = (select auth.uid()) or (select public.is_staff())));
create policy order_items_read on public.order_items for select to authenticated
  using (store_id = (select public.current_store_id())
         and ((select public.is_staff())
              or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))));
create policy order_events_read on public.order_events for select to authenticated
  using (store_id = (select public.current_store_id())
         and ((select public.is_staff())
              or (not is_internal and exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())))));
create policy shipments_read on public.shipments for select to authenticated
  using (store_id = (select public.current_store_id())
         and ((select public.is_staff())
              or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))));
create policy refunds_read on public.refunds for select to authenticated
  using (store_id = (select public.current_store_id())
         and ((select public.is_admin())
              or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))));
create policy return_requests_read on public.return_requests for select to authenticated
  using (store_id = (select public.current_store_id())
         and (user_id = (select auth.uid()) or (select public.is_staff())
              or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))));
create policy return_request_items_read on public.return_request_items for select to authenticated
  using (store_id = (select public.current_store_id())
         and ((select public.is_staff())
              or exists (select 1 from public.return_requests r join public.orders o on o.id = r.order_id
                         where r.id = return_request_id and o.user_id = (select auth.uid()))));

create policy payments_admin_read on public.payments for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_admin()));
create policy payment_events_admin_read on public.payment_events for select to authenticated
  using ((store_id = (select public.current_store_id()) and (select public.is_admin()))
         or (store_id is null and (select public.is_platform_admin())));

-- Staff tools.
create policy customer_notes_staff on public.customer_notes for all to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()) and author_id = (select auth.uid()));
create policy contact_messages_staff on public.contact_messages for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy contact_messages_staff_update on public.contact_messages for update to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()))
  with check (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy newsletter_admin_read on public.newsletter_subscribers for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_admin()));
create policy email_outbox_admin_read on public.email_outbox for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_admin()));
create policy email_suppressions_staff_read on public.email_suppressions for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy whatsapp_outbox_staff_read on public.whatsapp_outbox for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy cod_blocklist_staff_read on public.cod_blocklist for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy courier_events_staff_read on public.courier_events for select to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_staff()));
create policy audit_logs_admin_read on public.audit_logs for select to authenticated
  using ((store_id = (select public.current_store_id()) and (select public.is_admin()))
         or (store_id is null and (select public.is_platform_admin())));

-- Settings: everyone reads the store's (nothing secret lives there), admins change them.
create policy store_settings_read on public.store_settings for select to anon, authenticated
  using (store_id = (select public.current_store_id()));
create policy store_settings_admin_update on public.store_settings for update to authenticated
  using (store_id = (select public.current_store_id()) and (select public.is_admin()))
  with check (store_id = (select public.current_store_id()) and (select public.is_admin()));

-- Roles: your own memberships in any store (for the store switcher), and the current
-- store's staff list for its admins. Changes go through grant_role() and revoke_role().
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (store_id = (select public.current_store_id()) and (select public.is_admin())));

-- Profiles are shared by every store: a person reads their own; staff read their store's
-- customers and staff.
create policy profiles_own_read on public.profiles for select to authenticated
  using (id = (select auth.uid())
         or ((select public.is_staff())
             and (exists (select 1 from public.store_customers c where c.user_id = profiles.id and c.store_id = (select public.current_store_id()))
                  or exists (select 1 from public.user_roles r where r.user_id = profiles.id and r.store_id = (select public.current_store_id())))));
create policy profiles_own_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- The platform: store names and web addresses are public (the app looks up the store for
-- each request with them); changes go through platform_* functions.
alter table public.stores enable row level security;
alter table public.store_domains enable row level security;
alter table public.platform_admins enable row level security;
alter table public.store_customers enable row level security;
create policy stores_read on public.stores for select to anon, authenticated using (true);
create policy store_domains_read on public.store_domains for select to anon, authenticated using (true);
create policy platform_admins_read on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_platform_admin()));
create policy store_customers_read on public.store_customers for select to authenticated
  using (user_id = (select auth.uid()) or (store_id = (select public.current_store_id()) and (select public.is_staff())));
revoke all on public.stores, public.store_domains, public.platform_admins, public.store_customers from anon, authenticated;
grant select (id, slug, name, status, is_home) on public.stores to anon, authenticated;
grant select on public.store_domains to anon, authenticated;
grant select on public.platform_admins, public.store_customers to authenticated;

grant execute on function public.home_store_id(), public.request_store_id(), public.current_store_id(),
  public.is_platform_admin() to anon, authenticated, service_role;
-- Orders show browser roles only some columns (column grants); the store is one of them.
grant select (store_id) on public.orders to authenticated;

-- ---------------------------------------------------------------------------
-- Catalog images: each store's files live under a folder named by its store id. Files
-- uploaded before multi-store (no store folder) belong to the home store.
-- ---------------------------------------------------------------------------
create function public.can_manage_media(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_platform_admin() or exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid())
      and r.store_id = case
        when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then split_part(p_name, '/', 1)::uuid
        else public.home_store_id()
      end
  )
$$;
revoke execute on function public.can_manage_media(text) from public, anon;
grant execute on function public.can_manage_media(text) to authenticated, service_role;

drop policy catalog_staff_read on storage.objects;
drop policy catalog_staff_insert on storage.objects;
drop policy catalog_staff_update on storage.objects;
drop policy catalog_staff_delete on storage.objects;
create policy catalog_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'catalog' and public.can_manage_media(name));
create policy catalog_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and public.can_manage_media(name));
create policy catalog_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and public.can_manage_media(name))
  with check (bucket_id = 'catalog' and public.can_manage_media(name));
create policy catalog_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and public.can_manage_media(name));

-- ---------------------------------------------------------------------------
-- Functions. RLS already scopes the SECURITY INVOKER ones; these are the ones that
-- bypass it (or read settings), now limited to the request's store. Internal helpers
-- that scheduled jobs and webhooks also call (cancel_order_internal and the like) work
-- on whatever row they're given; their callers check the store.
-- ---------------------------------------------------------------------------

-- An order of the request's store, locked for update; not found otherwise.
create function public.store_order(p_order_id uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id and store_id = public.current_store_id() for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  return o;
end $$;
revoke execute on function public.store_order(uuid) from public, anon, authenticated;
grant execute on function public.store_order(uuid) to service_role;

-- Audit entries belong to the store they happened in.
drop function public.write_audit(text, text, text, jsonb);
create function public.write_audit(p_action text, p_entity_type text, p_entity_id text, p_changes jsonb, p_store_id uuid default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
begin
  insert into public.audit_logs (store_id, actor_id, actor_email, action, entity_type, entity_id, changes)
  values (coalesce(p_store_id, public.current_store_id()), v_actor, (select u.email from auth.users u where u.id = v_actor),
          p_action, p_entity_type, p_entity_id, coalesce(p_changes, '{}'));
end $$;
revoke execute on function public.write_audit(text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.write_audit(text, text, text, jsonb, uuid) to service_role;

create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ignore text[] := coalesce(tg_argv::text[], '{}');
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb := '{}';
  v_key text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new) - v_ignore;
    v_diff := v_new;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old) - v_ignore;
    v_diff := v_old;
  else
    v_old := to_jsonb(old) - v_ignore;
    v_new := to_jsonb(new) - v_ignore;
    for v_key in select jsonb_object_keys(v_new) loop
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_diff := v_diff || jsonb_build_object(v_key, jsonb_build_array(v_old -> v_key, v_new -> v_key));
      end if;
    end loop;
    if v_diff = '{}'::jsonb then
      return null;
    end if;
  end if;
  perform public.write_audit(
    lower(tg_op),
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'user_id', v_old ->> 'user_id', v_new ->> 'postal_code', v_old ->> 'postal_code'),
    v_diff - 'store_id',
    coalesce(v_new ->> 'store_id', v_old ->> 'store_id')::uuid
  );
  return null;
end $$;

create or replace function public.log_admin_action(p_action text, p_entity_type text, p_entity_id text default null, p_details jsonb default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.write_audit(left(p_action, 80), left(p_entity_type, 80), left(p_entity_id, 120), p_details);
end $$;

-- ---------------------------------------------------------------------------
-- Staff
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_owner(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if exists (select 1 from public.user_roles where role = 'owner' and store_id = public.home_store_id()) then
    raise exception 'owner_exists' using errcode = 'P0001', hint = 'An owner already exists. Owners can add staff from Admin > Staff.';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'no_such_user' using errcode = 'P0001', hint = 'Sign up on the store with this email first, then run this again.';
  end if;
  insert into public.user_roles (store_id, user_id, role) values (public.home_store_id(), v_user, 'owner')
  on conflict (store_id, user_id) do update set role = 'owner';
  insert into public.platform_admins (user_id) values (v_user) on conflict do nothing;
  return v_user;
end $$;

create or replace function public.grant_role(p_email text, p_role public.app_role) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid := public.current_store_id();
  v_user uuid;
  v_old public.app_role;
begin
  if not public.is_owner() then
    raise exception 'forbidden' using errcode = '42501', hint = 'Only owners can manage staff.';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'no_such_user' using errcode = 'P0001', hint = 'No account uses that email. Ask them to sign up first.';
  end if;
  select role into v_old from public.user_roles where user_id = v_user and store_id = v_store;
  if v_old = 'owner' and p_role <> 'owner'
     and (select count(*) from public.user_roles where role = 'owner' and store_id = v_store) <= 1 then
    raise exception 'last_owner' using errcode = 'P0001', hint = 'The store must keep at least one owner.';
  end if;
  insert into public.user_roles (store_id, user_id, role, granted_by)
  values (v_store, v_user, p_role, (select auth.uid()))
  on conflict (store_id, user_id) do update set role = excluded.role, granted_by = excluded.granted_by;
  return v_user;
end $$;

create or replace function public.revoke_role(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid := public.current_store_id();
  v_old public.app_role;
begin
  if not public.is_owner() then
    raise exception 'forbidden' using errcode = '42501', hint = 'Only owners can manage staff.';
  end if;
  select role into v_old from public.user_roles where user_id = p_user_id and store_id = v_store;
  if v_old = 'owner' and (select count(*) from public.user_roles where role = 'owner' and store_id = v_store) <= 1 then
    raise exception 'last_owner' using errcode = 'P0001', hint = 'The store must keep at least one owner.';
  end if;
  delete from public.user_roles where user_id = p_user_id and store_id = v_store;
end $$;

create or replace function public.admin_staff()
returns table (user_id uuid, email text, full_name text, role public.app_role, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.user_id, u.email, coalesce(p.full_name, ''), r.role, r.created_at
  from public.user_roles r
  join auth.users u on u.id = r.user_id
  left join public.profiles p on p.id = r.user_id
  where public.is_admin() and r.store_id = public.current_store_id()
  order by r.role, u.email
$$;

-- ---------------------------------------------------------------------------
-- Admin: orders
-- ---------------------------------------------------------------------------
create or replace function public.admin_add_order_note(p_order_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff();
  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'empty_note' using errcode = '22023';
  end if;
  perform public.store_order(p_order_id);
  perform public.add_order_event(p_order_id, 'note', left(btrim(p_note), 2000), '{}', true, 'staff');
end $$;

create or replace function public.admin_begin_refund(p_order_id uuid, p_amount bigint, p_reason text, p_return_request_id uuid default null, p_reference text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  perform public.store_order(p_order_id);
  return public.begin_refund_internal(p_order_id, null, p_amount, p_reason, p_return_request_id, p_reference, (select auth.uid()));
end $$;

create or replace function public.admin_cancel_courier_booking(p_order_id uuid, p_shipment_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ship public.shipments;
begin
  perform public.require_staff();
  perform public.store_order(p_order_id);
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

create or replace function public.admin_cancel_order(p_order_id uuid, p_reason text, p_restock boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_refundable bigint;
begin
  perform public.require_staff();
  o := public.store_order(p_order_id);
  if o.payment_status in ('paid', 'partially_refunded') and o.grand_total > 0 and not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501', hint = 'Only admins can cancel paid orders, because they need a refund.';
  end if;
  o := public.cancel_order_internal(o.id, 'staff', 'Cancelled by the store' || coalesce(': ' || nullif(btrim(p_reason), ''), '.'),
                                    'staff', (select auth.uid()), coalesce(p_restock, true));
  update public.return_requests set status = 'approved', resolved_at = now()
  where order_id = o.id and kind = 'cancellation' and status = 'requested';
  v_refundable := (select coalesce(sum(amount - amount_refunded), 0) from public.payments
                   where order_id = o.id and status in ('captured', 'partially_refunded'))
                  - (select coalesce(sum(amount), 0) from public.refunds where order_id = o.id and status = 'pending');
  return public.order_brief(o) || jsonb_build_object('refundable', greatest(v_refundable, 0));
end $$;

create or replace function public.admin_confirm_cod(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff();
  return public.confirm_cod_order(p_order_id, 'staff', (select auth.uid()));
end $$;

create or replace function public.admin_mark_cod_paid(p_order_id uuid, p_reference text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  perform public.require_admin();
  o := public.store_order(p_order_id);
  if o.payment_method <> 'cod' or o.payment_status <> 'unpaid' or o.status = 'cancelled' then
    raise exception 'not_cod_unpaid' using errcode = 'P0001', hint = 'Only open, unpaid cash-on-delivery orders can be marked as collected.';
  end if;
  insert into public.payments (order_id, provider, provider_payment_id, amount, currency, status, method, captured_at, details)
  values (o.id, 'cod', 'cod_' || o.order_number, o.grand_total, o.currency, 'captured', 'cod', now(),
          jsonb_build_object('reference', left(btrim(coalesce(p_reference, '')), 120), 'recorded_by', (select auth.uid())));
  update public.orders set payment_status = 'paid', paid_at = now() where id = o.id returning * into o;
  perform public.add_order_event(o.id, 'payment_captured',
    format('Cash on delivery of %s collected.', public.format_money(o.grand_total, o.currency)),
    jsonb_build_object('reference', p_reference), false, 'staff');
  return public.order_brief(o);
end $$;

create or replace function public.admin_mark_rto(p_order_id uuid, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff();
  perform public.store_order(p_order_id);
  return public.order_brief(public.mark_rto_internal(p_order_id, p_note, 'staff', (select auth.uid())));
end $$;

create or replace function public.admin_order_cod_status(p_order_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  o public.orders;
begin
  perform public.require_staff();
  select * into o from public.orders where id = p_order_id and store_id = public.current_store_id();
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'blocked', exists (select 1 from public.cod_blocklist b
                       where b.store_id = o.store_id
                         and ((b.kind = 'email' and b.value = lower(o.email)) or (b.kind = 'phone' and b.value = public.phone_key(o.phone)))),
    'returned', (select count(*) from public.customer_cod_orders(o.user_id, o.email, o.phone) x where x.cancel_reason = 'returned_to_origin'),
    'open', (select count(*) from public.customer_cod_orders(o.user_id, o.email, o.phone) x
             where x.status = 'confirmed' and x.fulfillment_status in ('unfulfilled', 'processing', 'packed')),
    'block_reason', public.cod_block_reason(o.user_id, o.email, o.phone)
  );
end $$;

create or replace function public.admin_record_courier_booking(p_order_id uuid, p_booking jsonb) returns jsonb
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
  o := public.store_order(p_order_id);
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

create or replace function public.admin_set_cod_block(p_order_id uuid, p_blocked boolean, p_reason text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_email text;
  v_phone text;
begin
  perform public.require_staff();
  select * into o from public.orders where id = p_order_id and store_id = public.current_store_id();
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  v_email := lower(o.email);
  v_phone := public.phone_key(o.phone);
  if p_blocked then
    insert into public.cod_blocklist (store_id, kind, value, reason, order_id, created_by)
    values (o.store_id, 'email', v_email, left(coalesce(p_reason, ''), 300), o.id, (select auth.uid()))
    on conflict (store_id, kind, value) do nothing;
    if v_phone is not null then
      insert into public.cod_blocklist (store_id, kind, value, reason, order_id, created_by)
      values (o.store_id, 'phone', v_phone, left(coalesce(p_reason, ''), 300), o.id, (select auth.uid()))
      on conflict (store_id, kind, value) do nothing;
    end if;
  else
    delete from public.cod_blocklist
    where store_id = o.store_id and ((kind = 'email' and value = v_email) or (kind = 'phone' and value = v_phone));
  end if;
  perform public.add_order_event(o.id, 'note',
    case when p_blocked then 'Cash on delivery blocked for this customer' || coalesce(': ' || nullif(btrim(p_reason), ''), '') || '.'
         else 'Cash on delivery allowed again for this customer.' end,
    '{}', true, 'staff');
  perform public.log_admin_action(case when p_blocked then 'cod.block' else 'cod.unblock' end, 'order', o.order_number,
    jsonb_build_object('email', v_email, 'phone_last4', right(coalesce(v_phone, ''), 4), 'reason', p_reason));
end $$;

create or replace function public.admin_set_fulfillment(p_order_id uuid, p_status public.fulfillment_status, p_carrier text default null,
  p_tracking_number text default null, p_tracking_url text default null, p_note text default null, p_notify boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff();
  perform public.store_order(p_order_id);
  return public.order_brief(public.set_fulfillment_internal(
    p_order_id, p_status, p_carrier, p_tracking_number, p_tracking_url, p_note, p_notify, 'staff', (select auth.uid())));
end $$;

create or replace function public.admin_update_return(p_request_id uuid, p_action text, p_note text default null, p_restock boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.return_requests;
  o public.orders;
  it record;
  v_refundable bigint := 0;
begin
  perform public.require_staff();
  select * into r from public.return_requests where id = p_request_id and store_id = public.current_store_id() for update;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into o from public.orders where id = r.order_id for update;

  if p_action = 'approve' then
    if r.status <> 'requested' then
      raise exception 'invalid_transition' using errcode = 'P0001', hint = 'Only new requests can be approved.';
    end if;
    if r.kind = 'cancellation' then
      if not public.is_admin() then
        raise exception 'forbidden' using errcode = '42501', hint = 'Only admins can approve cancellations of paid orders.';
      end if;
      perform public.cancel_order_internal(o.id, 'customer_request', 'Cancelled at the customer''s request.', 'staff', (select auth.uid()), true);
    end if;
    update public.return_requests set status = 'approved', admin_note = coalesce(nullif(btrim(p_note), ''), admin_note)
    where id = r.id returning * into r;
  elsif p_action = 'reject' then
    if r.status not in ('requested', 'approved') then
      raise exception 'invalid_transition' using errcode = 'P0001', hint = 'This request is already closed.';
    end if;
    update public.return_requests set status = 'rejected', resolved_at = now(),
      admin_note = coalesce(nullif(btrim(p_note), ''), admin_note)
    where id = r.id returning * into r;
  elsif p_action = 'receive' then
    if r.kind <> 'return' or r.status <> 'approved' then
      raise exception 'invalid_transition' using errcode = 'P0001', hint = 'Approve the return before marking items received.';
    end if;
    if coalesce(p_restock, true) then
      perform public.set_stock_context('return', 'Return for order ' || o.order_number, o.id);
    end if;
    for it in
      select ri.quantity, oi.id as order_item_id, oi.variant_id
      from public.return_request_items ri join public.order_items oi on oi.id = ri.order_item_id
      where ri.return_request_id = r.id
    loop
      update public.order_items set quantity_returned = least(quantity_returned + it.quantity, quantity) where id = it.order_item_id;
      if coalesce(p_restock, true) and it.variant_id is not null then
        update public.product_variants set stock_quantity = stock_quantity + it.quantity where id = it.variant_id;
      end if;
    end loop;
    perform public.clear_stock_context();
    if not exists (select 1 from public.order_items where order_id = o.id and quantity_returned < quantity) then
      update public.orders set fulfillment_status = 'returned' where id = o.id;
    end if;
    update public.return_requests set status = 'received', admin_note = coalesce(nullif(btrim(p_note), ''), admin_note)
    where id = r.id returning * into r;
  elsif p_action = 'close' then
    update public.return_requests set status = 'closed', resolved_at = coalesce(resolved_at, now()),
      admin_note = coalesce(nullif(btrim(p_note), ''), admin_note)
    where id = r.id returning * into r;
  else
    raise exception 'invalid_action' using errcode = '22023';
  end if;

  perform public.add_order_event(o.id, r.kind || '_' || r.status,
    format('%s request %s.', initcap(r.kind::text), r.status), jsonb_build_object('return_request_id', r.id), false, 'staff');
  perform public.queue_email(o.email, 'return_update', o.id, jsonb_build_object('return_status', r.status, 'kind', r.kind));

  if r.status in ('approved', 'received') then
    select coalesce(sum(amount - amount_refunded), 0) into v_refundable
    from public.payments where order_id = o.id and status in ('captured', 'partially_refunded');
  end if;
  return jsonb_build_object('id', r.id, 'status', r.status, 'refundable', v_refundable,
    'suggested_refund', case when r.kind = 'return' then (
      select coalesce(sum(round((oi.line_total::numeric / oi.quantity) * ri.quantity)), 0)::bigint
      from public.return_request_items ri join public.order_items oi on oi.id = ri.order_item_id
      where ri.return_request_id = r.id) else v_refundable end);
end $$;

-- ---------------------------------------------------------------------------
-- Admin: customers, dashboard, catalog tools
-- ---------------------------------------------------------------------------
create or replace function public.admin_customers(p_q text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, full_name text, phone text, created_at timestamptz, orders_count bigint,
               lifetime_spend bigint, last_order_at timestamptz, total_count bigint)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.full_name, p.phone, sc.created_at,
    count(o.id) filter (where o.status in ('confirmed', 'completed')),
    coalesce(sum(o.grand_total - o.amount_refunded) filter (where o.payment_status in ('paid', 'partially_refunded', 'refunded')), 0)::bigint,
    max(o.placed_at) filter (where o.status in ('confirmed', 'completed')),
    count(*) over ()
  from public.store_customers sc
  join public.profiles p on p.id = sc.user_id
  left join public.orders o on o.user_id = p.id and o.store_id = sc.store_id
  where sc.store_id = public.current_store_id()
    and public.is_staff()
    and not exists (select 1 from public.user_roles r where r.user_id = p.id and r.store_id = sc.store_id)
    and (coalesce(btrim(p_q), '') = ''
         or lower(p.email) like '%' || lower(btrim(p_q)) || '%'
         or lower(p.full_name) like '%' || lower(btrim(p_q)) || '%'
         or p.phone like '%' || btrim(p_q) || '%'
         or (length(regexp_replace(p_q, '[^0-9]', '', 'g')) >= 4
             and regexp_replace(p.phone, '[^0-9]', '', 'g') like '%' || regexp_replace(regexp_replace(p_q, '[^0-9]', '', 'g'), '^0', '') || '%'))
  group by p.id, sc.created_at
  order by max(o.placed_at) desc nulls last, sc.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

create or replace function public.admin_dashboard(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_store uuid := public.current_store_id();
  s public.store_settings;
  v_tz text;
  v_today date;
  v_month_start date;
  v_days int := least(greatest(coalesce(p_days, 30), 7), 365);
begin
  perform public.require_staff();
  select * into s from public.store_settings where store_id = v_store;
  v_tz := coalesce(s.timezone, 'Asia/Kolkata');
  v_today := (now() at time zone v_tz)::date;
  v_month_start := date_trunc('month', v_today)::date;

  return jsonb_build_object(
    'currency', s.currency,
    'timezone', v_tz,
    'revenue', jsonb_build_object(
      'total', (select coalesce(sum(amount), 0) from public.payments where store_id = v_store and status in ('captured', 'partially_refunded', 'refunded'))
               - (select coalesce(sum(amount), 0) from public.refunds where store_id = v_store and status = 'processed'),
      'today', (select coalesce(sum(amount), 0) from public.payments
                where store_id = v_store and status in ('captured', 'partially_refunded', 'refunded') and (captured_at at time zone v_tz)::date = v_today)
               - (select coalesce(sum(amount), 0) from public.refunds
                  where store_id = v_store and status = 'processed' and (processed_at at time zone v_tz)::date = v_today),
      'month', (select coalesce(sum(amount), 0) from public.payments
                where store_id = v_store and status in ('captured', 'partially_refunded', 'refunded') and (captured_at at time zone v_tz)::date >= v_month_start)
               - (select coalesce(sum(amount), 0) from public.refunds
                  where store_id = v_store and status = 'processed' and (processed_at at time zone v_tz)::date >= v_month_start),
      'refunded_total', (select coalesce(sum(amount), 0) from public.refunds where store_id = v_store and status = 'processed'),
      'cod_outstanding', (select coalesce(sum(grand_total), 0) from public.orders
                          where store_id = v_store and payment_method = 'cod' and payment_status = 'unpaid' and status in ('confirmed', 'completed'))
    ),
    'orders', jsonb_build_object(
      'total', (select count(*) from public.orders where store_id = v_store and (status in ('confirmed', 'completed')
                 or (status = 'cancelled' and cancel_reason not in ('payment_timeout', 'superseded')))),
      'today', (select count(*) from public.orders where store_id = v_store and status in ('confirmed', 'completed', 'cancelled')
                 and coalesce(cancel_reason, '') not in ('payment_timeout', 'superseded')
                 and (placed_at at time zone v_tz)::date = v_today),
      'awaiting_payment', (select count(*) from public.orders where store_id = v_store and status = 'pending_payment'),
      'to_fulfil', (select count(*) from public.orders where store_id = v_store and status = 'confirmed' and fulfillment_status = 'unfulfilled'),
      'awaiting_shipment', (select count(*) from public.orders where store_id = v_store and status = 'confirmed' and fulfillment_status in ('processing', 'packed')),
      'in_transit', (select count(*) from public.orders where store_id = v_store and status = 'confirmed' and fulfillment_status = 'shipped'),
      'completed', (select count(*) from public.orders where store_id = v_store and status = 'completed'),
      'cancelled', (select count(*) from public.orders where store_id = v_store and status = 'cancelled' and cancel_reason not in ('payment_timeout', 'superseded')),
      'needs_attention', (select count(*) from public.orders where store_id = v_store and needs_attention),
      'open_requests', (select count(*) from public.return_requests where store_id = v_store and status in ('requested', 'approved'))
    ),
    'customers', jsonb_build_object(
      'registered', (select count(*) from public.store_customers c where c.store_id = v_store
                      and not exists (select 1 from public.user_roles r where r.user_id = c.user_id and r.store_id = v_store)),
      'buyers', (select count(distinct lower(email)) from public.orders where store_id = v_store and status in ('confirmed', 'completed')),
      'new_this_month', (select count(*) from public.store_customers c where c.store_id = v_store
                          and (c.created_at at time zone v_tz)::date >= v_month_start
                          and not exists (select 1 from public.user_roles r where r.user_id = c.user_id and r.store_id = v_store))
    ),
    'inventory', jsonb_build_object(
      'low_stock', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id
                    where p.store_id = v_store and v.is_active and p.status <> 'archived'
                      and v.stock_quantity - v.reserved_quantity > 0
                      and v.stock_quantity - v.reserved_quantity <= coalesce(v.low_stock_threshold, s.low_stock_threshold)),
      'out_of_stock', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id
                       where p.store_id = v_store and v.is_active and p.status = 'active' and v.stock_quantity - v.reserved_quantity <= 0),
      'items', coalesce((
        select jsonb_agg(x order by x ->> 'available', x ->> 'title')
        from (
          select jsonb_build_object('variant_id', v.id, 'product_id', p.id, 'title', p.title, 'sku', v.sku,
                                    'variant', concat_ws(' / ', nullif(v.size, ''), nullif(v.color, '')),
                                    'available', v.stock_quantity - v.reserved_quantity,
                                    'threshold', coalesce(v.low_stock_threshold, s.low_stock_threshold)) as x
          from public.product_variants v join public.products p on p.id = v.product_id
          where p.store_id = v_store and v.is_active and p.status = 'active'
            and v.stock_quantity - v.reserved_quantity <= coalesce(v.low_stock_threshold, s.low_stock_threshold)
          order by v.stock_quantity - v.reserved_quantity, p.title
          limit 8
        ) q
      ), '[]')
    ),
    'best_sellers', coalesce((
      select jsonb_agg(x order by (x ->> 'units')::int desc)
      from (
        select jsonb_build_object('product_id', i.product_id, 'title', max(i.product_title), 'units', sum(i.quantity),
                                  'revenue', sum(i.line_total), 'image_url', max(i.image_url)) as x
        from public.order_items i join public.orders o on o.id = i.order_id
        where o.store_id = v_store and o.status in ('confirmed', 'completed') and o.placed_at >= now() - make_interval(days => v_days)
        group by i.product_id
        order by sum(i.quantity) desc
        limit 5
      ) q
    ), '[]'),
    'trend', (
      select jsonb_agg(jsonb_build_object('date', d::date, 'revenue',
        coalesce((select sum(amount) from public.payments
                  where store_id = v_store and status in ('captured', 'partially_refunded', 'refunded') and (captured_at at time zone v_tz)::date = d::date), 0)
        - coalesce((select sum(amount) from public.refunds where store_id = v_store and status = 'processed' and (processed_at at time zone v_tz)::date = d::date), 0),
        'orders', (select count(*) from public.orders o where o.store_id = v_store and o.status in ('confirmed', 'completed', 'cancelled')
                   and coalesce(o.cancel_reason, '') not in ('payment_timeout', 'superseded')
                   and (o.placed_at at time zone v_tz)::date = d::date)
      ) order by d)
      from generate_series(v_today - (v_days - 1), v_today, interval '1 day') d
    ),
    'recent_orders', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'order_number', o.order_number, 'customer_name', o.customer_name,
        'email', o.email, 'grand_total', o.grand_total, 'currency', o.currency, 'status', o.status,
        'payment_status', o.payment_status, 'fulfillment_status', o.fulfillment_status, 'placed_at', o.placed_at)
        order by o.placed_at desc)
      from (select * from public.orders where store_id = v_store order by placed_at desc limit 8) o
    ), '[]')
  );
end $$;

create or replace function public.admin_delete_sample_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid := public.current_store_id();
  v_products jsonb;
  v_other int := 0;
  v_n int;
begin
  perform public.require_admin();
  select public.admin_delete_products(coalesce(array_agg(id), '{}')) into v_products
  from public.products where is_sample and store_id = v_store;
  delete from public.collections where is_sample and store_id = v_store;
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  delete from public.coupons c where c.is_sample and c.store_id = v_store
    and not exists (select 1 from public.coupon_redemptions r where r.coupon_id = c.id);
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  update public.coupons set is_active = false where is_sample and store_id = v_store;
  delete from public.brands b where b.is_sample and b.store_id = v_store
    and not exists (select 1 from public.products p where p.brand_id = b.id);
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  -- Children before parents.
  delete from public.categories c where c.is_sample and c.store_id = v_store and c.parent_id is not null
    and not exists (select 1 from public.products p where p.category_id = c.id)
    and not exists (select 1 from public.categories k where k.parent_id = c.id);
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  delete from public.categories c where c.is_sample and c.store_id = v_store
    and not exists (select 1 from public.products p where p.category_id = c.id)
    and not exists (select 1 from public.categories k where k.parent_id = c.id);
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  delete from public.size_guides g where g.is_sample and g.store_id = v_store
    and not exists (select 1 from public.products p where p.size_guide_id = g.id)
    and not exists (select 1 from public.categories c where c.size_guide_id = g.id);
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  delete from public.shipping_zones where is_sample and store_id = v_store;
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  update public.store_settings set homepage = jsonb_set(homepage, '{hero}', '[]') ||
    jsonb_build_object('promos', '[]'::jsonb)
  where store_id = v_store and homepage::text like '%sample%';
  perform public.write_audit('sample_data.delete', 'store', null, v_products || jsonb_build_object('other_rows', v_other));
  return v_products || jsonb_build_object('other_rows', v_other);
end $$;

create or replace function public.admin_inventory_list(p jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_q text := nullif(lower(btrim(coalesce(p ->> 'q', ''))), '');
  v_stock text := coalesce(nullif(p ->> 'stock', ''), 'all');
  v_brand uuid := nullif(p ->> 'brand', '')::uuid;
  v_category uuid := nullif(p ->> 'category', '')::uuid;
  v_status text := nullif(p ->> 'status', '');
  v_sort text := coalesce(nullif(p ->> 'sort', ''), 'available_asc');
  v_limit int := least(greatest(coalesce((p ->> 'limit')::int, 100), 1), 500);
  v_offset int := greatest(coalesce((p ->> 'offset')::int, 0), 0);
  v_low int;
  v_result jsonb;
begin
  perform public.require_staff();
  select s.low_stock_threshold into v_low from public.store_settings s where s.store_id = public.current_store_id();
  v_low := coalesce(v_low, 5);
  with inv as (
    select v.id, v.sku, v.size, v.color, v.stock_quantity, v.reserved_quantity, v.is_active,
           v.stock_quantity - v.reserved_quantity as available,
           coalesce(v.low_stock_threshold, v_low) as threshold, v.low_stock_threshold, v.updated_at,
           pr.id as product_id, pr.title, pr.slug, pr.status, pr.size_guide_id,
           (select i.url from public.product_images i where i.product_id = pr.id
            order by (i.color is not distinct from nullif(v.color, '')) desc, i.position limit 1) as image
    from public.product_variants v
    join public.products pr on pr.id = v.product_id
    where (v_q is null or lower(v.sku) like '%' || v_q || '%' or pr.search_text like '%' || v_q || '%')
      and (v_brand is null or pr.brand_id = v_brand)
      and (v_category is null or pr.category_id in (select public.category_subtree(v_category)))
      and (v_status is null or pr.status::text = v_status)
  ), filtered as (
    select * from inv
    where v_stock = 'all'
       or (v_stock = 'out' and available <= 0)
       or (v_stock = 'low' and available > 0 and available <= threshold)
       or (v_stock = 'in' and available > threshold)
       or (v_stock = 'reserved' and reserved_quantity > 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'summary', jsonb_build_object(
      'variants', (select count(*) from inv),
      'out', (select count(*) from inv where available <= 0 and is_active),
      'low', (select count(*) from inv where available > 0 and available <= threshold and is_active),
      'reserved', (select coalesce(sum(reserved_quantity), 0) from inv),
      'units', (select coalesce(sum(stock_quantity), 0) from inv)
    ),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(f) - 'size_guide_id' order by f.ord)
      from (
        select filtered.*, row_number() over (order by
                 case when v_sort = 'available_asc' then available end asc,
                 case when v_sort = 'available_desc' then available end desc,
                 case when v_sort = 'sku' then lower(sku) end asc,
                 case when v_sort = 'product' then lower(title) end asc,
                 case when v_sort = 'updated' then updated_at end desc,
                 lower(title), lower(sku)) as ord
        from filtered
        order by ord
        limit v_limit offset v_offset
      ) f
    ), '[]')
  ) into v_result;
  return v_result;
end $$;

create or replace function public.admin_product_list(p jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_q text := nullif(lower(btrim(coalesce(p ->> 'q', ''))), '');
  v_status text := coalesce(nullif(p ->> 'status', ''), 'all');
  v_brand uuid := nullif(p ->> 'brand', '')::uuid;
  v_category uuid := nullif(p ->> 'category', '')::uuid;
  v_stock text := nullif(p ->> 'stock', '');
  v_sort text := coalesce(nullif(p ->> 'sort', ''), 'updated');
  v_limit int := least(greatest(coalesce((p ->> 'limit')::int, 50), 1), 200);
  v_offset int := greatest(coalesce((p ->> 'offset')::int, 0), 0);
  v_ids_only boolean := coalesce((p ->> 'ids_only')::boolean, false);
  v_low int;
  v_result jsonb;
begin
  perform public.require_staff();
  select s.low_stock_threshold into v_low from public.store_settings s where s.store_id = public.current_store_id();
  v_low := coalesce(v_low, 5);

  with matched as (
    select pr.*,
           case when pr.status = 'active' and pr.published_at > now() then 'scheduled' else pr.status::text end as state,
           (select count(*) from public.product_variants v
            where v.product_id = pr.id and v.is_active
              and v.stock_quantity - v.reserved_quantity <= coalesce(v.low_stock_threshold, v_low))::int as low_variants
    from public.products pr
    where (v_q is null or pr.search_text like '%' || v_q || '%' or pr.slug like '%' || v_q || '%')
      and (v_brand is null or pr.brand_id = v_brand)
      and (v_category is null or pr.category_id in (select public.category_subtree(v_category)))
      and (v_stock is null or v_stock = 'low'
           or (v_stock = 'out' and pr.available_stock = 0)
           or (v_stock = 'in' and pr.available_stock > 0))
  ), scoped as (
    select * from matched where v_stock is distinct from 'low' or (available_stock > 0 and low_variants > 0)
  ), listed as (
    select * from scoped where v_status = 'all' or state = v_status
  ), page as (
    select l.*, row_number() over (order by
             case when v_sort = 'title' then lower(l.title) end asc,
             case when v_sort = 'price_asc' then coalesce(l.min_price, l.price) end asc,
             case when v_sort = 'price_desc' then coalesce(l.max_price, l.price) end desc,
             case when v_sort = 'stock_asc' then l.available_stock end asc,
             case when v_sort = 'stock_desc' then l.available_stock end desc,
             case when v_sort = 'best_selling' then l.sales_count end desc,
             case when v_sort = 'newest' then l.created_at end desc,
             l.updated_at desc, l.id) as ord
    from listed l
    order by ord
    limit case when v_ids_only then 5000 else v_limit end
    offset case when v_ids_only then 0 else v_offset end
  )
  select case when v_ids_only then (select coalesce(jsonb_agg(pg.id order by pg.ord), '[]') from page pg)
  else jsonb_build_object(
    'counts', jsonb_build_object(
      'all', (select count(*) from scoped),
      'active', (select count(*) from scoped where state = 'active'),
      'draft', (select count(*) from scoped where state = 'draft'),
      'scheduled', (select count(*) from scoped where state = 'scheduled'),
      'archived', (select count(*) from scoped where state = 'archived')
    ),
    'total', (select count(*) from listed),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', pg.id, 'title', pg.title, 'slug', pg.slug, 'status', pg.status, 'state', pg.state,
               'published_at', pg.published_at, 'price', pg.price, 'compare_at_price', pg.compare_at_price,
               'min_price', pg.min_price, 'max_price', pg.max_price, 'on_sale', pg.on_sale,
               'available_stock', pg.available_stock, 'low_variants', pg.low_variants,
               'is_featured', pg.is_featured, 'is_sample', pg.is_sample, 'sales_count', pg.sales_count,
               'updated_at', pg.updated_at, 'created_at', pg.created_at, 'tags', pg.tags,
               'brand', (select b.name from public.brands b where b.id = pg.brand_id),
               'category', (select c.name from public.categories c where c.id = pg.category_id),
               'variant_count', (select count(*) from public.product_variants v where v.product_id = pg.id),
               'image', (select i.url from public.product_images i where i.product_id = pg.id order by i.position limit 1)
             ) order by pg.ord)
      from page pg
    ), '[]')
  ) end
  into v_result;
  return v_result;
end $$;

-- Each store's images: those under its store folder, plus the files from before
-- multi-store for the home store.
create or replace function public.admin_media_list(p_q text, p_filter text, p_limit int, p_offset int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_store uuid := public.current_store_id();
  v_home boolean := v_store = public.home_store_id();
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_filter text := coalesce(nullif(p_filter, ''), 'all');
  v_limit int := least(greatest(coalesce(p_limit, 60), 1), 200);
  v_offset int := greatest(coalesce(p_offset, 0), 0);
  v_result jsonb;
begin
  perform public.require_staff();
  with files as (
    select o.name as path, o.created_at, coalesce((o.metadata ->> 'size')::bigint, 0) as size,
           o.metadata ->> 'mimetype' as mimetype, public.media_in_use(o.name) as used
    from storage.objects o
    where o.bucket_id = 'catalog'
      and (split_part(o.name, '/', 1) = v_store::text
           or (v_home and split_part(o.name, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
      and (v_q is null or o.name ilike '%' || replace(replace(v_q, '%', '\%'), '_', '\_') || '%')
  ), filtered as (
    select * from files
    where v_filter = 'all' or (v_filter = 'used' and used) or (v_filter = 'unused' and not used)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'unused', (select count(*) from files where not used),
    'rows', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.created_at desc, f.path)
      from (select * from filtered order by created_at desc, path limit v_limit offset v_offset) f
    ), '[]')
  ) into v_result;
  return v_result;
end $$;

create or replace function public.admin_media_lookup(p_names text[]) returns table (name text, path text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_store uuid := public.current_store_id();
  v_home boolean := v_store = public.home_store_id();
begin
  perform public.require_staff();
  return query
  select n, (
    select o.name from storage.objects o
    where o.bucket_id = 'catalog'
      and (split_part(o.name, '/', 1) = v_store::text
           or (v_home and split_part(o.name, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
      and o.name ~ ('(^|/)' || n || '-[0-9a-f]{8}\.[a-z0-9]+$')
    order by (o.name like '%library/%') desc, o.created_at desc
    limit 1
  )
  from unnest(coalesce(p_names, '{}')) n
  where n ~ '^[a-z0-9]+(-[a-z0-9]+)*$';
end $$;

-- ---------------------------------------------------------------------------
-- Storefront: bag and checkout (called by the app's server for the request's store)
-- ---------------------------------------------------------------------------
create or replace function public.cart_find(p_user_id uuid, p_token text, p_create boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid := public.current_store_id();
  v_id uuid;
  v_hash text;
begin
  if p_user_id is not null then
    select id into v_id from public.carts where store_id = v_store and user_id = p_user_id;
    if v_id is null and p_create then
      insert into public.carts (store_id, user_id) values (v_store, p_user_id)
      on conflict (store_id, user_id) do update set updated_at = now()
      returning id into v_id;
      insert into public.store_customers (store_id, user_id) values (v_store, p_user_id) on conflict do nothing;
    end if;
  elsif p_token is not null and char_length(p_token) between 32 and 128 then
    v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
    select id into v_id from public.carts where store_id = v_store and token_hash = v_hash and user_id is null;
    if v_id is null and p_create then
      insert into public.carts (store_id, token_hash) values (v_store, v_hash)
      on conflict (store_id, token_hash) do update set updated_at = now()
      returning id into v_id;
    end if;
  end if;
  return v_id;
end $$;

create or replace function public.cart_get(p_user_id uuid, p_token text, p_address jsonb default null, p_rate_id uuid default null,
  p_payment_method text default null, p_email text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cart uuid := public.cart_find(p_user_id, p_token, false);
  v_email text := p_email;
begin
  if v_cart is null then
    return jsonb_build_object('cart_id', null, 'lines', '[]'::jsonb, 'item_count', 0, 'line_count', 0,
      'subtotal', 0, 'discount_total', 0, 'shipping_total', null, 'cod_fee', 0, 'tax_total', 0, 'grand_total', 0,
      'currency', (select currency from public.store_settings where store_id = public.current_store_id()),
      'issues', '[]'::jsonb, 'can_checkout', false);
  end if;
  if v_email is null and p_user_id is not null then
    select email into v_email from auth.users where id = p_user_id;
  end if;
  return public.quote_cart(v_cart, p_user_id, v_email, p_address, p_rate_id, p_payment_method, null);
end $$;

create or replace function public.cart_merge(p_user_id uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_guest public.carts;
  v_user_cart uuid;
begin
  if p_user_id is null or p_token is null or char_length(p_token) < 32 then
    return public.cart_get(p_user_id, null);
  end if;
  select * into v_guest from public.carts
  where store_id = public.current_store_id() and token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and user_id is null
  for update;
  if v_guest.id is null then
    return public.cart_get(p_user_id, null);
  end if;
  v_user_cart := public.cart_find(p_user_id, null, true);
  insert into public.cart_items (cart_id, variant_id, quantity)
  select v_user_cart, gi.variant_id, least(gi.quantity, 20)
  from public.cart_items gi where gi.cart_id = v_guest.id
  on conflict (cart_id, variant_id) do update
    set quantity = least(public.cart_items.quantity + excluded.quantity, 20), updated_at = now();
  update public.carts set coupon_code = coalesce(coupon_code, v_guest.coupon_code), updated_at = now() where id = v_user_cart;
  -- Unpaid orders keep pointing at the cart they came from.
  update public.orders set cart_id = v_user_cart where cart_id = v_guest.id;
  delete from public.carts where id = v_guest.id;
  return public.cart_get(p_user_id, null);
end $$;

create or replace function public.cart_restore(p_from_cart uuid, p_user_id uuid, p_token text) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_cart uuid;
  it record;
  v_qty int;
  v_added int := 0;
begin
  if not exists (select 1 from public.carts where id = p_from_cart and store_id = public.current_store_id()) then
    return 0;
  end if;
  v_cart := public.cart_find(p_user_id, p_token, true);
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

create or replace function public.cart_set_item(p_user_id uuid, p_token text, p_variant_id uuid, p_quantity int, p_mode text default 'set')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cart uuid;
  v_current int;
  v_new int;
  v_variant public.product_variants;
  v_available int;
begin
  if p_mode not in ('set', 'add') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  v_cart := public.cart_find(p_user_id, p_token, coalesce(p_quantity, 0) > 0);
  if v_cart is null then
    if coalesce(p_quantity, 0) > 0 then
      raise exception 'no_cart' using errcode = 'P0001', hint = 'Your session has expired. Refresh the page and try again.';
    end if;
    return public.cart_get(p_user_id, p_token);
  end if;
  perform 1 from public.carts where id = v_cart for update;
  select quantity into v_current from public.cart_items where cart_id = v_cart and variant_id = p_variant_id;
  v_new := case when p_mode = 'add' then coalesce(v_current, 0) + coalesce(p_quantity, 0) else coalesce(p_quantity, 0) end;

  if v_new <= 0 then
    delete from public.cart_items where cart_id = v_cart and variant_id = p_variant_id;
  else
    select * into v_variant from public.product_variants where id = p_variant_id and store_id = public.current_store_id();
    if v_variant.id is null or not v_variant.is_active or not public.product_visible(v_variant.product_id) then
      raise exception 'unavailable' using errcode = 'P0001', hint = 'This item is no longer available.';
    end if;
    v_available := v_variant.stock_quantity - v_variant.reserved_quantity;
    if v_new > coalesce(v_current, 0) then
      if v_available <= 0 then
        raise exception 'out_of_stock' using errcode = 'P0001', hint = 'Sorry, this size just sold out.';
      elsif v_new > v_available then
        raise exception 'insufficient_stock' using errcode = 'P0001',
          hint = format('Only %s left in this size%s.', v_available,
                        case when coalesce(v_current, 0) > 0 then format(' and %s already in your bag', v_current) else '' end);
      end if;
    end if;
    if v_new > 20 then
      raise exception 'quantity_limit' using errcode = 'P0001', hint = 'You can buy up to 20 of one item per order.';
    end if;
    if v_current is null and (select count(*) from public.cart_items where cart_id = v_cart) >= 50 then
      raise exception 'cart_full' using errcode = 'P0001', hint = 'Your bag can hold up to 50 different items.';
    end if;
    insert into public.cart_items (cart_id, variant_id, quantity) values (v_cart, p_variant_id, v_new)
    on conflict (cart_id, variant_id) do update set quantity = excluded.quantity, updated_at = now();
  end if;
  update public.carts set updated_at = now() where id = v_cart;
  return public.cart_get(p_user_id, p_token);
end $$;

drop function public.match_shipping_zone(text, text, text);
create function public.match_shipping_zone(p_country text, p_state text, p_postal_code text, p_store_id uuid default null) returns uuid
language sql stable security definer set search_path = '' as $$
  select z.id
  from public.shipping_zones z
  where z.store_id = coalesce(p_store_id, public.current_store_id())
    and z.is_active
    and upper(coalesce(p_country, 'IN')) = any (z.countries)
    and (cardinality(z.states) = 0 or p_state is null
         or lower(btrim(p_state)) = any (select lower(s) from unnest(z.states) s))
    and (cardinality(z.postal_prefixes) = 0
         or exists (select 1 from unnest(z.postal_prefixes) pre where replace(coalesce(p_postal_code, ''), ' ', '') like pre || '%'))
    and exists (select 1 from public.shipping_rates r where r.zone_id = z.id and r.is_active)
  order by (cardinality(z.postal_prefixes) > 0) desc,
           (cardinality(z.states) > 0 and p_state is not null) desc,
           z.priority desc,
           z.created_at
  limit 1
$$;
revoke execute on function public.match_shipping_zone(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.match_shipping_zone(text, text, text, uuid) to service_role;

create or replace function public.check_postcode(p_postal_code text, p_state text default null, p_subtotal bigint default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_store uuid := public.current_store_id();
  v_code text := replace(btrim(coalesce(p_postal_code, '')), ' ', '');
  v_rule public.postal_code_rules;
  v_zone public.shipping_zones;
  v_settings public.store_settings;
  v_rates jsonb;
begin
  if v_code !~ '^[1-9][0-9]{5}$' then
    return jsonb_build_object('valid', false, 'serviceable', false, 'message', 'Enter a 6-digit PIN code.');
  end if;
  select * into v_settings from public.store_settings where store_id = v_store;
  select * into v_rule from public.postal_code_rules where store_id = v_store and postal_code = v_code;
  if v_rule.blocks = 'all' then
    return jsonb_build_object('valid', true, 'serviceable', false, 'message', 'Sorry, we do not deliver to this PIN code yet.');
  end if;
  select * into v_zone from public.shipping_zones where id = public.match_shipping_zone('IN', p_state, v_code, v_store);
  if v_zone.id is null then
    return jsonb_build_object('valid', true, 'serviceable', false, 'message', 'Sorry, we do not deliver to this PIN code yet.');
  end if;
  select jsonb_agg(jsonb_build_object(
      'id', r.id, 'name', r.name, 'description', r.description,
      'price', case when (r.free_over is not null and p_subtotal >= r.free_over)
                      or (v_settings.free_shipping_threshold is not null and p_subtotal >= v_settings.free_shipping_threshold)
                    then 0 else r.price end,
      'base_price', r.price, 'free_over', coalesce(r.free_over, v_settings.free_shipping_threshold),
      'min_days', r.min_days, 'max_days', r.max_days,
      'cod', r.cod_available and v_zone.cod_available and v_rule.blocks is distinct from 'cod' and v_settings.cod_enabled
    ) order by r.sort_order, r.price)
  into v_rates
  from public.shipping_rates r where r.zone_id = v_zone.id and r.is_active;
  return jsonb_build_object(
    'valid', true,
    'serviceable', true,
    'zone', v_zone.name,
    'cod_available', v_settings.cod_enabled and v_zone.cod_available and v_rule.blocks is distinct from 'cod'
                     and exists (select 1 from public.shipping_rates r where r.zone_id = v_zone.id and r.is_active and r.cod_available),
    'rates', coalesce(v_rates, '[]')
  );
end $$;

-- A customer's cash-on-delivery orders in this store, matched by account, email or phone.
create or replace function public.customer_cod_orders(p_user_id uuid, p_email text, p_phone text) returns setof public.orders
language sql stable security definer set search_path = '' as $$
  select o.* from public.orders o
  where o.store_id = public.current_store_id()
    and o.payment_method = 'cod'
    and ((nullif(lower(btrim(coalesce(p_email, ''))), '') is not null and lower(o.email) = lower(btrim(p_email)))
         or (public.phone_key(p_phone) is not null and public.phone_key(o.phone) = public.phone_key(p_phone))
         or (p_user_id is not null and o.user_id = p_user_id))
$$;

create or replace function public.cod_block_reason(p_user_id uuid, p_email text, p_phone text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_store uuid := public.current_store_id();
  s public.store_settings;
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_phone text := public.phone_key(p_phone);
  v_open int;
  v_returned int;
begin
  if v_email is null and v_phone is null and p_user_id is null then
    return null;
  end if;
  select * into s from public.store_settings where store_id = v_store;
  if exists (select 1 from public.cod_blocklist b
             where b.store_id = v_store and ((b.kind = 'email' and b.value = v_email) or (b.kind = 'phone' and b.value = v_phone))) then
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

-- ---------------------------------------------------------------------------
-- Storefront, payments and customer functions, limited to the request's store
-- ---------------------------------------------------------------------------
-- Prices a bag with its own store's settings, codes, delivery zones and PIN rules.
CREATE OR REPLACE FUNCTION public.quote_cart_base(p_cart_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_email text DEFAULT NULL::text, p_address jsonb DEFAULT NULL::jsonb, p_rate_id uuid DEFAULT NULL::uuid, p_payment_method text DEFAULT NULL::text, p_coupon_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_store uuid := coalesce((select c.store_id from public.carts c where c.id = p_cart_id), public.current_store_id());
  s public.store_settings;
  r record;
  n int := 0;
  i int;
  v_line_info jsonb[] := '{}';
  v_valid boolean[] := '{}';
  v_sub bigint[] := '{}';
  v_qty int[] := '{}';
  v_eligible boolean[] := '{}';
  v_disc bigint[] := '{}';
  v_prate int[] := '{}';
  v_product public.products;
  v_lines jsonb := '[]';
  v_issues jsonb := '[]';
  v_subtotal bigint := 0;
  v_items int := 0;
  v_code text;
  v_coupon public.coupons;
  v_coupon_json jsonb;
  v_coupon_ok boolean := false;
  v_coupon_msg text;
  v_pending_email boolean := false;
  v_eligible_sub bigint := 0;
  v_discount bigint := 0;
  v_free_ship boolean := false;
  v_alloc bigint;
  v_left bigint;
  v_largest int;
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_country text;
  v_state text;
  v_postal text;
  v_rule public.postal_code_rules;
  v_zone public.shipping_zones;
  v_rates jsonb := '[]';
  v_rate record;
  v_selected uuid;
  v_selected_rate jsonb;
  v_serviceable boolean;
  v_shipping bigint;
  v_cod_possible boolean := false;
  v_cod_reason text;
  v_cod_fee bigint := 0;
  v_tax_total bigint := 0;
  v_tax bigint;
  v_rate_bps int;
  v_net bigint;
  v_grand bigint;
  v_threshold bigint;
  v_free_remaining bigint;
  v_after_discount bigint;
  v_used int;
begin
  select * into s from public.store_settings where store_id = v_store;
  v_code := upper(btrim(coalesce(p_coupon_code, (select c.coupon_code from public.carts c where c.id = p_cart_id), '')));

  -- 1. Lines, with availability checked against live stock.
  for r in
    select ci.variant_id, ci.quantity, v.sku, v.size, v.color, v.is_active,
           (v.stock_quantity - v.reserved_quantity) as available,
           coalesce(v.price, p.price) as unit_price,
           coalesce(v.compare_at_price, p.compare_at_price) as compare_at,
           p.id as product_id, p.slug, p.title, p.status, p.published_at, p.tax_rate_bps,
           p.category_id, p.is_returnable, coalesce(p.return_window_days, s.return_window_days) as return_window_days,
           b.name as brand,
           (select im.url from public.product_images im
             where im.product_id = p.id
             order by (im.color is not null and im.color = v.color) desc, im.position
             limit 1) as image_url
    from public.cart_items ci
    join public.product_variants v on v.id = ci.variant_id
    join public.products p on p.id = v.product_id
    left join public.brands b on b.id = p.brand_id
    where ci.cart_id = p_cart_id
    order by ci.created_at, ci.id
  loop
    n := n + 1;
    v_qty := v_qty || r.quantity;
    v_prate := v_prate || r.tax_rate_bps;
    v_disc := v_disc || 0::bigint;
    v_eligible := v_eligible || false;
    if not r.is_active or r.status <> 'active' or r.published_at > now() then
      v_valid := v_valid || false;
      v_sub := v_sub || 0::bigint;
      v_line_info := v_line_info || jsonb_build_object('issue', 'unavailable');
      v_issues := v_issues || jsonb_build_object('variant_id', r.variant_id, 'sku', r.sku, 'issue', 'unavailable',
        'message', format('%s is no longer available.', r.title));
    elsif r.available <= 0 then
      v_valid := v_valid || false;
      v_sub := v_sub || 0::bigint;
      v_line_info := v_line_info || jsonb_build_object('issue', 'out_of_stock');
      v_issues := v_issues || jsonb_build_object('variant_id', r.variant_id, 'sku', r.sku, 'issue', 'out_of_stock',
        'message', format('%s%s is sold out.', r.title, case when r.size <> '' then ' in ' || r.size else '' end));
    elsif r.quantity > r.available then
      v_valid := v_valid || false;
      v_sub := v_sub || 0::bigint;
      v_line_info := v_line_info || jsonb_build_object('issue', 'insufficient_stock');
      v_issues := v_issues || jsonb_build_object('variant_id', r.variant_id, 'sku', r.sku, 'issue', 'insufficient_stock',
        'available', r.available,
        'message', format('Only %s left of %s%s. Lower the quantity to continue.', r.available, r.title,
                          case when r.size <> '' then ' in ' || r.size else '' end));
    else
      v_valid := v_valid || true;
      v_sub := v_sub || (r.unit_price * r.quantity);
      v_line_info := v_line_info || jsonb_build_object('issue', null);
      v_subtotal := v_subtotal + r.unit_price * r.quantity;
      v_items := v_items + r.quantity;
    end if;
    v_line_info[n] := v_line_info[n] || jsonb_build_object(
      'variant_id', r.variant_id, 'product_id', r.product_id, 'category_id', r.category_id,
      'slug', r.slug, 'title', r.title, 'brand', coalesce(r.brand, ''),
      'size', r.size, 'color', r.color, 'sku', r.sku, 'image_url', r.image_url,
      'unit_price', r.unit_price,
      'compare_at_price', case when r.compare_at > r.unit_price then r.compare_at end,
      'quantity', r.quantity, 'available', greatest(r.available, 0),
      'is_returnable', r.is_returnable, 'return_window_days', r.return_window_days
    );
  end loop;

  -- 2. Coupon.
  if v_code <> '' then
    select * into v_coupon from public.coupons where store_id = v_store and code = v_code;
    if v_coupon.id is null or not v_coupon.is_active then
      v_coupon_msg := 'This code is not valid.';
    elsif v_coupon.starts_at is not null and v_coupon.starts_at > now() then
      v_coupon_msg := 'This code is not active yet.';
    elsif v_coupon.ends_at is not null and v_coupon.ends_at <= now() then
      v_coupon_msg := 'This code has expired.';
    elsif v_coupon.usage_limit is not null and (
      select count(*) from public.coupon_redemptions cr where cr.coupon_id = v_coupon.id and cr.voided_at is null
    ) >= v_coupon.usage_limit then
      v_coupon_msg := 'This code has been fully redeemed.';
    elsif cardinality(v_coupon.customer_emails) > 0 and v_email is not null and not (v_email = any (v_coupon.customer_emails)) then
      v_coupon_msg := 'This code is not available for your account.';
    elsif v_coupon.usage_limit_per_customer is not null and (v_email is not null or p_user_id is not null) and (
      select count(*) from public.coupon_redemptions cr
      where cr.coupon_id = v_coupon.id and cr.voided_at is null
        and ((p_user_id is not null and cr.user_id = p_user_id) or (v_email is not null and lower(cr.email) = v_email))
    ) >= v_coupon.usage_limit_per_customer then
      v_coupon_msg := 'You have already used this code.';
    elsif v_coupon.first_order_only and (v_email is not null or p_user_id is not null) and exists (
      select 1 from public.orders o
      where o.store_id = v_store and o.status in ('confirmed', 'completed')
        and ((p_user_id is not null and o.user_id = p_user_id) or (v_email is not null and lower(o.email) = v_email))
    ) then
      v_coupon_msg := 'This code is for your first order only.';
    else
      for i in 1 .. n loop
        if v_valid[i] then
          select * into v_product from public.products where id = (v_line_info[i] ->> 'product_id')::uuid;
          v_eligible[i] := case v_coupon.applies_to
            when 'all' then true
            when 'products' then v_product.id = any (v_coupon.product_ids)
            when 'categories' then exists (
              select 1 from unnest(v_coupon.category_ids) cid
              where v_product.category_id in (select public.category_subtree(cid))
            )
            when 'collections' then exists (
              select 1 from public.collections c
              where c.id = any (v_coupon.collection_ids) and public.product_in_collection(v_product, c)
            )
            else false
          end;
          if v_eligible[i] then
            v_eligible_sub := v_eligible_sub + v_sub[i];
          end if;
        end if;
      end loop;
      if v_eligible_sub = 0 then
        v_coupon_msg := 'This code does not apply to the items in your bag.';
      elsif v_subtotal < v_coupon.min_subtotal then
        v_coupon_msg := format('Spend %s more to use this code.', public.format_money(v_coupon.min_subtotal - v_subtotal, s.currency));
      else
        v_coupon_ok := true;
        v_pending_email := v_email is null and p_user_id is null and (
          cardinality(v_coupon.customer_emails) > 0 or v_coupon.usage_limit_per_customer is not null or v_coupon.first_order_only
        );
        if v_coupon.kind = 'percentage' then
          v_discount := floor(v_eligible_sub::numeric * v_coupon.value / 10000)::bigint;
          if v_coupon.max_discount is not null then
            v_discount := least(v_discount, v_coupon.max_discount);
          end if;
        elsif v_coupon.kind = 'fixed' then
          v_discount := least(v_coupon.value, v_eligible_sub);
        else
          v_free_ship := true;
        end if;
        -- Spread the discount over eligible lines in proportion to their value; the
        -- rounding remainder goes to the largest line.
        v_left := v_discount;
        v_largest := null;
        for i in 1 .. n loop
          if v_valid[i] and v_eligible[i] then
            v_alloc := floor(v_discount::numeric * v_sub[i] / v_eligible_sub)::bigint;
            v_disc[i] := v_alloc;
            v_left := v_left - v_alloc;
            if v_largest is null or v_sub[i] > v_sub[v_largest] then
              v_largest := i;
            end if;
          end if;
        end loop;
        if v_largest is not null and v_left > 0 then
          v_disc[v_largest] := v_disc[v_largest] + v_left;
        end if;
        v_coupon_msg := case
          when v_coupon.kind = 'free_shipping' then 'Free delivery applied.'
          else format('You save %s.', public.format_money(v_discount, s.currency))
        end;
      end if;
    end if;
    v_coupon_json := jsonb_build_object(
      'code', v_code, 'valid', v_coupon_ok, 'message', v_coupon_msg,
      'kind', v_coupon.kind, 'free_shipping', v_free_ship, 'amount', v_discount,
      'pending_email_check', v_pending_email
    );
  end if;
  v_after_discount := v_subtotal - v_discount;

  -- 3. Delivery for the address, when we have one.
  if p_address is not null and coalesce(p_address ->> 'postal_code', '') <> '' then
    v_country := upper(coalesce(nullif(p_address ->> 'country', ''), 'IN'));
    v_state := nullif(btrim(coalesce(p_address ->> 'state', '')), '');
    v_postal := upper(regexp_replace(p_address ->> 'postal_code', '\s+', '', 'g'));
    select * into v_rule from public.postal_code_rules where store_id = v_store and postal_code = v_postal;
    if v_rule.blocks = 'all' then
      v_serviceable := false;
    else
      select * into v_zone from public.shipping_zones where id = public.match_shipping_zone(v_country, v_state, v_postal, v_store);
      v_serviceable := v_zone.id is not null;
    end if;
    if v_serviceable then
      for v_rate in
        select * from public.shipping_rates where zone_id = v_zone.id and is_active order by sort_order, price
      loop
        v_rates := v_rates || jsonb_build_object(
          'id', v_rate.id, 'name', v_rate.name, 'description', v_rate.description,
          'base_price', v_rate.price,
          'price', case
            when v_free_ship then 0
            when v_rate.free_over is not null and v_after_discount >= v_rate.free_over then 0
            when s.free_shipping_threshold is not null and v_after_discount >= s.free_shipping_threshold then 0
            else v_rate.price end,
          'free_over', coalesce(v_rate.free_over, s.free_shipping_threshold),
          'min_days', v_rate.min_days, 'max_days', v_rate.max_days,
          'cod', v_rate.cod_available
        );
        if v_selected is null or v_rate.id = p_rate_id then
          v_selected := v_rate.id;
        end if;
      end loop;
      select x into v_selected_rate from jsonb_array_elements(v_rates) x where (x ->> 'id')::uuid = v_selected;
      v_shipping := (v_selected_rate ->> 'price')::bigint;
      v_threshold := (v_selected_rate ->> 'free_over')::bigint;
    else
      v_issues := v_issues || jsonb_build_object('issue', 'not_serviceable',
        'message', 'Sorry, we do not deliver to this PIN code yet.');
    end if;
  else
    v_threshold := s.free_shipping_threshold;
  end if;

  if v_threshold is not null and not v_free_ship and coalesce(v_shipping, 1) > 0 and v_after_discount < v_threshold then
    v_free_remaining := v_threshold - v_after_discount;
  end if;

  -- 4. Tax, per line on the discounted amount.
  for i in 1 .. n loop
    if v_valid[i] then
      v_net := v_sub[i] - v_disc[i];
      v_rate_bps := case when s.tax_mode = 'none' then 0
                         else public.tax_rate_for(v_net / v_qty[i], v_prate[i], s.tax_slabs) end;
      v_tax := public.tax_amount(v_net, v_rate_bps, s.tax_mode);
      v_tax_total := v_tax_total + v_tax;
    else
      v_rate_bps := 0;
      v_tax := 0;
      v_net := 0;
    end if;
    v_lines := v_lines || (v_line_info[i] || jsonb_build_object(
      'line_subtotal', v_sub[i],
      'discount', v_disc[i],
      'tax_rate_bps', v_rate_bps,
      'tax', v_tax,
      'line_total', v_net + case when s.tax_mode = 'exclusive' then v_tax else 0 end
    ));
  end loop;

  -- 5. Payment methods for this order.
  v_grand := v_after_discount + coalesce(v_shipping, 0) + case when s.tax_mode = 'exclusive' then v_tax_total else 0 end;
  if not s.cod_enabled then
    v_cod_reason := 'Cash on delivery is not offered.';
  elsif v_serviceable is null then
    v_cod_reason := 'Enter your delivery address to check cash on delivery.';
  elsif not v_serviceable then
    v_cod_reason := 'Not available for this address.';
  elsif not v_zone.cod_available or v_rule.blocks = 'cod' then
    v_cod_reason := 'Cash on delivery is not available for this PIN code.';
  elsif v_selected_rate is not null and not (v_selected_rate ->> 'cod')::boolean then
    v_cod_reason := 'Cash on delivery is not available with this delivery option.';
  elsif v_grand + s.cod_fee > s.cod_max_order then
    v_cod_reason := format('Cash on delivery is available for orders up to %s.', public.format_money(s.cod_max_order, s.currency));
  elsif v_grand < s.cod_min_order then
    v_cod_reason := format('Cash on delivery is available for orders over %s.', public.format_money(s.cod_min_order, s.currency));
  else
    v_cod_possible := true;
  end if;
  if p_payment_method = 'cod' and v_cod_possible then
    v_cod_fee := s.cod_fee;
  end if;
  v_grand := v_grand + v_cod_fee;

  return jsonb_build_object(
    'cart_id', p_cart_id,
    'currency', s.currency,
    'lines', v_lines,
    'item_count', v_items,
    'line_count', n,
    'subtotal', v_subtotal,
    'discount_total', v_discount,
    'shipping_total', v_shipping,
    'cod_fee', v_cod_fee,
    'tax_total', v_tax_total,
    'tax_mode', s.tax_mode,
    'tax_label', s.tax_label,
    'grand_total', v_grand,
    'coupon', v_coupon_json,
    'shipping', jsonb_build_object(
      'serviceable', v_serviceable,
      'zone', v_zone.name,
      'rates', v_rates,
      'selected_rate_id', v_selected
    ),
    'free_shipping_remaining', v_free_remaining,
    'free_shipping_threshold', v_threshold,
    'payment_methods', jsonb_build_object(
      'razorpay', s.razorpay_enabled,
      'stripe', s.stripe_enabled,
      'cod', v_cod_possible,
      'cod_reason', v_cod_reason,
      'cod_fee', s.cod_fee
    ),
    'issues', v_issues,
    'can_checkout', n > 0 and jsonb_array_length(v_issues) = 0
  );
end $function$
;

-- Places the order in the request's store, with that store's settings and codes.
CREATE OR REPLACE FUNCTION public.place_order(p_user_id uuid, p_cart_token text, p_idempotency_key uuid, p_email text, p_phone text, p_shipping_address jsonb, p_billing_address jsonb, p_rate_id uuid, p_payment_method text, p_customer_note text DEFAULT ''::text, p_save_address boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_store uuid := public.current_store_id();
  s public.store_settings;
  v_cart public.carts;
  v_cart_id uuid;
  v_existing public.orders;
  v_old uuid;
  v_addr jsonb;
  v_bill jsonb;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_quote jsonb;
  v_rate jsonb;
  v_coupon public.coupons;
  v_order public.orders;
  v_line jsonb;
  v_method text := p_payment_method;
  v_immediate boolean;
  v_status public.order_status;
  v_pay_status public.order_payment_status;
begin
  if p_idempotency_key is null then
    raise exception 'missing_idempotency_key' using errcode = '22023';
  end if;
  if exists (select 1 from public.stores where id = v_store and status = 'suspended') then
    raise exception 'store_closed' using errcode = 'P0001', hint = 'This store isn''t taking orders right now.';
  end if;
  if not public.is_email(v_email) then
    raise exception 'invalid_email' using errcode = '22023', hint = 'Enter a valid email address.';
  end if;
  if v_method not in ('razorpay', 'stripe', 'cod') then
    raise exception 'invalid_payment_method' using errcode = '22023', hint = 'Choose a payment method.';
  end if;
  v_addr := public.normalize_address(p_shipping_address);
  v_bill := case when p_billing_address is null then null else public.normalize_address(p_billing_address) end;
  if v_phone = '' then
    v_phone := v_addr ->> 'phone';
  end if;
  if not public.is_phone(v_phone) then
    raise exception 'invalid_phone' using errcode = '22023', hint = 'Enter a valid phone number.';
  end if;

  v_cart_id := public.cart_find(p_user_id, p_cart_token, false);
  if v_cart_id is null then
    raise exception 'cart_empty' using errcode = 'P0001', hint = 'Your bag is empty.';
  end if;
  -- One checkout at a time per cart.
  select * into v_cart from public.carts where id = v_cart_id for update;

  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.cart_id is distinct from v_cart.id then
      raise exception 'idempotency_conflict' using errcode = 'P0001', hint = 'Refresh the page and try again.';
    end if;
    return public.order_brief(v_existing) || jsonb_build_object('reused', true);
  end if;

  select * into s from public.store_settings where store_id = v_store;
  if s.maintenance_mode then
    raise exception 'store_closed' using errcode = 'P0001', hint = 'The store is closed for maintenance. Please try again soon.';
  end if;
  perform public.release_expired_orders(25, v_store);

  -- An earlier unpaid order from this cart stops holding stock once a new one is placed.
  for v_old in
    select id from public.orders where cart_id = v_cart.id and status = 'pending_payment' order by created_at
  loop
    perform public.cancel_order_internal(v_old, 'superseded', 'Replaced by a newer checkout.', 'system', null, false);
  end loop;

  v_quote := public.quote_cart(v_cart.id, p_user_id, v_email, v_addr, p_rate_id, v_method, null);
  if (v_quote ->> 'item_count')::int = 0 and jsonb_array_length(v_quote -> 'issues') = 0 then
    raise exception 'cart_empty' using errcode = 'P0001', hint = 'Your bag is empty.';
  end if;
  if jsonb_array_length(v_quote -> 'issues') > 0 then
    raise exception 'cart_has_issues' using errcode = 'P0001',
      hint = (v_quote -> 'issues' -> 0 ->> 'message'), detail = (v_quote -> 'issues')::text;
  end if;
  if v_quote -> 'coupon' is not null and v_quote -> 'coupon' <> 'null'::jsonb and not (v_quote -> 'coupon' ->> 'valid')::boolean then
    raise exception 'invalid_coupon' using errcode = 'P0001', hint = v_quote -> 'coupon' ->> 'message';
  end if;
  select x into v_rate from jsonb_array_elements(v_quote -> 'shipping' -> 'rates') x
  where x ->> 'id' = v_quote -> 'shipping' ->> 'selected_rate_id';
  if v_rate is null then
    raise exception 'not_serviceable' using errcode = 'P0001', hint = 'Sorry, we do not deliver to this PIN code yet.';
  end if;
  if p_rate_id is not null and (v_rate ->> 'id')::uuid <> p_rate_id then
    raise exception 'rate_unavailable' using errcode = 'P0001', hint = 'That delivery option is not available for this address.';
  end if;
  if v_method = 'cod' and not (v_quote -> 'payment_methods' ->> 'cod')::boolean then
    raise exception 'cod_unavailable' using errcode = 'P0001', hint = v_quote -> 'payment_methods' ->> 'cod_reason';
  elsif v_method = 'razorpay' and not s.razorpay_enabled then
    raise exception 'method_unavailable' using errcode = 'P0001', hint = 'Online payment is not available right now.';
  elsif v_method = 'stripe' and not s.stripe_enabled then
    raise exception 'method_unavailable' using errcode = 'P0001', hint = 'Card payment is not available right now.';
  end if;

  -- Coupon limits again, now holding the coupon row so concurrent orders queue up.
  if v_quote -> 'coupon' is not null and v_quote -> 'coupon' <> 'null'::jsonb then
    select * into v_coupon from public.coupons where store_id = v_store and code = v_quote -> 'coupon' ->> 'code' for update;
    if v_coupon.usage_limit is not null and (
      select count(*) from public.coupon_redemptions where coupon_id = v_coupon.id and voided_at is null
    ) >= v_coupon.usage_limit then
      raise exception 'invalid_coupon' using errcode = 'P0001', hint = 'This code has been fully redeemed.';
    end if;
    if v_coupon.usage_limit_per_customer is not null and (
      select count(*) from public.coupon_redemptions
      where coupon_id = v_coupon.id and voided_at is null
        and ((p_user_id is not null and user_id = p_user_id) or lower(email) = v_email)
    ) >= v_coupon.usage_limit_per_customer then
      raise exception 'invalid_coupon' using errcode = 'P0001', hint = 'You have already used this code.';
    end if;
  end if;

  v_immediate := v_method = 'cod' or (v_quote ->> 'grand_total')::bigint = 0;
  if (v_quote ->> 'grand_total')::bigint = 0 then
    v_method := 'none';
  end if;
  v_status := case when v_immediate then 'confirmed' else 'pending_payment' end;
  v_pay_status := case when v_method = 'none' then 'paid' when v_method = 'cod' then 'unpaid' else 'pending' end;

  insert into public.orders (
    store_id, user_id, cart_id, email, phone, customer_name, status, payment_status, payment_method, currency,
    subtotal, discount_total, shipping_total, cod_fee, tax_total, grand_total, tax_mode, tax_label,
    coupon_code, shipping_address, billing_address, shipping_rate_id, shipping_method, customer_note,
    idempotency_key, expires_at, paid_at
  ) values (
    v_store, p_user_id, v_cart.id, v_email, v_phone, v_addr ->> 'full_name', v_status, v_pay_status, v_method,
    v_quote ->> 'currency',
    (v_quote ->> 'subtotal')::bigint, (v_quote ->> 'discount_total')::bigint, (v_quote ->> 'shipping_total')::bigint,
    (v_quote ->> 'cod_fee')::bigint, (v_quote ->> 'tax_total')::bigint, (v_quote ->> 'grand_total')::bigint,
    v_quote ->> 'tax_mode', v_quote ->> 'tax_label',
    case when v_coupon.id is not null then v_coupon.code end,
    v_addr, v_bill, (v_rate ->> 'id')::uuid,
    jsonb_build_object('name', v_rate ->> 'name', 'min_days', (v_rate ->> 'min_days')::int, 'max_days', (v_rate ->> 'max_days')::int,
                       'price', (v_rate ->> 'price')::bigint),
    left(btrim(coalesce(p_customer_note, '')), 500),
    p_idempotency_key,
    case when v_immediate then null else now() + make_interval(mins => s.reservation_minutes) end,
    case when v_method = 'none' then now() end
  ) returning * into v_order;

  if v_immediate then
    perform public.set_stock_context('sale', 'Order ' || v_order.order_number, v_order.id);
  end if;
  -- Lock variant rows in a fixed order so concurrent checkouts cannot deadlock.
  for v_line in
    select x from jsonb_array_elements(v_quote -> 'lines') x order by x ->> 'variant_id'
  loop
    if v_immediate then
      update public.product_variants
        set stock_quantity = stock_quantity - (v_line ->> 'quantity')::int
      where id = (v_line ->> 'variant_id')::uuid
        and stock_quantity - reserved_quantity >= (v_line ->> 'quantity')::int;
    else
      update public.product_variants
        set reserved_quantity = reserved_quantity + (v_line ->> 'quantity')::int
      where id = (v_line ->> 'variant_id')::uuid
        and stock_quantity - reserved_quantity >= (v_line ->> 'quantity')::int;
    end if;
    if not found then
      raise exception 'out_of_stock' using errcode = 'P0001',
        hint = format('%s just sold out in that size. Your bag has been updated.', v_line ->> 'title'),
        detail = v_line ->> 'sku';
    end if;
    insert into public.order_items (
      order_id, product_id, variant_id, product_title, product_slug, brand_name, variant_title, size, color, sku,
      image_url, unit_price, compare_at_price, quantity, discount_amount, tax_rate_bps, tax_amount, line_total,
      is_returnable, return_window_days
    ) values (
      v_order.id, (v_line ->> 'product_id')::uuid, (v_line ->> 'variant_id')::uuid, v_line ->> 'title', v_line ->> 'slug',
      v_line ->> 'brand',
      concat_ws(' / ', nullif(v_line ->> 'size', ''), nullif(v_line ->> 'color', '')),
      v_line ->> 'size', v_line ->> 'color', v_line ->> 'sku', v_line ->> 'image_url',
      (v_line ->> 'unit_price')::bigint, (v_line ->> 'compare_at_price')::bigint, (v_line ->> 'quantity')::int,
      (v_line ->> 'discount')::bigint, (v_line ->> 'tax_rate_bps')::int, (v_line ->> 'tax')::bigint,
      (v_line ->> 'line_total')::bigint,
      (v_line ->> 'is_returnable')::boolean, (v_line ->> 'return_window_days')::int
    );
    if v_immediate then
      update public.products set sales_count = sales_count + (v_line ->> 'quantity')::int
      where id = (v_line ->> 'product_id')::uuid;
    end if;
  end loop;
  if v_immediate then
    perform public.clear_stock_context();
  end if;

  if v_coupon.id is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, email, amount)
    values (v_coupon.id, v_order.id, p_user_id, v_email, v_order.discount_total);
  end if;

  perform public.add_order_event(v_order.id, 'placed',
    case
      when v_method = 'cod' then 'Order placed with cash on delivery.'
      when v_method = 'none' then 'Order placed. Nothing to pay.'
      else 'Order placed. Waiting for payment.'
    end,
    jsonb_build_object('payment_method', v_method), false, 'customer', p_user_id);

  if v_immediate then
    delete from public.cart_items where cart_id = v_cart.id;
    update public.carts set coupon_code = null, updated_at = now() where id = v_cart.id;
    perform public.queue_email(v_order.email, 'order_confirmation', v_order.id);
  end if;

  if p_save_address and p_user_id is not null and not exists (
    select 1 from public.customer_addresses a
    where a.store_id = v_store and a.user_id = p_user_id and lower(a.line1) = lower(v_addr ->> 'line1') and a.postal_code = v_addr ->> 'postal_code'
  ) and (select count(*) from public.customer_addresses where store_id = v_store and user_id = p_user_id) < 20 then
    insert into public.customer_addresses (store_id, user_id, full_name, phone, line1, line2, landmark, city, state, postal_code, country)
    values (v_store, p_user_id, v_addr ->> 'full_name', v_addr ->> 'phone', v_addr ->> 'line1', v_addr ->> 'line2',
            v_addr ->> 'landmark', v_addr ->> 'city', v_addr ->> 'state', v_addr ->> 'postal_code', v_addr ->> 'country');
  end if;

  if p_user_id is not null then
    insert into public.store_customers (store_id, user_id) values (v_store, p_user_id) on conflict do nothing;
  end if;

  return public.order_brief(v_order) || jsonb_build_object('reused', false);
end $function$
;

-- Only the request's store's orders.
CREATE OR REPLACE FUNCTION public.prepare_order_payment(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.orders;
  s public.store_settings;
  it record;
begin
  o := public.store_order(p_order_id);
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  select * into s from public.store_settings where store_id = o.store_id;
  if o.payment_method not in ('razorpay', 'stripe') then
    raise exception 'order_not_payable' using errcode = 'P0001', hint = 'This order does not take online payment.';
  end if;
  if o.status = 'pending_payment' then
    update public.orders set expires_at = greatest(expires_at, now() + make_interval(mins => s.reservation_minutes))
    where id = o.id returning * into o;
  elsif o.status = 'cancelled' and o.cancel_reason in ('payment_timeout', 'superseded')
        and o.payment_status in ('voided', 'failed', 'pending') then
    begin
      for it in
        select variant_id, sum(quantity)::int as qty from public.order_items
        where order_id = o.id group by variant_id order by variant_id
      loop
        if it.variant_id is null then
          raise exception 'variant_gone';
        end if;
        update public.product_variants set reserved_quantity = reserved_quantity + it.qty
        where id = it.variant_id and stock_quantity - reserved_quantity >= it.qty and is_active;
        if not found then
          raise exception 'stock_gone';
        end if;
      end loop;
    exception when others then
      raise exception 'order_expired' using errcode = 'P0001',
        hint = 'This order expired and some items are no longer available. Please place a new order.';
    end;
    update public.orders set status = 'pending_payment', payment_status = 'pending', cancelled_at = null, cancel_reason = null,
      expires_at = now() + make_interval(mins => s.reservation_minutes)
    where id = o.id returning * into o;
    update public.coupon_redemptions set voided_at = null where order_id = o.id;
    perform public.add_order_event(o.id, 'reopened', 'Order reopened for payment.', '{}', false, 'customer', o.user_id);
  else
    raise exception 'order_not_payable' using errcode = 'P0001', hint = 'This order no longer needs payment.';
  end if;
  return public.order_brief(o);
end $function$
;

-- Only the request's store's orders.
CREATE OR REPLACE FUNCTION public.record_payment_failure(p_order_id uuid, p_provider payment_provider, p_provider_order_id text, p_provider_payment_id text, p_method text, p_error_code text, p_error_description text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.orders;
  v_pay public.payments;
begin
  select * into o from public.orders where id = p_order_id and store_id = public.current_store_id() for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if p_provider_payment_id is not null then
    select * into v_pay from public.payments where provider = p_provider and provider_payment_id = p_provider_payment_id;
    if v_pay.id is not null and v_pay.status <> 'created' and v_pay.status <> 'failed' then
      return jsonb_build_object('result', 'ignored') || public.order_brief(o);
    end if;
  end if;
  if v_pay.id is null then
    insert into public.payments (order_id, provider, provider_order_id, provider_payment_id, amount, currency, status,
                                 method, error_code, error_description)
    values (o.id, p_provider, p_provider_order_id, p_provider_payment_id, o.grand_total, o.currency, 'failed',
            p_method, left(p_error_code, 80), left(p_error_description, 500))
    on conflict (provider, provider_payment_id) do nothing
    returning * into v_pay;
  else
    update public.payments set status = 'failed', method = coalesce(p_method, method),
      error_code = left(p_error_code, 80), error_description = left(p_error_description, 500)
    where id = v_pay.id;
  end if;
  if o.status = 'pending_payment' and o.payment_status = 'pending' then
    update public.orders set payment_status = 'failed' where id = o.id returning * into o;
  end if;
  if v_pay.id is not null then
    perform public.add_order_event(o.id, 'payment_failed',
      'Payment attempt failed' || coalesce(': ' || nullif(p_error_description, ''), '.'),
      jsonb_build_object('code', p_error_code, 'provider_payment_id', p_provider_payment_id), false, 'provider');
  end if;
  return jsonb_build_object('result', 'recorded') || public.order_brief(o);
end $function$
;

-- Only the request's store's orders.
CREATE OR REPLACE FUNCTION public.record_payment_session(p_order_id uuid, p_provider payment_provider, p_provider_order_id text, p_amount bigint, p_currency text)
 RETURNS payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.orders;
  v_pay public.payments;
begin
  select * into o from public.orders where id = p_order_id and store_id = public.current_store_id() for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.status <> 'pending_payment' then
    raise exception 'order_not_payable' using errcode = 'P0001', hint = 'This order no longer needs payment.';
  end if;
  if p_amount <> o.grand_total or upper(p_currency) <> o.currency then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;
  select * into v_pay from public.payments
  where order_id = o.id and provider = p_provider and provider_order_id = p_provider_order_id
  order by created_at limit 1;
  if v_pay.id is null then
    insert into public.payments (order_id, provider, provider_order_id, amount, currency, status)
    values (o.id, p_provider, p_provider_order_id, p_amount, upper(p_currency), 'created')
    returning * into v_pay;
  end if;
  return v_pay;
end $function$
;

-- Only the request's store's orders.
CREATE OR REPLACE FUNCTION public.confirm_order_payment(p_order_id uuid, p_provider payment_provider, p_provider_order_id text, p_provider_payment_id text, p_amount bigint, p_currency text, p_method text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.orders;
  v_pay public.payments;
  it record;
  v_result text;
begin
  if p_provider_payment_id is null or btrim(p_provider_payment_id) = '' then
    raise exception 'missing_payment_id' using errcode = '22023';
  end if;
  select * into o from public.orders where id = p_order_id and store_id = public.current_store_id() for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  select * into v_pay from public.payments where provider = p_provider and provider_payment_id = p_provider_payment_id;
  if v_pay.id is not null and v_pay.status in ('captured', 'refunded', 'partially_refunded') then
    return jsonb_build_object('result', 'already_processed', 'payment_id', v_pay.id) || public.order_brief(o);
  end if;
  if v_pay.id is null then
    update public.payments set provider_payment_id = p_provider_payment_id
    where id = (
      select id from public.payments
      where order_id = o.id and provider = p_provider and provider_order_id is not distinct from p_provider_order_id
        and provider_payment_id is null
      order by created_at limit 1
    )
    returning * into v_pay;
  end if;
  if v_pay.id is null then
    insert into public.payments (order_id, provider, provider_order_id, provider_payment_id, amount, currency, status)
    values (o.id, p_provider, p_provider_order_id, p_provider_payment_id, p_amount, upper(p_currency), 'created')
    returning * into v_pay;
  end if;
  update public.payments set
    status = 'captured', amount = p_amount, currency = upper(p_currency), method = p_method,
    details = coalesce(p_details, '{}'), captured_at = now(), error_code = null, error_description = null
  where id = v_pay.id
  returning * into v_pay;

  if p_amount <> o.grand_total or upper(p_currency) <> o.currency then
    update public.orders set needs_attention = true,
      attention_reason = format('Received %s but the order total is %s. Refund the payment.',
        public.format_money(p_amount, upper(p_currency)), public.format_money(o.grand_total, o.currency))
    where id = o.id returning * into o;
    perform public.add_order_event(o.id, 'payment_mismatch', 'A payment was received for the wrong amount and will be refunded.',
      jsonb_build_object('payment_id', v_pay.id, 'amount', p_amount), false, 'provider');
    return jsonb_build_object('result', 'amount_mismatch', 'payment_id', v_pay.id) || public.order_brief(o);
  end if;

  if o.payment_status in ('paid', 'partially_refunded', 'refunded') then
    update public.orders set needs_attention = true,
      attention_reason = 'A second payment was received for this order. Refund the duplicate.'
    where id = o.id returning * into o;
    perform public.add_order_event(o.id, 'duplicate_payment', 'A duplicate payment was received and will be refunded.',
      jsonb_build_object('payment_id', v_pay.id, 'provider_payment_id', p_provider_payment_id), false, 'provider');
    return jsonb_build_object('result', 'duplicate_payment', 'payment_id', v_pay.id) || public.order_brief(o);
  end if;

  if o.status = 'pending_payment' then
    perform public.set_stock_context('sale', 'Order ' || o.order_number, o.id);
    for it in
      select variant_id, product_id, sum(quantity)::int as qty from public.order_items
      where order_id = o.id and variant_id is not null group by variant_id, product_id order by variant_id
    loop
      update public.product_variants
        set stock_quantity = stock_quantity - it.qty, reserved_quantity = reserved_quantity - it.qty
      where id = it.variant_id;
      update public.products set sales_count = sales_count + it.qty where id = it.product_id;
    end loop;
    perform public.clear_stock_context();
    v_result := 'confirmed';
  elsif o.status = 'cancelled' then
    -- Paid after the reservation lapsed: take the stock again if it is still there.
    begin
      perform public.set_stock_context('sale', 'Order ' || o.order_number || ' (paid after expiry)', o.id);
      for it in
        select variant_id, product_id, sum(quantity)::int as qty from public.order_items
        where order_id = o.id group by variant_id, product_id order by variant_id
      loop
        if it.variant_id is null then
          raise exception 'variant_gone';
        end if;
        update public.product_variants set stock_quantity = stock_quantity - it.qty
        where id = it.variant_id and stock_quantity - reserved_quantity >= it.qty;
        if not found then
          raise exception 'stock_gone';
        end if;
        update public.products set sales_count = sales_count + it.qty where id = it.product_id;
      end loop;
      perform public.clear_stock_context();
      update public.coupon_redemptions set voided_at = null where order_id = o.id;
      v_result := 'reinstated';
    exception when others then
      perform public.clear_stock_context();
      update public.orders set payment_status = 'paid', paid_at = now(), needs_attention = true,
        attention_reason = 'Paid after the order expired, and the items are no longer available. Refund the payment.'
      where id = o.id returning * into o;
      perform public.add_order_event(o.id, 'paid_after_expiry',
        'Payment arrived after the order expired and the items had sold out. A full refund will be issued.',
        jsonb_build_object('payment_id', v_pay.id), false, 'provider');
      return jsonb_build_object('result', 'refund_required', 'payment_id', v_pay.id) || public.order_brief(o);
    end;
  else
    -- Confirmed but unpaid (cash on delivery switched to online): just record it.
    v_result := 'confirmed';
  end if;

  update public.orders set
    status = case when status = 'completed' then status else 'confirmed'::public.order_status end,
    payment_status = 'paid', paid_at = now(), expires_at = null, cancelled_at = null, cancel_reason = null
  where id = o.id
  returning * into o;

  if o.cart_id is not null then
    delete from public.cart_items ci
    using public.order_items oi
    where ci.cart_id = o.cart_id and oi.order_id = o.id and ci.variant_id = oi.variant_id;
    update public.carts set coupon_code = null, updated_at = now()
    where id = o.cart_id and coupon_code is not distinct from o.coupon_code;
  end if;

  perform public.add_order_event(o.id, 'payment_captured',
    format('Payment of %s received%s.', public.format_money(p_amount, upper(p_currency)),
           case when p_method is not null and p_method <> '' then ' by ' || p_method else '' end),
    jsonb_build_object('payment_id', v_pay.id, 'provider', p_provider, 'provider_payment_id', p_provider_payment_id,
                       'reinstated', v_result = 'reinstated'),
    false, 'provider');
  perform public.queue_email(o.email, 'order_confirmation', o.id);
  return jsonb_build_object('result', v_result, 'payment_id', v_pay.id) || public.order_brief(o);
end $function$
;

-- Only the request's store's orders.
CREATE OR REPLACE FUNCTION public.customer_cancel_order(p_order_id uuid, p_user_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.orders;
  v_reason text := left(btrim(coalesce(nullif(p_reason, ''), 'Changed my mind')), 100);
begin
  select * into o from public.orders where id = p_order_id and store_id = public.current_store_id() for update;
  if o.id is null or (p_user_id is not null and o.user_id is distinct from p_user_id) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.status = 'cancelled' then
    return jsonb_build_object('result', 'already_cancelled') || public.order_brief(o);
  end if;
  if o.fulfillment_status not in ('unfulfilled', 'processing') then
    raise exception 'too_late_to_cancel' using errcode = 'P0001',
      hint = 'This order is already packed or on its way. You can return it after delivery.';
  end if;
  if o.status = 'pending_payment' or o.payment_status in ('unpaid', 'pending', 'failed', 'voided')
     or (o.payment_status = 'paid' and o.grand_total = 0) then
    perform public.cancel_order_internal(o.id, 'customer_request', 'Cancelled by the customer: ' || v_reason, 'customer', p_user_id, true);
    return jsonb_build_object('result', 'cancelled') || public.order_brief((select x from public.orders x where x.id = o.id));
  end if;
  -- Paid orders: staff confirm the cancellation and refund the payment.
  insert into public.return_requests (order_id, user_id, kind, reason)
  values (o.id, o.user_id, 'cancellation', v_reason)
  on conflict do nothing;
  perform public.add_order_event(o.id, 'cancellation_requested', 'Customer asked to cancel: ' || v_reason, '{}', false, 'customer', p_user_id);
  return jsonb_build_object('result', 'requested') || public.order_brief(o);
end $function$
;

-- Only the request's store's orders.
CREATE OR REPLACE FUNCTION public.customer_request_return(p_order_id uuid, p_user_id uuid, p_items jsonb, p_reason text, p_details text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.orders;
  v_item jsonb;
  oi public.order_items;
  v_qty int;
  v_open int;
  v_request uuid;
  v_count int := 0;
begin
  select * into o from public.orders where id = p_order_id and store_id = public.current_store_id() for update;
  if o.id is null or (p_user_id is not null and o.user_id is distinct from p_user_id) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.fulfillment_status <> 'delivered' or o.delivered_at is null then
    raise exception 'not_delivered' using errcode = 'P0001', hint = 'You can request a return once the order is delivered.';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'reason_required' using errcode = '22023', hint = 'Tell us why you are returning the items.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no_items' using errcode = '22023', hint = 'Choose at least one item to return.';
  end if;
  insert into public.return_requests (order_id, user_id, kind, reason, details)
  values (o.id, o.user_id, 'return', left(btrim(p_reason), 100), left(btrim(coalesce(p_details, '')), 2000))
  returning id into v_request;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::int, 0);
    if v_qty <= 0 then
      continue;
    end if;
    select * into oi from public.order_items where id = (v_item ->> 'order_item_id')::uuid and order_id = o.id;
    if oi.id is null then
      raise exception 'invalid_item' using errcode = '22023';
    end if;
    if not oi.is_returnable then
      raise exception 'not_returnable' using errcode = 'P0001', hint = format('%s cannot be returned.', oi.product_title);
    end if;
    if o.delivered_at + make_interval(days => oi.return_window_days) < now() then
      raise exception 'return_window_closed' using errcode = 'P0001',
        hint = format('The return window for %s closed on %s.', oi.product_title,
                      to_char(o.delivered_at + make_interval(days => oi.return_window_days), 'DD Mon YYYY'));
    end if;
    select coalesce(sum(ri.quantity), 0) into v_open
    from public.return_request_items ri join public.return_requests rr on rr.id = ri.return_request_id
    where ri.order_item_id = oi.id and rr.kind = 'return' and rr.status in ('requested', 'approved', 'received') and rr.id <> v_request;
    if v_qty > oi.quantity - oi.quantity_returned - v_open then
      raise exception 'too_many' using errcode = 'P0001',
        hint = format('You can return up to %s of %s.', greatest(oi.quantity - oi.quantity_returned - v_open, 0), oi.product_title);
    end if;
    insert into public.return_request_items (return_request_id, order_item_id, quantity) values (v_request, oi.id, v_qty);
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'no_items' using errcode = '22023', hint = 'Choose at least one item to return.';
  end if;
  perform public.add_order_event(o.id, 'return_requested', 'Return requested: ' || left(btrim(p_reason), 100),
    jsonb_build_object('return_request_id', v_request), false, 'customer', p_user_id);
  return v_request;
end $function$
;

-- Only the request's store's orders.
CREATE OR REPLACE FUNCTION public.confirm_cod_order(p_order_id uuid, p_actor_type text DEFAULT 'customer'::text, p_actor_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id and store_id = public.current_store_id() for update;
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
end $function$
;

-- Only the request's store's orders.
CREATE OR REPLACE FUNCTION public.open_payment_session(p_order_id uuid, p_provider payment_provider)
 RETURNS payments
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.* from public.payments p join public.orders o on o.id = p.order_id
  where p.order_id = p_order_id and o.store_id = public.current_store_id() and p.provider = p_provider and p.provider_order_id is not null
    and p.amount = o.grand_total and p.status in ('created', 'failed')
  order by p.created_at desc
  limit 1
$function$
;

-- Only the request's store's orders.
CREATE OR REPLACE FUNCTION public.order_detail(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  where o.id = p_order_id and o.store_id = public.current_store_id()
$function$
;

-- Only the request's store's orders.
CREATE OR REPLACE FUNCTION public.set_order_whatsapp(p_order_id uuid, p_on boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  update public.orders set whatsapp_opt_in = coalesce(p_on, false) where id = p_order_id and store_id = public.current_store_id();
  if not coalesce(p_on, false) then
    update public.whatsapp_outbox set status = 'skipped', last_error = 'The customer turned WhatsApp updates off.'
    where order_id = p_order_id and store_id = public.current_store_id() and status in ('queued', 'failed');
  end if;
end $function$
;

-- Tracking links from the order's own store's couriers.
CREATE OR REPLACE FUNCTION public.set_fulfillment_internal(p_order_id uuid, p_status fulfillment_status, p_carrier text, p_tracking_number text, p_tracking_url text, p_note text, p_notify boolean, p_actor_type text, p_actor_id uuid)
 RETURNS orders
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      from public.shipping_providers where store_id = o.store_id and lower(name) = lower(coalesce(v_carrier, v_ship.carrier, '')) and tracking_url_template <> '';
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
end $function$
;

-- The order's store decides whether cash orders need confirming.
CREATE OR REPLACE FUNCTION public.orders_cod_confirmation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.store_settings;
begin
  if new.payment_method = 'cod' then
    select * into s from public.store_settings where store_id = new.store_id;
    if s.cod_confirmation then
      new.cod_confirmation := 'pending';
      new.cod_confirm_by := now() + make_interval(hours => s.cod_confirm_hours);
    end if;
  end if;
  return new;
end $function$
;

-- The order's store's WhatsApp settings.
CREATE OR REPLACE FUNCTION public.queue_whatsapp(p_order_id uuid, p_template text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.store_settings;
  o public.orders;
  v_template text := p_template;
begin
  if p_order_id is null then
    return;
  end if;
  select * into s from public.store_settings where store_id = (select x.store_id from public.orders x where x.id = p_order_id);
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
end $function$
;

-- Back-in-stock requests for the request's store's items.
CREATE OR REPLACE FUNCTION public.stock_alert_subscribe(p_variant_id uuid, p_email text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.product_variants;
  p public.products;
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_email(v_email) then
    raise exception 'invalid_email' using errcode = '22023', hint = 'Enter a valid email address.';
  end if;
  if not (select stock_alerts_enabled from public.store_settings where store_id = public.current_store_id()) then
    raise exception 'alerts_off' using errcode = 'P0001', hint = 'Back-in-stock alerts aren''t available right now.';
  end if;
  select * into v from public.product_variants where id = p_variant_id and store_id = public.current_store_id();
  if v.id is null or not v.is_active or not public.product_visible(v.product_id) then
    raise exception 'not_found' using errcode = 'P0002', hint = 'This item is no longer available.';
  end if;
  select * into p from public.products where id = v.product_id;
  if v.stock_quantity - v.reserved_quantity > 0 then
    return jsonb_build_object('in_stock', true);
  end if;
  if (select count(*) from public.stock_alerts where store_id = v.store_id and email = v_email and notified_at is null) >= 30 then
    raise exception 'too_many_alerts' using errcode = 'P0001', hint = 'You''re already waiting for 30 items. We''ll email you as they come back.';
  end if;
  insert into public.stock_alerts (variant_id, product_id, email, user_id)
  values (v.id, v.product_id, v_email, p_user_id)
  on conflict (variant_id, email) where notified_at is null do nothing;
  return jsonb_build_object('in_stock', false, 'title', p.title, 'size', v.size, 'color', v.color);
end $function$
;

-- Reviews for the request's store's products.
CREATE OR REPLACE FUNCTION public.submit_review(p_product_id uuid, p_rating integer, p_title text, p_body text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_settings public.store_settings;
  v_order uuid;
  v_name text;
  v_status public.review_state;
  v_review public.product_reviews;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into v_settings from public.store_settings where store_id = public.current_store_id();
  if not v_settings.reviews_enabled then
    raise exception 'reviews_disabled' using errcode = 'P0001', hint = 'Reviews are turned off.';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'invalid_rating' using errcode = '22023', hint = 'Choose a rating from 1 to 5.';
  end if;
  if not public.product_visible(p_product_id)
     or not exists (select 1 from public.products x where x.id = p_product_id and x.store_id = public.current_store_id()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select o.id into v_order
  from public.orders o join public.order_items i on i.order_id = o.id
  where o.store_id = public.current_store_id() and o.user_id = v_user and i.product_id = p_product_id
    and (o.payment_status in ('paid', 'partially_refunded') or o.fulfillment_status = 'delivered')
    and o.status <> 'cancelled'
  order by o.placed_at desc
  limit 1;
  if v_settings.reviews_require_purchase and v_order is null then
    raise exception 'purchase_required' using errcode = 'P0001', hint = 'Only customers who bought this item can review it.';
  end if;
  select coalesce(nullif(split_part(btrim(full_name), ' ', 1), ''), 'Customer')
         || coalesce(' ' || nullif(left(split_part(btrim(full_name), ' ', 2), 1), '') || '.', '')
    into v_name
  from public.profiles where id = v_user;
  v_status := case when v_settings.reviews_auto_publish then 'published' else 'pending' end;
  insert into public.product_reviews (product_id, user_id, order_id, rating, title, body, author_name, is_verified_purchase, status)
  values (p_product_id, v_user, v_order, p_rating, left(btrim(coalesce(p_title, '')), 120), left(btrim(coalesce(p_body, '')), 3000),
          coalesce(v_name, 'Customer'), v_order is not null, v_status)
  on conflict (product_id, user_id) do update set
    rating = excluded.rating, title = excluded.title, body = excluded.body,
    order_id = excluded.order_id, is_verified_purchase = excluded.is_verified_purchase,
    status = excluded.status
  returning * into v_review;
  return jsonb_build_object('id', v_review.id, 'status', v_review.status, 'verified', v_review.is_verified_purchase);
end $function$
;

-- One wishlist per customer per store.
CREATE OR REPLACE FUNCTION public.toggle_wishlist(p_product_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := (select auth.uid());
  v_list uuid;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not public.product_visible(p_product_id)
     or not exists (select 1 from public.products x where x.id = p_product_id and x.store_id = public.current_store_id()) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.wishlists (store_id, user_id) values (public.current_store_id(), v_user) on conflict (store_id, user_id) do nothing;
  select id into v_list from public.wishlists where store_id = public.current_store_id() and user_id = v_user;
  delete from public.wishlist_items where wishlist_id = v_list and product_id = p_product_id;
  if found then
    return false;
  end if;
  if (select count(*) from public.wishlist_items where wishlist_id = v_list) >= 200 then
    raise exception 'wishlist_full' using errcode = 'P0001', hint = 'Your wishlist can hold up to 200 items.';
  end if;
  insert into public.wishlist_items (wishlist_id, product_id) values (v_list, p_product_id);
  return true;
end $function$
;

-- The variant's store's settings, and its emails go out as that store.
CREATE OR REPLACE FUNCTION public.variants_notify_restock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not (select stock_alerts_enabled from public.store_settings where store_id = new.store_id) or not public.product_visible(new.product_id) then
    return new;
  end if;
  select * into p from public.products where id = new.product_id;
  select im.url into v_image from public.product_images im
  where im.product_id = p.id order by (im.color is not null and im.color = new.color) desc, im.position limit 1;
  -- These were asked for, so they go out even to people who unsubscribed from reminders.
  for a in
    select id, email from public.stock_alerts where variant_id = new.id and notified_at is null order by created_at limit 1000
  loop
    insert into public.email_outbox (store_id, to_email, template, order_id, data)
    values (new.store_id, a.email, 'back_in_stock', null, jsonb_build_object(
      'product_title', p.title, 'slug', p.slug, 'size', new.size, 'color', new.color,
      'price', coalesce(new.price, p.price), 'image_url', v_image));
    update public.stock_alerts set notified_at = now() where id = a.id;
  end loop;
  return new;
end $function$
;

-- ---------------------------------------------------------------------------
-- More storefront and customer functions
-- ---------------------------------------------------------------------------
create or replace function public.best_seller_ids(p_limit int default 8) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select id from public.products
  where store_id = public.current_store_id() and status = 'active' and published_at <= now() and sales_count > 0
  order by sales_count desc, published_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 48)
$$;

create or replace function public.customer_addresses_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT'
     and (select count(*) from public.customer_addresses where store_id = new.store_id and user_id = new.user_id) >= 20 then
    raise exception 'too_many_addresses' using errcode = 'P0001', hint = 'You can save up to 20 addresses.';
  end if;
  if new.is_default then
    update public.customer_addresses set is_default = false
    where store_id = new.store_id and user_id = new.user_id and id <> new.id and is_default;
  elsif not exists (select 1 from public.customer_addresses where store_id = new.store_id and user_id = new.user_id and id <> new.id) then
    new.is_default := true;
  end if;
  return new;
end $$;

-- Unsubscribing is per store: leaving one store's emails leaves the others alone.
drop function public.email_suppressed(text);
create function public.email_suppressed(p_email text, p_store_id uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.email_suppressions
                 where store_id = coalesce(p_store_id, public.current_store_id()) and email = lower(btrim(coalesce(p_email, ''))))
$$;
revoke execute on function public.email_suppressed(text, uuid) from public, anon, authenticated;
grant execute on function public.email_suppressed(text, uuid) to service_role;

create or replace function public.email_unsubscribe(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.is_email(v_email) then
    return;
  end if;
  insert into public.email_suppressions (store_id, email) values (public.current_store_id(), v_email)
  on conflict (store_id, email) do nothing;
  update public.profiles set price_alerts = false where lower(email) = v_email;
end $$;

-- A new account joins the store it signed up at (the app passes store_id in the sign-up
-- metadata). Accounts made without one (Google sign-in) join a store when they first sign
-- in there (store_join) or order there.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is null and new.phone_confirmed_at is null then
    return new;
  end if;
  insert into public.profiles (id, email, full_name, phone, marketing_opt_in)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120),
    public.display_phone(new.phone),
    coalesce(new.raw_user_meta_data ->> 'marketing_opt_in', '') = 'true'
  )
  on conflict (id) do nothing;
  insert into public.store_customers (store_id, user_id)
  select s.id, new.id from public.stores s where s.id::text = new.raw_user_meta_data ->> 'store_id'
  on conflict do nothing;
  return new;
end $$;

-- A signed-in customer shopping at a store for the first time becomes its customer.
create function public.store_join() returns void
language sql security definer set search_path = '' as $$
  insert into public.store_customers (store_id, user_id)
  select public.current_store_id(), (select auth.uid())
  where (select auth.uid()) is not null
  on conflict do nothing
$$;
revoke execute on function public.store_join() from public, anon;
grant execute on function public.store_join() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Scheduled jobs work across every store, each with its own settings.
-- ---------------------------------------------------------------------------
drop function public.release_expired_orders(int);
create function public.release_expired_orders(p_limit int default 100, p_store_id uuid default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select id from public.orders
    where status = 'pending_payment' and expires_at < now() and (p_store_id is null or store_id = p_store_id)
    order by expires_at
    limit p_limit
    for update skip locked
  loop
    perform public.cancel_order_internal(v_id, 'payment_timeout', 'Payment was not completed in time, so the items were released.', 'system', null, false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.release_expired_orders(int, uuid) from public, anon, authenticated;
grant execute on function public.release_expired_orders(int, uuid) to service_role;

create or replace function public.queue_cart_reminders(p_limit int default 200) returns int
language plpgsql security definer set search_path = '' as $$
declare
  c record;
  v_items jsonb;
  v_count int := 0;
begin
  for c in
    select ca.id, ca.store_id, lower(coalesce(u.email, ca.contact_email)) as email
    from public.carts ca
    join public.store_settings s on s.store_id = ca.store_id
    left join auth.users u on u.id = ca.user_id
    where s.cart_reminders_enabled
      and (ca.reminder_sent_at is null or ca.reminder_sent_at < ca.updated_at)
      and ca.updated_at < now() - make_interval(hours => s.cart_reminder_hours)
      and ca.updated_at > now() - interval '7 days'
      and coalesce(u.email, ca.contact_email) is not null
      and exists (select 1 from public.cart_items ci where ci.cart_id = ca.id)
      and not public.email_suppressed(coalesce(u.email, ca.contact_email), ca.store_id)
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
      insert into public.email_outbox (store_id, to_email, template, order_id, data)
      values (c.store_id, c.email, 'cart_reminder', null, jsonb_build_object('cart_id', c.id, 'items', v_items));
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end $$;

create or replace function public.queue_price_alerts(p_limit int default 200) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_items jsonb;
  v_count int := 0;
begin
  for r in
    select w.id as wishlist_id, w.store_id, pr.id as user_id, lower(u.email) as email
    from public.wishlists w
    join public.store_settings s on s.store_id = w.store_id
    join public.profiles pr on pr.id = w.user_id
    join auth.users u on u.id = w.user_id
    where s.price_alerts_enabled and pr.price_alerts and u.email is not null
      and (pr.price_alert_sent_at is null or pr.price_alert_sent_at < now() - interval '3 days')
      and not public.email_suppressed(u.email, w.store_id)
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
    insert into public.email_outbox (store_id, to_email, template, order_id, data)
    values (r.store_id, r.email, 'price_drop', null, jsonb_build_object('items', v_items));
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- The platform: creating and running stores (platform admins only)
-- ---------------------------------------------------------------------------
create function public.require_platform_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501', hint = 'Only the platform''s administrators can do this.';
  end if;
end $$;

create function public.normalize_hostname(p text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(regexp_replace(btrim(coalesce(p, '')), '^https?://', ''), '/.*$', ''))
$$;

-- Creates a store with its owner, settings (name and look), a delivery zone for all of
-- India and the usual couriers, ready for its owner to add products.
--   p: {name, slug, order_prefix, hostname?, owner_email?, colors?: {text, brand, accent, background},
--       heading_font?, body_font?, heading_italic?}
create function public.platform_create_store(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_slug text := lower(btrim(coalesce(p ->> 'slug', '')));
  v_prefix text := upper(btrim(coalesce(p ->> 'order_prefix', '')));
  v_host text := nullif(public.normalize_hostname(p ->> 'hostname'), '');
  v_owner uuid := (select auth.uid());
  v_store uuid;
  v_zone uuid;
begin
  perform public.require_platform_admin();
  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'invalid_store' using errcode = '22023', hint = 'Give the store a name of up to 80 characters.';
  end if;
  if v_slug = '' then
    v_slug := btrim(left(public.slugify(v_name), 40), '-');
  end if;
  if not public.is_slug(v_slug) or char_length(v_slug) > 40 then
    raise exception 'invalid_slug' using errcode = '22023', hint = 'The short name can use lowercase letters, numbers and single hyphens (up to 40).';
  end if;
  if exists (select 1 from public.stores where slug = v_slug) then
    raise exception 'duplicate_slug' using errcode = '23505', hint = format('Another store already uses the short name "%s".', v_slug);
  end if;
  if v_prefix = '' then
    v_prefix := upper(left(regexp_replace(v_slug, '[^a-z]', '', 'g'), 2));
  end if;
  if v_prefix !~ '^[A-Z]{2,4}$' then
    raise exception 'invalid_prefix' using errcode = '22023', hint = 'Order numbers start with 2 to 4 capital letters, like TA.';
  end if;
  if exists (select 1 from public.stores where order_prefix = v_prefix) then
    raise exception 'duplicate_prefix' using errcode = '23505', hint = format('Another store''s order numbers already start with %s.', v_prefix);
  end if;
  if v_host is not null and exists (select 1 from public.store_domains where hostname = v_host) then
    raise exception 'duplicate_domain' using errcode = '23505', hint = format('%s already belongs to a store.', v_host);
  end if;
  if nullif(btrim(coalesce(p ->> 'owner_email', '')), '') is not null then
    select id into v_owner from auth.users where lower(email) = lower(btrim(p ->> 'owner_email'));
    if v_owner is null then
      raise exception 'no_such_user' using errcode = 'P0001', hint = 'No account uses the owner''s email. Ask them to sign up first, or leave it empty to own the store yourself.';
    end if;
  end if;

  -- This function writes rows for a store other than the request's.
  perform set_config('app.cross_store', 'on', true);
  insert into public.stores (slug, name, order_prefix, created_by)
  values (v_slug, v_name, v_prefix, (select auth.uid()))
  returning id into v_store;
  if v_host is not null then
    insert into public.store_domains (hostname, store_id, is_primary) values (v_host, v_store, true);
  end if;
  insert into public.store_settings (store_id, store_name, tagline, primary_color, brand_color, accent_color, background_color,
                                     heading_font, body_font, heading_italic)
  values (v_store, v_name, coalesce(left(p ->> 'tagline', 160), ''),
          coalesce(p -> 'colors' ->> 'text', '#1f1416'), coalesce(p -> 'colors' ->> 'brand', '#6b1d2e'),
          coalesce(p -> 'colors' ->> 'accent', '#b07d2b'), coalesce(p -> 'colors' ->> 'background', '#fbf6ee'),
          coalesce(p ->> 'heading_font', 'cormorant'), coalesce(p ->> 'body_font', 'jost'),
          coalesce((p ->> 'heading_italic')::boolean, true));
  insert into public.user_roles (store_id, user_id, role, granted_by) values (v_store, v_owner, 'owner', (select auth.uid()));
  insert into public.shipping_zones (store_id, name, countries, priority) values (v_store, 'All India', array['IN'], 0)
  returning id into v_zone;
  insert into public.shipping_rates (store_id, zone_id, name, description, price, free_over, min_days, max_days, cod_available, sort_order)
  values (v_store, v_zone, 'Standard', 'Tracked delivery', 9900, null, 3, 7, true, 1),
         (v_store, v_zone, 'Express', 'Priority dispatch', 24900, null, 1, 3, false, 2);
  insert into public.shipping_providers (store_id, name)
  select v_store, x from unnest(array['Delhivery', 'Blue Dart', 'DTDC', 'India Post', 'Ekart', 'Shiprocket', 'Other']) x;
  perform public.write_audit('store.create', 'store', v_store::text,
    jsonb_build_object('name', v_name, 'slug', v_slug, 'hostname', v_host, 'owner', v_owner), v_store);
  perform set_config('app.cross_store', '', true);
  return v_store;
end $$;

-- Renames a store, or suspends it (its storefront closes; staff can still sign in).
create function public.platform_update_store(p_store_id uuid, p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := nullif(btrim(coalesce(p ->> 'name', '')), '');
  v_status text := nullif(p ->> 'status', '');
begin
  perform public.require_platform_admin();
  if v_status is not null and v_status not in ('active', 'suspended') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  if v_status = 'suspended' and exists (select 1 from public.stores where id = p_store_id and is_home) then
    raise exception 'home_store' using errcode = 'P0001', hint = 'The main store can''t be suspended.';
  end if;
  update public.stores set name = coalesce(left(v_name, 80), name), status = coalesce(v_status, status) where id = p_store_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform set_config('app.cross_store', 'on', true);
  perform public.write_audit('store.update', 'store', p_store_id::text, p, p_store_id);
  perform set_config('app.cross_store', '', true);
end $$;

create function public.platform_add_domain(p_store_id uuid, p_hostname text, p_primary boolean default true) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_host text := public.normalize_hostname(p_hostname);
begin
  perform public.require_platform_admin();
  if not exists (select 1 from public.stores where id = p_store_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_host !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{2,5})?$' then
    raise exception 'invalid_domain' using errcode = '22023', hint = 'Enter a web address like mystore.vercel.app or shop.example.com.';
  end if;
  if exists (select 1 from public.store_domains where hostname = v_host and store_id <> p_store_id) then
    raise exception 'duplicate_domain' using errcode = '23505', hint = format('%s already belongs to another store.', v_host);
  end if;
  if p_primary then
    update public.store_domains set is_primary = false where store_id = p_store_id and is_primary and hostname <> v_host;
  end if;
  insert into public.store_domains (hostname, store_id, is_primary) values (v_host, p_store_id, p_primary)
  on conflict (hostname) do update set is_primary = excluded.is_primary;
  perform set_config('app.cross_store', 'on', true);
  perform public.write_audit('store.domain_add', 'store', p_store_id::text, jsonb_build_object('hostname', v_host), p_store_id);
  perform set_config('app.cross_store', '', true);
  return v_host;
end $$;

create function public.platform_remove_domain(p_hostname text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_store uuid;
begin
  perform public.require_platform_admin();
  delete from public.store_domains where hostname = public.normalize_hostname(p_hostname) returning store_id into v_store;
  if v_store is not null then
    perform set_config('app.cross_store', 'on', true);
    perform public.write_audit('store.domain_remove', 'store', v_store::text, jsonb_build_object('hostname', p_hostname), v_store);
    perform set_config('app.cross_store', '', true);
  end if;
end $$;

-- Every store with what its admin list shows.
create function public.platform_stores()
returns table (id uuid, slug text, name text, status text, is_home boolean, order_prefix text, created_at timestamptz,
               domains jsonb, owners jsonb, products bigint, orders bigint)
language sql stable security definer set search_path = '' as $$
  select s.id, s.slug, s.name, s.status, s.is_home, s.order_prefix, s.created_at,
    coalesce((select jsonb_agg(jsonb_build_object('hostname', d.hostname, 'is_primary', d.is_primary) order by d.is_primary desc, d.hostname)
              from public.store_domains d where d.store_id = s.id), '[]'),
    coalesce((select jsonb_agg(u.email order by u.email) from public.user_roles r join auth.users u on u.id = r.user_id
              where r.store_id = s.id and r.role = 'owner'), '[]'),
    (select count(*) from public.products p where p.store_id = s.id and p.status <> 'archived'),
    (select count(*) from public.orders o where o.store_id = s.id and o.status in ('confirmed', 'completed'))
  from public.stores s
  where public.is_platform_admin()
  order by s.is_home desc, s.created_at
$$;

-- The stores the signed-in person works at, for the admin's store switcher.
create function public.my_stores()
returns table (id uuid, slug text, name text, status text, is_home boolean, role public.app_role, primary_host text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.slug, s.name, s.status, s.is_home,
    coalesce(r.role, 'owner'::public.app_role),
    (select d.hostname from public.store_domains d where d.store_id = s.id order by d.is_primary desc, d.created_at limit 1)
  from public.stores s
  left join public.user_roles r on r.store_id = s.id and r.user_id = (select auth.uid())
  where (select auth.uid()) is not null and (r.user_id is not null or public.is_platform_admin())
  order by s.is_home desc, s.name
$$;

create function public.platform_grant_admin(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  perform public.require_platform_admin();
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'no_such_user' using errcode = 'P0001', hint = 'No account uses that email. Ask them to sign up first.';
  end if;
  insert into public.platform_admins (user_id, granted_by) values (v_user, (select auth.uid())) on conflict do nothing;
  perform public.write_audit('platform.grant_admin', 'user', v_user::text, jsonb_build_object('email', p_email), null);
  return v_user;
end $$;

revoke execute on function public.require_platform_admin(), public.platform_create_store(jsonb), public.platform_update_store(uuid, jsonb),
  public.platform_add_domain(uuid, text, boolean), public.platform_remove_domain(text), public.platform_stores(), public.my_stores(),
  public.platform_grant_admin(text) from public, anon;
grant execute on function public.require_platform_admin(), public.platform_create_store(jsonb), public.platform_update_store(uuid, jsonb),
  public.platform_add_domain(uuid, text, boolean), public.platform_remove_domain(text), public.platform_stores(), public.my_stores(),
  public.platform_grant_admin(text) to authenticated, service_role;
grant execute on function public.normalize_hostname(text) to anon, authenticated, service_role;

revoke execute on function public.inherit_store(), public.guard_store(), public.orders_number() from public, anon, authenticated;

-- The server's service role uses every table and function, as before.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
