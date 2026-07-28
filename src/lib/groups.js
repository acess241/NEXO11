import { supabase } from './supabase'

export const GROUPS_UPDATED_EVENT = 'nexo-groups-updated'

export function notifyGroupsUpdated() {
  window.dispatchEvent(new CustomEvent(GROUPS_UPDATED_EVENT))
}

export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sessão encerrada')
  const { data, error } = await supabase.from('profiles').select('*').eq('account_id', user.id).single()
  if (error) throw error
  return data
}

export async function listMyGroups(profileId) {
  const { data: memberships, error } = await supabase
    .from('nexo_group_members').select('group_id,role,muted_until,joined_at')
    .eq('profile_id', profileId).eq('status', 'active')
  if (error) throw error
  const ids = (memberships || []).map((item) => item.group_id)
  if (!ids.length) return []
  const { data: groups, error: groupError } = await supabase.from('nexo_groups').select('*').in('id', ids)
  if (groupError) throw groupError
  const roleById = new Map(memberships.map((item) => [item.group_id, item]))
  return (groups || []).map((group) => ({ ...group, membership: roleById.get(group.id) }))
    .sort((a, b) => new Date(b.last_message_at || b.updated_at) - new Date(a.last_message_at || a.updated_at))
}

export async function listPendingInvites(profileId) {
  const { data, error } = await supabase.from('nexo_group_invites')
    .select('*, group:nexo_groups(*)').eq('invitee_profile_id', profileId).eq('status', 'pending')
  if (error) throw error
  return data || []
}

export async function createGroup(name, description, memberIds) {
  const { data, error } = await supabase.rpc('nexo_create_group', {
    p_name: name, p_description: description, p_member_ids: memberIds,
  })
  if (error) throw error
  notifyGroupsUpdated()
  return data
}

export async function listGroupMembers(groupId) {
  const { data, error } = await supabase.from('nexo_group_members')
    .select('*, profile:profiles!nexo_group_members_profile_id_fkey(id,nome,username,foto_url,role)')
    .eq('group_id', groupId)
    .eq('status', 'active')
  if (error) throw error
  return data || []
}

export async function getGroup(groupId) {
  const { data, error } = await supabase.from('nexo_groups').select('*').eq('id', groupId).single()
  if (error) throw error
  return data
}

export function friendlyGroupError(error) {
  const message = `${error?.message || ''}`
  const details = `${error?.details || ''}`.trim()
  const hint = `${error?.hint || ''}`.trim()
  const technical = [error?.code, message, details, hint].filter(Boolean).join(' — ')

  if (message.includes('permission') || error?.code === '42501') {
    return `Você não tem permissão para realizar esta ação.${technical ? ` Detalhe: ${technical}` : ''}`
  }

  if (
    error?.code === '42P01' ||
    error?.code === 'PGRST202' ||
    error?.code === 'PGRST205' ||
    message.includes('nexo_group')
  ) {
    return `Falha ao acessar os grupos no Supabase. Detalhe: ${technical || 'erro desconhecido'}`
  }

  return technical || 'Não foi possível concluir a ação.'
}
