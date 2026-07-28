create extension if not exists pgcrypto;

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  profile_one_id uuid not null references public.profiles (id) on delete cascade,
  profile_two_id uuid not null references public.profiles (id) on delete cascade,
  last_sender_profile_id uuid references public.profiles (id) on delete set null,
  last_message_preview text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_message_at timestamptz,
  constraint chat_conversations_profiles_different check (profile_one_id <> profile_two_id)
);

create index if not exists chat_conversations_profile_one_idx
  on public.chat_conversations (profile_one_id);

create index if not exists chat_conversations_profile_two_idx
  on public.chat_conversations (profile_two_id);

create index if not exists chat_conversations_last_message_at_idx
  on public.chat_conversations (last_message_at desc nulls last);

alter table public.chat_conversations
  drop constraint if exists chat_conversations_sorted;

alter table public.chat_conversations
  drop constraint if exists chat_conversations_pair_unique;

create unique index if not exists chat_conversations_pair_key_idx
  on public.chat_conversations (
    least(profile_one_id::text, profile_two_id::text),
    greatest(profile_one_id::text, profile_two_id::text)
  );

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete cascade,
  sender_profile_id uuid not null references public.profiles (id) on delete cascade,
  content text not null,
  media_url text,
  media_kind text,
  created_at timestamptz not null default timezone('utc', now()),
  read_at timestamptz,
  constraint chat_messages_content_not_blank check (length(btrim(content)) > 0),
  constraint chat_messages_media_kind_check check (
    media_kind is null or media_kind in ('image', 'video', 'audio')
  )
);

create index if not exists chat_messages_conversation_idx
  on public.chat_messages (conversation_id, created_at);

create index if not exists chat_messages_unread_idx
  on public.chat_messages (conversation_id, read_at);

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $chat_current$
  select id
  from public.profiles
  where account_id = auth.uid()
  limit 1
$chat_current$;

grant execute on function public.current_profile_id() to authenticated;

create or replace function public.can_access_chat_conversation(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $chat_access$
  select exists (
    select 1
    from public.chat_conversations c
    where c.id = target_conversation_id
      and public.current_profile_id() in (c.profile_one_id, c.profile_two_id)
  )
$chat_access$;

grant execute on function public.can_access_chat_conversation(uuid) to authenticated;

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

drop trigger if exists trg_sync_chat_conversation on public.chat_messages;

create trigger trg_sync_chat_conversation
after insert on public.chat_messages
for each row
execute function public.sync_chat_conversation();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat_conversations_select" on public.chat_conversations;
create policy "chat_conversations_select"
  on public.chat_conversations
  for select
  using (public.current_profile_id() in (profile_one_id, profile_two_id));

drop policy if exists "chat_conversations_insert" on public.chat_conversations;
create policy "chat_conversations_insert"
  on public.chat_conversations
  for insert
  with check (public.current_profile_id() in (profile_one_id, profile_two_id));

drop policy if exists "chat_conversations_update" on public.chat_conversations;
create policy "chat_conversations_update"
  on public.chat_conversations
  for update
  using (public.current_profile_id() in (profile_one_id, profile_two_id))
  with check (public.current_profile_id() in (profile_one_id, profile_two_id));

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
  with check (
    public.can_access_chat_conversation(conversation_id)
  );

do $chat_realtime_conversations$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_conversations'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_conversations';
  end if;
end
$chat_realtime_conversations$;

do $chat_realtime_messages$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.chat_messages';
  end if;
end
$chat_realtime_messages$;
