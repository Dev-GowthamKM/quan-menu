-- Checkout engine: carts, pricing, order placement, payment confirmation, reservation
-- expiry and cancellation.
--
-- Every function here is executable only by the service role. The Next.js server calls
-- them after verifying who the customer is (a Supabase session, a guest cart cookie or
-- a signed order link) and passes that identity in explicitly. Prices, discounts, tax
-- and totals are always computed here from catalog data; nothing the browser sends is
-- trusted beyond "which variant, how many, which address, which payment method".
--
-- Stock: an online order reserves units (reserved_quantity) when it is placed and
-- converts them into a sale when the payment provider confirms capture. A cash-on-
-- delivery order takes the stock immediately. Both use conditional updates on the
-- variant row, and the table's CHECK constraints make overselling impossible even when
-- many checkouts run at once.

create function public.normalize_address(a jsonb) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_country text := upper(coalesce(nullif(btrim(a ->> 'country'), ''), 'IN'));
  v jsonb;
begin
  if a is null or jsonb_typeof(a) <> 'object' then
    raise exception 'invalid_address' using errcode = '22023', hint = 'Enter a delivery address.';
  end if;
  v := jsonb_build_object(
    'full_name', left(btrim(coalesce(a ->> 'full_name', '')), 120),
    'phone', left(btrim(coalesce(a ->> 'phone', '')), 20),
    'line1', left(btrim(coalesce(a ->> 'line1', '')), 200),
    'line2', left(btrim(coalesce(a ->> 'line2', '')), 200),
    'landmark', left(btrim(coalesce(a ->> 'landmark', '')), 120),
    'city', left(btrim(coalesce(a ->> 'city', '')), 100),
    'state', left(btrim(coalesce(a ->> 'state', '')), 100),
    'postal_code', upper(regexp_replace(coalesce(a ->> 'postal_code', ''), '\s+', '', 'g')),
    'country', v_country
  );
  if v ->> 'full_name' = '' then
    raise exception 'invalid_address' using errcode = '22023', hint = 'Enter the recipient''s full name.';
  elsif not public.is_phone(v ->> 'phone') then
    raise exception 'invalid_address' using errcode = '22023', hint = 'Enter a valid phone number for the courier.';
  elsif v ->> 'line1' = '' then
    raise exception 'invalid_address' using errcode = '22023', hint = 'Enter the house number and street.';
  elsif v ->> 'city' = '' then
    raise exception 'invalid_address' using errcode = '22023', hint = 'Enter the city.';
  elsif v ->> 'state' = '' then
    raise exception 'invalid_address' using errcode = '22023', hint = 'Choose the state.';
  elsif v_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_address' using errcode = '22023', hint = 'Choose a country.';
  elsif v_country = 'IN' and (v ->> 'postal_code') !~ '^[1-9][0-9]{5}$' then
    raise exception 'invalid_address' using errcode = '22023', hint = 'Enter a valid 6-digit PIN code.';
  elsif (v ->> 'postal_code') !~ '^[A-Z0-9-]{3,10}$' then
    raise exception 'invalid_address' using errcode = '22023', hint = 'Enter a valid postal code.';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Carts
