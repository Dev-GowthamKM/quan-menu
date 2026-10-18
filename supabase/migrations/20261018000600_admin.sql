-- Admin operations. Catalog functions run as the signed-in staff member (SECURITY
-- INVOKER), so row-level security and column privileges still apply. Order, payment,
-- refund and return functions are SECURITY DEFINER because API clients have no write
-- access to those tables; each checks the caller's role first and enforces the business
-- rules (no shipping a cancelled order, no refunding more than was captured...).

create function public.slugify(p_text text) returns text
language sql immutable set search_path = '' as $$
  select left(btrim(regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'), '-'), 120)
$$;

create function public.require_staff() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'forbidden' using errcode = '42501', hint = 'Staff access required.';
  end if;
end $$;

create function public.require_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501', hint = 'Admin access required.';
  end if;
end $$;

-- Variants holding stock for unpaid orders cannot be deleted.
create function public.product_variants_before_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.reserved_quantity > 0 then
    raise exception 'variant_reserved' using errcode = 'P0001',
      hint = format('%s is reserved by an unpaid order. Try again after it is paid or expires.', old.sku);
  end if;
  return old;
end $$;
create trigger product_variants_before_delete before delete on public.product_variants
  for each row execute function public.product_variants_before_delete();

alter table public.product_variants drop constraint product_variants_product_id_size_color_key;
alter table public.product_variants add constraint product_variants_product_id_size_color_key
  unique (product_id, size, color) deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------

-- Creates or updates a product with its variants, images and manual collections in one
-- transaction. Used by the product editor and the CSV importer.
--
-- Variant stock: when a variant includes stock_loaded (the value the editor showed), the
-- change is applied as a difference, so sales made while the editor was open are kept.
create function public.admin_save_product(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_title text := btrim(coalesce(p ->> 'title', ''));
  v_slug text := lower(btrim(coalesce(p ->> 'slug', '')));
  v_status public.product_status := coalesce(nullif(p ->> 'status', ''), 'draft')::public.product_status;
  v_variants jsonb := coalesce(p -> 'variants', '[]');
  v_images jsonb := coalesce(p -> 'images', '[]');
  v_price bigint := (p ->> 'price')::bigint;
  v jsonb;
  v_vid uuid;
  v_keep uuid[] := '{}';
  v_keep_img uuid[] := '{}';
  v_pos int := 0;
  v_existing public.product_variants;
  v_target int;
  v_dup text;
  v_img jsonb;
  v_img_id uuid;
  v_ord bigint;
  v_collection uuid;
begin
  perform public.require_staff();
  if v_title = '' then
    raise exception 'invalid_product' using errcode = '22023', hint = 'Enter a product title.';
  end if;
  if v_slug = '' then
    v_slug := public.slugify(v_title);
  end if;
  if not public.is_slug(v_slug) then
    raise exception 'invalid_slug' using errcode = '22023',
      hint = 'The URL handle can use lowercase letters, numbers and single hyphens only.';
  end if;
  if exists (select 1 from public.products where slug = v_slug and id is distinct from v_id) then
    raise exception 'duplicate_slug' using errcode = '23505', hint = format('Another product already uses the URL handle "%s".', v_slug);
  end if;
  if v_price is null or v_price < 0 then
    raise exception 'invalid_price' using errcode = '22023', hint = 'Enter a price of zero or more.';
  end if;
  if (p ->> 'compare_at_price') is not null and (p ->> 'compare_at_price')::bigint <= v_price then
    raise exception 'invalid_compare_at' using errcode = '22023', hint = 'The compare-at price must be higher than the price.';
  end if;
  if jsonb_typeof(v_variants) <> 'array' or jsonb_array_length(v_variants) = 0 then
    raise exception 'no_variants' using errcode = '22023', hint = 'Add at least one variant with a SKU.';
  end if;
  if jsonb_array_length(v_variants) > 250 then
    raise exception 'too_many_variants' using errcode = '22023', hint = 'A product can have up to 250 variants.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_variants) x
    where coalesce(btrim(x ->> 'sku'), '') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'
  ) then
    raise exception 'invalid_sku' using errcode = '22023',
      hint = 'Every variant needs a SKU of letters, numbers, dots, dashes, slashes or underscores (max 64).';
  end if;
  select upper(btrim(x ->> 'sku')) into v_dup
  from jsonb_array_elements(v_variants) x group by upper(btrim(x ->> 'sku')) having count(*) > 1 limit 1;
  if v_dup is not null then
    raise exception 'duplicate_sku' using errcode = '23505', hint = format('SKU %s appears more than once.', v_dup);
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_variants) x
    group by lower(btrim(coalesce(x ->> 'size', ''))), lower(btrim(coalesce(x ->> 'color', '')))
    having count(*) > 1
  ) then
    raise exception 'duplicate_variant' using errcode = '23505', hint = 'Two variants have the same size and colour.';
  end if;
  select btrim(x ->> 'sku') into v_dup
  from jsonb_array_elements(v_variants) x
  join public.product_variants pv on upper(pv.sku) = upper(btrim(x ->> 'sku'))
  where pv.product_id is distinct from v_id
  limit 1;
  if v_dup is not null then
    raise exception 'duplicate_sku' using errcode = '23505', hint = format('SKU %s is already used by another product.', v_dup);
  end if;

  if v_id is null then
    insert into public.products (
      title, slug, brand_id, category_id, size_guide_id, description, fabric, fit, care, tags, status, published_at,
      is_featured, price, compare_at_price, tax_rate_bps, weight_grams, length_mm, width_mm, height_mm,
      is_returnable, return_window_days, seo_title, seo_description, created_by
    ) values (
      v_title, v_slug, nullif(p ->> 'brand_id', '')::uuid, nullif(p ->> 'category_id', '')::uuid,
      nullif(p ->> 'size_guide_id', '')::uuid,
      coalesce(p ->> 'description', ''), coalesce(p ->> 'fabric', ''), coalesce(p ->> 'fit', ''), coalesce(p ->> 'care', ''),
      coalesce((select array_agg(distinct btrim(t)) from jsonb_array_elements_text(coalesce(p -> 'tags', '[]')) t where btrim(t) <> ''), '{}'),
      v_status, nullif(p ->> 'published_at', '')::timestamptz,
      coalesce((p ->> 'is_featured')::boolean, false),
      v_price, (p ->> 'compare_at_price')::bigint, (p ->> 'tax_rate_bps')::int,
      (p ->> 'weight_grams')::int, (p ->> 'length_mm')::int, (p ->> 'width_mm')::int, (p ->> 'height_mm')::int,
      coalesce((p ->> 'is_returnable')::boolean, true), (p ->> 'return_window_days')::int,
      coalesce(p ->> 'seo_title', ''), coalesce(p ->> 'seo_description', ''), (select auth.uid())
    ) returning id into v_id;
  else
    update public.products set
      title = v_title, slug = v_slug,
      brand_id = nullif(p ->> 'brand_id', '')::uuid,
      category_id = nullif(p ->> 'category_id', '')::uuid,
      size_guide_id = nullif(p ->> 'size_guide_id', '')::uuid,
      description = coalesce(p ->> 'description', ''),
      fabric = coalesce(p ->> 'fabric', ''), fit = coalesce(p ->> 'fit', ''), care = coalesce(p ->> 'care', ''),
      tags = coalesce((select array_agg(distinct btrim(t)) from jsonb_array_elements_text(coalesce(p -> 'tags', '[]')) t where btrim(t) <> ''), '{}'),
      status = v_status,
      published_at = case when p ? 'published_at' then nullif(p ->> 'published_at', '')::timestamptz else published_at end,
      is_featured = coalesce((p ->> 'is_featured')::boolean, is_featured),
      price = v_price, compare_at_price = (p ->> 'compare_at_price')::bigint,
      tax_rate_bps = (p ->> 'tax_rate_bps')::int,
      weight_grams = (p ->> 'weight_grams')::int, length_mm = (p ->> 'length_mm')::int,
      width_mm = (p ->> 'width_mm')::int, height_mm = (p ->> 'height_mm')::int,
      is_returnable = coalesce((p ->> 'is_returnable')::boolean, true),
      return_window_days = (p ->> 'return_window_days')::int,
      seo_title = coalesce(p ->> 'seo_title', ''), seo_description = coalesce(p ->> 'seo_description', '')
    where id = v_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0002', hint = 'This product no longer exists.';
    end if;
  end if;

  -- Variants
  perform public.set_stock_context('adjustment', 'Product editor', null);
  for v in select x from jsonb_array_elements(v_variants) x loop
    v_pos := v_pos + 1;
    v_existing := null;
    v_vid := nullif(v ->> 'id', '')::uuid;
    if v_vid is not null then
      select * into v_existing from public.product_variants where id = v_vid and product_id = v_id;
    end if;
    if v_existing.id is null then
      select * into v_existing from public.product_variants where product_id = v_id and upper(sku) = upper(btrim(v ->> 'sku'));
    end if;
    if (v ->> 'stock_quantity') is not null and (v ->> 'stock_quantity')::int < 0 then
      raise exception 'invalid_stock' using errcode = '22023', hint = format('Stock for %s cannot be negative.', v ->> 'sku');
    end if;
    if v_existing.id is null then
      insert into public.product_variants (
        product_id, sku, size, color, color_hex, price, compare_at_price, stock_quantity, low_stock_threshold,
        barcode, weight_grams, position, is_active
      ) values (
        v_id, btrim(v ->> 'sku'), btrim(coalesce(v ->> 'size', '')), btrim(coalesce(v ->> 'color', '')),
        nullif(v ->> 'color_hex', ''), (v ->> 'price')::bigint, (v ->> 'compare_at_price')::bigint,
        coalesce((v ->> 'stock_quantity')::int, 0), (v ->> 'low_stock_threshold')::int,
        nullif(btrim(coalesce(v ->> 'barcode', '')), ''), (v ->> 'weight_grams')::int, v_pos,
        coalesce((v ->> 'is_active')::boolean, true)
      ) returning id into v_vid;
    else
      v_vid := v_existing.id;
      v_target := case
        when (v ->> 'stock_quantity') is null then v_existing.stock_quantity
        when (v ->> 'stock_loaded') is not null
          then v_existing.stock_quantity + ((v ->> 'stock_quantity')::int - (v ->> 'stock_loaded')::int)
        else (v ->> 'stock_quantity')::int
      end;
      if v_target < v_existing.reserved_quantity then
        raise exception 'stock_below_reserved' using errcode = 'P0001',
          hint = format('%s has %s unit(s) held by unpaid orders, so its stock cannot go below that.', v_existing.sku, v_existing.reserved_quantity);
      end if;
      update public.product_variants set
        sku = btrim(v ->> 'sku'),
        size = btrim(coalesce(v ->> 'size', '')),
        color = btrim(coalesce(v ->> 'color', '')),
        color_hex = nullif(v ->> 'color_hex', ''),
        price = (v ->> 'price')::bigint,
        compare_at_price = (v ->> 'compare_at_price')::bigint,
        stock_quantity = v_target,
        low_stock_threshold = (v ->> 'low_stock_threshold')::int,
        barcode = nullif(btrim(coalesce(v ->> 'barcode', '')), ''),
        weight_grams = (v ->> 'weight_grams')::int,
        position = v_pos,
        is_active = coalesce((v ->> 'is_active')::boolean, true)
      where id = v_vid;
    end if;
    v_keep := v_keep || v_vid;
  end loop;
  delete from public.product_variants where product_id = v_id and not (id = any (v_keep));
  perform public.clear_stock_context();

  -- Images, in the order given (the first is the main image)
  if jsonb_typeof(v_images) = 'array' then
    select coalesce(array_agg((x ->> 'id')::uuid), '{}') into v_keep_img
    from jsonb_array_elements(v_images) x where nullif(x ->> 'id', '') is not null;
    delete from public.product_images where product_id = v_id and not (id = any (v_keep_img));
    for v_img, v_ord in select x, o from jsonb_array_elements(v_images) with ordinality as t(x, o) loop
      v_img_id := nullif(v_img ->> 'id', '')::uuid;
      if v_img_id is not null and exists (select 1 from public.product_images where id = v_img_id and product_id = v_id) then
        update public.product_images set
          position = v_ord::int - 1,
          alt = left(coalesce(v_img ->> 'alt', ''), 300),
          color = nullif(v_img ->> 'color', '')
        where id = v_img_id;
      else
        insert into public.product_images (product_id, url, storage_path, alt, color, position, width, height)
        values (v_id, v_img ->> 'url', nullif(v_img ->> 'storage_path', ''), left(coalesce(v_img ->> 'alt', ''), 300),
                nullif(v_img ->> 'color', ''), v_ord::int - 1, (v_img ->> 'width')::int, (v_img ->> 'height')::int);
      end if;
    end loop;
  end if;

  -- Manual collections
  if p ? 'collection_ids' and jsonb_typeof(p -> 'collection_ids') = 'array' then
    delete from public.collection_products cp
    where cp.product_id = v_id
      and not (cp.collection_id = any (select (x #>> '{}')::uuid from jsonb_array_elements(p -> 'collection_ids') x));
    for v_collection in select (x #>> '{}')::uuid from jsonb_array_elements(p -> 'collection_ids') x loop
      insert into public.collection_products (collection_id, product_id, position)
      select v_collection, v_id, coalesce((select max(position) + 1 from public.collection_products where collection_id = v_collection), 0)
      where exists (select 1 from public.collections c where c.id = v_collection and c.kind = 'manual')
      on conflict do nothing;
    end loop;
  end if;
  return v_id;
end $$;
revoke execute on function public.admin_save_product(jsonb) from public, anon;
grant execute on function public.admin_save_product(jsonb) to authenticated;

-- Copies a product as a draft with new SKUs (suffix -COPY, -COPY2...) and zero stock.
create function public.admin_duplicate_product(p_id uuid) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  src public.products;
  v_new uuid;
  v_suffix text := '-COPY';
  v_n int := 1;
  v_slug text;
begin
  perform public.require_staff();
  select * into src from public.products where id = p_id;
  if src.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  while exists (
    select 1 from public.product_variants a join public.product_variants b on upper(b.sku) = upper(a.sku || v_suffix)
    where a.product_id = p_id
  ) loop
    v_n := v_n + 1;
    v_suffix := '-COPY' || v_n;
  end loop;
  v_slug := left(src.slug, 110) || '-copy';
  v_n := 1;
  while exists (select 1 from public.products where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := left(src.slug, 108) || '-copy-' || v_n;
  end loop;
  insert into public.products (
    title, slug, brand_id, category_id, size_guide_id, description, fabric, fit, care, tags, status, is_featured,
    price, compare_at_price, tax_rate_bps, weight_grams, length_mm, width_mm, height_mm, is_returnable,
    return_window_days, seo_title, seo_description, created_by
  ) values (
    src.title || ' (copy)', v_slug, src.brand_id, src.category_id, src.size_guide_id, src.description, src.fabric,
    src.fit, src.care, src.tags, 'draft', false, src.price, src.compare_at_price, src.tax_rate_bps, src.weight_grams,
    src.length_mm, src.width_mm, src.height_mm, src.is_returnable, src.return_window_days, src.seo_title,
    src.seo_description, (select auth.uid())
  ) returning id into v_new;
  insert into public.product_variants (product_id, sku, size, color, color_hex, price, compare_at_price, stock_quantity,
                                       low_stock_threshold, barcode, weight_grams, position, is_active)
  select v_new, left(sku, 64 - char_length(v_suffix)) || v_suffix, size, color, color_hex, price, compare_at_price, 0,
         low_stock_threshold, null, weight_grams, position, is_active
  from public.product_variants where product_id = p_id;
  insert into public.product_images (product_id, url, storage_path, alt, color, position, width, height)
  select v_new, url, storage_path, alt, color, position, width, height from public.product_images where product_id = p_id;
  insert into public.collection_products (collection_id, product_id, position)
  select collection_id, v_new, position from public.collection_products where product_id = p_id;
  return v_new;
end $$;
revoke execute on function public.admin_duplicate_product(uuid) from public, anon;
grant execute on function public.admin_duplicate_product(uuid) to authenticated;

-- Deletes products that were never ordered. Products with order history are archived
-- instead, so past orders, reports and the audit trail stay intact.
create function public.admin_delete_products(p_ids uuid[]) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_deleted int := 0;
  v_archived int := 0;
  v_id uuid;
begin
  perform public.require_staff();
  foreach v_id in array coalesce(p_ids, '{}') loop
    if exists (select 1 from public.order_items where product_id = v_id) then
      update public.products set status = 'archived' where id = v_id and status <> 'archived';
      v_archived := v_archived + 1;
    else
      delete from public.products where id = v_id;
      if found then
        v_deleted := v_deleted + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('deleted', v_deleted, 'archived', v_archived);
end $$;
revoke execute on function public.admin_delete_products(uuid[]) from public, anon;
grant execute on function public.admin_delete_products(uuid[]) to authenticated;

-- Storage paths among p_paths that no catalog row references any more (safe to delete).
create function public.unreferenced_media(p_paths text[]) returns setof text
language sql stable security definer set search_path = '' as $$
  select x from unnest(coalesce(p_paths, '{}')) x
  where public.is_staff()
    and not exists (select 1 from public.product_images i where i.storage_path = x)
    and not exists (select 1 from public.brands b where b.logo_url like '%/' || x or b.banner_url like '%/' || x)
    and not exists (select 1 from public.categories c where c.image_url like '%/' || x or c.banner_url like '%/' || x)
    and not exists (select 1 from public.collections c where c.image_url like '%/' || x or c.banner_url like '%/' || x)
$$;
revoke execute on function public.unreferenced_media(text[]) from public, anon;
grant execute on function public.unreferenced_media(text[]) to authenticated;

-- Bulk edits from the product list. Actions: status, category, brand, price_set,
-- price_percent (value: signed percentage), compare_at_clear, add_tag, remove_tag,
-- collection_add, collection_remove, featured.
create function public.admin_bulk_update_products(p_ids uuid[], p_action text, p_value jsonb) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  v_count int := 0;
  v_pct numeric;
begin
  perform public.require_staff();
  if coalesce(cardinality(p_ids), 0) = 0 then
    return 0;
  end if;
  case p_action
    when 'status' then
      update public.products set status = (p_value #>> '{}')::public.product_status where id = any (p_ids);
    when 'category' then
      update public.products set category_id = nullif(p_value #>> '{}', '')::uuid where id = any (p_ids);
    when 'brand' then
      update public.products set brand_id = nullif(p_value #>> '{}', '')::uuid where id = any (p_ids);
    when 'featured' then
      update public.products set is_featured = (p_value #>> '{}')::boolean where id = any (p_ids);
    when 'price_set' then
      if (p_value #>> '{}')::bigint < 0 then
        raise exception 'invalid_price' using errcode = '22023';
      end if;
      update public.products set price = (p_value #>> '{}')::bigint,
        compare_at_price = case when compare_at_price > (p_value #>> '{}')::bigint then compare_at_price end
      where id = any (p_ids);
    when 'price_percent' then
      v_pct := (p_value #>> '{}')::numeric;
      if v_pct <= -100 or v_pct > 1000 then
        raise exception 'invalid_percent' using errcode = '22023', hint = 'Use a change between -99% and +1000%.';
      end if;
      update public.products set price = round(price * (100 + v_pct) / 100)::bigint,
        compare_at_price = case when compare_at_price > round(price * (100 + v_pct) / 100) then compare_at_price end
      where id = any (p_ids);
      update public.product_variants set price = round(price * (100 + v_pct) / 100)::bigint,
        compare_at_price = case when compare_at_price > round(price * (100 + v_pct) / 100) then compare_at_price end
      where product_id = any (p_ids) and price is not null;
    when 'compare_at_clear' then
      update public.products set compare_at_price = null where id = any (p_ids);
      update public.product_variants set compare_at_price = null where product_id = any (p_ids);
    when 'add_tag' then
      update public.products set tags = (select array_agg(distinct t) from unnest(tags || array[btrim(p_value #>> '{}')]) t)
      where id = any (p_ids) and btrim(p_value #>> '{}') <> '';
    when 'remove_tag' then
      update public.products set tags = array_remove(tags, btrim(p_value #>> '{}')) where id = any (p_ids);
    when 'collection_add' then
      insert into public.collection_products (collection_id, product_id, position)
      select (p_value #>> '{}')::uuid, x, 0 from unnest(p_ids) x
      on conflict do nothing;
    when 'collection_remove' then
      delete from public.collection_products where collection_id = (p_value #>> '{}')::uuid and product_id = any (p_ids);
    else
      raise exception 'invalid_action' using errcode = '22023';
  end case;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.admin_bulk_update_products(uuid[], text, jsonb) from public, anon;
grant execute on function public.admin_bulk_update_products(uuid[], text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

-- p_items: [{"variant_id", "quantity" (new on-hand count) | "delta", "loaded" (optional)}]
create function public.admin_set_stock(p_items jsonb, p_reason public.inventory_reason, p_note text) returns int
language plpgsql security invoker set search_path = '' as $$
declare
  v_item jsonb;
  v public.product_variants;
  v_target int;
  v_count int := 0;
begin
  perform public.require_staff();
  if p_reason in ('sale', 'cancellation') then
    raise exception 'invalid_reason' using errcode = '22023', hint = 'Sales and cancellations are recorded by orders.';
  end if;
  perform public.set_stock_context(p_reason, nullif(btrim(coalesce(p_note, '')), ''), null);
  for v_item in select x from jsonb_array_elements(coalesce(p_items, '[]')) x order by x ->> 'variant_id' loop
    select * into v from public.product_variants where id = (v_item ->> 'variant_id')::uuid for update;
    if v.id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    v_target := case
      when v_item ? 'delta' then v.stock_quantity + (v_item ->> 'delta')::int
      when (v_item ->> 'loaded') is not null then v.stock_quantity + ((v_item ->> 'quantity')::int - (v_item ->> 'loaded')::int)
      else (v_item ->> 'quantity')::int
    end;
    if v_target < 0 then
      raise exception 'negative_stock' using errcode = 'P0001', hint = format('Stock for %s cannot go below zero.', v.sku);
    end if;
    if v_target < v.reserved_quantity then
      raise exception 'stock_below_reserved' using errcode = 'P0001',
        hint = format('%s has %s unit(s) held by unpaid orders, so its stock cannot go below that.', v.sku, v.reserved_quantity);
    end if;
    if v_target <> v.stock_quantity then
      update public.product_variants set stock_quantity = v_target where id = v.id;
      v_count := v_count + 1;
    end if;
  end loop;
  perform public.clear_stock_context();
  return v_count;
end $$;
revoke execute on function public.admin_set_stock(jsonb, public.inventory_reason, text) from public, anon;
grant execute on function public.admin_set_stock(jsonb, public.inventory_reason, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create function public.fulfillment_rank(p public.fulfillment_status) returns int
language sql immutable set search_path = '' as $$
  select case p when 'unfulfilled' then 0 when 'processing' then 1 when 'packed' then 2
                when 'shipped' then 3 when 'delivered' then 4 when 'returned' then 5 end
$$;

create function public.admin_set_fulfillment(
  p_order_id uuid,
  p_status public.fulfillment_status,
  p_carrier text default null,
  p_tracking_number text default null,
  p_tracking_url text default null,
  p_note text default null,
  p_notify boolean default true
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_ship public.shipments;
  v_template text;
  v_url text := nullif(btrim(coalesce(p_tracking_url, '')), '');
  v_carrier text := nullif(btrim(coalesce(p_carrier, '')), '');
  v_number text := nullif(btrim(coalesce(p_tracking_number, '')), '');
begin
  perform public.require_staff();
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
    select * into v_ship from public.shipments where order_id = o.id order by created_at desc limit 1;
    if p_status = 'shipped' and v_carrier is null and v_ship.carrier is null then
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
              (select auth.uid()))
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
      when 'shipped' then 'Shipped' || coalesce(' with ' || v_ship.carrier, '') ||
                          case when coalesce(v_ship.tracking_number, '') <> '' then ' (tracking ' || v_ship.tracking_number || ')' else '' end || '.'
      when 'delivered' then 'Delivered.'
      when 'returned' then 'Returned to us.'
      else 'Fulfilment updated.'
    end,
    jsonb_build_object('status', p_status, 'carrier', v_ship.carrier, 'tracking_number', v_ship.tracking_number,
                       'tracking_url', v_ship.tracking_url),
    false, 'staff');
  if nullif(btrim(coalesce(p_note, '')), '') is not null then
    perform public.add_order_event(o.id, 'note', left(btrim(p_note), 2000), '{}', true, 'staff');
  end if;
  if p_notify and p_status in ('shipped', 'delivered') then
    v_template := case p_status when 'shipped' then 'order_shipped' else 'order_delivered' end;
    perform public.queue_email(o.email, v_template, o.id, jsonb_build_object(
      'carrier', v_ship.carrier, 'tracking_number', v_ship.tracking_number, 'tracking_url', v_ship.tracking_url));
  end if;
  return public.order_brief(o);
end $$;
revoke execute on function public.admin_set_fulfillment(uuid, public.fulfillment_status, text, text, text, text, boolean) from public, anon;
grant execute on function public.admin_set_fulfillment(uuid, public.fulfillment_status, text, text, text, text, boolean) to authenticated;

create function public.admin_add_order_note(p_order_id uuid, p_note text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_staff();
  if btrim(coalesce(p_note, '')) = '' then
    raise exception 'empty_note' using errcode = '22023';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  perform public.add_order_event(p_order_id, 'note', left(btrim(p_note), 2000), '{}', true, 'staff');
end $$;
revoke execute on function public.admin_add_order_note(uuid, text) from public, anon;
grant execute on function public.admin_add_order_note(uuid, text) to authenticated;

-- Staff can cancel unpaid orders; cancelling a paid order (which needs a refund) is
-- for admins. Returns the amount still to refund.
create function public.admin_cancel_order(p_order_id uuid, p_reason text, p_restock boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_refundable bigint;
begin
  perform public.require_staff();
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
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
revoke execute on function public.admin_cancel_order(uuid, text, boolean) from public, anon;
grant execute on function public.admin_cancel_order(uuid, text, boolean) to authenticated;

-- Cash on delivery: record that the courier collected the money.
create function public.admin_mark_cod_paid(p_order_id uuid, p_reference text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
begin
  perform public.require_admin();
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
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
revoke execute on function public.admin_mark_cod_paid(uuid, text) from public, anon;
grant execute on function public.admin_mark_cod_paid(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Refunds. begin_refund reserves the amount (so two refunds cannot both pass the
-- "not more than was paid" check); the server then calls the provider and reports the
-- outcome with complete_refund. Cash-on-delivery refunds are recorded as done.
-- ---------------------------------------------------------------------------
create function public.begin_refund_internal(
  p_order_id uuid, p_payment_id uuid, p_amount bigint, p_reason text, p_return_request_id uuid,
  p_reference text, p_actor uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_pay public.payments;
  v_pending bigint;
  v_available bigint;
  v_refund public.refunds;
  v_manual boolean;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount' using errcode = '22023', hint = 'Enter an amount greater than zero.';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if p_payment_id is not null then
    select * into v_pay from public.payments where id = p_payment_id and order_id = o.id for update;
  else
    select * into v_pay from public.payments
    where order_id = o.id and status in ('captured', 'partially_refunded') and amount > amount_refunded
    order by (amount - amount_refunded) desc, captured_at
    limit 1
    for update;
  end if;
  if v_pay.id is null or v_pay.status not in ('captured', 'partially_refunded') then
    raise exception 'nothing_to_refund' using errcode = 'P0001', hint = 'This order has no captured payment to refund.';
  end if;
  select coalesce(sum(amount), 0) into v_pending from public.refunds where payment_id = v_pay.id and status = 'pending';
  v_available := v_pay.amount - v_pay.amount_refunded - v_pending;
  if p_amount > v_available then
    raise exception 'refund_too_large' using errcode = 'P0001',
      hint = format('At most %s can be refunded on this payment.', public.format_money(greatest(v_available, 0), o.currency));
  end if;
  v_manual := v_pay.provider in ('cod', 'manual');
  insert into public.refunds (order_id, payment_id, return_request_id, provider, amount, reason, status, reference, initiated_by)
  values (o.id, v_pay.id, p_return_request_id, v_pay.provider, p_amount, left(coalesce(p_reason, ''), 500),
          'pending', left(btrim(coalesce(p_reference, '')), 120), p_actor)
  returning * into v_refund;
  perform public.add_order_event(o.id, 'refund_started',
    format('Refund of %s started.', public.format_money(p_amount, o.currency)),
    jsonb_build_object('refund_id', v_refund.id), true, case when p_actor is null then 'system' else 'staff' end, p_actor);
  if v_manual then
    -- Cash refunds happen outside any provider (bank transfer, UPI); record them as done.
    perform public.complete_refund(v_refund.id, 'manual_' || v_refund.id::text, 'processed', null);
    select * into v_refund from public.refunds where id = v_refund.id;
  end if;
  return jsonb_build_object(
    'refund_id', v_refund.id, 'status', v_refund.status, 'amount', v_refund.amount, 'provider', v_pay.provider,
    'provider_payment_id', v_pay.provider_payment_id, 'currency', v_pay.currency, 'order_number', o.order_number,
    'needs_provider_call', not v_manual
  );
end $$;

create function public.admin_begin_refund(
  p_order_id uuid, p_amount bigint, p_reason text, p_return_request_id uuid default null, p_reference text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_admin();
  return public.begin_refund_internal(p_order_id, null, p_amount, p_reason, p_return_request_id, p_reference, (select auth.uid()));
end $$;

-- Refund for a specific payment, started by the server (duplicate or late payments).
create function public.system_begin_refund(p_order_id uuid, p_payment_id uuid, p_amount bigint, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return public.begin_refund_internal(p_order_id, p_payment_id, p_amount, p_reason, null, null, null);
end $$;

create function public.complete_refund(p_refund_id uuid, p_provider_refund_id text, p_status public.refund_state, p_error text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_refund public.refunds;
  v_pay public.payments;
  o public.orders;
  v_total_refunded bigint;
  v_captured bigint;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if v_refund.id is null then
    raise exception 'refund_not_found' using errcode = 'P0002';
  end if;
  select * into o from public.orders where id = v_refund.order_id for update;
  if v_refund.status = 'processed' or (v_refund.status = 'failed' and p_status <> 'processed') then
    return jsonb_build_object('result', 'already_final', 'status', v_refund.status);
  end if;
  update public.refunds set
    provider_refund_id = coalesce(p_provider_refund_id, provider_refund_id),
    status = p_status,
    error = case when p_status = 'failed' then left(p_error, 500) end,
    processed_at = case when p_status = 'processed' then now() end
  where id = v_refund.id
  returning * into v_refund;
  if p_status = 'processed' then
    update public.payments set
      amount_refunded = amount_refunded + v_refund.amount,
      status = case when amount_refunded + v_refund.amount >= amount then 'refunded'::public.payment_state
                    else 'partially_refunded'::public.payment_state end
    where id = v_refund.payment_id
    returning * into v_pay;
    select coalesce(sum(amount_refunded), 0), coalesce(sum(amount), 0) into v_total_refunded, v_captured
    from public.payments where order_id = o.id and status in ('captured', 'partially_refunded', 'refunded');
    update public.orders set
      amount_refunded = least(v_total_refunded, grand_total),
      payment_status = case when v_total_refunded >= v_captured then 'refunded'::public.order_payment_status
                            else 'partially_refunded'::public.order_payment_status end,
      needs_attention = case when v_total_refunded >= v_captured then false else needs_attention end,
      attention_reason = case when v_total_refunded >= v_captured then null else attention_reason end
    where id = o.id
    returning * into o;
    if v_refund.return_request_id is not null then
      update public.return_requests set status = 'refunded', resolved_at = now(),
        refund_amount = coalesce(refund_amount, 0) + v_refund.amount
      where id = v_refund.return_request_id;
    end if;
    perform public.add_order_event(o.id, 'refund_processed',
      format('Refund of %s processed.', public.format_money(v_refund.amount, o.currency)),
      jsonb_build_object('refund_id', v_refund.id), false, 'provider');
    perform public.queue_email(o.email, 'refund_processed', o.id,
      jsonb_build_object('refund_amount', v_refund.amount));
  else
    perform public.add_order_event(o.id, 'refund_failed',
      'Refund failed' || coalesce(': ' || nullif(p_error, ''), '.'), jsonb_build_object('refund_id', v_refund.id), true, 'provider');
  end if;
  return jsonb_build_object('result', 'updated', 'status', v_refund.status);
end $$;

-- Find our refund row from a provider webhook.
create function public.refund_by_provider_id(p_provider public.payment_provider, p_provider_refund_id text) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.refunds where provider = p_provider and provider_refund_id = p_provider_refund_id
$$;

revoke execute on function public.begin_refund_internal(uuid, uuid, bigint, text, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.admin_begin_refund(uuid, bigint, text, uuid, text) from public, anon;
grant execute on function public.admin_begin_refund(uuid, bigint, text, uuid, text) to authenticated;
revoke execute on function public.system_begin_refund(uuid, uuid, bigint, text) from public, anon, authenticated;
revoke execute on function public.complete_refund(uuid, text, public.refund_state, text) from public, anon, authenticated;
revoke execute on function public.refund_by_provider_id(public.payment_provider, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Returns and cancellation requests
-- ---------------------------------------------------------------------------
-- p_action: approve | reject | receive | close
create function public.admin_update_return(p_request_id uuid, p_action text, p_note text default null, p_restock boolean default true)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.return_requests;
  o public.orders;
  it record;
  v_refundable bigint := 0;
begin
  perform public.require_staff();
  select * into r from public.return_requests where id = p_request_id for update;
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
revoke execute on function public.admin_update_return(uuid, text, text, boolean) from public, anon;
grant execute on function public.admin_update_return(uuid, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard and reports. Revenue only counts money a provider confirmed (captured
-- payments, including cash on delivery once collected) minus processed refunds.
-- ---------------------------------------------------------------------------
create function public.admin_dashboard(p_days int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.store_settings;
  v_tz text;
  v_today date;
  v_month_start date;
  v_days int := least(greatest(coalesce(p_days, 30), 7), 365);
begin
  perform public.require_staff();
  select * into s from public.store_settings where id = 1;
  v_tz := coalesce(s.timezone, 'Asia/Kolkata');
  v_today := (now() at time zone v_tz)::date;
  v_month_start := date_trunc('month', v_today)::date;

  return jsonb_build_object(
    'currency', s.currency,
    'timezone', v_tz,
    'revenue', jsonb_build_object(
      'total', (select coalesce(sum(amount), 0) from public.payments where status in ('captured', 'partially_refunded', 'refunded'))
               - (select coalesce(sum(amount), 0) from public.refunds where status = 'processed'),
      'today', (select coalesce(sum(amount), 0) from public.payments
                where status in ('captured', 'partially_refunded', 'refunded') and (captured_at at time zone v_tz)::date = v_today)
               - (select coalesce(sum(amount), 0) from public.refunds
                  where status = 'processed' and (processed_at at time zone v_tz)::date = v_today),
      'month', (select coalesce(sum(amount), 0) from public.payments
                where status in ('captured', 'partially_refunded', 'refunded') and (captured_at at time zone v_tz)::date >= v_month_start)
               - (select coalesce(sum(amount), 0) from public.refunds
                  where status = 'processed' and (processed_at at time zone v_tz)::date >= v_month_start),
      'refunded_total', (select coalesce(sum(amount), 0) from public.refunds where status = 'processed'),
      'cod_outstanding', (select coalesce(sum(grand_total), 0) from public.orders
                          where payment_method = 'cod' and payment_status = 'unpaid' and status in ('confirmed', 'completed'))
    ),
    'orders', jsonb_build_object(
      'total', (select count(*) from public.orders where status in ('confirmed', 'completed')
                 or (status = 'cancelled' and cancel_reason not in ('payment_timeout', 'superseded'))),
      'today', (select count(*) from public.orders where status in ('confirmed', 'completed', 'cancelled')
                 and coalesce(cancel_reason, '') not in ('payment_timeout', 'superseded')
                 and (placed_at at time zone v_tz)::date = v_today),
      'awaiting_payment', (select count(*) from public.orders where status = 'pending_payment'),
      'to_fulfil', (select count(*) from public.orders where status = 'confirmed' and fulfillment_status = 'unfulfilled'),
      'awaiting_shipment', (select count(*) from public.orders where status = 'confirmed' and fulfillment_status in ('processing', 'packed')),
      'in_transit', (select count(*) from public.orders where status = 'confirmed' and fulfillment_status = 'shipped'),
      'completed', (select count(*) from public.orders where status = 'completed'),
      'cancelled', (select count(*) from public.orders where status = 'cancelled' and cancel_reason not in ('payment_timeout', 'superseded')),
      'needs_attention', (select count(*) from public.orders where needs_attention),
      'open_requests', (select count(*) from public.return_requests where status in ('requested', 'approved'))
    ),
    'customers', jsonb_build_object(
      'registered', (select count(*) from public.profiles p where not exists (select 1 from public.user_roles r where r.user_id = p.id)),
      'buyers', (select count(distinct lower(email)) from public.orders where status in ('confirmed', 'completed')),
      'new_this_month', (select count(*) from public.profiles p where (p.created_at at time zone v_tz)::date >= v_month_start
                          and not exists (select 1 from public.user_roles r where r.user_id = p.id))
    ),
    'inventory', jsonb_build_object(
      'low_stock', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id
                    where v.is_active and p.status <> 'archived'
                      and v.stock_quantity - v.reserved_quantity > 0
                      and v.stock_quantity - v.reserved_quantity <= coalesce(v.low_stock_threshold, s.low_stock_threshold)),
      'out_of_stock', (select count(*) from public.product_variants v join public.products p on p.id = v.product_id
                       where v.is_active and p.status = 'active' and v.stock_quantity - v.reserved_quantity <= 0),
      'items', coalesce((
        select jsonb_agg(x order by x ->> 'available', x ->> 'title')
        from (
          select jsonb_build_object('variant_id', v.id, 'product_id', p.id, 'title', p.title, 'sku', v.sku,
                                    'variant', concat_ws(' / ', nullif(v.size, ''), nullif(v.color, '')),
                                    'available', v.stock_quantity - v.reserved_quantity,
                                    'threshold', coalesce(v.low_stock_threshold, s.low_stock_threshold)) as x
          from public.product_variants v join public.products p on p.id = v.product_id
          where v.is_active and p.status = 'active'
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
        where o.status in ('confirmed', 'completed') and o.placed_at >= now() - make_interval(days => v_days)
        group by i.product_id
        order by sum(i.quantity) desc
        limit 5
      ) q
    ), '[]'),
    'trend', (
      select jsonb_agg(jsonb_build_object('date', d::date, 'revenue',
        coalesce((select sum(amount) from public.payments
                  where status in ('captured', 'partially_refunded', 'refunded') and (captured_at at time zone v_tz)::date = d::date), 0)
        - coalesce((select sum(amount) from public.refunds where status = 'processed' and (processed_at at time zone v_tz)::date = d::date), 0),
        'orders', (select count(*) from public.orders o where o.status in ('confirmed', 'completed', 'cancelled')
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
      from (select * from public.orders order by placed_at desc limit 8) o
    ), '[]')
  );
end $$;
revoke execute on function public.admin_dashboard(int) from public, anon;
grant execute on function public.admin_dashboard(int) to authenticated;

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create function public.admin_customers(p_q text default null, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, email text, full_name text, phone text, created_at timestamptz,
  orders_count bigint, lifetime_spend bigint, last_order_at timestamptz, total_count bigint
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.full_name, p.phone, p.created_at,
    count(o.id) filter (where o.status in ('confirmed', 'completed')),
    coalesce(sum(o.grand_total - o.amount_refunded) filter (where o.payment_status in ('paid', 'partially_refunded', 'refunded')), 0)::bigint,
    max(o.placed_at) filter (where o.status in ('confirmed', 'completed')),
    count(*) over ()
  from public.profiles p
  left join public.orders o on o.user_id = p.id
  where public.is_staff()
    and not exists (select 1 from public.user_roles r where r.user_id = p.id)
    and (coalesce(btrim(p_q), '') = ''
         or lower(p.email) like '%' || lower(btrim(p_q)) || '%'
         or lower(p.full_name) like '%' || lower(btrim(p_q)) || '%'
         or p.phone like '%' || btrim(p_q) || '%')
  group by p.id
  order by max(o.placed_at) desc nulls last, p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke execute on function public.admin_customers(text, int, int) from public, anon;
grant execute on function public.admin_customers(text, int, int) to authenticated;

-- Staff and their roles (owners and admins).
create function public.admin_staff() returns table (user_id uuid, email text, full_name text, role public.app_role, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.user_id, u.email, coalesce(p.full_name, ''), r.role, r.created_at
  from public.user_roles r
  join auth.users u on u.id = r.user_id
  left join public.profiles p on p.id = r.user_id
  where public.is_admin()
  order by r.role, u.email
$$;
revoke execute on function public.admin_staff() from public, anon;
grant execute on function public.admin_staff() to authenticated;

-- Removes the sample catalog shipped with the seed data. Sample products that were
-- ordered are archived instead of deleted so order history stays intact.
create function public.admin_delete_sample_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_products jsonb;
  v_other int := 0;
  v_n int;
begin
  perform public.require_admin();
  select public.admin_delete_products(coalesce(array_agg(id), '{}')) into v_products from public.products where is_sample;
  delete from public.collections where is_sample;
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  delete from public.coupons c where c.is_sample and not exists (select 1 from public.coupon_redemptions r where r.coupon_id = c.id);
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  update public.coupons set is_active = false where is_sample;
  delete from public.brands b where b.is_sample and not exists (select 1 from public.products p where p.brand_id = b.id);
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  -- Children before parents.
  delete from public.categories c where c.is_sample and c.parent_id is not null
    and not exists (select 1 from public.products p where p.category_id = c.id)
    and not exists (select 1 from public.categories k where k.parent_id = c.id);
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  delete from public.categories c where c.is_sample
    and not exists (select 1 from public.products p where p.category_id = c.id)
    and not exists (select 1 from public.categories k where k.parent_id = c.id);
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  delete from public.size_guides g where g.is_sample
    and not exists (select 1 from public.products p where p.size_guide_id = g.id)
    and not exists (select 1 from public.categories c where c.size_guide_id = g.id);
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  delete from public.shipping_zones where is_sample;
  get diagnostics v_n = row_count; v_other := v_other + v_n;
  update public.store_settings set homepage = jsonb_set(homepage, '{hero}', '[]') ||
    jsonb_build_object('promos', '[]'::jsonb)
  where id = 1 and homepage::text like '%sample%';
  perform public.write_audit('sample_data.delete', 'store', null, v_products || jsonb_build_object('other_rows', v_other));
  return v_products || jsonb_build_object('other_rows', v_other);
end $$;
revoke execute on function public.admin_delete_sample_data() from public, anon;
grant execute on function public.admin_delete_sample_data() to authenticated;
