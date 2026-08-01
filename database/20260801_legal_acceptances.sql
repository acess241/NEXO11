-- Assinatura obrigatória dos documentos legais do NEXO 11.
-- Execute este arquivo uma vez no SQL Editor do Supabase.

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  legal_version text not null,
  signed_name text not null check (char_length(trim(signed_name)) between 3 and 120),
  privacy_accepted boolean not null default false,
  terms_accepted boolean not null default false,
  safety_accepted boolean not null default false,
  accepted_at timestamptz not null default now(),
  user_agent text,
  constraint legal_acceptances_all_documents_chk check (
    privacy_accepted and terms_accepted and safety_accepted
  ),
  constraint legal_acceptances_account_version_key unique (account_id, legal_version)
);

create index if not exists legal_acceptances_account_id_idx
  on public.legal_acceptances (account_id);

alter table public.legal_acceptances enable row level security;

drop policy if exists "legal_acceptances_select_own" on public.legal_acceptances;
create policy "legal_acceptances_select_own"
  on public.legal_acceptances for select
  to authenticated
  using (auth.uid() = account_id);

drop policy if exists "legal_acceptances_insert_own" on public.legal_acceptances;
create policy "legal_acceptances_insert_own"
  on public.legal_acceptances for insert
  to authenticated
  with check (auth.uid() = account_id);

drop policy if exists "legal_acceptances_update_own" on public.legal_acceptances;
create policy "legal_acceptances_update_own"
  on public.legal_acceptances for update
  to authenticated
  using (auth.uid() = account_id)
  with check (auth.uid() = account_id);

grant select, insert, update on public.legal_acceptances to authenticated;
revoke all on public.legal_acceptances from anon;

comment on table public.legal_acceptances is
  'Registro auditável do aceite dos documentos legais do NEXO 11 por versão.';
