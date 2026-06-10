-- ============================================================
-- THE METRO — echoes + the cat
--
-- Run once: Supabase Dashboard → SQL Editor → paste → Run.
-- (Nothing to edit in this one.)
--
-- What this sets up:
--   · echoes  — anonymous movement trails of past visitors,
--               replayed as faint ghosts in the room. Capped at
--               the most recent 400; rate limited per visitor.
--   · the cat — a shared pet counter. pet_cat() bumps it.
-- ============================================================

-- ---------- echoes ----------
create table if not exists public.echoes (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  color       text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  path        jsonb not null,
  constraint echo_size check (pg_column_size(path) between 40 and 24000)
);

alter table public.echoes enable row level security;

drop policy if exists "anyone can see echoes" on public.echoes;
create policy "anyone can see echoes"
  on public.echoes for select using (true);

drop policy if exists "anyone can leave an echo" on public.echoes;
create policy "anyone can leave an echo"
  on public.echoes for insert with check (true);

-- no update/delete for visitors, same as the wall.

create or replace function public.echoes_guard()
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
    v_ip := coalesce(
      current_setting('request.headers', true)::json ->> 'x-real-ip',
      'unknown');
  exception when others then
    v_ip := 'unknown';
  end;

  select count(*) into v_recent
    from private.post_log
   where ip = 'echo:' || v_ip and at > now() - interval '5 minutes';
  if v_recent >= 3 then
    raise exception 'rate limit: echoes';
  end if;
  insert into private.post_log (ip) values ('echo:' || v_ip);

  -- keep only the most recent 400 trails
  delete from public.echoes
   where id in (select id from public.echoes order by created_at desc offset 400);

  return new;
end;
$$;

drop trigger if exists echoes_guard on public.echoes;
create trigger echoes_guard
  before insert on public.echoes
  for each row execute function public.echoes_guard();

-- ---------- the cat ----------
create table if not exists private.cat (
  id   int primary key default 1 check (id = 1),
  pets bigint not null default 0
);
insert into private.cat (id) values (1) on conflict (id) do nothing;

create or replace function public.pet_cat()
returns bigint
language sql
security definer
set search_path = ''
as $$
  update private.cat set pets = pets + 1 where id = 1 returning pets;
$$;
