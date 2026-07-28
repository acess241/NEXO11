-- NEXO 11 - GAMIFICACAO + SEGURANCA (SUPABASE / POSTGRESQL)
-- Versao: v1
-- Objetivo:
-- 1) Regras de XP com teto diario (antifraude)
-- 2) Troca de XP por nota com debito imediato e estorno em rejeicao
-- 3) Validacao de cpf/matricula contra estudantes_autorizados
-- 4) RLS para proteger leitura/escrita por papel (student/teacher)

create extension if not exists pgcrypto;

-- =========================================================
-- 0) FUNCOES BASE
-- =========================================================

create or replace function public.n11_normalize_cpf(p_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_value, ''), '\D', '', 'g'), '')
$$;

create or replace function public.n11_normalize_matricula(p_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(upper(coalesce(p_value, '')), '[^A-Z0-9]', '', 'g'), '')
$$;

create or replace function public.n11_current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.account_id = auth.uid()
  limit 1
$$;

grant execute on function public.n11_current_profile_id() to authenticated;

create or replace function public.n11_is_teacher(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and lower(coalesce(p.role, 'student')) in ('teacher', 'professor', 'admin')
  )
$$;

grant execute on function public.n11_is_teacher(uuid) to authenticated;

create or replace function public.n11_is_admin(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_profile_id
      and lower(coalesce(p.role, 'student')) = 'admin'
  )
$$;

grant execute on function public.n11_is_admin(uuid) to authenticated;

create or replace function public.n11_level_for_xp(p_total_xp integer)
returns integer
language sql
immutable
as $$
  select greatest(1, floor(greatest(coalesce(p_total_xp, 0), 0)::numeric / 100)::int + 1)
$$;

grant execute on function public.n11_level_for_xp(integer) to authenticated;

-- =========================================================
-- 1) PERFIS + IDENTIDADE ESCOLAR
-- =========================================================

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'role'
  ) then
    alter table public.profiles add column role text not null default 'student';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'cpf'
  ) then
    alter table public.profiles add column cpf text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'cpf_normalizado'
  ) then
    alter table public.profiles add column cpf_normalizado text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'matricula'
  ) then
    alter table public.profiles add column matricula text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'matricula_normalizada'
  ) then
    alter table public.profiles add column matricula_normalizada text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'xp_total'
  ) then
    alter table public.profiles add column xp_total integer not null default 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'level'
  ) then
    alter table public.profiles add column level integer not null default 1;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'checkin_streak'
  ) then
    alter table public.profiles add column checkin_streak integer not null default 0;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'last_checkin_date'
  ) then
    alter table public.profiles add column last_checkin_date date;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'enrollment_number'
  ) then
    execute $sql$
      update public.profiles
      set matricula = coalesce(matricula, enrollment_number)
      where coalesce(nullif(btrim(matricula), ''), '') = ''
        and coalesce(nullif(btrim(enrollment_number), ''), '') <> ''
    $sql$;
  end if;
end;
$$;

update public.profiles
set
  cpf_normalizado = public.n11_normalize_cpf(coalesce(cpf, cpf_normalizado)),
  matricula_normalizada = public.n11_normalize_matricula(coalesce(matricula, matricula_normalizada)),
  xp_total = greatest(0, coalesce(xp_total, 0)),
  level = public.n11_level_for_xp(coalesce(xp_total, 0));

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (lower(coalesce(role, 'student')) in ('student', 'teacher', 'professor', 'admin'));
  end if;
exception
  when duplicate_object then null;
end;
$$;

create unique index if not exists profiles_cpf_normalizado_uk
  on public.profiles (cpf_normalizado)
  where cpf_normalizado is not null;

create unique index if not exists profiles_matricula_normalizada_uk
  on public.profiles (matricula_normalizada)
  where matricula_normalizada is not null;

