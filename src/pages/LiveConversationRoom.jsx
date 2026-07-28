import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import AutoLinkText from '../components/AutoLinkText'
import SocialLoader from '../components/SocialLoader'
import {
  LIVE_CHAT_UPDATED_EVENT,
  clearLiveTypingForUser,
  getLiveConversationAccess,
  getLiveConversationById,
  getLiveTypingStatus,
  joinLiveConversation,
  leaveLiveConversation,
  listLiveMessages,
  markLiveConversationAsRead,
  messageType,
  publishAssignmentMessage,
  publishSubmissionNotice,
  requestLiveConversationAccess,
  sendLiveMessage,
  setLiveTypingStatus,
  toggleMuteLiveConversation,
  updateLiveConversationSettings,
} from '../lib/liveConversations'
import { supabase } from '../lib/supabase'

function sanitizeText(value) {
  return `${value || ''}`
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function getInitial(name) {
  return name?.charAt(0)?.toUpperCase() || 'U'
}

function formatBubbleTime(dateValue) {
  if (!dateValue) return ''
  const date = new Date(dateValue)
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDateTitle(dateValue) {
  if (!dateValue) return ''
  const date = new Date(dateValue)
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

function groupMessagesByDay(messages) {
  const result = []
  let currentDay = ''

  messages.forEach((message) => {
    const day = new Date(message.createdAt).toDateString()
    if (day !== currentDay) {
      result.push({
        kind: 'separator',
        id: `day-${day}`,
        label: formatDateTitle(message.createdAt),
      })
      currentDay = day
    }
    result.push({
      kind: 'message',
      id: message.id,
      message,
    })
  })

  return result
}

function messageBadge(messageTypeValue) {
  if (messageTypeValue === messageType.announcement) return 'Aviso'
  if (messageTypeValue === messageType.assignment) return 'Atividade'
  if (messageTypeValue === messageType.submission) return 'Entrega enviada'
  if (messageTypeValue === messageType.feedback) return 'Feedback'
  if (messageTypeValue === messageType.system) return 'Sistema'
  if (messageTypeValue === messageType.file) return 'Arquivo'
  return ''
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(`${reader.result || ''}`)
    reader.onerror = () => reject(new Error('Falha ao ler arquivo'))
    reader.readAsDataURL(file)
  })
}

function isProfessor(role) {
  const lowered = `${role || ''}`.toLowerCase().trim()
  return lowered === 'teacher' || lowered === 'professor' || lowered === 'admin' || lowered === 'docente'
}

function IconArrowLeft() {
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
      <path d="m15 18-6-6 6-6" />
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

function accessErrorMessage(accessReason) {
  if (accessReason === 'student_messages_disabled') {
    return 'O professor desativou mensagens dos alunos neste grupo.'
  }
  if (accessReason === 'invited') return 'Aceite o convite para enviar mensagens neste grupo.'
  if (accessReason === 'requested' || accessReason === 'requested_approval') {
    return 'Você precisa ser aprovado pelo professor para enviar mensagens.'
  }
  if (accessReason === 'rejected') return 'Solicitação recusada pelo professor.'
  if (accessReason === 'not_member_public') return 'Entre no grupo para enviar mensagens.'
  if (accessReason === 'blocked') return 'Você esta bloqueado neste grupo.'
  if (accessReason === 'left') return 'Você saiu deste grupo.'
  return 'Você Não pode enviar mensagem neste grupo.'
}

export default function LiveConversationRoom() {
  const { conversationId } = useParams()
  const [searchParams] = useSearchParams()
  const abrirDetalhesPelaUrl = searchParams.get('details') === '1'
  const navigate = useNavigate()

  const [perfil, setPerfil] = useState(null)
  const [conversa, setConversa] = useState(null)
  const [acesso, setAcesso] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [digitandoLista, setDigitandoLista] = useState([])
  const [texto, setTexto] = useState('')
  const [arquivo, setArquivo] = useState(null)
  const [arquivoPreview, setArquivoPreview] = useState('')
  const [arquivoAccept, setArquivoAccept] = useState('image/*,application/pdf,.pdf,.doc,.docx,.txt')
  const [arquivoCapture, setArquivoCapture] = useState('')
  const [menuAnexoAberto, setMenuAnexoAberto] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [loadState, setLoadState] = useState('loading')
  const [erro, setErro] = useState('')
  const [reconnecting, setReconnecting] = useState(false)
  const [menuAberto, setMenuAberto] = useState(false)
  const [detalhesAbertos, setDetalhesAbertos] = useState(abrirDetalhesPelaUrl)

  const scrollEndRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const sendGuardRef = useRef(false)
  const mountedRef = useRef(false)

  const mensagensRender = useMemo(() => groupMessagesByDay(mensagens), [mensagens])
  const participantes = useMemo(
    () => (Array.isArray(conversa?.participants) ? conversa.participants : []),
    [conversa?.participants]
  )
  const professores = useMemo(
    () => participantes.filter((participant) => isProfessor(participant.role)),
    [participantes]
  )
  const podeEnviar = Boolean(acesso?.canSend)
  const membershipLabel = useMemo(() => {
    const conversationKind = `${acesso?.conversation?.type || conversa?.type || ''}`.toLowerCase()
    if (conversationKind === 'private') return ''

    const status = `${acesso?.membershipStatus || acesso?.participant?.status || ''}`.toLowerCase()
    if (status === 'approved' || status === 'active') return 'Participando'
    if (status === 'invited') return 'Convite'
    if (status === 'requested') return 'Aguardando'
    if (status === 'rejected') return 'Recusado'
    if (status === 'blocked') return 'Bloqueado'
    if (status === 'left') return 'Saiu'
    if (acesso?.conversation?.isPublic && !acesso?.participant) return 'Publico'
    return 'Participando'
  }, [acesso, conversa?.type])

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens.length, digitandoLista.length])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current)
      }
      if (perfil?.id && conversationId) {
        clearLiveTypingForUser(conversationId, perfil.id)
      }
    }
  }, [conversationId, perfil?.id])

  useEffect(() => {
    reiniciarCarregamento()
    void iniciar()
  }, [conversationId])

  useEffect(() => {
    if (!perfil?.id || !conversationId) return undefined

    const atualizar = async () => {
      await recarregarConversa({ mode: 'background' })
    }

    const intervalId = window.setInterval(() => {
      void atualizar()
    }, 2500)

    const onLiveChange = () => {
      void atualizar()
    }
    const onStorage = (event) => {
      if (event.key && event.key !== 'nexo_live_conversations_v1') return
      void atualizar()
    }

    window.addEventListener(LIVE_CHAT_UPDATED_EVENT, onLiveChange)
    window.addEventListener('storage', onStorage)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener(LIVE_CHAT_UPDATED_EVENT, onLiveChange)
      window.removeEventListener('storage', onStorage)
    }
  }, [perfil?.id, conversationId])

  useEffect(() => {
    function closeMenu() {
      setMenuAberto(false)
      setMenuAnexoAberto(false)
    }

    window.addEventListener('click', closeMenu)
    return () => window.removeEventListener('click', closeMenu)
  }, [])

  function reiniciarCarregamento() {
    setConversa(null)
    setAcesso(null)
    setMensagens([])
    setDigitandoLista([])
    setTexto('')
    setArquivo(null)
    setArquivoPreview('')
    setErro('')
    setReconnecting(false)
    setMenuAberto(false)
    setLoadState('loading')
  }

  async function iniciar() {
    try {
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
      if (!mountedRef.current) return

      setPerfil(perfilData)
      await recarregarConversa({ profileData: perfilData, mode: 'initial' })
    } catch {
      if (!mountedRef.current) return
      setErro('Não foi possível carregar as conversas agora.')
      setLoadState('error')
    }
  }

  async function recarregarConversa({ profileData = perfil, mode = 'background' } = {}) {
    if (!profileData?.id || !conversationId) return
    const timeoutId = window.setTimeout(() => {
      if (mode === 'initial') {
        setLoadState('timeout')
        setErro('Esta demorando mais que o normal.')
      }
    }, 4000)

    try {
      if (mode === 'background' && (loadState === 'loaded' || loadState === 'empty')) {
        setReconnecting(true)
      }

      const conversation = getLiveConversationById(conversationId)
      const nextAccess = getLiveConversationAccess(conversationId, profileData.id)

      if (!conversation) {
        setConversa(null)
        setAcesso(null)
        setMensagens([])
        setReconnecting(false)
        setLoadState('error')
        setErro('Não foi possível carregar as conversas agora.')
        return
      }

      if (!nextAccess.canRead) {
        setConversa(conversation)
        setAcesso(nextAccess)
        setMensagens([])
        setReconnecting(false)
        setLoadState('loaded')
        setErro('')
        return
      }

      const list = listLiveMessages(conversationId)
      setConversa(conversation)
      setAcesso(nextAccess)
      setMensagens(list)
      setDigitandoLista(getLiveTypingStatus(conversationId, profileData.id))
      if (nextAccess.membershipStatus === 'active' || nextAccess.membershipStatus === 'approved') {
        markLiveConversationAsRead(conversationId, profileData.id)
      }

      setErro('')
      setLoadState(list.length > 0 ? 'loaded' : 'empty')
      setReconnecting(false)
    } catch {
      if (!mountedRef.current) return
      setReconnecting(false)
      if (mode === 'background' && mensagens.length > 0) {
        setErro('Conexao instavel. Tentando reconectar...')
        setLoadState('loaded')
        return
      }
      setErro('Não foi possível carregar as conversas agora.')
      setLoadState('error')
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  async function selecionarArquivo(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (file.size > 4 * 1024 * 1024) {
      setErro('Arquivo muito grande. Envie até 4MB.')
      return
    }

    try {
      const dataUrl = await fileToDataUrl(file)
      setArquivo(file)
      setArquivoPreview(dataUrl)
      setErro('')
    } catch {
      setErro('Não foi possível preparar o anexo agora.')
    }
  }

  function removerArquivo() {
    setArquivo(null)
    setArquivoPreview('')
  }

  function abrirSeletorArquivo(option) {
    if (!fileInputRef.current) return

    if (option === 'foto') {
      setArquivoAccept('image/*')
      setArquivoCapture('')
    } else if (option === 'camera') {
      setArquivoAccept('image/*')
      setArquivoCapture('environment')
    } else if (option === 'pdf') {
      setArquivoAccept('application/pdf,.pdf')
      setArquivoCapture('')
    } else {
      setArquivoAccept('.doc,.docx,.txt,application/pdf,.pdf,image/*')
      setArquivoCapture('')
    }

    setMenuAnexoAberto(false)
    window.setTimeout(() => {
      fileInputRef.current?.click()
    }, 10)
  }

  function atualizarDigitacao(value) {
    if (!perfil?.id || !conversa?.id) return

    const hasContent = sanitizeText(value).length > 0
    setLiveTypingStatus({
      conversationId: conversa.id,
      userId: perfil.id,
      userName: perfil.nome || perfil.username || 'Usuário',
      role: perfil.role || 'aluno',
      isTyping: hasContent,
    })

    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }

    if (!hasContent) return
    typingTimeoutRef.current = window.setTimeout(() => {
      clearLiveTypingForUser(conversa.id, perfil.id)
    }, 1600)
  }

  async function enviarMensagem() {
    if (!perfil?.id || !conversa?.id || enviando || sendGuardRef.current) return

    const text = sanitizeText(texto)
    if (!text && !arquivo) return

    const acessoAtual = getLiveConversationAccess(conversa.id, perfil.id)
    if (!acessoAtual.canSend) {
      setErro(accessErrorMessage(acessoAtual.reason))
      return
    }

    sendGuardRef.current = true
    setEnviando(true)
    setErro('')

    try {
      const attachments = []
      if (arquivo && arquivoPreview) {
        attachments.push({
          fileName: arquivo.name || 'arquivo',
          fileUrl: arquivoPreview,
          fileType: arquivo.type || '',
          size: Number(arquivo.size || 0),
          createdAt: new Date().toISOString(),
        })
      }

      sendLiveMessage({
        conversationId: conversa.id,
        senderId: perfil.id,
        senderName: perfil.nome || perfil.username || 'Usuário',
        senderRole: perfil.role || 'aluno',
        messageType: attachments.length > 0 && !text ? messageType.file : messageType.text,
        text,
        attachments,
        dedupeKey: `${perfil.id}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
      })

      setTexto('')
      removerArquivo()
      clearLiveTypingForUser(conversa.id, perfil.id)
      await recarregarConversa({ mode: 'background' })
    } catch (error) {
      const code = `${error?.code || ''}`.toLowerCase()
      if (code.includes('student_messages_disabled')) {
        setErro('O professor desativou mensagens dos alunos neste grupo.')
      } else if (
        code.includes('requested') ||
        code.includes('rejected') ||
        code.includes('blocked') ||
        code.includes('not_member')
      ) {
        setErro(accessErrorMessage(code))
      } else {
        setErro('Não foi possível enviar a mensagem. Tente novamente.')
      }
    } finally {
      sendGuardRef.current = false
      setEnviando(false)
    }
  }

  function abrirLaboratorio() {
    if (!conversa?.id) return
    window.localStorage.setItem(
      'oxente_lab_context_v1',
      JSON.stringify({
        conversationId: conversa.id,
        title: conversa.title,
        openedAt: new Date().toISOString(),
      })
    )
    navigate('/oxente')
  }

  function criarAtividade() {
    if (!perfil?.id || !conversa?.id) return
    const title = window.prompt('Nome da atividade')
    const cleanTitle = sanitizeText(title || '')
    if (!cleanTitle) return

    publishAssignmentMessage({
      conversationId: conversa.id,
      sender: perfil,
      activityTitle: cleanTitle,
      assignmentId: `assignment-${Date.now()}`,
    })
    void recarregarConversa({ mode: 'background' })
  }

  function registrarEntrega() {
    if (!perfil?.id || !conversa?.id) return
    const title = window.prompt('Nome da atividade entregue')
    const cleanTitle = sanitizeText(title || '')
    if (!cleanTitle) return

    publishSubmissionNotice({
      conversationId: conversa.id,
      sender: perfil,
      activityTitle: cleanTitle,
      submissionId: `submission-${Date.now()}`,
    })
    void recarregarConversa({ mode: 'background' })
  }

  function chamarProfessor() {
    if (!perfil?.id || !conversa?.id) return
    const professor = professores[0]
    if (!professor) {
      setErro('Professor Não encontrado neste grupo.')
      return
    }

    sendLiveMessage({
      conversationId: conversa.id,
      senderId: perfil.id,
      senderName: perfil.nome || perfil.username || 'Usuário',
      senderRole: perfil.role || 'aluno',
      messageType: messageType.text,
      text: `@${professor.userName} pode me ajudar com a atividade?`,
      dedupeKey: `call-teacher:${Date.now()}`,
    })
    void recarregarConversa({ mode: 'background' })
  }

  function abrirConversaPrivadaProfessor() {
    const professor = professores[0]
    const username = sanitizeText(professor?.username || '')
    if (!username) {
      setErro('Professor sem conversa privada disponível no momento.')
      return
    }

    navigate(`/mensagens/${username}`)
  }

  function entrarNoGrupo() {
    if (!perfil?.id || !conversa?.id) return
    joinLiveConversation(conversa.id, {
      id: perfil.id,
      nome: perfil.nome || perfil.username || 'Usuário',
      username: perfil.username || '',
      role: perfil.role || 'aluno',
    })
    void recarregarConversa({ mode: 'background' })
  }

  function solicitarEntrada() {
    if (!perfil?.id || !conversa?.id) return
    requestLiveConversationAccess(conversa.id, {
      id: perfil.id,
      nome: perfil.nome || perfil.username || 'Usuário',
      username: perfil.username || '',
      role: perfil.role || 'aluno',
    })
    void recarregarConversa({ mode: 'background' })
  }

  function sairDoGrupo() {
    if (!perfil?.id || !conversa?.id) return
    leaveLiveConversation(conversa.id, perfil.id)
    navigate('/mensagens')
  }

  function alternarSilencio() {
    if (!perfil?.id || !conversa?.id) return
    toggleMuteLiveConversation(conversa.id, perfil.id)
    void recarregarConversa({ mode: 'background' })
  }

  function alternarpermissãoAluno() {
    if (!perfil?.id || !conversa?.id || !acesso?.participant) return
    if (!isProfessor(acesso.participant.role)) return

    updateLiveConversationSettings(conversa.id, perfil.id, {
      allowStudentMessages: !Boolean(conversa.allowStudentMessages),
    })
    void recarregarConversa({ mode: 'background' })
  }

  const mostrarAcaoEntrar = acesso?.reason === 'invited'
  const mostrarAcaoSolicitar = acesso?.reason === 'not_member' || acesso?.reason === 'not_member_public'
  const aguardandoAprovacao = acesso?.reason === 'requested_approval'
  const solicitacaoRecusada = acesso?.reason === 'rejected'
  const bloqueadoSala = acesso?.reason === 'blocked'

  if (loadState === 'loading') {
    return <SocialLoader variant="feed" showBottomNav />
  }

  if (loadState === 'error' || loadState === 'timeout') {
    return (
      <div className="container">
        <div className="topbar chat-room-topbar">
          <button
            type="button"
            className="chat-back-btn chat-back-icon-btn"
            onClick={() => navigate('/mensagens')}
            aria-label="Voltar"
          >
            <IconArrowLeft />
          </button>
          <h1>Conversa</h1>
          <div />
        </div>
        <div className="page chat-room-page">
          <div className="chat-live-error-card">
            <p>
              {loadState === 'timeout'
                ? erro || 'Esta demorando mais que o normal.'
                : erro || 'Não foi possível carregar as conversas agora.'}
            </p>
            <button type="button" className="chat-live-inline-btn" onClick={() => void iniciar()}>
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
      <div className="topbar chat-room-topbar">
        <button
          type="button"
          className="chat-back-btn chat-back-icon-btn"
          onClick={() => navigate('/mensagens')}
          aria-label="Voltar"
        >
          <IconArrowLeft />
        </button>

        <div className="chat-room-head-copy">
          <strong title={conversa?.title || ''}>{conversa?.title || 'Conversa'}</strong>
          <span>
            {conversa?.type === 'classroom_group'
              ? `Grupo de turma${membershipLabel ? ` - ${membershipLabel}` : ''}`
              : conversa?.type === 'private'
              ? 'Conversa privada'
              : `Conversa ao vivo${membershipLabel ? ` - ${membershipLabel}` : ''}`}
          </span>
        </div>

        <div className="chat-live-top-actions">
          <button
            type="button"
            className="chat-list-profile-link chat-live-menu-btn"
            onClick={(event) => {
              event.stopPropagation()
              setMenuAberto((prev) => !prev)
            }}
            aria-label="Mais opções"
          >
            <IconDotsVertical />
          </button>

          {menuAberto ? (
            <div className="chat-live-menu-popover right" onClick={(event) => event.stopPropagation()}>
              <button type="button" onClick={() => setDetalhesAbertos(true)}>
                Ver participantes
              </button>
              <button type="button" onClick={() => setDetalhesAbertos(true)}>
                Ver atividades
              </button>
              <button type="button" onClick={abrirLaboratorio}>
                Laboratório
              </button>
              {isProfessor(acesso?.participant?.role) ? (
                <>
                  <button type="button" onClick={criarAtividade}>
                    Criar atividade
                  </button>
                  <button type="button" onClick={() => setDetalhesAbertos(true)}>
                    Solicitações
                  </button>
                  <button type="button" onClick={alternarpermissãoAluno}>
                    {conversa?.allowStudentMessages ? 'Bloquear alunos' : 'Liberar alunos'}
                  </button>
                </>
              ) : null}
              <button type="button" onClick={registrarEntrega}>
                Entregar
              </button>
              <button type="button" onClick={chamarProfessor}>
                Chamar professor
              </button>
              <button type="button" onClick={abrirConversaPrivadaProfessor}>
                Conversa privada
              </button>
              <button type="button" onClick={alternarSilencio}>
                {acesso?.participant?.isMuted ? 'Ativar som' : 'Silenciar grupo'}
              </button>
              <button type="button" onClick={sairDoGrupo}>
                Sair do grupo
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="page chat-room-page">
        {reconnecting ? <p className="chat-live-reconnecting">Reconectando conversa...</p> : null}
        {erro ? <div className="alert-box erro-box">{erro}</div> : null}

        {mostrarAcaoEntrar || mostrarAcaoSolicitar || aguardandoAprovacao || solicitacaoRecusada || bloqueadoSala || !acesso?.canRead ? (
          <article className="chat-live-access-card">
            <p>
              {mostrarAcaoEntrar
                ? 'Você recebeu convite para este grupo.'
                : mostrarAcaoSolicitar
                ? 'Você ainda Não participa deste grupo.'
                : aguardandoAprovacao
                ? 'Aguardando aprovação do professor.'
                : solicitacaoRecusada
                ? 'Solicitação recusada pelo professor.'
                : bloqueadoSala
                ? 'Você foi bloqueado nesta sala.'
                : 'Sem permissão para abrir esta conversa.'}
            </p>
            <div className="chat-live-access-actions">
              {mostrarAcaoEntrar ? (
                <button type="button" className="chat-live-inline-btn" onClick={entrarNoGrupo}>
                  Entrar no grupo
                </button>
              ) : null}
              {mostrarAcaoSolicitar ? (
                <button type="button" className="chat-live-inline-btn" onClick={solicitarEntrada}>
                  Solicitar entrada
                </button>
              ) : null}
            </div>
          </article>
        ) : mensagens.length === 0 ? (
          <div className="empty-state chat-empty-state first-message">
            <h3>Conversa vazia</h3>
            <p>Envie a primeira mensagem para comecar.</p>
          </div>
        ) : (
          <div className="chat-thread">
            {mensagensRender.map((item) => {
              if (item.kind === 'separator') {
                return (
                  <div className="chat-day-separator" key={item.id}>
                    <span>{item.label}</span>
                  </div>
                )
              }

              const message = item.message
              const mine = message.senderId === perfil?.id
              const badge = messageBadge(message.messageType)

              return (
                <Fragment key={message.id}>
                  <div className={`chat-bubble-row ${mine ? 'mine' : ''}`}>
                    {!mine ? (
                      <div className="chat-thread-avatar" aria-hidden="true">
                        <span>{getInitial(message.senderName)}</span>
                      </div>
                    ) : null}

                    <div className={`chat-bubble-stack ${mine ? 'mine' : ''}`}>
                      {!mine ? (
                        <div className="chat-bubble-author">
                          {message.senderName}
                          {isProfessor(message.senderRole) ? (
                            <span className="chat-live-mini-badge professor">Professor</span>
                          ) : (
                            <span className="chat-live-mini-badge aluno">Aluno</span>
                          )}
                          {badge ? <span className="chat-live-mini-badge tipo">{badge}</span> : null}
                        </div>
                      ) : null}

                      <div className={`chat-bubble ${mine ? 'mine' : ''}`}>
                        {message.text ? <p><AutoLinkText text={message.text} /></p> : null}

                        {Array.isArray(message.attachments) && message.attachments.length > 0 ? (
                          <div className="chat-live-attachments">
                            {message.attachments.map((attachment) => {
                              const isImage = `${attachment.fileType || ''}`.startsWith('image/')
                              return (
                                <a
                                  key={attachment.id}
                                  href={attachment.fileUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="chat-live-attachment-link"
                                >
                                  {isImage ? (
                                    <img src={attachment.fileUrl} alt={attachment.fileName} />
                                  ) : (
                                    <span>{attachment.fileName}</span>
                                  )}
                                </a>
                              )
                            })}
                          </div>
                        ) : null}

                        <div className="chat-bubble-meta">
                          <span>{formatBubbleTime(message.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Fragment>
              )
            })}

            {digitandoLista.length > 0 ? (
              <div className="chat-bubble-row">
                <div className="chat-thread-avatar" aria-hidden="true">
                  <span>{getInitial(digitandoLista[0]?.userName)}</span>
                </div>
                <div className="chat-typing-card">
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                </div>
              </div>
            ) : null}

            <div ref={scrollEndRef} />
          </div>
        )}
      </div>

      <div className="chat-composer-shell">
        {arquivoPreview ? (
          <div className="chat-media-preview-card chat-live-media-preview-card">
            {arquivo?.type?.startsWith('image/') ? (
              <img src={arquivoPreview} alt="Preview do anexo" className="chat-media-preview" />
            ) : (
              <div className="chat-live-file-preview">
                <strong>{arquivo?.name || 'Arquivo'}</strong>
                <span>{arquivo?.type || 'Arquivo anexado'}</span>
              </div>
            )}

            <button type="button" className="chat-media-preview-remove" onClick={removerArquivo} aria-label="Remover anexo">
              x
            </button>
          </div>
        ) : null}

        <div className="chat-composer">
          <input
            ref={fileInputRef}
            type="file"
            accept={arquivoAccept}
            capture={arquivoCapture || undefined}
            onChange={selecionarArquivo}
            style={{ display: 'none' }}
          />

          <div className="chat-live-attach-wrap">
            <button
              type="button"
              className="btn chat-attach-btn chat-live-compact-btn chat-live-icon-btn"
              onClick={(event) => {
                event.stopPropagation()
                setMenuAnexoAberto((prev) => !prev)
              }}
              aria-label="Anexar"
              title="Anexar"
            >
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
                <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.9-9.9a4 4 0 1 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.82l8.49-8.48" />
              </svg>
            </button>

            {menuAnexoAberto ? (
              <div className="chat-live-attach-menu" onClick={(event) => event.stopPropagation()}>
                <button type="button" onClick={() => abrirSeletorArquivo('foto')}>
                  Foto
                </button>
                <button type="button" onClick={() => abrirSeletorArquivo('pdf')}>
                  PDF
                </button>
                <button type="button" onClick={() => abrirSeletorArquivo('documento')}>
                  Documento
                </button>
                <button type="button" onClick={() => abrirSeletorArquivo('camera')}>
                  Camera
                </button>
              </div>
            ) : null}
          </div>

          <input
            className="input chat-composer-input"
            type="text"
            placeholder="Mensagem..."
            value={texto}
            maxLength={500}
            onChange={(event) => {
              setTexto(event.target.value)
              atualizarDigitacao(event.target.value)
            }}
            onBlur={() => {
              if (!conversa?.id || !perfil?.id) return
              clearLiveTypingForUser(conversa.id, perfil.id)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void enviarMensagem()
              }
            }}
            disabled={!podeEnviar}
          />

          <button
            type="button"
            className="btn chat-send-btn chat-live-compact-btn"
            onClick={() => void enviarMensagem()}
            disabled={enviando || (!sanitizeText(texto) && !arquivo) || !podeEnviar}
          >
            {enviando ? '...' : 'Enviar'}
          </button>
        </div>
      </div>

      {detalhesAbertos ? (
        <div className="chat-live-modal-overlay" role="dialog" aria-modal="true">
          <div className="chat-live-modal-card">
            <div className="chat-live-modal-head">
              <strong>Detalhes do grupo</strong>
              <button type="button" className="chat-list-profile-link chat-live-menu-btn" onClick={() => setDetalhesAbertos(false)}>
                x
              </button>
            </div>

            <div className="chat-live-modal-body">
              <p><strong>Nome:</strong> {conversa?.title || '-'}</p>
              <p><strong>Turma:</strong> {conversa?.meta?.classroomName || conversa?.classroomId || 'Não informada'}</p>
              <p><strong>Matéria:</strong> {conversa?.meta?.subject || 'Não informada'}</p>
              <p><strong>Professor:</strong> {professores[0]?.userName || conversa?.meta?.teacherName || 'Não informado'}</p>
              <p><strong>Mensagens de alunos:</strong> {conversa?.allowStudentMessages ? 'Ativas' : 'Desativadas'}</p>

              <h4>Participantes</h4>
              <div className="chat-live-chip-row">
                {participantes.map((participant) => (
                  <span key={participant.id} className={`chat-live-participant-chip ${isProfessor(participant.role) ? 'professor' : ''}`}>
                    {participant.userName} ({participant.status || 'active'})
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <BottomNav />
    </div>
  )
}




