import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import ProfileAvatar from '../components/ProfileAvatar'
import SocialLoader from '../components/SocialLoader'
import { supabase } from '../lib/supabase'
import { openReportDialog } from '../lib/moderation'
import { TALENT_CATEGORIES } from '../lib/talents'

export default function Talents() {
  const [items, setItems] = useState([])
  const [me, setMe] = useState(null)
  const [category, setCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const navigate = useNavigate()

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true); setError('')
    try {
      const savedNotice = sessionStorage.getItem('nexo:talent-notice')
      if (savedNotice) { setNotice(savedNotice); sessionStorage.removeItem('nexo:talent-notice') }
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { navigate('/auth'); return }
      const { data: profile } = await supabase.from('profiles').select('id,nome,username,foto_url').eq('account_id', user.id).single()
      setMe(profile)
      const { data: posts, error: postsError } = await supabase.from('posts')
        .select('id,profile_id,content,media_url,media_kind,talent_title,talent_category,moderation_status,created_at')
        .eq('post_type', 'talent').or(`moderation_status.eq.approved,profile_id.eq.${profile.id}`).order('created_at', { ascending: false }).limit(80)
      if (postsError) throw postsError
      const ids = [...new Set((posts || []).map((post) => post.profile_id))]
      const postIds = (posts || []).map((post) => post.id)
      const [{ data: profiles }, { data: likes }] = await Promise.all([
        ids.length ? supabase.from('profiles').select('id,nome,username,foto_url,is_verified').in('id', ids) : { data: [] },
        postIds.length ? supabase.from('post_likes').select('post_id,profile_id').in('post_id', postIds).limit(2000) : { data: [] },
      ])
      const profileMap = new Map((profiles || []).map((profileItem) => [profileItem.id, profileItem]))
      setItems((posts || []).map((post) => ({
        ...post,
        author: profileMap.get(post.profile_id),
        likes: (likes || []).filter((like) => like.post_id === post.id).length,
        liked: (likes || []).some((like) => like.post_id === post.id && like.profile_id === profile?.id),
      })))
    } catch (loadError) {
      setError(loadError?.message || 'Não foi possível carregar os talentos.')
    } finally { setLoading(false) }
  }

  async function toggleLike(item) {
    if (!me?.id) return
    if (item.liked) await supabase.from('post_likes').delete().eq('post_id', item.id).eq('profile_id', me.id)
    else await supabase.from('post_likes').insert({ post_id: item.id, profile_id: me.id })
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, liked: !entry.liked, likes: Math.max(0, entry.likes + (entry.liked ? -1 : 1)) } : entry))
  }

  const visible = useMemo(() => category === 'all' ? items : items.filter((item) => item.talent_category === category), [items, category])
  const labelFor = (value) => TALENT_CATEGORIES.find(([key]) => key === value)?.[1] || 'Talento'

  if (loading) return <SocialLoader variant="feed" showBottomNav />

  return (
    <div className="container talents-shell">
      <header className="topbar talents-topbar">
        <button type="button" onClick={() => navigate('/')} aria-label="Voltar">←</button>
        <div><span>EXPRESSÃO NEXO</span><h1>Talentos</h1></div>
        <button type="button" className="talents-create" onClick={() => navigate('/talentos/criar')}>Publicar</button>
      </header>
      <main className="talents-page">
        <section className="talents-hero">
          <div><span>FEITO POR QUEM ESTÁ AQUI</span><h2>Um palco para o que cada pessoa sabe criar.</h2><p>Descubra desenhos, músicas, textos, fotografias, tecnologia e outras formas de expressão da comunidade escolar.</p></div>
          <button type="button" onClick={() => navigate('/talentos/criar')}>Mostrar meu talento <b>＋</b></button>
        </section>
        <nav className="talents-categories" aria-label="Categorias de talentos">
          {TALENT_CATEGORIES.map(([key, label]) => <button key={key} type="button" className={category === key ? 'active' : ''} onClick={() => setCategory(key)}>{label}</button>)}
        </nav>
        {notice ? <div className="alert-box sucesso-box talent-notice">{notice}</div> : null}
        {error ? <div className="alert-box erro-box">{error}</div> : null}
        {!visible.length ? <section className="talents-empty"><b>✦</b><h3>Ainda não há talentos aqui</h3><p>Seja a primeira pessoa a abrir este espaço.</p><button type="button" onClick={() => navigate('/talentos/criar')}>Criar publicação</button></section> : null}
        <section className="talents-grid">
          {visible.map((item) => (
            <article className={`talent-card ${item.media_kind === 'video' ? 'is-video' : ''}`} key={item.id}>
              {item.media_url ? <div className="talent-media">{item.media_kind === 'video' ? <video src={item.media_url} controls preload="metadata" /> : <img src={item.media_url} alt={item.talent_title || 'Talento publicado'} />}</div> : <div className="talent-written-mark">“</div>}
              <div className="talent-card-body">
                {item.moderation_status === 'pending' ? <span className="talent-review-badge">Aguardando análise</span> : null}
                <span className="talent-category">{labelFor(item.talent_category)}</span>
                <h2>{item.talent_title || 'Criação sem título'}</h2>
                {item.content ? <p>{item.content}</p> : null}
                <footer>
                  <button type="button" className="talent-author" onClick={() => item.author?.username && navigate(`/usuario/${item.author.username}`)}>
                    <ProfileAvatar src={item.author?.foto_url} name={item.author?.nome} alt={item.author?.nome || 'Autor'} />
                    <span><b>{item.author?.nome || 'Pessoa do NEXO'}</b><small>@{item.author?.username || 'nexo'}</small></span>
                  </button>
                  <div className="talent-actions">
                    {item.moderation_status === 'approved' ? <><button type="button" className={item.liked ? 'liked' : ''} onClick={() => void toggleLike(item)}>✦ {item.likes || ''}</button><button type="button" onClick={() => navigate(`/?post=${item.id}`)}>Comentar</button></> : null}
                    {item.profile_id !== me?.id ? <button type="button" onClick={() => openReportDialog({ targetType: item.media_kind || 'post', targetId: item.id, reportedProfileId: item.profile_id, label: 'talento' })}>•••</button> : null}
                  </div>
                </footer>
              </div>
            </article>
          ))}
        </section>
      </main>
      <BottomNav />
    </div>
  )
}
