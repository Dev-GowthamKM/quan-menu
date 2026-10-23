-- Theme: a brand colour for buttons, bands and the footer, separate from the text colour,
-- and italic headings. The storefront derives its panels, borders and secondary text from
-- these (src/lib/theme.ts). A store still on the original palette moves to the new
-- default, wine and gold. A store that chose its own colours keeps them.

alter table public.store_settings
  add column brand_color text check (public.is_hex_color(brand_color)),
  add column heading_italic boolean not null default true;

update public.store_settings set brand_color = primary_color;

update public.store_settings
set primary_color = '#1f1416', brand_color = '#6b1d2e', accent_color = '#b07d2b', background_color = '#fbf6ee'
where lower(primary_color) = '#111111' and lower(accent_color) = '#8c6a43' and lower(background_color) = '#f7f3ec';

alter table public.store_settings
  alter column brand_color set not null,
  alter column brand_color set default '#6b1d2e',
  alter column primary_color set default '#1f1416',
  alter column accent_color set default '#b07d2b',
  alter column background_color set default '#fbf6ee';
