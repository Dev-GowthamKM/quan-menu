-- Catalog: size guides, brands, categories, products, images, variants, inventory
-- movements and collections.
--
-- Visibility rule used by every public policy: a product is on the storefront when
-- status = 'active' and published_at <= now(). A future published_at schedules it.

create table public.size_guides (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  unit text not null default 'cm' check (unit in ('cm', 'in')),
  columns text[] not null default '{}' check (cardinality(columns) <= 12),
  rows jsonb not null default '[]' check (jsonb_typeof(rows) = 'array'),
  how_to_measure text not null default '' check (char_length(how_to_measure) <= 2000),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger size_guides_touch before update on public.size_guides
  for each row execute function public.touch_updated_at();

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (public.is_slug(slug)),
  description text not null default '' check (char_length(description) <= 5000),
  logo_url text,
  banner_url text,
  is_published boolean not null default true,
  is_featured boolean not null default false,
  sort_order int not null default 0,
  seo_title text not null default '' check (char_length(seo_title) <= 120),
  seo_description text not null default '' check (char_length(seo_description) <= 320),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index brands_sort_idx on public.brands (sort_order, name);
create trigger brands_touch before update on public.brands
  for each row execute function public.touch_updated_at();

-- Departments (Women, Men, Unisex, Accessories) are top-level categories; product
-- types are their children. Products filtered by a category include its descendants.
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (public.is_slug(slug)),
  description text not null default '' check (char_length(description) <= 5000),
  image_url text,
  banner_url text,
  size_guide_id uuid references public.size_guides (id) on delete set null,
  is_published boolean not null default true,
  sort_order int not null default 0,
  seo_title text not null default '' check (char_length(seo_title) <= 120),
  seo_description text not null default '' check (char_length(seo_description) <= 320),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index categories_parent_idx on public.categories (parent_id, sort_order);
create trigger categories_touch before update on public.categories
  for each row execute function public.touch_updated_at();

create function public.categories_check_tree() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_cur uuid := new.parent_id;
  v_depth int := 0;
begin
  while v_cur is not null loop
    if v_cur = new.id then
      raise exception 'category_cycle' using errcode = '23514', hint = 'A category cannot be placed inside itself.';
    end if;
    v_depth := v_depth + 1;
    if v_depth > 2 then
      raise exception 'category_too_deep' using errcode = '23514', hint = 'Categories can be nested at most three levels deep.';
    end if;
    select parent_id into v_cur from public.categories where id = v_cur;
  end loop;
  return new;
end $$;
create trigger categories_check_tree before insert or update of parent_id on public.categories
  for each row execute function public.categories_check_tree();

-- The category and every category below it.
create function public.category_subtree(p_category_id uuid) returns setof uuid
language sql stable set search_path = '' as $$
  with recursive t as (
    select c.id from public.categories c where c.id = p_category_id
    union all
    select c.id from public.categories c join t on c.parent_id = t.id
  )
  select id from t
$$;

create table public.products (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  slug text not null unique check (public.is_slug(slug)),
  brand_id uuid references public.brands (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  size_guide_id uuid references public.size_guides (id) on delete set null,
  description text not null default '' check (char_length(description) <= 20000),
  fabric text not null default '' check (char_length(fabric) <= 2000),
  fit text not null default '' check (char_length(fit) <= 2000),
  care text not null default '' check (char_length(care) <= 2000),
  tags text[] not null default '{}' check (cardinality(tags) <= 40),
  status public.product_status not null default 'draft',
  published_at timestamptz,
  is_featured boolean not null default false,
  -- Default selling price for every variant that does not set its own.
  price public.money_minor not null,
  compare_at_price public.money_minor,
  tax_rate_bps int check (tax_rate_bps between 0 and 5000),
  weight_grams int check (weight_grams between 0 and 100000),
  length_mm int check (length_mm between 0 and 10000),
  width_mm int check (width_mm between 0 and 10000),
  height_mm int check (height_mm between 0 and 10000),
  is_returnable boolean not null default true,
  return_window_days int check (return_window_days between 0 and 365),
  seo_title text not null default '' check (char_length(seo_title) <= 120),
  seo_description text not null default '' check (char_length(seo_description) <= 320),
  is_sample boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Kept up to date by triggers from the variants, brand and category; read-only for staff.
  min_price public.money_minor,
  max_price public.money_minor,
  min_price_compare_at public.money_minor,
  on_sale boolean not null default false,
  available_stock int not null default 0,
  sizes text[] not null default '{}',
  colors text[] not null default '{}',
  swatches jsonb not null default '[]',
  search_text text not null default '',
  sales_count int not null default 0,
  rating_avg numeric(3, 2),
  rating_count int not null default 0,
  check (compare_at_price is null or compare_at_price > price)
);
create index products_visible_idx on public.products (status, published_at);
create index products_brand_idx on public.products (brand_id);
create index products_category_idx on public.products (category_id);
create index products_created_idx on public.products (created_at desc);
create index products_min_price_idx on public.products (min_price);
create index products_sales_idx on public.products (sales_count desc);
create index products_sizes_idx on public.products using gin (sizes);
create index products_colors_idx on public.products using gin (colors);
create index products_tags_idx on public.products using gin (tags);
create index products_search_idx on public.products using gin (search_text extensions.gin_trgm_ops);

-- Activating a product without a publication date publishes it now; staff can set a
-- future date to schedule it.
create function public.products_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'active' and new.published_at is null then
    new.published_at := now();
  end if;
  if tg_op = 'UPDATE' and pg_trigger_depth() = 1 then
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger products_before_write before insert or update on public.products
  for each row execute function public.products_before_write();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  url text not null check (url ~ '^(https?://|/)'),
  storage_path text,
  alt text not null default '' check (char_length(alt) <= 300),
  -- Optional: show this image when the customer picks this colour.
  color text,
  position int not null default 0,
  width int,
  height int,
  created_at timestamptz not null default now()
);
create index product_images_product_idx on public.product_images (product_id, position);
create index product_images_path_idx on public.product_images (storage_path) where storage_path is not null;

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  sku text not null check (sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$'),
  size text not null default '' check (char_length(size) <= 30),
  color text not null default '' check (char_length(color) <= 40),
  color_hex text check (color_hex is null or public.is_hex_color(color_hex)),
  price public.money_minor,
  compare_at_price public.money_minor,
  stock_quantity int not null default 0 check (stock_quantity >= 0),
  -- Units held by orders waiting for payment. Never above stock, so stock that is
  -- promised to one order can never be sold to another.
  reserved_quantity int not null default 0 check (reserved_quantity >= 0),
  low_stock_threshold int check (low_stock_threshold between 0 and 10000),
  barcode text check (char_length(barcode) <= 64),
  weight_grams int check (weight_grams between 0 and 100000),
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reserved_quantity <= stock_quantity),
  unique (product_id, size, color)
);
create unique index product_variants_sku_key on public.product_variants (upper(sku));
create index product_variants_product_idx on public.product_variants (product_id, position);
create index product_variants_low_stock_idx on public.product_variants ((stock_quantity - reserved_quantity));
create trigger product_variants_touch before update on public.product_variants
  for each row execute function public.touch_updated_at();

