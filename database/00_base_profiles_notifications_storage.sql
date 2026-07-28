-- Nexo 11 - Base: profiles, notifications e storage
-- Execute ANTES dos demais scripts (ou use nexo11_setup_completo.sql).
-- Idempotente: pode rodar mais de uma vez com seguranca.

create extension if not exists pgcrypto;

-- ============================================================
-- PROFILES
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references auth.users (id) on delete cascade,
  nome text not null,
  username text not null,
  bio text not null default '',
  foto_url text,
  cpf text,
  institution_id uuid,
  institution_name text,
  enrollment_number text,
  role text not null default 'student',
  teacher_subject text,
  teacher_school text,
  teacher_registration text,
  teacher_department text,
  course_area text not null default 'base_central',
  xp_total integer not null default 0,
  level integer not null default 1,
  is_private boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.profiles add column if not exists account_id uuid references auth.users (id) on delete cascade;
alter table public.profiles add column if not exists nome text;
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists bio text default '';
alter table public.profiles add column if not exists foto_url text;
alter table public.profiles add column if not exists cpf text;
alter table public.profiles add column if not exists institution_id uuid;
alter table public.profiles add column if not exists institution_name text;
alter table public.profiles add column if not exists enrollment_number text;
alter table public.profiles add column if not exists role text default 'student';
alter table public.profiles add column if not exists teacher_subject text;
alter table public.profiles add column if not exists teacher_school text;
alter table public.profiles add column if not exists teacher_registration text;
alter table public.profiles add column if not exists teacher_department text;
alter table public.profiles add column if not exists course_area text default 'base_central';
alter table public.profiles add column if not exists xp_total integer default 0;
alter table public.profiles add column if not exists level integer default 1;
alter table public.profiles add column if not exists is_private boolean default false;
alter table public.profiles add column if not exists created_at timestamptz default timezone('utc', now());
alter table public.profiles add column if not exists updated_at timestamptz default timezone('utc', now());

update public.profiles set bio = '' where bio is null;
update public.profiles set role = 'student' where role is null or btrim(role) = '';
update public.profiles set course_area = 'base_central' where course_area is null or btrim(course_area) = '';
update public.profiles set xp_total = 0 where xp_total is null;
update public.profiles set level = 1 where level is null;
update public.profiles set is_private = false where is_private is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_unique') then
    alter table public.profiles add constraint profiles_username_unique unique (username);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_cpf_unique') then
    alter table public.profiles add constraint profiles_cpf_unique unique (cpf);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('student', 'teacher', 'admin'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_course_area_check') then
    alter table public.profiles
      add constraint profiles_course_area_check
      check (course_area in ('informatica', 'administracao', 'enfermagem', 'agro', 'base_central', 'outros'));
  end if;
end $$;

create index if not exists profiles_account_id_idx on public.profiles (account_id);
create index if not exists profiles_username_idx on public.profiles (lower(username));
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

alter table public.profiles enable row level security;

drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all
  on public.profiles for select to authenticated using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own
  on public.profiles for insert to authenticated
  with check (account_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles for update to authenticated
  using (account_id = auth.uid())
  with check (account_id = auth.uid());

drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own
  on public.profiles for delete to authenticated
  using (account_id = auth.uid());

grant select, insert, update, delete on public.profiles to authenticated;

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  receiver_profile_id uuid not null references public.profiles (id) on delete cascade,
  actor_profile_id uuid references public.profiles (id) on delete set null,
  type text not null,
  metadata jsonb,
  xp_delta integer,
  xp_reason text,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.notifications add column if not exists metadata jsonb;
alter table public.notifications add column if not exists xp_delta integer;
alter table public.notifications add column if not exists xp_reason text;
alter table public.notifications add column if not exists read_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'notifications_type_check') then
    alter table public.notifications
      add constraint notifications_type_check
      check (type in (
        'follow', 'follow_request', 'message', 'comment', 'reply',
        'like_post', 'like_comment', 'repost', 'story',
        'quiz_result', 'xp_adjustment'
      ));
  end if;
end $$;

create index if not exists notifications_receiver_created_idx
  on public.notifications (receiver_profile_id, created_at desc);
create index if not exists notifications_receiver_unread_idx
  on public.notifications (receiver_profile_id) where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists notifications_select_receiver on public.notifications;
create policy notifications_select_receiver
  on public.notifications for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = notifications.receiver_profile_id
        and p.account_id = auth.uid()
    )
  );

drop policy if exists notifications_insert_authenticated on public.notifications;
create policy notifications_insert_authenticated
  on public.notifications for insert to authenticated
  with check (true);

drop policy if exists notifications_update_receiver on public.notifications;
create policy notifications_update_receiver
  on public.notifications for update to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = notifications.receiver_profile_id
        and p.account_id = auth.uid()
    )
  );

grant select, insert, update on public.notifications to authenticated;

-- ============================================================
-- STORAGE (bucket stories para posts, perfis e midias)
-- ============================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stories',
  'stories',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists stories_public_read on storage.objects;
create policy stories_public_read
  on storage.objects for select to public
  using (bucket_id = 'stories');

drop policy if exists stories_auth_upload on storage.objects;
create policy stories_auth_upload
  on storage.objects for insert to authenticated
  with check (bucket_id = 'stories');

drop policy if exists stories_auth_update on storage.objects;
create policy stories_auth_update
  on storage.objects for update to authenticated
  using (bucket_id = 'stories');

drop policy if exists stories_auth_delete on storage.objects;
create policy stories_auth_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'stories');

-- Realtime para tabelas principais
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
exception
  when others then null;
end $$;
