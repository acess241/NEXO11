-- NEXO GRUPOS — MIDIA, VISUALIZACAO UNICA E EXCLUSAO V3
-- Execute inteiro no SQL Editor depois dos SQLs anteriores.

alter table public.nexo_group_messages
  add column if not exists view_once boolean not null default false,
  add column if not exists media_name text,
  add column if not exists media_size bigint;

create table if not exists public.nexo_group_message_hidden (
  message_id uuid not null references public.nexo_group_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  hidden_at timestamptz not null default timezone('utc',now()),
  primary key(message_id,profile_id)
);

create table if not exists public.nexo_group_media_views (
  message_id uuid not null references public.nexo_group_messages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default timezone('utc',now()),
  primary key(message_id,profile_id)
);

alter table public.nexo_group_reads
  add column if not exists cleared_at timestamptz;

alter table public.nexo_group_message_hidden enable row level security;
alter table public.nexo_group_media_views enable row level security;

drop policy if exists nexo_hidden_own on public.nexo_group_message_hidden;
create policy nexo_hidden_own on public.nexo_group_message_hidden for all to authenticated
using(profile_id=public.current_profile_id())
with check(profile_id=public.current_profile_id());

drop policy if exists nexo_media_views_group on public.nexo_group_media_views;
create policy nexo_media_views_group on public.nexo_group_media_views for select to authenticated
using(profile_id=public.current_profile_id());
drop policy if exists nexo_media_views_insert on public.nexo_group_media_views;
create policy nexo_media_views_insert on public.nexo_group_media_views for insert to authenticated
with check(
  profile_id=public.current_profile_id()
  and exists(
    select 1 from public.nexo_group_messages m
    where m.id=message_id and public.nexo_is_group_member(m.group_id,profile_id)
  )
);

drop policy if exists nexo_messages_update on public.nexo_group_messages;
create policy nexo_messages_update on public.nexo_group_messages for update to authenticated
using(
  sender_profile_id=public.current_profile_id()
  or public.nexo_is_group_admin(group_id,public.current_profile_id())
)
with check(
  sender_profile_id=public.current_profile_id()
  or public.nexo_is_group_admin(group_id,public.current_profile_id())
);

grant select,insert,delete on public.nexo_group_message_hidden to authenticated;
grant select,insert on public.nexo_group_media_views to authenticated;

create or replace function public.nexo_delete_group_message_for_everyone(p_message_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_message public.nexo_group_messages%rowtype; v_me uuid;
begin
  v_me:=public.current_profile_id();
  select * into v_message from public.nexo_group_messages where id=p_message_id for update;
  if not found then raise exception 'Mensagem nao encontrada'; end if;
  if v_message.sender_profile_id<>v_me and not public.nexo_is_group_admin(v_message.group_id,v_me) then
    raise exception 'Sem permissao para apagar esta mensagem';
  end if;
  update public.nexo_group_messages set
    content='Mensagem apagada',media_url=null,media_name=null,media_size=null,
    deleted_at=timezone('utc',now()),edited_at=null
  where id=p_message_id;
end $$;

create or replace function public.nexo_hide_group_message(p_message_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_me uuid; v_group uuid;
begin
  v_me:=public.current_profile_id();
  select group_id into v_group from public.nexo_group_messages where id=p_message_id;
  if v_group is null or not public.nexo_is_group_member(v_group,v_me) then raise exception 'Sem acesso'; end if;
  insert into public.nexo_group_message_hidden(message_id,profile_id)
  values(p_message_id,v_me) on conflict do nothing;
end $$;

create or replace function public.nexo_clear_group_chat(p_group_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_me uuid;
begin
  v_me:=public.current_profile_id();
  if not public.nexo_is_group_member(p_group_id,v_me) then raise exception 'Sem acesso'; end if;
  insert into public.nexo_group_reads(group_id,profile_id,last_read_at,cleared_at)
  values(p_group_id,v_me,timezone('utc',now()),timezone('utc',now()))
  on conflict(group_id,profile_id) do update set
    last_read_at=excluded.last_read_at,cleared_at=excluded.cleared_at;
end $$;

grant execute on function public.nexo_delete_group_message_for_everyone(uuid) to authenticated;
grant execute on function public.nexo_hide_group_message(uuid) to authenticated;
grant execute on function public.nexo_clear_group_chat(uuid) to authenticated;

notify pgrst,'reload schema';
