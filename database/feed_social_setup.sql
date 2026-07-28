create extension if not exists pgcrypto;

-- POSTS
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  post_type text not null default 'nota',
  media_url text,
  media_kind text,
  created_at timestamptz not null default now()
);

alter table public.posts
  add column if not exists profile_id uuid references public.profiles(id) on delete cascade;
alter table public.posts
  add column if not exists content text;
alter table public.posts
  add column if not exists post_type text default 'nota';
alter table public.posts
  add column if not exists media_url text;
alter table public.posts
  add column if not exists media_kind text;
alter table public.posts
  add column if not exists created_at timestamptz default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'posts_post_type_check') then
    alter table public.posts
      add constraint posts_post_type_check
      check (post_type in ('nota', 'foto', 'nexis'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'posts_media_kind_check') then
    alter table public.posts
      add constraint posts_media_kind_check
      check (media_kind is null or media_kind in ('image', 'video'));
  end if;
end $$;

create index if not exists posts_profile_created_at_idx
  on public.posts (profile_id, created_at desc);

-- COMMENTS
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  parent_comment_id uuid references public.comments(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists comments_post_id_created_at_idx
  on public.comments (post_id, created_at asc);
create index if not exists comments_profile_id_idx
  on public.comments (profile_id);

-- REPOSTS
create table if not exists public.reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reposts_unique_pair') then
    alter table public.reposts
      add constraint reposts_unique_pair unique (post_id, profile_id);
  end if;
end $$;

create index if not exists reposts_post_id_idx
  on public.reposts (post_id);
create index if not exists reposts_profile_id_idx
  on public.reposts (profile_id);

-- POST LIKES
create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'post_likes_unique_pair') then
    alter table public.post_likes
      add constraint post_likes_unique_pair unique (post_id, profile_id);
  end if;
end $$;

create index if not exists post_likes_post_id_idx
  on public.post_likes (post_id);
create index if not exists post_likes_profile_id_idx
  on public.post_likes (profile_id);

-- COMMENT LIKES
create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'comment_likes_unique_pair') then
    alter table public.comment_likes
      add constraint comment_likes_unique_pair unique (comment_id, profile_id);
  end if;
end $$;

create index if not exists comment_likes_comment_id_idx
  on public.comment_likes (comment_id);
create index if not exists comment_likes_profile_id_idx
  on public.comment_likes (profile_id);

-- STORIES
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  media_url text not null,
  media_kind text not null default 'image',
  caption text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists stories_profile_id_created_at_idx
  on public.stories (profile_id, created_at desc);
create index if not exists stories_expires_at_idx
  on public.stories (expires_at);

-- STORY VIEWS
create table if not exists public.story_views (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'story_views_unique_pair') then
    alter table public.story_views
      add constraint story_views_unique_pair unique (story_id, profile_id);
  end if;
end $$;

create index if not exists story_views_story_id_idx
  on public.story_views (story_id);
create index if not exists story_views_profile_id_idx
  on public.story_views (profile_id);

-- RLS
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.reposts enable row level security;
alter table public.post_likes enable row level security;
alter table public.comment_likes enable row level security;
alter table public.stories enable row level security;
alter table public.story_views enable row level security;

-- POSTS policies
drop policy if exists posts_select_all on public.posts;
create policy posts_select_all
on public.posts
for select
to authenticated
using (true);

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own
on public.posts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = posts.profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own
on public.posts
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = posts.profile_id
      and profiles.account_id = auth.uid()
  )
);

-- COMMENTS policies
drop policy if exists comments_select_all on public.comments;
create policy comments_select_all
on public.comments
for select
to authenticated
using (true);

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own
on public.comments
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = comments.profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own
on public.comments
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = comments.profile_id
      and profiles.account_id = auth.uid()
  )
);

-- REPOSTS policies
drop policy if exists reposts_select_all on public.reposts;
create policy reposts_select_all
on public.reposts
for select
to authenticated
using (true);

drop policy if exists reposts_insert_own on public.reposts;
create policy reposts_insert_own
on public.reposts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = reposts.profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists reposts_delete_own on public.reposts;
create policy reposts_delete_own
on public.reposts
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = reposts.profile_id
      and profiles.account_id = auth.uid()
  )
);

-- POST LIKES policies
drop policy if exists post_likes_select_all on public.post_likes;
create policy post_likes_select_all
on public.post_likes
for select
to authenticated
using (true);

drop policy if exists post_likes_insert_own on public.post_likes;
create policy post_likes_insert_own
on public.post_likes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = post_likes.profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own
on public.post_likes
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = post_likes.profile_id
      and profiles.account_id = auth.uid()
  )
);

-- COMMENT LIKES policies
drop policy if exists comment_likes_select_all on public.comment_likes;
create policy comment_likes_select_all
on public.comment_likes
for select
to authenticated
using (true);

drop policy if exists comment_likes_insert_own on public.comment_likes;
create policy comment_likes_insert_own
on public.comment_likes
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = comment_likes.profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists comment_likes_delete_own on public.comment_likes;
create policy comment_likes_delete_own
on public.comment_likes
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = comment_likes.profile_id
      and profiles.account_id = auth.uid()
  )
);

-- STORIES policies
drop policy if exists stories_select_all on public.stories;
create policy stories_select_all
on public.stories
for select
to authenticated
using (true);

drop policy if exists stories_insert_own on public.stories;
create policy stories_insert_own
on public.stories
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = stories.profile_id
      and profiles.account_id = auth.uid()
  )
);

drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own
on public.stories
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = stories.profile_id
      and profiles.account_id = auth.uid()
  )
);

-- STORY VIEWS policies
drop policy if exists story_views_select_all on public.story_views;
create policy story_views_select_all
on public.story_views
for select
to authenticated
using (true);

drop policy if exists story_views_insert_own on public.story_views;
create policy story_views_insert_own
on public.story_views
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = story_views.profile_id
      and profiles.account_id = auth.uid()
  )
);
