-- NEXO 11 — XP, ATIVIDADES E RECOMPENSAS V8
-- Migration aditiva e idempotente. Nao apaga dados existentes.
create extension if not exists pgcrypto;

create table if not exists public.xp_school_settings (
  school_name text primary key,
  daily_teacher_limit integer not null default 1000 check (daily_teacher_limit > 0),
  weekly_teacher_limit integer not null default 4000 check (weekly_teacher_limit > 0),
  monthly_teacher_limit integer not null default 12000 check (monthly_teacher_limit > 0),
  activity_type_limits jsonb not null default '{"simple_exercise":30,"question_list":50,"individual_work":100,"group_work":120,"assessment":200,"project":300,"special_participation":30}'::jsonb,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.xp_wallets (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  student_id uuid not null unique references public.profiles(id) on delete cascade,
  total_balance integer not null default 0 check (total_balance >= 0),
  reserved_balance integer not null default 0 check (reserved_balance >= 0 and reserved_balance <= total_balance),
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.academic_activities (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  classroom_id uuid not null references public.classrooms(id) on delete restrict,
  subject_name text not null,
  title text not null,
  description text not null default '',
  activity_type text not null check (activity_type in ('simple_exercise','question_list','individual_work','group_work','assessment','project','special_participation')),
  max_xp integer not null check (max_xp > 0),
  grading_mode text not null check (grading_mode in ('full','proportional','manual')),
  max_grade numeric(8,2) not null default 10 check (max_grade > 0),
  starts_at timestamptz not null,
  deadline_at timestamptz not null,
  late_policy text not null default 'none' check (late_policy in ('none','minus_10','minus_25','reject')),
  allow_resubmission boolean not null default false,
  lower_grade_policy text not null default 'keep_highest' check (lower_grade_policy in ('keep_highest','replace')),
  instructions text,
  attachment_url text,
  status text not null default 'draft' check (status in ('draft','published','closed','archived')),
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  archived_at timestamptz,
  check (deadline_at > starts_at)
);

create table if not exists public.activity_submissions (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.academic_activities(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  content text,
  attachment_url text,
  submitted_at timestamptz not null default timezone('utc',now()),
  is_late boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted','under_review','graded','returned')),
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  unique(activity_id,student_id,attempt_number)
);

create table if not exists public.activity_grades (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.academic_activities(id) on delete restrict,
  submission_id uuid not null references public.activity_submissions(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  grade numeric(8,2),
  max_grade numeric(8,2) not null,
  base_xp integer not null check (base_xp >= 0),
  late_penalty_percentage integer not null default 0 check (late_penalty_percentage in (0,10,25)),
  final_xp integer not null check (final_xp >= 0),
  previous_xp integer not null default 0 check (previous_xp >= 0),
  xp_delta integer not null,
  grading_mode text not null,
  justification text,
  version integer not null check (version > 0),
  created_at timestamptz not null default timezone('utc',now()),
  unique(submission_id,version)
);

create table if not exists public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  student_id uuid not null references public.profiles(id) on delete restrict,
  amount integer not null check (amount <> 0),
  balance_before integer not null check (balance_before >= 0),
  balance_after integer not null check (balance_after >= 0),
  transaction_type text not null check (transaction_type in ('credit','debit','reversal','correction_update','admin_adjustment')),
  origin_type text not null,
  origin_id uuid,
  reason text not null,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  idempotency_key text not null unique,
  reversed_transaction_id uuid references public.xp_transactions(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.school_rewards (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  name text not null,
  description text not null default '',
  image_url text,
  icon text not null default '🎁',
  xp_price integer not null check (xp_price > 0),
  reward_type text not null check (reward_type in ('digital','physical','event','school_benefit','custom')),
  stock integer check (stock is null or stock >= 0),
  is_active boolean not null default true,
  delivery_instructions text,
  estimated_delivery_time text,
  cancellation_policy text not null default 'before_approval' check (cancellation_policy in ('before_approval','until_ready','school_review')),
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  target_classroom_id uuid references public.classrooms(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.reward_requests (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  student_id uuid not null references public.profiles(id) on delete restrict,
  reward_id uuid not null references public.school_rewards(id) on delete restrict,
  reward_name_snapshot text not null,
  xp_price_snapshot integer not null check (xp_price_snapshot > 0),
  reward_type_snapshot text not null,
  cancellation_policy_snapshot text not null,
  status text not null default 'pending' check (status in ('pending','approved','ready','delivered','rejected','cancelled')),
  rejection_reason text,
  cancellation_reason text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  ready_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.reward_request_status_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.reward_requests(id) on delete restrict,
  previous_status text,
  new_status text not null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.nexinho_milestone_rewards (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.chat_pet_pairs(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  milestone_days integer not null,
  xp_awarded integer not null check (xp_awarded > 0),
  unique_key text not null unique,
  awarded_at timestamptz not null default timezone('utc',now()),
  unique(pair_id,student_id,milestone_days)
);

create table if not exists public.xp_audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_name text,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default timezone('utc',now())
);

create index if not exists academic_activities_class_status_idx on public.academic_activities(classroom_id,status,deadline_at);
create index if not exists activity_submissions_student_idx on public.activity_submissions(student_id,submitted_at desc);
create index if not exists activity_grades_student_idx on public.activity_grades(student_id,created_at desc);
create index if not exists xp_transactions_student_idx on public.xp_transactions(student_id,created_at desc);
create index if not exists school_rewards_school_idx on public.school_rewards(school_name,is_active);
create index if not exists reward_requests_student_idx on public.reward_requests(student_id,status,created_at desc);
create index if not exists reward_requests_school_idx on public.reward_requests(school_name,status,created_at desc);

create or replace function public.xp_current_profile_id() returns uuid
language sql stable security definer set search_path=public as $$
  select p.id from public.profiles p where p.account_id=auth.uid() limit 1
$$;

create or replace function public.xp_profile_school(p_profile_id uuid) returns text
language sql stable security definer set search_path=public as $$
  select coalesce(nullif(trim(p.institution_name),''),nullif(trim(p.teacher_school),''),'SEM_ESCOLA')
  from public.profiles p where p.id=p_profile_id
$$;

create or replace function public.xp_is_staff(p_profile_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=p_profile_id and lower(p.role) in ('teacher','professor','admin','school_admin','coordinator'))
$$;

create or replace function public.xp_is_admin(p_profile_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.id=p_profile_id and lower(p.role) in ('admin','school_admin','coordinator'))
$$;

create or replace function public.xp_notify(p_receiver uuid,p_kind text,p_message text,p_reference uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if to_regclass('public.notifications') is not null then
    insert into public.notifications(receiver_profile_id,actor_profile_id,type,metadata)
    values(p_receiver,public.xp_current_profile_id(),'message',jsonb_build_object('kind',p_kind,'text',p_message,'reference_id',p_reference));
  end if;
exception when others then null;
end $$;

create or replace function public.xp_ensure_wallet(p_student_id uuid)
returns public.xp_wallets language plpgsql security definer set search_path=public as $$
declare v_wallet public.xp_wallets; v_profile record;
begin
  select * into v_profile from public.profiles p where p.id=p_student_id for update;
  if not found then raise exception 'Aluno nao encontrado'; end if;
  insert into public.xp_wallets(school_name,student_id,total_balance)
  values(public.xp_profile_school(p_student_id),p_student_id,greatest(0,coalesce(v_profile.xp_total,0)))
  on conflict(student_id) do nothing;
  select * into v_wallet from public.xp_wallets w where w.student_id=p_student_id for update;
  return v_wallet;
end $$;

insert into public.xp_wallets(school_name,student_id,total_balance)
select public.xp_profile_school(p.id),p.id,greatest(0,coalesce(p.xp_total,0))
from public.profiles p where lower(coalesce(p.role,'student'))='student'
on conflict(student_id) do nothing;

create or replace function public.xp_apply_transaction(
  p_student_id uuid,p_amount integer,p_transaction_type text,p_origin_type text,p_origin_id uuid,
  p_reason text,p_idempotency_key text,p_responsible uuid default null,p_metadata jsonb default '{}'::jsonb,
  p_reversed_transaction_id uuid default null
) returns public.xp_transactions language plpgsql security definer set search_path=public as $$
declare v_wallet public.xp_wallets; v_tx public.xp_transactions; v_after int;
begin
  if p_amount=0 then raise exception 'Movimentacao de XP nao pode ser zero'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Motivo obrigatorio'; end if;
  select * into v_tx from public.xp_transactions where idempotency_key=p_idempotency_key;
  if found then return v_tx; end if;
  v_wallet:=public.xp_ensure_wallet(p_student_id);
  v_after:=v_wallet.total_balance+p_amount;
  if v_after<0 or v_after<v_wallet.reserved_balance then raise exception 'Saldo disponivel insuficiente'; end if;
  update public.xp_wallets set total_balance=v_after,updated_at=timezone('utc',now()) where student_id=p_student_id;
  update public.profiles set xp_total=v_after,level=public.academy_level_for_xp(v_after) where id=p_student_id;
  insert into public.xp_transactions(school_name,student_id,amount,balance_before,balance_after,transaction_type,origin_type,origin_id,reason,responsible_profile_id,idempotency_key,reversed_transaction_id,metadata)
  values(v_wallet.school_name,p_student_id,p_amount,v_wallet.total_balance,v_after,p_transaction_type,p_origin_type,p_origin_id,p_reason,p_responsible,p_idempotency_key,p_reversed_transaction_id,coalesce(p_metadata,'{}'))
  returning * into v_tx;
  insert into public.xp_ledger(profile_id,delta_xp,reason,source_type,source_ref)
  values(p_student_id,p_amount,p_reason,case when p_origin_type='nexinho_milestone' then 'pet_milestone' else 'manual' end,p_idempotency_key);
  return v_tx;
end $$;

create or replace function public.xp_award_nexinho_milestones(p_pair_id uuid,p_life_days int)
returns integer language plpgsql security definer set search_path=public as $$
declare v_pair public.chat_pet_pairs; v_conversation public.chat_conversations; v_milestone record; v_student uuid; v_key text; v_count int:=0;
begin
  select * into v_pair from public.chat_pet_pairs where id=p_pair_id for update;
  if not found then raise exception 'Dupla do Nexinho nao encontrada'; end if;
  select * into v_conversation from public.chat_conversations where id=v_pair.conversation_id;
  for v_milestone in select * from (values(1,20),(7,50),(15,75),(30,150),(50,250),(100,500),(365,1500)) as m(days,xp)
    where m.days<=greatest(p_life_days,0) order by m.days
  loop
    foreach v_student in array array[v_conversation.profile_one_id,v_conversation.profile_two_id]
    loop
      v_key:='nexinho:'||p_pair_id||':aluno:'||v_student||':marco:'||v_milestone.days;
      insert into public.nexinho_milestone_rewards(pair_id,student_id,milestone_days,xp_awarded,unique_key)
      values(p_pair_id,v_student,v_milestone.days,v_milestone.xp,v_key) on conflict(unique_key) do nothing;
      if found then
        perform public.xp_apply_transaction(v_student,v_milestone.xp,'credit','nexinho_milestone',p_pair_id,
          'Marco do Nexinho: '||v_milestone.days||' dias',v_key,null,
          jsonb_build_object('pair_id',p_pair_id,'milestone_days',v_milestone.days));
        perform public.xp_notify(v_student,'nexinho_xp','O Nexinho alcancou '||v_milestone.days||' dias. Voce recebeu '||v_milestone.xp||' XP.',p_pair_id);
        v_count:=v_count+1;
      end if;
    end loop;
  end loop;
  return v_count;
end $$;

create or replace function public.xp_create_activity(
  p_classroom_id uuid,p_title text,p_description text,p_activity_type text,p_max_xp int,p_grading_mode text,
  p_max_grade numeric,p_starts_at timestamptz,p_deadline_at timestamptz,p_late_policy text,
  p_allow_resubmission boolean,p_lower_grade_policy text,p_instructions text default null
) returns public.academic_activities language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_class public.classrooms; v_activity public.academic_activities; v_limit int;
begin
  if not exists(select 1 from public.profiles p where p.id=v_me and lower(p.role) in ('teacher','professor')) then
    raise exception 'Somente professores podem publicar atividades';
  end if;
  select * into v_class from public.classrooms c where c.id=p_classroom_id;
  if not found then raise exception 'Turma nao encontrada'; end if;
  if v_class.teacher_profile_id<>v_me then raise exception 'Professor sem acesso a turma'; end if;
  if public.xp_profile_school(v_me) is distinct from public.xp_profile_school(v_class.teacher_profile_id) then raise exception 'Turma pertence a outra escola'; end if;
  if nullif(trim(p_title),'') is null then raise exception 'Titulo obrigatorio'; end if;
  select coalesce((s.activity_type_limits->>p_activity_type)::int,300) into v_limit
  from public.xp_school_settings s where s.school_name=public.xp_profile_school(v_me);
  v_limit:=coalesce(v_limit,case p_activity_type when 'assessment' then 200 when 'project' then 300 else 120 end);
  if p_max_xp>v_limit and not public.xp_is_admin(v_me) then raise exception 'XP acima do limite permitido para este tipo'; end if;
  insert into public.academic_activities(school_name,teacher_id,classroom_id,subject_name,title,description,activity_type,max_xp,grading_mode,max_grade,starts_at,deadline_at,late_policy,allow_resubmission,lower_grade_policy,instructions,status)
  values(public.xp_profile_school(v_me),v_me,p_classroom_id,v_class.subject,trim(p_title),coalesce(p_description,''),p_activity_type,p_max_xp,p_grading_mode,coalesce(p_max_grade,10),p_starts_at,p_deadline_at,p_late_policy,p_allow_resubmission,p_lower_grade_policy,p_instructions,'published')
  returning * into v_activity;
  insert into public.xp_audit_logs(school_name,actor_profile_id,action,entity_type,entity_id,new_data)
  values(v_activity.school_name,v_me,'create','activity',v_activity.id,to_jsonb(v_activity));
  perform public.xp_notify(m.profile_id,'activity_created','Nova atividade: '||v_activity.title,v_activity.id)
  from public.classroom_members m where m.classroom_id=v_activity.classroom_id and m.role='student' and m.status='approved';
  return v_activity;
end $$;

create or replace function public.xp_submit_activity(p_activity_id uuid,p_content text,p_attachment_url text default null)
returns public.activity_submissions language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_activity public.academic_activities; v_attempt int; v_submission public.activity_submissions;
begin
  select * into v_activity from public.academic_activities a where a.id=p_activity_id and a.status='published';
  if not found then raise exception 'Atividade indisponivel'; end if;
  if not exists(select 1 from public.classroom_members m where m.classroom_id=v_activity.classroom_id and m.profile_id=v_me and m.role='student' and m.status='approved') then raise exception 'Aluno fora da turma'; end if;
  if now()<v_activity.starts_at then raise exception 'Atividade ainda nao abriu'; end if;
  if now()>v_activity.deadline_at and v_activity.late_policy='reject' then raise exception 'Prazo encerrado; entrega atrasada nao aceita'; end if;
  select coalesce(max(s.attempt_number),0)+1 into v_attempt from public.activity_submissions s where s.activity_id=p_activity_id and s.student_id=v_me;
  if v_attempt>1 and not v_activity.allow_resubmission then raise exception 'Nova entrega nao permitida'; end if;
  insert into public.activity_submissions(activity_id,student_id,attempt_number,content,attachment_url,is_late)
  values(p_activity_id,v_me,v_attempt,p_content,p_attachment_url,now()>v_activity.deadline_at) returning * into v_submission;
  perform public.xp_notify(v_activity.teacher_id,'activity_submission','Um aluno enviou uma atividade.',v_submission.id);
  return v_submission;
end $$;

create or replace function public.xp_grade_submission(
  p_submission_id uuid,p_grade numeric default null,p_manual_xp int default null,p_justification text default null
) returns public.activity_grades language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_s public.activity_submissions; v_a public.academic_activities;
  v_previous int:=0; v_base int; v_penalty int; v_final int; v_delta int; v_version int; v_grade public.activity_grades;
  v_settings public.xp_school_settings; v_day int; v_week int; v_month int;
begin
  select * into v_s from public.activity_submissions s where s.id=p_submission_id for update;
  select * into v_a from public.academic_activities a where a.id=v_s.activity_id;
  if v_a.teacher_id<>v_me and not public.xp_is_admin(v_me) then raise exception 'Professor sem permissao para corrigir'; end if;
  if v_s.student_id=v_me then raise exception 'Aluno nao pode corrigir a propria atividade'; end if;
  if v_a.grading_mode='manual' then
    if p_manual_xp is null or p_manual_xp<0 or p_manual_xp>v_a.max_xp then raise exception 'XP manual invalido'; end if;
    if nullif(trim(p_justification),'') is null then raise exception 'Justificativa obrigatoria no modo manual'; end if;
    v_base:=p_manual_xp;
  elsif v_a.grading_mode='full' then v_base:=v_a.max_xp;
  else
    if p_grade is null or p_grade<0 or p_grade>v_a.max_grade then raise exception 'Nota invalida'; end if;
    v_base:=round(v_a.max_xp*(p_grade/v_a.max_grade));
  end if;
  v_penalty:=case when v_s.is_late and v_a.late_policy='minus_10' then 10 when v_s.is_late and v_a.late_policy='minus_25' then 25 else 0 end;
  v_final:=round(v_base*(100-v_penalty)/100.0);
  select coalesce(g.final_xp,0) into v_previous from public.activity_grades g where g.activity_id=v_a.id and g.student_id=v_s.student_id order by g.version desc limit 1;
  v_previous:=coalesce(v_previous,0);
  if v_a.lower_grade_policy='keep_highest' and v_final<v_previous then v_final:=v_previous; end if;
  v_delta:=v_final-v_previous;
  select coalesce(max(g.version),0)+1 into v_version from public.activity_grades g where g.activity_id=v_a.id and g.student_id=v_s.student_id;
  if v_delta>0 and not public.xp_is_admin(v_me) then
    select * into v_settings from public.xp_school_settings where school_name=v_a.school_name;
    select coalesce(sum(greatest(t.amount,0)),0)::int into v_day from public.xp_transactions t where t.responsible_profile_id=v_me and t.origin_type='activity_grade' and t.created_at>=date_trunc('day',now());
    select coalesce(sum(greatest(t.amount,0)),0)::int into v_week from public.xp_transactions t where t.responsible_profile_id=v_me and t.origin_type='activity_grade' and t.created_at>=date_trunc('week',now());
    select coalesce(sum(greatest(t.amount,0)),0)::int into v_month from public.xp_transactions t where t.responsible_profile_id=v_me and t.origin_type='activity_grade' and t.created_at>=date_trunc('month',now());
    if v_day+v_delta>coalesce(v_settings.daily_teacher_limit,1000) then raise exception 'Limite diario de XP do professor excedido'; end if;
    if v_week+v_delta>coalesce(v_settings.weekly_teacher_limit,4000) then raise exception 'Limite semanal de XP do professor excedido'; end if;
    if v_month+v_delta>coalesce(v_settings.monthly_teacher_limit,12000) then raise exception 'Limite mensal de XP do professor excedido'; end if;
  end if;
  if v_delta<0 then perform public.xp_ensure_wallet(v_s.student_id); end if;
  insert into public.activity_grades(activity_id,submission_id,student_id,teacher_id,grade,max_grade,base_xp,late_penalty_percentage,final_xp,previous_xp,xp_delta,grading_mode,justification,version)
  values(v_a.id,v_s.id,v_s.student_id,v_me,p_grade,v_a.max_grade,v_base,v_penalty,v_final,v_previous,v_delta,v_a.grading_mode,p_justification,v_version) returning * into v_grade;
  if v_delta<>0 then
    perform public.xp_apply_transaction(v_s.student_id,v_delta,case when v_previous=0 then 'credit' else 'correction_update' end,'activity_grade',v_grade.id,
      case when v_previous=0 then 'Correcao: '||v_a.title else 'Atualizacao da correcao: '||v_a.title end,
      'activity:'||v_a.id||':student:'||v_s.student_id||':grade_version:'||v_version,v_me,
      jsonb_build_object('previous_xp',v_previous,'new_xp',v_final,'base_xp',v_base,'late_penalty',v_penalty));
  end if;
  update public.activity_submissions set status='graded',updated_at=timezone('utc',now()) where id=v_s.id;
  perform public.xp_notify(v_s.student_id,'activity_graded','Sua atividade foi corrigida. XP: '||v_final,v_grade.id);
  return v_grade;
end $$;

create or replace function public.xp_request_reward(p_reward_id uuid)
returns public.reward_requests language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_reward public.school_rewards; v_wallet public.xp_wallets; v_request public.reward_requests;
begin
  select * into v_reward from public.school_rewards r where r.id=p_reward_id and r.is_active for update;
  if not found or v_reward.school_name<>public.xp_profile_school(v_me) then raise exception 'Recompensa indisponivel'; end if;
  if v_reward.stock is not null and v_reward.stock<=0 then raise exception 'Recompensa sem estoque'; end if;
  v_wallet:=public.xp_ensure_wallet(v_me);
  if v_wallet.total_balance-v_wallet.reserved_balance<v_reward.xp_price then raise exception 'XP disponivel insuficiente'; end if;
  update public.xp_wallets set reserved_balance=reserved_balance+v_reward.xp_price,updated_at=timezone('utc',now()) where student_id=v_me;
  insert into public.reward_requests(school_name,student_id,reward_id,reward_name_snapshot,xp_price_snapshot,reward_type_snapshot,cancellation_policy_snapshot)
  values(v_reward.school_name,v_me,v_reward.id,v_reward.name,v_reward.xp_price,v_reward.reward_type,v_reward.cancellation_policy)
  returning * into v_request;
  insert into public.reward_request_status_history(request_id,new_status,actor_profile_id,note) values(v_request.id,'pending',v_me,'XP reservado');
  perform public.xp_notify(v_me,'reward_requested','Solicitacao criada. O XP esta reservado.',v_request.id);
  if v_reward.responsible_profile_id is not null then perform public.xp_notify(v_reward.responsible_profile_id,'reward_requested','Nova solicitacao de recompensa.',v_request.id); end if;
  return v_request;
end $$;

create or replace function public.xp_cancel_reward_request(p_request_id uuid,p_reason text default null)
returns public.reward_requests language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_request public.reward_requests;
begin
  select * into v_request from public.reward_requests r where r.id=p_request_id and r.student_id=v_me for update;
  if not found or v_request.status<>'pending' then raise exception 'Solicitacao nao pode ser cancelada'; end if;
  update public.xp_wallets set reserved_balance=reserved_balance-v_request.xp_price_snapshot,updated_at=timezone('utc',now()) where student_id=v_me and reserved_balance>=v_request.xp_price_snapshot;
  update public.reward_requests set status='cancelled',cancellation_reason=p_reason,cancelled_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=p_request_id returning * into v_request;
  insert into public.reward_request_status_history(request_id,previous_status,new_status,actor_profile_id,note) values(v_request.id,'pending','cancelled',v_me,p_reason);
  if exists(select 1 from public.school_rewards where id=v_request.reward_id and responsible_profile_id is not null) then
    perform public.xp_notify(r.responsible_profile_id,'reward_cancelled','O aluno cancelou uma solicitacao.',v_request.id)
    from public.school_rewards r where r.id=v_request.reward_id;
  end if;
  return v_request;
end $$;

create or replace function public.xp_review_reward_request(p_request_id uuid,p_approve boolean,p_reason text default null)
returns public.reward_requests language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_request public.reward_requests; v_reward public.school_rewards;
begin
  select * into v_request from public.reward_requests r where r.id=p_request_id for update;
  if not found or v_request.status<>'pending' then raise exception 'Solicitacao ja processada'; end if;
  if public.xp_profile_school(v_me)<>v_request.school_name or not public.xp_is_staff(v_me) then raise exception 'Sem permissao'; end if;
  if not p_approve and nullif(trim(p_reason),'') is null then raise exception 'Motivo da recusa obrigatorio'; end if;
  update public.xp_wallets set reserved_balance=reserved_balance-v_request.xp_price_snapshot,updated_at=timezone('utc',now()) where student_id=v_request.student_id and reserved_balance>=v_request.xp_price_snapshot;
  if p_approve then
    perform public.xp_apply_transaction(v_request.student_id,-v_request.xp_price_snapshot,'debit','reward_request',v_request.id,'Recompensa: '||v_request.reward_name_snapshot,'reward_request:'||v_request.id||':approved',v_me);
    select * into v_reward from public.school_rewards where id=v_request.reward_id for update;
    if v_reward.stock is not null then update public.school_rewards set stock=greatest(0,stock-1),updated_at=timezone('utc',now()) where id=v_reward.id; end if;
    update public.reward_requests set status=case when reward_type_snapshot='digital' then 'delivered' else 'approved' end,reviewed_by=v_me,reviewed_at=timezone('utc',now()),delivered_at=case when reward_type_snapshot='digital' then timezone('utc',now()) else null end,updated_at=timezone('utc',now()) where id=p_request_id returning * into v_request;
  else
    update public.reward_requests set status='rejected',rejection_reason=trim(p_reason),reviewed_by=v_me,reviewed_at=timezone('utc',now()),updated_at=timezone('utc',now()) where id=p_request_id returning * into v_request;
  end if;
  insert into public.reward_request_status_history(request_id,previous_status,new_status,actor_profile_id,note) values(v_request.id,'pending',v_request.status,v_me,p_reason);
  perform public.xp_notify(v_request.student_id,'reward_reviewed',case when p_approve then 'Sua recompensa foi aprovada.' else 'Sua recompensa foi recusada: '||p_reason end,v_request.id);
  return v_request;
end $$;

create or replace function public.xp_update_reward_status(p_request_id uuid,p_status text,p_note text default null)
returns public.reward_requests language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_request public.reward_requests; v_old text;
begin
  select * into v_request from public.reward_requests where id=p_request_id for update;
  if not public.xp_is_staff(v_me) or public.xp_profile_school(v_me)<>v_request.school_name then raise exception 'Sem permissao'; end if;
  v_old:=v_request.status;
  if not ((v_old='approved' and p_status='ready') or (v_old in ('approved','ready') and p_status='delivered')) then raise exception 'Mudanca de status invalida'; end if;
  update public.reward_requests set status=p_status,ready_at=case when p_status='ready' then timezone('utc',now()) else ready_at end,delivered_at=case when p_status='delivered' then timezone('utc',now()) else delivered_at end,updated_at=timezone('utc',now()) where id=p_request_id returning * into v_request;
  insert into public.reward_request_status_history(request_id,previous_status,new_status,actor_profile_id,note) values(v_request.id,v_old,p_status,v_me,p_note);
  perform public.xp_notify(v_request.student_id,'reward_status','Sua recompensa agora esta: '||p_status,v_request.id);
  return v_request;
end $$;

create or replace function public.xp_save_reward(
  p_reward_id uuid,p_name text,p_description text,p_icon text,p_xp_price int,p_reward_type text,
  p_stock int default null,p_cancellation_policy text default 'Pode cancelar enquanto estiver pendente.'
) returns public.school_rewards language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_school text:=public.xp_profile_school(v_me); v_reward public.school_rewards;
begin
  if not public.xp_is_admin(v_me) then raise exception 'Somente a gestao pode editar recompensas'; end if;
  if nullif(trim(p_name),'') is null or p_xp_price<=0 then raise exception 'Nome e preco em XP sao obrigatorios'; end if;
  if p_reward_type not in ('digital','physical','event','school_benefit','custom') then raise exception 'Tipo de recompensa invalido'; end if;
  if p_stock is not null and p_stock<0 then raise exception 'Estoque invalido'; end if;
  if p_reward_id is null then
    insert into public.school_rewards(school_name,name,description,icon,xp_price,reward_type,stock,cancellation_policy,created_by)
    values(v_school,trim(p_name),coalesce(p_description,''),coalesce(nullif(p_icon,''),'🎁'),p_xp_price,p_reward_type,p_stock,
      case when p_cancellation_policy in ('before_approval','until_ready','school_review') then p_cancellation_policy else 'before_approval' end,v_me)
    returning * into v_reward;
  else
    update public.school_rewards set name=trim(p_name),description=coalesce(p_description,''),icon=coalesce(nullif(p_icon,''),'🎁'),
      xp_price=p_xp_price,reward_type=p_reward_type,stock=p_stock,cancellation_policy=
      case when p_cancellation_policy in ('before_approval','until_ready','school_review') then p_cancellation_policy else 'before_approval' end,updated_at=timezone('utc',now())
    where id=p_reward_id and school_name=v_school returning * into v_reward;
    if not found then raise exception 'Recompensa nao encontrada'; end if;
  end if;
  insert into public.xp_audit_logs(school_name,actor_profile_id,action,entity_type,entity_id,new_data)
  values(v_school,v_me,case when p_reward_id is null then 'create' else 'update' end,'reward',v_reward.id,to_jsonb(v_reward));
  return v_reward;
end $$;

create or replace function public.xp_set_reward_active(p_reward_id uuid,p_active boolean)
returns public.school_rewards language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_reward public.school_rewards;
begin
  if not public.xp_is_admin(v_me) then raise exception 'Somente a gestao pode alterar recompensas'; end if;
  update public.school_rewards set is_active=p_active,updated_at=timezone('utc',now())
  where id=p_reward_id and school_name=public.xp_profile_school(v_me) returning * into v_reward;
  if not found then raise exception 'Recompensa nao encontrada'; end if;
  return v_reward;
end $$;

create or replace function public.xp_archive_activity(p_activity_id uuid)
returns public.academic_activities language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_activity public.academic_activities;
begin
  update public.academic_activities set status='archived',updated_at=timezone('utc',now())
  where id=p_activity_id and (teacher_id=v_me or public.xp_is_admin(v_me)) returning * into v_activity;
  if not found then raise exception 'Atividade nao encontrada ou sem permissao'; end if;
  return v_activity;
end $$;

create or replace function public.xp_admin_adjust(p_student_id uuid,p_amount int,p_reason text)
returns public.xp_transactions language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_tx public.xp_transactions;
begin
  if not public.xp_is_admin(v_me) then raise exception 'Somente a gestao pode ajustar XP'; end if;
  if p_amount=0 or nullif(trim(p_reason),'') is null then raise exception 'Valor e justificativa obrigatorios'; end if;
  if public.xp_profile_school(v_me) is distinct from public.xp_profile_school(p_student_id) then raise exception 'Aluno pertence a outra escola'; end if;
  v_tx:=public.xp_apply_transaction(p_student_id,p_amount,'admin_adjustment','admin',v_me,trim(p_reason),
    'admin:'||v_me||':'||p_student_id||':'||extract(epoch from clock_timestamp())::text,v_me);
  insert into public.xp_audit_logs(school_name,actor_profile_id,action,entity_type,entity_id,new_data)
  values(public.xp_profile_school(v_me),v_me,'manual_adjustment','profile',p_student_id,to_jsonb(v_tx));
  return v_tx;
end $$;

create or replace function public.xp_reverse_transaction(p_transaction_id uuid,p_reason text)
returns public.xp_transactions language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_original public.xp_transactions; v_tx public.xp_transactions;
begin
  if not public.xp_is_admin(v_me) then raise exception 'Somente a gestao pode estornar XP'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'Justificativa obrigatoria'; end if;
  select * into v_original from public.xp_transactions where id=p_transaction_id for update;
  if not found or v_original.school_name<>public.xp_profile_school(v_me) then raise exception 'Transacao nao encontrada'; end if;
  if exists(select 1 from public.xp_transactions where reversed_transaction_id=v_original.id) then raise exception 'Transacao ja estornada'; end if;
  v_tx:=public.xp_apply_transaction(
    p_student_id=>v_original.student_id,p_amount=>-v_original.amount,p_transaction_type=>'reversal',
    p_origin_type=>'transaction',p_origin_id=>v_original.id,p_reason=>trim(p_reason),
    p_idempotency_key=>'reversal:'||v_original.id,p_responsible=>v_me,
    p_metadata=>jsonb_build_object('original_amount',v_original.amount),p_reversed_transaction_id=>v_original.id
  );
  return v_tx;
end $$;

create or replace function public.xp_dashboard()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_wallet public.xp_wallets;
begin
  v_wallet:=public.xp_ensure_wallet(v_me);
  return jsonb_build_object(
    'wallet',jsonb_build_object('total',v_wallet.total_balance,'reserved',v_wallet.reserved_balance,'available',v_wallet.total_balance-v_wallet.reserved_balance),
    'rewards',coalesce((select jsonb_agg(to_jsonb(r) order by r.xp_price) from public.school_rewards r where r.school_name=v_wallet.school_name and r.is_active and (r.stock is null or r.stock>0)),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(q) order by q.created_at desc) from public.reward_requests q where q.student_id=v_me),'[]'::jsonb),
    'request_history',coalesce((select jsonb_agg(to_jsonb(h) order by h.created_at) from public.reward_request_status_history h join public.reward_requests q on q.id=h.request_id where q.student_id=v_me),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (select * from public.xp_transactions where student_id=v_me order by created_at desc limit 100)t),'[]'::jsonb),
    'activities',coalesce((select jsonb_agg(to_jsonb(a) order by a.deadline_at) from public.academic_activities a join public.classroom_members m on m.classroom_id=a.classroom_id and m.profile_id=v_me and m.status='approved' where a.status='published'),'[]'::jsonb)
  );
end $$;

create or replace function public.xp_staff_dashboard()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.xp_current_profile_id(); v_school text:=public.xp_profile_school(v_me);
begin
  if not public.xp_is_staff(v_me) then raise exception 'Acesso restrito'; end if;
  return jsonb_build_object(
    'classrooms',coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.classrooms c where c.teacher_profile_id=v_me or public.xp_is_admin(v_me)),'[]'::jsonb),
    'activities',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from public.academic_activities a where a.school_name=v_school and (a.teacher_id=v_me or public.xp_is_admin(v_me))),'[]'::jsonb),
    'submissions',coalesce((select jsonb_agg(to_jsonb(x) order by x.submitted_at desc) from (
      select s.*,a.title activity_title,a.max_xp,a.grading_mode,a.max_grade,p.nome student_name,p.username student_username
      from public.activity_submissions s join public.academic_activities a on a.id=s.activity_id join public.profiles p on p.id=s.student_id
      where a.school_name=v_school and (a.teacher_id=v_me or public.xp_is_admin(v_me))
    )x),'[]'::jsonb),
    'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.reward_requests r where r.school_name=v_school and r.status in ('pending','approved','ready')),'[]'::jsonb),
    'rewards',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.school_rewards r where r.school_name=v_school),'[]'::jsonb),
    'students',coalesce((select jsonb_agg(to_jsonb(x) order by x.nome) from (
      select p.id,p.nome,p.username,p.institution_name,w.total_balance,w.reserved_balance,(w.total_balance-w.reserved_balance) available_balance
      from public.profiles p join public.xp_wallets w on w.student_id=p.id where w.school_name=v_school
    )x),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from (
      select x.*,p.nome student_name from public.xp_transactions x join public.profiles p on p.id=x.student_id
      where x.school_name=v_school order by x.created_at desc limit 500
    )t),'[]'::jsonb)
  );
