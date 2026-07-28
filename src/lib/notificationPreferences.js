import { supabase } from './supabase'

const STORAGE_PREFIX = 'nexo_notification_preferences_v1'

export const NOTIFICATION_PREFERENCE_FIELDS = [
  { key: 'follow', label: 'Novos seguidores' },
  { key: 'follow_request', label: 'Solicitações de seguir' },
  { key: 'message', label: 'Mensagens' },
  { key: 'comment', label: 'Comentários no post' },
  { key: 'reply', label: 'Respostas aos comentários' },
  { key: 'like_post', label: 'Curtidas em post' },
  { key: 'like_comment', label: 'Curtidas em comentário' },
  { key: 'repost', label: 'Reposts' },
  { key: 'story', label: 'Stories' },
  { key: 'xp_adjustment', label: 'Ajustes de XP' },
  { key: 'quiz_result', label: 'Resultado de quiz' },
]

export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze(
  NOTIFICATION_PREFERENCE_FIELDS.reduce((acc, item) => {
    acc[item.key] = true
    return acc
  }, {})
)

function chaveStorage(profileId) {
  return `${STORAGE_PREFIX}:${profileId}`
}

function toBoolean(value, fallback = true) {
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1' || value === 'true') return true
  if (value === 0 || value === '0' || value === 'false') return false
  return fallback
}

export function normalizarPreferenciasNotificacao(raw = {}) {
  return NOTIFICATION_PREFERENCE_FIELDS.reduce((acc, item) => {
    acc[item.key] = toBoolean(raw[item.key], DEFAULT_NOTIFICATION_PREFERENCES[item.key])
    return acc
  }, {})
}

function lerPreferenciasLocal(profileId) {
  if (typeof window === 'undefined' || !profileId) return null

  try {
    const bruto = window.localStorage.getItem(chaveStorage(profileId))
    if (!bruto) return null
    const parsed = JSON.parse(bruto)
    return normalizarPreferenciasNotificacao(parsed)
  } catch {
    return null
  }
}

function salvarPreferenciasLocal(profileId, preferences) {
  if (typeof window === 'undefined' || !profileId) return
  window.localStorage.setItem(chaveStorage(profileId), JSON.stringify(preferences))
}

export function salvarPreferenciasNotificacaoLocal(profileId, preferences) {
  const normalized = normalizarPreferenciasNotificacao(preferences)
  salvarPreferenciasLocal(profileId, normalized)
  return normalized
}

function inferirChavePorNotificacao(type, metadata = null) {
  const kind = `${metadata?.kind || ''}`.trim().toLowerCase()

  if (kind === 'quiz_result') return 'quiz_result'
  if (kind === 'xp_adjustment') return 'xp_adjustment'

  switch (`${type || ''}`.trim().toLowerCase()) {
    case 'follow':
      return 'follow'
    case 'follow_request':
      return 'follow_request'
    case 'message':
      return 'message'
    case 'comment':
      return 'comment'
    case 'reply':
      return 'reply'
    case 'like_post':
      return 'like_post'
    case 'like_comment':
      return 'like_comment'
    case 'repost':
      return 'repost'
    case 'story':
      return 'story'
    default:
      return null
  }
}

export async function carregarPreferenciasNotificacao(profileId) {
  const fallbackLocal = lerPreferenciasLocal(profileId)

  if (!profileId) {
    return {
      preferences: fallbackLocal || { ...DEFAULT_NOTIFICATION_PREFERENCES },
      source: fallbackLocal ? 'local' : 'default',
      dbEnabled: false,
    }
  }

  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('profile_id', profileId)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      const base = fallbackLocal || { ...DEFAULT_NOTIFICATION_PREFERENCES }
      const payload = {
        profile_id: profileId,
        ...base,
        updated_at: new Date().toISOString(),
      }

      const { error: insertError } = await supabase
        .from('notification_preferences')
        .upsert(payload, { onConflict: 'profile_id' })

      if (insertError) throw insertError

      salvarPreferenciasLocal(profileId, base)
      return { preferences: base, source: 'db', dbEnabled: true }
    }

    const normalized = normalizarPreferenciasNotificacao(data)
    salvarPreferenciasLocal(profileId, normalized)
    return { preferences: normalized, source: 'db', dbEnabled: true }
  } catch {
    const localOnly = fallbackLocal || { ...DEFAULT_NOTIFICATION_PREFERENCES }
    salvarPreferenciasLocal(profileId, localOnly)
    return { preferences: localOnly, source: 'local', dbEnabled: false }
  }
}

export async function salvarPreferenciasNotificacao(profileId, preferences) {
  const normalized = normalizarPreferenciasNotificacao(preferences)

  if (!profileId) {
    return { preferences: normalized, source: 'default', dbEnabled: false }
  }

  salvarPreferenciasLocal(profileId, normalized)

  try {
    const payload = {
      profile_id: profileId,
      ...normalized,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(payload, { onConflict: 'profile_id' })

    if (error) throw error
    return { preferences: normalized, source: 'db', dbEnabled: true }
  } catch {
    return { preferences: normalized, source: 'local', dbEnabled: false }
  }
}

export async function podeReceberNotificacao(profileId, type, metadata = null) {
  const key = inferirChavePorNotificacao(type, metadata)
  if (!key) return true

  const { preferences } = await carregarPreferenciasNotificacao(profileId)
  return preferences[key] !== false
}

export async function criarNotificacaoSePermitido({
  receiverProfileId,
  actorProfileId,
  type,
  metadata = null,
  xpDelta = null,
  xpReason = null,
}) {
  if (!receiverProfileId || !type) return { skipped: true }

  const permitido = await podeReceberNotificacao(receiverProfileId, type, metadata)
  if (!permitido) return { skipped: true }

  const payload = {
    receiver_profile_id: receiverProfileId,
    actor_profile_id: actorProfileId || null,
    type,
  }

  if (metadata) payload.metadata = metadata
  if (xpDelta !== null && xpDelta !== undefined) payload.xp_delta = xpDelta
  if (xpReason) payload.xp_reason = xpReason

  let tentativa = await supabase.from('notifications').insert(payload)
  if (!tentativa.error) return { skipped: false }

  const erroTxt = `${tentativa.error?.message || ''}`.toLowerCase()

  if (erroTxt.includes('metadata')) {
    const payloadSemMetadata = { ...payload }
    delete payloadSemMetadata.metadata
    tentativa = await supabase.from('notifications').insert(payloadSemMetadata)
    if (!tentativa.error) return { skipped: false }
  }

  if (erroTxt.includes('xp_delta') || erroTxt.includes('xp_reason')) {
    const payloadBasico = {
      receiver_profile_id: receiverProfileId,
      actor_profile_id: actorProfileId || null,
      type,
    }
    tentativa = await supabase.from('notifications').insert(payloadBasico)
    if (!tentativa.error) return { skipped: false }
  }

  return { skipped: false, error: tentativa.error }
}
