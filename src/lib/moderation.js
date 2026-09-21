import { supabase } from './supabase'
import { analyzeText } from './moderationRules'
export { analyzeText, normalizeModerationText } from './moderationRules'

export const REPORT_REASONS = [
  ['bullying_harassment', 'Bullying ou assédio'],
  ['hate_speech', 'Discurso de ódio'],
  ['threat', 'Ameaça'],
  ['sexual', 'Conteúdo sexual'],
  ['violence', 'Violência'],
  ['spam', 'Spam'],
  ['personal_data', 'Informações pessoais'],
  ['fake_account', 'Conta falsa'],
  ['other', 'Outro'],
]


export function moderationMessage(result, contentType = 'conteúdo') {
  if (result?.decision === 'edit') return 'Esse conteúdo pode conter linguagem inadequada. Edite antes de enviar.'
  if (contentType === 'comment') return 'Seu comentário não foi publicado. Revise o conteúdo e tente novamente.'
  if (contentType === 'message') return 'Sua mensagem não foi enviada porque pode violar as regras da comunidade do NEXO 11.'
  return 'Esta publicação não pôde ser enviada porque pode violar as regras da comunidade do NEXO 11.'
}

export async function registerModerationEvent({ contentType, contentId = null, text, result, metadata = {} }) {
  if (!result || result.decision === 'allow' || result.decision === 'edit') return null
  const { data, error } = await supabase.rpc('nexo_register_moderation_event', {
    p_content_type: contentType,
    p_content_id: contentId,
    p_original_content: String(text || ''),
    p_rule_code: result.category || 'other',
    p_severity: Number(result.level || 2),
    p_confidence: Number(result.confidence || 0.5),
    p_metadata: metadata,
  })
  if (error && !['42883', 'PGRST202'].includes(error.code)) throw error
  return data
}

export async function moderateBeforeSend(input) {
  const result = analyzeText(input.text, { recentTexts: input.recentTexts || [] })
  if (result.decision === 'block' || result.decision === 'review') {
    await registerModerationEvent({ ...input, result })
  }
  return result
}

export async function createReport({ targetType, targetId, reportedProfileId, reason, details = '' }) {
  const { data, error } = await supabase.rpc('nexo_create_report', {
    p_target_type: targetType,
    p_target_id: targetId || null,
    p_reported_profile_id: reportedProfileId || null,
    p_reason: reason,
    p_details: details.trim() || null,
  })
  if (error) throw error
  return data
}

export function openReportDialog(payload) {
  window.dispatchEvent(new CustomEvent('nexo:open-report', { detail: payload }))
}
