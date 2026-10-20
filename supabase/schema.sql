-- Quán — database schema. Paste into Supabase → SQL Editor → Run. Safe to run again after
-- every update: it only adds what is missing and keeps all menus.

create table if not exists public.stalls (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,  -- one account may run several stalls
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  name        text not null check (length(name) between 1 and 120),
  area        text not null default '',
  published   boolean not null default false,
  kind        text not null default 'food',   -- food | cafe | tea: sets default drink options
  toppings    jsonb not null default '[]',    -- [{"vi","price","name"}], the shop's add-ons
  pay         jsonb,                          -- bank transfer details for VietQR: {"bank","acct","name"}
  maps        text not null default '',       -- the stall's Google Maps link, for reviews
  sold_out    jsonb not null default '{}',    -- {"day","names"}: dishes sold out today; clears itself the next day
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.dishes (
  id         uuid primary key default gen_random_uuid(),
  stall_id   uuid not null references public.stalls(id) on delete cascade,
  position   int  not null default 0,
  vi         text not null check (length(vi) between 1 and 200),
  price      int  not null default 0 check (price >= 0),
  spice      smallint not null default 0 check (spice between 0 and 3),
  allergens  text[] not null default '{}',
  pron       text not null default '',
  name       jsonb,          -- {"en","ko","zh","ja"}
  descr      jsonb,          -- {"en","ko","zh","ja"}
  media      jsonb not null default '[]', -- [{"type":"image"|"video","url"}]
  opts       jsonb,                       -- drink options: {"sizes":[{"k","price"}],"sugar","ice","tops"}
  special    boolean not null default false  -- "must-try" badge on the customer menu
);
alter table public.dishes add column if not exists media jsonb not null default '[]';
alter table public.dishes add column if not exists opts jsonb;
alter table public.stalls add column if not exists kind text not null default 'food';
alter table public.stalls add column if not exists toppings jsonb not null default '[]';
alter table public.stalls add column if not exists pay jsonb;
alter table public.stalls add column if not exists maps text not null default '';
alter table public.stalls add column if not exists sold_out jsonb not null default '{}';
alter table public.dishes add column if not exists special boolean not null default false;
-- Earlier versions allowed one stall per account. Now a helper can set up menus for many vendors.
alter table public.stalls drop constraint if exists stalls_owner_id_key;
create index if not exists stalls_owner_idx on public.stalls(owner_id, updated_at desc);
create index if not exists dishes_stall_idx on public.dishes(stall_id, position);

alter table public.stalls enable row level security;
alter table public.dishes enable row level security;

-- Anyone can read a published stall; owners can always read their own.
drop policy if exists stalls_read on public.stalls;
create policy stalls_read on public.stalls for select
  using (published or owner_id = auth.uid());
drop policy if exists stalls_write on public.stalls;
create policy stalls_write on public.stalls for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists dishes_read on public.dishes;
create policy dishes_read on public.dishes for select
  using (exists (select 1 from public.stalls s where s.id = stall_id and (s.published or s.owner_id = auth.uid())));
drop policy if exists dishes_write on public.dishes;
create policy dishes_write on public.dishes for all
  using (exists (select 1 from public.stalls s where s.id = stall_id and s.owner_id = auth.uid()))
  with check (exists (select 1 from public.stalls s where s.id = stall_id and s.owner_id = auth.uid()));

-- Saves a stall and replaces its dishes in one transaction. p_stall = null creates a new stall.
-- p_expect is the stall's updated_at when the editor loaded it: if the menu changed since (for
-- example the owner changed a price from their own link), the save stops instead of undoing that.
drop function if exists public.save_menu(text, text, text, boolean, jsonb);
create or replace function public.save_menu(
  p_stall uuid, p_expect timestamptz,
  p_name text, p_area text, p_slug text, p_published boolean,
  p_kind text, p_toppings jsonb, p_pay jsonb, p_maps text,
  p_dishes jsonb
) returns public.stalls
language plpgsql security invoker as $$
declare s public.stalls;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  if p_stall is null then
    insert into public.stalls (owner_id, slug, name, area, published, kind, toppings, pay, maps)
    values (auth.uid(), p_slug, p_name, coalesce(p_area, ''), p_published, coalesce(p_kind, 'food'),
            coalesce(p_toppings, '[]'), p_pay, coalesce(p_maps, ''))
    returning * into s;
  else
    select * into s from public.stalls where id = p_stall and owner_id = auth.uid() for update;
    if not found then raise exception 'stall not found' using errcode = 'PT404'; end if;
    if p_expect is not null and s.updated_at <> p_expect then
      raise exception 'menu changed since it was opened' using errcode = 'PT409';
    end if;
    update public.stalls
      set slug = p_slug, name = p_name, area = coalesce(p_area, ''), published = p_published,
          kind = coalesce(p_kind, 'food'), toppings = coalesce(p_toppings, '[]'), pay = p_pay,
          maps = coalesce(p_maps, ''), updated_at = now()
      where id = p_stall
      returning * into s;
  end if;

  delete from public.dishes where stall_id = s.id;

  insert into public.dishes (stall_id, position, vi, price, spice, allergens, pron, name, descr, media, opts, special)
  select s.id, (d.ord - 1)::int,
         d.v->>'vi',
         greatest(0, coalesce((d.v->>'price')::int, 0)),
         least(3, greatest(0, coalesce((d.v->>'spice')::int, 0)))::smallint,
         coalesce(array(select jsonb_array_elements_text(coalesce(d.v->'alg', '[]'::jsonb))), '{}'),
         coalesce(d.v->>'pron', ''),
         d.v->'name',
         d.v->'desc',
         case when jsonb_typeof(d.v->'media') = 'array' then d.v->'media' else '[]'::jsonb end,
         case when jsonb_typeof(d.v->'opts') = 'object' then d.v->'opts' end,
         coalesce(d.v->'special' = 'true'::jsonb, false)
  from jsonb_array_elements(p_dishes) with ordinality as d(v, ord)
  where coalesce(trim(d.v->>'vi'), '') <> '';

  return s;
