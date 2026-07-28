import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import { rpc, xpError } from '../lib/xpCenter'

function formatDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }) : '—'
}

export default function ActivityLink() {
  const { shareToken } = useParams()
  const navigate = useNavigate()
  const [payload, setPayload] = useState(null)
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState(null)

  async function load() {
    setLoading(true)
    try {
      setPayload(await rpc('xp_activity_by_link', { p_share_token: shareToken }))
    } catch (error) {
      setMessage({ error: true, text: xpError(error) })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [shareToken])

  async function submit(event) {
    event.preventDefault()
    setSending(true)
    setMessage(null)
    try {
      await rpc('xp_submit_activity_link', { p_share_token: shareToken, p_content: answer, p_attachment_url: null })
      setAnswer('')
      setMessage({ text: 'Atividade entregue ao professor com sucesso.' })
      await load()
    } catch (error) {
      setMessage({ error: true, text: xpError(error) })
    } finally {
      setSending(false)
    }
  }

  if (loading) return <SocialLoader label="Abrindo atividade..." />
  const activity = payload?.activity

  return <main className="activity-link-page">
    <header><button onClick={() => navigate('/academia/xp')} aria-label="Voltar">‹</button><div><span>ATIVIDADE COMPARTILHADA</span><h1>{activity?.title || 'Atividade'}</h1></div></header>
    <section className="activity-link-shell">
      {message && <div className={`xpc-notice ${message.error ? 'error' : ''}`}>{message.text}</div>}
      {!activity ? <div className="xpc-empty"><strong>Atividade indisponível</strong><span>Confira o link recebido do professor.</span></div> :
        <><article className="activity-link-summary"><div><span>{payload.classroom?.subject}</span><h2>{activity.title}</h2><p>{activity.description}</p></div><strong>{activity.max_xp} XP</strong>
          <dl><div><dt>Turma</dt><dd>{payload.classroom?.name}</dd></div><div><dt>Prazo</dt><dd>{formatDate(activity.deadline_at)}</dd></div><div><dt>Entrega atrasada</dt><dd>{activity.late_policy === 'reject' ? 'Não aceita' : activity.late_policy === 'minus_10' ? 'Redução de 10%' : activity.late_policy === 'minus_25' ? 'Redução de 25%' : 'Sem redução'}</dd></div></dl>
          {activity.attachment_url && <a className="activity-download" href={activity.attachment_url} target="_blank" rel="noreferrer">Baixar arquivo enviado pelo professor</a>}
          {activity.instructions && <aside><strong>Orientações do professor</strong><p>{activity.instructions}</p></aside>}</article>
        {!payload.is_teacher && <form className="activity-link-answer" onSubmit={submit}><h2>{payload.last_submission ? 'Enviar nova versão' : 'Fazer entrega'}</h2>
          {payload.last_submission && <p className="activity-last-submission">Última entrega: {formatDate(payload.last_submission.submitted_at)}.</p>}
          <label>Sua resposta<textarea required value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Escreva sua resposta ou cole o link do arquivo..." /></label>
          <button className="xpc-primary" disabled={sending || !answer.trim()}>{sending ? 'Enviando atividade...' : 'Entregar ao professor'}</button>
        </form>}</>}
    </section>
    <BottomNav />
  </main>
}
