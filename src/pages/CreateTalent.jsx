import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import { supabase } from '../lib/supabase'
import { moderateBeforeSend, moderationMessage } from '../lib/moderation'
import { TALENT_CATEGORIES } from '../lib/talents'

export default function CreateTalent() {
  const [profile, setProfile] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('artes_visuais')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => { void loadProfile() }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { navigate('/auth'); return }
    const { data, error: profileError } = await supabase.from('profiles').select('id,nome,username').eq('account_id', user.id).single()
    if (profileError) setError('Não foi possível carregar seu perfil.')
    else setProfile(data)
    setLoading(false)
  }

  function chooseFile(event) {
    const selected = event.target.files?.[0]
    if (!selected) return
    if (!/^(image|video)\//.test(selected.type)) { setError('Escolha uma imagem ou um vídeo.'); return }
    if (selected.size > 30 * 1024 * 1024) { setError('O arquivo deve ter até 30 MB.'); return }
    if (preview) URL.revokeObjectURL(preview)
    setFile(selected); setPreview(URL.createObjectURL(selected)); setError('')
  }

  async function publish(event) {
    event.preventDefault()
    if (!profile?.id || sending) return
    if (!title.trim() || !description.trim()) { setError('Dê um título e conte um pouco sobre sua criação.'); return }
    setSending(true); setError('')
    try {
      const moderation = await moderateBeforeSend({ contentType: file?.type.startsWith('video/') ? 'video' : file ? 'image' : 'post', text: `${title}. ${description}`, hasMedia: Boolean(file), metadata: { talent_category: category } })
      if (moderation.decision !== 'allow') { setError(moderationMessage(moderation, 'post')); return }
      let mediaUrl = null
      let mediaKind = null
      if (file) {
        mediaKind = file.type.startsWith('video/') ? 'video' : 'image'
        const extension = file.name.split('.').pop()?.toLowerCase() || (mediaKind === 'video' ? 'mp4' : 'jpg')
        const path = `talents/${profile.id}-${Date.now()}.${extension}`
        const { error: uploadError } = await supabase.storage.from('stories').upload(path, file, { upsert: false, contentType: file.type })
        if (uploadError) throw uploadError
        mediaUrl = supabase.storage.from('stories').getPublicUrl(path).data.publicUrl
      }
      const { data: created, error: insertError } = await supabase.from('posts').insert({ profile_id: profile.id, content: description.trim(), post_type: 'talent', media_url: mediaUrl, media_kind: mediaKind, talent_title: title.trim(), talent_category: category }).select('id,moderation_status').single()
      if (insertError) throw insertError
      sessionStorage.setItem('nexo:talent-notice', created?.moderation_status === 'pending' ? 'Sua arte foi enviada e está aguardando análise de segurança.' : 'Seu talento foi publicado no palco do NEXO.')
      navigate('/talentos', { replace: true })
    } catch (publishError) { setError(publishError?.message || 'Não foi possível publicar seu talento.') }
    finally { setSending(false) }
  }

  if (loading) return <SocialLoader variant="feed" showBottomNav />

  return <div className="container talent-create-shell">
    <header className="topbar talent-create-topbar"><button type="button" onClick={() => navigate('/talentos')}>←</button><div><span>EXPRESSÃO NEXO</span><h1>Novo talento</h1></div><i /></header>
    <main className="talent-create-page">
      <form className="talent-create-card" onSubmit={publish}>
        <span className="nexo-eyebrow">SUA CRIAÇÃO, SUA HISTÓRIA</span>
        <h2>O que você quer mostrar?</h2>
        <label>Título<input maxLength="80" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Retratos do meu bairro" /></label>
        <label>Categoria<select value={category} onChange={(event) => setCategory(event.target.value)}>{TALENT_CATEGORIES.filter(([key]) => key !== 'all').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Conte a história<textarea maxLength="1200" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Como você criou? O que isso significa para você?" /></label>
        <input ref={inputRef} hidden type="file" accept="image/*,video/*" onChange={chooseFile} />
        <button className="talent-file-picker" type="button" onClick={() => inputRef.current?.click()}>{preview ? 'Trocar arquivo' : 'Adicionar imagem ou vídeo'}<small>Opcional para textos e poesias · até 30 MB</small></button>
        {preview ? <div className="talent-create-preview">{file?.type.startsWith('video/') ? <video src={preview} controls /> : <img src={preview} alt="Prévia" />}<button type="button" onClick={() => { URL.revokeObjectURL(preview); setPreview(''); setFile(null) }}>Remover</button></div> : null}
        {error ? <div className="alert-box erro-box">{error}</div> : null}
        <button className="talent-publish-btn" type="submit" disabled={sending}>{sending ? 'Publicando...' : 'Publicar no palco de talentos'}</button>
      </form>
    </main>
    <BottomNav />
  </div>
}
