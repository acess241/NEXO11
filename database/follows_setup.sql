create extension if not exists pgcrypto;

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_profile_id uuid not null references public.profiles(id) on delete cascade,
  following_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint follows_unique_pair unique (follower_profile_id, following_profile_id),
  constraint follows_no_self_follow check (follower_profile_id <> following_profile_id)
);

create index if not exists follows_follower_profile_id_idx
  on public.follows (follower_profile_id);

create index if not exists follows_following_profile_id_idx
  on public.follows (following_profile_id);

alter table public.follows enable row level security;

drop policy if exists "follows_select_all" on public.follows;
create policy "follows_select_all"
on public.follows
for select
to authenticated
using (true);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
on public.follows
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = follower_profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own"
on public.follows
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = follower_profile_id
      and profiles.account_id = auth.uid()
  )
);
