-- NEXO11 - correção emergencial para liberar novos cadastros
-- O aplicativo cria o perfil após autenticar; o Auth não deve tentar
-- gravar em public.profiles durante a transação de criação da conta.

begin;

drop trigger if exists nexo_create_profile_after_signup on auth.users;
drop trigger if exists on_auth_user_created_account on auth.users;

commit;

-- Deve restar somente a validação de e-mail e-Nova.
select
  t.tgname as trigger_name
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'auth'
  and c.relname = 'users'
  and not t.tgisinternal
order by t.tgname;
