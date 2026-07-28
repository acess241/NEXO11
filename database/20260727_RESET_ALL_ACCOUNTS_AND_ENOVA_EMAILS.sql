-- ============================================================
-- ATENÇÃO: RESET DESTRUTIVO E IRREVERSÍVEL DE TODAS AS CONTAS
-- ============================================================
-- Execute uma única vez no SQL Editor do Supabase.
-- O TRUNCATE CASCADE remove profiles e todo conteúdo dependente
-- (mensagens, grupos, pets, atividades, XP, posts e solicitações).
-- Depois remove todos os usuários do Supabase Auth.

begin;

truncate table public.profiles cascade;
delete from auth.users;

-- A regra é aplicada no Auth, não apenas no formulário do aplicativo.
create or replace function public.validate_enova_auth_email()
returns trigger
language plpgsql
security definer
set search_path=public,auth
as $$
declare
  v_email text:=lower(trim(coalesce(new.email,'')));
  v_role text:=lower(trim(coalesce(new.raw_user_meta_data->>'role','student')));
begin
  if v_role in ('teacher','professor','docente') then
    if v_email !~ '^[^@[:space:]]+@enova\.educacao\.ba\.gov\.br$' then
      raise exception 'Professor deve usar email @enova.educacao.ba.gov.br';
    end if;
  else
    if v_email !~ '^[^@[:space:]]+@aluno\.enova\.educacao\.ba\.gov\.br$' then
      raise exception 'Aluno deve usar email @aluno.enova.educacao.ba.gov.br';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists enforce_enova_email_before_signup on auth.users;
create trigger enforce_enova_email_before_signup
before insert or update of email,raw_user_meta_data on auth.users
for each row execute function public.validate_enova_auth_email();

commit;

-- Verificação: os dois valores devem retornar 0.
select
  (select count(*) from auth.users) as contas_auth,
  (select count(*) from public.profiles) as perfis;

