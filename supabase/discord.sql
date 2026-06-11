-- ============================================================
-- THE METRO — Discord notifications
--
-- Pings your Discord channel every time anyone leaves anything
-- on the wall, with a one-tap erase link.
--
-- BEFORE RUNNING, replace PASTE_WEBHOOK_URL_HERE below with your
-- channel's webhook URL:
--   Discord → your server → the channel → ⚙ Edit Channel →
--   Integrations → Webhooks → New Webhook → Copy Webhook URL
--
-- Then: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

create extension if not exists pg_net;

-- ---------- repair the admin kill switch ----------
-- (pgcrypto lives in the `extensions` schema on Supabase; the original
--  function couldn't see it. This also powers the erase links below.)
create or replace function public.admin_delete_note(note_id uuid, pass text)
returns boolean
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
    return false;
  end if;
  update public.notes set deleted = true where id = note_id;
  return true;
end;
$$;

create or replace function public.notify_discord()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_webhook text := 'PASTE_WEBHOOK_URL_HERE';
  v_msg text;
begin
  v_msg :=
    case new.kind when 'photo' then '📷' when 'link' then '🔗' else '📌' end
    || ' **' || coalesce(nullif(new.author, ''), 'someone') || '**'
    || ' left a ' || new.kind || ' on the wall'
    || case when new.text is not null
         then e'\n> ' || left(new.text, 200) else '' end
    || case when new.url is not null
         then e'\n' || new.url else '' end
    || case when new.image_path is not null
         then e'\n' || 'https://donnxntnewmkzrycugpn.supabase.co/storage/v1/object/public/photos/' || new.image_path
         else '' end
    || e'\n🗑 erase: https://whoisthemetro.com/#erase=' || new.id;

  perform net.http_post(
    url := v_webhook,
    body := jsonb_build_object('content', v_msg),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;   -- never block a post because discord hiccuped
end;
$$;

drop trigger if exists notes_notify_discord on public.notes;
create trigger notes_notify_discord
  after insert on public.notes
  for each row execute function public.notify_discord();

-- private messages ping you too (run inbox.sql first)
create or replace function public.notify_discord_dm()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_webhook text := 'PASTE_WEBHOOK_URL_HERE';
begin
  perform net.http_post(
    url := v_webhook,
    body := jsonb_build_object('content',
      '📬 **private message** from ' || coalesce(nullif(new.name, ''), 'someone')
      || e'\n> ' || left(new.text, 300)
      || case when new.url is not null then e'\n' || new.url else '' end),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists dm_notify_discord on public.private_messages;
create trigger dm_notify_discord
  after insert on public.private_messages
  for each row execute function public.notify_discord_dm();
