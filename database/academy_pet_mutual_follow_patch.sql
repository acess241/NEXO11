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
  v_pending_id uuid;
  v_invitation_status text;
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

  select id
  into v_pending_id
  from public.chat_pet_invitations i
  where i.conversation_id = p_conversation_id
    and i.status = 'pending'
  limit 1;

  if v_pending_id is not null then
    raise exception 'Ja existe convite pendente';
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
  into invitation_id, v_invitation_status;

  status := v_invitation_status;

  return next;
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
    returning id into pet_pair_id;

    perform public.academy_generate_pet_daily_task(pet_pair_id, current_date);

    invitation_id := v_invite.id;
    invitation_status := 'accepted';
    return next;
  else
    update public.chat_pet_invitations
    set
      status = 'rejected',
      updated_at = timezone('utc', now()),
      responded_at = timezone('utc', now())
    where id = v_invite.id;

    invitation_id := v_invite.id;
    invitation_status := 'rejected';
    pet_pair_id := null;
    return next;
  end if;
end;
$academy_respond_pet_invite$;

grant execute on function public.academy_respond_pet_invite(uuid, boolean) to authenticated;
