const STORY_REPOST_PREFIX = 'nexo-repost:v1:'

function normalizarRepost(repost) {
  if (!repost?.id) return null

  return {
    id: `${repost.id}`,
    tipo: repost.tipo === 'nexis' ? 'nexis' : repost.tipo === 'nota' ? 'nota' : 'foto',
    conteudo: `${repost.conteudo || ''}`,
    autorNome: `${repost.autorNome || 'Usuário'}`,
    autorUsername: `${repost.autorUsername || 'usuario'}`,
    autorFoto: `${repost.autorFoto || ''}`,
  }
}

/**
 * Guarda a origem de um post compartilhado sem exigir uma nova coluna no banco.
 * O marcador fica fora da legenda que o usuário vê no story.
 */
export function serializarLegendaStory(caption, repost) {
  const texto = `${caption || ''}`.trim()
  const origem = normalizarRepost(repost)
  if (!origem) return texto

  const payload = encodeURIComponent(JSON.stringify(origem))
  return `${STORY_REPOST_PREFIX}${payload}${texto ? `\n${texto}` : ''}`
}

export function lerLegendaStory(valor) {
  const texto = `${valor || ''}`
  if (!texto.startsWith(STORY_REPOST_PREFIX)) {
    return { caption: texto, repost: null }
  }

  const [linhaOrigem = '', ...linhasLegenda] = texto.split('\n')
  try {
    const origem = normalizarRepost(JSON.parse(decodeURIComponent(linhaOrigem.slice(STORY_REPOST_PREFIX.length))))
    return { caption: linhasLegenda.join('\n'), repost: origem }
  } catch {
    return { caption: texto, repost: null }
  }
}

