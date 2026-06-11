-- ============================================================
-- THE METRO — the cat's needs, shared by everyone
--
-- Run once: Supabase Dashboard → SQL Editor → paste → Run.
-- (Nothing to edit. Run features.sql first if you haven't.)
--
-- One row of truth for the whole internet. The bowls ONLY go down
-- because the cat actually eats and drinks; the litter only dirties
-- because the cat actually uses it. The cat runs on shared timers
-- (hungry_at / thirsty_at / bathroom_at): every visitor's cat gets
-- hungry at the same moment, the first one to act writes the result,
-- and everyone else syncs over realtime.
--
-- Rules baked in:
--   · eat/drink/bathroom only succeed when the timer is due
--   · an empty bowl can't be eaten from — the cat retries soon,
--     hungry and resentful, until somebody refills it
--   · refills only allowed when actually low (no bowl spam)
--   · max 6 treats per 6 hours, globally — the cat gets full
--   · 12 care actions per 5 minutes per visitor
-- ============================================================

create table if not exists public.cat_state (
  id          int primary key default 1 check (id = 1),
  food        double precision not null default 1,
  water       double precision not null default 1,
  litter      double precision not null default 0,
  pets        bigint not null default 0,
  treats      timestamptz[] not null default '{}',
  hungry_at   timestamptz not null default now(),
  thirsty_at  timestamptz not null default now(),
  bathroom_at timestamptz not null default now() + interval '1 hour',
  updated_at  timestamptz not null default now()
);
insert into public.cat_state (id) values (1) on conflict (id) do nothing;
-- upgrades from the earlier version of this file
alter table public.cat_state add column if not exists hungry_at timestamptz not null default now();
alter table public.cat_state add column if not exists thirsty_at timestamptz not null default now();
alter table public.cat_state add column if not exists bathroom_at timestamptz not null default now() + interval '1 hour';

-- carry over the pet counter if features.sql created one
do $$
begin
  if exists (select from information_schema.tables
             where table_schema = 'private' and table_name = 'cat') then
    update public.cat_state s
       set pets = greatest(s.pets, (select pets from private.cat where id = 1));
  end if;
end;
$$;

alter table public.cat_state enable row level security;

drop policy if exists "anyone can see the cat's bowls" on public.cat_state;
create policy "anyone can see the cat's bowls"
  on public.cat_state for select using (true);

-- no insert/update/delete policies: all care goes through cat_care()

create or replace function public.cat_care(action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s        public.cat_state;
  v_now    timestamptz := now();
  v_ip     text;
  v_recent int;
  v_ok     boolean := true;
  v_reason text := '';
begin
  begin
    v_ip := coalesce(current_setting('request.headers', true)::json ->> 'x-real-ip', 'unknown');
  exception when others then
    v_ip := 'unknown';
  end;
  select count(*) into v_recent
    from private.post_log
   where ip = 'cat:' || v_ip and at > v_now - interval '5 minutes';
  if v_recent >= 12 then
    raise exception 'rate limit: the cat needs a breather';
  end if;
  insert into private.post_log (ip) values ('cat:' || v_ip);

  select * into s from public.cat_state where id = 1 for update;

  s.treats := coalesce(
    (select array_agg(t) from unnest(s.treats) t where t > v_now - interval '6 hours'),
    '{}');

  if action = 'feed' then
    if s.food < 0.6 then s.food := 1;
    else v_ok := false; v_reason := 'food still full'; end if;
  elsif action = 'water' then
    if s.water < 0.7 then s.water := 1;
    else v_ok := false; v_reason := 'water still full'; end if;
  elsif action = 'clean' then
    s.litter := 0;
  elsif action = 'treat' then
    if coalesce(array_length(s.treats, 1), 0) >= 6 then
      v_ok := false; v_reason := 'cat is full';
    else
      s.treats := s.treats || v_now;
      s.food := least(1, s.food + 0.06);
    end if;
  elsif action = 'pet' then
    s.pets := s.pets + 1;

  -- the cat's own metabolism: timer-gated so only the first visitor's
  -- cat to act actually changes the world
  -- visible-life pacing: small bites, short cycles, so visitors
  -- actually witness the cat living
  elsif action = 'eat' then
    if v_now < s.hungry_at then
      v_ok := false; v_reason := 'not hungry';
    elsif s.food <= 0.05 then
      s.hungry_at := v_now + interval '15 minutes';   -- comes back to check
      v_ok := false; v_reason := 'bowl empty';
    else
      s.food := greatest(0, s.food - 0.15);
      s.hungry_at := v_now + make_interval(mins => 45 + floor(random() * 55)::int);
    end if;
  elsif action = 'drink' then
    if v_now < s.thirsty_at then
      v_ok := false; v_reason := 'not thirsty';
    elsif s.water <= 0.05 then
      s.thirsty_at := v_now + interval '12 minutes';
      v_ok := false; v_reason := 'bowl empty';
    else
      s.water := greatest(0, s.water - 0.18);
      s.thirsty_at := v_now + make_interval(mins => 35 + floor(random() * 45)::int);
    end if;
  elsif action = 'bathroom' then
    if v_now < s.bathroom_at then
      v_ok := false; v_reason := 'no need';
    else
      s.litter := least(1, s.litter + 0.15);
      s.bathroom_at := v_now + make_interval(mins => 100 + floor(random() * 120)::int);
    end if;
  else
    v_ok := false; v_reason := 'unknown action';
  end if;

  update public.cat_state
     set food = s.food, water = s.water, litter = s.litter,
         pets = s.pets, treats = s.treats,
         hungry_at = s.hungry_at, thirsty_at = s.thirsty_at,
         bathroom_at = s.bathroom_at, updated_at = v_now
   where id = 1;

  return jsonb_build_object(
    'food', s.food, 'water', s.water, 'litter', s.litter, 'pets', s.pets,
    'hungry_at', s.hungry_at, 'thirsty_at', s.thirsty_at, 'bathroom_at', s.bathroom_at,
    'ok', v_ok, 'reason', v_reason);
end;
$$;

-- live updates: everyone's room reflects a refill the moment it happens
do $$
begin
  alter publication supabase_realtime add table public.cat_state;
exception when duplicate_object then
  null;
end;
$$;
