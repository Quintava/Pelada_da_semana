create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabelas de dados
-- ---------------------------------------------------------------------------

-- Mantida para que instalações antigas possam ser migradas automaticamente.
create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Preferências, jogadores, treinos e demais dados pequenos da conta.
create table if not exists public.user_core (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Existe no máximo uma partida ativa por conta.
create table if not exists public.user_active_matches (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

-- Uma linha para cada partida encerrada permite carregar o histórico por páginas.
create table if not exists public.user_matches (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  payload jsonb not null,
  finished_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Cada lance possui sua própria linha. Um evento novo não reenvia todo o histórico.
create table if not exists public.user_match_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  match_id text not null,
  id text not null,
  event_type text not null,
  player_id text,
  player_name text,
  assist_player_id text,
  assist_player_name text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, match_id, id)
);

-- Atualiza instalações antigas para aceitar também as penalidades individuais.
alter table public.user_match_events
  drop constraint if exists user_match_events_event_type_check;

alter table public.user_match_events
  add constraint user_match_events_event_type_check
  check (event_type in ('goal', 'sub', 'own_goal', 'missed_penalty'));

-- Configuração do Mural da Resenha compartilhado.
create table if not exists public.public_pages (
  user_id uuid primary key references auth.users(id) on delete cascade,
  slug text not null unique
    default lower(substr(encode(gen_random_bytes(12), 'hex'), 1, 12)),
  enabled boolean not null default false,
  title text not null default 'Resenha',
  updated_at timestamptz not null default now()
);

-- Próximas partidas exibidas no Mural.
create table if not exists public.upcoming_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 80),
  sport text not null default 'Futebol de Salão',
  scheduled_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 120),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Segurança por linha (RLS)
-- ---------------------------------------------------------------------------

alter table public.app_state enable row level security;
alter table public.user_core enable row level security;
alter table public.user_active_matches enable row level security;
alter table public.user_matches enable row level security;
alter table public.user_match_events enable row level security;
alter table public.public_pages enable row level security;
alter table public.upcoming_games enable row level security;

-- Visitantes não recebem acesso direto a nenhuma tabela.
revoke all on
  public.app_state,
  public.user_core,
  public.user_active_matches,
  public.user_matches,
  public.user_match_events,
  public.public_pages,
  public.upcoming_games
from anon;

-- Usuários autenticados usam as tabelas, mas as políticas abaixo limitam o user_id.
grant select, insert, update, delete on
  public.app_state,
  public.user_core,
  public.user_active_matches,
  public.user_matches,
  public.user_match_events,
  public.public_pages,
  public.upcoming_games
to authenticated;

drop policy if exists "app_state proprio" on public.app_state;
create policy "app_state proprio"
  on public.app_state
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "core proprio" on public.user_core;
create policy "core proprio"
  on public.user_core
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "partida ativa propria" on public.user_active_matches;
create policy "partida ativa propria"
  on public.user_active_matches
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "partidas proprias" on public.user_matches;
create policy "partidas proprias"
  on public.user_matches
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "eventos proprios" on public.user_match_events;
create policy "eventos proprios"
  on public.user_match_events
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "pagina publica propria" on public.public_pages;
create policy "pagina publica propria"
  on public.public_pages
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "agenda propria" on public.upcoming_games;
create policy "agenda propria"
  on public.upcoming_games
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Funções protegidas
-- ---------------------------------------------------------------------------

