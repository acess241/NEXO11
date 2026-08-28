import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import { supabase } from '../lib/supabase'
import { availableXp, exportCsv, formatXp, rewardProgress, rpc, XP_STATUS, xpError } from '../lib/xpCenter'
import { nomeCurso } from '../lib/academy'

const ICONS = { dashboard: 'dashboard', activities: 'book', rewards: 'gift', requests: 'clock', history: 'history', manage: 'settings' }
const TYPES = { digital: 'Digital', physical: 'Física', event: 'Evento', school_benefit: 'Benefício escolar', custom: 'Personalizada' }

const ICON_PATHS = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
  gift: <><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M7.5 8C4 8 4 3 7 3c2.5 0 5 5 5 5M16.5 8C20 8 20 3 17 3c-2.5 0-5 5-5 5"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 15a2 2 0 0 0 1 2l-3 3a2 2 0 0 0-2-1 2 2 0 0 0-1 2h-4a2 2 0 0 0-1-2 2 2 0 0 0-2 1l-3-3a2 2 0 0 0 1-2 2 2 0 0 0-2-1v-4a2 2 0 0 0 2-1 2 2 0 0 0-1-2l3-3a2 2 0 0 0 2 1 2 2 0 0 0 1-2h4a2 2 0 0 0 1 2 2 2 0 0 0 2-1l3 3a2 2 0 0 0-1 2 2 2 0 0 0 2 1v4a2 2 0 0 0-2 1Z"/></>,
  trophy: <><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 6H4v2a4 4 0 0 0 4 4M17 6h3v2a4 4 0 0 1-4 4"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  chevron: <path d="m15 18-6-6 6-6"/>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></>,
  trend: <><path d="m3 17 6-6 4 4 8-9"/><path d="M15 6h6v6"/></>,
  empty: <><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/></>,
}

function Icon({ name, size = 20 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICON_PATHS[name] || ICON_PATHS.empty}</svg>
}

function date(value) {
  return value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'
}

function Empty({ icon = 'empty', title, text }) {
  return <div className="xpc-empty"><i><Icon name={ICON_PATHS[icon] ? icon : 'empty'} size={30}/></i><strong>{title}</strong><span>{text}</span></div>
}

function getStudentProgress(profile, data) {
  const totalXp = Math.max(0, Number(profile?.xp_total || 0), Number(data?.wallet?.total || 0))
  const calculatedLevel = Math.floor(totalXp / 250) + 1
  const level = Math.max(1, Number(profile?.level || 1), calculatedLevel)
  const levelStart = (level - 1) * 250
  const nextLevelXp = level * 250
  const earnedInLevel = Math.max(0, totalXp - levelStart)
  const neededInLevel = Math.max(1, nextLevelXp - levelStart)
  const percentage = Math.min(100, Math.round((earnedInLevel / neededInLevel) * 100))
  return { totalXp, level, nextLevelXp, missing: Math.max(0, nextLevelXp - totalXp), percentage }
}

function getWeeklyStreak(transactions = []) {
  const activeDates = new Set(transactions.filter((item) => Number(item.amount) > 0).map((item) => new Date(item.created_at).toLocaleDateString('en-CA')))
  let streak = 0
  const cursor = new Date()
  for (let index = 0; index < 7; index += 1) {
    const key = cursor.toLocaleDateString('en-CA')
    if (activeDates.has(key)) streak += 1
    else if (index > 0 || activeDates.size > 0) break
    cursor.setDate(cursor.getDate() - 1)
  }
  return { streak, activeDays: [...activeDates].filter((key) => (Date.now() - new Date(`${key}T12:00:00`).getTime()) <= 7 * 86400000).length }
}

function Modal({ title, description, children, onClose, className = '' }) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', closeOnEscape)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', closeOnEscape) }
  }, [onClose])
  return createPortal(<div className="xpc-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className={`xpc-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby="xpc-modal-title"><header><div><h2 id="xpc-modal-title">{title}</h2>{description && <p>{description}</p>}</div><button type="button" onClick={onClose} aria-label="Fechar"><Icon name="close"/></button></header>{children}</section>
  </div>, document.body)
}

