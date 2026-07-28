import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import InstantCameraSheet from '../components/InstantCameraSheet'
import SocialLoader from '../components/SocialLoader'
import { supabase } from '../lib/supabase'

function IconeCamera() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" /><circle cx="12" cy="13" r="4" /></svg>
}

function IconeGaleria() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m21 15-5-5L5 21" /></svg>
}

function IconeTexto() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" /></svg>
}

function IconeMusica() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>
}

const DURACAO_PADRAO = 15
const DURACAO_MAXIMA_VIDEO = 60
const TAMANHO_MAXIMO_VIDEO = 100 * 1024 * 1024

function obterDuracaoVideo(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      const duracao = Number.isFinite(video.duration) ? video.duration : 0
      URL.revokeObjectURL(url)
      resolve(duracao)
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('video_invalido'))
    }
    video.src = url
  })
}

export default function CreateStory() {
  const [perfil, setPerfil] = useState(null)
  const [arquivo, setArquivo] = useState(null)
  const [preview, setPreview] = useState('')
  const [mediaKind, setMediaKind] = useState('image')
  const [duracaoStory, setDuracaoStory] = useState(DURACAO_PADRAO)
  const [caption, setCaption] = useState('')
  const [cameraAberta, setCameraAberta] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [musicas, setMusicas] = useState([])
  const [musica, setMusica] = useState(null)
  const [musicaArquivo, setMusicaArquivo] = useState(null)
  const [musicaInicio, setMusicaInicio] = useState(0)
  const [musicaVolume, setMusicaVolume] = useState(0.75)
  const [buscaMusica, setBuscaMusica] = useState('')
  const [seletorMusicaAberto, setSeletorMusicaAberto] = useState(false)
  const [musicaTocandoId, setMusicaTocandoId] = useState(null)
  const inputFileRef = useRef(null)
  const inputMusicaRef = useRef(null)
  const audioPreviewRef = useRef(null)
  const abriuCameraRef = useRef(false)
  const navigate = useNavigate()

  useEffect(() => {
    async function carregar() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return navigate('/auth')
        const { data, error } = await supabase.from('profiles').select('*').eq('account_id', user.id).single()
        if (error) throw error
        setPerfil(data)
        const { data: faixas } = await supabase
          .from('story_music_library')
          .select('id,title,artist,audio_url,duration_seconds,cover_url')
          .eq('is_active', true)
          .order('title')
        setMusicas(faixas || [])
      } catch {
        setErro('Erro ao carregar perfil.')
      } finally {
        setCarregando(false)
      }
    }
    void carregar()
  }, [navigate])

  useEffect(() => () => {
    if (musica?.localUrl?.startsWith('blob:')) URL.revokeObjectURL(musica.localUrl)
  }, [musica])

  function pararPreviaMusica() {
    const audio = audioPreviewRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setMusicaTocandoId(null)
  }

  function ouvirMusica(faixa) {
    if (musicaTocandoId === faixa.id) return pararPreviaMusica()
    pararPreviaMusica()
    const audio = new Audio(faixa.audio_url || faixa.localUrl)
    audio.volume = musicaVolume
    audio.currentTime = 0
    audio.onended = () => setMusicaTocandoId(null)
    audioPreviewRef.current = audio
    setMusicaTocandoId(faixa.id)
    void audio.play().catch(() => setMusicaTocandoId(null))
  }

  function selecionarMusica(faixa) {
    pararPreviaMusica()
    setMusica(faixa)
    setMusicaArquivo(faixa.file || null)
    setMusicaInicio(0)
    setSeletorMusicaAberto(false)
  }

  function escolherMusicaPropria(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('audio/')) return setErro('Escolha um arquivo de áudio válido.')
    if (file.size > 20 * 1024 * 1024) return setErro('A música deve ter no máximo 20 MB.')
    const titulo = file.name.replace(/\.[^.]+$/, '')
    selecionarMusica({
      id: `local-${Date.now()}`,
      title: titulo,
      artist: 'Áudio original',
      localUrl: URL.createObjectURL(file),
      file,
      duration_seconds: 0,
    })
  }

  useEffect(() => () => {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
  }, [preview])

  useEffect(() => {
    if (carregando || preview || abriuCameraRef.current) return
    abriuCameraRef.current = true
    setCameraAberta(true)
  }, [carregando, preview])

  async function aplicarArquivoSelecionado(file) {
    if (!file) return
    const ehImagem = file.type.startsWith('image/')
    const ehVideo = file.type.startsWith('video/')
    if (!ehImagem && !ehVideo) return setErro('Escolha uma foto ou um vídeo válido.')
    if (ehVideo && file.size > TAMANHO_MAXIMO_VIDEO) return setErro('O vídeo deve ter no máximo 100 MB.')

    let duracao = DURACAO_PADRAO
    if (ehVideo) {
      try {
        duracao = await obterDuracaoVideo(file)
      } catch {
        return setErro('Não foi possível abrir este vídeo.')
      }
      if (duracao <= 0 || duracao > DURACAO_MAXIMA_VIDEO) return setErro('O vídeo deve ter no máximo 60 segundos.')
    }

    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
    setErro('')
    setArquivo(file)
    setMediaKind(ehVideo ? 'video' : 'image')
    setDuracaoStory(ehVideo ? Math.max(1, Math.ceil(duracao)) : DURACAO_PADRAO)
    setPreview(URL.createObjectURL(file))
    setCameraAberta(false)
  }

  async function escolherArquivo(event) {
    const file = event.target.files?.[0]
    if (file) await aplicarArquivoSelecionado(file)
    event.target.value = ''
  }

  function fecharEditor() {
    if ((arquivo || caption.trim()) && !sucesso && !window.confirm('Descartar este story?')) return
    navigate('/')
  }

  async function publicarStory() {
    setErro('')
    if (!arquivo) return setErro('Selecione uma foto ou um vídeo.')
    if (!perfil) return setErro('Perfil não encontrado.')
    setEnviando(true)
    try {
      const extensao = arquivo.name.split('.').pop() || (mediaKind === 'video' ? 'mp4' : 'jpg')
      const nomeArquivo = `${perfil.id}-${Date.now()}.${extensao}`
      const { error: uploadError } = await supabase.storage.from('stories').upload(nomeArquivo, arquivo, {
        upsert: true,
        contentType: arquivo.type || undefined,
        cacheControl: '86400',
      })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('stories').getPublicUrl(nomeArquivo)
      let musicaUrl = musica?.audio_url || null
      if (musicaArquivo) {
        const extensaoMusica = musicaArquivo.name.split('.').pop() || 'mp3'
        const nomeMusica = `music/${perfil.id}-${Date.now()}.${extensaoMusica}`
        const { error: musicaUploadError } = await supabase.storage.from('stories').upload(nomeMusica, musicaArquivo, {
          upsert: false,
          contentType: musicaArquivo.type || undefined,
          cacheControl: '86400',
        })
        if (musicaUploadError) throw musicaUploadError
        musicaUrl = supabase.storage.from('stories').getPublicUrl(nomeMusica).data.publicUrl
      }
      const { error: insertError } = await supabase.from('stories').insert({
        profile_id: perfil.id,
        media_url: data.publicUrl,
        media_kind: mediaKind,
        caption: caption.trim(),
        duration_seconds: duracaoStory,
        music_url: musicaUrl,
        music_title: musica?.title || null,
        music_artist: musica?.artist || null,
        music_start_seconds: musica ? musicaInicio : null,
        music_volume: musica ? musicaVolume : null,
      })
      if (insertError) throw insertError
      setSucesso('Story publicado!')
      window.setTimeout(() => navigate('/'), 800)
    } catch (error) {
      setErro(error?.message ? `Erro ao postar: ${error.message}` : 'Erro ao postar story.')
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) return <SocialLoader variant="editor" />

  return (
    <div className="story-instagram-editor">
      <header className="story-editor-top">
        <button type="button" className="story-editor-close" onClick={fecharEditor}>×</button>
        <strong>Story</strong>
        <span>{preview ? (mediaKind === 'video' ? `${duracaoStory}s` : '15s') : ''}</span>
      </header>

      {erro ? <div className="story-editor-message error">{erro}</div> : null}
      {sucesso ? <div className="story-editor-message success">{sucesso}</div> : null}

      <main className="story-editor-stage">
        <section className={`story-editor-canvas ${preview ? 'has-media' : ''}`}>
          {preview ? (
            <>
              {mediaKind === 'video'
                ? <video src={preview} className="story-editor-media" autoPlay loop muted playsInline />
                : <img src={preview} alt="Prévia do story" className="story-editor-media" />}
              {caption.trim() ? <div className="story-editor-text-overlay">{caption}</div> : null}
            </>
          ) : (
            <div className="story-editor-empty">
              <div className="story-editor-empty-icon"><IconeCamera /></div>
              <h1>Crie seu story</h1>
              <p>Tire uma foto agora ou escolha uma foto ou vídeo da galeria.</p>
              <div>
                <button type="button" className="primary" onClick={() => setCameraAberta(true)}><IconeCamera /> Câmera</button>
                <button type="button" onClick={() => inputFileRef.current?.click()}><IconeGaleria /> Galeria</button>
              </div>
            </div>
          )}

          {preview ? (
            <aside className="story-editor-tools">
              <button type="button" onClick={() => document.getElementById('story-overlay-text')?.focus()}><IconeTexto /><span>Texto</span></button>
              <button type="button" onClick={() => setSeletorMusicaAberto(true)}><IconeMusica /><span>Música</span></button>
              <button type="button" onClick={() => setCameraAberta(true)}><IconeCamera /><span>Câmera</span></button>
              <button type="button" onClick={() => inputFileRef.current?.click()}><IconeGaleria /><span>Galeria</span></button>
            </aside>
          ) : null}
          <input ref={inputFileRef} type="file" accept="image/*,video/*" onChange={escolherArquivo} hidden />
        </section>

        {preview ? (
          <>
            {musica ? (
              <button type="button" className="story-selected-music" onClick={() => setSeletorMusicaAberto(true)}>
                <IconeMusica />
                <span><strong>{musica.title}</strong><small>{musica.artist}</small></span>
                <span>Alterar</span>
              </button>
            ) : null}
            <section className="story-editor-compose">
              <label htmlFor="story-overlay-text">Aa</label>
              <textarea id="story-overlay-text" placeholder="Adicione um texto..." value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 220))} rows={1} maxLength={220} />
              <span>{caption.length}/220</span>
            </section>
          </>
        ) : null}
      </main>

      {preview ? (
        <footer className="story-editor-footer">
          <div className="story-editor-audience">
            <span className="story-editor-user-avatar">
              {perfil?.foto_url ? <img src={perfil.foto_url} alt="" /> : perfil?.nome?.charAt(0)?.toUpperCase() || 'U'}
            </span>
            <span><strong>Seu story</strong><small>Visível por 24 horas</small></span>
          </div>
          <button type="button" className="story-editor-share" onClick={publicarStory} disabled={enviando}>
            {enviando ? 'Publicando...' : 'Compartilhar'} <span>➜</span>
          </button>
        </footer>
      ) : null}

      <InstantCameraSheet
        open={cameraAberta}
        onClose={() => setCameraAberta(false)}
        onCapture={(file) => void aplicarArquivoSelecionado(file)}
        onOpenGallery={() => inputFileRef.current?.click()}
        title="Adicionar ao story"
        subtitle="Capture uma foto ou escolha da galeria"
      />

      {seletorMusicaAberto ? (
        <div className="story-music-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            pararPreviaMusica()
            setSeletorMusicaAberto(false)
          }
        }}>
          <section className="story-music-sheet" role="dialog" aria-modal="true" aria-label="Adicionar música">
            <header>
              <button type="button" onClick={() => { pararPreviaMusica(); setSeletorMusicaAberto(false) }}>×</button>
              <div><h2>Adicionar música</h2><p>Escolha uma faixa autorizada para o seu story.</p></div>
              {musica ? <button type="button" className="remove" onClick={() => { setMusica(null); setMusicaArquivo(null); setSeletorMusicaAberto(false) }}>Remover</button> : <span />}
            </header>
            <div className="story-music-search">
              <span>⌕</span>
              <input value={buscaMusica} onChange={(event) => setBuscaMusica(event.target.value)} placeholder="Pesquisar música ou artista" autoFocus />
            </div>
            <button type="button" className="story-own-music" onClick={() => inputMusicaRef.current?.click()}>
              <span><IconeMusica /></span>
              <div><strong>Usar áudio próprio</strong><small>Envie uma faixa que você tem autorização para usar</small></div>
              <b>+</b>
            </button>
            <input ref={inputMusicaRef} type="file" accept="audio/*" onChange={escolherMusicaPropria} hidden />
            <div className="story-music-list">
              {musicas.filter((faixa) => `${faixa.title} ${faixa.artist}`.toLowerCase().includes(buscaMusica.toLowerCase())).map((faixa) => (
                <article key={faixa.id} className={musica?.id === faixa.id ? 'selected' : ''}>
                  <button type="button" className="play" onClick={() => ouvirMusica(faixa)}>{musicaTocandoId === faixa.id ? 'Ⅱ' : '▶'}</button>
                  <button type="button" className="info" onClick={() => selecionarMusica(faixa)}>
                    <strong>{faixa.title}</strong><small>{faixa.artist}</small>
                  </button>
                  <button type="button" className="use" onClick={() => selecionarMusica(faixa)}>Usar</button>
                </article>
              ))}
              {!musicas.length ? <p className="story-music-empty">A biblioteca ainda não possui faixas. Você já pode usar um áudio próprio autorizado.</p> : null}
            </div>
            {musica ? (
              <div className="story-music-controls">
                <label>Começar em <strong>{musicaInicio}s</strong><input type="range" min="0" max={Math.max(0, Math.floor((musica.duration_seconds || 30) - duracaoStory))} value={musicaInicio} onChange={(event) => setMusicaInicio(Number(event.target.value))} /></label>
                <label>Volume <strong>{Math.round(musicaVolume * 100)}%</strong><input type="range" min="0" max="1" step="0.05" value={musicaVolume} onChange={(event) => setMusicaVolume(Number(event.target.value))} /></label>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}
