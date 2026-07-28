create extension if not exists pgcrypto;

create table if not exists public.academy_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  subject_name text not null,
  challenge_scope text not null check (challenge_scope in ('base', 'course')),
  course_area text,
  prompt text not null,
  option_a text not null,
  option_b text not null,
  option_c text not null,
  option_d text not null,
  correct_option text not null check (correct_option in ('A', 'B', 'C', 'D')),
  explanation text,
  difficulty smallint not null default 1 check (difficulty between 1 and 5),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists academy_quiz_questions_subject_idx
  on public.academy_quiz_questions (subject_name, challenge_scope, course_area, is_active);

create index if not exists academy_quiz_questions_prompt_idx
  on public.academy_quiz_questions (prompt);

create table if not exists public.chat_pet_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.chat_pet_daily_tasks (id) on delete cascade,
  pet_pair_id uuid not null references public.chat_pet_pairs (id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  challenge_date date not null,
  subject_name text not null,
  total_questions integer not null default 5 check (total_questions > 0),
  correct_count integer,
  score_percent numeric(5,2),
  pass_score_percent numeric(5,2) not null default 60.00,
  passed boolean,
  started_at timestamptz not null default timezone('utc', now()),
  submitted_at timestamptz
);

create index if not exists chat_pet_quiz_attempts_profile_idx
  on public.chat_pet_quiz_attempts (profile_id, started_at desc);

create index if not exists chat_pet_quiz_attempts_task_idx
  on public.chat_pet_quiz_attempts (task_id, profile_id);

create table if not exists public.chat_pet_quiz_attempt_items (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.chat_pet_quiz_attempts (id) on delete cascade,
  task_id uuid not null references public.chat_pet_daily_tasks (id) on delete cascade,
  quiz_question_id uuid not null references public.academy_quiz_questions (id) on delete restrict,
  display_order smallint not null check (display_order > 0),
  selected_option text check (selected_option in ('A', 'B', 'C', 'D')),
  is_correct boolean,
  created_at timestamptz not null default timezone('utc', now()),
  unique (attempt_id, display_order),
  unique (attempt_id, quiz_question_id)
);

create index if not exists chat_pet_quiz_items_attempt_idx
  on public.chat_pet_quiz_attempt_items (attempt_id);

create index if not exists chat_pet_quiz_items_question_idx
  on public.chat_pet_quiz_attempt_items (quiz_question_id);

