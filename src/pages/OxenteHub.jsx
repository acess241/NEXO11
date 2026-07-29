import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import { supabase } from '../lib/supabase'
import logoOxente from '/oxente-logo.png'
import {
  LIVE_CHAT_UPDATED_EVENT,
  classroomMembershipStatus,
  createClassroomForTeacher,
  deleteAllClassroomsAndRelatedData,
  deleteClassroomAndRelatedData,
  ensureClassroomGroupsForProfile,
  leaveLiveConversation,
  listClassroomJoinRequestsForTeacher,
  listLiveClassroomGroupsForUser,
  publishAssignmentMessage,
  resetAllLiveConversationsAndGroups,
  reviewClassroomJoinRequest,
  submitClassroomJoinRequestByCode,
  updateClassroomForTeacher,
} from '../lib/liveConversations'
import {
  extractClassroomCode,
  normalizeClassroomCode,
} from '../lib/classroomCode'
import {
  OXENTE_HISTORY_LIMIT,
  createEditableWordDocument,
  generateStudyKeyPoints,
  generateStudySummary,
  loadAnalysisFromHistory,
  saveAnalysisToHistory,
  scanActivityImage,
} from '../lib/oxenteStudyPipeline'
import { libraryBySeries, literatureByGenre } from '../data/libraryBooks'

const TABS = [
  { id: 'sala', label: 'Salas', mobileLabel: 'Salas', icon: 'sala' },
  { id: 'laboratorio', label: 'Laboratório', mobileLabel: 'Laboratório', icon: 'laboratorio' },
  { id: 'biblioteca', label: 'Biblioteca', mobileLabel: 'Biblioteca', icon: 'biblioteca' },
  { id: 'rotina', label: 'Rotina', mobileLabel: 'Rotina', icon: 'rotina' },
]

const LABORATORIO_TABS = [
  { id: 'inicio', label: 'Início', icon: 'inicio' },
  { id: 'escanear', label: 'Escanear', icon: 'escanear' },
  { id: 'revisar', label: 'Revisar', icon: 'revisar' },
  { id: 'resumir', label: 'Resumir', icon: 'resumir' },
  { id: 'exportar', label: 'Word', icon: 'word' },
  { id: 'histórico', label: 'Histórico', icon: 'histórico' },
]

const LABORATORIO_HOME_CARDS = [
  {
    id: 'escanear',
    title: 'Escanear',
    description: 'Envie foto ou PDF e transforme em texto editável.',
    view: 'escanear',
    icon: 'escanear',
  },
  {
    id: 'texto-digitalizado',
    title: 'Texto digitalizado',
    description: 'Revise e edite o texto extraído da atividade.',
    view: 'revisar',
    icon: 'revisar',
  },
  {
    id: 'resumo',
    title: 'Resumo',
    description: 'Gere um resumo claro e organizado.',
    view: 'resumir',
    icon: 'resumir',
  },
  {
    id: 'pontos-principais',
    title: 'Pontos principais',
    description: 'Veja os tópicos mais importantes da atividade.',
    view: 'resumir',
    icon: 'topicos',
  },
  {
    id: 'word',
    title: 'Word',
    description: 'Exporte um documento editável e pronto para usar.',
    view: 'exportar',
    icon: 'word',
  },
  {
    id: 'histórico',
    title: 'Histórico',
    description: 'Reabra atividades, textos e resumos anteriores.',
    view: 'histórico',
    icon: 'histórico',
  },
]

const OXENTE_HISTORY_KEY = 'oxente_hub_history_v4'
const OXENTE_STATS_KEY = 'oxente_hub_stats_v4'
const OXENTE_ROUTINE_KEY = 'oxente_hub_study_routine_v1'
const OXENTE_CLASSROOM_CLEANUP_KEY = 'oxente_hub_classroom_cleanup_v3'

const LIBRARY_BY_SERIES = libraryBySeries()
const LITERATURE_BY_GENRE = literatureByGenre()