create table if not exists public.estudantes_autorizados (
  id uuid primary key default gen_random_uuid(),
  nome text,
  matricula text not null,
  matricula_normalizada text not null,
  cpf text not null,
  cpf_normalizado text not null,
  curso text,
  turma text,
  ativo boolean not null default true,
  linked_profile_id uuid unique references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists estudantes_autorizados_matricula_uk
  on public.estudantes_autorizados (matricula_normalizada);

create unique index if not exists estudantes_autorizados_cpf_uk
  on public.estudantes_autorizados (cpf_normalizado);

create or replace function public.n11_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_estudantes_autorizados_touch on public.estudantes_autorizados;
create trigger trg_estudantes_autorizados_touch
before update on public.estudantes_autorizados
for each row execute function public.n11_touch_updated_at();

create or replace function public.n11_sync_estudantes_autorizados_norm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.matricula := nullif(btrim(coalesce(new.matricula, '')), '');
  new.cpf := nullif(btrim(coalesce(new.cpf, '')), '');
  new.matricula_normalizada := public.n11_normalize_matricula(coalesce(new.matricula, new.matricula_normalizada));
  new.cpf_normalizado := public.n11_normalize_cpf(coalesce(new.cpf, new.cpf_normalizado));

  if new.matricula_normalizada is null then
    raise exception 'Matricula invalida em estudantes_autorizados';
  end if;

  if new.cpf_normalizado is null or length(new.cpf_normalizado) <> 11 then
    raise exception 'CPF invalido em estudantes_autorizados';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_estudantes_autorizados_norm on public.estudantes_autorizados;
create trigger trg_estudantes_autorizados_norm
before insert or update of matricula, cpf, matricula_normalizada, cpf_normalizado
on public.estudantes_autorizados
for each row execute function public.n11_sync_estudantes_autorizados_norm();

create or replace function public.n11_validate_profile_school_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_require_identity_check boolean := false;
  v_autorizado public.estudantes_autorizados%rowtype;
begin
  v_role := lower(coalesce(new.role, 'student'));

  new.cpf := nullif(btrim(coalesce(new.cpf, '')), '');
  new.matricula := nullif(btrim(coalesce(new.matricula, '')), '');
  new.cpf_normalizado := public.n11_normalize_cpf(coalesce(new.cpf, new.cpf_normalizado));
  new.matricula_normalizada := public.n11_normalize_matricula(coalesce(new.matricula, new.matricula_normalizada));
  new.xp_total := greatest(0, coalesce(new.xp_total, 0));
  new.level := public.n11_level_for_xp(new.xp_total);

  if tg_op = 'INSERT' then
    v_require_identity_check := true;
  else
    v_require_identity_check :=
      new.role is distinct from old.role
      or new.cpf_normalizado is distinct from old.cpf_normalizado
      or new.matricula_normalizada is distinct from old.matricula_normalizada;
  end if;

  if v_role = 'student' and v_require_identity_check then
    if new.cpf_normalizado is null or length(new.cpf_normalizado) <> 11 then
      raise exception 'CPF obrigatorio e invalido para aluno';
    end if;

    if new.matricula_normalizada is null then
      raise exception 'Matricula obrigatoria para aluno';
    end if;

    select a.*
      into v_autorizado
    from public.estudantes_autorizados a
    where a.ativo = true
      and a.cpf_normalizado = new.cpf_normalizado
      and a.matricula_normalizada = new.matricula_normalizada
    limit 1;

    if not found then
      raise exception 'Cadastro nao autorizado: cpf/matricula nao conferem na lista oficial';
    end if;

    if v_autorizado.linked_profile_id is not null and v_autorizado.linked_profile_id <> new.id then
      raise exception 'Este cpf/matricula ja foi vinculado a outro perfil';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_validate_school_identity on public.profiles;
create trigger trg_profiles_validate_school_identity
before insert or update of role, cpf, matricula, cpf_normalizado, matricula_normalizada
on public.profiles
for each row execute function public.n11_validate_profile_school_identity();

create or replace function public.n11_link_authorized_student()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.role, 'student')) = 'student'
     and new.cpf_normalizado is not null
     and new.matricula_normalizada is not null then
    update public.estudantes_autorizados a
    set linked_profile_id = new.id
    where a.ativo = true
      and a.cpf_normalizado = new.cpf_normalizado
      and a.matricula_normalizada = new.matricula_normalizada
      and (a.linked_profile_id is null or a.linked_profile_id = new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_link_authorized_student on public.profiles;
create trigger trg_profiles_link_authorized_student
after insert or update of role, cpf_normalizado, matricula_normalizada
on public.profiles
for each row execute function public.n11_link_authorized_student();

-- =========================================================
-- 2) REGRAS DE XP
-- =========================================================

