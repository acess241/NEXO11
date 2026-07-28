const STORAGE_KEY = 'nexo_saved_accounts_v1'

function normalizarConta(raw = {}) {
  return {
    userId: `${raw.userId || ''}`.trim(),
    email: `${raw.email || ''}`.trim(),
    username: `${raw.username || ''}`.trim(),
    nome: `${raw.nome || ''}`.trim(),
    accessToken: `${raw.accessToken || ''}`.trim(),
    refreshToken: `${raw.refreshToken || ''}`.trim(),
    updatedAt: raw.updatedAt || new Date().toISOString(),
  }
}

export function listarContasSalvas() {
  if (typeof window === 'undefined') return []

  try {
    const bruto = window.localStorage.getItem(STORAGE_KEY)
    if (!bruto) return []

    const parsed = JSON.parse(bruto)
    if (!Array.isArray(parsed)) return []

    return parsed
      .map(normalizarConta)
      .filter((item) => item.userId && item.accessToken && item.refreshToken)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  } catch {
    return []
  }
}

function persistirContas(contas) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(contas))
}

export function removerContaSalva(userId) {
  const alvo = `${userId || ''}`.trim()
  if (!alvo) return listarContasSalvas()

  const lista = listarContasSalvas().filter((item) => item.userId !== alvo)
  persistirContas(lista)
  return lista
}

export function salvarContaDaSessao(session, perfil = null) {
  const userId = `${session?.user?.id || ''}`.trim()
  const accessToken = `${session?.access_token || ''}`.trim()
  const refreshToken = `${session?.refresh_token || ''}`.trim()

  if (!userId || !accessToken || !refreshToken) {
    return listarContasSalvas()
  }

  const conta = normalizarConta({
    userId,
    email: session.user?.email || '',
    username: perfil?.username || session.user?.user_metadata?.username || '',
    nome: perfil?.nome || session.user?.user_metadata?.nome || '',
    accessToken,
    refreshToken,
    updatedAt: new Date().toISOString(),
  })

  const listaAtual = listarContasSalvas().filter((item) => item.userId !== conta.userId)
  const listaNova = [conta, ...listaAtual].slice(0, 8)
  persistirContas(listaNova)
  return listaNova
}
