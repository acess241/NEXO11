-- NEXO 11 - GAMIFICACAO + SEGURANCA (V2)
-- REGRAS NOVAS:
-- - REMOVIDO totalmente XP por comentario simples.
-- - XP de "resposta util" apenas quando marcada como util por autor da duvida ou professor.
-- - Caps diarios/semanais em trigger central no historico_xp.
-- - Troca XP->nota com debito imediato e estorno em rejeicao.
-- - CPF/matricula unicos e validados contra estudantes_autorizados.

create extension if not exists pgcrypto;

-- =========================================================
-- 1) FUNCOES BASE
-- =========================================================

create or replace function public.n11_norm_cpf(p_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p_value, ''), '\D', '', 'g'), '')
$$;

create or replace function public.n11_norm_matricula(p_value text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(upper(coalesce(p_value, '')), '[^A-Z0-9]', '', 'g'), '')
$$;

create or replace function public.n11_level_for_xp(p_total integer)
returns integer
language sql
immutable
as $$
  select greatest(1, floor(greatest(coalesce(p_total, 0), 0)::numeric / 100)::int + 1)
$$;

-- =========================================================
-- 2) PERFIS / IDENTIDADE ESCOLAR
-- =========================================================

-- Usa tabela existente public.profiles como base canônica do app
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='role'
  ) then
    alter table public.profiles add column role text not null default 'student';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='cpf'
  ) then
    alter table public.profiles add column cpf text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='cpf_normalizado'
  ) then
    alter table public.profiles add column cpf_normalizado text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='matricula'
  ) then
    alter table public.profiles add column matricula text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='matricula_normalizada'
  ) then
    alter table public.profiles add column matricula_normalizada text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='xp_total'
  ) then
    alter table public.profiles add column xp_total integer not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='level'
  ) then
    alter table public.profiles add column level integer not null default 1;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='checkin_streak'
  ) then
    alter table public.profiles add column checkin_streak integer not null default 0;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='last_checkin_date'
  ) then
    alter table public.profiles add column last_checkin_date date;
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='profiles_role_check') then
    alter table public.profiles
      add constraint profiles_role_check
      check (lower(coalesce(role, 'student')) in ('student', 'teacher', 'professor', 'admin'));
  end if;
exception
  when duplicate_object then null;
end;
$$;

update public.profiles
set
  cpf_normalizado = public.n11_norm_cpf(coalesce(cpf, cpf_normalizado)),
  matricula_normalizada = public.n11_norm_matricula(coalesce(matricula, matricula_normalizada)),
  xp_total = greatest(0, coalesce(xp_total, 0)),
  level = public.n11_level_for_xp(coalesce(xp_total, 0));

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
  new.matricula_normalizada := public.n11_norm_matricula(coalesce(new.matricula, new.matricula_normalizada));
  new.cpf_normalizado := public.n11_norm_cpf(coalesce(new.cpf, new.cpf_normalizado));

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

create or replace function public.n11_validate_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_needs_check boolean := false;
  v_auth_row public.estudantes_autorizados%rowtype;
begin
  v_role := lower(coalesce(new.role, 'student'));

  new.cpf := nullif(btrim(coalesce(new.cpf, '')), '');
  new.matricula := nullif(btrim(coalesce(new.matricula, '')), '');
  new.cpf_normalizado := public.n11_norm_cpf(coalesce(new.cpf, new.cpf_normalizado));
  new.matricula_normalizada := public.n11_norm_matricula(coalesce(new.matricula, new.matricula_normalizada));
  new.xp_total := greatest(0, coalesce(new.xp_total, 0));
  new.level := public.n11_level_for_xp(new.xp_total);

  if tg_op = 'INSERT' then
    v_needs_check := true;
  else
    v_needs_check :=
      new.role is distinct from old.role
      or new.cpf_normalizado is distinct from old.cpf_normalizado
      or new.matricula_normalizada is distinct from old.matricula_normalizada;
  end if;

  if v_role = 'student' and v_needs_check then
    if new.cpf_normalizado is null or length(new.cpf_normalizado) <> 11 then
      raise exception 'CPF obrigatorio e invalido para aluno';
    end if;

    if new.matricula_normalizada is null then
      raise exception 'Matricula obrigatoria para aluno';
    end if;

    select a.*
      into v_auth_row
    from public.estudantes_autorizados a
    where a.ativo = true
      and a.cpf_normalizado = new.cpf_normalizado
      and a.matricula_normalizada = new.matricula_normalizada
    limit 1;

    if not found then
      raise exception 'Cadastro nao autorizado: cpf/matricula nao encontrado na lista oficial';
    end if;

    if v_auth_row.linked_profile_id is not null and v_auth_row.linked_profile_id <> new.id then
      raise exception 'CPF/matricula ja vinculado a outro perfil';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_validate_identity on public.profiles;
