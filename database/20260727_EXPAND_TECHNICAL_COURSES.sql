-- NEXO11 - ampliar cursos técnicos aceitos no perfil

begin;

alter table public.profiles
  drop constraint if exists profiles_course_area_check;

alter table public.profiles
  add constraint profiles_course_area_check
  check (course_area in (
    'administracao',
    'agro',
    'agronegocio',
    'agricultura',
    'alimentos',
    'analises_clinicas',
    'automacao_industrial',
    'contabilidade',
    'desenvolvimento_sistemas',
    'design_grafico',
    'edificacoes',
    'eletromecanica',
    'eletrotecnica',
    'enfermagem',
    'estetica',
    'eventos',
    'farmacia',
    'guia_turismo',
    'hospedagem',
    'informatica',
    'logistica',
    'manutencao_informatica',
    'marketing',
    'mecanica',
    'meio_ambiente',
    'mineracao',
    'multimidia',
    'nutricao_dietetica',
    'programacao_jogos',
    'quimica',
    'radiologia',
    'recursos_humanos',
    'redes_computadores',
    'seguranca_trabalho',
    'turismo',
    'zootecnia',
    'base_central',
    'outros'
  ));

commit;

notify pgrst, 'reload schema';

select 'Cursos técnicos liberados' as resultado;
