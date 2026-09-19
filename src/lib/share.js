function obterUrlBaseAplicacao() {
  const base = import.meta.env.BASE_URL || '/'
  return new URL(base, window.location.origin)
}

export function criarLinkPublicacao(id, tipo = 'post') {
  if (!id || typeof window === 'undefined') return ''

  const parametro = tipo === 'story' ? 'story' : tipo === 'nexis' ? 'nexis' : 'post'
  const url = obterUrlBaseAplicacao()
  url.searchParams.set(parametro, id)
  return url.toString()
}

async function prepararArquivoDeMidia(imageUrl, id) {
  if (!imageUrl || typeof fetch !== 'function' || typeof File === 'undefined') return null

  try {
    const resposta = await fetch(imageUrl, { mode: 'cors' })
    if (!resposta.ok) return null
    const blob = await resposta.blob()
    if (!blob.type.startsWith('image/')) return null

    const extensao = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
    return new File([blob], `nexo-publicacao-${id || 'imagem'}.${extensao}`, { type: blob.type })
  } catch {
    return null
  }
}

export async function compartilharPublicacao({
  id,
  tipo = 'post',
  title = 'Publicação no NEXO',
  text = 'Veja esta publicação no NEXO',
  imageUrl = '',
  onCopied,
} = {}) {
  const url = criarLinkPublicacao(id, tipo)
  if (!url) return { cancelled: true }

  const dados = { title, text, url }

  if (navigator.share) {
    const arquivo = await prepararArquivoDeMidia(imageUrl, id)
    if (arquivo && navigator.canShare?.({ files: [arquivo] })) {
      dados.files = [arquivo]
    }

    await navigator.share(dados)
    return { shared: true, url }
  }

  const textoCompleto = `${text}\n${url}`
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(textoCompleto)
  }
  onCopied?.()
  return { copied: true, url }
}
