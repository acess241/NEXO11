-- NEXO — DETALHES DA CONVERSA E APELIDOS
create table if not exists public.chat_conversation_preferences (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  nickname text,
  muted boolean not null default false,
  created_at timestamptz not null default timezone('utc',now()),
  updated_at timestamptz not null default timezone('utc',now()),
  primary key(conversation_id,profile_id)
);
alter table public.chat_conversation_preferences enable row level security;
drop policy if exists chat_preferences_own on public.chat_conversation_preferences;
create policy chat_preferences_own on public.chat_conversation_preferences for all to authenticated
using(profile_id=public.current_profile_id() and public.can_access_chat_conversation(conversation_id))
with check(profile_id=public.current_profile_id() and public.can_access_chat_conversation(conversation_id));
grant select,insert,update,delete on public.chat_conversation_preferences to authenticated;
notify pgrst,'reload schema';
