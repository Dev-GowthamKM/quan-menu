-- Starting configuration for a new store: one delivery zone covering all of India and
-- a short list of couriers for tracking links. Edit both in Admin > Shipping.

insert into public.shipping_zones (name, countries, priority)
values ('All India', array['IN'], 0);

insert into public.shipping_rates (zone_id, name, description, price, free_over, min_days, max_days, cod_available, sort_order)
select id, 'Standard', 'Tracked delivery', 9900, null, 3, 7, true, 1
from public.shipping_zones where name = 'All India';

insert into public.shipping_rates (zone_id, name, description, price, free_over, min_days, max_days, cod_available, sort_order)
select id, 'Express', 'Priority dispatch', 24900, null, 1, 3, false, 2
from public.shipping_zones where name = 'All India';

-- Add each courier's tracking page in Admin > Shipping, using {tracking} where the
-- tracking number goes, and staff get a ready-made link when they ship an order.
insert into public.shipping_providers (name) values
  ('Delhivery'), ('Blue Dart'), ('DTDC'), ('India Post'), ('Ekart'), ('Shiprocket'), ('Other');
