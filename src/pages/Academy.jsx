import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import { COURSE_OPTIONS, nomeCurso, traduzirErroAcademia } from '../lib/academy'
import { criarNotificacaoSePermitido } from '../lib/notificationPreferences'
import { SCHOOL_CITY_OPTIONS, getCityKeyFromSchoolName, listSchoolsByCity } from '../lib/schoolsCatalog'
import { supabase } from '../lib/supabase'

const QUIZ_ADMIN_UNLOCK_TAPS = 7

const QUIZ_SUBJECT_OPTIONS = [
  { value: 'portugues', label: 'Português' },
  { value: 'matematica', label: 'Matemática' },
  { value: 'ingles', label: 'Inglês' },
  { value: 'quimica', label: 'Química' },
  { value: 'informatica', label: 'Informática' },
]

const XP_TRADE_OPTIONS = [
  { xp: 800, pontos: 0.2, etiqueta: 'Básico' },
  { xp: 1800, pontos: 0.5, etiqueta: 'Intermediário' },
  { xp: 3200, pontos: 1.0, etiqueta: 'Avançado' },
]

function pacoteTrocaPorXp(valorXp) {
  const xp = Number(valorXp || 0)
  return XP_TRADE_OPTIONS.find((item) => item.xp === xp) || null
}

function formatarPontosTroca(valor) {
  const numero = Number(valor || 0)
  if (numero === 1) return '1 ponto'
  return `${numero.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ponto`
}
function formularioQuizInicial() {
  return {
    subject_name: 'portugues',
    challenge_scope: 'base',
    course_area: 'informatica',
    prompt: '',
    option_a: '',
    option_b: '',
    option_c: '',
    option_d: '',
    correct_option: 'A',
    explanation: '',
    difficulty: 1,
    is_active: true,
  }
}

