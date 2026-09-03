-- Posição livre da legenda e garantias de acesso às mídias dos Stories.
-- Execute uma vez no SQL Editor do Supabase.

begin;

alter table public.stories
  add column if not exists caption_x numeric(5,2) not null default 50,
  add column if not exists caption_y numeric(5,2) not null default 72;

alter table public.stories
  drop constraint if exists stories_caption_x_check,
  drop constraint if exists stories_caption_y_check;

alter table public.stories
  add constraint stories_caption_x_check check (caption_x between 0 and 100),
  add constraint stories_caption_y_check check (caption_y between 0 and 100);

update storage.buckets
set public = true,
    file_size_limit = greatest(coalesce(file_size_limit, 0), 104857600),
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'image/heic', 'image/heif',
      'video/mp4', 'video/webm', 'video/quicktime',
      'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg'
    ]
where id = 'stories';

drop policy if exists stories_public_read on storage.objects;
create policy stories_public_read
  on storage.objects for select to public
  using (bucket_id = 'stories');

commit;