end $$;

-- AI usage cap: each signed-in vendor gets a fixed number of AI calls (photo reading
-- and translation) per UTC day, so one account can't run up the Anthropic bill.
-- Change the number below and re-run this file to adjust it.
create table if not exists public.ai_usage (
  user_id  uuid not null references auth.users(id) on delete cascade,
  day      date not null,
  calls    int  not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
-- No policies on purpose: the table is only reachable through take_ai_call().

create or replace function public.take_ai_call() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  daily_limit constant int := 40;
  n int;
begin
  if auth.uid() is null then return false; end if;
  insert into public.ai_usage (user_id, day, calls)
  values (auth.uid(), (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1
  returning calls into n;
  return n <= daily_limit;
end $$;
revoke all on function public.take_ai_call() from public, anon;
grant execute on function public.take_ai_call() to authenticated;

-- Dish photos and videos. Public bucket: anyone can view files, but each vendor can
-- only add or delete files inside their own folder (named after their user id).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dish-media', 'dish-media', true, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists dish_media_owner_read on storage.objects;
create policy dish_media_owner_read on storage.objects for select to authenticated
  using (bucket_id = 'dish-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists dish_media_owner_insert on storage.objects;
create policy dish_media_owner_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'dish-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists dish_media_owner_delete on storage.objects;
create policy dish_media_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'dish-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- Menu views per day, for the vendor's "how many customers looked" counter. Anyone opening a
-- published menu adds one view through count_view(); only the stall's owner can read the counts.
create table if not exists public.menu_views (
  stall_id  uuid not null references public.stalls(id) on delete cascade,
  day       date not null,
  views     int  not null default 0,
  primary key (stall_id, day)
);
alter table public.menu_views enable row level security;
drop policy if exists menu_views_owner on public.menu_views;
create policy menu_views_owner on public.menu_views for select
  using (exists (select 1 from public.stalls s where s.id = stall_id and s.owner_id = auth.uid()));

create or replace function public.count_view(p_slug text) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  select id into sid from public.stalls where slug = p_slug and published;
  if sid is null then return; end if;
  insert into public.menu_views (stall_id, day, views)
  values (sid, (now() at time zone 'Asia/Ho_Chi_Minh')::date, 1)
  on conflict (stall_id, day) do update set views = public.menu_views.views + 1;
end $$;
revoke all on function public.count_view(text) from public;
grant execute on function public.count_view(text) to anon, authenticated;

-- "Sold out today": kept on the stall by Vietnamese dish name, so saving the menu doesn't undo it,
-- and it clears itself the next day (Vietnam time). Owners use set_sold_out(); the owner link
-- (/k/<token>) uses quick_sold_out(). Both go through this helper, which nobody can call directly.
create or replace function public._set_sold_out(p_stall uuid, p_vi text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  today text := ((now() at time zone 'Asia/Ho_Chi_Minh')::date)::text;
  cur jsonb;
  names jsonb;
begin
  if coalesce(length(trim(p_vi)), 0) not between 1 and 200 then raise exception 'bad dish name'; end if;
  select sold_out into cur from public.stalls where id = p_stall for update;
  if not found then return null; end if;
  names := case when cur->>'day' = today and jsonb_typeof(cur->'names') = 'array' then cur->'names' else '[]'::jsonb end;
  select coalesce(jsonb_agg(n), '[]'::jsonb) into names from jsonb_array_elements_text(names) n where n <> p_vi;
  if p_on and jsonb_array_length(names) < 300 then names := names || to_jsonb(p_vi); end if;
  update public.stalls set sold_out = jsonb_build_object('day', today, 'names', names) where id = p_stall;
  return jsonb_build_object('day', today, 'names', names);
end $$;
revoke all on function public._set_sold_out(uuid, text, boolean) from public, anon, authenticated;

create or replace function public.set_sold_out(p_stall uuid, p_vi text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.stalls where id = p_stall and owner_id = auth.uid()) then
    raise exception 'stall not found' using errcode = 'PT404';
  end if;
  return public._set_sold_out(p_stall, p_vi, p_on);
end $$;
revoke all on function public.set_sold_out(uuid, text, boolean) from public, anon;
grant execute on function public.set_sold_out(uuid, text, boolean) to authenticated;

-- Owner links: a secret link a vendor can open on their own phone, without an account, to mark
-- dishes sold out and change prices. Useful when a helper set up the menu for them. Only the
-- stall's account can see or replace the link; quick_* functions accept it in place of a login.
create table if not exists public.stall_keys (
  stall_id   uuid primary key references public.stalls(id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);
alter table public.stall_keys enable row level security;
drop policy if exists stall_keys_owner_read on public.stall_keys;
create policy stall_keys_owner_read on public.stall_keys for select
  using (exists (select 1 from public.stalls s where s.id = stall_id and s.owner_id = auth.uid()));
drop policy if exists stall_keys_owner_delete on public.stall_keys;
create policy stall_keys_owner_delete on public.stall_keys for delete
  using (exists (select 1 from public.stalls s where s.id = stall_id and s.owner_id = auth.uid()));

-- Makes a new owner link for a stall (the old one stops working) and returns its token.
create or replace function public.new_owner_key(p_stall uuid) returns text
language plpgsql security definer set search_path = public as $$
declare tok text := replace(gen_random_uuid()::text, '-', '');
begin
  if not exists (select 1 from public.stalls where id = p_stall and owner_id = auth.uid()) then
    raise exception 'stall not found' using errcode = 'PT404';
  end if;
  insert into public.stall_keys (stall_id, token) values (p_stall, tok)
  on conflict (stall_id) do update set token = excluded.token, created_at = now();
  return tok;
end $$;
revoke all on function public.new_owner_key(uuid) from public, anon;
grant execute on function public.new_owner_key(uuid) to authenticated;

create or replace function public._key_stall(p_token text) returns uuid
language sql security definer stable set search_path = public as $$
  select stall_id from public.stall_keys where token = p_token and length(p_token) = 32
$$;
revoke all on function public._key_stall(text) from public, anon, authenticated;

-- Everything the owner page shows: the stall, its dishes, today's sold-out list and view counts.
create or replace function public.quick_menu(p_token text) returns jsonb
language plpgsql security definer stable set search_path = public as $$
declare
  s public.stalls;
  vn date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  select * into s from public.stalls where id = public._key_stall(p_token);
  if not found then return null; end if;
  return jsonb_build_object(
    'stall', jsonb_build_object('id', s.id, 'name', s.name, 'slug', s.slug, 'published', s.published,
      'sold_out', case when s.sold_out->>'day' = vn::text and jsonb_typeof(s.sold_out->'names') = 'array'
                       then s.sold_out->'names' else '[]'::jsonb end),
    'dishes', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'vi', d.vi, 'price', d.price, 'opts', d.opts)
                                         order by d.position)
                        from public.dishes d where d.stall_id = s.id), '[]'::jsonb),
    'views', jsonb_build_object(
      'today', coalesce((select views from public.menu_views where stall_id = s.id and day = vn), 0),
      'week', coalesce((select sum(views) from public.menu_views where stall_id = s.id and day > vn - 7), 0)));
end $$;

create or replace function public.quick_sold_out(p_token text, p_vi text, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid uuid := public._key_stall(p_token);
begin
  if sid is null then return null; end if;
  return public._set_sold_out(sid, p_vi, p_on);
end $$;

-- Changes one dish's price from the owner page. p_sizes ({"M": 30000, "L": 40000}) sets drink
-- sizes. Moves the stall's updated_at, so an editor opened earlier can't silently undo it.
create or replace function public.quick_price(p_token text, p_dish uuid, p_price int, p_sizes jsonb default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  sid uuid := public._key_stall(p_token);
  d public.dishes;
  sizes jsonb;
begin
  if sid is null then return false; end if;
  select * into d from public.dishes where id = p_dish and stall_id = sid for update;
  if not found then return false; end if;
  if jsonb_typeof(d.opts->'sizes') = 'array' and jsonb_typeof(p_sizes) = 'object' then
    select jsonb_agg(jsonb_build_object('k', z->>'k', 'price',
             least(100000000, greatest(0, coalesce((p_sizes->>(z->>'k'))::int, (z->>'price')::int))))
             order by ord)
      into sizes
      from jsonb_array_elements(d.opts->'sizes') with ordinality as t(z, ord);
    update public.dishes set opts = jsonb_set(d.opts, '{sizes}', sizes), price = (sizes->0->>'price')::int
      where id = p_dish;
  else
    update public.dishes set price = least(100000000, greatest(0, coalesce(p_price, 0))) where id = p_dish;
  end if;
  update public.stalls set updated_at = now() where id = sid;
  return true;
end $$;

revoke all on function public.quick_menu(text) from public;
revoke all on function public.quick_sold_out(text, text, boolean) from public;
revoke all on function public.quick_price(text, uuid, int, jsonb) from public;
grant execute on function public.quick_menu(text) to anon, authenticated;
grant execute on function public.quick_sold_out(text, text, boolean) to anon, authenticated;
grant execute on function public.quick_price(text, uuid, int, jsonb) to anon, authenticated;

-- The app checks this to tell you when this file needs to be run again after an update.
create or replace function public.schema_version() returns int language sql immutable as $$ select 2 $$;
grant execute on function public.schema_version() to anon, authenticated;

notify pgrst, 'reload schema';