export default function XpCenter() {
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [data, setData] = useState(null)
  const [staff, setStaff] = useState(null)
  const [tab, setTab] = useState('dashboard')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)
  const [modal, setModal] = useState(null)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [ranking, setRanking] = useState([])

  const isStaff = ['teacher', 'professor', 'admin', 'school_admin', 'coordinator'].includes(profile?.role)
  const isTeacher = ['teacher', 'professor'].includes(profile?.role)
  const isAdmin = ['admin', 'school_admin', 'coordinator'].includes(profile?.role)

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) throw new Error('Sessão expirada.')
      const { data: current, error } = await supabase.from('profiles').select('*').eq('account_id', auth.user.id).single()
      if (error) throw error
      setProfile(current)
      const dashboard = await rpc('xp_dashboard')
      setData(dashboard)
      if (!['teacher', 'professor', 'admin', 'school_admin', 'coordinator'].includes(current.role)) {
        try {
          let rankingQuery = supabase.from('profiles').select('id, nome, username, foto_url, xp_total, level, course_area').eq('role', 'student').eq('course_area', current.course_area || 'base_central').order('xp_total', { ascending: false }).limit(8)
          if (current.institution_id) rankingQuery = rankingQuery.eq('institution_id', current.institution_id)
          else if (current.institution_name) rankingQuery = rankingQuery.eq('institution_name', current.institution_name)
          const { data: rankingRows, error: rankingError } = await rankingQuery
          if (rankingError) throw rankingError
          setRanking(rankingRows || [])
        } catch (rankingError) {
          console.warn('[XP_CLASS_RANKING]', rankingError?.message || rankingError)
          setRanking([])
        }
      } else setRanking([])
      if (['teacher', 'professor', 'admin', 'school_admin', 'coordinator'].includes(current.role)) setStaff(await rpc('xp_staff_dashboard'))
    } catch (error) {
      setNotice({ error: true, text: xpError(error) })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function run(key, fn, success) {
    setBusy(key)
    setNotice(null)
    try {
      await fn()
      setNotice({ text: success })
      setModal(null)
      await load()
    } catch (error) {
      setNotice({ error: true, text: xpError(error) })
    } finally {
      setBusy('')
    }
  }

  const activities = data?.activities || []
  const filteredTransactions = useMemo(() => (data?.transactions || []).filter((item) => {
    const matchesType = filter === 'all' || item.transaction_type === filter || item.origin_type === filter
    return matchesType && `${item.reason} ${item.origin_type}`.toLowerCase().includes(query.toLowerCase())
  }), [data, filter, query])

  if (loading) return <SocialLoader label="Carregando sua central de XP..." />

  const tabs = [
    ['dashboard', 'Visão geral'], ['activities', isStaff ? 'Atividades e correções' : 'Atividades'],
    ['rewards', 'Troca de XP'], ['requests', 'Solicitações'], ['history', 'Histórico'],
    ...(isStaff ? [['manage', 'Gestão']] : []),
  ]

  return <main className={`xpc-page ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
    <header className="xpc-topbar">
      <button className="xpc-mobile-menu" onClick={() => setSidebarOpen(true)} aria-label="Abrir menu"><Icon name="menu"/></button>
      <button className="xpc-back" onClick={() => navigate('/academia')} aria-label="Voltar para a Academia"><Icon name="chevron"/></button>
      <div className="xpc-heading"><span>CENTRAL ACADÊMICA</span><h1>XP & Recompensas</h1><p>{isStaff ? 'Crie atividades, acompanhe o XP dos alunos e gerencie as recompensas da escola.' : 'Complete atividades, acumule XP e conquiste recompensas oferecidas pela sua escola.'}</p></div>
      <div className="xpc-header-wallet" aria-label={`Saldo disponível: ${formatXp(availableXp(data?.wallet))}`}><span>Saldo disponível</span><strong>{formatXp(availableXp(data?.wallet))}</strong><small>Total: {formatXp(data?.wallet?.total)} · Reservado: {formatXp(data?.wallet?.reserved)}</small></div>
      <button className="xpc-refresh" onClick={load} aria-label="Atualizar dados"><Icon name="refresh"/></button>
    </header>

    <div className="xpc-layout">
      {sidebarOpen && <button className="xpc-sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-label="Fechar menu"/>}
      <aside className={`xpc-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <button className="xpc-sidebar-toggle" onClick={() => setSidebarCollapsed((value) => !value)} aria-label={sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'}><Icon name="chevron"/></button>
        <div className="xpc-wallet"><span>Saldo disponível</span><strong>{formatXp(availableXp(data?.wallet))}</strong>
          {!!data?.wallet?.reserved && <small>{formatXp(data.wallet.reserved)} reservados</small>}</div>
        <nav role="tablist" aria-label="Seções da central">{tabs.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => { setTab(key); setSidebarOpen(false) }}>
          <i><Icon name={ICONS[key]}/></i><span>{label}</span>
        </button>)}</nav>
      </aside>

      <section className="xpc-content">
        {notice && <div className={`xpc-notice ${notice.error ? 'error' : ''}`}>{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}

        {tab === 'dashboard' && <Dashboard data={data} profile={profile} ranking={ranking} isStaff={isStaff} setTab={setTab} />}
        {tab === 'activities' && (isStaff
          ? <StaffActivities staff={staff} canCreate={isTeacher} busy={busy} setModal={setModal} run={run} />
          : <StudentActivities activities={activities} busy={busy} run={run} />)}
        {tab === 'rewards' && (
          <DevelopmentArea
            title="Oops! Esta área ainda está em desenvolvimento."
            text="Logo, logo você poderá trocar seu XP por recompensas!"
            onBack={() => setTab('dashboard')}
          />
        )}
        {tab === 'requests' && <Requests data={data} staff={staff} isStaff={isStaff} busy={busy} setModal={setModal} run={run} />}
        {tab === 'history' && <History rows={filteredTransactions} filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} />}
        {tab === 'manage' && isStaff && <Management staff={staff} isAdmin={isAdmin} setModal={setModal} />}
      </section>
    </div>

    {modal?.type === 'activity' && <ActivityForm busy={busy} onClose={() => setModal(null)}
      onSave={(form) => run('activity', () => rpc('xp_create_link_activity', form), 'Atividade publicada. Copie o link no card e envie aos alunos.')} />}
    {modal?.type === 'grade' && <GradeForm item={modal.item} busy={busy} onClose={() => setModal(null)}
      onSave={(form) => run('grade', () => rpc('xp_grade_submission', { p_submission_id: modal.item.id, ...form }), 'Correção salva e XP atualizado.')} />}
    {modal?.type === 'reward' && <RewardForm item={modal.item} busy={busy} onClose={() => setModal(null)}
      onSave={(form) => run('reward', () => rpc('xp_save_reward', form), 'Recompensa salva.')} />}
    {modal?.type === 'confirmReward' && <ConfirmReward item={modal.item} wallet={data.wallet} busy={busy} onClose={() => setModal(null)}
      onConfirm={() => run('request', () => rpc('xp_request_reward', { p_reward_id: modal.item.id }), 'Solicitação enviada e XP reservado.')} />}
    {modal?.type === 'review' && <ReviewRequest item={modal.item} busy={busy} onClose={() => setModal(null)}
      onReview={(approve, reason) => run('review', () => rpc('xp_review_reward_request', { p_request_id: modal.item.id, p_approve: approve, p_reason: reason }), approve ? 'Solicitação aprovada.' : 'Solicitação recusada.')} />}
    {modal?.type === 'adjust' && <AdjustXp students={staff?.students || []} busy={busy} onClose={() => setModal(null)}
      onSave={(student, amount, reason) => run('adjust', () => rpc('xp_admin_adjust', { p_student_id: student, p_amount: amount, p_reason: reason }), 'Ajuste registrado no histórico.')} />}
    <BottomNav />
  </main>
}

