-- Hotfix: sala por codigo (padrao em Classroom.code)
-- Execute no SQL Editor do Supabase.

begin;

create extension if not exists pgcrypto;

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

create or replace function public.classroom_normalize_code(p_code text)
returns text
language sql
immutable
as $$
  with raw as (
    select upper(
      regexp_replace(
        replace(coalesce(p_code, ''), '_', '-'),
        '\s+',
        '',
        'g'
      )
    ) as value
  ),
  cleaned as (
    select trim(
      both '-'
      from regexp_replace(
        regexp_replace(value, '[^A-Z0-9-]', '', 'g'),
        '-+',
        '-',
        'g'
      )
    ) as value
    from raw
  )
  select case
    when value ~ '^NEXO[0-9A-Z]+$' and length(value) > 4 then
      'NEXO-' || substr(value, 5)
    else value
  end
  from cleaned
$$;

create or replace function public.classroom_code_key(p_code text)
returns text
language sql
immutable
as $$
  with normalized as (
    select regexp_replace(public.classroom_normalize_code(p_code), '[^A-Z0-9]', '', 'g') as raw
  )
  select case
    when raw like 'NEXO%' and length(raw) > 4 then substr(raw, 5)
    else raw
  end
  from normalized
$$;

grant execute on function public.classroom_normalize_code(text) to authenticated;
grant execute on function public.classroom_code_key(text) to authenticated;

create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  teacher_profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  subject text not null,
  grade text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

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

delete from public.classroom_members a
using public.classroom_members b
where a.ctid < b.ctid
  and a.classroom_id = b.classroom_id
  and a.profile_id = b.profile_id;

create unique index if not exists classroom_members_unique_idx
  on public.classroom_members (classroom_id, profile_id);

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

with ranked as (
  select
    id,
    row_number() over (
      partition by classroom_id, student_profile_id, status
      order by requested_at desc, id desc
    ) as rn
  from public.classroom_join_requests
  where status = 'requested'
)
delete from public.classroom_join_requests q
using ranked r
where q.id = r.id
  and r.rn > 1;

create unique index if not exists classroom_join_requests_unique_pending_idx
  on public.classroom_join_requests (classroom_id, student_profile_id)
  where status = 'requested';

do $$
declare
  v_col text;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'classrooms'
      and column_name = 'code'
  ) then
    alter table public.classrooms add column code text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'classrooms'
      and column_name = 'is_active'
  ) then
    alter table public.classrooms add column is_active boolean default true;
  end if;

  for v_col in
    select c.column_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'classrooms'
      and lower(c.column_name) in (
        'classcode',
        'classroomcode',
        'joincode',
        'invitecode',
        'roomcode',
        'codigo',
        'codigosala'
      )
  loop
    execute format(
      'update public.classrooms
          set code = coalesce(nullif(code, ''''), nullif(%1$I::text, ''''))
        where coalesce(nullif(code, ''''), '''') = ''''',
      v_col
    );
  end loop;

  update public.classrooms
     set is_active = true
   where is_active is null;
end $$;

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
    v_code := public.classroom_normalize_code(
      'NEXO-' ||
      to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') ||
      '-' ||
      upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
    );
    v_tries := v_tries + 1;

    if not exists (
      select 1
      from public.classrooms c
      where public.classroom_code_key(c.code) = public.classroom_code_key(v_code)
    ) then
      return v_code;
    end if;

    if v_tries >= 100 then
      raise exception 'Nao foi possivel gerar codigo de sala unico';
    end if;
  end loop;
end;
$$;

grant execute on function public.classroom_generate_code() to authenticated;

update public.classrooms
   set code = public.classroom_normalize_code(code)
 where coalesce(code, '') <> '';

update public.classrooms
   set code = public.classroom_generate_code()
 where coalesce(code, '') = '';

with ranked as (
  select
    c.id,
    row_number() over (
      partition by public.classroom_code_key(c.code)
      order by c.created_at asc, c.id asc
    ) as rn
  from public.classrooms c
)
update public.classrooms c
   set code = public.classroom_generate_code()
  from ranked r
 where c.id = r.id
   and r.rn > 1;

alter table public.classrooms alter column code set not null;
alter table public.classrooms alter column is_active set not null;

create unique index if not exists classrooms_code_key_unique_idx
  on public.classrooms ((public.classroom_code_key(code)));

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
    description,
    is_active
  )
  values (
    v_code,
    v_me,
    v_name,
    v_subject,
    v_grade,
    v_description,
    true
  )
  returning id into v_classroom_id;

  insert into public.classroom_members (
    classroom_id,
    profile_id,
    role,
    status
  )
  select
    v_classroom_id,
    v_me,
    'teacher',
    'approved'
  where not exists (
    select 1
    from public.classroom_members cm
    where cm.classroom_id = v_classroom_id
      and cm.profile_id = v_me
  );

  update public.classroom_members cm
     set role = 'teacher',
         status = 'approved',
         updated_at = timezone('utc', now())
   where cm.classroom_id = v_classroom_id
     and cm.profile_id = v_me;

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

  v_target := public.classroom_code_key(p_code);
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
  where public.classroom_code_key(c.code) = v_target
    and coalesce(c.is_active, true) = true
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

  v_target := public.classroom_code_key(p_code);
  if v_target = '' then
    raise exception 'Informe o codigo da sala';
  end if;

  select *
  into v_classroom
  from public.classrooms c
  where public.classroom_code_key(c.code) = v_target
    and coalesce(c.is_active, true) = true
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
  select
    v_classroom.id,
    v_me,
    'student',
    'requested'
  where not exists (
    select 1
    from public.classroom_members cm
    where cm.classroom_id = v_classroom.id
      and cm.profile_id = v_me
  );

  update public.classroom_members cm
     set role = 'student',
         status = 'requested',
         updated_at = timezone('utc', now())
   where cm.classroom_id = v_classroom.id
     and cm.profile_id = v_me;

  update public.classroom_join_requests q
     set updated_at = timezone('utc', now())
   where q.classroom_id = v_classroom.id
     and q.student_profile_id = v_me
     and q.status = 'requested'
  returning q.id into v_request_id;

  if v_request_id is null then
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
    returning id into v_request_id;
  end if;

  return query
  select
    v_classroom.id,
    v_request_id,
    'requested'::text,
    'Aguardando aprovacao do professor.'::text;
end;
$$;

grant execute on function public.classroom_request_join_by_code(text) to authenticated;

commit;
