-- NEXO — GRUPOS COMPLETOS
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em Run.
-- Seguro para executar novamente.

create extension if not exists pgcrypto;

create table if not exists public.nexo_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  description text not null default '',
  avatar_url text,
  owner_profile_id uuid not null references public.profiles(id) on delete restrict,
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  approval_required boolean not null default false,
  only_admins_send boolean not null default false,
  only_admins_edit boolean not null default true,
  members_can_invite boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  last_message_at timestamptz
);

create table if not exists public.nexo_group_members (
  group_id uuid not null references public.nexo_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'left', 'removed', 'blocked')),
  invited_by uuid references public.profiles(id) on delete set null,
  joined_at timestamptz not null default timezone('utc', now()),
  muted_until timestamptz,
  primary key (group_id, profile_id)
);

create table if not exists public.nexo_group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.nexo_groups(id) on delete cascade,
  inviter_profile_id uuid not null references public.profiles(id) on delete cascade,
  invitee_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  created_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  unique (group_id, invitee_profile_id, status)
);

create table if not exists public.nexo_group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.nexo_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'cancelled')),
  message text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  unique (group_id, profile_id, status)
);

create table if not exists public.nexo_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.nexo_groups(id) on delete cascade,
  sender_profile_id uuid references public.profiles(id) on delete set null,
  content text not null default '',
  message_type text not null default 'text' check (message_type in ('text', 'image', 'video', 'audio', 'file', 'system')),
  media_url text,
  reply_to_id uuid references public.nexo_group_messages(id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  check (message_type = 'system' or char_length(btrim(content)) > 0 or media_url is not null)
);

create table if not exists public.nexo_group_reads (
  group_id uuid not null references public.nexo_groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default timezone('utc', now()),
  primary key (group_id, profile_id)
);

create index if not exists nexo_group_members_profile_idx on public.nexo_group_members(profile_id, status);
create index if not exists nexo_group_messages_group_idx on public.nexo_group_messages(group_id, created_at desc);
create index if not exists nexo_group_invites_invitee_idx on public.nexo_group_invites(invitee_profile_id, status);
create index if not exists nexo_group_requests_group_idx on public.nexo_group_join_requests(group_id, status);

create or replace function public.nexo_is_group_member(p_group_id uuid, p_profile_id uuid default public.current_profile_id())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.nexo_group_members
    where group_id = p_group_id and profile_id = p_profile_id and status = 'active'
  )
$$;

create or replace function public.nexo_is_group_admin(p_group_id uuid, p_profile_id uuid default public.current_profile_id())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.nexo_group_members
    where group_id = p_group_id and profile_id = p_profile_id
      and status = 'active' and role in ('owner', 'admin')
  )
$$;

