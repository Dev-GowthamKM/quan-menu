-- Supabase's database advice, acted on.
--
-- 1. Trigger functions run only when the database fires them. They no longer appear as
--    functions anyone can call through the API (/rest/v1/rpc). The database fires triggers
--    whoever is allowed to call the function, so nothing else changes. (guard_store,
--    inherit_store and the other later ones were already set up this way.)
-- 2. The histories a store looks up by order, shipment, payment, return, product or variant
--    get indexes: payment and courier events, refunds, inventory movements, back-in-stock
--    requests, reviews, COD blocks and wishlist items. Each index has its foreign key's columns,
--    in its order, so deleting an order or a product doesn't scan these tables either.

do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

create index if not exists payment_events_order_idx on public.payment_events (store_id, order_id);
create index if not exists courier_events_order_idx on public.courier_events (store_id, order_id);
create index if not exists courier_events_shipment_idx on public.courier_events (store_id, shipment_id);
create index if not exists refunds_payment_idx on public.refunds (store_id, payment_id);
create index if not exists refunds_return_idx on public.refunds (store_id, return_request_id);
create index if not exists inventory_movements_product_idx on public.inventory_movements (store_id, product_id);
create index if not exists stock_alerts_product_idx on public.stock_alerts (store_id, product_id);
create index if not exists product_reviews_order_idx on public.product_reviews (store_id, order_id);
create index if not exists cod_blocklist_order_idx on public.cod_blocklist (store_id, order_id);
create index if not exists wishlist_items_variant_idx on public.wishlist_items (store_id, variant_id);

create or replace function public.app_schema_version() returns text
language sql immutable set search_path = '' as $$
  select '20261029000100'::text
$$;
revoke execute on function public.app_schema_version() from public, anon;
grant execute on function public.app_schema_version() to authenticated, service_role;
