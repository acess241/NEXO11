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
  const inputFileRef = useRef(null)
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
      } catch {
        setErro('Erro ao carregar perfil.')
      } finally {
        setCarregando(false)
      }
    }
    void carregar()
  }, [navigate])

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
      const { error: insertError } = await supabase.from('stories').insert({
        profile_id: perfil.id,
        media_url: data.publicUrl,
        media_kind: mediaKind,
        caption: caption.trim(),
        duration_seconds: duracaoStory,
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
              <button type="button" onClick={() => setCameraAberta(true)}><IconeCamera /><span>Câmera</span></button>
              <button type="button" onClick={() => inputFileRef.current?.click()}><IconeGaleria /><span>Galeria</span></button>
            </aside>
          ) : null}
          <input ref={inputFileRef} type="file" accept="image/*,video/*" onChange={escolherArquivo} hidden />
        </section>

        {preview ? (
          <section className="story-editor-compose">
            <label htmlFor="story-overlay-text">Aa</label>
            <textarea id="story-overlay-text" placeholder="Adicione um texto..." value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 220))} rows={1} maxLength={220} />
            <span>{caption.length}/220</span>
          </section>
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
    </div>
  )
}
