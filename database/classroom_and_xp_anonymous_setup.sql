-- Nexo 11 / Atividades
-- Setup de Sala por codigo + patch de XP anonimo no admin.
-- Execute no SQL Editor do Supabase.

begin;

create extension if not exists pgcrypto;

-- Garantir colunas de notificacao usadas pelo app.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'notifications'
  ) then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notifications'
        and column_name = 'xp_delta'
    ) then
      alter table public.notifications add column xp_delta integer;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notifications'
        and column_name = 'xp_reason'
    ) then
      alter table public.notifications add column xp_reason text;
    end if;

    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'notifications'
        and column_name = 'metadata'
    ) then
      alter table public.notifications add column metadata jsonb;
    end if;
  end if;
end $$;

-- Garantir role no profile.
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'profiles'
  ) then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'profiles'
        and column_name = 'role'
    ) then
      alter table public.profiles add column role text not null default 'student';
    end if;
  end if;
end $$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'profiles'
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('student', 'teacher', 'admin'));
  end if;
exception
  when duplicate_object then null;
end $$;

create or replace function public.classroom_current_profile_id()
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

grant execute on function public.classroom_current_profile_id() to authenticated;

create or replace function public.classroom_is_teacher(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and lower(coalesce(p.role, 'student')) in ('teacher', 'admin')
  )
$$;

grant execute on function public.classroom_is_teacher(uuid) to authenticated;

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  teacher_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  subject text not null,
  grade text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists classrooms_teacher_idx
  on public.classrooms (teacher_profile_id, created_at desc);

create table if not exists public.classroom_members (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'student' check (role in ('teacher', 'student')),
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'blocked', 'left')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (classroom_id, profile_id)
);

create index if not exists classroom_members_profile_idx
  on public.classroom_members (profile_id, status, updated_at desc);

create index if not exists classroom_members_classroom_idx
  on public.classroom_members (classroom_id, status, updated_at desc);

create table if not exists public.classroom_join_requests (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  student_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'approved', 'rejected', 'blocked', 'cancelled')),
  requested_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  reviewer_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists classroom_join_requests_unique_pending_idx
  on public.classroom_join_requests (classroom_id, student_profile_id)
  where status = 'requested';

create index if not exists classroom_join_requests_teacher_idx
  on public.classroom_join_requests (classroom_id, status, requested_at desc);

create or replace function public.classroom_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_classrooms_touch_updated_at on public.classrooms;
create trigger trg_classrooms_touch_updated_at
before update on public.classrooms
for each row execute procedure public.classroom_touch_updated_at();

drop trigger if exists trg_classroom_members_touch_updated_at on public.classroom_members;
create trigger trg_classroom_members_touch_updated_at
before update on public.classroom_members
for each row execute procedure public.classroom_touch_updated_at();

drop trigger if exists trg_classroom_join_requests_touch_updated_at on public.classroom_join_requests;
create trigger trg_classroom_join_requests_touch_updated_at
before update on public.classroom_join_requests
for each row execute procedure public.classroom_touch_updated_at();

alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.classroom_join_requests enable row level security;

drop policy if exists classrooms_select_visible on public.classrooms;
create policy classrooms_select_visible
  on public.classrooms
  for select
  to authenticated
  using (
    teacher_profile_id = public.classroom_current_profile_id()
    or exists (
      select 1
      from public.classroom_members cm
      where cm.classroom_id = classrooms.id
        and cm.profile_id = public.classroom_current_profile_id()
        and cm.status in ('requested', 'approved', 'rejected', 'blocked')
    )
  );

drop policy if exists classrooms_insert_teacher on public.classrooms;
create policy classrooms_insert_teacher
  on public.classrooms
  for insert
  to authenticated
  with check (teacher_profile_id = public.classroom_current_profile_id());

drop policy if exists classrooms_update_teacher on public.classrooms;
create policy classrooms_update_teacher
  on public.classrooms
  for update
  to authenticated
  using (teacher_profile_id = public.classroom_current_profile_id())
  with check (teacher_profile_id = public.classroom_current_profile_id());

drop policy if exists classrooms_delete_teacher on public.classrooms;
create policy classrooms_delete_teacher
  on public.classrooms
  for delete
  to authenticated
  using (teacher_profile_id = public.classroom_current_profile_id());

