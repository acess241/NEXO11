-- NEXO11 - trocar usernames técnicos user_... pelo username escolhido.

with candidatos as (
  select
    p.id as profile_id,
    lower(
      regexp_replace(
        coalesce(u.raw_user_meta_data->>'username', ''),
        '[^a-zA-Z0-9._]+',
        '',
        'g'
      )
    ) as username_escolhido
  from public.profiles p
  join auth.users u on u.id = p.account_id
  where p.username ~* '^user_?[a-f0-9]{8,}$'
)
update public.profiles p
set username = left(c.username_escolhido, 30)
from candidatos c
where p.id = c.profile_id
  and c.username_escolhido <> ''
  and not exists (
    select 1
    from public.profiles outro
    where outro.id <> p.id
      and lower(outro.username) = lower(left(c.username_escolhido, 30))
  );

select id, nome, username
from public.profiles
order by created_at desc;
