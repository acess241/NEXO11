import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import {
  CHAT_UPDATED_EVENT,
  contarMensagensNaoLidas,
  listarConversasDoPerfil,
  obterOutroPerfilId,
  traduzirErroChat,
} from '../lib/chat'
import {
  LIVE_CHAT_UPDATED_EVENT,
  conversationType,
  ensureClassroomGroupsForProfile,
  leaveLiveConversation,
  listLiveConversationsForUser,
  toggleMuteLiveConversation,
  togglePinLiveConversation,
} from '../lib/liveConversations'
import { listarPerfisComBloqueio, traduzirErroBloqueio } from '../lib/blocks'
import { supabase } from '../lib/supabase'
import { listMyGroups, listPendingInvites } from '../lib/groups'
import ConfirmDialog from '../components/ConfirmDialog'

const FILTER_OPTIONS = [
  { id: 'all', label: 'Todas' },
  { id: 'turmas', label: 'Turmas' },
  { id: 'professores', label: 'Professores' },
  { id: 'unread', label: 'Não lidas' },
]

function IconMessage() {
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
      aria-hidden="true"
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 9h8" />
      <path d="M8 13h6" />
    </svg>
  )
}

function IconDotsVertical() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  )
}

function sanitizeText(value) {
  return `${value || ''}`.replace(/\u0000/g, '').replace(/\r/g, '').trim()
}

function formatTimeLabel(dateValue) {
  if (!dateValue) return ''

  const date = new Date(dateValue)
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })
}

function shortMessage(value) {
  const text = sanitizeText(value)
  if (!text) return 'Sem mensagens ainda.'
  if (text.length <= 72) return text
  return `${text.slice(0, 69)}...`
}

function getInitial(name) {
  return name?.charAt(0)?.toUpperCase() || 'U'
}

function isProfessorRole(role) {
  const lowered = `${role || ''}`.toLowerCase().trim()
  return lowered === 'teacher' || lowered === 'professor' || lowered === 'admin' || lowered === 'docente'
}

function getConversationTypeLabel(type, kind) {
  if (kind === 'direct') return 'Conversa privada'
  if (type === conversationType.classroomGroup) return 'Grupo de turma'
  if (type === conversationType.assignmentGroup) return 'Grupo de atividade'
  if (type === conversationType.studyGroup) return 'Grupo de estudo'
  return 'Conversa'
}

function buildInboxError(error, fallback) {
  return traduzirErroBloqueio(error, traduzirErroChat(error, fallback))
}

function sortByRecent(list) {
  return [...list].sort((a, b) => {
    const dateA = new Date(a.lastMessageAt || a.updatedAt || a.createdAt).getTime()
    const dateB = new Date(b.lastMessageAt || b.updatedAt || b.createdAt).getTime()
    return dateB - dateA
  })
}

function statusClass(status) {
  if (status === 'Participando') return 'ok'
  if (status === 'Convite') return 'pending'
  if (status === 'Solicitação enviada' || status === 'Aguardando') return 'pending'
  if (status === 'Recusado') return 'blocked'
  if (status === 'Publico') return 'info'
  if (status === 'Bloqueado') return 'blocked'
  return ''
}

