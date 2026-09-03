-- NEXO11 - correção final: Auth e perfil sempre sincronizados

begin;

-- Garante uma linha por conta.
create unique index if not exists profiles_account_id_unique_idx
  on public.profiles (account_id);

create or replace function public.nexo_create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
begin
  v_role := case
    when lower(coalesce(new.raw_user_meta_data->>'role', '')) in ('teacher', 'professor', 'docente')
      or lower(coalesce(new.email, '')) ~ '@enova\.educacao\.ba\.gov\.br$'
    then 'teacher'
    else 'student'
  end;

  insert into public.profiles (account_id, nome, username, bio, role)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'nome'), ''),
      split_part(coalesce(new.email, 'Usuário NEXO'), '@', 1)
    ),
    'user_' || left(replace(new.id::text, '-', ''), 16),
    '',
    v_role
  )
  on conflict (account_id) do nothing;

  return new;
exception
  when others then
    -- Uma falha no perfil nunca pode cancelar a criação da conta Auth.
    raise warning 'NEXO11 profile trigger: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists nexo_create_profile_after_signup on auth.users;
drop trigger if exists on_auth_user_created_account on auth.users;

create trigger nexo_create_profile_after_signup
after insert on auth.users
for each row
execute function public.nexo_create_profile_for_auth_user();

-- Repara imediatamente todas as contas atuais sem perfil.
insert into public.profiles (account_id, nome, username, bio, role)
select
  u.id,
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
where not exists (
  select 1 from public.profiles p where p.account_id = u.id
)
on conflict (account_id) do nothing;

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
  (select count(*) from public.profiles) as perfis,
  (
    select count(*)
    from auth.users u
    where not exists (
      select 1 from public.profiles p where p.account_id = u.id
    )
  ) as perfis_faltando;
