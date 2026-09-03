-- A troca de XP por nota so pode ocorrer entre aluno e professor vinculados
-- por uma matricula aprovada em uma turma.

create or replace function public.academy_has_teacher_link(
  p_teacher_profile_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $academy_has_teacher_link$
  select exists (
    select 1
    from public.classroom_members cm
    join public.classrooms c on c.id = cm.classroom_id
    where cm.profile_id = public.academy_current_profile_id()
      and cm.role = 'student'
      and cm.status = 'approved'
      and c.teacher_profile_id = p_teacher_profile_id
  )
$academy_has_teacher_link$;

grant execute on function public.academy_has_teacher_link(uuid) to authenticated;

create or replace function public.request_unit_redemption_with_teacher(
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
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then raise exception 'Perfil do usuario nao encontrado'; end if;
  if p_xp_spent is null or p_xp_spent < 20 then raise exception 'Minimo 20 XP por troca'; end if;
  if coalesce(btrim(p_unit_code), '') = '' then raise exception 'Unidade obrigatoria'; end if;
  if coalesce(btrim(p_subject_name), '') = '' then raise exception 'Materia obrigatoria'; end if;
  if p_teacher_profile_id is null then raise exception 'Selecione o professor da materia'; end if;

  select lower(coalesce(p.role, 'student')), nullif(btrim(coalesce(p.teacher_subject, '')), '')
  into v_teacher_role, v_teacher_subject
  from public.profiles p
  where p.id = p_teacher_profile_id
  limit 1;

  if not found then raise exception 'Professor informado nao encontrado'; end if;
  if v_teacher_role not in ('teacher', 'professor', 'admin') then
    raise exception 'Perfil selecionado nao e professor';
  end if;
  if v_teacher_subject is not null and lower(v_teacher_subject) <> lower(btrim(p_subject_name)) then
    raise exception 'Professor selecionado nao corresponde a materia informada';
  end if;
  if not public.academy_has_teacher_link(p_teacher_profile_id) then
    raise exception 'Vinculo com o professor obrigatorio para trocar XP';
  end if;

  select coalesce(p.xp_total, 0)
  into v_xp_atual
  from public.profiles p
  where p.id = v_me
  for update;

  if v_xp_atual < p_xp_spent then raise exception 'XP insuficiente'; end if;

  v_grade_points := round((p_xp_spent::numeric / 100), 2);

  insert into public.unit_grade_redemptions (
    profile_id, unit_code, subject_name, teacher_profile_id,
    teacher_subject_name, xp_spent, grade_points, status
  ) values (
    v_me, upper(btrim(p_unit_code)), btrim(p_subject_name), p_teacher_profile_id,
    coalesce(v_teacher_subject, btrim(p_subject_name)), p_xp_spent, v_grade_points, 'pending'
  ) returning id, unit_grade_redemptions.status into v_redemption_id, v_status;

  select a.xp_total, a.level
  into v_new_xp, v_new_level
  from public.academy_add_xp(
    v_me, -p_xp_spent,
    format('Troca de XP da unidade %s (%s)', upper(btrim(p_unit_code)), btrim(p_subject_name)),
    'redemption_adjustment', v_redemption_id::text
  ) as a;

  return query select v_redemption_id, v_status, v_grade_points, v_new_xp, v_new_level;
end;
$request_unit_redemption_with_teacher$;

grant execute on function public.request_unit_redemption_with_teacher(text, text, integer, uuid) to authenticated;
