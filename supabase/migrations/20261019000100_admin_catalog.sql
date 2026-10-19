-- Admin catalog screens: product and inventory lists, the media library, SKU checks and
-- CSV import. All of these run as the signed-in staff member (security invoker) unless
-- they need to read Storage, and every one starts with require_staff().

-- ---------------------------------------------------------------------------
-- Media in use
-- ---------------------------------------------------------------------------

create function public.url_has_path(p_url text, p_path text) returns boolean
language sql immutable set search_path = '' as $$
  select p_url is not null and p_path <> '' and right(p_url, char_length(p_path) + 1) = '/' || p_path
$$;

-- True when any catalog row or store setting still points at this Storage path.
create function public.media_in_use(p_path text) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from public.product_images i where i.storage_path = p_path or public.url_has_path(i.url, p_path))
    or exists (select 1 from public.brands b where public.url_has_path(b.logo_url, p_path) or public.url_has_path(b.banner_url, p_path))
    or exists (select 1 from public.categories c where public.url_has_path(c.image_url, p_path) or public.url_has_path(c.banner_url, p_path))
    or exists (select 1 from public.collections c where public.url_has_path(c.image_url, p_path) or public.url_has_path(c.banner_url, p_path))
    or exists (
      select 1 from public.store_settings s
      where public.url_has_path(s.logo_url, p_path) or public.url_has_path(s.og_image_url, p_path)
         or strpos(s.homepage::text, '/' || p_path || '"') > 0
         or strpos(s.email_templates::text, '/' || p_path) > 0
    )
$$;
revoke execute on function public.media_in_use(text) from public, anon;
grant execute on function public.media_in_use(text) to authenticated;

-- Replaces the earlier version so files used by store settings (logo, homepage banners)
-- are never treated as unused.
create or replace function public.unreferenced_media(p_paths text[]) returns setof text
language sql stable security definer set search_path = '' as $$
  select x from unnest(coalesce(p_paths, '{}')) x
  where public.is_staff() and not public.media_in_use(x)
$$;

-- The media library: files in the catalog bucket, newest first.
-- p_filter: all | used | unused
create function public.admin_media_list(p_q text, p_filter text, p_limit int, p_offset int) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
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
revoke execute on function public.admin_media_list(text, text, int, int) from public, anon;
grant execute on function public.admin_media_list(text, text, int, int) to authenticated;

