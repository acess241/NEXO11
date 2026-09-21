import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FILTERS = [['all','Todos'],['message','Mensagens'],['comment','Comentários'],['post','Posts'],['image','Fotos'],['video','Vídeos'],['report','Denúncias'],['warning','Advertências'],['suspension','Suspensões']]

export default function ModerationDashboard() {
  const navigate = useNavigate()
  const [allowed, setAllowed] = useState(null)
  const [filter, setFilter] = useState('all')
  const [items, setItems] = useState([])
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    const permission = await supabase.rpc('nexo_can_moderate')
    if (permission.error || !permission.data) { setAllowed(false); return }
    setAllowed(true)
    const { data, error: queryError } = await supabase.rpc('nexo_moderation_queue', { p_filter: filter, p_limit: 200 })
    if (queryError) { setError('Não foi possível carregar a fila de moderação.'); return }
    setItems(data || [])
    setSelected((current) => current ? (data || []).find((item) => item.case_id === current.case_id) || null : null)
  }, [filter])

  useEffect(() => { void load() }, [load])

  const stats = useMemo(() => ({
    pending: items.filter((item) => item.status === 'pending').length,
    removed: items.filter((item) => item.action_taken === 'removed').length,
    suspended: items.filter((item) => String(item.account_status || '').startsWith('suspended')).length,
  }), [items])

  async function act(action, durationHours = null) {
    if (!selected || busy) return
    setBusy(true); setError('')
    const { error: actionError } = await supabase.rpc('nexo_moderation_action', { p_case_id: selected.case_id, p_action: action, p_duration_hours: durationHours, p_notes: null })
    if (actionError) setError('A ação não pôde ser aplicada.')
    else await load()
    setBusy(false)
  }

  if (allowed === null) return <main className="moderation-dashboard"><p>Verificando permissões...</p></main>
  if (!allowed) return <main className="moderation-dashboard denied"><h1>Acesso restrito</h1><p>Somente administradores autorizados de moderação podem abrir esta área.</p><button onClick={() => navigate('/')}>Voltar ao NEXO</button></main>

  return <main className="moderation-dashboard">
    <header><button onClick={() => navigate(-1)} aria-label="Voltar">←</button><div><span>NEXO 11 · ADMINISTRAÇÃO</span><h1>Segurança e Moderação</h1></div></header>
    <section className="moderation-stats"><article><b>{items.length}</b><span>Ocorrências</span></article><article><b>{stats.pending}</b><span>Aguardando análise</span></article><article><b>{stats.removed}</b><span>Removidos</span></article><article><b>{stats.suspended}</b><span>Suspensos</span></article></section>
    <nav className="moderation-filters">{FILTERS.map(([value,label]) => <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>)}</nav>
    {error ? <div className="moderation-feedback error">{error}</div> : null}
    <div className="moderation-workspace"><section className="moderation-list">{items.length ? items.map((item) => <button key={item.case_id} className={selected?.case_id === item.case_id ? 'selected' : ''} onClick={() => setSelected(item)}><span className={`severity level-${item.severity}`}>Nível {item.severity}</span><strong>@{item.username || 'usuario'} · {item.content_type}</strong><small>{item.rule_code} · {new Date(item.created_at).toLocaleString('pt-BR')}</small><em>{item.status}</em></button>) : <div className="moderation-empty">Nenhuma ocorrência neste filtro.</div>}</section>
      <aside className="moderation-detail">{selected ? <><div className="moderation-kicker">OCORRÊNCIA</div><h2>@{selected.username || 'usuario'}</h2><dl><div><dt>Tipo</dt><dd>{selected.content_type}</dd></div><div><dt>Data e horário</dt><dd>{new Date(selected.created_at).toLocaleString('pt-BR')}</dd></div><div><dt>Regra possivelmente violada</dt><dd>{selected.rule_code}</dd></div><div><dt>Gravidade</dt><dd>Nível {selected.severity}</dd></div><div><dt>Ocorrências anteriores</dt><dd>{selected.previous_incidents || 0}</dd></div></dl>{selected.original_content ? <div className="moderation-evidence"><span>Conteúdo protegido</span><p>{selected.original_content}</p></div> : null}<div className="moderation-admin-actions"><button disabled={busy} onClick={() => act('allow')}>Considerar permitido</button><button disabled={busy} onClick={() => act('remove')}>Remover conteúdo</button><button disabled={busy} onClick={() => act('warn')}>Enviar advertência</button><button disabled={busy} onClick={() => act('remove_warning')}>Retirar advertência</button><button disabled={busy} onClick={() => act('suspend_temporary', 24)}>Suspender 24 horas</button><button disabled={busy} onClick={() => act('suspend_temporary', 168)}>Suspender 7 dias</button><button disabled={busy} onClick={() => act('suspend_permanent')}>Suspender conta</button><button disabled={busy} onClick={() => act('restore')}>Restaurar conta</button></div></> : <div className="moderation-empty">Selecione uma ocorrência.</div>}</aside>
    </div>
  </main>
}
