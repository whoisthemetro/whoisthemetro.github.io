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

-- ---------- the venue big screen: a shared twitch/youtube stream ----------
-- screen holds { platform, kind, id, at } | null. the host (admin) pastes a
-- link in the booth and it hangs above the dj for everyone. it rides
-- room_state so it survives a reload and persists even after the host leaves,
-- and it broadcasts over realtime for free.
alter table public.room_state add column if not exists screen jsonb;

-- only the host may touch it — same passphrase as the booth.
create or replace function public.set_screen(p_screen jsonb, pass text)
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
  update public.room_state set screen = p_screen, updated_at = now() where id = 1;
  return true;
end;
$$;

-- ---------- the room's interactables, shared and persistent ----------
-- a single jsonb bag of toggle states so the room comes back exactly as people
-- left it: blinds, curtains, closet, the lava lamp, each radio ({on, idx}), and
-- the carpet's grime (a downsampled hex grid, ~1.3KB). keys are whitelisted in
-- the setter so nothing arbitrary lands
-- here. it rides room_state, so it persists and broadcasts over realtime for free.
alter table public.room_state add column if not exists flags jsonb not null default '{}'::jsonb;

-- the 2-arg form is dropped, not left beside the new one: an overload that
-- skips the passphrase is not a gate, it's a second door
drop function if exists public.set_room_flag(text, jsonb);
create or replace function public.set_room_flag(p_key text, p_val jsonb, pass text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip text;
  v_recent int;
  v_ok boolean;
begin
  -- 'plaits' and 'rings' are the two bedroom instrument panels. they are
  -- shared toys like the lava lamp, not furniture like the layout: the
  -- keyboard by the window is ONE keyboard, so a knob anyone turns is turned.
  if p_key not in ('blinds', 'curtains', 'closet', 'lava', 'radio_sr', 'radio_la', 'grime', 'layout', 'studio', 'graffiti', 'plaits', 'rings') then
    raise exception 'unknown room flag: %', p_key;
  end if;

  -- the blinds and the lava lamp belong to everyone. the furniture does not:
  -- `layout` rearranges the room for every visitor, and #admin is just a URL
  -- anyone can type, so the check has to live here rather than in the client.
  if p_key = 'layout' then
    select (a.pass_hash = extensions.crypt(coalesce(pass, ''), a.pass_hash))
      into v_ok from private.admin a where a.id = 1;
    if not coalesce(v_ok, false) then
      raise exception 'layout needs the admin passphrase';
    end if;
  end if;
  begin
    v_ip := coalesce(current_setting('request.headers', true)::json ->> 'x-real-ip', 'unknown');
  exception when others then
    v_ip := 'unknown';
  end;
  select count(*) into v_recent from private.post_log
   where ip = 'flag:' || v_ip and at > now() - interval '1 minute';
  if v_recent >= 40 then
    raise exception 'rate limit: flags';
  end if;
  insert into private.post_log (ip) values ('flag:' || v_ip);

  update public.room_state
     set flags = coalesce(flags, '{}'::jsonb) || jsonb_build_object(p_key, p_val),
         updated_at = now()
   where id = 1;
end;
$$;

-- ---------- metrics: what people do in the room ----------
-- (anonymous: just an event type and a timestamp, nothing else)
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  type       text not null check (type in (
    'visit', 'note', 'photo', 'link', 'dm', 'chat',
    'arcade_defender', 'arcade_doom', 'arcade_tron', 'arcade_pong', 'arcade_pac',
    'boat', 'pet', 'feed', 'clean', 'curtains', 'piano', 'light', 'studio'))
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

-- ---------- re-hang your own note ----------
-- A visitor may move a note THEY posted to a new spot. We tag each note with
-- the poster's anonymous uid (going forward only — old rows stay null and so
-- can never be moved). Still no public UPDATE policy: the move runs through a
-- security-definer RPC that checks the uid, so you can only ever shove your
-- own paper around.
alter table public.notes add column if not exists uid text
  check (uid is null or char_length(uid) <= 40);

create or replace function public.move_note(
  note_id uuid, note_uid text,
  new_wall text, new_x double precision, new_y double precision, new_rot double precision
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner   text;
  v_wall    text;
  v_created timestamptz;
  v_bedroom constant text[] := array['back', 'west', 'east'];
begin
  if note_uid is null or new_x < 0 or new_x > 1 or new_y < 0 or new_y > 1
     or new_rot < -0.5 or new_rot > 0.5
     or new_wall not in ('back', 'west', 'east', 'boat_port', 'boat_stb', 'boat_door') then
    return false;
  end if;
  select uid, wall, created_at into v_owner, v_wall, v_created
    from public.notes where id = note_id and not deleted;
  if v_owner is null or v_owner <> note_uid then
    return false;     -- not yours (or it was never tagged) → no move
  end if;

  /* PAST MONTHS ARE LOCKED.
     The bedroom wall shows one month at a time and new notes always land on
     the current one — INSERT can't reach the past, because created_at
     defaults to now(). This is the other door: a note that has been hung and
     the month has turned over stays exactly where its author left it.

     It belongs here rather than in the browser. The whole reason the wall
     quietly filled up in August is that its only guard ran client-side,
     where a refusal leaves no trace and a crafted request never meets it.

     LA months, not UTC — a note posted at 02:00 UTC on the 1st went up the
     evening before in Los Angeles, and it belongs to the month its author
     was living in. Same rule as monthKeyOf() in notes3d.js.

     The boat is exempt, the same way it is exempt from the month view: its
     three walls hold fourteen notes, most of them Desi's, and they are not
     part of the monthly turnover. */
  if v_wall = any(v_bedroom)
     and date_trunc('month', v_created at time zone 'America/Los_Angeles')
       <> date_trunc('month', now() at time zone 'America/Los_Angeles') then
    return false;
  end if;

  -- and a note stays in the room it was left in. nothing in the UI can move
  -- one across (you can only point at walls you're standing in front of), but
  -- this function is reachable without the UI, and "move it to the boat" was
  -- otherwise a way around the month lock above.
  if (v_wall = any(v_bedroom)) <> (new_wall = any(v_bedroom)) then
    return false;
  end if;

  update public.notes
     set wall = new_wall, x = new_x, y = new_y, rot = new_rot
   where id = note_id;
  return true;
end;
$$;

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

-- ---------- avatar storage: dropped .glb files get a public home ----------
-- (mirrors the live migration `avatar_storage`)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 16777216, array['model/gltf-binary', 'application/octet-stream'])
on conflict (id) do update set public = true, file_size_limit = 16777216,
  allowed_mime_types = array['model/gltf-binary', 'application/octet-stream'];

drop policy if exists "anyone may hang an avatar" on storage.objects;
create policy "anyone may hang an avatar"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "anyone may rehang their avatar" on storage.objects;
create policy "anyone may rehang their avatar"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'avatars') with check (bucket_id = 'avatars');

drop policy if exists "avatars are public" on storage.objects;
create policy "avatars are public"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');
