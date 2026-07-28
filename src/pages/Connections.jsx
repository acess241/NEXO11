import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import { criarNotificacaoSePermitido } from '../lib/notificationPreferences'
import { formatDisplayName } from '../lib/textFormat'
import { supabase } from '../lib/supabase'

function getInicial(nome) {
  return formatDisplayName(nome)?.charAt(0)?.toUpperCase() || 'U'
}

function traduzirErroConexoes(error, fallback) {
  const code = error?.code || ''
  const detalhe = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()

  if (code === '42P01' || code === 'PGRST205' || detalhe.includes('follow_requests') || detalhe.includes('is_private')) {
    return 'Rode o SQL de privacidade e solicitações para liberar este recurso.'
  }

  return fallback
}

export default function Connections() {
  const [meuPerfil, setMeuPerfil] = useState(null)
  const [seguidoresPerfis, setSeguidoresPerfis] = useState([])
  const [seguindoPerfis, setSeguindoPerfis] = useState([])
  const [descobrirPerfis, setDescobrirPerfis] = useState([])
  const [seguindoIds, setSeguindoIds] = useState([])
  const [solicitacoesPendentesIds, setSolicitacoesPendentesIds] = useState([])
  const [processandoPerfilId, setProcessandoPerfilId] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    void iniciar()
  }, [])

  useEffect(() => {
    if (carregando) return

    const foco = `${location.state?.focus || ''}`.toLowerCase()
    if (foco === 'seguidores') {
      const el = document.getElementById('connections-seguidores')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    if (foco === 'seguindo') {
      const el = document.getElementById('connections-seguindo')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [carregando, location.state, seguidoresPerfis.length, seguindoPerfis.length])

  async function iniciar() {
    try {
      setCarregando(true)
      setErro('')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/auth')
        return
      }

      const { data: perfilData, error: perfilError } = await supabase
        .from('profiles')
        .select('id, nome, username')
        .eq('account_id', user.id)
        .single()

      if (perfilError) throw perfilError

      setMeuPerfil(perfilData)
      await carregarListas(perfilData.id)
    } catch (error) {
      setErro(traduzirErroConexoes(error, 'Não foi possível carregar suas conexões agora.'))
    } finally {
      setCarregando(false)
    }
  }

  async function carregarListas(profileId) {
    const [seguidoresResp, seguindoResp, solicitacoesResp, perfisResp] = await Promise.all([
      supabase.from('follows').select('follower_profile_id').eq('following_profile_id', profileId),
      supabase.from('follows').select('following_profile_id').eq('follower_profile_id', profileId),
      supabase
        .from('follow_requests')
        .select('receiver_profile_id')
        .eq('requester_profile_id', profileId)
        .eq('status', 'pending'),
      supabase.from('profiles').select('id, nome, username, foto_url, bio, is_private').order('created_at', { ascending: false }).limit(300),
    ])

    if (seguidoresResp.error) throw seguidoresResp.error
    if (seguindoResp.error) throw seguindoResp.error
    if (solicitacoesResp.error) throw solicitacoesResp.error
    if (perfisResp.error) throw perfisResp.error

    const seguidoresIdsList = (seguidoresResp.data || []).map((item) => item.follower_profile_id).filter(Boolean)
    const seguindoIdsList = (seguindoResp.data || []).map((item) => item.following_profile_id).filter(Boolean)
    const pendentesIdsList = (solicitacoesResp.data || []).map((item) => item.receiver_profile_id).filter(Boolean)

    const seguidoresSet = new Set(seguidoresIdsList)
    const seguindoSet = new Set(seguindoIdsList)

    const todosPerfis = (perfisResp.data || []).filter((item) => item.id !== profileId)

    setSeguindoIds(seguindoIdsList)
    setSolicitacoesPendentesIds(pendentesIdsList)
    setSeguidoresPerfis(todosPerfis.filter((item) => seguidoresSet.has(item.id)))
    setSeguindoPerfis(todosPerfis.filter((item) => seguindoSet.has(item.id)))
    setDescobrirPerfis(todosPerfis.filter((item) => !seguindoSet.has(item.id)))
  }

  async function alternarSeguir(perfilAlvo) {
    if (!meuPerfil || processandoPerfilId) return

    const alvoId = perfilAlvo.id
    const jaSigo = seguindoIds.includes(alvoId)
    const temSolicitacaoPendente = solicitacoesPendentesIds.includes(alvoId)

    setErro('')
    setProcessandoPerfilId(alvoId)

    try {
      if (jaSigo) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_profile_id', meuPerfil.id)
          .eq('following_profile_id', alvoId)

        if (error) throw error
      } else if (perfilAlvo.is_private) {
        if (temSolicitacaoPendente) {
          const { error } = await supabase
            .from('follow_requests')
            .update({
              status: 'canceled',
              updated_at: new Date().toISOString(),
              responded_at: new Date().toISOString(),
            })
            .eq('requester_profile_id', meuPerfil.id)
            .eq('receiver_profile_id', alvoId)
            .eq('status', 'pending')

          if (error) throw error
        } else {
          const agoraIso = new Date().toISOString()

          const { error } = await supabase.from('follow_requests').upsert(
            {
              requester_profile_id: meuPerfil.id,
              receiver_profile_id: alvoId,
              status: 'pending',
              updated_at: agoraIso,
              responded_at: null,
            },
            {
              onConflict: 'requester_profile_id,receiver_profile_id',
            }
          )

          if (error) throw error
        }
      } else {
        const { error: followError } = await supabase.from('follows').insert({
          follower_profile_id: meuPerfil.id,
          following_profile_id: alvoId,
        })

        if (followError) throw followError

        const resultadoNotificacao = await criarNotificacaoSePermitido({
          receiverProfileId: alvoId,
          actorProfileId: meuPerfil.id,
          type: 'follow',
        })

        if (resultadoNotificacao?.error) {
          console.warn('Falha ao notificar follow:', resultadoNotificacao.error.message)
        }
      }

      await carregarListas(meuPerfil.id)
    } catch (error) {
      setErro(traduzirErroConexoes(error, 'Não foi possível atualizar este follow agora.'))
    } finally {
      setProcessandoPerfilId(null)
    }
  }

  function abrirPerfilPorUsername(username) {
    if (!username) return

    if (meuPerfil?.username === username) {
      navigate('/perfil')
      return
    }

    navigate(`/usuario/${username}`)
  }

  function obterTextoBotao(perfilAlvo) {
    if (seguindoIds.includes(perfilAlvo.id)) return 'Seguindo'
    if (perfilAlvo.is_private) {
      return solicitacoesPendentesIds.includes(perfilAlvo.id) ? 'Solicitado' : 'Solicitar'
    }
    return 'Seguir'
  }

  function obterClasseBotao(perfilAlvo) {
    if (seguindoIds.includes(perfilAlvo.id) || solicitacoesPendentesIds.includes(perfilAlvo.id)) {
      return 'profile-secondary-btn'
    }

    return 'profile-primary-btn'
  }

  if (carregando) {
    return <SocialLoader variant="profile" showBottomNav />
  }

  return (
    <div className="container">
      <div className="topbar connections-topbar">
        <button type="button" className="edit-back-btn" onClick={() => navigate('/perfil')}>
          Voltar
        </button>

        <h1>Conexões</h1>

        <button
          type="button"
          className="edit-save-link"
          onClick={() => {
            if (meuPerfil?.id) {
              void carregarListas(meuPerfil.id)
            }
          }}
          disabled={!meuPerfil?.id || Boolean(processandoPerfilId)}
        >
          Atualizar
        </button>
      </div>

      <div className="page connections-page">
        {erro ? <div className="alert-box erro-box">{erro}</div> : null}

        <section className="connections-summary-card">
          <p>
            <strong>{seguidoresPerfis.length}</strong> seguidores
          </p>
          <p>
            <strong>{seguindoPerfis.length}</strong> seguindo
          </p>
          <p>
            <strong>{descobrirPerfis.length}</strong> perfis para descobrir
          </p>
        </section>

        <section className="connections-section" id="connections-seguidores">
          <div className="connections-section-head">
            <h3>Seguidores</h3>
            <span>{seguidoresPerfis.length}</span>
          </div>

          {seguidoresPerfis.length === 0 ? (
            <div className="empty-state">
              <p>Você ainda não tem seguidores.</p>
            </div>
          ) : (
            <div className="connections-list">
              {seguidoresPerfis.map((perfilAlvo) => (
                <div className="connections-row" key={perfilAlvo.id}>
                  <button
                    type="button"
                    className="connections-user-btn"
                    onClick={() => abrirPerfilPorUsername(perfilAlvo.username)}
                  >
                    <div className="connections-avatar">
                      {perfilAlvo.foto_url ? (
                        <img src={perfilAlvo.foto_url} alt={formatDisplayName(perfilAlvo.nome) || perfilAlvo.username} />
                      ) : (
                        <span>{getInicial(perfilAlvo.nome)}</span>
                      )}
                    </div>

                    <div className="connections-user-copy">
                      <strong>{formatDisplayName(perfilAlvo.nome) || 'Usuário Nexo'}</strong>
                      <span>@{perfilAlvo.username}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`connections-action-btn ${obterClasseBotao(perfilAlvo)}`}
                    onClick={() => alternarSeguir(perfilAlvo)}
                    disabled={processandoPerfilId === perfilAlvo.id}
                  >
                    {processandoPerfilId === perfilAlvo.id ? '...' : obterTextoBotao(perfilAlvo)}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="connections-section" id="connections-seguindo">
          <div className="connections-section-head">
            <h3>Seguindo</h3>
            <span>{seguindoPerfis.length}</span>
          </div>

          {seguindoPerfis.length === 0 ? (
            <div className="empty-state">
              <p>Você ainda não segue ninguém.</p>
            </div>
          ) : (
            <div className="connections-list">
              {seguindoPerfis.map((perfilAlvo) => (
                <div className="connections-row" key={perfilAlvo.id}>
                  <button
                    type="button"
                    className="connections-user-btn"
                    onClick={() => abrirPerfilPorUsername(perfilAlvo.username)}
                  >
                    <div className="connections-avatar">
                      {perfilAlvo.foto_url ? (
                        <img src={perfilAlvo.foto_url} alt={formatDisplayName(perfilAlvo.nome) || perfilAlvo.username} />
                      ) : (
                        <span>{getInicial(perfilAlvo.nome)}</span>
                      )}
                    </div>

                    <div className="connections-user-copy">
                      <strong>{formatDisplayName(perfilAlvo.nome) || 'Usuário Nexo'}</strong>
                      <span>@{perfilAlvo.username}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`connections-action-btn ${obterClasseBotao(perfilAlvo)}`}
                    onClick={() => alternarSeguir(perfilAlvo)}
                    disabled={processandoPerfilId === perfilAlvo.id}
                  >
                    {processandoPerfilId === perfilAlvo.id ? '...' : obterTextoBotao(perfilAlvo)}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="connections-section">
          <div className="connections-section-head">
            <h3>Perfis para descobrir</h3>
            <span>{descobrirPerfis.length}</span>
          </div>

          {descobrirPerfis.length === 0 ? (
            <div className="empty-state">
              <p>Você já segue todos os perfis disponíveis.</p>
            </div>
          ) : (
            <div className="connections-list">
              {descobrirPerfis.map((perfilAlvo) => (
                <div className="connections-row" key={perfilAlvo.id}>
                  <button
                    type="button"
                    className="connections-user-btn"
                    onClick={() => abrirPerfilPorUsername(perfilAlvo.username)}
                  >
                    <div className="connections-avatar">
                      {perfilAlvo.foto_url ? (
                        <img src={perfilAlvo.foto_url} alt={formatDisplayName(perfilAlvo.nome) || perfilAlvo.username} />
                      ) : (
                        <span>{getInicial(perfilAlvo.nome)}</span>
                      )}
                    </div>

                    <div className="connections-user-copy">
                      <strong>{formatDisplayName(perfilAlvo.nome) || 'Usuário Nexo'}</strong>
                      <span>@{perfilAlvo.username}</span>
                      {perfilAlvo.is_private ? <small className="connections-private-chip">Privado</small> : null}
                    </div>
                  </button>

                  <button
                    type="button"
                    className={`connections-action-btn ${obterClasseBotao(perfilAlvo)}`}
                    onClick={() => alternarSeguir(perfilAlvo)}
                    disabled={processandoPerfilId === perfilAlvo.id}
                  >
                    {processandoPerfilId === perfilAlvo.id ? '...' : obterTextoBotao(perfilAlvo)}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <BottomNav />
    </div>
  )
}
