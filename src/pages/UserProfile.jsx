import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import ProfileBlocks from '../components/ProfileBlocks'
import SocialLoader from '../components/SocialLoader'
import VerifiedBadge from '../components/VerifiedBadge'
import { bloquearPerfil, desbloquearPerfil, estaBloqueadoPorMim, traduzirErroBloqueio } from '../lib/blocks'
import { criarNotificacaoSePermitido } from '../lib/notificationPreferences'
import { nomeCurso } from '../lib/academy'
import { nomeInstituicaoCurto } from '../lib/education'
import { formatDisplayName } from '../lib/textFormat'
import { supabase } from '../lib/supabase'

export default function UserProfile() {
  const { username } = useParams()
  const navigate = useNavigate()

  const [perfil, setPerfil] = useState(null)
  const [meuPerfil, setMeuPerfil] = useState(null)
  const [seguindo, setSeguindo] = useState(false)
  const [seguidores, setSeguidores] = useState(0)
  const [seguindoCount, setSeguindoCount] = useState(0)
  const [postsCount, setPostsCount] = useState(0)
  const [posts, setPosts] = useState([])
  const [republicados, setRepublicados] = useState([])
  const [perfilPrivado, setPerfilPrivado] = useState(false)
  const [solicitacaoPendente, setSolicitacaoPendente] = useState(false)
  const [solicitacaoId, setSolicitacaoId] = useState(null)
  const [alternandoFollow, setAlternandoFollow] = useState(false)
  const [bloqueadoPorMim, setBloqueadoPorMim] = useState(false)
  const [processandoBloqueio, setProcessandoBloqueio] = useState(false)
  const [fotoPerfilAberta, setFotoPerfilAberta] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    void carregarPerfil()
  }, [username])

  async function carregarPerfil() {
    setErro('')

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      navigate('/auth', { replace: true })
      return
    }

    const { data: meu, error: meuError } = await supabase
      .from('profiles')
      .select('*')
      .eq('account_id', user.id)
      .single()

    if (meuError) {
      setErro('Não foi possível carregar seu perfil.')
      return
    }

    setMeuPerfil(meu)

    const { data: perfilVisitado, error: perfilError } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single()

    if (perfilError) {
      setErro('Não foi possível carregar este perfil.')
      return
    }

    setPerfil(perfilVisitado)
    setPerfilPrivado(Boolean(perfilVisitado.is_private))

    if (!perfilVisitado) return
    let bloqueioAtivo = false

    try {
      bloqueioAtivo = await estaBloqueadoPorMim(meu.id, perfilVisitado.id)
      setBloqueadoPorMim(bloqueioAtivo)
    } catch (errorBloqueio) {
      setErro((anterior) => anterior || traduzirErroBloqueio(errorBloqueio, 'Não foi possível verificar bloqueios.'))
      setBloqueadoPorMim(false)
    }

    const [followResp, seguidoresResp, seguindoResp, solicitacaoResp, postsCountResp] = await Promise.all([
      supabase
        .from('follows')
        .select('id')
        .eq('follower_profile_id', meu.id)
        .eq('following_profile_id', perfilVisitado.id)
        .maybeSingle(),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_profile_id', perfilVisitado.id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_profile_id', perfilVisitado.id),
      supabase
        .from('follow_requests')
        .select('id, status')
        .eq('requester_profile_id', meu.id)
        .eq('receiver_profile_id', perfilVisitado.id)
        .eq('status', 'pending')
        .maybeSingle(),
      supabase.from('posts').select('*', { count: 'exact', head: true }).eq('profile_id', perfilVisitado.id),
    ])

    if (
      followResp.error ||
      seguidoresResp.error ||
      seguindoResp.error ||
      postsCountResp.error ||
      (solicitacaoResp.error && solicitacaoResp.error.code !== 'PGRST116')
    ) {
      if (solicitacaoResp.error && solicitacaoResp.error.code !== 'PGRST116') {
        setErro('Rode o SQL de privacidade e solicitações para liberar este recurso.')
      } else {
        setErro('Não foi possível carregar os dados de seguidores.')
      }
      return
    }

    setSeguindo(!!followResp.data)
    setSeguidores(seguidoresResp.count || 0)
    setSeguindoCount(seguindoResp.count || 0)
    setPostsCount(postsCountResp.count || 0)
    setSolicitacaoPendente(!!solicitacaoResp.data)
    setSolicitacaoId(solicitacaoResp.data?.id || null)

    const podeVerConteudo =
      !bloqueioAtivo && (meu.id === perfilVisitado.id || !Boolean(perfilVisitado.is_private) || !!followResp.data)

    if (!podeVerConteudo) {
      setPosts([])
      setRepublicados([])
      return
    }

    const [postsResp, repostsResp] = await Promise.all([
      supabase.from('posts').select('*').eq('profile_id', perfilVisitado.id).order('created_at', { ascending: false }),
      supabase.from('reposts').select('post_id').eq('profile_id', perfilVisitado.id),
    ])

    if (postsResp.error || repostsResp.error) {
      setErro('Não foi possível carregar as publicações deste perfil.')
      return
    }

    setPosts(postsResp.data || [])

    const idsRepublicados = (repostsResp.data || []).map((item) => item.post_id)

    if (idsRepublicados.length > 0) {
      const republicadosResp = await supabase.from('posts').select('*').in('id', idsRepublicados)

      const mapaRepublicados = new Map((republicadosResp.data || []).map((post) => [post.id, post]))

      setRepublicados(idsRepublicados.map((id) => mapaRepublicados.get(id)).filter(Boolean))
    } else {
      setRepublicados([])
    }
  }

  async function alternarFollow() {
    if (!meuPerfil || !perfil || alternandoFollow) return
    if (meuPerfil.id === perfil.id) return
    if (bloqueadoPorMim) return

    setErro('')
    setAlternandoFollow(true)

    try {
      if (seguindo) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .eq('follower_profile_id', meuPerfil.id)
          .eq('following_profile_id', perfil.id)

        if (error) throw error

        setSeguindo(false)
        setSeguidores((prev) => Math.max(0, prev - 1))
      } else if (perfilPrivado) {
        if (solicitacaoPendente) {
          let cancelarRequest = supabase
            .from('follow_requests')
            .update({
              status: 'canceled',
              updated_at: new Date().toISOString(),
              responded_at: new Date().toISOString(),
            })
            .eq('requester_profile_id', meuPerfil.id)
            .eq('receiver_profile_id', perfil.id)
            .eq('status', 'pending')

          if (solicitacaoId) {
            cancelarRequest = cancelarRequest.eq('id', solicitacaoId)
          }

          const { error } = await cancelarRequest

          if (error) throw error

          setSolicitacaoPendente(false)
          setSolicitacaoId(null)
        } else {
          const agoraIso = new Date().toISOString()

          const { data, error } = await supabase
            .from('follow_requests')
            .upsert(
              {
                requester_profile_id: meuPerfil.id,
                receiver_profile_id: perfil.id,
                status: 'pending',
                updated_at: agoraIso,
                responded_at: null,
              },
              {
                onConflict: 'requester_profile_id,receiver_profile_id',
              }
            )
            .select('id')
            .limit(1)

          if (error) throw error

          setSolicitacaoPendente(true)
          setSolicitacaoId(data?.[0]?.id || null)
        }
      } else {
        const { error } = await supabase.from('follows').insert({
          follower_profile_id: meuPerfil.id,
          following_profile_id: perfil.id,
        })

        if (error) throw error

        setSeguindo(true)
        setSeguidores((prev) => prev + 1)

        await criarNotificacaoSePermitido({
          receiverProfileId: perfil.id,
          actorProfileId: meuPerfil.id,
          type: 'follow',
        })
      }
    } catch {
      setErro('Não foi possível atualizar o follow agora.')
    } finally {
      setAlternandoFollow(false)
    }
  }

  async function alternarBloqueio() {
    if (!meuPerfil || !perfil || processandoBloqueio) return
    if (meuPerfil.id === perfil.id) return

    setErro('')
    setProcessandoBloqueio(true)

    try {
      if (bloqueadoPorMim) {
        await desbloquearPerfil(meuPerfil.id, perfil.id)
        setBloqueadoPorMim(false)
        await carregarPerfil()
      } else {
        await bloquearPerfil(meuPerfil.id, perfil.id)

        await Promise.all([
          supabase
            .from('follows')
            .delete()
            .eq('follower_profile_id', meuPerfil.id)
            .eq('following_profile_id', perfil.id),
          supabase
            .from('follows')
            .delete()
            .eq('follower_profile_id', perfil.id)
            .eq('following_profile_id', meuPerfil.id),
          supabase
            .from('follow_requests')
            .update({
              status: 'canceled',
              updated_at: new Date().toISOString(),
              responded_at: new Date().toISOString(),
            })
            .eq('requester_profile_id', meuPerfil.id)
            .eq('receiver_profile_id', perfil.id)
            .eq('status', 'pending'),
          supabase
            .from('follow_requests')
            .update({
              status: 'canceled',
              updated_at: new Date().toISOString(),
              responded_at: new Date().toISOString(),
            })
            .eq('requester_profile_id', perfil.id)
            .eq('receiver_profile_id', meuPerfil.id)
            .eq('status', 'pending'),
        ])

        setBloqueadoPorMim(true)
        setSeguindo(false)
        setSolicitacaoPendente(false)
        setSolicitacaoId(null)
        setPosts([])
        setRepublicados([])
      }
    } catch (error) {
      setErro(traduzirErroBloqueio(error, 'Não foi possível atualizar este bloqueio agora.'))
    } finally {
      setProcessandoBloqueio(false)
    }
  }

  if (!perfil && erro) {
    return (
      <div className="container">
        <div className="page">
          <div className="empty-state profile-empty-state">
            <h3>Perfil indisponível</h3>
            <p>{erro}</p>
            <button type="button" className="btn" onClick={carregarPerfil}>
              Tentar novamente
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    )
  }

  if (!perfil) return <SocialLoader variant="profile" showBottomNav />

  const ehMeuPerfil = meuPerfil?.id === perfil.id
  const ehPerfilOficial = Boolean(
    perfil.is_verified && `${perfil.username || ''}`.toLowerCase() === 'nexo11'
  )
  const podeVerConteudo = !bloqueadoPorMim && (ehMeuPerfil || !perfilPrivado || seguindo)
  const textoBotaoFollow = seguindo ? 'Seguindo' : perfilPrivado ? (solicitacaoPendente ? 'Solicitado' : 'Solicitar') : 'Seguir'
  const classeBotaoFollow = seguindo || solicitacaoPendente ? 'profile-secondary-btn' : 'profile-primary-btn'

  return (
    <div className="container">
      <div className="profile-topbar">
        <h2 className={perfil.is_verified ? 'official-username-display' : ''}>
          @{perfil.username}
        </h2>
      </div>

      <div className="page">
        {erro ? <div className="alert-box erro-box">{erro}</div> : null}

        <section className="profile-hero-card visitor-profile">
          <div className="profile-hero-glow" />
          {!ehMeuPerfil ? (
            <button
              type="button"
              className={`profile-corner-danger-btn ${bloqueadoPorMim ? 'active' : ''}`}
              onClick={alternarBloqueio}
              disabled={processandoBloqueio}
            >
              {processandoBloqueio ? 'Processando...' : bloqueadoPorMim ? 'Desbloquear' : 'Bloquear'}
            </button>
          ) : null}

          <div className="profile-header-modern">
            {perfil.foto_url ? (
              <button
                type="button"
                className="profile-avatar-preview-btn"
                onClick={() => setFotoPerfilAberta(true)}
                aria-label={`Abrir foto de perfil de ${formatDisplayName(perfil.nome) || perfil.username}`}
              >
                <img src={perfil.foto_url} alt={formatDisplayName(perfil.nome) || perfil.username} className="profile-modern-avatar" />
              </button>
            ) : (
              <div className="profile-modern-avatar fallback">{formatDisplayName(perfil.nome)?.charAt(0)?.toUpperCase()}</div>
            )}

            <div className="profile-hero-copy">
              <p className="profile-kicker">Perfil</p>
              <h1>{formatDisplayName(perfil.nome) || perfil.username}</h1>
              <p className="profile-handle verified-handle-row">
                @{perfil.username}
                <VerifiedBadge verified={perfil.is_verified} />
              </p>
              <p className="profile-academy-chip">
                Nível {perfil.level || 1} - {perfil.xp_total || 0} XP - {nomeCurso(perfil.course_area)}
              </p>
              <p className="profile-school-chip">
                {nomeInstituicaoCurto(perfil.institution_name)}
              </p>
              <p className="profile-bio-modern">{perfil.bio || 'Este perfil ainda não adicionou uma bio.'}</p>
            </div>
          </div>

          <div className="profile-stats-modern profile-stats-visitor">
            <div className="profile-stat-card">
              <strong>{postsCount}</strong>
              <span>posts</span>
            </div>
            <button
              type="button"
              className="profile-stat-card profile-stat-action"
              onClick={() => navigate('/conexoes', { state: { focus: 'seguidores', username: perfil.username } })}
            >
              <strong>{seguidores}</strong>
              <span>seguidores</span>
            </button>
            <button
              type="button"
              className="profile-stat-card profile-stat-action"
              onClick={() => navigate('/conexoes', { state: { focus: 'seguindo', username: perfil.username } })}
            >
              <strong>{seguindoCount}</strong>
              <span>seguindo</span>
            </button>
          </div>

          {!ehMeuPerfil && (
            <div className="profile-buttons-modern two-actions">
              <button
                className={classeBotaoFollow}
                onClick={alternarFollow}
                disabled={ehPerfilOficial || alternandoFollow || bloqueadoPorMim}
              >
                {bloqueadoPorMim
                  ? 'Bloqueado'
                  : ehPerfilOficial
                  ? 'Seguindo'
                  : alternandoFollow
                  ? 'Processando...'
                  : textoBotaoFollow}
              </button>

              <button
                type="button"
                className="profile-secondary-btn"
                onClick={() => navigate(`/mensagens/${perfil.username}`)}
                disabled={bloqueadoPorMim}
              >
                {bloqueadoPorMim ? 'Mensagem bloqueada' : 'Mensagem'}
              </button>
            </div>
          )}
        </section>

        {fotoPerfilAberta && perfil.foto_url ? (
          <div className="profile-avatar-modal-overlay" role="dialog" aria-modal="true" onClick={() => setFotoPerfilAberta(false)}>
            <article className="profile-avatar-modal" onClick={(event) => event.stopPropagation()}>
              <div className="profile-avatar-modal-head">
                <strong>@{perfil.username}</strong>
                <button
                  type="button"
                  className="profile-avatar-modal-close"
                  onClick={() => setFotoPerfilAberta(false)}
                  aria-label="Fechar foto de perfil"
                >
                  x
                </button>
              </div>

              <div className="profile-avatar-modal-body">
                <img src={perfil.foto_url} alt={formatDisplayName(perfil.nome) || perfil.username} className="profile-avatar-modal-media" />
              </div>
            </article>
          </div>
        ) : null}

        <ProfileBlocks
          posts={posts}
          republicados={republicados}
          titulo="Feed do perfil"
          descricao={
            podeVerConteudo
              ? seguindo
                ? 'Você acompanha este perfil.'
                : perfilPrivado
                  ? solicitacaoPendente
                    ? 'Solicitação enviada. Aguarde aprovação.'
                    : 'Conta privada. Envie solicitação para seguir.'
                  : 'Toque nas publicações para abrir.'
              : bloqueadoPorMim
                ? 'Este usuário está bloqueado por você.'
                : 'Conta privada. Envie solicitação para ver as publicações.'
          }
          emptyTitle={podeVerConteudo ? 'Sem publicações visíveis' : bloqueadoPorMim ? 'Usuário bloqueado' : 'Conta privada'}
          emptyDescription={
            podeVerConteudo
              ? 'Quando este usuário publicar, as postagens vão aparecer na grade.'
              : bloqueadoPorMim
                ? 'Desbloqueie para voltar a seguir, mandar mensagem e ver o feed deste perfil.'
                : 'Somente seguidores aceitos podem ver stories e postagens deste perfil.'
          }
        />
      </div>

      <BottomNav />
    </div>
  )
}
