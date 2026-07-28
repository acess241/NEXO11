-- Oxente Hub / Nexo 11
-- Limpeza total de salas e grupos antigos no Supabase (PostgreSQL)
-- Execute no SQL Editor do Supabase.
--
-- O script apaga dados de sala/grupo em ordem segura:
-- 1) message_attachments (quando ligado a conversas de sala)
-- 2) messages (conversas de sala)
-- 3) conversation_participants (conversas de sala)
-- 4) conversations (classroom_group/assignment_group ou classroom_id != null)
-- 5) submissions (ligadas a assignments de sala)
-- 6) assignments (classroom_id != null)
-- 7) classroom_join_requests
-- 8) classroom_members
-- 9) classrooms

begin;

do $$
declare
  has_conversations boolean := to_regclass('public.conversations') is not null;
  has_messages boolean := to_regclass('public.messages') is not null;
  has_message_attachments boolean := to_regclass('public.message_attachments') is not null;
  has_conversation_participants boolean := to_regclass('public.conversation_participants') is not null;
  has_assignments boolean := to_regclass('public.assignments') is not null;
  has_submissions boolean := to_regclass('public.submissions') is not null;
  has_classrooms boolean := to_regclass('public.classrooms') is not null;
  has_classroom_members boolean := to_regclass('public.classroom_members') is not null;
  has_classroom_join_requests boolean := to_regclass('public.classroom_join_requests') is not null;
  conv_filter text := 'false';
begin
  if has_conversations then
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'conversations'
        and column_name = 'type'
    ) then
      conv_filter := conv_filter || ' OR type IN (''classroom_group'', ''assignment_group'')';
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'conversations'
        and column_name = 'classroom_id'
    ) then
      conv_filter := conv_filter || ' OR classroom_id IS NOT NULL';
    end if;

    if has_message_attachments
      and has_messages
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'message_attachments'
          and column_name = 'message_id'
      )
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'messages'
          and column_name = 'conversation_id'
      )
    then
      execute format(
        'delete from public.message_attachments ma
         using public.messages m
         where ma.message_id = m.id
           and m.conversation_id in (
             select c.id from public.conversations c where %s
           )',
        conv_filter
      );
    end if;

    if has_messages
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'messages'
          and column_name = 'conversation_id'
      )
    then
      execute format(
        'delete from public.messages
         where conversation_id in (
           select c.id from public.conversations c where %s
         )',
        conv_filter
      );
    end if;

    if has_conversation_participants
      and exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'conversation_participants'
          and column_name = 'conversation_id'
      )
    then
      execute format(
        'delete from public.conversation_participants
         where conversation_id in (
           select c.id from public.conversations c where %s
         )',
        conv_filter
      );
    end if;

    execute format('delete from public.conversations where %s', conv_filter);
  end if;

  if has_submissions
    and has_assignments
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'submissions'
        and column_name = 'assignment_id'
    )
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'assignments'
        and column_name = 'classroom_id'
    )
  then
    execute '
      delete from public.submissions
      where assignment_id in (
        select id from public.assignments where classroom_id is not null
      )';
  end if;

  if has_assignments
    and exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'assignments'
        and column_name = 'classroom_id'
    )
  then
    execute 'delete from public.assignments where classroom_id is not null';
  end if;

  if has_classroom_join_requests then
    execute 'delete from public.classroom_join_requests';
  end if;

  if has_classroom_members then
    execute 'delete from public.classroom_members';
  end if;

  if has_classrooms then
    execute 'delete from public.classrooms';
  end if;
end
$$;

commit;

