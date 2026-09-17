create table if not exists public.app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

grant select, insert, update, delete on public.app_state to authenticated;

drop policy if exists "Usuario le os proprios dados" on public.app_state;
create policy "Usuario le os proprios dados"
on public.app_state for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Usuario cria os proprios dados" on public.app_state;
create policy "Usuario cria os proprios dados"
on public.app_state for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Usuario altera os proprios dados" on public.app_state;
create policy "Usuario altera os proprios dados"
on public.app_state for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Usuario exclui os proprios dados" on public.app_state;
create policy "Usuario exclui os proprios dados"
on public.app_state for delete
to authenticated
using ((select auth.uid()) = user_id);
