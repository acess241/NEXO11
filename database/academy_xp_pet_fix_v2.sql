create extension if not exists pgcrypto;

-- ===============================================
-- 1) PERFIL ACADEMIA (CURSO + XP + NIVEL)
-- ===============================================
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'course_area'
  ) then
    alter table public.profiles
      add column course_area text not null default 'base_central';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'xp_total'
  ) then
    alter table public.profiles
      add column xp_total integer not null default 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'level'
  ) then
    alter table public.profiles
      add column level integer not null default 1;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_course_area_check'
  ) then
    alter table public.profiles
      add constraint profiles_course_area_check
      check (
        course_area in (
          'informatica',
          'administracao',
          'enfermagem',
          'agro',
          'base_central',
          'outros'
        )
      );
  end if;
end $$;

update public.profiles
set
  xp_total = coalesce(xp_total, 0),
  level = greatest(1, floor(greatest(coalesce(xp_total, 0), 0)::numeric / 100)::int + 1);

-- ===============================================
-- 2) TABELAS ACADEMIA
-- ===============================================
create table if not exists public.learning_activities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  activity_type text not null check (activity_type in ('course', 'base')),
  course_area text,
  xp_reward integer not null default 12 check (xp_reward between 1 and 300),
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  constraint learning_activities_course_area_check check (
    (activity_type = 'base' and course_area is null)
    or (activity_type = 'course' and course_area is not null)
  )
);

create index if not exists learning_activities_type_idx
  on public.learning_activities (activity_type, course_area, is_active);

create table if not exists public.xp_ledger (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  delta_xp integer not null,
  reason text not null,
  source_type text not null default 'manual' check (
    source_type in (
      'daily_activity',
      'pet_milestone',
      'redemption_adjustment',
      'unit_bonus',
      'admin',
      'manual'
    )
  ),
  source_ref text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists xp_ledger_profile_created_idx
  on public.xp_ledger (profile_id, created_at desc);

-- GARANTE A TABELA QUE ESTAVA FALTANDO NO TEU ERRO
create table if not exists public.unit_grade_redemptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  unit_code text not null,
  subject_name text not null,
  xp_spent integer not null check (xp_spent > 0),
  grade_points numeric(4,2) not null check (grade_points > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_note text,
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz
);

create index if not exists unit_grade_redemptions_profile_created_idx
  on public.unit_grade_redemptions (profile_id, created_at desc);

-- ===============================================
-- 3) PET EM DUPLA (COM CONVITE)
-- ===============================================
create table if not exists public.chat_pet_pairs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.chat_conversations (id) on delete cascade,
  pet_name text not null default 'Nexinho',
  pet_species text not null default 'nexofox',
  life_days integer not null default 0 check (life_days >= 0),
  status text not null default 'alive' check (status in ('alive', 'resting', 'down')),
  last_growth_date date,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_pet_invitations (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  inviter_profile_id uuid not null references public.profiles (id) on delete cascade,
  invitee_profile_id uuid not null references public.profiles (id) on delete cascade,
  pet_name text not null default 'Nexinho',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'canceled')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  constraint chat_pet_invites_no_self check (inviter_profile_id <> invitee_profile_id)
);

create index if not exists chat_pet_invitations_conversation_idx
  on public.chat_pet_invitations (conversation_id, created_at desc);

create unique index if not exists chat_pet_invitations_pending_unique
  on public.chat_pet_invitations (conversation_id)
  where status = 'pending';

create table if not exists public.chat_pet_daily_tasks (
  id uuid primary key default gen_random_uuid(),
  pet_pair_id uuid not null references public.chat_pet_pairs (id) on delete cascade,
  challenge_date date not null default current_date,
  activity_id uuid not null references public.learning_activities (id),
  challenge_scope text not null check (challenge_scope in ('course', 'base')),
  duo_completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  unique (pet_pair_id, challenge_date)
);

create index if not exists chat_pet_daily_tasks_pair_date_idx
  on public.chat_pet_daily_tasks (pet_pair_id, challenge_date desc);

create table if not exists public.chat_pet_daily_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.chat_pet_daily_tasks (id) on delete cascade,
  pet_pair_id uuid not null references public.chat_pet_pairs (id) on delete cascade,
  challenge_date date not null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  unique (task_id, profile_id)
);

create index if not exists chat_pet_daily_completions_task_idx
  on public.chat_pet_daily_completions (task_id, created_at);

create index if not exists chat_pet_daily_completions_profile_idx
  on public.chat_pet_daily_completions (profile_id, created_at desc);

