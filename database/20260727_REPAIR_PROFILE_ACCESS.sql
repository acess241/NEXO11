-- NEXO11 - corrigir PGRST116 ao abrir perfis
-- Não apaga nem altera dados de usuários.

begin;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.profiles to authenticated;

alter table public.profiles enable row level security;

drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all
  on public.profiles
  for select
  to authenticated
  using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles
  for insert
  to authenticated
  with check (account_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own
  on public.profiles
  for delete
  to authenticated
  using (account_id = auth.uid());

commit;

notify pgrst, 'reload schema';

-- Os dois valores devem ser iguais.
select
  (select count(*) from auth.users) as contas_auth,
  (select count(*) from public.profiles) as perfis;
