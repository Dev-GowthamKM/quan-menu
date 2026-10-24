-- The store for a web address, and each store's own payment keys.

-- What the app needs to know about the store a request's host belongs to. Hosts that no
-- store claims (previews, localhost) get the home store.
create function public.resolve_store(p_host text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', s.id, 'slug', s.slug, 'name', s.name, 'status', s.status, 'is_home', s.is_home,
    'primary_host', (select d.hostname from public.store_domains d where d.store_id = s.id order by d.is_primary desc, d.created_at limit 1),
    'maintenance', coalesce((select ss.maintenance_mode from public.store_settings ss where ss.store_id = s.id), false)
  )
  from public.stores s
  where s.id = coalesce((select d.store_id from public.store_domains d where d.hostname = public.normalize_hostname(p_host)),
                        public.home_store_id())
$$;
grant execute on function public.resolve_store(text) to anon, authenticated, service_role;

-- Each store's own API keys (Razorpay to begin with), so payments go to that store's
-- account. The server encrypts them (AES-256-GCM, with the STORE_SECRETS_KEY environment
-- variable) before they reach the database, and only the server can read them: no
-- policies, no grants to browser roles. hint holds the last four characters so an admin
-- can tell which key is saved.
create table public.store_secrets (
  store_id uuid not null references public.stores (id) on delete cascade,
  name text not null check (name ~ '^[a-z0-9_]{2,60}$'),
  ciphertext text not null check (char_length(ciphertext) <= 4000),
  hint text not null default '' check (char_length(hint) <= 8),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (store_id, name)
);
alter table public.store_secrets enable row level security;
revoke all on public.store_secrets from anon, authenticated;
create trigger zz_store_guard before insert or update or delete on public.store_secrets
  for each row execute function public.guard_store();

-- Which keys the current store has saved, for its admins (never the keys themselves).
create function public.store_secret_status() returns table (name text, hint text, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select k.name, k.hint, k.updated_at from public.store_secrets k
  where k.store_id = public.current_store_id() and public.is_admin()
  order by k.name
$$;
revoke execute on function public.store_secret_status() from public, anon;
grant execute on function public.store_secret_status() to authenticated, service_role;

grant all on public.store_secrets to service_role;

-- The platform's administrators, for the Stores page.
create function public.platform_admin_list() returns table (user_id uuid, email text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.user_id, u.email::text, a.created_at
  from public.platform_admins a join auth.users u on u.id = a.user_id
  where public.is_platform_admin()
  order by a.created_at
$$;

-- Takes away someone's platform access (never your own, never the last one's).
create function public.platform_revoke_admin(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_platform_admin();
  if p_user_id = (select auth.uid()) then
    raise exception 'self_revoke' using errcode = 'P0001', hint = 'You can''t remove your own platform access. Ask another platform administrator.';
  end if;
  delete from public.platform_admins where user_id = p_user_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform public.write_audit('platform.revoke_admin', 'user', p_user_id::text, '{}'::jsonb, null);
end $$;

revoke execute on function public.platform_admin_list(), public.platform_revoke_admin(uuid) from public, anon;
grant execute on function public.platform_admin_list(), public.platform_revoke_admin(uuid) to authenticated, service_role;