-- Cria ou atualiza o endereço compartilhável do usuário autenticado.
create or replace function public.ensure_public_page(
  page_title text default 'Resenha'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  page_row public.public_pages;
begin
  if auth.uid() is null then
    raise exception 'Login necessário';
  end if;

  insert into public_pages (user_id, title)
  values (
    auth.uid(),
    left(coalesce(nullif(trim(page_title), ''), 'Resenha'), 80)
  )
  on conflict (user_id)
  do update
    set title = excluded.title,
        updated_at = now()
  returning * into page_row;

  return to_jsonb(page_row);
end
$$;

-- A assinatura antiga precisa ser removida antes de criar a versão com filtro.
drop function if exists public.get_public_resenha(text, integer, integer);
drop function if exists public.get_public_resenha(text, integer, integer, text);

-- Consolida apenas os dados permitidos no Mural: ranking, agenda e resultados.
create function public.get_public_resenha(
  target_slug text,
  result_offset integer default 0,
  result_limit integer default 10,
  target_sport text default 'Futebol de Salão'
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with page as (
  select *
  from public_pages
  where slug = target_slug
    and enabled = true
  limit 1
),
matches as (
  select m.*
  from user_matches as m
  join page on page.user_id = m.user_id
  where (
    case
      when m.payload ->> 'sport' = 'Futsal' then 'Futebol de Salão'
      else coalesce(m.payload ->> 'sport', '')
    end
  ) = target_sport
),
roster as (
  select
    m.id as match_id,
    m.payload,
    player ->> 'id' as id,
    max(player ->> 'name') as name,
    (team_position - 1)::int as team_index
  from matches as m
  cross join lateral jsonb_array_elements(
    coalesce(m.payload -> 'teams', '[]'::jsonb)
    || coalesce(m.payload -> 'reserveTeams', '[]'::jsonb)
  ) with ordinality as team_data(team, team_position)
  cross join lateral jsonb_array_elements(
    coalesce(team -> 'starters', '[]'::jsonb)
    || coalesce(team -> 'bench', '[]'::jsonb)
  ) as player
  group by
    m.id,
    m.payload,
    player ->> 'id',
    team_position
),
performance as (
  select
    roster.match_id,
    roster.id,
    roster.name,
    count(event.id) filter (
      where event.event_type = 'goal'
        and event.player_id = roster.id
    )::int as goals,
    count(event.id) filter (
      where event.event_type = 'goal'
        and event.assist_player_id = roster.id
    )::int as assists,
    greatest(
      0,
      least(
        10,
        6
        + count(event.id) filter (
            where event.event_type = 'goal'
              and event.player_id = roster.id
          ) * case
            when target_sport in ('Futebol', 'Futebol Society', 'Futebol de Salão') then 0.8
            when target_sport = 'Vôlei' then 0.35
            when target_sport = 'Basquete' then 0.25
            else 0.5
          end
        + count(event.id) filter (
            where event.event_type = 'goal'
              and event.assist_player_id = roster.id
          ) * case
            when target_sport in ('Futebol', 'Futebol Society', 'Futebol de Salão') then 0.5
            else 0
          end
        - count(event.id) filter (
            where event.event_type = 'own_goal'
              and event.player_id = roster.id
          ) * 0.5
        - count(event.id) filter (
            where event.event_type = 'missed_penalty'
              and event.player_id = roster.id
          ) * 0.3
        + case
            when roster.team_index not in (0, 1) then 0
            when coalesce(
              (roster.payload -> 'score' ->> roster.team_index)::numeric,
              0
            ) > coalesce(
              (roster.payload -> 'score' ->> (1 - roster.team_index))::numeric,
              0
            ) then 0.4
            when coalesce(
              (roster.payload -> 'score' ->> roster.team_index)::numeric,
              0
            ) = coalesce(
              (roster.payload -> 'score' ->> (1 - roster.team_index))::numeric,
              0
            ) then 0.2
            else -0.2
          end
      )
    )::numeric as score
  from roster
  left join user_match_events as event
    on event.match_id = roster.match_id
   and event.user_id = (select user_id from page)
  group by
    roster.match_id,
    roster.id,
    roster.name,
    roster.payload,
    roster.team_index
),
ranking as (
  select
    id,
    max(name) as name,
    sum(goals)::int as goals,
    sum(assists)::int as assists,
    count(*)::int as games,
    round(avg(score), 1) as evaluation
  from performance
  group by id
)
select
  case
    when not exists (select 1 from page) then null
    else jsonb_build_object(
      'page',
      (
        select jsonb_build_object(
          'title', title,
          'slug', slug
        )
        from page
      ),
      'sport',
      target_sport,
      'ranking',
      coalesce(
        (
          select jsonb_agg(
            to_jsonb(ranked)
            order by
              ranked.evaluation desc,
              ranked.goals desc,
              ranked.assists desc,
              ranked.name
          )
          from ranking as ranked
        ),
        '[]'::jsonb
      ),
      'upcoming',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', game.id,
              'title', game.title,
              'sport', game.sport,
              'scheduled_at', game.scheduled_at,
              'location', game.location
            )
            order by game.scheduled_at
          )
          from upcoming_games as game
          join page on page.user_id = game.user_id
          where game.scheduled_at >= now()
        ),
        '[]'::jsonb
      ),
      'results',
      coalesce(
        (
          select jsonb_agg(result.payload order by result.finished_at desc)
          from (
            select
              m.payload,
              m.finished_at
            from matches as m
            order by m.finished_at desc
            offset greatest(result_offset, 0)
            limit least(greatest(result_limit, 1), 20)
          ) as result
        ),
        '[]'::jsonb
      ),
      'has_more',
      (
        select count(*) >
          greatest(result_offset, 0)
          + least(greatest(result_limit, 1), 20)
        from matches
      )
    )
  end
$$;

-- A função administrativa exige login.
revoke execute on function public.ensure_public_page(text) from public, anon;
grant execute on function public.ensure_public_page(text) to authenticated;

-- O visitante acessa somente o resultado consolidado da função, nunca as tabelas.
revoke execute on function public.get_public_resenha(
  text,
  integer,
  integer,
  text
) from public;

grant execute on function public.get_public_resenha(
  text,
  integer,
  integer,
  text
) to anon, authenticated;