function Dashboard({ data, profile, ranking, isStaff, setTab }) {
  const recent = data?.transactions?.[0]
  const pending = (data?.requests || []).filter((r) => ['pending', 'approved', 'ready'].includes(r.status)).length
  const progress = getStudentProgress(profile, data)
  const weekly = getWeeklyStreak(data?.transactions || [])
  const achievements = [
    { icon: '✦', title: 'Primeiros passos', text: 'Conquistou seu primeiro XP', unlocked: progress.totalXp > 0 },
    { icon: '⚡', title: 'Ritmo de estudo', text: 'Ativo em 3 dias da semana', unlocked: weekly.activeDays >= 3 },
    { icon: '◆', title: '500 XP', text: 'Acumulou 500 XP no NEXO', unlocked: progress.totalXp >= 500 },
    { icon: '★', title: 'Nível 5', text: 'Chegou ao nível 5', unlocked: progress.level >= 5 },
  ]
  return <>
    <div className="xpc-hero xpc-level-hero"><div className="xpc-level-copy"><span>Olá, {profile?.nome?.split(' ')[0]}</span><h2>{isStaff ? 'Transforme esforço em reconhecimento.' : `Nível ${progress.level} — continue avançando.`}</h2>
      <p>{isStaff ? 'Crie oportunidades, acompanhe a evolução e valorize cada conquista dos alunos.' : 'Cada atividade concluída fortalece sua jornada acadêmica.'}</p>
      {!isStaff && <div className="xpc-level-progress"><div className="xpc-level-progress-label"><strong>{progress.totalXp.toLocaleString('pt-BR')} / {progress.nextLevelXp.toLocaleString('pt-BR')} XP</strong><span>{progress.missing > 0 ? `+${progress.missing} XP para o próximo nível` : 'Novo nível alcançado!'}</span></div><div className="xpc-level-progress-track"><span style={{ width: `${progress.percentage}%` }}/></div></div>}
      </div><div className="xpc-orb"><small>{isStaff ? 'XP GERENCIADO' : 'NÍVEL ATUAL'}</small><strong>{isStaff ? formatXp(data?.wallet?.total) : progress.level}</strong>{!isStaff && <span>{progress.percentage}%</span>}</div></div>

    {!isStaff && <div className="xpc-academic-pulse"><article><span>Sequência semanal</span><strong>🔥 {weekly.streak} dia{weekly.streak === 1 ? '' : 's'}</strong><small>{weekly.activeDays}/7 dias com ganho de XP</small></article><article><span>Curso</span><strong>{nomeCurso(profile?.course_area)}</strong><small>Sua comunidade acadêmica</small></article><article><span>Próxima conquista</span><strong>{progress.totalXp < 500 ? '500 XP' : progress.level < 5 ? 'Nível 5' : 'Consistência'}</strong><small>Continue concluindo atividades</small></article></div>}

    <div className="xpc-stats"><article><span>Saldo disponível</span><strong>{formatXp(availableXp(data?.wallet))}</strong><small>XP que pode ser usado agora</small></article>
      <article><span>XP reservado</span><strong>{formatXp(data?.wallet?.reserved)}</strong><small>Em solicitações pendentes</small></article>
      <article><span>Solicitações ativas</span><strong>{pending}</strong><small>Acompanhe cada etapa</small></article>
    </div>

    {!isStaff && <><div className="xpc-section-head"><div><span>CONQUISTAS</span><h2>Sua coleção acadêmica</h2></div><small>{achievements.filter((item) => item.unlocked).length}/{achievements.length} desbloqueadas</small></div><div className="xpc-achievements">{achievements.map((item) => <article key={item.title} className={item.unlocked ? 'unlocked' : 'locked'}><i>{item.icon}</i><div><strong>{item.title}</strong><span>{item.text}</span></div><b>{item.unlocked ? '✓' : '🔒'}</b></article>)}</div></>}

    {!isStaff && <><div className="xpc-section-head"><div><span>DA SUA INSTITUIÇÃO</span><h2>Ranking do curso</h2><p>{nomeCurso(profile?.course_area)} · classificação por XP total</p></div></div><div className="xpc-ranking">{ranking.map((item, index) => <article key={item.id} className={item.id === profile?.id ? 'is-me' : ''}><b>{index + 1}</b>{item.foto_url ? <img src={item.foto_url} alt=""/> : <i>{item.nome?.charAt(0)?.toUpperCase() || '?'}</i>}<div><strong>{item.nome}</strong><span>@{item.username}{item.id === profile?.id ? ' · você' : ''}</span></div><em>{Number(item.xp_total || 0).toLocaleString('pt-BR')} XP</em></article>)}{!ranking.length && <Empty icon="trophy" title="Ranking sendo formado" text="Quando os alunos do seu curso ganharem XP, a classificação aparecerá aqui."/>}</div></>}

    <div className="xpc-section-head"><div><span>EXTRATO</span><h2>Movimentações recentes</h2></div>{recent && <button onClick={() => setTab('history')}>Ver histórico</button>}</div>
    <div className="xpc-recent">{recent ? <article className="xpc-transaction"><i className={recent.amount >= 0 ? 'positive' : 'negative'}><Icon name="trend"/></i><div><strong>{recent.reason}</strong><span>{date(recent.created_at)} · saldo após: {formatXp(recent.balance_after)}</span></div><b className={recent.amount >= 0 ? 'positive' : 'negative'}>{recent.amount > 0 ? '+' : ''}{formatXp(recent.amount)}</b></article> : <Empty icon="history" title="Nenhuma movimentação encontrada" text="Quando você receber ou utilizar XP, as movimentações aparecerão aqui."/>}</div>
    <div className="xpc-section-head"><div><span>PRÓXIMOS PASSOS</span><h2>Continue avançando</h2></div></div>
    <div className="xpc-actions"><article><i><Icon name="book"/></i><strong>Ver atividades</strong><span>Entregue trabalhos e ganhe XP.</span><button onClick={() => setTab('activities')}>Explorar atividades</button></article>
      <article><i><Icon name="gift"/></i><strong>Explorar recompensas</strong><span>Veja o que o seu saldo já pode liberar.</span><button onClick={() => setTab('rewards')}>Ver recompensas</button></article>
      <article><i><Icon name="clock"/></i><strong>Acompanhar pedidos</strong><span>Consulte o status e o histórico das suas solicitações.</span><button onClick={() => setTab('requests')}>Minhas solicitações</button></article></div></>
}

