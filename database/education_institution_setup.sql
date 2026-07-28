create extension if not exists pgcrypto;

create table if not exists public.education_institutions (
  id uuid primary key default gen_random_uuid(),
  official_name text not null unique,
  short_name text,
  city text,
  state text not null default 'BA',
  is_active boolean not null default true,
  source_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.education_courses (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.education_institutions (id) on delete cascade,
  course_key text not null,
  course_name text not null,
  technical_axis text,
  modality text,
  shift_label text,
  is_active boolean not null default true,
  source_url text,
  source_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint education_courses_unique_key unique (institution_id, course_key)
);

create table if not exists public.education_subjects (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.education_courses (id) on delete cascade,
  subject_key text not null,
  subject_name text not null,
  is_active boolean not null default true,
  source_notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint education_subjects_unique_key unique (course_id, subject_key)
);

create index if not exists education_courses_institution_idx
  on public.education_courses (institution_id, is_active, course_name);

create index if not exists education_subjects_course_idx
  on public.education_subjects (course_id, is_active, subject_name);

alter table public.education_institutions enable row level security;
alter table public.education_courses enable row level security;
alter table public.education_subjects enable row level security;

drop policy if exists education_institutions_select_all on public.education_institutions;
create policy education_institutions_select_all
  on public.education_institutions
  for select
  to authenticated
  using (true);

drop policy if exists education_courses_select_all on public.education_courses;
create policy education_courses_select_all
  on public.education_courses
  for select
  to authenticated
  using (true);

drop policy if exists education_subjects_select_all on public.education_subjects;
create policy education_subjects_select_all
  on public.education_subjects
  for select
  to authenticated
  using (true);

grant select on public.education_institutions to authenticated;
grant select on public.education_courses to authenticated;
grant select on public.education_subjects to authenticated;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'institution_id'
  ) then
    alter table public.profiles
      add column institution_id uuid references public.education_institutions (id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'institution_name'
  ) then
    alter table public.profiles
      add column institution_name text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'enrollment_number'
  ) then
    alter table public.profiles
      add column enrollment_number text;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'enrollment_number_normalized'
  ) then
    alter table public.profiles
      add column enrollment_number_normalized text;
  end if;
end $$;

create index if not exists profiles_institution_id_idx
  on public.profiles (institution_id);

create index if not exists profiles_enrollment_number_normalized_idx
  on public.profiles (enrollment_number_normalized);

create or replace function public.normalize_enrollment_number(p_value text)
returns text
language sql
immutable
as $normalize_enrollment_number$
  select nullif(regexp_replace(upper(coalesce(p_value, '')), '[^A-Z0-9]', '', 'g'), '')
$normalize_enrollment_number$;

create or replace function public.sync_profile_school_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $sync_profile_school_fields$
declare
  v_official_name text;
begin
  if new.institution_id is not null then
    select i.official_name
    into v_official_name
    from public.education_institutions i
    where i.id = new.institution_id
    limit 1;

    if v_official_name is not null then
      new.institution_name := v_official_name;
    end if;
  end if;

  new.institution_name := nullif(btrim(coalesce(new.institution_name, '')), '');
  new.enrollment_number := nullif(btrim(coalesce(new.enrollment_number, '')), '');
  new.enrollment_number_normalized := public.normalize_enrollment_number(new.enrollment_number);

  return new;
end;
$sync_profile_school_fields$;

drop trigger if exists trg_sync_profile_school_fields on public.profiles;
create trigger trg_sync_profile_school_fields
before insert or update of institution_id, institution_name, enrollment_number
on public.profiles
for each row
execute function public.sync_profile_school_fields();

insert into public.education_institutions (
  id,
  official_name,
  short_name,
  city,
  state,
  is_active,
  source_notes
)
values (
  '3f646a7f-8077-49ce-98f2-98f3d8ae20fe',
  'CENTRO TERRITORIAL DE EDUCACAO PROFISSIONAL DO SERTAO DO SAO FRANCISCO II ANTONIO CONSELHEIRO',
  'CETEP Sertao do Sao Francisco II - Antonio Conselheiro',
  'Uaua',
  'BA',
  true,
  'Unidade inaugurada/modernizada em 09/03/2024 (SEC/BA).'
)
on conflict (id) do update
set
  official_name = excluded.official_name,
  short_name = excluded.short_name,
  city = excluded.city,
  state = excluded.state,
  is_active = excluded.is_active,
  source_notes = excluded.source_notes,
  updated_at = timezone('utc', now());

