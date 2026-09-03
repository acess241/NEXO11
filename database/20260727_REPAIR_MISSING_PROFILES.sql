-- NEXO11 - reparar contas autenticadas sem perfil
-- Seguro para executar mais de uma vez:
--   1. preserva todos os perfis existentes;
--   2. cria somente os perfis ausentes;
--   3. instala o gatilho para os próximos cadastros.

create extension if not exists pgcrypto;

create or replace function public.nexo_create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_nome text;
  v_username_base text;
  v_username text;
  v_role text;
begin
  if exists (
    select 1
    from public.profiles
    where account_id = new.id
  ) then
    return new;
  end if;

  v_nome := nullif(btrim(coalesce(new.raw_user_meta_data->>'nome', '')), '');
  if v_nome is null then
    v_nome := split_part(coalesce(new.email, 'Usuário NEXO'), '@', 1);
  end if;

  v_username_base := lower(
    regexp_replace(
      coalesce(
        nullif(btrim(new.raw_user_meta_data->>'username'), ''),
        split_part(coalesce(new.email, 'usuario'), '@', 1)
      ),
      '[^a-z0-9._]+',
      '',
      'g'
    )
  );

  v_username_base := trim(both '.' from left(v_username_base, 24));
  if v_username_base = '' then
    v_username_base := 'usuario';
  end if;

  v_username := v_username_base;
  if exists (select 1 from public.profiles where lower(username) = lower(v_username)) then
    v_username := left(v_username_base, 15) || '_' || left(replace(new.id::text, '-', ''), 8);
  end if;

  v_role := lower(coalesce(new.raw_user_meta_data->>'role', ''));
  if v_role in ('teacher', 'professor', 'docente')
     or lower(coalesce(new.email, '')) ~ '@enova\.educacao\.ba\.gov\.br$' then
    v_role := 'teacher';
  else
    v_role := 'student';
  end if;

  insert into public.profiles (
    account_id,
    nome,
    username,
    bio,
    foto_url,
    institution_name,
    enrollment_number,
    role,
    teacher_subject,
    teacher_school,
    teacher_registration,
    teacher_department,
    course_area,
    xp_total,
    level,
    is_private
  )
  values (
    new.id,
    v_nome,
    v_username,
    '',
    null,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'institution_name', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'enrollment_number', '')), ''),
    v_role,
    nullif(btrim(coalesce(new.raw_user_meta_data->>'teacher_subject', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'teacher_school', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'teacher_registration', '')), ''),
    nullif(btrim(coalesce(new.raw_user_meta_data->>'teacher_department', '')), ''),
    'base_central',
    0,
    1,
    false
  )
  on conflict (account_id) do nothing;

  return new;
exception
  when others then
    -- Nunca bloqueia a criação da conta do Auth por falha em dado opcional
    -- do perfil. O bloco de reparo abaixo cria o perfil ausente depois.
    raise warning 'NEXO11: perfil de % será reparado depois: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists nexo_create_profile_after_signup on auth.users;
create trigger nexo_create_profile_after_signup
after insert on auth.users
for each row
execute function public.nexo_create_profile_for_auth_user();

-- Repara imediatamente todas as contas atuais que ainda não possuem perfil.
do $$
declare
  v_user auth.users%rowtype;
  v_nome text;
  v_username_base text;
  v_username text;
  v_role text;
begin
  for v_user in
    select u.*
    from auth.users u
    where not exists (
      select 1
      from public.profiles p
      where p.account_id = u.id
    )
    order by u.created_at
  loop
    v_nome := coalesce(
      nullif(btrim(coalesce(v_user.raw_user_meta_data->>'nome', '')), ''),
      split_part(coalesce(v_user.email, 'Usuário NEXO'), '@', 1)
    );

    v_username_base := lower(
      regexp_replace(
        coalesce(
          nullif(btrim(v_user.raw_user_meta_data->>'username'), ''),
          split_part(coalesce(v_user.email, 'usuario'), '@', 1)
        ),
        '[^a-z0-9._]+',
        '',
        'g'
      )
    );
    v_username_base := trim(both '.' from left(v_username_base, 24));
    if v_username_base = '' then
      v_username_base := 'usuario';
    end if;

    v_username := v_username_base;
    if exists (select 1 from public.profiles where lower(username) = lower(v_username)) then
      v_username := left(v_username_base, 15) || '_' || left(replace(v_user.id::text, '-', ''), 8);
    end if;

    v_role := lower(coalesce(v_user.raw_user_meta_data->>'role', ''));
    if v_role in ('teacher', 'professor', 'docente')
       or lower(coalesce(v_user.email, '')) ~ '@enova\.educacao\.ba\.gov\.br$' then
      v_role := 'teacher';
    else
      v_role := 'student';
    end if;

    insert into public.profiles (
      account_id, nome, username, bio, foto_url, institution_name,
      enrollment_number, role, teacher_subject, teacher_school,
      teacher_registration, teacher_department, course_area,
      xp_total, level, is_private
    )
    values (
      v_user.id,
      v_nome,
      v_username,
      '',
      null,
      nullif(btrim(coalesce(v_user.raw_user_meta_data->>'institution_name', '')), ''),
      nullif(btrim(coalesce(v_user.raw_user_meta_data->>'enrollment_number', '')), ''),
      v_role,
      nullif(btrim(coalesce(v_user.raw_user_meta_data->>'teacher_subject', '')), ''),
      nullif(btrim(coalesce(v_user.raw_user_meta_data->>'teacher_school', '')), ''),
      nullif(btrim(coalesce(v_user.raw_user_meta_data->>'teacher_registration', '')), ''),
      nullif(btrim(coalesce(v_user.raw_user_meta_data->>'teacher_department', '')), ''),
      'base_central',
      0,
      1,
      false
    )
    on conflict (account_id) do nothing;
  end loop;
end;
$$;

-- Resultado esperado: perfis_sem_registro = 0.
select count(*) as perfis_sem_registro
from auth.users u
where not exists (
  select 1
  from public.profiles p
  where p.account_id = u.id
);
