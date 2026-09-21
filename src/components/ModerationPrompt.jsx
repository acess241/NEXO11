export default function ModerationPrompt({ result, contentType, onEdit, onCancel }) {
  if (!result || result.decision === 'allow') return null
  const light = result.decision === 'edit'
  return <div className="moderation-inline" role="alert">
    <strong>{light ? 'Revise antes de enviar' : 'Conteúdo bloqueado pelo sistema de segurança'}</strong>
    <p>{light ? 'Esse conteúdo pode conter linguagem inadequada. Deseja editar antes de enviar?' : contentType === 'comment' ? 'Seu comentário não foi publicado. Revise o conteúdo e tente novamente.' : contentType === 'message' ? 'Sua mensagem não foi enviada porque pode violar as regras da comunidade do NEXO 11.' : 'Esta publicação não pôde ser enviada porque pode violar as regras da comunidade do NEXO 11.'}</p>
    <div className="moderation-actions"><button type="button" onClick={onEdit}>Editar {contentType === 'message' ? 'mensagem' : 'conteúdo'}</button><button type="button" className="secondary" onClick={onCancel}>Cancelar</button></div>
  </div>
}
