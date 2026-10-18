-- Storage bucket for catalog images, audit triggers on sensitive tables, the
-- reservation-expiry schedule, and final grants for the server's service role.

-- ---------------------------------------------------------------------------
-- Catalog images: public to read (product photos are public by nature), writable by
-- staff only. Customers cannot upload or delete anything.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('catalog', 'catalog', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy catalog_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'catalog' and (select public.is_staff()));
create policy catalog_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog' and (select public.is_staff()));
create policy catalog_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'catalog' and (select public.is_staff()))
  with check (bucket_id = 'catalog' and (select public.is_staff()));
create policy catalog_staff_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalog' and (select public.is_staff()));

-- ---------------------------------------------------------------------------
-- Audit triggers. Arguments list columns left out of the diff (timestamps and values
-- derived by triggers), so routine recalculation does not flood the log.
-- ---------------------------------------------------------------------------
create trigger audit_products after insert or update or delete on public.products
  for each row execute function public.audit_row_change(
    'updated_at', 'min_price', 'max_price', 'min_price_compare_at', 'on_sale', 'available_stock', 'sizes', 'colors',
    'swatches', 'search_text', 'sales_count', 'rating_avg', 'rating_count', 'description');
create trigger audit_product_variants after insert or update or delete on public.product_variants
  for each row execute function public.audit_row_change('updated_at', 'stock_quantity', 'reserved_quantity', 'position');
create trigger audit_brands after insert or update or delete on public.brands
  for each row execute function public.audit_row_change('updated_at');
create trigger audit_categories after insert or update or delete on public.categories
  for each row execute function public.audit_row_change('updated_at');
create trigger audit_collections after insert or update or delete on public.collections
  for each row execute function public.audit_row_change('updated_at');
create trigger audit_coupons after insert or update or delete on public.coupons
  for each row execute function public.audit_row_change('updated_at');
create trigger audit_store_settings after update on public.store_settings
  for each row execute function public.audit_row_change('updated_at', 'updated_by');
create trigger audit_user_roles after insert or update or delete on public.user_roles
  for each row execute function public.audit_row_change();
create trigger audit_shipping_zones after insert or update or delete on public.shipping_zones
  for each row execute function public.audit_row_change('updated_at');
create trigger audit_shipping_rates after insert or update or delete on public.shipping_rates
  for each row execute function public.audit_row_change('updated_at');
create trigger audit_postal_code_rules after insert or update or delete on public.postal_code_rules
  for each row execute function public.audit_row_change();
create trigger audit_orders after update on public.orders
  for each row execute function public.audit_row_change('updated_at', 'expires_at');
create trigger audit_refunds after insert or update on public.refunds
  for each row execute function public.audit_row_change('updated_at');
create trigger audit_payments after insert or update on public.payments
  for each row execute function public.audit_row_change('updated_at', 'details');
create trigger audit_return_requests after insert or update on public.return_requests
  for each row execute function public.audit_row_change('updated_at');
create trigger audit_product_reviews after update or delete on public.product_reviews
  for each row execute function public.audit_row_change('updated_at');

-- ---------------------------------------------------------------------------
-- Give back stock held by expired unpaid orders every five minutes. pg_cron is
-- available on Supabase; where it is not, the app's /api/cron/housekeeping route (and
-- every checkout) does the same job.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('store-housekeeping', '*/5 * * * *', 'select public.housekeeping()');
  end if;
exception when others then
  raise notice 'pg_cron is not available (%); use the /api/cron/housekeeping route instead.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- The Next.js server's service role uses every table and function. (Supabase normally
-- grants this by default; being explicit keeps projects that disable automatic grants
-- working.)
-- ---------------------------------------------------------------------------
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
