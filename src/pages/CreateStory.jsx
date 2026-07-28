import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SocialLoader from '../components/SocialLoader'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import InstantCameraSheet from '../components/InstantCameraSheet'

function IconeCamera() {
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
      aria-hidden="true"
    >
      <path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

const DURACAO_STORY_SEGUNDOS = 15
const DURACAO_MAXIMA_VIDEO_SEGUNDOS = 60
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
  const [duracaoStory, setDuracaoStory] = useState(DURACAO_STORY_SEGUNDOS)
  const [caption, setCaption] = useState('')
  const [cameraAberta, setCameraAberta] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const inputFileRef = useRef(null)
  const abriuCameraInicialRef = useRef(false)
  const navigate = useNavigate()

  useEffect(() => {
    carregarPerfil()
  }, [])

  useEffect(() => {
    return () => {
      if (preview && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview)
      }
    }
  }, [preview])

  useEffect(() => {
    if (carregando || preview || abriuCameraInicialRef.current) return
    abriuCameraInicialRef.current = true
    setCameraAberta(true)
  }, [carregando, preview])

  async function carregarPerfil() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/auth')
        return
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('account_id', user.id)
        .single()

      if (error) throw error
      setPerfil(data)
    } catch {
      setErro('Erro ao carregar perfil.')
    } finally {
      setCarregando(false)
    }
  }

  async function aplicarArquivoSelecionado(file) {
    if (!file) return

    const ehImagem = file.type.startsWith('image/')
    const ehVideo = file.type.startsWith('video/')

    if (!ehImagem && !ehVideo) {
      setErro('Escolha uma foto ou um vídeo válido.')
      return
    }

    if (ehVideo && file.size > TAMANHO_MAXIMO_VIDEO) {
      setErro('O vídeo deve ter no máximo 100 MB.')
      return
    }

    let duracao = DURACAO_STORY_SEGUNDOS
    if (ehVideo) {
      try {
        duracao = await obterDuracaoVideo(file)
      } catch {
        setErro('Não foi possível abrir este vídeo.')
        return
      }

      if (duracao <= 0 || duracao > DURACAO_MAXIMA_VIDEO_SEGUNDOS) {
        setErro('O vídeo do story deve ter no máximo 60 segundos.')
        return
      }
    }

    if (preview && preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview)
    }

    setErro('')
    setArquivo(file)
    setMediaKind(ehVideo ? 'video' : 'image')
    setDuracaoStory(ehVideo ? Math.max(1, Math.ceil(duracao)) : DURACAO_STORY_SEGUNDOS)
    setPreview(URL.createObjectURL(file))
  }

  async function escolherArquivo(event) {
    const file = event.target.files?.[0]
    if (!file) return

    await aplicarArquivoSelecionado(file)
    event.target.value = ''
  }

  function abrirGaleria() {
    inputFileRef.current?.click()
  }

  function abrirCamera() {
    setErro('')
    setCameraAberta(true)
  }

  async function publicarStory(event) {
    event.preventDefault()
    setErro('')
    setSucesso('')

    if (!arquivo) {
      setErro('Selecione uma foto ou um vídeo para o story.')
      return
    }

    if (!perfil) {
      setErro('Perfil não encontrado.')
      return
    }

    setEnviando(true)

    try {
      const extensao = arquivo.name.split('.').pop()
      const nomeArquivo = `${perfil.id}-${Date.now()}.${extensao}`

      const { error: uploadError } = await supabase.storage
        .from('stories')
        .upload(nomeArquivo, arquivo, {
          upsert: true,
          contentType: arquivo.type || undefined,
          cacheControl: '86400',
        })

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from('stories')
        .getPublicUrl(nomeArquivo)

      const publicUrl = publicUrlData.publicUrl

      const { error: insertError } = await supabase
        .from('stories')
        .insert({
          profile_id: perfil.id,
          media_url: publicUrl,
          media_kind: mediaKind,
          caption: caption.trim(),
          duration_seconds: duracaoStory,
        })

      if (insertError) throw insertError

      setSucesso('Story publicado com sucesso!')
      setArquivo(null)
      setPreview('')
      setMediaKind('image')
      setDuracaoStory(DURACAO_STORY_SEGUNDOS)
      setCaption('')

      setTimeout(() => {
        navigate('/')
      }, 1200)
    } catch {
      setErro('Erro ao postar story.')
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) {
    return <SocialLoader variant="editor" showBottomNav />
  }

  return (
    <div className="container">
      <div className="topbar create-story-topbar">
        <button
          type="button"
          className="edit-back-btn"
          onClick={() => navigate('/perfil')}
        >
          Voltar
        </button>

        <h1>Novo story</h1>

        <button
          type="button"
          className="edit-save-link"
          onClick={publicarStory}
          disabled={enviando}
        >
          {enviando ? 'Postando...' : 'Publicar'}
        </button>
      </div>

      <div className="page">
        {erro && <div className="alert-box erro-box">{erro}</div>}

        {sucesso && (
          <div
            className="alert-box"
            style={{ background: '#0d2a1a', color: '#4cffb2' }}
          >
            {sucesso}
          </div>
        )}

        <div className="story-create-card">
          <div className="story-preview-area">
            {preview ? (
              mediaKind === 'video' ? (
                <video
                  src={preview}
                  className="story-editor-preview story-editor-video"
                  controls
                  playsInline
                  preload="metadata"
                />
              ) : (
                <img src={preview} alt="Preview do story" className="story-editor-preview" />
              )
            ) : (
              <button
                type="button"
                className="story-upload-placeholder"
                onClick={abrirCamera}
              >
                <span className="story-plus">
                  <IconeCamera />
                </span>
                <p>Tire uma foto ou escolha uma foto ou vídeo</p>
              </button>
            )}

            <input
              ref={inputFileRef}
              type="file"
              accept="image/*,video/*"
              onChange={escolherArquivo}
              style={{ display: 'none' }}
            />
          </div>

          <div className="create-post-media-actions">
            <button
              type="button"
              className="create-post-media-btn primary"
              onClick={abrirCamera}
            >
              <IconeCamera />
              Tirar foto
            </button>
            <button
              type="button"
              className="create-post-media-btn"
              onClick={abrirGaleria}
            >
              Foto ou vídeo da galeria
            </button>
          </div>

          {preview && (
            <button type="button" className="change-photo-btn" onClick={abrirCamera}>
              {mediaKind === 'video' ? 'Trocar vídeo' : 'Tirar outra foto'}
            </button>
          )}

          <form onSubmit={publicarStory} className="story-create-form">
            <div className="edit-field">
              <label>Legenda</label>
              <textarea
                className="edit-input edit-textarea"
                placeholder="Escreva algo para o seu story..."
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                rows={3}
              />
            </div>

            <div className="edit-field">
              <label>Duracao do story</label>
              <div className="story-duration-select">
                {mediaKind === 'video'
                  ? `${duracaoStory} segundos`
                  : '15 segundos'}
              </div>
            </div>

            <button className="btn edit-submit-btn" type="submit" disabled={enviando}>
              {enviando ? 'Publicando...' : 'Publicar story'}
            </button>
          </form>
        </div>
      </div>

      <InstantCameraSheet
        open={cameraAberta}
        onClose={() => setCameraAberta(false)}
        onCapture={(file) => void aplicarArquivoSelecionado(file)}
        onOpenGallery={abrirGaleria}
        title="Story"
        subtitle="Tire sua foto agora"
      />

      <BottomNav />
    </div>
  )
}
