import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SocialLoader from '../components/SocialLoader'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'
import { COURSE_OPTIONS, normalizarCurso } from '../lib/academy'
import {
  DEFAULT_INSTITUTION_ID,
  DEFAULT_INSTITUTION_NAME,
} from '../lib/education'
import { analyzeText } from '../lib/moderation'

export default function EditProfile() {
  const [perfil, setPerfil] = useState(null)
  const [nome, setNome] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [contaPrivada, setContaPrivada] = useState(false)
  const [curso, setCurso] = useState('base_central')
  const [instituicoes, setInstituicoes] = useState([
    { id: DEFAULT_INSTITUTION_ID, official_name: DEFAULT_INSTITUTION_NAME },
  ])
  const [instituicaoId, setInstituicaoId] = useState(DEFAULT_INSTITUTION_ID)
  const [fotoArquivo, setFotoArquivo] = useState(null)
  const [previewFoto, setPreviewFoto] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const inputFotoRef = useRef(null)
  const fotoPreviewUrlRef = useRef('')
  const navigate = useNavigate()

  useEffect(() => {
    carregarPerfil()
    return () => {
      if (fotoPreviewUrlRef.current) URL.revokeObjectURL(fotoPreviewUrlRef.current)
    }
  }, [])

  function validarUsername(valor) {
    if (valor.includes(' ')) return 'Não é permitido usar espaço.'
    if (valor.length > 30) return 'Máximo de 30 caracteres.'
    if (valor.startsWith('.')) return 'Não pode começar com ".".'
    if (valor.endsWith('.')) return 'Não pode terminar com ".".'
    if (valor.includes('..')) return 'Não pode usar "..".'

    const regex = /^[a-z0-9._]+$/
    if (!regex.test(valor)) {
      return 'Use apenas letras, números, "." ou "_".'
    }

    return null
  }

  async function carregarInstituicoes() {
    const fallback = [
      {
        id: DEFAULT_INSTITUTION_ID,
        official_name: DEFAULT_INSTITUTION_NAME,
      },
    ]

    try {
      const { data, error } = await supabase
        .from('education_institutions')
        .select('id, official_name, is_active')
        .eq('is_active', true)
        .order('official_name', { ascending: true })

      if (error || !data || data.length === 0) {
        return fallback
      }

      return data
    } catch {
      return fallback
    }
  }

  async function carregarPerfil() {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/auth')
        return
      }

      const [perfilResp, instituicoesData] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('account_id', user.id)
          .single(),
        carregarInstituicoes(),
      ])

      const data = perfilResp.data

      if (!data) {
        setErro('Perfil não encontrado.')
        return
      }

      const instituicoesDisponiveis = instituicoesData?.length
        ? instituicoesData
        : [{ id: DEFAULT_INSTITUTION_ID, official_name: DEFAULT_INSTITUTION_NAME }]
      const instituicaoPadrao = instituicoesDisponiveis[0]
      const instituicaoIdFinal =
        data.institution_id ||
        instituicaoPadrao?.id ||
        DEFAULT_INSTITUTION_ID

      setPerfil(data)
      setInstituicoes(instituicoesDisponiveis)
      setNome(data.nome || '')
      setUsername(data.username || '')
      setBio(data.bio || '')
      setContaPrivada(Boolean(data.is_private))
      setCurso(normalizarCurso(data.course_area))
      setInstituicaoId(instituicaoIdFinal)
      setPreviewFoto(data.foto_url || '')
    } catch {
      setErro('Erro ao carregar perfil.')
    } finally {
      setCarregando(false)
    }
  }

  function selecionarFoto(event) {
    const arquivo = event.target.files?.[0]
    if (!arquivo) return

    setErro('')
    setSucesso('')

    const extensao = arquivo.name.split('.').pop()?.toLowerCase()
    const tipoSuportado = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(arquivo.type)
      || ((!arquivo.type || arquivo.type === 'application/octet-stream')
        && ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extensao))

    if (!tipoSuportado) {
      setErro('Use uma imagem JPG, PNG, WebP ou GIF. Fotos HEIC precisam ser convertidas antes.')
      event.target.value = ''
      return
    }

    if (arquivo.size > 8 * 1024 * 1024) {
      setErro('A foto deve ter no máximo 8 MB.')
      event.target.value = ''
      return
    }

    if (fotoPreviewUrlRef.current) URL.revokeObjectURL(fotoPreviewUrlRef.current)
    fotoPreviewUrlRef.current = URL.createObjectURL(arquivo)
    setFotoArquivo(arquivo)
    setPreviewFoto(fotoPreviewUrlRef.current)
    event.target.value = ''
  }

  async function uploadFoto(profileId) {
    if (!fotoArquivo) return { url: perfil?.foto_url || null, path: null }

    const extensaoPorTipo = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
    }
    const extensaoPorNome = fotoArquivo.name.split('.').pop()?.toLowerCase()
    const extensao = extensaoPorTipo[fotoArquivo.type]
      || (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extensaoPorNome) ? extensaoPorNome : null)
    if (!extensao) throw new Error('Formato inválido. Use JPG, PNG, WebP ou GIF.')
    const contentType = extensao === 'jpg' || extensao === 'jpeg'
      ? 'image/jpeg'
      : `image/${extensao}`
    const caminho = `profile-${profileId}-${Date.now()}.${extensao === 'jpeg' ? 'jpg' : extensao}`

    const { error } = await supabase.storage
      .from('stories')
      .upload(caminho, fotoArquivo, {
        upsert: false,
        contentType,
        cacheControl: '3600',
      })

    if (error) throw error

    const { data } = supabase.storage
      .from('stories')
      .getPublicUrl(caminho)

    return { url: data.publicUrl, path: caminho }
  }

  async function salvarPerfil(event) {
    event.preventDefault()
    if (!perfil) return

    setErro('')
    setSucesso('')

    const usernameLimpo = username.toLowerCase().trim()
    const erroUsername = validarUsername(usernameLimpo)
    if (erroUsername) {
      setErro(erroUsername)
      return
    }

    if (analyzeText(`${nome} ${usernameLimpo} ${bio}`).decision !== 'allow') {
      setErro('Seu nome, nome de usuário ou biografia pode violar as Regras da Comunidade. Revise o conteúdo.')
      return
    }

    setSalvando(true)
    let novaFotoEnviada = null
    let erroUploadFoto = ''
    let fotoSalvaSeparadamente = false

    try {
      const { data: existente } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', usernameLimpo)
        .neq('id', perfil.id)

      if (existente?.length > 0) {
        setErro('Username ja em uso.')
        setSalvando(false)
        return
      }

      if (fotoArquivo) {
        try {
          novaFotoEnviada = await uploadFoto(perfil.id)
          const { data: fotoAtualizada, error: erroFotoPerfil } = await supabase
            .from('profiles')
            .update({ foto_url: novaFotoEnviada.url })
            .eq('id', perfil.id)
            .eq('account_id', perfil.account_id)
            .select('foto_url')
            .maybeSingle()

          if (erroFotoPerfil) throw erroFotoPerfil
          if (!fotoAtualizada) {
            throw new Error('O banco não confirmou a atualização da foto.')
          }

          const fotoUrlSalva = fotoAtualizada.foto_url || novaFotoEnviada.url
          fotoSalvaSeparadamente = true
          novaFotoEnviada = null
          setPerfil((atual) => ({ ...atual, foto_url: fotoUrlSalva }))
          if (fotoPreviewUrlRef.current) URL.revokeObjectURL(fotoPreviewUrlRef.current)
          fotoPreviewUrlRef.current = ''
          setPreviewFoto(fotoUrlSalva)
          setFotoArquivo(null)
        } catch (uploadError) {
          const detalheFoto = `${uploadError?.message || ''}`
          if (novaFotoEnviada?.path) {
            const { error: erroRemocao } = await supabase.storage.from('stories').remove([novaFotoEnviada.path])
            if (erroRemocao) console.warn('[Nexo11 Profile] Não foi possível remover o upload que falhou', erroRemocao)
          }
          novaFotoEnviada = null
          erroUploadFoto = /institution|institui[cç][aã]o|education_institutions/i.test(detalheFoto)
            ? 'O vínculo com a instituição impediu a atualização da foto. Fale com a coordenação para conferir o cadastro escolar.'
            : detalheFoto || 'Não foi possível enviar a foto.'
        }
      }

      const payloadBase = {
        nome: nome.trim(),
        username: usernameLimpo,
        bio: bio.trim(),
        course_area: curso,
      }

      let { data: perfilSalvo, error } = await supabase
        .from('profiles')
        .update({
          ...payloadBase,
          is_private: contaPrivada,
        })
        .eq('id', perfil.id)
        .eq('account_id', perfil.account_id)
        .select('*')
        .maybeSingle()

      if (
        error &&
        /(is_private|course_area|institution_|enrollment_number|schema cache|column)/i.test(
          error.message || ''
        )
      ) {
        const { data: perfilFallback, error: fallbackError } = await supabase
          .from('profiles')
          .update({
            nome: nome.trim(),
            username: usernameLimpo,
            bio: bio.trim(),
          })
          .eq('id', perfil.id)
          .eq('account_id', perfil.account_id)
          .select('*')
          .maybeSingle()

        if (fallbackError) throw fallbackError
        if (!perfilFallback) {
          throw new Error('O banco não confirmou a atualização. Entre novamente e tente salvar.')
        }

        setPerfil(perfilFallback)
      if (!erroUploadFoto) {
        if (fotoPreviewUrlRef.current) URL.revokeObjectURL(fotoPreviewUrlRef.current)
        fotoPreviewUrlRef.current = ''
        setPreviewFoto(perfilFallback.foto_url || '')
        setFotoArquivo(null)
        }
        setSucesso([
          `Nome, usuário e bio salvos${erroUploadFoto ? `; a foto não foi enviada: ${erroUploadFoto}` : `, ${fotoArquivo ? 'foto' : 'avatar atual'} confirmada`}.`,
          'Curso e privacidade não foram aceitos pelo esquema atual do banco.',
        ].join(' '))
        return
      }

      if (error) throw error
      if (!perfilSalvo) {
        throw new Error('O banco não confirmou a atualização. Entre novamente e tente salvar.')
      }

      setPerfil(perfilSalvo)
      if (!erroUploadFoto) {
        if (fotoPreviewUrlRef.current) URL.revokeObjectURL(fotoPreviewUrlRef.current)
        fotoPreviewUrlRef.current = ''
        setPreviewFoto(perfilSalvo.foto_url || '')
        setFotoArquivo(null)
      }
      setSucesso(erroUploadFoto
        ? `Dados do perfil salvos. A foto não foi enviada: ${erroUploadFoto}`
        : 'Perfil atualizado e confirmado no banco.')
    } catch (error) {
      if (novaFotoEnviada?.path) {
        const { error: remocaoErro } = await supabase.storage.from('stories').remove([novaFotoEnviada.path])
        if (remocaoErro) console.warn('[Nexo11 Profile] Não foi possível remover o upload que falhou ao salvar', remocaoErro)
      }
      const mensagem = error?.message || ''

      if (/duplicate key|profiles_username_key/i.test(mensagem)) {
        setErro('Username ja em uso.')
      } else if (/storage|bucket/i.test(mensagem)) {
        setErro(fotoSalvaSeparadamente
          ? 'A foto foi salva; o serviço de imagem apresentou um problema ao concluir os outros dados.'
          : 'Erro no upload da foto. Tente novamente em instantes.')
      } else if (fotoSalvaSeparadamente && /(institution|institui[cç][aã]o|education_institutions)/i.test(mensagem)) {
        setSucesso('Foto de perfil salva. Os outros dados não foram alterados porque o vínculo com a instituição foi recusado pelo banco.')
        setErro('Fale com a coordenação para conferir o cadastro escolar e depois tente salvar os outros dados.')
      } else if (fotoSalvaSeparadamente && mensagem) {
        setErro(`A foto de perfil foi salva, mas os outros dados não foram atualizados: ${mensagem}`)
      } else if (/(institution|institui[cç][aã]o|education_institutions)/i.test(mensagem)) {
        setErro('Não foi possível salvar os dados por causa do vínculo com a instituição. Fale com a coordenação para conferir o cadastro escolar.')
      } else if (mensagem) {
        setErro(`Erro ao salvar perfil: ${mensagem}`)
      } else {
        setErro('Erro ao salvar perfil.')
      }
    } finally {
      setSalvando(false)
    }
  }

