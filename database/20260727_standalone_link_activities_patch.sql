-- NEXO 11 - atividades por link, sem turma obrigatória
-- Execute depois de 20260727_activity_share_links_patch.sql.

alter table public.academic_activities alter column classroom_id drop not null;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('academic-activities','academic-activities',true,20971520,array[
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf'
])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists academic_activities_public_read on storage.objects;
create policy academic_activities_public_read on storage.objects for select to public
using(bucket_id='academic-activities');
drop policy if exists academic_activities_teacher_upload on storage.objects;
create policy academic_activities_teacher_upload on storage.objects for insert to authenticated
with check(
  bucket_id='academic-activities'
  and exists(select 1 from public.profiles p where p.account_id=auth.uid() and lower(p.role) in ('teacher','professor'))
);

create or replace function public.xp_enforce_teacher_activity()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id();
begin
  if not exists(select 1 from public.profiles p where p.id=v_me and lower(p.role) in ('teacher','professor')) then
    raise exception 'Somente professores podem publicar atividades';
  end if;
  if new.teacher_id<>v_me then raise exception 'Professor inválido'; end if;
  if new.classroom_id is not null and not exists(
    select 1 from public.classrooms c where c.id=new.classroom_id and c.teacher_profile_id=v_me
  ) then raise exception 'Professor sem acesso à turma'; end if;
  return new;
end $$;

create or replace function public.xp_create_link_activity(
  p_title text,p_description text,p_subject_name text,p_activity_type text,p_max_xp int,
  p_grading_mode text,p_max_grade numeric,p_starts_at timestamptz,p_deadline_at timestamptz,
  p_late_policy text,p_allow_resubmission boolean,p_lower_grade_policy text,
  p_instructions text default null,p_attachment_url text default null
) returns public.academic_activities language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_activity public.academic_activities; v_limit int;
begin
  if not exists(select 1 from public.profiles p where p.id=v_me and lower(p.role) in ('teacher','professor')) then
    raise exception 'Somente professores podem publicar atividades';
  end if;
  if nullif(trim(p_title),'') is null or nullif(trim(p_subject_name),'') is null then
    raise exception 'Título e matéria são obrigatórios';
  end if;
  select coalesce((s.activity_type_limits->>p_activity_type)::int,300) into v_limit
  from public.xp_school_settings s where s.school_name=public.xp_profile_school(v_me);
  v_limit:=coalesce(v_limit,case p_activity_type when 'assessment' then 200 when 'project' then 300 else 120 end);
  if p_max_xp>v_limit then raise exception 'XP acima do limite permitido para este tipo'; end if;
  insert into public.academic_activities(
    school_name,teacher_id,classroom_id,subject_name,title,description,activity_type,max_xp,
    grading_mode,max_grade,starts_at,deadline_at,late_policy,allow_resubmission,
    lower_grade_policy,instructions,attachment_url,status
  ) values(
    public.xp_profile_school(v_me),v_me,null,trim(p_subject_name),trim(p_title),coalesce(p_description,''),
    p_activity_type,p_max_xp,p_grading_mode,coalesce(p_max_grade,10),p_starts_at,p_deadline_at,
    p_late_policy,p_allow_resubmission,p_lower_grade_policy,p_instructions,p_attachment_url,'published'
  ) returning * into v_activity;
  insert into public.xp_audit_logs(school_name,actor_profile_id,action,entity_type,entity_id,new_data)
  values(v_activity.school_name,v_me,'create_link_activity','activity',v_activity.id,to_jsonb(v_activity));
  return v_activity;
end $$;

create or replace function public.xp_activity_by_link(p_share_token uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_activity public.academic_activities; v_submission public.activity_submissions;
begin
  if v_me is null then raise exception 'Entre na sua conta para acessar a atividade'; end if;
  select * into v_activity from public.academic_activities a where a.share_token=p_share_token and a.status='published';
  if not found then raise exception 'Link de atividade inválido ou atividade arquivada'; end if;
  if v_activity.teacher_id<>v_me and not exists(
    select 1 from public.profiles p where p.id=v_me and lower(coalesce(p.role,'student'))='student'
      and public.xp_profile_school(p.id)=v_activity.school_name
  ) then raise exception 'Este link não está disponível para o seu perfil'; end if;
  select * into v_submission from public.activity_submissions s where s.activity_id=v_activity.id and s.student_id=v_me order by s.attempt_number desc limit 1;
  return jsonb_build_object(
    'activity',to_jsonb(v_activity),
    'classroom',jsonb_build_object('id',null,'name','Atividade compartilhada','subject',v_activity.subject_name),
    'last_submission',case when v_submission.id is null then null else to_jsonb(v_submission) end,
    'is_teacher',v_activity.teacher_id=v_me
  );
end $$;

create or replace function public.xp_submit_activity_link(p_share_token uuid,p_content text,p_attachment_url text default null)
returns public.activity_submissions language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_activity public.academic_activities; v_attempt int; v_submission public.activity_submissions;
begin
  select * into v_activity from public.academic_activities a where a.share_token=p_share_token and a.status='published';
  if not found then raise exception 'Link de atividade inválido ou atividade arquivada'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_me and lower(coalesce(p.role,'student'))='student' and public.xp_profile_school(p.id)=v_activity.school_name) then
    raise exception 'Somente alunos da escola podem entregar esta atividade';
  end if;
  if now()<v_activity.starts_at then raise exception 'Atividade ainda não abriu'; end if;
  if now()>v_activity.deadline_at and v_activity.late_policy='reject' then raise exception 'Prazo encerrado; entrega atrasada não aceita'; end if;
  select coalesce(max(s.attempt_number),0)+1 into v_attempt from public.activity_submissions s where s.activity_id=v_activity.id and s.student_id=v_me;
  if v_attempt>1 and not v_activity.allow_resubmission then raise exception 'Nova entrega não permitida'; end if;
  insert into public.activity_submissions(activity_id,student_id,attempt_number,content,attachment_url,is_late)
  values(v_activity.id,v_me,v_attempt,p_content,p_attachment_url,now()>v_activity.deadline_at) returning * into v_submission;
  perform public.xp_notify(v_activity.teacher_id,'activity_submission','Um aluno enviou uma atividade.',v_submission.id);
  return v_submission;
end $$;

revoke all on function public.xp_create_link_activity(text,text,text,text,int,text,numeric,timestamptz,timestamptz,text,boolean,text,text,text) from public,anon;
grant execute on function public.xp_create_link_activity(text,text,text,text,int,text,numeric,timestamptz,timestamptz,text,boolean,text,text,text) to authenticated;