-- ---------------------------------------------------------------------------
create function public.cart_find(p_user_id uuid, p_token text, p_create boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_hash text;
begin
  if p_user_id is not null then
    select id into v_id from public.carts where user_id = p_user_id;
    if v_id is null and p_create then
      insert into public.carts (user_id) values (p_user_id)
      on conflict (user_id) do update set updated_at = now()
      returning id into v_id;
    end if;
  elsif p_token is not null and char_length(p_token) between 32 and 128 then
    v_hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
    select id into v_id from public.carts where token_hash = v_hash and user_id is null;
    if v_id is null and p_create then
      insert into public.carts (token_hash) values (v_hash)
      on conflict (token_hash) do update set updated_at = now()
      returning id into v_id;
    end if;
  end if;
  return v_id;
end $$;

-- The tax rate for one unit at a given (discounted) price: the product's own rate if
-- set, otherwise the first store slab whose ceiling the price fits under.
create function public.tax_rate_for(p_unit_price bigint, p_product_rate int, p_slabs jsonb) returns int
language sql immutable set search_path = '' as $$
  select coalesce(
    p_product_rate,
    (
      select (s ->> 'rate_bps')::int
      from jsonb_array_elements(coalesce(p_slabs, '[]')) with ordinality as x(s, ord)
      where (s ->> 'up_to') is null or p_unit_price <= (s ->> 'up_to')::bigint
      order by ord
      limit 1
    ),
    0
  )
$$;

-- Tax contained in (inclusive) or added to (exclusive) an amount, rounded to the paisa.
create function public.tax_amount(p_amount bigint, p_rate_bps int, p_mode text) returns bigint
language sql immutable set search_path = '' as $$
  select case
    when p_mode = 'inclusive' then round(p_amount::numeric * p_rate_bps / (10000 + p_rate_bps))::bigint
    when p_mode = 'exclusive' then round(p_amount::numeric * p_rate_bps / 10000)::bigint
    else 0
  end
$$;

-- The pricing engine. Returns the full quote for a cart: lines with any problems,
-- coupon result, delivery options for the address, payment methods allowed, tax and
-- totals. p_coupon_code overrides the code saved on the cart ('' means none).
create function public.quote_cart(
  p_cart_id uuid,
  p_user_id uuid default null,
  p_email text default null,
  p_address jsonb default null,
  p_rate_id uuid default null,
  p_payment_method text default null,
  p_coupon_code text default null
) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.store_settings;
  r record;
  n int := 0;
  i int;
  v_line_info jsonb[] := '{}';
  v_valid boolean[] := '{}';
  v_sub bigint[] := '{}';
  v_qty int[] := '{}';
  v_eligible boolean[] := '{}';
  v_disc bigint[] := '{}';
  v_prate int[] := '{}';
  v_product public.products;
  v_lines jsonb := '[]';
  v_issues jsonb := '[]';
  v_subtotal bigint := 0;
  v_items int := 0;
  v_code text;
  v_coupon public.coupons;
  v_coupon_json jsonb;
  v_coupon_ok boolean := false;
  v_coupon_msg text;
  v_pending_email boolean := false;
  v_eligible_sub bigint := 0;
  v_discount bigint := 0;
  v_free_ship boolean := false;
  v_alloc bigint;
  v_left bigint;
  v_largest int;
  v_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_country text;
  v_state text;
  v_postal text;
  v_rule public.postal_code_rules;
  v_zone public.shipping_zones;
  v_rates jsonb := '[]';
  v_rate record;
  v_selected uuid;
  v_selected_rate jsonb;
  v_serviceable boolean;
  v_shipping bigint;
  v_cod_possible boolean := false;
  v_cod_reason text;
  v_cod_fee bigint := 0;
  v_tax_total bigint := 0;
  v_tax bigint;
  v_rate_bps int;
  v_net bigint;
  v_grand bigint;
  v_threshold bigint;
  v_free_remaining bigint;
  v_after_discount bigint;
  v_used int;
begin
  select * into s from public.store_settings where id = 1;
  v_code := upper(btrim(coalesce(p_coupon_code, (select c.coupon_code from public.carts c where c.id = p_cart_id), '')));

  -- 1. Lines, with availability checked against live stock.
  for r in
    select ci.variant_id, ci.quantity, v.sku, v.size, v.color, v.is_active,
           (v.stock_quantity - v.reserved_quantity) as available,
           coalesce(v.price, p.price) as unit_price,
           coalesce(v.compare_at_price, p.compare_at_price) as compare_at,
           p.id as product_id, p.slug, p.title, p.status, p.published_at, p.tax_rate_bps,
           p.category_id, p.is_returnable, coalesce(p.return_window_days, s.return_window_days) as return_window_days,
           b.name as brand,
           (select im.url from public.product_images im
             where im.product_id = p.id
             order by (im.color is not null and im.color = v.color) desc, im.position
             limit 1) as image_url
    from public.cart_items ci
    join public.product_variants v on v.id = ci.variant_id
    join public.products p on p.id = v.product_id
    left join public.brands b on b.id = p.brand_id
    where ci.cart_id = p_cart_id
    order by ci.created_at, ci.id
  loop
    n := n + 1;
    v_qty := v_qty || r.quantity;
    v_prate := v_prate || r.tax_rate_bps;
    v_disc := v_disc || 0::bigint;
    v_eligible := v_eligible || false;
    if not r.is_active or r.status <> 'active' or r.published_at > now() then
      v_valid := v_valid || false;
      v_sub := v_sub || 0::bigint;
      v_line_info := v_line_info || jsonb_build_object('issue', 'unavailable');
      v_issues := v_issues || jsonb_build_object('variant_id', r.variant_id, 'sku', r.sku, 'issue', 'unavailable',
        'message', format('%s is no longer available.', r.title));
    elsif r.available <= 0 then
      v_valid := v_valid || false;
      v_sub := v_sub || 0::bigint;
      v_line_info := v_line_info || jsonb_build_object('issue', 'out_of_stock');
      v_issues := v_issues || jsonb_build_object('variant_id', r.variant_id, 'sku', r.sku, 'issue', 'out_of_stock',
        'message', format('%s%s is sold out.', r.title, case when r.size <> '' then ' in ' || r.size else '' end));
    elsif r.quantity > r.available then
      v_valid := v_valid || false;
      v_sub := v_sub || 0::bigint;
      v_line_info := v_line_info || jsonb_build_object('issue', 'insufficient_stock');
      v_issues := v_issues || jsonb_build_object('variant_id', r.variant_id, 'sku', r.sku, 'issue', 'insufficient_stock',
        'available', r.available,
        'message', format('Only %s left of %s%s. Lower the quantity to continue.', r.available, r.title,
                          case when r.size <> '' then ' in ' || r.size else '' end));
    else
      v_valid := v_valid || true;
      v_sub := v_sub || (r.unit_price * r.quantity);
      v_line_info := v_line_info || jsonb_build_object('issue', null);
      v_subtotal := v_subtotal + r.unit_price * r.quantity;
      v_items := v_items + r.quantity;
    end if;
    v_line_info[n] := v_line_info[n] || jsonb_build_object(
      'variant_id', r.variant_id, 'product_id', r.product_id, 'category_id', r.category_id,
      'slug', r.slug, 'title', r.title, 'brand', coalesce(r.brand, ''),
      'size', r.size, 'color', r.color, 'sku', r.sku, 'image_url', r.image_url,
      'unit_price', r.unit_price,
      'compare_at_price', case when r.compare_at > r.unit_price then r.compare_at end,
      'quantity', r.quantity, 'available', greatest(r.available, 0),
      'is_returnable', r.is_returnable, 'return_window_days', r.return_window_days
    );
  end loop;

  -- 2. Coupon.
  if v_code <> '' then
    select * into v_coupon from public.coupons where code = v_code;
    if v_coupon.id is null or not v_coupon.is_active then
      v_coupon_msg := 'This code is not valid.';
    elsif v_coupon.starts_at is not null and v_coupon.starts_at > now() then
      v_coupon_msg := 'This code is not active yet.';
    elsif v_coupon.ends_at is not null and v_coupon.ends_at <= now() then
      v_coupon_msg := 'This code has expired.';
    elsif v_coupon.usage_limit is not null and (
      select count(*) from public.coupon_redemptions cr where cr.coupon_id = v_coupon.id and cr.voided_at is null
    ) >= v_coupon.usage_limit then
      v_coupon_msg := 'This code has been fully redeemed.';
    elsif cardinality(v_coupon.customer_emails) > 0 and v_email is not null and not (v_email = any (v_coupon.customer_emails)) then
      v_coupon_msg := 'This code is not available for your account.';
    elsif v_coupon.usage_limit_per_customer is not null and (v_email is not null or p_user_id is not null) and (
      select count(*) from public.coupon_redemptions cr
      where cr.coupon_id = v_coupon.id and cr.voided_at is null
        and ((p_user_id is not null and cr.user_id = p_user_id) or (v_email is not null and lower(cr.email) = v_email))
    ) >= v_coupon.usage_limit_per_customer then
      v_coupon_msg := 'You have already used this code.';
    elsif v_coupon.first_order_only and (v_email is not null or p_user_id is not null) and exists (
      select 1 from public.orders o
      where o.status in ('confirmed', 'completed')
        and ((p_user_id is not null and o.user_id = p_user_id) or (v_email is not null and lower(o.email) = v_email))
    ) then
      v_coupon_msg := 'This code is for your first order only.';
    else
      for i in 1 .. n loop
        if v_valid[i] then
          select * into v_product from public.products where id = (v_line_info[i] ->> 'product_id')::uuid;
          v_eligible[i] := case v_coupon.applies_to
            when 'all' then true
            when 'products' then v_product.id = any (v_coupon.product_ids)
            when 'categories' then exists (
              select 1 from unnest(v_coupon.category_ids) cid
              where v_product.category_id in (select public.category_subtree(cid))
            )
            when 'collections' then exists (
              select 1 from public.collections c
              where c.id = any (v_coupon.collection_ids) and public.product_in_collection(v_product, c)
            )
            else false
          end;
          if v_eligible[i] then
            v_eligible_sub := v_eligible_sub + v_sub[i];
          end if;
        end if;
      end loop;
      if v_eligible_sub = 0 then
        v_coupon_msg := 'This code does not apply to the items in your bag.';
      elsif v_subtotal < v_coupon.min_subtotal then
        v_coupon_msg := format('Spend %s more to use this code.', public.format_money(v_coupon.min_subtotal - v_subtotal, s.currency));
      else
        v_coupon_ok := true;
        v_pending_email := v_email is null and p_user_id is null and (
          cardinality(v_coupon.customer_emails) > 0 or v_coupon.usage_limit_per_customer is not null or v_coupon.first_order_only
        );
        if v_coupon.kind = 'percentage' then
          v_discount := floor(v_eligible_sub::numeric * v_coupon.value / 10000)::bigint;
          if v_coupon.max_discount is not null then
            v_discount := least(v_discount, v_coupon.max_discount);
          end if;
        elsif v_coupon.kind = 'fixed' then
          v_discount := least(v_coupon.value, v_eligible_sub);
        else
          v_free_ship := true;
        end if;
        -- Spread the discount over eligible lines in proportion to their value; the
        -- rounding remainder goes to the largest line.
        v_left := v_discount;
        v_largest := null;
        for i in 1 .. n loop
          if v_valid[i] and v_eligible[i] then
            v_alloc := floor(v_discount::numeric * v_sub[i] / v_eligible_sub)::bigint;
            v_disc[i] := v_alloc;
            v_left := v_left - v_alloc;
            if v_largest is null or v_sub[i] > v_sub[v_largest] then
              v_largest := i;
            end if;
          end if;
        end loop;
        if v_largest is not null and v_left > 0 then
          v_disc[v_largest] := v_disc[v_largest] + v_left;
        end if;
        v_coupon_msg := case
          when v_coupon.kind = 'free_shipping' then 'Free delivery applied.'
          else format('You save %s.', public.format_money(v_discount, s.currency))
        end;
      end if;
    end if;
    v_coupon_json := jsonb_build_object(
      'code', v_code, 'valid', v_coupon_ok, 'message', v_coupon_msg,
      'kind', v_coupon.kind, 'free_shipping', v_free_ship, 'amount', v_discount,
      'pending_email_check', v_pending_email
    );
  end if;
  v_after_discount := v_subtotal - v_discount;

  -- 3. Delivery for the address, when we have one.
  if p_address is not null and coalesce(p_address ->> 'postal_code', '') <> '' then
    v_country := upper(coalesce(nullif(p_address ->> 'country', ''), 'IN'));
    v_state := nullif(btrim(coalesce(p_address ->> 'state', '')), '');
    v_postal := upper(regexp_replace(p_address ->> 'postal_code', '\s+', '', 'g'));
    select * into v_rule from public.postal_code_rules where postal_code = v_postal;
    if v_rule.blocks = 'all' then
      v_serviceable := false;
    else
      select * into v_zone from public.shipping_zones where id = public.match_shipping_zone(v_country, v_state, v_postal);
      v_serviceable := v_zone.id is not null;
    end if;
    if v_serviceable then
      for v_rate in
        select * from public.shipping_rates where zone_id = v_zone.id and is_active order by sort_order, price
      loop
        v_rates := v_rates || jsonb_build_object(
          'id', v_rate.id, 'name', v_rate.name, 'description', v_rate.description,
          'base_price', v_rate.price,
          'price', case
            when v_free_ship then 0
            when v_rate.free_over is not null and v_after_discount >= v_rate.free_over then 0
            when s.free_shipping_threshold is not null and v_after_discount >= s.free_shipping_threshold then 0
            else v_rate.price end,
          'free_over', coalesce(v_rate.free_over, s.free_shipping_threshold),
          'min_days', v_rate.min_days, 'max_days', v_rate.max_days,
          'cod', v_rate.cod_available
        );
        if v_selected is null or v_rate.id = p_rate_id then
          v_selected := v_rate.id;
        end if;
      end loop;
      select x into v_selected_rate from jsonb_array_elements(v_rates) x where (x ->> 'id')::uuid = v_selected;
      v_shipping := (v_selected_rate ->> 'price')::bigint;
      v_threshold := (v_selected_rate ->> 'free_over')::bigint;
    else
      v_issues := v_issues || jsonb_build_object('issue', 'not_serviceable',
        'message', 'Sorry, we do not deliver to this PIN code yet.');
    end if;
  else
    v_threshold := s.free_shipping_threshold;
  end if;

  if v_threshold is not null and not v_free_ship and coalesce(v_shipping, 1) > 0 and v_after_discount < v_threshold then
    v_free_remaining := v_threshold - v_after_discount;
  end if;

  -- 4. Tax, per line on the discounted amount.
  for i in 1 .. n loop
    if v_valid[i] then
      v_net := v_sub[i] - v_disc[i];
      v_rate_bps := case when s.tax_mode = 'none' then 0
                         else public.tax_rate_for(v_net / v_qty[i], v_prate[i], s.tax_slabs) end;
      v_tax := public.tax_amount(v_net, v_rate_bps, s.tax_mode);
      v_tax_total := v_tax_total + v_tax;
    else
      v_rate_bps := 0;
      v_tax := 0;
      v_net := 0;
    end if;
    v_lines := v_lines || (v_line_info[i] || jsonb_build_object(
      'line_subtotal', v_sub[i],
      'discount', v_disc[i],
      'tax_rate_bps', v_rate_bps,
      'tax', v_tax,
      'line_total', v_net + case when s.tax_mode = 'exclusive' then v_tax else 0 end
    ));
  end loop;

  -- 5. Payment methods for this order.
  v_grand := v_after_discount + coalesce(v_shipping, 0) + case when s.tax_mode = 'exclusive' then v_tax_total else 0 end;
  if not s.cod_enabled then
    v_cod_reason := 'Cash on delivery is not offered.';
  elsif v_serviceable is null then
    v_cod_reason := 'Enter your delivery address to check cash on delivery.';
  elsif not v_serviceable then
    v_cod_reason := 'Not available for this address.';
  elsif not v_zone.cod_available or v_rule.blocks = 'cod' then
    v_cod_reason := 'Cash on delivery is not available for this PIN code.';
  elsif v_selected_rate is not null and not (v_selected_rate ->> 'cod')::boolean then
    v_cod_reason := 'Cash on delivery is not available with this delivery option.';
  elsif v_grand + s.cod_fee > s.cod_max_order then
    v_cod_reason := format('Cash on delivery is available for orders up to %s.', public.format_money(s.cod_max_order, s.currency));
  elsif v_grand < s.cod_min_order then
    v_cod_reason := format('Cash on delivery is available for orders over %s.', public.format_money(s.cod_min_order, s.currency));
  else
    v_cod_possible := true;
  end if;
  if p_payment_method = 'cod' and v_cod_possible then
    v_cod_fee := s.cod_fee;
  end if;
  v_grand := v_grand + v_cod_fee;

  return jsonb_build_object(
    'cart_id', p_cart_id,
    'currency', s.currency,
    'lines', v_lines,
    'item_count', v_items,
    'line_count', n,
    'subtotal', v_subtotal,
    'discount_total', v_discount,
    'shipping_total', v_shipping,
    'cod_fee', v_cod_fee,
    'tax_total', v_tax_total,
    'tax_mode', s.tax_mode,
    'tax_label', s.tax_label,
    'grand_total', v_grand,
    'coupon', v_coupon_json,
    'shipping', jsonb_build_object(
      'serviceable', v_serviceable,
      'zone', v_zone.name,
      'rates', v_rates,
      'selected_rate_id', v_selected
    ),
    'free_shipping_remaining', v_free_remaining,
    'free_shipping_threshold', v_threshold,
    'payment_methods', jsonb_build_object(
      'razorpay', s.razorpay_enabled,
      'stripe', s.stripe_enabled,
      'cod', v_cod_possible,
      'cod_reason', v_cod_reason,
      'cod_fee', s.cod_fee
    ),
    'issues', v_issues,
    'can_checkout', n > 0 and jsonb_array_length(v_issues) = 0
  );
end $$;

-- Money formatting for messages produced in SQL (the app formats everything else).
create function public.format_money(p_amount bigint, p_currency text) returns text
language sql immutable set search_path = '' as $$
  select case when p_currency = 'INR' then '₹' else p_currency || ' ' end
    || case when p_amount % 100 = 0
            then to_char(p_amount / 100, 'FM9,99,99,99,999')
            else to_char(p_amount / 100.0, 'FM9,99,99,99,990.00') end
$$;

-- Cart reads and edits for the server. p_token is the raw guest-cart cookie value.
create function public.cart_get(
  p_user_id uuid, p_token text,
  p_address jsonb default null, p_rate_id uuid default null,
  p_payment_method text default null, p_email text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cart uuid := public.cart_find(p_user_id, p_token, false);
  v_email text := p_email;
begin
  if v_cart is null then
    return jsonb_build_object('cart_id', null, 'lines', '[]'::jsonb, 'item_count', 0, 'line_count', 0,
      'subtotal', 0, 'discount_total', 0, 'shipping_total', null, 'cod_fee', 0, 'tax_total', 0, 'grand_total', 0,
      'currency', (select currency from public.store_settings where id = 1), 'issues', '[]'::jsonb, 'can_checkout', false);
  end if;
  if v_email is null and p_user_id is not null then
    select email into v_email from auth.users where id = p_user_id;
  end if;
  return public.quote_cart(v_cart, p_user_id, v_email, p_address, p_rate_id, p_payment_method, null);
end $$;

create function public.cart_set_item(
  p_user_id uuid, p_token text, p_variant_id uuid, p_quantity int, p_mode text default 'set'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cart uuid;
  v_current int;
  v_new int;
  v_variant public.product_variants;
  v_available int;
begin
  if p_mode not in ('set', 'add') then
    raise exception 'invalid_mode' using errcode = '22023';
  end if;
  v_cart := public.cart_find(p_user_id, p_token, coalesce(p_quantity, 0) > 0);
  if v_cart is null then
    if coalesce(p_quantity, 0) > 0 then
      raise exception 'no_cart' using errcode = 'P0001', hint = 'Your session has expired. Refresh the page and try again.';
    end if;
    return public.cart_get(p_user_id, p_token);
  end if;
  perform 1 from public.carts where id = v_cart for update;
  select quantity into v_current from public.cart_items where cart_id = v_cart and variant_id = p_variant_id;
  v_new := case when p_mode = 'add' then coalesce(v_current, 0) + coalesce(p_quantity, 0) else coalesce(p_quantity, 0) end;

  if v_new <= 0 then
    delete from public.cart_items where cart_id = v_cart and variant_id = p_variant_id;
  else
    select * into v_variant from public.product_variants where id = p_variant_id;
    if v_variant.id is null or not v_variant.is_active or not public.product_visible(v_variant.product_id) then
      raise exception 'unavailable' using errcode = 'P0001', hint = 'This item is no longer available.';
    end if;
    v_available := v_variant.stock_quantity - v_variant.reserved_quantity;
    if v_new > coalesce(v_current, 0) then
      if v_available <= 0 then
        raise exception 'out_of_stock' using errcode = 'P0001', hint = 'Sorry, this size just sold out.';
      elsif v_new > v_available then
        raise exception 'insufficient_stock' using errcode = 'P0001',
          hint = format('Only %s left in this size%s.', v_available,
                        case when coalesce(v_current, 0) > 0 then format(' and %s already in your bag', v_current) else '' end);
      end if;
    end if;
    if v_new > 20 then
      raise exception 'quantity_limit' using errcode = 'P0001', hint = 'You can buy up to 20 of one item per order.';
    end if;
    if v_current is null and (select count(*) from public.cart_items where cart_id = v_cart) >= 50 then
      raise exception 'cart_full' using errcode = 'P0001', hint = 'Your bag can hold up to 50 different items.';
    end if;
    insert into public.cart_items (cart_id, variant_id, quantity) values (v_cart, p_variant_id, v_new)
    on conflict (cart_id, variant_id) do update set quantity = excluded.quantity, updated_at = now();
  end if;
  update public.carts set updated_at = now() where id = v_cart;
  return public.cart_get(p_user_id, p_token);
end $$;

create function public.cart_set_coupon(p_user_id uuid, p_token text, p_code text, p_email text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cart uuid := public.cart_find(p_user_id, p_token, false);
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_email text := p_email;
  v_quote jsonb;
begin
  if v_cart is null then
    raise exception 'cart_empty' using errcode = 'P0001', hint = 'Your bag is empty.';
  end if;
  if v_email is null and p_user_id is not null then
    select email into v_email from auth.users where id = p_user_id;
  end if;
  if v_code = '' then
    update public.carts set coupon_code = null, updated_at = now() where id = v_cart;
    return public.quote_cart(v_cart, p_user_id, v_email, null, null, null, null);
  end if;
  v_quote := public.quote_cart(v_cart, p_user_id, v_email, null, null, null, v_code);
  -- Only keep codes that work, so a bad code never lingers on the cart.
  if (v_quote -> 'coupon' ->> 'valid')::boolean then
    update public.carts set coupon_code = v_code, updated_at = now() where id = v_cart;
  end if;
  return v_quote;
end $$;

-- After sign-in, move the guest cart's items into the customer's cart.
create function public.cart_merge(p_user_id uuid, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_guest public.carts;
  v_user_cart uuid;
begin
  if p_user_id is null or p_token is null or char_length(p_token) < 32 then
    return public.cart_get(p_user_id, null);
  end if;
  select * into v_guest from public.carts
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and user_id is null
  for update;
  if v_guest.id is null then
    return public.cart_get(p_user_id, null);
  end if;
  v_user_cart := public.cart_find(p_user_id, null, true);
  insert into public.cart_items (cart_id, variant_id, quantity)
  select v_user_cart, gi.variant_id, least(gi.quantity, 20)
  from public.cart_items gi where gi.cart_id = v_guest.id
  on conflict (cart_id, variant_id) do update
    set quantity = least(public.cart_items.quantity + excluded.quantity, 20), updated_at = now();
  update public.carts set coupon_code = coalesce(coupon_code, v_guest.coupon_code), updated_at = now() where id = v_user_cart;
  -- Unpaid orders keep pointing at the cart they came from.
  update public.orders set cart_id = v_user_cart where cart_id = v_guest.id;
  delete from public.carts where id = v_guest.id;
  return public.cart_get(p_user_id, null);
end $$;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create function public.order_brief(p_order public.orders) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p_order.id, 'order_number', p_order.order_number, 'status', p_order.status,
    'payment_status', p_order.payment_status, 'fulfillment_status', p_order.fulfillment_status,
    'payment_method', p_order.payment_method, 'grand_total', p_order.grand_total,
    'currency', p_order.currency, 'email', p_order.email, 'phone', p_order.phone,
    'customer_name', p_order.customer_name, 'expires_at', p_order.expires_at,
    'user_id', p_order.user_id
  )
$$;

-- Cancels an order and gives back its stock. Internal: callers check permissions.
-- Unpaid orders release their reservation; confirmed orders put stock back when
-- p_restock is true. Shipped orders cannot be cancelled (they are returned instead).
create function public.cancel_order_internal(
  p_order_id uuid, p_reason text, p_message text,
  p_actor_type text default 'system', p_actor_id uuid default null, p_restock boolean default true
) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  it record;
  v_was_confirmed boolean;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.status = 'cancelled' then
    return o;
  end if;
  if o.fulfillment_status in ('shipped', 'delivered', 'returned') then
    raise exception 'cannot_cancel_shipped' using errcode = 'P0001',
      hint = 'This order has already shipped. Process a return instead.';
  end if;
  v_was_confirmed := o.status in ('confirmed', 'completed');

  if o.status = 'pending_payment' then
    for it in
      select variant_id, sum(quantity)::int as qty from public.order_items
      where order_id = o.id and variant_id is not null group by variant_id order by variant_id
    loop
      update public.product_variants set reserved_quantity = reserved_quantity - it.qty where id = it.variant_id;
    end loop;
  elsif p_restock then
    perform public.set_stock_context('cancellation', 'Order ' || o.order_number || ' cancelled', o.id);
    for it in
      select variant_id, product_id, sum(quantity)::int as qty from public.order_items
      where order_id = o.id and variant_id is not null group by variant_id, product_id order by variant_id
    loop
      update public.product_variants set stock_quantity = stock_quantity + it.qty where id = it.variant_id;
      update public.products set sales_count = greatest(sales_count - it.qty, 0) where id = it.product_id;
    end loop;
    perform public.clear_stock_context();
  end if;

  update public.orders set
    status = 'cancelled',
    cancelled_at = now(),
    cancel_reason = p_reason,
    expires_at = null,
    payment_status = case when payment_status in ('pending', 'unpaid') then 'voided'::public.order_payment_status else payment_status end
  where id = o.id
  returning * into o;

  update public.coupon_redemptions set voided_at = now() where order_id = o.id and voided_at is null;
  perform public.add_order_event(o.id, 'cancelled', coalesce(p_message, 'Order cancelled.'),
    jsonb_build_object('reason', p_reason, 'restocked', p_restock), false, p_actor_type, p_actor_id);
  if v_was_confirmed then
    perform public.queue_email(o.email, 'order_cancelled', o.id, jsonb_build_object('reason', p_message));
  end if;
  return o;
end $$;

-- Gives back the stock held by unpaid orders whose time ran out. Run every few minutes
-- (pg_cron or the /api/cron route) and opportunistically before each checkout.
create function public.release_expired_orders(p_limit int default 100) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select id from public.orders
    where status = 'pending_payment' and expires_at < now()
    order by expires_at
    limit p_limit
    for update skip locked
  loop
    perform public.cancel_order_internal(v_id, 'payment_timeout', 'Payment was not completed in time, so the items were released.', 'system', null, false);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

create function public.housekeeping() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_released int;
  v_carts int;
begin
  v_released := public.release_expired_orders(500);
  delete from public.rate_limits where window_start < now() - interval '1 day';
  delete from public.carts c where c.user_id is null and c.updated_at < now() - interval '60 days'
    and not exists (select 1 from public.orders o where o.cart_id = c.id and o.status = 'pending_payment');
  get diagnostics v_carts = row_count;
  return jsonb_build_object('released_orders', v_released, 'deleted_guest_carts', v_carts);
end $$;

-- Places an order from the customer's cart. Returns the order brief. The same
-- idempotency key always returns the same order, so double clicks and retries never
-- create duplicates.
create function public.place_order(
  p_user_id uuid,
  p_cart_token text,
  p_idempotency_key uuid,
  p_email text,
  p_phone text,
  p_shipping_address jsonb,
  p_billing_address jsonb,
  p_rate_id uuid,
  p_payment_method text,
  p_customer_note text default '',
  p_save_address boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.store_settings;
  v_cart public.carts;
  v_cart_id uuid;
  v_existing public.orders;
  v_old uuid;
  v_addr jsonb;
  v_bill jsonb;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_phone text := btrim(coalesce(p_phone, ''));
  v_quote jsonb;
  v_rate jsonb;
  v_coupon public.coupons;
  v_order public.orders;
  v_line jsonb;
  v_method text := p_payment_method;
  v_immediate boolean;
  v_status public.order_status;
  v_pay_status public.order_payment_status;
begin
  if p_idempotency_key is null then
    raise exception 'missing_idempotency_key' using errcode = '22023';
  end if;
  if not public.is_email(v_email) then
    raise exception 'invalid_email' using errcode = '22023', hint = 'Enter a valid email address.';
  end if;
  if v_method not in ('razorpay', 'stripe', 'cod') then
    raise exception 'invalid_payment_method' using errcode = '22023', hint = 'Choose a payment method.';
  end if;
  v_addr := public.normalize_address(p_shipping_address);
  v_bill := case when p_billing_address is null then null else public.normalize_address(p_billing_address) end;
  if v_phone = '' then
    v_phone := v_addr ->> 'phone';
  end if;
  if not public.is_phone(v_phone) then
    raise exception 'invalid_phone' using errcode = '22023', hint = 'Enter a valid phone number.';
  end if;

  v_cart_id := public.cart_find(p_user_id, p_cart_token, false);
  if v_cart_id is null then
    raise exception 'cart_empty' using errcode = 'P0001', hint = 'Your bag is empty.';
  end if;
  -- One checkout at a time per cart.
  select * into v_cart from public.carts where id = v_cart_id for update;

  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if v_existing.id is not null then
    if v_existing.cart_id is distinct from v_cart.id then
      raise exception 'idempotency_conflict' using errcode = 'P0001', hint = 'Refresh the page and try again.';
    end if;
    return public.order_brief(v_existing) || jsonb_build_object('reused', true);
  end if;

  select * into s from public.store_settings where id = 1;
  if s.maintenance_mode then
    raise exception 'store_closed' using errcode = 'P0001', hint = 'The store is closed for maintenance. Please try again soon.';
  end if;
  perform public.release_expired_orders(25);

  -- An earlier unpaid order from this cart stops holding stock once a new one is placed.
  for v_old in
    select id from public.orders where cart_id = v_cart.id and status = 'pending_payment' order by created_at
  loop
    perform public.cancel_order_internal(v_old, 'superseded', 'Replaced by a newer checkout.', 'system', null, false);
  end loop;

  v_quote := public.quote_cart(v_cart.id, p_user_id, v_email, v_addr, p_rate_id, v_method, null);
  if (v_quote ->> 'item_count')::int = 0 and jsonb_array_length(v_quote -> 'issues') = 0 then
    raise exception 'cart_empty' using errcode = 'P0001', hint = 'Your bag is empty.';
  end if;
  if jsonb_array_length(v_quote -> 'issues') > 0 then
    raise exception 'cart_has_issues' using errcode = 'P0001',
      hint = (v_quote -> 'issues' -> 0 ->> 'message'), detail = (v_quote -> 'issues')::text;
  end if;
  if v_quote -> 'coupon' is not null and v_quote -> 'coupon' <> 'null'::jsonb and not (v_quote -> 'coupon' ->> 'valid')::boolean then
    raise exception 'invalid_coupon' using errcode = 'P0001', hint = v_quote -> 'coupon' ->> 'message';
  end if;
  select x into v_rate from jsonb_array_elements(v_quote -> 'shipping' -> 'rates') x
  where x ->> 'id' = v_quote -> 'shipping' ->> 'selected_rate_id';
  if v_rate is null then
    raise exception 'not_serviceable' using errcode = 'P0001', hint = 'Sorry, we do not deliver to this PIN code yet.';
  end if;
  if p_rate_id is not null and (v_rate ->> 'id')::uuid <> p_rate_id then
    raise exception 'rate_unavailable' using errcode = 'P0001', hint = 'That delivery option is not available for this address.';
  end if;
  if v_method = 'cod' and not (v_quote -> 'payment_methods' ->> 'cod')::boolean then
    raise exception 'cod_unavailable' using errcode = 'P0001', hint = v_quote -> 'payment_methods' ->> 'cod_reason';
  elsif v_method = 'razorpay' and not s.razorpay_enabled then
    raise exception 'method_unavailable' using errcode = 'P0001', hint = 'Online payment is not available right now.';
  elsif v_method = 'stripe' and not s.stripe_enabled then
    raise exception 'method_unavailable' using errcode = 'P0001', hint = 'Card payment is not available right now.';
  end if;

  -- Coupon limits again, now holding the coupon row so concurrent orders queue up.
  if v_quote -> 'coupon' is not null and v_quote -> 'coupon' <> 'null'::jsonb then
    select * into v_coupon from public.coupons where code = v_quote -> 'coupon' ->> 'code' for update;
    if v_coupon.usage_limit is not null and (
      select count(*) from public.coupon_redemptions where coupon_id = v_coupon.id and voided_at is null
    ) >= v_coupon.usage_limit then
      raise exception 'invalid_coupon' using errcode = 'P0001', hint = 'This code has been fully redeemed.';
    end if;
    if v_coupon.usage_limit_per_customer is not null and (
      select count(*) from public.coupon_redemptions
      where coupon_id = v_coupon.id and voided_at is null
        and ((p_user_id is not null and user_id = p_user_id) or lower(email) = v_email)
    ) >= v_coupon.usage_limit_per_customer then
      raise exception 'invalid_coupon' using errcode = 'P0001', hint = 'You have already used this code.';
    end if;
  end if;

  v_immediate := v_method = 'cod' or (v_quote ->> 'grand_total')::bigint = 0;
  if (v_quote ->> 'grand_total')::bigint = 0 then
    v_method := 'none';
  end if;
  v_status := case when v_immediate then 'confirmed' else 'pending_payment' end;
  v_pay_status := case when v_method = 'none' then 'paid' when v_method = 'cod' then 'unpaid' else 'pending' end;

  insert into public.orders (
    user_id, cart_id, email, phone, customer_name, status, payment_status, payment_method, currency,
    subtotal, discount_total, shipping_total, cod_fee, tax_total, grand_total, tax_mode, tax_label,
    coupon_code, shipping_address, billing_address, shipping_rate_id, shipping_method, customer_note,
    idempotency_key, expires_at, paid_at
  ) values (
    p_user_id, v_cart.id, v_email, v_phone, v_addr ->> 'full_name', v_status, v_pay_status, v_method,
    v_quote ->> 'currency',
    (v_quote ->> 'subtotal')::bigint, (v_quote ->> 'discount_total')::bigint, (v_quote ->> 'shipping_total')::bigint,
    (v_quote ->> 'cod_fee')::bigint, (v_quote ->> 'tax_total')::bigint, (v_quote ->> 'grand_total')::bigint,
    v_quote ->> 'tax_mode', v_quote ->> 'tax_label',
    case when v_coupon.id is not null then v_coupon.code end,
    v_addr, v_bill, (v_rate ->> 'id')::uuid,
    jsonb_build_object('name', v_rate ->> 'name', 'min_days', (v_rate ->> 'min_days')::int, 'max_days', (v_rate ->> 'max_days')::int,
                       'price', (v_rate ->> 'price')::bigint),
    left(btrim(coalesce(p_customer_note, '')), 500),
    p_idempotency_key,
    case when v_immediate then null else now() + make_interval(mins => s.reservation_minutes) end,
    case when v_method = 'none' then now() end
  ) returning * into v_order;

  if v_immediate then
    perform public.set_stock_context('sale', 'Order ' || v_order.order_number, v_order.id);
  end if;
  -- Lock variant rows in a fixed order so concurrent checkouts cannot deadlock.
  for v_line in
    select x from jsonb_array_elements(v_quote -> 'lines') x order by x ->> 'variant_id'
  loop
    if v_immediate then
      update public.product_variants
        set stock_quantity = stock_quantity - (v_line ->> 'quantity')::int
      where id = (v_line ->> 'variant_id')::uuid
        and stock_quantity - reserved_quantity >= (v_line ->> 'quantity')::int;
    else
      update public.product_variants
        set reserved_quantity = reserved_quantity + (v_line ->> 'quantity')::int
      where id = (v_line ->> 'variant_id')::uuid
        and stock_quantity - reserved_quantity >= (v_line ->> 'quantity')::int;
    end if;
    if not found then
      raise exception 'out_of_stock' using errcode = 'P0001',
        hint = format('%s just sold out in that size. Your bag has been updated.', v_line ->> 'title'),
        detail = v_line ->> 'sku';
    end if;
    insert into public.order_items (
      order_id, product_id, variant_id, product_title, product_slug, brand_name, variant_title, size, color, sku,
      image_url, unit_price, compare_at_price, quantity, discount_amount, tax_rate_bps, tax_amount, line_total,
      is_returnable, return_window_days
    ) values (
      v_order.id, (v_line ->> 'product_id')::uuid, (v_line ->> 'variant_id')::uuid, v_line ->> 'title', v_line ->> 'slug',
      v_line ->> 'brand',
      concat_ws(' / ', nullif(v_line ->> 'size', ''), nullif(v_line ->> 'color', '')),
      v_line ->> 'size', v_line ->> 'color', v_line ->> 'sku', v_line ->> 'image_url',
      (v_line ->> 'unit_price')::bigint, (v_line ->> 'compare_at_price')::bigint, (v_line ->> 'quantity')::int,
      (v_line ->> 'discount')::bigint, (v_line ->> 'tax_rate_bps')::int, (v_line ->> 'tax')::bigint,
      (v_line ->> 'line_total')::bigint,
      (v_line ->> 'is_returnable')::boolean, (v_line ->> 'return_window_days')::int
    );
    if v_immediate then
      update public.products set sales_count = sales_count + (v_line ->> 'quantity')::int
      where id = (v_line ->> 'product_id')::uuid;
    end if;
  end loop;
  if v_immediate then
    perform public.clear_stock_context();
  end if;

  if v_coupon.id is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, user_id, email, amount)
    values (v_coupon.id, v_order.id, p_user_id, v_email, v_order.discount_total);
  end if;

  perform public.add_order_event(v_order.id, 'placed',
    case
      when v_method = 'cod' then 'Order placed with cash on delivery.'
      when v_method = 'none' then 'Order placed. Nothing to pay.'
      else 'Order placed. Waiting for payment.'
    end,
    jsonb_build_object('payment_method', v_method), false, 'customer', p_user_id);

  if v_immediate then
    delete from public.cart_items where cart_id = v_cart.id;
    update public.carts set coupon_code = null, updated_at = now() where id = v_cart.id;
    perform public.queue_email(v_order.email, 'order_confirmation', v_order.id);
  end if;

  if p_save_address and p_user_id is not null and not exists (
    select 1 from public.customer_addresses a
    where a.user_id = p_user_id and lower(a.line1) = lower(v_addr ->> 'line1') and a.postal_code = v_addr ->> 'postal_code'
  ) and (select count(*) from public.customer_addresses where user_id = p_user_id) < 20 then
    insert into public.customer_addresses (user_id, full_name, phone, line1, line2, landmark, city, state, postal_code, country)
    values (p_user_id, v_addr ->> 'full_name', v_addr ->> 'phone', v_addr ->> 'line1', v_addr ->> 'line2',
            v_addr ->> 'landmark', v_addr ->> 'city', v_addr ->> 'state', v_addr ->> 'postal_code', v_addr ->> 'country');
  end if;

  return public.order_brief(v_order) || jsonb_build_object('reused', false);
end $$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

-- Records a provider-side order/session (e.g. a Razorpay order) created for an order.
-- Returns the existing one when the order already has an open session with this provider.
create function public.record_payment_session(
  p_order_id uuid, p_provider public.payment_provider, p_provider_order_id text, p_amount bigint, p_currency text
) returns public.payments
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_pay public.payments;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.status <> 'pending_payment' then
    raise exception 'order_not_payable' using errcode = 'P0001', hint = 'This order no longer needs payment.';
  end if;
  if p_amount <> o.grand_total or upper(p_currency) <> o.currency then
    raise exception 'amount_mismatch' using errcode = 'P0001';
  end if;
  select * into v_pay from public.payments
  where order_id = o.id and provider = p_provider and provider_order_id = p_provider_order_id
  order by created_at limit 1;
  if v_pay.id is null then
    insert into public.payments (order_id, provider, provider_order_id, amount, currency, status)
    values (o.id, p_provider, p_provider_order_id, p_amount, upper(p_currency), 'created')
    returning * into v_pay;
  end if;
  return v_pay;
end $$;

-- The open provider session for an order, if any (so retries reuse it).
create function public.open_payment_session(p_order_id uuid, p_provider public.payment_provider) returns public.payments
language sql stable security definer set search_path = '' as $$
  select p.* from public.payments p join public.orders o on o.id = p.order_id
  where p.order_id = p_order_id and p.provider = p_provider and p.provider_order_id is not null
    and p.amount = o.grand_total and p.status in ('created', 'failed')
  order by p.created_at desc
  limit 1
$$;

-- Called only after the server has verified, with the payment provider, that money
-- was captured for this order. Idempotent: the same provider payment is applied once.
-- Result: confirmed | already_processed | duplicate_payment | reinstated | refund_required | amount_mismatch
create function public.confirm_order_payment(
  p_order_id uuid,
  p_provider public.payment_provider,
  p_provider_order_id text,
  p_provider_payment_id text,
  p_amount bigint,
  p_currency text,
  p_method text,
  p_details jsonb default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_pay public.payments;
  it record;
  v_result text;
begin
  if p_provider_payment_id is null or btrim(p_provider_payment_id) = '' then
    raise exception 'missing_payment_id' using errcode = '22023';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;

  select * into v_pay from public.payments where provider = p_provider and provider_payment_id = p_provider_payment_id;
  if v_pay.id is not null and v_pay.status in ('captured', 'refunded', 'partially_refunded') then
    return jsonb_build_object('result', 'already_processed', 'payment_id', v_pay.id) || public.order_brief(o);
  end if;
  if v_pay.id is null then
    update public.payments set provider_payment_id = p_provider_payment_id
    where id = (
      select id from public.payments
      where order_id = o.id and provider = p_provider and provider_order_id is not distinct from p_provider_order_id
        and provider_payment_id is null
      order by created_at limit 1
    )
    returning * into v_pay;
  end if;
  if v_pay.id is null then
    insert into public.payments (order_id, provider, provider_order_id, provider_payment_id, amount, currency, status)
    values (o.id, p_provider, p_provider_order_id, p_provider_payment_id, p_amount, upper(p_currency), 'created')
    returning * into v_pay;
  end if;
  update public.payments set
    status = 'captured', amount = p_amount, currency = upper(p_currency), method = p_method,
    details = coalesce(p_details, '{}'), captured_at = now(), error_code = null, error_description = null
  where id = v_pay.id
  returning * into v_pay;

  if p_amount <> o.grand_total or upper(p_currency) <> o.currency then
    update public.orders set needs_attention = true,
      attention_reason = format('Received %s but the order total is %s. Refund the payment.',
        public.format_money(p_amount, upper(p_currency)), public.format_money(o.grand_total, o.currency))
    where id = o.id returning * into o;
    perform public.add_order_event(o.id, 'payment_mismatch', 'A payment was received for the wrong amount and will be refunded.',
      jsonb_build_object('payment_id', v_pay.id, 'amount', p_amount), false, 'provider');
    return jsonb_build_object('result', 'amount_mismatch', 'payment_id', v_pay.id) || public.order_brief(o);
  end if;

  if o.payment_status in ('paid', 'partially_refunded', 'refunded') then
    update public.orders set needs_attention = true,
      attention_reason = 'A second payment was received for this order. Refund the duplicate.'
    where id = o.id returning * into o;
    perform public.add_order_event(o.id, 'duplicate_payment', 'A duplicate payment was received and will be refunded.',
      jsonb_build_object('payment_id', v_pay.id, 'provider_payment_id', p_provider_payment_id), false, 'provider');
    return jsonb_build_object('result', 'duplicate_payment', 'payment_id', v_pay.id) || public.order_brief(o);
  end if;

  if o.status = 'pending_payment' then
    perform public.set_stock_context('sale', 'Order ' || o.order_number, o.id);
    for it in
      select variant_id, product_id, sum(quantity)::int as qty from public.order_items
      where order_id = o.id and variant_id is not null group by variant_id, product_id order by variant_id
    loop
      update public.product_variants
        set stock_quantity = stock_quantity - it.qty, reserved_quantity = reserved_quantity - it.qty
      where id = it.variant_id;
      update public.products set sales_count = sales_count + it.qty where id = it.product_id;
    end loop;
    perform public.clear_stock_context();
    v_result := 'confirmed';
  elsif o.status = 'cancelled' then
    -- Paid after the reservation lapsed: take the stock again if it is still there.
    begin
      perform public.set_stock_context('sale', 'Order ' || o.order_number || ' (paid after expiry)', o.id);
      for it in
        select variant_id, product_id, sum(quantity)::int as qty from public.order_items
        where order_id = o.id group by variant_id, product_id order by variant_id
      loop
        if it.variant_id is null then
          raise exception 'variant_gone';
        end if;
        update public.product_variants set stock_quantity = stock_quantity - it.qty
        where id = it.variant_id and stock_quantity - reserved_quantity >= it.qty;
        if not found then
          raise exception 'stock_gone';
        end if;
        update public.products set sales_count = sales_count + it.qty where id = it.product_id;
      end loop;
      perform public.clear_stock_context();
      update public.coupon_redemptions set voided_at = null where order_id = o.id;
      v_result := 'reinstated';
    exception when others then
      perform public.clear_stock_context();
      update public.orders set payment_status = 'paid', paid_at = now(), needs_attention = true,
        attention_reason = 'Paid after the order expired, and the items are no longer available. Refund the payment.'
      where id = o.id returning * into o;
      perform public.add_order_event(o.id, 'paid_after_expiry',
        'Payment arrived after the order expired and the items had sold out. A full refund will be issued.',
        jsonb_build_object('payment_id', v_pay.id), false, 'provider');
      return jsonb_build_object('result', 'refund_required', 'payment_id', v_pay.id) || public.order_brief(o);
    end;
  else
    -- Confirmed but unpaid (cash on delivery switched to online): just record it.
    v_result := 'confirmed';
  end if;

  update public.orders set
    status = case when status = 'completed' then status else 'confirmed'::public.order_status end,
    payment_status = 'paid', paid_at = now(), expires_at = null, cancelled_at = null, cancel_reason = null
  where id = o.id
  returning * into o;

  if o.cart_id is not null then
    delete from public.cart_items ci
    using public.order_items oi
    where ci.cart_id = o.cart_id and oi.order_id = o.id and ci.variant_id = oi.variant_id;
    update public.carts set coupon_code = null, updated_at = now()
    where id = o.cart_id and coupon_code is not distinct from o.coupon_code;
  end if;

  perform public.add_order_event(o.id, 'payment_captured',
    format('Payment of %s received%s.', public.format_money(p_amount, upper(p_currency)),
           case when p_method is not null and p_method <> '' then ' by ' || p_method else '' end),
    jsonb_build_object('payment_id', v_pay.id, 'provider', p_provider, 'provider_payment_id', p_provider_payment_id,
                       'reinstated', v_result = 'reinstated'),
    false, 'provider');
  perform public.queue_email(o.email, 'order_confirmation', o.id);
  return jsonb_build_object('result', v_result, 'payment_id', v_pay.id) || public.order_brief(o);
end $$;

-- A failed payment attempt. The order stays open (the customer can retry) until its
-- reservation expires.
create function public.record_payment_failure(
  p_order_id uuid, p_provider public.payment_provider, p_provider_order_id text, p_provider_payment_id text,
  p_method text, p_error_code text, p_error_description text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_pay public.payments;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if p_provider_payment_id is not null then
    select * into v_pay from public.payments where provider = p_provider and provider_payment_id = p_provider_payment_id;
    if v_pay.id is not null and v_pay.status <> 'created' and v_pay.status <> 'failed' then
      return jsonb_build_object('result', 'ignored') || public.order_brief(o);
    end if;
  end if;
  if v_pay.id is null then
    insert into public.payments (order_id, provider, provider_order_id, provider_payment_id, amount, currency, status,
                                 method, error_code, error_description)
    values (o.id, p_provider, p_provider_order_id, p_provider_payment_id, o.grand_total, o.currency, 'failed',
            p_method, left(p_error_code, 80), left(p_error_description, 500))
    on conflict (provider, provider_payment_id) do nothing
    returning * into v_pay;
  else
    update public.payments set status = 'failed', method = coalesce(p_method, method),
      error_code = left(p_error_code, 80), error_description = left(p_error_description, 500)
    where id = v_pay.id;
  end if;
  if o.status = 'pending_payment' and o.payment_status = 'pending' then
    update public.orders set payment_status = 'failed' where id = o.id returning * into o;
  end if;
  if v_pay.id is not null then
    perform public.add_order_event(o.id, 'payment_failed',
      'Payment attempt failed' || coalesce(': ' || nullif(p_error_description, ''), '.'),
      jsonb_build_object('code', p_error_code, 'provider_payment_id', p_provider_payment_id), false, 'provider');
  end if;
  return jsonb_build_object('result', 'recorded') || public.order_brief(o);
end $$;

-- Lets a customer retry payment: extends an open order's hold, or revives an order that
-- expired unpaid if its items are still in stock.
create function public.prepare_order_payment(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  s public.store_settings;
  it record;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  select * into s from public.store_settings where id = 1;
  if o.payment_method not in ('razorpay', 'stripe') then
    raise exception 'order_not_payable' using errcode = 'P0001', hint = 'This order does not take online payment.';
  end if;
  if o.status = 'pending_payment' then
    update public.orders set expires_at = greatest(expires_at, now() + make_interval(mins => s.reservation_minutes))
    where id = o.id returning * into o;
  elsif o.status = 'cancelled' and o.cancel_reason in ('payment_timeout', 'superseded')
        and o.payment_status in ('voided', 'failed', 'pending') then
    begin
      for it in
        select variant_id, sum(quantity)::int as qty from public.order_items
        where order_id = o.id group by variant_id order by variant_id
      loop
        if it.variant_id is null then
          raise exception 'variant_gone';
        end if;
        update public.product_variants set reserved_quantity = reserved_quantity + it.qty
        where id = it.variant_id and stock_quantity - reserved_quantity >= it.qty and is_active;
        if not found then
          raise exception 'stock_gone';
        end if;
      end loop;
    exception when others then
      raise exception 'order_expired' using errcode = 'P0001',
        hint = 'This order expired and some items are no longer available. Please place a new order.';
    end;
    update public.orders set status = 'pending_payment', payment_status = 'pending', cancelled_at = null, cancel_reason = null,
      expires_at = now() + make_interval(mins => s.reservation_minutes)
    where id = o.id returning * into o;
    update public.coupon_redemptions set voided_at = null where order_id = o.id;
    perform public.add_order_event(o.id, 'reopened', 'Order reopened for payment.', '{}', false, 'customer', o.user_id);
  else
    raise exception 'order_not_payable' using errcode = 'P0001', hint = 'This order no longer needs payment.';
  end if;
  return public.order_brief(o);
end $$;

-- ---------------------------------------------------------------------------
-- Customer self-service (the server checks the session or signed link first)
-- ---------------------------------------------------------------------------
create function public.customer_cancel_order(p_order_id uuid, p_user_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_reason text := left(btrim(coalesce(nullif(p_reason, ''), 'Changed my mind')), 100);
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or (p_user_id is not null and o.user_id is distinct from p_user_id) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.status = 'cancelled' then
    return jsonb_build_object('result', 'already_cancelled') || public.order_brief(o);
  end if;
  if o.fulfillment_status not in ('unfulfilled', 'processing') then
    raise exception 'too_late_to_cancel' using errcode = 'P0001',
      hint = 'This order is already packed or on its way. You can return it after delivery.';
  end if;
  if o.status = 'pending_payment' or o.payment_status in ('unpaid', 'pending', 'failed', 'voided')
     or (o.payment_status = 'paid' and o.grand_total = 0) then
    perform public.cancel_order_internal(o.id, 'customer_request', 'Cancelled by the customer: ' || v_reason, 'customer', p_user_id, true);
    return jsonb_build_object('result', 'cancelled') || public.order_brief((select x from public.orders x where x.id = o.id));
  end if;
  -- Paid orders: staff confirm the cancellation and refund the payment.
  insert into public.return_requests (order_id, user_id, kind, reason)
  values (o.id, o.user_id, 'cancellation', v_reason)
  on conflict do nothing;
  perform public.add_order_event(o.id, 'cancellation_requested', 'Customer asked to cancel: ' || v_reason, '{}', false, 'customer', p_user_id);
  return jsonb_build_object('result', 'requested') || public.order_brief(o);
end $$;

-- p_items: [{"order_item_id": uuid, "quantity": int}]
create function public.customer_request_return(
  p_order_id uuid, p_user_id uuid, p_items jsonb, p_reason text, p_details text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  v_item jsonb;
  oi public.order_items;
  v_qty int;
  v_open int;
  v_request uuid;
  v_count int := 0;
begin
  select * into o from public.orders where id = p_order_id for update;
  if o.id is null or (p_user_id is not null and o.user_id is distinct from p_user_id) then
    raise exception 'order_not_found' using errcode = 'P0002';
  end if;
  if o.fulfillment_status <> 'delivered' or o.delivered_at is null then
    raise exception 'not_delivered' using errcode = 'P0001', hint = 'You can request a return once the order is delivered.';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception 'reason_required' using errcode = '22023', hint = 'Tell us why you are returning the items.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no_items' using errcode = '22023', hint = 'Choose at least one item to return.';
  end if;
  insert into public.return_requests (order_id, user_id, kind, reason, details)
  values (o.id, o.user_id, 'return', left(btrim(p_reason), 100), left(btrim(coalesce(p_details, '')), 2000))
  returning id into v_request;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item ->> 'quantity')::int, 0);
    if v_qty <= 0 then
      continue;
    end if;
    select * into oi from public.order_items where id = (v_item ->> 'order_item_id')::uuid and order_id = o.id;
    if oi.id is null then
      raise exception 'invalid_item' using errcode = '22023';
    end if;
    if not oi.is_returnable then
      raise exception 'not_returnable' using errcode = 'P0001', hint = format('%s cannot be returned.', oi.product_title);
    end if;
    if o.delivered_at + make_interval(days => oi.return_window_days) < now() then
      raise exception 'return_window_closed' using errcode = 'P0001',
        hint = format('The return window for %s closed on %s.', oi.product_title,
                      to_char(o.delivered_at + make_interval(days => oi.return_window_days), 'DD Mon YYYY'));
    end if;
    select coalesce(sum(ri.quantity), 0) into v_open
    from public.return_request_items ri join public.return_requests rr on rr.id = ri.return_request_id
    where ri.order_item_id = oi.id and rr.kind = 'return' and rr.status in ('requested', 'approved', 'received') and rr.id <> v_request;
    if v_qty > oi.quantity - oi.quantity_returned - v_open then
      raise exception 'too_many' using errcode = 'P0001',
        hint = format('You can return up to %s of %s.', greatest(oi.quantity - oi.quantity_returned - v_open, 0), oi.product_title);
    end if;
    insert into public.return_request_items (return_request_id, order_item_id, quantity) values (v_request, oi.id, v_qty);
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then
    raise exception 'no_items' using errcode = '22023', hint = 'Choose at least one item to return.';
  end if;
  perform public.add_order_event(o.id, 'return_requested', 'Return requested: ' || left(btrim(p_reason), 100),
    jsonb_build_object('return_request_id', v_request), false, 'customer', p_user_id);
  return v_request;
end $$;

-- Everything the customer's order page shows. Internal notes and payment internals are
-- left out. The server has already checked the caller may see this order.
create function public.order_detail(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order', to_jsonb(o) - 'idempotency_key' - 'cart_id' - 'needs_attention' - 'attention_reason',
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at, i.id) from public.order_items i where i.order_id = o.id), '[]'),
    'shipments', coalesce((select jsonb_agg(to_jsonb(sh) order by sh.created_at) from public.shipments sh where sh.order_id = o.id), '[]'),
    'refunds', coalesce((
      select jsonb_agg(jsonb_build_object('id', rf.id, 'amount', rf.amount, 'status', rf.status, 'created_at', rf.created_at,
                                          'processed_at', rf.processed_at) order by rf.created_at)
      from public.refunds rf where rf.order_id = o.id), '[]'),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('kind', e.kind, 'message', e.message, 'created_at', e.created_at) order by e.created_at, e.id)
      from public.order_events e where e.order_id = o.id and not e.is_internal), '[]'),
    'returns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'status', r.status, 'reason', r.reason, 'created_at', r.created_at,
        'refund_amount', r.refund_amount,
        'items', coalesce((select jsonb_agg(jsonb_build_object('order_item_id', ri.order_item_id, 'quantity', ri.quantity))
                           from public.return_request_items ri where ri.return_request_id = r.id), '[]')
      ) order by r.created_at)
      from public.return_requests r where r.order_id = o.id), '[]')
  )
  from public.orders o
  where o.id = p_order_id
