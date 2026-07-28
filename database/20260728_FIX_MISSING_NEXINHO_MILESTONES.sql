-- REPARO: function public.xp_award_nexinho_milestones(uuid, integer) does not exist
-- Pode ser executado isoladamente. Nao apaga contas, perfis, quizzes ou XP.

begin;

create table if not exists public.nexinho_milestone_rewards (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.chat_pet_pairs(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  milestone_days integer not null,
  xp_awarded integer not null check (xp_awarded > 0),
  unique_key text not null unique,
  awarded_at timestamptz not null default timezone('utc', now()),
  unique (pair_id, student_id, milestone_days)
);

create index if not exists nexinho_milestone_rewards_pair_idx
  on public.nexinho_milestone_rewards (pair_id, milestone_days);

create index if not exists nexinho_milestone_rewards_student_idx
  on public.nexinho_milestone_rewards (student_id, awarded_at desc);

create or replace function public.xp_award_nexinho_milestones(
  p_pair_id uuid,
  p_life_days integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair public.chat_pet_pairs%rowtype;
  v_conversation public.chat_conversations%rowtype;
  v_milestone record;
  v_profile_id uuid;
  v_unique_key text;
  v_inserted integer;
  v_awards integer := 0;
begin
  if p_pair_id is null then
    raise exception 'Dupla do Nexinho invalida';
  end if;

  select p.*
  into v_pair
  from public.chat_pet_pairs p
  where p.id = p_pair_id
  for update;

  if not found then
    raise exception 'Dupla do Nexinho nao encontrada';
  end if;

  select c.*
  into v_conversation
  from public.chat_conversations c
  where c.id = v_pair.conversation_id;

  if not found then
    raise exception 'Conversa do Nexinho nao encontrada';
  end if;

  for v_milestone in
    select milestone.days, milestone.xp
    from (
      values
        (1, 20),
        (7, 50),
        (15, 75),
        (30, 150),
        (50, 250),
        (100, 500),
        (365, 1500)
    ) as milestone(days, xp)
    where milestone.days <= greatest(coalesce(p_life_days, 0), 0)
    order by milestone.days
  loop
    foreach v_profile_id in array array[
      v_conversation.profile_one_id,
      v_conversation.profile_two_id
    ]
    loop
      if v_profile_id is not null then
        v_unique_key :=
          'nexinho:' || p_pair_id::text ||
          ':perfil:' || v_profile_id::text ||
          ':marco:' || v_milestone.days::text;

        insert into public.nexinho_milestone_rewards (
          pair_id,
          student_id,
          milestone_days,
          xp_awarded,
          unique_key
        )
        values (
          p_pair_id,
          v_profile_id,
          v_milestone.days,
          v_milestone.xp,
          v_unique_key
        )
        on conflict do nothing;

        get diagnostics v_inserted = row_count;

        if v_inserted > 0 then
          perform public.academy_add_xp(
            v_profile_id,
            v_milestone.xp,
            'Marco do Nexinho: ' || v_milestone.days || ' dias',
            'pet_milestone',
            v_unique_key
          );

          v_awards := v_awards + 1;
        end if;
      end if;
    end loop;
  end loop;

  return v_awards;
end;
$$;

revoke all on function public.xp_award_nexinho_milestones(uuid, integer)
  from public, anon;

grant execute on function public.xp_award_nexinho_milestones(uuid, integer)
  to authenticated;

commit;

-- Verificacao: deve retornar o nome da funcao, e nao NULL.
select to_regprocedure(
  'public.xp_award_nexinho_milestones(uuid,integer)'
) as funcao_instalada;
