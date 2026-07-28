-- Regra do Nexinho:
-- 1) A sequencia aumenta quando os dois concluem ate 23:59 (America/Bahia)
-- 2) Se falhar, status interno vira "down" (descanso; o Nexinho nunca morre)
-- 3) Ate 3 restauracoes por mes por pet em dupla

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_pet_pairs'
      and column_name = 'survival_start_date'
  ) then
    alter table public.chat_pet_pairs
      add column survival_start_date date;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_pet_pairs'
      and column_name = 'restores_used_month'
  ) then
    alter table public.chat_pet_pairs
      add column restores_used_month integer not null default 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_pet_pairs'
      and column_name = 'restore_cycle_month'
  ) then
    alter table public.chat_pet_pairs
      add column restore_cycle_month date;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_pet_pairs'
      and column_name = 'down_at'
  ) then
    alter table public.chat_pet_pairs
      add column down_at timestamptz;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_pet_pairs'
      and column_name = 'down_reason'
  ) then
    alter table public.chat_pet_pairs
      add column down_reason text;
  end if;
end $$;

update public.chat_pet_pairs
set
  survival_start_date = coalesce(
    survival_start_date,
    (timezone('America/Bahia', created_at))::date,
    (timezone('America/Bahia', now()))::date
  ),
  restore_cycle_month = coalesce(
    restore_cycle_month,
    date_trunc('month', timezone('America/Bahia', now()))::date
  ),
  restores_used_month = coalesce(restores_used_month, 0);

create or replace function public.academy_pet_cycle_month(p_ref_date date)
returns date
language sql
immutable
as $academy_pet_cycle_month$
  select date_trunc('month', p_ref_date::timestamp)::date
$academy_pet_cycle_month$;

grant execute on function public.academy_pet_cycle_month(date) to authenticated;

create or replace function public.academy_apply_pet_daily_rules(
  p_conversation_id uuid
)
returns table (
  has_pair boolean,
  pet_pair_id uuid,
  pet_status text,
  pet_life_days integer,
  restores_used_month integer,
  restores_left_month integer,
  can_restore boolean,
  survival_start_date date,
  missed_deadline_date date
)
language plpgsql
security definer
set search_path = public
as $academy_apply_pet_daily_rules$
declare
  v_me uuid;
  v_pair public.chat_pet_pairs%rowtype;
  v_now_local timestamp;
  v_today_local date;
  v_time_local time;
  v_cycle_month date;
  v_due_date date;
  v_start_date date;
  v_day date;
  v_missed_date date;
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
  limit 1
  for update;

  if not found then
    return query
    select
      false,
      null::uuid,
      null::text,
      0::integer,
      0::integer,
      3::integer,
      false,
      null::date,
      null::date;
    return;
  end if;

  v_now_local := timezone('America/Bahia', now());
  v_today_local := v_now_local::date;
  v_time_local := v_now_local::time;
  v_cycle_month := public.academy_pet_cycle_month(v_today_local);

  if v_pair.restore_cycle_month is distinct from v_cycle_month then
    update public.chat_pet_pairs
    set
      restore_cycle_month = v_cycle_month,
      restores_used_month = 0,
      updated_at = timezone('utc', now())
    where id = v_pair.id;

    select * into v_pair from public.chat_pet_pairs where id = v_pair.id;
  end if;

  v_start_date := coalesce(
    v_pair.survival_start_date,
    (timezone('America/Bahia', v_pair.created_at))::date,
    v_today_local
  );

  if v_pair.survival_start_date is null then
    update public.chat_pet_pairs
    set survival_start_date = v_start_date
    where id = v_pair.id;

    v_pair.survival_start_date := v_start_date;
  end if;

  if v_pair.status <> 'down' then
    v_due_date := case
      when v_time_local >= time '23:59' then v_today_local
      else v_today_local - 1
    end;

    if v_due_date >= v_start_date then
      for v_day in
        select gs::date
        from generate_series(v_start_date::timestamp, v_due_date::timestamp, interval '1 day') as gs
      loop
        perform public.academy_generate_pet_daily_task(v_pair.id, v_day);
      end loop;

      select min(t.challenge_date)
      into v_missed_date
      from public.chat_pet_daily_tasks t
      where t.pet_pair_id = v_pair.id
        and t.challenge_date between v_start_date and v_due_date
        and (
          t.duo_completed_at is null
          or timezone('America/Bahia', t.duo_completed_at) > (t.challenge_date::timestamp + time '23:59:59')
        );

      if v_missed_date is not null then
        update public.chat_pet_pairs
        set
          status = 'down',
          down_at = timezone('utc', now()),
          down_reason = 'deadline_23h_miss',
          updated_at = timezone('utc', now())
        where id = v_pair.id;

        select * into v_pair from public.chat_pet_pairs where id = v_pair.id;
      end if;
    end if;
  else
    select min(t.challenge_date)
    into v_missed_date
    from public.chat_pet_daily_tasks t
    where t.pet_pair_id = v_pair.id
      and t.challenge_date >= v_start_date
      and (
        t.duo_completed_at is null
          or timezone('America/Bahia', t.duo_completed_at) > (t.challenge_date::timestamp + time '23:59:59')
      );
  end if;

  return query
  select
    true,
    v_pair.id,
    v_pair.status,
    v_pair.life_days,
    coalesce(v_pair.restores_used_month, 0),
    greatest(0, 3 - coalesce(v_pair.restores_used_month, 0)),
    (coalesce(v_pair.restores_used_month, 0) < 3),
    v_pair.survival_start_date,
    v_missed_date;