create or replace function public.academy_complete_pet_daily_task(
  p_conversation_id uuid,
  p_challenge_date date default current_date
)
returns table (
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
as $academy_complete_pet_daily_task$
declare
  v_me uuid;
  v_task record;
  v_rows integer := 0;
  v_completed_total integer := 0;
  v_duo_just_completed boolean := false;
  v_life_days integer := 0;
  v_milestone boolean := false;
  v_milestone_days integer := null;
  v_my_xp integer := 0;
  v_my_level integer := 1;
  v_conversa public.chat_conversations%rowtype;
  v_state record;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_chat_participant(p_conversation_id, v_me) then
    raise exception 'Usuario sem acesso a esta conversa';
  end if;

  select *
  into v_task
  from public.academy_ensure_pet_daily_task(p_conversation_id, p_challenge_date)
  limit 1;

  insert into public.chat_pet_daily_completions as c (
    task_id,
    pet_pair_id,
    challenge_date,
    profile_id
  )
  values (
    v_task.task_id,
    v_task.pet_pair_id,
    v_task.challenge_date,
    v_me
  )
  on conflict do nothing;

  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    perform public.academy_add_xp(
      v_me,
      v_task.activity_xp,
      'Atividade diaria: ' || v_task.activity_title,
      'daily_activity',
      v_task.task_id::text
    );
  end if;

  select count(*)::int
  into v_completed_total
  from public.chat_pet_daily_completions c
  where c.task_id = v_task.task_id;

  if v_completed_total >= 2 then
    update public.chat_pet_daily_tasks t
    set duo_completed_at = timezone('utc', now())
    where t.id = v_task.task_id
      and t.duo_completed_at is null;

    get diagnostics v_rows = row_count;
    v_duo_just_completed := v_rows > 0;

    if v_duo_just_completed then
      update public.chat_pet_pairs p
      set
        life_days = p.life_days + 1,
        last_growth_date = p_challenge_date,
        status = 'alive',
        updated_at = timezone('utc', now())
      where p.id = v_task.pet_pair_id
      returning p.life_days into v_life_days;

      if v_life_days = 3 or mod(v_life_days, 10) = 0 then
        v_milestone := true;
        v_milestone_days := v_life_days;

        select c.*
        into v_conversa
        from public.chat_conversations c
        join public.chat_pet_pairs p on p.conversation_id = c.id
        where p.id = v_task.pet_pair_id
        limit 1;

        perform public.academy_add_xp(
          v_conversa.profile_one_id,
          10,
          'Pet em dupla: ' || v_life_days::text || ' dias de vida',
          'pet_milestone',
          v_task.pet_pair_id::text || ':' || v_life_days::text
        );

        perform public.academy_add_xp(
          v_conversa.profile_two_id,
          10,
          'Pet em dupla: ' || v_life_days::text || ' dias de vida',
          'pet_milestone',
          v_task.pet_pair_id::text || ':' || v_life_days::text
        );
      end if;
    end if;
  end if;

  select p.xp_total, p.level
  into v_my_xp, v_my_level
  from public.profiles p
  where p.id = v_me;

  select *
  into v_state
  from public.academy_get_pet_state(p_conversation_id, p_challenge_date)
  limit 1;

  return query
  select
    coalesce(v_state.task_id, v_task.task_id),
    coalesce(v_state.pet_pair_id, v_task.pet_pair_id),
    p_challenge_date,
    coalesce(v_state.activity_id, v_task.activity_id),
    coalesce(v_state.activity_title, v_task.activity_title),
    coalesce(v_state.activity_description, v_task.activity_description),
    coalesce(v_state.activity_xp, v_task.activity_xp),
    coalesce(v_state.challenge_scope, v_task.challenge_scope),
    coalesce(v_state.pet_name, v_task.pet_name),
    coalesce(v_state.pet_life_days, v_task.pet_life_days),
    coalesce(v_state.pet_status, v_task.pet_status),
    coalesce(v_state.completed_total, v_task.completed_total),
    coalesce(v_state.completed_by_me, v_task.completed_by_me),
    coalesce(v_state.duo_completed, v_task.duo_completed),
    v_milestone,
    v_milestone_days,
    v_my_xp,
    v_my_level;
end;
$academy_complete_pet_daily_task$;

grant execute on function public.academy_complete_pet_daily_task(uuid, date) to authenticated;

create or replace function public.academy_get_pet_daily_quiz(
  p_conversation_id uuid,
  p_challenge_date date default current_date
)
returns table (
  attempt_id uuid,
  task_id uuid,
  subject_name text,
  total_questions integer,
  pass_score_percent numeric,
  questions jsonb
)
language plpgsql
security definer
set search_path = public
as $academy_get_pet_daily_quiz$
declare
  v_me uuid;
  v_state record;
  v_course_area text;
  v_subject text;
  v_attempt_id uuid;
  v_needed integer := 5;
  v_question_ids uuid[] := '{}'::uuid[];
  v_more_ids uuid[];
  v_questions jsonb;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_chat_participant(p_conversation_id, v_me) then
    raise exception 'Usuario sem acesso a esta conversa';
  end if;

  select *
  into v_state
  from public.academy_get_pet_state(p_conversation_id, p_challenge_date)
  limit 1;

  if not coalesce(v_state.has_pair, false) then
    raise exception 'Este chat ainda nao tem pet em dupla';
  end if;

  select coalesce(a.course_area, 'base_central')
  into v_course_area
  from public.learning_activities a
  where a.id = v_state.activity_id
  limit 1;

  if v_state.challenge_scope = 'course' and v_course_area = 'informatica' then
    v_subject := 'informatica';
  else
    case abs(hashtext(v_state.task_id::text || v_me::text)) % 4
      when 0 then v_subject := 'portugues';
      when 1 then v_subject := 'matematica';
      when 2 then v_subject := 'ingles';
      else v_subject := 'quimica';
    end case;
  end if;

  insert into public.chat_pet_quiz_attempts (
    task_id,
    pet_pair_id,
    conversation_id,
    profile_id,
    challenge_date,
    subject_name,
    total_questions,
    pass_score_percent
  )
  values (
    v_state.task_id,
    v_state.pet_pair_id,
    p_conversation_id,
    v_me,
    p_challenge_date,
    v_subject,
    v_needed,
    60.00
  )
  returning id into v_attempt_id;

  select array_agg(t.id)
  into v_question_ids
  from (
    select q.id
    from public.academy_quiz_questions q
    where q.is_active = true
      and q.subject_name = v_subject
      and (
        (v_subject = 'informatica' and q.challenge_scope = 'course' and coalesce(q.course_area, 'informatica') = 'informatica')
        or (v_subject <> 'informatica' and q.challenge_scope = 'base')
      )
      and not exists (
        select 1
        from public.chat_pet_quiz_attempt_items qi
        join public.chat_pet_quiz_attempts qa on qa.id = qi.attempt_id
        where qa.profile_id = v_me
          and qi.quiz_question_id = q.id
      )
    order by random()
    limit v_needed
  ) as t;

  v_question_ids := coalesce(v_question_ids, '{}'::uuid[]);

  if cardinality(v_question_ids) < v_needed then
    select array_agg(t.id)
    into v_more_ids
    from (
      select q.id
      from public.academy_quiz_questions q
      where q.is_active = true
        and q.subject_name = v_subject
        and (
          (v_subject = 'informatica' and q.challenge_scope = 'course' and coalesce(q.course_area, 'informatica') = 'informatica')
          or (v_subject <> 'informatica' and q.challenge_scope = 'base')
        )
        and not (q.id = any(v_question_ids))
      order by random()
      limit (v_needed - cardinality(v_question_ids))
    ) as t;

    v_question_ids := v_question_ids || coalesce(v_more_ids, '{}'::uuid[]);
  end if;

  if cardinality(v_question_ids) < v_needed then
    select array_agg(t.id)
    into v_more_ids
    from (
      select q.id
      from public.academy_quiz_questions q
      where q.is_active = true
        and not (q.id = any(v_question_ids))
      order by random()
      limit (v_needed - cardinality(v_question_ids))
    ) as t;

    v_question_ids := v_question_ids || coalesce(v_more_ids, '{}'::uuid[]);
  end if;

  if cardinality(v_question_ids) = 0 then
    raise exception 'Nao existem quizzes cadastrados. Rode o SQL do quiz.';
  end if;

  update public.chat_pet_quiz_attempts a
  set total_questions = cardinality(v_question_ids)
  where a.id = v_attempt_id;

  insert into public.chat_pet_quiz_attempt_items (
    attempt_id,
    task_id,
    quiz_question_id,
    display_order
  )
  select
    v_attempt_id,
    v_state.task_id,
    pick.question_id,
    pick.position::smallint
  from unnest(v_question_ids) with ordinality as pick(question_id, position);

  select jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'order', i.display_order,
        'prompt', q.prompt,
        'subject', q.subject_name,
        'difficulty', q.difficulty,
        'options', jsonb_build_array(
          jsonb_build_object('id', 'A', 'text', q.option_a),
          jsonb_build_object('id', 'B', 'text', q.option_b),
          jsonb_build_object('id', 'C', 'text', q.option_c),
          jsonb_build_object('id', 'D', 'text', q.option_d)
        )
      )
      order by i.display_order
    )
  into v_questions
  from public.chat_pet_quiz_attempt_items i
  join public.academy_quiz_questions q on q.id = i.quiz_question_id
  where i.attempt_id = v_attempt_id;

  return query
  select
    v_attempt_id,
    v_state.task_id,
    initcap(v_subject),
    cardinality(v_question_ids),
    60.00::numeric,
    coalesce(v_questions, '[]'::jsonb);
