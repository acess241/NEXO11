create or replace function public.is_chat_blocked(profile_a uuid, profile_b uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  usa_schema_novo boolean;
  usa_schema_antigo boolean;
  bloqueado boolean := false;
begin
  if profile_a is null or profile_b is null or profile_a = profile_b then
    return false;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'blocked_profiles'
      and column_name = 'blocker_profile_id'
  ) into usa_schema_novo;

  if usa_schema_novo then
    execute
      'select exists (
        select 1
        from public.blocked_profiles
        where (blocker_profile_id = $1 and blocked_profile_id = $2)
           or (blocker_profile_id = $2 and blocked_profile_id = $1)
      )'
      into bloqueado
      using profile_a, profile_b;

    return bloqueado;
  end if;

  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'blocked_profiles'
      and column_name = 'profile_id'
  ) into usa_schema_antigo;

  if usa_schema_antigo then
    execute
      'select exists (
        select 1
        from public.blocked_profiles
        where (profile_id = $1 and blocked_profile_id = $2)
           or (profile_id = $2 and blocked_profile_id = $1)
      )'
      into bloqueado
      using profile_a, profile_b;

    return bloqueado;
  end if;

  return false;
end;
$$;

grant execute on function public.is_chat_blocked(uuid, uuid) to authenticated;

create or replace function public.can_access_chat_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_conversations c
    where c.id = target_conversation_id
      and public.current_profile_id() in (c.profile_one_id, c.profile_two_id)
      and not public.is_chat_blocked(c.profile_one_id, c.profile_two_id)
  );
$$;

grant execute on function public.can_access_chat_conversation(uuid) to authenticated;

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat_conversations_select" on public.chat_conversations;
create policy "chat_conversations_select"
  on public.chat_conversations
  for select
  using (
    public.current_profile_id() in (profile_one_id, profile_two_id)
    and not public.is_chat_blocked(profile_one_id, profile_two_id)
  );

drop policy if exists "chat_conversations_insert" on public.chat_conversations;
create policy "chat_conversations_insert"
  on public.chat_conversations
  for insert
  with check (
    public.current_profile_id() in (profile_one_id, profile_two_id)
    and not public.is_chat_blocked(profile_one_id, profile_two_id)
  );

drop policy if exists "chat_conversations_update" on public.chat_conversations;
create policy "chat_conversations_update"
  on public.chat_conversations
  for update
  using (
    public.current_profile_id() in (profile_one_id, profile_two_id)
    and not public.is_chat_blocked(profile_one_id, profile_two_id)
  )
  with check (
    public.current_profile_id() in (profile_one_id, profile_two_id)
    and not public.is_chat_blocked(profile_one_id, profile_two_id)
  );

drop policy if exists "chat_messages_select" on public.chat_messages;
create policy "chat_messages_select"
  on public.chat_messages
  for select
  using (public.can_access_chat_conversation(conversation_id));

drop policy if exists "chat_messages_insert" on public.chat_messages;
create policy "chat_messages_insert"
  on public.chat_messages
  for insert
  with check (
    sender_profile_id = public.current_profile_id()
    and public.can_access_chat_conversation(conversation_id)
  );

drop policy if exists "chat_messages_update" on public.chat_messages;
create policy "chat_messages_update"
  on public.chat_messages
  for update
  using (public.can_access_chat_conversation(conversation_id))
  with check (public.can_access_chat_conversation(conversation_id));