create table if not exists public.xp_regras (
  evento text primary key,
  xp_base integer not null,
  limite_diario integer,
  ativo boolean not null default true
);

insert into public.xp_regras (evento, xp_base, limite_diario, ativo)
values
  ('checkin_diario', 5, 1, true),
  ('pet_alimentado', 1, 1, true),
  ('postagem', 10, 2, true),
  ('comentario', 2, 5, true),
  ('ciclo_foco', 15, 4, true),
  ('ofensiva_3', 50, null, true),
  ('ofensiva_10', 100, null, true),
  ('ofensiva_30', 300, null, true),
  ('tarefa_professor', 0, null, true),
  ('bonus_manual_professor', 0, null, true),
  ('troca_xp_debito', 0, null, true),
  ('troca_xp_estorno', 0, null, true)
on conflict (evento) do update
set
  xp_base = excluded.xp_base,
  limite_diario = excluded.limite_diario,
  ativo = excluded.ativo;

create table if not exists public.historico_xp (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  evento text not null,
  delta_xp integer not null,
  ref_key text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  constraint historico_xp_evento_check check (
    evento in (
      'checkin_diario',
      'pet_alimentado',
      'postagem',
      'comentario',
      'ciclo_foco',
      'ofensiva_3',
      'ofensiva_10',
      'ofensiva_30',
      'tarefa_professor',
      'bonus_manual_professor',
      'troca_xp_debito',
      'troca_xp_estorno'
    )
  )
);

create index if not exists historico_xp_profile_created_idx
  on public.historico_xp (profile_id, created_at desc);

create index if not exists historico_xp_evento_date_idx
  on public.historico_xp (profile_id, evento, ((created_at at time zone 'utc')::date));

create unique index if not exists historico_xp_evento_ref_uk
  on public.historico_xp (profile_id, evento, ref_key)
  where ref_key is not null;

create or replace function public.n11_guard_xp_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer;
  v_qtd_hoje integer;
  v_dia_utc date;
begin
  new.created_at := coalesce(new.created_at, timezone('utc', now()));
  v_dia_utc := (new.created_at at time zone 'utc')::date;

  select r.limite_diario
    into v_limite
  from public.xp_regras r
  where r.evento = new.evento
    and r.ativo = true
  limit 1;

  if new.delta_xp = 0 then
    raise exception 'delta_xp nao pode ser zero';
  end if;

  if new.evento in ('checkin_diario', 'pet_alimentado', 'postagem', 'comentario', 'ciclo_foco')
     and new.delta_xp < 0 then
    raise exception 'Nao e permitido delta negativo para este evento';
  end if;

  if v_limite is not null then
    select count(*)
      into v_qtd_hoje
    from public.historico_xp h
    where h.profile_id = new.profile_id
      and h.evento = new.evento
      and (h.created_at at time zone 'utc')::date = v_dia_utc;

    if v_qtd_hoje >= v_limite then
      raise exception 'Limite diario atingido para evento % (max %/dia)', new.evento, v_limite;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_historico_xp_guard on public.historico_xp;
create trigger trg_historico_xp_guard
before insert on public.historico_xp
for each row execute function public.n11_guard_xp_cap();

create or replace function public.n11_apply_xp_from_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_xp integer;
begin
  update public.profiles p
  set xp_total = greatest(0, coalesce(p.xp_total, 0) + new.delta_xp)
  where p.id = new.profile_id
  returning xp_total into v_xp;

  update public.profiles
  set level = public.n11_level_for_xp(v_xp)
  where id = new.profile_id;

  return new;
end;
$$;

drop trigger if exists trg_historico_xp_apply on public.historico_xp;
create trigger trg_historico_xp_apply
after insert on public.historico_xp
for each row execute function public.n11_apply_xp_from_ledger();

-- =========================================================
-- 3) TAREFAS (XP VARIAVEL DEFINIDO PELO PROFESSOR)
-- =========================================================

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  teacher_profile_id uuid not null references public.profiles(id) on delete cascade,
  aluno_profile_id uuid references public.profiles(id) on delete set null,
  disciplina_id text not null,
  titulo text not null,
  descricao text,
  xp_value integer not null check (xp_value between 1 and 5000),
  status text not null default 'active' check (status in ('active', 'closed', 'cancelled')),
  due_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists tarefas_teacher_idx
  on public.tarefas (teacher_profile_id, created_at desc);

