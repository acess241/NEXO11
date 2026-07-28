create table if not exists public.academy_quiz_admin_profiles (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

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

alter table public.academy_quiz_admin_profiles enable row level security;

drop policy if exists academy_quiz_admin_profiles_select_self on public.academy_quiz_admin_profiles;
create policy academy_quiz_admin_profiles_select_self
  on public.academy_quiz_admin_profiles
  for select
  to authenticated
  using (profile_id = public.academy_current_profile_id());

create or replace function public.academy_is_quiz_admin(
  p_profile_id uuid default public.academy_current_profile_id()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $academy_is_quiz_admin$
  select exists (
    select 1
    from public.academy_quiz_admin_profiles a
    where a.profile_id = p_profile_id
  )
$academy_is_quiz_admin$;

grant execute on function public.academy_is_quiz_admin(uuid) to authenticated;

create or replace function public.academy_admin_can_manage_quiz()
returns boolean
language sql
stable
security definer
set search_path = public
as $academy_admin_can_manage_quiz$
  select public.academy_is_quiz_admin(public.academy_current_profile_id())
$academy_admin_can_manage_quiz$;

grant execute on function public.academy_admin_can_manage_quiz() to authenticated;

create or replace function public.academy_admin_quiz_summary()
returns table (
  total_questions integer,
  active_questions integer,
  inactive_questions integer,
  by_subject jsonb
)
language plpgsql
security definer
set search_path = public
as $academy_admin_quiz_summary$
declare
  v_me uuid;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_quiz_admin(v_me) then
    raise exception 'Acesso restrito ao admin do quiz';
  end if;

  return query
  with summary as (
    select
      count(*)::int as total_questions,
      count(*) filter (where q.is_active)::int as active_questions
    from public.academy_quiz_questions q
  ),
  subjects as (
    select
      q.subject_name,
      count(*)::int as total,
      count(*) filter (where q.is_active)::int as active
    from public.academy_quiz_questions q
    group by q.subject_name
    order by q.subject_name
  )
  select
    s.total_questions,
    s.active_questions,
    greatest(s.total_questions - s.active_questions, 0),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'subject', sub.subject_name,
            'total', sub.total,
            'active', sub.active
          )
          order by sub.subject_name
        )
        from subjects sub
      ),
      '[]'::jsonb
    )
  from summary s;
end;
$academy_admin_quiz_summary$;

grant execute on function public.academy_admin_quiz_summary() to authenticated;

create or replace function public.academy_admin_create_quiz_question(
  p_subject_name text,
  p_challenge_scope text,
  p_course_area text default null,
  p_prompt text default null,
  p_option_a text default null,
  p_option_b text default null,
  p_option_c text default null,
  p_option_d text default null,
  p_correct_option text default null,
  p_explanation text default null,
  p_difficulty smallint default 1,
  p_is_active boolean default true
)
returns table (
  question_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $academy_admin_create_quiz_question$
declare
  v_me uuid;
  v_subject text;
  v_scope text;
  v_course_area text;
  v_prompt text;
  v_option_a text;
  v_option_b text;
  v_option_c text;
  v_option_d text;
  v_correct text;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_quiz_admin(v_me) then
    raise exception 'Acesso restrito ao admin do quiz';
  end if;

  v_subject := lower(btrim(coalesce(p_subject_name, '')));
  v_scope := lower(btrim(coalesce(p_challenge_scope, '')));
  v_course_area := nullif(lower(btrim(coalesce(p_course_area, ''))), '');
  v_prompt := nullif(btrim(coalesce(p_prompt, '')), '');
  v_option_a := nullif(btrim(coalesce(p_option_a, '')), '');
  v_option_b := nullif(btrim(coalesce(p_option_b, '')), '');
  v_option_c := nullif(btrim(coalesce(p_option_c, '')), '');
  v_option_d := nullif(btrim(coalesce(p_option_d, '')), '');
  v_correct := upper(btrim(coalesce(p_correct_option, '')));

  if v_subject is null then
    raise exception 'Materia do quiz obrigatoria';
  end if;

  if v_scope not in ('base', 'course') then
    raise exception 'Escopo invalido para quiz';
  end if;

  if v_scope = 'course' and v_subject <> 'informatica' then
    raise exception 'Escopo course aceita apenas questoes de informatica';
  end if;

  if v_scope = 'course' and v_course_area is null then
    raise exception 'Informe a area do curso para questoes course';
  end if;

  if v_prompt is null then
    raise exception 'Enunciado do quiz obrigatorio';
  end if;

  if v_option_a is null or v_option_b is null or v_option_c is null or v_option_d is null then
    raise exception 'Todas as quatro opcoes sao obrigatorias';
  end if;

  if p_difficulty is null or p_difficulty < 1 or p_difficulty > 5 then
    raise exception 'Dificuldade deve ficar entre 1 e 5';
  end if;

  if v_correct not in ('A', 'B', 'C', 'D') then
    raise exception 'Alternativa correta invalida';
  end if;

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
    difficulty,
    is_active
  )
  values (
    v_subject,
    v_scope,
    case when v_scope = 'course' then v_course_area else null end,
    v_prompt,
    v_option_a,
    v_option_b,
    v_option_c,
    v_option_d,
    v_correct,
    nullif(btrim(coalesce(p_explanation, '')), ''),
    p_difficulty,
    coalesce(p_is_active, true)
  )
  returning id, academy_quiz_questions.created_at into question_id, created_at;

  return next;
