-- NEXO 11 - Moderacao e seguranca institucional
-- Execute este arquivo inteiro no SQL Editor do Supabase.
-- O frontend nunca recebe a identidade de quem denunciou.

create extension if not exists pgcrypto;

create table if not exists public.nexo_moderation_staff (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  permission_level text not null default 'reviewer' check (permission_level in ('reviewer','manager','owner')),
  can_view_flagged_private_content boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.nexo_account_safety (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  incident_count integer not null default 0 check (incident_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  status text not null default 'active' check (status in ('active','under_review','suspended_temporary','suspended_permanent')),
  suspended_until timestamptz,
  suspension_reason text,
  updated_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.nexo_moderation_cases (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  content_type text not null check (content_type in ('message','group_message','comment','post','story','profile','image','video','report','appeal')),
  content_id uuid,
  original_content text,
  rule_code text not null,
  severity smallint not null check (severity between 1 and 4),
  confidence numeric(4,3) not null default 0.5 check (confidence between 0 and 1),
  status text not null default 'pending' check (status in ('pending','allowed','removed','resolved')),
  action_taken text not null default 'queued',
  metadata jsonb not null default '{}'::jsonb,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.nexo_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_profile_id uuid not null references public.profiles(id) on delete cascade,
  reported_profile_id uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('profile','post','comment','message','image','video','story')),
  target_id uuid,
  reason text not null check (reason in ('bullying_harassment','hate_speech','threat','sexual','violence','spam','personal_data','fake_account','other')),
  details text,
  status text not null default 'pending' check (status in ('pending','reviewing','resolved','dismissed')),
  moderation_case_id uuid references public.nexo_moderation_cases(id) on delete set null,
  created_at timestamptz not null default timezone('utc',now())
);

create table if not exists public.nexo_suspension_appeals (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','upheld','reversed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc',now())
);

create index if not exists nexo_moderation_cases_queue_idx on public.nexo_moderation_cases(status,created_at desc);
create index if not exists nexo_moderation_cases_profile_idx on public.nexo_moderation_cases(profile_id,created_at desc);
create index if not exists nexo_reports_queue_idx on public.nexo_reports(status,created_at desc);

insert into public.nexo_account_safety(profile_id)
select id from public.profiles on conflict(profile_id) do nothing;

insert into public.nexo_moderation_staff(profile_id,permission_level,can_view_flagged_private_content)
select id,'owner',true from public.profiles where lower(coalesce(role,''))='admin'
on conflict(profile_id) do nothing;

create or replace function public.nexo_can_moderate(p_require_private boolean default false)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.nexo_moderation_staff s
    join public.profiles p on p.id=s.profile_id
    where p.account_id=auth.uid() and s.active
      and (not p_require_private or s.can_view_flagged_private_content)
  )
$$;
revoke all on function public.nexo_can_moderate(boolean) from public;
grant execute on function public.nexo_can_moderate(boolean) to authenticated;

create or replace function public.nexo_moderation_normalize(p_text text)
returns text language sql immutable as $$
  select regexp_replace(regexp_replace(
    translate(lower(replace(replace(replace(coalesce(p_text,''),chr(8203),''),chr(8288),''),chr(65279),'')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ0@123456789$',
      'aaaaaeeeeiiiiooooouuuucnoaizeasgtbgs'),
    '[^a-z0-9]+','','g'),'([a-z0-9])\1{2,}','\1','g')
$$;

create or replace function public.nexo_detect_text(p_text text)
returns table(decision text,severity smallint,rule_code text,confidence numeric)
language plpgsql immutable as $$
declare v text:=public.nexo_moderation_normalize(p_text);
begin
  if v='' then return query select 'allow',0::smallint,null::text,1::numeric; return; end if;
  if v ~ '(pornografiainfantil|nud(ez|es).*(crianca|menor)|exploracaosexual|aliciar.*(crianca|menor))' then return query select 'review',4::smallint,'critical_illegal',.98::numeric; return; end if;
  if v ~ '(voutematar|voumatarvoce|voutebater|vouacabarcomvoce|se[m]?ata|voumematar|automutil)' then return query select 'block',3::smallint,case when v ~ '(matar|bater|acabar)' then 'threat' else 'self_harm' end,.94::numeric; return; end if;
  if v ~ '(mandanude|fotopelad|sexocommenor|morteaos|temqueexterminar|comoroubar|comoinvadir|comohackear)' then return query select 'block',3::smallint,'dangerous_content',.92::numeric; return; end if;
  if v ~ '(vaisefoder|vaitomarnocu|ninguemgostadevoce|filh[oa]daputa|fdp|voce(e|eum|euma|um|uma)?(babaca|idiota|imbecil|estupido|burro|otario|cretino|inutil|nojento|escroto|canalha|safado|vagabundo|miseravel|verme|palhaco|corno))' then return query select 'block',2::smallint,'bullying_harassment',.90::numeric; return; end if;
  if v ~ '(minhasenhae|meuenderecoe|bitly|tinyurl|discordgg)' then return query select 'review',2::smallint,'personal_data_or_link',.86::numeric; return; end if;
  if v ~ '(bucet|cona|cuzinho|cuzao|fode|fuder|fudid|pica|pinto|piroca|punhet|siririca|merda|bosta|cagad|cagar|caguei|coco|mijo|porra|puta|puto|putaria|pqp|caralho|cacete|desgrac|maldit|demonio|babaca|imbecil|idiota|estupid|burro|otari|cretin|inutil|nojent|escrot|canalha|safad|vagabund|lazarent|miseravel|verme|traste|energumeno|paspalh|palhac|arrombad|cornud|vadia|piranha|rameir|prostitut)' then return query select 'edit',1::smallint,'inappropriate_language',.84::numeric; return; end if;
  return query select 'allow',0::smallint,null::text,.99::numeric;
end $$;

create or replace function public.nexo_assert_account_active(p_profile_id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare v public.nexo_account_safety%rowtype;
begin
  insert into public.nexo_account_safety(profile_id) values(p_profile_id) on conflict do nothing;
  select * into v from public.nexo_account_safety where profile_id=p_profile_id for update;
  if v.status='suspended_temporary' and v.suspended_until<=timezone('utc',now()) then
    update public.nexo_account_safety set status='active',suspended_until=null,updated_at=timezone('utc',now()) where profile_id=p_profile_id;
  elsif v.status in ('suspended_temporary','suspended_permanent') then
    raise exception 'NEXO_ACCOUNT_SUSPENDED';
  end if;
end $$;

create or replace function public.nexo_record_case(
  p_profile_id uuid,p_content_type text,p_content_id uuid,p_original_content text,
  p_rule_code text,p_severity smallint,p_confidence numeric,p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_case uuid; v_count integer;
begin
  insert into public.nexo_moderation_cases(profile_id,content_type,content_id,original_content,rule_code,severity,confidence,metadata)
  values(p_profile_id,p_content_type,p_content_id,p_original_content,p_rule_code,p_severity,p_confidence,coalesce(p_metadata,'{}')) returning id into v_case;
  insert into public.nexo_account_safety(profile_id) values(p_profile_id) on conflict do nothing;
  if p_severity between 2 and 3 and p_confidence>=.88 then
    update public.nexo_account_safety set incident_count=incident_count+1,warning_count=warning_count+1,updated_at=timezone('utc',now()) where profile_id=p_profile_id returning incident_count into v_count;
    if v_count>=3 then update public.nexo_account_safety set status='suspended_temporary',suspended_until=timezone('utc',now())+interval '7 days',suspension_reason='Reincidencia no descumprimento das Regras da Comunidade' where profile_id=p_profile_id; end if;
  elsif p_severity=4 then
    update public.nexo_account_safety set status='under_review',updated_at=timezone('utc',now()) where profile_id=p_profile_id;
  end if;
  return v_case;
end $$;

create or replace function public.nexo_register_moderation_event(p_content_type text,p_content_id uuid,p_original_content text,p_rule_code text,p_severity integer,p_confidence numeric,p_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.current_profile_id();
begin
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;
  return public.nexo_record_case(v_me,p_content_type,p_content_id,p_original_content,p_rule_code,p_severity::smallint,p_confidence,p_metadata);
end $$;
revoke all on function public.nexo_register_moderation_event(text,uuid,text,text,integer,numeric,jsonb) from public;
grant execute on function public.nexo_register_moderation_event(text,uuid,text,text,integer,numeric,jsonb) to authenticated;

alter table public.posts add column if not exists moderation_status text not null default 'approved';
alter table public.comments add column if not exists moderation_status text not null default 'approved';
alter table public.stories add column if not exists moderation_status text not null default 'approved';
alter table public.chat_messages add column if not exists moderation_status text not null default 'approved';
alter table public.nexo_group_messages add column if not exists moderation_status text not null default 'approved';

create or replace function public.nexo_moderate_content_trigger()
returns trigger language plpgsql security definer set search_path=public as $$
declare j jsonb:=to_jsonb(new); v_profile uuid; v_text text; v_type text; v_id uuid; v_media text; d record;
begin
  if current_setting('nexo.moderation_action',true)='on' then return new; end if;
  v_profile:=coalesce((j->>'profile_id')::uuid,(j->>'sender_profile_id')::uuid);
  perform public.nexo_assert_account_active(v_profile);
  v_text:=coalesce(j->>'content',j->>'caption',''); v_id:=(j->>'id')::uuid;
  v_media:=j->>'media_url';
  v_type:=case tg_table_name when 'chat_messages' then 'message' when 'nexo_group_messages' then 'group_message' when 'comments' then 'comment' when 'posts' then 'post' when 'stories' then 'story' end;
  select * into d from public.nexo_detect_text(v_text);
  if v_media is not null and v_media<>'' and d.decision='allow' then d.decision:='review'; d.severity:=2; d.rule_code:='media_review'; d.confidence:=.5; end if;
  if d.decision in ('block','review') then
    perform public.nexo_record_case(v_profile,v_type,v_id,v_text,d.rule_code,d.severity,d.confidence,jsonb_build_object('table',tg_table_name,'has_media',v_media is not null));
    new.moderation_status:=case when d.decision='review' then 'pending' else 'blocked' end;
    if tg_table_name in ('chat_messages','nexo_group_messages') then
      new.content:=case when d.decision='review' then 'Conteúdo aguardando análise.' else 'Uma mensagem enviada para você foi removida pelo sistema de segurança do NEXO 11 por violar as regras da comunidade.' end;
      if d.decision='block' then new.media_url:=null; end if;
    end if;
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['posts','comments','stories','chat_messages','nexo_group_messages'] loop
    execute format('drop trigger if exists trg_nexo_moderate_%I on public.%I',t,t);
    execute format('create trigger trg_nexo_moderate_%I before insert or update on public.%I for each row execute function public.nexo_moderate_content_trigger()',t,t);
  end loop;
end $$;

-- Perfil: impede auto-promocao para admin e alteracao direta de XP/identidade escolar.
create or replace function public.nexo_protect_profile_security()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_is_moderator boolean:=public.nexo_can_moderate(false); d record;
begin
  if tg_op='INSERT' and new.account_id=auth.uid() and lower(coalesce(new.role,'student'))='admin' then new.role:='student'; end if;
  if tg_op='UPDATE' and not v_is_moderator then
    new.role:=old.role; new.xp_total:=old.xp_total; new.level:=old.level; new.account_id:=old.account_id;
    new.institution_id:=old.institution_id; new.enrollment_number:=old.enrollment_number;
  end if;
  select * into d from public.nexo_detect_text(concat_ws(' ',new.nome,new.username,new.bio));
  if d.decision in ('block','review') then raise exception 'NEXO_PROFILE_CONTENT_BLOCKED'; end if;
  return new;
end $$;
drop trigger if exists trg_nexo_protect_profile_security on public.profiles;
create trigger trg_nexo_protect_profile_security before insert or update on public.profiles for each row execute function public.nexo_protect_profile_security();

create or replace function public.nexo_create_report(p_target_type text,p_target_id uuid,p_reported_profile_id uuid,p_reason text,p_details text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.current_profile_id(); v_report uuid; v_case uuid;
begin
  if v_me is null then raise exception 'Perfil nao encontrado'; end if;
  if p_reported_profile_id=v_me then raise exception 'Nao e possivel denunciar o proprio perfil'; end if;
  insert into public.nexo_moderation_cases(profile_id,content_type,content_id,rule_code,severity,confidence,metadata)
  values(coalesce(p_reported_profile_id,v_me),'report',p_target_id,p_reason,2,.5,jsonb_build_object('target_type',p_target_type)) returning id into v_case;
  insert into public.nexo_reports(reporter_profile_id,reported_profile_id,target_type,target_id,reason,details,moderation_case_id)
  values(v_me,p_reported_profile_id,p_target_type,p_target_id,p_reason,left(p_details,1000),v_case) returning id into v_report;
  return v_report;
end $$;
revoke all on function public.nexo_create_report(text,uuid,uuid,text,text) from public;
grant execute on function public.nexo_create_report(text,uuid,uuid,text,text) to authenticated;

create or replace function public.nexo_my_safety_status()
returns table(status text,incident_count integer,warning_count integer,suspended_until timestamptz,suspension_reason text)
language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.current_profile_id();
begin
  insert into public.nexo_account_safety(profile_id) values(v_me) on conflict do nothing;
  return query select s.status,s.incident_count,s.warning_count,s.suspended_until,s.suspension_reason from public.nexo_account_safety s where s.profile_id=v_me;
end $$;
grant execute on function public.nexo_my_safety_status() to authenticated;

create or replace function public.nexo_request_suspension_review(p_reason text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.current_profile_id(); v_id uuid;
begin
  if not exists(select 1 from public.nexo_account_safety where profile_id=v_me and status like 'suspended%') then raise exception 'Conta nao esta suspensa'; end if;
  if exists(select 1 from public.nexo_suspension_appeals where profile_id=v_me and status='pending') then raise exception 'Ja existe revisao pendente'; end if;
  insert into public.nexo_suspension_appeals(profile_id,reason) values(v_me,left(p_reason,1000)) returning id into v_id; return v_id;
end $$;
grant execute on function public.nexo_request_suspension_review(text) to authenticated;

create or replace function public.nexo_moderation_queue(p_filter text default 'all',p_limit integer default 200)
returns table(case_id uuid,profile_id uuid,username text,content_type text,content_id uuid,original_content text,rule_code text,severity smallint,confidence numeric,status text,action_taken text,created_at timestamptz,previous_incidents integer,account_status text)
language plpgsql security definer set search_path=public as $$
begin
  if not public.nexo_can_moderate(true) then raise exception 'Acesso restrito'; end if;
  return query select c.id,c.profile_id,p.username,c.content_type,c.content_id,c.original_content,c.rule_code,c.severity,c.confidence,c.status,c.action_taken,c.created_at,greatest(coalesce(s.incident_count,0)-1,0),coalesce(s.status,'active')
  from public.nexo_moderation_cases c join public.profiles p on p.id=c.profile_id left join public.nexo_account_safety s on s.profile_id=c.profile_id
  where p_filter='all' or c.content_type=p_filter or (p_filter='warning' and c.action_taken='warning') or (p_filter='suspension' and s.status like 'suspended%')
  order by case when c.status='pending' then 0 else 1 end,c.severity desc,c.created_at desc limit least(greatest(p_limit,1),500);
end $$;
grant execute on function public.nexo_moderation_queue(text,integer) to authenticated;

create or replace function public.nexo_moderation_action(p_case_id uuid,p_action text,p_duration_hours integer default null,p_notes text default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_me uuid:=public.current_profile_id(); c public.nexo_moderation_cases%rowtype;
begin
  if not public.nexo_can_moderate(true) then raise exception 'Acesso restrito'; end if;
  perform set_config('nexo.moderation_action','on',true);
  select * into c from public.nexo_moderation_cases where id=p_case_id for update; if not found then raise exception 'Ocorrencia nao encontrada'; end if;
  if p_action='allow' then
    update public.nexo_moderation_cases set status='allowed',action_taken='allowed' where id=p_case_id;
    if c.content_id is not null then
      if c.content_type='post' then update public.posts set moderation_status='approved' where id=c.content_id;
      elsif c.content_type='comment' then update public.comments set moderation_status='approved' where id=c.content_id;
      elsif c.content_type='story' then update public.stories set moderation_status='approved' where id=c.content_id;
      elsif c.content_type='message' then update public.chat_messages set moderation_status='approved',content=coalesce(c.original_content,content) where id=c.content_id;
      elsif c.content_type='group_message' then update public.nexo_group_messages set moderation_status='approved',content=coalesce(c.original_content,content) where id=c.content_id;
      end if;
    end if;
  elsif p_action='remove' then
    update public.nexo_moderation_cases set status='removed',action_taken='removed' where id=p_case_id;
    if c.content_type='post' then update public.posts set moderation_status='removed' where id=c.content_id;
    elsif c.content_type='comment' then update public.comments set moderation_status='removed' where id=c.content_id;
    elsif c.content_type='story' then update public.stories set moderation_status='removed' where id=c.content_id;
    elsif c.content_type='message' then update public.chat_messages set moderation_status='removed' where id=c.content_id;
    elsif c.content_type='group_message' then update public.nexo_group_messages set moderation_status='removed' where id=c.content_id;
    end if;
  elsif p_action='warn' then update public.nexo_account_safety set warning_count=warning_count+1 where profile_id=c.profile_id; update public.nexo_moderation_cases set action_taken='warning' where id=p_case_id;
  elsif p_action='remove_warning' then update public.nexo_account_safety set warning_count=greatest(0,warning_count-1),incident_count=greatest(0,incident_count-1) where profile_id=c.profile_id; update public.nexo_moderation_cases set action_taken='warning_removed' where id=p_case_id;
  elsif p_action='suspend_temporary' then update public.nexo_account_safety set status='suspended_temporary',suspended_until=timezone('utc',now())+make_interval(hours=>least(greatest(coalesce(p_duration_hours,24),1),720)),suspension_reason=coalesce(p_notes,c.rule_code),updated_at=timezone('utc',now()) where profile_id=c.profile_id; update public.nexo_moderation_cases set action_taken='temporary_suspension' where id=p_case_id;
  elsif p_action='suspend_permanent' then update public.nexo_account_safety set status='suspended_permanent',suspended_until=null,suspension_reason=coalesce(p_notes,c.rule_code),updated_at=timezone('utc',now()) where profile_id=c.profile_id; update public.nexo_moderation_cases set action_taken='permanent_suspension' where id=p_case_id;
  elsif p_action='restore' then update public.nexo_account_safety set status='active',suspended_until=null,suspension_reason=null,updated_at=timezone('utc',now()) where profile_id=c.profile_id; update public.nexo_moderation_cases set action_taken='account_restored' where id=p_case_id;
  else raise exception 'Acao invalida'; end if;
  update public.nexo_moderation_cases set reviewed_by=v_me,reviewed_at=timezone('utc',now()),review_notes=p_notes where id=p_case_id;
end $$;
grant execute on function public.nexo_moderation_action(uuid,text,integer,text) to authenticated;

alter table public.nexo_moderation_staff enable row level security;
alter table public.nexo_account_safety enable row level security;
alter table public.nexo_moderation_cases enable row level security;
alter table public.nexo_reports enable row level security;
alter table public.nexo_suspension_appeals enable row level security;

drop policy if exists nexo_staff_self_select on public.nexo_moderation_staff;
create policy nexo_staff_self_select on public.nexo_moderation_staff for select to authenticated using(profile_id=public.current_profile_id());
drop policy if exists nexo_safety_self_select on public.nexo_account_safety;
create policy nexo_safety_self_select on public.nexo_account_safety for select to authenticated using(profile_id=public.current_profile_id());
drop policy if exists nexo_cases_moderator_only on public.nexo_moderation_cases;
create policy nexo_cases_moderator_only on public.nexo_moderation_cases for select to authenticated using(public.nexo_can_moderate(true));
drop policy if exists nexo_reports_insert_self on public.nexo_reports;
create policy nexo_reports_insert_self on public.nexo_reports for insert to authenticated with check(reporter_profile_id=public.current_profile_id());
drop policy if exists nexo_reports_moderator_select on public.nexo_reports;
create policy nexo_reports_moderator_select on public.nexo_reports for select to authenticated using(public.nexo_can_moderate(false));
drop policy if exists nexo_appeals_self_select on public.nexo_suspension_appeals;
create policy nexo_appeals_self_select on public.nexo_suspension_appeals for select to authenticated using(profile_id=public.current_profile_id() or public.nexo_can_moderate(false));

drop policy if exists posts_select_all on public.posts;
drop policy if exists posts_select_moderated on public.posts;
create policy posts_select_moderated on public.posts for select to authenticated using(moderation_status='approved' or profile_id=public.current_profile_id() or public.nexo_can_moderate(false));
drop policy if exists comments_select_all on public.comments;
drop policy if exists comments_select_moderated on public.comments;
create policy comments_select_moderated on public.comments for select to authenticated using(moderation_status='approved' or profile_id=public.current_profile_id() or public.nexo_can_moderate(false));
drop policy if exists stories_select_all on public.stories;
drop policy if exists stories_select_moderated on public.stories;
create policy stories_select_moderated on public.stories for select to authenticated using(moderation_status='approved' or profile_id=public.current_profile_id() or public.nexo_can_moderate(false));

revoke all on public.nexo_moderation_staff,public.nexo_account_safety,public.nexo_moderation_cases,public.nexo_reports,public.nexo_suspension_appeals from anon;
grant select on public.nexo_moderation_staff,public.nexo_account_safety,public.nexo_moderation_cases,public.nexo_reports,public.nexo_suspension_appeals to authenticated;

-- Corrige a falha antiga que permitia atualizar ou apagar arquivos de outras contas.
drop policy if exists stories_auth_update on storage.objects;
create policy stories_auth_update on storage.objects for update to authenticated using(bucket_id='stories' and owner_id=auth.uid()::text) with check(bucket_id='stories' and owner_id=auth.uid()::text);
drop policy if exists stories_auth_delete on storage.objects;
create policy stories_auth_delete on storage.objects for delete to authenticated using(bucket_id='stories' and owner_id=auth.uid()::text);
