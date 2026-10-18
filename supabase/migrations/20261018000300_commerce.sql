-- Commerce: customer addresses, carts, wishlists, coupons, shipping, orders, payments,
-- refunds, shipments, reviews, returns, support notes and outgoing email.
--
-- Carts, checkout and payment rows are written only by SECURITY DEFINER functions that
-- the Next.js server calls with the service role (see 20261018000500_checkout.sql). API
-- clients get read access to their own rows at most.

create function public.is_phone(s text) returns boolean
language sql immutable set search_path = '' as $$
  select s ~ '^\+?[0-9][0-9 ()-]{6,19}$'
$$;

create function public.is_email(s text) returns boolean
language sql immutable set search_path = '' as $$
  select s ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(s) <= 254
$$;

create table public.customer_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default '' check (char_length(label) <= 40),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  phone text not null check (public.is_phone(phone)),
  line1 text not null check (char_length(btrim(line1)) between 1 and 200),
  line2 text not null default '' check (char_length(line2) <= 200),
  landmark text not null default '' check (char_length(landmark) <= 120),
  city text not null check (char_length(btrim(city)) between 1 and 100),
  state text not null check (char_length(btrim(state)) between 1 and 100),
  postal_code text not null check (postal_code ~ '^[A-Za-z0-9 -]{3,10}$'),
  country text not null default 'IN' check (country ~ '^[A-Z]{2}$'),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (country <> 'IN' or postal_code ~ '^[1-9][0-9]{5}$')
);
create index customer_addresses_user_idx on public.customer_addresses (user_id);
create unique index customer_addresses_one_default on public.customer_addresses (user_id) where is_default;
create trigger customer_addresses_touch before update on public.customer_addresses
  for each row execute function public.touch_updated_at();

create function public.customer_addresses_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and (select count(*) from public.customer_addresses where user_id = new.user_id) >= 20 then
    raise exception 'too_many_addresses' using errcode = 'P0001', hint = 'You can save up to 20 addresses.';
  end if;
  if new.is_default then
    update public.customer_addresses set is_default = false
    where user_id = new.user_id and id <> new.id and is_default;
  elsif not exists (select 1 from public.customer_addresses where user_id = new.user_id and id <> new.id) then
    new.is_default := true;
  end if;
  return new;
end $$;
create trigger customer_addresses_before_write before insert or update on public.customer_addresses
  for each row execute function public.customer_addresses_before_write();

-- ---------------------------------------------------------------------------
-- Carts. A signed-in customer has one cart (user_id); a guest cart is found by the
-- SHA-256 hash of a random token kept in an httpOnly cookie.
-- ---------------------------------------------------------------------------
create table public.carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete cascade,
  token_hash text unique,
  coupon_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id is not null or token_hash is not null)
);
create index carts_updated_idx on public.carts (updated_at);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts (id) on delete cascade,
  variant_id uuid not null references public.product_variants (id) on delete cascade,
  quantity int not null check (quantity between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, variant_id)
);
create index cart_items_variant_idx on public.cart_items (variant_id);

