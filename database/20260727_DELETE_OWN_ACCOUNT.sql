-- NEXO11 - permitir que cada usuário apague somente a própria conta.

create or replace function public.nexo_delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado';
  end if;

  -- A ordem respeita a estrutura real auth.users -> accounts -> profiles.
  delete from public.profiles where account_id = v_user_id;
  delete from public.accounts where id = v_user_id;
  delete from auth.users where id = v_user_id;
end;
$$;

revoke all on function public.nexo_delete_my_account() from public;
grant execute on function public.nexo_delete_my_account() to authenticated;

notify pgrst, 'reload schema';

select 'Função de apagar conta instalada' as resultado;