drop policy if exists classroom_members_select_self on public.classroom_members;
create policy classroom_members_select_self
  on public.classroom_members
  for select
  to authenticated
  using (
    profile_id = public.classroom_current_profile_id()
    or exists (
      select 1
      from public.classrooms c
      where c.id = classroom_members.classroom_id
        and c.teacher_profile_id = public.classroom_current_profile_id()
    )
  );

drop policy if exists classroom_members_insert_self_or_teacher on public.classroom_members;
create policy classroom_members_insert_self_or_teacher
  on public.classroom_members
  for insert
  to authenticated
  with check (
    profile_id = public.classroom_current_profile_id()
    or exists (
      select 1
      from public.classrooms c
      where c.id = classroom_members.classroom_id
        and c.teacher_profile_id = public.classroom_current_profile_id()
    )
  );

drop policy if exists classroom_members_update_self_or_teacher on public.classroom_members;
create policy classroom_members_update_self_or_teacher
  on public.classroom_members
  for update
  to authenticated
  using (
    profile_id = public.classroom_current_profile_id()
    or exists (
      select 1
      from public.classrooms c
      where c.id = classroom_members.classroom_id
        and c.teacher_profile_id = public.classroom_current_profile_id()
    )
  )
  with check (
    profile_id = public.classroom_current_profile_id()
    or exists (
      select 1
      from public.classrooms c
      where c.id = classroom_members.classroom_id
        and c.teacher_profile_id = public.classroom_current_profile_id()
    )
  );

drop policy if exists classroom_join_requests_select_visible on public.classroom_join_requests;
create policy classroom_join_requests_select_visible
  on public.classroom_join_requests
  for select
  to authenticated
  using (
    student_profile_id = public.classroom_current_profile_id()
    or exists (
      select 1
      from public.classrooms c
      where c.id = classroom_join_requests.classroom_id
        and c.teacher_profile_id = public.classroom_current_profile_id()
    )
  );

drop policy if exists classroom_join_requests_insert_student on public.classroom_join_requests;
create policy classroom_join_requests_insert_student
  on public.classroom_join_requests
  for insert
  to authenticated
  with check (student_profile_id = public.classroom_current_profile_id());

drop policy if exists classroom_join_requests_update_teacher on public.classroom_join_requests;
create policy classroom_join_requests_update_teacher
  on public.classroom_join_requests
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.classrooms c
      where c.id = classroom_join_requests.classroom_id
        and c.teacher_profile_id = public.classroom_current_profile_id()
    )
  )
  with check (
    exists (
      select 1
      from public.classrooms c
      where c.id = classroom_join_requests.classroom_id
        and c.teacher_profile_id = public.classroom_current_profile_id()
    )
  );