-- ===============================================
-- 4) CARGA INICIAL DE ATIVIDADES
-- ===============================================
insert into public.learning_activities (title, description, activity_type, course_area, xp_reward)
select 'Debug de Algoritmo', 'Corrigir um algoritmo com bug e explicar o ajuste.', 'course', 'informatica', 14
where not exists (select 1 from public.learning_activities where title = 'Debug de Algoritmo');

insert into public.learning_activities (title, description, activity_type, course_area, xp_reward)
select 'SQL Rapido', 'Criar consulta com filtro, ordenacao e agrupamento.', 'course', 'informatica', 14
where not exists (select 1 from public.learning_activities where title = 'SQL Rapido');

insert into public.learning_activities (title, description, activity_type, course_area, xp_reward)
select 'Mini API', 'Modelar endpoint simples e descrever entrada e saida.', 'course', 'informatica', 16
where not exists (select 1 from public.learning_activities where title = 'Mini API');

insert into public.learning_activities (title, description, activity_type, course_area, xp_reward)
select 'Versionamento Git', 'Criar fluxo simples com branch, commit e merge.', 'course', 'informatica', 13
where not exists (select 1 from public.learning_activities where title = 'Versionamento Git');

insert into public.learning_activities (title, description, activity_type, course_area, xp_reward)
select 'Planejamento de Projeto', 'Definir backlog curto com prioridades da entrega.', 'base', null, 10
where not exists (select 1 from public.learning_activities where title = 'Planejamento de Projeto');

insert into public.learning_activities (title, description, activity_type, course_area, xp_reward)
select 'Leitura Tecnica', 'Ler um texto da disciplina e resumir em 5 pontos.', 'base', null, 9
where not exists (select 1 from public.learning_activities where title = 'Leitura Tecnica');

insert into public.learning_activities (title, description, activity_type, course_area, xp_reward)
select 'Problema em Dupla', 'Resolver problema pratico em dupla com justificativa.', 'base', null, 12
where not exists (select 1 from public.learning_activities where title = 'Problema em Dupla');

insert into public.learning_activities (title, description, activity_type, course_area, xp_reward)
select 'Desafio de Logica', 'Responder desafio curto de logica e explicar a estrategia.', 'base', null, 11
where not exists (select 1 from public.learning_activities where title = 'Desafio de Logica');

-- ===============================================
-- 5) FUNCOES BASE
-- ===============================================
create or replace function public.academy_current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $academy_current_profile$
  select id
  from public.profiles
  where account_id = auth.uid()
  limit 1
$academy_current_profile$;

grant execute on function public.academy_current_profile_id() to authenticated;

create or replace function public.academy_level_for_xp(total_xp integer)
returns integer
language sql
immutable
as $academy_level_for_xp$
  select greatest(1, floor(greatest(coalesce(total_xp, 0), 0)::numeric / 100)::int + 1)
$academy_level_for_xp$;

grant execute on function public.academy_level_for_xp(integer) to authenticated;

