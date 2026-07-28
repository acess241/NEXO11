-- NEXINHO COMPLETO V7
-- Execute depois dos SQLs base da Academia/Nexinho.

create extension if not exists pgcrypto;

alter table public.chat_pet_pairs add column if not exists color text not null default 'neon';
alter table public.chat_pet_pairs add column if not exists accessory text not null default 'none';
alter table public.chat_pet_pairs add column if not exists room_theme text not null default 'study';
alter table public.chat_pet_pairs add column if not exists favorite_subject text not null default 'mixed';
alter table public.chat_pet_pairs add column if not exists energy integer not null default 100;
alter table public.chat_pet_pairs add column if not exists best_streak integer not null default 0;
alter table public.chat_pet_pairs add column if not exists total_questions integer not null default 0;
alter table public.chat_pet_pairs add column if not exists total_correct integer not null default 0;
alter table public.chat_pet_pairs add column if not exists coins integer not null default 0;
alter table public.chat_pet_pairs add column if not exists born_at timestamptz not null default timezone('utc', now());

create table if not exists public.chat_pet_items (
  id text primary key,
  category text not null check (category in ('clothing','accessory','furniture','wallpaper','animation')),
  name text not null,
  icon text not null default '✨',
  price integer not null default 0 check (price >= 0),
  unlock_days integer not null default 0,
  active boolean not null default true
);

insert into public.chat_pet_items (id, category, name, icon, price, unlock_days) values
  ('hat_green','clothing','Boné neon','🧢',40,0),
  ('glasses','accessory','Óculos','👓',55,7),
  ('crown','accessory','Coroa estudiosa','👑',180,30),
  ('bed_green','furniture','Cama verde','🛏️',90,0),
  ('bookshelf','furniture','Estante','📚',120,15),
  ('study_desk','furniture','Mesa de estudos','📝',150,15),
  ('wall_space','wallpaper','Parede espacial','🌌',200,30),
  ('anim_book','animation','Ler livro','📖',100,7),
  ('anim_dance','animation','Dancinha','🎵',160,30)
on conflict (id) do update set
  category = excluded.category, name = excluded.name, icon = excluded.icon,
  price = excluded.price, unlock_days = excluded.unlock_days, active = true;

create table if not exists public.chat_pet_inventory (
  pet_pair_id uuid not null references public.chat_pet_pairs(id) on delete cascade,
  item_id text not null references public.chat_pet_items(id),
  purchased_by uuid references public.profiles(id) on delete set null,
  purchased_at timestamptz not null default timezone('utc', now()),
  equipped boolean not null default false,
  primary key (pet_pair_id, item_id)
);

create table if not exists public.chat_pet_achievements (
  pet_pair_id uuid not null references public.chat_pet_pairs(id) on delete cascade,
  achievement_key text not null,
  title text not null,
  description text,
  unlocked_at timestamptz not null default timezone('utc', now()),
  primary key (pet_pair_id, achievement_key)
);

