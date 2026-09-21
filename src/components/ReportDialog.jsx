import { useEffect, useState } from 'react'
import { createReport, REPORT_REASONS } from '../lib/moderation'

export default function ReportDialog() {
  const [target, setTarget] = useState(null)
  const [reason, setReason] = useState('bullying_harassment')
  const [details, setDetails] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const open = (event) => {
      setTarget(event.detail || null)
      setReason('bullying_harassment')
      setDetails('')
      setMessage('')
    }
    window.addEventListener('nexo:open-report', open)
    return () => window.removeEventListener('nexo:open-report', open)
  }, [])

  if (!target) return null

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await createReport({ ...target, reason, details })
      setMessage('Obrigado pela denúncia. Nossa equipe irá analisar o conteúdo.')
      window.setTimeout(() => setTarget(null), 1800)
    } catch {
      setMessage('Não foi possível registrar a denúncia agora. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="moderation-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setTarget(null)}>
    <section className="moderation-dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
      <div className="moderation-kicker">NEXO 11 · SEGURANÇA</div>
      <h2 id="report-title">Denunciar {target.label || 'conteúdo'}</h2>
      <p>A pessoa denunciada não saberá quem enviou a denúncia.</p>
      <form onSubmit={submit}>
        <label>Motivo<select value={reason} onChange={(event) => setReason(event.target.value)}>{REPORT_REASONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Conte mais, se quiser<textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={1000} /></label>
        {message ? <div className="moderation-feedback" role="status">{message}</div> : null}
        <div className="moderation-actions"><button type="button" className="secondary" onClick={() => setTarget(null)}>Cancelar</button><button type="submit" disabled={saving}>{saving ? 'Enviando...' : 'Enviar denúncia'}</button></div>
      </form>
    </section>
  </div>
}
