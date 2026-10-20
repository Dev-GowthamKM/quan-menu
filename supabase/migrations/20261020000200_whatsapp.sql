-- WhatsApp order updates through the WhatsApp Business Platform (Cloud API).
--
-- Customers opt in at checkout. Whenever an order email is queued (confirmed, shipped,
-- delivered, cancelled, refunded, return update), a WhatsApp message is queued too if the
-- store has an approved template for that event and the customer opted in. The server
-- sends them with the API token from its environment; customers can switch them off from
-- their order page.

alter table public.store_settings
  add column whatsapp_enabled boolean not null default false,
  -- Approved message templates per event, e.g. {"order_shipped": {"name": "order_shipped", "language": "en"}}.
  add column whatsapp_templates jsonb not null default '{}' check (jsonb_typeof(whatsapp_templates) = 'object');

-- The checkout's choice is held on the cart and copied onto the order when it is placed.
alter table public.carts add column whatsapp_opt_in boolean not null default false;
alter table public.orders add column whatsapp_opt_in boolean not null default false;
grant select (whatsapp_opt_in) on public.orders to authenticated;

create function public.orders_copy_cart_choices() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.cart_id is not null then
    new.whatsapp_opt_in := coalesce((select c.whatsapp_opt_in from public.carts c where c.id = new.cart_id), false);
  end if;
  return new;
end $$;
create trigger orders_copy_cart_choices before insert on public.orders
  for each row execute function public.orders_copy_cart_choices();

-- Checkout preferences for the visitor's cart (server only). p_contact holds the choices
-- made so far: {"whatsapp_opt_in": true}.
create function public.cart_set_contact(p_user_id uuid, p_token text, p_contact jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cart uuid := public.cart_find(p_user_id, p_token, false);
begin
  if v_cart is null or jsonb_typeof(p_contact) <> 'object' then
    return;
  end if;
  update public.carts set
    whatsapp_opt_in = case when p_contact ? 'whatsapp_opt_in'
                           then coalesce((p_contact ->> 'whatsapp_opt_in')::boolean, false) else whatsapp_opt_in end
  where id = v_cart;
end $$;

create table public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders (id) on delete cascade,
  to_phone text not null,
  -- The store event (order_shipped, ...); the template name is looked up when sending.
  template text not null,
  data jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index whatsapp_outbox_queue_idx on public.whatsapp_outbox (status, created_at) where status in ('queued', 'failed', 'sending');
create index whatsapp_outbox_order_idx on public.whatsapp_outbox (order_id);
alter table public.whatsapp_outbox enable row level security;
revoke all on public.whatsapp_outbox from anon, authenticated;
create policy whatsapp_outbox_staff_read on public.whatsapp_outbox for select to authenticated using ((select public.is_staff()));
grant select on public.whatsapp_outbox to authenticated;

-- Queues the WhatsApp version of an order message, when the store sends that event on
-- WhatsApp and the customer opted in.
create function public.queue_whatsapp(p_order_id uuid, p_template text, p_data jsonb default '{}') returns void
language plpgsql security definer set search_path = '' as $$
declare
  s public.store_settings;
  o public.orders;
begin
  if p_order_id is null then
    return;
  end if;
  select * into s from public.store_settings where id = 1;
  if not s.whatsapp_enabled or coalesce(s.whatsapp_templates -> p_template ->> 'name', '') = '' then
    return;
  end if;
  select * into o from public.orders where id = p_order_id;
  if o.id is null or not o.whatsapp_opt_in or coalesce(o.phone, '') = '' then
    return;
  end if;
  insert into public.whatsapp_outbox (order_id, to_phone, template, data)
  values (o.id, o.phone, p_template, coalesce(p_data, '{}'));
end $$;

-- Every order email now also queues its WhatsApp message (when there is one to send).
create or replace function public.queue_email(p_to text, p_template text, p_order_id uuid, p_data jsonb default '{}')
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_to is not null and public.is_email(p_to) then
    insert into public.email_outbox (to_email, template, order_id, data)
    values (lower(p_to), p_template, p_order_id, coalesce(p_data, '{}'));
  end if;
  perform public.queue_whatsapp(p_order_id, p_template, p_data);
end $$;

-- The server claims queued messages in batches, like the email outbox.
create function public.claim_whatsapp_outbox(p_limit int default 20) returns setof public.whatsapp_outbox
language sql security definer set search_path = '' as $$
  update public.whatsapp_outbox w set status = 'sending', attempts = w.attempts + 1
  where w.id in (
    select id from public.whatsapp_outbox
    where status = 'queued'
       or (status = 'failed' and attempts < 5 and created_at > now() - interval '2 days')
       or (status = 'sending' and attempts < 5 and created_at < now() - interval '10 minutes')
    order by created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  )
  returning w.*
$$;

-- A customer switching WhatsApp updates off (or back on) for an order. The server checks
-- the order link first. Messages already queued are dropped.
create function public.set_order_whatsapp(p_order_id uuid, p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set whatsapp_opt_in = coalesce(p_on, false) where id = p_order_id;
  if not coalesce(p_on, false) then
    update public.whatsapp_outbox set status = 'skipped', last_error = 'The customer turned WhatsApp updates off.'
    where order_id = p_order_id and status in ('queued', 'failed');
  end if;
end $$;

revoke execute on function public.cart_set_contact(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.queue_whatsapp(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.queue_email(text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.claim_whatsapp_outbox(int) from public, anon, authenticated;
revoke execute on function public.set_order_whatsapp(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.orders_copy_cart_choices() from public, anon, authenticated;
grant execute on function public.cart_set_contact(uuid, text, jsonb) to service_role;
grant execute on function public.claim_whatsapp_outbox(int) to service_role;
grant execute on function public.set_order_whatsapp(uuid, boolean) to service_role;