end;
$academy_apply_pet_daily_rules$;

grant execute on function public.academy_apply_pet_daily_rules(uuid) to authenticated;

create or replace function public.academy_restore_pet_pair(
  p_conversation_id uuid
)
returns table (
  restored boolean,
  message text,
  pet_pair_id uuid,
  pet_status text,
  pet_life_days integer,
  restores_used_month integer,
  restores_left_month integer,
  survival_start_date date
)
language plpgsql
security definer
set search_path = public
as $academy_restore_pet_pair$
declare
  v_me uuid;
  v_rule record;
  v_pair public.chat_pet_pairs%rowtype;
  v_now_local timestamp;
  v_today_local date;
  v_time_local time;
  v_cycle_month date;
  v_new_start date;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_chat_participant(p_conversation_id, v_me) then
    raise exception 'Usuario sem acesso a esta conversa';
  end if;

  select *
  into v_rule
  from public.academy_apply_pet_daily_rules(p_conversation_id)
  limit 1;

  if not coalesce(v_rule.has_pair, false) then
    raise exception 'Este chat ainda nao tem pet em dupla';
  end if;

  select *
  into v_pair
  from public.chat_pet_pairs
  where id = v_rule.pet_pair_id
  for update;

  v_now_local := timezone('America/Bahia', now());
  v_today_local := v_now_local::date;
  v_time_local := v_now_local::time;
  v_cycle_month := public.academy_pet_cycle_month(v_today_local);

  if v_pair.restore_cycle_month is distinct from v_cycle_month then
    update public.chat_pet_pairs
    set
      restore_cycle_month = v_cycle_month,
      restores_used_month = 0,
      updated_at = timezone('utc', now())
    where id = v_pair.id;

    select * into v_pair from public.chat_pet_pairs where id = v_pair.id;
  end if;

  if v_pair.status <> 'down' then
    return query
    select
      false,
      'Nexinho ainda esta vivo.',
      v_pair.id,
      v_pair.status,
      v_pair.life_days,
      coalesce(v_pair.restores_used_month, 0),
      greatest(0, 3 - coalesce(v_pair.restores_used_month, 0)),
      v_pair.survival_start_date;
    return;
  end if;

  if coalesce(v_pair.restores_used_month, 0) >= 3 then
    return query
    select
      false,
      'Limite mensal de 3 restauracoes atingido.',
      v_pair.id,
      v_pair.status,
      v_pair.life_days,
      coalesce(v_pair.restores_used_month, 0),
      0,
      v_pair.survival_start_date;
    return;
  end if;

  v_new_start := case
    when v_time_local >= time '23:59' then v_today_local + 1
    else v_today_local
  end;

  update public.chat_pet_pairs as p
  set
    status = 'alive',
    restores_used_month = coalesce(p.restores_used_month, 0) + 1,
    survival_start_date = v_new_start,
    down_at = null,
    down_reason = null,
    updated_at = timezone('utc', now())
  where p.id = v_pair.id
  returning * into v_pair;

  perform public.academy_generate_pet_daily_task(v_pair.id, v_new_start);

  return query
  select
    true,
    'Nexinho restaurado com sucesso.',
    v_pair.id,
    v_pair.status,
    v_pair.life_days,
    coalesce(v_pair.restores_used_month, 0),
    greatest(0, 3 - coalesce(v_pair.restores_used_month, 0)),
    v_pair.survival_start_date;
end;
$academy_restore_pet_pair$;

grant execute on function public.academy_restore_pet_pair(uuid) to authenticated;