create or replace function public.classroom_normalize_code(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'))
$$;

create or replace function public.classroom_generate_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_tries integer := 0;
begin
  loop
    -- Combinacao com timestamp + UUID parcial: espaco de codigos astronomico.
    v_code :=
      'NEXO-' ||
      to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') ||
      '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    v_tries := v_tries + 1;

    if not exists (select 1 from public.classrooms c where c.code = v_code) then
      return v_code;
    end if;

    if v_tries >= 50 then
      raise exception 'Nao foi possivel gerar codigo de sala unico';
    end if;
  end loop;
end;
$$;

grant execute on function public.classroom_generate_code() to authenticated;

create or replace function public.classroom_create(
  p_name text,
  p_subject text,
  p_grade text,
  p_description text default null
)
returns table (
  classroom_id uuid,
  code text,
  name text,
  subject text,
  grade text,
  description text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_name text;
  v_subject text;
  v_grade text;
  v_description text;
  v_code text;
  v_classroom_id uuid;
begin
  v_me := public.classroom_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');
  v_subject := nullif(btrim(coalesce(p_subject, '')), '');
  v_grade := nullif(btrim(coalesce(p_grade, '')), '');
  v_description := nullif(btrim(coalesce(p_description, '')), '');

  if v_name is null then
    raise exception 'Informe o nome da sala';
  end if;
  if v_subject is null then
    raise exception 'Informe a materia da sala';
  end if;
  if v_grade is null then
    raise exception 'Informe a serie da sala';
  end if;

  v_code := public.classroom_generate_code();

  insert into public.classrooms (
    code,
    teacher_profile_id,
    name,
    subject,
    grade,
    description
  )
  values (
    v_code,
    v_me,
    v_name,
    v_subject,
    v_grade,
    v_description
  )
  returning id into v_classroom_id;

  insert into public.classroom_members (
    classroom_id,
    profile_id,
    role,
    status
  )
  values (
    v_classroom_id,
    v_me,
    'teacher',
    'approved'
  )
  on conflict (classroom_id, profile_id)
  do update set
    role = excluded.role,
    status = excluded.status,
    updated_at = timezone('utc', now());

  return query
  select
    c.id,
    c.code,
    c.name,
    c.subject,
    c.grade,
    c.description
  from public.classrooms c
  where c.id = v_classroom_id
  limit 1;
end;
$$;

grant execute on function public.classroom_create(text, text, text, text) to authenticated;

create or replace function public.classroom_preview_by_code(p_code text)
returns table (
  classroom_id uuid,
  code text,
  name text,
  subject text,
  grade text,
  description text,
  teacher_profile_id uuid,
  teacher_name text,
  teacher_username text,
  membership_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_target text;
begin
  v_me := public.classroom_current_profile_id();
  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  v_target := public.classroom_normalize_code(p_code);
  if v_target = '' then
    raise exception 'Informe o codigo da sala';
  end if;

  return query
  select
    c.id as classroom_id,
    c.code,
    c.name,
    c.subject,
    c.grade,
    c.description,
    c.teacher_profile_id,
    t.nome as teacher_name,
    t.username as teacher_username,
    coalesce(m.status, 'not_member') as membership_status
  from public.classrooms c
  left join public.profiles t
    on t.id = c.teacher_profile_id
  left join public.classroom_members m
    on m.classroom_id = c.id
   and m.profile_id = v_me
  where public.classroom_normalize_code(c.code) = v_target
  order by c.created_at desc
  limit 1;

  if not found then
    raise exception 'Codigo de sala invalido ou nao encontrado';
  end if;
end;
$$;

grant execute on function public.classroom_preview_by_code(text) to authenticated;

create or replace function public.classroom_request_join_by_code(p_code text)
returns table (
  classroom_id uuid,
  request_id uuid,
  status text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_target text;
  v_classroom public.classrooms%rowtype;
  v_member public.classroom_members%rowtype;
  v_request_id uuid;
begin
  v_me := public.classroom_current_profile_id();
  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  v_target := public.classroom_normalize_code(p_code);
  if v_target = '' then
    raise exception 'Informe o codigo da sala';
  end if;

  select *
  into v_classroom
  from public.classrooms c
  where public.classroom_normalize_code(c.code) = v_target
  order by c.created_at desc
  limit 1;

  if v_classroom.id is null then
    raise exception 'Codigo de sala invalido ou nao encontrado';
  end if;

  if v_classroom.teacher_profile_id = v_me then
    return query
    select v_classroom.id, null::uuid, 'approved'::text, 'Voce e o professor desta sala.'::text;
    return;
  end if;

  select *
  into v_member
  from public.classroom_members cm
  where cm.classroom_id = v_classroom.id
    and cm.profile_id = v_me
  limit 1;

  if v_member.status = 'blocked' then
    raise exception 'Voce foi bloqueado nesta sala';
  end if;

  if v_member.status = 'approved' then
    return query
    select v_classroom.id, null::uuid, 'approved'::text, 'Voce ja participa desta sala.'::text;
    return;
  end if;

  insert into public.classroom_members (
    classroom_id,
    profile_id,
    role,
    status
  )
  values (
    v_classroom.id,
    v_me,
    'student',
    'requested'
  )
  on conflict (classroom_id, profile_id)
  do update set
    role = excluded.role,
    status = excluded.status,
    updated_at = timezone('utc', now());

  insert into public.classroom_join_requests (
    classroom_id,
    student_profile_id,
    status,
    requested_at
  )
  values (
    v_classroom.id,
    v_me,
    'requested',
    timezone('utc', now())
  )
  on conflict (classroom_id, student_profile_id)
  where status = 'requested'
  do update set
    updated_at = timezone('utc', now())
  returning id into v_request_id;

  return query
  select
    v_classroom.id,
    v_request_id,
    'requested'::text,
    'Solicitacao enviada. Aguardando aprovacao do professor.'::text;
end;
$$;

grant execute on function public.classroom_request_join_by_code(text) to authenticated;

create or replace function public.classroom_leave(p_classroom_id uuid)
returns table (
  ok boolean,
  classroom_id uuid,
  status text,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_classroom public.classrooms%rowtype;
begin
  v_me := public.classroom_current_profile_id();
  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if p_classroom_id is null then
    raise exception 'Sala invalida';
  end if;

  select *
  into v_classroom
  from public.classrooms c
  where c.id = p_classroom_id
  limit 1;

  if v_classroom.id is null then
    raise exception 'Sala nao encontrada';
  end if;

  if v_classroom.teacher_profile_id = v_me then
    return query
    select false, v_classroom.id, 'owner'::text, 'Professor deve excluir a sala.'::text;
    return;
  end if;

  insert into public.classroom_members (
    classroom_id,
    profile_id,
    role,
    status
  )
  values (
    v_classroom.id,
    v_me,
    'student',
    'left'
  )
  on conflict (classroom_id, profile_id)
  do update set
    status = 'left',
    updated_at = timezone('utc', now());

  update public.classroom_join_requests
     set status = 'cancelled',
         reviewed_at = timezone('utc', now()),
         reviewer_profile_id = null,
         updated_at = timezone('utc', now())
   where classroom_id = v_classroom.id
     and student_profile_id = v_me
     and status = 'requested';

  return query
  select true, v_classroom.id, 'left'::text, 'Voce saiu da sala.'::text;
end;
$$;

grant execute on function public.classroom_leave(uuid) to authenticated;

create or replace function public.classroom_delete(p_classroom_id uuid)
returns table (
  deleted boolean,
  classroom_id uuid,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_role text;
  v_classroom public.classrooms%rowtype;
begin
  v_me := public.classroom_current_profile_id();
  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if p_classroom_id is null then
    raise exception 'Sala invalida';
  end if;

  select lower(coalesce(p.role, 'student'))
  into v_role
  from public.profiles p
  where p.id = v_me
  limit 1;

  select *
  into v_classroom
  from public.classrooms c
  where c.id = p_classroom_id
  limit 1;

  if v_classroom.id is null then
    return query select false, p_classroom_id, 'Sala nao encontrada.'::text;
    return;
  end if;

  if v_classroom.teacher_profile_id <> v_me and v_role not in ('admin', 'adm') then
    raise exception 'Sem permissao para excluir esta sala';
  end if;

  delete from public.classroom_join_requests where classroom_id = v_classroom.id;
  delete from public.classroom_members where classroom_id = v_classroom.id;
  delete from public.classrooms where id = v_classroom.id;

  return query
  select true, v_classroom.id, 'Sala excluida com sucesso.'::text;
end;
$$;

grant execute on function public.classroom_delete(uuid) to authenticated;

create or replace function public.academy_admin_adjust_profile_xp(
  p_target_profile_id uuid,
  p_delta_xp integer,
  p_reason text default null
)
returns table (
  profile_id uuid,
  username text,
  nome text,
  xp_total integer,
  level integer,
  delta_xp integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $academy_admin_adjust_profile_xp$
declare
  v_me uuid;
  v_delta integer;
  v_reason text;
begin
  v_me := public.academy_current_profile_id();

  if v_me is null then
    raise exception 'Perfil do usuario nao encontrado';
  end if;

  if not public.academy_is_quiz_admin(v_me) then
    raise exception 'Acesso restrito ao admin do quiz';
  end if;

  if p_target_profile_id is null then
    raise exception 'Perfil alvo invalido';
  end if;

  v_delta := coalesce(p_delta_xp, 0);

  if v_delta = 0 then
    raise exception 'Informe um delta de XP diferente de zero';
  end if;

  if abs(v_delta) > 5000 then
    raise exception 'Ajuste maximo por operacao: 5000 XP';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then
    v_reason := 'Ajuste administrativo de XP';
  end if;

  perform public.academy_add_xp(
    p_target_profile_id,
    v_delta,
    v_reason,
    'admin',
    v_me::text
  );

  insert into public.notifications (
    receiver_profile_id,
    actor_profile_id,
    type,
    xp_delta,
    xp_reason,
    metadata
  )
  values (
    p_target_profile_id,
    null,
    'message',
    v_delta,
    v_reason,
    jsonb_build_object(
      'kind', 'xp_adjustment',
      'xp_delta', v_delta,
      'reason', v_reason,
      'anonymous', true,
      'actor_alias', 'Atividades',
      'source', 'admin'
    )
  );

  return query
  select
    p.id,
    p.username,
    p.nome,
    coalesce(p.xp_total, 0)::int,
    coalesce(p.level, 1)::int,
    v_delta,
    v_reason
  from public.profiles p
  where p.id = p_target_profile_id
  limit 1;
end;
$academy_admin_adjust_profile_xp$;

grant execute on function public.academy_admin_adjust_profile_xp(uuid, integer, text) to authenticated;

commit;