end $$;

revoke all on function public.xp_apply_transaction(uuid,integer,text,text,uuid,text,text,uuid,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.xp_ensure_wallet(uuid) from public,anon,authenticated;
revoke all on function public.xp_notify(uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function public.xp_award_nexinho_milestones(uuid,int) from public,anon,authenticated;
grant execute on function public.xp_dashboard() to authenticated;
grant execute on function public.xp_staff_dashboard() to authenticated;
grant execute on function public.xp_create_activity(uuid,text,text,text,int,text,numeric,timestamptz,timestamptz,text,boolean,text,text) to authenticated;
grant execute on function public.xp_submit_activity(uuid,text,text) to authenticated;
grant execute on function public.xp_grade_submission(uuid,numeric,int,text) to authenticated;
grant execute on function public.xp_request_reward(uuid) to authenticated;
grant execute on function public.xp_cancel_reward_request(uuid,text) to authenticated;
grant execute on function public.xp_review_reward_request(uuid,boolean,text) to authenticated;
grant execute on function public.xp_update_reward_status(uuid,text,text) to authenticated;
grant execute on function public.xp_save_reward(uuid,text,text,text,int,text,int,text) to authenticated;
grant execute on function public.xp_set_reward_active(uuid,boolean) to authenticated;
grant execute on function public.xp_archive_activity(uuid) to authenticated;
grant execute on function public.xp_admin_adjust(uuid,int,text) to authenticated;
grant execute on function public.xp_reverse_transaction(uuid,text) to authenticated;

alter table public.xp_wallets enable row level security;
alter table public.academic_activities enable row level security;
alter table public.activity_submissions enable row level security;
alter table public.activity_grades enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.school_rewards enable row level security;
alter table public.reward_requests enable row level security;
alter table public.reward_request_status_history enable row level security;
alter table public.nexinho_milestone_rewards enable row level security;
alter table public.xp_audit_logs enable row level security;

drop policy if exists xp_wallet_own on public.xp_wallets;
create policy xp_wallet_own on public.xp_wallets for select to authenticated using(student_id=public.xp_current_profile_id() or (public.xp_is_staff(public.xp_current_profile_id()) and school_name=public.xp_profile_school(public.xp_current_profile_id())));
drop policy if exists activities_school_read on public.academic_activities;
create policy activities_school_read on public.academic_activities for select to authenticated using(school_name=public.xp_profile_school(public.xp_current_profile_id()));
drop policy if exists submissions_scope_read on public.activity_submissions;
create policy submissions_scope_read on public.activity_submissions for select to authenticated using(student_id=public.xp_current_profile_id() or exists(select 1 from public.academic_activities a where a.id=activity_id and a.teacher_id=public.xp_current_profile_id()) or public.xp_is_admin(public.xp_current_profile_id()));
drop policy if exists grades_scope_read on public.activity_grades;
create policy grades_scope_read on public.activity_grades for select to authenticated using(student_id=public.xp_current_profile_id() or teacher_id=public.xp_current_profile_id() or public.xp_is_admin(public.xp_current_profile_id()));
drop policy if exists transactions_scope_read on public.xp_transactions;
create policy transactions_scope_read on public.xp_transactions for select to authenticated using(student_id=public.xp_current_profile_id() or (public.xp_is_staff(public.xp_current_profile_id()) and school_name=public.xp_profile_school(public.xp_current_profile_id())));
drop policy if exists rewards_school_read on public.school_rewards;
create policy rewards_school_read on public.school_rewards for select to authenticated using(school_name=public.xp_profile_school(public.xp_current_profile_id()));
drop policy if exists requests_scope_read on public.reward_requests;
create policy requests_scope_read on public.reward_requests for select to authenticated using(student_id=public.xp_current_profile_id() or (public.xp_is_staff(public.xp_current_profile_id()) and school_name=public.xp_profile_school(public.xp_current_profile_id())));
drop policy if exists request_history_scope_read on public.reward_request_status_history;
create policy request_history_scope_read on public.reward_request_status_history for select to authenticated using(exists(select 1 from public.reward_requests r where r.id=request_id and (r.student_id=public.xp_current_profile_id() or (public.xp_is_staff(public.xp_current_profile_id()) and r.school_name=public.xp_profile_school(public.xp_current_profile_id())))));
drop policy if exists milestone_own_read on public.nexinho_milestone_rewards;
create policy milestone_own_read on public.nexinho_milestone_rewards for select to authenticated using(student_id=public.xp_current_profile_id());

-- Escritas diretas ficam sem policy: somente as funcoes security definer movimentam saldo e estados.
