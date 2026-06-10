-- ============================================================
-- THE METRO — the cat's needs, shared by everyone
--
-- Run once: Supabase Dashboard → SQL Editor → paste → Run.
-- (Nothing to edit. Run features.sql first if you haven't.)
--
-- One row of truth for the whole internet:
--   food/water drain in real time, the litter box gets dirty,
--   and ANY visitor can refill, clean, treat, or pet. Changes
--   broadcast live to everyone in the room.
--
-- Rules baked in:
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
  updated_at  timestamptz not null default now()
);
insert into public.cat_state (id) values (1) on conflict (id) do nothing;

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
  v_hrs    double precision;
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

  -- bring the needs up to date (they decay in real time)
  v_hrs := extract(epoch from (v_now - s.updated_at)) / 3600.0;
  s.food   := greatest(0, s.food - v_hrs / 36.0);
  s.water  := greatest(0, s.water - v_hrs / 24.0);
  s.litter := least(1, s.litter + v_hrs / 48.0);
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
  else
    v_ok := false; v_reason := 'unknown action';
  end if;

  update public.cat_state
     set food = s.food, water = s.water, litter = s.litter,
         pets = s.pets, treats = s.treats, updated_at = v_now
   where id = 1;

  return jsonb_build_object(
    'food', s.food, 'water', s.water, 'litter', s.litter,
    'pets', s.pets, 'ok', v_ok, 'reason', v_reason);
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
