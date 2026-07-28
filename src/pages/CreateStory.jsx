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

export default function CreateStory() {
  const [perfil, setPerfil] = useState(null)
  const [arquivo, setArquivo] = useState(null)
  const [preview, setPreview] = useState('')
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

  function aplicarArquivoSelecionado(file) {
    if (!file) return
    if (preview && preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview)
    }

    setArquivo(file)
    setPreview(URL.createObjectURL(file))
  }

  function escolherArquivo(event) {
    const file = event.target.files?.[0]
    if (!file) return

    aplicarArquivoSelecionado(file)
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
      setErro('Selecione uma imagem para o story.')
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
          caption: caption.trim(),
          duration_seconds: DURACAO_STORY_SEGUNDOS,
        })

      if (insertError) throw insertError

      setSucesso('Story publicado com sucesso!')
      setArquivo(null)
      setPreview('')
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
              <img src={preview} alt="Preview do story" className="story-editor-preview" />
            ) : (
              <button
                type="button"
                className="story-upload-placeholder"
                onClick={abrirCamera}
              >
                <span className="story-plus">
                  <IconeCamera />
                </span>
                <p>Tire uma foto ou escolha da galeria</p>
              </button>
            )}

            <input
              ref={inputFileRef}
              type="file"
              accept="image/*"
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
              Escolher da galeria
            </button>
          </div>

          {preview && (
            <button type="button" className="change-photo-btn" onClick={abrirCamera}>
              Tirar outra foto
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
              <div className="story-duration-select">15 segundos (fixo)</div>
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
        onCapture={aplicarArquivoSelecionado}
        onOpenGallery={abrirGaleria}
        title="Story"
        subtitle="Tire sua foto agora"
      />

      <BottomNav />
    </div>
  )
}