create or replace function public.academy_recreate_pet_pair(
  p_conversation_id uuid,
  p_pet_name text default null
)
returns table (
  recreated boolean,
  message text,
  pet_pair_id uuid,
  pet_name text,
  pet_status text,
  pet_life_days integer,
  restores_used_month integer,
  restores_left_month integer,
  survival_start_date date
)
language plpgsql
security definer
set search_path = public
as $academy_recreate_pet_pair$
declare
  v_me uuid;
  v_rule record;
  v_pair public.chat_pet_pairs%rowtype;
  v_now_local timestamp;
  v_today_local date;
  v_time_local time;
  v_cycle_month date;
  v_new_start date;
  v_nome text;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_chat_participant(p_conversation_id, v_me) then
    raise exception 'Usuario sem acesso a esta conversa';
  end if;

  select *
  into v_rule
  from public.academy_apply_pet_daily_rules(p_conversation_id)
  limit 1;

  if not coalesce(v_rule.has_pair, false) then
    raise exception 'Este chat ainda nao tem pet em dupla';
  end if;

  select *
  into v_pair
  from public.chat_pet_pairs
  where id = v_rule.pet_pair_id
  for update;

  v_now_local := timezone('America/Bahia', now());
  v_today_local := v_now_local::date;
  v_time_local := v_now_local::time;
  v_cycle_month := public.academy_pet_cycle_month(v_today_local);

  if v_pair.restore_cycle_month is distinct from v_cycle_month then
    update public.chat_pet_pairs
    set
      restore_cycle_month = v_cycle_month,
      restores_used_month = 0,
      updated_at = timezone('utc', now())
    where id = v_pair.id;

    select * into v_pair from public.chat_pet_pairs where id = v_pair.id;
  end if;

  if v_pair.status <> 'down' then
    return query
    select
      false,
      'Nexinho ainda esta vivo.',
      v_pair.id,
      v_pair.pet_name,
      v_pair.status,
      v_pair.life_days,
      coalesce(v_pair.restores_used_month, 0),
      greatest(0, 3 - coalesce(v_pair.restores_used_month, 0)),
      v_pair.survival_start_date;
    return;
  end if;

  if coalesce(v_pair.restores_used_month, 0) < 3 then
    return query
    select
      false,
      'A recriacao so libera depois de usar as 3 restauracoes mensais.',
      v_pair.id,
      v_pair.pet_name,
      v_pair.status,
      v_pair.life_days,
      coalesce(v_pair.restores_used_month, 0),
      greatest(0, 3 - coalesce(v_pair.restores_used_month, 0)),
      v_pair.survival_start_date;
    return;
  end if;

  v_new_start := case
    when v_time_local >= time '23:59' then v_today_local + 1
    else v_today_local
  end;

  v_nome := nullif(btrim(coalesce(p_pet_name, '')), '');
  if v_nome is null then
    v_nome := coalesce(v_pair.pet_name, 'Nexinho');
  end if;

  update public.chat_pet_pairs as p
  set
    pet_name = v_nome,
    status = 'alive',
    life_days = 0,
    restores_used_month = 0,
    restore_cycle_month = v_cycle_month,
    survival_start_date = v_new_start,
    down_at = null,
    down_reason = null,
    updated_at = timezone('utc', now())
  where p.id = v_pair.id
  returning * into v_pair;

  perform public.academy_generate_pet_daily_task(v_pair.id, v_new_start);

  return query
  select
    true,
    'Nexinho recriado do zero com sucesso.',
    v_pair.id,
    v_pair.pet_name,
    v_pair.status,
    v_pair.life_days,
    coalesce(v_pair.restores_used_month, 0),
    greatest(0, 3 - coalesce(v_pair.restores_used_month, 0)),
    v_pair.survival_start_date;
end;
$academy_recreate_pet_pair$;

grant execute on function public.academy_recreate_pet_pair(uuid, text) to authenticated;

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
  v_state record;
  v_rule record;
begin
  select *
  into v_rule
  from public.academy_apply_pet_daily_rules(p_conversation_id)
  limit 1;

  if not coalesce(v_rule.has_pair, false) then
    raise exception 'Este chat ainda nao tem pet em dupla';
  end if;

  if coalesce(v_rule.pet_status, '') = 'down' then
    raise exception
      'O Nexinho esta descansando porque a missao nao foi concluida ate 23:59. Restauracoes restantes neste mes: %.',
      coalesce(v_rule.restores_left_month, 0);
  end if;

  select *
  into v_state
  from public.academy_get_pet_state(p_conversation_id, p_challenge_date)
  limit 1;

  if not coalesce(v_state.has_pair, false) then
    raise exception 'Este chat ainda nao tem pet em dupla';
  end if;

  if coalesce(v_state.pet_status, '') = 'down' then
    raise exception
      'O Nexinho esta descansando porque a missao nao foi concluida ate 23:59. Restauracoes restantes neste mes: %.',
      coalesce(v_rule.restores_left_month, 0);
  end if;

  return query
  select
    v_state.task_id,
    v_state.pet_pair_id,
    p_challenge_date,
    v_state.activity_id,
    v_state.activity_title,
    v_state.activity_description,
    v_state.activity_xp,
    v_state.challenge_scope,
    v_state.pet_name,
    v_state.pet_life_days,
    v_state.pet_status,
    v_state.completed_total,
    v_state.completed_by_me,
    v_state.duo_completed;
end;
$academy_ensure_pet_daily_task$;

grant execute on function public.academy_ensure_pet_daily_task(uuid, date) to authenticated;
