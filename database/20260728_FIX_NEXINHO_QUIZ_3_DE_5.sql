-- CORRECAO DEFINITIVA DO QUIZ DO NEXINHO
-- Regra oficial: 3 acertos em 5 perguntas (60%) aprovam o usuario.
-- Este patch tambem corrige tentativas ainda abertas e impede que scripts
-- antigos voltem a gravar a meta incorreta de 70%.

begin;

alter table public.chat_pet_quiz_attempts
  alter column pass_score_percent set default 60.00;

update public.chat_pet_quiz_attempts
set pass_score_percent = 60.00
where submitted_at is null
   or pass_score_percent is distinct from 60.00;

create or replace function public.nexinho_force_quiz_pass_score()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.pass_score_percent := 60.00;
  return new;
end;
$$;

drop trigger if exists nexinho_force_quiz_pass_score
  on public.chat_pet_quiz_attempts;

create trigger nexinho_force_quiz_pass_score
before insert or update of pass_score_percent
on public.chat_pet_quiz_attempts
for each row
execute function public.nexinho_force_quiz_pass_score();

-- Tentativas antigas com 3/5 ou mais que ficaram como reprovadas por causa
-- da meta errada de 70% podem ser refeitas normalmente.
update public.chat_pet_quiz_attempts
set
  submitted_at = null,
  passed = null,
  score_percent = null,
  correct_count = null,
  pass_score_percent = 60.00
where passed is false
  and total_questions > 0
  and coalesce(correct_count, 0) >= ceil(total_questions * 0.60);

update public.chat_pet_quiz_attempt_items i
set
  selected_option = null,
  is_correct = null
where exists (
  select 1
  from public.chat_pet_quiz_attempts a
  where a.id = i.attempt_id
    and a.submitted_at is null
    and a.passed is null
);

grant execute on function public.nexinho_force_quiz_pass_score() to authenticated;

commit;

-- Verificacao: deve retornar 60.00.
select column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'chat_pet_quiz_attempts'
  and column_name = 'pass_score_percent';
