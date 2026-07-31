-- ============================================================
-- THE STUDIO — the shared clock
--
-- One function, and it is the foundation the whole room stands on.
-- Two people's browsers can disagree about what time it is by whole
-- seconds; at 120bpm a second is two bars. So nobody trusts their own
-- clock. Everyone asks the database what time it is, measures how long
-- the asking took, and corrects for it. After that a loop started in
-- LA and a loop heard in Stockholm land on the same beat.
--
-- Idempotent — safe to paste into the SQL Editor as many times as you like.
-- ============================================================

-- volatile on purpose: clock_timestamp() moves *within* a transaction, which
-- is exactly what we want (now() would freeze at transaction start and hand
-- every caller in the same statement an identical, slightly stale reading).
create or replace function public.studio_now()
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  select (extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

comment on function public.studio_now() is
  'Server wall clock in unix milliseconds. Clients NTP against it to share a transport.';

-- reading the time is harmless — no data in, no data out, nothing to rate limit.
grant execute on function public.studio_now() to anon, authenticated;