end;
$academy_get_pet_daily_quiz$;

grant execute on function public.academy_get_pet_daily_quiz(uuid, date) to authenticated;

create or replace function public.academy_submit_pet_daily_quiz(
  p_attempt_id uuid,
  p_answers jsonb
)
returns table (
  attempt_id uuid,
  passed boolean,
  correct_count integer,
  total_questions integer,
  score_percent numeric,
  pass_score_percent numeric,
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
  v_score numeric(5,2) := 0;
  v_passed boolean := false;
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

  update public.chat_pet_quiz_attempts a
  set
    correct_count = v_correct,
    score_percent = v_score,
    passed = v_passed,
    submitted_at = timezone('utc', now())
  where a.id = v_attempt.id;

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
      v_score,
      v_attempt.pass_score_percent,
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
    v_score,
    v_attempt.pass_score_percent,
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

alter table public.academy_quiz_questions enable row level security;
alter table public.chat_pet_quiz_attempts enable row level security;
alter table public.chat_pet_quiz_attempt_items enable row level security;

drop policy if exists academy_quiz_questions_select_all on public.academy_quiz_questions;
create policy academy_quiz_questions_select_all
  on public.academy_quiz_questions
  for select
  to authenticated
  using (is_active = true);

drop policy if exists chat_pet_quiz_attempts_select_own on public.chat_pet_quiz_attempts;
create policy chat_pet_quiz_attempts_select_own
  on public.chat_pet_quiz_attempts
  for select
  to authenticated
  using (profile_id = public.academy_current_profile_id());

drop policy if exists chat_pet_quiz_items_select_own on public.chat_pet_quiz_attempt_items;
create policy chat_pet_quiz_items_select_own
  on public.chat_pet_quiz_attempt_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.chat_pet_quiz_attempts a
      where a.id = attempt_id
        and a.profile_id = public.academy_current_profile_id()
    )
  );

