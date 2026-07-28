export const COURSE_OPTIONS = [
  { value: 'administracao', label: 'Técnico em Administração' },
  { value: 'agro', label: 'Técnico em Agropecuária' },
  { value: 'agronegocio', label: 'Técnico em Agronegócio' },
  { value: 'agricultura', label: 'Técnico em Agricultura' },
  { value: 'alimentos', label: 'Técnico em Alimentos' },
  { value: 'analises_clinicas', label: 'Técnico em Análises Clínicas' },
  { value: 'automacao_industrial', label: 'Técnico em Automação Industrial' },
  { value: 'contabilidade', label: 'Técnico em Contabilidade' },
  { value: 'desenvolvimento_sistemas', label: 'Técnico em Desenvolvimento de Sistemas' },
  { value: 'design_grafico', label: 'Técnico em Design Gráfico' },
  { value: 'edificacoes', label: 'Técnico em Edificações' },
  { value: 'eletromecanica', label: 'Técnico em Eletromecânica' },
  { value: 'eletrotecnica', label: 'Técnico em Eletrotécnica' },
  { value: 'enfermagem', label: 'Técnico em Enfermagem' },
  { value: 'estetica', label: 'Técnico em Estética' },
  { value: 'eventos', label: 'Técnico em Eventos' },
  { value: 'farmacia', label: 'Técnico em Farmácia' },
  { value: 'guia_turismo', label: 'Técnico em Guia de Turismo' },
  { value: 'hospedagem', label: 'Técnico em Hospedagem' },
  { value: 'informatica', label: 'Técnico em Informática' },
  { value: 'logistica', label: 'Técnico em Logística' },
  { value: 'manutencao_informatica', label: 'Técnico em Manutenção e Suporte em Informática' },
  { value: 'marketing', label: 'Técnico em Marketing' },
  { value: 'mecanica', label: 'Técnico em Mecânica' },
  { value: 'meio_ambiente', label: 'Técnico em Meio Ambiente' },
  { value: 'mineracao', label: 'Técnico em Mineração' },
  { value: 'multimidia', label: 'Técnico em Multimídia' },
  { value: 'nutricao_dietetica', label: 'Técnico em Nutrição e Dietética' },
  { value: 'programacao_jogos', label: 'Técnico em Programação de Jogos Digitais' },
  { value: 'quimica', label: 'Técnico em Química' },
  { value: 'radiologia', label: 'Técnico em Radiologia' },
  { value: 'recursos_humanos', label: 'Técnico em Recursos Humanos' },
  { value: 'redes_computadores', label: 'Técnico em Redes de Computadores' },
  { value: 'seguranca_trabalho', label: 'Técnico em Segurança do Trabalho' },
  { value: 'turismo', label: 'Técnico em Turismo' },
  { value: 'zootecnia', label: 'Técnico em Zootecnia' },
  { value: 'base_central', label: 'Base Central' },
  { value: 'outros', label: 'Outro curso técnico' },
]

export const COURSE_LABELS = COURSE_OPTIONS.reduce((mapa, item) => {
  mapa[item.value] = item.label
  return mapa
}, {})

export function normalizarCurso(valor) {
  if (!valor) return 'base_central'
  return COURSE_LABELS[valor] ? valor : 'base_central'
}

export function nomeCurso(valor) {
  return COURSE_LABELS[normalizarCurso(valor)] || 'Base Central'
}

export function traduzirErroAcademia(error, fallback) {
  const code = error?.code || ''
  const detalhe = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()

  if (detalhe.includes('acesso restrito ao admin do quiz')) {
    return 'Este recurso e apenas para administrador de quiz.'
  }

  if (detalhe.includes('questao de quiz não encontrada')) {
    return 'Não encontramos esta questao de quiz para atualizar.'
  }

  if (detalhe.includes('perfil alvo inválido')) {
    return 'Selecione um perfil valido para ajustar XP.'
  }

  if (detalhe.includes('informe um delta de xp diferente de zero')) {
    return 'Informe um valor de XP diferente de zero.'
  }

  if (detalhe.includes('ajuste maximo por operacao')) {
    return 'Ajuste muito alto. O limite por operacao e 5000 XP.'
  }

  if (
    code === '42P01' ||
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    code === '42883' ||
    code === '42703' ||
    detalhe.includes('learning_activities') ||
    detalhe.includes('xp_ledger') ||
    detalhe.includes('unit_grade_redemptions') ||
    detalhe.includes('chat_pet_') ||
    detalhe.includes('chat_pet_invitations') ||
    detalhe.includes('academy_') ||
    detalhe.includes('academy_quiz_admin_profiles') ||
    detalhe.includes('academy_teacher_') ||
    detalhe.includes('teacher_subject') ||
    detalhe.includes('teacher_school') ||
    detalhe.includes('teacher_registration') ||
    detalhe.includes('teacher_department') ||
    detalhe.includes('request_unit_redemption_with_teacher') ||
    detalhe.includes('course_area') ||
    detalhe.includes('xp_total') ||
    detalhe.includes('level')
  ) {
    return 'O sistema da Academia ainda não foi configurado no banco. Rode o SQL da Academia no Supabase.'
  }

  if (detalhe.includes('acesso restrito ao painel do professor')) {
    return 'Este recurso e exclusivo para perfis de professor.'
  }

  if (detalhe.includes('selecione o professor da materia')) {
    return 'Selecione o professor da materia antes da troca.'
  }

  if (detalhe.includes('professor selecionado não corresponde a materia informada')) {
    return 'O professor selecionado não corresponde a materia informada.'
  }

  if (detalhe.includes('troca não encontrada para este professor')) {
    return 'Não encontramos essa troca para o seu perfil de professor.'
  }

  if (detalhe.includes('esta troca ja foi revisada')) {
    return 'Esta troca ja foi revisada anteriormente.'
  }

  if (detalhe.includes('xp insuficiente')) {
    return 'XP insuficiente para esta troca.'
  }

  if (detalhe.includes('minimo 20 xp')) {
    return 'A troca minima e de 20 XP.'
  }

  if (detalhe.includes('ja existe convite pendente')) {
    return 'Ja existe um convite pendente para este chat.'
  }

  if (detalhe.includes('apenas o convidado pode responder')) {
    return 'Somente o convidado pode aceitar ou recusar este convite.'
  }

  if (detalhe.includes('seguidores mutuos')) {
    return 'Para criar pet em dupla, os dois perfis precisam se seguir.'
  }

  if (detalhe.includes('nexinho morreu por falta de conclusao até 23:00')) {
    return 'Nexinho morreu porque a dupla não concluiu o desafio até 23:00. Use uma restauracao mensal.'
  }

  if (detalhe.includes('limite mensal de 3 restauracoes atingido')) {
    return 'As 3 restauracoes mensais do Nexinho ja foram usadas.'
  }

  if (code === '42501' || detalhe.includes('row-level security')) {
    return 'O banco bloqueou o convite do pet por permissao. Rode novamente o SQL da Academia/Pet no Supabase.'
  }

  return fallback
}
