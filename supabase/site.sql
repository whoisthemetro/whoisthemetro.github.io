-- ============================================================
-- THE METRO — persistent room light + traffic metrics
-- Run once: SQL Editor → paste → Run. (Nothing to edit.)
-- ============================================================

-- ---------- the light switch state, shared and persistent ----------
create table if not exists public.room_state (
  id          int primary key default 1 check (id = 1),
  light_level double precision not null default 0 check (light_level between 0 and 1),
  light_color text not null default '#ffe2b8' check (light_color ~ '^#[0-9a-fA-F]{6}$'),
  updated_at  timestamptz not null default now()
);
insert into public.room_state (id) values (1) on conflict (id) do nothing;

alter table public.room_state enable row level security;
drop policy if exists "anyone can see the lights" on public.room_state;
create policy "anyone can see the lights"
  on public.room_state for select using (true);

create or replace function public.set_room_light(level double precision, color text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text;
  v_recent int;
begin
  begin
    v_ip := coalesce(current_setting('request.headers', true)::json ->> 'x-real-ip', 'unknown');
  exception when others then
    v_ip := 'unknown';
  end;
  select count(*) into v_recent from private.post_log
   where ip = 'light:' || v_ip and at > now() - interval '1 minute';
  if v_recent >= 10 then
    raise exception 'rate limit: lights';
  end if;
  insert into private.post_log (ip) values ('light:' || v_ip);

  update public.room_state
     set light_level = greatest(0, least(1, level)),
         light_color = case when color ~ '^#[0-9a-fA-F]{6}$' then color else light_color end,
         updated_at = now()
   where id = 1;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.room_state;
exception when duplicate_object then null;
end;
$$;

-- ---------- the booth: who's on the decks tonight ----------
-- dj holds { on: bool, act: { uid, name } | null }. the host (admin) powers
-- the decks and hands them to ONE present user; null act = powered but
-- unassigned. it rides room_state so it persists and broadcasts for free.
alter table public.room_state add column if not exists dj jsonb;

-- only the host may touch it — same passphrase as the kill switch.
create or replace function public.set_dj(p_dj jsonb, pass text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  select (pass_hash = extensions.crypt(pass, pass_hash)) into v_ok
    from private.admin where id = 1;
  if not coalesce(v_ok, false) then
    return false;
  end if;
  update public.room_state set dj = p_dj, updated_at = now() where id = 1;
  return true;
end;
$$;

-- ---------- metrics: what people do in the room ----------
-- (anonymous: just an event type and a timestamp, nothing else)
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  type       text not null check (type in (
    'visit', 'note', 'photo', 'link', 'dm', 'chat',
    'arcade_defender', 'arcade_doom', 'arcade_tron', 'arcade_pong',
    'boat', 'pet', 'feed', 'clean', 'curtains', 'piano', 'light'))
);
create index if not exists events_at on public.events (created_at);
create index if not exists events_type_at on public.events (type, created_at);

alter table public.events enable row level security;
drop policy if exists "anyone can log an event" on public.events;
create policy "anyone can log an event"
  on public.events for insert with check (true);
-- no select for the public: the numbers are yours alone.

create or replace function public.events_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text;
  v_recent int;
begin
  begin
    v_ip := coalesce(current_setting('request.headers', true)::json ->> 'x-real-ip', 'unknown');
  exception when others then
    v_ip := 'unknown';
  end;
  select count(*) into v_recent from private.post_log
   where ip = 'ev:' || v_ip and at > now() - interval '1 minute';
  if v_recent >= 30 then
    raise exception 'rate limit: events';
  end if;
  insert into private.post_log (ip) values ('ev:' || v_ip);
  return new;
end;
$$;

drop trigger if exists events_guard on public.events;
create trigger events_guard
  before insert on public.events
  for each row execute function public.events_guard();

-- ============================================================
-- READING YOUR NUMBERS (SQL Editor, any time):
--
--   visits per day, last 2 weeks:
--     select date_trunc('day', created_at) d, count(*)
--     from events where type = 'visit'
--       and created_at > now() - interval '14 days'
--     group by 1 order by 1 desc;
--
--   what people actually do:
--     select type, count(*) from events
--     where created_at > now() - interval '7 days'
--     group by 1 order by 2 desc;
--
-- Retroactive note: events start counting from today, but your DB
-- already holds history: notes (created_at), scores, cat pets, and
-- private messages are all timestamped from day one.
-- ============================================================

-- ---------- Desi's walls take notes too ----------
alter table public.notes drop constraint if exists notes_wall_check;
alter table public.notes add constraint notes_wall_check
  check (wall in ('back', 'west', 'east', 'boat_port', 'boat_stb', 'boat_door'));

-- ---------- messages in bottles ----------
create table if not exists public.bottles (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  text       text not null check (char_length(text) between 1 and 200)
);
alter table public.bottles enable row level security;
drop policy if exists "anyone can cast a bottle" on public.bottles;
create policy "anyone can cast a bottle"
  on public.bottles for insert with check (true);
-- no public select: you only get the one the sea gives you

create or replace function public.bottle_random()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
begin
  select text, created_at into v_row
    from public.bottles
   order by random() limit 1;
  if v_row is null then return null; end if;
  return jsonb_build_object('text', v_row.text, 'created_at', v_row.created_at);
end;
$$;

create or replace function public.bottles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text;
  v_recent int;
begin
  begin
    v_ip := coalesce(current_setting('request.headers', true)::json ->> 'x-real-ip', 'unknown');
  exception when others then
    v_ip := 'unknown';
  end;
  select count(*) into v_recent from private.post_log
   where ip = 'msg:' || v_ip and at > now() - interval '1 day';
  if v_recent >= 3 then
    raise exception 'rate limit: bottles';
  end if;
  insert into private.post_log (ip) values ('msg:' || v_ip);
  return new;
end;
$$;

drop trigger if exists bottles_guard on public.bottles;
create trigger bottles_guard
  before insert on public.bottles
  for each row execute function public.bottles_guard();

-- ---------- one leaderboard row per player: keep their best ----------
alter table public.scores add column if not exists uid text;
create unique index if not exists scores_game_uid
  on public.scores (game, uid) where uid is not null;

create or replace function public.submit_score(p_game text, p_uid text, p_name text, p_score int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.scores (game, name, score, uid)
  values (p_game, left(coalesce(p_name, 'anon'), 24), p_score, left(p_uid, 40))
  on conflict (game, uid) where uid is not null
  do update set
    score = greatest(public.scores.score, excluded.score),
    name = excluded.name,
    created_at = now();
end;
$$;
