do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_messages'
      and column_name = 'media_url'
  ) then
    alter table public.chat_messages
      add column media_url text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'chat_messages'
      and column_name = 'media_kind'
  ) then
    alter table public.chat_messages
      add column media_kind text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chat_messages_media_kind_check'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_media_kind_check
      check (media_kind is null or media_kind in ('image', 'video', 'audio'));
  end if;
end $$;

create or replace function public.sync_chat_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $chat_sync$
begin
  update public.chat_conversations
  set
    updated_at = timezone('utc', now()),
    last_message_at = new.created_at,
    last_message_preview = left(
      coalesce(
        nullif(btrim(new.content), ''),
        case
          when new.media_kind = 'image' then '[Foto]'
          when new.media_kind = 'video' then '[Video]'
          when new.media_kind = 'audio' then '[Audio]'
          else '[Mensagem]'
        end
      ),
      120
    ),
    last_sender_profile_id = new.sender_profile_id
  where id = new.conversation_id;

  return new;
end;
$chat_sync$;