create index if not exists tarefas_aluno_idx
  on public.tarefas (aluno_profile_id, created_at desc);

drop trigger if exists trg_tarefas_touch on public.tarefas;
create trigger trg_tarefas_touch
before update on public.tarefas
for each row execute function public.n11_touch_updated_at();

create table if not exists public.tarefas_conclusoes (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  aluno_profile_id uuid not null references public.profiles(id) on delete cascade,
  concluido_em timestamptz not null default timezone('utc', now()),
  unique (tarefa_id, aluno_profile_id)
);

create index if not exists tarefas_conclusoes_aluno_idx
  on public.tarefas_conclusoes (aluno_profile_id, concluido_em desc);

create or replace function public.n11_criar_tarefa_professor(
  p_disciplina_id text,
  p_titulo text,
  p_descricao text,
  p_xp_value integer,
  p_aluno_profile_id uuid default null,
  p_due_at timestamptz default null
)
returns public.tarefas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_nova public.tarefas%rowtype;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then
    raise exception 'Perfil nao encontrado';
  end if;

  if not public.n11_is_teacher(v_me) then
    raise exception 'Apenas professor pode criar tarefa com XP';
  end if;

  if coalesce(p_xp_value, 0) < 1 or coalesce(p_xp_value, 0) > 5000 then
    raise exception 'xp_value deve ficar entre 1 e 5000';
  end if;

  insert into public.tarefas (
    teacher_profile_id,
    aluno_profile_id,
    disciplina_id,
    titulo,
    descricao,
    xp_value,
    due_at
  )
  values (
    v_me,
    p_aluno_profile_id,
    nullif(btrim(coalesce(p_disciplina_id, '')), ''),
    nullif(btrim(coalesce(p_titulo, '')), ''),
    nullif(btrim(coalesce(p_descricao, '')), ''),
    p_xp_value,
    p_due_at
  )
  returning * into v_nova;

  if v_nova.disciplina_id is null or v_nova.titulo is null then
    raise exception 'disciplina_id e titulo sao obrigatorios';
  end if;

  return v_nova;
end;
$$;

grant execute on function public.n11_criar_tarefa_professor(text, text, text, integer, uuid, timestamptz) to authenticated;

create or replace function public.n11_concluir_tarefa_aluno(
  p_tarefa_id uuid
)
returns table (
  tarefa_id uuid,
  aluno_id uuid,
  xp_ganho integer,
  xp_total integer,
  level integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_tarefa public.tarefas%rowtype;
  v_ledger_id uuid;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then
    raise exception 'Perfil nao encontrado';
  end if;

  select *
    into v_tarefa
  from public.tarefas t
  where t.id = p_tarefa_id
  limit 1;

  if not found then
    raise exception 'Tarefa nao encontrada';
  end if;

  if v_tarefa.status <> 'active' then
    raise exception 'Tarefa nao esta ativa';
  end if;

  if v_tarefa.aluno_profile_id is not null and v_tarefa.aluno_profile_id <> v_me then
    raise exception 'Esta tarefa foi destinada a outro aluno';
  end if;

  insert into public.tarefas_conclusoes (tarefa_id, aluno_profile_id)
  values (v_tarefa.id, v_me)
  on conflict (tarefa_id, aluno_profile_id) do nothing;

  if not found then
    raise exception 'Tarefa ja concluida por este aluno';
  end if;

  insert into public.historico_xp (
    profile_id,
    evento,
    delta_xp,
    ref_key,
    meta
  )
  values (
    v_me,
    'tarefa_professor',
    v_tarefa.xp_value,
    'tarefa:' || v_tarefa.id::text,
    jsonb_build_object(
      'tarefa_id', v_tarefa.id,
      'teacher_profile_id', v_tarefa.teacher_profile_id,
      'disciplina_id', v_tarefa.disciplina_id
    )
  )
  returning id into v_ledger_id;

  return query
  select
    v_tarefa.id,
    v_me,
    v_tarefa.xp_value,
    p.xp_total,
    p.level
  from public.profiles p
  where p.id = v_me;
end;
$$;

grant execute on function public.n11_concluir_tarefa_aluno(uuid) to authenticated;

-- =========================================================
-- 4) SOLICITACOES DE TROCA (XP -> NOTA)
-- =========================================================

