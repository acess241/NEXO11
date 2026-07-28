import { useEffect, useState } from 'react'

function formatarTempoRelativo(dataIso) {
  const data = new Date(dataIso)
  const agora = new Date()
  const diff = Math.floor((agora - data) / 1000)

  if (diff < 60) return 'agora'
  if (diff < 3600) return `${Math.floor(diff / 60)} min`
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`
  return `${Math.floor(diff / 86400)} d`
}

function storyEhVideo(story) {
  if (`${story?.media_kind || ''}`.toLowerCase() === 'video') return true
  return /\.(mp4|webm|mov|m4v|ogg)(?:$|[?#])/i.test(`${story?.media_url || ''}`)
}

function StoryViewer({
  grupo,
  perfilAtual,
  onClose,
  onNextGroup,
  onPrevGroup,
  onStoryViewed,
  onOpenProfile,
  onDeleteStory,
}) {
  const [indiceAtual, setIndiceAtual] = useState(0)
  const [apagando, setApagando] = useState(false)

  const storyAtual = grupo?.stories?.[indiceAtual]
  const ehVideo = storyEhVideo(storyAtual)
  const ehMeuStory = Boolean(
    perfilAtual?.id &&
      storyAtual?.profile_id &&
      storyAtual.profile_id === perfilAtual.id
  )

  useEffect(() => {
    setIndiceAtual(0)
    setApagando(false)
  }, [grupo?.perfil?.id])

  useEffect(() => {
    if (!storyAtual || !perfilAtual || apagando) return

    onStoryViewed(storyAtual.id)

    if (storyEhVideo(storyAtual)) return undefined

    const duracao = (storyAtual.duration_seconds || 15) * 1000
    const timer = setTimeout(() => {
      if (indiceAtual < grupo.stories.length - 1) {
        setIndiceAtual((prev) => prev + 1)
      } else {
        onNextGroup()
      }
    }, duracao)

    return () => clearTimeout(timer)
  }, [storyAtual, indiceAtual, grupo, onNextGroup, onStoryViewed, perfilAtual, apagando])

  useEffect(() => {
    if (!grupo?.stories?.length) return

    setIndiceAtual((prev) => Math.min(prev, grupo.stories.length - 1))
  }, [grupo?.stories?.length])

  if (!grupo || !storyAtual) return null

  function abrirPerfilDoStory() {
    if (!grupo.perfil?.username || !onOpenProfile) return
    onOpenProfile(grupo.perfil.username)
  }

  function avancar() {
    if (indiceAtual < grupo.stories.length - 1) {
      setIndiceAtual((prev) => prev + 1)
    } else {
      onNextGroup()
    }
  }

  function voltar() {
    if (indiceAtual > 0) {
      setIndiceAtual((prev) => prev - 1)
    } else {
      onPrevGroup()
    }
  }

  async function apagarStoryAtual() {
    if (!storyAtual || !ehMeuStory || !onDeleteStory || apagando) return

    const confirmou = window.confirm('Apagar este story?')
    if (!confirmou) return

    setApagando(true)
    try {
      await onDeleteStory(storyAtual)
    } finally {
      setApagando(false)
    }
  }

  return (
    <div className="story-viewer-overlay">
      <div className="story-viewer-box">
        <div className="story-progress-list">
          {grupo.stories.map((story, index) => (
            <div className="story-progress-track" key={story.id}>
              <div
                className={`story-progress-fill ${
                  index < indiceAtual
                    ? 'filled'
                    : index === indiceAtual
                    ? 'active'
                    : ''
                }`}
                style={
                  index === indiceAtual
                    ? {
                        animationDuration: `${storyAtual.duration_seconds || 15}s`,
                      }
                    : undefined
                }
              />
            </div>
          ))}
        </div>

        <div className="story-viewer-header">
          <button
            type="button"
            className="story-viewer-user"
            onClick={abrirPerfilDoStory}
            disabled={!grupo.perfil?.username}
          >
            {grupo.perfil?.foto_url ? (
              <img
                src={grupo.perfil.foto_url}
                alt={grupo.perfil.nome}
                className="story-viewer-avatar"
              />
            ) : (
              <div className="story-viewer-avatar fallback">
                {grupo.perfil?.nome?.charAt(0)?.toUpperCase() || 'S'}
              </div>
            )}

            <div>
              <strong>@{grupo.perfil?.username || 'story'}</strong>
              <p>{formatarTempoRelativo(storyAtual.created_at)}</p>
            </div>
          </button>

          <div className="story-viewer-actions">
            {ehMeuStory && onDeleteStory ? (
              <button
                type="button"
                className="story-delete-btn"
                onClick={apagarStoryAtual}
                disabled={apagando}
              >
                {apagando ? 'Apagando...' : 'Apagar'}
              </button>
            ) : null}

            <button
              type="button"
              className="story-close-btn"
              onClick={onClose}
            >
              x
            </button>
          </div>
        </div>

        <div className={`story-viewer-media-wrap ${ehVideo ? 'is-video' : ''}`}>
          <button
            type="button"
            className="story-click-zone left"
            onClick={voltar}
          />
          {ehVideo ? (
            <video
              key={storyAtual.id}
              src={storyAtual.media_url}
              className="story-viewer-media story-viewer-video"
              autoPlay
              playsInline
              controls
              preload="auto"
              onEnded={avancar}
            />
          ) : (
            <img
              src={storyAtual.media_url}
              alt="Story"
              className="story-viewer-media"
            />
          )}
          <button
            type="button"
            className="story-click-zone right"
            onClick={avancar}
          />
        </div>

        <div className="story-viewer-footer">
          <p className="story-duration-text">
            Duração: {storyAtual.duration_seconds || 15}s
          </p>
          {storyAtual.caption ? (
            <p className="story-caption">{storyAtual.caption}</p>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default function StoryBar({
  grupos,
  meuPerfil,
  onStoryViewed,
  onOpenCreateStory,
  onOpenProfile,
  onDeleteStory,
}) {
  const [grupoAbertoIndex, setGrupoAbertoIndex] = useState(null)

  const grupoAberto =
    grupoAbertoIndex !== null ? grupos[grupoAbertoIndex] : null

  useEffect(() => {
    if (grupoAbertoIndex === null) return

    if (!grupos.length) {
      setGrupoAbertoIndex(null)
      return
    }

    if (grupoAbertoIndex > grupos.length - 1) {
      setGrupoAbertoIndex(grupos.length - 1)
    }
  }, [grupos, grupoAbertoIndex])

  function abrirGrupo(index) {
    setGrupoAbertoIndex(index)
  }

  function fecharGrupo() {
    setGrupoAbertoIndex(null)
  }

  function proximoGrupo() {
    if (grupoAbertoIndex === null) return

    if (grupoAbertoIndex < grupos.length - 1) {
      setGrupoAbertoIndex((prev) => prev + 1)
    } else {
      setGrupoAbertoIndex(null)
    }
  }

  function grupoAnterior() {
    if (grupoAbertoIndex === null) return
    if (grupoAbertoIndex > 0) {
      setGrupoAbertoIndex((prev) => prev - 1)
    }
  }

  return (
    <>
      <div className="stories-bar insta-stories-bar">
        <div className="story-item insta-story-item">
          <div className="story-ring minha-story">
            {meuPerfil?.foto_url ? (
              <img
                src={meuPerfil.foto_url}
                alt={meuPerfil.nome}
                className="story-avatar"
              />
            ) : (
              <div className="story-avatar-fallback">
                {meuPerfil?.nome?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            )}

            <button
              type="button"
              className="story-add"
              onClick={onOpenCreateStory}
            >
              +
            </button>
          </div>
          <span className="story-name">Seu story</span>
        </div>

        {grupos.map((grupo, index) => {
          const temNaoVisto = grupo.stories.some((story) => !story.visto)
          const usernameGrupo = grupo.perfil?.username || ''

          return (
            <div className="story-item insta-story-item" key={grupo.perfil.id}>
              <button
                type="button"
                className="story-open-btn"
                onClick={() => abrirGrupo(index)}
              >
                <div className={`story-ring ${temNaoVisto ? 'ativo' : 'visto'}`}>
                  {grupo.perfil?.foto_url ? (
                    <img
                      src={grupo.perfil.foto_url}
                      alt={grupo.perfil.nome}
                      className="story-avatar"
                    />
                  ) : (
                    <div className="story-avatar-fallback">
                      {grupo.perfil?.nome?.charAt(0)?.toUpperCase() || 'S'}
                    </div>
                  )}
                </div>
              </button>

              <button
                type="button"
                className="story-name-btn story-name"
                onClick={() => {
                  if (usernameGrupo && onOpenProfile) {
                    onOpenProfile(usernameGrupo)
                  }
                }}
                disabled={!usernameGrupo}
                aria-label={`Abrir perfil de ${usernameGrupo || 'usuario'}`}
              >
                @{usernameGrupo || 'story'}
              </button>
            </div>
          )
        })}
      </div>

      {grupoAberto && (
        <StoryViewer
          grupo={grupoAberto}
          perfilAtual={meuPerfil}
          onClose={fecharGrupo}
          onNextGroup={proximoGrupo}
          onPrevGroup={grupoAnterior}
          onStoryViewed={onStoryViewed}
          onOpenProfile={onOpenProfile}
          onDeleteStory={onDeleteStory}
        />
      )}
    </>
  )
}
