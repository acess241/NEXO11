select
  'FUNCAO_TRIGGER' as tipo,
  n.nspname || '.' || p.proname as detalhe
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prorettype = 'trigger'::regtype
  and (
    lower(pg_get_functiondef(p.oid)) like '%public.accounts%'
    or lower(pg_get_functiondef(p.oid)) like '%insert into accounts%'
  )

union all

select
  'COLUNA_ACCOUNTS' as tipo,
  column_name || ' | ' || data_type || ' | nullable=' || is_nullable ||
  ' | default=' || coalesce(column_default, 'NULL') as detalhe
from information_schema.columns
where table_schema = 'public'
  and table_name = 'accounts'

order by tipo desc, detalhe;