create table if not exists public.solicitacoes_troca (
  id uuid primary key default gen_random_uuid(),
  id_aluno uuid not null references public.profiles(id) on delete cascade,
  id_professor uuid not null references public.profiles(id) on delete cascade,
  id_disciplina text not null,
  tipo_cupom text not null check (tipo_cupom in ('CUPOM_0_2', 'CUPOM_0_5', 'CUPOM_1_0')),
  xp_debitado integer not null check (xp_debitado in (800, 1800, 3200)),
  valor_nota numeric(3,1) not null check (valor_nota in (0.2, 0.5, 1.0)),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  motivo_revisao text,
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  reviewer_profile_id uuid references public.profiles(id) on delete set null,
  ledger_debito_id uuid references public.historico_xp(id) on delete set null,
  ledger_estorno_id uuid references public.historico_xp(id) on delete set null
);

create index if not exists solicitacoes_troca_aluno_idx
  on public.solicitacoes_troca (id_aluno, created_at desc);

create index if not exists solicitacoes_troca_prof_idx
  on public.solicitacoes_troca (id_professor, status, created_at desc);

create or replace function public.n11_coupon_values(p_tipo_cupom text)
returns table (xp_needed integer, nota_value numeric)
language sql
immutable
as $$
  select
    case upper(coalesce(p_tipo_cupom, ''))
      when 'CUPOM_0_2' then 800
      when 'CUPOM_0_5' then 1800
      when 'CUPOM_1_0' then 3200
      else null
    end as xp_needed,
    case upper(coalesce(p_tipo_cupom, ''))
      when 'CUPOM_0_2' then 0.2::numeric
      when 'CUPOM_0_5' then 0.5::numeric
      when 'CUPOM_1_0' then 1.0::numeric
      else null
    end as nota_value
$$;

grant execute on function public.n11_coupon_values(text) to authenticated;

create or replace function public.n11_solicitar_troca_xp(
  p_id_professor uuid,
  p_id_disciplina text,
  p_tipo_cupom text
)
returns public.solicitacoes_troca
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_xp_total integer;
  v_xp_needed integer;
  v_nota numeric;
  v_ledger_id uuid;
  v_req public.solicitacoes_troca%rowtype;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then
    raise exception 'Perfil nao encontrado';
  end if;

  if public.n11_is_teacher(v_me) then
    raise exception 'Apenas aluno pode solicitar troca';
  end if;

  select c.xp_needed, c.nota_value
    into v_xp_needed, v_nota
  from public.n11_coupon_values(p_tipo_cupom) c;

  if v_xp_needed is null then
    raise exception 'tipo_cupom invalido';
  end if;

  if p_id_professor is null then
    raise exception 'id_professor e obrigatorio';
  end if;

  if not public.n11_is_teacher(p_id_professor) then
    raise exception 'id_professor informado nao pertence a um professor';
  end if;

  if nullif(btrim(coalesce(p_id_disciplina, '')), '') is null then
    raise exception 'id_disciplina e obrigatorio';
  end if;

  select coalesce(p.xp_total, 0)
    into v_xp_total
  from public.profiles p
  where p.id = v_me
  for update;

  if v_xp_total < v_xp_needed then
    raise exception 'XP insuficiente. Necessario: %, atual: %', v_xp_needed, v_xp_total;
  end if;

  insert into public.historico_xp (
    profile_id,
    evento,
    delta_xp,
    ref_key,
    meta
  )
  values (
    v_me,
    'troca_xp_debito',
    -v_xp_needed,
    'troca_pendente:' || gen_random_uuid()::text,
    jsonb_build_object(
      'id_professor', p_id_professor,
      'id_disciplina', p_id_disciplina,
      'tipo_cupom', upper(p_tipo_cupom)
    )
  )
  returning id into v_ledger_id;

  insert into public.solicitacoes_troca (
    id_aluno,
    id_professor,
    id_disciplina,
    tipo_cupom,
    xp_debitado,
    valor_nota,
    status,
    ledger_debito_id
  )
  values (
    v_me,
    p_id_professor,
    nullif(btrim(coalesce(p_id_disciplina, '')), ''),
    upper(p_tipo_cupom),
    v_xp_needed,
    v_nota,
    'pending',
    v_ledger_id
  )
  returning * into v_req;

  return v_req;
