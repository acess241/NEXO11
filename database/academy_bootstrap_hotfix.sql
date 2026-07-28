-- Nexo 11 - Academy bootstrap + XP trade hotfix
-- Run this entire script once in Supabase SQL Editor.
-- Safe to re-run (idempotent).

begin;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'profiles'
  ) then
    raise exception 'Tabela public.profiles nao encontrada. Rode primeiro o SQL base do app.';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'institution_name'
  ) then
    alter table public.profiles add column institution_name text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
  ) then
    alter table public.profiles add column role text not null default 'student';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'teacher_subject'
  ) then
    alter table public.profiles add column teacher_subject text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'teacher_school'
  ) then
    alter table public.profiles add column teacher_school text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'teacher_registration'
  ) then
    alter table public.profiles add column teacher_registration text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'teacher_department'
  ) then
    alter table public.profiles add column teacher_department text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'course_area'
  ) then
    alter table public.profiles add column course_area text not null default 'base_central';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'xp_total'
  ) then
    alter table public.profiles add column xp_total integer not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'level'
  ) then
    alter table public.profiles add column level integer not null default 1;
  end if;
end
$$;

update public.profiles
set role = case
  when lower(coalesce(role, '')) in ('teacher', 'professor', 'docente') then 'teacher'
  when lower(coalesce(role, '')) in ('admin', 'adm') then 'admin'
  else 'student'
end;

update public.profiles
set course_area = case
  when course_area in ('informatica', 'administracao', 'enfermagem', 'agro', 'base_central', 'outros') then course_area
  else 'base_central'
end;

update public.profiles
set
  teacher_subject = nullif(btrim(coalesce(teacher_subject, '')), ''),
  teacher_school = coalesce(
    nullif(btrim(coalesce(teacher_school, '')), ''),
    nullif(btrim(coalesce(institution_name, '')), '')
  ),
  xp_total = greatest(coalesce(xp_total, 0), 0),
  level = greatest(1, floor(greatest(coalesce(xp_total, 0), 0)::numeric / 100)::int + 1);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles
      add constraint profiles_role_check
      check (lower(coalesce(role, 'student')) in ('student', 'teacher', 'professor', 'admin'));
  end if;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_course_area_check') then
    alter table public.profiles
      add constraint profiles_course_area_check
      check (course_area in ('informatica', 'administracao', 'enfermagem', 'agro', 'base_central', 'outros'));
  end if;
exception
  when duplicate_object then null;
end
$$;

create index if not exists profiles_teacher_selector_idx
  on public.profiles (role, teacher_school, teacher_subject, nome);

create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  delta_xp integer not null,
  reason text not null,
  source_type text not null default 'manual' check (
    source_type in ('daily_activity', 'pet_milestone', 'redemption_adjustment', 'unit_bonus', 'admin', 'manual')
  ),
  source_ref text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists xp_ledger_profile_created_idx
  on public.xp_ledger (profile_id, created_at desc);

create table if not exists public.unit_grade_redemptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  unit_code text not null,
  subject_name text not null,
  xp_spent integer not null check (xp_spent > 0),
  grade_points numeric(4,2) not null check (grade_points > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  teacher_profile_id uuid references public.profiles (id) on delete set null,
  teacher_subject_name text,
  reviewer_profile_id uuid references public.profiles (id) on delete set null,
  reviewer_note text,
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz
);

create index if not exists unit_grade_redemptions_profile_created_idx
  on public.unit_grade_redemptions (profile_id, created_at desc);

create index if not exists unit_grade_redemptions_teacher_profile_idx
  on public.unit_grade_redemptions (teacher_profile_id, status, created_at desc);

create or replace function public.academy_current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $academy_current_profile_id$
  select p.id
  from public.profiles p
  where p.account_id = auth.uid()
  limit 1
$academy_current_profile_id$;

grant execute on function public.academy_current_profile_id() to authenticated;

create or replace function public.academy_level_for_xp(total_xp integer)
returns integer
language sql
immutable
as $academy_level_for_xp$
  select greatest(1, floor(greatest(coalesce(total_xp, 0), 0)::numeric / 100)::int + 1)
$academy_level_for_xp$;

grant execute on function public.academy_level_for_xp(integer) to authenticated;