-- Finds uploaded files by their original file name (as reduced by the uploader: lowercase
-- words joined by hyphens, plus an 8-character suffix), newest first, preferring the
-- library folder. Used by CSV import to attach images named in the file.
create function public.admin_media_lookup(p_names text[]) returns table (name text, path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.require_staff();
  return query
  select n, (
    select o.name from storage.objects o
    where o.bucket_id = 'catalog'
      and o.name ~ ('(^|/)' || n || '-[0-9a-f]{8}\.[a-z0-9]+$')
    order by (o.name like 'library/%') desc, o.created_at desc
    limit 1
  )
  from unnest(coalesce(p_names, '{}')) n
  where n ~ '^[a-z0-9]+(-[a-z0-9]+)*$';
end $$;
revoke execute on function public.admin_media_lookup(text[]) from public, anon;
grant execute on function public.admin_media_lookup(text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Product list
-- ---------------------------------------------------------------------------

-- p: {q, status: all|active|draft|scheduled|archived, brand, category, stock: in|low|out,
--     sort, limit, offset, ids_only}
create function public.admin_product_list(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
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
  select s.low_stock_threshold into v_low from public.store_settings s where s.id = 1;
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
revoke execute on function public.admin_product_list(jsonb) from public, anon;
grant execute on function public.admin_product_list(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Inventory list (one row per variant)
-- ---------------------------------------------------------------------------

-- p: {q, stock: all|low|out|in|reserved, brand, category, status, sort, limit, offset}
create function public.admin_inventory_list(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
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
  select s.low_stock_threshold into v_low from public.store_settings s where s.id = 1;
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
revoke execute on function public.admin_inventory_list(jsonb) from public, anon;
grant execute on function public.admin_inventory_list(jsonb) to authenticated;

-- SKUs from p_skus that another product already uses.
create function public.admin_sku_conflicts(p_skus text[], p_product_id uuid) returns table (sku text, product_id uuid, title text)
language sql stable security invoker set search_path = '' as $$
  select v.sku, pr.id, pr.title
  from public.product_variants v
  join public.products pr on pr.id = v.product_id
  where public.is_staff()
    and upper(v.sku) in (select upper(btrim(x)) from unnest(coalesce(p_skus, '{}')) x)
    and v.product_id is distinct from p_product_id
$$;
revoke execute on function public.admin_sku_conflicts(text[], uuid) from public, anon;
grant execute on function public.admin_sku_conflicts(text[], uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- CSV import
-- ---------------------------------------------------------------------------

create function public.import_brand_id(p_name text, p_create boolean) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if v_name = '' then
    return null;
  end if;
  select b.id into v_id from public.brands b
  where lower(b.name) = lower(v_name) or b.slug = public.slugify(v_name)
  order by (lower(b.name) = lower(v_name)) desc limit 1;
  if v_id is null then
    if not p_create then
      raise exception 'unknown_brand' using errcode = '22023',
        hint = format('Brand "%s" doesn''t exist. Add it in Brands, or turn on "Create missing brands and categories".', v_name);
    end if;
    insert into public.brands (name, slug, is_published) values (v_name, public.slugify(v_name), true) returning id into v_id;
  end if;
  return v_id;
end $$;

-- Accepts a category slug ("women-dresses") or a path of names ("Women > Dresses").
create function public.import_category_id(p_value text, p_create boolean) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_value text := btrim(coalesce(p_value, ''));
  v_parts text[];
  v_part text;
  v_parent uuid;
  v_parent_slug text;
  v_id uuid;
begin
  if v_value = '' then
    return null;
  end if;
  if v_value !~ '[>/]' then
    select c.id into v_id from public.categories c where c.slug = lower(v_value);
    if v_id is not null then
      return v_id;
    end if;
  end if;
  v_parts := regexp_split_to_array(v_value, '\s*[>/]\s*');
  foreach v_part in array v_parts loop
    v_part := btrim(v_part);
    continue when v_part = '';
    select c.id, c.slug into v_id, v_parent_slug
    from public.categories c
    where c.parent_id is not distinct from v_parent
      and (lower(c.name) = lower(v_part) or c.slug = public.slugify(v_part)
           or c.slug = concat_ws('-', (select pc.slug from public.categories pc where pc.id = v_parent), public.slugify(v_part)))
    order by (lower(c.name) = lower(v_part)) desc limit 1;
    if v_id is null then
      if not p_create then
        raise exception 'unknown_category' using errcode = '22023',
          hint = format('Category "%s" doesn''t exist. Add it in Categories, or turn on "Create missing brands and categories".', v_value);
      end if;
      insert into public.categories (parent_id, name, slug, is_published)
      values (v_parent, v_part,
              concat_ws('-', (select pc.slug from public.categories pc where pc.id = v_parent), public.slugify(v_part)), true)
      returning id into v_id;
    end if;
    v_parent := v_id;
  end loop;
  return v_parent;
end $$;

-- Imports a batch of products (rows grouped by handle in the browser). Each product is
-- saved in its own savepoint, so one bad product never leaves another half-written.
-- With dry_run every product is validated by really saving it and then rolling back.
--
-- New products are always created as drafts, and existing products keep their current
-- status: statuses and schedules from the file are applied afterwards with
-- admin_import_apply_status, only when the whole import succeeded.
--
-- Blank product fields keep the existing value when updating. Variants are matched by
-- SKU; variants missing from the file are left as they are. A blank stock cell keeps
-- the current stock.
create function public.admin_import_products(p_products jsonb, p_options jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_dry boolean := coalesce((p_options ->> 'dry_run')::boolean, true);
  v_update boolean := coalesce((p_options ->> 'update_existing')::boolean, true);
  v_create boolean := coalesce((p_options ->> 'create_missing')::boolean, false);
  v_results jsonb := '[]';
  v_item jsonb;
  v_handle text;
  ex public.products;
  v_payload jsonb;
  v_variants jsonb;
  v_images jsonb;
  v_collections jsonb;
  v_id uuid;
  v_action text;
  v_hint text;
  v_dup text;
  v_title text;
  v_counts jsonb := '{"create": 0, "update": 0, "error": 0}';
begin
  perform public.require_staff();
  if jsonb_typeof(p_products) <> 'array' then
    raise exception 'invalid_import' using errcode = '22023';
  end if;
  if jsonb_array_length(p_products) > 100 then
    raise exception 'batch_too_large' using errcode = '22023', hint = 'Send at most 100 products per batch.';
  end if;

  for v_item in select x from jsonb_array_elements(p_products) x loop
    v_handle := lower(btrim(coalesce(v_item ->> 'handle', '')));
    v_action := null;
    begin
      select * into ex from public.products where slug = v_handle;
      v_action := case when ex.id is null then 'create' else 'update' end;
      if ex.id is not null and not v_update then
        raise exception 'exists' using errcode = '23505',
          hint = format('A product with the handle "%s" already exists. Turn on "Update existing products" to change it.', v_handle);
      end if;

      -- The same SKU under two handles in this batch.
      select upper(btrim(v ->> 'sku')) into v_dup
      from jsonb_array_elements(p_products) other, jsonb_array_elements(other -> 'variants') v
      where lower(btrim(other ->> 'handle')) <> v_handle
        and upper(btrim(v ->> 'sku')) in (select upper(btrim(m ->> 'sku')) from jsonb_array_elements(v_item -> 'variants') m)
      limit 1;
      if v_dup is not null then
        raise exception 'duplicate_sku' using errcode = '23505', hint = format('SKU %s is also used by another product in this file.', v_dup);
      end if;

      v_title := coalesce(nullif(btrim(v_item ->> 'title'), ''), ex.title);
      if v_title is null then
        raise exception 'missing_title' using errcode = '22023', hint = 'New products need a title.';
      end if;
      if ex.id is null and nullif(v_item ->> 'price', '') is null then
        raise exception 'missing_price' using errcode = '22023', hint = 'New products need a price.';
      end if;

      -- Variants from the file (matched to existing ones by SKU) plus existing variants
      -- the file doesn't mention, unchanged. Existing variants keep their order; new ones
      -- go after them in file order.
      select coalesce(jsonb_agg(x.obj order by x.k), '[]') into v_variants
      from (
        select jsonb_strip_nulls(jsonb_build_object(
                 'id', ev.id,
                 'sku', btrim(fv ->> 'sku'),
                 'size', coalesce(nullif(btrim(fv ->> 'size'), ''), ev.size, ''),
                 'color', coalesce(nullif(btrim(fv ->> 'color'), ''), ev.color, ''),
                 'color_hex', coalesce(nullif(fv ->> 'color_hex', ''), ev.color_hex),
                 'price', nullif(fv ->> 'price', '')::bigint,
                 'compare_at_price', nullif(nullif(fv ->> 'compare_at_price', '')::bigint, 0),
                 'barcode', coalesce(nullif(fv ->> 'barcode', ''), ev.barcode),
                 'weight_grams', coalesce(nullif(fv ->> 'weight_grams', '')::int, ev.weight_grams),
                 'low_stock_threshold', coalesce(nullif(fv ->> 'low_stock_threshold', '')::int, ev.low_stock_threshold),
                 'is_active', coalesce((fv ->> 'is_active')::boolean, ev.is_active, true)
               )) || case
                 when nullif(fv ->> 'stock', '') is not null then jsonb_build_object('stock_quantity', (fv ->> 'stock')::int)
                 when ev.id is null then jsonb_build_object('stock_quantity', 0)
                 else '{}'::jsonb
               end as obj,
               coalesce(ev.position, 100000 + fo::int) as k
        from jsonb_array_elements(coalesce(v_item -> 'variants', '[]')) with ordinality as f(fv, fo)
        left join public.product_variants ev on ev.product_id = ex.id and upper(ev.sku) = upper(btrim(fv ->> 'sku'))
        union all
        select jsonb_strip_nulls(jsonb_build_object(
                 'id', ev.id, 'sku', ev.sku, 'size', ev.size, 'color', ev.color, 'color_hex', ev.color_hex,
                 'price', ev.price, 'compare_at_price', ev.compare_at_price, 'barcode', ev.barcode,
                 'weight_grams', ev.weight_grams, 'low_stock_threshold', ev.low_stock_threshold, 'is_active', ev.is_active
               )), ev.position
        from public.product_variants ev
        where ev.product_id = ex.id
          and upper(ev.sku) not in (select upper(btrim(fv ->> 'sku')) from jsonb_array_elements(coalesce(v_item -> 'variants', '[]')) fv)
      ) x;

      -- Images: replaced when the file lists any (keeping alt text and colour of images
      -- already attached), otherwise left as they are.
      if jsonb_array_length(coalesce(v_item -> 'images', '[]')) > 0 then
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'id', ei.id,
                 'url', fi ->> 'url',
                 'storage_path', coalesce(nullif(fi ->> 'storage_path', ''), ei.storage_path),
                 'alt', coalesce(nullif(fi ->> 'alt', ''), ei.alt, ''),
                 'color', coalesce(nullif(fi ->> 'color', ''), ei.color)
               )) order by fo)
          into v_images
        from jsonb_array_elements(v_item -> 'images') with ordinality as f(fi, fo)
        left join lateral (
          select * from public.product_images pi where pi.product_id = ex.id and pi.url = fi ->> 'url' limit 1
        ) ei on true;
      elsif ex.id is not null then
        select coalesce(jsonb_agg(jsonb_build_object('id', pi.id, 'url', pi.url, 'alt', pi.alt, 'color', pi.color) order by pi.position), '[]')
          into v_images
        from public.product_images pi where pi.product_id = ex.id;
      else
        v_images := '[]';
      end if;

      -- Manual collections, by slug or title.
      v_collections := null;
      if v_item ? 'collections' and jsonb_typeof(v_item -> 'collections') = 'array' then
        select v_name into v_dup from (
          select btrim(x) as v_name from jsonb_array_elements_text(v_item -> 'collections') x
          where btrim(x) <> ''
            and not exists (select 1 from public.collections c
                            where c.kind = 'manual' and (c.slug = lower(btrim(x)) or lower(c.title) = lower(btrim(x))))
          limit 1
        ) missing;
        if v_dup is not null then
          raise exception 'unknown_collection' using errcode = '22023',
            hint = format('Collection "%s" doesn''t exist or is automated (automated collections pick products by their rules).', v_dup);
        end if;
        select coalesce(jsonb_agg(distinct c.id), '[]') into v_collections
        from jsonb_array_elements_text(v_item -> 'collections') x
        join public.collections c on c.kind = 'manual' and (c.slug = lower(btrim(x)) or lower(c.title) = lower(btrim(x)));
      end if;

      v_payload := jsonb_build_object(
        'id', ex.id,
        'title', v_title,
        'slug', v_handle,
        'brand_id', case when nullif(btrim(v_item ->> 'brand'), '') is not null
                         then public.import_brand_id(v_item ->> 'brand', v_create) else ex.brand_id end,
        'category_id', case when nullif(btrim(v_item ->> 'category'), '') is not null
                            then public.import_category_id(v_item ->> 'category', v_create) else ex.category_id end,
        'size_guide_id', ex.size_guide_id,
        'description', coalesce(nullif(v_item ->> 'description', ''), ex.description, ''),
        'fabric', coalesce(nullif(v_item ->> 'fabric', ''), ex.fabric, ''),
        'fit', coalesce(nullif(v_item ->> 'fit', ''), ex.fit, ''),
        'care', coalesce(nullif(v_item ->> 'care', ''), ex.care, ''),
        'tags', case when jsonb_typeof(v_item -> 'tags') = 'array' then v_item -> 'tags' else to_jsonb(coalesce(ex.tags, '{}')) end,
        'status', coalesce(ex.status::text, 'draft'),
        'is_featured', coalesce((v_item ->> 'is_featured')::boolean, ex.is_featured, false),
        'price', coalesce(nullif(v_item ->> 'price', '')::bigint, ex.price),
        'compare_at_price', case when v_item ? 'compare_at_price' and nullif(v_item ->> 'compare_at_price', '') is not null
                                 then nullif((v_item ->> 'compare_at_price')::bigint, 0) else ex.compare_at_price end,
        'tax_rate_bps', coalesce(nullif(v_item ->> 'tax_rate_bps', '')::int, ex.tax_rate_bps),
        'weight_grams', coalesce(nullif(v_item ->> 'weight_grams', '')::int, ex.weight_grams),
        'length_mm', coalesce(nullif(v_item ->> 'length_mm', '')::int, ex.length_mm),
        'width_mm', coalesce(nullif(v_item ->> 'width_mm', '')::int, ex.width_mm),
        'height_mm', coalesce(nullif(v_item ->> 'height_mm', '')::int, ex.height_mm),
        'is_returnable', coalesce((v_item ->> 'is_returnable')::boolean, ex.is_returnable, true),
        'return_window_days', coalesce(nullif(v_item ->> 'return_window_days', '')::int, ex.return_window_days),
        'seo_title', coalesce(nullif(v_item ->> 'seo_title', ''), ex.seo_title, ''),
        'seo_description', coalesce(nullif(v_item ->> 'seo_description', ''), ex.seo_description, ''),
        'variants', v_variants,
        'images', v_images,
        'stock_reason', 'import'
      );
      if v_collections is not null then
        v_payload := v_payload || jsonb_build_object('collection_ids', v_collections);
      end if;

      v_id := public.admin_save_product(v_payload);
      if v_dry then
        raise exception 'import_dry_run_rollback';
      end if;
      v_results := v_results || jsonb_build_object('handle', v_handle, 'rows', v_item -> 'rows', 'ok', true, 'action', v_action, 'id', v_id);
      v_counts := jsonb_set(v_counts, array[v_action], to_jsonb((v_counts ->> v_action)::int + 1));
    exception when others then
      if sqlerrm = 'import_dry_run_rollback' then
        v_results := v_results || jsonb_build_object('handle', v_handle, 'rows', v_item -> 'rows', 'ok', true, 'action', v_action, 'id', ex.id);
      else
        get stacked diagnostics v_hint = pg_exception_hint;
        v_results := v_results || jsonb_build_object(
          'handle', v_handle, 'rows', v_item -> 'rows', 'ok', false, 'action', v_action,
          'error', coalesce(nullif(v_hint, ''), case
            when sqlstate = '22P02' then 'A number or yes/no column has a value that can''t be read.'
            when sqlstate = '23514' then 'A value is outside the allowed range (' || sqlerrm || ').'
            else sqlerrm end)
        );
        v_counts := jsonb_set(v_counts, '{error}', to_jsonb((v_counts ->> 'error')::int + 1));
      end if;
    end;
  end loop;

  if not v_dry then
    perform public.log_admin_action('import', 'products', null, v_counts);
  end if;
  return v_results;
end $$;
revoke execute on function public.admin_import_products(jsonb, jsonb) from public, anon;
grant execute on function public.admin_import_products(jsonb, jsonb) to authenticated;
revoke execute on function public.import_brand_id(text, boolean) from public, anon;
revoke execute on function public.import_category_id(text, boolean) from public, anon;
grant execute on function public.import_brand_id(text, boolean) to authenticated;
grant execute on function public.import_category_id(text, boolean) to authenticated;

-- Second step of an import: apply the statuses and publish dates from the file.
-- p_items: [{"id", "status", "published_at"}]
create function public.admin_import_apply_status(p_items jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  v_item jsonb;
  v_count int := 0;
begin
  perform public.require_staff();
  for v_item in select x from jsonb_array_elements(coalesce(p_items, '[]')) x loop
    update public.products set
      status = coalesce(nullif(v_item ->> 'status', ''), status::text)::public.product_status,
      published_at = case when nullif(v_item ->> 'published_at', '') is not null
                          then (v_item ->> 'published_at')::timestamptz else published_at end
    where id = (v_item ->> 'id')::uuid;
    v_count := v_count + 1;
  end loop;
  perform public.log_admin_action('import_publish', 'products', null, jsonb_build_object('count', v_count));
  return v_count;
end $$;
revoke execute on function public.admin_import_apply_status(jsonb) from public, anon;
grant execute on function public.admin_import_apply_status(jsonb) to authenticated;