create trigger trg_profiles_validate_identity
before insert or update of role, cpf, matricula, cpf_normalizado, matricula_normalizada
on public.profiles
for each row execute function public.n11_validate_profile_identity();

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

-- View de compatibilidade com nome solicitado "perfis"
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

-- =========================================================
-- 3) XP REGRAS + HISTORICO (SEM COMENTARIO SIMPLES)
-- =========================================================

create table if not exists public.xp_regras (
  evento text primary key,
  xp_base integer not null,
  limite integer,
  periodo text not null default 'none' check (periodo in ('none', 'day', 'week')),
  ativo boolean not null default true
);

insert into public.xp_regras (evento, xp_base, limite, periodo, ativo)
values
  ('checkin_diario', 5, 1, 'day', true),
  ('pet_alimentado', 1, 1, 'day', true),
  ('resposta_util', 20, 1, 'day', true),
  ('upload_material_estudo', 15, 2, 'week', true),
  ('leitura_biblioteca_ativa', 10, 1, 'day', true),
  ('ciclo_foco', 15, 4, 'day', true),
  ('ofensiva_3', 50, null, 'none', true),
  ('ofensiva_10', 100, null, 'none', true),
  ('ofensiva_30', 300, null, 'none', true),
  ('tarefa_professor', 0, null, 'none', true),
  ('troca_xp_debito', 0, null, 'none', true),
  ('troca_xp_estorno', 0, null, 'none', true)
on conflict (evento) do update
set
  xp_base = excluded.xp_base,
  limite = excluded.limite,
  periodo = excluded.periodo,
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
      'resposta_util',
      'upload_material_estudo',
      'leitura_biblioteca_ativa',
      'ciclo_foco',
      'ofensiva_3',
      'ofensiva_10',
      'ofensiva_30',
      'tarefa_professor',
      'troca_xp_debito',
      'troca_xp_estorno'
    )
  )
);

create index if not exists historico_xp_profile_created_idx
  on public.historico_xp (profile_id, created_at desc);

create index if not exists historico_xp_evento_day_idx
  on public.historico_xp (profile_id, evento, ((created_at at time zone 'utc')::date));

create index if not exists historico_xp_evento_week_idx
  on public.historico_xp (
    profile_id,
    evento,
    (date_trunc('week', created_at at time zone 'utc'))
  );

create unique index if not exists historico_xp_evento_ref_uk
  on public.historico_xp (profile_id, evento, ref_key)
  where ref_key is not null;

create or replace function public.n11_guard_xp_capping()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite integer;
  v_periodo text;
  v_qtd integer;
  v_day date;
  v_week timestamp;
begin
  new.created_at := coalesce(new.created_at, timezone('utc', now()));
  v_day := (new.created_at at time zone 'utc')::date;
  v_week := date_trunc('week', new.created_at at time zone 'utc');

  select r.limite, r.periodo
    into v_limite, v_periodo
  from public.xp_regras r
  where r.evento = new.evento
    and r.ativo = true
  limit 1;

  if new.delta_xp = 0 then
    raise exception 'delta_xp nao pode ser zero';
  end if;

  -- Para eventos positivos, nao permite delta negativo
  if new.evento in (
      'checkin_diario',
      'pet_alimentado',
      'resposta_util',
      'upload_material_estudo',
      'leitura_biblioteca_ativa',
      'ciclo_foco',
      'ofensiva_3',
      'ofensiva_10',
      'ofensiva_30',
      'tarefa_professor'
    ) and new.delta_xp < 0 then
    raise exception 'Delta negativo nao permitido para evento %', new.evento;
  end if;

  if v_limite is not null then
    if v_periodo = 'day' then
      select count(*) into v_qtd
      from public.historico_xp h
      where h.profile_id = new.profile_id
        and h.evento = new.evento
        and (h.created_at at time zone 'utc')::date = v_day;
    elsif v_periodo = 'week' then
      select count(*) into v_qtd
      from public.historico_xp h
      where h.profile_id = new.profile_id
        and h.evento = new.evento
        and date_trunc('week', h.created_at at time zone 'utc') = v_week;
    else
      v_qtd := 0;
    end if;

    if v_qtd >= v_limite then
      raise exception 'Limite de XP atingido para % (max % por %)', new.evento, v_limite, v_periodo;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_historico_xp_guard on public.historico_xp;
