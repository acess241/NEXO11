import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AccountSafetyGate({ session }) {
  const [status, setStatus] = useState(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    let active = true
    if (!session?.user?.id) { setStatus(null); return undefined }
    supabase.rpc('nexo_my_safety_status').then(({ data }) => { if (active) setStatus(Array.isArray(data) ? data[0] : data) })
    return () => { active = false }
  }, [session?.user?.id])

  if (!status || status.status === 'active') return null
  const temporary = status.status === 'suspended_temporary'

  async function appeal() {
    const { error } = await supabase.rpc('nexo_request_suspension_review', { p_reason: 'Solicito revisão da suspensão aplicada à minha conta.' })
    if (!error) setSent(true)
  }

  return <div className="moderation-backdrop safety-gate"><section className="moderation-dialog" role="dialog" aria-modal="true">
    <div className="moderation-kicker">NEXO 11 · CONTA PROTEGIDA</div>
    <h2>Sua conta foi suspensa por violação das regras da comunidade.</h2>
    <p>{temporary && status.suspended_until ? `A suspensão termina em ${new Date(status.suspended_until).toLocaleString('pt-BR')}.` : 'A conta permanece registrada, mas o acesso ao NEXO 11 está temporariamente indisponível.'}</p>
    {sent ? <div className="moderation-feedback">Pedido de revisão enviado.</div> : <button type="button" onClick={appeal}>Solicitar revisão</button>}
  </section></div>
}
