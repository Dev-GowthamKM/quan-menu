-- Storefront read functions: catalog search with filters and facets, automated
-- collection rules, the product page, related products, delivery estimates, wishlist
-- and reviews. Read functions run as the caller (SECURITY INVOKER), so row-level
-- security still hides anything unpublished.

-- Sort order for sizes: letter sizes in wearing order, then numeric sizes, then the rest.
create function public.size_rank(p_size text) returns int
language sql immutable set search_path = '' as $$
  select case upper(btrim(p_size))
    when 'XXXS' then 1 when '3XS' then 1 when 'XXS' then 2 when '2XS' then 2 when 'XS' then 3
    when 'S' then 4 when 'M' then 5 when 'L' then 6 when 'XL' then 7 when 'XXL' then 8 when '2XL' then 8
    when 'XXXL' then 9 when '3XL' then 9 when '4XL' then 10 when '5XL' then 11
    when 'FREE SIZE' then 50 when 'ONE SIZE' then 50
    else case
      when p_size ~ '^\d+(\.\d+)?$' then 100 + (p_size::numeric * 10)::int
      else 10000
    end
  end
$$;

-- Does a product match one automated-collection condition?
-- Conditions: {"field": "tag"|"brand"|"category"|"title"|"price"|"on_sale"|"color"|"size"|"created_within_days",
--              "op": "equals"|"not_equals"|"contains"|"lt"|"gt", "value": ...}
create function public.product_matches_condition(p public.products, c jsonb) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  v_field text := c ->> 'field';
  v_op text := coalesce(c ->> 'op', 'equals');
  v_value text := c ->> 'value';
  v_result boolean;
begin
  if v_value is null then
    return false;
  end if;
  case v_field
    when 'tag' then
      v_result := lower(v_value) = any (select lower(t) from unnest(p.tags) t);
    when 'brand' then
      v_result := exists (select 1 from public.brands b where b.id = p.brand_id and b.slug = v_value);
    when 'category' then
      v_result := p.category_id in (
        select public.category_subtree(c2.id) from public.categories c2 where c2.slug = v_value
      );
    when 'title' then
      v_result := strpos(lower(p.title), lower(v_value)) > 0;
    when 'color' then
      v_result := lower(v_value) = any (select lower(x) from unnest(p.colors) x);
    when 'size' then
      v_result := upper(v_value) = any (select upper(x) from unnest(p.sizes) x);
    when 'on_sale' then
      v_result := p.on_sale = (v_value::boolean);
    when 'price' then
      if v_value !~ '^\d+$' then return false; end if;
      v_result := case v_op
        when 'lt' then coalesce(p.min_price, p.price) < v_value::bigint
        when 'gt' then coalesce(p.min_price, p.price) > v_value::bigint
        else coalesce(p.min_price, p.price) = v_value::bigint
      end;
      return coalesce(v_result, false);
    when 'created_within_days' then
      if v_value !~ '^\d+$' then return false; end if;
      return coalesce(p.published_at, p.created_at) >= now() - make_interval(days => v_value::int);
    else
      return false;
  end case;
  v_result := coalesce(v_result, false);
  return case when v_op = 'not_equals' then not v_result else v_result end;
end $$;

create function public.product_matches_rules(p public.products, rules jsonb) returns boolean
language sql stable set search_path = '' as $$
  with conds as (
    select c from jsonb_array_elements(case when jsonb_typeof(rules -> 'conditions') = 'array' then rules -> 'conditions' else '[]'::jsonb end) c
  )
  select case
    when not exists (select 1 from conds) then false
    when coalesce(rules ->> 'match', 'all') = 'any' then (select bool_or(public.product_matches_condition(p, c)) from conds)
    else (select bool_and(public.product_matches_condition(p, c)) from conds)
  end
$$;

create function public.product_in_collection(p public.products, p_collection public.collections) returns boolean
language sql stable set search_path = '' as $$
  select case p_collection.kind
    when 'manual' then exists (
      select 1 from public.collection_products cp
      where cp.collection_id = p_collection.id and cp.product_id = p.id
    )
    else public.product_matches_rules(p, p_collection.rules)
  end
$$;

