-- Diagnóstico seguro do erro "Database error saving new user"

select
  t.tgname as trigger_name,
  case
    when (t.tgtype & 2) <> 0 then 'BEFORE'
    else 'AFTER'
  end as momento,
  pg_get_triggerdef(t.oid) as definicao
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'auth'
  and c.relname = 'users'
  and not t.tgisinternal
order by t.tgname;

select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
order by ordinal_position;
