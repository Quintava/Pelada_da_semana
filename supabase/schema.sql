create extension if not exists pgcrypto;

-- Tabela legada mantida apenas para a migração automática da versão anterior.
create table if not exists public.app_state (user_id uuid primary key references auth.users(id) on delete cascade, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
alter table public.app_state enable row level security;
revoke all on table public.app_state from anon;
grant select, insert, update, delete on public.app_state to authenticated;
drop policy if exists "Usuario le os proprios dados" on public.app_state;
create policy "Usuario le os proprios dados" on public.app_state for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Usuario cria os proprios dados" on public.app_state;
create policy "Usuario cria os proprios dados" on public.app_state for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Usuario altera os proprios dados" on public.app_state;
create policy "Usuario altera os proprios dados" on public.app_state for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Usuario exclui os proprios dados" on public.app_state;
create policy "Usuario exclui os proprios dados" on public.app_state for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.profiles (user_id uuid primary key references auth.users(id) on delete cascade, display_name text not null default '', updated_at timestamptz not null default now());
create table if not exists public.groups (id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade, name text not null check (char_length(name) between 1 and 60), invite_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8)), public_slug text not null unique default lower(substr(encode(gen_random_bytes(12), 'hex'), 1, 12)), is_public boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.group_members (group_id uuid not null references public.groups(id) on delete cascade, user_id uuid not null references auth.users(id) on delete cascade, role text not null default 'viewer' check (role in ('admin','scorekeeper','viewer')), joined_at timestamptz not null default now(), primary key (group_id,user_id));
create table if not exists public.group_settings (group_id uuid primary key references public.groups(id) on delete cascade, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table if not exists public.players (id text not null, group_id uuid not null references public.groups(id) on delete cascade, name text not null check (char_length(name) between 1 and 60), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key (group_id,id));
create table if not exists public.matches (id text not null, group_id uuid not null references public.groups(id) on delete cascade, payload jsonb not null, finished_at timestamptz not null default now(), updated_at timestamptz not null default now(), primary key (group_id,id));
create table if not exists public.active_matches (group_id uuid primary key references public.groups(id) on delete cascade, payload jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.training_plans (user_id uuid not null references auth.users(id) on delete cascade, id text not null, payload jsonb not null, updated_at timestamptz not null default now(), primary key (user_id,id));
create table if not exists public.training_sessions (user_id uuid not null references auth.users(id) on delete cascade, id text not null, payload jsonb not null, finished_at timestamptz not null default now(), primary key (user_id,id));
create table if not exists public.active_trainings (user_id uuid primary key references auth.users(id) on delete cascade, payload jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.attendance_sessions (id uuid primary key default gen_random_uuid(), group_id uuid not null references public.groups(id) on delete cascade, token text not null unique default lower(encode(gen_random_bytes(16),'hex')), game_date date not null default current_date, title text not null default 'Próximo jogo', open boolean not null default true, created_by uuid not null references auth.users(id) on delete cascade, created_at timestamptz not null default now());
create table if not exists public.attendance_responses (session_id uuid not null references public.attendance_sessions(id) on delete cascade, player_id text not null, player_name text not null, present boolean not null default true, updated_at timestamptz not null default now(), primary key (session_id,player_id));

create or replace function public.is_group_member(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from group_members where group_id=target_group and user_id=auth.uid()) $$;
create or replace function public.group_role(target_group uuid) returns text language sql stable security definer set search_path=public as $$ select role from group_members where group_id=target_group and user_id=auth.uid() $$;
create or replace function public.can_manage_group(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.group_role(target_group)='admin',false) $$;
create or replace function public.can_score_group(target_group uuid) returns boolean language sql stable security definer set search_path=public as $$ select coalesce(public.group_role(target_group) in ('admin','scorekeeper'),false) $$;

create or replace function public.create_group(group_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare new_id uuid; begin
  if auth.uid() is null then raise exception 'Login necessário'; end if;
  insert into groups(owner_id,name) values(auth.uid(),left(trim(group_name),60)) returning id into new_id;
  insert into group_members(group_id,user_id,role) values(new_id,auth.uid(),'admin');
  insert into group_settings(group_id,data) values(new_id,'{}'::jsonb);
  return new_id;
end $$;

create or replace function public.ensure_default_group(group_name text default 'Minha resenha') returns uuid language plpgsql security definer set search_path=public as $$
declare existing_id uuid; begin
  select group_id into existing_id from group_members where user_id=auth.uid() order by joined_at limit 1;
  if existing_id is not null then return existing_id; end if;
  return public.create_group(group_name);
end $$;

create or replace function public.join_group(code text) returns uuid language plpgsql security definer set search_path=public as $$
declare target_id uuid; begin
  select id into target_id from groups where invite_code=upper(trim(code));
  if target_id is null then raise exception 'Código de convite inválido'; end if;
  insert into group_members(group_id,user_id,role) values(target_id,auth.uid(),'viewer') on conflict do nothing;
  return target_id;
end $$;

create or replace function public.create_attendance_link(target_group uuid,target_date date,target_title text) returns text language plpgsql security definer set search_path=public as $$
declare new_token text; begin
  if not public.can_score_group(target_group) then raise exception 'Sem permissão'; end if;
  insert into attendance_sessions(group_id,game_date,title,created_by) values(target_group,target_date,left(coalesce(nullif(trim(target_title),''),'Próximo jogo'),80),auth.uid()) returning token into new_token;
  return new_token;
end $$;

create or replace function public.get_attendance_by_token(target_token text) returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object('session',jsonb_build_object('id',s.id,'title',s.title,'game_date',s.game_date,'open',s.open,'group_name',g.name),'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'responded',r.player_id is not null,'present',coalesce(r.present,false)) order by p.name) from players p left join attendance_responses r on r.session_id=s.id and r.player_id=p.id where p.group_id=s.group_id),'[]'::jsonb)) from attendance_sessions s join groups g on g.id=s.group_id where s.token=target_token and s.open=true limit 1
$$;

create or replace function public.respond_attendance(target_token text,target_player text,target_present boolean) returns boolean language plpgsql security definer set search_path=public as $$
declare target_session uuid; target_name text; begin
  select s.id,p.name into target_session,target_name from attendance_sessions s join players p on p.group_id=s.group_id where s.token=target_token and s.open=true and p.id=target_player;
  if target_session is null then return false; end if;
  insert into attendance_responses(session_id,player_id,player_name,present) values(target_session,target_player,target_name,target_present) on conflict(session_id,player_id) do update set present=excluded.present,updated_at=now();
  return true;
end $$;

alter table profiles enable row level security; alter table groups enable row level security; alter table group_members enable row level security; alter table group_settings enable row level security; alter table players enable row level security; alter table matches enable row level security; alter table active_matches enable row level security; alter table training_plans enable row level security; alter table training_sessions enable row level security; alter table active_trainings enable row level security; alter table attendance_sessions enable row level security; alter table attendance_responses enable row level security;
revoke all on profiles,groups,group_members,group_settings,players,matches,active_matches,training_plans,training_sessions,active_trainings,attendance_sessions,attendance_responses from anon;
grant select,insert,update,delete on profiles,groups,group_members,group_settings,players,matches,active_matches,training_plans,training_sessions,active_trainings,attendance_sessions,attendance_responses to authenticated;
revoke execute on function public.create_group(text),public.ensure_default_group(text),public.join_group(text),public.create_attendance_link(uuid,date,text) from public,anon;
revoke execute on function public.get_attendance_by_token(text),public.respond_attendance(text,text,boolean) from public;
grant execute on function public.create_group(text),public.ensure_default_group(text),public.join_group(text),public.create_attendance_link(uuid,date,text) to authenticated;
grant execute on function public.get_attendance_by_token(text),public.respond_attendance(text,text,boolean) to anon,authenticated;

drop policy if exists "Perfil proprio" on profiles;
drop policy if exists "Perfis visiveis" on profiles; create policy "Perfis visiveis" on profiles for select to authenticated using(user_id=auth.uid() or exists(select 1 from group_members mine join group_members theirs on theirs.group_id=mine.group_id where mine.user_id=auth.uid() and theirs.user_id=profiles.user_id));
drop policy if exists "Perfil criado" on profiles; create policy "Perfil criado" on profiles for insert to authenticated with check(user_id=auth.uid());
drop policy if exists "Perfil alterado" on profiles; create policy "Perfil alterado" on profiles for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "Perfil excluido" on profiles; create policy "Perfil excluido" on profiles for delete to authenticated using(user_id=auth.uid());
drop policy if exists "Grupos visiveis" on groups; create policy "Grupos visiveis" on groups for select to authenticated using(public.is_group_member(id) or is_public);
drop policy if exists "Grupo atualizado por admin" on groups; create policy "Grupo atualizado por admin" on groups for update to authenticated using(public.can_manage_group(id)) with check(public.can_manage_group(id));
drop policy if exists "Grupo excluido pelo dono" on groups; create policy "Grupo excluido pelo dono" on groups for delete to authenticated using(owner_id=auth.uid());
drop policy if exists "Membros visiveis" on group_members; create policy "Membros visiveis" on group_members for select to authenticated using(public.is_group_member(group_id));
drop policy if exists "Membros atualizados" on group_members; create policy "Membros atualizados" on group_members for update to authenticated using(public.can_manage_group(group_id) and user_id<>(select g.owner_id from groups g where g.id=group_members.group_id)) with check(public.can_manage_group(group_id) and user_id<>(select g.owner_id from groups g where g.id=group_members.group_id));
drop policy if exists "Membros removidos" on group_members; create policy "Membros removidos" on group_members for delete to authenticated using((user_id=auth.uid() or public.can_manage_group(group_id)) and user_id<>(select g.owner_id from groups g where g.id=group_members.group_id));
drop policy if exists "Config lida" on group_settings; create policy "Config lida" on group_settings for select to authenticated using(public.is_group_member(group_id));
drop policy if exists "Config alterada" on group_settings; create policy "Config alterada" on group_settings for all to authenticated using(public.can_score_group(group_id)) with check(public.can_score_group(group_id));
drop policy if exists "Jogadores lidos" on players; create policy "Jogadores lidos" on players for select to authenticated using(public.is_group_member(group_id) or exists(select 1 from groups g where g.id=group_id and g.is_public));
drop policy if exists "Jogadores geridos" on players; create policy "Jogadores geridos" on players for all to authenticated using(public.can_manage_group(group_id)) with check(public.can_manage_group(group_id));
drop policy if exists "Partidas lidas" on matches; create policy "Partidas lidas" on matches for select to authenticated using(public.is_group_member(group_id) or exists(select 1 from groups g where g.id=group_id and g.is_public));
drop policy if exists "Partidas geridas" on matches; create policy "Partidas geridas" on matches for all to authenticated using(public.can_score_group(group_id)) with check(public.can_score_group(group_id));
drop policy if exists "Partida ativa lida" on active_matches; create policy "Partida ativa lida" on active_matches for select to authenticated using(public.is_group_member(group_id));
drop policy if exists "Partida ativa gerida" on active_matches; create policy "Partida ativa gerida" on active_matches for all to authenticated using(public.can_score_group(group_id)) with check(public.can_score_group(group_id));
drop policy if exists "Treinos proprios" on training_plans; create policy "Treinos proprios" on training_plans for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "Sessoes proprias" on training_sessions; create policy "Sessoes proprias" on training_sessions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "Treino ativo proprio" on active_trainings; create policy "Treino ativo proprio" on active_trainings for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
drop policy if exists "Presencas vistas" on attendance_sessions; create policy "Presencas vistas" on attendance_sessions for select to authenticated using(public.is_group_member(group_id));
drop policy if exists "Presencas geridas" on attendance_sessions; create policy "Presencas geridas" on attendance_sessions for all to authenticated using(public.can_score_group(group_id)) with check(public.can_score_group(group_id));
drop policy if exists "Respostas vistas" on attendance_responses; create policy "Respostas vistas" on attendance_responses for select to authenticated using(exists(select 1 from attendance_sessions s where s.id=session_id and public.is_group_member(s.group_id)));

grant select on groups,players,matches to anon;
drop policy if exists "Grupo publico" on groups; create policy "Grupo publico" on groups for select to anon using(is_public=true);
drop policy if exists "Jogadores publicos" on players; create policy "Jogadores publicos" on players for select to anon using(exists(select 1 from groups g where g.id=group_id and g.is_public));
drop policy if exists "Partidas publicas" on matches; create policy "Partidas publicas" on matches for select to anon using(exists(select 1 from groups g where g.id=group_id and g.is_public));