create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.wishlist_items (
  wishlist_id uuid not null references public.wishlists (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  variant_id uuid references public.product_variants (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (wishlist_id, product_id)
);
create index wishlist_items_product_idx on public.wishlist_items (product_id);

-- ---------------------------------------------------------------------------
-- Coupons. value is basis points for percentage coupons (1000 = 10%) and minor
-- units for fixed ones. Targets are id arrays so the editor stays simple.
-- ---------------------------------------------------------------------------
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,40}$'),
  description text not null default '' check (char_length(description) <= 500),
  kind public.discount_kind not null,
  value bigint not null default 0 check (value >= 0),
  max_discount public.money_minor,
  min_subtotal public.money_minor not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit int check (usage_limit > 0),
  usage_limit_per_customer int check (usage_limit_per_customer > 0),
  first_order_only boolean not null default false,
  applies_to text not null default 'all' check (applies_to in ('all', 'products', 'categories', 'collections')),
  product_ids uuid[] not null default '{}',
  category_ids uuid[] not null default '{}',
  collection_ids uuid[] not null default '{}',
  customer_emails text[] not null default '{}',
  is_active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percentage' or value between 1 and 10000),
  check (kind <> 'fixed' or value > 0),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create trigger coupons_touch before update on public.coupons
  for each row execute function public.touch_updated_at();

create function public.coupons_normalize() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.code := upper(btrim(new.code));
  new.customer_emails := coalesce((select array_agg(distinct lower(btrim(e))) from unnest(new.customer_emails) e where btrim(e) <> ''), '{}');
  return new;
end $$;
create trigger coupons_normalize before insert or update on public.coupons
  for each row execute function public.coupons_normalize();

-- ---------------------------------------------------------------------------
-- Shipping. The best matching active zone (most specific, then highest priority)
-- decides which rates a delivery address gets.
-- ---------------------------------------------------------------------------
create table public.shipping_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  countries text[] not null default '{IN}',
  states text[] not null default '{}',
  postal_prefixes text[] not null default '{}',
  priority int not null default 0,
  cod_available boolean not null default true,
  is_active boolean not null default true,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger shipping_zones_touch before update on public.shipping_zones
  for each row execute function public.touch_updated_at();

create table public.shipping_rates (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.shipping_zones (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 200),
  price public.money_minor not null default 0,
  free_over public.money_minor,
  min_days int not null default 3 check (min_days between 0 and 60),
  max_days int not null default 7 check (max_days between 0 and 90),
  cod_available boolean not null default true,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (max_days >= min_days)
);
create index shipping_rates_zone_idx on public.shipping_rates (zone_id, sort_order);
create trigger shipping_rates_touch before update on public.shipping_rates
  for each row execute function public.touch_updated_at();

-- PIN codes the store cannot deliver to ('all') or cannot take cash on delivery for ('cod').
create table public.postal_code_rules (
  postal_code text primary key check (postal_code ~ '^[A-Za-z0-9 -]{3,10}$'),
  blocks text not null default 'all' check (blocks in ('all', 'cod')),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

create table public.shipping_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(btrim(name)) between 1 and 80),
  -- {tracking} is replaced with the tracking number, e.g. https://carrier.example/track/{tracking}
  tracking_url_template text not null default '' check (tracking_url_template = '' or tracking_url_template ~ '^https://'),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Orders. Item names, variants and prices are copied onto the order so history stays
-- accurate after the catalog changes. payment_status and fulfillment_status are
-- independent; status is the order's overall lifecycle.
-- ---------------------------------------------------------------------------
create sequence public.order_number_seq start 100001;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('TA' || nextval('public.order_number_seq')::text),
  user_id uuid references auth.users (id) on delete set null,
  cart_id uuid references public.carts (id) on delete set null,
  email text not null check (public.is_email(email)),
  phone text not null default '' check (phone = '' or public.is_phone(phone)),
  customer_name text not null default '',
  status public.order_status not null default 'pending_payment',
  payment_status public.order_payment_status not null default 'pending',
  fulfillment_status public.fulfillment_status not null default 'unfulfilled',
  payment_method text not null check (payment_method in ('razorpay', 'stripe', 'cod', 'none')),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  subtotal public.money_minor not null,
  discount_total public.money_minor not null default 0,
  shipping_total public.money_minor not null default 0,
  cod_fee public.money_minor not null default 0,
  tax_total public.money_minor not null default 0,
  grand_total public.money_minor not null,
  amount_refunded public.money_minor not null default 0,
  tax_mode text not null check (tax_mode in ('inclusive', 'exclusive', 'none')),
  tax_label text not null default 'GST',
  coupon_code text,
  shipping_address jsonb not null check (jsonb_typeof(shipping_address) = 'object'),
  billing_address jsonb check (billing_address is null or jsonb_typeof(billing_address) = 'object'),
  shipping_rate_id uuid references public.shipping_rates (id) on delete set null,
  shipping_method jsonb not null default '{}',
  customer_note text not null default '' check (char_length(customer_note) <= 500),
  idempotency_key uuid unique,
  expires_at timestamptz,
  placed_at timestamptz not null default now(),
  paid_at timestamptz,
  shipped_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  needs_attention boolean not null default false,
  attention_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (grand_total = subtotal - discount_total + shipping_total + cod_fee
         + case when tax_mode = 'exclusive' then tax_total else 0 end),
  check (amount_refunded <= grand_total)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_created_idx on public.orders (created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_payment_status_idx on public.orders (payment_status);
create index orders_fulfillment_idx on public.orders (fulfillment_status);
create index orders_email_idx on public.orders (lower(email));
create index orders_expiring_idx on public.orders (expires_at) where status = 'pending_payment';
create index orders_cart_idx on public.orders (cart_id) where status = 'pending_payment';
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

alter table public.inventory_movements
  add constraint inventory_movements_order_fk foreign key (order_id) references public.orders (id) on delete set null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_title text not null,
  product_slug text not null default '',
  brand_name text not null default '',
  variant_title text not null default '',
  size text not null default '',
  color text not null default '',
  sku text not null,
  image_url text,
  unit_price public.money_minor not null,
  compare_at_price public.money_minor,
  quantity int not null check (quantity > 0),
  discount_amount public.money_minor not null default 0,
  tax_rate_bps int not null default 0,
  tax_amount public.money_minor not null default 0,
  line_total public.money_minor not null,
  is_returnable boolean not null default true,
  return_window_days int not null default 0,
  quantity_returned int not null default 0,
  created_at timestamptz not null default now(),
  check (quantity_returned between 0 and quantity)
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);
create index order_items_variant_idx on public.order_items (variant_id);

-- The order timeline. is_internal rows (staff notes) are hidden from customers.
create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  kind text not null,
  message text not null default '',
  data jsonb not null default '{}',
  is_internal boolean not null default false,
  actor_id uuid references auth.users (id) on delete set null,
  actor_type text not null default 'system' check (actor_type in ('customer', 'staff', 'system', 'provider')),
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

create table public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons (id) on delete cascade,
  order_id uuid not null unique references public.orders (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  email text not null,
  amount public.money_minor not null,
  voided_at timestamptz,
  created_at timestamptz not null default now()
);
create index coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id) where voided_at is null;
create index coupon_redemptions_email_idx on public.coupon_redemptions (coupon_id, lower(email)) where voided_at is null;

