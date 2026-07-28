import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import BottomNav from '../components/BottomNav'

export default function Notifications() {
  const [meuPerfilId, setMeuPerfilId] = useState(null)
  const [meuUsername, setMeuUsername] = useState('')
  const [notificacoes, setNotificacoes] = useState([])
  const [solicitacoes, setSolicitacoes] = useState([])
  const [processandoSolicitacaoId, setProcessandoSolicitacaoId] = useState(null)
  const [erroSolicitacoes, setErroSolicitacoes] = useState('')

  const navigate = useNavigate()

  useEffect(() => {
    let notificationsChannel
    let followRequestsChannel

    async function iniciar() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data: perfilData } = await supabase
        .from('profiles')
        .select('*')
        .eq('account_id', user.id)
        .single()

      if (!perfilData) return
      setMeuPerfilId(perfilData.id)
      setMeuUsername(perfilData.username || '')

      await Promise.all([
        marcarComoLidas(perfilData.id),
        carregarNotificacoes(perfilData.id),
        carregarSolicitacoes(perfilData.id),
      ])

      notificationsChannel = supabase
        .channel(`notificacoes-realtime-${perfilData.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `receiver_profile_id=eq.${perfilData.id}`,
          },
          async () => {
            await marcarComoLidas(perfilData.id)
            await carregarNotificacoes(perfilData.id)
          }
        )
        .subscribe()

      followRequestsChannel = supabase
        .channel(`follow-requests-${perfilData.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'follow_requests',
            filter: `receiver_profile_id=eq.${perfilData.id}`,
          },
          async () => {
            await carregarSolicitacoes(perfilData.id)
          }
        )
        .subscribe()
    }

    iniciar()

    return () => {
      if (notificationsChannel) supabase.removeChannel(notificationsChannel)
      if (followRequestsChannel) supabase.removeChannel(followRequestsChannel)
    }
  }, [])

  async function atualizarTudo() {
    if (!meuPerfilId) return

    await Promise.all([
      carregarNotificacoes(meuPerfilId),
      carregarSolicitacoes(meuPerfilId),
    ])
  }

  async function marcarComoLidas(profileId) {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('receiver_profile_id', profileId)
      .is('read_at', null)
  }

  async function carregarNotificacoes(profileId) {
    const tentativaComXp = await supabase
      .from('notifications')
      .select(
        `
          *,
          xp_delta,
          xp_reason,
          metadata,
          actor:actor_profile_id (
            id,
            nome,
            username,
            foto_url
          )
        `
      )
      .eq('receiver_profile_id', profileId)
      .order('created_at', { ascending: false })

    if (!tentativaComXp.error) {
      setNotificacoes(tentativaComXp.data || [])
      return
    }

    const tentativaFallback = await supabase
      .from('notifications')
      .select(
        `
          *,
          actor:actor_profile_id (
            id,
            nome,
            username,
            foto_url
          )
        `
      )
      .eq('receiver_profile_id', profileId)
      .order('created_at', { ascending: false })

    setNotificacoes(tentativaFallback.data || [])
  }

  async function carregarSolicitacoes(profileId) {
    const { data } = await supabase
      .from('follow_requests')
      .select(
        `
          id,
          requester_profile_id,
          receiver_profile_id,
          status,
          created_at,
          requester:requester_profile_id (
            id,
            nome,
            username,
            foto_url
          )
        `
      )
      .eq('receiver_profile_id', profileId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    setSolicitacoes(data || [])
  }

  async function aceitarSolicitacao(solicitacao) {
    if (!meuPerfilId || processandoSolicitacaoId) return

    setErroSolicitacoes('')
    setProcessandoSolicitacaoId(solicitacao.id)

    try {
      const agoraIso = new Date().toISOString()

      const { error: aceitarError } = await supabase
        .from('follow_requests')
        .update({
          status: 'accepted',
          responded_at: agoraIso,
          updated_at: agoraIso,
        })
        .eq('id', solicitacao.id)
        .eq('receiver_profile_id', meuPerfilId)
        .eq('status', 'pending')

      if (aceitarError) throw aceitarError

      const { error: seguirError } = await supabase
        .from('follows')
        .upsert(
          {
            follower_profile_id: solicitacao.requester_profile_id,
            following_profile_id: meuPerfilId,
          },
          {
            onConflict: 'follower_profile_id,following_profile_id',
          }
        )

      if (seguirError) throw seguirError

      await carregarSolicitacoes(meuPerfilId)
    } catch {
      setErroSolicitacoes('Não foi possível aceitar a solicitação agora.')
    } finally {
      setProcessandoSolicitacaoId(null)
    }
  }

  async function recusarSolicitacao(solicitacao) {
    if (!meuPerfilId || processandoSolicitacaoId) return

    setErroSolicitacoes('')
    setProcessandoSolicitacaoId(solicitacao.id)

    try {
      const agoraIso = new Date().toISOString()

      const { error } = await supabase
        .from('follow_requests')
        .update({
          status: 'rejected',
          responded_at: agoraIso,
          updated_at: agoraIso,
        })
        .eq('id', solicitacao.id)
        .eq('receiver_profile_id', meuPerfilId)
        .eq('status', 'pending')

      if (error) throw error
      await carregarSolicitacoes(meuPerfilId)
    } catch {
      setErroSolicitacoes('Não foi possível recusar a solicitação agora.')
    } finally {
      setProcessandoSolicitacaoId(null)
    }
  }

  function formatarTempo(dataIso) {
    const data = new Date(dataIso)
    const agora = new Date()
    const diff = Math.floor((agora - data) / 1000)

    if (diff < 60) return 'agora'
    if (diff < 3600) return `${Math.floor(diff / 60)} min`
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`
    return `${Math.floor(diff / 86400)} d`
  }

  function normalizarNumeroXp(valor) {
    if (typeof valor === 'number' && Number.isFinite(valor)) return Math.trunc(valor)
    if (typeof valor === 'string') {
      const texto = valor.trim()
      if (!texto) return null

      const direto = Number(texto.replace(',', '.'))
      if (Number.isFinite(direto)) return Math.trunc(direto)

      const match = texto.match(/[-+]?\d+(?:[.,]\d+)?/)
      if (!match) return null
      const numerico = Number(match[0].replace(',', '.'))
      return Number.isFinite(numerico) ? Math.trunc(numerico) : null
    }

    return null
  }

  function extrairDeltaXpDoTexto(textoBase = '') {
    const texto = `${textoBase || ''}`.trim()
    if (!texto) return null

    const matchXp = texto.match(/([-+]?\d+(?:[.,]\d+)?)\s*xp/i)
    if (!matchXp) return null

    const numero = normalizarNumeroXp(matchXp[1])
    if (numero === null) return null

    const precisaNegativo = /removeu|retirou|tirou|descontou|perdeu/i.test(texto)
    if (precisaNegativo && numero > 0) return numero * -1
    return numero
  }

  function obterDeltaXpNotificacao(notificacao) {
    const candidatos = [
      notificacao?.xp_delta,
      notificacao?.delta_xp,
      notificacao?.metadata?.xp_delta,
      notificacao?.metadata?.delta_xp,
      notificacao?.metadata?.deltaXp,
      notificacao?.metadata?.xp,
      notificacao?.metadata?.value,
      notificacao?.metadata?.amount,
      notificacao?.metadata?.total_xp,
    ]

    for (const candidato of candidatos) {
      const valor = normalizarNumeroXp(candidato)
      if (valor !== null) return valor
    }

    const textos = [
      notificacao?.xp_reason,
      notificacao?.message,
      notificacao?.content,
      notificacao?.metadata?.reason,
      notificacao?.metadata?.message,
    ]

    for (const texto of textos) {
      const deltaTexto = extrairDeltaXpDoTexto(texto)
      if (deltaTexto !== null) return deltaTexto
    }

    return null
  }

  function obterMotivoXpNotificacao(notificacao) {
    const motivoCampo = `${notificacao?.xp_reason || ''}`.trim()
    if (motivoCampo) return motivoCampo

    const motivoMetadata = `${notificacao?.metadata?.reason || ''}`.trim()
    if (motivoMetadata) return motivoMetadata

    return ''
  }

  function ehNotificacaoDeXp(notificacao) {
    if (notificacao?.metadata?.kind === 'xp_adjustment') return true
    return obterDeltaXpNotificacao(notificacao) !== null
  }

  function deveAnonimizarAtorDaNotificacao(notificacao) {
    return ehNotificacaoDeXp(notificacao)
  }

  function ehNotificacaoResultadoQuiz(notificacao) {
    return notificacao?.metadata?.kind === 'quiz_result'
  }

  function obterResumoQuizNotificacao(notificacao) {
    const passou = Boolean(notificacao?.metadata?.passed)
    const total = Number(notificacao?.metadata?.total_questions || 0)
    const acertos = Number(notificacao?.metadata?.correct_count || 0)
    const errosPayload = Number(notificacao?.metadata?.failed_questions)
    const erros = Number.isFinite(errosPayload)
      ? Math.max(0, errosPayload)
      : Math.max(total - acertos, 0)

    const motivoMeta = `${notificacao?.metadata?.reason || ''}`.trim()
    const motivo = motivoMeta || (passou ? 'Meta de aproveitamento atingida.' : 'Meta de aproveitamento não atingida.')

    return { passou, total, acertos, erros, motivo }
  }

  function textoNotificacao(notificacao) {
    if (ehNotificacaoResultadoQuiz(notificacao)) {
      const resumo = obterResumoQuizNotificacao(notificacao)
      return (
        `registrou seu quiz diário: ${resumo.acertos}/${resumo.total}. ` +
        `Você perdeu ${resumo.erros} questão(ões). Motivo: ${resumo.motivo}`
      )
    }

    if (ehNotificacaoDeXp(notificacao)) {
      const delta = obterDeltaXpNotificacao(notificacao)
      const motivo = obterMotivoXpNotificacao(notificacao)
      const sinal = delta !== null && delta > 0 ? '+' : ''
      const valor = delta !== null ? `${sinal}${delta}` : ''
      const acao = delta === null ? 'ajustou seu XP' : delta >= 0 ? 'ajustou seu XP' : 'removeu XP da sua conta'
      const motivoTexto = motivo ? ` Motivo: ${motivo}.` : ''
      const xpTexto = valor ? `: ${valor} XP.` : '.'
      return `${acao}${xpTexto}${motivoTexto}`
    }

    switch (notificacao.type) {
      case 'follow':
        return 'começou a te seguir'
      case 'like_post':
        return 'curtiu seu post'
      case 'like_comment':
        return 'curtiu seu comentário'
      case 'comment':
        return 'comentou no seu post'
      case 'reply':
        return 'respondeu seu comentário'
      case 'repost':
        return 'repostou seu post'
      case 'story':
        return 'publicou um story'
      case 'message':
        return 'te enviou uma mensagem'
      default:
        return 'interagiu com você'
    }
  }

  const solicitacoesVisiveis = solicitacoes
  const notificacoesVisiveis = notificacoes

  function abrirPerfilPorUsername(username) {
    if (!username) return
    if (username === meuUsername) {
      navigate('/perfil')
      return
    }
    navigate(`/usuario/${username}`)
  }

  return (
    <div className="container">
      <div className="topbar notifications-topbar settings-topbar">
        <button type="button" className="edit-back-btn" onClick={() => navigate('/perfil')}>
          {'<'} Voltar
        </button>
        <h1>Notificações</h1>
        <button type="button" className="edit-save-link" onClick={atualizarTudo} disabled={!meuPerfilId}>
          Atualizar
        </button>
      </div>

      <div className="page notifications-page">
        {erroSolicitacoes ? <div className="alert-box erro-box">{erroSolicitacoes}</div> : null}

        {solicitacoesVisiveis.length > 0 ? (
          <div className="notification-requests-section">
            <h3>Solicitacoes de follow</h3>

            <div className="feed-list">
              {solicitacoesVisiveis.map((solicitacao) => (
                <div className="notification-card request" key={solicitacao.id}>
                  <div className="notification-left">
                    {solicitacao.requester?.foto_url ? (
                      <img src={solicitacao.requester.foto_url} alt="" />
                    ) : (
                      <div className="mini-avatar">{solicitacao.requester?.nome?.charAt(0)?.toUpperCase() || 'U'}</div>
                    )}
                  </div>

                  <div className="notification-content">
                    <p>
                      <button
                        type="button"
                        className="notification-username-btn"
                        onClick={() => abrirPerfilPorUsername(solicitacao.requester?.username)}
                      >
                        {solicitacao.requester?.username || 'usuario'}
                      </button>{' '}
                      quer seguir voce
                    </p>
                    <span>{formatarTempo(solicitacao.created_at)}</span>
                  </div>

                  <div className="notification-request-actions">
                    <button
                      type="button"
                      className="action-btn"
                      disabled={processandoSolicitacaoId === solicitacao.id}
                      onClick={() => recusarSolicitacao(solicitacao)}
                    >
                      Recusar
                    </button>
                    <button
                      type="button"
                      className="action-btn request-accept-btn"
                      disabled={processandoSolicitacaoId === solicitacao.id}
                      onClick={() => aceitarSolicitacao(solicitacao)}
                    >
                      Aceitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {notificacoesVisiveis.length === 0 && solicitacoesVisiveis.length === 0 ? (
          <div className="empty-state">
            <p>Nenhuma notificação ainda.</p>
          </div>
        ) : notificacoesVisiveis.length > 0 ? (
          <div className="feed-list">
            {notificacoesVisiveis.map((notificacao) => (
              <div className="notification-card" key={notificacao.id}>
                {(() => {
                  const ehQuiz = ehNotificacaoResultadoQuiz(notificacao)
                  const ehXp = ehNotificacaoDeXp(notificacao)
                  const ocultarAtor = deveAnonimizarAtorDaNotificacao(notificacao)
                  const resumoQuiz = ehQuiz ? obterResumoQuizNotificacao(notificacao) : null
                  const deltaXp = ehXp ? obterDeltaXpNotificacao(notificacao) : null
                  const podeAbrirPerfil = !ehQuiz && !ocultarAtor && Boolean(notificacao.actor?.username)
                  const nomeAtor = ehQuiz ? 'Academia' : ocultarAtor ? 'Atividades' : notificacao.actor?.username || 'usuario'
                  const inicialAvatar = ehQuiz ? 'Q' : ocultarAtor ? 'A' : notificacao.actor?.nome?.charAt(0)?.toUpperCase() || 'U'

                  return (
                    <>
                      <div className="notification-left">
                        {!ehQuiz && !ocultarAtor && notificacao.actor?.foto_url ? (
                          <img src={notificacao.actor.foto_url} alt="" />
                        ) : (
                          <div className="mini-avatar">{inicialAvatar}</div>
                        )}
                      </div>

                      <div className="notification-content">
                        {ehQuiz ? (
                          <span className={`notification-quiz-pill ${resumoQuiz?.passou ? 'pass' : 'fail'}`}>
                            {resumoQuiz?.passou ? 'Vitoria no quiz' : 'Derrota no quiz'}
                          </span>
                        ) : null}

                        {ehXp && deltaXp !== null ? (
                          <span className={`notification-xp-pill ${deltaXp >= 0 ? 'gain' : 'loss'}`}>
                            {deltaXp > 0 ? '+' : ''}
                            {deltaXp} XP
                          </span>
                        ) : null}
                        <p>
                          <button
                            type="button"
                            className="notification-username-btn"
                            onClick={() => abrirPerfilPorUsername(notificacao.actor?.username)}
                            disabled={!podeAbrirPerfil}
                          >
                            {nomeAtor}
                          </button>{' '}
                          {textoNotificacao(notificacao)}
                        </p>
                        <span>{formatarTempo(notificacao.created_at)}</span>
                      </div>
                    </>
                  )
                })()}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <BottomNav />
    </div>
  )
}