create table if not exists public.chat_pet_events (
  id uuid primary key default gen_random_uuid(),
  pet_pair_id uuid not null references public.chat_pet_pairs(id) on delete cascade,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  title text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chat_pet_reminders (
  id uuid primary key default gen_random_uuid(),
  pet_pair_id uuid not null references public.chat_pet_pairs(id) on delete cascade,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles(id) on delete cascade,
  reminder_date date not null default current_date,
  created_at timestamptz not null default timezone('utc', now())
);
create index if not exists chat_pet_reminders_limit_idx
  on public.chat_pet_reminders(pet_pair_id, sender_profile_id, reminder_date);

create table if not exists public.chat_pet_decisions (
  id uuid primary key default gen_random_uuid(),
  pet_pair_id uuid not null references public.chat_pet_pairs(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete cascade,
  decision_type text not null check (decision_type in ('name','favorite_subject','close_pet','important_settings')),
  proposed_value jsonb not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  responded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz
);

create table if not exists public.chat_pet_rewards (
  pet_pair_id uuid not null references public.chat_pet_pairs(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reward_key text not null,
  coins integer not null default 0,
  awarded_at timestamptz not null default timezone('utc',now()),
  primary key(pet_pair_id,profile_id,reward_key)
);

alter table public.chat_pet_quiz_attempts alter column pass_score_percent set default 60.00;
update public.chat_pet_quiz_attempts set pass_score_percent=60.00
where submitted_at is null and pass_score_percent<>60.00;

create or replace function public.nexinho_force_quiz_rules()
returns trigger language plpgsql set search_path=public as $$
begin
  new.total_questions:=5;
  new.pass_score_percent:=60.00;
  return new;
end $$;
drop trigger if exists nexinho_force_quiz_rules on public.chat_pet_quiz_attempts;
create trigger nexinho_force_quiz_rules before insert on public.chat_pet_quiz_attempts
for each row execute function public.nexinho_force_quiz_rules();

create or replace function public.nexinho_reward_quiz()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_coins int; v_inserted int;
begin
  if new.submitted_at is null or old.submitted_at is not null then return new; end if;
  update public.chat_pet_pairs set
    total_questions=total_questions+new.total_questions,
    total_correct=total_correct+coalesce(new.correct_count,0),
    energy=case when new.passed then least(100,energy+10) else greatest(0,energy-5) end,
    best_streak=greatest(best_streak,life_days)
  where id=new.pet_pair_id;
  if new.passed then
    v_coins:=10+case when new.correct_count=new.total_questions then 5 else 0 end;
    insert into public.chat_pet_rewards(pet_pair_id,profile_id,reward_key,coins)
    values(new.pet_pair_id,new.profile_id,'daily:'||new.challenge_date::text,v_coins)
    on conflict do nothing;
    get diagnostics v_inserted=row_count;
    if v_inserted>0 then
      update public.chat_pet_pairs set coins=coins+v_coins where id=new.pet_pair_id;
      insert into public.chat_pet_events(pet_pair_id,actor_profile_id,event_type,title,details)
      values(new.pet_pair_id,new.profile_id,'quiz','Quiz concluído',jsonb_build_object('correct',new.correct_count,'total',new.total_questions,'coins',v_coins));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists nexinho_reward_quiz on public.chat_pet_quiz_attempts;
create trigger nexinho_reward_quiz after update of submitted_at on public.chat_pet_quiz_attempts
for each row execute function public.nexinho_reward_quiz();

create or replace function public.nexinho_pair_for_conversation(p_conversation_id uuid)
returns uuid language sql stable security definer set search_path=public as $$
  select p.id
  from public.chat_pet_pairs p
  where p.conversation_id=p_conversation_id
    and public.academy_is_chat_participant(p_conversation_id, public.academy_current_profile_id())
  limit 1
$$;

create or replace function public.nexinho_get_dashboard(p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_pair record; v_me uuid; v_partner uuid; v_today date; v_done_me boolean; v_done_partner boolean;
begin
  v_me := public.academy_current_profile_id();
  v_today := timezone('America/Bahia', now())::date;
  select p.*, c.profile_one_id, c.profile_two_id
  into v_pair from public.chat_pet_pairs p
  join public.chat_conversations c on c.id=p.conversation_id
  where p.conversation_id=p_conversation_id
    and v_me in (c.profile_one_id,c.profile_two_id);
  if not found then raise exception 'Nexinho nao encontrado'; end if;
  v_partner := case when v_pair.profile_one_id=v_me then v_pair.profile_two_id else v_pair.profile_one_id end;
  select exists(select 1 from public.chat_pet_daily_completions x where x.pet_pair_id=v_pair.id and x.challenge_date=v_today and x.profile_id=v_me) into v_done_me;
  select exists(select 1 from public.chat_pet_daily_completions x where x.pet_pair_id=v_pair.id and x.challenge_date=v_today and x.profile_id=v_partner) into v_done_partner;
  return jsonb_build_object(
    'pair_id',v_pair.id,'name',v_pair.pet_name,'color',v_pair.color,'accessory',v_pair.accessory,
    'room_theme',v_pair.room_theme,'favorite_subject',v_pair.favorite_subject,'energy',v_pair.energy,
    'streak',v_pair.life_days,'best_streak',greatest(v_pair.best_streak,v_pair.life_days),
    'restores_left',greatest(0,3-coalesce(v_pair.restores_used_month,0)),'status',v_pair.status,
    'coins',v_pair.coins,'total_questions',v_pair.total_questions,'total_correct',v_pair.total_correct,
    'born_at',v_pair.born_at,'completed_by_me',v_done_me,'completed_by_partner',v_done_partner,
    'my_profile_id',v_me,'partner_id',v_partner,
    'inventory',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name,'icon',i.icon,'category',i.category,'equipped',inv.equipped))
      from public.chat_pet_inventory inv join public.chat_pet_items i on i.id=inv.item_id where inv.pet_pair_id=v_pair.id),'[]'::jsonb),
    'shop',coalesce((select jsonb_agg(to_jsonb(i) order by i.price) from public.chat_pet_items i where i.active),'[]'::jsonb),
    'achievements',coalesce((select jsonb_agg(to_jsonb(a) order by a.unlocked_at desc) from public.chat_pet_achievements a where a.pet_pair_id=v_pair.id),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at desc) from (select * from public.chat_pet_events where pet_pair_id=v_pair.id order by created_at desc limit 30) e),'[]'::jsonb)
  );
end $$;

