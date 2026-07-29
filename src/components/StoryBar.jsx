import { useEffect, useState } from 'react'
import { criarUrlAssinadaParaMidia } from '../lib/storageMedia'

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
  onToggleLike,
  onReply,
  onShare,
  onLoadViewers,
}) {
  const [indiceAtual, setIndiceAtual] = useState(0)
  const [apagando, setApagando] = useState(false)
  const [musicaAtiva, setMusicaAtiva] = useState(true)
  const [resposta, setResposta] = useState('')
  const [enviandoResposta, setEnviandoResposta] = useState(false)
  const [visualizadores, setVisualizadores] = useState(null)
  const [carregandoVisualizadores, setCarregandoVisualizadores] = useState(false)
  const [erroMidia, setErroMidia] = useState(false)
  const [tentativaMidia, setTentativaMidia] = useState(0)
  const [mediaSrc, setMediaSrc] = useState('')
  const [tentouUrlAssinada, setTentouUrlAssinada] = useState(false)

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
    setMusicaAtiva(true)
    setResposta('')
    setVisualizadores(null)
    setErroMidia(false)
    setTentativaMidia(0)
    setMediaSrc(storyAtual?.media_url || '')
    setTentouUrlAssinada(false)
  }, [storyAtual?.id])

  async function tratarErroMidia() {
    if (!tentouUrlAssinada) {
      setTentouUrlAssinada(true)
      const assinada = await criarUrlAssinadaParaMidia(storyAtual?.media_url)
      if (assinada) {
        setMediaSrc(assinada)
        return
      }
    }
    setErroMidia(true)
  }

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

  async function enviarResposta(event) {
    event.preventDefault()
    if (!resposta.trim() || !onReply || enviandoResposta) return
    setEnviandoResposta(true)
    try {
      await onReply(storyAtual, resposta)
      setResposta('')
      window.alert('Mensagem enviada.')
    } catch (error) {
      window.alert(error?.message || 'Não foi possível enviar a mensagem.')
    } finally {
      setEnviandoResposta(false)
    }
  }

  async function abrirVisualizadores() {
    if (!ehMeuStory || !onLoadViewers) return
    setCarregandoVisualizadores(true)
    try {
      setVisualizadores(await onLoadViewers(storyAtual))
    } catch {
      setVisualizadores([])
    } finally {
      setCarregandoVisualizadores(false)
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
              key={`${storyAtual.id}-${tentativaMidia}`}
              src={mediaSrc || storyAtual.media_url}
              className="story-viewer-media story-viewer-video"
              autoPlay
              playsInline
              controls
              preload="auto"
              onEnded={avancar}
              onError={tratarErroMidia}
            />
          ) : (
            <img
              key={`${storyAtual.id}-${tentativaMidia}`}
              src={mediaSrc || storyAtual.media_url}
              alt="Story"
              className="story-viewer-media"
              onError={tratarErroMidia}
            />
          )}
          {erroMidia ? (
            <div className="story-media-error">
              <strong>Não foi possível carregar esta mídia</strong>
              <button type="button" onClick={() => {
                setErroMidia(false)
                setTentouUrlAssinada(false)
                setMediaSrc(storyAtual.media_url)
                setTentativaMidia((valor) => valor + 1)
              }}>Tentar novamente</button>
            </div>
          ) : null}
          {storyAtual.caption ? (
            <p
              className="story-caption-overlay"
              style={{
                left: `${Number(storyAtual.caption_x ?? 50)}%`,
                top: `${Number(storyAtual.caption_y ?? 72)}%`,
              }}
            >
              {storyAtual.caption}
            </p>
          ) : null}
          <button
            type="button"
            className="story-click-zone right"
            onClick={avancar}
          />
          {storyAtual.music_url ? (
            <audio
              key={`music-${storyAtual.id}`}
              src={storyAtual.music_url}
              autoPlay
              loop
              muted={!musicaAtiva}
              preload="auto"
              onLoadedMetadata={(event) => {
                const inicio = Number(storyAtual.music_start_seconds || 0)
                if (inicio > 0 && inicio < event.currentTarget.duration) event.currentTarget.currentTime = inicio
                event.currentTarget.volume = Math.min(1, Math.max(0, Number(storyAtual.music_volume ?? 0.75)))
              }}
            />
          ) : null}
          {storyAtual.music_url ? (
            <button type="button" className="story-viewer-music" onClick={() => setMusicaAtiva((valor) => !valor)}>
              <span>♫</span>
              <span><strong>{storyAtual.music_title || 'Áudio original'}</strong><small>{storyAtual.music_artist || grupo.perfil?.nome}</small></span>
              <span>{musicaAtiva ? '🔊' : '🔇'}</span>
            </button>
          ) : null}
        </div>

        <div className="story-viewer-footer instagram-style">
          <div className="story-social-actions">
            {ehMeuStory ? (
              <button type="button" className="story-viewers-button" onClick={abrirVisualizadores} disabled={carregandoVisualizadores}>
                ◉ <span>{carregandoVisualizadores ? 'Carregando...' : 'Ver visualizações'}</span>
              </button>
            ) : (
              <form className="story-reply-form" onSubmit={enviarResposta}>
                <input value={resposta} onChange={(event) => setResposta(event.target.value)} placeholder={`Responder a @${grupo.perfil?.username || 'story'}...`} maxLength={500} />
                <button type="submit" disabled={!resposta.trim() || enviandoResposta}>{enviandoResposta ? '...' : 'Enviar'}</button>
              </form>
            )}
            {!ehMeuStory ? (
              <button type="button" className={`story-like-button ${storyAtual.euCurti ? 'liked' : ''}`} onClick={async () => {
                try {
                  await onToggleLike?.(storyAtual)
                } catch (error) {
                  window.alert(error?.message || 'Não foi possível curtir este story.')
                }
              }} aria-label="Curtir story">
                {storyAtual.euCurti ? '♥' : '♡'} <small>{storyAtual.totalCurtidas || ''}</small>
              </button>
            ) : null}
            {!ehMeuStory ? (
              <button type="button" className="story-share-button" onClick={() => onShare?.(storyAtual)} aria-label="Compartilhar story">⌁</button>
            ) : null}
          </div>
        </div>
        {visualizadores ? (
          <div className="story-viewers-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setVisualizadores(null)}>
            <section className="story-viewers-sheet">
              <header><div><strong>Visualizações</strong><small>{visualizadores.length} pessoa{visualizadores.length === 1 ? '' : 's'}</small></div><button type="button" onClick={() => setVisualizadores(null)}>×</button></header>
              <div>
                {visualizadores.map((item) => (
                  <button type="button" key={item.profile_id} onClick={() => { setVisualizadores(null); onOpenProfile?.(item.perfil.username) }}>
                    {item.perfil.foto_url ? <img src={item.perfil.foto_url} alt="" /> : <span>{item.perfil.nome?.charAt(0)?.toUpperCase()}</span>}
                    <span><strong>{item.perfil.nome}</strong><small>@{item.perfil.username}</small></span>
                  </button>
                ))}
                {!visualizadores.length ? <p>Ninguém visualizou este story ainda.</p> : null}
              </div>
            </section>
          </div>
        ) : null}
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
  onToggleLike,
  onReply,
  onShare,
  onLoadViewers,
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
          onToggleLike={onToggleLike}
          onReply={onReply}
          onShare={onShare}
          onLoadViewers={onLoadViewers}
        />
      )}
    </>
  )
}
