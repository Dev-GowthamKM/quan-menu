-- Store designs: each store's layout and manner (its header and menu, homepage, product
-- cards, section titles, buttons, product photos and footer) on top of its colours and fonts,
-- chosen in Settings › Appearance (src/lib/designs.ts). design_options holds the parts a
-- store mixes in from other designs. Stores made before this update keep the look they have.

alter table public.store_settings
  add column design text not null default 'atelier' check (design ~ '^[a-z][a-z0-9-]{1,29}$'),
  add column design_options jsonb not null default '{}'::jsonb check (jsonb_typeof(design_options) = 'object');

-- More fonts to choose from. The app knows which it can load; the database keeps the names
-- well-formed, so adding a font later needs no database change.
alter table public.store_settings
  drop constraint if exists store_settings_heading_font_check,
  drop constraint if exists store_settings_body_font_check;
alter table public.store_settings
  add constraint store_settings_heading_font_check check (heading_font ~ '^[a-z][a-z0-9-]{1,29}$'),
  add constraint store_settings_body_font_check check (body_font ~ '^[a-z][a-z0-9-]{1,29}$');

-- New stores start with the design (and mixed-in parts) chosen for them.
create or replace function public.platform_create_store(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(coalesce(p ->> 'name', ''));
  v_slug text := lower(btrim(coalesce(p ->> 'slug', '')));
  v_prefix text := upper(btrim(coalesce(p ->> 'order_prefix', '')));
  v_host text := nullif(public.normalize_hostname(p ->> 'hostname'), '');
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
  v_starter := public.store_starter_content(v_name);
  insert into public.store_settings (store_id, store_name, tagline, primary_color, brand_color, accent_color, background_color,
                                     heading_font, body_font, heading_italic, design, design_options, seo_title, seo_description,
                                     policies, faq, social, homepage, email_templates)
  values (v_store, v_name, coalesce(left(p ->> 'tagline', 160), ''),
          coalesce(p -> 'colors' ->> 'text', '#1f1416'), coalesce(p -> 'colors' ->> 'brand', '#6b1d2e'),
          coalesce(p -> 'colors' ->> 'accent', '#b07d2b'), coalesce(p -> 'colors' ->> 'background', '#fbf6ee'),
          coalesce(p ->> 'heading_font', 'cormorant'), coalesce(p ->> 'body_font', 'jost'),
          coalesce((p ->> 'heading_italic')::boolean, true),
          coalesce(nullif(p ->> 'design', ''), 'atelier'),
          case when jsonb_typeof(p -> 'design_options') = 'object' then p -> 'design_options' else '{}'::jsonb end,
          left(v_name, 120), coalesce(left(p ->> 'tagline', 160), ''),
          v_starter -> 'policies', v_starter -> 'faq', v_starter -> 'social', v_starter -> 'homepage', v_starter -> 'email_templates');
  insert into public.user_roles (store_id, user_id, role, granted_by) values (v_store, v_owner, 'owner', (select auth.uid()));
  insert into public.shipping_zones (store_id, name, countries, priority) values (v_store, 'All India', array['IN'], 0)
  returning id into v_zone;
  insert into public.shipping_rates (store_id, zone_id, name, description, price, free_over, min_days, max_days, cod_available, sort_order)
  values (v_store, v_zone, 'Standard', 'Tracked delivery', 9900, null, 3, 7, true, 1),
         (v_store, v_zone, 'Express', 'Priority dispatch', 24900, null, 1, 3, false, 2);
  insert into public.shipping_providers (store_id, name)
  select v_store, x from unnest(array['Delhivery', 'Blue Dart', 'DTDC', 'India Post', 'Ekart', 'Shiprocket', 'Other']) x;
  perform public.write_audit('store.create', 'store', v_store::text,
    jsonb_build_object('name', v_name, 'slug', v_slug, 'hostname', v_host, 'owner', v_owner), v_store);
  perform set_config('app.cross_store', '', true);
  return v_store;
end $$;

create or replace function public.app_schema_version() returns text
language sql immutable set search_path = '' as $$
  select '20261026000100'::text
$$;
revoke execute on function public.app_schema_version() from public, anon;
grant execute on function public.app_schema_version() to authenticated, service_role;