create or replace function public.academy_add_xp(
  p_profile_id uuid,
  p_delta_xp integer,
  p_reason text,
  p_source_type text default 'manual',
  p_source_ref text default null
)
returns table (xp_total integer, level integer)
language plpgsql
security definer
set search_path = public
as $academy_add_xp$
declare
  v_current_xp integer;
  v_new_xp integer;
  v_new_level integer;
begin
  if p_profile_id is null then
    raise exception 'Perfil invalido para XP';
  end if;

  select coalesce(p.xp_total, 0)
  into v_current_xp
  from public.profiles p
  where p.id = p_profile_id
  for update;

  if not found then
    raise exception 'Perfil nao encontrado para XP';
  end if;

  v_new_xp := greatest(0, v_current_xp + coalesce(p_delta_xp, 0));
  v_new_level := public.academy_level_for_xp(v_new_xp);

  update public.profiles
  set
    xp_total = v_new_xp,
    level = v_new_level
  where id = p_profile_id;

  insert into public.xp_ledger (
    profile_id,
    delta_xp,
    reason,
    source_type,
    source_ref
  )
  values (
    p_profile_id,
    coalesce(p_delta_xp, 0),
    coalesce(nullif(btrim(p_reason), ''), 'Atualizacao de XP'),
    coalesce(nullif(btrim(p_source_type), ''), 'manual'),
    p_source_ref
  );

  return query
  select v_new_xp, v_new_level;
end;
$academy_add_xp$;

grant execute on function public.academy_add_xp(uuid, integer, text, text, text) to authenticated;

create or replace function public.academy_is_teacher(
  p_profile_id uuid default public.academy_current_profile_id()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $academy_is_teacher$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and lower(coalesce(p.role, 'student')) in ('teacher', 'professor', 'admin')
  )
$academy_is_teacher$;

grant execute on function public.academy_is_teacher(uuid) to authenticated;

drop function if exists public.academy_list_teachers_for_selector(text, text, integer);
create function public.academy_list_teachers_for_selector(
  p_school text default null,
  p_subject text default null,
  p_limit integer default 100
)
returns table (
  profile_id uuid,
  nome text,
  username text,
  teacher_subject text,
  teacher_school text
)
language plpgsql
security definer
set search_path = public
as $academy_list_teachers_for_selector$
declare
  v_school text;
  v_subject text;
  v_limit integer;
begin
  v_school := lower(btrim(coalesce(p_school, '')));
  v_subject := lower(btrim(coalesce(p_subject, '')));
  v_limit := greatest(1, least(coalesce(p_limit, 100), 300));

  return query
  select
    p.id as profile_id,
    p.nome,
    p.username,
    p.teacher_subject,
    coalesce(nullif(btrim(p.teacher_school), ''), nullif(btrim(p.institution_name), ''), 'Escola') as teacher_school
  from public.profiles p
  where lower(coalesce(p.role, 'student')) in ('teacher', 'professor', 'admin')
    and (v_school = '' or lower(coalesce(p.teacher_school, p.institution_name, '')) like '%' || v_school || '%')
    and (v_subject = '' or lower(coalesce(p.teacher_subject, '')) like '%' || v_subject || '%')
  order by p.nome asc nulls last
  limit v_limit;
end;
$academy_list_teachers_for_selector$;

grant execute on function public.academy_list_teachers_for_selector(text, text, integer) to authenticated;

drop function if exists public.academy_teacher_search_students(text, integer);
create function public.academy_teacher_search_students(
  p_query text,
  p_limit integer default 16
)
returns table (
  profile_id uuid,
  username text,
  nome text,
  course_area text,
  xp_total integer,
  level integer
)
language plpgsql
security definer
set search_path = public
as $academy_teacher_search_students$
declare
  v_me uuid;
  v_term text;
  v_limit integer;
begin
  v_me := public.academy_current_profile_id();
  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_teacher(v_me) then
    raise exception 'Acesso restrito ao painel do professor';
  end if;

  v_term := lower(btrim(coalesce(p_query, '')));
  if length(v_term) < 2 then
    raise exception 'Digite pelo menos 2 caracteres para busca';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 16), 40));

  return query
  select
    p.id,
    p.username,
    p.nome,
    coalesce(p.course_area, 'base_central') as course_area,
    coalesce(p.xp_total, 0)::int as xp_total,
    coalesce(p.level, 1)::int as level
  from public.profiles p
  where lower(coalesce(p.role, 'student')) not in ('teacher', 'professor', 'admin')
    and (
      lower(coalesce(p.username, '')) like '%' || v_term || '%'
      or lower(coalesce(p.nome, '')) like '%' || v_term || '%'
    )
  order by
    (lower(coalesce(p.username, '')) = v_term) desc,
    coalesce(p.xp_total, 0) desc,
    p.created_at desc nulls last
  limit v_limit;
