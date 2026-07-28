create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'is_private'
  ) then
    alter table public.profiles
      add column is_private boolean not null default false;
  end if;
end $$;

create table if not exists public.follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_profile_id uuid not null references public.profiles(id) on delete cascade,
  receiver_profile_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint follow_requests_no_self check (requester_profile_id <> receiver_profile_id),
  constraint follow_requests_status_check check (
    status in ('pending', 'accepted', 'rejected', 'canceled')
  ),
  constraint follow_requests_unique_pair unique (requester_profile_id, receiver_profile_id)
);

create index if not exists follow_requests_receiver_status_idx
  on public.follow_requests (receiver_profile_id, status, created_at desc);

create index if not exists follow_requests_requester_status_idx
  on public.follow_requests (requester_profile_id, status, created_at desc);

alter table public.follow_requests enable row level security;

drop policy if exists "follow_requests_select_participants" on public.follow_requests;
create policy "follow_requests_select_participants"
on public.follow_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id in (requester_profile_id, receiver_profile_id)
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists "follow_requests_insert_requester" on public.follow_requests;
create policy "follow_requests_insert_requester"
on public.follow_requests
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = requester_profile_id
      and profiles.account_id = auth.uid()
  )
  and status = 'pending'
);

drop policy if exists "follow_requests_update_requester" on public.follow_requests;
create policy "follow_requests_update_requester"
on public.follow_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = requester_profile_id
      and profiles.account_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = requester_profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists "follow_requests_update_receiver" on public.follow_requests;
create policy "follow_requests_update_receiver"
on public.follow_requests
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = receiver_profile_id
      and profiles.account_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = receiver_profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
on public.follows
for insert
to authenticated
with check (
  (
    exists (
      select 1
      from public.profiles
      where profiles.id = follower_profile_id
        and profiles.account_id = auth.uid()
    )
    and (
      exists (
        select 1
        from public.profiles
        where profiles.id = following_profile_id
          and coalesce(profiles.is_private, false) = false
      )
      or exists (
        select 1
        from public.follow_requests
        where follow_requests.requester_profile_id = follower_profile_id
          and follow_requests.receiver_profile_id = following_profile_id
          and follow_requests.status = 'accepted'
      )
    )
  )
  or (
    exists (
      select 1
      from public.profiles
      where profiles.id = following_profile_id
        and profiles.account_id = auth.uid()
    )
    and exists (
      select 1
      from public.follow_requests
      where follow_requests.requester_profile_id = follower_profile_id
        and follow_requests.receiver_profile_id = following_profile_id
        and follow_requests.status = 'accepted'
    )
  )
);
