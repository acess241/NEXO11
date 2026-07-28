-- NEXO GRUPOS — REPARO V2
-- Execute este script inteiro depois de groups_whatsapp_setup.sql.
-- Nao apaga grupos, participantes ou mensagens.

create extension if not exists pgcrypto;

-- Funcao-base independente do setup antigo do chat.
create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.account_id = auth.uid()
  limit 1
$$;

revoke all on function public.current_profile_id() from public;
grant execute on function public.current_profile_id() to authenticated;

-- Confirma que as tabelas foram realmente criadas pelo primeiro SQL.
do $$
begin
  if to_regclass('public.nexo_groups') is null then
    raise exception 'Tabela public.nexo_groups nao existe. Execute groups_whatsapp_setup.sql primeiro.';
  end if;
  if to_regclass('public.nexo_group_members') is null then
    raise exception 'Tabela public.nexo_group_members nao existe. Execute groups_whatsapp_setup.sql primeiro.';
  end if;
  if to_regclass('public.nexo_group_messages') is null then
    raise exception 'Tabela public.nexo_group_messages nao existe. Execute groups_whatsapp_setup.sql primeiro.';
  end if;
  if to_regclass('public.nexo_group_invites') is null then
    raise exception 'Tabela public.nexo_group_invites nao existe. Execute groups_whatsapp_setup.sql primeiro.';
  end if;
  if to_regclass('public.nexo_group_join_requests') is null then
    raise exception 'Tabela public.nexo_group_join_requests nao existe. Execute groups_whatsapp_setup.sql primeiro.';
  end if;
end
$$;

-- Helpers de seguranca. SECURITY DEFINER evita recursao nas policies RLS.
create or replace function public.nexo_is_group_member(
  p_group_id uuid,
  p_profile_id uuid default public.current_profile_id()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.nexo_group_members gm
    where gm.group_id = p_group_id
      and gm.profile_id = p_profile_id
      and gm.status = 'active'
  )
$$;

create or replace function public.nexo_is_group_admin(
  p_group_id uuid,
  p_profile_id uuid default public.current_profile_id()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.nexo_group_members gm
    where gm.group_id = p_group_id
      and gm.profile_id = p_profile_id
      and gm.status = 'active'
      and gm.role in ('owner', 'admin')
  )
$$;

revoke all on function public.nexo_is_group_member(uuid, uuid) from public;
revoke all on function public.nexo_is_group_admin(uuid, uuid) from public;
grant execute on function public.nexo_is_group_member(uuid, uuid) to authenticated;
grant execute on function public.nexo_is_group_admin(uuid, uuid) to authenticated;

-- Recria a funcao de criacao com assinatura reconhecida pelo PostgREST.
drop function if exists public.nexo_create_group(text, text, uuid[]);

create function public.nexo_create_group(
  p_name text,
  p_description text default '',
  p_member_ids uuid[] default array[]::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_group_id uuid;
  v_member_id uuid;
begin
  v_me := public.current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario autenticado nao encontrado';
  end if;

  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception 'Informe o nome do grupo';
  end if;

  insert into public.nexo_groups (
    name,
    description,
    owner_profile_id
  )
  values (
    left(btrim(p_name), 100),
    left(coalesce(btrim(p_description), ''), 500),
    v_me
  )
  returning id into v_group_id;

  insert into public.nexo_group_members (
    group_id,
    profile_id,
    role,
    status
  )
  values (
    v_group_id,
    v_me,
    'owner',
    'active'
  )
  on conflict (group_id, profile_id)
  do update set
    role = 'owner',
    status = 'active';

  foreach v_member_id in array coalesce(p_member_ids, array[]::uuid[])
  loop
    if v_member_id is not null and v_member_id <> v_me then
      insert into public.nexo_group_invites (
        group_id,
        inviter_profile_id,
        invitee_profile_id,
        status
      )
      values (
        v_group_id,
        v_me,
        v_member_id,
        'pending'
      )
      on conflict do nothing;
    end if;
  end loop;

  return v_group_id;
end
$$;

revoke all on function public.nexo_create_group(text, text, uuid[]) from public;
grant execute on function public.nexo_create_group(text, text, uuid[]) to authenticated;

-- Permissoes das tabelas usadas pelo aplicativo.
grant usage on schema public to authenticated;
grant select, update on public.nexo_groups to authenticated;
grant select on public.nexo_group_members to authenticated;
grant select on public.nexo_group_invites to authenticated;
grant select on public.nexo_group_join_requests to authenticated;
grant select, insert, update on public.nexo_group_messages to authenticated;
grant select, insert, update on public.nexo_group_reads to authenticated;

-- Garante que RLS esteja ligado.
alter table public.nexo_groups enable row level security;
alter table public.nexo_group_members enable row level security;
alter table public.nexo_group_invites enable row level security;
alter table public.nexo_group_join_requests enable row level security;
alter table public.nexo_group_messages enable row level security;
alter table public.nexo_group_reads enable row level security;

-- Repara policies essenciais de leitura.
drop policy if exists nexo_groups_select on public.nexo_groups;
create policy nexo_groups_select
on public.nexo_groups
for select
to authenticated
using (
  public.nexo_is_group_member(id, public.current_profile_id())
  or owner_profile_id = public.current_profile_id()
  or exists (
    select 1
    from public.nexo_group_invites gi
    where gi.group_id = id
      and gi.invitee_profile_id = public.current_profile_id()
      and gi.status = 'pending'
  )
);

drop policy if exists nexo_members_select on public.nexo_group_members;
create policy nexo_members_select
on public.nexo_group_members
for select
to authenticated
using (
  profile_id = public.current_profile_id()
  or public.nexo_is_group_member(group_id, public.current_profile_id())
);

drop policy if exists nexo_invites_select on public.nexo_group_invites;
create policy nexo_invites_select
on public.nexo_group_invites
for select
to authenticated
using (
  invitee_profile_id = public.current_profile_id()
  or public.nexo_is_group_admin(group_id, public.current_profile_id())
);

drop policy if exists nexo_messages_select on public.nexo_group_messages;
create policy nexo_messages_select
on public.nexo_group_messages
for select
to authenticated
using (
  public.nexo_is_group_member(group_id, public.current_profile_id())
);

drop policy if exists nexo_messages_insert on public.nexo_group_messages;
create policy nexo_messages_insert
on public.nexo_group_messages
for insert
to authenticated
with check (
  sender_profile_id = public.current_profile_id()
  and public.nexo_is_group_member(group_id, public.current_profile_id())
  and (
    not coalesce(
      (select g.only_admins_send from public.nexo_groups g where g.id = group_id),
      false
    )
    or public.nexo_is_group_admin(group_id, public.current_profile_id())
  )
);

-- Adiciona mensagens ao Realtime quando ainda nao estiverem adicionadas.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'nexo_group_messages'
  ) then
    alter publication supabase_realtime
      add table public.nexo_group_messages;
  end if;
end
$$;

-- Forca o PostgREST a reconhecer tabelas e funcoes imediatamente.
notify pgrst, 'reload schema';

-- Resultado final: todas as colunas abaixo devem aparecer preenchidas.
select
  to_regclass('public.nexo_groups') as grupos,
  to_regclass('public.nexo_group_members') as participantes,
  to_regclass('public.nexo_group_messages') as mensagens,
  to_regclass('public.nexo_group_invites') as convites,
  to_regprocedure('public.nexo_create_group(text,text,uuid[])') as funcao_criar_grupo,
  to_regprocedure('public.current_profile_id()') as funcao_perfil_atual;
