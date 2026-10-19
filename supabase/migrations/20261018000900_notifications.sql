-- Email delivery: the server claims queued messages in batches (skipping rows another
-- instance is already sending), renders and sends them, then records the outcome.

create function public.claim_outbox(p_limit int default 20) returns setof public.email_outbox
language sql security definer set search_path = '' as $$
  update public.email_outbox o set status = 'sending', attempts = o.attempts + 1
  where o.id in (
    select id from public.email_outbox
    where status = 'queued'
       or (status = 'failed' and attempts < 5 and created_at > now() - interval '2 days')
       or (status = 'sending' and attempts < 5 and created_at < now() - interval '10 minutes')
    order by created_at
    limit least(greatest(coalesce(p_limit, 20), 1), 100)
    for update skip locked
  )
  returning o.*
$$;
revoke execute on function public.claim_outbox(int) from public, anon, authenticated;
grant execute on function public.claim_outbox(int) to service_role;
