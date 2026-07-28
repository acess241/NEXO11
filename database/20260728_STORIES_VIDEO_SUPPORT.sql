-- Suporte a fotos e videos nos Stories.
-- Seguro para executar mais de uma vez.

alter table public.stories
  add column if not exists media_kind text not null default 'image';

alter table public.stories
  add column if not exists duration_seconds integer not null default 15;

update public.stories
set media_kind = case
  when media_url ~* '\.(mp4|webm|mov|m4v|ogg)(\?|#|$)' then 'video'
  else 'image'
end
where media_kind is null
   or media_kind not in ('image', 'video');

update public.stories
set duration_seconds = least(60, greatest(1, coalesce(duration_seconds, 15)))
where duration_seconds is null
   or duration_seconds < 1
   or duration_seconds > 60;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'stories_media_kind_check'
      and conrelid = 'public.stories'::regclass
  ) then
    alter table public.stories
      add constraint stories_media_kind_check
      check (media_kind in ('image', 'video'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'stories_duration_seconds_check'
      and conrelid = 'public.stories'::regclass
  ) then
    alter table public.stories
      add constraint stories_duration_seconds_check
      check (duration_seconds between 1 and 60);
  end if;
end
$$;