create function public.variants_check_price() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.compare_at_price is not null
     and new.compare_at_price <= coalesce(new.price, (select p.price from public.products p where p.id = new.product_id)) then
    raise exception 'compare_at_not_higher' using errcode = '23514',
      hint = format('The compare-at price for %s must be higher than its selling price.', new.sku);
  end if;
  return new;
end $$;
create trigger product_variants_check_price before insert or update of price, compare_at_price on public.product_variants
  for each row execute function public.variants_check_price();

-- Every change in stock on hand leaves a movement. Functions that change stock for a
-- reason (a sale, a return) label it with set_config('app.stock_reason', ...) first;
-- anything else is recorded as a manual adjustment by the signed-in user.
create table public.inventory_movements (
  id bigint generated always as identity primary key,
  variant_id uuid references public.product_variants (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  sku text not null,
  delta int not null check (delta <> 0),
  quantity_after int not null,
  reason public.inventory_reason not null,
  note text,
  order_id uuid,
  actor_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_variant_idx on public.inventory_movements (variant_id, created_at desc);
create index inventory_movements_created_idx on public.inventory_movements (created_at desc);
create index inventory_movements_order_idx on public.inventory_movements (order_id) where order_id is not null;

create function public.set_stock_context(p_reason public.inventory_reason, p_note text default null, p_order_id uuid default null)
returns void
language sql set search_path = '' as $$
  select set_config('app.stock_reason', coalesce(p_reason::text, ''), true),
         set_config('app.stock_note', coalesce(p_note, ''), true),
         set_config('app.stock_order_id', coalesce(p_order_id::text, ''), true);
$$;

create function public.clear_stock_context() returns void
language sql set search_path = '' as $$
  select set_config('app.stock_reason', '', true),
         set_config('app.stock_note', '', true),
         set_config('app.stock_order_id', '', true);
$$;

create function public.log_stock_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_delta int;
  v_reason public.inventory_reason;
begin
  if tg_op = 'INSERT' then
    v_delta := new.stock_quantity;
  else
    v_delta := new.stock_quantity - old.stock_quantity;
  end if;
  if v_delta = 0 then
    return null;
  end if;
  v_reason := coalesce(
    nullif(current_setting('app.stock_reason', true), ''),
    case when tg_op = 'INSERT' then 'initial' else 'adjustment' end
  )::public.inventory_reason;
  insert into public.inventory_movements (variant_id, product_id, sku, delta, quantity_after, reason, note, order_id, actor_id)
  values (
    new.id, new.product_id, new.sku, v_delta, new.stock_quantity, v_reason,
    nullif(current_setting('app.stock_note', true), ''),
    nullif(current_setting('app.stock_order_id', true), '')::uuid,
    (select auth.uid())
  );
  return null;
end $$;
create trigger product_variants_log_stock after insert or update of stock_quantity on public.product_variants
  for each row execute function public.log_stock_change();

-- Recomputes a product's derived columns from its active variants, brand and category.
create function public.refresh_product_rollup(p_product_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.products p set
    min_price = coalesce(r.min_price, p.price),
    max_price = coalesce(r.max_price, p.price),
    min_price_compare_at = case when r.min_compare > coalesce(r.min_price, p.price) then r.min_compare end,
    on_sale = coalesce(r.on_sale, false),
    available_stock = greatest(coalesce(r.available, 0), 0),
    sizes = coalesce(r.sizes, '{}'),
    colors = coalesce(r.colors, '{}'),
    swatches = coalesce(r.swatches, '[]'),
    search_text = lower(concat_ws(' ', p.title, r.brand_name, r.category_name, array_to_string(p.tags, ' '), r.skus))
  from (
    select
      min(coalesce(v.price, p2.price)) as min_price,
      max(coalesce(v.price, p2.price)) as max_price,
      (array_agg(coalesce(v.compare_at_price, p2.compare_at_price) order by coalesce(v.price, p2.price), v.position))[1] as min_compare,
      bool_or(coalesce(v.compare_at_price, p2.compare_at_price) > coalesce(v.price, p2.price)) as on_sale,
      sum(v.stock_quantity - v.reserved_quantity)::int as available,
      array_agg(distinct v.size) filter (where v.size <> '') as sizes,
      array_agg(distinct v.color) filter (where v.color <> '') as colors,
      (
        select jsonb_agg(jsonb_build_object('name', s.color, 'hex', s.hex) order by s.pos)
        from (
          select v2.color, max(v2.color_hex) as hex, min(v2.position) as pos
          from public.product_variants v2
          where v2.product_id = p2.id and v2.is_active and v2.color <> ''
          group by v2.color
        ) s
      ) as swatches,
      string_agg(v.sku, ' ') as skus,
      (select b.name from public.brands b where b.id = p2.brand_id) as brand_name,
      (select c.name from public.categories c where c.id = p2.category_id) as category_name
    from public.products p2
    left join public.product_variants v on v.product_id = p2.id and v.is_active
    where p2.id = p_product_id
    group by p2.id
  ) r
  where p.id = p_product_id
$$;
revoke execute on function public.refresh_product_rollup(uuid) from public, anon, authenticated;

create function public.products_after_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.refresh_product_rollup(new.id);
  return null;
end $$;
create trigger products_after_insert after insert on public.products
  for each row execute function public.products_after_write();
create trigger products_after_update after update of title, tags, brand_id, category_id, price, compare_at_price on public.products
  for each row execute function public.products_after_write();

create function public.variants_after_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    for v_id in select distinct product_id from new_rows loop
      perform public.refresh_product_rollup(v_id);
    end loop;
  elsif tg_op = 'DELETE' then
    for v_id in select distinct product_id from old_rows loop
      perform public.refresh_product_rollup(v_id);
    end loop;
  else
    for v_id in select product_id from new_rows union select product_id from old_rows loop
      perform public.refresh_product_rollup(v_id);
    end loop;
  end if;
  return null;
end $$;
create trigger product_variants_rollup_insert after insert on public.product_variants
  referencing new table as new_rows for each statement execute function public.variants_after_change();
create trigger product_variants_rollup_update after update on public.product_variants
  referencing new table as new_rows old table as old_rows for each statement execute function public.variants_after_change();
create trigger product_variants_rollup_delete after delete on public.product_variants
  referencing old table as old_rows for each statement execute function public.variants_after_change();

create function public.brand_or_category_renamed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
begin
  for v_id in
    select p.id from public.products p
    where (tg_table_name = 'brands' and p.brand_id = new.id)
       or (tg_table_name = 'categories' and p.category_id = new.id)
  loop
    perform public.refresh_product_rollup(v_id);
  end loop;
  return null;
end $$;
create trigger brands_renamed after update of name on public.brands
  for each row when (old.name is distinct from new.name) execute function public.brand_or_category_renamed();
create trigger categories_renamed after update of name on public.categories
  for each row when (old.name is distinct from new.name) execute function public.brand_or_category_renamed();

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  slug text not null unique check (public.is_slug(slug)),
  description text not null default '' check (char_length(description) <= 5000),
  image_url text,
  banner_url text,
  kind public.collection_kind not null default 'manual',
  -- Automated collections: {"match": "all"|"any", "conditions": [{"field", "op", "value"}]}
  rules jsonb not null default '{"match": "all", "conditions": []}' check (jsonb_typeof(rules) = 'object'),
  is_seasonal boolean not null default false,
  season text not null default '' check (char_length(season) <= 60),
  is_featured boolean not null default false,
  is_published boolean not null default true,
  sort_order int not null default 0,
  product_sort text not null default 'manual' check (product_sort in ('manual', 'newest', 'price_asc', 'price_desc', 'best_selling')),
  starts_at timestamptz,
  ends_at timestamptz,
  seo_title text not null default '' check (char_length(seo_title) <= 120),
  seo_description text not null default '' check (char_length(seo_description) <= 320),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index collections_sort_idx on public.collections (sort_order, title);
create trigger collections_touch before update on public.collections
  for each row execute function public.touch_updated_at();

create table public.collection_products (
  collection_id uuid not null references public.collections (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  position int not null default 0,
  primary key (collection_id, product_id)
);
create index collection_products_product_idx on public.collection_products (product_id);

-- ---------------------------------------------------------------------------
-- Row-level security. The public sees published catalog rows; staff manage everything.
-- ---------------------------------------------------------------------------
create function public.product_visible(p_product_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.products p
    where p.id = p_product_id and p.status = 'active' and p.published_at <= now()
  )
$$;
grant execute on function public.product_visible(uuid) to anon, authenticated;

alter table public.size_guides enable row level security;
alter table public.brands enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.collections enable row level security;
alter table public.collection_products enable row level security;

create policy size_guides_public_read on public.size_guides for select to anon, authenticated using (true);
create policy brands_public_read on public.brands for select to anon, authenticated
  using (is_published or (select public.is_staff()));
create policy categories_public_read on public.categories for select to anon, authenticated
  using (is_published or (select public.is_staff()));
create policy products_public_read on public.products for select to anon, authenticated
  using ((status = 'active' and published_at <= now()) or (select public.is_staff()));
create policy product_images_public_read on public.product_images for select to anon, authenticated
  using (public.product_visible(product_id) or (select public.is_staff()));
create policy product_variants_public_read on public.product_variants for select to anon, authenticated
  using (public.product_visible(product_id) or (select public.is_staff()));
create policy collections_public_read on public.collections for select to anon, authenticated
  using (
    (is_published and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()))
    or (select public.is_staff())
  );
create policy collection_products_public_read on public.collection_products for select to anon, authenticated
  using (public.product_visible(product_id) or (select public.is_staff()));
create policy inventory_movements_staff_read on public.inventory_movements for select to authenticated
  using ((select public.is_staff()));

create policy size_guides_staff_write on public.size_guides for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy brands_staff_write on public.brands for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy categories_staff_write on public.categories for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy products_staff_write on public.products for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy product_images_staff_write on public.product_images for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy product_variants_staff_write on public.product_variants for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy collections_staff_write on public.collections for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy collection_products_staff_write on public.collection_products for all to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));

revoke all on public.size_guides, public.brands, public.categories, public.products, public.product_images,
  public.product_variants, public.inventory_movements, public.collections, public.collection_products
  from anon, authenticated;

grant select on public.size_guides, public.brands, public.categories, public.products, public.product_images,
  public.product_variants, public.collections, public.collection_products to anon, authenticated;
grant select on public.inventory_movements to authenticated;

grant insert, update, delete on public.size_guides, public.brands, public.categories, public.product_images,
  public.collections, public.collection_products to authenticated;

-- Products and variants: staff may write the columns they own, not the derived ones,
-- and never reserved_quantity (only checkout functions move reservations).
grant delete on public.products, public.product_variants to authenticated;
grant insert (id, title, slug, brand_id, category_id, size_guide_id, description, fabric, fit, care, tags, status,
  published_at, is_featured, price, compare_at_price, tax_rate_bps, weight_grams, length_mm, width_mm, height_mm,
  is_returnable, return_window_days, seo_title, seo_description, is_sample, created_by)
  on public.products to authenticated;
grant update (title, slug, brand_id, category_id, size_guide_id, description, fabric, fit, care, tags, status,
  published_at, is_featured, price, compare_at_price, tax_rate_bps, weight_grams, length_mm, width_mm, height_mm,
  is_returnable, return_window_days, seo_title, seo_description, is_sample)
  on public.products to authenticated;
grant insert (id, product_id, sku, size, color, color_hex, price, compare_at_price, stock_quantity,
  low_stock_threshold, barcode, weight_grams, position, is_active)
  on public.product_variants to authenticated;
grant update (sku, size, color, color_hex, price, compare_at_price, stock_quantity, low_stock_threshold,
  barcode, weight_grams, position, is_active)
  on public.product_variants to authenticated;
