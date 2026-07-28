import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import ConfirmDialog from '../components/ConfirmDialog'
import ProfileBlocks from '../components/ProfileBlocks'
import SocialLoader from '../components/SocialLoader'
import VerifiedBadge from '../components/VerifiedBadge'
import { nomeCurso } from '../lib/academy'
import { nomeInstituicaoCurto } from '../lib/education'
import { listarContasSalvas, removerContaSalva, salvarContaDaSessao } from '../lib/savedAccounts'
import { formatDisplayName } from '../lib/textFormat'
import { THEME_OPTIONS, aplicarTema, obterTemaSalvo } from '../lib/theme'
import { supabase } from '../lib/supabase'

const THEME_LABELS = {
  escuro: 'Escuro',
  claro: 'Claro',
  verde: 'Verde',
}

function traduzirTema(temaId) {
  return THEME_LABELS[temaId] || temaId
}

export default function Profile() {
  const [perfil, setPerfil] = useState(null)
  const [posts, setPosts] = useState([])
  const [republicados, setRepublicados] = useState([])
  const [seguidores, setSeguidores] = useState(0)
  const [seguindo, setSeguindo] = useState(0)
  const [carregando, setCarregando] = useState(true)
  const [alternandoContaGlobal, setAlternandoContaGlobal] = useState(false)
  const [temaAtivo, setTemaAtivo] = useState(() => obterTemaSalvo())
  const [menuAberto, setMenuAberto] = useState(false)
  const [salvandoPrivacidade, setSalvandoPrivacidade] = useState(false)
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [emailConta, setEmailConta] = useState('')
  const [accountIdAtual, setAccountIdAtual] = useState('')
  const [contasSalvas, setContasSalvas] = useState([])
  const [alternandoContaId, setAlternandoContaId] = useState('')
  const [mensagemPerfil, setMensagemPerfil] = useState('')
  const [erroCarregamento, setErroCarregamento] = useState('')
  const [confirmarExclusao, setConfirmarExclusao] = useState(false)
  const [apagandoConta, setApagandoConta] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    void carregarPerfil()
  }, [])

  useEffect(() => {
    aplicarTema(temaAtivo)
  }, [temaAtivo])

  useEffect(() => {
    if (!menuAberto || typeof document === 'undefined') return undefined

    const overflowOriginal = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const aoPressionarTecla = (event) => {
      if (event.key === 'Escape') {
        setMenuAberto(false)
      }
    }

    window.addEventListener('keydown', aoPressionarTecla)

    return () => {
      document.body.style.overflow = overflowOriginal
      window.removeEventListener('keydown', aoPressionarTecla)
    }
  }, [menuAberto])

  useEffect(() => {
    setContasSalvas(listarContasSalvas())
  }, [])

  async function sincronizarContaAtualNoDispositivo(userId, perfilData, email) {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.user?.id || session.user.id !== userId) return

    const listaAtualizada = salvarContaDaSessao(session, {
      nome: formatDisplayName(perfilData?.nome || ''),
      username: perfilData?.username || '',
      email: email || session.user.email || '',
    })

    setContasSalvas(listaAtualizada)
  }

  function abrirConexoesComFoco(focus) {
    navigate('/conexoes', { state: { focus } })
  }

  function irPara(rota, state = undefined) {
    setMenuAberto(false)
    if (state) {
      navigate(rota, { state })
      return
    }
    navigate(rota)
  }

  async function enviarLinkAlterarSenha() {
    if (!emailConta || salvandoSenha) {
      setMensagemPerfil('Não foi possível identificar o e-mail da sua conta.')
      return
    }

    setMensagemPerfil('')
    setSalvandoSenha(true)

    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-senha` : undefined

      const { error } = await supabase.auth.resetPasswordForEmail(emailConta, { redirectTo })
      if (error) throw error
      setMensagemPerfil(`Link para alterar senha enviado para ${emailConta}.`)
      setMenuAberto(false)
    } catch {
      setMensagemPerfil('Não foi possível enviar o link de senha agora.')
    } finally {
      setSalvandoSenha(false)
    }
  }

  async function sairDaConta() {
    await supabase.auth.signOut()
    navigate('/auth')
  }

  async function apagarMinhaConta() {
    if (apagandoConta) return

    setApagandoConta(true)
    setMensagemPerfil('')

    try {
      const { error } = await supabase.rpc('nexo_delete_my_account')
      if (error) throw error

      removerContaSalva(accountIdAtual)
      await supabase.auth.signOut({ scope: 'local' })
      navigate('/auth', { replace: true })
      window.location.reload()
    } catch (error) {
      const detalhe = `${error?.message || ''}`.trim()
      setMensagemPerfil(
        detalhe
          ? `Não foi possível apagar a conta. Detalhe: ${detalhe}`
          : 'Não foi possível apagar a conta agora.'
      )
      setConfirmarExclusao(false)
      setMenuAberto(false)
    } finally {
      setApagandoConta(false)
    }
  }

  async function adicionarOutraConta() {
    try {
      await sincronizarContaAtualNoDispositivo(accountIdAtual, perfil, emailConta)
    } catch {}

    navigate('/adicionar-conta')
  }

  async function alternarContaSalva(conta) {
    if (!conta?.accessToken || !conta?.refreshToken || alternandoContaId) return

    setMensagemPerfil('')
    setAlternandoContaId(conta.userId)

    try {
      const { data: trocaData, error } = await supabase.auth.setSession({
        access_token: conta.accessToken,
        refresh_token: conta.refreshToken,
      })

      if (error) throw error

      const userAtivo = trocaData?.user || (await supabase.auth.getUser()).data.user
      if (!userAtivo?.id || userAtivo.id !== conta.userId) {
        throw new Error('Sessão desta conta expirou. Entre novamente para salvar uma sessão nova.')
      }

      const { data: perfilConta } = await supabase
        .from('profiles')
        .select('nome, username')
        .eq('account_id', conta.userId)
        .maybeSingle()

      const {
        data: { session: sessaoAtualizada },
      } = await supabase.auth.getSession()

      if (sessaoAtualizada) {
        const listaAtualizada = salvarContaDaSessao(sessaoAtualizada, {
          nome: formatDisplayName(perfilConta?.nome || conta.nome || ''),
          username: perfilConta?.username || conta.username || '',
          email: userAtivo.email || conta.email || '',
        })
        setContasSalvas(listaAtualizada)
      }

      setAlternandoContaGlobal(true)
      setMenuAberto(false)
      setCarregando(true)
      await new Promise((resolve) => window.setTimeout(resolve, 320))
      navigate('/')
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    } catch (error) {
      const detalhe = `${error?.message || ''}`.trim()
      setMensagemPerfil(detalhe || 'Não foi possível alternar para esta conta agora.')
    } finally {
      setAlternandoContaId('')
      setAlternandoContaGlobal(false)
    }
  }

  function removerContaDaLista(userId) {
    const listaNova = removerContaSalva(userId)
    setContasSalvas(listaNova)
  }

  async function alternarPrivacidadePerfil() {
    if (!perfil?.id || salvandoPrivacidade) return

    const novoStatus = !Boolean(perfil.is_private)
    setMensagemPerfil('')
    setSalvandoPrivacidade(true)

    try {
      const { error } = await supabase.from('profiles').update({ is_private: novoStatus }).eq('id', perfil.id)
      if (error) throw error

      setPerfil((anterior) =>
        anterior
          ? {
              ...anterior,
              is_private: novoStatus,
            }
          : anterior
      )

      setMensagemPerfil(novoStatus ? 'Perfil privado ativado.' : 'Perfil voltou para público.')
    } catch {
      setMensagemPerfil('Não foi possível atualizar a privacidade agora.')
    } finally {
      setSalvandoPrivacidade(false)
    }
  }

  async function carregarPerfil() {
    setErroCarregamento('')

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/auth')
        return
      }

      setAccountIdAtual(user.id)
      setEmailConta(user.email || '')

      const { data: perfilData, error: perfilError } = await supabase
        .from('profiles')
        .select('*')
        .eq('account_id', user.id)
        .maybeSingle()

      if (perfilError) throw perfilError
      if (!perfilData?.id) {
        setErroCarregamento(
          'Sua conta está autenticada, mas o perfil ainda não foi criado no banco. Entre novamente ou conclua o cadastro.'
        )
        return
      }

      setPerfil(perfilData)
      try {
        await sincronizarContaAtualNoDispositivo(user.id, perfilData, user.email || '')
      } catch (syncError) {
        // A lista de contas salvas é apenas uma conveniência local. Falhas de
        // armazenamento do navegador não podem derrubar o perfil carregado.
        console.warn('[Nexo11 Profile] Não foi possível sincronizar a conta no dispositivo', syncError)
      }

      const [postsResp, seguidoresResp, seguindoResp, repostsResp] = await Promise.all([
        supabase.from('posts').select('*').eq('profile_id', perfilData.id).order('created_at', { ascending: false }),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_profile_id', perfilData.id),
        supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_profile_id', perfilData.id),
        supabase.from('reposts').select('post_id').eq('profile_id', perfilData.id),
      ])

      setPosts(postsResp.data || [])
      setSeguidores(seguidoresResp.count || 0)
      setSeguindo(seguindoResp.count || 0)

      const idsRepublicados = (repostsResp.data || []).map((item) => item.post_id)

      if (idsRepublicados.length > 0) {
        const republicadosResp = await supabase.from('posts').select('*').in('id', idsRepublicados)
        const mapaRepublicados = new Map((republicadosResp.data || []).map((post) => [post.id, post]))
        setRepublicados(idsRepublicados.map((id) => mapaRepublicados.get(id)).filter(Boolean))
      } else {
        setRepublicados([])
      }
    } catch (error) {
      console.error('[Nexo11 Profile] Falha ao carregar perfil', error)
      setPerfil(null)
      const codigo = `${error?.code || ''}`.trim()
      const mensagem = `${error?.message || ''}`.trim()
      const detalhe = [codigo, mensagem].filter(Boolean).join(' — ')
      setErroCarregamento(
        detalhe
          ? `Não foi possível carregar seu perfil. Detalhe: ${detalhe}`
          : 'Não foi possível carregar seu perfil agora. Tente novamente.'
      )
    } finally {
      setCarregando(false)
    }
  }

  const contasAlternaveis = contasSalvas.filter((conta) => conta.userId !== accountIdAtual)

  if (carregando || alternandoContaGlobal) {
    return <SocialLoader variant="profile" showBottomNav />
  }

  if (!perfil) {
    return (
      <div className="container">
        <div className="page">
          <div className="empty-state profile-empty-state">
            <h3>Perfil indisponível</h3>
            <p>{erroCarregamento || 'Não encontramos os dados deste perfil.'}</p>
            <button type="button" className="btn" onClick={carregarPerfil}>
              Tentar novamente
            </button>
          </div>
        </div>
        <BottomNav />
      </div>
    )
  }

  return (
    <div className="container">
      <div className="profile-topbar">
        <button type="button" className="profile-top-action-btn" onClick={() => navigate('/novo-post')}>
          Novo post
        </button>

        <h2 className={perfil.is_verified ? 'official-username-display' : ''}>
          @{perfil.username}
        </h2>

        <button
          type="button"
          className="profile-top-action-btn ghost"
          aria-label="Painel da conta"
          onClick={() => setMenuAberto(true)}
        >
          <span className="profile-top-action-dots" aria-hidden="true">
            ...
          </span>
        </button>
      </div>

      {menuAberto ? (
        <div className="profile-sidepanel-overlay" onClick={() => setMenuAberto(false)}>
          <aside
            className="profile-sidepanel"
            role="dialog"
            aria-modal="true"
            aria-label="Painel da conta"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="profile-sidepanel-head">
              <div className="profile-sidepanel-title-wrap">
                <span className="profile-sidepanel-kicker">@{perfil?.username || 'perfil'}</span>
                <strong>Painel da conta</strong>
              </div>

              <button
                type="button"
                className="profile-sidepanel-close"
                aria-label="Fechar"
                onClick={() => setMenuAberto(false)}
              >
                x
              </button>
            </div>

            <div className="profile-sidepanel-scroll">
              <section className="profile-sidepanel-section">
                <h4>Conta</h4>

                <button
                  type="button"
                  className="profile-sidepanel-item"
                  onClick={() => irPara('/configuracoes/notificacoes')}
                >
                  Gerenciamento de notificações
                </button>

                <button type="button" className="profile-sidepanel-item" onClick={() => irPara('/editar-perfil')}>
                  Editar perfil
                </button>

                <button
                  type="button"
                  className="profile-sidepanel-item"
                  onClick={() => irPara('/conexoes', { focus: 'seguindo' })}
                >
                  Conexões
                </button>

                <button type="button" className="profile-sidepanel-item" onClick={() => irPara('/bloqueados')}>
                  Bloqueados
                </button>

                <button type="button" className="profile-sidepanel-item" onClick={() => irPara('/curtidos')}>
                  Curtidos
                </button>

                <button type="button" className="profile-sidepanel-item" onClick={() => irPara('/comentados')}>
                  Comentados
                </button>

                <button type="button" className="profile-sidepanel-item" onClick={() => irPara('/oxente')}>
                  Atividades
                </button>
              </section>

              <section className="profile-sidepanel-section">
                <h4>Modos de cor</h4>

                <p>Escolha o tema</p>
                <div className="profile-theme-switcher" role="tablist" aria-label="Modos de cor">
                  {THEME_OPTIONS.map((tema) => (
                    <button
                      key={tema.id}
                      type="button"
                      className={`profile-theme-chip ${temaAtivo === tema.id ? 'active' : ''}`}
                      onClick={() => setTemaAtivo(tema.id)}
                      role="tab"
                      aria-selected={temaAtivo === tema.id}
                    >
                      {traduzirTema(tema.id)}
                    </button>
                  ))}
                </div>
              </section>

              <section className="profile-sidepanel-section">
                <h4>Contas salvas</h4>

                {contasAlternaveis.length === 0 ? (
                  <p>Nenhuma conta extra salva ainda.</p>
                ) : (
                  <div className="profile-saved-accounts">
                    {contasAlternaveis.map((conta) => (
                      <div className="profile-saved-account-row" key={conta.userId}>
                        <button
                          type="button"
                          className="profile-saved-account-btn"
                          onClick={() => alternarContaSalva(conta)}
                          disabled={alternandoContaId === conta.userId}
                        >
                          <strong>{formatDisplayName(conta.nome) || conta.email || 'Conta'}</strong>
                          <span>@{conta.username || conta.email || 'usuario'}</span>
                        </button>

                        <button
                          type="button"
                          className="profile-saved-account-remove"
                          onClick={() => removerContaDaLista(conta.userId)}
                          aria-label={`Remover conta ${conta.email || conta.userId}`}
                        >
                          x
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="profile-sidepanel-section">
                <h4>Privacidade e segurança</h4>

                <button
                  type="button"
                  className="profile-sidepanel-item"
                  onClick={() => irPara('/central-de-privacidade')}
                >
                  Central de Privacidade
                </button>

                <button
                  type="button"
                  className="profile-sidepanel-item"
                  onClick={alternarPrivacidadePerfil}
                  disabled={salvandoPrivacidade}
                >
                  {salvandoPrivacidade ? (
                    <>
                      <span className="inline-spinner" aria-hidden="true" />
                      Salvando privacidade...
                    </>
                  ) : perfil?.is_private ? (
                    'Perfil privado (toque para público)'
                  ) : (
                    'Perfil público (toque para privado)'
                  )}
                </button>

                <button
                  type="button"
                  className="profile-sidepanel-item"
                  onClick={enviarLinkAlterarSenha}
                  disabled={salvandoSenha}
                >
                  {salvandoSenha ? (
                    <>
                      <span className="inline-spinner" aria-hidden="true" />
                      Enviando...
                    </>
                  ) : (
                    'Alterar senha'
                  )}
                </button>

                <button type="button" className="profile-sidepanel-item danger" onClick={sairDaConta}>
                  Sair da conta
                </button>

                <button type="button" className="profile-sidepanel-item" onClick={adicionarOutraConta}>
                  Adicionar mais uma conta
                </button>

                <button
                  type="button"
                  className="profile-sidepanel-item danger"
                  onClick={() => setConfirmarExclusao(true)}
                  disabled={apagandoConta}
                >
                  Apagar conta
                </button>
              </section>
            </div>
          </aside>
        </div>
      ) : null}

      <div className="page">
        {mensagemPerfil ? <div className="alert-box ok-box">{mensagemPerfil}</div> : null}

        <section className="profile-hero-card own-profile">
          <div className="profile-hero-glow" />

          <div className="profile-header-modern">
            <div className="profile-avatar-zone">
              {perfil.foto_url ? (
                <img src={perfil.foto_url} alt={formatDisplayName(perfil.nome)} className="profile-modern-avatar" />
              ) : (
                <div className="profile-modern-avatar fallback">{formatDisplayName(perfil.nome)?.charAt(0)?.toUpperCase()}</div>
              )}

              <button type="button" className="profile-story-quick-btn" onClick={() => navigate('/novo-story')}>
                + Story
              </button>
            </div>

            <div className="profile-hero-copy">
              <p className="profile-kicker">Seu espaço</p>
              <h1>{formatDisplayName(perfil.nome)}</h1>
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
              <p className="profile-bio-modern">{perfil.bio || 'Seu perfil ainda não tem bio. Conte um pouco sobre você.'}</p>
            </div>
          </div>

          <div className="profile-stats-modern">
            <div className="profile-stat-card">
              <strong>{posts.length}</strong>
              <span>posts</span>
            </div>
            <button
              type="button"
              className="profile-stat-card profile-stat-action"
              onClick={() => abrirConexoesComFoco('seguidores')}
            >
              <strong>{seguidores}</strong>
              <span>seguidores</span>
            </button>
            <button
              type="button"
              className="profile-stat-card profile-stat-action"
              onClick={() => abrirConexoesComFoco('seguindo')}
            >
              <strong>{seguindo}</strong>
              <span>seguindo</span>
            </button>
          </div>

          <div className="profile-buttons-modern">
            <button className="profile-primary-btn" onClick={() => navigate('/editar-perfil')}>
              Editar perfil
            </button>

            <button className="profile-secondary-btn" onClick={() => navigate('/oxente')}>
              Atividades
            </button>

            <button className="profile-secondary-btn" onClick={() => navigate('/academia')}>
              Academia
            </button>
          </div>
        </section>

        <ProfileBlocks
          posts={posts}
          republicados={republicados}
          titulo="Seu feed"
          descricao="Publicações do seu perfil em grade."
          emptyTitle="Nenhuma publicação ainda"
          emptyDescription="Publique uma nota, uma foto ou um vídeo curto para preencher sua grade."
        />
      </div>

      <BottomNav />
      <ConfirmDialog
        open={confirmarExclusao}
        title="Apagar sua conta?"
        description="Seu perfil, mensagens, grupos, publicações, XP e demais dados vinculados serão excluídos. Esta ação não pode ser desfeita."
        onClose={() => {
          if (!apagandoConta) setConfirmarExclusao(false)
        }}
        options={[
          {
            id: 'delete-account',
            label: apagandoConta ? 'Apagando conta...' : 'Apagar definitivamente',
            hint: 'Todos os dados vinculados serão removidos',
            danger: true,
            disabled: apagandoConta,
            onClick: apagarMinhaConta,
          },
        ]}
      />
    </div>
  )
}
