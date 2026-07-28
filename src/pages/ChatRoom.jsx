import { Fragment, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMemo } from 'react'
import BottomNav from '../components/BottomNav'
import AutoLinkText from '../components/AutoLinkText'
import InstantCameraSheet from '../components/InstantCameraSheet'
import SocialLoader from '../components/SocialLoader'
import {
  buscarConversaDireta,
  dispararAtualizacaoChat,
  garantirConversaDireta,
  marcarMensagensComoLidas,
  ordenarIdsPerfil,
  traduzirErroChat,
} from '../lib/chat'
import { traduzirErroAcademia } from '../lib/academy'
import { estaBloqueadoPorMim, traduzirErroBloqueio } from '../lib/blocks'
import { criarNotificacaoSePermitido } from '../lib/notificationPreferences'
import { supabase } from '../lib/supabase'
import ConfirmDialog from '../components/ConfirmDialog'

function IconeVoltar() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function IconeEnviar() {
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
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
    </svg>
  )
}

function IconeMidia() {
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
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
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
      aria-hidden="true"
    >
      <path d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  )
}

function IconeAudio() {
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
      <path d="M12 2v20" />
      <path d="M8 6.5v11a4 4 0 0 0 8 0v-11a4 4 0 0 0-8 0z" />
      <path d="M5 12v5a7 7 0 0 0 14 0v-5" />
    </svg>
  )
}

function IconePararGravacao() {
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
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  )
}

function IconePlayAudio() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 5.2v13.6c0 .7.76 1.14 1.38.78l10.2-6.8a.9.9 0 0 0 0-1.5l-10.2-6.8A.9.9 0 0 0 8 5.2z" />
    </svg>
  )
}

function IconePauseAudio() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="7" y="5" width="4" height="14" rx="1.4" />
      <rect x="13" y="5" width="4" height="14" rx="1.4" />
    </svg>
  )
}

function formatarHoraMensagem(dataIso) {
  return new Date(dataIso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatarTempoAudio(segundos) {
  const valor = Number.isFinite(segundos) && segundos > 0 ? Math.floor(segundos) : 0
  const minutos = Math.floor(valor / 60)
  const resto = valor % 60
  return `${minutos}:${String(resto).padStart(2, '0')}`
}

function ChatAudioPlayer({ src, ariaLabel = 'Mensagem de audio' }) {
  const audioRef = useRef(null)
  const [tocando, setTocando] = useState(false)
  const [duracao, setDuracao] = useState(0)
  const [tempoAtual, setTempoAtual] = useState(0)

  const progresso = duracao > 0 ? Math.min((tempoAtual / duracao) * 100, 100) : 0

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return undefined

    const aoCarregar = () => {
      setDuracao(Number.isFinite(audio.duration) ? audio.duration : 0)
    }

    const aoAtualizar = () => {
      setTempoAtual(Number.isFinite(audio.currentTime) ? audio.currentTime : 0)
    }

    const aoFinalizar = () => {
      setTocando(false)
      setTempoAtual(0)
      audio.currentTime = 0
    }

    const aoPausar = () => setTocando(false)
    const aoTocar = () => setTocando(true)

    audio.addEventListener('loadedmetadata', aoCarregar)
    audio.addEventListener('timeupdate', aoAtualizar)
    audio.addEventListener('ended', aoFinalizar)
    audio.addEventListener('pause', aoPausar)
    audio.addEventListener('play', aoTocar)

    return () => {
      audio.removeEventListener('loadedmetadata', aoCarregar)
      audio.removeEventListener('timeupdate', aoAtualizar)
      audio.removeEventListener('ended', aoFinalizar)
      audio.removeEventListener('pause', aoPausar)
      audio.removeEventListener('play', aoTocar)
    }
  }, [src])

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  async function alternarReproducao() {
    const audio = audioRef.current
    if (!audio) return

    try {
      if (audio.paused) {
        await audio.play()
      } else {
        audio.pause()
      }
    } catch {}
  }

  function buscarTempo(event) {
    const audio = audioRef.current
    if (!audio || !duracao) return

    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    const valor = Math.min(Math.max(ratio, 0), 1) * duracao
    audio.currentTime = valor
    setTempoAtual(valor)
  }

  return (
    <div className="chat-audio-player" aria-label={ariaLabel}>
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        type="button"
        className="chat-audio-play-btn"
        onClick={alternarReproducao}
        aria-label={tocando ? 'Pausar audio' : 'Reproduzir audio'}
      >
        {tocando ? <IconePauseAudio /> : <IconePlayAudio />}
      </button>

      <div className="chat-audio-body">
        <button
          type="button"
          className="chat-audio-wave"
          onClick={buscarTempo}
          aria-label="Barra de progresso do audio"
        >
          <span className="chat-audio-wave-bg" aria-hidden="true" />
          <span className="chat-audio-wave-fill" style={{ width: `${progresso}%` }} aria-hidden="true" />
        </button>

        <div className="chat-audio-meta">
          <span>{formatarTempoAudio(tempoAtual)}</span>
          <span>{formatarTempoAudio(duracao)}</span>
        </div>
      </div>
    </div>
  )
}

function formatarSeparadorDia(dataIso) {
  return new Date(dataIso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
  })
}

function mesmaData(dataA, dataB) {
  return new Date(dataA).toDateString() === new Date(dataB).toDateString()
}

function dataDesafioPorData(baseDate = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bahia',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(baseDate)

  const ano = partes.find((item) => item.type === 'year')?.value
  const mes = partes.find((item) => item.type === 'month')?.value
  const dia = partes.find((item) => item.type === 'day')?.value

  return `${ano}-${mes}-${dia}`
}

function xpMarcoNexinho(dias) {
  return {
    1: 20,
    7: 50,
    15: 75,
    30: 150,
    50: 250,
    100: 500,
    365: 1500,
  }[Number(dias)] || 0
}

function dataDesafioAtual() {
  return dataDesafioPorData(new Date())
}

function dataDesafioComOffsetDias(offsetDias = 0) {
  const base = new Date(Date.now() + offsetDias * 24 * 60 * 60 * 1000)
  return dataDesafioPorData(base)
}

function horarioBahiaAtual() {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bahia',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())

  const hora = Number(partes.find((item) => item.type === 'hour')?.value || 0)
  const minuto = Number(partes.find((item) => item.type === 'minute')?.value || 0)

  return { hora, minuto }
}

function getInicial(nome) {
  return nome?.charAt(0)?.toUpperCase() || 'U'
}

function mapearMensagem(mensagem, meuPerfil, outroPerfil) {
  return {
    ...mensagem,
    sender: mensagem.sender_profile_id === meuPerfil.id ? meuPerfil : outroPerfil,
  }
}

function placeholderPorMidia(mediaKind) {
  if (mediaKind === 'video') return '[Video]'
  if (mediaKind === 'audio') return '[Audio]'
  if (mediaKind === 'image') return '[Foto]'
  return ''
}

function deveOcultarTextoMensagem(mensagem) {
  if (!mensagem?.media_url) return false

  const texto = (mensagem.content || '').trim().toLowerCase()
  return texto === '[foto]' || texto === '[video]' || texto === '[audio]' || texto.length === 0
}

function textoEscopoDesafio(scope) {
  return scope === 'course' ? 'Desafio do curso' : 'Desafio da base central'
}

function normalizarQuestoesQuiz(questions) {
  if (!Array.isArray(questions)) return []

  return questions
    .map((question, index) => {
      if (!question?.id || !question?.prompt || !Array.isArray(question?.options)) {
        return null
      }

      const options = question.options
        .map((option) => {
          if (!option?.id || !option?.text) return null
          return {
            id: String(option.id).toUpperCase(),
            text: String(option.text),
          }
        })
        .filter(Boolean)

      if (options.length < 2) return null

      return {
        id: String(question.id),
        prompt: String(question.prompt),
        subject: question.subject ? String(question.subject) : '',
        difficulty: Number(question.difficulty || 1),
        order: Number(question.order || index + 1),
        options,
      }
    })
    .filter(Boolean)
}

function extrairResumoResultadoQuiz(resultado, totalFallback = 0) {
  const total = Number(resultado?.total_questions || totalFallback || 0)
  const acertos = Number(resultado?.correct_count || 0)
  const errosPayload = Number(resultado?.failed_questions)
  const erros = Number.isFinite(errosPayload)
    ? Math.max(0, errosPayload)
    : Math.max(total - acertos, 0)
  const meta = Number(resultado?.pass_score_percent || 70)
  const passou = Boolean(resultado?.passed)
  const motivoBanco = `${resultado?.result_reason || ''}`.trim()
  const motivo = motivoBanco || (passou ? 'Meta de aproveitamento atingida.' : `Meta de ${meta}% nÃ£o atingida.`)

  return {
    total,
    acertos,
    erros,
    meta,
    passou,
    motivo,
  }
}

function estadoAnimacaoPet(petDiario) {
  if (!petDiario?.has_pair) return 'idle'
  if (`${petDiario?.pet_status || ''}`.toLowerCase() === 'down') return 'waiting'
  if (petDiario.duo_completed) return 'happy'
  if (petDiario.completed_by_me) return 'waiting'
  if ((petDiario.completed_total || 0) > 0) return 'active'
  return 'idle'
}

function conversaPertenceAoPar(conversa, profileIdA, profileIdB) {
  if (!conversa || !profileIdA || !profileIdB) return false

  return (
    (conversa.profile_one_id === profileIdA && conversa.profile_two_id === profileIdB) ||
    (conversa.profile_one_id === profileIdB && conversa.profile_two_id === profileIdA)
  )
}

function montarMensagemErroChat(error, fallback) {
  const mensagemBase = traduzirErroChat(error, fallback)
  const detalhe = error?.message || error?.details || ''

  if (!detalhe) return mensagemBase

  if (mensagemBase.includes(detalhe)) return mensagemBase

  return `${mensagemBase} (${detalhe})`
}

function montarMensagemErroAcademia(error, fallback) {
  const mensagemBase = traduzirErroAcademia(error, fallback)
  const detalhe = error?.message || error?.details || ''

  if (!detalhe) return mensagemBase
  if (mensagemBase.includes(detalhe)) return mensagemBase

  return `${mensagemBase} (${detalhe})`
}

function montarMensagemErroBloqueioChat(error, fallback) {
  const mensagemBase = traduzirErroBloqueio(error, fallback)
  const detalhe = error?.message || error?.details || ''

  if (!detalhe) return mensagemBase
  if (mensagemBase.includes(detalhe)) return mensagemBase

  return `${mensagemBase} (${detalhe})`
}

