-- NEXO 11 - reparo completo de mídia, curtidas, respostas e legenda móvel.
-- Cole TODO este arquivo no SQL Editor do Supabase e execute.

begin;

-- Legenda posicionável.
alter table public.stories
  add column if not exists caption_x numeric(5,2) not null default 50,
  add column if not exists caption_y numeric(5,2) not null default 72;

alter table public.stories
  drop constraint if exists stories_caption_x_check,
  drop constraint if exists stories_caption_y_check;

alter table public.stories
  add constraint stories_caption_x_check check (caption_x between 0 and 100),
  add constraint stories_caption_y_check check (caption_y between 0 and 100);

-- Curtidas.
create table if not exists public.story_likes (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint story_likes_unique_pair unique (story_id, profile_id)
);

create index if not exists story_likes_story_idx
  on public.story_likes(story_id, created_at desc);

alter table public.story_likes enable row level security;

drop policy if exists story_likes_select_authenticated on public.story_likes;
create policy story_likes_select_authenticated
on public.story_likes for select to authenticated
using (true);

drop policy if exists story_likes_insert_own on public.story_likes;
create policy story_likes_insert_own
on public.story_likes for insert to authenticated
with check (
  exists (
    select 1 from public.profiles p
    where p.id = story_likes.profile_id and p.account_id = auth.uid()
  )
);

drop policy if exists story_likes_delete_own on public.story_likes;
create policy story_likes_delete_own
on public.story_likes for delete to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = story_likes.profile_id and p.account_id = auth.uid()
  )
);

grant select, insert, delete on public.story_likes to authenticated;

-- Somente quem visualizou e o dono do Story podem consultar visualizações.
drop policy if exists story_views_select_all on public.story_views;
drop policy if exists story_views_select_owner_or_viewer on public.story_views;
create policy story_views_select_owner_or_viewer
on public.story_views for select to authenticated
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

-- Função segura e atômica para curtir/descurtir.
create or replace function public.nexo_toggle_story_like(p_story_id uuid)
returns table(liked boolean, total_likes bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select p.id into v_profile_id
  from public.profiles p
  where p.account_id = auth.uid()
  limit 1;

  if v_profile_id is null then
    raise exception 'Perfil do usuário não encontrado';
  end if;

  if not exists (select 1 from public.stories s where s.id = p_story_id) then
    raise exception 'Story não encontrado ou expirado';
  end if;

  if exists (
    select 1 from public.story_likes sl
    where sl.story_id = p_story_id and sl.profile_id = v_profile_id
  ) then
    delete from public.story_likes sl
    where sl.story_id = p_story_id and sl.profile_id = v_profile_id;
    liked := false;
  else
    insert into public.story_likes(story_id, profile_id)
    values (p_story_id, v_profile_id)
    on conflict (story_id, profile_id) do nothing;
    liked := true;
  end if;

  select count(*) into total_likes
  from public.story_likes sl
  where sl.story_id = p_story_id;

  return next;
end;
$$;

grant execute on function public.nexo_toggle_story_like(uuid) to authenticated;

-- Responde ao Story criando/reutilizando a conversa direta.
create or replace function public.nexo_reply_to_story(
  p_story_id uuid,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender uuid;
  v_owner uuid;
  v_one uuid;
  v_two uuid;
  v_conversation uuid;
  v_story public.stories%rowtype;
begin
  if nullif(btrim(p_message), '') is null then
    raise exception 'Digite uma mensagem';
  end if;

  select p.id into v_sender
  from public.profiles p
  where p.account_id = auth.uid()
  limit 1;

  if v_sender is null then
    raise exception 'Perfil do usuário não encontrado';
  end if;

  select * into v_story
  from public.stories s
  where s.id = p_story_id;

  if not found then
    raise exception 'Story não encontrado ou expirado';
  end if;

  v_owner := v_story.profile_id;
  if v_owner = v_sender then
    raise exception 'Você não pode responder ao próprio Story';
  end if;

  if v_sender::text < v_owner::text then
    v_one := v_sender;
    v_two := v_owner;
  else
    v_one := v_owner;
    v_two := v_sender;
  end if;

  select c.id into v_conversation
  from public.chat_conversations c
  where (c.profile_one_id = v_one and c.profile_two_id = v_two)
     or (c.profile_one_id = v_two and c.profile_two_id = v_one)
  limit 1;

  if v_conversation is null then
    begin
      insert into public.chat_conversations(profile_one_id, profile_two_id)
      values (v_one, v_two)
      returning id into v_conversation;
    exception when unique_violation then
      select c.id into v_conversation
      from public.chat_conversations c
      where (c.profile_one_id = v_one and c.profile_two_id = v_two)
         or (c.profile_one_id = v_two and c.profile_two_id = v_one)
      limit 1;
    end;
  end if;

  insert into public.chat_messages(
    conversation_id,
    sender_profile_id,
    content,
    media_url,
    media_kind
  )
  values (
    v_conversation,
    v_sender,
    'Respondeu ao story: ' || left(btrim(p_message), 500),
    v_story.media_url,
    case when v_story.media_kind = 'video' then 'video' else 'image' end
  );

  update public.chat_conversations
  set last_message_at = now(), updated_at = now()
  where id = v_conversation;

  return v_conversation;
end;
$$;

grant execute on function public.nexo_reply_to_story(uuid, text) to authenticated;

-- O mesmo bucket atende Stories e fotos dos posts.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'stories',
  'stories',
  true,
  104857600,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'image/heic', 'image/heif',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg'
  ]
)
on conflict (id) do update
set public = true,
    file_size_limit = 104857600,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists stories_public_read on storage.objects;
create policy stories_public_read
on storage.objects for select to public
using (bucket_id = 'stories');

commit;