function DevelopmentArea({ title, text, onBack }) {
  return <div className="nexo-development-card xpc-development-card">
    <div className="nexo-development-icon" aria-hidden="true">
      <Icon name="gift" size={34}/>
    </div>
    <span>EM CONSTRUÇÃO</span>
    <h2>{title}</h2>
    <p>{text}</p>
    <button type="button" onClick={onBack}>Voltar para a visão geral</button>
  </div>
}

function StudentActivities({ activities, busy, run }) {
  const [answers, setAnswers] = useState({})
  if (!activities.length) return <Empty icon="book" title="Tudo em dia" text="Nenhuma atividade disponível para sua turma." />
  return <><div className="xpc-section-head"><div><span>MINHAS ATIVIDADES</span><h2>Prazos e entregas</h2></div></div>
    <div className="xpc-list">{activities.map((item) => <article key={item.id} className="xpc-activity">
      <div className="xpc-item-icon"><Icon name="book"/></div><div className="xpc-grow"><div className="xpc-item-title"><strong>{item.title}</strong><b>{item.max_xp} XP</b></div>
        <p>{item.description}</p><div className="xpc-meta"><span>{item.subject_name}</span><span>Prazo: {date(item.deadline_at)}</span>{item.allow_resubmission && <span>Reenvio permitido</span>}</div>
        <textarea value={answers[item.id] || ''} onChange={(e) => setAnswers((old) => ({ ...old, [item.id]: e.target.value }))} placeholder="Escreva sua resposta ou cole o link do arquivo..." />
        <button className="xpc-primary small" disabled={busy || !answers[item.id]?.trim()} onClick={() => run(`submit-${item.id}`, () => rpc('xp_submit_activity', { p_activity_id: item.id, p_content: answers[item.id], p_attachment_url: null }), 'Atividade entregue ao professor.')}>{busy === `submit-${item.id}` ? 'Enviando...' : 'Entregar atividade'}</button>
      </div></article>)}</div></>
}

