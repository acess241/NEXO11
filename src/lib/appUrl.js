function normalizarBase(baseUrl = '/') {
  const base = `/${String(baseUrl || '/').replace(/^\/+|\/+$/g, '')}`
  return base === '/' ? '/' : `${base}/`
}

export function criarUrlDoApp(caminho, locationLike, baseUrl = '/') {
  const origin = locationLike?.origin || ''
  const base = normalizarBase(baseUrl)
  const rota = String(caminho || '').replace(/^\/+/, '')
  return `${origin}${base}${rota}`
}

export function obterUrlRecuperacao(locationLike, baseUrl = '/') {
  return criarUrlDoApp('reset-senha', locationLike, baseUrl)
}

export function restaurarRotaDoFallback(locationLike, historyLike, baseUrl = '/') {
  const params = new URLSearchParams(locationLike?.search || '')
  const rotaOriginal = params.get('__nexo_path')
  if (!rotaOriginal) return false

  const base = normalizarBase(baseUrl)
  const rotaSegura = `/${String(rotaOriginal).replace(/^\/+/, '')}`
  const destino = `${base.replace(/\/$/, '')}${rotaSegura}${locationLike?.hash || ''}`
  historyLike.replaceState({}, '', destino)
  return true
}
