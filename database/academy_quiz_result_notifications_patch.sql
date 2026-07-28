-- Patch: resultado do quiz diario com notificacao de ganho/perda e motivo.
-- Rode este SQL apos os scripts da Academia/Quiz ja existentes.

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'notifications'
  ) then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notifications'
        and column_name = 'xp_delta'
    ) then
      alter table public.notifications add column xp_delta integer;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notifications'
        and column_name = 'xp_reason'
    ) then
      alter table public.notifications add column xp_reason text;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notifications'
        and column_name = 'metadata'
    ) then
      alter table public.notifications add column metadata jsonb;
    end if;
  end if;
end $$;

drop function if exists public.academy_submit_pet_daily_quiz(uuid, jsonb);

create or replace function public.academy_submit_pet_daily_quiz(
  p_attempt_id uuid,
  p_answers jsonb
)
returns table (
  attempt_id uuid,
  passed boolean,
  correct_count integer,
  total_questions integer,
  failed_questions integer,
  score_percent numeric,
  pass_score_percent numeric,
  result_reason text,
  task_id uuid,
  pet_pair_id uuid,
  challenge_date date,
  activity_id uuid,
  activity_title text,
  activity_description text,
  activity_xp integer,
  challenge_scope text,
  pet_name text,
  pet_life_days integer,
  pet_status text,
  completed_total integer,
  completed_by_me boolean,
  duo_completed boolean,
  milestone_awarded boolean,
  milestone_days integer,
  my_xp_total integer,
  my_level integer
)
language plpgsql
security definer
set search_path = public
as $academy_submit_pet_daily_quiz$
declare
  v_me uuid;
  v_attempt public.chat_pet_quiz_attempts%rowtype;
  v_total integer := 0;
  v_answered integer := 0;
  v_correct integer := 0;
  v_failed integer := 0;
  v_score numeric(5,2) := 0;
  v_passed boolean := false;
  v_reason text := '';
  v_result record;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  select *
  into v_attempt
  from public.chat_pet_quiz_attempts a
  where a.id = p_attempt_id
    and a.profile_id = v_me
  for update;

  if not found then
    raise exception 'Tentativa de quiz nao encontrada';
  end if;

  if v_attempt.submitted_at is not null then
    raise exception 'Este quiz ja foi enviado';
  end if;

  with incoming as (
    select
      x.question_id,
      upper(btrim(x.selected_option)) as selected_option
    from jsonb_to_recordset(coalesce(p_answers, '[]'::jsonb)) as x(question_id uuid, selected_option text)
  ),
  graded as (
    select
      i.id as item_id,
      coalesce(inp.selected_option, '') as selected_option,
      q.correct_option,
      (coalesce(inp.selected_option, '') = q.correct_option) as is_correct
    from public.chat_pet_quiz_attempt_items i
    join public.academy_quiz_questions q on q.id = i.quiz_question_id
    left join incoming inp on inp.question_id = i.quiz_question_id
    where i.attempt_id = v_attempt.id
  )
  update public.chat_pet_quiz_attempt_items i
  set
    selected_option = nullif(g.selected_option, ''),
    is_correct = case
      when g.selected_option = '' then null
      else g.is_correct
    end
  from graded g
  where i.id = g.item_id;

  select
    count(*)::int,
    count(*) filter (where i.selected_option is not null)::int,
    count(*) filter (where i.is_correct is true)::int
  into
    v_total,
    v_answered,
    v_correct
  from public.chat_pet_quiz_attempt_items i
  where i.attempt_id = v_attempt.id;

  if v_total = 0 then
    raise exception 'Quiz sem perguntas cadastradas';
  end if;

  if v_answered < v_total then
    raise exception 'Responda todas as perguntas antes de enviar';
  end if;

  v_score := round((v_correct::numeric / v_total::numeric) * 100, 2);
  v_passed := v_score >= coalesce(v_attempt.pass_score_percent, 60.00);
  v_failed := greatest(v_total - v_correct, 0);

  if v_passed then
    v_reason := format(
      'Meta de %s%% atingida (%s/%s acertos).',
      coalesce(v_attempt.pass_score_percent, 60.00),
      v_correct,
      v_total
    );
  else
    v_reason := format(
      'Meta de %s%% nao atingida. Voce perdeu %s questao(oes).',
      coalesce(v_attempt.pass_score_percent, 60.00),
      v_failed
    );
  end if;

  update public.chat_pet_quiz_attempts a
  set
    correct_count = v_correct,
    score_percent = v_score,
    passed = v_passed,
    submitted_at = timezone('utc', now())
  where a.id = v_attempt.id;

  insert into public.notifications (
    receiver_profile_id,
    actor_profile_id,
    type,
    xp_reason,
    metadata
  )
  values (
    v_me,
    v_me,
    'message',
    v_reason,
    jsonb_build_object(
      'kind', 'quiz_result',
      'passed', v_passed,
      'correct_count', v_correct,
      'total_questions', v_total,
      'failed_questions', v_failed,
      'score_percent', v_score,
      'pass_score_percent', coalesce(v_attempt.pass_score_percent, 60.00),
      'reason', v_reason,
      'attempt_id', v_attempt.id,
      'challenge_date', v_attempt.challenge_date
    )
  );

  if v_passed then
    select *
    into v_result
    from public.academy_complete_pet_daily_task(v_attempt.conversation_id, v_attempt.challenge_date)
    limit 1;

    return query
    select
      v_attempt.id,
      true,
      v_correct,
      v_total,
      v_failed,
      v_score,
      v_attempt.pass_score_percent,
      v_reason,
      v_result.task_id,
      v_result.pet_pair_id,
      v_result.challenge_date,
      v_result.activity_id,
      v_result.activity_title,
      v_result.activity_description,
      v_result.activity_xp,
      v_result.challenge_scope,
      v_result.pet_name,
      v_result.pet_life_days,
      v_result.pet_status,
      v_result.completed_total,
      v_result.completed_by_me,
      v_result.duo_completed,
      v_result.milestone_awarded,
      v_result.milestone_days,
      v_result.my_xp_total,
      v_result.my_level;
    return;
  end if;

  return query
  select
    v_attempt.id,
    false,
    v_correct,
    v_total,
    v_failed,
    v_score,
    v_attempt.pass_score_percent,
    v_reason,
    null::uuid,
    null::uuid,
    v_attempt.challenge_date,
    null::uuid,
    null::text,
    null::text,
    null::integer,
    null::text,
    null::text,
    null::integer,
    null::text,
    null::integer,
    false,
    false,
    false,
    null::integer,
    null::integer,
    null::integer;
end;
$academy_submit_pet_daily_quiz$;

grant execute on function public.academy_submit_pet_daily_quiz(uuid, jsonb) to authenticated;