function StaffActivities({ staff, canCreate, busy, setModal, run }) {
  async function copyActivityLink(activity) {
    if (!activity.share_token) return
    const basePath = import.meta.env.BASE_URL === '/' ? '/' : import.meta.env.BASE_URL
    const link = `${window.location.origin}${basePath}academia/atividade/${activity.share_token}`
    await navigator.clipboard.writeText(link)
    window.alert('Link da atividade copiado. Agora é só enviar aos alunos.')
  }
  return <><div className="xpc-section-head"><div><span>{canCreate ? 'PROFESSOR' : 'GESTÃO'}</span><h2>Atividades e correções</h2></div>{canCreate && <button className="xpc-primary" onClick={() => setModal({ type: 'activity' })}>+ Nova atividade</button>}</div>
    <h3 className="xpc-subtitle">Entregas aguardando correção</h3>
    <div className="xpc-list">{(staff?.submissions || []).filter((s) => s.status !== 'graded').map((s) => <article className="xpc-row" key={s.id}><div><strong>{s.student_name}</strong><span>{s.activity_title} · {date(s.submitted_at)}</span></div><button onClick={() => setModal({ type: 'grade', item: s })}>Corrigir</button></article>)}
      {!(staff?.submissions || []).some((s) => s.status !== 'graded') && <Empty title="Sem correções pendentes" text="As novas entregas aparecerão aqui." />}</div>
    <h3 className="xpc-subtitle">Atividades publicadas</h3>
    <div className="xpc-card-grid">{(staff?.activities || []).map((a) => <article className="xpc-manage-card" key={a.id}><span>{a.subject_name}</span><h3>{a.title}</h3><p>{a.max_xp} XP · {date(a.deadline_at)}</p><div className="xpc-card-actions">{a.share_token && <button className="xpc-copy-link" onClick={() => copyActivityLink(a)}>Copiar link</button>}{a.status !== 'archived' && <button disabled={busy} onClick={() => run(`archive-${a.id}`, () => rpc('xp_archive_activity', { p_activity_id: a.id }), 'Atividade arquivada.')}>Arquivar</button>}</div></article>)}</div></>
}

function Rewards({ data, isAdmin, busy, setModal, run }) {
  return <><div className="xpc-section-head"><div><span>CATÁLOGO DA ESCOLA</span><h2>Trocar XP por recompensas</h2><p>Seu XP vira benefícios reais sem alterar notas.</p></div>{isAdmin && <button className="xpc-primary" onClick={() => setModal({ type: 'reward' })}>+ Recompensa</button>}</div>
    <div className="xpc-reward-grid">{(data?.rewards || []).map((item) => { const progress = rewardProgress(item.xp_price, data.wallet); const enabled = !progress.missing
      return <article className="xpc-reward" key={item.id}><div className="xpc-reward-icon"><Icon name="gift" size={28}/></div><div className="xpc-reward-type">{TYPES[item.reward_type]}</div><h3>{item.name}</h3><p>{item.description}</p>
        <div className="xpc-progress"><span style={{ width: `${progress.percentage}%` }} /></div><div className="xpc-reward-price"><strong>{formatXp(item.xp_price)}</strong><span>{progress.missing ? `Faltam ${formatXp(progress.missing)}` : 'Disponível agora'}</span></div>
        <button disabled={!enabled || busy} onClick={() => setModal({ type: 'confirmReward', item })}>{enabled ? 'Solicitar recompensa' : 'XP insuficiente'}</button>
        {isAdmin && <button className="xpc-link" onClick={() => setModal({ type: 'reward', item })}>Editar</button>}</article>})}
      {!data?.rewards?.length && <Empty title="Catálogo em preparação" text="A escola ainda não publicou recompensas." />}</div></>
}

function Requests({ data, staff, isStaff, busy, setModal, run }) {
  const rows = isStaff ? staff?.requests || [] : data?.requests || []
  return <><div className="xpc-section-head"><div><span>ACOMPANHAMENTO</span><h2>{isStaff ? 'Solicitações da escola' : 'Minhas solicitações'}</h2></div></div>
    <div className="xpc-list">{rows.map((item) => <article className="xpc-request" key={item.id}><div className={`xpc-status ${item.status}`}>{XP_STATUS[item.status]}</div>
      <div className="xpc-grow"><strong>{item.reward_name_snapshot}</strong><span>{formatXp(item.xp_price_snapshot)} · solicitada em {date(item.created_at)}</span>
        {item.rejection_reason && <p className="xpc-reason">Motivo: {item.rejection_reason}</p>}
        {!isStaff && <div className="xpc-timeline">{(data?.request_history || []).filter((h) => h.request_id === item.id).map((h) => <span key={h.id}><i />{XP_STATUS[h.new_status] || h.new_status}<small>{date(h.created_at)}</small></span>)}</div>}</div>
      {isStaff && item.status === 'pending' && <button onClick={() => setModal({ type: 'review', item })}>Analisar</button>}
      {isStaff && item.status === 'approved' && <button onClick={() => run(`ready-${item.id}`, () => rpc('xp_update_reward_status', { p_request_id: item.id, p_status: 'ready', p_note: 'Disponível para retirada' }), 'Pedido marcado como pronto.')}>Marcar pronta</button>}
      {isStaff && item.status === 'ready' && <button onClick={() => run(`delivered-${item.id}`, () => rpc('xp_update_reward_status', { p_request_id: item.id, p_status: 'delivered', p_note: 'Entregue ao aluno' }), 'Entrega confirmada.')}>Confirmar entrega</button>}
      {!isStaff && item.status === 'pending' && <button className="danger" disabled={busy} onClick={() => run(`cancel-${item.id}`, () => rpc('xp_cancel_reward_request', { p_request_id: item.id, p_reason: 'Cancelado pelo aluno' }), 'Solicitação cancelada e XP liberado.')}>Cancelar</button>}
    </article>)}{!rows.length && <Empty title="Nenhuma solicitação" text="Quando uma recompensa for solicitada, ela aparecerá aqui." />}</div></>
}

