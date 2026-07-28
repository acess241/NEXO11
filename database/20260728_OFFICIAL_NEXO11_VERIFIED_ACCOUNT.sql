-- Conta oficial NEXO 11 e selo verificado.
-- A conta Auth nexo11@enova.educacao.ba.gov.br ja foi criada.

insert into public.accounts (id, email)
select u.id, u.email
from auth.users u
where lower(u.email) = 'nexo11@enova.educacao.ba.gov.br'
on conflict (id) do update
set email = excluded.email;

insert into public.profiles (
  account_id,
  nome,
  username,
  bio,
  foto_url,
  role
)
select
  u.id,
  'NEXO 11',
  'nexo11',
  'Perfil oficial do NEXO 11. Conectando alunos, professores e escolas.',
  'https://acess241.github.io/NEXO11/logo-novo.png',
  'teacher'
from auth.users u
where lower(u.email) = 'nexo11@enova.educacao.ba.gov.br'
  and not exists (
    select 1
    from public.profiles p
    where p.account_id = u.id
  );

alter table public.profiles
  add column if not exists is_verified boolean not null default false;

create index if not exists profiles_verified_idx
  on public.profiles (is_verified)
  where is_verified = true;

create or replace function public.protect_profile_verification()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.is_verified := false;
    elsif new.is_verified is distinct from old.is_verified then
      raise exception 'Somente a administracao pode alterar o selo verificado';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_verification
  on public.profiles;

create trigger protect_profile_verification
before insert or update of is_verified
on public.profiles
for each row
execute function public.protect_profile_verification();

update public.profiles p
set
  nome = 'NEXO 11',
  username = 'nexo11',
  bio = 'Perfil oficial do NEXO 11. Conectando alunos, professores e escolas.',
  foto_url = 'https://acess241.github.io/NEXO11/logo-novo.png',
  role = 'teacher',
  is_verified = true
from public.accounts a
where a.id = p.account_id
  and lower(a.email) = 'nexo11@enova.educacao.ba.gov.br';

select
  p.id,
  p.nome,
  p.username,
  a.email,
  p.is_verified
from public.profiles p
join public.accounts a on a.id = p.account_id
where lower(a.email) = 'nexo11@enova.educacao.ba.gov.br';
