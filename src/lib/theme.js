export const THEME_STORAGE_KEY = 'nexo_theme'

export const THEME_OPTIONS = [
  { id: 'escuro', label: 'Escuro' },
  { id: 'claro', label: 'Claro' },
  { id: 'verde', label: 'Verde' },
]

export function normalizarTema(valor) {
  const tema = `${valor || ''}`.trim().toLowerCase()
  if (tema === 'claro' || tema === 'verde') return tema
  return 'escuro'
}

export function obterTemaSalvo() {
  if (typeof window === 'undefined') return 'escuro'
  const salvo = window.localStorage.getItem(THEME_STORAGE_KEY)
  return normalizarTema(salvo)
}

export function aplicarTema(temaEntrada) {
  const tema = normalizarTema(temaEntrada)

  if (typeof document !== 'undefined') {
    document.body.setAttribute('data-theme', tema)
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(THEME_STORAGE_KEY, tema)
  }

  return tema
}