with banco as (
  select *
  from (
    values
      ('portugues', 'base', null, 'Qual frase esta com pontuacao correta?', 'Vamos estudar, Ana.', 'Vamos estudar Ana,', 'Vamos estudar Ana', 'Vamos, estudar Ana', 'A', 'A virgula separa vocativo.', 2),
      ('portugues', 'base', null, 'Qual palavra esta escrita corretamente?', 'Excecao', 'Excessao', 'Excessao', 'Exsesao', 'A', 'A forma correta e excecao.', 1),
      ('portugues', 'base', null, 'Qual opcao tem verbo no infinitivo?', 'Cantar', 'Cantando', 'Cantou', 'Cantara', 'A', 'Infinitivo termina em ar, er ou ir.', 1),
      ('portugues', 'base', null, 'Em "Os alunos chegaram", o sujeito e:', 'Os alunos', 'chegaram', 'os', 'alunos chegaram', 'A', 'Sujeito simples: os alunos.', 1),
      ('portugues', 'base', null, 'Qual frase usa crase corretamente?', 'Vou a escola.', 'Voltei a casa.', 'Fui a praia no sabado.', 'Entreguei o livro a professora.', 'D', 'A forma correta: a professora.', 3),
      ('portugues', 'base', null, 'Qual e o sinonimo de "feliz"?', 'Triste', 'Contente', 'Atrasado', 'Lento', 'B', 'Contente e sinonimo de feliz.', 1),
      ('portugues', 'base', null, 'Qual frase esta na linguagem formal?', 'A gente vai resolver isso.', 'Nos resolveremos isso.', 'A galera resolveu.', 'Ta resolvido.', 'B', 'Nos resolveremos isso e registro formal.', 2),
      ('portugues', 'base', null, 'Qual alternativa tem pronome pessoal?', 'Mesa', 'Ele', 'Bonito', 'Corrida', 'B', 'Ele e pronome pessoal.', 1),
      ('portugues', 'base', null, 'Qual palavra e um adjetivo?', 'Rapidamente', 'Casa', 'Azul', 'Correr', 'C', 'Azul qualifica o substantivo.', 1),
      ('portugues', 'base', null, 'Qual frase apresenta concordancia correta?', 'Os menino chegou cedo.', 'As meninas estudou ontem.', 'Os meninos chegaram cedo.', 'A turma chegaram tarde.', 'C', 'Concordancia correta entre sujeito e verbo.', 2),
      ('portugues', 'base', null, 'Qual e o antonimo de "claro"?', 'Luz', 'Escuro', 'Branco', 'Transparente', 'B', 'Escuro e antonimo de claro.', 1),
      ('portugues', 'base', null, 'Qual frase esta no passado?', 'Eu estudo hoje.', 'Eu estudarei amanha.', 'Eu estudei ontem.', 'Eu estudo sempre.', 'C', 'Estudei indica passado.', 1),

      ('ingles', 'base', null, 'Qual a traducao de "book"?', 'Mesa', 'Livro', 'Caneta', 'Janela', 'B', 'Book = livro.', 1),
      ('ingles', 'base', null, 'Complete: She ___ my friend.', 'am', 'is', 'are', 'be', 'B', 'She pede is no present simple.', 1),
      ('ingles', 'base', null, 'Qual a traducao de "teacher"?', 'Professor', 'Medico', 'Advogado', 'Engenheiro', 'A', 'Teacher = professor.', 1),
      ('ingles', 'base', null, 'Complete: They ___ studying now.', 'is', 'am', 'are', 'be', 'C', 'They usa are.', 1),
      ('ingles', 'base', null, 'Qual forma esta no plural?', 'Child', 'Woman', 'Foot', 'Books', 'D', 'Books e plural regular.', 1),
      ('ingles', 'base', null, 'Qual e o passado de "go"?', 'Goed', 'Went', 'Gone', 'Going', 'B', 'Passado simples de go e went.', 2),
      ('ingles', 'base', null, 'Qual frase esta correta?', 'He have a car.', 'He has a car.', 'He are a car.', 'He having car.', 'B', 'He has a car esta correta.', 2),
      ('ingles', 'base', null, 'Qual palavra significa "agua"?', 'Fire', 'Wind', 'Water', 'Earth', 'C', 'Water = agua.', 1),
      ('ingles', 'base', null, 'Complete: I ___ from Brazil.', 'is', 'are', 'am', 'be', 'C', 'I usa am.', 1),
      ('ingles', 'base', null, 'Qual alternativa e um verbo?', 'Happy', 'Run', 'Blue', 'School', 'B', 'Run pode ser verbo.', 1),
      ('ingles', 'base', null, 'Qual e a traducao de "good morning"?', 'Boa tarde', 'Boa noite', 'Bom dia', 'Oi', 'C', 'Good morning = bom dia.', 1),
      ('ingles', 'base', null, 'Qual preposicao completa: The book is ___ the table.', 'in', 'on', 'at', 'to', 'B', 'On indica sobre a superficie.', 2),

      ('quimica', 'base', null, 'Qual e o simbolo quimico do sodio?', 'So', 'Na', 'Sd', 'Sn', 'B', 'Sodio = Na.', 1),
      ('quimica', 'base', null, 'Qual formula representa a agua?', 'CO2', 'NaCl', 'H2O', 'O2', 'C', 'Agua = H2O.', 1),
      ('quimica', 'base', null, 'pH menor que 7 indica meio:', 'Neutro', 'Acido', 'Basico', 'Salgado', 'B', 'pH menor que 7 e acido.', 1),
      ('quimica', 'base', null, 'Qual gas e essencial para respiracao humana?', 'Nitrogenio', 'Hidrogenio', 'Oxigenio', 'Helio', 'C', 'Respiracao usa oxigenio.', 1),
      ('quimica', 'base', null, 'Qual e o numero atomico do carbono?', '4', '6', '8', '12', 'B', 'Carbono tem numero atomico 6.', 2),
      ('quimica', 'base', null, 'A ligacao ionica ocorre por:', 'Compartilhamento de eletrons', 'Transferencia de eletrons', 'Perda de protons', 'Troca de neutrons', 'B', 'Ligacao ionica envolve transferencia de eletrons.', 2),
      ('quimica', 'base', null, 'Qual substancia e um acido forte?', 'HCl', 'NH3', 'NaOH', 'CaCO3', 'A', 'HCl e acido forte.', 2),
      ('quimica', 'base', null, 'Qual e a massa aproximada de 1 mol de H2O?', '18 g', '2 g', '44 g', '32 g', 'A', 'Massa molar da agua e 18 g/mol.', 2),
      ('quimica', 'base', null, 'Qual particula tem carga negativa?', 'Proton', 'Neutron', 'Eletron', 'Nucleo', 'C', 'Eletron possui carga negativa.', 1),
      ('quimica', 'base', null, 'A tabela periodica organiza elementos por:', 'Cor', 'Massa corporal', 'Numero atomico', 'Estado fisico', 'C', 'A ordem principal e o numero atomico.', 1),
      ('quimica', 'base', null, 'Qual composto e um sal?', 'H2SO4', 'NaCl', 'KOH', 'H2O2', 'B', 'NaCl e sal de cozinha.', 1),
      ('quimica', 'base', null, 'Qual opcao representa uma base?', 'HNO3', 'HCl', 'NaOH', 'CO2', 'C', 'NaOH e uma base forte.', 1),

      ('informatica', 'course', 'informatica', 'Qual comando SQL retorna dados?', 'DELETE', 'INSERT', 'SELECT', 'DROP', 'C', 'SELECT consulta dados.', 1),
      ('informatica', 'course', 'informatica', 'Qual tag HTML cria um link?', '<img>', '<a>', '<div>', '<p>', 'B', 'Tag anchor cria links.', 1),
      ('informatica', 'course', 'informatica', 'No Git, qual comando envia commits para o remoto?', 'git pull', 'git commit', 'git push', 'git clone', 'C', 'git push publica no remoto.', 1),
      ('informatica', 'course', 'informatica', 'Qual estrutura repete enquanto condicao for verdadeira?', 'if', 'for', 'switch', 'while', 'D', 'while repete por condicao.', 1),
      ('informatica', 'course', 'informatica', 'Qual protocolo e usado para paginas web?', 'FTP', 'HTTP', 'SSH', 'SMTP', 'B', 'HTTP e protocolo web.', 1),
      ('informatica', 'course', 'informatica', 'Qual comando cria uma nova branch no Git?', 'git merge', 'git branch', 'git status', 'git stash', 'B', 'git branch cria ramificacoes.', 1),
      ('informatica', 'course', 'informatica', 'Em CSS, qual propriedade muda a cor do texto?', 'background', 'font-size', 'color', 'border', 'C', 'color define cor do texto.', 1),
      ('informatica', 'course', 'informatica', 'Qual estrutura armazena pares chave-valor em JavaScript?', 'Array', 'Set', 'Object', 'String', 'C', 'Objeto usa pares chave-valor.', 2),
      ('informatica', 'course', 'informatica', 'Qual comando lista tabelas no PostgreSQL (psql)?', '\dt', '\l', '\du', '\c', 'A', '\dt mostra tabelas.', 2),
      ('informatica', 'course', 'informatica', 'Qual porta padrao do HTTPS?', '21', '25', '80', '443', 'D', 'HTTPS usa porta 443.', 2),
      ('informatica', 'course', 'informatica', 'Qual comando no Linux mostra diretorio atual?', 'ls', 'pwd', 'cd', 'mv', 'B', 'pwd exibe caminho atual.', 1),
      ('informatica', 'course', 'informatica', 'O que significa API?', 'Aplicacao Programada Interna', 'Application Programming Interface', 'Advanced Process Integration', 'Automatic Program Instance', 'B', 'API = Application Programming Interface.', 2),
      ('informatica', 'course', 'informatica', 'Qual estrutura de dados segue LIFO?', 'Fila', 'Lista ligada', 'Pilha', 'Arvore', 'C', 'Pilha funciona em LIFO.', 2),
      ('informatica', 'course', 'informatica', 'Qual comando instala dependencias no projeto Node?', 'node install', 'npm install', 'npm push', 'node run', 'B', 'npm install instala pacotes.', 1),
      ('informatica', 'course', 'informatica', 'Em redes, IP 127.0.0.1 representa:', 'Gateway', 'DNS publico', 'Loopback local', 'Broadcast', 'C', '127.0.0.1 e localhost.', 2),
      ('informatica', 'course', 'informatica', 'Qual metodo HTTP geralmente cria recurso?', 'GET', 'POST', 'HEAD', 'OPTIONS', 'B', 'POST e comum para criacao.', 2)
  ) as t(subject_name, challenge_scope, course_area, prompt, option_a, option_b, option_c, option_d, correct_option, explanation, difficulty)
)
insert into public.academy_quiz_questions (
  subject_name,
  challenge_scope,
  course_area,
  prompt,
  option_a,
  option_b,
  option_c,
  option_d,
  correct_option,
  explanation,
  difficulty
)
select
  b.subject_name,
  b.challenge_scope,
  b.course_area,
  b.prompt,
  b.option_a,
  b.option_b,
  b.option_c,
  b.option_d,
  b.correct_option,
  b.explanation,
  b.difficulty
