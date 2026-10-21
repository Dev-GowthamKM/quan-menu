-- Sign-in with a mobile number and a one-time code. Supabase Auth creates the account and
-- checks the code; the store's Send SMS hook (/api/auth/sms) delivers it, by SMS through
-- MSG91 or on WhatsApp. This adds the settings for that, starts accounts created with a
-- mobile number with it as their contact number, and only gives an account a profile once
-- its email or number is verified, so mistyped numbers and abandoned codes never show up
-- as customers.

alter table public.store_settings
  add column phone_login_enabled boolean not null default false,
  add column phone_login_channel text not null default 'sms' check (phone_login_channel in ('sms', 'whatsapp')),
  -- An approved WhatsApp template in the Authentication category, with a copy-code button.
  add column whatsapp_login_template text not null default '' check (whatsapp_login_template ~ '^[a-z0-9_]*$' and char_length(whatsapp_login_template) <= 512),
  add column whatsapp_login_language text not null default 'en' check (whatsapp_login_language ~ '^[a-z]{2,3}(_[A-Z]{2})?$');

-- ---------------------------------------------------------------------------
-- Profiles for verified accounts only
-- ---------------------------------------------------------------------------
-- A number as Supabase Auth stores it ("919845012345") the way people write it.
create function public.display_phone(p_phone text) returns text
language sql immutable set search_path = '' as $$
  select case
    when coalesce(p_phone, '') ~ '^91[6-9][0-9]{9}$' then '+91 ' || substr(p_phone, 3, 5) || ' ' || substr(p_phone, 8)
    when coalesce(p_phone, '') ~ '^[1-9][0-9]{6,14}$' then '+' || p_phone
    else ''
  end
$$;

-- Runs when an account is created already verified (Google, invitations, the admin API)
-- and again when an email or mobile number is first confirmed. Supabase stores numbers
-- without the plus sign. Sign-up details come from user metadata, which the person
-- signing up chooses, so only the name and their own newsletter choice are read from it.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is null and new.phone_confirmed_at is null then
    return new;
  end if;
  insert into public.profiles (id, email, full_name, phone, marketing_opt_in)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 120),
    public.display_phone(new.phone),
    coalesce(new.raw_user_meta_data ->> 'marketing_opt_in', '') = 'true'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_confirmed after update of email_confirmed_at, phone_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and old.phone_confirmed_at is null
                     and (new.email_confirmed_at is not null or new.phone_confirmed_at is not null))
  execute function public.handle_new_user();

-- A verified mobile number added later becomes the contact number if there isn't one yet.
create function public.handle_user_phone_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phone_confirmed_at is not null and public.display_phone(new.phone) <> '' then
    update public.profiles set phone = public.display_phone(new.phone) where id = new.id and phone = '';
  end if;
  return new;
end $$;
create trigger on_auth_user_phone_changed after update of phone, phone_confirmed_at on auth.users
  for each row when (old.phone is distinct from new.phone or old.phone_confirmed_at is distinct from new.phone_confirmed_at)
  execute function public.handle_user_phone_change();

-- Profiles made at sign-up by the old trigger for accounts that were never verified.
delete from public.profiles p
using auth.users u
where u.id = p.id and u.email_confirmed_at is null and u.phone_confirmed_at is null
  and not exists (select 1 from public.orders o where o.user_id = p.id)
  and not exists (select 1 from public.user_roles r where r.user_id = p.id);

-- ---------------------------------------------------------------------------
-- Customer search also finds a number typed with spaces, a leading 0 or without +91
-- ---------------------------------------------------------------------------
create or replace function public.admin_customers(p_q text default null, p_limit int default 50, p_offset int default 0)
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
         or p.phone like '%' || btrim(p_q) || '%'
         or (length(regexp_replace(p_q, '[^0-9]', '', 'g')) >= 4
             and regexp_replace(p.phone, '[^0-9]', '', 'g') like '%' || regexp_replace(regexp_replace(p_q, '[^0-9]', '', 'g'), '^0', '') || '%'))
  group by p.id
  order by max(o.placed_at) desc nulls last, p.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 500)
  offset greatest(coalesce(p_offset, 0), 0)
$$;
revoke execute on function public.admin_customers(text, int, int) from public, anon;
grant execute on function public.admin_customers(text, int, int) to authenticated;
