select
  (select count(*) from auth.users) as contas_auth,
  (select count(*) from public.profiles) as perfis,
  (
    select count(*)
    from auth.users u
    where not exists (
      select 1 from public.profiles p where p.account_id = u.id
    )
  ) as contas_sem_perfil,
  (
    select count(*)
    from public.profiles p
    where not exists (
      select 1 from auth.users u where u.id = p.account_id
    )
  ) as perfis_orfaos;
