-- Motion: video banners on the home page, and a 360° view of products.
--
-- 1. The catalog bucket also takes short videos (MP4 or WebM, up to 50 MB) for the home
--    page's banners. Who can upload is unchanged: only a store's own staff, into its own
--    folder (storage policies from 20261024000100). Images stay limited to 10 MB by the
--    admin, which shrinks them in the browser before uploading.
-- 2. products.spin: show the product's photos as a view the shopper turns by dragging.
-- 3. get_product_page returns it.

update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'video/webm']
where id = 'catalog';

alter table public.products add column spin boolean not null default false;
comment on column public.products.spin is 'Show the photos as a 360° view on the product page (photos taken all the way round, in order).';
-- Staff switch it from the product editor (row-level security keeps them to their own store's products).
grant update (spin) on public.products to authenticated;

-- As in 20261018000400, plus spin.
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
    'updated_at', p.updated_at, 'spin', p.spin,
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

create or replace function public.app_schema_version() returns text
language sql immutable set search_path = '' as $$
  select '20261027000100'::text
$$;
revoke execute on function public.app_schema_version() from public, anon;
grant execute on function public.app_schema_version() to authenticated, service_role;
