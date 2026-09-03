-- NEXO11 - correção definitiva do cadastro para o esquema real:
-- auth.users -> public.accounts -> public.profiles

begin;

-- Remove apenas os gatilhos incorretos/duplicados.
drop trigger if exists nexo_create_profile_after_signup on auth.users;
drop trigger if exists on_auth_user_created_account on auth.users;

-- Restaura o gatilho original que cria public.accounts primeiro.
create trigger on_auth_user_created_account
after insert on auth.users
for each row
execute function public.handle_new_account();

-- Repara contas Auth atuais que ainda não possuem public.accounts.
insert into public.accounts (id, email)
select u.id, u.email
from auth.users u
where not exists (
  select 1 from public.accounts a where a.id = u.id
);

-- Garante apenas um perfil para cada account.
create unique index if not exists profiles_account_id_unique_idx
  on public.profiles (account_id);

-- Repara perfis ausentes somente depois de accounts existir.
insert into public.profiles (
  account_id,
  nome,
  username,
  bio,
  role
)
select
  a.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data->>'nome'), ''),
    split_part(coalesce(u.email, 'Usuário NEXO'), '@', 1)
  ),
  'user_' || left(replace(u.id::text, '-', ''), 16),
  '',
  case
    when lower(coalesce(u.raw_user_meta_data->>'role', '')) in ('teacher', 'professor', 'docente')
      or lower(coalesce(u.email, '')) ~ '@enova\.educacao\.ba\.gov\.br$'
    then 'teacher'
    else 'student'
  end
from auth.users u
join public.accounts a on a.id = u.id
where not exists (
  select 1 from public.profiles p where p.account_id = a.id
);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
alter table public.profiles enable row level security;

drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all
  on public.profiles for select to authenticated using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check (account_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

commit;

notify pgrst, 'reload schema';

select
  (select count(*) from auth.users) as contas_auth,
  (select count(*) from public.accounts) as accounts,
  (select count(*) from public.profiles) as perfis,
  (
    select count(*)
    from auth.users u
    where not exists (select 1 from public.accounts a where a.id = u.id)
  ) as accounts_faltando,
  (
    select count(*)
    from auth.users u
    where not exists (select 1 from public.profiles p where p.account_id = u.id)
  ) as perfis_faltando;
