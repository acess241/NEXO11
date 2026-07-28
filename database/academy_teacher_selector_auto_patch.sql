-- Nexo 11 - Patch: professores entram automaticamente na area de selecao
-- Objetivo:
-- 1) Garantir role de professor normalizada
-- 2) Garantir escola e materia do professor preenchidas no profile
-- 3) Expor funcao RPC para listar professores por escola/materia

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'role'
  ) then
    alter table public.profiles add column role text not null default 'student';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'teacher_subject'
  ) then
    alter table public.profiles add column teacher_subject text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'teacher_school'
  ) then
    alter table public.profiles add column teacher_school text;
  end if;
end
$$;

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

-- Backfill de professores existentes
update public.profiles
set role = case
  when lower(coalesce(role, '')) in ('teacher', 'professor', 'docente') then 'teacher'
  when lower(coalesce(role, '')) in ('admin', 'adm') then 'admin'
  else coalesce(role, 'student')
end;

update public.profiles
set teacher_school = coalesce(nullif(btrim(teacher_school), ''), nullif(btrim(institution_name), ''))
where lower(coalesce(role, 'student')) in ('teacher', 'professor', 'admin')
  and coalesce(nullif(btrim(teacher_school), ''), '') = '';

create index if not exists profiles_teacher_selector_idx
  on public.profiles (role, teacher_school, teacher_subject, nome);

create or replace function public.academy_list_teachers_for_selector(
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