$$;

-- Lock all of the above down to the server.
revoke execute on function public.normalize_address(jsonb) from public, anon, authenticated;
revoke execute on function public.cart_find(uuid, text, boolean) from public, anon, authenticated;
revoke execute on function public.quote_cart(uuid, uuid, text, jsonb, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.cart_get(uuid, text, jsonb, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.cart_set_item(uuid, text, uuid, int, text) from public, anon, authenticated;
revoke execute on function public.cart_set_coupon(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.cart_merge(uuid, text) from public, anon, authenticated;
revoke execute on function public.order_brief(public.orders) from public, anon, authenticated;
revoke execute on function public.cancel_order_internal(uuid, text, text, text, uuid, boolean) from public, anon, authenticated;
revoke execute on function public.release_expired_orders(int) from public, anon, authenticated;
revoke execute on function public.housekeeping() from public, anon, authenticated;
revoke execute on function public.place_order(uuid, text, uuid, text, text, jsonb, jsonb, uuid, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.record_payment_session(uuid, public.payment_provider, text, bigint, text) from public, anon, authenticated;
revoke execute on function public.open_payment_session(uuid, public.payment_provider) from public, anon, authenticated;
revoke execute on function public.confirm_order_payment(uuid, public.payment_provider, text, text, bigint, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.record_payment_failure(uuid, public.payment_provider, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.prepare_order_payment(uuid) from public, anon, authenticated;
revoke execute on function public.customer_cancel_order(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.customer_request_return(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.order_detail(uuid) from public, anon, authenticated;
revoke execute on function public.tax_rate_for(bigint, int, jsonb) from public, anon, authenticated;
revoke execute on function public.tax_amount(bigint, int, text) from public, anon, authenticated;
