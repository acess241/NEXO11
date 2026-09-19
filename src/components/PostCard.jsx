import { useEffect, useState } from 'react'
import { normalizarTipoPost, obterMediaKind, POST_TYPE_META } from '../lib/postTypes'
import { formatDisplayName } from '../lib/textFormat'
import VerifiedBadge from './VerifiedBadge'
import MentionText from './MentionText'
import { criarUrlAssinadaParaMidia } from '../lib/storageMedia'
import { compartilharPublicacao } from '../lib/share'

function formatarData(dataIso) {
  const data = new Date(dataIso)
  if (Number.isNaN(data.getTime())) return ''

  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function PostCard({
  post,
  comentariosAbertos,
  setComentariosAbertos,
  alternarCurtidaPost,
  alternarRepost,
  novoComentario,
  setNovoComentario,
  comentar,
  renderComentarios,
  setPostParaApagar,
  abrirPerfil,
  IconeEstrela,
  IconeComentarios,
  IconeRepost,
  destacado = false,
  onShare,
  onAddToStory,
}) {
  const tipo = normalizarTipoPost(post.post_type)
  const mediaKind = obterMediaKind(post)
  const usernameAutor = post.autor?.username
  const podeAbrirPerfilAutor = Boolean(abrirPerfil && usernameAutor)
  const [mediaComErro, setMediaComErro] = useState(false)
  const [mediaSrc, setMediaSrc] = useState(post.media_url || '')
  const [tentouUrlAssinada, setTentouUrlAssinada] = useState(false)
  const [compartilhando, setCompartilhando] = useState(false)

  useEffect(() => {
    setMediaComErro(false)
    setMediaSrc(post.media_url || '')
    setTentouUrlAssinada(false)
  }, [post.id, post.media_url])

  async function recuperarMidia() {
    if (!tentouUrlAssinada) {
      setTentouUrlAssinada(true)
      const assinada = await criarUrlAssinadaParaMidia(post.media_url)
      if (assinada) {
        setMediaSrc(assinada)
        return
      }
    }
    setMediaComErro(true)
  }

  async function compartilharPost() {
    if (compartilhando) return
    setCompartilhando(true)
    try {
      if (onShare) {
        await onShare(post)
      } else {
        await compartilharPublicacao({
          id: post.id,
          tipo: tipo === 'nexis' ? 'nexis' : 'post',
          title: post.content ? `Publicação no NEXO: ${post.content.slice(0, 72)}` : 'Publicação no NEXO',
          text: post.content || 'Veja esta publicação no NEXO',
          imageUrl: post.media_url || '',
          onCopied: () => window.alert('Link da publicação copiado.'),
        })
      }
    } catch (error) {
      if (error?.name !== 'AbortError') window.alert('Não foi possível compartilhar agora.')
    } finally {
      setCompartilhando(false)
    }
  }

  const nomeAutor = formatDisplayName(post.autor?.nome) || 'Usuário'
  const labelFallback = mediaKind === 'video' ? 'Vídeo indisponível' : 'Mídia indisponível'

  return (
    <div id={`post-${post.id}`} className={`post-card ${destacado ? 'is-shared-target' : ''}`}>
      <button
        type="button"
        className={`post-header post-author-btn ${podeAbrirPerfilAutor ? 'is-clickable' : ''}`}
        onClick={() => {
          if (podeAbrirPerfilAutor) {
            abrirPerfil(usernameAutor)
          }
        }}
        disabled={!podeAbrirPerfilAutor}
      >
        <div className="mini-avatar">
          {post.autor?.foto_url ? <img src={post.autor.foto_url} alt={nomeAutor} /> : nomeAutor.charAt(0).toUpperCase()}
        </div>

        <div>
          <strong>{nomeAutor}</strong>
          <p className="post-username verified-handle-row">
            @{post.autor?.username || 'username'}
            <VerifiedBadge verified={post.autor?.is_verified} />
          </p>
          <div className="post-meta-row">
            <p className="post-date">{formatarData(post.created_at)}</p>
            <span className={`post-type-chip ${tipo}`}>{POST_TYPE_META[tipo].label}</span>
          </div>
        </div>
      </button>

      {tipo === 'nota' && post.content ? (
        <p className="post-content">
          <MentionText text={post.content} />
        </p>
      ) : null}

      {tipo !== 'nota' ? (
        <div className="post-media-wrap">
          {post.media_url && !mediaComErro ? (
            mediaKind === 'video' ? (
              <video
                className="post-media"
                src={mediaSrc}
                controls
                playsInline
                preload="metadata"
                onError={recuperarMidia}
              />
            ) : (
              <img
                className="post-media"
                src={mediaSrc}
                alt={post.content || POST_TYPE_META[tipo].label}
                onError={recuperarMidia}
              />
            )
          ) : (
            <div className="post-media-fallback">
              <strong>{labelFallback}</strong>
              <span>Não foi possível carregar este arquivo.</span>
            </div>
          )}
        </div>
      ) : null}

      {tipo !== 'nota' && post.content ? (
        <p className="post-caption">
          <MentionText text={post.content} />
        </p>
      ) : null}

      <div className="post-actions">
        <button
          className={`icon-action-btn ${post.euCurti ? 'active-like' : ''}`}
          onClick={() => alternarCurtidaPost(post.id, post.euCurti)}
        >
          <IconeEstrela preenchida={post.euCurti} />
          <span>{post.totalCurtidas}</span>
        </button>

        <button
          className={`icon-action-btn ${comentariosAbertos[post.id] ? 'active-comment' : ''}`}
          onClick={() =>
            setComentariosAbertos((prev) => ({
              ...prev,
              [post.id]: !prev[post.id],
            }))
          }
        >
          <IconeComentarios />
          <span>{post.totalComentarios}</span>
        </button>

        <button
          className={`icon-action-btn ${post.euRepostei ? 'active-repost' : ''}`}
          onClick={() => alternarRepost(post.id, post.euRepostei)}
        >
          <IconeRepost />
          <span>{post.totalReposts}</span>
        </button>

        <button
          type="button"
          className="action-btn share-post-btn action-icon-only"
          onClick={compartilharPost}
          disabled={compartilhando}
          aria-label={compartilhando ? 'Abrindo compartilhamento' : `Compartilhar ${tipo === 'nexis' ? 'Nexis' : 'publicação'}`}
          title={compartilhando ? 'Abrindo compartilhamento' : `Compartilhar ${tipo === 'nexis' ? 'Nexis' : 'publicação'}`}
        >
          {compartilhando ? '…' : '↗'}
        </button>

        {onAddToStory ? (
          <button
            type="button"
            className="action-btn story-post-btn action-icon-only"
            onClick={() => onAddToStory(post)}
            aria-label={`Adicionar ${tipo === 'nexis' ? 'Nexis' : 'publicação'} ao story`}
            title={`Adicionar ${tipo === 'nexis' ? 'Nexis' : 'publicação'} ao story`}
          >
            ＋
          </button>
        ) : null}

        {post.ehMeuPost && (
          <button className="action-btn delete-btn" onClick={() => setPostParaApagar(post.id)}>
            Apagar
          </button>
        )}
      </div>

      {comentariosAbertos[post.id] && (
        <div className="comments-box">
          <div className="comment-form compact-comment-form">
            <input
              className="input small-comment-input"
              type="text"
              placeholder="Escreva um comentário..."
              value={novoComentario[post.id] || ''}
              onChange={(e) =>
                setNovoComentario((prev) => ({
                  ...prev,
                  [post.id]: e.target.value,
                }))
              }
            />

            <button className="btn small-submit-btn" type="button" onClick={() => comentar(post.id)}>
              Enviar
            </button>
          </div>

          {(post.comentarios || []).length === 0 ? (
            <p className="comment-empty">Ainda não há comentários.</p>
          ) : (
            renderComentarios(post)
          )}
        </div>
      )}
    </div>
  )
}
