-- NEXO 11 - Espaco social de talentos
alter table public.posts add column if not exists talent_title text;
alter table public.posts add column if not exists talent_category text;

alter table public.posts drop constraint if exists posts_post_type_check;
alter table public.posts add constraint posts_post_type_check
  check (post_type in ('nota','foto','nexis','talent'));

alter table public.posts drop constraint if exists posts_talent_category_check;
alter table public.posts add constraint posts_talent_category_check
  check (talent_category is null or talent_category in ('artes_visuais','musica','fotografia','escrita','danca','tecnologia','artesanato','outros'));

create index if not exists posts_talent_category_created_idx
  on public.posts(talent_category,created_at desc)
  where post_type='talent';

-- Talentos reutiliza integralmente RLS, curtidas, comentarios, denuncias
-- e o gatilho de moderacao ja aplicados a public.posts.
