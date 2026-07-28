do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'post_type'
  ) then
    alter table public.posts
      add column post_type text default 'nota';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'media_url'
  ) then
    alter table public.posts
      add column media_url text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'posts'
      and column_name = 'media_kind'
  ) then
    alter table public.posts
      add column media_kind text;
  end if;
end $$;

update public.posts
set post_type = 'nota'
where post_type is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_post_type_check'
  ) then
    alter table public.posts
      add constraint posts_post_type_check
      check (post_type in ('nota', 'foto', 'nexis'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'posts_media_kind_check'
  ) then
    alter table public.posts
      add constraint posts_media_kind_check
      check (media_kind is null or media_kind in ('image', 'video'));
  end if;
end $$;

alter table public.posts
  alter column post_type set default 'nota';

create index if not exists posts_profile_created_at_idx
  on public.posts (profile_id, created_at desc);

create index if not exists posts_post_type_idx
  on public.posts (post_type);