export default function MessagesInbox() {
  const [perfil, setPerfil] = useState(null)
  const [conversas, setConversas] = useState([])
  const [loadState, setLoadState] = useState('loading')
  const [erro, setErro] = useState('')
  const [infoReconnect, setInfoReconnect] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('all')
  const [menuAbertoId, setMenuAbertoId] = useState('')
  const [confirmAction, setConfirmAction] = useState(null)
  const [confirmBusy, setConfirmBusy] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    iniciar()
  }, [])

  useEffect(() => {
    if (!perfil?.id) return undefined

    let ativo = true

    const atualizar = async (mode = 'background') => {
      if (!ativo) return
      await carregarConversas(perfil, mode)
    }

    const onChange = async () => {
      await atualizar('background')
    }

    const channel = supabase
      .channel(`chat-inbox-realtime-${perfil.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
        },
        async () => {
          await onChange()
        }
      )
      .subscribe()

    const intervalId = window.setInterval(() => {
      void onChange()
    }, 4500)

    const onStorage = (event) => {
      if (event.key && event.key !== 'nexo_live_conversations_v1') return
      void onChange()
    }

    window.addEventListener(CHAT_UPDATED_EVENT, onChange)
    window.addEventListener(LIVE_CHAT_UPDATED_EVENT, onChange)
    window.addEventListener('storage', onStorage)

    return () => {
      ativo = false
      window.clearInterval(intervalId)
      window.removeEventListener(CHAT_UPDATED_EVENT, onChange)
      window.removeEventListener(LIVE_CHAT_UPDATED_EVENT, onChange)
      window.removeEventListener('storage', onStorage)
      supabase.removeChannel(channel)
    }
  }, [perfil?.id])

  useEffect(() => {
    function closeMenu() {
      setMenuAbertoId('')
    }

    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  async function iniciar() {
    try {
      setLoadState('loading')
      setErro('')
      setInfoReconnect('')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/auth')
        return
      }

      const { data: perfilData, error: perfilError } = await supabase
        .from('profiles')
        .select('id, nome, username, foto_url, role')
        .eq('account_id', user.id)
        .single()

      if (perfilError) throw perfilError

      setPerfil(perfilData)
      ensureClassroomGroupsForProfile(perfilData)
      await carregarConversas(perfilData, 'initial')
    } catch (error) {
      setErro(buildInboxError(error, 'Não foi possível carregar as conversas agora.'))
      setLoadState('error')
    }
  }

  async function carregarConversas(perfilAtual, mode = 'background') {
    const timeoutId = window.setTimeout(() => {
      if (mode === 'initial' || mode === 'retry') {
        setLoadState('timeout')
        setErro('Esta demorando mais que o normal.')
      }
    }, 4000)

    try {
      if (mode === 'initial' || mode === 'retry') {
        setLoadState('loading')
        setErro('')
      } else if (loadState === 'loaded' || loadState === 'empty') {
        setLoadState('reconnecting')
        setInfoReconnect('Reconectando conversas...')
      }

      const profileId = perfilAtual.id
      const conversasBase = await listarConversasDoPerfil(profileId)
      const bloqueados = new Set(await listarPerfisComBloqueio(profileId))

      const visiveis = conversasBase.filter((conversa) => {
        const outroPerfilId = obterOutroPerfilId(conversa, profileId)
        return !bloqueados.has(outroPerfilId)
      })

      const idsOutros = [
        ...new Set(
          visiveis
            .map((conversa) => obterOutroPerfilId(conversa, profileId))
            .filter(Boolean)
        ),
      ]

      const perfisResp =
        idsOutros.length > 0
          ? await supabase
              .from('profiles')
              .select('id, nome, username, foto_url, role')
              .in('id', idsOutros)
          : { data: [], error: null }

      if (perfisResp.error) throw perfisResp.error

      const { porConversa } = await contarMensagensNaoLidas(profileId, visiveis)
      const mapPerfis = new Map((perfisResp.data || []).map((item) => [item.id, item]))

      const diretas = visiveis
        .map((conversa) => {
          const outroId = obterOutroPerfilId(conversa, profileId)
          const outro = mapPerfis.get(outroId)
          if (!outro) return null

          return {
            id: `direct:${conversa.id}`,
            kind: 'direct',
            sourceId: conversa.id,
            title: outro.nome || outro.username || 'Contato',
            subtitle: `@${outro.username || 'usuario'}`,
            lastMessage: shortMessage(conversa.last_message_preview),
            lastMessageAt: conversa.last_message_at || conversa.updated_at || conversa.created_at,
            unreadCount: Number(porConversa.get(conversa.id) || 0),
            type: conversationType.private,
            typeLabel: getConversationTypeLabel(conversationType.private, 'direct'),
            statusLabel: '',
            username: outro.username || '',
            avatarUrl: outro.foto_url || '',
            avatarFallback: getInitial(outro.nome),
            outroPerfilRole: outro.role || '',
            isMuted: false,
            isPinned: false,
          }
        })
        .filter(Boolean)

      const aoVivoBase = listLiveConversationsForUser(profileId)
        .filter((conversation) => conversation.type === conversationType.private)
      const aoVivo = aoVivoBase.map((conversation) => ({
        id: `live:${conversation.id}`,
        kind: 'live',
        sourceId: conversation.id,
        title: conversation.title,
        subtitle: conversation.meta?.subject || '',
        lastMessage: shortMessage(conversation.lastMessage),
        lastMessageAt: conversation.lastMessageAt || conversation.updatedAt,
        unreadCount: Number(conversation.unreadCount || 0),
        type: conversation.type,
        typeLabel: getConversationTypeLabel(conversation.type, 'live'),
        statusLabel:
          conversation.type === conversationType.private
            ? ''
            : conversation.membershipLabel || 'Participando',
        membershipStatus: conversation.membershipStatus || 'active',
        participants: Array.isArray(conversation.participants) ? conversation.participants : [],
        avatarUrl: '',
        avatarFallback: getInitial(conversation.title),
        isMuted: Boolean(conversation.isMuted),
        isPinned: Boolean(conversation.isPinned),
      }))

      let gruposReais = []
      try {
        const [groups, invites] = await Promise.all([
          listMyGroups(profileId),
          listPendingInvites(profileId),
        ])
        gruposReais = [
          ...groups.map((group) => ({
            id: `group:${group.id}`,
            kind: 'group',
            sourceId: group.id,
            title: group.name,
            subtitle: group.description || '',
            lastMessage: 'Toque para abrir o grupo',
            lastMessageAt: group.last_message_at || group.updated_at,
            unreadCount: 0,
            type: 'nexo_group',
            typeLabel: 'Grupo',
            statusLabel: group.membership?.role === 'owner' ? 'Você criou' : group.membership?.role === 'admin' ? 'Administrador' : 'Participando',
            avatarUrl: group.avatar_url || '',
            avatarFallback: getInitial(group.name),
            isMuted: Boolean(group.membership?.muted_until),
            isPinned: false,
          })),
          ...invites.map((invite) => ({
            id: `group-invite:${invite.id}`,
            kind: 'group-invite',
            sourceId: invite.id,
            groupId: invite.group_id,
            title: invite.group?.name || 'Convite para grupo',
            subtitle: invite.group?.description || '',
            lastMessage: 'Você recebeu um convite. Toque para responder.',
            lastMessageAt: invite.created_at,
            unreadCount: 1,
            type: 'nexo_group',
            typeLabel: 'Convite de grupo',
            statusLabel: 'Convite',
            avatarUrl: invite.group?.avatar_url || '',
            avatarFallback: getInitial(invite.group?.name),
            isMuted: false,
            isPinned: false,
          })),
        ]
      } catch {
        // O restante do chat continua funcionando antes do SQL dos grupos ser instalado.
      }

      const list = sortByRecent([...diretas, ...gruposReais, ...aoVivo]).sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1
        if (!a.isPinned && b.isPinned) return 1
        return 0
      })

      setConversas(list)
      setInfoReconnect('')
      setErro('')
      setLoadState(list.length > 0 ? 'loaded' : 'empty')
    } catch (error) {
      const msg = buildInboxError(error, 'Não foi possível carregar as conversas agora.')
      setErro(msg)
      setInfoReconnect('')
      if (mode === 'background' && conversas.length > 0) {
        setLoadState('loaded')
      } else {
        setLoadState('error')
      }
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  const conversasFiltradas = useMemo(() => {
    const termo = sanitizeText(busca).toLowerCase()

    return conversas.filter((item) => {
      if (filtro === 'turmas' && item.type !== conversationType.classroomGroup) return false
      if (
        filtro === 'professores' &&
        item.kind === 'direct' &&
        !isProfessorRole(item.outroPerfilRole)
      ) {
        return false
      }
      if (
        filtro === 'professores' &&
        item.kind === 'live' &&
        !(item.participants || []).some((participant) => participant.role === 'professor')
      ) {
        return false
      }
      if (filtro === 'unread' && Number(item.unreadCount || 0) <= 0) return false

      if (!termo) return true
      const target = `${item.title} ${item.subtitle} ${item.lastMessage} ${item.typeLabel} ${item.statusLabel}`.toLowerCase()
      return target.includes(termo)
    })
  }, [conversas, filtro, busca])

  function abrirConversa(item) {
    if (!item) return
    if (item.kind === 'group') {
      navigate(`/mensagens/grupos/${item.sourceId}`)
      return
    }
    if (item.kind === 'group-invite') {
      const accept = window.confirm(`Aceitar o convite para "${item.title}"?`)
      void supabase.rpc('nexo_respond_group_invite', {
        p_invite_id: item.sourceId,
        p_accept: accept,
      }).then(() => {
        if (accept) navigate(`/mensagens/grupos/${item.groupId}`)
        else if (perfil) void carregarConversas(perfil, 'background')
      })
      return
    }
    if (item.kind === 'direct') {
      navigate(`/mensagens/${item.username}`)
      return
    }

    navigate(`/mensagens/ao-vivo/${item.sourceId}`)
  }

  function toggleMenu(event, id) {
    event.stopPropagation()
    setMenuAbertoId((prev) => (prev === id ? '' : id))
  }

  function executarAcaoMenu(event, callback) {
    event.stopPropagation()
    callback()
    setMenuAbertoId('')
  }

  function criarNovoGrupo() {
    navigate('/mensagens/grupos/novo')
  }

  function abrirPerfil(item) {
    if (!item?.username) return
    navigate(`/usuario/${item.username}`)
  }

  function alternarFixar(item) {
    if (item.kind !== 'live' || !perfil?.id) return
    togglePinLiveConversation(item.sourceId, perfil.id)
    void carregarConversas(perfil, 'background')
  }

  function alternarSilencio(item) {
    if (item.kind !== 'live' || !perfil?.id) return
    toggleMuteLiveConversation(item.sourceId, perfil.id)
    void carregarConversas(perfil, 'background')
  }

  function sairDoGrupo(item) {
    if (!perfil?.id) return
    if (item.kind === 'group') {
      setConfirmAction({ type: 'leave-group', item })
      return
    }
    if (item.kind !== 'live') return
    leaveLiveConversation(item.sourceId, perfil.id)
    void carregarConversas(perfil, 'background')
  }

  function apagarConversa(item) {
    setConfirmAction({ type: 'delete-chat', item })
  }

  async function confirmarAcao() {
    const action = confirmAction
    if (!action || !perfil || confirmBusy) return
    setConfirmBusy(true)
    const { item } = action
    try {
      let result
      if (action.type === 'leave-group') {
        result = await supabase.rpc('nexo_leave_group', { p_group_id: item.sourceId })
      } else if (action.type === 'delete-chat') {
        result = await supabase.rpc('chat_hide_conversation', { p_conversation_id: item.sourceId })
      }
      if (result?.error) throw result.error
      setConversas((current) => current.filter((conversation) => conversation.id !== item.id))
      setConfirmAction(null)
      setMenuAbertoId('')
      await carregarConversas(perfil, 'background')
    } catch (actionError) {
      setErro(buildInboxError(actionError, 'Não foi possível concluir esta ação.'))
    } finally {
      setConfirmBusy(false)
    }
  }

  function verDetalhes(item) {
    if (item.kind !== 'live') return
    navigate(`/mensagens/ao-vivo/${item.sourceId}?details=1`)
  }

  if (loadState === 'loading') {
    return <SocialLoader variant="feed" showBottomNav />
  }

  return (
    <div className="container">
      <div className="topbar chat-list-topbar">
        <div>
          <h1>Conversas</h1>
          <p className="chat-topbar-subtitle">Turmas, professores e conversas privadas</p>
        </div>

        <button type="button" className="chat-topbar-action chat-live-new-btn" onClick={criarNovoGrupo}>
          <IconMessage />
          <span>Novo</span>
        </button>
      </div>

      <div className="page chat-live-page">
        <section className="chat-live-sidebar full">
          <div className="chat-live-sidebar-head">
            <input
              className="edit-input chat-live-search"
              type="text"
              placeholder="Buscar conversas..."
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />

            <div className="chat-live-filter-row">
              {FILTER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`chat-live-filter-btn ${filtro === option.id ? 'active' : ''}`}
                  onClick={() => setFiltro(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {loadState === 'reconnecting' ? (
            <p className="chat-live-reconnecting">{infoReconnect || 'Reconectando conversas...'}</p>
          ) : null}

          {loadState === 'error' || loadState === 'timeout' ? (
            <div className="chat-live-error-card">
              <p>
                {loadState === 'timeout'
                  ? erro || 'Esta demorando mais que o normal.'
                  : erro || 'Não foi possível carregar as conversas agora.'}
              </p>
              <button
                type="button"
                className="chat-live-inline-btn"
                onClick={() => {
                  if (!perfil) return
                  void carregarConversas(perfil, 'retry')
                }}
              >
                Tentar novamente
              </button>
            </div>
          ) : loadState === 'empty' || conversasFiltradas.length === 0 ? (
            <div className="empty-state chat-empty-state">
              <h3>Nenhuma conversa</h3>
              <p>Nenhum grupo ativo ainda.</p>
            </div>
          ) : (
            <div className="chat-list chat-live-list">
              {conversasFiltradas.map((item) => (
                <article
                  key={item.id}
                  className={`chat-list-item chat-live-list-item ${item.isMuted ? 'muted' : ''}`}
                  onClick={() => abrirConversa(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') abrirConversa(item)
                  }}
                >
                  <div className="chat-list-main-btn">
                    <div className="chat-avatar">
                      {item.avatarUrl ? (
                        <img src={item.avatarUrl} alt={item.title} />
                      ) : (
                        <span>{item.avatarFallback || getInitial(item.title)}</span>
                      )}
                    </div>

                    <div className="chat-list-copy">
                      <div className="chat-list-head">
                        <strong title={item.title}>{item.title}</strong>
                        <span>{formatTimeLabel(item.lastMessageAt)}</span>
                      </div>

                      <div className="chat-list-meta">
                        <p title={item.lastMessage}>{item.lastMessage || 'Sem mensagens ainda.'}</p>
                        {item.unreadCount > 0 ? (
                          <span className="chat-unread-badge">{item.unreadCount > 9 ? '9+' : item.unreadCount}</span>
                        ) : null}
                      </div>

                      <div className="chat-live-row-foot">
                        <small className="chat-live-type-label">{item.typeLabel}</small>
                        {item.kind === 'live' && item.statusLabel ? (
                          <small className={`chat-live-status-badge ${statusClass(item.statusLabel)}`}>
                            {item.statusLabel}
                          </small>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="chat-live-row-actions">
                    <button
                      type="button"
                      className="chat-list-profile-link chat-live-menu-btn"
                      onClick={(event) => toggleMenu(event, item.id)}
                      aria-label="Mais opções"
                    >
                      <IconDotsVertical />
                    </button>

                    {menuAbertoId === item.id ? (
                      <div className="chat-live-menu-popover" onClick={(event) => event.stopPropagation()}>
                        <button type="button" onClick={(event) => executarAcaoMenu(event, () => abrirConversa(item))}>
                          Abrir
                        </button>

                        {item.kind === 'direct' ? (
                          <>
                            <button type="button" onClick={(event) => executarAcaoMenu(event, () => abrirPerfil(item))}>
                              Ver perfil
                            </button>
                            <button type="button" className="danger"
                              onClick={(event) => executarAcaoMenu(event, () => apagarConversa(item))}>
                              Apagar conversa
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={(event) => executarAcaoMenu(event, () => alternarFixar(item))}
                            >
                              {item.isPinned ? 'Desafixar' : 'Fixar conversa'}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => executarAcaoMenu(event, () => alternarSilencio(item))}
                            >
                              {item.isMuted ? 'Ativar som' : 'Silenciar'}
                            </button>
                            <button
                              type="button"
                              onClick={(event) => executarAcaoMenu(event, () => verDetalhes(item))}
                            >
                              Ver detalhes
                            </button>
                            <button
                              type="button"
                              onClick={(event) => executarAcaoMenu(event, () => sairDoGrupo(item))}
                            >
                              Sair do grupo
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <BottomNav />
      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.type === 'leave-group' ? 'Sair do grupo?' : 'Apagar conversa?'}
        description={confirmAction?.type === 'leave-group'
          ? `Você deixará de receber mensagens de "${confirmAction?.item?.title || 'este grupo'}".`
          : 'A conversa será removida da sua aba de mensagens, somente para você.'}
        onClose={() => { if (!confirmBusy) setConfirmAction(null) }}
        options={[{
          id: 'confirm',
          hint: confirmAction?.type === 'leave-group' ? 'Você poderá voltar apenas com um novo convite' : 'A outra pessoa continuará vendo normalmente',
          danger: true,
          disabled: confirmBusy,
          label: confirmBusy
            ? 'Processando...'
            : confirmAction?.type === 'leave-group' ? 'Sair do grupo' : 'Apagar conversa',
          onClick: () => void confirmarAcao(),
        }]}
      />
    </div>
  )
}




