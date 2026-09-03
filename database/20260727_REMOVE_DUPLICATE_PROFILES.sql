-- NEXO11 - remover perfis duplicados e impedir nova duplicação

begin;

-- Remove perfis que não pertencem mais a nenhuma conta do Auth.
delete from public.profiles p
where not exists (
  select 1
  from auth.users u
  where u.id = p.account_id
);

-- Mantém somente o perfil mais antigo de cada conta.
with ranked_profiles as (
  select
    id,
    row_number() over (
      partition by account_id
      order by created_at asc nulls last, id asc
    ) as position
  from public.profiles
)
delete from public.profiles p
using ranked_profiles r
where p.id = r.id
  and r.position > 1;

-- Impede definitivamente dois perfis para a mesma conta.
create unique index if not exists profiles_account_id_unique_idx
  on public.profiles (account_id);

commit;

notify pgrst, 'reload schema';

select
  (select count(*) from auth.users) as contas_auth,
  (select count(*) from public.profiles) as perfis,
  (
    select count(*)
    from (
      select account_id
      from public.profiles
      group by account_id
      having count(*) > 1
    ) duplicados
  ) as contas_com_perfil_duplicado;