end;
$$;

grant execute on function public.n11_solicitar_troca_xp(uuid, text, text) to authenticated;

create or replace function public.n11_revisar_solicitacao_troca(
  p_solicitacao_id uuid,
  p_aprovar boolean,
  p_motivo text default null
)
returns public.solicitacoes_troca
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_req public.solicitacoes_troca%rowtype;
  v_estorno_id uuid;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then
    raise exception 'Perfil nao encontrado';
  end if;

  select *
    into v_req
  from public.solicitacoes_troca s
  where s.id = p_solicitacao_id
  for update;

  if not found then
    raise exception 'Solicitacao nao encontrada';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'Solicitacao ja foi revisada';
  end if;

  if v_req.id_professor <> v_me and not public.n11_is_admin(v_me) then
    raise exception 'Apenas professor responsavel (ou admin) pode revisar';
  end if;

  if p_aprovar then
    update public.solicitacoes_troca
    set
      status = 'approved',
      reviewed_at = timezone('utc', now()),
      reviewer_profile_id = v_me,
      motivo_revisao = nullif(btrim(coalesce(p_motivo, '')), '')
    where id = v_req.id
    returning * into v_req;

    return v_req;
  end if;

  insert into public.historico_xp (
    profile_id,
    evento,
    delta_xp,
    ref_key,
    meta
  )
  values (
    v_req.id_aluno,
    'troca_xp_estorno',
    v_req.xp_debitado,
    'troca_estorno:' || v_req.id::text,
    jsonb_build_object(
      'solicitacao_id', v_req.id,
      'motivo', p_motivo
    )
  )
  returning id into v_estorno_id;

  update public.solicitacoes_troca
  set
    status = 'rejected',
    reviewed_at = timezone('utc', now()),
    reviewer_profile_id = v_me,
    motivo_revisao = nullif(btrim(coalesce(p_motivo, '')), ''),
    ledger_estorno_id = v_estorno_id
  where id = v_req.id
  returning * into v_req;

  -- Opcional: notificar aluno (se tabela notifications existir no projeto)
  if to_regclass('public.notifications') is not null then
    begin
      insert into public.notifications (
        profile_id,
        actor_profile_id,
        type,
        title,
        body,
        metadata,
        created_at
      )
      values (
        v_req.id_aluno,
        v_me,
        'troca_xp_rejeitada',
        'Solicitacao de troca recusada',
        coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), 'Seu XP foi devolvido automaticamente.'),
        jsonb_build_object('solicitacao_id', v_req.id, 'xp_devolvido', v_req.xp_debitado),
        timezone('utc', now())
      );
    exception
      when others then
        null;
    end;
  end if;

  return v_req;
end;
$$;

grant execute on function public.n11_revisar_solicitacao_troca(uuid, boolean, text) to authenticated;

-- =========================================================
-- 5) RPC DE EVENTOS DE XP (CHECK-IN, PET, POST, ETC.)
-- =========================================================