async function salvarFotoOficial() {
    if (!perfil || !fotoArquivo || salvando) return

    setErro('')
    setSucesso('')
    setSalvando(true)
    let fotoEnviada = null

    try {
      fotoEnviada = await uploadFoto(perfil.id)
      const { data: perfilAtualizado, error } = await supabase
        .from('profiles')
        .update({ foto_url: fotoEnviada.url })
        .eq('id', perfil.id)
        .eq('account_id', perfil.account_id)
        .select('*')
        .maybeSingle()

      if (error) throw error
      if (!perfilAtualizado) {
        if (fotoEnviada.path) await supabase.storage.from('stories').remove([fotoEnviada.path])
        throw new Error('O banco não confirmou a atualização. Entre novamente e tente salvar.')
      }

      setPerfil(perfilAtualizado)
      if (fotoPreviewUrlRef.current) URL.revokeObjectURL(fotoPreviewUrlRef.current)
      fotoPreviewUrlRef.current = ''
      setPreviewFoto(perfilAtualizado.foto_url || '')
      setFotoArquivo(null)
      setSucesso('Foto oficial atualizada com sucesso.')
    } catch (error) {
      if (fotoEnviada?.path) await supabase.storage.from('stories').remove([fotoEnviada.path])
      const mensagem = `${error?.message || ''}`.trim()
      setErro(mensagem
        ? `Não foi possível atualizar a foto: ${mensagem}`
        : 'Não foi possível atualizar a foto.')
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return <SocialLoader variant="editor" showBottomNav />
  }

  const inicialNome = nome?.charAt(0)?.toUpperCase() || 'U'
  const ehPerfilOficial =
    Boolean(perfil?.is_verified) && `${perfil?.username || ''}`.toLowerCase() === 'nexo11'

  return (
    <div className="container">
      <div className="topbar edit-topbar">
        <button
          type="button"
          className="edit-back-btn"
          onClick={() => navigate('/perfil')}
        >
          Voltar
        </button>

        <h1>Editar perfil</h1>

        <button
          type="button"
          className="edit-save-link"
          onClick={salvarPerfil}
          disabled={salvando}
        >
          {salvando ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      <div className="page">
        {erro ? <div className="alert-box erro-box">{erro}</div> : null}
        {sucesso ? <div className="alert-box ok-box">{sucesso}</div> : null}
        {sucesso ? (
          <button type="button" className="edit-profile-saved-link" onClick={() => navigate('/perfil')}>
            Ver meu perfil atualizado
          </button>
        ) : null}

        <section className="edit-profile-card">
          <div className="edit-avatar-area">
            <button
              type="button"
              className="edit-avatar-picker"
              onClick={() => inputFotoRef.current?.click()}
              aria-label={ehPerfilOficial ? 'Trocar foto oficial do NEXO 11' : 'Trocar foto do perfil'}
            >
              {previewFoto ? (
                <img
                  src={previewFoto}
                  alt={nome || 'Avatar'}
                  className="edit-profile-avatar"
                />
              ) : (
                <span className="edit-profile-avatar fallback">{inicialNome}</span>
              )}
              <span className="edit-avatar-picker-overlay">Trocar foto</span>
            </button>

            <button
              type="button"
              className="change-photo-btn"
              onClick={() => inputFotoRef.current?.click()}
            >
              {ehPerfilOficial ? 'Escolher nova foto oficial' : 'Alterar foto'}
            </button>

            {ehPerfilOficial && fotoArquivo ? (
              <button
                type="button"
                className="btn official-photo-save-btn"
                onClick={salvarFotoOficial}
                disabled={salvando}
              >
                {salvando ? 'Salvando foto...' : 'Salvar nova foto oficial'}
              </button>
            ) : null}

            {ehPerfilOficial ? (
              <p className="official-photo-help">
                A foto será atualizada em todo o aplicativo sem alterar o @NEXO11 nem o verificado.
              </p>
            ) : null}

            <input
              ref={inputFotoRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
              onChange={selecionarFoto}
              style={{ display: 'none' }}
            />
          </div>

          <form className="edit-profile-form" onSubmit={salvarPerfil}>
            <div className="edit-field">
              <label htmlFor="edit-name">Nome</label>
              <input
                id="edit-name"
                className="edit-input"
                type="text"
                placeholder="Seu nome"
                value={nome}
                onChange={(event) => setNome(event.target.value)}
              />
            </div>

            <div className="edit-field">
              <label htmlFor="edit-username">Username</label>
              <input
                id="edit-username"
                className="edit-input"
                type="text"
                placeholder="seu.username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>

            <div className="edit-field">
              <label htmlFor="edit-institution">Instituição vinculada</label>
              <select
                id="edit-institution"
                className="story-duration-select"
                value={instituicaoId}
                disabled
              >
                {instituicoes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.official_name}
                  </option>
                ))}
              </select>
              <small>A instituição é vinculada ao cadastro escolar. Para alterá-la, fale com a coordenação.</small>
            </div>

            <div className="edit-field">
              <label htmlFor="edit-bio">Bio</label>
              <textarea
                id="edit-bio"
                className="edit-input edit-textarea"
                placeholder="Fale um pouco sobre você..."
                value={bio}
                onChange={(event) => setBio(event.target.value)}
              />
            </div>

            <div className="edit-field">
              <label htmlFor="edit-course">Curso</label>
              <select
                id="edit-course"
                className="story-duration-select"
                value={curso}
                onChange={(event) => setCurso(event.target.value)}
              >
                {COURSE_OPTIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="edit-field">
              <div className="edit-privacy-card">
                <label className="edit-privacy-label" htmlFor="is-private-toggle">
                  <div>
                    <strong>Conta privada</strong>
                    <p>Apenas seguidores aceitos podem ver seu perfil completo.</p>
                  </div>

                  <input
                    id="is-private-toggle"
                    type="checkbox"
                    checked={contaPrivada}
                    onChange={(event) => setContaPrivada(event.target.checked)}
                  />
                </label>
              </div>
            </div>

            <button className="btn edit-submit-btn" type="submit" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </form>
        </section>
      </div>

      <BottomNav />
    </div>
  )
}


