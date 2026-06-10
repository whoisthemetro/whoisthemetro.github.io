-- ============================================================
-- THE METRO — database setup
--
-- Run this ONCE in your Supabase project:
--   Dashboard → SQL Editor → New query → paste → Run
--
-- ⚠ BEFORE RUNNING: search for CHANGE_ME below and replace it
--   with your own secret admin passphrase.
--
-- What this sets up:
--   · notes table  — the wall. anyone can read, anyone can post,
--                    NOBODY can edit or delete (except you).
--   · rate limits  — max 5 posts/min per visitor, 40/min total.
--   · photos bucket— public images, 3 MB cap, images only.
--   · admin_delete_note(id, pass) — your kill switch.
--   · realtime     — new notes appear live for everyone.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- the wall ----------
create table if not exists public.notes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  kind        text not null check (kind in ('note', 'photo', 'link')),
  text        text check (text is null or char_length(text) <= 280),
  url         text check (url is null or (char_length(url) <= 500 and url ~* '^https?://')),
  image_path  text check (image_path is null or char_length(image_path) <= 200),
  author      text check (author is null or char_length(author) <= 24),
  color       text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  wall        text not null check (wall in ('back', 'west', 'east')),
  x           double precision not null check (x between 0 and 1),
  y           double precision not null check (y between 0 and 1),
  rot         double precision not null default 0 check (rot between -0.5 and 0.5),
  deleted     boolean not null default false
);

alter table public.notes enable row level security;

drop policy if exists "anyone can read the wall" on public.notes;
create policy "anyone can read the wall"
  on public.notes for select
  using (not deleted);

drop policy if exists "anyone can post to the wall" on public.notes;
create policy "anyone can post to the wall"
  on public.notes for insert
  with check (
    not deleted
    and (kind <> 'note' or text is not null)
    and (kind <> 'link' or url is not null)
  );

-- no UPDATE or DELETE policies exist on purpose:
-- once something is on the wall, visitors cannot touch it.

-- ---------- private corner (invisible to the public API) ----------
create schema if not exists private;

create table if not exists private.post_log (
  ip text not null,
  at timestamptz not null default now()
);
create index if not exists post_log_at on private.post_log (at);

create table if not exists private.admin (
  id        int primary key default 1 check (id = 1),
  pass_hash text not null
);

-- ▼▼▼ SET YOUR ADMIN PASSPHRASE HERE (replace CHANGE_ME) ▼▼▼
insert into private.admin (id, pass_hash)
values (1, extensions.crypt('CHANGE_ME', extensions.gen_salt('bf')))
on conflict (id) do update set pass_hash = excluded.pass_hash;
-- ▲▲▲ re-run just this insert any time to change it ▲▲▲

-- ---------- rate limiting ----------
create or replace function public.notes_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ip     text;
  v_mine   int;
  v_total  int;
begin
  begin
    v_ip := coalesce(
      current_setting('request.headers', true)::json ->> 'x-real-ip',
      split_part(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ',', 1),
      'unknown'
    );
  exception when others then
    v_ip := 'unknown';
  end;

  delete from private.post_log where at < now() - interval '10 minutes';

  select count(*) into v_mine
    from private.post_log
   where ip = v_ip and at > now() - interval '1 minute';
  if v_mine >= 5 then
    raise exception 'rate limit: slow down';
  end if;

  select count(*) into v_total
    from private.post_log
   where at > now() - interval '1 minute';
  if v_total >= 40 then
    raise exception 'rate limit: wall is busy';
  end if;

  insert into private.post_log (ip) values (v_ip);
  return new;
end;
$$;

drop trigger if exists notes_rate_limit on public.notes;
create trigger notes_rate_limit
  before insert on public.notes
  for each row execute function public.notes_rate_limit();

-- ---------- your kill switch ----------
create or replace function public.admin_delete_note(note_id uuid, pass text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  perform pg_sleep(0.3);   -- makes passphrase guessing impractically slow
  select (pass_hash = extensions.crypt(pass, pass_hash)) into v_ok
    from private.admin where id = 1;
  if not coalesce(v_ok, false) then
    return false;
  end if;
  update public.notes set deleted = true where id = note_id;
  return true;
end;
$$;

-- ---------- live updates ----------
do $$
begin
  alter publication supabase_realtime add table public.notes;
exception when duplicate_object then
  null;  -- already added
end;
$$;

-- ---------- photo storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 3145728,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "public can view photos" on storage.objects;
create policy "public can view photos"
  on storage.objects for select
  using (bucket_id = 'photos');

drop policy if exists "anyone can add a photo" on storage.objects;
create policy "anyone can add a photo"
  on storage.objects for insert
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = 'p');

-- no update/delete on photos for the public either.
