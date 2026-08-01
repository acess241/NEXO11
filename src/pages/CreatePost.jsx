import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import {
  aceitarArquivoPorTipo,
  normalizarTipoPost,
  placeholderPorTipo,
  POST_TYPE_META,
} from '../lib/postTypes'
import { supabase } from '../lib/supabase'
import InstantCameraSheet from '../components/InstantCameraSheet'
import { criarNotificacaoSePermitido } from '../lib/notificationPreferences'

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
    >
      <path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

const TIPOS = [
  { key: 'nota', icon: IconeNotas },
  { key: 'foto', icon: IconeFoto },
  { key: 'nexis', icon: IconeRaio },
]

export default function CreatePost() {
  const [perfil, setPerfil] = useState(null)
  const [tipo, setTipo] = useState('nota')
  const [conteudo, setConteudo] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [preview, setPreview] = useState('')
  const [cameraFotoAberta, setCameraFotoAberta] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [sugestoesMencao, setSugestoesMencao] = useState([])
  const [buscandoMencoes, setBuscandoMencoes] = useState(false)
  const [intervaloMencao, setIntervaloMencao] = useState(null)

  const inputArquivoRef = useRef(null)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    carregarPerfil()
  }, [])

  useEffect(() => {
    const tipoSolicitado = searchParams.get('tipo')
    if (tipoSolicitado === 'nexis' || tipoSolicitado === 'foto') {
      trocarTipo(tipoSolicitado)
    }
  }, [searchParams])

  useEffect(() => {
    return () => {
      if (preview && preview.startsWith('blob:')) {
        URL.revokeObjectURL(preview)
      }
    }
  }, [preview])

  useEffect(() => {
    if (!intervaloMencao) {
      setSugestoesMencao([])
      setBuscandoMencoes(false)
      return undefined
    }

    let ativo = true
    const timer = setTimeout(async () => {
      setBuscandoMencoes(true)
      const busca = intervaloMencao.busca
      let query = supabase
        .from('profiles')
        .select('id, nome, username, foto_url, is_verified')
        .not('username', 'is', null)
        .order('is_verified', { ascending: false })
        .limit(6)

      if (busca) query = query.ilike('username', `${busca}%`)

      const { data, error } = await query
      if (!ativo) return

      setSugestoesMencao(error ? [] : data || [])
      setBuscandoMencoes(false)
    }, 180)

    return () => {
      ativo = false
      clearTimeout(timer)
    }
  }, [intervaloMencao])

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

  function trocarTipo(novoTipo) {
    const tipoNormalizado = normalizarTipoPost(novoTipo)
    if (tipoNormalizado === tipo) return

    setTipo(tipoNormalizado)
    setErro('')
    setCameraFotoAberta(false)

    if (preview && preview.startsWith('blob:')) {
      URL.revokeObjectURL(preview)
    }

    setArquivo(null)
    setPreview('')

    if (tipoNormalizado === 'foto') {
      setCameraFotoAberta(true)
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

  function selecionarArquivo(e) {
    const file = e.target.files?.[0]
    if (!file) return

    aplicarArquivoSelecionado(file)
    e.target.value = ''
  }

  function abrirGaleria() {
    inputArquivoRef.current?.click()
  }

  function abrirCameraFoto() {
    setErro('')
    setCameraFotoAberta(true)
  }

  function atualizarConteudo(event) {
    const valor = event.target.value
    const cursor = event.target.selectionStart ?? valor.length
    const antesDoCursor = valor.slice(0, cursor)
    const correspondencia = antesDoCursor.match(/(^|\s)@([a-zA-Z0-9._]{0,30})$/)

    setConteudo(valor)

    if (!correspondencia) {
      setIntervaloMencao(null)
      return
    }

    const inicio = cursor - correspondencia[2].length - 1
    setIntervaloMencao({
      inicio,
      fim: cursor,
      busca: correspondencia[2].toLowerCase(),
    })
  }

  function escolherMencao(username) {
    if (!intervaloMencao) return

    setConteudo(
      `${conteudo.slice(0, intervaloMencao.inicio)}@${username} ${conteudo.slice(
        intervaloMencao.fim
      )}`
    )
    setIntervaloMencao(null)
    setSugestoesMencao([])
  }

  async function uploadMidia(profileId) {
    if (!arquivo) return null

    const extensao = arquivo.name.split('.').pop()
    const nomeArquivo = `posts/${profileId}-${Date.now()}.${extensao}`

    const { error } = await supabase.storage
      .from('stories')
      .upload(nomeArquivo, arquivo, { upsert: true })

    if (error) throw error

    const { data } = supabase.storage.from('stories').getPublicUrl(nomeArquivo)
    return data.publicUrl
  }

  async function publicarPost(e) {
    e.preventDefault()
    setErro('')
    setSucesso('')

    const tipoNormalizado = normalizarTipoPost(tipo)
    const texto = conteudo.trim()

    if (tipoNormalizado === 'nota' && !texto) {
      setErro('Escreva algo para publicar sua nota.')
      return
    }

    if (tipoNormalizado !== 'nota' && !arquivo) {
      setErro('Escolha um arquivo para publicar.')
      return
    }

    if (!perfil) {
      setErro('Perfil não encontrado.')
      return
    }

    setEnviando(true)

    try {
      const mediaUrl = await uploadMidia(perfil.id)

      const { error } = await supabase.from('posts').insert({
        profile_id: perfil.id,
        content: texto,
        post_type: tipoNormalizado,
        media_url: mediaUrl,
        media_kind:
          tipoNormalizado === 'foto'
            ? 'image'
            : tipoNormalizado === 'nexis'
            ? 'video'
            : null,
      })

      if (error) throw error

      const usernamesMencionados = [
        ...new Set(
          [...texto.matchAll(/@([a-zA-Z0-9._]+)/g)].map((match) =>
            match[1].toLowerCase()
          )
        ),
      ]

      if (usernamesMencionados.length) {
        const { data: mencionados } = await supabase
          .from('profiles')
          .select('id, username')
          .in('username', usernamesMencionados)

        await Promise.all(
          (mencionados || [])
            .filter((mencionado) => mencionado.id !== perfil.id)
            .map((mencionado) =>
              criarNotificacaoSePermitido({
                receiverProfileId: mencionado.id,
                actorProfileId: perfil.id,
                type: 'mention',
                metadata: { kind: 'post_mention' },
              })
            )
        )
      }

      setSucesso('Post publicado com sucesso!')
      setConteudo('')
      setArquivo(null)
      setPreview('')

      setTimeout(() => {
        navigate('/')
      }, 900)
    } catch {
      setErro('Não foi possível publicar agora.')
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

        <h1>Novo post</h1>

        <button
          type="button"
          className="edit-save-link"
          onClick={publicarPost}
          disabled={enviando}
        >
          {enviando ? 'Publicando...' : 'Publicar'}
        </button>
      </div>

      <div className="page">
        {erro ? <div className="alert-box erro-box">{erro}</div> : null}

        {sucesso ? (
          <div className="alert-box" style={{ background: '#0d2a1a', color: '#4cffb2' }}>
            {sucesso}
          </div>
        ) : null}

        <section className="create-post-card">
          <div className="create-post-type-list">
            {TIPOS.map((item) => {
              const ativo = tipo === item.key
              const Icone = item.icon

              return (
                <button
                  key={item.key}
                  type="button"
                  className={`create-post-type-btn ${ativo ? 'active' : ''}`}
                  onClick={() => trocarTipo(item.key)}
                >
                  <span className="create-post-type-icon">
                    <Icone />
                  </span>
                  <div>
                    <strong>{POST_TYPE_META[item.key].label}</strong>
                    <small>{POST_TYPE_META[item.key].subtitle}</small>
                  </div>
                </button>
              )
            })}
          </div>

          {tipo !== 'nota' && (
            <div className="story-preview-area create-post-preview-area">
              {preview ? (
                obterPreview(tipo, preview)
              ) : tipo === 'foto' ? (
                <button
                  type="button"
                  className="story-upload-placeholder create-post-media-placeholder"
                  onClick={abrirCameraFoto}
                >
                  <span className="story-plus">
                    <IconeCamera />
                  </span>
                  <p>Tire uma foto ou escolha da galeria</p>
                </button>
              ) : (
                <button
                  type="button"
                  className="story-upload-placeholder create-post-media-placeholder"
                  onClick={abrirGaleria}
                >
                  <span className="story-plus">+</span>
                  <p>
                    {tipo === 'foto'
                      ? 'Escolher foto para o post'
                      : 'Escolher video curto para o Nexis'}
                  </p>
                </button>
              )}

              <input
                ref={inputArquivoRef}
                type="file"
                accept={aceitarArquivoPorTipo(tipo)}
                onChange={selecionarArquivo}
                style={{ display: 'none' }}
              />

              {tipo === 'foto' ? (
                <div className="create-post-media-actions">
                  <button
                    type="button"
                    className="create-post-media-btn primary"
                    onClick={abrirCameraFoto}
                  >
                    Abrir camera
                  </button>
                  <button
                    type="button"
                    className="create-post-media-btn"
                    onClick={abrirGaleria}
                  >
                    Escolher da galeria
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {tipo !== 'nota' && preview ? (
            <button
              type="button"
              className="change-photo-btn"
              onClick={tipo === 'foto' ? abrirCameraFoto : abrirGaleria}
            >
              {tipo === 'foto' ? 'Tirar outra foto' : 'Trocar arquivo'}
            </button>
          ) : null}

          <form onSubmit={publicarPost} className="story-create-form">
            <div className="edit-field">
              <label>
                {tipo === 'nota'
                  ? 'Sua nota'
                  : tipo === 'foto'
                  ? 'Legenda da foto'
                  : 'Texto do video'}
              </label>
              <div className="mention-composer">
                <textarea
                  className="edit-input edit-textarea"
                  placeholder={`${placeholderPorTipo(tipo)} Use @ para mencionar alguém`}
                  value={conteudo}
                  onChange={atualizarConteudo}
                  rows={4}
                />

                {intervaloMencao ? (
                  <div className="mention-suggestions" role="listbox" aria-label="Perfis para mencionar">
                    {buscandoMencoes ? (
                      <p className="mention-loading">Buscando pessoas...</p>
                    ) : sugestoesMencao.length ? (
                      sugestoesMencao.map((pessoa) => (
                        <button
                          key={pessoa.id}
                          type="button"
                          className="mention-suggestion"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => escolherMencao(pessoa.username)}
                        >
                          <span className="mention-suggestion-avatar">
                            {pessoa.foto_url ? (
                              <img src={pessoa.foto_url} alt="" />
                            ) : (
                              (pessoa.nome || pessoa.username).charAt(0).toUpperCase()
                            )}
                          </span>
                          <span>
                            <strong>{pessoa.nome || pessoa.username}</strong>
                            <small>@{pessoa.username}</small>
                          </span>
                          {pessoa.is_verified ? <span className="mention-verified">✓</span> : null}
                        </button>
                      ))
                    ) : (
                      <p className="mention-loading">Nenhum perfil encontrado.</p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <p className="create-post-hint">
              Comentarios, curtidas e reposts vao funcionar igual para notas, fotos e Nexis.
            </p>

            <button className="btn edit-submit-btn" type="submit" disabled={enviando}>
              {enviando ? 'Publicando...' : 'Publicar agora'}
            </button>
          </form>
        </section>
      </div>

      <InstantCameraSheet
        open={tipo === 'foto' && cameraFotoAberta}
        onClose={() => setCameraFotoAberta(false)}
        onCapture={aplicarArquivoSelecionado}
        onOpenGallery={abrirGaleria}
        title="Post com foto"
        subtitle="Capture a foto para publicar"
      />

      <BottomNav />
    </div>
  )
}

function obterPreview(tipo, preview) {
  if (tipo === 'nexis') {
    return (
      <video
        src={preview}
        className="story-editor-preview"
        controls
        playsInline
      />
    )
  }

  return <img src={preview} alt="Preview do post" className="story-editor-preview" />
}