create or replace function public.academy_is_chat_participant(
  target_conversation_id uuid,
  target_profile_id uuid default public.academy_current_profile_id()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $academy_is_chat_participant$
  select exists (
    select 1
    from public.chat_conversations c
    where c.id = target_conversation_id
      and target_profile_id in (c.profile_one_id, c.profile_two_id)
  )
$academy_is_chat_participant$;

grant execute on function public.academy_is_chat_participant(uuid, uuid) to authenticated;

create or replace function public.academy_are_mutual_followers(
  p_profile_a uuid,
  p_profile_b uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $academy_are_mutual_followers$
  select
    exists (
      select 1
      from public.follows f1
      where f1.follower_profile_id = p_profile_a
        and f1.following_profile_id = p_profile_b
    )
    and exists (
      select 1
      from public.follows f2
      where f2.follower_profile_id = p_profile_b
        and f2.following_profile_id = p_profile_a
    )
$academy_are_mutual_followers$;

grant execute on function public.academy_are_mutual_followers(uuid, uuid) to authenticated;

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
  v_atual_xp integer;
  v_novo_xp integer;
  v_novo_nivel integer;
begin
  if p_profile_id is null then
    raise exception 'Perfil invalido para XP';
  end if;

  select coalesce(xp_total, 0)
  into v_atual_xp
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'Perfil nao encontrado para XP';
  end if;

  v_novo_xp := greatest(0, v_atual_xp + coalesce(p_delta_xp, 0));
  v_novo_nivel := public.academy_level_for_xp(v_novo_xp);

  update public.profiles
  set
    xp_total = v_novo_xp,
    level = v_novo_nivel
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
  select v_novo_xp, v_novo_nivel;
end;
$academy_add_xp$;

grant execute on function public.academy_add_xp(uuid, integer, text, text, text) to authenticated;

-- ===============================================
-- 6) ESCOLHA DE ATIVIDADE (SEM REPETIR PARA O MESMO USUARIO)
-- ===============================================
create or replace function public.academy_pick_activity(
  p_profile_one_id uuid,
  p_profile_two_id uuid,
  p_prev_activity_id uuid default null,
  p_challenge_date date default current_date
)
returns table (activity_id uuid, challenge_scope text)
language plpgsql
security definer
set search_path = public
as $academy_pick_activity$
declare
  v_course_one text;
  v_course_two text;
  v_target_course text;
  v_use_course boolean := false;
  v_roll integer;
  v_activity_id uuid;
begin
  select coalesce(course_area, 'base_central') into v_course_one
  from public.profiles where id = p_profile_one_id;

  select coalesce(course_area, 'base_central') into v_course_two
  from public.profiles where id = p_profile_two_id;

  if v_course_one = v_course_two and v_course_one <> 'base_central' then
    v_target_course := v_course_one;
    v_roll := abs(hashtext(coalesce(p_challenge_date::text, '') || p_profile_one_id::text || p_profile_two_id::text)) % 10;
    v_use_course := v_roll < case when v_target_course = 'informatica' then 7 else 6 end;
  end if;

  -- 1) Tenta atividade de curso (se aplicavel) NUNCA FEITA por nenhum dos 2
  if v_use_course then
    select a.id
    into v_activity_id
    from public.learning_activities a
    where a.is_active = true
      and a.activity_type = 'course'
      and a.course_area = v_target_course
      and (p_prev_activity_id is null or a.id <> p_prev_activity_id)
      and not exists (
        select 1
        from public.chat_pet_daily_completions c
        join public.chat_pet_daily_tasks t on t.id = c.task_id
        where c.profile_id in (p_profile_one_id, p_profile_two_id)
          and t.activity_id = a.id
      )
    order by random()
    limit 1;

    if v_activity_id is not null then
      return query select v_activity_id, 'course'::text;
      return;
    end if;
  end if;

  -- 2) Base NUNCA FEITA por nenhum dos 2
  select a.id
  into v_activity_id
  from public.learning_activities a
  where a.is_active = true
    and a.activity_type = 'base'
    and (p_prev_activity_id is null or a.id <> p_prev_activity_id)
    and not exists (
      select 1
      from public.chat_pet_daily_completions c
      join public.chat_pet_daily_tasks t on t.id = c.task_id
      where c.profile_id in (p_profile_one_id, p_profile_two_id)
        and t.activity_id = a.id
    )
  order by random()
  limit 1;

  if v_activity_id is not null then
    return query select v_activity_id, 'base'::text;
    return;
  end if;

  -- 3) Se esgotou, evita repeticoes recentes (30 dias)
  if v_use_course then
    select a.id
    into v_activity_id
    from public.learning_activities a
    where a.is_active = true
      and a.activity_type = 'course'
      and a.course_area = v_target_course
      and (p_prev_activity_id is null or a.id <> p_prev_activity_id)
      and not exists (
        select 1
        from public.chat_pet_daily_completions c
        join public.chat_pet_daily_tasks t on t.id = c.task_id
        where c.profile_id in (p_profile_one_id, p_profile_two_id)
          and t.activity_id = a.id
          and c.created_at >= timezone('utc', now()) - interval '30 days'
      )
    order by random()
    limit 1;

    if v_activity_id is not null then
      return query select v_activity_id, 'course'::text;
      return;
    end if;
  end if;

  select a.id
  into v_activity_id
  from public.learning_activities a
  where a.is_active = true
    and a.activity_type = 'base'
    and (p_prev_activity_id is null or a.id <> p_prev_activity_id)
    and not exists (
      select 1
      from public.chat_pet_daily_completions c
      join public.chat_pet_daily_tasks t on t.id = c.task_id
      where c.profile_id in (p_profile_one_id, p_profile_two_id)
        and t.activity_id = a.id
        and c.created_at >= timezone('utc', now()) - interval '30 days'
    )
  order by random()
  limit 1;

  if v_activity_id is not null then
    return query select v_activity_id, 'base'::text;
    return;
  end if;

  -- 4) Fallback final
  if v_use_course then
    select a.id
    into v_activity_id
    from public.learning_activities a
    where a.is_active = true
      and a.activity_type = 'course'
      and a.course_area = v_target_course
      and (p_prev_activity_id is null or a.id <> p_prev_activity_id)
    order by random()
    limit 1;

    if v_activity_id is not null then
      return query select v_activity_id, 'course'::text;
      return;
    end if;
  end if;

  select a.id
  into v_activity_id
  from public.learning_activities a
  where a.is_active = true
    and (p_prev_activity_id is null or a.id <> p_prev_activity_id)
  order by random()
  limit 1;

  if v_activity_id is null then
    raise exception 'Nenhuma atividade cadastrada na academia';
  end if;

  return query select v_activity_id, 'base'::text;
