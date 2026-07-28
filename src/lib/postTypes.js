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

  return 'Escreva algo para acompanhar o video curto...'
}

export function tituloCurtoPorTipo(tipo) {
  const tipoNormalizado = normalizarTipoPost(tipo)

  if (tipoNormalizado === 'nota') return 'Nota'
  if (tipoNormalizado === 'foto') return 'Post'
  return 'Nexis'
}
