import { supabase } from './supabase'

export const XP_STATUS = {
  pending: 'Aguardando aprovação',
  approved: 'Aprovada',
  ready: 'Pronta para retirada',
  delivered: 'Entregue',
  rejected: 'Recusada',
  cancelled: 'Cancelada',
}

export function xpError(error) {
  const text = error?.message || String(error || 'Não foi possível concluir a operação.')
  return text.replace(/^new row violates row-level security policy.*$/i, 'Você não possui permissão para esta operação.')
}

export async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data
}

export function availableXp(wallet) {
  return Math.max(0, Number(wallet?.total || 0) - Number(wallet?.reserved || 0))
}

export function rewardProgress(price, wallet) {
  const current = availableXp(wallet)
  const value = Math.max(1, Number(price || 0))
  return { percentage: Math.min(100, Math.round((current / value) * 100)), missing: Math.max(0, value - current) }
}

export function formatXp(value) {
  return `${Number(value || 0).toLocaleString('pt-BR')} XP`
}

export function exportCsv(rows, filename) {
  if (!rows?.length) return false
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))]
  const encode = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const content = [keys.map(encode), ...rows.map((row) => keys.map((key) => encode(row[key])))].map((line) => line.join(';')).join('\n')
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
  return true
}