end;
$academy_pick_activity$;

grant execute on function public.academy_pick_activity(uuid, uuid, uuid, date) to authenticated;

-- ===============================================
-- 7) GERADOR DE TAREFA DIARIA (BANCO)
-- ===============================================
create or replace function public.academy_generate_pet_daily_task(
  p_pet_pair_id uuid,
  p_challenge_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $academy_generate_pet_daily_task$
declare
  v_pair public.chat_pet_pairs%rowtype;
  v_conversa public.chat_conversations%rowtype;
  v_task_id uuid;
  v_prev_activity_id uuid;
  v_pick record;
begin
  select *
  into v_pair
  from public.chat_pet_pairs
  where id = p_pet_pair_id;

  if not found then
    raise exception 'Pet pair nao encontrado';
  end if;

  select *
  into v_conversa
  from public.chat_conversations
  where id = v_pair.conversation_id;

  if not found then
    raise exception 'Conversa do pet nao encontrada';
  end if;

  select id
  into v_task_id
  from public.chat_pet_daily_tasks
  where pet_pair_id = p_pet_pair_id
    and challenge_date = p_challenge_date
  limit 1;

  if v_task_id is not null then
    return v_task_id;
  end if;

  select activity_id
  into v_prev_activity_id
  from public.chat_pet_daily_tasks
  where pet_pair_id = p_pet_pair_id
    and challenge_date < p_challenge_date
  order by challenge_date desc
  limit 1;

  select *
  into v_pick
  from public.academy_pick_activity(
    v_conversa.profile_one_id,
    v_conversa.profile_two_id,
    v_prev_activity_id,
    p_challenge_date
  )
  limit 1;

  insert into public.chat_pet_daily_tasks (
    pet_pair_id,
    challenge_date,
    activity_id,
    challenge_scope
  )
  values (
    p_pet_pair_id,
    p_challenge_date,
    v_pick.activity_id,
    v_pick.challenge_scope
  )
  on conflict (pet_pair_id, challenge_date) do nothing
  returning id into v_task_id;

  if v_task_id is null then
    select id into v_task_id
    from public.chat_pet_daily_tasks
    where pet_pair_id = p_pet_pair_id
      and challenge_date = p_challenge_date
    limit 1;
  end if;

  return v_task_id;
end;
$academy_generate_pet_daily_task$;

grant execute on function public.academy_generate_pet_daily_task(uuid, date) to authenticated;

create or replace function public.trg_chat_pet_pairs_generate_today_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $trg_chat_pet_pairs_generate_today_task$
begin
  perform public.academy_generate_pet_daily_task(new.id, current_date);
  return new;
end;
$trg_chat_pet_pairs_generate_today_task$;

drop trigger if exists trg_chat_pet_pairs_generate_today_task on public.chat_pet_pairs;

create trigger trg_chat_pet_pairs_generate_today_task
after insert on public.chat_pet_pairs
for each row
execute function public.trg_chat_pet_pairs_generate_today_task();

-- ===============================================
-- 8) CONVITE DE PET (ENVIAR/RESPONDER)
-- ===============================================
create or replace function public.academy_send_pet_invite(
  p_conversation_id uuid,
  p_pet_name text default 'Nexinho'
)
returns table (
  invitation_id uuid,
  status text
)
language plpgsql
security definer
set search_path = public
as $academy_send_pet_invite$
declare
  v_me uuid;
  v_conversa public.chat_conversations%rowtype;
  v_invitee uuid;
  v_existing_pair uuid;
  v_invitation_id uuid;
  v_status text;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_chat_participant(p_conversation_id, v_me) then
    raise exception 'Usuario sem acesso a esta conversa';
  end if;

  select id
  into v_existing_pair
  from public.chat_pet_pairs
  where conversation_id = p_conversation_id
  limit 1;

  if v_existing_pair is not null then
    raise exception 'Este chat ja possui pet em dupla';
  end if;

  select *
  into v_conversa
  from public.chat_conversations
  where id = p_conversation_id;

  if not found then
    raise exception 'Conversa nao encontrada';
  end if;

  v_invitee := case
    when v_conversa.profile_one_id = v_me then v_conversa.profile_two_id
    else v_conversa.profile_one_id
  end;

  if not public.academy_are_mutual_followers(v_me, v_invitee) then
    raise exception 'Somente seguidores mutuos podem criar pet em dupla';
  end if;

  begin
    insert into public.chat_pet_invitations as i (
      conversation_id,
      inviter_profile_id,
      invitee_profile_id,
      pet_name,
      status,
      updated_at
    )
    values (
      p_conversation_id,
      v_me,
      v_invitee,
      coalesce(nullif(btrim(p_pet_name), ''), 'Nexinho'),
      'pending',
      timezone('utc', now())
    )
    returning i.id, i.status
    into v_invitation_id, v_status;
  exception
    when unique_violation then
      update public.chat_pet_invitations i
      set
        inviter_profile_id = v_me,
        invitee_profile_id = v_invitee,
        pet_name = coalesce(nullif(btrim(p_pet_name), ''), 'Nexinho'),
        status = 'pending',
        updated_at = timezone('utc', now()),
        responded_at = null
      where i.conversation_id = p_conversation_id
        and i.status = 'pending'
      returning i.id, i.status
      into v_invitation_id, v_status;
  end;

  return query
  select v_invitation_id, coalesce(v_status, 'pending');
