-- Stores of every kind: clothing, shoes, pet supplies, instruments, groceries and more.
--
-- 1. store_settings.store_type: what the store sells (src/lib/store-types.ts). It sets the
--    words the storefront uses, the names of a product's two options, what the product page
--    calls its details and the sizes the product editor suggests. Stores made before this
--    update sell clothing, as they did. The app knows the types; the database keeps the name
--    well-formed, so adding a type later needs no database change.
-- 2. products.option_names: a product's own names for its two options ({"size": "Pack size",
--    "color": "Flavour"}), for stores that sell more than one kind of thing. Staff change it
--    like products.spin, through its own column grant.
-- 3. get_product_page returns it.
-- 4. New stores: platform_create_store takes the type, the starter text in its words (the
--    app's, through store_starter_content) and the departments to begin with.
-- 5. platform_add_samples files sample products under departments a store already has with
--    the same short name (a new store's starter departments) instead of failing on them.

alter table public.store_settings
  add column store_type text not null default 'fashion' check (store_type ~ '^[a-z][a-z0-9-]{1,29}$');

alter table public.products
  add column option_names jsonb not null default '{}'::jsonb
    check (jsonb_typeof(option_names) = 'object'
           and char_length(coalesce(option_names ->> 'size', '')) <= 30
           and char_length(coalesce(option_names ->> 'color', '')) <= 30);
grant update (option_names) on public.products to authenticated;

create or replace function public.get_product_page(p_slug text) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'title', p.title, 'description', p.description,
    'fabric', p.fabric, 'fit', p.fit, 'care', p.care, 'tags', p.tags,
    'status', p.status, 'published_at', p.published_at,
    'price', p.price, 'compare_at_price', p.compare_at_price,
    'min_price', p.min_price, 'max_price', p.max_price, 'min_price_compare_at', p.min_price_compare_at,
    'on_sale', p.on_sale, 'available_stock', p.available_stock,
    'is_returnable', p.is_returnable, 'return_window_days', p.return_window_days,
    'rating_avg', p.rating_avg, 'rating_count', p.rating_count,
    'seo_title', p.seo_title, 'seo_description', p.seo_description,
    'updated_at', p.updated_at, 'spin', p.spin, 'option_names', p.option_names,
    'brand', (select jsonb_build_object('name', b.name, 'slug', b.slug, 'logo_url', b.logo_url) from public.brands b where b.id = p.brand_id),
    'category', (select jsonb_build_object('name', c.name, 'slug', c.slug) from public.categories c where c.id = p.category_id),
    'breadcrumbs', coalesce((
      with recursive up as (
        select c.id, c.parent_id, c.name, c.slug, 0 as depth from public.categories c where c.id = p.category_id
        union all
        select c.id, c.parent_id, c.name, c.slug, up.depth + 1 from public.categories c join up on c.id = up.parent_id
      )
      select jsonb_agg(jsonb_build_object('name', name, 'slug', slug) order by depth desc) from up
    ), '[]'),
    'images', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'url', i.url, 'alt', i.alt, 'color', i.color, 'width', i.width, 'height', i.height) order by i.position)
      from public.product_images i where i.product_id = p.id
    ), '[]'),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'sku', v.sku, 'size', v.size, 'color', v.color, 'color_hex', v.color_hex,
        'price', coalesce(v.price, p.price),
        'compare_at_price', case when coalesce(v.compare_at_price, p.compare_at_price) > coalesce(v.price, p.price)
                                 then coalesce(v.compare_at_price, p.compare_at_price) end,
        'available', greatest(v.stock_quantity - v.reserved_quantity, 0)
      ) order by v.position, public.size_rank(v.size), v.size)
      from public.product_variants v where v.product_id = p.id and v.is_active
    ), '[]'),
    'size_guide', (
      select jsonb_build_object('name', g.name, 'unit', g.unit, 'columns', g.columns, 'rows', g.rows,
                                'how_to_measure', g.how_to_measure, 'description', g.description)
      from public.size_guides g
      where g.id = coalesce(p.size_guide_id, (
        with recursive up as (
          select c.id, c.parent_id, c.size_guide_id, 0 as depth from public.categories c where c.id = p.category_id
          union all
          select c.id, c.parent_id, c.size_guide_id, up.depth + 1 from public.categories c join up on c.id = up.parent_id
        )
        select size_guide_id from up where size_guide_id is not null order by depth limit 1
      ))
    )
  )
  from public.products p
  where p.slug = p_slug
