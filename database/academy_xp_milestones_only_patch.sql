-- XP individual por datas comemorativas do Nexinho.
-- Cada premio e creditado uma unica vez no perfil de cada participante.
-- Marcos oficiais: 1, 7, 15, 30, 50, 100 e 365 dias.

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
as $$
declare
  v_me uuid;
  v_task record;
  v_rows integer := 0;
  v_completed_total integer := 0;
  v_duo_just_completed boolean := false;
  v_life_days integer := 0;
  v_milestone boolean := false;
  v_milestone_days integer := null;
  v_milestone_xp integer := 0;
  v_my_xp integer := 0;
  v_my_level integer := 1;
  v_conversa public.chat_conversations%rowtype;
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
  -- Sem lista de colunas para evitar conflito com as variaveis OUT
  -- task_id/profile_id da funcao PL/pgSQL.
  on conflict do nothing;

  get diagnostics v_rows = row_count;

  -- Sem XP diario por atividade.
  -- XP agora so entra nos marcos de vida do pet.

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

      v_milestone_xp := case v_life_days
        when 1 then 20
        when 7 then 50
        when 15 then 75
        when 30 then 150
        when 50 then 250
        when 100 then 500
        when 365 then 1500
        else 0
      end;

      if v_milestone_xp > 0 then
        v_milestone := true;
        v_milestone_days := v_life_days;

        select c.*
        into v_conversa
        from public.chat_conversations c
        join public.chat_pet_pairs p on p.conversation_id = c.id
        where p.id = v_task.pet_pair_id
        limit 1;

        -- A rotina central processa os dois participantes e todos os marcos
        -- pendentes, com chave unica por dupla + aluno + marco.
        perform public.xp_award_nexinho_milestones(v_task.pet_pair_id, v_life_days);
      end if;
    end if;
  end if;

  select p.xp_total, p.level
  into v_my_xp, v_my_level
  from public.profiles p
  where p.id = v_me;

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
$$;

grant execute on function public.academy_complete_pet_daily_task(uuid, date) to authenticated;

create or replace function public.academy_complete_pet_daily_task(
  p_conversation_id uuid
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
language sql
security definer
set search_path = public
as $$
  select *
  from public.academy_complete_pet_daily_task(p_conversation_id, current_date)
$$;

grant execute on function public.academy_complete_pet_daily_task(uuid) to authenticated;

-- Compatibilidade para fluxos que chamam o nome _quiz
create or replace function public.academy_complete_pet_daily_task_quiz(
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
language sql
security definer
set search_path = public
as $$
  select *
  from public.academy_complete_pet_daily_task(p_conversation_id, p_challenge_date)
$$;

grant execute on function public.academy_complete_pet_daily_task_quiz(uuid, date) to authenticated;
