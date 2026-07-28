-- Corrige a constraint de tipo das notificacoes para aceitar quiz_result/xp_adjustment
-- sem perder tipos antigos que ja existem na tabela.

do $$
declare
  v_types text[];
  v_type text;
  v_list text := '';
begin
  select array_agg(distinct t order by t)
  into v_types
  from (
    select unnest(
      array[
        'follow',
        'follow_request',
        'message',
        'like_post',
        'like_comment',
        'comment',
        'reply',
        'repost',
        'story',
        'quiz_result',
        'xp_adjustment'
      ]
    ) as t
    union
    select distinct n.type as t
    from public.notifications n
    where n.type is not null
  ) src;

  foreach v_type in array v_types loop
    v_list := v_list || case when v_list = '' then '' else ', ' end || quote_literal(v_type);
  end loop;

  execute 'alter table public.notifications drop constraint if exists notifications_type_check';
  execute format(
    'alter table public.notifications add constraint notifications_type_check check (type in (%s))',
    v_list
  );
end $$;

