import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SocialLoader from '../components/SocialLoader'
import { criarNotificacaoSePermitido } from '../lib/notificationPreferences'

const COLORS = [
  ['neon', 'Verde neon'],
  ['blue', 'Azul elétrico'],
  ['purple', 'Roxo cósmico'],
  ['pink', 'Rosa energia'],
]
const ROOMS = [
  ['study', 'Sala de estudos'],
  ['space', 'Estação espacial'],
  ['forest', 'Floresta neon'],
  ['night', 'Quarto noturno'],
]
const SUBJECTS = ['mixed', 'português', 'matemática', 'ciências', 'história', 'geografia', 'inglês']

function PetVisual({ state = 'idle', color = 'neon', accessory = 'none' }) {
  return (
    <div className={`nexinho-big-scene ${color} ${state}`} aria-label={`Nexinho ${state}`}>
      <div className={`chat-pet-avatar ${state}`}>
        <span className="chat-pet-aura" />
        <span className="chat-pet-tail" />
        <span className="chat-pet-ear left" />
        <span className="chat-pet-ear right" />
        <span className="chat-pet-body" />
        <span className="chat-pet-eye left" />
        <span className="chat-pet-eye right" />
        <span className="chat-pet-mouth" />
        <span className="chat-pet-blush left" />
        <span className="chat-pet-blush right" />
      </div>
      {accessory !== 'none' ? <span className="nexinho-worn-item">{accessory === 'glasses' ? '👓' : accessory === 'crown' ? '👑' : '🧢'}</span> : null}
      {state === 'waiting' ? <span className="nexinho-prop">📕</span> : null}
      {state === 'happy' ? <span className="nexinho-prop">🥣</span> : null}
    </div>
  )
}

