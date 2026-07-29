import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import VerifiedBadge from '../components/VerifiedBadge'
import MentionText from '../components/MentionText'
import { criarUrlAssinadaParaMidia } from '../lib/storageMedia'
import { supabase } from '../lib/supabase'

function NexisVideo({ item, ativo, mudo, onMediaError, onProgress, onTogglePause }) {
  const ref = useRef(null)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    if (ativo) void video.play().catch(() => {})
    else video.pause()
  }, [ativo])
  return <video ref={ref} src={item.playUrl || item.media_url} loop muted={mudo} playsInline preload="metadata"
    onClick={(event) => {
      if (event.currentTarget.paused) void event.currentTarget.play()
      else event.currentTarget.pause()
      onTogglePause(event.currentTarget.paused)
    }}
    onTimeUpdate={(event) => onProgress(item.id, event.currentTarget.duration ? event.currentTarget.currentTime / event.currentTarget.duration : 0)}
    onError={() => onMediaError(item)} />
}

export default function NexisFeed() {
  const [itens, setItens] = useState([])
  const [meuPerfil, setMeuPerfil] = useState(null)
  const [ativoId, setAtivoId] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [comentando, setComentando] = useState(null)
  const [comentario, setComentario] = useState('')
  const [mudo, setMudo] = useState(true)
  const [pausado, setPausado] = useState(false)
  const [progresso, setProgresso] = useState({})
  const [seguindo, setSeguindo] = useState(new Set())
  const [coracao, setCoracao] = useState(null)
  const containerRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => { void carregar() }, [])

  useEffect(() => {
    if (!ativoId || !meuPerfil?.id) return
    void supabase.from('nexis_views').upsert(
      { post_id: ativoId, profile_id: meuPerfil.id, viewed_at: new Date().toISOString() },
      { onConflict: 'post_id,profile_id' }
    )
  }, [ativoId, meuPerfil?.id])

  useEffect(() => {
    const root = containerRef.current
    if (!root) return undefined
    const observer = new IntersectionObserver((entries) => {
      const visivel = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
      if (visivel?.target?.dataset?.id) setAtivoId(visivel.target.dataset.id)
    }, { root, threshold: [0.55, 0.8] })
    root.querySelectorAll('.nexis-reel').forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [itens.length])

  async function carregar() {
    setCarregando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return navigate('/auth')
      const { data: perfil, error: perfilErro } = await supabase.from('profiles').select('*').eq('account_id', user.id).single()
      if (perfilErro) throw perfilErro
      setMeuPerfil(perfil)
      const { data: posts, error: postsErro } = await supabase.from('posts').select('*').eq('post_type', 'nexis').order('created_at', { ascending: false }).limit(150)
      if (postsErro) throw postsErro
      const idsPerfis = [...new Set((posts || []).map((post) => post.profile_id))]
      const idsPosts = (posts || []).map((post) => post.id)
      const [perfisResp, likesResp, commentsResp, followsResp] = await Promise.all([
        idsPerfis.length ? supabase.from('profiles').select('id,nome,username,foto_url,bio,is_private,is_verified').in('id', idsPerfis) : { data: [] },
        idsPosts.length ? supabase.from('post_likes').select('post_id,profile_id').in('post_id', idsPosts) : { data: [] },
        idsPosts.length ? supabase.from('comments').select('id,post_id,profile_id,content,created_at').in('post_id', idsPosts).order('created_at') : { data: [] },
        supabase.from('follows').select('following_profile_id').eq('follower_profile_id', perfil.id),
      ])
      const idsAutoresComentarios = [...new Set((commentsResp.data || []).map((item) => item.profile_id).filter((id) => !idsPerfis.includes(id)))]
      const { data: perfisComentarios } = idsAutoresComentarios.length
        ? await supabase.from('profiles').select('id,nome,username,foto_url,is_verified').in('id', idsAutoresComentarios)
        : { data: [] }
      const perfis = new Map([...(perfisResp.data || []), ...(perfisComentarios || [])].map((perfilItem) => [perfilItem.id, perfilItem]))
      setSeguindo(new Set((followsResp.data || []).map((follow) => follow.following_profile_id)))
      const finais = (posts || []).filter((post) => {
        const autor = perfis.get(post.profile_id)
        return autor && (!autor.is_private || autor.id === perfil.id)
      }).map((post) => ({
        ...post,
        autor: perfis.get(post.profile_id),
        euCurti: (likesResp.data || []).some((like) => like.post_id === post.id && like.profile_id === perfil.id),
        totalCurtidas: (likesResp.data || []).filter((like) => like.post_id === post.id).length,
        comentarios: (commentsResp.data || []).filter((item) => item.post_id === post.id).map((item) => ({ ...item, autor: perfis.get(item.profile_id) })),
      }))
      setItens(finais)
      setAtivoId(finais[0]?.id || null)
    } catch (error) {
      setErro(error?.message || 'Não foi possível carregar os Nexis.')
    } finally {
      setCarregando(false)
    }
  }

  async function alternarCurtida(item) {
    if (!meuPerfil) return
    if (item.euCurti) {
      const { error } = await supabase.from('post_likes').delete().eq('post_id', item.id).eq('profile_id', meuPerfil.id)
      if (error) return setErro(error.message)
    } else {
      const { error } = await supabase.from('post_likes').insert({ post_id: item.id, profile_id: meuPerfil.id })
      if (error && error.code !== '23505') return setErro(error.message)
    }
    setItens((prev) => prev.map((post) => post.id === item.id ? { ...post, euCurti: !post.euCurti, totalCurtidas: Math.max(0, post.totalCurtidas + (post.euCurti ? -1 : 1)) } : post))
  }

  async function curtirComDuploToque(item) {
    setCoracao(item.id)
    window.setTimeout(() => setCoracao(null), 650)
    if (!item.euCurti) await alternarCurtida(item)
  }

  async function alternarSeguir(autorId) {
    if (!meuPerfil || autorId === meuPerfil.id) return
    if (seguindo.has(autorId)) {
      const { error } = await supabase.from('follows').delete().eq('follower_profile_id', meuPerfil.id).eq('following_profile_id', autorId)
      if (error) return setErro(error.message)
      setSeguindo((prev) => { const proximo = new Set(prev); proximo.delete(autorId); return proximo })
    } else {
      const { error } = await supabase.from('follows').insert({ follower_profile_id: meuPerfil.id, following_profile_id: autorId })
      if (error && error.code !== '23505') return setErro(error.message)
      setSeguindo((prev) => new Set([...prev, autorId]))
    }
  }

  async function publicarComentario(event) {
    event.preventDefault()
    if (!comentando || !comentario.trim() || !meuPerfil) return
    const { data, error } = await supabase.from('comments').insert({ post_id: comentando.id, profile_id: meuPerfil.id, content: comentario.trim() }).select().single()
    if (error) return setErro(error.message)
    const novo = { ...data, autor: meuPerfil }
    setItens((prev) => prev.map((item) => item.id === comentando.id ? { ...item, comentarios: [...item.comentarios, novo] } : item))
    setComentando((prev) => ({ ...prev, comentarios: [...prev.comentarios, novo] }))
    setComentario('')
  }

  async function compartilhar(item) {
    const texto = `Veja este Nexis de @${item.autor.username}`
    if (navigator.share) return navigator.share({ title: 'Nexis', text: texto, url: item.media_url })
    await navigator.clipboard.writeText(`${texto}\n${item.media_url}`)
    window.alert('Link copiado.')
  }

  async function recuperarMidia(item) {
    if (item.tentouAssinada) return
    const url = await criarUrlAssinadaParaMidia(item.media_url)
    setItens((prev) => prev.map((post) => post.id === item.id ? { ...post, tentouAssinada: true, playUrl: url || post.playUrl } : post))
  }

  if (carregando) return <SocialLoader variant="feed" />

  return (
    <div className="nexis-page">
      <header className="nexis-topbar"><strong>NEXIS</strong><div><button type="button" onClick={() => setMudo((valor) => !valor)}>{mudo ? 'Som desligado' : 'Som ligado'}</button><button type="button" onClick={() => navigate('/novo-post?tipo=nexis')}>Criar</button></div></header>
      {erro ? <div className="nexis-error">{erro}<button onClick={() => setErro('')}>×</button></div> : null}
      <main className="nexis-scroll" ref={containerRef}>
        {itens.map((item) => (
          <article className="nexis-reel" data-id={item.id} key={item.id} onDoubleClick={() => curtirComDuploToque(item)}>
            <NexisVideo item={item} ativo={ativoId === item.id} mudo={mudo} onMediaError={recuperarMidia} onProgress={(id, valor) => setProgresso((prev) => ({ ...prev, [id]: valor }))} onTogglePause={setPausado} />
            <div className="nexis-shade" />
            <div className="nexis-video-progress"><span style={{ width: `${(progresso[item.id] || 0) * 100}%` }} /></div>
            {pausado && ativoId === item.id ? <div className="nexis-paused">▶</div> : null}
            {coracao === item.id ? <div className="nexis-heart-burst">♥</div> : null}
            <div className="nexis-author" onClick={() => navigate(`/usuario/${item.autor.username}`)}>
              {item.autor.foto_url ? <img src={item.autor.foto_url} alt="" /> : <span>{item.autor.nome?.charAt(0)}</span>}
              <div><strong>@{item.autor.username}<VerifiedBadge verified={item.autor.is_verified} /></strong><small>{item.autor.nome}</small></div>
              {item.autor.id !== meuPerfil?.id ? <button type="button" onClick={(event) => { event.stopPropagation(); void alternarSeguir(item.autor.id) }}>{seguindo.has(item.autor.id) ? 'Seguindo' : 'Seguir'}</button> : null}
            </div>
            <div className="nexis-caption"><MentionText text={item.content || ''} /></div>
            <aside className="nexis-actions">
              <button type="button" className={item.euCurti ? 'liked' : ''} onClick={() => alternarCurtida(item)}><b>{item.euCurti ? '♥' : '♡'}</b><span>{item.totalCurtidas}</span></button>
              <button type="button" onClick={() => setComentando(item)}><b>◯</b><span>{item.comentarios.length}</span></button>
              <button type="button" onClick={() => compartilhar(item)}><b>⌁</b><span>Enviar</span></button>
            </aside>
          </article>
        ))}
        {!itens.length ? <div className="nexis-empty"><h2>Nenhum Nexis ainda</h2><p>Publique o primeiro vídeo curto.</p><button onClick={() => navigate('/novo-post')}>Criar Nexis</button></div> : null}
      </main>
      {comentando ? (
        <div className="nexis-comments-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setComentando(null)}>
          <section className="nexis-comments-sheet">
            <header><strong>Comentários</strong><button onClick={() => setComentando(null)}>×</button></header>
            <div>{comentando.comentarios.map((item) => <article className="nexis-comment" key={item.id}>{item.autor?.foto_url ? <img src={item.autor.foto_url} alt="" /> : <span>{item.autor?.nome?.charAt(0) || 'U'}</span>}<p><strong>@{item.autor?.username || 'usuario'}</strong>{item.content}</p></article>)}{!comentando.comentarios.length ? <small>Seja o primeiro a comentar.</small> : null}</div>
            <form onSubmit={publicarComentario}><input value={comentario} onChange={(event) => setComentario(event.target.value)} placeholder="Adicione um comentário..." maxLength={500} /><button disabled={!comentario.trim()}>Publicar</button></form>
          </section>
        </div>
      ) : null}
      <BottomNav />
    </div>
  )
}
