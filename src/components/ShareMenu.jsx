import { useEffect, useMemo, useState } from 'react'
import { obterMediaKind, normalizarTipoPost } from '../lib/postTypes'
import { compartilharPublicacao, criarLinkPublicacao } from '../lib/share'
import { garantirConversaDireta, dispararAtualizacaoChat, traduzirErroChat } from '../lib/chat'
import { supabase } from '../lib/supabase'
import ProfileAvatar from './ProfileAvatar'

function tipoDoPost(post) {
  return normalizarTipoPost(post?.post_type) === 'nexis' ? 'nexis' : 'post'
}

function tituloDoPost(post) {
  return tipoDoPost(post) === 'nexis' ? 'Nexis' : 'publicação'
}

function ShareIcon({ tipo }) {
  if (tipo === 'usuario') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0" /><circle cx="12" cy="7" r="4" /></svg>
  }
  if (tipo === 'story') {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5" /><path d="M8 15l2.6-3 2.2 2 1.7-2 2.5 3" /><circle cx="15.5" cy="8.5" r="1" /></svg>
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 4l7 8-7 8" /><path d="M20 12H4" /></svg>
}

function SharePreview({ post, titulo }) {
  const mediaKind = obterMediaKind(post)
  const texto = post?.content?.trim() || `Veja esta ${titulo} no NEXO 11`
  const temImagem = Boolean(post?.media_url && mediaKind === 'image')
  const [imagemComErro, setImagemComErro] = useState(false)

  useEffect(() => {
    setImagemComErro(false)
  }, [post?.id, post?.media_url])

  const mostrarImagem = temImagem && !imagemComErro

  return (
    <div className="share-menu-preview">
      <div className={`share-menu-preview-media ${mostrarImagem ? 'has-image' : ''}`}>
        {mostrarImagem ? (
          <img src={post.media_url} alt="" loading="lazy" onError={() => setImagemComErro(true)} />
        ) : (
          <span aria-hidden="true">{mediaKind === 'video' ? '▶' : 'N'}</span>
        )}
      </div>
      <div className="share-menu-preview-copy">
        <span>NEXO 11 · {titulo}</span>
        <strong>{texto}</strong>
        <small>Escolha onde compartilhar</small>
      </div>
    </div>
  )
}

