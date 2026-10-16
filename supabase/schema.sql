-- Quán — database schema. Paste into Supabase → SQL Editor → Run.

create table if not exists public.stalls (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null unique references auth.users(id) on delete cascade,
  slug        text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 60),
  name        text not null check (length(name) between 1 and 120),
  area        text not null default '',
  published   boolean not null default false,
  kind        text not null default 'food',   -- food | cafe | tea: sets default drink options
  toppings    jsonb not null default '[]',    -- [{"vi","price","name"}], the shop's add-ons
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
  opts       jsonb                        -- drink options: {"sizes":[{"k","price"}],"sugar","ice","tops"}
);
alter table public.dishes add column if not exists media jsonb not null default '[]';
alter table public.dishes add column if not exists opts jsonb;
alter table public.stalls add column if not exists kind text not null default 'food';
alter table public.stalls add column if not exists toppings jsonb not null default '[]';
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

-- Saves the stall and replaces its dishes in one transaction.
create or replace function public.save_menu(
  p_name text, p_area text, p_slug text, p_published boolean, p_dishes jsonb
) returns public.stalls
language plpgsql security invoker as $$
declare s public.stalls;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  insert into public.stalls (owner_id, slug, name, area, published)
  values (auth.uid(), p_slug, p_name, coalesce(p_area, ''), p_published)
  on conflict (owner_id) do update
    set slug = excluded.slug, name = excluded.name, area = excluded.area,
        published = excluded.published, updated_at = now()
  returning * into s;

  delete from public.dishes where stall_id = s.id;

  insert into public.dishes (stall_id, position, vi, price, spice, allergens, pron, name, descr, media, opts)
  select s.id, (d.ord - 1)::int,
         d.v->>'vi',
         greatest(0, coalesce((d.v->>'price')::int, 0)),
         least(3, greatest(0, coalesce((d.v->>'spice')::int, 0)))::smallint,
         coalesce(array(select jsonb_array_elements_text(coalesce(d.v->'alg', '[]'::jsonb))), '{}'),
         coalesce(d.v->>'pron', ''),
         d.v->'name',
         d.v->'desc',
         case when jsonb_typeof(d.v->'media') = 'array' then d.v->'media' else '[]'::jsonb end,
         case when jsonb_typeof(d.v->'opts') = 'object' then d.v->'opts' end
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