end;
$academy_teacher_search_students$;

grant execute on function public.academy_teacher_search_students(text, integer) to authenticated;

drop function if exists public.academy_teacher_grant_xp(uuid, integer, text, text);
create function public.academy_teacher_grant_xp(
  p_student_profile_id uuid,
  p_xp_delta integer,
  p_subject_name text,
  p_reason text default null
)
returns table (
  student_profile_id uuid,
  student_username text,
  student_nome text,
  xp_total integer,
  level integer,
  delta_xp integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $academy_teacher_grant_xp$
declare
  v_me uuid;
  v_subject text;
  v_reason text;
  v_student_role text;
  v_student_username text;
  v_student_nome text;
  v_new_xp integer;
  v_new_level integer;
begin
  v_me := public.academy_current_profile_id();
  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_teacher(v_me) then
    raise exception 'Acesso restrito ao painel do professor';
  end if;

  if p_student_profile_id is null then
    raise exception 'Aluno invalido para lancamento de XP';
  end if;

  if p_student_profile_id = v_me then
    raise exception 'Professor nao pode lancar XP para si mesmo';
  end if;

  if p_xp_delta is null or p_xp_delta <= 0 then
    raise exception 'Informe um delta de XP maior que zero';
  end if;

  if p_xp_delta > 5000 then
    raise exception 'Ajuste maximo por operacao: 5000 XP';
  end if;

  v_subject := nullif(btrim(coalesce(p_subject_name, '')), '');
  if v_subject is null then
    raise exception 'Materia obrigatoria para lancamento de XP';
  end if;

  select
    lower(coalesce(p.role, 'student')),
    p.username,
    p.nome
  into
    v_student_role,
    v_student_username,
    v_student_nome
  from public.profiles p
  where p.id = p_student_profile_id
  for update;

  if not found then
    raise exception 'Aluno nao encontrado';
  end if;

  if v_student_role in ('teacher', 'professor', 'admin') then
    raise exception 'Somente alunos podem receber XP neste fluxo';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    v_reason := format('XP liberado por atividade em %s', v_subject);
  end if;

  select a.xp_total, a.level
  into v_new_xp, v_new_level
  from public.academy_add_xp(
    p_student_profile_id,
    p_xp_delta,
    v_reason,
    'manual',
    format('teacher:%s:%s', v_me::text, v_subject)
  ) as a;

  return query
  select
    p_student_profile_id,
    v_student_username,
    v_student_nome,
    v_new_xp,
    v_new_level,
    p_xp_delta,
    v_reason;
end;
$academy_teacher_grant_xp$;

grant execute on function public.academy_teacher_grant_xp(uuid, integer, text, text) to authenticated;

drop function if exists public.request_unit_redemption_with_teacher(text, text, integer, uuid);
create function public.request_unit_redemption_with_teacher(
  p_unit_code text,
  p_subject_name text,
  p_xp_spent integer,
  p_teacher_profile_id uuid
)
returns table (
  redemption_id uuid,
  status text,
  grade_points numeric,
  xp_total integer,
  level integer
)
language plpgsql
security definer
set search_path = public
as $request_unit_redemption_with_teacher$
declare
  v_me uuid;
  v_xp_atual integer;
  v_grade_points numeric(4,2);
  v_redemption_id uuid;
  v_status text;
  v_new_xp integer;
  v_new_level integer;
  v_teacher_role text;
  v_teacher_subject text;
  v_school text;
  v_subject text;
begin
  v_me := public.academy_current_profile_id();
  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  v_school := upper(btrim(coalesce(p_unit_code, '')));
  v_subject := btrim(coalesce(p_subject_name, ''));

  if v_school = '' then
    raise exception 'Escola obrigatoria';
  end if;

  if v_subject = '' then
    raise exception 'Materia obrigatoria';
  end if;

  if p_teacher_profile_id is null then
    raise exception 'Selecione o professor da materia';
  end if;

  if p_xp_spent not in (800, 1800, 3200) then
    raise exception 'Pacote de troca invalido. Use 800, 1800 ou 3200 XP';
  end if;

  select
    lower(coalesce(p.role, 'student')),
    nullif(btrim(coalesce(p.teacher_subject, '')), '')
  into
    v_teacher_role,
    v_teacher_subject
  from public.profiles p
  where p.id = p_teacher_profile_id
  limit 1;

  if not found then
    raise exception 'Professor informado nao encontrado';
  end if;

  if v_teacher_role not in ('teacher', 'professor', 'admin') then
    raise exception 'Perfil selecionado nao e professor';
  end if;

  if v_teacher_subject is not null and lower(v_teacher_subject) <> lower(v_subject) then
    raise exception 'Professor selecionado nao corresponde a materia informada';
  end if;

  select coalesce(p.xp_total, 0)
  into v_xp_atual
  from public.profiles p
  where p.id = v_me
  for update;

  if v_xp_atual < p_xp_spent then
    raise exception 'XP insuficiente';
  end if;

  v_grade_points := case p_xp_spent
    when 800 then 0.20
    when 1800 then 0.50
    when 3200 then 1.00
  end;

  insert into public.unit_grade_redemptions (
    profile_id,
    unit_code,
    subject_name,
    teacher_profile_id,
    teacher_subject_name,
    xp_spent,
    grade_points,
    status
  )
  values (
    v_me,
    v_school,
    v_subject,
    p_teacher_profile_id,
    coalesce(v_teacher_subject, v_subject),
    p_xp_spent,
    v_grade_points,
    'pending'
  )
  returning id, unit_grade_redemptions.status
  into v_redemption_id, v_status;

  select a.xp_total, a.level
  into v_new_xp, v_new_level
  from public.academy_add_xp(
    v_me,
    -p_xp_spent,
    format('Troca de XP (%s - %s)', v_subject, v_school),
    'redemption_adjustment',
    v_redemption_id::text
  ) as a;

  return query
  select
    v_redemption_id,
    v_status,
    v_grade_points::numeric,
    v_new_xp,
    v_new_level;
end;
$request_unit_redemption_with_teacher$;

grant execute on function public.request_unit_redemption_with_teacher(text, text, integer, uuid) to authenticated;

drop function if exists public.request_unit_redemption(text, text, integer);
create function public.request_unit_redemption(
  p_unit_code text,
  p_subject_name text,
  p_xp_spent integer
)
returns table (
  redemption_id uuid,
  status text,
  grade_points numeric,
  xp_total integer,
  level integer
)
language plpgsql
security definer
set search_path = public
as $request_unit_redemption$
declare
  v_teacher_id uuid;
begin
  select p.id
  into v_teacher_id
  from public.profiles p
  where lower(coalesce(p.role, 'student')) in ('teacher', 'professor', 'admin')
    and lower(coalesce(p.teacher_subject, '')) = lower(btrim(coalesce(p_subject_name, '')))
  order by p.created_at asc nulls last
  limit 1;

  if v_teacher_id is null then
    raise exception 'Nenhum professor disponivel para esta materia';
  end if;

  return query
  select *
  from public.request_unit_redemption_with_teacher(
    p_unit_code,
    p_subject_name,
    p_xp_spent,
    v_teacher_id
  );
end;
$request_unit_redemption$;

grant execute on function public.request_unit_redemption(text, text, integer) to authenticated;

drop function if exists public.academy_teacher_pending_redemptions(integer);
create function public.academy_teacher_pending_redemptions(
  p_limit integer default 40
)
returns table (
  redemption_id uuid,
  student_profile_id uuid,
  student_username text,
  student_nome text,
  unit_code text,
  subject_name text,
  xp_spent integer,
  grade_points numeric,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $academy_teacher_pending_redemptions$
declare
  v_me uuid;
  v_limit integer;
begin
  v_me := public.academy_current_profile_id();
  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_teacher(v_me) then
    raise exception 'Acesso restrito ao painel do professor';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 40), 100));

  return query
  select
    r.id as redemption_id,
    r.profile_id as student_profile_id,
    p.username as student_username,
    p.nome as student_nome,
    r.unit_code,
    r.subject_name,
    r.xp_spent,
    r.grade_points,
    r.status,
    r.created_at
  from public.unit_grade_redemptions r
  join public.profiles p on p.id = r.profile_id
  where r.teacher_profile_id = v_me
    and r.status = 'pending'
  order by r.created_at desc
  limit v_limit;