export default function ShareMenu({
  post,
  meuPerfil,
  onExternalShare,
  onAddToStory,
  className = '',
}) {
  const [aberto, setAberto] = useState(false)
  const [modo, setModo] = useState('opcoes')
  const [busca, setBusca] = useState('')
  const [usuarios, setUsuarios] = useState([])
  const [carregandoUsuarios, setCarregandoUsuarios] = useState(false)
  const [enviandoPara, setEnviandoPara] = useState(null)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')

  const link = useMemo(() => criarLinkPublicacao(post?.id, tipoDoPost(post)), [post?.id, post?.post_type])
  const titulo = tituloDoPost(post)

  useEffect(() => {
    if (!aberto) return undefined

    function fecharComEscape(event) {
      if (event.key === 'Escape') setAberto(false)
    }

    window.addEventListener('keydown', fecharComEscape)
    return () => window.removeEventListener('keydown', fecharComEscape)
  }, [aberto])

  useEffect(() => {
    if (!aberto || modo !== 'usuarios' || !meuPerfil?.id) return undefined
    let ativo = true
    const timer = window.setTimeout(async () => {
      setCarregandoUsuarios(true)
      setErro('')
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id,nome,username,foto_url,is_verified')
          .neq('id', meuPerfil.id)
          .order('nome', { ascending: true })
          .limit(80)
        if (error) throw error
        if (!ativo) return
        const termo = busca.trim().toLowerCase()
        setUsuarios((data || []).filter((perfil) => {
          if (!termo) return true
          return `${perfil.nome || ''} ${perfil.username || ''}`.toLowerCase().includes(termo)
        }).slice(0, 24))
      } catch (error) {
        if (ativo) setErro(traduzirErroChat(error, 'Não foi possível carregar os usuários.'))
      } finally {
        if (ativo) setCarregandoUsuarios(false)
      }
    }, busca ? 180 : 0)

    return () => {
      ativo = false
      window.clearTimeout(timer)
    }
  }, [aberto, modo, busca, meuPerfil?.id])

  function fechar() {
    setAberto(false)
    setModo('opcoes')
    setBusca('')
    setMensagem('')
    setErro('')
    setEnviandoPara(null)
  }

  function abrir() {
    setAberto(true)
    setModo('opcoes')
    setMensagem('')
    setErro('')
  }

  async function enviarParaUsuario(usuario) {
    if (!post?.id || !meuPerfil?.id || !usuario?.id || enviandoPara) return
    setEnviandoPara(usuario.id)
    setErro('')
    try {
      const conversa = await garantirConversaDireta(meuPerfil.id, usuario.id)
      const { error } = await supabase.from('chat_messages').insert({
        conversation_id: conversa.id,
        sender_profile_id: meuPerfil.id,
        content: `Veja este ${titulo} no NEXO 11:\n${link}`,
        media_url: post.media_url || null,
        media_kind: obterMediaKind(post) || null,
      })
      if (error) throw error
      dispararAtualizacaoChat({ conversationId: conversa.id, type: 'shared-post' })
      setMensagem(`Enviado para @${usuario.username || usuario.nome || 'usuário'}.`)
    } catch (error) {
      setErro(traduzirErroChat(error, 'Não foi possível enviar agora.'))
    } finally {
      setEnviandoPara(null)
    }
  }

  async function compartilharFora() {
    try {
      await onExternalShare?.(post)
      fechar()
    } catch (error) {
      setErro(error?.message || 'Não foi possível compartilhar agora.')
    }
  }

  function adicionarAoStory() {
    fechar()
    onAddToStory?.(post)
  }

  return (
    <div className={`share-menu ${className}`.trim()}>
      <button
        type="button"
        className="share-menu-trigger"
        onClick={aberto ? fechar : abrir}
        aria-label={`Enviar ${titulo}`}
        title={`Enviar ${titulo}`}
        aria-expanded={aberto}
      >
        ↗
      </button>

      {aberto ? (
        <div className="share-menu-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && fechar()}>
          <section className="share-menu-sheet" role="dialog" aria-modal="true" aria-label={`Enviar ${titulo}`}>
            <header className="share-menu-header">
              <div><strong>{modo === 'opcoes' ? 'Compartilhar' : 'Enviar para alguém'}</strong><small>{modo === 'opcoes' ? 'Publique ou envie esta publicação' : 'Escolha uma conversa do NEXO'}</small></div>
              <button type="button" onClick={fechar} aria-label="Fechar envio">×</button>
            </header>

            {modo === 'opcoes' ? (
              <>
                <SharePreview post={post} titulo={titulo} />
                <div className="share-menu-options">
                <button type="button" onClick={() => {
                  if (!meuPerfil?.id) {
                    setErro('Entre na sua conta para enviar a um usuário.')
                    return
                  }
                  setModo('usuarios')
                }}>
                  <span className="share-menu-option-icon user" aria-hidden="true"><ShareIcon tipo="usuario" /></span><div><strong>Enviar no NEXO</strong><small>Escolher uma conversa</small></div><b>›</b>
                </button>
                <button type="button" onClick={adicionarAoStory} disabled={!onAddToStory}>
                  <span className="share-menu-option-icon story" aria-hidden="true"><ShareIcon tipo="story" /></span><div><strong>Adicionar ao story</strong><small>Editar antes de publicar</small></div><b>›</b>
                </button>
                <button type="button" onClick={compartilharFora}>
                  <span className="share-menu-option-icon external" aria-hidden="true"><ShareIcon tipo="fora" /></span><div><strong>Outros aplicativos</strong><small>WhatsApp, Instagram e mais</small></div><b>›</b>
                </button>
                </div>
              </>
            ) : (
              <div className="share-menu-users">
                <button type="button" className="share-menu-back" onClick={() => { setModo('opcoes'); setErro(''); setMensagem('') }}><span aria-hidden="true">‹</span> Voltar</button>
                <SharePreview post={post} titulo={titulo} />
                <label><span>Buscar usuário</span><div className="share-menu-search"><span aria-hidden="true">⌕</span><input autoFocus value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Nome ou @usuário" /></div></label>
                {mensagem ? <p className="share-menu-success" role="status">{mensagem}</p> : null}
                {erro ? <p className="share-menu-error" role="alert">{erro}</p> : null}
                {carregandoUsuarios ? <p className="share-menu-empty">Carregando usuários...</p> : null}
                {!carregandoUsuarios && !usuarios.length ? <p className="share-menu-empty">Nenhum usuário encontrado.</p> : null}
                <div className="share-menu-user-list">
                  {usuarios.map((usuario) => (
                    <button type="button" key={usuario.id} onClick={() => enviarParaUsuario(usuario)} disabled={Boolean(enviandoPara)}>
                      <ProfileAvatar src={usuario.foto_url} name={usuario.nome || usuario.username} alt={usuario.nome || usuario.username} />
                      <span><strong>{usuario.nome || 'Usuário'}</strong><small>@{usuario.username || 'usuario'}</small></span>
                      <b>{enviandoPara === usuario.id ? '…' : 'Enviar'}</b>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {modo === 'opcoes' && erro ? <p className="share-menu-error" role="alert">{erro}</p> : null}
          </section>
        </div>
      ) : null}
    </div>
  )
}
