-- Reset global do progresso do desafio diário (dia local America/Bahia).
-- Use quando quiser liberar novamente o desafio para todo mundo no dia atual.

do $$
declare
  v_day date := (timezone('America/Bahia', now()))::date;
begin
  if to_regclass('public.chat_pet_quiz_attempt_items') is not null
     and to_regclass('public.chat_pet_quiz_attempts') is not null then
    delete from public.chat_pet_quiz_attempt_items i
    using public.chat_pet_quiz_attempts a
    where i.attempt_id = a.id
      and a.challenge_date = v_day;

    delete from public.chat_pet_quiz_attempts
    where challenge_date = v_day;
  end if;

  if to_regclass('public.chat_pet_daily_completions') is not null then
    delete from public.chat_pet_daily_completions
    where challenge_date = v_day;
  end if;

  if to_regclass('public.chat_pet_daily_tasks') is not null then
    update public.chat_pet_daily_tasks
    set duo_completed_at = null
    where challenge_date = v_day;
  end if;
end
$$;