export default function ChatRoom() {
  const { username } = useParams()

  const [meuPerfil, setMeuPerfil] = useState(null)
  const [destinatario, setDestinatario] = useState(null)
  const [conversa, setConversa] = useState(null)
  const [mensagens, setMensagens] = useState([])
  const [texto, setTexto] = useState('')
  const [arquivoMidia, setArquivoMidia] = useState(null)
  const [previewMidia, setPreviewMidia] = useState('')
  const [petDiario, setPetDiario] = useState(null)
  const [nomePetConvite, setNomePetConvite] = useState('Nexinho')
  const [petPainelAberto, setPetPainelAberto] = useState(false)
  const [petNascimentoAberto, setPetNascimentoAberto] = useState(false)
  const [petFabPosicao, setPetFabPosicao] = useState(null)
  const [petFabArrastando, setPetFabArrastando] = useState(false)
  const [quizAberto, setQuizAberto] = useState(false)
  const [quizCarregando, setQuizCarregando] = useState(false)
  const [quizSubmetendo, setQuizSubmetendo] = useState(false)
  const [quizErro, setQuizErro] = useState('')
  const [quizResultado, setQuizResultado] = useState(null)
  const [quizRevisao, setQuizRevisao] = useState([])
  const [quizDados, setQuizDados] = useState(null)
  const [quizRespostas, setQuizRespostas] = useState({})
  const [seguimentoMutuo, setSeguimentoMutuo] = useState(null)
  const [bloqueadoPorMim, setBloqueadoPorMim] = useState(false)
  const [bloqueadoPorOutro, setBloqueadoPorOutro] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [carregandoPet, setCarregandoPet] = useState(false)
  const [concluindoPet, setConcluindoPet] = useState(false)
  const [enviandoConvitePet, setEnviandoConvitePet] = useState(false)
  const [respondendoConvitePet, setRespondendoConvitePet] = useState(false)
  const [restaurandoPet, setRestaurandoPet] = useState(false)
  const [recriandoPet, setRecriandoPet] = useState(false)
  const [digitandoOutro, setDigitandoOutro] = useState(false)
  const [cameraChatAberta, setCameraChatAberta] = useState(false)
  const [gravandoAudio, setGravandoAudio] = useState(false)
  const [processandoAudio, setProcessandoAudio] = useState(false)
  const [erro, setErro] = useState('')
  const [mensagemParaApagar, setMensagemParaApagar] = useState(null)
  const [detalhesConversaAbertos, setDetalhesConversaAbertos] = useState(false)
  const [apelidoConversa, setApelidoConversa] = useState('')
  const [salvandoApelido, setSalvandoApelido] = useState(false)

  const navigate = useNavigate()
  const fimListaRef = useRef(null)
  const pairChannelRef = useRef(null)
  const petFabRef = useRef(null)
  const petFabDragRef = useRef({
    active: false,
    moved: false,
    pointerId: null,
    startClientX: 0,
    startClientY: 0,
    offsetX: 0,
    offsetY: 0,
  })
  const limparDigitandoOutroTimeoutRef = useRef(null)
  const pararDigitacaoLocalTimeoutRef = useRef(null)
  const ultimoPingDigitandoRef = useRef(0)
  const digitandoLocalAtivoRef = useRef(false)
  const inputMidiaRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const audioStreamRef = useRef(null)
  const audioChunksRef = useRef([])
  const chatBloqueado = bloqueadoPorMim || bloqueadoPorOutro
  const chavePosicaoFab = conversa?.id
    ? `chat_pet_fab_pos:${conversa.id}`
    : username
    ? `chat_pet_fab_pos:${username}`
    : ''

  useEffect(() => {
    iniciar()
  }, [username])

  useEffect(() => {
    if (!conversa?.id || !meuPerfil?.id) return
    supabase.from('chat_conversation_preferences').select('nickname')
      .eq('conversation_id', conversa.id).eq('profile_id', meuPerfil.id).maybeSingle()
      .then(({ data }) => setApelidoConversa(data?.nickname || ''))
  }, [conversa?.id, meuPerfil?.id])

  const midiasCompartilhadas = useMemo(
    () => mensagens.filter((mensagem) => mensagem.media_url && !mensagem.deleted_at),
    [mensagens]
  )

  async function salvarApelido() {
    if (!conversa?.id || !meuPerfil?.id) return
    setSalvandoApelido(true)
    const { error } = await supabase.from('chat_conversation_preferences').upsert({
      conversation_id: conversa.id,
      profile_id: meuPerfil.id,
      nickname: apelidoConversa.trim() || null,
      updated_at: new Date().toISOString(),
    })
    if (error) setErro(montarMensagemErroChat(error, 'Não foi possível salvar o apelido.'))
    setSalvandoApelido(false)
  }

  useEffect(() => {
    fimListaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens.length])

  useEffect(() => {
    return () => {
      if (previewMidia && previewMidia.startsWith('blob:')) {
        URL.revokeObjectURL(previewMidia)
      }
    }
  }, [previewMidia])

  useEffect(() => {
    return () => {
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop()
        }
      } catch {}

      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach((track) => track.stop())
        audioStreamRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!chatBloqueado) return

    setTexto('')
    setCameraChatAberta(false)
    limparMidiaSelecionada()
    esconderDigitandoOutro()
    setPetPainelAberto(false)
    setQuizAberto(false)
    limparEstadoQuiz()
    void enviarEventoDigitando(false)
  }, [chatBloqueado])

  useEffect(() => {
    if (!petPainelAberto) return undefined

    function aoPressionarTecla(event) {
      if (event.key === 'Escape') {
        setPetPainelAberto(false)
      }
    }

    window.addEventListener('keydown', aoPressionarTecla)
    return () => window.removeEventListener('keydown', aoPressionarTecla)
  }, [petPainelAberto])

  useEffect(() => {
    if (!chavePosicaoFab || typeof window === 'undefined') {
      setPetFabPosicao(null)
      return
    }

    try {
      const bruto = window.localStorage.getItem(chavePosicaoFab)
      if (!bruto) {
        setPetFabPosicao(null)
        return
      }

      const valor = JSON.parse(bruto)
      if (Number.isFinite(valor?.x) && Number.isFinite(valor?.y)) {
        window.requestAnimationFrame(() => {
          setPetFabPosicao(limitarPosicaoPetFab(Number(valor.x), Number(valor.y)))
        })
      } else {
        setPetFabPosicao(null)
      }
    } catch {
      setPetFabPosicao(null)
    }
  }, [chavePosicaoFab])

  useEffect(() => {
    if (!chavePosicaoFab || !petFabPosicao || typeof window === 'undefined') return

    try {
      window.localStorage.setItem(chavePosicaoFab, JSON.stringify(petFabPosicao))
    } catch {}
  }, [chavePosicaoFab, petFabPosicao])

  useEffect(() => {
    if (!petFabPosicao || typeof window === 'undefined') return undefined

    function ajustarComResize() {
      setPetFabPosicao((atual) => {
        if (!atual) return atual
        const ajustada = limitarPosicaoPetFab(atual.x, atual.y)
        if (ajustada.x === atual.x && ajustada.y === atual.y) return atual
        return ajustada
      })
    }

    window.addEventListener('resize', ajustarComResize)
    return () => window.removeEventListener('resize', ajustarComResize)
  }, [petFabPosicao])

  function esconderDigitandoOutro() {
    setDigitandoOutro(false)

    if (limparDigitandoOutroTimeoutRef.current) {
      window.clearTimeout(limparDigitandoOutroTimeoutRef.current)
      limparDigitandoOutroTimeoutRef.current = null
    }
  }

  async function enviarEventoDigitando(ativo) {
    const canalPar = pairChannelRef.current

    if (!canalPar || !meuPerfil || !destinatario) return

    digitandoLocalAtivoRef.current = ativo

    try {
      await canalPar.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          from_profile_id: meuPerfil.id,
          to_profile_id: destinatario.id,
          active: ativo,
        },
      })
    } catch {}
  }

  function controlarDigitacao(valor) {
    if (chatBloqueado) return
    if (!meuPerfil || !destinatario) return

    const temConteudo = valor.trim().length > 0

    if (!temConteudo) {
      if (pararDigitacaoLocalTimeoutRef.current) {
        window.clearTimeout(pararDigitacaoLocalTimeoutRef.current)
        pararDigitacaoLocalTimeoutRef.current = null
      }

      void enviarEventoDigitando(false)
      return
    }

    const agora = Date.now()

    if (!digitandoLocalAtivoRef.current || agora - ultimoPingDigitandoRef.current > 900) {
      ultimoPingDigitandoRef.current = agora
      void enviarEventoDigitando(true)
    }

    if (pararDigitacaoLocalTimeoutRef.current) {
      window.clearTimeout(pararDigitacaoLocalTimeoutRef.current)
    }

    pararDigitacaoLocalTimeoutRef.current = window.setTimeout(() => {
      void enviarEventoDigitando(false)
    }, 1600)
  }

  function limparMidiaSelecionada() {
    if (previewMidia && previewMidia.startsWith('blob:')) {
      URL.revokeObjectURL(previewMidia)
    }

    setArquivoMidia(null)
    setPreviewMidia('')

    if (inputMidiaRef.current) {
      inputMidiaRef.current.value = ''
    }
  }

  function aplicarMidiaSelecionada(arquivo) {
    if (chatBloqueado) {
      setErro('Chat bloqueado. Desbloqueie o perfil para enviar mensagens.')
      return false
    }

    if (gravandoAudio) {
      setErro('Pare a gravacao de audio antes de anexar outra midia.')
      return false
    }

    const tipoValido =
      arquivo.type.startsWith('image/') ||
      arquivo.type.startsWith('video/') ||
      arquivo.type.startsWith('audio/')

    if (!tipoValido) {
      setErro('Envie apenas imagem, video ou audio no chat.')
      return false
    }

    setErro('')

    if (previewMidia && previewMidia.startsWith('blob:')) {
      URL.revokeObjectURL(previewMidia)
    }

    setArquivoMidia(arquivo)
    setPreviewMidia(URL.createObjectURL(arquivo))
    return true
  }

  function selecionarMidia(event) {
    const arquivo = event.target.files?.[0]
    if (!arquivo) return
    aplicarMidiaSelecionada(arquivo)
    event.target.value = ''
  }

  function abrirCameraChat() {
    if (chatBloqueado) {
      setErro('Chat bloqueado. Desbloqueie o perfil para enviar mensagens.')
      return
    }

    if (gravandoAudio || processandoAudio) {
      setErro('Pare a gravacao de audio para abrir a camera.')
      return
    }

    setErro('')
    setCameraChatAberta(true)
  }

  function encerrarCapturaAudio() {
    if (!audioStreamRef.current) return
    audioStreamRef.current.getTracks().forEach((track) => track.stop())
    audioStreamRef.current = null
  }

  function obterExtensaoAudio(mimeType) {
    const tipo = `${mimeType || ''}`.toLowerCase()
    if (tipo.includes('ogg')) return 'ogg'
    if (tipo.includes('mp4') || tipo.includes('m4a')) return 'm4a'
    if (tipo.includes('mpeg') || tipo.includes('mp3')) return 'mp3'
    return 'webm'
  }

  async function iniciarGravacaoAudio() {
    if (chatBloqueado) {
      setErro('Chat bloqueado. Desbloqueie o perfil para gravar audio.')
      return
    }

    if (gravandoAudio || processandoAudio) return

    if (
      typeof window === 'undefined' ||
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setErro('Seu navegador nÃ£o suporta gravacao de audio ao vivo.')
      return
    }

    setErro('')
    limparMidiaSelecionada()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeTypesPreferidos = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ]

      const mimeTypeSuportado =
        typeof MediaRecorder.isTypeSupported === 'function'
          ? mimeTypesPreferidos.find((tipo) => MediaRecorder.isTypeSupported(tipo))
          : ''

      const recorder = mimeTypeSuportado
        ? new MediaRecorder(stream, { mimeType: mimeTypeSuportado })
        : new MediaRecorder(stream)

      audioStreamRef.current = stream
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      recorder.onerror = () => {
        setErro('NÃ£o foi possÃ­vel gravar audio agora.')
        setGravandoAudio(false)
        setProcessandoAudio(false)
        encerrarCapturaAudio()
      }

      recorder.onstop = () => {
        const chunks = [...audioChunksRef.current]
        audioChunksRef.current = []

        const mimeTypeFinal =
          recorder.mimeType || chunks[0]?.type || 'audio/webm'
        const blob = new Blob(chunks, { type: mimeTypeFinal })

        if (!blob.size) {
          setErro('NÃ£o foi possÃ­vel capturar o audio. Tente novamente.')
          setGravandoAudio(false)
          setProcessandoAudio(false)
          mediaRecorderRef.current = null
          encerrarCapturaAudio()
          return
        }

        const extensao = obterExtensaoAudio(mimeTypeFinal)
        const arquivo = new File([blob], `audio-${Date.now()}.${extensao}`, {
          type: mimeTypeFinal,
        })

        setArquivoMidia(arquivo)
        setPreviewMidia(URL.createObjectURL(arquivo))
        setGravandoAudio(false)
        setProcessandoAudio(false)
        mediaRecorderRef.current = null
        encerrarCapturaAudio()
      }

      recorder.start()
      setGravandoAudio(true)
      setProcessandoAudio(false)
    } catch (error) {
      encerrarCapturaAudio()
      setGravandoAudio(false)
      setProcessandoAudio(false)

      const detalhe = `${error?.message || ''}`.toLowerCase()
      if (
        detalhe.includes('notallowed') ||
        detalhe.includes('permission') ||
        detalhe.includes('denied')
      ) {
        setErro('Permissao do microfone negada. Libere o microfone no navegador.')
        return
      }

      setErro('NÃ£o foi possÃ­vel iniciar a gravacao de audio.')
    }
  }

  function pararGravacaoAudio() {
    if (!mediaRecorderRef.current) return

    if (mediaRecorderRef.current.state === 'inactive') {
      setGravandoAudio(false)
      setProcessandoAudio(false)
      encerrarCapturaAudio()
      return
    }

    setProcessandoAudio(true)
    try {
      mediaRecorderRef.current.stop()
    } catch {
      setProcessandoAudio(false)
      setGravandoAudio(false)
      encerrarCapturaAudio()
      setErro('NÃ£o foi possÃ­vel finalizar a gravacao agora.')
    }
  }

  function limparEstadoQuiz() {
    setQuizCarregando(false)
    setQuizSubmetendo(false)
    setQuizErro('')
    setQuizResultado(null)
    setQuizRevisao([])
    setQuizDados(null)
    setQuizRespostas({})
  }

  function fecharQuiz() {
    if (quizSubmetendo) return
    setQuizAberto(false)
    limparEstadoQuiz()
  }

  function fecharPainelPet() {
    setPetPainelAberto(false)
  }

  function selecionarRespostaQuiz(questionId, optionId) {
    setQuizRespostas((anterior) => ({
      ...anterior,
      [questionId]: optionId,
    }))
  }

  async function uploadMidiaChat(file) {
    if (!file || !meuPerfil) return null

    const mediaKind = file.type.startsWith('video/')
      ? 'video'
      : file.type.startsWith('audio/')
      ? 'audio'
      : 'image'

    const extensaoPadrao =
      mediaKind === 'video' ? 'mp4' : mediaKind === 'audio' ? 'mp3' : 'jpg'

    const extensao = file.name.split('.').pop() || extensaoPadrao
    const nomeArquivo = `chat/${meuPerfil.id}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${extensao}`

    const { error: uploadError } = await supabase.storage
      .from('stories')
      .upload(nomeArquivo, file, { upsert: false })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from('stories').getPublicUrl(nomeArquivo)

    return {
      mediaUrl: data.publicUrl,
      mediaKind,
    }
  }

  async function verificarSeguimentoMutuo(profileIdA, profileIdB) {
    if (!profileIdA || !profileIdB) {
      setSeguimentoMutuo(null)
      return
    }

    try {
      const [segueA, segueB] = await Promise.all([
        supabase
          .from('follows')
          .select('id')
          .eq('follower_profile_id', profileIdA)
          .eq('following_profile_id', profileIdB)
          .limit(1)
          .maybeSingle(),
        supabase
          .from('follows')
          .select('id')
          .eq('follower_profile_id', profileIdB)
          .eq('following_profile_id', profileIdA)
          .limit(1)
          .maybeSingle(),
      ])

      if (segueA.error) throw segueA.error
      if (segueB.error) throw segueB.error

      setSeguimentoMutuo(Boolean(segueA.data && segueB.data))
    } catch {
      setSeguimentoMutuo(null)
    }
  }

  async function verificarBloqueioNoChat(profileIdA, profileIdB) {
    if (!profileIdA || !profileIdB) {
      setBloqueadoPorMim(false)
      setBloqueadoPorOutro(false)
      return {
        bloqueadoPorMimAtual: false,
        bloqueadoPorOutroAtual: false,
      }
    }

    try {
      const [bloqueioPorMim, bloqueioPorOutro] = await Promise.all([
        estaBloqueadoPorMim(profileIdA, profileIdB),
        estaBloqueadoPorMim(profileIdB, profileIdA),
      ])

      const bloqueadoPorMimAtual = Boolean(bloqueioPorMim)
      const bloqueadoPorOutroAtual = Boolean(bloqueioPorOutro)

      setBloqueadoPorMim(bloqueadoPorMimAtual)
      setBloqueadoPorOutro(bloqueadoPorOutroAtual)

      return {
        bloqueadoPorMimAtual,
        bloqueadoPorOutroAtual,
      }
    } catch (error) {
      throw error
    }
  }

  async function carregarPetDoDia(conversationId, { silencioso = false } = {}) {
    if (!conversationId) return

    if (!silencioso) {
      setCarregandoPet(true)
    }

    try {
      const hojeLocal = dataDesafioAtual()

      let regrasPet = null
      let regrasResp = await supabase.rpc('academy_apply_pet_daily_rules', {
        p_conversation_id: conversationId,
      })

      if (regrasResp.error) {
        const mensagem = `${regrasResp.error?.message || ''} ${regrasResp.error?.details || ''}`.toLowerCase()
        const erroAssinatura =
          regrasResp.error?.code === 'PGRST202' ||
          mensagem.includes('could not find the function') ||
          mensagem.includes('academy_apply_pet_daily_rules')

        if (!erroAssinatura) throw regrasResp.error
      } else {
        regrasPet = Array.isArray(regrasResp.data) ? regrasResp.data[0] : regrasResp.data
      }

      const { data, error } = await supabase.rpc('academy_get_pet_state', {
        p_conversation_id: conversationId,
        p_challenge_date: hojeLocal,
      })

      if (error) throw error

      const resumo = Array.isArray(data) ? data[0] : data
      let aparenciaPet = null
      const dashboardResp = await supabase.rpc('nexinho_get_dashboard', {
        p_conversation_id: conversationId,
      })
      if (!dashboardResp.error) {
        aparenciaPet = dashboardResp.data
      }
      const restoresUsedMes = Number(regrasPet?.restores_used_month ?? 0)
      const restoresLeftMes = Number(
        regrasPet?.restores_left_month ?? Math.max(0, 3 - restoresUsedMes)
      )
      const canRestore = regrasPet ? Boolean(regrasPet.can_restore) : true
      const resumoComRegras = resumo
        ? {
            ...resumo,
            color: aparenciaPet?.color || resumo.color || 'neon',
            accessory: aparenciaPet?.accessory || resumo.accessory || 'none',
            room_theme: aparenciaPet?.room_theme || resumo.room_theme || 'study',
            pet_status: regrasPet?.pet_status || resumo.pet_status,
            pet_life_days:
              Number.isFinite(Number(regrasPet?.pet_life_days))
                ? Number(regrasPet.pet_life_days)
                : resumo.pet_life_days,
            restores_used_month: restoresUsedMes,
            restores_left_month: restoresLeftMes,
            can_restore: canRestore,
            missed_deadline_date: regrasPet?.missed_deadline_date || null,
            survival_start_date: regrasPet?.survival_start_date || null,
          }
        : null

      setPetDiario(resumoComRegras || null)

      if (resumoComRegras?.pet_name) {
        setNomePetConvite(resumoComRegras.pet_name)
      }
    } catch (error) {
      setErro(
        montarMensagemErroAcademia(error, 'NÃ£o foi possÃ­vel carregar o painel do pet em dupla.')
      )
    } finally {
      if (!silencioso) {
        setCarregandoPet(false)
      }
    }
  }

  async function enviarConvitePet() {
    if (enviandoConvitePet || !meuPerfil || !destinatario) return
    if (chatBloqueado) {
      setErro('Chat bloqueado. Desbloqueie o perfil para continuar.')
      return
    }

    if (seguimentoMutuo === false) {
      setErro('Para criar pet em dupla, os dois perfis precisam se seguir.')
      return
    }

    const nomeLimpo = nomePetConvite.trim() || 'Nexinho'

    setErro('')
    setEnviandoConvitePet(true)

    try {
      let conversaAtiva = conversa

      if (!conversaAtiva) {
        conversaAtiva = await garantirConversaDireta(meuPerfil.id, destinatario.id)
        setConversa(conversaAtiva)
      }

      const { error } = await supabase.rpc('academy_send_pet_invite', {
        p_conversation_id: conversaAtiva.id,
        p_pet_name: nomeLimpo,
      })

      if (error) throw error

      await registrarMensagemSistemaPet(
        conversaAtiva.id,
        `[Sistema] Convite de pet enviado: ${nomeLimpo}.`
      )
      await carregarPetDoDia(conversaAtiva.id, { silencioso: true })
    } catch (error) {
      setErro(montarMensagemErroAcademia(error, 'NÃ£o foi possÃ­vel enviar o convite do pet agora.'))
    } finally {
      setEnviandoConvitePet(false)
    }
  }

  async function responderConvitePet(aceitar) {
    if (!petDiario?.invitation_id || respondendoConvitePet) return
    if (chatBloqueado) {
      setErro('Chat bloqueado. Desbloqueie o perfil para continuar.')
      return
    }

    setErro('')
    setRespondendoConvitePet(true)

    try {
      const { data, error } = await supabase.rpc('academy_respond_pet_invite', {
        p_invitation_id: petDiario.invitation_id,
        p_accept: Boolean(aceitar),
      })

      if (error) throw error

      if (conversa?.id) {
        await registrarMensagemSistemaPet(
          conversa.id,
          aceitar
            ? `[Sistema] Convite de pet aceito. ${petDiario?.pet_name || 'Nexinho'} nasceu.`
            : '[Sistema] Convite de pet recusado.'
        )
      }

      if (aceitar) {
        setPetNascimentoAberto(true)
        const resposta = Array.isArray(data) ? data[0] : data
        if (resposta?.pet_pair_id) {
          setPetDiario((anterior) => ({
            ...(anterior || {}),
            has_pair: true,
            pet_pair_id: resposta.pet_pair_id,
          }))
        }
      }

      if (conversa?.id) {
        await carregarPetDoDia(conversa.id, { silencioso: true })
      }
    } catch (error) {
      setErro(montarMensagemErroAcademia(error, 'NÃ£o foi possÃ­vel responder o convite agora.'))
    } finally {
      setRespondendoConvitePet(false)
    }
  }

  function limitarPosicaoPetFab(posicaoX, posicaoY) {
    if (typeof window === 'undefined') {
      return { x: posicaoX, y: posicaoY }
    }

    const larguraBotao = petFabRef.current?.offsetWidth || 72
    const alturaBotao = petFabRef.current?.offsetHeight || 72
    const margem = 10
    const shellRect = document.querySelector('.chat-room-shell')?.getBoundingClientRect()
    const topbarRect = document.querySelector('.chat-room-topbar')?.getBoundingClientRect()
    const composerRect = document.querySelector('.chat-composer-shell')?.getBoundingClientRect()
    const minimoX = (shellRect?.left || 0) + margem
    const limiteDireito = shellRect?.right || window.innerWidth
    const maximoX = Math.max(minimoX, limiteDireito - larguraBotao - margem)
    const minimoY = (topbarRect?.bottom || 52) + margem
    const limiteInferior = composerRect?.top || window.innerHeight - 76
    const maximoY = Math.max(minimoY, limiteInferior - alturaBotao - margem)

    return {
      x: Math.min(Math.max(posicaoX, minimoX), maximoX),
      y: Math.min(Math.max(posicaoY, minimoY), maximoY),
    }
  }

  function iniciarArrastePetFab(event) {
    const botao = petFabRef.current
    if (!botao) return

    const rect = botao.getBoundingClientRect()
    const drag = petFabDragRef.current
    drag.active = true
    drag.moved = false
    drag.pointerId = event.pointerId
    drag.startClientX = event.clientX
    drag.startClientY = event.clientY
    drag.offsetX = event.clientX - rect.left
    drag.offsetY = event.clientY - rect.top

    try {
      botao.setPointerCapture(event.pointerId)
    } catch {}

    setPetFabArrastando(true)
  }

  function moverArrastePetFab(event) {
    const drag = petFabDragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return

    const deltaX = Math.abs(event.clientX - drag.startClientX)
    const deltaY = Math.abs(event.clientY - drag.startClientY)
    if (deltaX > 6 || deltaY > 6) {
      drag.moved = true
    }

    const proximoX = event.clientX - drag.offsetX
    const proximoY = event.clientY - drag.offsetY
    setPetFabPosicao(limitarPosicaoPetFab(proximoX, proximoY))
  }

  function finalizarArrastePetFab(event) {
    const drag = petFabDragRef.current
    if (!drag.active || drag.pointerId !== event.pointerId) return

    drag.active = false
    drag.pointerId = null

    try {
      petFabRef.current?.releasePointerCapture(event.pointerId)
    } catch {}

    setPetFabArrastando(false)
  }

  async function restaurarPetLegado() {
    if (!conversa?.id) return false

    const pairResp = await supabase
      .from('chat_pet_pairs')
      .select('id, status')
      .eq('conversation_id', conversa.id)
      .maybeSingle()

    if (pairResp.error) throw pairResp.error

    if (!pairResp.data?.id) {
      setErro('Este chat ainda nÃ£o tem pet em dupla.')
      return false
    }

    const statusAtual = `${pairResp.data.status || ''}`.toLowerCase()
    if (statusAtual !== 'down') {
      setErro('Nexinho ja esta vivo.')
      return false
    }

    const updateResp = await supabase
      .from('chat_pet_pairs')
      .update({ status: 'alive' })
      .eq('id', pairResp.data.id)

    if (updateResp.error) throw updateResp.error

    await registrarMensagemSistemaPet(conversa.id, '[Sistema] Nexinho restaurado.')
    await carregarPetDoDia(conversa.id, { silencioso: true })
    return true
  }

  async function restaurarPet() {
    if (!conversa?.id || restaurandoPet) return

    setErro('')
    setRestaurandoPet(true)

    try {
      const { data, error } = await supabase.rpc('academy_restore_pet_pair', {
        p_conversation_id: conversa.id,
      })

      if (error) throw error

      const payload = Array.isArray(data) ? data[0] : data
      if (!payload?.restored) {
        setErro(payload?.message || 'NÃ£o foi possÃ­vel restaurar o Nexinho agora.')
        return
      }

      await registrarMensagemSistemaPet(
        conversa.id,
        '[Sistema] Nexinho restaurado.'
      )

      await carregarPetDoDia(conversa.id, { silencioso: true })
    } catch (error) {
      const mensagem = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
      const erroAssinatura =
        error?.code === 'PGRST202' ||
        mensagem.includes('could not find the function') ||
        mensagem.includes('academy_restore_pet_pair')

      if (erroAssinatura) {
        try {
          const restaurado = await restaurarPetLegado()
          if (restaurado) return
        } catch {}
        setErro('NÃ£o foi possÃ­vel restaurar no modo legado. Rode o SQL de restauracao no Supabase.')
        return
      }

      setErro(montarMensagemErroAcademia(error, 'NÃ£o foi possÃ­vel restaurar o Nexinho agora.'))
    } finally {
      setRestaurandoPet(false)
    }
  }

  async function recriarPetDoZeroLegado() {
    if (!conversa?.id) return false

    const pairResp = await supabase
      .from('chat_pet_pairs')
      .select('id, status, pet_name, restores_used_month')
      .eq('conversation_id', conversa.id)
      .maybeSingle()

    if (pairResp.error) throw pairResp.error

    if (!pairResp.data?.id) {
      setErro('Este chat ainda nÃ£o tem pet em dupla.')
      return false
    }

    const statusAtual = `${pairResp.data.status || ''}`.toLowerCase()
    if (statusAtual !== 'down') {
      setErro('Nexinho ainda esta vivo.')
      return false
    }

    if (Number(pairResp.data.restores_used_month || 0) < 3) {
      setErro('A recriacao s? libera depois de usar as 3 restaurações mensais.')
      return false
    }

    const horaBahia = horarioBahiaAtual().hora
    const dataInicio = horaBahia >= 23 ? dataDesafioComOffsetDias(1) : dataDesafioAtual()
    const cicloMes = `${dataInicio.slice(0, 7)}-01`

    const updateResp = await supabase
      .from('chat_pet_pairs')
      .update({
        pet_name: (nomePetConvite || pairResp.data.pet_name || 'Nexinho').trim() || 'Nexinho',
        status: 'alive',
        life_days: 0,
        restores_used_month: 0,
        restore_cycle_month: cicloMes,
        survival_start_date: dataInicio,
        down_at: null,
        down_reason: null,
      })
      .eq('id', pairResp.data.id)

    if (updateResp.error) throw updateResp.error

    await registrarMensagemSistemaPet(conversa.id, '[Sistema] Nexinho recriado do zero.')
    await carregarPetDoDia(conversa.id, { silencioso: true })
    return true
  }

  async function recriarPetDoZero() {
    if (!conversa?.id || recriandoPet) return

    setErro('')
    setRecriandoPet(true)

    try {
      const { data, error } = await supabase.rpc('academy_recreate_pet_pair', {
        p_conversation_id: conversa.id,
        p_pet_name: nomePetConvite.trim() || petDiario?.pet_name || 'Nexinho',
      })

      if (error) throw error

      const payload = Array.isArray(data) ? data[0] : data
      if (!payload?.recreated) {
        setErro(payload?.message || 'NÃ£o foi possÃ­vel recriar o Nexinho agora.')
        return
      }

      await registrarMensagemSistemaPet(conversa.id, '[Sistema] Nexinho recriado do zero.')
      await carregarPetDoDia(conversa.id, { silencioso: true })
    } catch (error) {
      const mensagem = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
      const erroAssinatura =
        error?.code === 'PGRST202' ||
        mensagem.includes('could not find the function') ||
        mensagem.includes('academy_recreate_pet_pair')

      if (erroAssinatura) {
        try {
          const recriado = await recriarPetDoZeroLegado()
          if (recriado) return
        } catch {}

        setErro('NÃ£o foi possÃ­vel recriar no modo legado. Rode o SQL de recriacao do Nexinho no Supabase.')
        return
      }

      setErro(montarMensagemErroAcademia(error, 'NÃ£o foi possÃ­vel recriar o Nexinho agora.'))
    } finally {
      setRecriandoPet(false)
    }
  }

  async function abrirQuizDesafioPet() {
    if (chatBloqueado) {
      setErro('Chat bloqueado. Desbloqueie o perfil para resolver o quiz.')
      return
    }

    if (`${petDiario?.pet_status || ''}`.toLowerCase() === 'down') {
      setErro('O Nexinho está descansando. Use uma restauração ou comece uma nova sequência amanhã.')
      return
    }

    if (!conversa?.id || quizCarregando || quizSubmetendo || !petDiario?.has_pair) return

    setPetPainelAberto(false)
    setErro('')
    setQuizAberto(true)
    setQuizCarregando(true)
    setQuizErro('')
    setQuizResultado(null)
    setQuizDados(null)
    setQuizRespostas({})

    try {
      const regraResp = await supabase.rpc('academy_apply_pet_daily_rules', {
        p_conversation_id: conversa.id,
      })

      if (!regraResp.error) {
        const regra = Array.isArray(regraResp.data) ? regraResp.data[0] : regraResp.data
        if (`${regra?.pet_status || ''}`.toLowerCase() === 'down') {
          setQuizAberto(false)
          setQuizErro('')
        setErro('O Nexinho está descansando. Use uma restauração ou comece uma nova sequência amanhã.')
          await carregarPetDoDia(conversa.id, { silencioso: true })
          return
        }
      }

      const hojeIso = dataDesafioAtual()

      let resultado = await supabase.rpc('academy_get_pet_daily_quiz', {
        p_conversation_id: conversa.id,
        p_challenge_date: hojeIso,
      })

      if (resultado.error) {
        const mensagem = `${resultado.error?.message || ''} ${resultado.error?.details || ''}`.toLowerCase()
        const erroAssinatura =
          resultado.error?.code === 'PGRST202' ||
          mensagem.includes('could not find the function')

        if (erroAssinatura) {
          resultado = await supabase.rpc('academy_get_pet_daily_quiz', {
            p_conversation_id: conversa.id,
          })
        }
      }

      if (resultado.error) throw resultado.error

      const payload = Array.isArray(resultado.data) ? resultado.data[0] : resultado.data
      const questoes = normalizarQuestoesQuiz(payload?.questions)

      if (!payload?.attempt_id || questoes.length === 0) {
        throw new Error('NÃ£o foi possÃ­vel montar o quiz agora.')
      }

      setQuizDados({
        attemptId: payload.attempt_id,
        taskId: payload.task_id || null,
        subjectName: payload.subject_name || 'Desafio',
        totalQuestions: Number(payload.total_questions || questoes.length),
        passScorePercent: Number(payload.pass_score_percent || 70),
        questions: questoes,
      })
    } catch (error) {
      setQuizErro(
        montarMensagemErroAcademia(error, 'NÃ£o foi possÃ­vel abrir o quiz do desafio agora.')
      )
    } finally {
      setQuizCarregando(false)
    }
  }

  async function enviarQuizDesafioPet() {
    if (chatBloqueado) {
      setQuizErro('Chat bloqueado. Desbloqueie o perfil para enviar respostas.')
      return
    }

    if (`${petDiario?.pet_status || ''}`.toLowerCase() === 'down') {
      setQuizErro('O Nexinho está descansando. Restaure a sequência para continuar hoje.')
      return
    }

    if (!quizDados?.attemptId || quizSubmetendo || !conversa?.id) return

    const respostas = Object.entries(quizRespostas).map(([question_id, selected_option]) => ({
      question_id,
      selected_option,
    }))

    if (respostas.length !== quizDados.questions.length) {
      setQuizErro('Responda todas as perguntas antes de enviar.')
      return
    }

    setConcluindoPet(true)
    setQuizSubmetendo(true)
    setQuizErro('')
    setErro('')

    try {
      const { data, error } = await supabase.rpc('academy_submit_pet_daily_quiz', {
        p_attempt_id: quizDados.attemptId,
        p_answers: respostas,
      })

      if (error) throw error

      const payload = Array.isArray(data) ? data[0] : data
      setQuizResultado(payload || null)
      const { data: revisao } = await supabase.rpc('nexinho_quiz_review', {
        p_attempt_id: quizDados.attemptId,
      })
      setQuizRevisao(Array.isArray(revisao) ? revisao : [])
      const resumoResultado = extrairResumoResultadoQuiz(payload, quizDados.totalQuestions)

      if (!resumoResultado.passou) {
        setQuizErro(
          `VocÃª perdeu ${resumoResultado.erros} questao(oes). Motivo: ${resumoResultado.motivo}`
        )
        return
      }

      setQuizErro('')

      await registrarMensagemSistemaPet(
        conversa.id,
        `[Quiz] ${petDiario?.activity_title || 'Desafio diario'}\nPontuacao: ${resumoResultado.acertos}/${resumoResultado.total}`
      )

      await carregarPetDoDia(conversa.id, { silencioso: true })
    } catch (error) {
      setQuizErro(montarMensagemErroAcademia(error, 'NÃ£o foi possÃ­vel corrigir o quiz agora.'))
    } finally {
      setConcluindoPet(false)
      setQuizSubmetendo(false)
    }
  }

  useEffect(() => {
    if (!conversa?.id || !meuPerfil || !destinatario || chatBloqueado) return undefined

    const channel = supabase
      .channel(`chat-room-${conversa.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversa.id}`,
        },
        async (payload) => {
          const novaMensagem = mapearMensagem(payload.new, meuPerfil, destinatario)

          setMensagens((prev) =>
            prev.some((mensagem) => mensagem.id === novaMensagem.id)
              ? prev
              : [...prev, novaMensagem]
          )

          if (payload.new.sender_profile_id !== meuPerfil.id) {
            esconderDigitandoOutro()

            try {
              await marcarMensagensComoLidas(conversa.id, meuPerfil.id)
            } catch {}

            dispararAtualizacaoChat({ conversationId: conversa.id, type: 'read' })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversa.id}`,
        },
        (payload) => {
          setMensagens((prev) =>
            prev.map((mensagem) =>
              mensagem.id === payload.new.id
                ? {
                    ...mensagem,
                    ...payload.new,
                    sender: mensagem.sender,
                  }
                : mensagem
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [chatBloqueado, conversa?.id, destinatario, meuPerfil])

  useEffect(() => {
    if (!meuPerfil || !destinatario || chatBloqueado) return undefined

    let ativo = true
    const [pairOneId, pairTwoId] = ordenarIdsPerfil(meuPerfil.id, destinatario.id)
    const pairKey = `${pairOneId}__${pairTwoId}`

    async function sincronizarConversaAtual({ marcarLidas = false } = {}) {
      try {
        const conversaAtual = await buscarConversaDireta(meuPerfil.id, destinatario.id)

        if (!ativo || !conversaAtual) return

        setConversa((anterior) => (anterior?.id === conversaAtual.id ? anterior : conversaAtual))
        await carregarMensagens(conversaAtual.id, meuPerfil, destinatario)

        if (marcarLidas) {
          await marcarMensagensComoLidas(conversaAtual.id, meuPerfil.id)
          dispararAtualizacaoChat({ conversationId: conversaAtual.id, type: 'read' })
        }
      } catch {}
    }

    const pairChannel = supabase
      .channel(`chat-pair-${pairKey}`, {
        config: {
          broadcast: { self: false },
        },
      })
      .on(
        'broadcast',
        {
          event: 'typing',
        },
        ({ payload }) => {
          if (payload?.from_profile_id !== destinatario.id) return

          if (payload?.active) {
            setDigitandoOutro(true)

            if (limparDigitandoOutroTimeoutRef.current) {
              window.clearTimeout(limparDigitandoOutroTimeoutRef.current)
            }

            limparDigitandoOutroTimeoutRef.current = window.setTimeout(() => {
              esconderDigitandoOutro()
            }, 2400)
            return
          }

          esconderDigitandoOutro()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_conversations',
        },
        async (payload) => {
          const conversaEvento = payload.new?.id ? payload.new : payload.old

          if (conversaPertenceAoPar(conversaEvento, meuPerfil.id, destinatario.id)) {
            await sincronizarConversaAtual({ marcarLidas: true })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        async () => {
          await sincronizarConversaAtual()
        }
      )
      .subscribe()

    pairChannelRef.current = pairChannel

    const intervalId = window.setInterval(() => {
      sincronizarConversaAtual()
    }, 3000)

    return () => {
      if (digitandoLocalAtivoRef.current) {
        void pairChannel.send({
          type: 'broadcast',
          event: 'typing',
          payload: {
            from_profile_id: meuPerfil.id,
            to_profile_id: destinatario.id,
            active: false,
          },
        })
      }

      ativo = false
      window.clearInterval(intervalId)
      esconderDigitandoOutro()

      if (pararDigitacaoLocalTimeoutRef.current) {
        window.clearTimeout(pararDigitacaoLocalTimeoutRef.current)
        pararDigitacaoLocalTimeoutRef.current = null
      }

      digitandoLocalAtivoRef.current = false
      pairChannelRef.current = null
      supabase.removeChannel(pairChannel)
    }
  }, [chatBloqueado, destinatario, meuPerfil])

  useEffect(() => {
    if (!meuPerfil?.id || !destinatario?.id || chatBloqueado) return undefined

    let ativo = true

    async function sincronizarBloqueio() {
      try {
        const estado = await verificarBloqueioNoChat(meuPerfil.id, destinatario.id)

        if (!ativo) return

        if (estado.bloqueadoPorMimAtual || estado.bloqueadoPorOutroAtual) {
          setConversa(null)
          setMensagens([])
        }
      } catch (error) {
        if (!ativo) return
        setErro((anterior) =>
          anterior ||
          montarMensagemErroBloqueioChat(
            error,
            'NÃ£o foi possÃ­vel validar o bloqueio desta conversa agora.'
          )
        )
      }
    }

    void sincronizarBloqueio()

    const intervalId = window.setInterval(() => {
      void sincronizarBloqueio()
    }, 4000)

    return () => {
      ativo = false
      window.clearInterval(intervalId)
    }
  }, [destinatario?.id, meuPerfil?.id])

  useEffect(() => {
    if (!conversa?.id || chatBloqueado) return undefined

    void carregarPetDoDia(conversa.id, { silencioso: true })

    const intervalId = window.setInterval(() => {
      void carregarPetDoDia(conversa.id, { silencioso: true })
    }, 4000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [chatBloqueado, conversa?.id])

  useEffect(() => {
    if (!meuPerfil?.id || !destinatario?.id) return undefined

    void verificarSeguimentoMutuo(meuPerfil.id, destinatario.id)

    const intervalId = window.setInterval(() => {
      void verificarSeguimentoMutuo(meuPerfil.id, destinatario.id)
    }, 12000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [chatBloqueado, meuPerfil?.id, destinatario?.id])

  async function iniciar() {
    try {
      setCarregando(true)
      setErro('')
      setTexto('')
      setPetDiario(null)
      setSeguimentoMutuo(null)
      setBloqueadoPorMim(false)
      setBloqueadoPorOutro(false)
      setPetPainelAberto(false)
      setQuizAberto(false)
      limparEstadoQuiz()
      limparMidiaSelecionada()

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/auth')
        return
      }

      const { data: perfilData, error: perfilError } = await supabase
        .from('profiles')
        .select('id, nome, username, foto_url')
        .eq('account_id', user.id)
        .single()

      if (perfilError) throw perfilError

      const { data: destinatarioData, error: destinatarioError } = await supabase
        .from('profiles')
        .select('id, nome, username, foto_url')
        .eq('username', username)
        .single()

      if (destinatarioError) throw destinatarioError

      if (perfilData.id === destinatarioData.id) {
        navigate('/perfil')
        return
      }

      setMeuPerfil(perfilData)
      setDestinatario(destinatarioData)

      const bloqueioAtual = await verificarBloqueioNoChat(perfilData.id, destinatarioData.id)

      if (bloqueioAtual.bloqueadoPorMimAtual || bloqueioAtual.bloqueadoPorOutroAtual) {
        setConversa(null)
        setMensagens([])
        return
      }

      await verificarSeguimentoMutuo(perfilData.id, destinatarioData.id)

      let conversaExistente = await buscarConversaDireta(perfilData.id, destinatarioData.id)

      if (!conversaExistente) {
        conversaExistente = await garantirConversaDireta(perfilData.id, destinatarioData.id)
      }

      setConversa(conversaExistente)

      if (conversaExistente) {
        await carregarMensagens(conversaExistente.id, perfilData, destinatarioData)
        await marcarMensagensComoLidas(conversaExistente.id, perfilData.id)
        dispararAtualizacaoChat({ conversationId: conversaExistente.id, type: 'read' })
        await carregarPetDoDia(conversaExistente.id)
      }
    } catch (error) {
      setErro(
        montarMensagemErroBloqueioChat(
          error,
          traduzirErroChat(error, 'NÃ£o foi possÃ­vel abrir este chat agora.')
        )
      )
    } finally {
      setCarregando(false)
    }
  }

  async function carregarMensagens(conversationId, perfilAtual, destinatarioAtual) {
    const [messageResult, hiddenResult] = await Promise.all([
      supabase.from('chat_messages')
        .select('id, conversation_id, sender_profile_id, content, media_url, media_kind, created_at, read_at, deleted_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
      supabase.from('chat_message_hidden').select('message_id').eq('profile_id', perfilAtual.id),
    ])

    if (messageResult.error) throw messageResult.error
    if (hiddenResult.error) throw hiddenResult.error
    const hiddenIds = new Set((hiddenResult.data || []).map((item) => item.message_id))

    setMensagens(
      (messageResult.data || []).filter((mensagem) => !hiddenIds.has(mensagem.id)).map((mensagem) =>
        mapearMensagem(mensagem, perfilAtual, destinatarioAtual)
      )
    )
  }

  async function apagarMensagem(mensagem, paraTodos) {
    if (!mensagem) return
    const { error } = await supabase.rpc(
      paraTodos ? 'chat_delete_message_for_everyone' : 'chat_hide_message',
      { p_message_id: mensagem.id }
    )
    if (error) {
      setErro(montarMensagemErroChat(error, 'Não foi possível apagar a mensagem.'))
      return
    }
    setMensagemParaApagar(null)
    if (conversa?.id && meuPerfil && destinatario) {
      await carregarMensagens(conversa.id, meuPerfil, destinatario)
    }
  }

  async function registrarMensagemSistemaPet(conversationId, conteudo) {
    if (chatBloqueado || !conversationId || !meuPerfil || !conteudo?.trim()) return

    const { error } = await supabase.from('chat_messages').insert({
      conversation_id: conversationId,
      sender_profile_id: meuPerfil.id,
      content: conteudo.trim(),
    })

    if (error) {
      console.warn('Falha ao registrar mensagem do pet no chat:', error.message)
      return
    }

    dispararAtualizacaoChat({ conversationId, type: 'pet' })
  }

  async function enviarMensagem() {
    const conteudoDigitado = texto.trim()
    const temMidia = Boolean(arquivoMidia)

    if (chatBloqueado) {
      setErro('Chat bloqueado. Desbloqueie o perfil para enviar mensagens.')
      return
    }

    if ((!conteudoDigitado && !temMidia) || !meuPerfil || !destinatario || enviando) return

    setErro('')
    setEnviando(true)

    try {
      let conversaAtiva = conversa
      let mediaPayload = null

      await enviarEventoDigitando(false)

      if (temMidia) {
        mediaPayload = await uploadMidiaChat(arquivoMidia)
      }

      if (!conversaAtiva) {
        conversaAtiva = await garantirConversaDireta(meuPerfil.id, destinatario.id)
        setConversa(conversaAtiva)
        await carregarPetDoDia(conversaAtiva.id, { silencioso: true })
      }

      const conteudoFinal =
        conteudoDigitado || placeholderPorMidia(mediaPayload?.mediaKind)

      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversaAtiva.id,
          sender_profile_id: meuPerfil.id,
          content: conteudoFinal,
          media_url: mediaPayload?.mediaUrl || null,
          media_kind: mediaPayload?.mediaKind || null,
        })
        .select(
          'id, conversation_id, sender_profile_id, content, media_url, media_kind, created_at, read_at'
        )
        .single()

      if (error) throw error

      const mensagemCriada = mapearMensagem(data, meuPerfil, destinatario)

      setMensagens((prev) =>
        prev.some((mensagem) => mensagem.id === mensagemCriada.id)
          ? prev
          : [...prev, mensagemCriada]
      )

      setTexto('')
      limparMidiaSelecionada()
      dispararAtualizacaoChat({ conversationId: conversaAtiva.id, type: 'sent' })

      const resultadoNotificacao = await criarNotificacaoSePermitido({
        receiverProfileId: destinatario.id,
        actorProfileId: meuPerfil.id,
        type: 'message',
      })

      if (resultadoNotificacao?.error) {
        console.warn('Falha ao criar notificacao de mensagem:', resultadoNotificacao.error.message)
      }
    } catch (error) {
      setErro(montarMensagemErroChat(error, 'NÃ£o foi possÃ­vel enviar a mensagem agora.'))
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) {
    return <SocialLoader variant="feed" showBottomNav />
  }

  const petAnimacaoBase = estadoAnimacaoPet(petDiario)
  const petAnimacao =
    petAnimacaoBase === 'idle' && mensagens.length > 0 ? 'reading' : petAnimacaoBase
  const petEmDescanso = `${petDiario?.pet_status || ''}`.toLowerCase() === 'down'
  const restauraçõesRestantesMes = Number(
    petDiario?.restores_left_month ?? (petDiario?.has_pair ? 3 : 0)
  )
  const podeRestaurarPet = petDiario?.can_restore !== false && restauraçõesRestantesMes > 0
  const horarioBahia = horarioBahiaAtual()
  const minutosBahia = horarioBahia.hora * 60 + horarioBahia.minuto
  const petEmRisco =
    Boolean(petDiario?.has_pair) &&
    !petEmDescanso &&
    !Boolean(petDiario?.duo_completed) &&
    minutosBahia >= 20 * 60 &&
    minutosBahia < 23 * 60
  const quizQuestoes = quizDados?.questions || []
  const quizRespondidas = quizQuestoes.filter((question) => quizRespostas[question.id]).length
  const quizTodasRespondidas =
    quizQuestoes.length > 0 && quizRespondidas === quizQuestoes.length
  const quizProgressoPercentual = quizQuestoes.length
    ? Math.round((quizRespondidas / quizQuestoes.length) * 100)
    : 0
  const quizResumoResultado = quizResultado
    ? extrairResumoResultadoQuiz(quizResultado, quizDados?.totalQuestions || 0)
    : null

  return (
    <div className="container chat-room-shell">
      <div className="topbar chat-room-topbar">
        <button type="button" className="chat-back-btn" onClick={() => navigate(-1)}>
          <IconeVoltar />
        </button>

        <button
          type="button"
          className="chat-room-profile-btn"
          onClick={() => navigate(`/usuario/${destinatario?.username}`)}
        >
          <div className="chat-avatar small">
            {destinatario?.foto_url ? (
              <img src={destinatario.foto_url} alt={destinatario.nome} />
            ) : (
              <span>{getInicial(destinatario?.nome)}</span>
            )}
          </div>

          <div className="chat-room-head-copy">
            <strong>{apelidoConversa || destinatario?.nome || 'Chat'}</strong>
            <span>@{destinatario?.username || username}</span>
            {digitandoOutro ? (
              <div className="chat-room-status typing">
                <span className="chat-room-status-dot" />
                <small>digitando...</small>
              </div>
            ) : null}
          </div>
        </button>
        <button
          type="button"
          className={`chat-pet-topbar-btn ${petDiario?.has_pair ? 'active' : ''}`}
          onClick={() => setPetPainelAberto(true)}
          aria-label="Abrir Nexinho"
          title="Nexinho"
        >
          <span className={`chat-pet-topbar-scene ${petEmDescanso ? 'resting' : petEmRisco ? 'risk' : 'alive'}`}>
            {
              <span className={`chat-pet-avatar ${petAnimacao} chat-pet-fab-avatar`}>
                <span className="chat-pet-aura" />
                <span className="chat-pet-tail" />
                <span className="chat-pet-ear left" />
                <span className="chat-pet-ear right" />
                <span className="chat-pet-body" />
                <span className="chat-pet-eye left" />
                <span className="chat-pet-eye right" />
                <span className="chat-pet-mouth" />
                <span className="chat-pet-blush left" />
                <span className="chat-pet-blush right" />
                <span className="chat-pet-spark one" />
                <span className="chat-pet-spark two" />
              </span>
            }
          </span>
          {petDiario?.has_pair ? (
            <span className="chat-pet-streak-copy">
              <span className="chat-pet-streak-flame" aria-hidden="true">🔥</span>
              <strong>{petDiario?.pet_life_days || 0}</strong>
            </span>
          ) : (
            <small>Nexinho</small>
          )}
        </button>
        <button type="button" className="chat-details-trigger" onClick={() => setDetalhesConversaAbertos(true)}
          aria-label="Detalhes da conversa">ⓘ</button>
      </div>

      <div className="page chat-room-page">
        {erro ? <div className="alert-box erro-box">{erro}</div> : null}

        {destinatario && petPainelAberto ? (
          <div className="chat-pet-overlay" role="dialog" aria-modal="true" onClick={fecharPainelPet}>
            <section className="chat-pet-card chat-pet-drawer" onClick={(event) => event.stopPropagation()}>
              <div className="chat-pet-drawer-head">
                <strong>Nexinho</strong>
                <button
                  type="button"
                  className="chat-pet-drawer-close"
                  onClick={fecharPainelPet}
                  aria-label="Fechar painel do pet"
                >
                  x
                </button>
              </div>
            {petDiario?.has_pair ? (
              petEmDescanso ? (
                <div className="chat-pet-dead-box">
                  <div className="chat-pet-head">
                    <div>
                      <p className="chat-pet-kicker">Pet em dupla</p>
                      <h3>{petDiario?.pet_name || 'Nexinho'}</h3>
                    </div>

                    <div className="chat-pet-life">
                      <strong>{petDiario?.pet_life_days || 0}</strong>
                      <span>melhor sequência</span>
                    </div>
                  </div>

                  <p className="chat-pet-title">O Nexinho está descansando.</p>
                  <p className="chat-pet-description">
                    A sequência terminou, mas o pet, o quarto, os acessórios e as conquistas continuam salvos.
                  </p>
                  {restauraçõesRestantesMes <= 0 ? (
                    <p className="chat-pet-description">
                      As restaurações deste mês acabaram. Concluam a próxima missão para iniciar uma nova sequência.
                    </p>
                  ) : null}

                  <button
                    type="button"
                    className="chat-pet-action chat-pet-restore-btn"
                    onClick={restaurarPet}
                    disabled={restaurandoPet || !podeRestaurarPet}
                  >
                    {restaurandoPet
                      ? 'Restaurando...'
                      : podeRestaurarPet
                      ? 'Restaurar sequência'
                      : 'Restauração indisponível'}
                  </button>
                </div>
              ) : (
                <>
                <div className="chat-pet-head">
                  <div>
                    <p className="chat-pet-kicker">Pet em dupla</p>
                    <h3>{petDiario?.pet_name || 'Nexinho'}</h3>
                  </div>

                  <div className="chat-pet-life">
                    <strong>{petDiario?.pet_life_days || 0}</strong>
                    <span>dias em sequência</span>
                  </div>
                </div>

                <div className={`chat-pet-live-zone ${petAnimacao}`}>
                  <div className={`chat-pet-avatar ${petAnimacao}`} aria-hidden="true">
                    <span className="chat-pet-aura" />
                    <span className="chat-pet-tail" />
                    <span className="chat-pet-ear left" />
                    <span className="chat-pet-ear right" />
                    <span className="chat-pet-body" />
                    <span className="chat-pet-eye left" />
                    <span className="chat-pet-eye right" />
                    <span className="chat-pet-mouth" />
                    <span className="chat-pet-blush left" />
                    <span className="chat-pet-blush right" />
                    <span className="chat-pet-spark one" />
                    <span className="chat-pet-spark two" />
                  </div>

                  <p className="chat-pet-live-note">
                    {petDiario.duo_completed
                      ? 'Missao completa hoje. Pet feliz e com energia maxima.'
                      : petDiario.completed_by_me
                      ? 'Sua parte ja foi concluida. Seu colega pode concluir depois.'
                      : 'Pet aguardando a primeira conclusao de hoje.'}
                  </p>
                </div>

                <p className="chat-pet-scope">{textoEscopoDesafio(petDiario.challenge_scope)}</p>
                <p className="chat-pet-title">
                  {petDiario.activity_title || 'Desafio do dia em preparacao'}
                </p>
                {petDiario.activity_description ? (
                  <p className="chat-pet-description">{petDiario.activity_description}</p>
                ) : null}

                <div className="chat-pet-meta">
                  <span>XP por marcos: 1, 7, 15, 30, 50, 100 e 365 dias</span>
                  <span>Concluidos hoje: {petDiario.completed_total || 0}/2</span>
                  <span>
                    {petDiario.duo_completed
                      ? 'Dupla concluiu hoje'
                      : 'Seu colega pode concluir depois'}
                  </span>
                </div>

                {petDiario.milestone_awarded ? (
                  <p className="chat-pet-milestone">
                    Marco de {petDiario.milestone_days} dias: +
                    {xpMarcoNexinho(petDiario.milestone_days)} XP no perfil de cada aluno
                  </p>
                ) : null}

                <button
                  type="button"
                  className="chat-pet-action"
                  onClick={() => navigate(`/nexinho/${conversa.id}`)}
                >
                  Abrir quarto completo
                </button>

                <button
                  type="button"
                  className={`chat-pet-action ${
                    petDiario.completed_by_me ? 'done' : ''
                  }`}
                  onClick={abrirQuizDesafioPet}
                  disabled={concluindoPet}
                >
                  {concluindoPet
                    ? 'Salvando...'
                    : petDiario.completed_by_me
                    ? 'Refazer quiz do dia'
                    : 'Resolver desafio (quiz)'}
                </button>
                </>
              )
            ) : petDiario?.pending_for_me ? (
              <div className="chat-pet-invite-box">
                <p className="chat-pet-title">
                  Convite de {petDiario.inviter_username || 'aluno'} para criar o pet{' '}
                  <strong>{petDiario.pet_name || 'Nexinho'}</strong>
                </p>
                <p className="chat-pet-description">
                  Aceitando, vocês recebem um desafio por dia e mantem o pet vivo em dupla.
                </p>

                <div className="chat-pet-invite-actions">
                  <button
                    type="button"
                    className="chat-pet-action reject"
                    onClick={() => responderConvitePet(false)}
                    disabled={respondendoConvitePet}
                  >
                    Recusar
                  </button>
                  <button
                    type="button"
                    className="chat-pet-action"
                    onClick={() => responderConvitePet(true)}
                    disabled={respondendoConvitePet}
                  >
                    {respondendoConvitePet ? 'Processando...' : 'Aceitar convite'}
                  </button>
                </div>
              </div>
            ) : petDiario?.pending_is_mine ? (
              <div className="chat-pet-invite-box">
                <p className="chat-pet-title">
                  Convite enviado para {petDiario.invitee_username || 'seu colega'}
                </p>
                <p className="chat-pet-description">
                  Assim que ele aceitar, o pet nasce e o desafio diario aparece.
                </p>
              </div>
            ) : !conversa?.id ? (
              <div className="chat-pet-invite-box">
                <p className="chat-pet-title">Crie um pet em dupla para este chat</p>
                <p className="chat-pet-description">
                  {seguimentoMutuo === false
                    ? 'Para liberar o pet em dupla, vocês precisam se seguir mutuamente.'
                    : 'Envie o convite para iniciar o pet em dupla com desafios diários.'}
                </p>

                <div className="chat-pet-invite-compose">
                  <input
                    className="input chat-pet-name-input"
                    type="text"
                    maxLength={32}
                    value={nomePetConvite}
                    onChange={(event) => setNomePetConvite(event.target.value)}
                    placeholder="Nome do pet"
                  />
                  <button
                    type="button"
                    className="chat-pet-action"
                    onClick={enviarConvitePet}
                    disabled={enviandoConvitePet || seguimentoMutuo === false}
                  >
                    {seguimentoMutuo === false
                      ? 'Siga de volta para liberar'
                      : enviandoConvitePet
                      ? 'Enviando...'
                      : 'Enviar convite'}
                  </button>
                </div>
              </div>
            ) : petDiario ? (
              <div className="chat-pet-invite-box">
                <p className="chat-pet-title">Crie um pet em dupla para este chat</p>
                <p className="chat-pet-description">
                  {seguimentoMutuo === null
                    ? 'NÃ£o consegui confirmar os follows agora, mas vocÃª pode tentar enviar o convite.'
                    : seguimentoMutuo === false
                    ? 'Para liberar o pet em dupla, vocês precisam se seguir mutuamente.'
                    : 'Um de vocês envia convite e o outro aceita. Depois disso, o banco gera os desafios diários automaticamente.'}
                </p>

                <div className="chat-pet-invite-compose">
                  <input
                    className="input chat-pet-name-input"
                    type="text"
                    maxLength={32}
                    value={nomePetConvite}
                    onChange={(event) => setNomePetConvite(event.target.value)}
                    placeholder="Nome do pet"
                  />
                  <button
                    type="button"
                    className="chat-pet-action"
                    onClick={enviarConvitePet}
                    disabled={enviandoConvitePet || seguimentoMutuo === false}
                  >
                    {seguimentoMutuo === null
                      ? 'Enviar convite'
                      : seguimentoMutuo === false
                      ? 'Siga de volta para liberar'
                      : enviandoConvitePet
                      ? 'Enviando...'
                      : 'Enviar convite'}
                  </button>
                </div>
              </div>
            ) : (
              <p className="chat-pet-loading">
                {carregandoPet ? 'Carregando painel do pet...' : 'Preparando painel do pet...'}
              </p>
            )}
          </section>
          </div>
        ) : null}

        {chatBloqueado ? (
          <div className="empty-state chat-empty-state first-message chat-empty-blocked">
            <h3>Conversa bloqueada</h3>
            <p>
              {bloqueadoPorMim
                ? 'Desbloqueie este perfil para liberar novas mensagens.'
                : 'Este perfil bloqueou vocÃª. O envio e o recebimento foram pausados.'}
            </p>
          </div>
        ) : mensagens.length === 0 ? (
          <div className="empty-state chat-empty-state first-message">
            <h3>Conversa pronta</h3>
            <p>Envie a primeira mensagem para iniciar esse chat em tempo real.</p>
          </div>
        ) : (
          <div className="chat-thread">
            {mensagens.map((mensagem, index) => {
              const mensagemAnterior = mensagens[index - 1]
              const mostrarSeparador =
                !mensagemAnterior || !mesmaData(mensagem.created_at, mensagemAnterior.created_at)
              const ehMinha = mensagem.sender_profile_id === meuPerfil?.id

              return (
                <Fragment key={mensagem.id}>
                  {mostrarSeparador ? (
                    <div className="chat-day-separator">
                      <span>{formatarSeparadorDia(mensagem.created_at)}</span>
                    </div>
                  ) : null}

                  <div className={`chat-bubble-row ${ehMinha ? 'mine' : ''}`}>
                    {!ehMinha ? (
                      <div className="chat-thread-avatar" aria-hidden="true">
                        {destinatario?.foto_url ? (
                          <img src={destinatario.foto_url} alt="" />
                        ) : (
                          <span>{getInicial(destinatario?.nome)}</span>
                        )}
                      </div>
                    ) : null}

                    <div className={`chat-bubble-stack ${ehMinha ? 'mine' : ''}`}>
                      {!ehMinha ? (
                        <button
                          type="button"
                          className="chat-bubble-author chat-bubble-author-btn"
                          onClick={() =>
                            navigate(`/usuario/${destinatario?.username || username}`)
                          }
                        >
                          {destinatario?.nome || 'Perfil'}
                        </button>
                      ) : null}

                      <div className={`chat-bubble ${ehMinha ? 'mine' : ''}`}
                        onContextMenu={(event) => { event.preventDefault(); setMensagemParaApagar(mensagem) }}>
                        {mensagem.deleted_at ? (
                          <p className="chat-deleted-copy">Mensagem apagada</p>
                        ) : mensagem.media_url ? (
                          <div className="chat-media-wrap">
                            {mensagem.media_kind === 'video' ? (
                              <video
                                className="chat-media"
                                src={mensagem.media_url}
                                controls
                                playsInline
                                preload="metadata"
                              />
                            ) : mensagem.media_kind === 'audio' ? (
                              <ChatAudioPlayer src={mensagem.media_url} />
                            ) : (
                              <img
                                className="chat-media"
                                src={mensagem.media_url}
                                alt="Midia enviada no chat"
                              />
                            )}
                          </div>
                        ) : null}

                        {!mensagem.deleted_at && !deveOcultarTextoMensagem(mensagem) ? (
                          <p><AutoLinkText text={mensagem.content} /></p>
                        ) : null}
                        {!mensagem.deleted_at ? (
                          <button type="button" className="chat-message-menu-btn"
                            onClick={() => setMensagemParaApagar(mensagem)}>•••</button>
                        ) : null}
                        <div className="chat-bubble-meta">
                          <span>{formatarHoraMensagem(mensagem.created_at)}</span>
                          {ehMinha ? (
                            <span>{mensagem.read_at ? 'Visto' : 'Enviado'}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </Fragment>
              )
            })}

            {digitandoOutro ? (
              <div className="chat-bubble-row typing-row">
                <div className="chat-thread-avatar" aria-hidden="true">
                  {destinatario?.foto_url ? (
                    <img src={destinatario.foto_url} alt="" />
                  ) : (
                    <span>{getInicial(destinatario?.nome)}</span>
                  )}
                </div>

                <div className="chat-typing-card">
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                </div>
              </div>
            ) : null}

            <div ref={fimListaRef} />
          </div>
        )}
      </div>
      <ConfirmDialog
        open={Boolean(mensagemParaApagar)}
        title="Apagar mensagem?"
        description="Escolha onde essa mensagem deve desaparecer."
        onClose={() => setMensagemParaApagar(null)}
        options={[
          {
            id: 'mine',
            label: 'Apagar para mim',
            hint: 'A outra pessoa ainda verá a mensagem',
            onClick: () => apagarMensagem(mensagemParaApagar, false),
          },
          ...(mensagemParaApagar?.sender_profile_id === meuPerfil?.id ? [{
            id: 'everyone',
            label: 'Apagar para todos',
            hint: 'A mensagem será removida da conversa',
            danger: true,
            onClick: () => apagarMensagem(mensagemParaApagar, true),
          }] : []),
        ]}
      />
      {detalhesConversaAbertos ? (
        <div className="chat-details-overlay" onClick={() => setDetalhesConversaAbertos(false)}>
          <aside className="chat-details-drawer" onClick={(event) => event.stopPropagation()}>
            <header><button onClick={() => setDetalhesConversaAbertos(false)}>←</button><h2>Detalhes</h2></header>
            <section className="chat-details-profile">
              <div className="chat-avatar">{destinatario?.foto_url ? <img src={destinatario.foto_url} alt="" /> : <span>{getInicial(destinatario?.nome)}</span>}</div>
              <h2>{apelidoConversa || destinatario?.nome}</h2><p>@{destinatario?.username}</p>
            </section>
            <section className="chat-details-section">
              <label>Apelido nesta conversa</label>
              <div className="chat-nickname-row"><input value={apelidoConversa} onChange={(event) => setApelidoConversa(event.target.value)}
                placeholder={destinatario?.nome || 'Apelido'} maxLength={40} />
                <button onClick={salvarApelido} disabled={salvandoApelido}>{salvandoApelido ? '...' : 'Salvar'}</button></div>
            </section>
            <section className="chat-details-actions">
              <button onClick={() => { setDetalhesConversaAbertos(false); setPetPainelAberto(true) }}>
                <span>✦</span><span><strong>Nexinho</strong><small>Abrir ou anexar o pet da conversa</small></span>
              </button>
              <button onClick={() => navigate(`/usuario/${destinatario?.username}`)}>
                <span>◎</span><span><strong>Ver perfil</strong><small>Abrir o perfil completo</small></span>
              </button>
            </section>
            <section className="chat-details-section">
              <div className="chat-details-section-head"><h3>Fotos e vídeos</h3><span>{midiasCompartilhadas.length}</span></div>
              <div className="chat-media-gallery">
                {midiasCompartilhadas.length ? midiasCompartilhadas.map((media) => (
                  <a href={media.media_url} target="_blank" rel="noreferrer" key={media.id}>
                    {media.media_kind === 'video' ? <video src={media.media_url} muted /> :
                      media.media_kind === 'audio' ? <span className="chat-media-audio-tile">Áudio</span> :
                      <img src={media.media_url} alt="" />}
                  </a>
                )) : <p>Nenhuma mídia compartilhada.</p>}
              </div>
            </section>
          </aside>
        </div>
      ) : null}

      {destinatario ? (
        <button
          ref={petFabRef}
          type="button"
          className={`chat-pet-fab ${petEmDescanso ? 'resting' : ''} ${petPainelAberto ? 'active' : ''} ${petFabArrastando ? 'dragging' : ''}`}
          style={
            petFabPosicao
              ? {
                  left: `${petFabPosicao.x}px`,
                  top: `${petFabPosicao.y}px`,
                  right: 'auto',
                  bottom: 'auto',
                }
              : undefined
          }
          onPointerDown={iniciarArrastePetFab}
          onPointerMove={moverArrastePetFab}
          onPointerUp={finalizarArrastePetFab}
          onPointerCancel={finalizarArrastePetFab}
          onClick={() => {
            if (petFabDragRef.current.moved) {
              petFabDragRef.current.moved = false
              return
            }
            setPetPainelAberto(true)
          }}
          aria-label="Abrir painel do Nexinho"
        >
          <span
            className={`chat-pet-fab-scene pet-color-${petDiario?.color || 'neon'} ${petEmDescanso ? 'resting' : petEmRisco ? 'risk' : 'alive'}`}
            aria-hidden="true"
          >
            {
              <>
                <span className="chat-pet-fab-animal">
                  <span className={`chat-pet-avatar ${petAnimacao} chat-pet-fab-avatar`}>
                    <span className="chat-pet-aura" />
                    <span className="chat-pet-tail" />
                    <span className="chat-pet-ear left" />
                    <span className="chat-pet-ear right" />
                    <span className="chat-pet-body" />
                    <span className="chat-pet-eye left" />
                    <span className="chat-pet-eye right" />
                    <span className="chat-pet-mouth" />
                    <span className="chat-pet-blush left" />
                    <span className="chat-pet-blush right" />
                    <span className="chat-pet-spark one" />
                    <span className="chat-pet-spark two" />
                  </span>
                </span>

                {petEmDescanso ? (
                  <span className="chat-pet-fab-sleep">zZ</span>
                ) : petEmRisco ? (
                  <>
                    <span className="chat-pet-fab-open-grave" />
                    <span className="chat-pet-fab-shovel" />
                  </>
                ) : null}
              </>
            }
          </span>
          {petDiario?.has_pair ? (
            <span className="chat-pet-fab-streak">🔥 {petDiario?.pet_life_days || 0}</span>
          ) : null}
        </button>
      ) : null}

      {quizAberto ? (
        <div className="chat-quiz-overlay" role="dialog" aria-modal="true">
          <div className="chat-quiz-modal">
            <div className="chat-quiz-head">
              <div>
                <p>Desafio em quiz</p>
                <h3>{petDiario?.activity_title || 'Quiz diario'}</h3>
              </div>

              <button
                type="button"
                className="chat-quiz-close"
                onClick={fecharQuiz}
                aria-label="Fechar quiz"
                disabled={quizSubmetendo}
              >
                x
              </button>
            </div>

            {quizCarregando ? (
              <p className="chat-quiz-loading">Montando perguntas...</p>
            ) : null}

            {quizErro ? <div className="alert-box erro-box">{quizErro}</div> : null}

            {!quizCarregando && quizDados ? (
              <div className="chat-quiz-body">
                <p className="chat-quiz-tip">
                  Você pode refazer o quiz do dia quantas vezes precisar.
                </p>

                <div className="chat-quiz-meta">
                  <span>{quizDados.subjectName}</span>
                  <span>
                    Meta: {quizDados.passScorePercent}% ({quizRespondidas}/
                    {quizDados.totalQuestions})
                  </span>
                  <span>Progresso: {quizProgressoPercentual}%</span>
                </div>

                <div className="chat-quiz-progress-track">
                  <span
                    className="chat-quiz-progress-fill"
                    style={{ width: `${quizProgressoPercentual}%` }}
                  />
                </div>

                <div className="chat-quiz-list">
                  {quizDados.questions.map((question, index) => (
                    <section className="chat-quiz-card" key={question.id}>
                      <p className="chat-quiz-question">
                        {index + 1}. {question.prompt}
                      </p>

                      <div className="chat-quiz-options">
                        {question.options.map((option) => {
                          const selecionada = quizRespostas[question.id] === option.id
                          const correcao = quizRevisao.find((item) => item.question_id === question.id)
                          const correta = correcao?.correct_option === option.id
                          const erradaSelecionada = Boolean(correcao) && selecionada && !correta

                          return (
                            <button
                              key={`${question.id}-${option.id}`}
                              type="button"
                              className={`chat-quiz-option ${selecionada ? 'selected' : ''} ${correta ? 'correct' : ''} ${erradaSelecionada ? 'wrong' : ''}`}
                              onClick={() => selecionarRespostaQuiz(question.id, option.id)}
                              disabled={quizSubmetendo}
                            >
                              <span>{option.id}</span>
                              <strong>{option.text}</strong>
                            </button>
                          )
                        })}
                      </div>
                      {quizRevisao.find((item) => item.question_id === question.id) ? (
                        <p className="chat-quiz-explanation">
                          {quizRevisao.find((item) => item.question_id === question.id).is_correct ? 'Resposta correta. ' : `A resposta correta é ${quizRevisao.find((item) => item.question_id === question.id).correct_option}. `}
                          {quizRevisao.find((item) => item.question_id === question.id).explanation}
                        </p>
                      ) : null}
                    </section>
                  ))}
                </div>

                {quizResumoResultado ? (
                  <div className={`chat-quiz-result-card ${quizResumoResultado.passou ? 'ok' : 'fail'}`}>
                    <p className={`chat-quiz-score ${quizResumoResultado.passou ? 'ok' : 'fail'}`}>
                      Resultado: {quizResumoResultado.acertos}/{quizResumoResultado.total}
                    </p>
                    <p className="chat-quiz-result-loss">
                      Perdeu {quizResumoResultado.erros} questao(oes).
                    </p>
                    <p className="chat-quiz-result-reason">
                      Motivo: {quizResumoResultado.motivo}
                    </p>
                  </div>
                ) : null}

                <button
                  type="button"
                  className="chat-pet-action chat-quiz-submit"
                  onClick={enviarQuizDesafioPet}
                  disabled={!quizTodasRespondidas || quizSubmetendo}
                >
                  {quizSubmetendo ? 'Corrigindo quiz...' : 'Enviar respostas'}
                </button>

                {quizResultado && !quizResultado.passed ? (
                  <button
                    type="button"
                    className="chat-quiz-reload-btn"
                    onClick={abrirQuizDesafioPet}
                    disabled={quizCarregando || quizSubmetendo}
                  >
                    Tentar outro quiz agora
                  </button>
                ) : null}
                {quizResultado?.passed ? (
                  <button type="button" className="chat-quiz-reload-btn" onClick={fecharQuiz}>
                    Concluir e voltar ao chat
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {petNascimentoAberto ? (
        <div className="nexinho-birth-overlay" role="dialog" aria-modal="true">
          <div className="nexinho-birth-card">
            <div className="nexinho-birth-light" />
            <div className="nexinho-birth-egg"><span>✦</span></div>
            <div className="nexinho-birth-pet">
              <span className="chat-pet-avatar happy">
                <span className="chat-pet-aura" />
                <span className="chat-pet-tail" />
                <span className="chat-pet-ear left" />
                <span className="chat-pet-ear right" />
                <span className="chat-pet-body" />
                <span className="chat-pet-eye left" />
                <span className="chat-pet-eye right" />
                <span className="chat-pet-mouth" />
                <span className="chat-pet-blush left" />
                <span className="chat-pet-blush right" />
              </span>
            </div>
            <h2>O Nexinho de vocês nasceu!</h2>
            <p>Agora cuidem dele juntos.</p>
            <button type="button" onClick={() => {
              setPetNascimentoAberto(false)
              if (conversa?.id) navigate(`/nexinho/${conversa.id}`)
            }}>
              Escolher aparência e quarto
            </button>
          </div>
        </div>
      ) : null}

      <div className="chat-composer-shell">
        {chatBloqueado ? (
          <div className="chat-composer-blocked" role="status">
            <strong>Chat bloqueado</strong>
            <p>
              {bloqueadoPorMim
                ? 'Desbloqueie este perfil para voltar a enviar e receber mensagens.'
                : 'Este perfil bloqueou vocÃª. Mensagens e audio foram desativados.'}
            </p>
          </div>
        ) : null}

        {!chatBloqueado ? (
          <>
            {previewMidia ? (
              <div className="chat-media-preview-card">
                {arquivoMidia?.type?.startsWith('video/') ? (
                  <video
                    src={previewMidia}
                    className="chat-media-preview"
                    controls
                    playsInline
                  />
                ) : arquivoMidia?.type?.startsWith('audio/') ? (
                  <ChatAudioPlayer src={previewMidia} ariaLabel="Preview de audio" />
                ) : (
                  <img
                    src={previewMidia}
                    alt="Preview da midia selecionada"
                    className="chat-media-preview"
                  />
                )}

                <button
                  type="button"
                  className="chat-media-preview-remove"
                  onClick={limparMidiaSelecionada}
                  aria-label="Remover midia"
                >
                  x
                </button>
              </div>
            ) : null}

            <div className="chat-composer">
              <input
                ref={inputMidiaRef}
                type="file"
                accept="image/*,video/*"
                onChange={selecionarMidia}
                style={{ display: 'none' }}
              />

              <button
                type="button"
                className="btn chat-attach-btn chat-attach-camera-btn"
                onClick={abrirCameraChat}
                aria-label="Abrir camera para foto"
                disabled={gravandoAudio || processandoAudio}
              >
                <IconeCamera />
              </button>

              <button
                type="button"
                className="btn chat-attach-btn"
                onClick={() => inputMidiaRef.current?.click()}
                aria-label="Enviar foto ou video"
                disabled={gravandoAudio || processandoAudio}
              >
                <IconeMidia />
              </button>

              <button
                type="button"
                className={`btn chat-attach-btn chat-attach-audio-btn ${
                  gravandoAudio ? 'is-recording' : ''
                }`}
                onClick={() => {
                  if (gravandoAudio) {
                    pararGravacaoAudio()
                    return
                  }
                  void iniciarGravacaoAudio()
                }}
                aria-label={
                  gravandoAudio
                    ? 'Parar gravacao de audio'
                    : 'Gravar audio ao vivo'
                }
                disabled={processandoAudio || enviando}
              >
                {gravandoAudio ? <IconePararGravacao /> : <IconeAudio />}
              </button>

              {gravandoAudio ? (
                <span className="chat-recording-indicator">Gravando...</span>
              ) : processandoAudio ? (
                <span className="chat-recording-indicator">Processando audio...</span>
              ) : null}

              <input
                className="input chat-composer-input"
                type="text"
                placeholder={`Mensagem para ${destinatario?.nome || 'este perfil'}...`}
                value={texto}
                maxLength={500}
                onChange={(event) => {
                  const valor = event.target.value
                  setTexto(valor)
                  controlarDigitacao(valor)
                }}
                onBlur={() => {
                  void enviarEventoDigitando(false)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    enviarMensagem()
                  }
                }}
              />

              <button
                type="button"
                className="btn chat-send-btn"
                onClick={enviarMensagem}
                disabled={(!texto.trim() && !arquivoMidia) || enviando || gravandoAudio || processandoAudio}
                aria-label={enviando ? 'Enviando mensagem' : 'Enviar mensagem'}
              >
                <IconeEnviar />
              </button>
            </div>
          </>
        ) : null}
      </div>

      <InstantCameraSheet
        open={cameraChatAberta}
        onClose={() => setCameraChatAberta(false)}
        onCapture={aplicarMidiaSelecionada}
        onOpenGallery={() => inputMidiaRef.current?.click()}
        title="Enviar foto"
        subtitle="Capture e envie na hora"
      />

      <BottomNav />
    </div>
  )
}