create or replace function public.nexinho_customize(
  p_conversation_id uuid, p_color text, p_accessory text, p_room_theme text, p_favorite_subject text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_pair uuid; v_me uuid;
begin
  v_me:=public.academy_current_profile_id(); v_pair:=public.nexinho_pair_for_conversation(p_conversation_id);
  if v_pair is null then raise exception 'Sem acesso ao Nexinho'; end if;
  update public.chat_pet_pairs set
    color=coalesce(nullif(trim(p_color),''),color),
    accessory=coalesce(nullif(trim(p_accessory),''),accessory),
    room_theme=coalesce(nullif(trim(p_room_theme),''),room_theme),
    favorite_subject=coalesce(nullif(trim(p_favorite_subject),''),favorite_subject),
    updated_at=timezone('utc',now())
  where id=v_pair;
  insert into public.chat_pet_events(pet_pair_id,actor_profile_id,event_type,title)
  values(v_pair,v_me,'customization','Quarto e aparência atualizados');
  return public.nexinho_get_dashboard(p_conversation_id);
end $$;

create or replace function public.nexinho_remind_partner(p_conversation_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_pair uuid; v_me uuid; v_partner uuid; v_count int;
begin
  v_me:=public.academy_current_profile_id(); v_pair:=public.nexinho_pair_for_conversation(p_conversation_id);
  if v_pair is null then raise exception 'Sem acesso ao Nexinho'; end if;
  select case when c.profile_one_id=v_me then c.profile_two_id else c.profile_one_id end into v_partner
  from public.chat_pet_pairs p join public.chat_conversations c on c.id=p.conversation_id where p.id=v_pair;
  select count(*) into v_count from public.chat_pet_reminders
  where pet_pair_id=v_pair and sender_profile_id=v_me and reminder_date=timezone('America/Bahia',now())::date;
  if v_count>=2 then raise exception 'Limite de 2 lembretes por dia atingido'; end if;
  insert into public.chat_pet_reminders(pet_pair_id,sender_profile_id,recipient_profile_id) values(v_pair,v_me,v_partner);
  insert into public.chat_pet_events(pet_pair_id,actor_profile_id,event_type,title)
  values(v_pair,v_me,'reminder','Parceiro lembrado de alimentar o Nexinho');
  return jsonb_build_object('sent',true,'remaining_today',1-v_count);
end $$;

create or replace function public.nexinho_buy_item(p_conversation_id uuid,p_item_id text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_pair record; v_item record; v_me uuid;
begin
  v_me:=public.academy_current_profile_id();
  select p.* into v_pair from public.chat_pet_pairs p where p.id=public.nexinho_pair_for_conversation(p_conversation_id) for update;
  select * into v_item from public.chat_pet_items where id=p_item_id and active;
  if not found then raise exception 'Item nao encontrado'; end if;
  if v_pair.life_days<v_item.unlock_days then raise exception 'Item bloqueado ate % dias',v_item.unlock_days; end if;
  if v_pair.coins<v_item.price then raise exception 'Nexocoins insuficientes'; end if;
  insert into public.chat_pet_inventory(pet_pair_id,item_id,purchased_by) values(v_pair.id,p_item_id,v_me)
  on conflict do nothing;
  if found then update public.chat_pet_pairs set coins=coins-v_item.price where id=v_pair.id; end if;
  return public.nexinho_get_dashboard(p_conversation_id);
end $$;

create or replace function public.nexinho_quiz_review(p_attempt_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'question_id',q.id,
    'selected_option',i.selected_option,
    'correct_option',q.correct_option,
    'is_correct',i.is_correct,
    'explanation',coalesce(q.explanation,'Revise o conteúdo e tente explicar a resposta com suas palavras.')
  ) order by i.display_order),'[]'::jsonb)
  from public.chat_pet_quiz_attempt_items i
  join public.chat_pet_quiz_attempts a on a.id=i.attempt_id
  join public.academy_quiz_questions q on q.id=i.quiz_question_id
  where i.attempt_id=p_attempt_id
    and a.profile_id=public.academy_current_profile_id()
    and a.submitted_at is not null
$$;

grant execute on function public.nexinho_get_dashboard(uuid) to authenticated;
grant execute on function public.nexinho_customize(uuid,text,text,text,text) to authenticated;
grant execute on function public.nexinho_remind_partner(uuid) to authenticated;
grant execute on function public.nexinho_buy_item(uuid,text) to authenticated;
grant execute on function public.nexinho_quiz_review(uuid) to authenticated;

alter table public.chat_pet_inventory enable row level security;
alter table public.chat_pet_achievements enable row level security;
alter table public.chat_pet_events enable row level security;
alter table public.chat_pet_reminders enable row level security;
alter table public.chat_pet_decisions enable row level security;
alter table public.chat_pet_rewards enable row level security;

drop policy if exists nexinho_items_read on public.chat_pet_items;
alter table public.chat_pet_items enable row level security;
create policy nexinho_items_read on public.chat_pet_items for select to authenticated using (true);

-- O acesso às tabelas privadas ocorre pelas funções security definer acima.