end;
$academy_send_pet_invite$;

grant execute on function public.academy_send_pet_invite(uuid, text) to authenticated;

create or replace function public.academy_respond_pet_invite(
  p_invitation_id uuid,
  p_accept boolean
)
returns table (
  invitation_id uuid,
  invitation_status text,
  pet_pair_id uuid
)
language plpgsql
security definer
set search_path = public
as $academy_respond_pet_invite$
declare
  v_me uuid;
  v_invite public.chat_pet_invitations%rowtype;
  v_pair_id uuid;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  select *
  into v_invite
  from public.chat_pet_invitations
  where id = p_invitation_id
  for update;

  if not found then
    raise exception 'Convite nao encontrado';
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'Convite ja respondido';
  end if;

  if v_invite.invitee_profile_id <> v_me then
    raise exception 'Apenas o convidado pode responder';
  end if;

  if p_accept then
    if not public.academy_are_mutual_followers(
      v_invite.inviter_profile_id,
      v_invite.invitee_profile_id
    ) then
      raise exception 'Somente seguidores mutuos podem criar pet em dupla';
    end if;

    update public.chat_pet_invitations
    set
      status = 'accepted',
      updated_at = timezone('utc', now()),
      responded_at = timezone('utc', now())
    where id = v_invite.id;

    insert into public.chat_pet_pairs (
      conversation_id,
      pet_name
    )
    values (
      v_invite.conversation_id,
      coalesce(nullif(btrim(v_invite.pet_name), ''), 'Nexinho')
    )
    on conflict (conversation_id)
    do update set
      pet_name = excluded.pet_name,
      updated_at = timezone('utc', now())
    returning id into v_pair_id;

    perform public.academy_generate_pet_daily_task(v_pair_id, current_date);

    return query
    select v_invite.id, 'accepted'::text, v_pair_id;
  else
    update public.chat_pet_invitations
    set
      status = 'rejected',
      updated_at = timezone('utc', now()),
      responded_at = timezone('utc', now())
    where id = v_invite.id;

    return query
    select v_invite.id, 'rejected'::text, null::uuid;
  end if;
end;
$academy_respond_pet_invite$;

grant execute on function public.academy_respond_pet_invite(uuid, boolean) to authenticated;