-- Products on the storefront that match a set of filters (no sorting or paging).
create function public.catalog_scope(
  p_q text default null,
  p_category text default null,
  p_brands text[] default null,
  p_collection text default null,
  p_sizes text[] default null,
  p_colors text[] default null,
  p_min_price bigint default null,
  p_max_price bigint default null,
  p_in_stock boolean default false,
  p_on_sale boolean default false,
  p_ids uuid[] default null
) returns setof public.products
language sql stable security invoker set search_path = '' as $$
  with terms as (
    select replace(replace(replace(t, '\', '\\'), '%', '\%'), '_', '\_') as t
    from unnest(regexp_split_to_array(lower(btrim(coalesce(p_q, ''))), '\s+')) t
    where t <> ''
  ),
  coll as (
    select c.* from public.collections c where c.slug = p_collection
  )
  select p.*
  from public.products p
  where p.status = 'active' and p.published_at <= now()
    and (p_ids is null or p.id = any (p_ids))
    and (p_category is null or p.category_id in (
      select public.category_subtree(c.id) from public.categories c where c.slug = p_category
    ))
    and (coalesce(cardinality(p_brands), 0) = 0 or p.brand_id in (
      select b.id from public.brands b where b.slug = any (p_brands)
    ))
    and (p_collection is null or exists (select 1 from coll where public.product_in_collection(p, coll)))
    and (coalesce(cardinality(p_sizes), 0) = 0 or p.sizes && p_sizes)
    and (coalesce(cardinality(p_colors), 0) = 0 or p.colors && p_colors)
    and (p_min_price is null or p.min_price >= p_min_price)
    and (p_max_price is null or p.min_price <= p_max_price)
    and (not coalesce(p_in_stock, false) or p.available_stock > 0)
    and (not coalesce(p_on_sale, false) or p.on_sale)
    and not exists (select 1 from terms where p.search_text not like '%' || terms.t || '%')
$$;
grant execute on function public.catalog_scope(text, text, text[], text, text[], text[], bigint, bigint, boolean, boolean, uuid[]) to anon, authenticated;

-- The storefront's product listing: every filter, sort and page in one query.
-- Prices are minor units. p_sort: featured | newest | price_asc | price_desc | popular.
create function public.search_products(
  p_q text default null,
  p_category text default null,
  p_brands text[] default null,
  p_collection text default null,
  p_sizes text[] default null,
  p_colors text[] default null,
  p_min_price bigint default null,
  p_max_price bigint default null,
  p_in_stock boolean default false,
  p_on_sale boolean default false,
  p_sort text default 'featured',
  p_limit int default 24,
  p_offset int default 0,
  p_ids uuid[] default null
) returns table (
  id uuid,
  slug text,
  title text,
  brand_name text,
  brand_slug text,
  price bigint,
  max_price bigint,
  compare_at_price bigint,
  on_sale boolean,
  available_stock int,
  image_url text,
  image_alt text,
  hover_image_url text,
  swatches jsonb,
  rating_avg numeric,
  rating_count int,
  published_at timestamptz,
  total_count bigint
)
language sql stable security invoker set search_path = '' as $$
  with base as (
    select s.*, cp.position as coll_position
    from public.catalog_scope(p_q, p_category, p_brands, p_collection, p_sizes, p_colors,
                              p_min_price, p_max_price, p_in_stock, p_on_sale, p_ids) s
    left join public.collections c on c.slug = p_collection
    left join public.collection_products cp on cp.collection_id = c.id and cp.product_id = s.id
  )
  select
    b.id, b.slug, b.title, br.name, br.slug,
    b.min_price, b.max_price, b.min_price_compare_at, b.on_sale, b.available_stock,
    img.url, img.alt, img2.url, b.swatches, b.rating_avg, b.rating_count, b.published_at,
    count(*) over ()
  from base b
  left join public.brands br on br.id = b.brand_id
  left join lateral (
    select i.url, i.alt from public.product_images i where i.product_id = b.id order by i.position limit 1
  ) img on true
  left join lateral (
    select i.url from public.product_images i where i.product_id = b.id order by i.position offset 1 limit 1
  ) img2 on true
  order by
    case when p_sort = 'price_asc' then b.min_price end asc nulls last,
    case when p_sort = 'price_desc' then b.min_price end desc nulls last,
    case when p_sort = 'newest' then b.published_at end desc nulls last,
    case when p_sort = 'popular' then b.sales_count end desc nulls last,
    case when p_sort = 'popular' then b.rating_count end desc nulls last,
    case when p_sort = 'featured' then b.coll_position end asc nulls last,
    case when p_sort = 'featured' then b.is_featured end desc nulls last,
    case when p_sort = 'featured' then b.sales_count end desc nulls last,
    b.published_at desc,
    b.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
grant execute on function public.search_products(text, text, text[], text, text[], text[], bigint, bigint, boolean, boolean, text, int, int, uuid[]) to anon, authenticated;

-- Filter options for a listing (the category, collection and search scope, before the
-- customer's own brand/size/colour/price choices), so options never vanish on click.
create function public.catalog_facets(
  p_q text default null,
  p_category text default null,
  p_collection text default null
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with scope as (
    select * from public.catalog_scope(p_q, p_category, null, p_collection)
  )
  select jsonb_build_object(
    'brands', coalesce((
      select jsonb_agg(jsonb_build_object('slug', b.slug, 'name', b.name, 'count', x.n) order by b.name)
      from (select brand_id, count(*) n from scope where brand_id is not null group by brand_id) x
      join public.brands b on b.id = x.brand_id
    ), '[]'),
    'sizes', coalesce((
      select jsonb_agg(jsonb_build_object('value', x.s, 'count', x.n) order by public.size_rank(x.s), x.s)
      from (select sz as s, count(*) n from scope, unnest(scope.sizes) sz group by sz) x
    ), '[]'),
    'colors', coalesce((
      select jsonb_agg(jsonb_build_object('value', x.name, 'hex', x.hex, 'count', x.n) order by x.n desc, x.name)
      from (
        select sw ->> 'name' as name, max(sw ->> 'hex') as hex, count(*) n
        from scope, jsonb_array_elements(scope.swatches) sw
        group by sw ->> 'name'
      ) x
    ), '[]'),
    'price', jsonb_build_object('min', (select min(min_price) from scope), 'max', (select max(max_price) from scope)),
    'on_sale', (select count(*) from scope where on_sale),
    'in_stock', (select count(*) from scope where available_stock > 0),
    'total', (select count(*) from scope)
  )
$$;
grant execute on function public.catalog_facets(text, text, text) to anon, authenticated;

-- Everything the product page needs in one round trip. Returns null when the product is
-- not visible to the caller (staff previewing a draft still see it).
create function public.get_product_page(p_slug text) returns jsonb
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
    'updated_at', p.updated_at,
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
grant execute on function public.get_product_page(text) to anon, authenticated;

-- "You may also like": same category first, then same brand, sharing the most tags.
create function public.related_products(p_product_id uuid, p_limit int default 8) returns setof uuid
language sql stable security invoker set search_path = '' as $$
  select r.id
  from public.products r, public.products p
  where p.id = p_product_id and r.id <> p.id
    and r.status = 'active' and r.published_at <= now()
    and (r.category_id = p.category_id or r.brand_id = p.brand_id or r.tags && p.tags)
  order by
    (r.available_stock > 0) desc,
    (r.category_id = p.category_id) desc,
    cardinality(array(select unnest(r.tags) intersect select unnest(p.tags))) desc,
    (r.brand_id = p.brand_id) desc,
    r.sales_count desc,
    r.published_at desc
  limit least(greatest(p_limit, 1), 24)
$$;
grant execute on function public.related_products(uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Delivery: which zone serves an address, its rates and whether COD is possible.
-- ---------------------------------------------------------------------------
create function public.match_shipping_zone(p_country text, p_state text, p_postal_code text) returns uuid
language sql stable security definer set search_path = '' as $$
  select z.id
  from public.shipping_zones z
  where z.is_active
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
revoke execute on function public.match_shipping_zone(text, text, text) from public, anon, authenticated;

-- Product page "check delivery": serviceability, estimated dates and COD for a PIN code.
create function public.check_postcode(p_postal_code text, p_state text default null, p_subtotal bigint default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_code text := replace(btrim(coalesce(p_postal_code, '')), ' ', '');
  v_rule public.postal_code_rules;
  v_zone public.shipping_zones;
  v_settings public.store_settings;
  v_rates jsonb;
begin
  if v_code !~ '^[1-9][0-9]{5}$' then
    return jsonb_build_object('valid', false, 'serviceable', false, 'message', 'Enter a 6-digit PIN code.');
  end if;
  select * into v_settings from public.store_settings where id = 1;
  select * into v_rule from public.postal_code_rules where postal_code = v_code;
  if v_rule.blocks = 'all' then
    return jsonb_build_object('valid', true, 'serviceable', false, 'message', 'Sorry, we do not deliver to this PIN code yet.');
  end if;
  select * into v_zone from public.shipping_zones where id = public.match_shipping_zone('IN', p_state, v_code);
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
grant execute on function public.check_postcode(text, text, bigint) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Wishlist (signed-in customers)
-- ---------------------------------------------------------------------------
create function public.toggle_wishlist(p_product_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_list uuid;
begin
  if v_user is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not public.product_visible(p_product_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.wishlists (user_id) values (v_user) on conflict (user_id) do nothing;
  select id into v_list from public.wishlists where user_id = v_user;
  delete from public.wishlist_items where wishlist_id = v_list and product_id = p_product_id;
  if found then
    return false;
  end if;
  if (select count(*) from public.wishlist_items where wishlist_id = v_list) >= 200 then
    raise exception 'wishlist_full' using errcode = 'P0001', hint = 'Your wishlist can hold up to 200 items.';
  end if;
  insert into public.wishlist_items (wishlist_id, product_id) values (v_list, p_product_id);
  return true;
end $$;
revoke execute on function public.toggle_wishlist(uuid) from public, anon;
grant execute on function public.toggle_wishlist(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Reviews. A purchase is "verified" when the customer has a paid or delivered order
-- containing the product. Store settings decide whether that is required and whether
-- reviews publish immediately or wait for moderation.
-- ---------------------------------------------------------------------------
create function public.submit_review(p_product_id uuid, p_rating int, p_title text, p_body text) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  select * into v_settings from public.store_settings where id = 1;
  if not v_settings.reviews_enabled then
    raise exception 'reviews_disabled' using errcode = 'P0001', hint = 'Reviews are turned off.';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'invalid_rating' using errcode = '22023', hint = 'Choose a rating from 1 to 5.';
  end if;
  if not public.product_visible(p_product_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select o.id into v_order
  from public.orders o join public.order_items i on i.order_id = o.id
  where o.user_id = v_user and i.product_id = p_product_id
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
end $$;
revoke execute on function public.submit_review(uuid, int, text, text) from public, anon;
grant execute on function public.submit_review(uuid, int, text, text) to authenticated;
