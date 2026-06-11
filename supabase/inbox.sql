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
  url         text check (url is null or (char_length(url) <= 500 and url ~* '^https?://'))
);

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
      'name', m.name, 'text', m.text, 'url', m.url, 'created_at', m.created_at)
      order by m.created_at desc)
    from (select * from public.private_messages order by created_at desc limit 100) m
  ), '[]'::jsonb);
end;
$$;
