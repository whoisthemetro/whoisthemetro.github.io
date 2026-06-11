-- ============================================================
-- THE METRO — the private inbox
--
-- Run once: Supabase Dashboard → SQL Editor → paste → Run.
-- (Nothing to edit.)
--
-- Visitors click the computer in the room and leave you a private
-- message + link (demos, tracks, whatever). NOBODY can read them
-- through the public API — not even with the anon key. You read
-- them in the room: visit /#admin, click the computer, enter your
-- admin passphrase (read_inbox checks it against private.admin).
-- ============================================================

create table if not exists public.private_messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text check (name is null or char_length(name) <= 40),
  text        text not null check (char_length(text) between 1 and 500),
  url         text check (url is null or (char_length(url) <= 500 and url ~* '^https?://')),
  file_path   text check (file_path is null or char_length(file_path) <= 200)
);
alter table public.private_messages add column if not exists file_path text
  check (file_path is null or char_length(file_path) <= 200);

-- demo drop-box: audio attachments live here under unguessable uuid
-- names; the paths are only ever revealed through read_inbox(pass)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('demos', 'demos', true, 26214400,
        array['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac',
              'audio/flac', 'audio/ogg', 'audio/webm', 'audio/aiff', 'audio/x-aiff'])
on conflict (id) do update
  set public = true, file_size_limit = 26214400,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anyone can drop a demo" on storage.objects;
create policy "anyone can drop a demo"
  on storage.objects for insert
  with check (bucket_id = 'demos' and (storage.foldername(name))[1] = 'd');

alter table public.private_messages enable row level security;

drop policy if exists "anyone can write to metro" on public.private_messages;
create policy "anyone can write to metro"
  on public.private_messages for insert
  with check (true);

-- deliberately NO select / update / delete policies:
-- write-only mailbox for the public.

create or replace function public.private_messages_guard()
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
  select count(*) into v_recent
    from private.post_log
   where ip = 'dm:' || v_ip and at > now() - interval '5 minutes';
  if v_recent >= 3 then
    raise exception 'rate limit: inbox';
  end if;
  insert into private.post_log (ip) values ('dm:' || v_ip);
  return new;
end;
$$;

drop trigger if exists private_messages_guard on public.private_messages;
create trigger private_messages_guard
  before insert on public.private_messages
  for each row execute function public.private_messages_guard();

-- your key to the mailbox — same passphrase as the kill switch
create or replace function public.read_inbox(pass text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ok boolean;
begin
  perform pg_sleep(0.3);
  select (pass_hash = extensions.crypt(pass, pass_hash)) into v_ok
    from private.admin where id = 1;
  if not coalesce(v_ok, false) then
    return null;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'name', m.name, 'text', m.text, 'url', m.url,
      'file_path', m.file_path, 'created_at', m.created_at)
      order by m.created_at desc)
    from (select * from public.private_messages order by created_at desc limit 100) m
  ), '[]'::jsonb);
end;
$$;

-- OPTIONAL: email each message (with the audio attached) to you.
-- Needs the 'demo-email' Edge Function deployed first — see EMAIL.md.
-- Harmless if the function doesn't exist; the call just fails quietly.
create or replace function public.notify_email_dm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := 'https://donnxntnewmkzrycugpn.supabase.co/functions/v1/demo-email',
    body := jsonb_build_object(
      'name', new.name, 'text', new.text, 'url', new.url, 'file_path', new.file_path),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists dm_notify_email on public.private_messages;
create trigger dm_notify_email
  after insert on public.private_messages
  for each row execute function public.notify_email_dm();