end;
$academy_teacher_pending_redemptions$;

grant execute on function public.academy_teacher_pending_redemptions(integer) to authenticated;

drop function if exists public.academy_teacher_review_redemption(uuid, boolean, text);
create function public.academy_teacher_review_redemption(
  p_redemption_id uuid,
  p_approve boolean,
  p_reviewer_note text default null
)
returns table (
  redemption_id uuid,
  status text,
  student_profile_id uuid,
  student_username text,
  xp_total integer,
  level integer
)
language plpgsql
security definer
set search_path = public
as $academy_teacher_review_redemption$
declare
  v_me uuid;
  v_row public.unit_grade_redemptions%rowtype;
  v_new_xp integer;
  v_new_level integer;
  v_status text;
begin
  v_me := public.academy_current_profile_id();
  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_teacher(v_me) then
    raise exception 'Acesso restrito ao painel do professor';
  end if;

  if p_redemption_id is null then
    raise exception 'Troca invalida';
  end if;

  select r.*
  into v_row
  from public.unit_grade_redemptions r
  where r.id = p_redemption_id
    and r.teacher_profile_id = v_me
  for update;

  if not found then
    raise exception 'Troca nao encontrada para este professor';
  end if;

  if v_row.status <> 'pending' then
    raise exception 'Esta troca ja foi revisada';
  end if;

  if coalesce(p_approve, false) then
    v_status := 'approved';

    update public.unit_grade_redemptions
    set
      status = 'approved',
      reviewer_note = nullif(btrim(coalesce(p_reviewer_note, '')), ''),
      reviewer_profile_id = v_me,
      reviewed_at = timezone('utc', now())
    where id = v_row.id;

    select coalesce(p.xp_total, 0), coalesce(p.level, 1)
    into v_new_xp, v_new_level
    from public.profiles p
    where p.id = v_row.profile_id;
  else
    v_status := 'rejected';

    update public.unit_grade_redemptions
    set
      status = 'rejected',
      reviewer_note = nullif(btrim(coalesce(p_reviewer_note, '')), ''),
      reviewer_profile_id = v_me,
      reviewed_at = timezone('utc', now())
    where id = v_row.id;

    select a.xp_total, a.level
    into v_new_xp, v_new_level
    from public.academy_add_xp(
      v_row.profile_id,
      v_row.xp_spent,
      format('Estorno de troca recusada (%s - %s)', v_row.subject_name, v_row.unit_code),
      'redemption_adjustment',
      v_row.id::text
    ) as a;
  end if;

  return query
  select
    v_row.id,
    v_status,
    v_row.profile_id,
    p.username,
    v_new_xp,
    v_new_level
  from public.profiles p
  where p.id = v_row.profile_id
  limit 1;