end;
$academy_admin_create_quiz_question$;

grant execute on function public.academy_admin_create_quiz_question(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  smallint,
  boolean
) to authenticated;

create or replace function public.academy_admin_set_quiz_question_active(
  p_question_id uuid,
  p_is_active boolean
)
returns table (
  question_id uuid,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $academy_admin_set_quiz_question_active$
declare
  v_me uuid;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_quiz_admin(v_me) then
    raise exception 'Acesso restrito ao admin do quiz';
  end if;

  update public.academy_quiz_questions q
  set is_active = coalesce(p_is_active, true)
  where q.id = p_question_id
  returning q.id, q.is_active into question_id, is_active;

  if not found then
    raise exception 'Questao de quiz nao encontrada';
  end if;

  return next;
end;
$academy_admin_set_quiz_question_active$;

grant execute on function public.academy_admin_set_quiz_question_active(uuid, boolean) to authenticated;

create or replace function public.academy_admin_list_quiz_questions(
  p_query text default null,
  p_subject_name text default null,
  p_challenge_scope text default null,
  p_is_active boolean default null,
  p_limit integer default 80
)
returns table (
  question_id uuid,
  subject_name text,
  challenge_scope text,
  course_area text,
  difficulty smallint,
  is_active boolean,
  created_at timestamptz,
  prompt text
)
language plpgsql
security definer
set search_path = public
as $academy_admin_list_quiz_questions$
declare
  v_me uuid;
  v_query text;
  v_subject text;
  v_scope text;
  v_limit integer;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_quiz_admin(v_me) then
    raise exception 'Acesso restrito ao admin do quiz';
  end if;

  v_query := lower(nullif(btrim(coalesce(p_query, '')), ''));
  v_subject := lower(nullif(btrim(coalesce(p_subject_name, '')), ''));
  v_scope := lower(nullif(btrim(coalesce(p_challenge_scope, '')), ''));
  v_limit := greatest(1, least(coalesce(p_limit, 80), 200));

  if v_scope is not null and v_scope not in ('base', 'course') then
    raise exception 'Escopo invalido para busca de quiz';
  end if;

  return query
  select
    q.id,
    q.subject_name,
    q.challenge_scope,
    q.course_area,
    q.difficulty,
    q.is_active,
    q.created_at,
    q.prompt
  from public.academy_quiz_questions q
  where
    (v_subject is null or q.subject_name = v_subject)
    and (v_scope is null or q.challenge_scope = v_scope)
    and (p_is_active is null or q.is_active = p_is_active)
    and (
      v_query is null
      or q.id::text like '%' || v_query || '%'
      or lower(q.subject_name) like '%' || v_query || '%'
      or lower(q.challenge_scope) like '%' || v_query || '%'
      or lower(coalesce(q.course_area, '')) like '%' || v_query || '%'
      or lower(q.prompt) like '%' || v_query || '%'
    )
  order by
    (v_query is not null and q.id::text = v_query) desc,
    (v_query is not null and lower(q.subject_name) = v_query) desc,
    (v_query is not null and lower(q.subject_name) like v_query || '%') desc,
    q.is_active desc,
    q.created_at desc
  limit v_limit;
end;
$academy_admin_list_quiz_questions$;

grant execute on function public.academy_admin_list_quiz_questions(
  text,
  text,
  text,
  boolean,
  integer
) to authenticated;

create or replace function public.academy_admin_search_profiles(
  p_query text,
  p_limit integer default 12
)
returns table (
  profile_id uuid,
  username text,
  nome text,
  xp_total integer,
  level integer,
  course_area text
)
language plpgsql
security definer
set search_path = public
as $academy_admin_search_profiles$
declare
  v_me uuid;
  v_term text;
  v_limit integer;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_quiz_admin(v_me) then
    raise exception 'Acesso restrito ao admin do quiz';
  end if;

  v_term := lower(nullif(btrim(coalesce(p_query, '')), ''));
  if v_term is null then
    return;
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 12), 30));

  return query
  select
    p.id,
    p.username,
    p.nome,
    coalesce(p.xp_total, 0)::int,
    coalesce(p.level, 1)::int,
    coalesce(p.course_area, 'base_central')
  from public.profiles p
  where
    lower(coalesce(p.username, '')) like '%' || v_term || '%'
    or lower(coalesce(p.nome, '')) like '%' || v_term || '%'
  order by
    (lower(coalesce(p.username, '')) = v_term) desc,
    (lower(coalesce(p.username, '')) like v_term || '%') desc,
    (lower(coalesce(p.nome, '')) like v_term || '%') desc,
    p.xp_total desc nulls last,
    p.created_at desc nulls last
  limit v_limit;
