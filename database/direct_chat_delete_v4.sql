-- NEXO — EXCLUSAO DE MENSAGENS EM CONVERSAS PRIVADAS

alter table public.chat_messages add column if not exists deleted_at timestamptz;

create table if not exists public.chat_message_hidden (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  hidden_at timestamptz not null default timezone('utc',now()),
  primary key(message_id,profile_id)
);

alter table public.chat_message_hidden enable row level security;
drop policy if exists chat_message_hidden_own on public.chat_message_hidden;
create policy chat_message_hidden_own on public.chat_message_hidden for all to authenticated
using(profile_id=public.current_profile_id())
with check(profile_id=public.current_profile_id());
grant select,insert,delete on public.chat_message_hidden to authenticated;

create or replace function public.chat_hide_message(p_message_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_me uuid; v_conversation uuid;
begin
  v_me:=public.current_profile_id();
  select conversation_id into v_conversation from public.chat_messages where id=p_message_id;
  if v_conversation is null or not public.can_access_chat_conversation(v_conversation) then raise exception 'Sem acesso'; end if;
  insert into public.chat_message_hidden(message_id,profile_id) values(p_message_id,v_me) on conflict do nothing;
end $$;

create or replace function public.chat_delete_message_for_everyone(p_message_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_me uuid; v_message public.chat_messages%rowtype;
begin
  v_me:=public.current_profile_id();
  select * into v_message from public.chat_messages where id=p_message_id for update;
  if not found or v_message.sender_profile_id<>v_me then raise exception 'Somente o remetente pode apagar para todos'; end if;
  update public.chat_messages set content='Mensagem apagada',media_url=null,media_kind=null,
    deleted_at=timezone('utc',now()) where id=p_message_id;
end $$;

grant execute on function public.chat_hide_message(uuid) to authenticated;
grant execute on function public.chat_delete_message_for_everyone(uuid) to authenticated;
notify pgrst,'reload schema';