with source_courses as (
  select *
  from (
    values
      (
        'administracao',
        'Tecnico em Administracao',
        'Gestao e Negocios',
        'EPI/Subsequente',
        'Diurno/Noturno',
        true,
        'https://www.ba.gov.br/comunicacao/2024/05/noticias/estudantes-do-cetep-de-uaua-aplicam-contabilidade-em-atividades-culinarias',
        'Curso citado em materia oficial da SECOM/BA (21/05/2024).'
      ),
      (
        'informatica',
        'Tecnico em Informatica',
        'Informacao e Comunicacao',
        'EPI/Subsequente',
        'Diurno/Noturno',
        true,
        'https://www.ba.gov.br/educacao/noticias/2025-03/1602/estudantes-de-uaua-desenvolvem-urna-eletronica-para-otimizar-eleicao-de',
        'Curso citado em materia oficial da SEC/BA (03/2025).'
      ),
      (
        'nutricao_dietetica',
        'Tecnico em Nutricao e Dietetica',
        'Ambiente e Saude',
        'EPI/Subsequente',
        'Diurno/Noturno',
        true,
        'https://www.ba.gov.br/comunicacao/noticias/2025-04/367774/projeto-da-rede-estadual-de-uaua-distribui-ovos-de-pascoa-e-kits-de',
        'Projeto oficial menciona turmas de Nutricao e Dietetica (04/2025).'
      ),
      (
        'recursos_humanos',
        'Tecnico em Recursos Humanos',
        'Gestao e Negocios',
        'Subsequente',
        'Noturno',
        true,
        'https://agenciasertao.com/wp-content/uploads/2025/01/cursos-rede-estadual.pdf',
        'Oferta 2025.1 em copia de publicacao do Diario Oficial (ANEXO II).'
      ),
      (
        'enfermagem',
        'Tecnico em Enfermagem',
        'Ambiente e Saude',
        'EPI/PROEJA',
        'Diurno/Noturno',
        true,
        'https://www.ba.gov.br/comunicacao/2024/03/noticias/centro-de-educacao-profissional-inaugurado-neste-sabado-garante-futuro-promissor-a-jovens-de-uaua',
        'Laboratorios de enfermagem citados na nova sede (03/2024).'
      )
  ) as t(course_key, course_name, technical_axis, modality, shift_label, is_active, source_url, source_notes)
)
insert into public.education_courses (
  institution_id,
  course_key,
  course_name,
  technical_axis,
  modality,
  shift_label,
  is_active,
  source_url,
  source_notes
)
select
  '3f646a7f-8077-49ce-98f2-98f3d8ae20fe'::uuid,
  s.course_key,
  s.course_name,
  s.technical_axis,
  s.modality,
  s.shift_label,
  s.is_active,
  s.source_url,
  s.source_notes
from source_courses s
on conflict (institution_id, course_key) do update
set
  course_name = excluded.course_name,
  technical_axis = excluded.technical_axis,
  modality = excluded.modality,
  shift_label = excluded.shift_label,
  is_active = excluded.is_active,
  source_url = excluded.source_url,
  source_notes = excluded.source_notes,
  updated_at = timezone('utc', now());

