import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import { formatDisplayName } from '../lib/textFormat'
import { supabase } from '../lib/supabase'

export default function CommentedPosts() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [itens, setItens] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    void carregar()
  }, [])

  async function carregar() {
    try {
      setCarregando(true)
      setErro('')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/auth')
        return
      }

      const { data: perfil } = await supabase.from('profiles').select('id').eq('account_id', user.id).single()
      if (!perfil?.id) {
        setItens([])
        return
      }

      const { data: comentariosResp, error: comentariosErro } = await supabase
        .from('comments')
        .select('id, post_id, content, created_at')
        .eq('profile_id', perfil.id)
        .order('created_at', { ascending: false })
        .limit(180)

      if (comentariosErro) throw comentariosErro

      const comentarios = comentariosResp || []
      const comentariosPorPost = new Map()

      comentarios.forEach((comentario) => {
        const atual = comentariosPorPost.get(comentario.post_id) || []
        atual.push(comentario)
        comentariosPorPost.set(comentario.post_id, atual)
      })

      const idsPosts = [...comentariosPorPost.keys()].filter(Boolean)
      if (idsPosts.length === 0) {
        setItens([])
        return
      }

      const { data: postsResp, error: postsErro } = await supabase.from('posts').select('*').in('id', idsPosts)
      if (postsErro) throw postsErro

      const idsAutores = [...new Set((postsResp || []).map((post) => post.profile_id).filter(Boolean))]
      const { data: autoresResp, error: autoresErro } = idsAutores.length
        ? await supabase.from('profiles').select('id, nome, username, foto_url').in('id', idsAutores)
        : { data: [], error: null }

      if (autoresErro) throw autoresErro

      const mapPost = new Map((postsResp || []).map((post) => [post.id, post]))
      const mapAutor = new Map((autoresResp || []).map((autor) => [autor.id, autor]))

      const lista = idsPosts
        .map((postId) => {
          const post = mapPost.get(postId)
          if (!post) return null
          const comentariosDoPost = comentariosPorPost.get(postId) || []

          return {
            id: post.id,
            content: post.content || '',
            totalCurtidas: Number(post.total_likes || 0),
            totalComentarios: Number(post.total_comments || 0),
            autor: mapAutor.get(post.profile_id),
            meusComentarios: comentariosDoPost.length,
          }
        })
        .filter(Boolean)

      setItens(lista)
    } catch {
      setErro('Não foi possível carregar seus comentários agora.')
    } finally {
      setCarregando(false)
    }
  }

  if (carregando) return <SocialLoader variant="feed" showBottomNav />

  return (
    <div className="container">
      <div className="topbar settings-topbar">
        <button type="button" className="edit-back-btn" onClick={() => navigate('/perfil')}>
          Voltar
        </button>
        <h1>Comentados</h1>
        <button type="button" className="edit-save-link" onClick={carregar}>
          Atualizar
        </button>
      </div>

      <div className="page settings-page">
        <p className="settings-kicker">Publicações onde você comentou</p>
        {erro ? <div className="alert-box erro-box">{erro}</div> : null}

        {itens.length === 0 ? (
          <div className="empty-state settings-empty">
            <p>Você ainda não comentou em publicações.</p>
          </div>
        ) : (
          <div className="settings-list">
            {itens.map((item) => (
              <button
                key={item.id}
                type="button"
                className="settings-list-card"
                onClick={() => (item.autor?.username ? navigate(`/usuario/${item.autor.username}`) : navigate('/'))}
              >
                <div className="settings-list-avatar">
                  {item.autor?.foto_url ? (
                    <img
                      src={item.autor.foto_url}
                      alt={formatDisplayName(item.autor?.nome) || item.autor?.username}
                    />
                  ) : (
                    <span>{formatDisplayName(item.autor?.nome)?.charAt(0)?.toUpperCase() || 'P'}</span>
                  )}
                </div>
                <div className="settings-list-copy">
                  <strong>{formatDisplayName(item.autor?.nome) || 'Publicação sem título'}</strong>
                  <span>@{item.autor?.username || 'usuario'}</span>
                  {item.content?.trim() ? <p>{item.content}</p> : null}
                  <small>
                    {item.meusComentarios} comentário(s) - {item.totalCurtidas} curtida(s)
                  </small>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