-- ===============================================
-- 9) ESTADO DO PET PARA O CHAT
-- ===============================================
create or replace function public.academy_get_pet_state(
  p_conversation_id uuid,
  p_challenge_date date default current_date
)
returns table (
  has_pair boolean,
  pet_pair_id uuid,
  pet_name text,
  pet_life_days integer,
  pet_status text,
  invitation_id uuid,
  invitation_status text,
  inviter_profile_id uuid,
  inviter_username text,
  invitee_profile_id uuid,
  invitee_username text,
  pending_is_mine boolean,
  pending_for_me boolean,
  task_id uuid,
  activity_id uuid,
  activity_title text,
  activity_description text,
  activity_xp integer,
  challenge_scope text,
  completed_total integer,
  completed_by_me boolean,
  duo_completed boolean
)
language plpgsql
security definer
set search_path = public
as $academy_get_pet_state$
declare
  v_me uuid;
  v_pair public.chat_pet_pairs%rowtype;
  v_task_id uuid;
  v_task public.chat_pet_daily_tasks%rowtype;
  v_activity public.learning_activities%rowtype;
  v_invite public.chat_pet_invitations%rowtype;
  v_inviter_username text;
  v_invitee_username text;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_chat_participant(p_conversation_id, v_me) then
    raise exception 'Usuario sem acesso a esta conversa';
  end if;

  select *
  into v_pair
  from public.chat_pet_pairs
  where conversation_id = p_conversation_id
  limit 1;

  if found then
    v_task_id := public.academy_generate_pet_daily_task(v_pair.id, p_challenge_date);

    select *
    into v_task
    from public.chat_pet_daily_tasks
    where id = v_task_id;

    select *
    into v_activity
    from public.learning_activities
    where id = v_task.activity_id;

    return query
    select
      true as has_pair,
      v_pair.id,
      v_pair.pet_name,
      v_pair.life_days,
      v_pair.status,
      null::uuid,
      null::text,
      null::uuid,
      null::text,
      null::uuid,
      null::text,
      false,
      false,
      v_task.id,
      v_activity.id,
      v_activity.title,
      v_activity.description,
      v_activity.xp_reward,
      v_task.challenge_scope,
      (
        select count(*)::int
        from public.chat_pet_daily_completions c
        where c.task_id = v_task.id
      ) as completed_total,
      exists (
        select 1
        from public.chat_pet_daily_completions c
        where c.task_id = v_task.id
          and c.profile_id = v_me
      ) as completed_by_me,
      (v_task.duo_completed_at is not null) as duo_completed;

    return;
  end if;

  select *
  into v_invite
  from public.chat_pet_invitations
  where conversation_id = p_conversation_id
    and status = 'pending'
  order by created_at desc
  limit 1;

  if found then
    select username into v_inviter_username from public.profiles where id = v_invite.inviter_profile_id;
    select username into v_invitee_username from public.profiles where id = v_invite.invitee_profile_id;

    return query
    select
      false as has_pair,
      null::uuid,
      v_invite.pet_name,
      0,
      'resting'::text,
      v_invite.id,
      v_invite.status,
      v_invite.inviter_profile_id,
      coalesce(v_inviter_username, ''),
      v_invite.invitee_profile_id,
      coalesce(v_invitee_username, ''),
      (v_invite.inviter_profile_id = v_me),
      (v_invite.invitee_profile_id = v_me),
      null::uuid,
      null::uuid,
      null::text,
      null::text,
      null::integer,
      null::text,
      0,
      false,
      false;

    return;
  end if;

  return query
  select
    false as has_pair,
    null::uuid,
    'Nexinho'::text,
    0,
    'resting'::text,
    null::uuid,
    null::text,
    null::uuid,
    null::text,
    null::uuid,
    null::text,
    false,
    false,
    null::uuid,
    null::uuid,
    null::text,
    null::text,
    null::integer,
    null::text,
    0,
    false,
    false;
end;
$academy_get_pet_state$;

grant execute on function public.academy_get_pet_state(uuid, date) to authenticated;

-- ===============================================
-- 10) TAREFA DO DIA + RECOMPENSAS DO PET
-- ===============================================
create or replace function public.academy_ensure_pet_daily_task(
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
  duo_completed boolean
)
language plpgsql
security definer
set search_path = public
as $academy_ensure_pet_daily_task$
declare
  v_me uuid;
  v_pair public.chat_pet_pairs%rowtype;
  v_task_id uuid;
  v_task public.chat_pet_daily_tasks%rowtype;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_chat_participant(p_conversation_id, v_me) then
    raise exception 'Usuario sem acesso a esta conversa';
  end if;

  select *
  into v_pair
  from public.chat_pet_pairs
  where conversation_id = p_conversation_id
  limit 1;

  if not found then
    raise exception 'Este chat ainda nao tem pet em dupla. Envie e aceite o convite primeiro.';
  end if;

  v_task_id := public.academy_generate_pet_daily_task(v_pair.id, p_challenge_date);

  select *
  into v_task
  from public.chat_pet_daily_tasks
  where id = v_task_id;

  return query
  select
    v_task.id,
    v_pair.id,
    v_task.challenge_date,
    a.id,
    a.title,
    a.description,
    a.xp_reward,
    v_task.challenge_scope,
    v_pair.pet_name,
    v_pair.life_days,
    v_pair.status,
    (
      select count(*)::int
      from public.chat_pet_daily_completions c
      where c.task_id = v_task.id
    ) as completed_total,
    exists (
      select 1
      from public.chat_pet_daily_completions c
      where c.task_id = v_task.id
        and c.profile_id = v_me
    ) as completed_by_me,
    (v_task.duo_completed_at is not null) as duo_completed
  from public.learning_activities a
  where a.id = v_task.activity_id;
end;
$academy_ensure_pet_daily_task$;

