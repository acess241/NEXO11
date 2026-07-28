-- NEXO 11 - curtidas, visualizadores e respostas dos Stories
-- Execute uma vez no SQL Editor do Supabase.

begin;

create table if not exists public.story_likes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint story_likes_unique_pair unique (story_id, profile_id)
);

create index if not exists story_likes_story_idx
  on public.story_likes(story_id, created_at desc);

create index if not exists story_likes_profile_idx
  on public.story_likes(profile_id, created_at desc);

alter table public.story_likes enable row level security;

drop policy if exists story_likes_select_authenticated on public.story_likes;
create policy story_likes_select_authenticated
on public.story_likes
for select
to authenticated
using (true);

drop policy if exists story_likes_insert_own on public.story_likes;
create policy story_likes_insert_own
on public.story_likes
for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = story_likes.profile_id
      and p.account_id = auth.uid()
  )
);

drop policy if exists story_likes_delete_own on public.story_likes;
create policy story_likes_delete_own
on public.story_likes
for delete
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = story_likes.profile_id
      and p.account_id = auth.uid()
  )
);

-- A pessoa pode consultar a própria visualização.
-- O dono do Story pode consultar todas as visualizações daquele Story.
drop policy if exists story_views_select_all on public.story_views;
drop policy if exists story_views_select_owner_or_viewer on public.story_views;
create policy story_views_select_owner_or_viewer
on public.story_views
for select
to authenticated
using (
  exists (
    select 1 from public.profiles viewer
    where viewer.id = story_views.profile_id
      and viewer.account_id = auth.uid()
  )
  or exists (
    select 1
    from public.stories s
    join public.profiles owner on owner.id = s.profile_id
    where s.id = story_views.story_id
      and owner.account_id = auth.uid()
  )
);

grant select, insert, delete on public.story_likes to authenticated;

commit;