-- One row per payment attempt (Razorpay payment, Stripe payment intent, COD collection).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  provider public.payment_provider not null,
  provider_order_id text,
  provider_payment_id text,
  amount public.money_minor not null,
  currency text not null,
  status public.payment_state not null default 'created',
  method text,
  amount_refunded public.money_minor not null default 0,
  error_code text,
  error_description text,
  details jsonb not null default '{}',
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_payment_id),
  check (amount_refunded <= amount)
);
create index payments_order_idx on public.payments (order_id, created_at);
create index payments_provider_order_idx on public.payments (provider, provider_order_id);
create index payments_created_idx on public.payments (created_at desc);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- Every webhook delivery we accept, keyed by the provider's event id so a retried or
-- duplicated delivery is recognised and processed once.
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider public.payment_provider not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  order_id uuid references public.orders (id) on delete set null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, event_id)
);
create index payment_events_received_idx on public.payment_events (received_at desc);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  carrier text not null default '' check (char_length(carrier) <= 80),
  tracking_number text not null default '' check (char_length(tracking_number) <= 80),
  tracking_url text not null default '' check (tracking_url = '' or tracking_url ~ '^https?://'),
  status text not null default 'shipped' check (status in ('packed', 'shipped', 'delivered', 'returned')),
  shipped_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipments_order_idx on public.shipments (order_id);
create trigger shipments_touch before update on public.shipments
  for each row execute function public.touch_updated_at();

create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid references public.orders (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  title text not null default '' check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 3000),
  author_name text not null default '' check (char_length(author_name) <= 80),
  is_verified_purchase boolean not null default false,
  status public.review_state not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, user_id)
);
create index product_reviews_product_idx on public.product_reviews (product_id, status, created_at desc);
create trigger product_reviews_touch before update on public.product_reviews
  for each row execute function public.touch_updated_at();

create function public.refresh_product_rating() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_product uuid := coalesce(new.product_id, old.product_id);
begin
  update public.products p set
    rating_avg = r.avg_rating,
    rating_count = r.n
  from (
    select round(avg(rating)::numeric, 2) as avg_rating, count(*)::int as n
    from public.product_reviews where product_id = v_product and status = 'published'
  ) r
  where p.id = v_product;
  return null;
end $$;
create trigger product_reviews_rating after insert or update or delete on public.product_reviews
  for each row execute function public.refresh_product_rating();

