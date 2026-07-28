import { supabase } from './supabase'

function erroDeSchema(error) {
  const code = `${error?.code || ''}`.toLowerCase()
  const msg = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42p01' || code === 'pgrst205' || msg.includes('blocked_profiles')
}

export function traduzirErroBloqueio(error, fallback) {
  if (erroDeSchema(error)) {
    return 'Rode o SQL de bloqueios para liberar este recurso.'
  }
  return fallback
}

function idsUnicos(ids = []) {
  return [...new Set(ids.filter(Boolean))]
}

export async function estaBloqueadoPorMim(meuPerfilId, outroPerfilId) {
  if (!meuPerfilId || !outroPerfilId) return false

  let resposta = await supabase
    .from('blocked_profiles')
    .select('id')
    .eq('blocker_profile_id', meuPerfilId)
    .eq('blocked_profile_id', outroPerfilId)
    .limit(1)
    .maybeSingle()

  if (!resposta.error) return Boolean(resposta.data)

  resposta = await supabase
    .from('blocked_profiles')
    .select('id')
    .eq('profile_id', meuPerfilId)
    .eq('blocked_profile_id', outroPerfilId)
    .limit(1)
    .maybeSingle()

  if (resposta.error) throw resposta.error
  return Boolean(resposta.data)
}

export async function listarPerfisBloqueadosPorMim(meuPerfilId) {
  if (!meuPerfilId) return []

  let resposta = await supabase
    .from('blocked_profiles')
    .select('blocked_profile_id')
    .eq('blocker_profile_id', meuPerfilId)

  if (!resposta.error) {
    return idsUnicos((resposta.data || []).map((item) => item.blocked_profile_id))
  }

  resposta = await supabase
    .from('blocked_profiles')
    .select('blocked_profile_id')
    .eq('profile_id', meuPerfilId)

  if (resposta.error) throw resposta.error
  return idsUnicos((resposta.data || []).map((item) => item.blocked_profile_id))
}

export async function listarPerfisQueMeBloquearam(meuPerfilId) {
  if (!meuPerfilId) return []

  let resposta = await supabase
    .from('blocked_profiles')
    .select('blocker_profile_id')
    .eq('blocked_profile_id', meuPerfilId)

  if (!resposta.error) {
    return idsUnicos((resposta.data || []).map((item) => item.blocker_profile_id))
  }

  resposta = await supabase
    .from('blocked_profiles')
    .select('profile_id')
    .eq('blocked_profile_id', meuPerfilId)

  if (resposta.error) throw resposta.error
  return idsUnicos((resposta.data || []).map((item) => item.profile_id))
}

export async function listarPerfisComBloqueio(meuPerfilId) {
  if (!meuPerfilId) return []

  const [bloqueadosPorMim, meBloquearam] = await Promise.all([
    listarPerfisBloqueadosPorMim(meuPerfilId),
    listarPerfisQueMeBloquearam(meuPerfilId),
  ])

  return idsUnicos([...bloqueadosPorMim, ...meBloquearam])
}

export async function existeBloqueioEntrePerfis(profileIdA, profileIdB) {
  if (!profileIdA || !profileIdB || profileIdA === profileIdB) return false

  const [aBloqueiaB, bBloqueiaA] = await Promise.all([
    estaBloqueadoPorMim(profileIdA, profileIdB),
    estaBloqueadoPorMim(profileIdB, profileIdA),
  ])

  return Boolean(aBloqueiaB || bBloqueiaA)
}

export async function bloquearPerfil(meuPerfilId, outroPerfilId) {
  if (!meuPerfilId || !outroPerfilId || meuPerfilId === outroPerfilId) return

  let resposta = await supabase.from('blocked_profiles').insert({
    blocker_profile_id: meuPerfilId,
    blocked_profile_id: outroPerfilId,
  })

  if (!resposta.error) return

  const code = `${resposta.error?.code || ''}`.toLowerCase()
  if (code === '23505') return

  resposta = await supabase.from('blocked_profiles').insert({
    profile_id: meuPerfilId,
    blocked_profile_id: outroPerfilId,
  })

  if (resposta.error && `${resposta.error?.code || ''}`.toLowerCase() !== '23505') {
    throw resposta.error
  }
}

export async function desbloquearPerfil(meuPerfilId, outroPerfilId) {
  if (!meuPerfilId || !outroPerfilId) return

  let resposta = await supabase
    .from('blocked_profiles')
    .delete()
    .eq('blocker_profile_id', meuPerfilId)
    .eq('blocked_profile_id', outroPerfilId)

  if (!resposta.error) return

  resposta = await supabase
    .from('blocked_profiles')
    .delete()
    .eq('profile_id', meuPerfilId)
    .eq('blocked_profile_id', outroPerfilId)

  if (resposta.error) throw resposta.error
}
