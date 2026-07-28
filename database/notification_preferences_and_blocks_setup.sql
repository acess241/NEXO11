create extension if not exists pgcrypto;

create table if not exists public.notification_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  follow boolean not null default true,
  follow_request boolean not null default true,
  message boolean not null default true,
  comment boolean not null default true,
  reply boolean not null default true,
  like_post boolean not null default true,
  like_comment boolean not null default true,
  repost boolean not null default true,
  story boolean not null default true,
  xp_adjustment boolean not null default true,
  quiz_result boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences_select_own" on public.notification_preferences;
create policy "notification_preferences_select_own"
on public.notification_preferences
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = notification_preferences.profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists "notification_preferences_insert_own" on public.notification_preferences;
create policy "notification_preferences_insert_own"
on public.notification_preferences
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = notification_preferences.profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists "notification_preferences_update_own" on public.notification_preferences;
create policy "notification_preferences_update_own"
on public.notification_preferences
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = notification_preferences.profile_id
      and profiles.account_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = notification_preferences.profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists "notification_preferences_delete_own" on public.notification_preferences;
create policy "notification_preferences_delete_own"
on public.notification_preferences
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = notification_preferences.profile_id
      and profiles.account_id = auth.uid()
  )
);

create table if not exists public.blocked_profiles (
  id uuid primary key default gen_random_uuid(),
  blocker_profile_id uuid not null references public.profiles(id) on delete cascade,
  blocked_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocked_profiles_no_self check (blocker_profile_id <> blocked_profile_id),
  constraint blocked_profiles_unique_pair unique (blocker_profile_id, blocked_profile_id)
);

create index if not exists blocked_profiles_blocker_idx
  on public.blocked_profiles (blocker_profile_id, created_at desc);

create index if not exists blocked_profiles_blocked_idx
  on public.blocked_profiles (blocked_profile_id, created_at desc);

alter table public.blocked_profiles enable row level security;

drop policy if exists "blocked_profiles_select_participants" on public.blocked_profiles;
create policy "blocked_profiles_select_participants"
on public.blocked_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id in (blocker_profile_id, blocked_profile_id)
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists "blocked_profiles_insert_blocker" on public.blocked_profiles;
create policy "blocked_profiles_insert_blocker"
on public.blocked_profiles
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = blocker_profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists "blocked_profiles_delete_blocker" on public.blocked_profiles;
create policy "blocked_profiles_delete_blocker"
on public.blocked_profiles
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = blocker_profile_id
      and profiles.account_id = auth.uid()
  )
);
