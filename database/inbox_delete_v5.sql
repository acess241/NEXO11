-- NEXO — REMOVER CONVERSA PRIVADA DA ABA MENSAGENS

create table if not exists public.chat_conversation_hidden (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  hidden_at timestamptz not null default timezone('utc',now()),
  primary key(conversation_id,profile_id)
);

alter table public.chat_conversation_hidden enable row level security;
drop policy if exists chat_conversation_hidden_own on public.chat_conversation_hidden;
create policy chat_conversation_hidden_own on public.chat_conversation_hidden for all to authenticated
using(profile_id=public.current_profile_id())
with check(profile_id=public.current_profile_id());
grant select,insert,delete on public.chat_conversation_hidden to authenticated;

create or replace function public.chat_hide_conversation(p_conversation_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_me uuid;
begin
  v_me:=public.current_profile_id();
  if not public.can_access_chat_conversation(p_conversation_id) then raise exception 'Sem acesso'; end if;
  insert into public.chat_conversation_hidden(conversation_id,profile_id)
  values(p_conversation_id,v_me) on conflict do update set hidden_at=timezone('utc',now());
end $$;

grant execute on function public.chat_hide_conversation(uuid) to authenticated;

-- Permite que o dono saia: transfere a propriedade automaticamente.
create or replace function public.nexo_protect_group_identity()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.owner_profile_id is distinct from old.owner_profile_id
     and public.current_profile_id() is distinct from old.owner_profile_id then
    raise exception 'Apenas o dono pode transferir a propriedade';
  end if;
  new.invite_code:=old.invite_code;
  new.created_at:=old.created_at;
  return new;
end $$;

create or replace function public.nexo_leave_group(p_group_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_me uuid; v_role text; v_new_owner uuid;
begin
  v_me:=public.current_profile_id();
  select role into v_role from public.nexo_group_members
  where group_id=p_group_id and profile_id=v_me and status='active' for update;
  if v_role is null then raise exception 'Voce nao participa deste grupo'; end if;

  if v_role='owner' then
    select profile_id into v_new_owner
    from public.nexo_group_members
    where group_id=p_group_id and profile_id<>v_me and status='active'
    order by case when role='admin' then 0 else 1 end, joined_at
    limit 1;

    if v_new_owner is null then
      update public.nexo_groups set is_active=false where id=p_group_id;
    else
      update public.nexo_group_members set role='owner'
      where group_id=p_group_id and profile_id=v_new_owner;
      update public.nexo_groups set owner_profile_id=v_new_owner where id=p_group_id;
    end if;
  end if;

  update public.nexo_group_members set status='left',role='member'
  where group_id=p_group_id and profile_id=v_me;
end $$;

grant execute on function public.nexo_leave_group(uuid) to authenticated;
notify pgrst,'reload schema';