end;
$academy_teacher_review_redemption$;

grant execute on function public.academy_teacher_review_redemption(uuid, boolean, text) to authenticated;

alter table public.xp_ledger enable row level security;
alter table public.unit_grade_redemptions enable row level security;

grant select on public.xp_ledger to authenticated;
grant select, insert, update on public.unit_grade_redemptions to authenticated;

drop policy if exists xp_ledger_select_own on public.xp_ledger;
create policy xp_ledger_select_own
  on public.xp_ledger
  for select
  to authenticated
  using (profile_id = public.academy_current_profile_id());

drop policy if exists unit_redemptions_select_own_or_teacher on public.unit_grade_redemptions;
create policy unit_redemptions_select_own_or_teacher
  on public.unit_grade_redemptions
  for select
  to authenticated
  using (
    profile_id = public.academy_current_profile_id()
    or teacher_profile_id = public.academy_current_profile_id()
  );

drop policy if exists unit_redemptions_insert_own on public.unit_grade_redemptions;
create policy unit_redemptions_insert_own
  on public.unit_grade_redemptions
  for insert
  to authenticated
  with check (profile_id = public.academy_current_profile_id());

drop policy if exists unit_redemptions_update_teacher on public.unit_grade_redemptions;
create policy unit_redemptions_update_teacher
  on public.unit_grade_redemptions
  for update
  to authenticated
  using (teacher_profile_id = public.academy_current_profile_id())
  with check (teacher_profile_id = public.academy_current_profile_id());

commit;

