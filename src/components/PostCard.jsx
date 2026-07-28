import { useEffect, useState } from 'react'
import { normalizarTipoPost, obterMediaKind, POST_TYPE_META } from '../lib/postTypes'
import { formatDisplayName } from '../lib/textFormat'
import VerifiedBadge from './VerifiedBadge'

function formatarData(dataIso) {
  const data = new Date(dataIso)

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
}) {
  const tipo = normalizarTipoPost(post.post_type)
  const mediaKind = obterMediaKind(post)
  const usernameAutor = post.autor?.username
  const podeAbrirPerfilAutor = Boolean(abrirPerfil && usernameAutor)
  const [mediaComErro, setMediaComErro] = useState(false)

  useEffect(() => {
    setMediaComErro(false)
  }, [post.id, post.media_url])

  const nomeAutor = formatDisplayName(post.autor?.nome) || 'Usuário'
  const labelFallback = mediaKind === 'video' ? 'Vídeo indisponível' : 'Mídia indisponível'

  return (
    <div className="post-card">
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

      {tipo === 'nota' && post.content ? <p className="post-content">{post.content}</p> : null}

      {tipo !== 'nota' ? (
        <div className="post-media-wrap">
          {post.media_url && !mediaComErro ? (
            mediaKind === 'video' ? (
              <video
                className="post-media"
                src={post.media_url}
                controls
                playsInline
                preload="metadata"
                onError={() => setMediaComErro(true)}
              />
            ) : (
              <img
                className="post-media"
                src={post.media_url}
                alt={post.content || POST_TYPE_META[tipo].label}
                onError={() => setMediaComErro(true)}
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

      {tipo !== 'nota' && post.content ? <p className="post-caption">{post.content}</p> : null}

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
