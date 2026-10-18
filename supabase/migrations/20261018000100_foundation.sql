-- Foundation: shared types, staff roles, customer profiles, store settings, audit log
-- and rate limiting. Every later migration builds on these.
--
-- Conventions used throughout the schema:
--   * Money is stored as integer minor units (paise for INR) in the money_minor domain.
--   * Functions that bypass row-level security are SECURITY DEFINER with an empty
--     search_path and fully qualified names.
--   * Functions meant only for the Next.js server (checkout, payments, webhooks) are
--     executable by service_role alone; the server derives the caller from a verified session.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create domain public.money_minor as bigint check (value >= 0);

create type public.app_role as enum ('owner', 'admin', 'staff');
create type public.product_status as enum ('draft', 'active', 'archived');
create type public.order_status as enum ('pending_payment', 'confirmed', 'completed', 'cancelled');
create type public.order_payment_status as enum ('pending', 'unpaid', 'paid', 'partially_refunded', 'refunded', 'failed', 'voided');
create type public.fulfillment_status as enum ('unfulfilled', 'processing', 'packed', 'shipped', 'delivered', 'returned');
create type public.payment_provider as enum ('razorpay', 'stripe', 'cod', 'manual');
create type public.payment_state as enum ('created', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded');
create type public.refund_state as enum ('pending', 'processed', 'failed');
create type public.return_kind as enum ('return', 'cancellation');
create type public.return_state as enum ('requested', 'approved', 'rejected', 'received', 'refunded', 'closed');
create type public.review_state as enum ('pending', 'published', 'rejected');
create type public.discount_kind as enum ('percentage', 'fixed', 'free_shipping');
create type public.inventory_reason as enum ('initial', 'restock', 'adjustment', 'correction', 'damaged', 'sale', 'cancellation', 'return', 'import');
create type public.collection_kind as enum ('manual', 'automated');

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create function public.is_slug(s text) returns boolean
language sql immutable set search_path = '' as $$
  select s ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(s) <= 120
$$;

create function public.is_hex_color(s text) returns boolean
language sql immutable set search_path = '' as $$
  select s ~ '^#[0-9a-fA-F]{6}$'
$$;

-- ---------------------------------------------------------------------------
-- Profiles: one per auth user. There is deliberately no role column here, so a
-- customer editing their own profile can never grant themselves staff access.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '' check (char_length(full_name) <= 120),
  phone text not null default '' check (phone = '' or phone ~ '^\+?[0-9][0-9 ()-]{6,19}$'),
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_name_trgm on public.profiles using gin (lower(full_name) extensions.gin_trgm_ops);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Staff roles. Customers have no row. Only owners can grant or revoke roles, and
-- only through grant_role()/revoke_role(); the table has no write privileges.
-- ---------------------------------------------------------------------------
create table public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create function public.has_role(p_roles public.app_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles r
    where r.user_id = (select auth.uid()) and r.role = any (p_roles)
  )
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role(array['owner', 'admin', 'staff']::public.app_role[])
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role(array['owner', 'admin']::public.app_role[])
$$;

create function public.is_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role(array['owner']::public.app_role[])
$$;

create function public.my_role() returns public.app_role
language sql stable security definer set search_path = '' as $$
  select role from public.user_roles where user_id = (select auth.uid())
$$;

alter table public.user_roles enable row level security;
create policy user_roles_read on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

alter table public.profiles enable row level security;
create policy profiles_own_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));
create policy profiles_own_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Customers may edit only these columns of their own profile.
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, phone, marketing_opt_in) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Store settings: a single row the admin edits. Everything here is safe to show
-- publicly. API keys and secrets never live in the database; they are server
-- environment variables.
-- ---------------------------------------------------------------------------
create table public.store_settings (
  id smallint primary key default 1 check (id = 1),
  store_name text not null default 'Taana' check (char_length(store_name) between 1 and 80),
  tagline text not null default '' check (char_length(tagline) <= 160),
  logo_url text,
  primary_color text not null default '#111111' check (public.is_hex_color(primary_color)),
  accent_color text not null default '#8c6a43' check (public.is_hex_color(accent_color)),
  background_color text not null default '#f7f3ec' check (public.is_hex_color(background_color)),
  heading_font text not null default 'cormorant' check (heading_font in ('cormorant', 'playfair', 'bodoni', 'dm-serif')),
  body_font text not null default 'jost' check (body_font in ('jost', 'inter', 'manrope', 'dm-sans')),
  currency text not null default 'INR' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Asia/Kolkata',
  -- Taxes. Slabs pick a rate (basis points) by the discounted unit price, like India's
  -- GST on apparel: 5% up to ₹2,500 per piece and 18% above (rates from 22 Sep 2025;
  -- confirm with your tax advisor and edit in Admin > Settings > Taxes).
  tax_mode text not null default 'inclusive' check (tax_mode in ('inclusive', 'exclusive', 'none')),
  tax_label text not null default 'GST' check (char_length(tax_label) <= 20),
  tax_slabs jsonb not null default '[{"up_to": 250000, "rate_bps": 500}, {"up_to": null, "rate_bps": 1800}]'
    check (jsonb_typeof(tax_slabs) = 'array'),
  gstin text not null default '' check (char_length(gstin) <= 20),
  -- Shipping and inventory
  free_shipping_threshold public.money_minor,
  low_stock_threshold int not null default 5 check (low_stock_threshold between 0 and 10000),
  reservation_minutes int not null default 30 check (reservation_minutes between 10 and 180),
  -- Payments (credentials are environment variables; these only switch methods on or off)
  razorpay_enabled boolean not null default true,
  stripe_enabled boolean not null default false,
  cod_enabled boolean not null default true,
  cod_fee public.money_minor not null default 0,
  cod_min_order public.money_minor not null default 0,
  cod_max_order public.money_minor not null default 2500000,
  -- Returns
  return_window_days int not null default 15 check (return_window_days between 0 and 365),
  return_shipping text not null default 'free' check (return_shipping in ('free', 'customer_pays', 'deducted')),
  return_shipping_fee public.money_minor not null default 0,
  -- Content
  policies jsonb not null default '{}' check (jsonb_typeof(policies) = 'object'),
  faq jsonb not null default '[]' check (jsonb_typeof(faq) = 'array'),
  contact jsonb not null default '{}' check (jsonb_typeof(contact) = 'object'),
  social jsonb not null default '{}' check (jsonb_typeof(social) = 'object'),
  homepage jsonb not null default '{}' check (jsonb_typeof(homepage) = 'object'),
  email_templates jsonb not null default '{}' check (jsonb_typeof(email_templates) = 'object'),
  seo_title text not null default '' check (char_length(seo_title) <= 120),
  seo_description text not null default '' check (char_length(seo_description) <= 320),
  og_image_url text,
  reviews_enabled boolean not null default true,
  reviews_require_purchase boolean not null default true,
  reviews_auto_publish boolean not null default false,
  maintenance_mode boolean not null default false,
  maintenance_message text not null default 'We are updating the store. Please check back soon.',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create function public.store_settings_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end $$;
create trigger store_settings_stamp before update on public.store_settings
  for each row execute function public.store_settings_stamp();

alter table public.store_settings enable row level security;
create policy store_settings_read on public.store_settings for select to anon, authenticated using (true);
create policy store_settings_admin_update on public.store_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.store_settings from anon, authenticated;
grant select on public.store_settings to anon, authenticated;
grant update on public.store_settings to authenticated;

insert into public.store_settings (id, tagline, seo_title, seo_description, policies, faq, contact, social, homepage, email_templates)
values (
  1,
  'Considered clothing, made to last.',
  'Taana: considered clothing, made to last',
  'Shop new-season womenswear, menswear and accessories from independent labels. Free returns within 15 days.',
  jsonb_build_object(
    'shipping', E'We ship across India.\n\nOrders are packed within 1-2 working days. Delivery usually takes 2-7 working days depending on your PIN code; your order page shows the estimate for your address.\n\nYou will receive an email with a tracking link as soon as your parcel leaves our studio.\n\nReplace this sample policy with your own before launch.',
    'returns', E'You can return unworn items with their tags within 15 days of delivery.\n\nStart a return from your order page. Once we receive and check the items, we refund the original payment method within 5-7 working days. Cash on delivery orders are refunded by bank transfer.\n\nSale items, innerwear and earrings cannot be returned for hygiene reasons.\n\nReplace this sample policy with your own before launch.',
    'privacy', E'We collect the details you give us (name, email, phone, addresses) to deliver your orders and support you. Payments are processed by our payment partners; we never see or store your card details.\n\nWe do not sell your personal data. You can ask us to export or delete your data at any time by writing to our support email.\n\nReplace this sample policy with your own before launch.',
    'terms', E'By placing an order you agree to these terms. Prices include applicable taxes unless shown otherwise. We may cancel an order if an item turns out to be unavailable, in which case any payment is refunded in full.\n\nReplace these sample terms with your own before launch.',
    'about', E'Taana works with independent labels and craftspeople to bring together clothing that is made carefully and meant to be worn for years.'
  ),
  jsonb_build_array(
    jsonb_build_object('q', 'How long does delivery take?', 'a', 'Most orders arrive in 2-7 working days. Enter your PIN code on any product page to see the estimate for your address.'),
    jsonb_build_object('q', 'Can I pay cash on delivery?', 'a', 'Yes, for most PIN codes and orders up to ₹25,000. Available options are shown at checkout.'),
    jsonb_build_object('q', 'How do returns work?', 'a', 'Unworn items with tags can be returned within 15 days of delivery. Start a return from your order page.'),
    jsonb_build_object('q', 'How do I find my size?', 'a', 'Every product page has a size guide with garment measurements. If you are between sizes, the product''s fit notes tell you which way to go.')
  ),
  jsonb_build_object('email', 'care@example.com', 'phone', '+91 00000 00000', 'whatsapp', '', 'address', 'Studio address, City, State PIN', 'hours', 'Mon-Sat, 10am-7pm IST'),
  jsonb_build_object('instagram', '', 'facebook', '', 'x', '', 'pinterest', '', 'youtube', ''),
  jsonb_build_object('announcement', '', 'hero', '[]'::jsonb, 'promos', '[]'::jsonb),
  jsonb_build_object(
    'order_confirmation', jsonb_build_object('subject', 'Order {{order_number}} confirmed', 'body', E'Hi {{customer_name}},\n\nThank you for your order. We''re getting it ready and will email you when it ships.'),
    'order_shipped', jsonb_build_object('subject', 'Your order {{order_number}} is on its way', 'body', E'Hi {{customer_name}},\n\nYour order has shipped with {{carrier}}. Tracking number: {{tracking_number}}.'),
    'order_delivered', jsonb_build_object('subject', 'Your order {{order_number}} was delivered', 'body', E'Hi {{customer_name}},\n\nYour order was delivered. We hope you love it. If anything is not right, you can start a return from your order page.'),
    'order_cancelled', jsonb_build_object('subject', 'Order {{order_number}} was cancelled', 'body', E'Hi {{customer_name}},\n\nYour order has been cancelled. If you paid online, any refund due is shown on your order page.'),
    'refund_processed', jsonb_build_object('subject', 'Refund for order {{order_number}}', 'body', E'Hi {{customer_name}},\n\nWe have refunded {{refund_amount}} to your original payment method. Banks usually take 5-7 working days to show it.'),
    'return_update', jsonb_build_object('subject', 'Update on your return for order {{order_number}}', 'body', E'Hi {{customer_name}},\n\nYour return request is now: {{return_status}}.')
  )
);

-- ---------------------------------------------------------------------------
-- Audit log: immutable record of sensitive changes. Rows are written by triggers
-- and by audited functions, never by API clients.
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  changes jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

alter table public.audit_logs enable row level security;
create policy audit_logs_admin_read on public.audit_logs for select to authenticated
  using ((select public.is_admin()));
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create function public.write_audit(p_action text, p_entity_type text, p_entity_id text, p_changes jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := (select auth.uid());
begin
  insert into public.audit_logs (actor_id, actor_email, action, entity_type, entity_id, changes)
  values (v_actor, (select u.email from auth.users u where u.id = v_actor), p_action, p_entity_type, p_entity_id, coalesce(p_changes, '{}'));
end $$;
revoke execute on function public.write_audit(text, text, text, jsonb) from public, anon, authenticated;

-- Staff call this for actions that change nothing in the database but still need a
-- record, such as exporting customer data.
create function public.log_admin_action(p_action text, p_entity_type text, p_entity_id text default null, p_details jsonb default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.write_audit(left(p_action, 80), left(p_entity_type, 80), left(p_entity_id, 120), p_details);
end $$;
revoke execute on function public.log_admin_action(text, text, text, jsonb) from public, anon;
grant execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;

-- Generic row-change audit trigger. Trigger arguments name columns to leave out of
-- the diff (timestamps, derived columns). Updates that change only those are skipped.
create function public.audit_row_change() returns trigger
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
    v_diff
  );
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Role management. Owners grant roles to people who already have an account.
-- ---------------------------------------------------------------------------
create function public.grant_role(p_email text, p_role public.app_role) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
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
  select role into v_old from public.user_roles where user_id = v_user;
  if v_old = 'owner' and p_role <> 'owner'
     and (select count(*) from public.user_roles where role = 'owner') <= 1 then
    raise exception 'last_owner' using errcode = 'P0001', hint = 'The store must keep at least one owner.';
  end if;
  insert into public.user_roles (user_id, role, granted_by)
  values (v_user, p_role, (select auth.uid()))
  on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by;
  return v_user;
end $$;
revoke execute on function public.grant_role(text, public.app_role) from public, anon;
grant execute on function public.grant_role(text, public.app_role) to authenticated;

create function public.revoke_role(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_old public.app_role;
begin
  if not public.is_owner() then
    raise exception 'forbidden' using errcode = '42501', hint = 'Only owners can manage staff.';
  end if;
  select role into v_old from public.user_roles where user_id = p_user_id;
  if v_old = 'owner' and (select count(*) from public.user_roles where role = 'owner') <= 1 then
    raise exception 'last_owner' using errcode = 'P0001', hint = 'The store must keep at least one owner.';
  end if;
  delete from public.user_roles where user_id = p_user_id;
end $$;
revoke execute on function public.revoke_role(uuid) from public, anon;
grant execute on function public.revoke_role(uuid) to authenticated;

-- First-owner setup. Runs only while the store has no owner, and only from the SQL
-- editor or the service role (never from the public API).
create function public.bootstrap_owner(p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if exists (select 1 from public.user_roles where role = 'owner') then
    raise exception 'owner_exists' using errcode = 'P0001', hint = 'An owner already exists. Owners can add staff from Admin > Staff.';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'no_such_user' using errcode = 'P0001', hint = 'Sign up on the store with this email first, then run this again.';
  end if;
  insert into public.user_roles (user_id, role) values (v_user, 'owner')
  on conflict (user_id) do update set role = 'owner';
  return v_user;
end $$;
revoke execute on function public.bootstrap_owner(text) from public, anon, authenticated;
grant execute on function public.bootstrap_owner(text) to service_role;

grant execute on function public.has_role(public.app_role[]) to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_owner() to anon, authenticated;
grant execute on function public.my_role() to authenticated;

-- ---------------------------------------------------------------------------
-- Rate limiting for sensitive endpoints (checkout, coupons, contact forms). Called by
-- the server with the service role; a fixed window per key, shared by all instances.
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits int not null
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create function public.rate_limit_hit(p_key text, p_max int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_hits int;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (left(p_key, 200), now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into v_hits;
  return v_hits <= p_max;
end $$;
revoke execute on function public.rate_limit_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int) to service_role;