function formatarDataHora(dataIso) {
  if (!dataIso) return '-'

  return new Date(dataIso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function corStatusTroca(status) {
  if (status === 'approved') return 'ok'
  if (status === 'rejected') return 'erro'
  return 'pendente'
}

function textoStatusTroca(status) {
  if (status === 'approved') return 'Aprovada'
  if (status === 'rejected') return 'Recusada'
  return 'Pendente'
}

export default function Academy() {
  const [perfil, setPerfil] = useState(null)
  const [xpHistorico, setXpHistorico] = useState([])
  const [trocas, setTrocas] = useState([])
  const [municipioEscola, setMunicipioEscola] = useState('')
  const [escola, setEscola] = useState('')
  const [materia, setMateria] = useState('')
  const [professorSelecionadoId, setProfessorSelecionadoId] = useState('')
  const [professoresMateria, setProfessoresMateria] = useState([])
  const [buscandoProfessoresMateria, setBuscandoProfessoresMateria] = useState(false)
  const [xpTroca, setXpTroca] = useState(XP_TRADE_OPTIONS[0].xp)
  const [carregando, setCarregando] = useState(true)
  const [processandoTroca, setProcessandoTroca] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')
  const [profBuscaAluno, setProfBuscaAluno] = useState('')
  const [profAlunos, setProfAlunos] = useState([])
  const [profBuscandoAlunos, setProfBuscandoAlunos] = useState(false)
  const [profAlunoSelecionado, setProfAlunoSelecionado] = useState(null)
  const [profXpDelta, setProfXpDelta] = useState(10)
  const [profMateria, setProfMateria] = useState('')
  const [profMotivo, setProfMotivo] = useState('')
  const [profProcessandoXp, setProfProcessandoXp] = useState(false)
  const [profTrocasPendentes, setProfTrocasPendentes] = useState([])
  const [profCarregandoTrocas, setProfCarregandoTrocas] = useState(false)
  const [profRevisandoTrocaId, setProfRevisandoTrocaId] = useState('')
  const [profNotaTroca, setProfNotaTroca] = useState('')
  const [toquesAdminQuiz, setToquesAdminQuiz] = useState(0)
  const [adminQuizLiberado, setAdminQuizLiberado] = useState(false)
  const [adminQuizAberto, setAdminQuizAberto] = useState(false)
  const [adminQuizVerificando, setAdminQuizVerificando] = useState(false)
  const [adminQuizCriando, setAdminQuizCriando] = useState(false)
  const [adminQuizMudandoStatus, setAdminQuizMudandoStatus] = useState(false)
  const [adminPainelAba, setAdminPainelAba] = useState('quiz')
  const [adminQuizResumo, setAdminQuizResumo] = useState(null)
  const [adminQuizStatusId, setAdminQuizStatusId] = useState('')
  const [adminQuizStatusAtivo, setAdminQuizStatusAtivo] = useState(false)
  const [adminQuizForm, setAdminQuizForm] = useState(() => formularioQuizInicial())
  const [adminBuscaPerfil, setAdminBuscaPerfil] = useState('')
  const [adminBuscaResultados, setAdminBuscaResultados] = useState([])
  const [adminBuscandoPerfis, setAdminBuscandoPerfis] = useState(false)
  const [adminPerfilSelecionado, setAdminPerfilSelecionado] = useState(null)
  const [adminDeltaXp, setAdminDeltaXp] = useState(10)
  const [adminMotivoXp, setAdminMotivoXp] = useState('')
  const [adminAjustandoXp, setAdminAjustandoXp] = useState(false)

  const navigate = useNavigate()

  useEffect(() => {
    iniciar()
  }, [])

  useEffect(() => {
    if (!municipioEscola || !escola.trim() || !materia.trim()) {
      setProfessoresMateria([])
      setProfessorSelecionadoId('')
      return undefined
    }

    const timer = window.setTimeout(() => {
      void buscarProfessoresDaMateria(materia, escola, municipioEscola, false)
    }, 450)

    return () => window.clearTimeout(timer)
  }, [municipioEscola, escola, materia])

  const perfilEhProfessor = ['teacher', 'professor', 'admin'].includes(
    `${perfil?.role || ''}`.toLowerCase()
  )
  const escolasDoMunicipio = useMemo(
    () => (municipioEscola ? listSchoolsByCity(municipioEscola) : []),
    [municipioEscola]
  )
  const professorSelecionado = useMemo(
    () => professoresMateria.find((item) => item.id === professorSelecionadoId) || null,
    [professoresMateria, professorSelecionadoId]
  )
  const materiaEfetivaTroca = `${materia.trim() || professorSelecionado?.teacher_subject || ''}`.trim()
  const pacoteTrocaSelecionado = pacoteTrocaPorXp(xpTroca)
  const saldoXpAtual = Number(perfil?.xp_total || 0)
  const saldoAposTroca = Math.max(0, saldoXpAtual - Number(xpTroca || 0))
  const trocaComSaldoInsuficiente = saldoXpAtual < Number(xpTroca || 0)
  const xpFaltanteTroca = Math.max(0, Number(xpTroca || 0) - saldoXpAtual)
  const etapaTrocaAtual = professorSelecionadoId
    ? 4
    : materia.trim()
      ? 3
      : escola.trim()
        ? 2
        : municipioEscola
          ? 1
          : 0
  const trocaFormularioPronto = Boolean(
    municipioEscola &&
      escola.trim() &&
      materiaEfetivaTroca &&
      professorSelecionadoId &&
      professorSelecionado?.vinculoAtivo &&
      pacoteTrocaSelecionado &&
      !trocaComSaldoInsuficiente
  )

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
        .select('*')
        .eq('account_id', user.id)
        .single()

      if (perfilError) throw perfilError

      setPerfil(perfilData)
      setProfMateria(`${perfilData?.teacher_subject || ''}`)
      const escolaPerfil = `${perfilData?.institution_name || perfilData?.teacher_school || ''}`
      const cidadePerfil = getCityKeyFromSchoolName(escolaPerfil)
      setEscola(escolaPerfil)
      setMunicipioEscola(cidadePerfil || '')
      await carregarPainel(perfilData.id)
      await buscarProfessoresDaMateria('', escolaPerfil, cidadePerfil || '', false)

      if (['teacher', 'professor', 'admin'].includes(`${perfilData?.role || ''}`.toLowerCase())) {
        await carregarTrocasPendentesProfessor(true)
      }
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível carregar a Academia agora.'))
    } finally {
      setCarregando(false)
    }
  }

  async function carregarTrocasPendentesProfessor(forceTeacher = false) {
    const isTeacher =
      forceTeacher || ['teacher', 'professor', 'admin'].includes(`${perfil?.role || ''}`.toLowerCase())

    if (!isTeacher) return

    setProfCarregandoTrocas(true)
    try {
      const { data, error } = await supabase.rpc('academy_teacher_pending_redemptions', {
        p_limit: 40,
      })

      if (error) throw error
      setProfTrocasPendentes(Array.isArray(data) ? data : [])
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível carregar trocas pendentes do professor.'))
    } finally {
      setProfCarregandoTrocas(false)
    }
  }

  async function carregarPainel(profileId) {
    const [historicoResp, trocasResp] = await Promise.all([
      supabase
        .from('xp_ledger')
        .select('id, delta_xp, reason, source_type, created_at')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase
        .from('unit_grade_redemptions')
        .select('id, unit_code, subject_name, xp_spent, grade_points, status, created_at')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    if (historicoResp.error) throw historicoResp.error
    if (trocasResp.error) throw trocasResp.error

    setXpHistorico(historicoResp.data || [])
    setTrocas(trocasResp.data || [])
  }

  async function buscarProfessoresDaMateria(
    materiaBase = materia,
    escolaBase = escola,
    municipioBase = municipioEscola,
    mostrarFeedback = true
  ) {
    const termoMateria = `${materiaBase || ''}`.trim().toLowerCase()
    const termoEscola = `${escolaBase || ''}`.trim().toLowerCase()
    const chaveMunicipio = `${municipioBase || ''}`.trim()
    const escolasDoFiltro = chaveMunicipio
      ? listSchoolsByCity(chaveMunicipio)
          .map((item) => `${item?.name || ''}`.trim().toLowerCase())
          .filter(Boolean)
      : []
    const escolasDoFiltroSet = new Set(escolasDoFiltro)

    const escolaBateMunicipio = (nomeEscola) => {
      if (!chaveMunicipio) return true
      const escolaNormalizada = `${nomeEscola || ''}`.trim().toLowerCase()
      if (!escolaNormalizada) return false
      return escolasDoFiltroSet.has(escolaNormalizada)
    }

    setErro('')
    setBuscandoProfessoresMateria(true)

    try {
      let lista = []

      const rpcResp = await supabase.rpc('academy_list_teachers_for_selector', {
        p_school: termoEscola || null,
        p_subject: termoMateria || null,
        p_limit: 200,
      })

      if (!rpcResp.error && Array.isArray(rpcResp.data)) {
        lista = rpcResp.data.map((item) => ({
          id: item?.profile_id,
          nome: item?.nome,
          username: item?.username,
          teacher_subject: item?.teacher_subject,
          teacher_school: item?.teacher_school,
          institution_name: item?.teacher_school,
          role: 'teacher',
        }))
        lista = lista.filter((item) => item?.id)
      } else {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, nome, username, role, teacher_subject, teacher_school, institution_name')
          .order('nome', { ascending: true })
          .limit(200)

        if (error) throw error

        lista = (data || []).filter((item) =>
          ['teacher', 'professor', 'admin'].includes(`${item?.role || ''}`.toLowerCase())
        )
      }

      lista = lista.filter((item) => {
        const escolaProfessor = `${item?.teacher_school || item?.institution_name || ''}`
        const escolaProfessorNormalizada = escolaProfessor.toLowerCase()
        const materiaProfessor = `${item?.teacher_subject || ''}`.toLowerCase()
        const bateEscola = !termoEscola || escolaProfessorNormalizada.includes(termoEscola)
        const bateMateria = !termoMateria || materiaProfessor.includes(termoMateria)
        const bateMunicipio = escolaBateMunicipio(escolaProfessor)
        return bateEscola && bateMateria && bateMunicipio
      })

      if (perfil?.id && lista.length > 0) {
        const vinculos = await Promise.all(
          lista.map(async (professor) => {
            const { data, error } = await supabase.rpc('academy_has_teacher_link', {
              p_teacher_profile_id: professor.id,
            })
            return [professor.id, !error && data === true]
          })
        )
        const vinculosPorProfessor = new Map(vinculos)
        lista = lista.map((professor) => ({
          ...professor,
          vinculoAtivo: vinculosPorProfessor.get(professor.id) === true,
        }))
      }

      setProfessoresMateria(lista)
      if (!lista.some((item) => item.id === professorSelecionadoId)) {
        setProfessorSelecionadoId('')
      }

      if (mostrarFeedback) {
        if (lista.length === 0) {
          setSucesso('Nenhum professor encontrado para os filtros de escola/materia.')
        } else {
          setSucesso(`${lista.length} professor(es) encontrado(s).`)
        }
      }
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível buscar professores agora.'))
    } finally {
      setBuscandoProfessoresMateria(false)
    }
  }

  async function buscarAlunosProfessor(event) {
    event.preventDefault()

    if (!perfilEhProfessor || profBuscandoAlunos) return

    const termo = profBuscaAluno.trim()
    if (termo.length < 2) {
      setErro('Digite pelo menos 2 caracteres para buscar aluno.')
      return
    }

    setErro('')
    setSucesso('')
    setProfBuscandoAlunos(true)

    try {
      const { data, error } = await supabase.rpc('academy_teacher_search_students', {
        p_query: termo,
        p_limit: 16,
      })

      if (error) throw error

      const lista = Array.isArray(data) ? data : []
      setProfAlunos(lista)

      if (lista.length === 0) {
        setSucesso('Nenhum aluno encontrado para essa busca.')
      } else {
        setSucesso(`${lista.length} aluno(s) encontrado(s).`)
      }
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível buscar alunos agora.'))
    } finally {
      setProfBuscandoAlunos(false)
    }
  }

  function selecionarAlunoProfessor(aluno) {
    setProfAlunoSelecionado(aluno)
    setErro('')
    setSucesso(`Aluno selecionado: @${aluno?.username || 'aluno'}`)
  }

  async function lancarXpProfessor(event) {
    event.preventDefault()

    if (!perfilEhProfessor || profProcessandoXp) return
    if (!profAlunoSelecionado?.profile_id) {
      setErro('Selecione um aluno antes de lancar XP.')
      return
    }

    const delta = Number(profXpDelta)
    const materiaLimpa = `${profMateria || perfil?.teacher_subject || ''}`.trim()
    const motivoLimpo = profMotivo.trim()

    if (!delta || delta <= 0) {
      setErro('Informe um valor de XP maior que zero.')
      return
    }

    if (!materiaLimpa) {
      setErro('Informe a materia para o lancamento de XP.')
      return
    }

    setErro('')
    setSucesso('')
    setProfProcessandoXp(true)

    try {
      const { data, error } = await supabase.rpc('academy_teacher_grant_xp', {
        p_student_profile_id: profAlunoSelecionado.profile_id,
        p_xp_delta: delta,
        p_subject_name: materiaLimpa,
        p_reason: motivoLimpo || null,
      })

      if (error) throw error

      const resposta = Array.isArray(data) ? data[0] : data

      await criarNotificacaoSePermitido({
        receiverProfileId: profAlunoSelecionado.profile_id,
        actorProfileId: perfil?.id || null,
        type: 'xp_adjustment',
        metadata: {
          kind: 'xp_adjustment',
          source: 'teacher',
          subject_name: materiaLimpa,
          reason:
            resposta?.reason ||
            motivoLimpo ||
            `XP liberado por atividade de ${materiaLimpa}.`,
        },
        xpDelta: Number(resposta?.delta_xp || delta),
        xpReason:
          resposta?.reason ||
          motivoLimpo ||
          `XP liberado por atividade de ${materiaLimpa}.`,
      })

      setProfAlunoSelecionado((anterior) =>
        anterior
          ? {
              ...anterior,
              xp_total: resposta?.xp_total ?? anterior.xp_total,
              level: resposta?.level ?? anterior.level,
            }
          : anterior
      )

      setProfMotivo('')
      setSucesso(
        `XP enviado para @${resposta?.student_username || profAlunoSelecionado?.username || 'aluno'} com sucesso.`
      )
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível lançar XP agora.'))
    } finally {
      setProfProcessandoXp(false)
    }
  }

  async function revisarTrocaProfessor(troca, aprovar) {
    if (!troca?.redemption_id || profRevisandoTrocaId) return

    setErro('')
    setSucesso('')
    setProfRevisandoTrocaId(troca.redemption_id)

    try {
      const { data, error } = await supabase.rpc('academy_teacher_review_redemption', {
        p_redemption_id: troca.redemption_id,
        p_approve: aprovar,
        p_reviewer_note: profNotaTroca.trim() || null,
      })

      if (error) throw error

      const resposta = Array.isArray(data) ? data[0] : data

      setSucesso(
        aprovar
          ? `Troca aprovada para @${resposta?.student_username || troca.student_username || 'aluno'}.`
          : `Troca recusada para @${resposta?.student_username || troca.student_username || 'aluno'} (XP estornado).`
      )

      setProfNotaTroca('')
      await carregarTrocasPendentesProfessor(true)
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível revisar essa troca agora.'))
    } finally {
      setProfRevisandoTrocaId('')
    }
  }

  function selecionarMunicipioTroca(chaveCidade) {
    setMunicipioEscola(chaveCidade)
    setEscola('')
    setProfessorSelecionadoId('')
    setProfessoresMateria([])
  }

  function selecionarEscolaTroca(nomeEscola) {
    setEscola(nomeEscola)
    setProfessorSelecionadoId('')
  }

  async function solicitarTroca(event) {
    event.preventDefault()

    if (!perfil || processandoTroca) return

    const escolaLimpa = escola.trim()
    const materiaLimpa = materiaEfetivaTroca
    const xp = Number(xpTroca)

    setErro('')
    setSucesso('')

    if (!municipioEscola) {
      setErro('Selecione o município para filtrar os professores.')
      return
    }

    if (!escolaLimpa) {
      setErro('Informe a escola para trocar XP.')
      return
    }

    if (!materiaLimpa) {
      setErro('Informe a materia da troca.')
      return
    }

    if (!pacoteTrocaSelecionado) {
      setErro('Escolha um pacote de XP valido para a troca.')
      return
    }

    if (!xp || xp <= 0) {
      setErro('Informe um valor de XP valido.')
      return
    }

    if (trocaComSaldoInsuficiente) {
      setErro('XP insuficiente para esse pacote de troca.')
      return
    }

    if (!professorSelecionadoId) {
      setErro('Escolha o professor da materia antes de solicitar a troca.')
      return
    }


    if (!professorSelecionado?.vinculoAtivo) {
      setErro('Para trocar XP, você precisa estar aprovado em uma turma desse professor.')
      return
    }

    setProcessandoTroca(true)

    try {
      const { data, error } = await supabase.rpc('request_unit_redemption_with_teacher', {
        p_unit_code: escolaLimpa,
        p_subject_name: materiaLimpa,
        p_xp_spent: xp,
        p_teacher_profile_id: professorSelecionadoId,
      })

      if (error) throw error

      const resposta = Array.isArray(data) ? data[0] : data

      if (resposta?.xp_total !== undefined || resposta?.level !== undefined) {
        setPerfil((prev) =>
          prev
            ? {
                ...prev,
                xp_total: resposta?.xp_total ?? prev.xp_total,
                level: resposta?.level ?? prev.level,
              }
            : prev
        )
      }

      setSucesso('Troca enviada para o professor da materia.')
      setProfessorSelecionadoId('')
      setXpTroca(XP_TRADE_OPTIONS[0].xp)
      await carregarPainel(perfil.id)
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível solicitar a troca agora.'))
    } finally {
      setProcessandoTroca(false)
    }
  }

  function atualizarCampoQuiz(campo, valor) {
    setAdminQuizForm((anterior) => ({
      ...anterior,
      [campo]: valor,
    }))
  }

  async function abrirPainelAdminQuiz() {
    if (adminQuizVerificando) return

    setErro('')
    setSucesso('')
    setAdminQuizVerificando(true)

    try {
      const { data, error } = await supabase.rpc('academy_admin_can_manage_quiz')
      if (error) throw error

      const permitido =
        typeof data === 'boolean'
          ? data
          : Array.isArray(data)
          ? Boolean(data[0])
          : Boolean(data?.academy_admin_can_manage_quiz ?? data)

      if (!permitido) {
      setErro('Seu perfil não tem permissão para o painel administrativo de quizzes.')
        return
      }

      setAdminQuizLiberado(true)
      setAdminQuizAberto(true)
      setAdminPainelAba('quiz')
      setAdminBuscaPerfil('')
      setAdminBuscaResultados([])
      setAdminPerfilSelecionado(null)
      setAdminMotivoXp('')
      setAdminDeltaXp(10)
      setSucesso('Painel admin de quiz liberado.')
      await carregarResumoAdminQuiz()
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível abrir o painel administrativo de quizzes agora.'))
    } finally {
      setAdminQuizVerificando(false)
    }
  }

  function tocarTituloAcademia() {
    if (adminQuizLiberado) {
      setAdminQuizAberto((anterior) => !anterior)
      return
    }

    const proximoTotal = toquesAdminQuiz + 1
    if (proximoTotal < QUIZ_ADMIN_UNLOCK_TAPS) {
      setToquesAdminQuiz(proximoTotal)
      return
    }

    setToquesAdminQuiz(0)
    void abrirPainelAdminQuiz()
  }

  async function carregarResumoAdminQuiz() {
    try {
      const { data, error } = await supabase.rpc('academy_admin_quiz_summary')
      if (error) throw error

      const bruto = Array.isArray(data) ? data[0] : data
      const porMateria = Array.isArray(bruto?.by_subject)
        ? bruto.by_subject.map((item) => ({
            subject: item?.subject || 'desconhecida',
            total: Number(item?.total || 0),
            active: Number(item?.active || 0),
          }))
        : []

      setAdminQuizResumo({
        total_questions: Number(bruto?.total_questions || 0),
        active_questions: Number(bruto?.active_questions || 0),
        inactive_questions: Number(bruto?.inactive_questions || 0),
        by_subject: porMateria,
      })
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível atualizar o resumo de quizzes.'))
    }
  }

  async function criarQuestaoQuiz(event) {
    event.preventDefault()

    if (!adminQuizLiberado || adminQuizCriando) return

    const prompt = adminQuizForm.prompt.trim()
    const optionA = adminQuizForm.option_a.trim()
    const optionB = adminQuizForm.option_b.trim()
    const optionC = adminQuizForm.option_c.trim()
    const optionD = adminQuizForm.option_d.trim()
    const explanation = adminQuizForm.explanation.trim()
    const scope = adminQuizForm.challenge_scope
    const subject = adminQuizForm.subject_name
    const courseArea = adminQuizForm.course_area.trim()
    const difficulty = Number(adminQuizForm.difficulty || 1)

    setErro('')
    setSucesso('')

    if (!prompt || !optionA || !optionB || !optionC || !optionD) {
      setErro('Preencha enunciado e todas as quatro opcoes.')
      return
    }

    const opcoesNormalizadas = [optionA, optionB, optionC, optionD].map((valor) =>
      valor.toLowerCase()
    )

    if (new Set(opcoesNormalizadas).size < 4) {
      setErro('As quatro opcoes precisam ser diferentes entre si.')
      return
    }

    if (scope === 'course' && !courseArea) {
      setErro('Informe a área do curso para questões do escopo do curso.')
      return
    }

    setAdminQuizCriando(true)

    try {
      const { data, error } = await supabase.rpc('academy_admin_create_quiz_question', {
        p_subject_name: subject,
        p_challenge_scope: scope,
        p_course_area: scope === 'course' ? courseArea : null,
        p_prompt: prompt,
        p_option_a: optionA,
        p_option_b: optionB,
        p_option_c: optionC,
        p_option_d: optionD,
        p_correct_option: adminQuizForm.correct_option,
        p_explanation: explanation || null,
        p_difficulty: difficulty,
        p_is_active: Boolean(adminQuizForm.is_active),
      })

      if (error) throw error

      const resposta = Array.isArray(data) ? data[0] : data
      setSucesso(`Questao criada com sucesso. ID: ${resposta?.question_id || '-'}`)
      setAdminQuizForm(formularioQuizInicial())
      await carregarResumoAdminQuiz()
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível criar a questão do quiz agora.'))
    } finally {
      setAdminQuizCriando(false)
    }
  }

  async function buscarPerfisAdmin(event) {
    event.preventDefault()

    if (!adminQuizLiberado || adminBuscandoPerfis) return

    const termo = adminBuscaPerfil.trim()
    setErro('')
    setSucesso('')

    if (termo.length < 2) {
      setErro('Digite pelo menos 2 caracteres para buscar perfil.')
      return
    }

    setAdminBuscandoPerfis(true)

    try {
      const { data, error } = await supabase.rpc('academy_admin_search_profiles', {
        p_query: termo,
        p_limit: 12,
      })

      if (error) throw error

      const lista = Array.isArray(data) ? data : []
      setAdminBuscaResultados(lista)

      if (lista.length === 0) {
        setSucesso('Nenhum perfil encontrado para esta busca.')
      } else {
        setSucesso(`${lista.length} perfil(is) encontrado(s).`)
      }
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível buscar perfis agora.'))
    } finally {
      setAdminBuscandoPerfis(false)
    }
  }

  function selecionarPerfilAdmin(perfilItem) {
    setAdminPerfilSelecionado(perfilItem)
    setSucesso(`Perfil selecionado: @${perfilItem?.username || 'usuario'}`)
    setErro('')
  }

  async function ajustarXpPerfilAdmin(event) {
    event.preventDefault()

    if (!adminQuizLiberado || adminAjustandoXp || !adminPerfilSelecionado?.profile_id) return

    const delta = Number(adminDeltaXp)
    const motivo = adminMotivoXp.trim()

    setErro('')
    setSucesso('')

    if (!delta || Number.isNaN(delta)) {
      setErro('Informe um valor de XP diferente de zero.')
      return
    }

    if (!motivo) {
      setErro('Informe um motivo para registrar no histórico.')
      return
    }

    setAdminAjustandoXp(true)

    try {
      const { data, error } = await supabase.rpc('academy_admin_adjust_profile_xp', {
        p_target_profile_id: adminPerfilSelecionado.profile_id,
        p_delta_xp: delta,
        p_reason: motivo,
      })

      if (error) throw error

      const resposta = Array.isArray(data) ? data[0] : data

      setAdminPerfilSelecionado((anterior) =>
        anterior
          ? {
              ...anterior,
              xp_total: resposta?.xp_total ?? anterior.xp_total,
              level: resposta?.level ?? anterior.level,
            }
          : anterior
      )

      setAdminMotivoXp('')
      setSucesso(
        `XP atualizado para @${resposta?.username || adminPerfilSelecionado.username}: ${resposta?.xp_total ?? '-'} XP.`
      )
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível ajustar o XP agora.'))
    } finally {
      setAdminAjustandoXp(false)
    }
  }

  async function atualizarStatusQuestaoQuiz(event) {
    event.preventDefault()

    if (!adminQuizLiberado || adminQuizMudandoStatus) return

    const questionId = adminQuizStatusId.trim()
    setErro('')
    setSucesso('')

    if (!questionId) {
      setErro('Informe o ID da questao para alterar o status.')
      return
    }

    setAdminQuizMudandoStatus(true)

    try {
      const { data, error } = await supabase.rpc('academy_admin_set_quiz_question_active', {
        p_question_id: questionId,
        p_is_active: adminQuizStatusAtivo,
      })

      if (error) throw error

      const resposta = Array.isArray(data) ? data[0] : data
      setSucesso(
        `Status atualizado: ${resposta?.question_id || questionId} -> ${
          resposta?.is_active ? 'ativa' : 'inativa'
        }.`
      )
      setAdminQuizStatusId('')
      await carregarResumoAdminQuiz()
    } catch (error) {
      setErro(traduzirErroAcademia(error, 'Não foi possível alterar o status desta questão agora.'))
    } finally {
      setAdminQuizMudandoStatus(false)
    }
  }

  if (carregando) {
    return <SocialLoader variant="profile" showBottomNav />
  }

  return (
    <div className="container">
      <div className="topbar academy-topbar">
        <button
          type="button"
          className="edit-back-btn"
          onClick={() => navigate('/perfil')}
        >
          Voltar
        </button>

        <h1
          className="academy-admin-trigger"
          role="button"
          tabIndex={0}
          onClick={tocarTituloAcademia}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              tocarTituloAcademia()
            }
          }}
        >
          Academia
        </h1>

        <button
          type="button"
          className="edit-save-link"
          onClick={() => {
            if (perfil?.id) {
              carregarPainel(perfil.id)
            }

            if (perfilEhProfessor) {
              carregarTrocasPendentesProfessor(true)
            }

            if (adminQuizLiberado) {
              carregarResumoAdminQuiz()
            }
          }}
        >
          Atualizar
        </button>
      </div>

      <div className="page academy-page">
        {erro ? <div className="alert-box erro-box">{erro}</div> : null}
        {sucesso ? <div className="alert-box ok-box">{sucesso}</div> : null}

        <section className="academy-summary-card">
          <div>
            <p className="academy-kicker">Seu progresso</p>
            <h2>{perfil?.nome || 'Aluno'}</h2>
            <p className="academy-course">
              {perfilEhProfessor
      ? `Professor(a) de ${perfil?.teacher_subject || 'matéria não definida'}`
                : nomeCurso(perfil?.course_area)}
            </p>
          </div>

          <div className="academy-points-grid">
            <div>
              <strong>{perfil?.level || 1}</strong>
              <span>Nivel</span>
            </div>
            <div>
              <strong>{perfil?.xp_total || 0}</strong>
              <span>XP</span>
            </div>
          </div>
        </section>

        {perfilEhProfessor ? (
          <section className="academy-block academy-teacher-panel">
            <div className="academy-block-head">
              <h3>Painel do Professor</h3>
              <span>{perfil?.teacher_subject || 'Materia'}</span>
            </div>

            <p>
              Aqui voce busca alunos, lanca XP por atividade e revisa trocas de XP da sua materia.
            </p>

            <form className="academy-redeem-form academy-admin-form" onSubmit={buscarAlunosProfessor}>
              <h4>Buscar aluno</h4>

              <div className="academy-admin-search-row">
                <input
                  className="edit-input"
                  type="text"
                  placeholder="Nome ou @username"
                  value={profBuscaAluno}
                  onChange={(event) => setProfBuscaAluno(event.target.value)}
                />

                <button className="academy-admin-btn" type="submit" disabled={profBuscandoAlunos}>
                  {profBuscandoAlunos ? 'Buscando...' : 'Buscar'}
                </button>
              </div>

              {profAlunos.length > 0 ? (
                <div className="academy-admin-results">
                  {profAlunos.map((aluno) => {
                    const alunoId = aluno?.profile_id || aluno?.id
                    const selecionado = (profAlunoSelecionado?.profile_id || profAlunoSelecionado?.id) === alunoId
                    return (
                      <button
                        key={alunoId}
                        type="button"
                        className={`academy-admin-result-card ${selecionado ? 'selected' : ''}`}
                        onClick={() => selecionarAlunoProfessor(aluno)}
                      >
                        <strong>@{aluno?.username || 'aluno'}</strong>
                        <span>{aluno?.nome || 'Aluno'}</span>
                        <small>
                  XP {aluno?.xp_total || 0} • Nível {aluno?.level || 1}
                        </small>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </form>

            {profAlunoSelecionado ? (
              <form className="academy-redeem-form academy-admin-form" onSubmit={lancarXpProfessor}>
                <h4>Lancar XP por atividade</h4>

                <div className="academy-admin-target-card">
                  <strong>@{profAlunoSelecionado?.username || 'aluno'}</strong>
                  <span>{profAlunoSelecionado?.nome || 'Aluno'}</span>
                  <small>
                  XP atual: {profAlunoSelecionado?.xp_total || 0} • Nível:{' '}
                    {profAlunoSelecionado?.level || 1}
                  </small>
                </div>

                <input
                  className="edit-input"
                  type="text"
                  placeholder="Materia"
                  value={profMateria}
                  onChange={(event) => setProfMateria(event.target.value)}
                />

                <input
                  className="edit-input"
                  type="number"
                  min="1"
                  max="5000"
                  value={profXpDelta}
                  onChange={(event) => setProfXpDelta(Number(event.target.value))}
                />

                <input
                  className="edit-input"
                  type="text"
                  placeholder="Motivo (atividade, trabalho, etc)"
                  value={profMotivo}
                  onChange={(event) => setProfMotivo(event.target.value)}
                />

                <button className="btn edit-submit-btn" type="submit" disabled={profProcessandoXp}>
                  {profProcessandoXp ? 'Lancando XP...' : 'Lancar XP para aluno'}
                </button>
              </form>
            ) : null}

            <div className="academy-admin-actions">
              <button
                type="button"
                className="academy-admin-btn"
                onClick={() => carregarTrocasPendentesProfessor(true)}
                disabled={profCarregandoTrocas}
              >
                {profCarregandoTrocas ? 'Atualizando trocas...' : 'Atualizar trocas pendentes'}
              </button>
            </div>

            <div className="academy-list academy-v2-list">
              {profTrocasPendentes.length === 0 ? (
                <div className="empty-state">
                  <p>Nenhuma troca pendente para revisar.</p>
                </div>
              ) : (
                profTrocasPendentes.map((troca) => (
                  <div
                    className="academy-list-row academy-v2-card academy-teacher-redemption-row"
                    key={troca.redemption_id}
                  >
                    <div className="academy-v2-card-head">
                      <strong className="academy-v2-title">
                          @{troca.student_username || 'aluno'} • {troca.subject_name} • Escola:{' '}
                        {troca.unit_code || '-'}
                      </strong>
                      <small className="academy-v2-time">{formatarDataHora(troca.created_at)}</small>
                    </div>

                    <div className="academy-redeem-meta academy-v2-meta">
                      <span className="academy-v2-chip">{troca.xp_spent} XP</span>
                      <span className="academy-v2-chip">{troca.grade_points} ponto(s)</span>
                      <span className="academy-status pendente">Pendente</span>
                    </div>

                    <div className="academy-admin-actions academy-v2-actions">
                      <button
                        type="button"
                        className="academy-admin-btn academy-v2-mini-btn"
                        disabled={profRevisandoTrocaId === troca.redemption_id}
                        onClick={() => revisarTrocaProfessor(troca, true)}
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        className="academy-admin-btn secondary academy-v2-mini-btn"
                        disabled={profRevisandoTrocaId === troca.redemption_id}
                        onClick={() => revisarTrocaProfessor(troca, false)}
                      >
                        Recusar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <input
              className="edit-input"
              type="text"
              placeholder="Observacao para aprovar/recusar (opcional)"
              value={profNotaTroca}
              onChange={(event) => setProfNotaTroca(event.target.value)}
            />
          </section>
        ) : null}

        {adminQuizLiberado && adminQuizAberto ? (
          <section className="academy-block academy-admin-panel">
            <div className="academy-block-head">
              <h3>Painel oculto de Quiz</h3>
              <span>Admin</span>
            </div>

            <p>Painel admin para gerenciar quizzes e ajustar XP de perfis (acesso via RPC no Supabase).</p>

            <>
              <div className="academy-admin-tabs">
                  <button
                    type="button"
                    className={`academy-admin-tab ${adminPainelAba === 'quiz' ? 'active' : ''}`}
                    onClick={() => setAdminPainelAba('quiz')}
                  >
                    Gestao de Quiz
                  </button>
                  <button
                    type="button"
                    className={`academy-admin-tab ${adminPainelAba === 'xp' ? 'active' : ''}`}
                    onClick={() => setAdminPainelAba('xp')}
                  >
                    Gestao de XP
                  </button>
                </div>

                <div className="academy-admin-actions">
                  <button
                    type="button"
                    className="academy-admin-btn"
                    onClick={carregarResumoAdminQuiz}
                    disabled={adminQuizVerificando}
                  >
                    Atualizar resumo
                  </button>

                  <button
                    type="button"
                    className="academy-admin-btn secondary"
                    onClick={() => setAdminQuizAberto(false)}
                  >
                    Fechar painel
                  </button>
                </div>

                {adminQuizResumo ? (
                  <>
                    <div
                      className={`academy-admin-stats ${
                        adminPainelAba !== 'quiz' ? 'academy-admin-hidden' : ''
                      }`}
                    >
                      <span>Total: {adminQuizResumo.total_questions}</span>
                      <span>Ativas: {adminQuizResumo.active_questions}</span>
                      <span>Inativas: {adminQuizResumo.inactive_questions}</span>
                    </div>

                    {adminQuizResumo.by_subject.length > 0 ? (
                      <div
                        className={`academy-admin-chips ${
                          adminPainelAba !== 'quiz' ? 'academy-admin-hidden' : ''
                        }`}
                      >
                        {adminQuizResumo.by_subject.map((item) => (
                          <span key={item.subject}>
                            {item.subject}: {item.active}/{item.total}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : null}

                <form
                  className={`academy-redeem-form academy-admin-form ${
                    adminPainelAba !== 'quiz' ? 'academy-admin-hidden' : ''
                  }`}
                  onSubmit={criarQuestaoQuiz}
                >
                  <h4>Nova questao de quiz</h4>

                  <div className="academy-admin-grid-two">
                    <select
                      className="edit-input"
                      value={adminQuizForm.subject_name}
                      onChange={(event) => atualizarCampoQuiz('subject_name', event.target.value)}
                    >
                      {QUIZ_SUBJECT_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>

                    <select
                      className="edit-input"
                      value={adminQuizForm.challenge_scope}
                      onChange={(event) => atualizarCampoQuiz('challenge_scope', event.target.value)}
                    >
                      <option value="base">Escopo base</option>
                      <option value="course">Escopo course</option>
                    </select>
                  </div>

                  {adminQuizForm.challenge_scope === 'course' ? (
                    <select
                      className="edit-input"
                      value={adminQuizForm.course_area}
                      onChange={(event) => atualizarCampoQuiz('course_area', event.target.value)}
                    >
                      {COURSE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  ) : null}

                  <textarea
                    className="edit-input academy-admin-textarea"
                    placeholder="Enunciado da pergunta"
                    value={adminQuizForm.prompt}
                    onChange={(event) => atualizarCampoQuiz('prompt', event.target.value)}
                  />

                  <div className="academy-admin-grid-two">
                    <input
                      className="edit-input"
                      type="text"
                      placeholder="Opcao A"
                      value={adminQuizForm.option_a}
                      onChange={(event) => atualizarCampoQuiz('option_a', event.target.value)}
                    />
                    <input
                      className="edit-input"
                      type="text"
                      placeholder="Opcao B"
                      value={adminQuizForm.option_b}
                      onChange={(event) => atualizarCampoQuiz('option_b', event.target.value)}
                    />
                    <input
                      className="edit-input"
                      type="text"
                      placeholder="Opcao C"
                      value={adminQuizForm.option_c}
                      onChange={(event) => atualizarCampoQuiz('option_c', event.target.value)}
                    />
                    <input
                      className="edit-input"
                      type="text"
                      placeholder="Opcao D"
                      value={adminQuizForm.option_d}
                      onChange={(event) => atualizarCampoQuiz('option_d', event.target.value)}
                    />
                  </div>

                  <div className="academy-admin-grid-two">
                    <select
                      className="edit-input"
                      value={adminQuizForm.correct_option}
                      onChange={(event) => atualizarCampoQuiz('correct_option', event.target.value)}
                    >
                      <option value="A">Resposta correta: A</option>
                      <option value="B">Resposta correta: B</option>
                      <option value="C">Resposta correta: C</option>
                      <option value="D">Resposta correta: D</option>
                    </select>

                    <select
                      className="edit-input"
                      value={adminQuizForm.difficulty}
                      onChange={(event) => atualizarCampoQuiz('difficulty', Number(event.target.value))}
                    >
                      <option value={1}>Dificuldade 1</option>
                      <option value={2}>Dificuldade 2</option>
                      <option value={3}>Dificuldade 3</option>
                      <option value={4}>Dificuldade 4</option>
                      <option value={5}>Dificuldade 5</option>
                    </select>
                  </div>

                  <textarea
                    className="edit-input academy-admin-textarea"
                    placeholder="Explicacao (opcional)"
                    value={adminQuizForm.explanation}
                    onChange={(event) => atualizarCampoQuiz('explanation', event.target.value)}
                  />

                  <label className="academy-admin-toggle">
                    <input
                      type="checkbox"
                      checked={adminQuizForm.is_active}
                      onChange={(event) => atualizarCampoQuiz('is_active', event.target.checked)}
                    />
                    <span>Criar questao ativa</span>
                  </label>

                  <button className="btn edit-submit-btn" type="submit" disabled={adminQuizCriando}>
                    {adminQuizCriando ? 'Salvando questao...' : 'Criar questao'}
                  </button>
                </form>

                <form
                  className={`academy-redeem-form academy-admin-form academy-admin-status-form ${
                    adminPainelAba !== 'quiz' ? 'academy-admin-hidden' : ''
                  }`}
                  onSubmit={atualizarStatusQuestaoQuiz}
                >
                  <h4>Ativar ou desativar questao</h4>

                  <input
                    className="edit-input"
                    type="text"
                    placeholder="ID da questao (UUID)"
                    value={adminQuizStatusId}
                    onChange={(event) => setAdminQuizStatusId(event.target.value)}
                  />

                  <select
                    className="edit-input"
                    value={adminQuizStatusAtivo ? 'ativo' : 'inativo'}
                    onChange={(event) => setAdminQuizStatusAtivo(event.target.value === 'ativo')}
                  >
                    <option value="ativo">Ativar questao</option>
                    <option value="inativo">Desativar questao</option>
                  </select>

                  <button
                    className="btn edit-submit-btn"
                    type="submit"
                    disabled={adminQuizMudandoStatus}
                  >
                    {adminQuizMudandoStatus ? 'Aplicando...' : 'Aplicar status'}
                  </button>
                </form>

                <form
                  className={`academy-redeem-form academy-admin-form ${
                    adminPainelAba !== 'xp' ? 'academy-admin-hidden' : ''
                  }`}
                  onSubmit={buscarPerfisAdmin}
                >
                  <h4>Pesquisar perfil para ajustar XP</h4>

                  <div className="academy-admin-search-row">
                    <input
                      className="edit-input"
                      type="text"
                      placeholder="Nome ou @username"
                      value={adminBuscaPerfil}
                      onChange={(event) => setAdminBuscaPerfil(event.target.value)}
                    />

                    <button
                      className="academy-admin-btn"
                      type="submit"
                      disabled={adminBuscandoPerfis}
                    >
                      {adminBuscandoPerfis ? 'Buscando...' : 'Buscar'}
                    </button>
                  </div>

                  {adminBuscaResultados.length > 0 ? (
                    <div className="academy-admin-results">
                      {adminBuscaResultados.map((item) => {
                        const selecionado = adminPerfilSelecionado?.profile_id === item.profile_id
                        return (
                          <button
                            key={item.profile_id}
                            type="button"
                            className={`academy-admin-result-card ${selecionado ? 'selected' : ''}`}
                            onClick={() => selecionarPerfilAdmin(item)}
                          >
                            <strong>@{item.username}</strong>
                            <span>{item.nome || 'Aluno'}</span>
                            <small>
                              XP {item.xp_total || 0} • Nível {item.level || 1}
                            </small>
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </form>

                {adminPainelAba === 'xp' && adminPerfilSelecionado ? (
                  <form className="academy-redeem-form academy-admin-form" onSubmit={ajustarXpPerfilAdmin}>
                    <h4>Ajuste de XP do perfil selecionado</h4>

                    <div className="academy-admin-target-card">
                      <strong>@{adminPerfilSelecionado.username}</strong>
                      <span>{adminPerfilSelecionado.nome || 'Aluno'}</span>
                      <small>
                    XP atual: {adminPerfilSelecionado.xp_total || 0} • Nível:{' '}
                        {adminPerfilSelecionado.level || 1}
                      </small>
                    </div>

                    <input
                      className="edit-input"
                      type="number"
                      step="1"
                      placeholder="XP (use negativo para tirar)"
                      value={adminDeltaXp}
                      onChange={(event) => setAdminDeltaXp(Number(event.target.value))}
                    />

                    <input
                      className="edit-input"
                      type="text"
                      placeholder="Motivo do ajuste"
                      value={adminMotivoXp}
                      onChange={(event) => setAdminMotivoXp(event.target.value)}
                    />

                    <button className="btn edit-submit-btn" type="submit" disabled={adminAjustandoXp}>
                      {adminAjustandoXp ? 'Aplicando ajuste...' : 'Aplicar ajuste de XP'}
                    </button>
                  </form>
                ) : null}
            </>
          </section>
        ) : null}

        <section className="academy-xp-exchange-shell">
          <header className="academy-xp-exchange-head">
            <span className="academy-xp-exchange-icon">◇</span>
            <div>
              <p>Nova central acadêmica</p>
              <h3>XP & Recompensas</h3>
              <span>Atividades, correções, saldo, catálogo da escola e solicitações em um só lugar.</span>
            </div>
          </header>
          <button className="academy-xp-submit" type="button" onClick={() => navigate('/academia/xp')}>
            Abrir central de XP e recompensas
          </button>
        </section>

        <section className="academy-block">
          <div className="academy-block-head">
            <h3>Historico de XP</h3>
            <span>{xpHistorico.length} registros</span>
          </div>

          {xpHistorico.length === 0 ? (
            <div className="empty-state">
              <p>Nenhum ganho de XP ainda.</p>
            </div>
          ) : (
            <div className="academy-list academy-v2-list">
              {xpHistorico.map((item) => (
                <div className="academy-list-row academy-v2-card" key={item.id}>
                  <div className="academy-v2-card-head">
                    <strong className="academy-v2-title">{item.reason}</strong>
                    <small className="academy-v2-time">{formatarDataHora(item.created_at)}</small>
                  </div>

                  <div className="academy-redeem-meta academy-v2-meta">
                    <span className={`academy-xp-badge ${item.delta_xp >= 0 ? 'plus' : 'minus'}`}>
                      {item.delta_xp >= 0 ? '+' : ''}
                      {item.delta_xp} XP
                    </span>
                    {item.source_type ? (
                      <span className="academy-v2-chip">
                        {String(item.source_type).replaceAll('_', ' ')}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="academy-block">
          <div className="academy-block-head">
            <h3>Trocas de pontos</h3>
            <span>{trocas.length} solicitacoes</span>
          </div>

          {trocas.length === 0 ? (
            <div className="empty-state">
              <p>Você ainda não solicitou troca de XP.</p>
            </div>
          ) : (
            <div className="academy-list academy-v2-list">
              {trocas.map((troca) => (
                <div className="academy-list-row academy-v2-card" key={troca.id}>
                  <div className="academy-v2-card-head">
                    <strong className="academy-v2-title">
                              {troca.subject_name} • Escola: {troca.unit_code || '-'}
                    </strong>
                    <small className="academy-v2-time">{formatarDataHora(troca.created_at)}</small>
                  </div>

                  <div className="academy-redeem-meta academy-v2-meta">
                    <span className="academy-v2-chip">{troca.xp_spent} XP</span>
                    <span className="academy-v2-chip">{troca.grade_points} ponto(s)</span>
                    <span className={`academy-status ${corStatusTroca(troca.status)}`}>
                      {textoStatusTroca(troca.status)}
                    </span>
                  </div>
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
