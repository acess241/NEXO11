import { useEffect, useMemo, useState } from 'react'
import { POST_TYPE_META, normalizarTipoPost, obterMediaKind } from '../lib/postTypes'

function IconeNotas() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 3h8l5 5v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </svg>
  )
}

function IconeFoto() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function IconeRaio() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  )
}

function IconeRepublicado() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="17 1 21 5 17 9" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

const TABS = [
  {
    key: 'nota',
    icon: IconeNotas,
  },
  {
    key: 'foto',
    icon: IconeFoto,
  },
  {
    key: 'nexis',
    icon: IconeRaio,
  },
  {
    key: 'republicados',
    icon: IconeRepublicado,
  },
]

function formatarData(dataIso) {
  const data = new Date(dataIso)

  return data.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function MediaFallback({ className, label }) {
  return (
    <div className={className}>
      <span>{label}</span>
    </div>
  )
}

function ProfileGridMedia({ post, meta }) {
  const mediaKind = obterMediaKind(post)
  const [mediaComErro, setMediaComErro] = useState(false)

  useEffect(() => {
    setMediaComErro(false)
  }, [post.id, post.media_url])

  const label = mediaKind === 'video' ? 'Vídeo indisponível' : 'Mídia indisponível'

  if (!post.media_url || mediaComErro) {
    return <MediaFallback className="profile-grid-media profile-grid-media-fallback" label={label} />
  }

  if (mediaKind === 'video') {
    return (
      <video
        className="profile-grid-media"
        src={post.media_url}
        muted
        playsInline
        preload="metadata"
        onError={() => setMediaComErro(true)}
      />
    )
  }

  return (
    <img
      className="profile-grid-media"
      src={post.media_url}
      alt={post.content || meta.label}
      onError={() => setMediaComErro(true)}
    />
  )
}

function ProfileModalMedia({ post, meta }) {
  const mediaKind = obterMediaKind(post)
  const [mediaComErro, setMediaComErro] = useState(false)

  useEffect(() => {
    setMediaComErro(false)
  }, [post.id, post.media_url])

  if (!post.media_url || mediaComErro) {
    return <MediaFallback className="profile-ig-modal-media-wrap profile-ig-modal-media-fallback" label="Mídia indisponível" />
  }

  return (
    <div className="profile-ig-modal-media-wrap">
      {mediaKind === 'video' ? (
        <video
          className="profile-ig-modal-media"
          src={post.media_url}
          controls
          playsInline
          preload="metadata"
          onError={() => setMediaComErro(true)}
        />
      ) : (
        <img
          className="profile-ig-modal-media"
          src={post.media_url}
          alt={post.content || meta.label}
          onError={() => setMediaComErro(true)}
        />
      )}
    </div>
  )
}

export default function ProfileBlocks({
  posts,
  republicados = [],
  titulo = 'Publicações',
  descricao = 'Toque em uma publicação para abrir.',
  emptyTitle = 'Nada por aqui ainda',
  emptyDescription = 'Quando algo for publicado, vai aparecer aqui.',
}) {
  const [blocoAtivo, setBlocoAtivo] = useState('foto')
  const [postAbertoId, setPostAbertoId] = useState(null)

  const contagens = useMemo(() => {
    return (posts || []).reduce(
      (acc, post) => {
        const tipo = normalizarTipoPost(post.post_type)
        acc[tipo] += 1
        return acc
      },
      { nota: 0, foto: 0, nexis: 0, republicados: republicados.length }
    )
  }, [posts, republicados.length])

  useEffect(() => {
    if (contagens[blocoAtivo] > 0) return

    const primeiraComConteudo = TABS.find((tab) => contagens[tab.key] > 0)

    if (primeiraComConteudo) {
      setBlocoAtivo(primeiraComConteudo.key)
    } else {
      setBlocoAtivo('nota')
    }
  }, [blocoAtivo, contagens])

  const postsFiltrados = useMemo(() => {
    if (blocoAtivo === 'republicados') return republicados || []

    return (posts || []).filter((post) => normalizarTipoPost(post.post_type) === blocoAtivo)
  }, [blocoAtivo, posts, republicados])

  useEffect(() => {
    if (!postAbertoId) return

    const aindaExiste = postsFiltrados.some((post) => post.id === postAbertoId)
    if (!aindaExiste) {
      setPostAbertoId(null)
    }
  }, [postsFiltrados, postAbertoId])

  useEffect(() => {
    if (!postAbertoId) return

    const timer = window.setTimeout(() => {
      const alvo = document.getElementById(`profile-feed-item-${postAbertoId}`)
      alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 80)

    return () => window.clearTimeout(timer)
  }, [postAbertoId])

  return (
    <>
      <section className="profile-section-header profile-ig-section-header">
        <div>
          <p className="profile-section-kicker">Perfil</p>
          <h3>{titulo}</h3>
        </div>
        <span>{descricao}</span>
      </section>

      <div className="profile-block-tabs profile-ig-tabs" role="tablist">
        {TABS.map((tab) => {
          const Icone = tab.icon
          const meta = tab.key === 'republicados' ? { label: 'Republicados' } : POST_TYPE_META[tab.key]
          const ativo = blocoAtivo === tab.key

          return (
            <button
              key={tab.key}
              type="button"
              className={`profile-block-btn ${ativo ? 'active' : ''}`}
              onClick={() => setBlocoAtivo(tab.key)}
              role="tab"
              aria-selected={ativo}
              aria-label={meta.label}
            >
              <span className="profile-block-icon" aria-hidden="true">
                <Icone />
              </span>

              <span className="profile-block-copy">
                <strong>{meta.label}</strong>
              </span>

              <span className="profile-block-count">{contagens[tab.key]}</span>
            </button>
          )
        })}
      </div>

      {postsFiltrados.length === 0 ? (
        <div className="empty-state profile-empty-state">
          <h3>{emptyTitle}</h3>
          <p>{emptyDescription}</p>
        </div>
      ) : (
        <div className="profile-grid insta-grid profile-block-grid">
          {postsFiltrados.map((post) => renderItem(post, blocoAtivo, () => setPostAbertoId(post.id)))}
        </div>
      )}

      {postAbertoId ? (
        <div className="profile-ig-modal-overlay" onClick={() => setPostAbertoId(null)} role="dialog" aria-modal="true">
          <article className="profile-ig-modal profile-ig-feed-modal" onClick={(event) => event.stopPropagation()}>
            <div className="profile-ig-feed-head">
              <strong>Feed do perfil</strong>
              <button
                type="button"
                className="profile-ig-modal-close"
                onClick={() => setPostAbertoId(null)}
                aria-label="Fechar publicação"
              >
                x
              </button>
            </div>

            <div className="profile-ig-feed-list">
              {postsFiltrados.map((post) => renderPostFeedCard(post, blocoAtivo, formatarData, post.id === postAbertoId))}
            </div>
          </article>
        </div>
      ) : null}
    </>
  )
}

function renderItem(post, blocoAtivo, aoAbrir) {
  const tipoBase = blocoAtivo === 'republicados' ? normalizarTipoPost(post.post_type) : blocoAtivo
  const metaBase = POST_TYPE_META[tipoBase]
  const ehNota = tipoBase === 'nota'

  if (ehNota) {
    return (
      <button
        type="button"
        key={post.id}
        className={`profile-grid-item profile-note-grid-card ${blocoAtivo === 'republicados' ? 'reposted' : ''}`}
        onClick={aoAbrir}
      >
        <div className="profile-note-grid-top">
          <div className="profile-note-grid-leading">
            <span className="profile-note-grid-icon">
              <IconeNotas />
            </span>
            {blocoAtivo === 'republicados' ? (
              <span className="profile-grid-repost-badge note-badge">
                <IconeRepublicado />
              </span>
            ) : null}
          </div>
          <span className="profile-note-date">nota</span>
        </div>

        <p className="profile-note-grid-text">{post.content || 'Sem texto nesta nota.'}</p>
      </button>
    )
  }

  const mediaKind = obterMediaKind(post)

  return (
    <button
      type="button"
      key={post.id}
      className="profile-grid-item profile-grid-item-button"
      onClick={aoAbrir}
      aria-label={`Abrir ${metaBase.label}`}
    >
      <ProfileGridMedia post={post} meta={metaBase} />

      {mediaKind === 'video' ? (
        <span className="profile-grid-video-badge">
          <IconeRaio />
        </span>
      ) : null}

      {blocoAtivo === 'republicados' ? (
        <span className="profile-grid-repost-badge">
          <IconeRepublicado />
        </span>
      ) : null}

      <div className="profile-grid-overlay">
        <p>{post.content || metaBase.subtitle}</p>
      </div>
    </button>
  )
}

function renderPostFeedCard(post, blocoAtivo, formatarDataFn, focado = false) {
  const tipo = normalizarTipoPost(post.post_type)
  const meta = POST_TYPE_META[tipo]
  const ehRepublicado = blocoAtivo === 'republicados'

  return (
    <article
      id={`profile-feed-item-${post.id}`}
      key={`modal-${post.id}`}
      className={`profile-ig-feed-card ${focado ? 'focused' : ''}`}
    >
      <div className="profile-ig-modal-head">
        <div className="profile-ig-modal-head-left">
          <span className={`post-type-chip ${tipo}`}>{meta.label}</span>
          {ehRepublicado ? <span className="profile-ig-repost-pill">Republicado</span> : null}
        </div>
        <p>{formatarDataFn(post.created_at)}</p>
      </div>

      {tipo === 'nota' ? (
        <p className="profile-ig-modal-note">{post.content || 'Sem texto nesta nota.'}</p>
      ) : (
        <>
          <ProfileModalMedia post={post} meta={meta} />

          {post.content ? <p className="profile-ig-modal-caption">{post.content}</p> : null}
        </>
      )}
    </article>
  )
}