grant execute on function public.academy_ensure_pet_daily_task(uuid, date) to authenticated;

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
  v_conversa public.chat_conversations%rowtype;
  v_rows integer := 0;
  v_completed_total integer := 0;
  v_duo_just_completed boolean := false;
  v_life_days integer := 0;
  v_milestone boolean := false;
  v_milestone_days integer := null;
  v_my_xp integer := 0;
  v_my_level integer := 1;
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

  insert into public.chat_pet_daily_completions (
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
  on conflict (task_id, profile_id) do nothing;

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
  from public.chat_pet_daily_completions
  where task_id = v_task.task_id;

  if v_completed_total >= 2 then
    update public.chat_pet_daily_tasks
    set duo_completed_at = timezone('utc', now())
    where id = v_task.task_id
      and duo_completed_at is null;

    get diagnostics v_rows = row_count;
    v_duo_just_completed := v_rows > 0;

    if v_duo_just_completed then
      update public.chat_pet_pairs
      set
        life_days = life_days + 1,
        last_growth_date = p_challenge_date,
        status = 'alive',
        updated_at = timezone('utc', now())
      where id = v_task.pet_pair_id
      returning life_days into v_life_days;

      if v_life_days = 3 or mod(v_life_days, 10) = 0 then
        v_milestone := true;
        v_milestone_days := v_life_days;

        select *
        into v_conversa
        from public.chat_conversations
        where id = p_conversation_id;

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

  select xp_total, level
  into v_my_xp, v_my_level
  from public.profiles
  where id = v_me;

  return query
  select
    t.task_id,
    t.pet_pair_id,
    t.challenge_date,
    t.activity_id,
    t.activity_title,
    t.activity_description,
    t.activity_xp,
    t.challenge_scope,
    t.pet_name,
    t.pet_life_days,
    t.pet_status,
    t.completed_total,
    t.completed_by_me,
    t.duo_completed,
    v_milestone,
    v_milestone_days,
    v_my_xp,
    v_my_level
  from public.academy_ensure_pet_daily_task(p_conversation_id, p_challenge_date) t
  limit 1;
end;
$academy_complete_pet_daily_task$;

grant execute on function public.academy_complete_pet_daily_task(uuid, date) to authenticated;

-- ===============================================
-- 11) TROCA XP -> PONTOS NA MATERIA
-- ===============================================
create or replace function public.request_unit_redemption(
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
  v_me uuid;
  v_xp_atual integer;
  v_grade_points numeric(4,2);
  v_redemption_id uuid;
  v_status text;
  v_new_xp integer;
  v_new_level integer;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if p_xp_spent is null or p_xp_spent < 20 then
    raise exception 'Minimo 20 XP por troca';
  end if;

  if coalesce(btrim(p_unit_code), '') = '' then
    raise exception 'Unidade obrigatoria';
  end if;

  if coalesce(btrim(p_subject_name), '') = '' then
    raise exception 'Materia obrigatoria';
  end if;

  select coalesce(xp_total, 0)
  into v_xp_atual
  from public.profiles
  where id = v_me
  for update;

  if v_xp_atual < p_xp_spent then
    raise exception 'XP insuficiente';
  end if;

  v_grade_points := round((p_xp_spent::numeric / 100), 2);

  insert into public.unit_grade_redemptions (
    profile_id,
    unit_code,
    subject_name,
    xp_spent,
    grade_points,
    status
  )
  values (
    v_me,
    btrim(p_unit_code),
    btrim(p_subject_name),
    p_xp_spent,
    v_grade_points,
    'pending'
  )
  returning id, status
  into v_redemption_id, v_status;

  select xp_total, level
  into v_new_xp, v_new_level
  from public.academy_add_xp(
    v_me,
    -p_xp_spent,
    'Troca de XP: ' || btrim(p_subject_name) || ' (' || btrim(p_unit_code) || ')',
    'redemption_adjustment',
    v_redemption_id::text
  )
  limit 1;

  return query
  select
    v_redemption_id,
    v_status,
    v_grade_points,
    v_new_xp,
    v_new_level;
end;
$request_unit_redemption$;

grant execute on function public.request_unit_redemption(text, text, integer) to authenticated;

-- ===============================================
-- 12) RLS
-- ===============================================
alter table public.learning_activities enable row level security;
alter table public.xp_ledger enable row level security;
alter table public.unit_grade_redemptions enable row level security;
alter table public.chat_pet_pairs enable row level security;
alter table public.chat_pet_invitations enable row level security;
alter table public.chat_pet_daily_tasks enable row level security;
alter table public.chat_pet_daily_completions enable row level security;

drop policy if exists learning_activities_select_all on public.learning_activities;
create policy learning_activities_select_all
  on public.learning_activities
  for select
  to authenticated
  using (true);

drop policy if exists xp_ledger_select_own on public.xp_ledger;
create policy xp_ledger_select_own
  on public.xp_ledger
  for select
  to authenticated
  using (profile_id = public.academy_current_profile_id());

