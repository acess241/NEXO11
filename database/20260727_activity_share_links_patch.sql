-- NEXO 11 - links compartilháveis de atividades
-- Execute depois de 20260727_xp_rewards_activities_v8.sql.
-- Migration aditiva: não remove atividades ou entregas existentes.

alter table public.academic_activities
  add column if not exists share_token uuid not null default gen_random_uuid();

create unique index if not exists academic_activities_share_token_uidx
  on public.academic_activities(share_token);

create or replace function public.xp_enforce_teacher_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id();
begin
  if not exists(select 1 from public.profiles p where p.id=v_me and lower(p.role) in ('teacher','professor')) then
    raise exception 'Somente professores podem publicar atividades';
  end if;
  if new.teacher_id<>v_me or not exists(
    select 1 from public.classrooms c where c.id=new.classroom_id and c.teacher_profile_id=v_me
  ) then raise exception 'Professor sem acesso a turma'; end if;
  return new;
end $$;

drop trigger if exists academic_activities_teacher_guard on public.academic_activities;
create trigger academic_activities_teacher_guard
before insert on public.academic_activities
for each row execute function public.xp_enforce_teacher_activity();

create or replace function public.xp_activity_by_link(p_share_token uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_me uuid:=public.xp_current_profile_id();
  v_activity public.academic_activities;
  v_classroom public.classrooms;
  v_submission public.activity_submissions;
begin
  if v_me is null then raise exception 'Entre na sua conta para acessar a atividade'; end if;
  select * into v_activity
  from public.academic_activities a
  where a.share_token=p_share_token and a.status='published';
  if not found then raise exception 'Link de atividade inválido ou atividade arquivada'; end if;

  if not exists(
    select 1 from public.classroom_members m
    where m.classroom_id=v_activity.classroom_id
      and m.profile_id=v_me and m.role='student' and m.status='approved'
  ) and v_activity.teacher_id<>v_me then
    raise exception 'Esta atividade pertence a outra turma';
  end if;

  select * into v_classroom from public.classrooms where id=v_activity.classroom_id;
  select * into v_submission from public.activity_submissions s
  where s.activity_id=v_activity.id and s.student_id=v_me
  order by s.attempt_number desc limit 1;

  return jsonb_build_object(
    'activity',to_jsonb(v_activity),
    'classroom',jsonb_build_object('id',v_classroom.id,'name',v_classroom.name,'subject',v_classroom.subject),
    'last_submission',case when v_submission.id is null then null else to_jsonb(v_submission) end,
    'is_teacher',v_activity.teacher_id=v_me
  );
end $$;

create or replace function public.xp_submit_activity_link(
  p_share_token uuid,p_content text,p_attachment_url text default null
) returns public.activity_submissions language plpgsql security definer set search_path=public as $$
declare v_activity_id uuid;
begin
  select a.id into v_activity_id
  from public.academic_activities a
  where a.share_token=p_share_token and a.status='published';
  if not found then raise exception 'Link de atividade inválido ou atividade arquivada'; end if;
  return public.xp_submit_activity(v_activity_id,p_content,p_attachment_url);
end $$;

revoke all on function public.xp_activity_by_link(uuid) from public,anon;
revoke all on function public.xp_submit_activity_link(uuid,text,text) from public,anon;
grant execute on function public.xp_activity_by_link(uuid) to authenticated;
grant execute on function public.xp_submit_activity_link(uuid,text,text) to authenticated;