create table public.return_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  kind public.return_kind not null,
  status public.return_state not null default 'requested',
  reason text not null check (char_length(btrim(reason)) between 1 and 100),
  details text not null default '' check (char_length(details) <= 2000),
  refund_amount public.money_minor,
  admin_note text not null default '' check (char_length(admin_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index return_requests_order_idx on public.return_requests (order_id);
create index return_requests_status_idx on public.return_requests (status, created_at desc);
create unique index return_requests_one_open_cancellation on public.return_requests (order_id)
  where kind = 'cancellation' and status = 'requested';
create trigger return_requests_touch before update on public.return_requests
  for each row execute function public.touch_updated_at();

create table public.return_request_items (
  return_request_id uuid not null references public.return_requests (id) on delete cascade,
  order_item_id uuid not null references public.order_items (id) on delete cascade,
  quantity int not null check (quantity > 0),
  primary key (return_request_id, order_item_id)
);

create table public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  payment_id uuid references public.payments (id) on delete set null,
  return_request_id uuid references public.return_requests (id) on delete set null,
  provider public.payment_provider not null,
  provider_refund_id text,
  amount public.money_minor not null check (amount > 0),
  reason text not null default '' check (char_length(reason) <= 500),
  status public.refund_state not null default 'pending',
  error text,
  reference text not null default '' check (char_length(reference) <= 120),
  initiated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (provider, provider_refund_id)
);
create index refunds_order_idx on public.refunds (order_id);
create index refunds_created_idx on public.refunds (created_at desc);
create trigger refunds_touch before update on public.refunds
  for each row execute function public.touch_updated_at();

create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index customer_notes_customer_idx on public.customer_notes (customer_id, created_at desc);

create table public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null check (public.is_email(email)),
  source text not null default 'footer' check (char_length(source) <= 40),
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);
create unique index newsletter_subscribers_email_key on public.newsletter_subscribers (lower(email));

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  email text not null check (public.is_email(email)),
  order_number text not null default '' check (char_length(order_number) <= 40),
  subject text not null default '' check (char_length(subject) <= 200),
  message text not null check (char_length(btrim(message)) between 1 and 5000),
  status text not null default 'new' check (status in ('new', 'open', 'closed')),
  created_at timestamptz not null default now()
);
create index contact_messages_created_idx on public.contact_messages (status, created_at desc);

-- Outgoing customer email. Functions queue a row when something happens; the server
-- renders and sends it (and retries failures), so a slow mail provider never blocks
-- checkout or a webhook.
create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null check (public.is_email(to_email)),
  template text not null,
  data jsonb not null default '{}',
  order_id uuid references public.orders (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_queue_idx on public.email_outbox (status, created_at) where status in ('queued', 'failed');
create index email_outbox_order_idx on public.email_outbox (order_id);

create function public.queue_email(p_to text, p_template text, p_order_id uuid, p_data jsonb default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_to is null or not public.is_email(p_to) then
    return;
  end if;
  insert into public.email_outbox (to_email, template, order_id, data)
  values (lower(p_to), p_template, p_order_id, coalesce(p_data, '{}'));
end $$;
revoke execute on function public.queue_email(text, text, uuid, jsonb) from public, anon, authenticated;

create function public.add_order_event(
  p_order_id uuid, p_kind text, p_message text, p_data jsonb default '{}',
  p_internal boolean default false, p_actor_type text default 'system', p_actor_id uuid default null
) returns void
language sql security definer set search_path = '' as $$
  insert into public.order_events (order_id, kind, message, data, is_internal, actor_type, actor_id)
  values (p_order_id, p_kind, p_message, coalesce(p_data, '{}'), p_internal, p_actor_type, coalesce(p_actor_id, (select auth.uid())));
$$;
revoke execute on function public.add_order_event(uuid, text, text, jsonb, boolean, text, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.customer_addresses enable row level security;
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
alter table public.shipping_zones enable row level security;
alter table public.shipping_rates enable row level security;
alter table public.postal_code_rules enable row level security;
alter table public.shipping_providers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.shipments enable row level security;
alter table public.product_reviews enable row level security;
alter table public.return_requests enable row level security;
alter table public.return_request_items enable row level security;
alter table public.refunds enable row level security;
alter table public.customer_notes enable row level security;
alter table public.newsletter_subscribers enable row level security;
alter table public.contact_messages enable row level security;
alter table public.email_outbox enable row level security;

revoke all on public.customer_addresses, public.carts, public.cart_items, public.wishlists, public.wishlist_items,
  public.coupons, public.coupon_redemptions, public.shipping_zones, public.shipping_rates, public.postal_code_rules,
  public.shipping_providers, public.orders, public.order_items, public.order_events, public.payments,
  public.payment_events, public.shipments, public.product_reviews, public.return_requests,
  public.return_request_items, public.refunds, public.customer_notes, public.newsletter_subscribers,
  public.contact_messages, public.email_outbox
  from anon, authenticated;
revoke all on sequence public.order_number_seq from anon, authenticated;

-- Customers: their own addresses and wishlist.
create policy customer_addresses_own on public.customer_addresses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy customer_addresses_staff_read on public.customer_addresses for select to authenticated
  using ((select public.is_staff()));
grant select, insert, update, delete on public.customer_addresses to authenticated;

create policy wishlists_own on public.wishlists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy wishlist_items_own on public.wishlist_items for all to authenticated
  using (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())))
  with check (exists (select 1 from public.wishlists w where w.id = wishlist_id and w.user_id = (select auth.uid())));
grant select, insert, delete on public.wishlists, public.wishlist_items to authenticated;

-- Customers read their own orders and what hangs off them; staff read every order.
-- No API client writes orders directly: every change goes through a function that
-- applies the business rules.
create policy orders_read on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));
create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or (select public.is_staff()))));
create policy order_events_read on public.order_events for select to authenticated
  using (
    (select public.is_staff())
    or (not is_internal and exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())))
  );
