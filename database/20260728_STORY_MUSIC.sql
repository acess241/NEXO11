-- NEXO 11 - músicas autorizadas nos Stories
-- Execute este arquivo uma única vez no SQL Editor do Supabase.

begin;

create table if not exists public.story_music_library (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 120),
  artist text not null check (char_length(trim(artist)) between 1 and 120),
  audio_url text not null,
  cover_url text,
  duration_seconds integer not null check (duration_seconds between 1 and 900),
  genre text,
  mood text check (mood is null or mood in ('animada', 'calma', 'foco')),
  is_featured boolean not null default false,
  rights_source text not null default 'authorized',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.story_music_library
  add column if not exists genre text,
  add column if not exists mood text,
  add column if not exists is_featured boolean not null default false;

alter table public.stories
  add column if not exists music_url text,
  add column if not exists music_title text,
  add column if not exists music_artist text,
  add column if not exists music_start_seconds numeric(8,2),
  add column if not exists music_volume numeric(4,3);

update public.stories
set music_volume = least(1, greatest(0, music_volume))
where music_volume is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stories_music_volume_check'
      and conrelid = 'public.stories'::regclass
  ) then
    alter table public.stories
      add constraint stories_music_volume_check
      check (music_volume is null or music_volume between 0 and 1);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stories_music_start_check'
      and conrelid = 'public.stories'::regclass
  ) then
    alter table public.stories
      add constraint stories_music_start_check
      check (music_start_seconds is null or music_start_seconds >= 0);
  end if;
end $$;

alter table public.story_music_library enable row level security;

drop policy if exists "story_music_library_read" on public.story_music_library;
create policy "story_music_library_read"
on public.story_music_library
for select
to authenticated
using (is_active = true);

-- A biblioteca é administrada somente pelo painel/SQL.
-- Usuários comuns podem selecionar faixas, mas não alterar o catálogo.
revoke insert, update, delete on public.story_music_library from anon, authenticated;
grant select on public.story_music_library to authenticated;

commit;

-- PARA ADICIONAR UMA FAIXA AUTORIZADA:
-- 1. Envie o arquivo para um bucket público no Supabase Storage.
-- 2. Substitua os valores abaixo e execute apenas este INSERT.
--
-- insert into public.story_music_library
--   (title, artist, audio_url, duration_seconds, genre, mood, is_featured, rights_source)
-- values
--   ('Nome da música', 'Nome do artista', 'URL pública do arquivo', 180, 'Instrumental', 'foco', true, 'Licença ou autorização');