function getEmbeddedBookUrl(book) {
  if (!book?.pdfUrl) return ''
  if (!/^https?:\/\//i.test(book.pdfUrl)) return book.pdfUrl
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(book.pdfUrl)}`
}

const ROTINA_TABS = [
  { id: 'hoje', label: 'Hoje', icon: 'inicio' },
  { id: 'semana', label: 'Semana', icon: 'calendario' },
  { id: 'revisoes', label: 'Revisões', icon: 'revisar' },
  { id: 'metas', label: 'Metas', icon: 'metas' },
  { id: 'progresso', label: 'Progresso', icon: 'progresso' },
]

function sanitizeText(value) {
  return `${value || ''}`
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function extrairCodigoSala(value) {
  return extractClassroomCode(value)
}

function topicLabel(topic) {
  if (topic === 'matematica') return 'Matemática'
  if (topic === 'portugues') return 'Português'
  if (topic === 'biologia') return 'Biologia'
  if (topic === 'fisica') return 'Física'
  if (topic === 'quimica') return 'Química'
  if (topic === 'historia') return 'História'
  return 'Geral'
}

function isTeacherRole(profileOrRole) {
  const roleValue =
    typeof profileOrRole === 'object' && profileOrRole !== null
      ? profileOrRole.role
      : profileOrRole

  const lowered = `${roleValue || ''}`.toLowerCase().trim()
  if (
    lowered === 'teacher' ||
    lowered === 'professor' ||
    lowered === 'admin' ||
    lowered === 'adm' ||
    lowered === 'docente'
  ) {
    return true
  }

  if (typeof profileOrRole === 'object' && profileOrRole !== null) {
    const hasTeacherFields = Boolean(
      sanitizeText(
        profileOrRole.teacher_subject ||
          profileOrRole.teacherSubject ||
          profileOrRole.teacher_school ||
          profileOrRole.teacherSchool ||
          profileOrRole.teacher_registration ||
          profileOrRole.teacherRegistration ||
          profileOrRole.teacher_department ||
          profileOrRole.teacherDepartment ||
          ''
      )
    )
    if (hasTeacherFields) return true
  }

  return false
}

function classroomStatusLabel(status) {
  if (status === classroomMembershipStatus.approved) return 'Participando'
  if (status === classroomMembershipStatus.requested) return 'Aguardando'
  if (status === classroomMembershipStatus.invited) return 'Convite'
  if (status === classroomMembershipStatus.rejected) return 'Recusado'
  if (status === classroomMembershipStatus.blocked) return 'Bloqueado'
  if (status === classroomMembershipStatus.left) return 'Saiu'
  return 'Não participante'
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

function IconHomeApp() {
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
      aria-hidden="true"
    >
      <path d="M3 10.5L12 3l9 7.5V21H3z" />
      <path d="M9 21v-6h6v6" />
    </svg>
  )
}

function IconScanFile() {
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
      aria-hidden="true"
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 2v4M16 2v4M8 18v4M16 18v4M2 8h4M2 16h4M18 8h4M18 16h4" />
      <path d="M9 12h6" />
    </svg>
  )
}

function IconReviewDoc() {
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
      aria-hidden="true"
    >
      <path d="M8 3h8l5 5v13H8z" />
      <path d="M16 3v5h5" />
      <path d="M11 13h7M11 17h7M11 9h3" />
      <path d="m5 18 2.5-.5L14 11l-2-2-6.5 6.5z" />
    </svg>
  )
}

function IconSummaryStar() {
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
      aria-hidden="true"
    >
      <path d="M4 5h10a2 2 0 0 1 2 2v10H4z" />
      <path d="M4 9h12" />
      <path d="M19 12.5l1.2 2.5 2.8.4-2 2 0.5 2.8-2.5-1.4-2.5 1.4.5-2.8-2-2 2.8-.4z" />
    </svg>
  )
}

function IconChecklistApp() {
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
      aria-hidden="true"
    >
      <path d="M9 7h11M9 12h11M9 17h11" />
      <path d="m3 7 1.5 1.5L7 6M3 12l1.5 1.5L7 11M3 17l1.5 1.5L7 16" />
    </svg>
  )
}

function IconWordFile() {
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
      aria-hidden="true"
    >
      <path d="M8 3h8l5 5v13H8z" />
      <path d="M16 3v5h5" />
      <path d="m10 10 1.5 6 1.5-4 1.5 4 1.5-6" />
    </svg>
  )
}

function IconHistoryClock() {
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
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function IconCameraApp() {
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
      aria-hidden="true"
    >
      <path d="M4 8h3l1.6-2h6.8L17 8h3v11H4z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  )
}

function IconClassroomApp() {
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
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M8 21h8M12 17v4" />
      <path d="M7.5 10h9" />
    </svg>
  )
}

function IconLibraryApp() {
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
      aria-hidden="true"
    >
      <path d="M4 5h14v14H4z" />
      <path d="M18 7h2v12h-2" />
      <path d="M8 5v14M12 5v14" />
    </svg>
  )
}

function IconCalendarApp() {
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
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </svg>
  )
}

function IconTargetApp() {
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
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.5" />
    </svg>
  )
}

function IconProgressApp() {
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
      aria-hidden="true"
    >
      <path d="M4 19V9M10 19V5M16 19v-8M22 19v-4" />
    </svg>
  )
}

function renderLaboratorioIcon(icon) {
  if (icon === 'inicio') return <IconHomeApp />
  if (icon === 'escanear') return <IconScanFile />
  if (icon === 'laboratorio') return <IconScanFile />
  if (icon === 'sala') return <IconClassroomApp />
  if (icon === 'biblioteca') return <IconLibraryApp />
  if (icon === 'rotina') return <IconCalendarApp />
  if (icon === 'calendario') return <IconCalendarApp />
  if (icon === 'metas') return <IconTargetApp />
  if (icon === 'progresso') return <IconProgressApp />
  if (icon === 'revisar') return <IconReviewDoc />
  if (icon === 'resumir') return <IconSummaryStar />
  if (icon === 'topicos') return <IconChecklistApp />
  if (icon === 'word') return <IconWordFile />
  if (icon === 'histórico') return <IconHistoryClock />
  if (icon === 'camera') return <IconCameraApp />
  return <IconHomeApp />
}

function safeReadLocalStorage(key, fallback) {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function safeWriteLocalStorage(key, value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

function toDayKey(dateInput) {
  const date = new Date(dateInput)
  if (Number.isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function calculateStreak(history) {
  const days = new Set(
    (history || [])
      .map((item) => toDayKey(item.updatedAt || item.createdAt))
      .filter(Boolean)
  )

  if (days.size === 0) return 0

  let streak = 0
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)

  while (true) {
    const key = toDayKey(cursor)
    if (!days.has(key)) break
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}

function parseKeyPointsText(value) {
  return `${value || ''}`
    .split('\n')
    .map((line) => line.replace(/^[-*\u2022\s]+/, '').trim())
    .filter(Boolean)
}

function buildWordFileName(titleValue) {
  const baseName = sanitizeText(titleValue || 'atividade-digitalizada')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const dateKey = new Date().toISOString().slice(0, 10)
  return `${baseName || 'atividade-digitalizada'}-${dateKey}.doc`
}

function baixarBlobWord(blob, fileName) {
  const fileUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = fileUrl
  link.download = fileName
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(fileUrl)
  }, 15000)
}

function formatarDataHora(dateInput) {
  const date = new Date(dateInput)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR')
}

function mapStepToLaboratorioView(step) {
  if (step >= 6) return 'exportar'
  if (step >= 4) return 'resumir'
  if (step >= 3) return 'revisar'
  return 'escanear'
}

function mapLaboratorioViewToStep(view) {
  if (view === 'escanear') return 1
  if (view === 'revisar') return 3
  if (view === 'resumir') return 4
  if (view === 'exportar') return 6
  if (view === 'histórico') return 1
  return 1
}

function getHistoricoStatusLabel(item) {
  if (item?.status?.wordCreated) return 'Word exportado'
  if (item?.status?.summaryGenerated) return 'Resumo gerado'
  if (sanitizeText(item?.recognizedText)) return 'Revisado'
  if (item?.status?.digitalized) return 'Digitalizado'
  return 'Digitalizado'
}

function addDays(dateInput, daysToAdd) {
  const date = new Date(dateInput || Date.now())
  if (Number.isNaN(date.getTime())) return new Date()
  date.setDate(date.getDate() + daysToAdd)
  return date
}

function toIsoDate(dateInput = new Date()) {
  const date = new Date(dateInput)
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10)
  return date.toISOString().slice(0, 10)
}

function formatarData(dateInput) {
  const date = new Date(dateInput)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleDateString('pt-BR')
}

function buildDefaultRoutineData() {
  const hoje = new Date()
  return {
    tasks: [
      {
        id: `task-${Date.now()}-mat`,
        userId: '',
        title: 'Estudar frações e proporções',
        subject: 'Matemática',
        type: 'estudo',
        dueDate: toIsoDate(hoje),
        estimatedMinutes: 30,
        status: 'pending',
        source: 'manual',
        sourceId: '',
        createdAt: new Date().toISOString(),
        completedAt: '',
      },
      {
        id: `task-${Date.now()}-por`,
        userId: '',
        title: 'Revisar resumo de interpretação de texto',
        subject: 'Português',
        type: 'revisão',
        dueDate: toIsoDate(hoje),
        estimatedMinutes: 20,
        status: 'in_progress',
        source: 'laboratorio',
        sourceId: '',
        createdAt: new Date().toISOString(),
        completedAt: '',
      },
      {
        id: `task-${Date.now()}-fis`,
        userId: '',
        title: 'Resolver atividade de cinemática',
        subject: 'Física',
        type: 'atividade',
        dueDate: toIsoDate(addDays(hoje, 1)),
        estimatedMinutes: 45,
        status: 'pending',
        source: 'sala',
        sourceId: '',
        createdAt: new Date().toISOString(),
        completedAt: '',
      },
      {
        id: `task-${Date.now()}-his`,
        userId: '',
        title: 'Revisão rápida: Era Vargas',
        subject: 'História',
        type: 'revisão',
        dueDate: toIsoDate(hoje),
        estimatedMinutes: 15,
        status: 'overdue',
        source: 'manual',
        sourceId: '',
        createdAt: new Date().toISOString(),
        completedAt: '',
      },
    ],
    reviews: [
      {
        id: `review-${Date.now()}-1`,
        userId: '',
        title: 'Paginação',
        subject: 'Sistemas Operacionais',
        contentId: '',
        reviewDate: toIsoDate(hoje),
        reviewStage: 1,
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      {
        id: `review-${Date.now()}-2`,
        userId: '',
        title: 'Memória virtual',
        subject: 'Sistemas Operacionais',
        contentId: '',
        reviewDate: toIsoDate(addDays(hoje, 3)),
        reviewStage: 2,
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
      {
        id: `review-${Date.now()}-3`,
        userId: '',
        title: 'Transferência de calor',
        subject: 'Física',
        contentId: '',
        reviewDate: toIsoDate(addDays(hoje, 1)),
        reviewStage: 1,
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    ],
    goals: [
      {
        id: `goal-${Date.now()}-1`,
        userId: '',
        title: 'Estudar 1 hora por dia',
        subject: '',
        target: 60,
        progress: 35,
        dueDate: toIsoDate(addDays(hoje, 7)),
        status: 'in_progress',
        createdAt: new Date().toISOString(),
      },
      {
        id: `goal-${Date.now()}-2`,
        userId: '',
        title: 'Concluir 5 atividades',
        subject: '',
        target: 5,
        progress: 2,
        dueDate: toIsoDate(addDays(hoje, 10)),
        status: 'pending',
        createdAt: new Date().toISOString(),
      },
    ],
    sessions: [],
    activityLog: [],
  }
}

function taskStatusLabel(status) {
  if (status === 'pending') return 'Pendente'
  if (status === 'in_progress') return 'Em andamento'
  if (status === 'completed') return 'Concluído'
  if (status === 'overdue') return 'Atrasado'
  return 'Pendente'
}

function reviewStageLabel(stage) {
  if (stage === 1) return '1º revisão'
  if (stage === 2) return '2º revisão'
  if (stage === 3) return '3º revisão'
  if (stage === 4) return '4º revisão'
  return `${stage || 1}º revisão`
}

function isPdfFile(file) {
  if (!file) return false
  if (file.type === 'application/pdf') return true
  return /\.pdf$/i.test(file.name || '')
}

function isSupportedFile(file) {
  if (!file) return false
  if (isPdfFile(file)) return true

  const type = `${file.type || ''}`.toLowerCase()
  if (type === 'image/png' || type === 'image/jpeg' || type === 'image/jpg') return true

  return /\.(png|jpg|jpeg)$/i.test(file.name || '')
}

function mergeObservacoes(scanObservations, summaryObservations, extra = []) {
  return [...(scanObservations || []), ...(summaryObservations || []), ...(extra || [])].filter(
    (line, index, list) => line && list.indexOf(line) === index
  )
}

function ProgressStepper({ etapaAtual }) {
  const etapas = [
    { id: 1, label: '1. Enviar atividade' },
    { id: 2, label: '2. Digitalizar texto' },
    { id: 3, label: '3. Revisar texto' },
    { id: 4, label: '4. Gerar resumo' },
    { id: 5, label: '5. Pontos principais' },
    { id: 6, label: '6. Exportar Word' },
  ]

  return (
    <div className="oxente-v2-stepper" role="list" aria-label="Fluxo de estudo">
      {etapas.map((item) => {
        const status = item.id === etapaAtual ? 'active' : item.id < etapaAtual ? 'done' : ''

        return (
          <div role="listitem" key={item.id} className={`oxente-v2-step ${status}`}>
            {item.label}
          </div>
        )
      })}
    </div>
  )
}

export default function OxenteHub() {
  const [perfil, setPerfil] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [tab, setTab] = useState('')
  const [etapa, setEtapa] = useState(1)
  const [laboratorioView, setLaboratorioView] = useState('inicio')
  const [rotinaView, setRotinaView] = useState('hoje')
  const [filtroBiblioteca, setFiltroBiblioteca] = useState('')
  const [setorBiblioteca, setSetorBiblioteca] = useState('didaticos')
  const [serieBiblioteca, setSerieBiblioteca] = useState('1º ano')
  const [livroAberto, setLivroAberto] = useState(null)
  const [arquivoSelecionado, setArquivoSelecionado] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [textoDigitalizado, setTextoDigitalizado] = useState('')
  const [escaneandoTexto, setEscaneandoTexto] = useState(false)
  const [progressoOcr, setProgressoOcr] = useState(0)
  const [confiancaOcr, setConfiancaOcr] = useState(0)
  const [resumoGerado, setResumoGerado] = useState('')
  const [resumoRevisado, setResumoRevisado] = useState(false)
  const [topicosPrincipaisTexto, setTopicosPrincipaisTexto] = useState('')
  const [pontosSugeridos, setPontosSugeridos] = useState([])
  const [observacoesTexto, setObservacoesTexto] = useState('')
  const [historico, setHistorico] = useState([])
  const [stats, setStats] = useState({ exportsWord: 0 })
  const [studyTasks, setStudyTasks] = useState([])
  const [studyReviews, setStudyReviews] = useState([])
  const [studyGoals, setStudyGoals] = useState([])
  const [studySessions, setStudySessions] = useState([])
  const [activityLog, setActivityLog] = useState([])
  const [focusMode, setFocusMode] = useState('pomodoro')
  const [focusMinutes, setFocusMinutes] = useState(25)
  const [focusRemainingSeconds, setFocusRemainingSeconds] = useState(25 * 60)
  const [focusStatus, setFocusStatus] = useState('idle')
  const [focusSessionStartedAt, setFocusSessionStartedAt] = useState('')
  const [gruposSala, setGruposSala] = useState([])
  const [grupoSalaSelecionadoId, setGrupoSalaSelecionadoId] = useState('')
  const [classroomLoadState, setClassroomLoadState] = useState('idle')
  const [classroomRequests, setClassroomRequests] = useState([])
  const [codigoSala, setCodigoSala] = useState('')
  const [codigoPreview, setCodigoPreview] = useState(null)
  const [solicitandoEntrada, setSolicitandoEntrada] = useState(false)
  const [criandoSala, setCriandoSala] = useState(false)
  const [limpandoSalas, setLimpandoSalas] = useState(false)
  const [menuSalaAberto, setMenuSalaAberto] = useState(false)
  const [menuHistoricoId, setMenuHistoricoId] = useState('')
  const [salvandoEdicaoSala, setSalvandoEdicaoSala] = useState(false)
  const [revisandoSolicitacaoId, setRevisandoSolicitacaoId] = useState('')
  const [codigoGeradoRecente, setCodigoGeradoRecente] = useState('')
  const [formSala, setFormSala] = useState({
    name: '',
    subject: '',
    grade: '',
    description: '',
  })
  const [formSalaErros, setFormSalaErros] = useState({})
  const [formSalaTouched, setFormSalaTouched] = useState({})
  const [mensagemDemora, setMensagemDemora] = useState('')
  const [exportandoWord, setExportandoWord] = useState(false)
  const [editandoResumo, setEditandoResumo] = useState(false)
  const [analysisIdAtual, setAnalysisIdAtual] = useState('')
  const [metaAtividade, setMetaAtividade] = useState({
    activityTitle: 'Atividade Digitalizada',
    studentName: '',
    subject: '',
    activityDate: new Date().toISOString().slice(0, 10),
  })
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const navigate = useNavigate()
  const perfilEhProfessor = useMemo(() => isTeacherRole(perfil), [perfil])

  useEffect(() => {
    carregarPerfil()
  }, [])

  useEffect(() => {
    const loadedHistory = safeReadLocalStorage(OXENTE_HISTORY_KEY, [])
    const loadedStats = safeReadLocalStorage(OXENTE_STATS_KEY, { exportsWord: 0 })
    const loadedRotina = safeReadLocalStorage(OXENTE_ROUTINE_KEY, null)

    if (Array.isArray(loadedHistory)) {
      setHistorico(loadedHistory.slice(0, OXENTE_HISTORY_LIMIT))
    }

    if (loadedStats && typeof loadedStats === 'object') {
      setStats({ exportsWord: Number(loadedStats.exportsWord || 0) })
    }

    const defaultRotina = buildDefaultRoutineData()
    if (!loadedRotina || typeof loadedRotina !== 'object') {
      setStudyTasks(defaultRotina.tasks)
      setStudyReviews(defaultRotina.reviews)
      setStudyGoals(defaultRotina.goals)
      setStudySessions(defaultRotina.sessions)
      setActivityLog(defaultRotina.activityLog)
      return
    }

    setStudyTasks(Array.isArray(loadedRotina.tasks) ? loadedRotina.tasks : defaultRotina.tasks)
    setStudyReviews(Array.isArray(loadedRotina.reviews) ? loadedRotina.reviews : defaultRotina.reviews)
    setStudyGoals(Array.isArray(loadedRotina.goals) ? loadedRotina.goals : defaultRotina.goals)
    setStudySessions(Array.isArray(loadedRotina.sessions) ? loadedRotina.sessions : [])
    setActivityLog(Array.isArray(loadedRotina.activityLog) ? loadedRotina.activityLog : [])
  }, [])

  useEffect(() => {
    if (!perfil?.id) return undefined

    void sincronizarSalaAoVivo(perfil, 'initial')

    const onStorage = (event) => {
      if (event.key && event.key !== 'nexo_live_conversations_v1') return
      void sincronizarSalaAoVivo(perfil, 'background')
    }
    const onLiveUpdate = () => void sincronizarSalaAoVivo(perfil, 'background')

    const intervalId = window.setInterval(() => {
      void sincronizarSalaAoVivo(perfil, 'background')
    }, 4500)

    window.addEventListener('storage', onStorage)
    window.addEventListener(LIVE_CHAT_UPDATED_EVENT, onLiveUpdate)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(LIVE_CHAT_UPDATED_EVENT, onLiveUpdate)
    }
  }, [perfil?.id])

  useEffect(() => {
    function closeMenuSala() {
      setMenuSalaAberto(false)
      setMenuHistoricoId('')
    }

    window.addEventListener('click', closeMenuSala)
    return () => window.removeEventListener('click', closeMenuSala)
  }, [])

  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  useEffect(() => {
    if (focusStatus !== 'running') return undefined
    const intervalId = window.setInterval(() => {
      setFocusRemainingSeconds((prev) => Math.max(prev - 1, 0))
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [focusStatus])

  useEffect(() => {
    if (focusStatus === 'running' && focusRemainingSeconds === 0) {
      concluirFoco('timer')
    }
  }, [focusRemainingSeconds, focusStatus])

  const textoLimpo = useMemo(() => sanitizeText(textoDigitalizado), [textoDigitalizado])
  const resumoLimpo = useMemo(() => sanitizeText(resumoGerado), [resumoGerado])
  const topicosPrincipais = useMemo(
    () => parseKeyPointsText(topicosPrincipaisTexto),
    [topicosPrincipaisTexto]
  )
  const observacoesLista = useMemo(
    () =>
      `${observacoesTexto || ''}`
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    [observacoesTexto]
  )
  const canExportWord = useMemo(
    () => Boolean(textoLimpo && resumoLimpo && topicosPrincipais.length > 0),
    [textoLimpo, resumoLimpo, topicosPrincipais]
  )

  const hojeIso = useMemo(() => toIsoDate(new Date()), [])
  const diasEstudando = useMemo(
    () => calculateStreak([...historico, ...activityLog]),
    [historico, activityLog]
  )
  const gruposSalaAprovados = useMemo(
    () => gruposSala.filter((item) => item.membershipStatus === classroomMembershipStatus.approved),
    [gruposSala]
  )

  const tarefasSala = useMemo(() => {
    return gruposSalaAprovados
      .map((group, index) => {
        const ultimaMensagem = sanitizeText(group.lastMessage || '')
        const temPistaAtividade = /atividade|prazo|entrega|feedback/i.test(ultimaMensagem)
        if (!temPistaAtividade) return null

        const createdAt = group.lastMessageAt || new Date().toISOString()
        const dueDate = toIsoDate(addDays(createdAt, 2))
        const overdue = new Date(dueDate) < new Date(hojeIso)
        return {
          id: `sala-${group.id}-${index}`,
          userId: perfil?.id || '',
          title: ultimaMensagem || `Atividade da sala ${group.title}`,
          subject: group.subject || 'Sala de Aula',
          type: 'atividade',
          dueDate,
          estimatedMinutes: 25,
          status: overdue ? 'overdue' : 'pending',
          source: 'sala',
          sourceId: group.id,
          createdAt,
          completedAt: '',
        }
      })
      .filter(Boolean)
  }, [gruposSalaAprovados, hojeIso, perfil?.id])

  const tarefasCombinadas = useMemo(() => [...studyTasks, ...tarefasSala], [studyTasks, tarefasSala])
  const tarefasHoje = useMemo(
    () =>
      tarefasCombinadas.filter((task) => {
        return task.dueDate === hojeIso || task.status === 'overdue' || task.status === 'in_progress'
      }),
    [tarefasCombinadas, hojeIso]
  )
  const revisoesHoje = useMemo(
    () => studyReviews.filter((review) => review.reviewDate === hojeIso && review.status !== 'completed'),
    [studyReviews, hojeIso]
  )
  const proximoPrazo = useMemo(() => {
    const pendentes = tarefasCombinadas
      .filter((task) => task.status !== 'completed')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    return pendentes[0] || null
  }, [tarefasCombinadas])
  const tarefasConcluidas = useMemo(
    () => tarefasCombinadas.filter((task) => task.status === 'completed').length,
    [tarefasCombinadas]
  )
  const totalHoje = tarefasHoje.length
  const concluidasHoje = useMemo(
    () => tarefasHoje.filter((task) => task.status === 'completed').length,
    [tarefasHoje]
  )
  const progressoHoje = totalHoje > 0 ? Math.round((concluidasHoje / totalHoje) * 100) : 0
  const horasEstudadas = useMemo(() => {
    const totalMinutos = studySessions
      .filter((session) => session.status === 'completed')
      .reduce((acc, session) => acc + Number(session.durationMinutes || 0), 0)
    return (totalMinutos / 60).toFixed(1)
  }, [studySessions])
  const materiaMaisEstudada = useMemo(() => {
    const counter = {}
    tarefasCombinadas.forEach((task) => {
      if (!task.subject || task.status !== 'completed') return
      counter[task.subject] = Number(counter[task.subject] || 0) + 1
    })
    const top = Object.entries(counter).sort((a, b) => b[1] - a[1])[0]
    return top?.[0] || '-'
  }, [tarefasCombinadas])

  const planoSemana = useMemo(() => {
    const dias = []
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(new Date(), index)
      const iso = toIsoDate(date)
      const tarefasDoDia = tarefasCombinadas.filter((task) => task.dueDate === iso)
      const minutos = tarefasDoDia.reduce((acc, task) => acc + Number(task.estimatedMinutes || 0), 0)
      dias.push({
        id: iso,
        label: date.toLocaleDateString('pt-BR', { weekday: 'short' }),
        dateLabel: formatarData(iso),
        tarefas: tarefasDoDia,
        minutos,
      })
    }
    return dias
  }, [tarefasCombinadas])

  const podeCriarSala = useMemo(
    () =>
      Boolean(
        sanitizeText(formSala.name) && sanitizeText(formSala.subject) && sanitizeText(formSala.grade)
      ),
    [formSala]
  )
  const grupoSalaSelecionado = useMemo(
    () =>
      gruposSala.find((item) => item.id === grupoSalaSelecionadoId) ||
      gruposSalaAprovados[0] ||
      gruposSala[0] ||
      null,
    [gruposSala, gruposSalaAprovados, grupoSalaSelecionadoId]
  )
  const tituloTopbar = useMemo(
    () => (tab === 'sala' ? 'Sala de Aula' : 'Atividades'),
    [tab]
  )

  const cameraDisponivel = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    return Boolean(navigator.mediaDevices?.getUserMedia)
  }, [])

  const ultimoHistorico = useMemo(() => historico[0] || null, [historico])

  const statusEscaneamento = useMemo(() => {
    if (erro) return 'erro'
    if (escaneandoTexto) return 'digitalizando'
    if (textoLimpo) return 'texto-extraido'
    if (arquivoSelecionado) return 'arquivo-carregado'
    return 'nenhum-arquivo'
  }, [erro, escaneandoTexto, textoLimpo, arquivoSelecionado])

  const itensBiblioteca = useMemo(() => {
    const termo = filtroBiblioteca.trim().toLowerCase()
    if (setorBiblioteca === 'literatura') {
      const subjects = LITERATURE_BY_GENRE
        .map((genre) => ({
          name: genre.name,
          books: genre.books.filter((book) => {
            if (!termo) return true
            const target = `${genre.name} ${book.title} ${book.author} ${book.description}`.toLowerCase()
            return target.includes(termo)
          }),
        }))
        .filter((genre) => genre.books.length > 0)

      return subjects.length > 0
        ? [{ series: 'Literatura brasileira', subjects }]
        : []
    }

    const seriesSelecionadas = LIBRARY_BY_SERIES.filter(
      (series) => series.series === serieBiblioteca
    )
    if (!termo) return seriesSelecionadas

    return seriesSelecionadas.map((series) => ({
      ...series,
      subjects: series.subjects
        .map((subject) => ({
          ...subject,
          books: subject.books.filter((book) => {
            const target = `${subject.name} ${book.title} ${book.author} ${book.description}`.toLowerCase()
            return target.includes(termo)
          }),
        }))
        .filter((subject) => subject.books.length > 0),
    })).filter((series) => series.subjects.length > 0)
  }, [filtroBiblioteca, serieBiblioteca, setorBiblioteca])

  function persistirHistorico(novoHistorico) {
    setHistorico(novoHistorico)
    safeWriteLocalStorage(OXENTE_HISTORY_KEY, novoHistorico)
  }

  function persistirStats(novosStats) {
    setStats(novosStats)
    safeWriteLocalStorage(OXENTE_STATS_KEY, novosStats)
  }

  function persistirRotina(payload = {}) {
    const next = {
      tasks: Array.isArray(payload.tasks) ? payload.tasks : studyTasks,
      reviews: Array.isArray(payload.reviews) ? payload.reviews : studyReviews,
      goals: Array.isArray(payload.goals) ? payload.goals : studyGoals,
      sessions: Array.isArray(payload.sessions) ? payload.sessions : studySessions,
      activityLog: Array.isArray(payload.activityLog) ? payload.activityLog : activityLog,
    }

    if (payload.tasks) setStudyTasks(next.tasks)
    if (payload.reviews) setStudyReviews(next.reviews)
    if (payload.goals) setStudyGoals(next.goals)
    if (payload.sessions) setStudySessions(next.sessions)
    if (payload.activityLog) setActivityLog(next.activityLog)

    safeWriteLocalStorage(OXENTE_ROUTINE_KEY, next)
  }

  async function sincronizarSalaAoVivo(profileData = perfil, mode = 'background') {
    if (!profileData?.id) return

    const timeoutId = window.setTimeout(() => {
      if (mode === 'initial') {
        setClassroomLoadState('timeout')
      }
      setMensagemDemora('Esta demorando mais que o normal.')
    }, 3500)

    try {
      if (mode === 'initial' && classroomLoadState !== 'loaded') {
        setClassroomLoadState('loading')
      }

      ensureClassroomGroupsForProfile(profileData)
      const groups = listLiveClassroomGroupsForUser(profileData.id)
      const requests = listClassroomJoinRequestsForTeacher(profileData.id)

      setGruposSala(groups)
      setClassroomRequests(requests)
      setMensagemDemora('')
      setClassroomLoadState(groups.length > 0 ? 'loaded' : 'empty')

      const firstOpenable = groups.find((group) => group.canOpenChat) || groups[0] || null
      if (firstOpenable && !groups.some((group) => group.id === grupoSalaSelecionadoId)) {
        setGrupoSalaSelecionadoId(firstOpenable.id)
      }
    } catch {
      setClassroomLoadState('error')
      setMensagemDemora('')
    } finally {
      window.clearTimeout(timeoutId)
    }
  }

  function limparMensagens() {
    setErro('')
    setSucesso('')
  }

  async function copiarTextoClipboard(texto) {
    const clean = sanitizeText(texto)
    if (!clean) return false

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(clean)
        return true
      }
    } catch {}

    try {
      const area = document.createElement('textarea')
      area.value = clean
      area.setAttribute('readonly', 'true')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      area.style.pointerEvents = 'none'
      document.body.appendChild(area)
      area.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(area)
      return Boolean(copied)
    } catch {
      return false
    }
  }

async function copiarCodigoSala(codigo) {
    const codigoNormalizado = normalizeClassroomCode(codigo)
    if (!codigoNormalizado) {
      setSucesso('')
      setErro('Código da sala indisponível.')
      return
    }

    const ok = await copiarTextoClipboard(codigoNormalizado)
    if (ok) {
      setErro('')
      setSucesso('Código copiado!')
      return
    }
    setSucesso('')
    setErro('Não foi possível copiar o código agora.')
  }

async function compartilharCodigoSala(grupo = grupoSalaSelecionado) {
    const codigo = normalizeClassroomCode(grupo?.code || grupo?.classroomCode || '')
    if (!codigo) {
      setErro('Código da sala indisponível.')
      setSucesso('')
      return
    }

    const titulo = grupo?.title?.replace(/^Grupo -\s*/i, '') || 'Sala de Aula'
    const texto = `Código da sala ${titulo}: ${codigo}`

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Código da sala', text: texto })
        setErro('')
        setSucesso('Código compartilhado!')
        return
      }
    } catch {}

    await copiarCodigoSala(codigo)
  }

  async function editarSalaSelecionada() {
    if (!grupoSalaSelecionado?.classroomId || !grupoSalaSelecionado?.isOwner || salvandoEdicaoSala) return

    const nomeAtual = grupoSalaSelecionado?.title?.replace(/^Grupo -\s*/i, '') || ''
    const proximoNome = sanitizeText(window.prompt('Nome da turma', nomeAtual) || '')
    if (!proximoNome) return

    const proximaMateria = sanitizeText(
      window.prompt('Matéria da sala', grupoSalaSelecionado?.subject || '') || ''
    )
    const proximaSerie = sanitizeText(
      window.prompt('Série da sala', grupoSalaSelecionado?.grade || '') || ''
    )
    const proximaDescricao = sanitizeText(
      window.prompt('Descrição da sala', grupoSalaSelecionado?.description || '') || ''
    )

    setSalvandoEdicaoSala(true)
    try {
      const updated = updateClassroomForTeacher({
        classroomId: grupoSalaSelecionado.classroomId,
        teacherId: perfil.id,
        patch: {
          name: proximoNome,
          subject: proximaMateria,
          grade: proximaSerie,
          description: proximaDescricao,
        },
      })

      if (!updated) {
        setErro('Não foi possível editar a sala agora.')
        setSucesso('')
        return
      }

      setMenuSalaAberto(false)
      setErro('')
      setSucesso('Sala atualizada com sucesso.')
      await sincronizarSalaAoVivo(perfil, 'background')
    } finally {
      setSalvandoEdicaoSala(false)
    }
  }

  async function excluirSalaSelecionada() {
    if (!grupoSalaSelecionado?.classroomId || !grupoSalaSelecionado?.isOwner) return

    const nomeSala = grupoSalaSelecionado?.title?.replace(/^Grupo -\s*/i, '') || 'sala'
    const confirmar = window.confirm(`Excluir "${nomeSala}" e todos os dados vinculados?`)
    if (!confirmar) return

    let excluiu = false
    try {
      const { data, error } = await supabase.rpc('classroom_delete', {
        p_classroom_id: grupoSalaSelecionado.classroomId,
      })

      if (!error) {
        const resposta = Array.isArray(data) ? data[0] : data
        excluiu = Boolean(resposta?.deleted ?? resposta === true)
      }
    } catch {}

    if (!excluiu) {
      const report = deleteClassroomAndRelatedData({
        classroomId: grupoSalaSelecionado.classroomId,
        actingUserId: perfil?.id,
        force: true,
      })
      excluiu = Boolean(report?.deleted)
    }

    setMenuSalaAberto(false)
    if (!excluiu) {
      setErro('Não foi possível excluir a sala agora.')
      setSucesso('')
      return
    }

    setGrupoSalaSelecionadoId('')
    setCodigoPreview(null)
    setErro('')
    setSucesso('Sala excluída com sucesso.')
    await sincronizarSalaAoVivo(perfil, 'background')
  }

  async function sairDaSalaSelecionada() {
    if (!grupoSalaSelecionado?.id || !perfil?.id) return

    const nomeSala = grupoSalaSelecionado?.title?.replace(/^Grupo -\s*/i, '') || 'sala'
    const confirmar = window.confirm(`Sair de "${nomeSala}"?`)
    if (!confirmar) return

    let saiu = false
    try {
      const { data, error } = await supabase.rpc('classroom_leave', {
        p_classroom_id: grupoSalaSelecionado.classroomId || null,
      })
      if (!error) {
        const resposta = Array.isArray(data) ? data[0] : data
        saiu = Boolean(resposta?.ok ?? resposta === true)
      }
    } catch {}

    if (!saiu) {
      saiu = leaveLiveConversation(grupoSalaSelecionado.id, perfil.id)
    }

    if (!saiu) {
      setErro('Não foi possível sair da sala agora.')
      setSucesso('')
      return
    }

    setMenuSalaAberto(false)
    setGrupoSalaSelecionadoId('')
    setErro('')
    setSucesso('Você saiu da sala com sucesso.')
    await sincronizarSalaAoVivo(perfil, 'background')
  }

  async function limparTodasSalasAntigas() {
    if (limpandoSalas) return
    const confirmar = window.confirm(
      'Isso vai apagar todas as salas, grupos, mensagens e solicitações antigas deste dispositivo. Continuar?'
    )
    if (!confirmar) return

    setLimpandoSalas(true)
    try {
      const report = deleteAllClassroomsAndRelatedData({
        actingUserId: perfil?.id || '',
        force: true,
      })
      resetAllLiveConversationsAndGroups()

      if (report?.deleted) {
        setGrupoSalaSelecionadoId('')
        setCodigoPreview(null)
        setMenuSalaAberto(false)
        setErro('')
        setSucesso('Todas as salas e grupos antigos foram removidos.')
      } else {
        setGrupoSalaSelecionadoId('')
        setCodigoPreview(null)
        setMenuSalaAberto(false)
        setErro('')
        setSucesso('Limpeza concluída. Salas e grupos antigos foram removidos deste dispositivo.')
      }

      safeWriteLocalStorage(OXENTE_CLASSROOM_CLEANUP_KEY, true)
      await sincronizarSalaAoVivo(perfil, 'background')
    } finally {
      setLimpandoSalas(false)
    }
  }

  function abrirConversaGrupo(groupId) {
    if (!groupId) return
    const grupo = gruposSala.find((item) => item.id === groupId)
    if (grupo && !grupo.canOpenChat) {
      setErro('Você precisa ser aprovado pelo professor para abrir este grupo.')
      setSucesso('')
      return
    }
    navigate(`/mensagens/ao-vivo/${groupId}`)
  }

  function publicarAtividadeNoGrupo(groupId, title) {
    if (!groupId || !perfil?.id) return
    const grupo = gruposSala.find((item) => item.id === groupId)
    if (grupo && !grupo.canOpenChat) {
      setErro('Grupo indisponível até aprovação de entrada.')
      setSucesso('')
      return
    }

    const cleanTitle = sanitizeText(title || '')
    if (!cleanTitle) {
      setErro('Informe um título de atividade antes de publicar no grupo.')
      setSucesso('')
      return
    }

    try {
      publishAssignmentMessage({
        conversationId: groupId,
        sender: perfil,
        activityTitle: cleanTitle,
        assignmentId: `assignment-${Date.now()}`,
      })
      void sincronizarSalaAoVivo(perfil, 'background')
      setSucesso('Atividade publicada no grupo da turma.')
      setErro('')
    } catch {
      setErro('Não foi possível publicar atividade no grupo agora.')
      setSucesso('')
    }
  }

  async function revisarCodigoSala() {
    if (!perfil?.id) return
    const codigoDigitado = `${codigoSala || ''}`
    const codigoBusca = extrairCodigoSala(codigoDigitado)
    console.log('[CLASSROOM_SEARCH] typed:', codigoDigitado)
    console.log('[CLASSROOM_SEARCH] normalized:', codigoBusca)

    if (!codigoBusca) {
      setCodigoPreview(null)
      setErro('Informe um código de sala válido.')
      setSucesso('')
      return
    }

    setCodigoSala(codigoBusca)
    setCodigoPreview(null)

    try {
      console.log('[CLASSROOM_SEARCH] query:', "rpc classroom_preview_by_code(p_code = normalized)")
      const { data, error } = await supabase.rpc('classroom_preview_by_code', {
        p_code: codigoBusca,
      })
      if (error) throw error

      const previewDb = Array.isArray(data) ? data[0] : data
      console.log('[CLASSROOM_SEARCH] result:', previewDb || null)
      if (!previewDb) {
        setCodigoPreview(null)
        setErro('Código de sala inválido ou não encontrado.')
        setSucesso('')
        return
      }

      const membershipStatus = previewDb.membership_status || previewDb.membershipStatus || 'not_member'
      const previewCode = normalizeClassroomCode(previewDb.code || codigoBusca)
      const isActive = previewDb.is_active !== false
      if (!isActive) {
        setCodigoPreview(null)
        setErro('Esta sala está inativa e não aceita novas entradas.')
        setSucesso('')
        return
      }

      setCodigoPreview({
        id: previewDb.classroom_id || previewDb.id || '',
        classroomId: previewDb.classroom_id || previewDb.id || '',
        code: previewCode,
        name: previewDb.name || 'Sala',
        subject: previewDb.subject || '',
        teacherName: previewDb.teacher_name || previewDb.teacherName || 'Não informado',
        membershipStatus,
      })
      setErro('')
      setSucesso('Sala encontrada. Revise os dados e solicite entrada.')
    } catch (error) {
      console.log('[CLASSROOM_SEARCH] error:', error)
      const raw = `${error?.message || error?.details || ''}`.toLowerCase()
      if (raw.includes('classroom_preview_by_code') && raw.includes('function')) {
        setErro('Busca por código não configurada no banco. Execute o SQL de setup.')
      } else if (raw.includes('permission') || raw.includes('permiss')) {
        setErro('Sem permissão no banco para buscar sala por código.')
      } else if (raw.includes('perfil do usuario nao encontrado')) {
        setErro('Seu perfil não foi encontrado no banco. Faça login novamente.')
      } else {
        setErro('Código de sala inválido ou não encontrado.')
      }

      setCodigoPreview(null)
      setSucesso('')
    }
  }

  async function solicitarEntradaComCodigo() {
    if (!perfil?.id) return
    const codigoDigitado = `${codigoSala || ''}`
    const codigoBusca = extrairCodigoSala(codigoDigitado)
    console.log('[CLASSROOM_JOIN] typed:', codigoDigitado)
    console.log('[CLASSROOM_JOIN] normalized:', codigoBusca)

    if (!codigoBusca) {
      setErro('Informe um código de sala válido.')
      setSucesso('')
      return
    }

    setCodigoSala(codigoBusca)
    setSolicitandoEntrada(true)
    try {
      console.log('[CLASSROOM_JOIN] query:', "rpc classroom_request_join_by_code(p_code = normalized)")
      const { data, error } = await supabase.rpc('classroom_request_join_by_code', {
        p_code: codigoBusca,
      })
      if (error) throw error

      const respostaDb = Array.isArray(data) ? data[0] : data
      console.log('[CLASSROOM_JOIN] result:', respostaDb || null)

      if (!respostaDb?.classroom_id) {
        throw new Error('Código de sala inválido ou não encontrado.')
      }

      try {
        submitClassroomJoinRequestByCode({
          code: codigoBusca,
          student: perfil,
        })
      } catch {}

      setCodigoPreview((anterior) => ({
        ...(anterior || {}),
        id: respostaDb.classroom_id || anterior?.id || '',
        classroomId: respostaDb.classroom_id || anterior?.classroomId || '',
        code: normalizeClassroomCode(anterior?.code || codigoBusca),
        membershipStatus: respostaDb.status || 'requested',
      }))
      setErro('')
      setSucesso(respostaDb.message || 'Aguardando aprovação do professor.')
      await sincronizarSalaAoVivo(perfil, 'background')
    } catch (error) {
      console.log('[CLASSROOM_JOIN] error:', error)
      const code = `${error?.code || ''}`.toLowerCase()
      const textoErro = `${error?.message || error?.details || ''}`.toLowerCase()
      if (code === '42702' || textoErro.includes('ambiguous')) {
        setErro('Função de sala desatualizada no banco. Rode o SQL de correção da Sala de Aula.')
      } else if (code === '42p01' || textoErro.includes('classroom_join_requests') || textoErro.includes('classroom_members')) {
        setErro('Sistema de Sala de Aula não configurado no banco. Rode o SQL da Sala.')
      } else if (code === '42883' || textoErro.includes('classroom_request_join_by_code') || textoErro.includes('function')) {
        setErro('RPC de entrada por código não encontrada. Rode o SQL da Sala de Aula.')
      } else if (code === '42501' || textoErro.includes('row-level security') || textoErro.includes('permission')) {
        setErro('Sem permissão no banco para solicitar entrada na sala.')
      } else if (code === '23505' || textoErro.includes('duplicate key')) {
        setErro('Você já tem uma solicitação pendente para essa sala.')
      } else if (code.includes('blocked') || textoErro.includes('bloqueado')) {
        setErro('Você foi bloqueado nesta sala e não pode solicitar novamente.')
      } else if (code.includes('code_not_found') || code.includes('not_found') || textoErro.includes('codigo')) {
        setErro('Código de sala inválido ou não encontrado.')
      } else if (textoErro.includes('perfil do usuario nao encontrado')) {
        setErro('Seu perfil não foi encontrado no banco. Faça login novamente.')
      } else {
        setErro('Não foi possível solicitar entrada agora.')
      }
      setSucesso('')
    } finally {
      setSolicitandoEntrada(false)
    }
  }

  function validarFormSala(values = formSala) {
    const erros = {}
    if (!sanitizeText(values.name)) erros.name = 'Informe o nome da turma.'
    if (!sanitizeText(values.subject)) erros.subject = 'Informe a matéria.'
    if (!sanitizeText(values.grade)) erros.grade = 'Informe a série.'
    return erros
  }

  function atualizarCampoSala(field, value) {
    setFormSala((prev) => ({ ...prev, [field]: value }))
    setFormSalaErros((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  function tocarCampoSala(field) {
    setFormSalaTouched((prev) => ({ ...prev, [field]: true }))
    const erros = validarFormSala()
    setFormSalaErros((prev) => ({
      ...prev,
      ...(erros[field] ? { [field]: erros[field] } : {}),
    }))
  }

  async function criarSalaProfessor(event) {
    event.preventDefault()
    if (criandoSala) return
    if (!perfil?.id) return

    const errosFormulario = validarFormSala()
    if (Object.keys(errosFormulario).length > 0) {
      setFormSalaErros(errosFormulario)
      setFormSalaTouched({
        name: true,
        subject: true,
        grade: true,
      })
      setErro(Object.values(errosFormulario)[0])
      setSucesso('')
      return
    }

    const perfilProfessor = perfil
    const nome = sanitizeText(formSala.name)
    const materia = sanitizeText(formSala.subject)
    const serie = sanitizeText(formSala.grade)
    const descricao = sanitizeText(formSala.description)

    setCriandoSala(true)
    try {
      const { data, error } = await supabase.rpc('classroom_create', {
        p_name: nome,
        p_subject: materia,
        p_grade: serie,
        p_description: descricao || null,
      })
      if (error) throw error

      const salaDb = Array.isArray(data) ? data[0] : data
      const classroomIdDb = sanitizeText(salaDb?.classroom_id || salaDb?.id || '')
      const classroomCodeDb = normalizeClassroomCode(salaDb?.code || '')

      console.log('[CLASSROOM_CREATE] code:', salaDb?.code || '')
      console.log('[CLASSROOM_CREATE] normalized:', classroomCodeDb)
      console.log('[CLASSROOM_CREATE] id:', classroomIdDb)

      if (!classroomIdDb || !classroomCodeDb) {
        throw new Error('A sala não retornou id/código válidos no banco.')
      }

      const { data: previewData, error: previewError } = await supabase.rpc(
        'classroom_preview_by_code',
        {
          p_code: classroomCodeDb,
        }
      )
      if (previewError) throw previewError
      const classroomRow = Array.isArray(previewData) ? previewData[0] : previewData
      const classroomPreviewId = sanitizeText(classroomRow?.classroom_id || classroomRow?.id || '')
      if (!classroomPreviewId) throw new Error('A sala criada não foi encontrada no banco.')

      const codeSaved = normalizeClassroomCode(classroomRow.code || '')
      const teacherSaved = sanitizeText(classroomRow.teacher_profile_id || '')
      const activeSaved = classroomRow.is_active !== false
      console.log('[CLASSROOM_CREATE] saved_code:', codeSaved)
      console.log('[CLASSROOM_CREATE] saved_teacher_id:', teacherSaved)
      console.log('[CLASSROOM_CREATE] saved_is_active:', activeSaved)

      if (!codeSaved) throw new Error('O campo code da sala ficou vazio no banco.')
      if (classroomPreviewId !== classroomIdDb) {
        throw new Error('A sala criada retornou um id diferente na validação por código.')
      }
      if (teacherSaved !== perfilProfessor.id) {
        throw new Error('teacherId salvo no banco não corresponde ao usuário atual.')
      }
      if (!activeSaved) {
        throw new Error('A sala foi criada como inativa no banco.')
      }

      const created = createClassroomForTeacher({
        teacher: {
          ...perfilProfessor,
          role: 'teacher',
        },
        name: nome,
        subject: materia,
        grade: serie,
        description: descricao,
        classroomId: classroomIdDb,
        code: codeSaved || classroomCodeDb,
      })

      setFormSala({
        name: '',
        subject: '',
        grade: '',
        description: '',
      })
      setFormSalaErros({})
      setFormSalaTouched({})
      setCodigoGeradoRecente(codeSaved || classroomCodeDb || created?.classroom?.code || '')
      setErro('')
      setSucesso('Sala criada com sucesso.')
      await sincronizarSalaAoVivo(perfilProfessor, 'background')
    } catch (error) {
      console.log('[CLASSROOM_CREATE] error:', error)
      const raw = `${error?.message || error?.details || ''}`.toLowerCase()
      if (raw.includes('somente professor')) {
        setErro('Seu perfil ainda não esta como professor. Atualize o tipo de conta para criar salas.')
      } else if (raw.includes('classroom_create') && raw.includes('function')) {
        setErro('Criação de sala não configurada no banco. Execute o SQL de setup.')
      } else if (raw.includes('permission') || raw.includes('permiss')) {
        setErro('Sem permissão no banco para criar sala.')
      } else if (raw.includes('perfil do usuario nao encontrado')) {
        setErro('Seu perfil não foi encontrado no banco. Faça login novamente.')
      } else {
        setErro(`Não foi possível criar a sala agora. Detalhe: ${error?.message || 'erro desconhecido'}`)
      }
      setCodigoGeradoRecente('')
      setSucesso('')
    } finally {
      setCriandoSala(false)
    }
  }

  async function revisarSolicitacao(requestId, approve) {
    if (!requestId || revisandoSolicitacaoId) return
    setRevisandoSolicitacaoId(requestId)
    try {
      reviewClassroomJoinRequest({
        requestId,
        teacherId: perfil.id,
        approve,
      })
      setErro('')
      setSucesso(approve ? 'Aluno aprovado na sala.' : 'Solicitação recusada.')
      await sincronizarSalaAoVivo(perfil, 'background')
    } catch {
      setErro('Não foi possível revisar a solicitação agora.')
      setSucesso('')
    } finally {
      setRevisandoSolicitacaoId('')
    }
  }

  function atualizarItemAtualNoHistorico(patch) {
    if (!analysisIdAtual) return
    const atual = loadAnalysisFromHistory(historico, analysisIdAtual)
    if (!atual) return

    const mergedStatus = {
      ...atual.status,
      ...(patch.status || {}),
    }

    const nextHistory = saveAnalysisToHistory(historico, {
      ...atual,
      ...patch,
      status: mergedStatus,
    })
    persistirHistorico(nextHistory)
  }

  function limparLaboratorio() {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }

    setArquivoSelecionado(null)
    setPreviewUrl('')
    setTextoDigitalizado('')
    setEscaneandoTexto(false)
    setProgressoOcr(0)
    setConfiancaOcr(0)
    setResumoGerado('')
    setResumoRevisado(false)
    setTopicosPrincipaisTexto('')
    setPontosSugeridos([])
    setObservacoesTexto('')
    setEditandoResumo(false)
    setAnalysisIdAtual('')
    setEtapa(1)
    setLaboratorioView('escanear')
    limparMensagens()
  }

  function abrirAbaLaboratorio(view) {
    setLaboratorioView(view)
    setEtapa(mapLaboratorioViewToStep(view))
    setMenuHistoricoId('')
  }

  function abrirSeletorCamera() {
    const input = document.getElementById('oxente-scan-camera')
    if (input) input.click()
  }

  async function carregarPerfil() {
    const timeoutId = window.setTimeout(() => {
      setMensagemDemora('Esta demorando mais que o normal.')
    }, 4000)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/auth')
        return
      }

      let perfilData = null

      const perfilCompleto = await supabase
        .from('profiles')
        .select('id, nome, username, role, teacher_subject, teacher_school, teacher_registration, teacher_department')
        .eq('account_id', user.id)
        .single()

      if (!perfilCompleto.error) {
        perfilData = perfilCompleto.data
      } else {
        const erroMensagem = `${perfilCompleto.error?.message || ''}`.toLowerCase()
        const faltaColunaProfessor =
          erroMensagem.includes('teacher_subject') ||
          erroMensagem.includes('teacher_school') ||
          erroMensagem.includes('teacher_registration') ||
          erroMensagem.includes('teacher_department') ||
          erroMensagem.includes('column')

        if (!faltaColunaProfessor) throw perfilCompleto.error

        const perfilBasico = await supabase
          .from('profiles')
          .select('id, nome, username, role')
          .eq('account_id', user.id)
          .single()

        if (perfilBasico.error) throw perfilBasico.error
        perfilData = perfilBasico.data
      }

      const perfilNormalizado = perfilData

      safeWriteLocalStorage(OXENTE_CLASSROOM_CLEANUP_KEY, true)

      setPerfil(perfilNormalizado)
      await sincronizarSalaAoVivo(perfilNormalizado, 'initial')
      setMetaAtividade((prev) => ({
        ...prev,
        studentName: prev.studentName || perfilNormalizado?.nome || '',
      }))
      setMensagemDemora('')
    } catch {
      setErro('Não foi possível carregar seu perfil.')
    } finally {
      window.clearTimeout(timeoutId)
      setCarregando(false)
    }
  }

  async function selecionarArquivo(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    if (!isSupportedFile(file)) {
      setErro('Formato inválido. Use PNG, JPG, JPEG ou PDF.')
      setSucesso('')
      return
    }

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }

    const nextPreview = URL.createObjectURL(file)

    setArquivoSelecionado(file)
    setPreviewUrl(nextPreview)
    setProgressoOcr(0)
    setConfiancaOcr(0)
    setTextoDigitalizado('')
    setResumoGerado('')
    setResumoRevisado(false)
    setEditandoResumo(false)
    setTopicosPrincipaisTexto('')
    setPontosSugeridos([])
    setObservacoesTexto('')
    setAnalysisIdAtual('')
    setEtapa(2)
    setLaboratorioView('escanear')
    setErro('')

    setSucesso('Arquivo pronto. Clique em "Digitalizar texto" para continuar.')
  }

  async function scanActivityImageFlow() {
    if (!arquivoSelecionado) {
      setErro('Envie uma imagem ou PDF antes de digitalizar.')
      setSucesso('')
      return
    }

    setEscaneandoTexto(true)
    setProgressoOcr(0)
    setConfiancaOcr(0)
    limparMensagens()

    try {
      const scanResult = await scanActivityImage(arquivoSelecionado, {
        onProgress: (value) => setProgressoOcr(value),
      })

      if (!scanResult.normalizedText) {
        setErro(
          'N\u00e3o consegui ler a imagem com clareza. Tente enviar uma foto mais n\u00edtida, com boa luz e sem cortes.'
        )
        setSucesso('')
        return
      }

      const fallbackTitle = arquivoSelecionado.name
        ? arquivoSelecionado.name.replace(/\.[^/.]+$/, '')
        : 'Atividade Digitalizada'

      setTextoDigitalizado(scanResult.normalizedText)
      setConfiancaOcr(scanResult.confidence || 0)
      setProgressoOcr(100)
      setResumoGerado('')
      setResumoRevisado(false)
      setEditandoResumo(false)
      setTopicosPrincipaisTexto('')
      setPontosSugeridos([])
      setObservacoesTexto(scanResult.observations.join('\n'))
      setEtapa(3)
      setLaboratorioView('revisar')

      if (!sanitizeText(metaAtividade.activityTitle)) {
        setMetaAtividade((prev) => ({
          ...prev,
          activityTitle: fallbackTitle,
        }))
      }

      const novoId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const novoItem = {
        id: novoId,
        activityTitle: sanitizeText(metaAtividade.activityTitle) || fallbackTitle,
        studentName: sanitizeText(metaAtividade.studentName),
        subject: sanitizeText(metaAtividade.subject),
        activityDate: metaAtividade.activityDate,
        topic: 'geral',
        recognizedText: scanResult.normalizedText,
        summary: '',
        keyPoints: [],
        observations: scanResult.observations,
        status: {
          digitalized: true,
          summaryGenerated: false,
          wordCreated: false,
        },
        fileName: arquivoSelecionado.name || '',
        source: scanResult.source || '',
        confidence: scanResult.confidence || 0,
        illegibleCount: scanResult.illegibleCount || 0,
      }

      const nextHistory = saveAnalysisToHistory(historico, novoItem)
      persistirHistorico(nextHistory)
      setAnalysisIdAtual(novoId)
      setSucesso('Texto digitalizado com sucesso. Revise o texto antes de gerar o resumo.')
    } catch {
      setErro('Falha no escaneamento agora. Tente novamente em alguns instantes.')
    } finally {
      setEscaneandoTexto(false)
    }
  }

  function salvarRevisaoTexto() {
    if (!textoLimpo) {
      setErro('Digitalize a atividade antes de salvar a revisão.')
      setSucesso('')
      return
    }

    setEtapa(3)
    setErro('')
    setSucesso('Revisão salva com sucesso.')

    if (analysisIdAtual) {
      atualizarItemAtualNoHistorico({
        recognizedText: textoLimpo,
        status: {
          digitalized: true,
        },
      })
      return
    }

    const novoId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const novoItem = {
      id: novoId,
      activityTitle: sanitizeText(metaAtividade.activityTitle) || 'Atividade Digitalizada',
      studentName: sanitizeText(metaAtividade.studentName),
      subject: sanitizeText(metaAtividade.subject),
      activityDate: metaAtividade.activityDate,
      topic: 'geral',
      recognizedText: textoLimpo,
      summary: '',
      keyPoints: [],
      observations: observacoesLista,
      status: {
        digitalized: true,
        summaryGenerated: false,
        wordCreated: false,
      },
      fileName: arquivoSelecionado?.name || '',
      source: arquivoSelecionado ? (isPdfFile(arquivoSelecionado) ? 'pdf' : 'image') : 'manual',
      confidence: confiancaOcr || 0,
    }

    const nextHistory = saveAnalysisToHistory(historico, novoItem)
    persistirHistorico(nextHistory)
    setAnalysisIdAtual(novoId)
  }

  function generateSummaryFlow() {
    if (!textoLimpo) {
      setErro(
        'N\u00e3o consegui ler a imagem com clareza. Tente enviar uma foto mais n\u00edtida, com boa luz e sem cortes.'
      )
      setSucesso('')
      return
    }

    const summaryData = generateStudySummary(textoLimpo, {
      subject: metaAtividade.subject,
    })

    if (!sanitizeText(summaryData.summary)) {
      setErro('Não foi possível gerar resumo com o texto atual. Revise o conteúdo digitalizado.')
      setSucesso('')
      return
    }

    const observacoesCompletas = mergeObservacoes(
      observacoesLista,
      summaryData.observations
    )

    setResumoGerado(summaryData.summary)
    setResumoRevisado(true)
    setEditandoResumo(false)
    setPontosSugeridos(summaryData.keyPoints)
    setTopicosPrincipaisTexto('')
    setObservacoesTexto(observacoesCompletas.join('\n'))
    setEtapa(4)
    setLaboratorioView('resumir')
    setErro('')
    setSucesso('Resumo gerado. Agora você pode editar e gerar os pontos principais.')

    if (analysisIdAtual) {
      atualizarItemAtualNoHistorico({
        topic: summaryData.topic,
        recognizedText: textoLimpo,
        summary: summaryData.summary,
        keyPoints: summaryData.keyPoints,
        observations: observacoesCompletas,
        status: {
          summaryGenerated: true,
        },
      })
    } else {
      const novoId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const novoItem = {
        id: novoId,
        activityTitle: sanitizeText(metaAtividade.activityTitle) || 'Atividade Digitalizada',
        studentName: sanitizeText(metaAtividade.studentName),
        subject: sanitizeText(metaAtividade.subject),
        activityDate: metaAtividade.activityDate,
        topic: summaryData.topic,
        recognizedText: textoLimpo,
        summary: summaryData.summary,
        keyPoints: summaryData.keyPoints,
        observations: observacoesCompletas,
        status: {
          digitalized: true,
          summaryGenerated: true,
          wordCreated: false,
        },
        fileName: arquivoSelecionado?.name || '',
        source: arquivoSelecionado ? (isPdfFile(arquivoSelecionado) ? 'pdf' : 'image') : 'manual',
        confidence: confiancaOcr || 0,
      }
      const nextHistory = saveAnalysisToHistory(historico, novoItem)
      persistirHistorico(nextHistory)
      setAnalysisIdAtual(novoId)
    }
  }

  function generateKeyPointsFlow() {
    if (!textoLimpo) {
      setErro('Digitalize a atividade antes de gerar os pontos principais.')
      setSucesso('')
      return
    }

    if (!resumoLimpo) {
      setErro('Gere o resumo antes de gerar os pontos principais.')
      setSucesso('')
      return
    }

    const points = generateStudyKeyPoints(textoLimpo, {
      subject: metaAtividade.subject,
    })
    const finalPoints = points.length > 0 ? points : pontosSugeridos

    if (!finalPoints || finalPoints.length === 0) {
      setErro('Não foi possível gerar pontos principais com o texto atual. Revise o conteúdo.')
      setSucesso('')
      return
    }

    setTopicosPrincipaisTexto(finalPoints.join('\n'))
    setEtapa(5)
    setLaboratorioView('resumir')
    setErro('')
    setSucesso('Pontos principais gerados. Agora você já pode exportar o Word.')

    atualizarItemAtualNoHistorico({
      recognizedText: textoLimpo,
      summary: resumoLimpo,
      keyPoints: finalPoints,
      observations: observacoesLista,
      status: {
        summaryGenerated: true,
      },
    })
  }

  async function exportarWordAtual() {
    if (!textoLimpo) {
      setErro('Digitalize a atividade antes de exportar.')
      setSucesso('')
      return
    }

    if (!resumoLimpo) {
      setErro('Gere o resumo antes de exportar para Word.')
      setSucesso('')
      return
    }

    if (topicosPrincipais.length === 0) {
      setErro('Gere os pontos principais antes de exportar.')
      setSucesso('')
      return
    }

    setExportandoWord(true)
    limparMensagens()

    try {
      const blob = createEditableWordDocument({
        title: sanitizeText(metaAtividade.activityTitle) || 'Atividade Digitalizada',
        studentName: sanitizeText(metaAtividade.studentName),
        subject: sanitizeText(metaAtividade.subject),
        activityDate: metaAtividade.activityDate,
        digitalizedText: textoLimpo,
        summary: resumoLimpo,
        keyPoints: topicosPrincipais,
        observations: observacoesLista,
      })

      if (!blob || Number(blob.size || 0) < 600) {
        throw new Error('Word gerado sem conteúdo editável.')
      }

      baixarBlobWord(blob, buildWordFileName(metaAtividade.activityTitle))

      const nextStats = {
        ...stats,
        exportsWord: Number(stats.exportsWord || 0) + 1,
      }
      persistirStats(nextStats)

      atualizarItemAtualNoHistorico({
        activityTitle: sanitizeText(metaAtividade.activityTitle) || 'Atividade Digitalizada',
        studentName: sanitizeText(metaAtividade.studentName),
        subject: sanitizeText(metaAtividade.subject),
        activityDate: metaAtividade.activityDate,
        recognizedText: textoLimpo,
        summary: resumoLimpo,
        keyPoints: topicosPrincipais,
        observations: observacoesLista,
        status: {
          digitalized: true,
          summaryGenerated: true,
          wordCreated: true,
        },
      })

      if (!analysisIdAtual) {
        const novoId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const novoItem = {
          id: novoId,
          activityTitle: sanitizeText(metaAtividade.activityTitle) || 'Atividade Digitalizada',
          studentName: sanitizeText(metaAtividade.studentName),
          subject: sanitizeText(metaAtividade.subject),
          activityDate: metaAtividade.activityDate,
          topic: 'geral',
          recognizedText: textoLimpo,
          summary: resumoLimpo,
          keyPoints: topicosPrincipais,
          observations: observacoesLista,
          status: {
            digitalized: true,
            summaryGenerated: true,
            wordCreated: true,
          },
          fileName: arquivoSelecionado?.name || '',
          source: arquivoSelecionado ? (isPdfFile(arquivoSelecionado) ? 'pdf' : 'image') : 'manual',
          confidence: confiancaOcr || 0,
        }
        const nextHistory = saveAnalysisToHistory(historico, novoItem)
        persistirHistorico(nextHistory)
        setAnalysisIdAtual(novoId)
      }

      setEtapa(6)
      setLaboratorioView('exportar')
      setSucesso('Word criado com texto editável e estrutura organizada.')
    } catch {
      setErro('Não foi possível exportar o Word agora. Verifique se há texto, resumo e pontos principais.')
    } finally {
      setExportandoWord(false)
    }
  }

  async function exportarWordDoHistorico(historyId) {
    const item = loadAnalysisFromHistory(historico, historyId)
    if (!item) {
      setErro('Análise não encontrada no histórico.')
      setSucesso('')
      return
    }

    if (!sanitizeText(item.recognizedText)) {
      setErro('Digitalize a atividade antes de exportar.')
      setSucesso('')
      return
    }

    if (!sanitizeText(item.summary)) {
      setErro('Gere o resumo antes de exportar para Word.')
      setSucesso('')
      return
    }

    if (!Array.isArray(item.keyPoints) || item.keyPoints.length === 0) {
      setErro('Gere os pontos principais antes de exportar.')
      setSucesso('')
      return
    }

    setExportandoWord(true)
    limparMensagens()

    try {
      const blob = createEditableWordDocument({
        title: item.activityTitle || 'Atividade Digitalizada',
        studentName: item.studentName || '',
        subject: item.subject || '',
        activityDate: item.activityDate || '',
        digitalizedText: item.recognizedText,
        summary: item.summary,
        keyPoints: item.keyPoints,
        observations: Array.isArray(item.observations) ? item.observations : [],
      })

      if (!blob || Number(blob.size || 0) < 600) {
        throw new Error('Word gerado sem conteúdo editável.')
      }

      baixarBlobWord(blob, buildWordFileName(item.activityTitle))

      const nextStats = {
        ...stats,
        exportsWord: Number(stats.exportsWord || 0) + 1,
      }
      persistirStats(nextStats)

      const nextHistory = saveAnalysisToHistory(historico, {
        ...item,
        status: {
          ...item.status,
          wordCreated: true,
        },
      })
      persistirHistorico(nextHistory)

      setErro('')
      setSucesso('Word exportado a partir do histórico com texto editável.')
    } catch {
      setErro('Não foi possível exportar o Word deste item agora.')
    } finally {
      setExportandoWord(false)
    }
  }

  function excluirItemHistorico(historyId) {
    const existe = historico.some((item) => item.id === historyId)
    if (!existe) {
      setErro('Análise não encontrada no histórico.')
      setSucesso('')
      return
    }

    const nextHistory = historico.filter((item) => item.id !== historyId)
    persistirHistorico(nextHistory)
    setMenuHistoricoId('')

    if (analysisIdAtual === historyId) {
      limparLaboratorio()
    }

    setErro('')
    setSucesso('Item removido do histórico.')
  }

  function reabrirAnalise(historyId) {
    const item = loadAnalysisFromHistory(historico, historyId)
    if (!item) {
      setErro('Análise não encontrada no histórico.')
      setSucesso('')
      return
    }

    const hasPoints = Array.isArray(item.keyPoints) && item.keyPoints.length > 0
    const etapaReabertura = item.status?.wordCreated
      ? 6
      : hasPoints
      ? 5
      : item.status?.summaryGenerated
      ? 4
      : 3

    setTab('laboratorio')
    setEtapa(etapaReabertura)
    setLaboratorioView(mapStepToLaboratorioView(etapaReabertura))
    setMetaAtividade((prev) => ({
      ...prev,
      activityTitle: item.activityTitle || prev.activityTitle,
      studentName: item.studentName || prev.studentName,
      subject: item.subject || prev.subject,
      activityDate: item.activityDate || prev.activityDate,
    }))
    setTextoDigitalizado(item.recognizedText || '')
    setResumoGerado(item.summary || '')
    setTopicosPrincipaisTexto((item.keyPoints || []).join('\n'))
    setPontosSugeridos(item.keyPoints || [])
    setObservacoesTexto((item.observations || []).join('\n'))
    setResumoRevisado(Boolean(item.summary))
    setEditandoResumo(false)
    setConfiancaOcr(Number(item.confidence || 0))
    setAnalysisIdAtual(item.id)
    setMenuHistoricoId('')
    setErro('')
    setSucesso('Análise carregada no Laboratório para revisão.')
  }

  function registrarEventoRotina(texto, tipo = 'atividade') {
    const evento = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: tipo,
      text: texto,
      createdAt: new Date().toISOString(),
    }
    persistirRotina({
      activityLog: [evento, ...activityLog].slice(0, 40),
    })
  }

  function atualizarStatusTarefa(task, novoStatus) {
    if (!task?.id) return
    const completedAt = novoStatus === 'completed' ? new Date().toISOString() : ''

    const nextTasks = [...studyTasks]
    const index = nextTasks.findIndex((item) => item.id === task.id)
    if (index >= 0) {
      nextTasks[index] = {
        ...nextTasks[index],
        status: novoStatus,
        completedAt,
      }
    } else {
      nextTasks.unshift({
        ...task,
        status: novoStatus,
        completedAt,
      })
    }

    persistirRotina({ tasks: nextTasks })
    if (novoStatus === 'completed') {
      registrarEventoRotina(`Tarefa concluída: ${task.title}`, 'task')
    }
  }

  function concluirRevisao(reviewId) {
    const nextReviews = studyReviews.map((review) =>
      review.id === reviewId ? { ...review, status: 'completed' } : review
    )
    persistirRotina({ reviews: nextReviews })

    const revisao = studyReviews.find((item) => item.id === reviewId)
    if (revisao) {
      registrarEventoRotina(`Revisão concluída: ${revisão.title}`, 'review')
    }
  }

  function criarRotinaAutomatica() {
    const materiasBase = [
      ...new Set(
        [
          ...studyTasks.map((task) => task.subject),
          ...gruposSalaAprovados.map((group) => group.subject),
          metaAtividade.subject,
        ].filter(Boolean)
      ),
    ]

    if (materiasBase.length === 0) {
      setErro('Cadastre ao menos uma matéria para criar a rotina automática.')
      setSucesso('')
      return
    }

    const novasTarefas = materiasBase.slice(0, 5).map((subject, index) => ({
      id: `auto-${Date.now()}-${index}`,
      userId: perfil?.id || '',
      title: `Sessão de estudo: ${subject}`,
      subject,
      type: index % 2 === 0 ? 'estudo' : 'revisão',
      dueDate: toIsoDate(addDays(new Date(), index)),
      estimatedMinutes: index % 2 === 0 ? 40 : 25,
      status: 'pending',
      source: 'auto',
      sourceId: '',
      createdAt: new Date().toISOString(),
      completedAt: '',
    }))

    persistirRotina({
      tasks: [...novasTarefas, ...studyTasks].slice(0, 120),
    })
    registrarEventoRotina('Rotina automática criada com base nas matérias e prazos.', 'plan')
    setErro('')
    setSucesso('Rotina automática criada com sucesso.')
  }

  function adicionarResumoNaRotina() {
    if (!resumoLimpo) {
      setErro('Gere um resumo antes de adicionar à rotina.')
      setSucesso('')
      return
    }

    const tituloResumo = sanitizeText(metaAtividade.activityTitle) || 'Resumo do Laboratório'
    const subject = sanitizeText(metaAtividade.subject) || 'Geral'
    const now = new Date()
    const novasRevisoes = [1, 3, 7, 15].map((days, index) => ({
      id: `review-lab-${Date.now()}-${index}`,
      userId: perfil?.id || '',
      title: tituloResumo,
      subject,
      contentId: analysisIdAtual || '',
      reviewDate: toIsoDate(addDays(now, days)),
      reviewStage: index + 1,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }))
    const novaTarefa = {
      id: `task-lab-${Date.now()}`,
      userId: perfil?.id || '',
      title: `Revisar resumo: ${tituloResumo}`,
      subject,
      type: 'resumo',
      dueDate: toIsoDate(addDays(now, 1)),
      estimatedMinutes: 20,
      status: 'pending',
      source: 'laboratorio',
      sourceId: analysisIdAtual || '',
      createdAt: new Date().toISOString(),
      completedAt: '',
    }

    persistirRotina({
      tasks: [novaTarefa, ...studyTasks].slice(0, 120),
      reviews: [...novasRevisoes, ...studyReviews].slice(0, 160),
    })

    registrarEventoRotina(`Resumo adicionado à rotina: ${tituloResumo}`, 'lab')
    setErro('')
    setSucesso('Resumo criado: adicionado à rotina com revisões automáticas.')
  }

  function iniciarFoco() {
    const segundos = Math.max(1, Number(focusMinutes || 25)) * 60
    if (focusStatus === 'paused') {
      setFocusStatus('running')
      setErro('')
      setSucesso('')
      return
    }

    setFocusRemainingSeconds(segundos)
    setFocusSessionStartedAt(new Date().toISOString())
    setFocusStatus('running')
    setErro('')
    setSucesso('')
  }

  function pausarFoco() {
    if (focusStatus !== 'running') return
    setFocusStatus('paused')
  }

  function concluirFoco(origem = 'manual') {
    if (!focusSessionStartedAt) return

    const totalSegundos = Math.max(1, Number(focusMinutes || 25)) * 60
    const consumido = Math.max(totalSegundos - focusRemainingSeconds, 0)
    const minutosConcluidos = Math.max(1, Math.round(consumido / 60))

    const session = {
      id: `focus-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      userId: perfil?.id || '',
      subject: sanitizeText(metaAtividade.subject) || 'Geral',
      taskId: '',
      durationMinutes: minutosConcluidos,
      mode: focusMode,
      status: 'completed',
      startedAt: focusSessionStartedAt,
      completedAt: new Date().toISOString(),
    }

    persistirRotina({
      sessions: [session, ...studySessions].slice(0, 120),
    })
    registrarEventoRotina(
      `Sessão de foco concluída (${minutosConcluidos} min) - ${origem === 'timer' ? 'automaticamente' : 'manual'}.`,
      'focus'
    )
    setFocusStatus('completed')
    setFocusSessionStartedAt('')
    setFocusRemainingSeconds(Math.max(1, Number(focusMinutes || 25)) * 60)
    setErro('')
    setSucesso('Sessão de foco concluída e registrada.')
  }

  function abrirLaboratorio(step = 1) {
    setTab('laboratorio')
    setEtapa(step)
    setLaboratorioView(mapStepToLaboratorioView(step))
    setMenuHistoricoId('')
  }

  if (carregando) {
    return <SocialLoader variant="editor" showBottomNav />
  }

  return (
    <div className="container">
      <div className="topbar academy-topbar">
        <button
          type="button"
          className="edit-back-btn oxente-icon-back-btn"
          onClick={() => navigate('/perfil')}
          aria-label="Voltar"
        >
          <IconArrowLeft />
        </button>
        <h1>{tituloTopbar}</h1>
        <button type="button" className="edit-save-link" onClick={() => navigate('/academia')}>
          Academia
        </button>
      </div>

      <div className="page oxente-page oxente-v2-page">
        {erro ? <div className="alert-box erro-box">{erro}</div> : null}
        {sucesso ? <div className="alert-box ok-box">{sucesso}</div> : null}

        {tab ? (
          <section className="oxente-hero-card oxente-v2-hero-card">
            <div className="oxente-hero-copy">
              <p className="oxente-kicker">Área de estudos e organização</p>
              <h2>Atividades</h2>
              <p>Organize seu dia entre Sala, Laboratório, Biblioteca e Rotina de Estudos.</p>
              <p className="oxente-user-chip">
                {perfil?.nome || 'Aluno'} @{perfil?.username || 'usuario'}
              </p>
            </div>

            <img src={logoOxente} alt="Logo Atividades" className="oxente-hero-logo" />
          </section>
        ) : null}

        <div className="oxente-hub-icon-nav" role="tablist" aria-label="Navegação de atividades">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`oxente-hub-icon-btn ${tab === item.id ? 'active' : ''}`}
              onClick={() => {
                if (item.id === 'sala') {
                  navigate('/mensagens/grupos/novo')
                  return
                }
                setTab(item.id)
                if (item.id === 'laboratorio') {
                  setEtapa(1)
                  setLaboratorioView('inicio')
                  setMenuHistoricoId('')
                }
                if (item.id === 'rotina') {
                  setRotinaView('hoje')
                }
              }}
            >
              <span className="oxente-hub-icon-visual">{renderLaboratorioIcon(item.icon)}</span>
              <span className="oxente-hub-icon-label">{item.label}</span>
            </button>
          ))}
        </div>
        {tab === 'sala' ? (
          <section className="oxente-section">
            <article className="oxente-card oxente-v2-sala-intro">
              <h3>Sala de Aula</h3>
              <p>Crie turmas, aprove alunos por código e organize atividades.</p>
            </article>

            {mensagemDemora ? (
              <article className="oxente-card oxente-v2-timeout-card">
                <p>{mensagemDemora}</p>
                <button
                  type="button"
                  className="btn btn-secondary oxente-v2-secondary-btn"
                  onClick={() => void sincronizarSalaAoVivo(perfil, 'initial')}
                >
                  Tentar novamente
                </button>
              </article>
            ) : null}

            {classroomLoadState === 'error' ? (
              <article className="oxente-card">
                <h3>Erro ao carregar salas</h3>
                <p>Não foi possível carregar as salas agora.</p>
                <button
                  type="button"
                  className="btn btn-secondary oxente-v2-secondary-btn"
                  onClick={() => void sincronizarSalaAoVivo(perfil, 'initial')}
                >
                  Tentar novamente
                </button>
              </article>
            ) : null}

            {perfil?.id ? (
              <article className="oxente-card oxente-v2-form-card" id="oxente-criar-sala-card">
                <h3>Criar nova sala</h3>
                <form className="oxente-v2-form-grid" onSubmit={criarSalaProfessor}>
                  <label className="oxente-v2-label-stack">
                    Nome da turma
                    <input
                      className="edit-input"
                      type="text"
                      value={formSala.name}
                      onChange={(event) => atualizarCampoSala('name', event.target.value)}
                      onBlur={() => tocarCampoSala('name')}
                      placeholder="Ex: 2º ano C Informática"
                      required
                    />
                    {formSalaTouched.name && formSalaErros.name ? (
                      <small className="oxente-v2-field-error">{formSalaErros.name}</small>
                    ) : null}
                  </label>

                  <label className="oxente-v2-label-stack">
                    Matéria
                    <input
                      className="edit-input"
                      type="text"
                      value={formSala.subject}
                      onChange={(event) => atualizarCampoSala('subject', event.target.value)}
                      onBlur={() => tocarCampoSala('subject')}
                      placeholder="Ex: Física"
                      required
                    />
                    {formSalaTouched.subject && formSalaErros.subject ? (
                      <small className="oxente-v2-field-error">{formSalaErros.subject}</small>
                    ) : null}
                  </label>

                  <label className="oxente-v2-label-stack">
                    Série
                    <input
                      className="edit-input"
                      type="text"
                      value={formSala.grade}
                      onChange={(event) => atualizarCampoSala('grade', event.target.value)}
                      onBlur={() => tocarCampoSala('grade')}
                      placeholder="Ex: 2º ano C"
                      required
                    />
                    {formSalaTouched.grade && formSalaErros.grade ? (
                      <small className="oxente-v2-field-error">{formSalaErros.grade}</small>
                    ) : null}
                  </label>

                  <label className="oxente-v2-label-stack">
                    Descrição
                    <textarea
                      className="edit-input"
                      value={formSala.description}
                      onChange={(event) => atualizarCampoSala('description', event.target.value)}
                      placeholder="Opcional"
                      rows={4}
                    />
                  </label>

                  <small className="oxente-v2-field-hint">
                    Campos obrigatórios: nome da turma, matéria e série.
                  </small>

                  <button
                    type="submit"
                    className="btn edit-submit-btn oxente-v2-form-submit"
                    disabled={criandoSala || !podeCriarSala}
                  >
                    {criandoSala ? 'Criando...' : 'Criar sala'}
                  </button>
                </form>

                {codigoGeradoRecente ? (
                  <div className="oxente-v2-code-card">
                    <strong>Sala criada com sucesso</strong>
                    <span>Código da sala:</span>
                    <div className="oxente-v2-code-inline">
                      <span>{codigoGeradoRecente}</span>
                      <button
                        type="button"
                        className="oxente-v2-mini-btn"
                        onClick={() => void copiarCodigoSala(codigoGeradoRecente)}
                      >
                        Copiar código
                      </button>
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  className="btn btn-secondary oxente-v2-secondary-btn"
                  onClick={() => void limparTodasSalasAntigas()}
                  disabled={limpandoSalas}
                >
                  {limpandoSalas ? 'Limpando salas...' : 'Limpar salas antigas'}
                </button>
              </article>
            ) : null}

            <article className="oxente-card oxente-v2-form-card">
              <h3>Entrar com código</h3>
              <p>Digite o código da sala para solicitar aprovação do professor.</p>

              <div className="oxente-v2-code-row">
                <input
                  className="edit-input"
                  type="text"
                  value={codigoSala}
                  onChange={(event) => {
                    const valor = `${event.target.value || ''}`
                    if (!valor.trim()) {
                      setCodigoSala('')
                      return
                    }
                    const extraido = extrairCodigoSala(valor)
                    setCodigoSala(normalizeClassroomCode(extraido || valor))
                  }}
                  onBlur={(event) => {
                    const valor = `${event.target.value || ''}`
                    if (!valor.trim()) {
                      setCodigoSala('')
                      return
                    }
                    const extraido = extrairCodigoSala(valor)
                    setCodigoSala(normalizeClassroomCode(extraido || valor))
                  }}
                  placeholder="NEXO-8F4K2"
                />
                <button type="button" className="btn btn-secondary oxente-v2-secondary-btn" onClick={revisarCodigoSala}>
                  Revisar código
                </button>
              </div>

              {codigoPreview ? (
                <div className="oxente-v2-code-preview">
                  <strong>{codigoPreview.name}</strong>
                  <span>Matéria: {codigoPreview.subject || 'Não informada'}</span>
                  <span>Professor: {codigoPreview.teacherName || 'Não informado'}</span>
                  <span>Status: {classroomStatusLabel(codigoPreview.membershipStatus)}</span>
                  <button
                    type="button"
                    className="btn edit-submit-btn"
                    onClick={() => void solicitarEntradaComCodigo()}
                    disabled={solicitandoEntrada || codigoPreview.membershipStatus === classroomMembershipStatus.approved}
                  >
                    {solicitandoEntrada ? 'Enviando...' : 'Solicitar entrada'}
                  </button>
                </div>
              ) : null}
            </article>

            {classroomRequests.length > 0 ? (
              <article className="oxente-card">
                <h3>Solicitações de entrada</h3>
                <div className="oxente-v2-request-list">
                  {classroomRequests.map((request) => (
                    <div key={request.id} className="oxente-v2-request-item">
                      <div>
                        <strong>{request.studentName}</strong>
                        <span>@{request.studentHandle || 'aluno'} - {request.classroomName}</span>
                        <small>{formatarDataHora(request.requestedAt)}</small>
                      </div>
                      <div className="oxente-v2-sala-actions">
                        <button
                          type="button"
                          className="oxente-v2-mini-btn"
                          onClick={() => void revisarSolicitacao(request.id, true)}
                          disabled={revisandoSolicitacaoId === request.id}
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          className="oxente-v2-mini-btn"
                          onClick={() => void revisarSolicitacao(request.id, false)}
                          disabled={revisandoSolicitacaoId === request.id}
                        >
                          Recusar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ) : null}

            {gruposSala.length === 0 ? (
              <article className="oxente-card">
                <h3>Nenhuma sala encontrada ainda.</h3>
                <p>
                  Crie uma sala para gerar código ou use "Entrar com código" para participar de uma turma.
                </p>
                  <button
                    type="button"
                    className="btn edit-submit-btn"
                    onClick={() => {
                      const formCard = document.querySelector('#oxente-criar-sala-card')
                      if (formCard) {
                        formCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
                      }
                  }}
                >
                  Criar sala
                </button>
              </article>
            ) : (
              <div className="oxente-grid oxente-v2-sala-grid">
                <article className="oxente-card">
                  <h3>Minhas salas e solicitações</h3>
                  <div className="oxente-v2-sala-list">
                    {gruposSala.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        className={`oxente-v2-sala-item ${
                          grupoSalaSelecionado?.id === group.id ? 'active' : ''
                        }`}
                        onClick={() => {
                          setMenuSalaAberto(false)
                          setGrupoSalaSelecionadoId(group.id)
                        }}
                      >
                        <strong>{group.title.replace(/^Grupo -\s*/i, '')}</strong>
                        <span>{group.unreadCount > 0 ? `${group.unreadCount} não lidas` : group.subject || 'Sem pendências'}</span>
                        {group.isOwner ? <small className="oxente-v2-sala-code">Código: {group.code || '-'}</small> : null}
                        <small className="oxente-v2-sala-status">{classroomStatusLabel(group.membershipStatus)}</small>
                      </button>
                    ))}
                  </div>
                </article>

                <article className="oxente-card">
                  <div className="oxente-v2-sala-head">
                    <h3>{grupoSalaSelecionado?.title?.replace(/^Grupo -\s*/i, '') || 'Sala'}</h3>
                    {grupoSalaSelecionado?.classroomId && grupoSalaSelecionado?.isOwner ? (
                      <div className="oxente-v2-sala-menu-wrap">
                        <button
                          type="button"
                          className="oxente-v2-mini-btn oxente-v2-menu-btn"
                          onClick={(event) => {
                            event.stopPropagation()
                            setMenuSalaAberto((prev) => !prev)
                          }}
                          aria-label="Mais opções da sala"
                        >
                          <IconDotsVertical />
                        </button>
                        {menuSalaAberto ? (
                          <div
                            className="oxente-v2-sala-menu"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setMenuSalaAberto(false)
                                void copiarCodigoSala(grupoSalaSelecionado?.code || grupoSalaSelecionado?.classroomCode || '')
                              }}
                            >
                              Copiar código
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuSalaAberto(false)
                                void compartilharCodigoSala(grupoSalaSelecionado)
                              }}
                            >
                              Compartilhar código
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuSalaAberto(false)
                                void editarSalaSelecionada()
                              }}
                            >
                              Editar sala
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setMenuSalaAberto(false)
                                void excluirSalaSelecionada()
                              }}
                            >
                              Excluir sala
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <p>Professor: {grupoSalaSelecionado?.teacherName || '-'}</p>
                  <p>Status: {classroomStatusLabel(grupoSalaSelecionado?.membershipStatus)}</p>
                  <p>Matéria: {grupoSalaSelecionado?.subject || 'Não informada'}</p>
                  {grupoSalaSelecionado?.isOwner ? (
                    <div className="oxente-v2-code-inline">
                      <p>Código da sala: {grupoSalaSelecionado?.code || '-'}</p>
                      {grupoSalaSelecionado?.code ? (
                        <button
                          type="button"
                          className="oxente-v2-mini-btn"
                          onClick={() => void copiarCodigoSala(grupoSalaSelecionado.code)}
                        >
                          Copiar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  <p>
                    Última atualização:{' '}
                    {grupoSalaSelecionado?.lastMessageAt
                      ? formatarDataHora(grupoSalaSelecionado.lastMessageAt)
                      : '-'}
                  </p>
                  <p>Resumo: {grupoSalaSelecionado?.lastMessage || 'Sem mensagens recentes.'}</p>

                  <div className="oxente-v2-sala-actions">
                    <button
                      type="button"
                      className="btn edit-submit-btn"
                      onClick={() => abrirConversaGrupo(grupoSalaSelecionado?.id)}
                      disabled={!grupoSalaSelecionado?.id || !grupoSalaSelecionado?.canOpenChat}
                    >
                      {grupoSalaSelecionado?.canOpenChat ? 'Abrir grupo' : 'Aguardando aprovação'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary oxente-v2-secondary-btn"
                      onClick={() => abrirLaboratorio(1)}
                      disabled={!grupoSalaSelecionado?.canOpenChat}
                    >
                      Abrir Laboratório
                    </button>
                    {!grupoSalaSelecionado?.isOwner ? (
                      <button
                        type="button"
                        className="btn btn-secondary oxente-v2-secondary-btn"
                        onClick={() => void sairDaSalaSelecionada()}
                        disabled={!grupoSalaSelecionado?.id}
                      >
                        Sair da sala
                      </button>
                    ) : null}
                    {grupoSalaSelecionado?.isOwner ? (
                      <button
                        type="button"
                        className="btn btn-secondary oxente-v2-secondary-btn"
                        onClick={() => void excluirSalaSelecionada()}
                        disabled={!grupoSalaSelecionado?.classroomId}
                      >
                        Excluir sala
                      </button>
                    ) : null}
                  </div>
                </article>
              </div>
            )}
          </section>
        ) : null}

        {tab === 'laboratorio' ? (
          <section className="oxente-section oxente-lab-app">
            <article className="oxente-card oxente-lab-header-card">
              <div className="oxente-lab-header-top">
                <button
                  type="button"
                  className="oxente-lab-back-btn"
                  onClick={() => setTab('')}
                  aria-label="Voltar"
                >
                  <IconArrowLeft />
                </button>
                <h3>Laboratório</h3>
              </div>
              <p>Digitalize atividades, gere resumos e organize seus estudos.</p>
            </article>

            <div className="oxente-lab-tabs" role="tablist" aria-label="Seções do Laboratório">
              {LABORATORIO_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={laboratorioView === item.id}
                  className={`oxente-lab-tab ${laboratorioView === item.id ? 'active' : ''}`}
                  onClick={() => abrirAbaLaboratorio(item.id)}
                >
                  <span className="oxente-lab-tab-icon">{renderLaboratorioIcon(item.icon)}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            {laboratorioView === 'inicio' ? (
              <>
                <article className="oxente-card oxente-lab-home-card">
                  <h3>Início</h3>
                  <p>Escolha uma função para continuar seu fluxo de estudo.</p>
                </article>

                {ultimoHistorico ? (
                  <article className="oxente-card oxente-lab-last-work-card">
                    <div>
                      <small>Último trabalho aberto</small>
                      <strong>{ultimoHistorico.activityTitle || 'Atividade sem título'}</strong>
                      <p>
                        {ultimoHistorico.subject || topicLabel(ultimoHistorico.topic)} ·{' '}
                        {formatarDataHora(ultimoHistorico.updatedAt || ultimoHistorico.createdAt)}
                      </p>
                    </div>
                    <button type="button" className="btn edit-submit-btn" onClick={() => reabrirAnalise(ultimoHistorico.id)}>
                      Abrir
                    </button>
                  </article>
                ) : null}

                <div className="oxente-lab-app-grid">
                  {LABORATORIO_HOME_CARDS.map((card) => (
                    <article
                      key={card.id}
                      className="oxente-lab-app-card"
                      role="button"
                      tabIndex={0}
                      onClick={() => abrirAbaLaboratorio(card.view)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          abrirAbaLaboratorio(card.view)
                        }
                      }}
                    >
                      <div className="oxente-lab-app-icon">{renderLaboratorioIcon(card.icon)}</div>
                      <strong>{card.title}</strong>
                      <p>{card.description}</p>
                      <button
                        type="button"
                        className="btn edit-submit-btn"
                        onClick={(event) => {
                          event.stopPropagation()
                          abrirAbaLaboratorio(card.view)
                        }}
                      >
                        Abrir
                      </button>
                    </article>
                  ))}
                </div>
              </>
            ) : null}

            {laboratorioView === 'escanear' ? (
              <>
                <article className="oxente-card oxente-lab-section-card">
                  <h3>Escanear</h3>
                  <p>Envie imagem ou PDF para digitalizar e transformar em texto.</p>

                  <div className="oxente-lab-meta-grid">
                    <label>
                      Título
                      <input
                        className="edit-input"
                        type="text"
                        placeholder="Atividade Digitalizada"
                        value={metaAtividade.activityTitle}
                        onChange={(event) =>
                          setMetaAtividade((prev) => ({
                            ...prev,
                            activityTitle: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label>
                      Aluno
                      <input
                        className="edit-input"
                        type="text"
                        placeholder="Nome do aluno"
                        value={metaAtividade.studentName}
                        onChange={(event) =>
                          setMetaAtividade((prev) => ({
                            ...prev,
                            studentName: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label>
                      Matéria
                      <input
                        className="edit-input"
                        type="text"
                        placeholder="Ex: Matemática"
                        value={metaAtividade.subject}
                        onChange={(event) =>
                          setMetaAtividade((prev) => ({
                            ...prev,
                            subject: event.target.value,
                          }))
                        }
                      />
                    </label>

                    <label>
                      Data
                      <input
                        className="edit-input"
                        type="date"
                        value={metaAtividade.activityDate}
                        onChange={(event) =>
                          setMetaAtividade((prev) => ({
                            ...prev,
                            activityDate: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                </article>

                <article className="oxente-card oxente-lab-section-card">
                  <div className="oxente-lab-upload-card">
                    <div className="oxente-lab-upload-icon">{renderLaboratorioIcon('camera')}</div>
                    <h3>Enviar foto ou PDF</h3>
                    <p>Aceita PNG, JPG, JPEG e PDF.</p>

                    <div className="oxente-lab-actions-row">
                      <label className="btn edit-submit-btn" htmlFor="oxente-scan-file">
                        Enviar
                      </label>
                      <button
                        type="button"
                        className="btn btn-secondary oxente-v2-secondary-btn"
                        onClick={abrirSeletorCamera}
                        disabled={!cameraDisponivel}
                      >
                        Usar câmera
                      </button>
                    </div>

                    <input
                      id="oxente-scan-file"
                      className="oxente-lab-hidden-input"
                      type="file"
                      accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
                      onChange={selecionarArquivo}
                    />
                    <input
                      id="oxente-scan-camera"
                      className="oxente-lab-hidden-input"
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={selecionarArquivo}
                    />
                  </div>

                  {arquivoSelecionado ? (
                    <div className="oxente-v2-file-chip">
                      <strong>Arquivo:</strong> {arquivoSelecionado.name}
                    </div>
                  ) : null}

                  {previewUrl ? (
                    <div className="oxente-preview-wrap">
                      {isPdfFile(arquivoSelecionado) ? (
                        <div className="oxente-v2-pdf-preview">
                          <p>PDF selecionado:</p>
                          <strong>{arquivoSelecionado?.name || 'arquivo.pdf'}</strong>
                        </div>
                      ) : (
                        <img src={previewUrl} alt="Preview atividade" className="oxente-preview-img" />
                      )}
                    </div>
                  ) : null}

                  <div className="oxente-lab-status-grid">
                    <div className="oxente-lab-status-item">
                      <small>Status</small>
                      <strong>
                        {statusEscaneamento === 'erro'
                          ? 'Erro'
                          : statusEscaneamento === 'digitalizando'
                          ? 'Digitalizando'
                          : statusEscaneamento === 'texto-extraido'
                          ? 'Texto extraído'
                          : statusEscaneamento === 'arquivo-carregado'
                          ? 'Arquivo carregado'
                          : 'Nenhum arquivo enviado'}
                      </strong>
                    </div>
                    <div className="oxente-lab-status-item">
                      <small>Confiança OCR</small>
                      <strong>{confiancaOcr > 0 ? `${confiancaOcr}%` : 'Aguardando'}</strong>
                    </div>
                    <div className="oxente-lab-status-item">
                      <small>Progresso</small>
                      <strong>{escaneandoTexto ? `${progressoOcr}%` : 'Pronto'}</strong>
                    </div>
                  </div>

                  <div className="oxente-lab-actions-row">
                    <button
                      type="button"
                      className="btn edit-submit-btn"
                      onClick={scanActivityImageFlow}
                      disabled={!arquivoSelecionado || escaneandoTexto}
                    >
                      {escaneandoTexto ? 'Digitalizando...' : 'Digitalizar'}
                    </button>
                    <button type="button" className="btn btn-secondary oxente-v2-secondary-btn" onClick={limparLaboratorio}>
                      Limpar
                    </button>
                  </div>

                  {escaneandoTexto ? <p className="oxente-v2-loading-text">Lendo sua atividade…</p> : null}
                </article>
              </>
            ) : null}

            {laboratorioView === 'revisar' ? (
              <article className="oxente-card oxente-lab-section-card">
                <h3>Revisar</h3>
                <p>Revise o texto antes de gerar o resumo.</p>

                <textarea
                  className="edit-input oxente-textarea oxente-v2-large-textarea"
                  value={textoDigitalizado}
                  onChange={(event) => {
                    setTextoDigitalizado(event.target.value)
                    setEtapa(3)
                  }}
                  placeholder="O texto digitalizado aparecerá aqui para revisão e edição."
                />

                <div className="oxente-lab-actions-row">
                  <button type="button" className="btn btn-secondary oxente-v2-secondary-btn" onClick={salvarRevisaoTexto}>
                    Salvar revisão
                  </button>
                  <button type="button" className="btn edit-submit-btn" onClick={generateSummaryFlow}>
                    Gerar resumo
                  </button>
                </div>

                {resumoLimpo ? (
                  <div className="oxente-lab-footer-action">
                    <button
                      type="button"
                      className="oxente-v2-mini-btn"
                      onClick={() => abrirAbaLaboratorio('exportar')}
                    >
                      Exportar
                    </button>
                  </div>
                ) : null}
              </article>
            ) : null}

            {laboratorioView === 'resumir' ? (
              <>
                <article className="oxente-card oxente-lab-section-card">
                  <h3>Resumo</h3>
                  <p>Gere e ajuste um resumo claro com base no texto revisado.</p>

                  <div className="oxente-lab-actions-row">
                    <button type="button" className="btn edit-submit-btn" onClick={generateSummaryFlow}>
                      Gerar resumo
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary oxente-v2-secondary-btn"
                      onClick={() => setEditandoResumo((prev) => !prev)}
                      disabled={!resumoLimpo}
                    >
                      {editandoResumo ? 'Bloquear edição' : 'Editar resumo'}
                    </button>
                    <button type="button" className="btn btn-secondary oxente-v2-secondary-btn" onClick={generateKeyPointsFlow}>
                      Gerar pontos principais
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary oxente-v2-secondary-btn"
                      onClick={adicionarResumoNaRotina}
                      disabled={!resumoLimpo}
                    >
                      Adicionar à rotina
                    </button>
                  </div>

                  <label className="oxente-v2-label-stack">
                    Resumo
                    <textarea
                      className="edit-input oxente-v2-mid-textarea"
                      value={resumoGerado}
                      readOnly={!editandoResumo}
                      onChange={(event) => {
                        setResumoGerado(event.target.value)
                        setResumoRevisado(true)
                        setEtapa(4)
                      }}
                      placeholder="Resumo gerado aparece aqui."
                    />
                  </label>

                  {resumoLimpo ? (
                    <p className="oxente-lab-routine-hint">
                      Resumo criado: {sanitizeText(metaAtividade.activityTitle) || 'Sem título'}.
                      Use “Adicionar à rotina” para criar revisões automáticas (1, 3, 7 e 15 dias).
                    </p>
                  ) : null}
                </article>

                <article className="oxente-card oxente-lab-section-card">
                  <h3>Pontos principais</h3>
                  <p>Liste os tópicos mais importantes para revisão rápida.</p>
                  <textarea
                    className="edit-input oxente-v2-mid-textarea"
                    value={topicosPrincipaisTexto}
                    onChange={(event) => {
                      setTopicosPrincipaisTexto(event.target.value)
                      setEtapa(5)
                    }}
                    placeholder={'Ponto 1\nPonto 2\nPonto 3'}
                  />
                </article>

                <article className="oxente-card oxente-lab-section-card">
                  <h3>Observações</h3>
                  <p>Anote trechos duvidosos e alertas da digitalização.</p>
                  <textarea
                    className="edit-input oxente-v2-mid-textarea"
                    value={observacoesTexto}
                    onChange={(event) => setObservacoesTexto(event.target.value)}
                    placeholder="Observações importantes"
                  />
                </article>
              </>
            ) : null}

            {laboratorioView === 'exportar' ? (
              <article className="oxente-card oxente-lab-section-card">
                <h3>Exportar</h3>
                <p>Exporte seu arquivo em Word com conteúdo totalmente editável.</p>

                <div className="oxente-lab-export-status">
                  <small>Status do documento</small>
                  <strong>{canExportWord ? 'Pronto para exportar' : 'Pendente de etapas'}</strong>
                </div>

                <ul className="oxente-lab-checklist">
                  <li className={textoLimpo ? 'ok' : ''}>Texto digitalizado</li>
                  <li className={resumoLimpo ? 'ok' : ''}>Resumo gerado</li>
                  <li className={topicosPrincipais.length > 0 ? 'ok' : ''}>Pontos principais</li>
                </ul>

                <button
                  type="button"
                  className="btn edit-submit-btn"
                  onClick={exportarWordAtual}
                  disabled={!canExportWord || exportandoWord}
                >
                  {exportandoWord ? 'Exportando...' : 'Exportar Word'}
                </button>

                {!canExportWord ? (
                  <p className="oxente-v2-export-warning">
                    {!textoLimpo
                      ? 'Digitalize a atividade antes de exportar.'
                      : !resumoLimpo
                      ? 'Gere o resumo antes de exportar.'
                      : 'Gere os pontos principais antes de exportar.'}
                  </p>
                ) : null}
              </article>
            ) : null}

            {laboratorioView === 'histórico' ? (
              historico.length === 0 ? (
                <article className="oxente-card oxente-lab-section-card">
                  <h3>Histórico</h3>
                  <p>Nenhuma atividade salva ainda. Comece em Escanear.</p>
                </article>
              ) : (
                <div className="oxente-lab-history-list">
                  {historico.map((item) => {
                    const canExportItem =
                      Boolean(sanitizeText(item.recognizedText)) &&
                      Boolean(sanitizeText(item.summary)) &&
                      Array.isArray(item.keyPoints) &&
                      item.keyPoints.length > 0

                    return (
                      <article key={item.id} className="oxente-card oxente-lab-history-item">
                        <div className="oxente-lab-history-head">
                          <div>
                            <strong>{item.activityTitle || 'Atividade sem título'}</strong>
                            <p>{formatarDataHora(item.updatedAt || item.createdAt)}</p>
                          </div>

                          <div className="oxente-lab-menu-wrap" onClick={(event) => event.stopPropagation()}>
                            <button
                              type="button"
                              className="oxente-v2-mini-btn oxente-lab-menu-trigger"
                              aria-label="Mais ações"
                              onClick={(event) => {
                                event.stopPropagation()
                                setMenuHistoricoId((prev) => (prev === item.id ? '' : item.id))
                              }}
                            >
                              <IconDotsVertical />
                            </button>

                            {menuHistoricoId === item.id ? (
                              <div className="oxente-lab-menu" onClick={(event) => event.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuHistoricoId('')
                                    reabrirAnalise(item.id)
                                  }}
                                >
                                  Abrir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuHistoricoId('')
                                    reabrirAnalise(item.id)
                                    setEtapa(3)
                                    setLaboratorioView('revisar')
                                  }}
                                >
                                  Editar texto
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuHistoricoId('')
                                    reabrirAnalise(item.id)
                                    setEtapa(4)
                                    setLaboratorioView('resumir')
                                  }}
                                >
                                  Ver resumo
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMenuHistoricoId('')
                                    void exportarWordDoHistorico(item.id)
                                  }}
                                  disabled={!canExportItem || exportandoWord}
                                >
                                  Exportar Word
                                </button>
                                <button
                                  type="button"
                                  className="danger"
                                  onClick={() => {
                                    setMenuHistoricoId('')
                                    excluirItemHistorico(item.id)
                                  }}
                                >
                                  Excluir
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="oxente-lab-history-meta">
                          <span>{item.subject || topicLabel(item.topic)}</span>
                          <span>{getHistoricoStatusLabel(item)}</span>
                        </div>

                        <div className="oxente-lab-history-actions">
                          <button type="button" className="oxente-v2-mini-btn" onClick={() => reabrirAnalise(item.id)}>
                            Abrir
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )
            ) : null}
          </section>
        ) : null}
        {tab === 'biblioteca' ? (
          <section className="oxente-section oxente-library">
            {livroAberto ? (
              <article className="oxente-library-reader">
                <header className="oxente-library-reader-header">
                  <button
                    type="button"
                    className="oxente-library-back"
                    onClick={() => setLivroAberto(null)}
                  >
                    <IconArrowLeft />
                    Biblioteca
                  </button>
                  <div>
                    <span>
                      {livroAberto.collection === 'literatura'
                        ? `Literatura brasileira · ${livroAberto.genre}`
                        : `${livroAberto.subject} · ${livroAberto.series.join(', ')}`}
                    </span>
                    <h2>{livroAberto.title}</h2>
                    <p>{livroAberto.author}</p>
                  </div>
                  <a href={livroAberto.sourceUrl} target="_blank" rel="noreferrer">
                    Ver fonte oficial
                  </a>
                </header>

                <div className="oxente-library-license">
                  Material disponibilizado por {livroAberto.provider || 'portal público eduCAPES'} · {livroAberto.license}
                </div>

                <iframe
                  className="oxente-library-pdf"
                  src={getEmbeddedBookUrl(livroAberto)}
                  title={`Leitor do livro ${livroAberto.title}`}
                  aria-label={`Leitor do livro ${livroAberto.title}`}
                  allow="fullscreen"
                />
                <div className="oxente-library-reader-fallback">
                  <span>Se o leitor não carregar, abra o PDF diretamente.</span>
                  <a href={livroAberto.pdfUrl} target="_blank" rel="noreferrer">
                    Abrir PDF
                  </a>
                </div>
              </article>
            ) : (
              <>
                <article className="oxente-card oxente-library-hero">
                  <div>
                    <span>BIBLIOTECA ABERTA</span>
                    <h2>Leia sem sair do NEXO</h2>
                    <p>
                      Materiais didáticos e clássicos da literatura brasileira em setores separados.
                    </p>
                  </div>
                  <div className="oxente-library-count">
                    <strong>
                      {itensBiblioteca.reduce(
                        (total, grupo) => total + grupo.subjects.reduce(
                          (subtotal, subject) => subtotal + subject.books.length,
                          0
                        ),
                        0
                      )}
                    </strong>
                    <span>livros disponíveis</span>
                  </div>
                </article>

                <div className="oxente-library-sector-picker" role="tablist" aria-label="Setor da biblioteca">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={setorBiblioteca === 'didaticos'}
                    className={setorBiblioteca === 'didaticos' ? 'active' : ''}
                    onClick={() => setSetorBiblioteca('didaticos')}
                  >
                    Livros didáticos
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={setorBiblioteca === 'literatura'}
                    className={setorBiblioteca === 'literatura' ? 'active' : ''}
                    onClick={() => setSetorBiblioteca('literatura')}
                  >
                    Literatura brasileira
                  </button>
                </div>

                {setorBiblioteca === 'didaticos' ? (
                  <div className="oxente-library-series-picker" role="tablist" aria-label="Ano do Ensino Médio">
                    {LIBRARY_BY_SERIES.map((item) => (
                      <button
                        type="button"
                        role="tab"
                        aria-selected={serieBiblioteca === item.series}
                        className={serieBiblioteca === item.series ? 'active' : ''}
                        key={item.series}
                        onClick={() => setSerieBiblioteca(item.series)}
                      >
                        {item.series}
                      </button>
                    ))}
                  </div>
                ) : null}

                <label className="oxente-library-search">
                  <span>Pesquisar livro, matéria, movimento ou autor</span>
                  <input
                    type="search"
                    value={filtroBiblioteca}
                    onChange={(event) => setFiltroBiblioteca(event.target.value)}
                    placeholder={setorBiblioteca === 'literatura'
                      ? 'Ex.: Machado de Assis, Realismo...'
                      : 'Ex.: Química, História, UERJ...'}
                  />
                </label>

                {itensBiblioteca.length === 0 ? (
                  <article className="oxente-card oxente-library-empty">
                    <h3>Nenhum livro encontrado</h3>
                    <p>Tente pesquisar por outra matéria, título, movimento ou autor.</p>
                  </article>
                ) : (
                  itensBiblioteca.map((series) => (
                    <article className="oxente-card oxente-library-series" key={series.series}>
                      <header>
                        <span>{setorBiblioteca === 'literatura' ? 'ACERVO LITERÁRIO' : 'ENSINO MÉDIO'}</span>
                        <h3>{series.series}</h3>
                      </header>

                      {series.subjects.map((subject) => (
                        <div className="oxente-library-block" key={`${series.series}-${subject.name}`}>
                          <h4 className="oxente-library-subject">{subject.name}</h4>
                          <div className="oxente-library-grid">
                            {subject.books.map((book) => (
                              <article
                                className="oxente-library-book"
                                data-subject={book.subject}
                                key={`${series.series}-${book.id}`}
                              >
                                <div className="oxente-library-cover" aria-hidden="true">
                                  {renderLaboratorioIcon('biblioteca')}
                                  <span>{book.collection === 'literatura' ? book.genre : book.subject}</span>
                                </div>
                                <div className="oxente-library-book-copy">
                                  <strong>{book.title}</strong>
                                  <span>{book.author} · {book.year}</span>
                                  <p>{book.description}</p>
                                  <small>{book.license}</small>
                                </div>
                                <div className="oxente-library-actions">
                                  <button type="button" onClick={() => setLivroAberto(book)}>
                                    Ler no NEXO
                                  </button>
                                  <a href={book.sourceUrl} target="_blank" rel="noreferrer">
                                    Fonte
                                  </a>
                                </div>
                              </article>
                            ))}
                          </div>
                        </div>
                      ))}
                    </article>
                  ))
                )}
              </>
            )}
          </section>
        ) : null}

        {tab === 'rotina' ? (
          <section className="oxente-section oxente-routine-app">
            <article className="oxente-card oxente-routine-header-card">
              <h3>Rotina de Estudos</h3>
              <p>Organize seu dia, revise conteúdos e acompanhe seu progresso.</p>
              <p>
                A Rotina organiza estudos, prazos e metas. O Laboratório continua dedicado a
                escanear, digitalizar, resumir e exportar Word.
              </p>

              <div className="oxente-routine-top-metrics">
                <div>
                  <small>Progresso do dia</small>
                  <strong>{progressoHoje}%</strong>
                </div>
                <div>
                  <small>Próxima revisão</small>
                  <strong>
                    {revisoesHoje[0]
                      ? `${revisoesHoje[0].title} (${formatarData(revisoesHoje[0].reviewDate)})`
                      : 'Sem revisão hoje'}
                  </strong>
                </div>
              </div>

              <div className="oxente-routine-main-actions">
                <button type="button" className="btn edit-submit-btn" onClick={iniciarFoco}>
                  Iniciar foco
                </button>
                <button
                  type="button"
                  className="btn btn-secondary oxente-v2-secondary-btn"
                  onClick={criarRotinaAutomatica}
                >
                  Criar rotina automática
                </button>
              </div>
            </article>

            <div className="oxente-routine-tabs" role="tablist" aria-label="Abas da rotina">
              {ROTINA_TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={rotinaView === item.id}
                  className={`oxente-routine-tab ${rotinaView === item.id ? 'active' : ''}`}
                  onClick={() => setRotinaView(item.id)}
                >
                  <span className="oxente-routine-tab-icon">{renderLaboratorioIcon(item.icon)}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>

            <article className="oxente-card oxente-routine-focus-card">
              <div className="oxente-routine-focus-head">
                <h3>Cronômetro de foco</h3>
                <strong>
                  {String(Math.floor(focusRemainingSeconds / 60)).padStart(2, '0')}:
                  {String(focusRemainingSeconds % 60).padStart(2, '0')}
                </strong>
              </div>

              <div className="oxente-routine-focus-presets">
                <button
                  type="button"
                  className={`oxente-v2-mini-btn ${focusMode === 'pomodoro' ? 'active' : ''}`}
                  onClick={() => {
                    setFocusMode('pomodoro')
                    setFocusMinutes(25)
                    if (focusStatus !== 'running') setFocusRemainingSeconds(25 * 60)
                  }}
                >
                  Pomodoro 25/5
                </button>
                <button
                  type="button"
                  className={`oxente-v2-mini-btn ${focusMode === 'livre' ? 'active' : ''}`}
                  onClick={() => {
                    setFocusMode('livre')
                    setFocusMinutes(50)
                    if (focusStatus !== 'running') setFocusRemainingSeconds(50 * 60)
                  }}
                >
                  Estudo livre
                </button>
                <button
                  type="button"
                  className={`oxente-v2-mini-btn ${focusMode === 'revisão' ? 'active' : ''}`}
                  onClick={() => {
                    setFocusMode('revisão')
                    setFocusMinutes(15)
                    if (focusStatus !== 'running') setFocusRemainingSeconds(15 * 60)
                  }}
                >
                  Revisão rápida
                </button>
              </div>

              <label className="oxente-v2-label-stack">
                Tempo (min)
                <input
                  className="edit-input"
                  type="number"
                  min="5"
                  max="180"
                  value={focusMinutes}
                  onChange={(event) => {
                    const value = Math.max(5, Math.min(180, Number(event.target.value || 25)))
                    setFocusMinutes(value)
                    if (focusStatus !== 'running') setFocusRemainingSeconds(value * 60)
                  }}
                />
              </label>

              <div className="oxente-routine-main-actions">
                <button type="button" className="btn edit-submit-btn" onClick={iniciarFoco}>
                  {focusStatus === 'paused' ? 'Retomar' : 'Iniciar'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary oxente-v2-secondary-btn"
                  onClick={pausarFoco}
                  disabled={focusStatus !== 'running'}
                >
                  Pausar
                </button>
                <button
                  type="button"
                  className="btn btn-secondary oxente-v2-secondary-btn"
                  onClick={() => concluirFoco('manual')}
                  disabled={focusStatus === 'idle'}
                >
                  Concluir
                </button>
              </div>
            </article>

            {rotinaView === 'hoje' ? (
              <>
                <article className="oxente-card oxente-routine-card">
                  <h3>Hoje</h3>
                  <p>Plano diário com tarefas, pendências, revisões e prazos.</p>

                  {tarefasHoje.length === 0 ? (
                    <p>Sem tarefas para hoje.</p>
                  ) : (
                    <div className="oxente-routine-list">
                      {tarefasHoje.map((task) => (
                        <article key={task.id} className="oxente-routine-item-card">
                          <div className="oxente-routine-item-head">
                            <strong>{task.subject || 'Geral'} — {task.title}</strong>
                            <span className={`oxente-routine-status ${task.status}`}>
                              {taskStatusLabel(task.status)}
                            </span>
                          </div>
                          <p>
                            Tipo: {task.type} · Tempo estimado: {task.estimatedMinutes} min · Prazo: {formatarData(task.dueDate)}
                          </p>
                          <div className="oxente-routine-item-actions">
                            <button
                              type="button"
                              className="oxente-v2-mini-btn"
                              onClick={() => atualizarStatusTarefa(task, 'in_progress')}
                              disabled={task.status === 'completed' || task.status === 'in_progress'}
                            >
                              Iniciar
                            </button>
                            <button
                              type="button"
                              className="oxente-v2-mini-btn"
                              onClick={() => atualizarStatusTarefa(task, task.status === 'completed' ? 'pending' : 'completed')}
                            >
                              {task.status === 'completed' ? 'Reabrir' : 'Concluir'}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </article>

                <article className="oxente-card oxente-routine-card">
                  <h3>Revisões programadas</h3>
                  {revisoesHoje.length === 0 ? (
                    <p>Nenhuma revisão programada para hoje.</p>
                  ) : (
                    <div className="oxente-routine-list">
                      {revisoesHoje.map((review) => (
                        <article key={review.id} className="oxente-routine-item-card">
                          <strong>{review.title}</strong>
                          <p>
                            {review.subject || 'Geral'} · {reviewStageLabel(review.reviewStage)} · {formatarData(review.reviewDate)}
                          </p>
                          <button type="button" className="oxente-v2-mini-btn" onClick={() => concluirRevisao(review.id)}>
                            Concluir
                          </button>
                        </article>
                      ))}
                    </div>
                  )}

                  <p className="oxente-routine-deadline">
                    Próximo prazo: {proximoPrazo ? `${proximoPrazo.title} (${formatarData(proximoPrazo.dueDate)})` : 'Sem pendências'}
                  </p>
                </article>
              </>
            ) : null}

            {rotinaView === 'semana' ? (
              <article className="oxente-card oxente-routine-card">
                <h3>Semana</h3>
                <p>Planejamento semanal com matérias, tempo e ajustes.</p>

                <div className="oxente-routine-main-actions">
                  <button type="button" className="btn btn-secondary oxente-v2-secondary-btn" onClick={() => setRotinaView('metas')}>
                    Editar rotina
                  </button>
                  <button type="button" className="btn edit-submit-btn" onClick={criarRotinaAutomatica}>
                    Criar rotina automática
                  </button>
                </div>

                <div className="oxente-routine-week-grid">
                  {planoSemana.map((day) => (
                    <article key={day.id} className="oxente-routine-week-card">
                      <strong>{day.label}</strong>
                      <small>{day.dateLabel}</small>
                      <p>{day.tarefas.length} tarefa(s)</p>
                      <p>{day.minutos} min planejados</p>
                    </article>
                  ))}
                </div>
              </article>
            ) : null}

            {rotinaView === 'revisoes' ? (
              <article className="oxente-card oxente-routine-card">
                <h3>Revisões</h3>
                <p>Sistema de revisão espaçada: 1, 3, 7 e 15 dias.</p>

                <div className="oxente-routine-main-actions">
                  <button type="button" className="btn edit-submit-btn" onClick={adicionarResumoNaRotina}>
                    Adicionar resumo do Laboratório
                  </button>
                </div>

                {studyReviews.length === 0 ? (
                  <p>Nenhuma revisão cadastrada.</p>
                ) : (
                  <div className="oxente-routine-list">
                    {[...studyReviews]
                      .sort((a, b) => new Date(a.reviewDate).getTime() - new Date(b.reviewDate).getTime())
                      .map((review) => (
                        <article key={review.id} className="oxente-routine-item-card">
                          <div className="oxente-routine-item-head">
                            <strong>{review.title}</strong>
                            <span className={`oxente-routine-status ${review.status}`}>{taskStatusLabel(review.status)}</span>
                          </div>
                          <p>
                            {review.subject || 'Geral'} · {reviewStageLabel(review.reviewStage)} · Revisar em {formatarData(review.reviewDate)}
                          </p>
                          <button
                            type="button"
                            className="oxente-v2-mini-btn"
                            onClick={() => concluirRevisao(review.id)}
                            disabled={review.status === 'completed'}
                          >
                            Concluir
                          </button>
                        </article>
                      ))}
                  </div>
                )}
              </article>
            ) : null}

            {rotinaView === 'metas' ? (
              <article className="oxente-card oxente-routine-card">
                <h3>Metas</h3>
                <p>Defina metas por prazo e acompanhe o progresso.</p>

                <div className="oxente-routine-main-actions">
                  <button
                    type="button"
                    className="btn edit-submit-btn"
                    onClick={() => {
                      const title = sanitizeText(window.prompt('Título da meta') || '')
                      if (!title) return
                      const subject = sanitizeText(window.prompt('Matéria (opcional)') || '')
                      const dueDate = window.prompt('Prazo (YYYY-MM-DD)', toIsoDate(addDays(new Date(), 7))) || toIsoDate(addDays(new Date(), 7))
                      const target = Number(window.prompt('Meta numérica (ex: 5)', '5') || 5)
                      const nextGoal = {
                        id: `goal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                        userId: perfil?.id || '',
                        title,
                        subject,
                        target: Math.max(1, target),
                        progress: 0,
                        dueDate,
                        status: 'pending',
                        createdAt: new Date().toISOString(),
                      }
                      persistirRotina({ goals: [nextGoal, ...studyGoals] })
                      registrarEventoRotina(`Meta criada: ${title}`, 'goal')
                    }}
                  >
                    Nova meta
                  </button>
                </div>

                <div className="oxente-routine-list">
                  {studyGoals.map((goal) => {
                    const ratio = Math.min(100, Math.round((Number(goal.progress || 0) / Math.max(1, Number(goal.target || 1))) * 100))
                    return (
                      <article key={goal.id} className="oxente-routine-item-card">
                        <div className="oxente-routine-item-head">
                          <strong>{goal.title}</strong>
                          <span className={`oxente-routine-status ${goal.status}`}>{taskStatusLabel(goal.status)}</span>
                        </div>
                        <p>
                          {goal.subject || 'Geral'} · Prazo: {formatarData(goal.dueDate)} · Progresso: {goal.progress}/{goal.target}
                        </p>
                        <div className="oxente-routine-progress-track">
                          <span style={{ width: `${ratio}%` }} />
                        </div>
                        <div className="oxente-routine-item-actions">
                          <button
                            type="button"
                            className="oxente-v2-mini-btn"
                            onClick={() => {
                              const nextGoals = studyGoals.map((item) => {
                                if (item.id !== goal.id) return item
                                const nextProgress = Math.min(Number(item.target || 1), Number(item.progress || 0) + 1)
                                return {
                                  ...item,
                                  progress: nextProgress,
                                  status: nextProgress >= Number(item.target || 1) ? 'completed' : 'in_progress',
                                }
                              })
                              persistirRotina({ goals: nextGoals })
                            }}
                          >
                            Avançar
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </article>
            ) : null}

            {rotinaView === 'progresso' ? (
              <article className="oxente-card oxente-routine-card">
                <h3>Progresso</h3>
                <p>Acompanhe seus indicadores e histórico recente.</p>

                <div className="oxente-routine-progress-grid">
                  <article className="oxente-routine-progress-card">
                    <small>Dias estudando</small>
                    <strong>{diasEstudando}</strong>
                  </article>
                  <article className="oxente-routine-progress-card">
                    <small>Sequência ativa</small>
                    <strong>{diasEstudando}</strong>
                  </article>
                  <article className="oxente-routine-progress-card">
                    <small>Tarefas concluídas</small>
                    <strong>{tarefasConcluidas}</strong>
                  </article>
                  <article className="oxente-routine-progress-card">
                    <small>Resumos revisados</small>
                    <strong>{studyReviews.filter((item) => item.status === 'completed').length}</strong>
                  </article>
                  <article className="oxente-routine-progress-card">
                    <small>Horas estudadas</small>
                    <strong>{horasEstudadas}h</strong>
                  </article>
                  <article className="oxente-routine-progress-card">
                    <small>Matéria mais estudada</small>
                    <strong>{materiaMaisEstudada}</strong>
                  </article>
                </div>

                <h4>Histórico recente</h4>
                {activityLog.length === 0 ? (
                  <p>Sem histórico recente.</p>
                ) : (
                  <div className="oxente-routine-list">
                    {activityLog.slice(0, 8).map((item) => (
                      <article key={item.id} className="oxente-routine-item-card">
                        <strong>{item.text}</strong>
                        <p>{formatarDataHora(item.createdAt)}</p>
                      </article>
                    ))}
                  </div>
                )}
              </article>
            ) : null}
          </section>
        ) : null}
      </div>

      <BottomNav />
    </div>
  )
}