drop policy if exists unit_redemptions_select_own on public.unit_grade_redemptions;
create policy unit_redemptions_select_own
  on public.unit_grade_redemptions
  for select
  to authenticated
  using (profile_id = public.academy_current_profile_id());

drop policy if exists unit_redemptions_insert_own on public.unit_grade_redemptions;
create policy unit_redemptions_insert_own
  on public.unit_grade_redemptions
  for insert
  to authenticated
  with check (profile_id = public.academy_current_profile_id());

drop policy if exists chat_pet_pairs_select_participants on public.chat_pet_pairs;
create policy chat_pet_pairs_select_participants
  on public.chat_pet_pairs
  for select
  to authenticated
  using (public.academy_is_chat_participant(conversation_id));

drop policy if exists chat_pet_pairs_insert_participants on public.chat_pet_pairs;
create policy chat_pet_pairs_insert_participants
  on public.chat_pet_pairs
  for insert
  to authenticated
  with check (public.academy_is_chat_participant(conversation_id));

drop policy if exists chat_pet_pairs_update_participants on public.chat_pet_pairs;
create policy chat_pet_pairs_update_participants
  on public.chat_pet_pairs
  for update
  to authenticated
  using (public.academy_is_chat_participant(conversation_id))
  with check (public.academy_is_chat_participant(conversation_id));

drop policy if exists chat_pet_invites_select_participants on public.chat_pet_invitations;
create policy chat_pet_invites_select_participants
  on public.chat_pet_invitations
  for select
  to authenticated
  using (
    inviter_profile_id = public.academy_current_profile_id()
    or invitee_profile_id = public.academy_current_profile_id()
  );

drop policy if exists chat_pet_invites_insert_inviter on public.chat_pet_invitations;
create policy chat_pet_invites_insert_inviter
  on public.chat_pet_invitations
  for insert
  to authenticated
  with check (
    inviter_profile_id = public.academy_current_profile_id()
    and public.academy_is_chat_participant(conversation_id)
  );

drop policy if exists chat_pet_invites_update_participants on public.chat_pet_invitations;
create policy chat_pet_invites_update_participants
  on public.chat_pet_invitations
  for update
  to authenticated
  using (
    inviter_profile_id = public.academy_current_profile_id()
    or invitee_profile_id = public.academy_current_profile_id()
  )
  with check (
    inviter_profile_id = public.academy_current_profile_id()
    or invitee_profile_id = public.academy_current_profile_id()
  );

drop policy if exists chat_pet_tasks_select_participants on public.chat_pet_daily_tasks;
create policy chat_pet_tasks_select_participants
  on public.chat_pet_daily_tasks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.chat_pet_pairs p
      where p.id = pet_pair_id
        and public.academy_is_chat_participant(p.conversation_id)
    )
  );

drop policy if exists chat_pet_tasks_insert_participants on public.chat_pet_daily_tasks;
create policy chat_pet_tasks_insert_participants
  on public.chat_pet_daily_tasks
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.chat_pet_pairs p
      where p.id = pet_pair_id
        and public.academy_is_chat_participant(p.conversation_id)
    )
  );

drop policy if exists chat_pet_tasks_update_participants on public.chat_pet_daily_tasks;
create policy chat_pet_tasks_update_participants
  on public.chat_pet_daily_tasks
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.chat_pet_pairs p
      where p.id = pet_pair_id
        and public.academy_is_chat_participant(p.conversation_id)
    )
  )
  with check (
    exists (
      select 1
      from public.chat_pet_pairs p
      where p.id = pet_pair_id
        and public.academy_is_chat_participant(p.conversation_id)
    )
  );

drop policy if exists chat_pet_completions_select_participants on public.chat_pet_daily_completions;
create policy chat_pet_completions_select_participants
  on public.chat_pet_daily_completions
  for select
  to authenticated
  using (
    profile_id = public.academy_current_profile_id()
    or exists (
      select 1
      from public.chat_pet_pairs p
      where p.id = pet_pair_id
        and public.academy_is_chat_participant(p.conversation_id)
    )
  );

drop policy if exists chat_pet_completions_insert_self on public.chat_pet_daily_completions;
create policy chat_pet_completions_insert_self
  on public.chat_pet_daily_completions
  for insert
  to authenticated
  with check (
    profile_id = public.academy_current_profile_id()
    and exists (
      select 1
      from public.chat_pet_pairs p
      where p.id = pet_pair_id
        and public.academy_is_chat_participant(p.conversation_id)
    )
  );

-- ===============================================
-- 13) REALTIME
-- ===============================================
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_pet_pairs'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_pet_pairs';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_pet_invitations'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_pet_invitations';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_pet_daily_tasks'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_pet_daily_tasks';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_pet_daily_completions'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_pet_daily_completions';
  end if;
end
$$;
