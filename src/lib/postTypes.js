export const POST_TYPE_META = {
  nota: {
    label: 'Notas',
    subtitle: 'twites',
    accept: '',
  },
  foto: {
    label: 'Posts',
    subtitle: 'fotos postadas',
    accept: 'image/*',
  },
  nexis: {
    label: 'Nexis',
    subtitle: 'videos curtos',
    accept: 'video/*',
  },
  talent: {
    label: 'Talento',
    subtitle: 'arte e criatividade',
    accept: 'image/*,video/*',
  },
}

export function normalizarTipoPost(valor) {
  return POST_TYPE_META[valor] ? valor : 'nota'
}

export function aceitarArquivoPorTipo(tipo) {
  return POST_TYPE_META[normalizarTipoPost(tipo)].accept
}

export function obterMediaKind(post) {
  if (post?.media_kind === 'image' || post?.media_kind === 'video') {
    return post.media_kind
  }

  const tipo = normalizarTipoPost(post?.post_type)

  if (tipo === 'foto') return 'image'
  if (tipo === 'nexis') return 'video'
  if (tipo === 'talent') return post?.media_kind || null

  return null
}

export function placeholderPorTipo(tipo) {
  const tipoNormalizado = normalizarTipoPost(tipo)

  if (tipoNormalizado === 'nota') {
    return 'Compartilhe uma ideia, opiniao ou atualizacao...'
  }

  if (tipoNormalizado === 'foto') {
    return 'Escreva uma legenda para a foto...'
  }

  if (tipoNormalizado === 'talent') return 'Conte a história por trás do seu talento...'

  return 'Escreva algo para acompanhar o video curto...'
}

export function tituloCurtoPorTipo(tipo) {
  const tipoNormalizado = normalizarTipoPost(tipo)

  if (tipoNormalizado === 'nota') return 'Nota'
  if (tipoNormalizado === 'foto') return 'Post'
  if (tipoNormalizado === 'nexis') return 'Nexis'
  return 'Talento'
}