$$;

-- A new store's starter text, in the words of what it sells (p_kind, from the app; without
-- them, a clothing store's, as before).
drop function public.store_starter_content(text);
create function public.store_starter_content(p_name text, p_kind jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  with k as (
    select left(coalesce(nullif(btrim(p_kind ->> 'about'), ''), 'clothing that is made carefully and meant to be worn for years'), 200) as about,
           left(coalesce(nullif(btrim(p_kind ->> 'return_condition'), ''), 'unworn items with their tags'), 120) as returnable,
           left(coalesce(nullif(btrim(p_kind ->> 'no_returns'), ''), 'Sale items, innerwear and earrings cannot be returned for hygiene reasons.'), 200) as no_returns,
           left(coalesce(nullif(btrim(p_kind ->> 'faq_q'), ''), 'How do I find my size?'), 200) as faq_q,
           left(coalesce(nullif(btrim(p_kind ->> 'faq_a'), ''), 'Every product page has a size guide with garment measurements. If you are between sizes, the product''s fit notes tell you which way to go.'), 500) as faq_a
  )
  select jsonb_build_object(
    'policies', jsonb_build_object(
      'shipping', E'We ship across India.\n\nOrders are packed within 1-2 working days. Delivery usually takes 2-7 working days depending on your PIN code, and your order page shows the estimate for your address.\n\nYou will receive an email with a tracking link as soon as your parcel leaves us.\n\nReplace this sample policy with your own before launch.',
      'returns', format(E'You can return %s within 15 days of delivery.\n\nStart a return from your order page. Once we receive and check the items, we refund the original payment method within 5-7 working days. Cash on delivery orders are refunded by bank transfer.\n\n%s\n\nReplace this sample policy with your own before launch.', k.returnable, k.no_returns),
      'privacy', E'We collect the details you give us (name, email, phone, addresses) to deliver your orders and support you. Payments are processed by our payment partners, and we never see or store your card details.\n\nWe do not sell your personal data. You can ask us to export or delete your data at any time by writing to our support email.\n\nReplace this sample policy with your own before launch.',
      'terms', E'By placing an order you agree to these terms. Prices include applicable taxes unless shown otherwise. We may cancel an order if an item turns out to be unavailable, in which case any payment is refunded in full.\n\nReplace these sample terms with your own before launch.',
      'about', format(E'%s brings together %s.\n\nReplace this with the story of your store before launch.', p_name, k.about)
    ),
    'faq', jsonb_build_array(
      jsonb_build_object('q', 'How long does delivery take?', 'a', 'Most orders arrive in 2-7 working days. Enter your PIN code on any product page to see the estimate for your address.'),
      jsonb_build_object('q', 'Can I pay cash on delivery?', 'a', 'Yes, for most PIN codes and orders up to ₹25,000. Available options are shown at checkout.'),
      jsonb_build_object('q', 'How do returns work?', 'a', format('You can return %s within 15 days of delivery. Start a return from your order page.', k.returnable)),
      jsonb_build_object('q', k.faq_q, 'a', k.faq_a)
    ),
    'social', jsonb_build_object('instagram', '', 'facebook', '', 'x', '', 'pinterest', '', 'youtube', ''),
    'homepage', jsonb_build_object('announcement', '', 'hero', '[]'::jsonb, 'promos', '[]'::jsonb),
    'email_templates', jsonb_build_object(
      'order_confirmation', jsonb_build_object('subject', 'Order {{order_number}} confirmed', 'body', E'Hi {{customer_name}},\n\nThank you for your order. We''re getting it ready and will email you when it ships.'),
      'order_shipped', jsonb_build_object('subject', 'Your order {{order_number}} is on its way', 'body', E'Hi {{customer_name}},\n\nYour order has shipped with {{carrier}}. Tracking number: {{tracking_number}}.'),
      'order_delivered', jsonb_build_object('subject', 'Your order {{order_number}} was delivered', 'body', E'Hi {{customer_name}},\n\nYour order was delivered. We hope you love it. If anything is not right, you can start a return from your order page.'),
      'order_cancelled', jsonb_build_object('subject', 'Order {{order_number}} was cancelled', 'body', E'Hi {{customer_name}},\n\nYour order has been cancelled. If you paid online, any refund due is shown on your order page.'),
      'refund_processed', jsonb_build_object('subject', 'Refund for order {{order_number}}', 'body', E'Hi {{customer_name}},\n\nWe have refunded {{refund_amount}} to your original payment method. Banks usually take 5-7 working days to show it.'),
      'return_update', jsonb_build_object('subject', 'Update on your return for order {{order_number}}', 'body', E'Hi {{customer_name}},\n\nYour return request is now: {{return_status}}.')
    )
  )
  from k
$$;
revoke execute on function public.store_starter_content(text, jsonb) from public, anon, authenticated;
grant execute on function public.store_starter_content(text, jsonb) to service_role;

create or replace function public.platform_create_store(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_slug text := lower(btrim(coalesce(p ->> 'slug', '')));
  v_prefix text := upper(btrim(coalesce(p ->> 'order_prefix', '')));
  v_host text := nullif(public.normalize_hostname(p ->> 'hostname'), '');
  v_type text := coalesce(nullif(btrim(p ->> 'store_type'), ''), 'fashion');
  v_owner uuid := (select auth.uid());
  v_store uuid;
  v_zone uuid;
  v_starter jsonb;
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
  if v_type !~ '^[a-z][a-z0-9-]{1,29}$' then
    raise exception 'invalid_store_type' using errcode = '22023', hint = 'Choose what the store sells.';
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
  v_starter := public.store_starter_content(v_name, case when jsonb_typeof(p -> 'kind') = 'object' then p -> 'kind' else '{}'::jsonb end);
  insert into public.store_settings (store_id, store_name, tagline, primary_color, brand_color, accent_color, background_color,
                                     heading_font, body_font, heading_italic, design, design_options, store_type, seo_title, seo_description,
                                     policies, faq, social, homepage, email_templates)
  values (v_store, v_name, coalesce(left(p ->> 'tagline', 160), ''),
          coalesce(p -> 'colors' ->> 'text', '#1f1416'), coalesce(p -> 'colors' ->> 'brand', '#6b1d2e'),
          coalesce(p -> 'colors' ->> 'accent', '#b07d2b'), coalesce(p -> 'colors' ->> 'background', '#fbf6ee'),
          coalesce(p ->> 'heading_font', 'cormorant'), coalesce(p ->> 'body_font', 'jost'),
          coalesce((p ->> 'heading_italic')::boolean, true),
          coalesce(nullif(p ->> 'design', ''), 'atelier'),
          case when jsonb_typeof(p -> 'design_options') = 'object' then p -> 'design_options' else '{}'::jsonb end,
          v_type, left(v_name, 120), coalesce(left(p ->> 'tagline', 160), ''),
          v_starter -> 'policies', v_starter -> 'faq', v_starter -> 'social', v_starter -> 'homepage', v_starter -> 'email_templates');
  -- Its first departments (up to eight), empty until products go in them.
  insert into public.categories (store_id, name, slug, sort_order)
  select v_store, left(btrim(d.name), 120), left(public.slugify(d.name), 60), d.n::int - 1
  from jsonb_array_elements_text(case when jsonb_typeof(p -> 'departments') = 'array' then p -> 'departments' else '[]'::jsonb end)
    with ordinality as d(name, n)
  where btrim(d.name) <> '' and d.n <= 8 and public.is_slug(left(public.slugify(d.name), 60))
  on conflict (store_id, slug) do nothing;
  insert into public.user_roles (store_id, user_id, role, granted_by) values (v_store, v_owner, 'owner', (select auth.uid()));
  insert into public.shipping_zones (store_id, name, countries, priority) values (v_store, 'All India', array['IN'], 0)
  returning id into v_zone;
  insert into public.shipping_rates (store_id, zone_id, name, description, price, free_over, min_days, max_days, cod_available, sort_order)
  values (v_store, v_zone, 'Standard', 'Tracked delivery', 9900, null, 3, 7, true, 1),
         (v_store, v_zone, 'Express', 'Priority dispatch', 24900, null, 1, 3, false, 2);
  insert into public.shipping_providers (store_id, name)
  select v_store, x from unnest(array['Delhivery', 'Blue Dart', 'DTDC', 'India Post', 'Ekart', 'Shiprocket', 'Other']) x;
  perform public.write_audit('store.create', 'store', v_store::text,
    jsonb_build_object('name', v_name, 'slug', v_slug, 'hostname', v_host, 'owner', v_owner, 'store_type', v_type), v_store);
  perform set_config('app.cross_store', '', true);
  return v_store;
end $$;

create or replace function public.platform_add_samples(p_store_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_home uuid := public.home_store_id();
  v_page jsonb;
  v_counts jsonb;
begin
  perform public.require_platform_admin();
  if p_store_id is null or not exists (select 1 from public.stores where id = p_store_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_store_id = v_home then
    raise exception 'home_store' using errcode = 'P0001', hint = 'The main store''s sample catalog is the one other stores copy.';
  end if;
  if exists (select 1 from public.products where store_id = p_store_id and is_sample) then
    raise exception 'samples_exist' using errcode = 'P0001', hint = 'This store already has the sample products.';
  end if;
  if not exists (select 1 from public.products where store_id = v_home and is_sample) then
    raise exception 'no_samples' using errcode = 'P0001', hint = 'The main store has no sample products left to copy.';
  end if;

  -- This function writes rows for a store other than the request's.
  perform set_config('app.cross_store', 'on', true);

  -- A new id for every row copied (ids are unique across tables, so one map serves all).
  create temp table if not exists sample_ids (old_id uuid primary key, new_id uuid not null default gen_random_uuid()) on commit drop;
  truncate pg_temp.sample_ids;
  insert into pg_temp.sample_ids (old_id)
  select id from public.size_guides where store_id = v_home and is_sample
  union all select id from public.brands where store_id = v_home and is_sample
  union all select id from public.categories where store_id = v_home and is_sample
  union all select id from public.products where store_id = v_home and is_sample
  union all select id from public.collections where store_id = v_home and is_sample
  union all select id from public.coupons where store_id = v_home and is_sample
  union all select v.id from public.product_variants v join public.products p on p.id = v.product_id where p.store_id = v_home and p.is_sample
  union all select i.id from public.product_images i join public.products p on p.id = i.product_id where p.store_id = v_home and p.is_sample;

  -- Departments the store already has under the same short name (its starter departments)
  -- take in the sample products instead of being copied again.
  update pg_temp.sample_ids m set new_id = c.id
  from public.categories t join public.categories c on c.store_id = p_store_id and c.slug = t.slug
  where m.old_id = t.id and t.store_id = v_home;

  insert into public.size_guides
  select (jsonb_populate_record(null::public.size_guides, to_jsonb(t) || jsonb_build_object(
    'id', m.new_id, 'store_id', p_store_id, 'created_at', now(), 'updated_at', now()))).*
  from public.size_guides t join pg_temp.sample_ids m on m.old_id = t.id;

  insert into public.brands
  select (jsonb_populate_record(null::public.brands, to_jsonb(t) || jsonb_build_object(
    'id', m.new_id, 'store_id', p_store_id, 'created_at', now(), 'updated_at', now()))).*
  from public.brands t join pg_temp.sample_ids m on m.old_id = t.id;

  -- Parents before children, so each finds its parent in place.
  insert into public.categories
  select (jsonb_populate_record(null::public.categories, to_jsonb(t) || jsonb_build_object(
    'id', m.new_id, 'store_id', p_store_id,
    'parent_id', (select x.new_id from pg_temp.sample_ids x where x.old_id = t.parent_id),
    'size_guide_id', (select x.new_id from pg_temp.sample_ids x where x.old_id = t.size_guide_id),
    'created_at', now(), 'updated_at', now()))).*
  from public.categories t join pg_temp.sample_ids m on m.old_id = t.id
  where not exists (select 1 from public.categories c where c.id = m.new_id)
  order by t.parent_id is not null;

  insert into public.products
  select (jsonb_populate_record(null::public.products, to_jsonb(t) || jsonb_build_object(
    'id', m.new_id, 'store_id', p_store_id,
    'brand_id', (select x.new_id from pg_temp.sample_ids x where x.old_id = t.brand_id),
    'category_id', (select x.new_id from pg_temp.sample_ids x where x.old_id = t.category_id),
    'size_guide_id', (select x.new_id from pg_temp.sample_ids x where x.old_id = t.size_guide_id),
    'created_by', (select auth.uid()), 'sales_count', 0, 'rating_avg', null, 'rating_count', 0,
    'created_at', now(), 'updated_at', now()))).*
  from public.products t join pg_temp.sample_ids m on m.old_id = t.id;

  insert into public.product_variants
  select (jsonb_populate_record(null::public.product_variants, to_jsonb(t) || jsonb_build_object(
    'id', m.new_id, 'store_id', p_store_id,
    'product_id', (select x.new_id from pg_temp.sample_ids x where x.old_id = t.product_id),
    'reserved_quantity', 0, 'created_at', now(), 'updated_at', now()))).*
  from public.product_variants t join pg_temp.sample_ids m on m.old_id = t.id;

  -- Photos are shared by address, never by file: the copy doesn't own the home store's files.
  insert into public.product_images
  select (jsonb_populate_record(null::public.product_images, to_jsonb(t) || jsonb_build_object(
    'id', m.new_id, 'store_id', p_store_id,
    'product_id', (select x.new_id from pg_temp.sample_ids x where x.old_id = t.product_id),
    'storage_path', null, 'created_at', now()))).*
  from public.product_images t join pg_temp.sample_ids m on m.old_id = t.id;

  insert into public.collections
  select (jsonb_populate_record(null::public.collections, to_jsonb(t) || jsonb_build_object(
    'id', m.new_id, 'store_id', p_store_id, 'created_at', now(), 'updated_at', now()))).*
  from public.collections t join pg_temp.sample_ids m on m.old_id = t.id;

  insert into public.collection_products (collection_id, product_id, position)
  select c.new_id, p.new_id, cp.position
  from public.collection_products cp
  join pg_temp.sample_ids c on c.old_id = cp.collection_id
  join pg_temp.sample_ids p on p.old_id = cp.product_id;

  insert into public.coupons
  select (jsonb_populate_record(null::public.coupons, to_jsonb(t) || jsonb_build_object(
    'id', m.new_id, 'store_id', p_store_id,
    'product_ids', coalesce((select jsonb_agg(x.new_id) from unnest(t.product_ids) u join pg_temp.sample_ids x on x.old_id = u), '[]'::jsonb),
    'category_ids', coalesce((select jsonb_agg(x.new_id) from unnest(t.category_ids) u join pg_temp.sample_ids x on x.old_id = u), '[]'::jsonb),
    'collection_ids', coalesce((select jsonb_agg(x.new_id) from unnest(t.collection_ids) u join pg_temp.sample_ids x on x.old_id = u), '[]'::jsonb),
    'created_at', now(), 'updated_at', now()))).*
  from public.coupons t join pg_temp.sample_ids m on m.old_id = t.id;

  -- The sample homepage banners (they link to the copied collections by address).
  select homepage into v_page from public.store_settings where store_id = v_home;
  update public.store_settings
  set homepage = coalesce(homepage, '{}'::jsonb) || jsonb_build_object(
    'hero', coalesce(homepage -> 'hero', '[]'::jsonb)
      || coalesce((select jsonb_agg(h) from jsonb_array_elements(coalesce(v_page -> 'hero', '[]'::jsonb)) h where (h ->> 'sample')::boolean), '[]'::jsonb),
    'promos', coalesce(homepage -> 'promos', '[]'::jsonb)
      || coalesce((select jsonb_agg(h) from jsonb_array_elements(coalesce(v_page -> 'promos', '[]'::jsonb)) h where (h ->> 'sample')::boolean), '[]'::jsonb))
  where store_id = p_store_id;

  select jsonb_build_object(
    'products', (select count(*) from public.products where store_id = p_store_id and is_sample),
    'variants', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id where p.store_id = p_store_id and p.is_sample),
    'brands', (select count(*) from public.brands where store_id = p_store_id and is_sample),
    'categories', (select count(*) from public.categories where store_id = p_store_id and is_sample),
    'collections', (select count(*) from public.collections where store_id = p_store_id and is_sample),
    'coupons', (select count(*) from public.coupons where store_id = p_store_id and is_sample)
  ) into v_counts;
  perform public.write_audit('store.add_samples', 'store', p_store_id::text, v_counts, p_store_id);
  perform set_config('app.cross_store', '', true);
  return v_counts;
end $$;

create or replace function public.app_schema_version() returns text
language sql immutable set search_path = '' as $$
  select '20261028000100'::text
$$;
revoke execute on function public.app_schema_version() from public, anon;
grant execute on function public.app_schema_version() to authenticated, service_role;