create policy shipments_read on public.shipments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or (select public.is_staff()))));
create policy refunds_read on public.refunds for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = (select auth.uid()) or (select public.is_admin()))));
create policy return_requests_read on public.return_requests for select to authenticated
  using (user_id = (select auth.uid()) or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())) or (select public.is_staff()));
create policy return_request_items_read on public.return_request_items for select to authenticated
  using (exists (
    select 1 from public.return_requests r join public.orders o on o.id = r.order_id
    where r.id = return_request_id and (o.user_id = (select auth.uid()) or (select public.is_staff()))
  ));
-- Checkout internals (idempotency key, cart link) are not exposed to API clients.
grant select (id, order_number, user_id, email, phone, customer_name, status, payment_status, fulfillment_status,
  payment_method, currency, subtotal, discount_total, shipping_total, cod_fee, tax_total, grand_total, amount_refunded,
  tax_mode, tax_label, coupon_code, shipping_address, billing_address, shipping_rate_id, shipping_method, customer_note,
  expires_at, placed_at, paid_at, shipped_at, delivered_at, cancelled_at, cancel_reason, needs_attention, attention_reason,
  created_at, updated_at)
  on public.orders to authenticated;
grant select on public.order_items, public.order_events, public.shipments, public.refunds,
  public.return_requests, public.return_request_items to authenticated;

-- Payments: admins only (staff see the order's payment_status).
create policy payments_admin_read on public.payments for select to authenticated using ((select public.is_admin()));
create policy payment_events_admin_read on public.payment_events for select to authenticated using ((select public.is_admin()));
grant select on public.payments, public.payment_events to authenticated;

-- Reviews: published ones are public; authors see their own; staff moderate.
create policy product_reviews_public_read on public.product_reviews for select to anon, authenticated
  using (status = 'published' or user_id = (select auth.uid()) or (select public.is_staff()));
create policy product_reviews_staff_update on public.product_reviews for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy product_reviews_staff_delete on public.product_reviews for delete to authenticated
  using ((select public.is_staff()));
grant select on public.product_reviews to anon, authenticated;
grant update (status), delete on public.product_reviews to authenticated;

-- Store configuration that staff/admins manage.
create policy coupons_staff_read on public.coupons for select to authenticated using ((select public.is_staff()));
create policy coupons_admin_write on public.coupons for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy coupon_redemptions_staff_read on public.coupon_redemptions for select to authenticated using ((select public.is_staff()));
grant select, insert, update, delete on public.coupons to authenticated;
grant select on public.coupon_redemptions to authenticated;

create policy shipping_zones_read on public.shipping_zones for select to authenticated using ((select public.is_staff()));
create policy shipping_zones_admin_write on public.shipping_zones for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy shipping_rates_read on public.shipping_rates for select to authenticated using ((select public.is_staff()));
create policy shipping_rates_admin_write on public.shipping_rates for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy postal_code_rules_read on public.postal_code_rules for select to authenticated using ((select public.is_staff()));
create policy postal_code_rules_admin_write on public.postal_code_rules for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy shipping_providers_read on public.shipping_providers for select to authenticated using ((select public.is_staff()));
create policy shipping_providers_admin_write on public.shipping_providers for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.shipping_zones, public.shipping_rates, public.postal_code_rules,
  public.shipping_providers to authenticated;

create policy customer_notes_staff on public.customer_notes for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()) and author_id = (select auth.uid()));
grant select, insert, delete on public.customer_notes to authenticated;

create policy newsletter_admin_read on public.newsletter_subscribers for select to authenticated using ((select public.is_admin()));
grant select on public.newsletter_subscribers to authenticated;

create policy contact_messages_staff on public.contact_messages for select to authenticated using ((select public.is_staff()));
create policy contact_messages_staff_update on public.contact_messages for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
grant select, update (status) on public.contact_messages to authenticated;

create policy email_outbox_admin_read on public.email_outbox for select to authenticated using ((select public.is_admin()));
grant select on public.email_outbox to authenticated;