create or replace function public.n11_registrar_evento_xp(
  p_evento text,
  p_ref_key text default null,
  p_meta jsonb default '{}'::jsonb
)
returns table (
  ledger_id uuid,
  profile_id uuid,
  evento text,
  delta_xp integer,
  xp_total integer,
  level integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_evento text;
  v_xp integer;
  v_ledger uuid;
  v_today date;
  v_last_checkin date;
  v_streak integer;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then
    raise exception 'Perfil nao encontrado';
  end if;

  v_evento := lower(nullif(btrim(coalesce(p_evento, '')), ''));

  if v_evento not in ('checkin_diario', 'pet_alimentado', 'postagem', 'comentario', 'ciclo_foco') then
    raise exception 'Evento de XP invalido';
  end if;

  select r.xp_base into v_xp
  from public.xp_regras r
  where r.evento = v_evento and r.ativo = true
  limit 1;

  if v_xp is null then
    raise exception 'Regra de XP nao encontrada para evento %', v_evento;
  end if;

  insert into public.historico_xp (
    profile_id,
    evento,
    delta_xp,
    ref_key,
    meta
  )
  values (
    v_me,
    v_evento,
    v_xp,
    nullif(btrim(coalesce(p_ref_key, '')), ''),
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into v_ledger;

  if v_evento = 'checkin_diario' then
    v_today := (timezone('utc', now()))::date;

    select p.last_checkin_date, coalesce(p.checkin_streak, 0)
      into v_last_checkin, v_streak
    from public.profiles p
    where p.id = v_me
    for update;

    if v_last_checkin = v_today - 1 then
      v_streak := v_streak + 1;
    elsif v_last_checkin = v_today then
      v_streak := greatest(1, v_streak);
    else
      v_streak := 1;
    end if;

    update public.profiles
    set
      checkin_streak = v_streak,
      last_checkin_date = v_today
    where id = v_me;

    if v_streak in (3, 10, 30) then
      insert into public.historico_xp (
        profile_id,
        evento,
        delta_xp,
        ref_key,
        meta
      )
      values (
        v_me,
        case
          when v_streak = 3 then 'ofensiva_3'
          when v_streak = 10 then 'ofensiva_10'
          else 'ofensiva_30'
        end,
        case
          when v_streak = 3 then 50
          when v_streak = 10 then 100
          else 300
        end,
        'ofensiva:' || v_streak::text || ':' || v_today::text,
        jsonb_build_object('streak_days', v_streak)
      )
      on conflict do nothing;
    end if;
  end if;

  return query
  select
    v_ledger,
    v_me,
    v_evento,
    v_xp,
    p.xp_total,
    p.level
  from public.profiles p
  where p.id = v_me;
end;
$$;

grant execute on function public.n11_registrar_evento_xp(text, text, jsonb) to authenticated;

create or replace function public.n11_bonus_manual_professor(
  p_aluno_profile_id uuid,
  p_delta_xp integer,
  p_motivo text
)
returns table (
  ledger_id uuid,
  aluno_id uuid,
  delta_xp integer,
  xp_total integer,
  level integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_ledger uuid;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then
    raise exception 'Perfil nao encontrado';
  end if;

  if not public.n11_is_teacher(v_me) then
    raise exception 'Apenas professor pode conceder bonus manual';
  end if;

  if p_aluno_profile_id is null or p_delta_xp is null or p_delta_xp = 0 then
    raise exception 'Parametros invalidos para bonus manual';
  end if;

  if p_delta_xp < -5000 or p_delta_xp > 5000 then
    raise exception 'Ajuste manual fora da faixa permitida (-5000..5000)';
  end if;

  insert into public.historico_xp (
    profile_id,
    evento,
    delta_xp,
    ref_key,
    meta
  )
  values (
    p_aluno_profile_id,
    'bonus_manual_professor',
    p_delta_xp,
    'bonus:' || v_me::text || ':' || gen_random_uuid()::text,
    jsonb_build_object(
      'teacher_profile_id', v_me,
      'motivo', nullif(btrim(coalesce(p_motivo, '')), '')
    )
  )
  returning id into v_ledger;

  return query
  select
    v_ledger,
    p_aluno_profile_id,
    p_delta_xp,
    p.xp_total,
    p.level
  from public.profiles p
  where p.id = p_aluno_profile_id;
end;
$$;

grant execute on function public.n11_bonus_manual_professor(uuid, integer, text) to authenticated;

-- =========================================================
-- 6) RLS
-- =========================================================

alter table public.estudantes_autorizados enable row level security;
alter table public.historico_xp enable row level security;
alter table public.tarefas enable row level security;
alter table public.tarefas_conclusoes enable row level security;
alter table public.solicitacoes_troca enable row level security;

-- estudantes_autorizados: sem politica para authenticated (somente service role/backend)
drop policy if exists estudantes_autorizados_select_none on public.estudantes_autorizados;
create policy estudantes_autorizados_select_none
  on public.estudantes_autorizados
  for select
  to authenticated
  using (false);

drop policy if exists historico_xp_select_own on public.historico_xp;
create policy historico_xp_select_own
  on public.historico_xp
  for select
  to authenticated
  using (profile_id = public.n11_current_profile_id());

-- Sem insert/update/delete direto no historico_xp (somente RPC security definer)

drop policy if exists tarefas_select_teacher_or_target on public.tarefas;
create policy tarefas_select_teacher_or_target
  on public.tarefas
  for select
  to authenticated
  using (
    teacher_profile_id = public.n11_current_profile_id()
    or aluno_profile_id is null
    or aluno_profile_id = public.n11_current_profile_id()
  );

drop policy if exists tarefas_insert_teacher on public.tarefas;
create policy tarefas_insert_teacher
  on public.tarefas
  for insert
  to authenticated
  with check (
    teacher_profile_id = public.n11_current_profile_id()
    and public.n11_is_teacher(public.n11_current_profile_id())
  );

drop policy if exists tarefas_update_teacher on public.tarefas;
create policy tarefas_update_teacher
  on public.tarefas
  for update
  to authenticated
  using (
    teacher_profile_id = public.n11_current_profile_id()
    and public.n11_is_teacher(public.n11_current_profile_id())
  )
  with check (
    teacher_profile_id = public.n11_current_profile_id()
    and public.n11_is_teacher(public.n11_current_profile_id())
  );

drop policy if exists tarefas_delete_teacher on public.tarefas;
create policy tarefas_delete_teacher
  on public.tarefas
  for delete
  to authenticated
  using (
    teacher_profile_id = public.n11_current_profile_id()
    and public.n11_is_teacher(public.n11_current_profile_id())
  );

drop policy if exists tarefas_conclusoes_select_self_or_teacher on public.tarefas_conclusoes;
create policy tarefas_conclusoes_select_self_or_teacher
  on public.tarefas_conclusoes
  for select
  to authenticated
  using (
    aluno_profile_id = public.n11_current_profile_id()
    or exists (
      select 1
      from public.tarefas t
      where t.id = tarefas_conclusoes.tarefa_id
        and t.teacher_profile_id = public.n11_current_profile_id()
    )
  );

-- Sem insert/update/delete direto em tarefas_conclusoes (somente RPC)

drop policy if exists solicitacoes_troca_select_own_or_teacher on public.solicitacoes_troca;
create policy solicitacoes_troca_select_own_or_teacher
  on public.solicitacoes_troca
  for select
  to authenticated
  using (
    id_aluno = public.n11_current_profile_id()
    or id_professor = public.n11_current_profile_id()
  );

drop policy if exists solicitacoes_troca_insert_aluno on public.solicitacoes_troca;
create policy solicitacoes_troca_insert_aluno
  on public.solicitacoes_troca
  for insert
  to authenticated
  with check (id_aluno = public.n11_current_profile_id());

drop policy if exists solicitacoes_troca_update_teacher on public.solicitacoes_troca;
create policy solicitacoes_troca_update_teacher
  on public.solicitacoes_troca
  for update
  to authenticated
  using (
    id_professor = public.n11_current_profile_id()
    or public.n11_is_teacher(public.n11_current_profile_id())
  )
  with check (
    id_professor = public.n11_current_profile_id()
    or public.n11_is_teacher(public.n11_current_profile_id())
  );

grant select on public.historico_xp to authenticated;
grant select, insert, update, delete on public.tarefas to authenticated;
grant select on public.tarefas_conclusoes to authenticated;
grant select, insert, update on public.solicitacoes_troca to authenticated;

-- =========================================================
-- 7) VIEWS DE COMPATIBILIDADE (NOMES SOLICITADOS)
-- =========================================================

do $$
begin
  if to_regclass('public.perfis') is null then
    execute $v$
      create view public.perfis as
      select
        p.id,
        p.account_id,
        p.nome,
        p.username,
        p.role,
        p.cpf,
        p.cpf_normalizado,
        p.matricula,
        p.matricula_normalizada,
        p.xp_total,
        p.level,
        p.checkin_streak,
        p.last_checkin_date
      from public.profiles p
    $v$;
  end if;
end;
$$;

comment on table public.historico_xp is
'Historico de ganhos/descontos de XP com regras antifraude (cap diario via trigger).';

comment on table public.tarefas is
'Tarefas criadas por professor com valor variavel de XP.';

comment on table public.solicitacoes_troca is
'Solicitacoes de troca de XP por nota (debito imediato + estorno em rejeicao).';
