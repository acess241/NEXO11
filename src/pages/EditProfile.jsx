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
  const navigate = useNavigate()

  useEffect(() => {
    carregarPerfil()
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

    setFotoArquivo(arquivo)
    setPreviewFoto(URL.createObjectURL(arquivo))
  }

  async function uploadFoto(profileId) {
    if (!fotoArquivo) return perfil?.foto_url || null

    const extensao = fotoArquivo.name.split('.').pop()
    const nomeArquivo = `${profileId}-${Date.now()}.${extensao}`

    const { error } = await supabase.storage
      .from('stories')
      .upload(`profile-${nomeArquivo}`, fotoArquivo, { upsert: true })

    if (error) throw error

    const { data } = supabase.storage
      .from('stories')
      .getPublicUrl(`profile-${nomeArquivo}`)

    return data.publicUrl
  }

  async function salvarPerfil(event) {
    event.preventDefault()
    if (!perfil) return

    setErro('')
    setSucesso('')

    const usernameLimpo = username.toLowerCase().trim()
    const erroUsername = validarUsername(usernameLimpo)
    const instituicaoSelecionada = instituicoes.find((item) => item.id === instituicaoId)
    const instituicaoNomeFinal =
      instituicaoSelecionada?.official_name || perfil?.institution_name || DEFAULT_INSTITUTION_NAME

    if (erroUsername) {
      setErro(erroUsername)
      return
    }

    setSalvando(true)

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

      const fotoFinal = await uploadFoto(perfil.id)

      const payloadBase = {
        nome: nome.trim(),
        username: usernameLimpo,
        bio: bio.trim(),
        foto_url: fotoFinal,
        course_area: curso,
        institution_id: instituicaoSelecionada?.id || DEFAULT_INSTITUTION_ID,
        institution_name: instituicaoNomeFinal,
      }

      let { error } = await supabase
        .from('profiles')
        .update({
          ...payloadBase,
          is_private: contaPrivada,
        })
        .eq('id', perfil.id)

      if (
        error &&
        /(is_private|course_area|institution_|enrollment_number|schema cache|column)/i.test(
          error.message || ''
        )
      ) {
        const { error: fallbackError } = await supabase
          .from('profiles')
          .update({
            nome: nome.trim(),
            username: usernameLimpo,
            bio: bio.trim(),
            foto_url: fotoFinal,
          })
          .eq('id', perfil.id)

        if (fallbackError) throw fallbackError

        setSucesso(
          'Perfil atualizado. Rode o SQL de perfil escolar para liberar curso, privacidade e instituição.'
        )
        setFotoArquivo(null)
        return
      }

      if (error) throw error

      setSucesso('Perfil atualizado com sucesso.')
      setFotoArquivo(null)
    } catch (error) {
      const mensagem = error?.message || ''

      if (/duplicate key|profiles_username_key/i.test(mensagem)) {
        setErro('Username ja em uso.')
      } else if (/storage|bucket/i.test(mensagem)) {
        setErro('Erro no upload da foto. Tente novamente em instantes.')
      } else if (mensagem) {
        setErro(`Erro ao salvar perfil: ${mensagem}`)
      } else {
        setErro('Erro ao salvar perfil.')
      }
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return <SocialLoader variant="editor" showBottomNav />
  }

  const inicialNome = nome?.charAt(0)?.toUpperCase() || 'U'

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

        <section className="edit-profile-card">
          <div className="edit-avatar-area">
            {previewFoto ? (
              <img
                src={previewFoto}
                alt={nome || 'Avatar'}
                className="edit-profile-avatar"
              />
            ) : (
              <div className="edit-profile-avatar fallback">{inicialNome}</div>
            )}

            <button
              type="button"
              className="change-photo-btn"
              onClick={() => inputFotoRef.current?.click()}
            >
              Alterar foto
            </button>

            <input
              ref={inputFotoRef}
              type="file"
              accept="image/*"
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
              <label htmlFor="edit-institution">Instituição</label>
              <select
                id="edit-institution"
                className="story-duration-select"
                value={instituicaoId}
                onChange={(event) => setInstituicaoId(event.target.value)}
              >
                {instituicoes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.official_name}
                  </option>
                ))}
              </select>
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


