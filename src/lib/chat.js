import { supabase } from './supabase'

export const CHAT_UPDATED_EVENT = 'nexo-chat-updated'

export function ordenarIdsPerfil(profileIdA, profileIdB) {
  return profileIdA < profileIdB
    ? [profileIdA, profileIdB]
    : [profileIdB, profileIdA]
}

export function obterOutroPerfilId(conversa, meuPerfilId) {
  if (!conversa) return null

  return conversa.profile_one_id === meuPerfilId
    ? conversa.profile_two_id
    : conversa.profile_one_id
}

export function dispararAtualizacaoChat(detail = {}) {
  if (typeof window === 'undefined') return

  window.dispatchEvent(new CustomEvent(CHAT_UPDATED_EVENT, { detail }))
}

export function traduzirErroChat(error, fallback) {
  const code = error?.code || ''
  const mensagem = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()

  if (code === '42501' || mensagem.includes('row-level security')) {
    return 'O banco bloqueou o chat por permissao. Rode o SQL do chat novamente no Supabase.'
  }

  if (
    code === '42P01' ||
    code === 'PGRST205' ||
    mensagem.includes('chat_conversations') ||
    mensagem.includes('chat_messages')
  ) {
    return 'O chat ainda não foi configurado no banco. Rode o SQL do setup do chat.'
  }

  if (code === '23514' || mensagem.includes('chat_conversations_sorted')) {
    return 'A conversa foi bloqueada por uma regra antiga do banco. Atualize o SQL do chat e tente de novo.'
  }

  if (code === '42703' || mensagem.includes('media_url') || mensagem.includes('media_kind')) {
    return 'O chat de foto/video ainda não foi configurado no banco. Rode o SQL de midia do chat no Supabase.'
  }

  return fallback
}

export async function listarConversasDoPerfil(profileId) {
  const [conversationResult, hiddenResult] = await Promise.all([
    supabase.from('chat_conversations').select('*')
      .or(`profile_one_id.eq.${profileId},profile_two_id.eq.${profileId}`),
    supabase.from('chat_conversation_hidden').select('conversation_id').eq('profile_id', profileId),
  ])

  if (conversationResult.error) throw conversationResult.error
  if (hiddenResult.error) throw hiddenResult.error
  const hiddenIds = new Set((hiddenResult.data || []).map((item) => item.conversation_id))

  return (conversationResult.data || []).filter((item) => !hiddenIds.has(item.id)).sort((a, b) => {
    const dataA = new Date(a.last_message_at || a.updated_at || a.created_at).getTime()
    const dataB = new Date(b.last_message_at || b.updated_at || b.created_at).getTime()
    return dataB - dataA
  })
}

export async function contarMensagensNaoLidas(profileId, conversasExistentes = null) {
  const conversas = conversasExistentes || (await listarConversasDoPerfil(profileId))
  const idsConversas = conversas.map((conversa) => conversa.id)

  if (idsConversas.length === 0) {
    return {
      total: 0,
      porConversa: new Map(),
      conversas,
    }
  }

  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, conversation_id')
    .in('conversation_id', idsConversas)
    .neq('sender_profile_id', profileId)
    .is('read_at', null)

  if (error) throw error

  const porConversa = (data || []).reduce((mapa, mensagem) => {
    mapa.set(mensagem.conversation_id, (mapa.get(mensagem.conversation_id) || 0) + 1)
    return mapa
  }, new Map())

  return {
    total: (data || []).length,
    porConversa,
    conversas,
  }
}

export async function buscarConversaDireta(profileId, outroProfileId) {
  const [profileOneId, profileTwoId] = ordenarIdsPerfil(profileId, outroProfileId)

  const { data, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('profile_one_id', profileOneId)
    .eq('profile_two_id', profileTwoId)
    .limit(1)
    .maybeSingle()

  if (error) throw error

  if (data) return data

  const { data: reverseData, error: reverseError } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('profile_one_id', profileTwoId)
    .eq('profile_two_id', profileOneId)
    .limit(1)
    .maybeSingle()

  if (reverseError) throw reverseError

  return reverseData || null
}

export async function garantirConversaDireta(profileId, outroProfileId) {
  const existente = await buscarConversaDireta(profileId, outroProfileId)

  if (existente) return existente

  const ordemPrincipal = ordenarIdsPerfil(profileId, outroProfileId)
  const ordensPossiveis = [
    ordemPrincipal,
    [ordemPrincipal[1], ordemPrincipal[0]],
  ]

  let ultimoErro = null

  for (const [profileOneId, profileTwoId] of ordensPossiveis) {
    const { data, error } = await supabase
      .from('chat_conversations')
      .insert({
        profile_one_id: profileOneId,
        profile_two_id: profileTwoId,
      })
      .select('*')
      .single()

    if (!error) {
      return data
    }

    if (error.code === '23505') {
      const conversaCriadaEmParalelo = await buscarConversaDireta(profileId, outroProfileId)

      if (conversaCriadaEmParalelo) return conversaCriadaEmParalelo
    }

    ultimoErro = error

    if (error.code !== '23514' && !`${error?.message || ''}`.includes('chat_conversations_sorted')) {
      throw error
    }
  }

  throw ultimoErro
}

export async function marcarMensagensComoLidas(conversationId, profileId) {
  if (!conversationId || !profileId) return

  const { error } = await supabase
    .from('chat_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
    .neq('sender_profile_id', profileId)
    .is('read_at', null)

  if (error) throw error
}