export default function NexinhoRoom() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('inicio')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ color: 'neon', accessory: 'none', room_theme: 'study', favorite_subject: 'mixed' })

  async function load() {
    setMessage('')
    const { data: payload, error } = await supabase.rpc('nexinho_get_dashboard', { p_conversation_id: conversationId })
    if (error) {
      setMessage(error.code === 'PGRST202' ? 'Cole o SQL nexinho_complete_module_v7 no Supabase.' : error.message)
    } else {
      setData(payload)
      setForm({
        color: payload.color || 'neon',
        accessory: payload.accessory || 'none',
        room_theme: payload.room_theme || 'study',
        favorite_subject: payload.favorite_subject || 'mixed',
      })
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [conversationId])

  async function customize() {
    setSaving(true)
    const { data: payload, error } = await supabase.rpc('nexinho_customize', {
      p_conversation_id: conversationId,
      p_color: form.color,
      p_accessory: form.accessory,
      p_room_theme: form.room_theme,
      p_favorite_subject: form.favorite_subject,
    })
    setSaving(false)
    if (error) return setMessage(error.message)
    setData(payload)
    setMessage('Personalização salva para a dupla.')
  }

  async function remind() {
    const { data: payload, error } = await supabase.rpc('nexinho_remind_partner', { p_conversation_id: conversationId })
    if (error) return setMessage(error.message)
    await criarNotificacaoSePermitido({
      receiverProfileId: data.partner_id,
      actorProfileId: data.my_profile_id,
      type: 'message',
      metadata: {
        kind: 'pet_reminder',
        conversation_id: conversationId,
        text: 'Seu parceiro está esperando você para alimentar o Nexinho.',
      },
    })
    setMessage(`Lembrete enviado. Restam ${payload.remaining_today} hoje.`)
  }

  async function buy(item) {
    const { data: payload, error } = await supabase.rpc('nexinho_buy_item', {
      p_conversation_id: conversationId,
      p_item_id: item.id,
    })
    if (error) return setMessage(error.message)
    setData(payload)
    setMessage(`${item.name} agora pertence à dupla.`)
  }

  if (loading) return <SocialLoader variant="feed" />
  if (!data) return <main className="nexinho-page"><button onClick={() => navigate(-1)}>Voltar</button><p className="alert-box">{message}</p></main>

  const state = data.status === 'down' ? 'waiting' : data.completed_by_me && data.completed_by_partner ? 'happy' : data.completed_by_me || data.completed_by_partner ? 'active' : 'idle'
  const accuracy = data.total_questions ? Math.round((data.total_correct / data.total_questions) * 100) : 0

  return (
    <main className={`nexinho-page room-${form.room_theme}`}>
      <header className="nexinho-header">
        <button type="button" onClick={() => navigate(-1)}>←</button>
        <div><small>Nexinho da dupla</small><h1>{data.name}</h1></div>
        <button type="button" onClick={() => setTab('config')}>⚙</button>
      </header>

      {message ? <button className="nexinho-toast" onClick={() => setMessage('')}>{message}</button> : null}

      <section className="nexinho-room-stage">
        <div className="nexinho-window">✦</div>
        <div className="nexinho-shelf">📚 🪴</div>
        <div className="nexinho-wall-art">NX</div>
        <div className="nexinho-lamp">💡</div>
        <div className="nexinho-desk">🪑<span>📖 ✏️</span></div>
        <div className="nexinho-rug" />
        <div className="nexinho-toy">🧸</div>
        <PetVisual state={state} color={form.color} accessory={form.accessory} />
        <div className="nexinho-bed">🛏️</div>
        <p>{data.status === 'down' ? 'Estou descansando. Nossa história continua.' : state === 'happy' ? 'Missão completa! Hora de comemorar!' : data.completed_by_me ? 'Você fez sua parte. Falta seu parceiro.' : 'Vamos estudar juntos hoje?'}</p>
      </section>

      <section className="nexinho-quick-stats">
        <div><strong>🔥 {data.streak}</strong><span>sequência</span></div>
        <div><strong>⚡ {data.energy}%</strong><span>energia</span></div>
        <div><strong>🪙 {data.coins}</strong><span>Nexocoins</span></div>
        <div><strong>↻ {data.restores_left}/3</strong><span>restaurações</span></div>
      </section>

      <nav className="nexinho-tabs">
        {['inicio','quarto','loja','conquistas','historico','config'].map((item) => (
          <button key={item} className={tab === item ? 'active' : ''} onClick={() => setTab(item)}>{item}</button>
        ))}
      </nav>

      {tab === 'inicio' ? (
        <section className="nexinho-panel">
          <h2>Missão de hoje</h2>
          <div className="nexinho-duo-progress">
            <span className={data.completed_by_me ? 'done' : ''}>Você {data.completed_by_me ? '✓' : '⏳'}</span>
            <span className={data.completed_by_partner ? 'done' : ''}>Parceiro {data.completed_by_partner ? '✓' : '⏳'}</span>
          </div>
          <button className="nexinho-main-action" onClick={() => navigate(-1)}>{data.completed_by_me ? 'Missão concluída' : 'Fazer meu quiz'}</button>
          {data.completed_by_me && !data.completed_by_partner ? <button className="nexinho-secondary-action" onClick={remind}>Cutucar parceiro</button> : null}
          <div className="nexinho-info-grid">
            <div><strong>{data.best_streak}</strong><span>maior sequência</span></div>
            <div><strong>{data.total_questions}</strong><span>perguntas</span></div>
            <div><strong>{data.total_correct}</strong><span>acertos</span></div>
            <div><strong>{accuracy}%</strong><span>aproveitamento</span></div>
          </div>
        </section>
      ) : null}

      {tab === 'quarto' || tab === 'config' ? (
        <section className="nexinho-panel">
          <h2>{tab === 'quarto' ? 'Personalizar quarto' : 'Preferências da dupla'}</h2>
          <div className="nexinho-choice-group"><strong>Cor do Nexinho</strong><div className="nexinho-color-options">{COLORS.map(([v,l]) => <button type="button" aria-label={l} title={l} className={`${v} ${form.color === v ? 'selected' : ''}`} key={v} onClick={() => setForm({ ...form, color: v })}><span /></button>)}</div></div>
          <div className="nexinho-choice-group"><strong>Estilo do quarto</strong><div className="nexinho-card-options">{ROOMS.map(([v,l]) => <button type="button" className={form.room_theme === v ? 'selected' : ''} key={v} onClick={() => setForm({ ...form, room_theme: v })}><b>{v === 'space' ? '🌌' : v === 'forest' ? '🌿' : v === 'night' ? '🌙' : '📚'}</b><span>{l}</span></button>)}</div></div>
          <div className="nexinho-choice-group"><strong>Matéria favorita</strong><div className="nexinho-chip-options">{SUBJECTS.map((v) => <button type="button" className={form.favorite_subject === v ? 'selected' : ''} key={v} onClick={() => setForm({ ...form, favorite_subject: v })}>{v}</button>)}</div></div>
          <div className="nexinho-choice-group"><strong>Acessório</strong><div className="nexinho-card-options"><button type="button" className={form.accessory === 'none' ? 'selected' : ''} onClick={() => setForm({ ...form, accessory: 'none' })}><b>✦</b><span>Nenhum</span></button>{data.inventory.filter((x) => ['clothing','accessory'].includes(x.category)).map((x) => <button type="button" className={form.accessory === x.id ? 'selected' : ''} key={x.id} onClick={() => setForm({ ...form, accessory: x.id })}><b>{x.icon}</b><span>{x.name}</span></button>)}</div></div>
          <button className="nexinho-main-action" disabled={saving} onClick={customize}>{saving ? 'Salvando...' : 'Salvar para a dupla'}</button>
        </section>
      ) : null}

      {tab === 'loja' ? <section className="nexinho-panel"><h2>Loja do quarto</h2><div className="nexinho-shop">{data.shop.map((item) => <article key={item.id}><b>{item.icon}</b><strong>{item.name}</strong><small>{item.unlock_days ? `Libera com ${item.unlock_days} dias` : 'Disponível'}</small><button disabled={data.inventory.some((x) => x.id === item.id)} onClick={() => buy(item)}>{data.inventory.some((x) => x.id === item.id) ? 'Comprado' : `${item.price} 🪙`}</button></article>)}</div></section> : null}
      {tab === 'conquistas' ? <section className="nexinho-panel"><h2>Conquistas</h2>{data.achievements.length ? data.achievements.map((x) => <article className="nexinho-list-card" key={x.achievement_key}>🏆 <div><strong>{x.title}</strong><p>{x.description}</p></div></article>) : <p>A primeira conquista será liberada quando os dois alimentarem o Nexinho.</p>}</section> : null}
      {tab === 'historico' ? <section className="nexinho-panel"><h2>Histórico da dupla</h2>{data.history.length ? data.history.map((x) => <article className="nexinho-list-card" key={x.id}>● <div><strong>{x.title}</strong><small>{new Date(x.created_at).toLocaleString('pt-BR')}</small></div></article>) : <p>A história de vocês está começando.</p>}</section> : null}
    </main>
  )
}