create or replace function public.nexo_create_group(p_name text, p_description text default '', p_member_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_group uuid; v_member uuid;
begin
  v_me := public.current_profile_id();
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;
  insert into public.nexo_groups(name, description, owner_profile_id)
  values (btrim(p_name), coalesce(btrim(p_description), ''), v_me) returning id into v_group;
  insert into public.nexo_group_members(group_id, profile_id, role) values (v_group, v_me, 'owner');
  foreach v_member in array coalesce(p_member_ids, '{}') loop
    if v_member <> v_me then
      insert into public.nexo_group_invites(group_id, inviter_profile_id, invitee_profile_id)
      values (v_group, v_me, v_member) on conflict do nothing;
    end if;
  end loop;
  return v_group;
end $$;

create or replace function public.nexo_invite_group_member(p_group_id uuid, p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_can_invite boolean;
begin
  v_me := public.current_profile_id();
  select (public.nexo_is_group_admin(p_group_id, v_me) or (g.members_can_invite and public.nexo_is_group_member(p_group_id, v_me)))
  into v_can_invite from public.nexo_groups g where g.id = p_group_id;
  if not coalesce(v_can_invite, false) then raise exception 'Sem permissao para convidar'; end if;
  if public.nexo_is_group_member(p_group_id, p_profile_id) then raise exception 'Usuario ja participa do grupo'; end if;
  delete from public.nexo_group_invites where group_id=p_group_id and invitee_profile_id=p_profile_id and status='pending';
  insert into public.nexo_group_invites(group_id, inviter_profile_id, invitee_profile_id)
  values (p_group_id, v_me, p_profile_id);
end $$;

create or replace function public.nexo_respond_group_invite(p_invite_id uuid, p_accept boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_inv public.nexo_group_invites%rowtype;
begin
  v_me := public.current_profile_id();
  select * into v_inv from public.nexo_group_invites where id=p_invite_id for update;
  if not found or v_inv.invitee_profile_id <> v_me or v_inv.status <> 'pending' then
    raise exception 'Convite invalido';
  end if;
  update public.nexo_group_invites set status=case when p_accept then 'accepted' else 'declined' end,
    responded_at=timezone('utc',now()) where id=p_invite_id;
  if p_accept then
    insert into public.nexo_group_members(group_id,profile_id,role,status,invited_by)
    values(v_inv.group_id,v_me,'member','active',v_inv.inviter_profile_id)
    on conflict(group_id,profile_id) do update set status='active', role='member', joined_at=timezone('utc',now());
  end if;
  return v_inv.group_id;
end $$;

create or replace function public.nexo_request_group_join(p_invite_code text, p_message text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_group public.nexo_groups%rowtype;
begin
  v_me := public.current_profile_id();
  select * into v_group from public.nexo_groups where invite_code=upper(btrim(p_invite_code)) and is_active;
  if not found then raise exception 'Codigo de convite invalido'; end if;
  if public.nexo_is_group_member(v_group.id,v_me) then return v_group.id; end if;
  if v_group.approval_required then
    delete from public.nexo_group_join_requests where group_id=v_group.id and profile_id=v_me and status='pending';
    insert into public.nexo_group_join_requests(group_id,profile_id,message) values(v_group.id,v_me,coalesce(p_message,''));
  else
    insert into public.nexo_group_members(group_id,profile_id,status) values(v_group.id,v_me,'active')
    on conflict(group_id,profile_id) do update set status='active',role='member',joined_at=timezone('utc',now());
  end if;
  return v_group.id;
end $$;

create or replace function public.nexo_review_join_request(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_req public.nexo_group_join_requests%rowtype; v_me uuid;
begin
  v_me:=public.current_profile_id();
  select * into v_req from public.nexo_group_join_requests where id=p_request_id for update;
  if not found or not public.nexo_is_group_admin(v_req.group_id,v_me) then raise exception 'Sem permissao'; end if;
  update public.nexo_group_join_requests set status=case when p_approve then 'approved' else 'declined' end,
    reviewed_at=timezone('utc',now()),reviewed_by=v_me where id=p_request_id;
  if p_approve then
    insert into public.nexo_group_members(group_id,profile_id,status) values(v_req.group_id,v_req.profile_id,'active')
    on conflict(group_id,profile_id) do update set status='active',role='member',joined_at=timezone('utc',now());
  end if;
end $$;

create or replace function public.nexo_set_group_member_role(p_group_id uuid,p_profile_id uuid,p_role text)
returns void language plpgsql security definer set search_path=public as $$
declare v_me uuid;
begin
  v_me:=public.current_profile_id();
  if not public.nexo_is_group_admin(p_group_id,v_me) then raise exception 'Sem permissao'; end if;
  if p_role not in ('admin','member') then raise exception 'Cargo invalido'; end if;
  if exists(select 1 from public.nexo_group_members where group_id=p_group_id and profile_id=p_profile_id and role='owner') then
    raise exception 'O dono nao pode ter o cargo alterado';
  end if;
  update public.nexo_group_members set role=p_role where group_id=p_group_id and profile_id=p_profile_id and status='active';
end $$;

create or replace function public.nexo_remove_group_member(p_group_id uuid,p_profile_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_me uuid;
begin
  v_me:=public.current_profile_id();
  if not public.nexo_is_group_admin(p_group_id,v_me) then raise exception 'Sem permissao'; end if;
  if exists(select 1 from public.nexo_group_members where group_id=p_group_id and profile_id=p_profile_id and role='owner') then
    raise exception 'O dono nao pode ser removido';
  end if;
  update public.nexo_group_members set status='removed' where group_id=p_group_id and profile_id=p_profile_id;
end $$;

create or replace function public.nexo_leave_group(p_group_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v_me uuid;
begin
  v_me:=public.current_profile_id();
  if exists(select 1 from public.nexo_group_members where group_id=p_group_id and profile_id=v_me and role='owner') then
    raise exception 'Transfira a propriedade antes de sair';
  end if;
  update public.nexo_group_members set status='left' where group_id=p_group_id and profile_id=v_me;
end $$;

create or replace function public.nexo_touch_group_message()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.nexo_groups set last_message_at=new.created_at,updated_at=timezone('utc',now()) where id=new.group_id;
  return new;
end $$;
drop trigger if exists trg_nexo_touch_group_message on public.nexo_group_messages;
create trigger trg_nexo_touch_group_message after insert on public.nexo_group_messages
for each row execute function public.nexo_touch_group_message();

create or replace function public.nexo_protect_group_identity()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.owner_profile_id is distinct from old.owner_profile_id then
    raise exception 'Use a transferencia de propriedade para alterar o dono';
  end if;
  new.invite_code := old.invite_code;
  new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists trg_nexo_protect_group_identity on public.nexo_groups;
create trigger trg_nexo_protect_group_identity before update on public.nexo_groups
for each row execute function public.nexo_protect_group_identity();

alter table public.nexo_groups enable row level security;
alter table public.nexo_group_members enable row level security;
alter table public.nexo_group_invites enable row level security;
alter table public.nexo_group_join_requests enable row level security;
alter table public.nexo_group_messages enable row level security;
alter table public.nexo_group_reads enable row level security;

drop policy if exists nexo_groups_select on public.nexo_groups;
create policy nexo_groups_select on public.nexo_groups for select to authenticated
using (public.nexo_is_group_member(id) or owner_profile_id=public.current_profile_id()
  or exists(select 1 from public.nexo_group_invites i where i.group_id=id and i.invitee_profile_id=public.current_profile_id() and i.status='pending'));
drop policy if exists nexo_groups_update on public.nexo_groups;
create policy nexo_groups_update on public.nexo_groups for update to authenticated
using (public.nexo_is_group_admin(id)) with check (public.nexo_is_group_admin(id));

drop policy if exists nexo_members_select on public.nexo_group_members;
create policy nexo_members_select on public.nexo_group_members for select to authenticated
using (public.nexo_is_group_member(group_id));

drop policy if exists nexo_invites_select on public.nexo_group_invites;
create policy nexo_invites_select on public.nexo_group_invites for select to authenticated
using (invitee_profile_id=public.current_profile_id() or public.nexo_is_group_admin(group_id));

drop policy if exists nexo_requests_select on public.nexo_group_join_requests;
create policy nexo_requests_select on public.nexo_group_join_requests for select to authenticated
using (profile_id=public.current_profile_id() or public.nexo_is_group_admin(group_id));

drop policy if exists nexo_messages_select on public.nexo_group_messages;
create policy nexo_messages_select on public.nexo_group_messages for select to authenticated
using (public.nexo_is_group_member(group_id));
drop policy if exists nexo_messages_insert on public.nexo_group_messages;
create policy nexo_messages_insert on public.nexo_group_messages for insert to authenticated
with check (
  sender_profile_id=public.current_profile_id() and public.nexo_is_group_member(group_id)
  and (not (select only_admins_send from public.nexo_groups where id=group_id) or public.nexo_is_group_admin(group_id))
);

drop policy if exists nexo_reads_all on public.nexo_group_reads;
create policy nexo_reads_all on public.nexo_group_reads for all to authenticated
using (profile_id=public.current_profile_id()) with check (profile_id=public.current_profile_id());

grant select,update on public.nexo_groups to authenticated;
grant select on public.nexo_group_members,public.nexo_group_invites,public.nexo_group_join_requests to authenticated;
grant select,insert,update on public.nexo_group_messages,public.nexo_group_reads to authenticated;
grant execute on function public.nexo_create_group(text,text,uuid[]) to authenticated;
grant execute on function public.nexo_invite_group_member(uuid,uuid) to authenticated;
grant execute on function public.nexo_respond_group_invite(uuid,boolean) to authenticated;
grant execute on function public.nexo_request_group_join(text,text) to authenticated;
grant execute on function public.nexo_review_join_request(uuid,boolean) to authenticated;
grant execute on function public.nexo_set_group_member_role(uuid,uuid,text) to authenticated;
grant execute on function public.nexo_remove_group_member(uuid,uuid) to authenticated;
grant execute on function public.nexo_leave_group(uuid) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.nexo_group_messages;
exception when duplicate_object then null;
end $$;
