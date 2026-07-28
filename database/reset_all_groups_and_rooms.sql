-- ATENCAO: APAGA TODOS OS GRUPOS E SALAS EXISTENTES.
-- Conversas privadas e perfis nao sao apagados.

begin;

delete from public.nexo_groups;

do $$
begin
  if to_regclass('public.classrooms') is not null then
    execute 'delete from public.classrooms';
  end if;
end
$$;

commit;

notify pgrst,'reload schema';

select
  (select count(*) from public.nexo_groups) as grupos_restantes,
  case
    when to_regclass('public.classrooms') is null then 0
    else (select count(*) from public.classrooms)
  end as salas_restantes;