create trigger trg_historico_xp_guard
before insert on public.historico_xp
for each row execute function public.n11_guard_xp_capping();

create or replace function public.n11_apply_xp_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer;
begin
  update public.profiles p
  set xp_total = greatest(0, coalesce(p.xp_total, 0) + new.delta_xp)
  where p.id = new.profile_id
  returning xp_total into v_total;

  update public.profiles
  set level = public.n11_level_for_xp(v_total)
  where id = new.profile_id;

  return new;
end;
$$;

drop trigger if exists trg_historico_xp_apply on public.historico_xp;
create trigger trg_historico_xp_apply
after insert on public.historico_xp
for each row execute function public.n11_apply_xp_total();

-- =========================================================
-- 4) TAREFAS PROFESSOR
-- =========================================================

create table if not exists public.tarefas_professor (
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

create index if not exists tarefas_professor_teacher_idx
  on public.tarefas_professor (teacher_profile_id, created_at desc);

create index if not exists tarefas_professor_aluno_idx
  on public.tarefas_professor (aluno_profile_id, created_at desc);

drop trigger if exists trg_tarefas_professor_touch on public.tarefas_professor;
create trigger trg_tarefas_professor_touch
before update on public.tarefas_professor
for each row execute function public.n11_touch_updated_at();

create table if not exists public.tarefas_professor_conclusoes (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas_professor(id) on delete cascade,
  aluno_profile_id uuid not null references public.profiles(id) on delete cascade,
  concluido_em timestamptz not null default timezone('utc', now()),
  unique (tarefa_id, aluno_profile_id)
);

create or replace function public.n11_criar_tarefa_professor(
  p_disciplina_id text,
  p_titulo text,
  p_descricao text,
  p_xp_value integer,
  p_aluno_profile_id uuid default null,
  p_due_at timestamptz default null
)
returns public.tarefas_professor
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.tarefas_professor%rowtype;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;
  if not public.n11_is_teacher(v_me) then raise exception 'Apenas professor pode criar tarefa'; end if;
  if coalesce(p_xp_value, 0) < 1 or coalesce(p_xp_value, 0) > 5000 then
    raise exception 'xp_value invalido (1..5000)';
  end if;

  insert into public.tarefas_professor (
    teacher_profile_id, aluno_profile_id, disciplina_id, titulo, descricao, xp_value, due_at
  ) values (
    v_me,
    p_aluno_profile_id,
    nullif(btrim(coalesce(p_disciplina_id, '')), ''),
    nullif(btrim(coalesce(p_titulo, '')), ''),
    nullif(btrim(coalesce(p_descricao, '')), ''),
    p_xp_value,
    p_due_at
  )
  returning * into v_row;

  if v_row.disciplina_id is null or v_row.titulo is null then
    raise exception 'disciplina_id e titulo obrigatorios';
  end if;

  return v_row;
end;
$$;

grant execute on function public.n11_criar_tarefa_professor(text, text, text, integer, uuid, timestamptz) to authenticated;

create or replace function public.n11_concluir_tarefa_professor(p_tarefa_id uuid)
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
  v_tarefa public.tarefas_professor%rowtype;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;

  select * into v_tarefa
  from public.tarefas_professor t
  where t.id = p_tarefa_id
  limit 1;

  if not found then raise exception 'Tarefa nao encontrada'; end if;
  if v_tarefa.status <> 'active' then raise exception 'Tarefa nao ativa'; end if;
  if v_tarefa.aluno_profile_id is not null and v_tarefa.aluno_profile_id <> v_me then
    raise exception 'Tarefa pertence a outro aluno';
  end if;

  insert into public.tarefas_professor_conclusoes (tarefa_id, aluno_profile_id)
  values (v_tarefa.id, v_me)
  on conflict (tarefa_id, aluno_profile_id) do nothing;

  if not found then raise exception 'Tarefa ja concluida'; end if;

  insert into public.historico_xp (profile_id, evento, delta_xp, ref_key, meta)
  values (
    v_me,
    'tarefa_professor',
    v_tarefa.xp_value,
    'tarefa_professor:' || v_tarefa.id::text,
    jsonb_build_object(
      'tarefa_id', v_tarefa.id,
      'teacher_profile_id', v_tarefa.teacher_profile_id,
      'disciplina_id', v_tarefa.disciplina_id
    )
  );

  return query
  select v_tarefa.id, v_me, v_tarefa.xp_value, p.xp_total, p.level
  from public.profiles p
  where p.id = v_me;
end;
$$;

grant execute on function public.n11_concluir_tarefa_professor(uuid) to authenticated;

-- =========================================================
-- 5) TROCA DE XP POR NOTA
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
  reviewed_at timestamptz,
  reviewer_profile_id uuid references public.profiles(id) on delete set null,
  ledger_debito_id uuid references public.historico_xp(id) on delete set null,
  ledger_estorno_id uuid references public.historico_xp(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists solicitacoes_troca_aluno_idx
  on public.solicitacoes_troca (id_aluno, created_at desc);

create index if not exists solicitacoes_troca_professor_idx
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
  v_xp_needed integer;
  v_nota numeric;
  v_xp_total integer;
  v_debito_id uuid;
  v_req public.solicitacoes_troca%rowtype;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;
  if public.n11_is_teacher(v_me) then raise exception 'Apenas aluno pode solicitar troca'; end if;
  if p_id_professor is null then raise exception 'id_professor obrigatorio'; end if;
  if not public.n11_is_teacher(p_id_professor) then raise exception 'id_professor invalido'; end if;
  if nullif(btrim(coalesce(p_id_disciplina, '')), '') is null then raise exception 'id_disciplina obrigatorio'; end if;

  select xp_needed, nota_value
    into v_xp_needed, v_nota
  from public.n11_coupon_values(p_tipo_cupom);

  if v_xp_needed is null then raise exception 'tipo_cupom invalido'; end if;

  select coalesce(p.xp_total, 0)
    into v_xp_total
  from public.profiles p
  where p.id = v_me
  for update;

  if v_xp_total < v_xp_needed then
    raise exception 'XP insuficiente. Necessario: %, atual: %', v_xp_needed, v_xp_total;
  end if;

  insert into public.historico_xp (profile_id, evento, delta_xp, ref_key, meta)
  values (
    v_me,
    'troca_xp_debito',
    -v_xp_needed,
    'troca_debito:' || gen_random_uuid()::text,
    jsonb_build_object('id_professor', p_id_professor, 'id_disciplina', p_id_disciplina, 'tipo_cupom', upper(p_tipo_cupom))
  )
  returning id into v_debito_id;

  insert into public.solicitacoes_troca (
    id_aluno, id_professor, id_disciplina, tipo_cupom, xp_debitado, valor_nota, status, ledger_debito_id
  )
  values (
    v_me, p_id_professor, p_id_disciplina, upper(p_tipo_cupom), v_xp_needed, v_nota, 'pending', v_debito_id
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
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;

  select * into v_req
  from public.solicitacoes_troca s
  where s.id = p_solicitacao_id
  for update;

  if not found then raise exception 'Solicitacao nao encontrada'; end if;
  if v_req.status <> 'pending' then raise exception 'Solicitacao ja revisada'; end if;
  if v_req.id_professor <> v_me and not public.n11_is_admin(v_me) then
    raise exception 'Somente professor responsavel (ou admin) pode revisar';
  end if;

  if p_aprovar then
    update public.solicitacoes_troca
    set status='approved',
        reviewed_at=timezone('utc', now()),
        reviewer_profile_id=v_me,
        motivo_revisao=nullif(btrim(coalesce(p_motivo, '')), '')
    where id=v_req.id
    returning * into v_req;

    return v_req;
  end if;

  insert into public.historico_xp (profile_id, evento, delta_xp, ref_key, meta)
  values (
    v_req.id_aluno,
    'troca_xp_estorno',
    v_req.xp_debitado,
    'troca_estorno:' || v_req.id::text,
    jsonb_build_object('solicitacao_id', v_req.id, 'motivo', p_motivo)
  )
  returning id into v_estorno_id;

  update public.solicitacoes_troca
  set status='rejected',
      reviewed_at=timezone('utc', now()),
      reviewer_profile_id=v_me,
      motivo_revisao=nullif(btrim(coalesce(p_motivo, '')), ''),
      ledger_estorno_id=v_estorno_id
  where id=v_req.id
  returning * into v_req;

  return v_req;
end;
$$;

grant execute on function public.n11_revisar_solicitacao_troca(uuid, boolean, text) to authenticated;

-- =========================================================
-- 6) EVENTOS ESPECIAIS (RESPOSTA UTIL / MATERIAL / LEITURA / FOCO)
-- =========================================================

create table if not exists public.duvidas_respostas (
  id uuid primary key default gen_random_uuid(),
  duvida_id uuid not null,
  autor_duvida_id uuid not null references public.profiles(id) on delete cascade,
  autor_resposta_id uuid not null references public.profiles(id) on delete cascade,
  resposta_texto text not null,
  is_util boolean not null default false,
  util_marked_by uuid references public.profiles(id) on delete set null,
  util_marked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists duvidas_respostas_autor_idx
  on public.duvidas_respostas (autor_resposta_id, created_at desc);

create or replace function public.n11_marcar_resposta_util(p_resposta_id uuid)
returns public.duvidas_respostas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.duvidas_respostas%rowtype;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;

  select * into v_row
  from public.duvidas_respostas r
  where r.id = p_resposta_id
  for update;

  if not found then raise exception 'Resposta nao encontrada'; end if;

  if v_row.is_util then
    return v_row;
  end if;

  if v_row.autor_duvida_id <> v_me and not public.n11_is_teacher(v_me) then
    raise exception 'Somente autor da duvida ou professor pode marcar como util';
  end if;

  update public.duvidas_respostas
  set
    is_util = true,
    util_marked_by = v_me,
    util_marked_at = timezone('utc', now())
  where id = v_row.id
  returning * into v_row;

  insert into public.historico_xp (profile_id, evento, delta_xp, ref_key, meta)
  values (
    v_row.autor_resposta_id,
    'resposta_util',
    20,
    'resposta_util:' || v_row.id::text,
    jsonb_build_object('duvida_id', v_row.duvida_id, 'marked_by', v_me)
  );

  return v_row;
end;
$$;

grant execute on function public.n11_marcar_resposta_util(uuid) to authenticated;

create table if not exists public.materiais_estudo (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  material_type text not null check (material_type in ('pdf', 'mapa_mental')),
  arquivo_url text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.n11_upload_material_estudo(
  p_titulo text,
  p_material_type text,
  p_arquivo_url text
)
returns public.materiais_estudo
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.materiais_estudo%rowtype;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;

  insert into public.materiais_estudo (profile_id, titulo, material_type, arquivo_url)
  values (
    v_me,
    nullif(btrim(coalesce(p_titulo, '')), ''),
    lower(coalesce(p_material_type, '')),
    nullif(btrim(coalesce(p_arquivo_url, '')), '')
  )
  returning * into v_row;

  if v_row.titulo is null or v_row.arquivo_url is null then
    raise exception 'titulo e arquivo_url obrigatorios';
  end if;

  insert into public.historico_xp (profile_id, evento, delta_xp, ref_key, meta)
  values (
    v_me,
    'upload_material_estudo',
    15,
    'material:' || v_row.id::text,
    jsonb_build_object('material_type', v_row.material_type)
  );

  return v_row;
end;
$$;

grant execute on function public.n11_upload_material_estudo(text, text, text) to authenticated;

create table if not exists public.biblioteca_leituras (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  artigo_id text not null,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  active_seconds integer,
  status text not null default 'started' check (status in ('started', 'completed', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.n11_iniciar_leitura_biblioteca(p_artigo_id text)
returns public.biblioteca_leituras
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.biblioteca_leituras%rowtype;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;

  insert into public.biblioteca_leituras (profile_id, artigo_id)
  values (v_me, nullif(btrim(coalesce(p_artigo_id, '')), ''))
  returning * into v_row;

  if v_row.artigo_id is null then raise exception 'artigo_id obrigatorio'; end if;
  return v_row;
end;
$$;

grant execute on function public.n11_iniciar_leitura_biblioteca(text) to authenticated;

create or replace function public.n11_finalizar_leitura_biblioteca(
  p_leitura_id uuid,
  p_client_active_seconds integer
)
returns public.biblioteca_leituras
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.biblioteca_leituras%rowtype;
  v_server_elapsed integer;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;

  select * into v_row
  from public.biblioteca_leituras l
  where l.id = p_leitura_id
    and l.profile_id = v_me
  for update;

  if not found then raise exception 'Sessao de leitura nao encontrada'; end if;
  if v_row.status <> 'started' then return v_row; end if;

  v_server_elapsed := extract(epoch from (timezone('utc', now()) - v_row.started_at))::int;

  if coalesce(p_client_active_seconds, 0) < 900 then
    raise exception 'Leitura nao elegivel: minimo de 15 minutos ativos';
  end if;

  if v_server_elapsed < 900 then
    raise exception 'Leitura nao elegivel: tempo de servidor abaixo de 15 minutos';
  end if;

  if abs(v_server_elapsed - p_client_active_seconds) > 120 then
    raise exception 'Divergencia entre tempo cliente e servidor';
  end if;

  update public.biblioteca_leituras
  set
    ended_at = timezone('utc', now()),
    active_seconds = p_client_active_seconds,
    status = 'completed'
  where id = v_row.id
  returning * into v_row;

  insert into public.historico_xp (profile_id, evento, delta_xp, ref_key, meta)
  values (
    v_me,
    'leitura_biblioteca_ativa',
    10,
    'leitura:' || v_row.id::text,
    jsonb_build_object('artigo_id', v_row.artigo_id, 'active_seconds', p_client_active_seconds)
  );

  return v_row;
end;
$$;

grant execute on function public.n11_finalizar_leitura_biblioteca(uuid, integer) to authenticated;

create table if not exists public.foco_sessoes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'pomodoro' check (mode in ('pomodoro', 'livre', 'revisao_rapida')),
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  client_elapsed_seconds integer,
  server_elapsed_seconds integer,
  status text not null default 'started' check (status in ('started', 'completed', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.n11_iniciar_foco(p_mode text default 'pomodoro')
returns public.foco_sessoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.foco_sessoes%rowtype;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;

  insert into public.foco_sessoes (profile_id, mode)
  values (v_me, lower(coalesce(p_mode, 'pomodoro')))
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.n11_iniciar_foco(text) to authenticated;

create or replace function public.n11_finalizar_foco(
  p_sessao_id uuid,
  p_client_elapsed_seconds integer
)
returns public.foco_sessoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_row public.foco_sessoes%rowtype;
  v_server_elapsed integer;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;

  select * into v_row
  from public.foco_sessoes s
  where s.id = p_sessao_id
    and s.profile_id = v_me
  for update;

  if not found then raise exception 'Sessao de foco nao encontrada'; end if;
  if v_row.status <> 'started' then return v_row; end if;

  v_server_elapsed := extract(epoch from (timezone('utc', now()) - v_row.started_at))::int;

  -- Validacao antifraude: servidor precisa bater com cliente
  if coalesce(p_client_elapsed_seconds, 0) < 1200 then
    raise exception 'Ciclo de foco invalido: minimo de 20 minutos';
  end if;

  if v_server_elapsed < 1200 then
    raise exception 'Ciclo de foco invalido: tempo de servidor insuficiente';
  end if;

  if abs(v_server_elapsed - p_client_elapsed_seconds) > 120 then
    raise exception 'Divergencia de tempo entre cliente e servidor';
  end if;

  update public.foco_sessoes
  set
    ended_at = timezone('utc', now()),
    client_elapsed_seconds = p_client_elapsed_seconds,
    server_elapsed_seconds = v_server_elapsed,
    status = 'completed'
  where id = v_row.id
  returning * into v_row;

  insert into public.historico_xp (profile_id, evento, delta_xp, ref_key, meta)
  values (
    v_me,
    'ciclo_foco',
    15,
    'foco:' || v_row.id::text,
    jsonb_build_object(
      'mode', v_row.mode,
      'client_elapsed_seconds', p_client_elapsed_seconds,
      'server_elapsed_seconds', v_server_elapsed
    )
  );

  return v_row;
end;
$$;

grant execute on function public.n11_finalizar_foco(uuid, integer) to authenticated;

-- =========================================================
-- 7) CHECK-IN + OFENSIVAS
-- =========================================================

create or replace function public.n11_registrar_checkin_diario()
returns table (
  profile_id uuid,
  checkin_streak integer,
  xp_total integer,
  level integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_today date;
  v_last date;
  v_streak integer;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;
  v_today := (timezone('utc', now()))::date;

  -- XP base check-in (cap de 1/dia validado pelo trigger de capping)
  insert into public.historico_xp (profile_id, evento, delta_xp, ref_key, meta)
  values (
    v_me,
    'checkin_diario',
    5,
    'checkin:' || v_today::text,
    jsonb_build_object('day', v_today)
  );

  select p.last_checkin_date, coalesce(p.checkin_streak, 0)
    into v_last, v_streak
  from public.profiles p
  where p.id = v_me
  for update;

  if v_last = v_today - 1 then
    v_streak := v_streak + 1;
  elsif v_last = v_today then
    v_streak := greatest(1, v_streak);
  else
    v_streak := 1;
  end if;

  update public.profiles
  set checkin_streak = v_streak,
      last_checkin_date = v_today
  where id = v_me;

  if v_streak in (3, 10, 30) then
    insert into public.historico_xp (profile_id, evento, delta_xp, ref_key, meta)
    values (
      v_me,
      case when v_streak=3 then 'ofensiva_3' when v_streak=10 then 'ofensiva_10' else 'ofensiva_30' end,
      case when v_streak=3 then 50 when v_streak=10 then 100 else 300 end,
      'ofensiva:' || v_streak::text || ':' || v_today::text,
      jsonb_build_object('streak_days', v_streak)
    )
    on conflict do nothing;
  end if;

  return query
  select p.id, p.checkin_streak, p.xp_total, p.level
  from public.profiles p
  where p.id = v_me;
end;
$$;

grant execute on function public.n11_registrar_checkin_diario() to authenticated;

-- Pet: apenas registra evento (cap 1/dia na trigger)
create or replace function public.n11_registrar_pet_alimentado(p_ref_key text default null)
returns table (profile_id uuid, xp_total integer, level integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
begin
  v_me := public.n11_current_profile_id();
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;

  insert into public.historico_xp (profile_id, evento, delta_xp, ref_key, meta)
  values (
    v_me,
    'pet_alimentado',
    1,
    coalesce(nullif(btrim(coalesce(p_ref_key, '')), ''), 'pet:' || (timezone('utc', now()))::date::text),
    '{}'::jsonb
  );

  return query
  select p.id, p.xp_total, p.level
  from public.profiles p
  where p.id = v_me;
end;
$$;

grant execute on function public.n11_registrar_pet_alimentado(text) to authenticated;

-- =========================================================
-- 8) RLS
-- =========================================================

alter table public.estudantes_autorizados enable row level security;
alter table public.historico_xp enable row level security;
alter table public.tarefas_professor enable row level security;
alter table public.tarefas_professor_conclusoes enable row level security;
alter table public.solicitacoes_troca enable row level security;
alter table public.duvidas_respostas enable row level security;
alter table public.materiais_estudo enable row level security;
alter table public.biblioteca_leituras enable row level security;
alter table public.foco_sessoes enable row level security;

-- estudantes_autorizados: bloqueado para usuarios comuns
drop policy if exists estudantes_autorizados_none on public.estudantes_autorizados;
create policy estudantes_autorizados_none
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

drop policy if exists tarefas_professor_select on public.tarefas_professor;
create policy tarefas_professor_select
  on public.tarefas_professor
  for select
  to authenticated
  using (
    teacher_profile_id = public.n11_current_profile_id()
    or aluno_profile_id is null
    or aluno_profile_id = public.n11_current_profile_id()
  );

drop policy if exists tarefas_professor_insert_teacher on public.tarefas_professor;
create policy tarefas_professor_insert_teacher
  on public.tarefas_professor
  for insert
  to authenticated
  with check (
    teacher_profile_id = public.n11_current_profile_id()
    and public.n11_is_teacher(public.n11_current_profile_id())
  );

drop policy if exists tarefas_professor_update_teacher on public.tarefas_professor;
create policy tarefas_professor_update_teacher
  on public.tarefas_professor
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

drop policy if exists tarefas_professor_conclusoes_select on public.tarefas_professor_conclusoes;
create policy tarefas_professor_conclusoes_select
  on public.tarefas_professor_conclusoes
  for select
  to authenticated
  using (
    aluno_profile_id = public.n11_current_profile_id()
    or exists (
      select 1
      from public.tarefas_professor t
      where t.id = tarefas_professor_conclusoes.tarefa_id
        and t.teacher_profile_id = public.n11_current_profile_id()
    )
  );

drop policy if exists solicitacoes_troca_select on public.solicitacoes_troca;
create policy solicitacoes_troca_select
  on public.solicitacoes_troca
  for select
  to authenticated
  using (
    id_aluno = public.n11_current_profile_id()
    or id_professor = public.n11_current_profile_id()
  );

drop policy if exists solicitacoes_troca_insert on public.solicitacoes_troca;
create policy solicitacoes_troca_insert
  on public.solicitacoes_troca
  for insert
  to authenticated
  with check (id_aluno = public.n11_current_profile_id());

drop policy if exists solicitacoes_troca_update on public.solicitacoes_troca;
create policy solicitacoes_troca_update
  on public.solicitacoes_troca
  for update
  to authenticated
  using (
    id_professor = public.n11_current_profile_id()
    or public.n11_is_admin(public.n11_current_profile_id())
  )
  with check (
    id_professor = public.n11_current_profile_id()
    or public.n11_is_admin(public.n11_current_profile_id())
  );

drop policy if exists duvidas_respostas_select on public.duvidas_respostas;
create policy duvidas_respostas_select
  on public.duvidas_respostas
  for select
  to authenticated
  using (true);

drop policy if exists duvidas_respostas_insert_own on public.duvidas_respostas;
create policy duvidas_respostas_insert_own
  on public.duvidas_respostas
  for insert
  to authenticated
  with check (autor_resposta_id = public.n11_current_profile_id());

drop policy if exists materiais_estudo_select_own on public.materiais_estudo;
create policy materiais_estudo_select_own
  on public.materiais_estudo
  for select
  to authenticated
  using (profile_id = public.n11_current_profile_id());

drop policy if exists materiais_estudo_insert_own on public.materiais_estudo;
create policy materiais_estudo_insert_own
  on public.materiais_estudo
  for insert
  to authenticated
  with check (profile_id = public.n11_current_profile_id());

drop policy if exists biblioteca_leituras_select_own on public.biblioteca_leituras;
create policy biblioteca_leituras_select_own
  on public.biblioteca_leituras
  for select
  to authenticated
  using (profile_id = public.n11_current_profile_id());

drop policy if exists biblioteca_leituras_insert_own on public.biblioteca_leituras;
create policy biblioteca_leituras_insert_own
  on public.biblioteca_leituras
  for insert
  to authenticated
  with check (profile_id = public.n11_current_profile_id());

drop policy if exists foco_sessoes_select_own on public.foco_sessoes;
create policy foco_sessoes_select_own
  on public.foco_sessoes
  for select
  to authenticated
  using (profile_id = public.n11_current_profile_id());

drop policy if exists foco_sessoes_insert_own on public.foco_sessoes;
create policy foco_sessoes_insert_own
  on public.foco_sessoes
  for insert
  to authenticated
  with check (profile_id = public.n11_current_profile_id());

grant select on public.historico_xp to authenticated;
grant select, insert, update on public.tarefas_professor to authenticated;
grant select on public.tarefas_professor_conclusoes to authenticated;
grant select, insert, update on public.solicitacoes_troca to authenticated;
grant select, insert, update on public.duvidas_respostas to authenticated;
grant select, insert on public.materiais_estudo to authenticated;
grant select, insert, update on public.biblioteca_leituras to authenticated;
grant select, insert, update on public.foco_sessoes to authenticated;

comment on table public.historico_xp is
'Historico de XP com capping diario/semanal. Sem evento de comentario simples.';

comment on table public.tarefas_professor is
'Tarefas com XP variavel criado por professor.';

comment on table public.solicitacoes_troca is
'Troca XP por nota com debito imediato e estorno em rejeicao.';