function History({ rows, filter, setFilter, query, setQuery }) {
  return <><div className="xpc-section-head"><div><span>EXTRATO</span><h2>Histórico de XP</h2></div><button onClick={() => exportCsv(rows, 'historico-xp.csv')}>Exportar CSV</button></div>
    <div className="xpc-filters"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar no histórico..." /><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Todos</option><option value="credit">Créditos</option><option value="debit">Débitos</option><option value="reversal">Estornos</option><option value="nexinho_milestone">Nexinho</option></select></div>
    <div className="xpc-list">{rows.map((item) => <article className="xpc-transaction" key={item.id}><i className={item.amount >= 0 ? 'positive' : 'negative'}><Icon name="trend"/></i><div><strong>{item.reason}</strong><span>{date(item.created_at)} · saldo após: {formatXp(item.balance_after)}</span></div><b className={item.amount >= 0 ? 'positive' : 'negative'}>{item.amount > 0 ? '+' : ''}{formatXp(item.amount)}</b></article>)}{!rows.length && <Empty icon="history" title="Nenhum movimento encontrado" text="Altere os filtros ou aguarde seu primeiro ganho de XP." />}</div></>
}

function Management({ staff, isAdmin, setModal }) {
  return <><div className="xpc-section-head"><div><span>GESTÃO</span><h2>Controle e relatórios</h2></div><div className="xpc-head-actions">{isAdmin && <button className="xpc-primary" onClick={() => setModal({ type: 'adjust' })}>Ajustar XP</button>}<button onClick={() => exportCsv(staff?.transactions || [], 'movimentacoes-xp.csv')}>Exportar CSV</button></div></div>
    <div className="xpc-stats"><article><span>Atividades</span><strong>{staff?.activities?.length || 0}</strong></article><article><span>Entregas</span><strong>{staff?.submissions?.length || 0}</strong></article><article><span>Pedidos ativos</span><strong>{staff?.requests?.length || 0}</strong></article><article><span>Recompensas</span><strong>{staff?.rewards?.length || 0}</strong></article></div>
    {!isAdmin && <div className="xpc-notice">Seu perfil de professor pode publicar e corrigir atividades. Recompensas e ajustes ficam restritos à gestão escolar.</div>}
    <h3 className="xpc-subtitle">Catálogo completo</h3><div className="xpc-card-grid">{(staff?.rewards || []).map((r) => <article className="xpc-manage-card" key={r.id}><span>{r.is_active ? 'ATIVA' : 'INATIVA'}</span><h3><Icon name="gift" size={18}/> {r.name}</h3><p>{formatXp(r.xp_price)} · estoque {r.stock ?? 'ilimitado'}</p>{isAdmin && <button onClick={() => setModal({ type: 'reward', item: r })}>Editar</button>}</article>)}</div></>
}

function AdjustXp({ students, busy, onClose, onSave }) {
  const [student, setStudent] = useState(''); const [amount, setAmount] = useState(''); const [reason, setReason] = useState('')
  return <Modal title="Ajuste administrativo de XP" onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); onSave(student, Number(amount), reason) }}>
    <label>Aluno<select required value={student} onChange={(e) => setStudent(e.target.value)}><option value="">Selecione o aluno</option>{students.map((s) => <option key={s.id} value={s.id}>{s.nome} (@{s.username}) · {s.available_balance} XP disponíveis</option>)}</select></label>
    <label>Valor (use negativo para retirar)<input required type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Ex.: 50 ou -50" /></label>
    <label>Justificativa obrigatória<textarea required value={reason} onChange={(e) => setReason(e.target.value)} /></label>
    <button className="xpc-primary" disabled={busy || !student || Number(amount) === 0 || !reason.trim()}>{busy ? 'Registrando...' : 'Registrar ajuste auditável'}</button>
  </form></Modal>
}