end;
$academy_admin_search_profiles$;

grant execute on function public.academy_admin_search_profiles(text, integer) to authenticated;

create or replace function public.academy_admin_adjust_profile_xp(
  p_target_profile_id uuid,
  p_delta_xp integer,
  p_reason text default null
)
returns table (
  profile_id uuid,
  username text,
  nome text,
  xp_total integer,
  level integer,
  delta_xp integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $academy_admin_adjust_profile_xp$
declare
  v_me uuid;
  v_delta integer;
  v_reason text;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_quiz_admin(v_me) then
    raise exception 'Acesso restrito ao admin do quiz';
  end if;

  if p_target_profile_id is null then
    raise exception 'Perfil alvo invalido';
  end if;

  v_delta := coalesce(p_delta_xp, 0);

  if v_delta = 0 then
    raise exception 'Informe um delta de XP diferente de zero';
  end if;

  if abs(v_delta) > 5000 then
    raise exception 'Ajuste maximo por operacao: 5000 XP';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    v_reason := 'Ajuste administrativo de XP';
  end if;

  perform public.academy_add_xp(
    p_target_profile_id,
    v_delta,
    v_reason,
    'admin',
    v_me::text
  );

  insert into public.notifications (
    receiver_profile_id,
    actor_profile_id,
    type,
    xp_delta,
    xp_reason,
    metadata
  )
  values (
    p_target_profile_id,
    v_me,
    'message',
    v_delta,
    v_reason,
    jsonb_build_object(
      'kind', 'xp_adjustment',
      'xp_delta', v_delta,
      'reason', v_reason
    )
  );

  return query
  select
    p.id,
    p.username,
    p.nome,
    coalesce(p.xp_total, 0)::int,
    coalesce(p.level, 1)::int,
    v_delta,
    v_reason
  from public.profiles p
  where p.id = p_target_profile_id
  limit 1;
end;
$academy_admin_adjust_profile_xp$;

grant execute on function public.academy_admin_adjust_profile_xp(uuid, integer, text) to authenticated;

-- Exemplo para liberar seu perfil como admin de quiz:
-- insert into public.academy_quiz_admin_profiles (profile_id)
-- values ('SEU_PROFILE_ID_AQUI')
-- on conflict (profile_id) do nothing;