from banco b
where not exists (
  select 1
  from public.academy_quiz_questions q
  where q.subject_name = b.subject_name
    and q.prompt = b.prompt
);

with base_add as (
  select
    gs,
    (gs % 37) + 8 as a,
    ((gs * 5) % 19) + 2 as b,
    ((gs * 7) % 4) + 1 as slot
  from generate_series(1, 120) gs
),
rows_add as (
  select
    'matematica'::text as subject_name,
    'base'::text as challenge_scope,
    null::text as course_area,
    format('Quanto e %s + %s?', a, b) as prompt,
    case when slot = 1 then (a + b)::text when slot = 2 then (a + b + 2)::text when slot = 3 then greatest(0, a + b - 2)::text else (a + b + 5)::text end as option_a,
    case when slot = 2 then (a + b)::text when slot = 1 then (a + b + 2)::text when slot = 4 then greatest(0, a + b - 2)::text else (a + b + 5)::text end as option_b,
    case when slot = 3 then (a + b)::text when slot = 4 then (a + b + 2)::text when slot = 1 then greatest(0, a + b - 2)::text else (a + b + 5)::text end as option_c,
    case when slot = 4 then (a + b)::text when slot = 3 then (a + b + 2)::text when slot = 2 then greatest(0, a + b - 2)::text else (a + b + 5)::text end as option_d,
    case slot when 1 then 'A' when 2 then 'B' when 3 then 'C' else 'D' end as correct_option,
    'Soma de dois inteiros.'::text as explanation,
    1::smallint as difficulty
  from base_add
),
base_mul as (
  select
    gs,
    ((gs * 3) % 11) + 2 as a,
    ((gs * 7) % 11) + 2 as b,
    ((gs * 5) % 4) + 1 as slot
  from generate_series(1, 120) gs
),
rows_mul as (
  select
    'matematica'::text as subject_name,
    'base'::text as challenge_scope,
    null::text as course_area,
    format('Quanto e %s x %s?', a, b) as prompt,
    case when slot = 1 then (a * b)::text when slot = 2 then (a * b + a)::text when slot = 3 then greatest(0, a * b - b)::text else (a * b + 6)::text end as option_a,
    case when slot = 2 then (a * b)::text when slot = 1 then (a * b + a)::text when slot = 4 then greatest(0, a * b - b)::text else (a * b + 6)::text end as option_b,
    case when slot = 3 then (a * b)::text when slot = 4 then (a * b + a)::text when slot = 1 then greatest(0, a * b - b)::text else (a * b + 6)::text end as option_c,
    case when slot = 4 then (a * b)::text when slot = 3 then (a * b + a)::text when slot = 2 then greatest(0, a * b - b)::text else (a * b + 6)::text end as option_d,
    case slot when 1 then 'A' when 2 then 'B' when 3 then 'C' else 'D' end as correct_option,
    'Multiplicacao basica.'::text as explanation,
    2::smallint as difficulty
  from base_mul
)
insert into public.academy_quiz_questions (
  subject_name,
  challenge_scope,
  course_area,
  prompt,
  option_a,
  option_b,
  option_c,
  option_d,
  correct_option,
  explanation,
  difficulty
)
select
  q.subject_name,
  q.challenge_scope,
  q.course_area,
  q.prompt,
  q.option_a,
  q.option_b,
  q.option_c,
  q.option_d,
  q.correct_option,
  q.explanation,
  q.difficulty
from (
  select * from rows_add
  union all
  select * from rows_mul
) q
where not exists (
  select 1
  from public.academy_quiz_questions x
  where x.subject_name = q.subject_name
    and x.prompt = q.prompt
);