function ActivityForm({ busy, onClose, onSave }) {
  const [f, setF] = useState({ subject: '', title: '', description: '', type: 'individual_work', maxXp: 100, mode: 'full', maxGrade: 10, startDate: '', startTime: '08:00', deadlineDate: '', deadlineTime: '23:59', late: 'minus_10', resubmit: true, lower: 'keep_highest', instructions: '' })
  const [documentFile, setDocumentFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const update = (key, value) => setF((old) => ({ ...old, [key]: value }))
  const choices = {
    type: [['simple_exercise','Exercício'],['question_list','Lista'],['individual_work','Trabalho'],['group_work','Em grupo'],['assessment','Avaliação'],['project','Projeto'],['special_participation','Participação']],
    mode: [['full','Dar todo o XP escolhido'],['proportional','Calcular pela nota']],
    late: [['none','Sem redução'],['minus_10','-10%'],['minus_25','-25%'],['reject','Bloquear atraso']],
    lower: [['keep_highest','Manter maior'],['replace','Substituir resultado']],
  }
  function ChoiceGroup({ field, label }) {
    return <fieldset className="xpc-choice-field"><legend>{label}</legend><div>{choices[field].map(([value, text]) => <button type="button" key={value} className={f[field] === value ? 'selected' : ''} onClick={() => update(field, value)}>{f[field] === value && <span>✓</span>}{text}</button>)}</div></fieldset>
  }
  async function submit(event) {
    event.preventDefault()
    setUploading(true)
    try {
      let attachmentUrl = null
      if (documentFile) {
        const safeName = documentFile.name.replace(/[^a-zA-Z0-9._-]/g, '-')
        const path = `teacher/${Date.now()}-${safeName}`
        const { error } = await supabase.storage.from('academic-activities').upload(path, documentFile)
        if (error) throw error
        attachmentUrl = supabase.storage.from('academic-activities').getPublicUrl(path).data.publicUrl
      }
      const startsAt = f.startDate ? new Date(`${f.startDate}T${f.startTime || '00:00'}`).toISOString() : new Date().toISOString()
      const deadlineAt = new Date(`${f.deadlineDate}T${f.deadlineTime || '23:59'}`).toISOString()
      await onSave({ p_title:f.title,p_description:f.description,p_subject_name:f.subject,p_activity_type:f.type,p_max_xp:Number(f.maxXp),p_grading_mode:f.mode,p_max_grade:Number(f.maxGrade),p_starts_at:startsAt,p_deadline_at:deadlineAt,p_late_policy:f.late,p_allow_resubmission:f.resubmit,p_lower_grade_policy:f.lower,p_instructions:f.instructions,p_attachment_url:attachmentUrl })
    } finally { setUploading(false) }
  }
  return <Modal className="xpc-activity-modal" title="Publicar atividade por link" description="Crie o trabalho, anexe um Word se quiser e compartilhe o link com os alunos." onClose={onClose}><form className="xpc-activity-form" onSubmit={submit}>
    <div className="xpc-activity-fields">
      <label>Matéria<input required value={f.subject} onChange={(e) => update('subject', e.target.value)} placeholder="Ex.: Matemática" /></label>
      <label>Título da atividade<input required value={f.title} onChange={(e) => update('title', e.target.value)} placeholder="Ex.: Trabalho sobre biomas" /></label>
      <label>Descrição<textarea className="xpc-description-input" value={f.description} onChange={(e) => update('description', e.target.value)} placeholder="Explique o objetivo e o que deverá ser entregue." /></label>
      <ChoiceGroup field="type" label="Tipo de atividade" />
      <section className="xpc-xp-value-panel"><div><span>RECOMPENSA DA ATIVIDADE</span><h3>Quanto XP este trabalho vale?</h3><p>Defina agora o XP que o aluno poderá receber depois da correção.</p></div><label><input type="number" min="1" required value={f.maxXp} onChange={(e) => update('maxXp', e.target.value)} /><strong>XP</strong></label></section>
      <section className="xpc-date-panel"><h3>Abertura</h3><div><label>Data<input type="date" value={f.startDate} onChange={(e) => update('startDate', e.target.value)} /></label><label>Hora<input type="time" value={f.startTime} onChange={(e) => update('startTime', e.target.value)} /></label></div><small>Se deixar a data vazia, o link abre imediatamente.</small></section>
      <section className="xpc-date-panel deadline"><h3>Prazo de entrega</h3><div><label>Data<input type="date" required value={f.deadlineDate} onChange={(e) => update('deadlineDate', e.target.value)} /></label><label>Hora<input type="time" required value={f.deadlineTime} onChange={(e) => update('deadlineTime', e.target.value)} /></label></div></section>
      <ChoiceGroup field="mode" label="Como distribuir o XP escolhido" />
      {f.mode === 'proportional' && <label>Nota máxima usada no cálculo<input type="number" min="1" value={f.maxGrade} onChange={(e) => update('maxGrade', e.target.value)} /><small>Exemplo: atividade valendo 100 XP, nota 8 de 10 = 80 XP.</small></label>}
      <ChoiceGroup field="late" label="Entrega atrasada" /><ChoiceGroup field="lower" label="Nova correção" />
      <label className="xpc-file-field">Arquivo do Word ou PDF<input type="file" accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" onChange={(e) => setDocumentFile(e.target.files?.[0] || null)} /><span>{documentFile ? documentFile.name : 'Escolher arquivo do computador'}</span><small>DOC, DOCX ou PDF de até 20 MB.</small></label>
      <label>Orientações adicionais<textarea value={f.instructions} onChange={(e) => update('instructions', e.target.value)} placeholder="Links, materiais e observações opcionais." /></label>
      <label className="xpc-check"><input type="checkbox" checked={f.resubmit} onChange={(e) => update('resubmit', e.target.checked)} /> Permitir nova entrega</label>
    </div>
    <footer className="xpc-activity-footer"><button type="button" onClick={onClose}>Cancelar</button><button className="xpc-primary" disabled={busy || uploading || !f.deadlineDate}>{busy || uploading ? 'Gerando link...' : 'Publicar e gerar link'}</button></footer>
  </form></Modal>
}

function GradeForm({ item, busy, onClose, onSave }) {
  const maxXp = Math.max(0, Number(item.max_xp || 0))
  const [grade, setGrade] = useState('')
  const [manual, setManual] = useState(item.grading_mode === 'manual' ? String(maxXp) : '')
  const [reason, setReason] = useState('')
  const manualNumber = Number(manual)
  const manualInvalid = item.grading_mode === 'manual' && (manual.trim() === '' || !Number.isInteger(manualNumber) || manualNumber < 0 || manualNumber > maxXp)
  return <Modal title={`Corrigir · ${item.student_name}`} onClose={onClose}><div className="xpc-submission"><span>Resposta entregue</span><p>{item.content || 'Sem texto'}</p></div><form onSubmit={(e) => { e.preventDefault(); if (manualInvalid) return; onSave({ p_grade: grade === '' ? null : Number(grade), p_manual_xp: item.grading_mode === 'manual' ? manualNumber : null, p_justification: reason.trim() || null }) }}>
    {item.grading_mode !== 'manual' && <label>Nota (máximo {item.max_grade})<input type="number" step=".1" min="0" max={item.max_grade} required={item.grading_mode === 'proportional'} value={grade} onChange={(e) => setGrade(e.target.value)} /></label>}
    {item.grading_mode === 'manual' && <label>XP concedido — máximo {maxXp} XP<input type="number" step="1" min="0" max={maxXp} required value={manual} onChange={(e) => setManual(e.target.value)} />{manualInvalid && <small className="xpc-field-error">Digite um número inteiro entre 0 e {maxXp} XP.</small>}</label>}
    <label>Justificativa{item.grading_mode === 'manual' && <small>Obrigatória na correção manual.</small>}<textarea required={item.grading_mode === 'manual'} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Feedback para o aluno" /></label><button className="xpc-primary" disabled={busy || manualInvalid || (item.grading_mode === 'manual' && !reason.trim())}>{busy ? 'Salvando...' : 'Salvar correção e XP'}</button></form></Modal>
}

function RewardForm({ item, busy, onClose, onSave }) {
  const [f, setF] = useState({ name: item?.name || '', description: item?.description || '', icon: item?.icon || '🎁', price: item?.xp_price || 500, type: item?.reward_type || 'physical', stock: item?.stock ?? '', policy: item?.cancellation_policy || 'before_approval' })
  const update = (key, value) => setF((old) => ({ ...old, [key]: value }))
  return <Modal title={item ? 'Editar recompensa' : 'Nova recompensa'} onClose={onClose}><form onSubmit={(e) => { e.preventDefault(); onSave({ p_reward_id: item?.id || null, p_name: f.name, p_description: f.description, p_icon: f.icon, p_xp_price: Number(f.price), p_reward_type: f.type, p_stock: f.stock === '' ? null : Number(f.stock), p_cancellation_policy: f.policy }) }}>
    <div className="xpc-form-grid"><label>Ícone<input maxLength="4" value={f.icon} onChange={(e) => update('icon', e.target.value)} /></label><label>Nome<input required value={f.name} onChange={(e) => update('name', e.target.value)} /></label><label>Preço em XP<input type="number" min="1" required value={f.price} onChange={(e) => update('price', e.target.value)} /></label><label>Tipo<select value={f.type} onChange={(e) => update('type', e.target.value)}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label><label>Estoque (vazio = ilimitado)<input type="number" min="0" value={f.stock} onChange={(e) => update('stock', e.target.value)} /></label></div>
    <label>Descrição<textarea required value={f.description} onChange={(e) => update('description', e.target.value)} /></label><label>Política de cancelamento<select value={f.policy} onChange={(e) => update('policy', e.target.value)}><option value="before_approval">Somente antes da aprovação</option><option value="until_ready">Até ficar pronta</option><option value="school_review">Mediante análise da escola</option></select></label><button className="xpc-primary" disabled={busy}>{busy ? 'Salvando...' : 'Salvar recompensa'}</button></form></Modal>
}

function ConfirmReward({ item, wallet, busy, onClose, onConfirm }) {
  return <Modal title="Confirmar solicitação" onClose={onClose}><div className="xpc-confirm"><i><Icon name="gift" size={42}/></i><h3>{item.name}</h3><p>{item.description}</p><div><span>Valor</span><strong>{formatXp(item.xp_price)}</strong></div><div><span>Saldo após a reserva</span><strong>{formatXp(availableXp(wallet) - item.xp_price)}</strong></div><small>O XP ficará reservado. A cobrança definitiva acontece somente após a aprovação.</small><button className="xpc-primary" disabled={busy} onClick={onConfirm}>{busy ? 'Solicitando...' : `Confirmar por ${formatXp(item.xp_price)}`}</button></div></Modal>
}

function ReviewRequest({ item, busy, onClose, onReview }) {
  const [reason, setReason] = useState('')
  return <Modal title="Analisar solicitação" onClose={onClose}><div className="xpc-confirm"><h3>{item.reward_name_snapshot}</h3><p>{formatXp(item.xp_price_snapshot)} reservados pelo aluno.</p><label>Motivo/observação<textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Obrigatório em caso de recusa" /></label><div className="xpc-review-buttons"><button className="danger" disabled={busy || !reason.trim()} onClick={() => onReview(false, reason)}>Recusar</button><button className="xpc-primary" disabled={busy} onClick={() => onReview(true, reason || null)}>Aprovar</button></div></div></Modal>
}