with source_subjects as (
  select *
  from (
    values
      ('administracao', 'contabilidade_geral', 'Contabilidade Geral', 'Materia citada na materia oficial de 21/05/2024.'),
      ('administracao', 'contabilidade_gerencial_custos', 'Contabilidade Gerencial e Custos', 'Materia citada na materia oficial de 21/05/2024.'),
      ('administracao', 'gestao_produtividade', 'Gestao de Produtividade', 'Materia citada na materia oficial de 21/05/2024.'),
      ('administracao', 'gestao_qualidade', 'Gestao de Qualidade', 'Materia citada na materia oficial de 21/05/2024.'),
      ('administracao', 'gestao_mercadologica', 'Gestao Mercadologica', 'Materia citada na materia oficial de 21/05/2024.'),
      ('administracao', 'fundamentos_administracao', 'Fundamentos da Administracao', 'Materia citada na materia oficial de 21/05/2024.'),

      ('informatica', 'logica_programacao', 'Logica de Programacao', 'Componente tecnico-base sugerido para trilha de Informatica.'),
      ('informatica', 'desenvolvimento_web', 'Desenvolvimento Web', 'Componente tecnico-base sugerido para trilha de Informatica.'),
      ('informatica', 'banco_dados', 'Banco de Dados', 'Componente tecnico-base sugerido para trilha de Informatica.'),
      ('informatica', 'redes_computadores', 'Redes de Computadores', 'Componente tecnico-base sugerido para trilha de Informatica.'),
      ('informatica', 'sistemas_operacionais', 'Sistemas Operacionais', 'Componente tecnico-base sugerido para trilha de Informatica.'),
      ('informatica', 'projetos_integradores_ti', 'Projetos Integradores em TI', 'Componente tecnico-base sugerido para trilha de Informatica.'),

      ('nutricao_dietetica', 'tecnica_dietetica', 'Tecnica Dietetica', 'Componente tecnico-base sugerido para trilha de Nutricao.'),
      ('nutricao_dietetica', 'bromatologia', 'Bromatologia', 'Componente tecnico-base sugerido para trilha de Nutricao.'),
      ('nutricao_dietetica', 'saude_coletiva', 'Saude Coletiva', 'Componente tecnico-base sugerido para trilha de Nutricao.'),
      ('nutricao_dietetica', 'higiene_alimentos', 'Higiene e Seguranca dos Alimentos', 'Componente tecnico-base sugerido para trilha de Nutricao.'),
      ('nutricao_dietetica', 'avaliacao_nutricional', 'Avaliacao Nutricional', 'Componente tecnico-base sugerido para trilha de Nutricao.'),

      ('recursos_humanos', 'gestao_pessoas', 'Gestao de Pessoas', 'Componente tecnico-base sugerido para trilha de RH.'),
      ('recursos_humanos', 'rotinas_departamento_pessoal', 'Rotinas de Departamento Pessoal', 'Componente tecnico-base sugerido para trilha de RH.'),
      ('recursos_humanos', 'recrutamento_selecao', 'Recrutamento e Selecao', 'Componente tecnico-base sugerido para trilha de RH.'),
      ('recursos_humanos', 'legislacao_trabalhista', 'Legislacao Trabalhista', 'Componente tecnico-base sugerido para trilha de RH.'),
      ('recursos_humanos', 'comunicacao_organizacional', 'Comunicacao Organizacional', 'Componente tecnico-base sugerido para trilha de RH.'),

      ('enfermagem', 'anatomia_fisiologia', 'Anatomia e Fisiologia Humana', 'Componente tecnico-base sugerido para trilha de Enfermagem.'),
      ('enfermagem', 'fundamentos_enfermagem', 'Fundamentos de Enfermagem', 'Componente tecnico-base sugerido para trilha de Enfermagem.'),
      ('enfermagem', 'saude_coletiva_enf', 'Saude Coletiva', 'Componente tecnico-base sugerido para trilha de Enfermagem.'),
      ('enfermagem', 'farmacologia_basica', 'Farmacologia Basica', 'Componente tecnico-base sugerido para trilha de Enfermagem.'),
      ('enfermagem', 'urgencia_emergencia', 'Urgencia e Emergencia', 'Componente tecnico-base sugerido para trilha de Enfermagem.')
  ) as t(course_key, subject_key, subject_name, source_notes)
)
insert into public.education_subjects (
  course_id,
  subject_key,
  subject_name,
  is_active,
  source_notes
)
select
  c.id,
  s.subject_key,
  s.subject_name,
  true,
  s.source_notes
from source_subjects s
join public.education_courses c
  on c.institution_id = '3f646a7f-8077-49ce-98f2-98f3d8ae20fe'::uuid
 and c.course_key = s.course_key
on conflict (course_id, subject_key) do update
set
  subject_name = excluded.subject_name,
  is_active = excluded.is_active,
  source_notes = excluded.source_notes,
  updated_at = timezone('utc', now());

update public.profiles p
set
  institution_id = coalesce(p.institution_id, '3f646a7f-8077-49ce-98f2-98f3d8ae20fe'::uuid),
  institution_name = coalesce(nullif(btrim(p.institution_name), ''), i.official_name),
  enrollment_number = nullif(btrim(coalesce(p.enrollment_number, '')), ''),
  enrollment_number_normalized = public.normalize_enrollment_number(p.enrollment_number)
from public.education_institutions i
where i.id = '3f646a7f-8077-49ce-98f2-98f3d8ae20fe'::uuid;

-- OPCIONAL (rode somente se quiser realmente zerar XP de todo mundo):
-- update public.profiles
-- set xp_total = 0,
--     level = 1;
--
-- delete from public.xp_ledger;
