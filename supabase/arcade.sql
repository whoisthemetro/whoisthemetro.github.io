-- ============================================================
-- THE METRO — arcade high scores
-- Run once: SQL Editor → paste → Run. (Nothing to edit.)
-- Shared all-time leaderboard, shown on the arcade wall.
-- ============================================================

create table if not exists public.scores (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  game        text not null check (game in ('defender', 'doom', 'tron', 'pong')),
  name        text check (name is null or char_length(name) <= 24),
  score       integer not null check (score > 0 and score < 10000000)
);
create index if not exists scores_game_score on public.scores (game, score desc);

alter table public.scores enable row level security;

drop policy if exists "anyone can read scores" on public.scores;
create policy "anyone can read scores"
  on public.scores for select using (true);

drop policy if exists "anyone can post a score" on public.scores;
create policy "anyone can post a score"
  on public.scores for insert with check (true);

create or replace function public.scores_guard()
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
   where ip = 'score:' || v_ip and at > now() - interval '5 minutes';
  if v_recent >= 6 then
    raise exception 'rate limit: scores';
  end if;
  insert into private.post_log (ip) values ('score:' || v_ip);
  -- keep the table tidy: only the top 200 per game survive
  delete from public.scores s
   where s.game = new.game
     and s.id in (
       select id from public.scores where game = new.game
       order by score desc offset 200);
  return new;
end;
$$;

drop trigger if exists scores_guard on public.scores;
create trigger scores_guard
  before insert on public.scores
  for each row execute function public.scores_guard();

do $$
begin
  alter publication supabase_realtime add table public.scores;
exception when duplicate_object then
  null;
end;
$$;
