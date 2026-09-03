-- NEXO11 - corrigir "Database error saving new user"
-- Remove somente o gatilho legado que tenta criar um segundo perfil.

begin;

drop trigger if exists on_auth_user_created_account on auth.users;

commit;

-- Devem permanecer apenas:
-- enforce_enova_email_before_signup
-- nexo_create_profile_after_signup
select
  t.tgname as trigger_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'auth'
  and c.relname = 'users'
  and not t.tgisinternal
order by t.tgname;
