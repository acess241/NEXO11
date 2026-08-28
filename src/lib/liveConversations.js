import { normalizeClassroomCode, normalizeClassroomCodeKey } from './classroomCode'

export const LIVE_CHAT_STORAGE_KEY = 'nexo_live_conversations_v2'
export const LIVE_CHAT_UPDATED_EVENT = 'nexo-live-chat-updated'

export const conversationType = {
  private: 'private',
  classroomGroup: 'classroom_group',
  assignmentGroup: 'assignment_group',
  studyGroup: 'study_group',
}

export const messageType = {
  text: 'text',
  announcement: 'announcement',
  assignment: 'assignment',
  submission: 'submission',
  feedback: 'feedback',
  file: 'file',
  deadlineReminder: 'deadline_reminder',
  system: 'system',
}

export const participantStatus = {
  active: 'active',
  invited: 'invited',
  requested: 'requested',
  blocked: 'blocked',
  left: 'left',
}

export const classroomMembershipStatus = {
  notMember: 'not_member',
  requested: 'requested',
  approved: 'approved',
  rejected: 'rejected',
  blocked: 'blocked',
  left: 'left',
  invited: 'invited',
}

const CLASSROOM_PREFIX_FALLBACK = 'NEXO'
const CLASSROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const STATE_VERSION = 2

function nowIso() {
  return new Date().toISOString()
}

function randomPart(size = 4) {
  let text = ''
  for (let index = 0; index < size; index += 1) {
    const pos = Math.floor(Math.random() * CLASSROOM_CODE_ALPHABET.length)
    text += CLASSROOM_CODE_ALPHABET[pos]
  }
  return text
}

function sanitizeText(value) {
  return `${value || ''}`
    .replace(/\u0000/g, '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function toSlug(value) {
  return sanitizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function sanitizeCode(value) {
  return normalizeClassroomCode(value)
}

function isRoleProfessor(role) {
  const lowered = `${role || ''}`.toLowerCase().trim()
  return (
    lowered === 'teacher' ||
    lowered === 'professor' ||
    lowered === 'admin' ||
    lowered === 'adm' ||
    lowered === 'docente'
  )
}

function normalizeRole(role) {
  return isRoleProfessor(role) ? 'professor' : 'aluno'
}

function normalizeParticipantStatus(status) {
  const safe = `${status || ''}`.toLowerCase()
  if (safe === participantStatus.active) return participantStatus.active
  if (safe === participantStatus.invited) return participantStatus.invited
  if (safe === participantStatus.requested) return participantStatus.requested
  if (safe === participantStatus.blocked) return participantStatus.blocked
  if (safe === participantStatus.left) return participantStatus.left
  return participantStatus.active
}

function normalizeClassroomMemberStatus(status) {
  const safe = `${status || ''}`.toLowerCase()

  if (safe === classroomMembershipStatus.notMember) return classroomMembershipStatus.notMember
  if (safe === classroomMembershipStatus.requested) return classroomMembershipStatus.requested
  if (safe === classroomMembershipStatus.approved) return classroomMembershipStatus.approved
  if (safe === classroomMembershipStatus.rejected) return classroomMembershipStatus.rejected
  if (safe === classroomMembershipStatus.blocked) return classroomMembershipStatus.blocked
  if (safe === classroomMembershipStatus.left) return classroomMembershipStatus.left
  if (safe === classroomMembershipStatus.invited) return classroomMembershipStatus.invited
  if (safe === participantStatus.active) return classroomMembershipStatus.approved
  if (safe === participantStatus.invited) return classroomMembershipStatus.invited
  if (safe === participantStatus.requested) return classroomMembershipStatus.requested
  if (safe === participantStatus.blocked) return classroomMembershipStatus.blocked
  if (safe === participantStatus.left) return classroomMembershipStatus.left

  return classroomMembershipStatus.notMember
}

function classroomToParticipantStatus(status) {
  if (status === classroomMembershipStatus.approved) return participantStatus.active
  if (status === classroomMembershipStatus.invited) return participantStatus.invited
  if (status === classroomMembershipStatus.requested) return participantStatus.requested
  if (status === classroomMembershipStatus.blocked || status === classroomMembershipStatus.rejected) {
    return participantStatus.blocked
  }
  if (status === classroomMembershipStatus.left) return participantStatus.left
  return participantStatus.left
}

function participantToClassroomStatus(status) {
  if (status === participantStatus.active) return classroomMembershipStatus.approved
  if (status === participantStatus.invited) return classroomMembershipStatus.invited
  if (status === participantStatus.requested) return classroomMembershipStatus.requested
  if (status === participantStatus.blocked) return classroomMembershipStatus.blocked
  if (status === participantStatus.left) return classroomMembershipStatus.left
  return classroomMembershipStatus.notMember
}

function getConversationTypeLabel(type) {
  if (type === conversationType.private) return 'Conversa privada'
  if (type === conversationType.classroomGroup) return 'Grupo de turma'
  if (type === conversationType.assignmentGroup) return 'Grupo de atividade'
  if (type === conversationType.studyGroup) return 'Grupo de estudo'
  return 'Conversa'
}

function getMembershipStatusLabel(status, isPublic = false) {
  if (status === participantStatus.active || status === classroomMembershipStatus.approved) return 'Participando'
  if (status === participantStatus.invited || status === classroomMembershipStatus.invited) return 'Convite'
  if (status === participantStatus.requested || status === classroomMembershipStatus.requested) {
    return 'Aguardando'
  }
  if (status === classroomMembershipStatus.rejected) return 'Recusado'
  if (status === participantStatus.blocked || status === classroomMembershipStatus.blocked) return 'Bloqueado'
  if (status === participantStatus.left || status === classroomMembershipStatus.left) return 'Saiu'
  if (isPublic) return 'Publico'
  return 'Participando'
}

function defaultState() {
  return {
    version: STATE_VERSION,
    conversations: [],
    messagesByConversation: {},
    typingByConversation: {},
    classrooms: [],
    classroomMembers: [],
    classroomJoinRequests: [],
  }
}

function safeReadStorageRaw() {
  if (typeof window === 'undefined') return defaultState()

  try {
    const raw = window.localStorage.getItem(LIVE_CHAT_STORAGE_KEY)
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw)

    return {
      version: Number(parsed?.version || 1),
      conversations: Array.isArray(parsed?.conversations) ? parsed.conversations : [],
      messagesByConversation:
        parsed?.messagesByConversation && typeof parsed.messagesByConversation === 'object'
          ? parsed.messagesByConversation
          : {},
      typingByConversation:
        parsed?.typingByConversation && typeof parsed.typingByConversation === 'object'
          ? parsed.typingByConversation
          : {},
      classrooms: Array.isArray(parsed?.classrooms) ? parsed.classrooms : [],
      classroomMembers: Array.isArray(parsed?.classroomMembers) ? parsed.classroomMembers : [],
      classroomJoinRequests: Array.isArray(parsed?.classroomJoinRequests)
        ? parsed.classroomJoinRequests
        : [],
    }
  } catch {
    return defaultState()
  }
}

function safeWriteStorage(state) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LIVE_CHAT_STORAGE_KEY, JSON.stringify(state))
}

export function resetAllLiveConversationsAndGroups() {
  const state = defaultState()
  safeWriteStorage(state)
  dispararAtualizacaoConversasAoVivo({ type: 'live-reset-all' })
  return state
}

export function dispararAtualizacaoConversasAoVivo(detail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(LIVE_CHAT_UPDATED_EVENT, { detail }))
}

function normalizeAttachmentList(attachments) {
  if (!Array.isArray(attachments)) return []

  return attachments
    .map((file) => ({
      id: file?.id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      messageId: file?.messageId || '',
      fileName: sanitizeText(file?.fileName || 'arquivo'),
      fileUrl: sanitizeText(file?.fileUrl || ''),
      fileType: sanitizeText(file?.fileType || ''),
      size: Number(file?.size || 0),
      createdAt: file?.createdAt || nowIso(),
    }))
    .filter((file) => Boolean(file.fileUrl))
}

function createBaseConversation(input) {
  return {
    id: sanitizeText(input.id),
    type: input.type || conversationType.studyGroup,
    title: sanitizeText(input.title || 'Conversa ao vivo'),
    classroomId: sanitizeText(input.classroomId || ''),
    assignmentId: sanitizeText(input.assignmentId || ''),
    createdBy: sanitizeText(input.createdBy || ''),
    createdAt: input.createdAt || nowIso(),
    updatedAt: input.updatedAt || nowIso(),
    lastMessage: sanitizeText(input.lastMessage || ''),
    lastMessageAt: input.lastMessageAt || input.updatedAt || nowIso(),
    typeLabel: getConversationTypeLabel(input.type),
    isPublic: Boolean(input.isPublic),
    allowStudentMessages: input.allowStudentMessages !== false,
    pinnedBy: input.pinnedBy && typeof input.pinnedBy === 'object' ? input.pinnedBy : {},
    participants: Array.isArray(input.participants) ? input.participants : [],
    meta: input.meta && typeof input.meta === 'object' ? input.meta : {},
  }
}

function createParticipant({ conversationId, userId, userName, username, role, status }) {
  return {
    id: `${conversationId}:${userId}`,
    conversationId,
    userId,
    userName: sanitizeText(userName || 'Participante'),
    username: sanitizeText(username || ''),
    role: normalizeRole(role),
    status: normalizeParticipantStatus(status || participantStatus.active),
    joinedAt: nowIso(),
    lastReadAt: '',
    isMuted: false,
  }
}

function createClassroom(input) {
  const legacyCode =
    input.code ||
    input.classroomCode ||
    input.classCode ||
    input.joinCode ||
    input.inviteCode ||
    input.roomCode ||
    input.codigo ||
    input.codigoSala ||
    ''

  return {
    id: sanitizeText(input.id),
    name: sanitizeText(input.name || 'Turma sem nome'),
    subject: sanitizeText(input.subject || ''),
    grade: sanitizeText(input.grade || ''),
    description: sanitizeText(input.description || ''),
    teacherId: sanitizeText(input.teacherId || ''),
    teacherName: sanitizeText(input.teacherName || 'Professor'),
    code: sanitizeCode(legacyCode),
    conversationId: sanitizeText(input.conversationId || `classroom:${sanitizeText(input.id)}`),
    createdAt: input.createdAt || nowIso(),
    isActive: input.isActive !== false,
  }
}

function createClassroomMember(input) {
  return {
    id: input.id || `${sanitizeText(input.classroomId)}:${sanitizeText(input.userId)}`,
    classroomId: sanitizeText(input.classroomId),
    userId: sanitizeText(input.userId),
    userName: sanitizeText(input.userName || 'Usuário'),
    role: normalizeRole(input.role),
    status: normalizeClassroomMemberStatus(input.status || classroomMembershipStatus.approved),
    joinedAt: input.joinedAt || nowIso(),
  }
}

function createClassroomJoinRequest(input) {
  return {
    id: input.id || `join-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    classroomId: sanitizeText(input.classroomId),
    studentId: sanitizeText(input.studentId),
    studentName: sanitizeText(input.studentName || 'Aluno'),
    studentHandle: sanitizeText(input.studentHandle || ''),
    status: normalizeClassroomMemberStatus(input.status || classroomMembershipStatus.requested),
    requestedAt: input.requestedAt || nowIso(),
    reviewedAt: input.reviewedAt || '',
    reviewedBy: sanitizeText(input.reviewedBy || ''),
  }
}

function ensureConversationRecord(state, data) {
  const existingIndex = state.conversations.findIndex((item) => item.id === data.id)

  if (existingIndex >= 0) {
    state.conversations[existingIndex] = {
      ...state.conversations[existingIndex],
      ...data,
      typeLabel: getConversationTypeLabel(data.type || state.conversations[existingIndex].type),
    }
    return state.conversations[existingIndex]
  }

  const conversation = createBaseConversation(data)
  state.conversations.push(conversation)
  return conversation
}

function ensureParticipant(conversation, participant) {
  const list = Array.isArray(conversation.participants) ? [...conversation.participants] : []
  const index = list.findIndex((item) => item.userId === participant.userId)

  if (index < 0) {
    list.push(participant)
    conversation.participants = list
    return true
  }

  const previous = list[index]
  const next = {
    ...previous,
    userName: participant.userName || previous.userName,
    username: participant.username || previous.username || '',
    role: participant.role || previous.role,
    status: normalizeParticipantStatus(participant.status || previous.status),
  }

  const changed =
    next.userName !== previous.userName ||
    next.username !== previous.username ||
    next.role !== previous.role ||
    next.status !== previous.status

  list[index] = next
  conversation.participants = list
  return changed
}

function ensureClassroomRecord(state, classroomInput) {
  const classroom = createClassroom(classroomInput)
  const existingIndex = state.classrooms.findIndex((item) => item.id === classroom.id)

  if (existingIndex < 0) {
    state.classrooms.push(classroom)
    return state.classrooms[state.classrooms.length - 1]
  }

  state.classrooms[existingIndex] = {
    ...state.classrooms[existingIndex],
    ...classroom,
  }

  return state.classrooms[existingIndex]
}

function upsertClassroomMember(state, memberInput) {
  const member = createClassroomMember(memberInput)
  const index = state.classroomMembers.findIndex(
    (item) => item.classroomId === member.classroomId && item.userId === member.userId
  )

  if (index < 0) {
    state.classroomMembers.push(member)
    return state.classroomMembers[state.classroomMembers.length - 1]
  }

  state.classroomMembers[index] = {
    ...state.classroomMembers[index],
    ...member,
    status: normalizeClassroomMemberStatus(member.status),
  }

  return state.classroomMembers[index]
}

function upsertClassroomRequest(state, requestInput) {
  const request = createClassroomJoinRequest(requestInput)
  const index = state.classroomJoinRequests.findIndex(
    (item) => item.classroomId === request.classroomId && item.studentId === request.studentId
  )

  if (index < 0) {
    state.classroomJoinRequests.push(request)
    return state.classroomJoinRequests[state.classroomJoinRequests.length - 1]
  }

  state.classroomJoinRequests[index] = {
    ...state.classroomJoinRequests[index],
    ...request,
    status: normalizeClassroomMemberStatus(request.status),
  }

  return state.classroomJoinRequests[index]
}

function getConversationAndParticipant(state, conversationId, userId) {
  const conversation = state.conversations.find((item) => item.id === conversationId) || null
  if (!conversation) {
    return {
      conversation: null,
      participant: null,
    }
  }

  const participant = (conversation.participants || []).find((item) => item.userId === userId) || null

  return {
    conversation,
    participant,
  }
}

function getClassroomByConversationId(state, conversationId) {
  return state.classrooms.find((classroom) => classroom.conversationId === conversationId) || null
}

function getClassroomById(state, classroomId) {
  return state.classrooms.find((classroom) => classroom.id === classroomId) || null
}

function getClassroomMember(state, classroomId, userId) {
  return state.classroomMembers.find((item) => item.classroomId === classroomId && item.userId === userId) || null
}

function buildClassroomPrefix({ name, grade, subject }) {
  const gradeClean = sanitizeText(grade).toUpperCase().replace(/[^A-Z0-9]/g, '')
  const subjectClean = sanitizeText(subject)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '')

  if (gradeClean && subjectClean) return `${gradeClean.slice(0, 4)}-${subjectClean.slice(0, 3)}`
  if (gradeClean) return gradeClean.slice(0, 5)

  const nameToken = sanitizeText(name)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '')

  if (nameToken) return nameToken.slice(0, 5)
  return CLASSROOM_PREFIX_FALLBACK
}

function generateUniqueClassroomCode(state, seed = {}) {
  const usedCodes = new Set(
    state.classrooms.map((item) => normalizeClassroomCodeKey(item.code)).filter(Boolean)
  )
  const basePrefix = buildClassroomPrefix(seed) || CLASSROOM_PREFIX_FALLBACK

  let tries = 0
  while (tries < 80) {
    tries += 1
    const code = normalizeClassroomCode(`${basePrefix}-${randomPart(4)}`)
    if (!usedCodes.has(normalizeClassroomCodeKey(code))) return code
  }

  return normalizeClassroomCode(
    `${CLASSROOM_PREFIX_FALLBACK}-${Date.now().toString(36).toUpperCase().slice(-4)}`
  )
}

function addMessageToState(state, payload) {
  const createdAt = payload.createdAt || nowIso()
  const dedupeKey = sanitizeText(payload.dedupeKey || '')

  const previousMessages = Array.isArray(state.messagesByConversation[payload.conversationId])
    ? state.messagesByConversation[payload.conversationId]
    : []

  if (dedupeKey) {
    const duplicate = previousMessages.find((message) => message.dedupeKey === dedupeKey)
    if (duplicate) return duplicate
  }

  const message = {
    id: payload.id || `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    conversationId: payload.conversationId,
    senderId: sanitizeText(payload.senderId || 'system'),
    senderName: sanitizeText(payload.senderName || 'Sistema'),
    senderRole: normalizeRole(payload.senderRole || 'aluno'),
    messageType: payload.messageType || messageType.text,
    text: sanitizeText(payload.text || ''),
    attachments: normalizeAttachmentList(payload.attachments),
    assignmentId: sanitizeText(payload.assignmentId || ''),
    submissionId: sanitizeText(payload.submissionId || ''),
    isPinned: Boolean(payload.isPinned),
    createdAt,
    readBy: Array.isArray(payload.readBy) ? payload.readBy : [sanitizeText(payload.senderId || 'system')],
    dedupeKey,
  }

  const list = [...previousMessages, message]
  state.messagesByConversation[message.conversationId] = list

  const conversation = state.conversations.find((item) => item.id === message.conversationId)
  if (conversation) {
    conversation.updatedAt = createdAt
    conversation.lastMessageAt = createdAt
    conversation.lastMessage =
      message.text || (message.messageType === messageType.file ? 'Arquivo enviado' : 'Atualizacao')
  }

  return message
}

function canReadByStatus(status) {
  return status === participantStatus.active || status === participantStatus.invited
}

function canSendByStatus(status) {
  return status === participantStatus.active
}

function sortConversationsByRecent(list) {
  return [...list].sort((a, b) => {
    const timeA = new Date(a.lastMessageAt || a.updatedAt || a.createdAt).getTime()
    const timeB = new Date(b.lastMessageAt || b.updatedAt || b.createdAt).getTime()
    return timeB - timeA
  })
}

function resolveClassroomMembership(state, conversation, userId) {
  if (!conversation || conversation.type !== conversationType.classroomGroup) {
    return { classroom: null, member: null, status: classroomMembershipStatus.notMember }
  }

  const classroom = getClassroomByConversationId(state, conversation.id)
  if (!classroom) {
    return { classroom: null, member: null, status: classroomMembershipStatus.notMember }
  }

  const member = getClassroomMember(state, classroom.id, userId)
  const status = normalizeClassroomMemberStatus(member?.status || classroomMembershipStatus.notMember)
  return { classroom, member, status }
}

function ensureClassroomConversationAndTeacher(state, classroom, teacherProfile) {
  const conversation = ensureConversationRecord(state, {
    id: classroom.conversationId,
    type: conversationType.classroomGroup,
    title: `Grupo - ${classroom.name}`,
    classroomId: classroom.id,
    createdBy: classroom.teacherId,
    isPublic: false,
    allowStudentMessages: true,
    meta: {
      subject: classroom.subject,
      grade: classroom.grade,
      teacherName: classroom.teacherName,
      classroomName: classroom.name,
      code: classroom.code,
      joinCode: classroom.code,
    },
  })

  ensureParticipant(
    conversation,
    createParticipant({
      conversationId: conversation.id,
      userId: classroom.teacherId,
      userName: teacherProfile?.nome || teacherProfile?.username || classroom.teacherName,
      username: teacherProfile?.username || '',
      role: 'professor',
      status: participantStatus.active,
    })
  )

  upsertClassroomMember(state, {
    classroomId: classroom.id,
    userId: classroom.teacherId,
    userName: teacherProfile?.nome || teacherProfile?.username || classroom.teacherName,
    role: 'professor',
    status: classroomMembershipStatus.approved,
    joinedAt: classroom.createdAt,
  })

  const hasMessages = Array.isArray(state.messagesByConversation[conversation.id])
    ? state.messagesByConversation[conversation.id].length > 0
    : false

  if (!hasMessages) {
    addMessageToState(state, {
      conversationId: conversation.id,
      senderId: classroom.teacherId,
      senderName: classroom.teacherName,
      senderRole: 'professor',
      messageType: messageType.announcement,
      text: `Bem-vindos a sala ${classroom.name}.`,
    })
  }

  return conversation
}

function migrateState(rawState) {
  const state = {
    version: STATE_VERSION,
    conversations: Array.isArray(rawState.conversations) ? rawState.conversations : [],
    messagesByConversation:
      rawState.messagesByConversation && typeof rawState.messagesByConversation === 'object'
        ? rawState.messagesByConversation
        : {},
    typingByConversation:
      rawState.typingByConversation && typeof rawState.typingByConversation === 'object'
        ? rawState.typingByConversation
        : {},
    classrooms: Array.isArray(rawState.classrooms) ? rawState.classrooms : [],
    classroomMembers: Array.isArray(rawState.classroomMembers) ? rawState.classroomMembers : [],
    classroomJoinRequests: Array.isArray(rawState.classroomJoinRequests) ? rawState.classroomJoinRequests : [],
  }

  state.conversations = state.conversations.map((conversation) => ({
    ...createBaseConversation(conversation),
    participants: Array.isArray(conversation.participants)
      ? conversation.participants.map((participant) => ({
          ...participant,
          status: normalizeParticipantStatus(participant?.status),
          role: normalizeRole(participant?.role),
          userName: sanitizeText(participant?.userName || 'Participante'),
          username: sanitizeText(participant?.username || ''),
        }))
      : [],
  }))

  state.classrooms = state.classrooms.map((classroom) => createClassroom(classroom))
  state.classroomMembers = state.classroomMembers.map((member) => createClassroomMember(member))
  state.classroomJoinRequests = state.classroomJoinRequests.map((request) =>
    createClassroomJoinRequest(request)
  )

  const classroomByConversation = new Map()
  state.classrooms.forEach((classroom) => {
    if (classroom.conversationId) classroomByConversation.set(classroom.conversationId, classroom)
  })

  state.conversations
    .filter((conversation) => conversation.type === conversationType.classroomGroup)
    .forEach((conversation) => {
      let classroom = classroomByConversation.get(conversation.id)
      if (!classroom) {
        const title = sanitizeText(conversation.title || 'Turma')
        const cleanName = title.replace(/^Grupo\s*-\s*/i, '').trim() || title
        const teacherParticipant =
          (conversation.participants || []).find((participant) => isRoleProfessor(participant.role)) || null

        classroom = ensureClassroomRecord(state, {
          id: sanitizeText(conversation.classroomId || toSlug(cleanName) || `classroom-${Date.now()}`),
          name: cleanName,
          subject: sanitizeText(conversation?.meta?.subject || ''),
          grade: sanitizeText(conversation?.meta?.grade || ''),
          description: sanitizeText(conversation?.meta?.description || ''),
          teacherId: sanitizeText(teacherParticipant?.userId || conversation.createdBy || ''),
          teacherName: sanitizeText(teacherParticipant?.userName || conversation?.meta?.teacherName || 'Professor'),
          code: generateUniqueClassroomCode(state, {
            name: cleanName,
            subject: conversation?.meta?.subject || '',
            grade: conversation?.meta?.grade || '',
          }),
          conversationId: conversation.id,
          createdAt: conversation.createdAt || nowIso(),
          isActive: true,
        })
        classroomByConversation.set(conversation.id, classroom)
      }

      ;(conversation.participants || []).forEach((participant) => {
        const memberStatus = participantToClassroomStatus(participant?.status)
        if (memberStatus === classroomMembershipStatus.notMember) return

        upsertClassroomMember(state, {
          classroomId: classroom.id,
          userId: participant.userId,
          userName: participant.userName,
          role: participant.role,
          status: memberStatus,
          joinedAt: participant.joinedAt || classroom.createdAt,
        })
      })

      conversation.classroomId = classroom.id
      conversation.meta = {
        ...(conversation.meta || {}),
        subject: classroom.subject,
        grade: classroom.grade,
        teacherName: classroom.teacherName,
        classroomName: classroom.name,
        code: classroom.code,
        joinCode: classroom.code,
      }
    })

  state.classrooms.forEach((classroom) => ensureClassroomConversationAndTeacher(state, classroom))
  return state
}

function safeReadStorage() {
  const raw = safeReadStorageRaw()
  const normalized = migrateState(raw)
  if (Number(raw.version || 0) !== STATE_VERSION) safeWriteStorage(normalized)
  return normalized
}

function persistAndNotify(state, reason, extra = {}) {
  safeWriteStorage(state)
  dispararAtualizacaoConversasAoVivo({ reason, ...extra })
}

function getUserConversationPreview(state, conversation, userId) {
  if (!conversation) return null

  if (conversation.type === conversationType.classroomGroup) {
    const { classroom, member, status } = resolveClassroomMembership(state, conversation, userId)
    if (!classroom) return null

    if (
      status !== classroomMembershipStatus.approved &&
      status !== classroomMembershipStatus.requested &&
      status !== classroomMembershipStatus.invited
    ) {
      return null
    }

    const messages = Array.isArray(state.messagesByConversation[conversation.id])
      ? state.messagesByConversation[conversation.id]
      : []
    const participant = (conversation.participants || []).find((item) => item.userId === userId) || null

    const unreadCount =
      status === classroomMembershipStatus.approved
        ? messages.filter((message) => {
            if (message.senderId === userId) return false
            if (!participant?.lastReadAt) return true
            return new Date(message.createdAt).getTime() > new Date(participant.lastReadAt).getTime()
          }).length
        : 0

    const membershipStatus =
      status === classroomMembershipStatus.approved
        ? participantStatus.active
        : status === classroomMembershipStatus.invited
        ? participantStatus.invited
        : participantStatus.requested

    const placeholderMessage =
      status === classroomMembershipStatus.requested
        ? 'Aguardando aprovação do professor.'
        : status === classroomMembershipStatus.invited
        ? 'Convite pendente para entrar na turma.'
        : ''

    return {
      ...conversation,
      title: `Grupo - ${classroom.name}`,
      unreadCount,
      membershipStatus,
      membershipLabel: getMembershipStatusLabel(status),
      lastMessage: sanitizeText(conversation.lastMessage || placeholderMessage),
      lastMessageAt: conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt,
      isMuted: Boolean(participant?.isMuted),
      isPinned: Boolean(conversation.pinnedBy?.[userId]),
      classroom,
      classroomMember: member,
    }
  }

  const participant = (conversation.participants || []).find((item) => item.userId === userId) || null
  if (!participant && !conversation.isPublic) return null
  if (participant && !canReadByStatus(participant.status)) return null

  const messages = Array.isArray(state.messagesByConversation[conversation.id])
    ? state.messagesByConversation[conversation.id]
    : []

  const unreadCount = messages.filter((message) => {
    if (!participant) return false
    if (participant.status !== participantStatus.active) return false
    if (message.senderId === userId) return false
    if (!participant.lastReadAt) return true
    return new Date(message.createdAt).getTime() > new Date(participant.lastReadAt).getTime()
  }).length

  const membershipStatus = participant?.status || (conversation.isPublic ? 'public' : participantStatus.active)
  const isPrivateConversation = conversation.type === conversationType.private

  return {
    ...conversation,
    unreadCount,
    membershipStatus,
    membershipLabel: isPrivateConversation
      ? ''
      : getMembershipStatusLabel(membershipStatus, conversation.isPublic),
    lastMessage: conversation.lastMessage || '',
    lastMessageAt: conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt,
    isMuted: Boolean(participant?.isMuted),
    isPinned: Boolean(conversation.pinnedBy?.[userId]),
  }
}

export function listLiveConversationsForUser(userId) {
  if (!userId) return []
  const state = safeReadStorage()
  const list = state.conversations
    .map((conversation) => getUserConversationPreview(state, conversation, userId))
    .filter(Boolean)
  return sortConversationsByRecent(list)
}

export function listLiveClassroomGroupsForUser(userId) {
  if (!userId) return []
  const state = safeReadStorage()

  return state.classrooms
    .map((classroom) => {
      const conversation = state.conversations.find((item) => item.id === classroom.conversationId)
      if (!conversation) return null

      const member = getClassroomMember(state, classroom.id, userId)
      const status = normalizeClassroomMemberStatus(member?.status || classroomMembershipStatus.notMember)

      if (
        status !== classroomMembershipStatus.approved &&
        status !== classroomMembershipStatus.requested &&
        status !== classroomMembershipStatus.invited &&
        status !== classroomMembershipStatus.rejected &&
        status !== classroomMembershipStatus.blocked
      ) {
        return null
      }

      const preview = getUserConversationPreview(state, conversation, userId)
      return {
        ...(preview || conversation),
        id: conversation.id,
        title: `Grupo - ${classroom.name}`,
        classroomId: classroom.id,
        code: classroom.code,
        classroomCode: classroom.code,
        membershipStatus: status,
        membershipLabel: getMembershipStatusLabel(status),
        canOpenChat: status === classroomMembershipStatus.approved,
        canRequest: status === classroomMembershipStatus.notMember,
        canSend: status === classroomMembershipStatus.approved,
        isOwner: classroom.teacherId === userId,
        teacherName: classroom.teacherName,
        subject: classroom.subject,
        grade: classroom.grade,
        unreadCount: Number(preview?.unreadCount || 0),
        lastMessage:
          preview?.lastMessage ||
          (status === classroomMembershipStatus.requested
            ? 'Aguardando aprovação do professor.'
            : status === classroomMembershipStatus.rejected
            ? 'Solicitação recusada pelo professor.'
            : conversation.lastMessage || ''),
        lastMessageAt: preview?.lastMessageAt || conversation.lastMessageAt || conversation.updatedAt,
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.updatedAt || a.createdAt).getTime())
}

export function getLiveConversationById(conversationId) {
  if (!conversationId) return null
  const state = safeReadStorage()
  return state.conversations.find((item) => item.id === conversationId) || null
}

export function listLiveMessages(conversationId) {
  if (!conversationId) return []
  const state = safeReadStorage()
  const list = Array.isArray(state.messagesByConversation[conversationId])
    ? state.messagesByConversation[conversationId]
    : []
  return [...list].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

export function getLiveConversationAccess(conversationId, userId) {
  const state = safeReadStorage()
  const { conversation, participant } = getConversationAndParticipant(state, conversationId, userId)

  if (!conversation) {
    return {
      conversation: null,
      participant: null,
      canRead: false,
      canSend: false,
      reason: 'conversation_not_found',
      membershipStatus: '',
    }
  }

  if (conversation.type === conversationType.classroomGroup) {
    const { classroom, member, status } = resolveClassroomMembership(state, conversation, userId)

    if (!classroom) {
      return {
        conversation,
        participant,
        canRead: false,
        canSend: false,
        reason: 'classroom_not_found',
        membershipStatus: classroomMembershipStatus.notMember,
      }
    }

    if (status === classroomMembershipStatus.approved) {
      const role = normalizeRole(member?.role || participant?.role)
      const canSend = isRoleProfessor(role) || conversation.allowStudentMessages !== false
      return {
        conversation,
        participant,
        canRead: true,
        canSend,
        reason: canSend ? '' : 'student_messages_disabled',
        membershipStatus: classroomMembershipStatus.approved,
        classroom,
        classroomMember: member,
      }
    }

    if (status === classroomMembershipStatus.invited) {
      return { conversation, participant, canRead: false, canSend: false, reason: 'invited', membershipStatus: status, classroom, classroomMember: member }
    }

    if (status === classroomMembershipStatus.requested) {
      return { conversation, participant, canRead: false, canSend: false, reason: 'requested_approval', membershipStatus: status, classroom, classroomMember: member }
    }

    if (status === classroomMembershipStatus.rejected) {
      return { conversation, participant, canRead: false, canSend: false, reason: 'rejected', membershipStatus: status, classroom, classroomMember: member }
    }

    if (status === classroomMembershipStatus.blocked) {
      return { conversation, participant, canRead: false, canSend: false, reason: 'blocked', membershipStatus: status, classroom, classroomMember: member }
    }

    if (status === classroomMembershipStatus.left) {
      return { conversation, participant, canRead: false, canSend: false, reason: 'left', membershipStatus: status, classroom, classroomMember: member }
    }

    return {
      conversation,
      participant,
      canRead: false,
      canSend: false,
      reason: 'not_member',
      membershipStatus: classroomMembershipStatus.notMember,
      classroom,
      classroomMember: member,
    }
  }

  if (!participant) {
    if (conversation.isPublic) {
      return { conversation, participant: null, canRead: true, canSend: false, reason: 'not_member_public', membershipStatus: 'public' }
    }
    return { conversation, participant: null, canRead: false, canSend: false, reason: 'not_member', membershipStatus: '' }
  }

  const membershipStatus = participant.status || participantStatus.active
  if (!canReadByStatus(membershipStatus)) {
    return { conversation, participant, canRead: false, canSend: false, reason: membershipStatus, membershipStatus }
  }

  const role = normalizeRole(participant.role)
  let canSend = canSendByStatus(membershipStatus)
  let reason = ''

  if (!canSend) {
    reason = membershipStatus
  } else if (!isRoleProfessor(role) && conversation.allowStudentMessages === false) {
    canSend = false
    reason = 'student_messages_disabled'
  }

  return { conversation, participant, canRead: true, canSend, reason, membershipStatus }
}

export function sendLiveMessage(payload) {
  if (!payload?.conversationId || !payload?.senderId) throw new Error('Conversa ou remetente inválido.')

  const access = getLiveConversationAccess(payload.conversationId, payload.senderId)
  if (!access.canRead) {
    const error = new Error('Sem permissão de leitura na conversa.')
    error.code = access.reason || 'forbidden_read'
    throw error
  }

  if (!access.canSend) {
    const error = new Error('Sem permissão para enviar mensagem nesta conversa.')
    error.code = access.reason || 'forbidden_send'
    throw error
  }

  const state = safeReadStorage()
  const message = addMessageToState(state, payload)
  persistAndNotify(state, 'new-message', { conversationId: payload.conversationId, messageId: message.id })
  return message
}

export function markLiveConversationAsRead(conversationId, userId) {
  if (!conversationId || !userId) return
  const state = safeReadStorage()
  const { conversation, participant } = getConversationAndParticipant(state, conversationId, userId)
  if (!conversation || !participant) return
  if (participant.status !== participantStatus.active) return

  const nextParticipants = [...(conversation.participants || [])]
  const index = nextParticipants.findIndex((item) => item.userId === userId)
  if (index < 0) return

  nextParticipants[index] = { ...nextParticipants[index], lastReadAt: nowIso() }
  conversation.participants = nextParticipants
  persistAndNotify(state, 'mark-read', { conversationId })
}

export function countUnreadLiveMessages(userId) {
  const conversations = listLiveConversationsForUser(userId)
  const total = conversations.reduce((sum, conversation) => sum + Number(conversation.unreadCount || 0), 0)
  return {
    total,
    byConversation: new Map(conversations.map((conversation) => [conversation.id, Number(conversation.unreadCount || 0)])),
    conversations,
  }
}

export function publishAssignmentMessage({ conversationId, sender, activityTitle, assignmentId }) {
  return sendLiveMessage({
    conversationId,
    senderId: sender?.id,
    senderName: sender?.nome || sender?.username || 'Professor',
    senderRole: sender?.role || 'professor',
    messageType: messageType.assignment,
    text: `Nova atividade publicada: ${sanitizeText(activityTitle || 'Atividade')}`,
    assignmentId: sanitizeText(assignmentId || ''),
    dedupeKey: `assignment:${sanitizeText(assignmentId || '')}:${sanitizeText(activityTitle || '')}`,
  })
}

export function publishSubmissionNotice({ conversationId, sender, activityTitle, submissionId }) {
  return sendLiveMessage({
    conversationId,
    senderId: sender?.id,
    senderName: sender?.nome || sender?.username || 'Aluno',
    senderRole: sender?.role || 'aluno',
    messageType: messageType.submission,
    text: `${sanitizeText(sender?.nome || sender?.username || 'Aluno')} enviou a atividade: ${sanitizeText(activityTitle || 'Atividade')}`,
    submissionId: sanitizeText(submissionId || ''),
    dedupeKey: `submission:${sanitizeText(submissionId || '')}:${sanitizeText(activityTitle || '')}`,
  })
}

export function setLiveTypingStatus({ conversationId, userId, userName, role, isTyping }) {
  if (!conversationId || !userId) return
  const state = safeReadStorage()
  const typingByConversation = { ...(state.typingByConversation || {}) }
  const current = { ...(typingByConversation[conversationId] || {}) }

  if (!isTyping) {
    delete current[userId]
  } else {
    current[userId] = {
      userId,
      userName: sanitizeText(userName || 'Participante'),
      role: normalizeRole(role),
      updatedAt: nowIso(),
    }
  }

  typingByConversation[conversationId] = current
  state.typingByConversation = typingByConversation
  persistAndNotify(state, 'typing', { conversationId })
}

export function clearLiveTypingForUser(conversationId, userId) {
  if (!conversationId || !userId) return
  setLiveTypingStatus({ conversationId, userId, userName: '', role: '', isTyping: false })
}

export function getLiveTypingStatus(conversationId, excludeUserId = '') {
  if (!conversationId) return []
  const state = safeReadStorage()
  const typingMap = state.typingByConversation?.[conversationId] || {}
  const nowTime = Date.now()

  return Object.values(typingMap).filter((item) => {
    if (!item?.updatedAt) return false
    if (excludeUserId && item.userId === excludeUserId) return false
    return nowTime - new Date(item.updatedAt).getTime() <= 9000
  })
}

export function listLiveNotificationsForUser(userId) {
  return listLiveConversationsForUser(userId)
    .filter((conversation) => conversation.unreadCount > 0)
    .map((conversation) => ({
      id: `live-notif-${conversation.id}`,
      conversationId: conversation.id,
      title: conversation.title,
      unreadCount: conversation.unreadCount,
      type: conversation.type,
      lastMessage: conversation.lastMessage,
      lastMessageAt: conversation.lastMessageAt,
      membershipStatus: conversation.membershipStatus,
    }))
}

export function createStudyGroupConversation({ title, creator, members = [], isPublic = false }) {
  if (!creator?.id) throw new Error('Criador inválido para grupo de estudo.')

  const state = safeReadStorage()
  const conversationId = `study:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const conversation = ensureConversationRecord(state, {
    id: conversationId,
    type: conversationType.studyGroup,
    title: sanitizeText(title || 'Grupo de estudo'),
    createdBy: creator.id,
    isPublic: Boolean(isPublic),
    allowStudentMessages: true,
  })

  const people = [
    { id: creator.id, name: creator.nome || creator.username || 'Usuário', username: creator.username || '', role: creator.role || 'aluno', status: participantStatus.active },
    ...members.map((member) => ({
      id: member.id,
      name: member.nome || member.username || 'Participante',
      username: member.username || '',
      role: member.role || 'aluno',
      status: participantStatus.active,
    })),
  ]

  people.forEach((person) => {
    ensureParticipant(
      conversation,
      createParticipant({
        conversationId,
        userId: person.id,
        userName: person.name,
        username: sanitizeText(person.username || ''),
        role: person.role,
        status: person.status,
      })
    )
  })

  addMessageToState(state, {
    conversationId,
    senderId: creator.id,
    senderName: creator.nome || creator.username || 'Usuário',
    senderRole: creator.role || 'aluno',
    messageType: messageType.system,
    text: 'Grupo de estudo criado. Compartilhe dúvidas e materiais.',
  })

  persistAndNotify(state, 'create-study-group', { conversationId })
  return conversation
}

function updateParticipantStatus(conversation, userId, status) {
  const list = Array.isArray(conversation.participants) ? [...conversation.participants] : []
  const index = list.findIndex((item) => item.userId === userId)
  if (index < 0) return false
  list[index] = { ...list[index], status: normalizeParticipantStatus(status) }
  conversation.participants = list
  return true
}

export function setParticipantStatusForUser(conversationId, userId, status) {
  if (!conversationId || !userId || !status) return false

  const state = safeReadStorage()
  const { conversation } = getConversationAndParticipant(state, conversationId, userId)
  if (!conversation) return false

  const changed = updateParticipantStatus(conversation, userId, status)
  if (!changed) return false

  if (conversation.type === conversationType.classroomGroup) {
    const classroom = getClassroomByConversationId(state, conversationId)
    if (classroom) {
      const classroomStatus = participantToClassroomStatus(normalizeParticipantStatus(status))
      upsertClassroomMember(state, {
        classroomId: classroom.id,
        userId,
        userName: (conversation.participants || []).find((participant) => participant.userId === userId)?.userName || 'Usuário',
        role: (conversation.participants || []).find((participant) => participant.userId === userId)?.role || 'aluno',
        status: classroomStatus,
      })
    }
  }

  persistAndNotify(state, 'participant-status', { conversationId, userId, status })
  return true
}

export function joinLiveConversation(conversationId, user) {
  if (!conversationId || !user?.id) return false
  const state = safeReadStorage()
  const { conversation, participant } = getConversationAndParticipant(state, conversationId, user.id)
  if (!conversation) return false

  if (conversation.type === conversationType.classroomGroup) {
    const classroom = getClassroomByConversationId(state, conversationId)
    if (!classroom) return false

    const member = getClassroomMember(state, classroom.id, user.id)
    const memberStatus = normalizeClassroomMemberStatus(member?.status || classroomMembershipStatus.notMember)
    if (memberStatus === classroomMembershipStatus.blocked || memberStatus === classroomMembershipStatus.rejected) {
      return false
    }

    const nextStatus =
      memberStatus === classroomMembershipStatus.invited || memberStatus === classroomMembershipStatus.left
        ? classroomMembershipStatus.approved
        : memberStatus === classroomMembershipStatus.approved
        ? classroomMembershipStatus.approved
        : classroomMembershipStatus.requested

    upsertClassroomMember(state, {
      classroomId: classroom.id,
      userId: user.id,
      userName: user.nome || user.username || 'Usuário',
      role: user.role || 'aluno',
      status: nextStatus,
    })

    if (nextStatus === classroomMembershipStatus.approved) {
      ensureParticipant(
        conversation,
        createParticipant({
          conversationId,
          userId: user.id,
          userName: user.nome || user.username || 'Usuário',
          username: user.username || '',
          role: user.role || 'aluno',
          status: participantStatus.active,
        })
      )
    }

    persistAndNotify(state, 'join-group', { conversationId, userId: user.id })
    return nextStatus === classroomMembershipStatus.approved
  }

  if (!participant) {
    ensureParticipant(
      conversation,
      createParticipant({
        conversationId,
        userId: user.id,
        userName: user.nome || user.username || 'Usuário',
        username: user.username || '',
        role: user.role || 'aluno',
        status: participantStatus.active,
      })
    )
  } else {
    updateParticipantStatus(conversation, user.id, participantStatus.active)
  }

  persistAndNotify(state, 'join-group', { conversationId, userId: user.id })
  return true
}

export function requestLiveConversationAccess(conversationId, user) {
  if (!conversationId || !user?.id) return false
  const state = safeReadStorage()
  const { conversation, participant } = getConversationAndParticipant(state, conversationId, user.id)
  if (!conversation) return false

  if (conversation.type === conversationType.classroomGroup) {
    const classroom = getClassroomByConversationId(state, conversationId)
    if (!classroom) return false

    const member = getClassroomMember(state, classroom.id, user.id)
    const currentStatus = normalizeClassroomMemberStatus(member?.status || classroomMembershipStatus.notMember)
    if (currentStatus === classroomMembershipStatus.blocked) return false
    if (currentStatus === classroomMembershipStatus.approved) return true

    upsertClassroomMember(state, {
      classroomId: classroom.id,
      userId: user.id,
      userName: user.nome || user.username || 'Usuário',
      role: user.role || 'aluno',
      status: classroomMembershipStatus.requested,
    })

    ensureParticipant(
      conversation,
      createParticipant({
        conversationId,
        userId: user.id,
        userName: user.nome || user.username || 'Usuário',
        username: user.username || '',
        role: user.role || 'aluno',
        status: participantStatus.requested,
      })
    )

    upsertClassroomRequest(state, {
      classroomId: classroom.id,
      studentId: user.id,
      studentName: user.nome || user.username || 'Aluno',
      studentHandle: user.username || '',
      status: classroomMembershipStatus.requested,
      requestedAt: nowIso(),
      reviewedAt: '',
      reviewedBy: '',
    })

    persistAndNotify(state, 'request-group', { conversationId, userId: user.id })
    return true
  }

  if (!participant) {
    ensureParticipant(
      conversation,
      createParticipant({
        conversationId,
        userId: user.id,
        userName: user.nome || user.username || 'Usuário',
        username: user.username || '',
        role: user.role || 'aluno',
        status: participantStatus.requested,
      })
    )
  } else {
    updateParticipantStatus(conversation, user.id, participantStatus.requested)
  }

  persistAndNotify(state, 'request-group', { conversationId, userId: user.id })
  return true
}

export function leaveLiveConversation(conversationId, userId) {
  if (!conversationId || !userId) return false
  const state = safeReadStorage()
  const { conversation } = getConversationAndParticipant(state, conversationId, userId)
  if (!conversation) return false

  updateParticipantStatus(conversation, userId, participantStatus.left)

  if (conversation.type === conversationType.classroomGroup) {
    const classroom = getClassroomByConversationId(state, conversationId)
    if (classroom) {
      upsertClassroomMember(state, {
        classroomId: classroom.id,
        userId,
        userName: (conversation.participants || []).find((item) => item.userId === userId)?.userName || 'Usuário',
        role: (conversation.participants || []).find((item) => item.userId === userId)?.role || 'aluno',
        status: classroomMembershipStatus.left,
      })
    }
  }

  persistAndNotify(state, 'leave-group', { conversationId, userId })
  return true
}

export function toggleMuteLiveConversation(conversationId, userId) {
  if (!conversationId || !userId) return false
  const state = safeReadStorage()
  const { conversation, participant } = getConversationAndParticipant(state, conversationId, userId)
  if (!conversation || !participant) return false

  const list = [...(conversation.participants || [])]
  const index = list.findIndex((item) => item.userId === userId)
  if (index < 0) return false

  list[index] = { ...list[index], isMuted: !list[index].isMuted }
  conversation.participants = list
  persistAndNotify(state, 'mute-group', { conversationId, userId })
  return true
}

export function togglePinLiveConversation(conversationId, userId) {
  if (!conversationId || !userId) return false
  const state = safeReadStorage()
  const { conversation } = getConversationAndParticipant(state, conversationId, userId)
  if (!conversation) return false

  const pinnedBy = { ...(conversation.pinnedBy || {}) }
  if (pinnedBy[userId]) delete pinnedBy[userId]
  else pinnedBy[userId] = true
  conversation.pinnedBy = pinnedBy
  persistAndNotify(state, 'pin-group', { conversationId, userId })
  return true
}

export function updateLiveConversationSettings(conversationId, actingUserId, patch = {}) {
  if (!conversationId || !actingUserId) return false
  const state = safeReadStorage()
  const { conversation, participant } = getConversationAndParticipant(state, conversationId, actingUserId)
  if (!conversation || !participant) return false

  const role = normalizeRole(participant.role)
  if (!isRoleProfessor(role) || participant.status !== participantStatus.active) return false

  const nextAllow =
    patch.allowStudentMessages === undefined
      ? conversation.allowStudentMessages
      : Boolean(patch.allowStudentMessages)

  conversation.allowStudentMessages = nextAllow
  conversation.updatedAt = nowIso()
  persistAndNotify(state, 'settings-update', { conversationId })
  return true
}

function isTeacherProfile(profile) {
  if (isRoleProfessor(profile?.role)) return true

  return Boolean(
    sanitizeText(
      profile?.teacher_subject ||
        profile?.teacherSubject ||
        profile?.teacher_school ||
        profile?.teacherSchool ||
        profile?.teacher_registration ||
        profile?.teacherRegistration ||
        profile?.teacher_department ||
        profile?.teacherDepartment ||
        ''
    )
  )
}

function createClassroomId(name, grade, subject) {
  const source = `${toSlug(name) || 'turma'}-${toSlug(grade) || 'geral'}-${toSlug(subject) || 'base'}`
  return `${source}-${Math.random().toString(36).slice(2, 6)}`
}

function removeClassroomsAndRelatedState(state, classroomIdsInput = []) {
  const classroomIds = new Set(
    (Array.isArray(classroomIdsInput) ? classroomIdsInput : [classroomIdsInput])
      .map((item) => sanitizeText(item))
      .filter(Boolean)
  )

  const conversationIds = new Set()

  state.classrooms.forEach((classroom) => {
    if (classroomIds.has(classroom.id) && classroom.conversationId) {
      conversationIds.add(classroom.conversationId)
    }
  })

  state.conversations.forEach((conversation) => {
    const classroomId = sanitizeText(conversation?.classroomId || '')
    if (conversation.type === conversationType.classroomGroup) {
      if (
        classroomIds.size === 0 ||
        !classroomId ||
        classroomIds.has(classroomId)
      ) {
        conversationIds.add(conversation.id)
      }
      return
    }
    if (
      classroomIds.size === 0
        ? Boolean(classroomId)
        : classroomId && classroomIds.has(classroomId)
    ) {
      conversationIds.add(conversation.id)
    }
  })

  let removedMessages = 0
  let removedTyping = 0

  const nextMessages = {}
  Object.entries(state.messagesByConversation || {}).forEach(([conversationId, messages]) => {
    if (conversationIds.has(conversationId)) {
      removedMessages += Array.isArray(messages) ? messages.length : 0
      return
    }
    nextMessages[conversationId] = messages
  })
  state.messagesByConversation = nextMessages

  const nextTyping = {}
  Object.entries(state.typingByConversation || {}).forEach(([conversationId, typing]) => {
    if (conversationIds.has(conversationId)) {
      removedTyping += typing && typeof typing === 'object' ? Object.keys(typing).length : 0
      return
    }
    nextTyping[conversationId] = typing
  })
  state.typingByConversation = nextTyping

  const classroomsBefore = state.classrooms.length
  const membersBefore = state.classroomMembers.length
  const requestsBefore = state.classroomJoinRequests.length
  const conversationsBefore = state.conversations.length

  state.classrooms =
    classroomIds.size === 0
      ? []
      : state.classrooms.filter((classroom) => !classroomIds.has(classroom.id))
  state.classroomMembers =
    classroomIds.size === 0
      ? []
      : state.classroomMembers.filter((member) => !classroomIds.has(member.classroomId))
  state.classroomJoinRequests =
    classroomIds.size === 0
      ? []
      : state.classroomJoinRequests.filter((request) => !classroomIds.has(request.classroomId))
  state.conversations = state.conversations.filter(
    (conversation) => !conversationIds.has(conversation.id)
  )

  return {
    classrooms: classroomsBefore - state.classrooms.length,
    classroomMembers: membersBefore - state.classroomMembers.length,
    classroomJoinRequests: requestsBefore - state.classroomJoinRequests.length,
    conversations: conversationsBefore - state.conversations.length,
    messages: removedMessages,
    typingEntries: removedTyping,
  }
}

export function ensureClassroomGroupsForProfile(profile) {
  if (!profile?.id) return []
  return listLiveClassroomGroupsForUser(profile.id)
}

export function createClassroomForTeacher({
  teacher,
  name,
  subject,
  grade,
  description = '',
  classroomId = '',
  code = '',
  classroomCode = '',
}) {
  if (!teacher?.id) throw new Error('Perfil inválido para criar sala.')

  const cleanName = sanitizeText(name)
  if (!cleanName) throw new Error('Informe o nome da turma.')

  const state = safeReadStorage()
  const classroom = ensureClassroomRecord(state, {
    id: sanitizeText(classroomId) || createClassroomId(cleanName, grade, subject),
    name: cleanName,
    subject: sanitizeText(subject || ''),
    grade: sanitizeText(grade || ''),
    description: sanitizeText(description || ''),
    teacherId: teacher.id,
    teacherName: sanitizeText(teacher?.nome || teacher?.username || 'Professor'),
    code:
      sanitizeCode(code || classroomCode) ||
      generateUniqueClassroomCode(state, { name: cleanName, grade, subject }),
    createdAt: nowIso(),
    isActive: true,
  })

  const conversation = ensureClassroomConversationAndTeacher(state, classroom, teacher)
  persistAndNotify(state, 'classroom-create', { classroomId: classroom.id, conversationId: conversation.id })
  return { classroom, conversation }
}

export function updateClassroomForTeacher({ classroomId, teacherId, patch = {} }) {
  if (!classroomId || !teacherId) return null

  const state = safeReadStorage()
  const classroom = getClassroomById(state, sanitizeText(classroomId))
  if (!classroom || classroom.teacherId !== teacherId) return null

  const nextName = sanitizeText(patch?.name || classroom.name)
  if (!nextName) return null

  classroom.name = nextName
  classroom.subject = sanitizeText(patch?.subject || classroom.subject)
  classroom.grade = sanitizeText(patch?.grade || classroom.grade)
  classroom.description = sanitizeText(patch?.description || classroom.description)

  const conversation = state.conversations.find((item) => item.id === classroom.conversationId)
  if (conversation) {
    conversation.title = `Grupo - ${classroom.name}`
    conversation.updatedAt = nowIso()
    conversation.meta = {
      ...(conversation.meta || {}),
      subject: classroom.subject,
      grade: classroom.grade,
      teacherName: classroom.teacherName,
      classroomName: classroom.name,
      code: classroom.code,
      joinCode: classroom.code,
    }
  }

  persistAndNotify(state, 'classroom-update', { classroomId: classroom.id })
  return classroom
}

export function deleteClassroomAndRelatedData({ classroomId, actingUserId = '', force = false } = {}) {
  const targetId = sanitizeText(classroomId)
  if (!targetId) {
    return {
      deleted: false,
      classrooms: 0,
      classroomMembers: 0,
      classroomJoinRequests: 0,
      conversations: 0,
      messages: 0,
      typingEntries: 0,
    }
  }

  const state = safeReadStorage()
  const classroom = getClassroomById(state, targetId)
  if (!classroom) {
    return {
      deleted: false,
      classrooms: 0,
      classroomMembers: 0,
      classroomJoinRequests: 0,
      conversations: 0,
      messages: 0,
      typingEntries: 0,
    }
  }

  if (!force && actingUserId && classroom.teacherId !== actingUserId) {
    return {
      deleted: false,
      classrooms: 0,
      classroomMembers: 0,
      classroomJoinRequests: 0,
      conversations: 0,
      messages: 0,
      typingEntries: 0,
    }
  }

  const report = removeClassroomsAndRelatedState(state, [targetId])
  persistAndNotify(state, 'classroom-delete', { classroomId: targetId, ...report })
  return { deleted: report.classrooms > 0, ...report }
}

export function deleteAllClassroomsAndRelatedData({ actingUserId = '', force = false } = {}) {
  const state = safeReadStorage()
  const classroomIds = state.classrooms.map((classroom) => classroom.id).filter(Boolean)

  if (!force && actingUserId) {
    const podeLimpar = state.classrooms.some((classroom) => classroom.teacherId === actingUserId)
    if (!podeLimpar) {
      return {
        deleted: false,
        classrooms: 0,
        classroomMembers: 0,
        classroomJoinRequests: 0,
        conversations: 0,
        messages: 0,
        typingEntries: 0,
      }
    }
  }

  const report = removeClassroomsAndRelatedState(state, classroomIds)
  persistAndNotify(state, 'classrooms-delete-all', report)
  return {
    deleted:
      report.classrooms > 0 ||
      report.classroomMembers > 0 ||
      report.classroomJoinRequests > 0 ||
      report.conversations > 0 ||
      report.messages > 0 ||
      report.typingEntries > 0,
    ...report,
  }
}

export function listClassroomsForUser(userProfile) {
  if (!userProfile?.id) return []

  const state = safeReadStorage()
  const userId = userProfile.id
  const isTeacher = isTeacherProfile(userProfile)

  return state.classrooms
    .map((classroom) => {
      const member = getClassroomMember(state, classroom.id, userId)
      const membership = normalizeClassroomMemberStatus(
        member?.status ||
          (isTeacher && classroom.teacherId === userId
            ? classroomMembershipStatus.approved
            : classroomMembershipStatus.notMember)
      )

      if (membership === classroomMembershipStatus.notMember) return null

      const conversation = state.conversations.find((item) => item.id === classroom.conversationId)
      const preview = conversation ? getUserConversationPreview(state, conversation, userId) : null

      return {
        ...classroom,
        membershipStatus: membership,
        membershipLabel: getMembershipStatusLabel(membership),
        canOpenChat: membership === classroomMembershipStatus.approved,
        teacher: classroom.teacherName,
        unreadCount: Number(preview?.unreadCount || 0),
        lastMessage: preview?.lastMessage || conversation?.lastMessage || '',
        lastMessageAt: preview?.lastMessageAt || conversation?.lastMessageAt || classroom.createdAt,
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.lastMessageAt || b.createdAt).getTime() - new Date(a.lastMessageAt || a.createdAt).getTime())
}

export function findClassroomByCode(code, currentUserId = '') {
  const target = normalizeClassroomCodeKey(code)
  if (!target) return null

  const state = safeReadStorage()
  const classroom = state.classrooms.find(
    (item) => item.isActive !== false && normalizeClassroomCodeKey(item.code) === target
  )
  if (!classroom) return null

  const member = currentUserId ? getClassroomMember(state, classroom.id, currentUserId) : null
  const membershipStatus = normalizeClassroomMemberStatus(member?.status || classroomMembershipStatus.notMember)

  return {
    ...classroom,
    membershipStatus,
    membershipLabel: getMembershipStatusLabel(membershipStatus),
  }
}

export function submitClassroomJoinRequestByCode({ code, student }) {
  if (!student?.id) {
    const error = new Error('Aluno inválido.')
    error.code = 'student_invalid'
    throw error
  }

  const state = safeReadStorage()
  const targetCode = normalizeClassroomCodeKey(code)
  const classroom = state.classrooms.find(
    (item) => item.isActive !== false && normalizeClassroomCodeKey(item.code) === targetCode
  )

  if (!classroom) {
    const error = new Error('Código de sala inválido.')
    error.code = 'classroom_code_not_found'
    throw error
  }

  const member = getClassroomMember(state, classroom.id, student.id)
  const memberStatus = normalizeClassroomMemberStatus(member?.status || classroomMembershipStatus.notMember)

  if (memberStatus === classroomMembershipStatus.blocked) {
    const error = new Error('Aluno bloqueado nesta sala.')
    error.code = 'classroom_member_blocked'
    throw error
  }

  if (memberStatus === classroomMembershipStatus.approved) {
    return { classroom, status: classroomMembershipStatus.approved, message: 'Você ja participa desta sala.' }
  }

  upsertClassroomMember(state, {
    classroomId: classroom.id,
    userId: student.id,
    userName: student.nome || student.username || 'Aluno',
    role: student.role || 'aluno',
    status: classroomMembershipStatus.requested,
  })

  const request = upsertClassroomRequest(state, {
    classroomId: classroom.id,
    studentId: student.id,
    studentName: student.nome || student.username || 'Aluno',
    studentHandle: student.username || '',
    status: classroomMembershipStatus.requested,
    requestedAt: nowIso(),
    reviewedAt: '',
    reviewedBy: '',
  })

  const conversation = state.conversations.find((item) => item.id === classroom.conversationId)
  if (conversation) {
    ensureParticipant(
      conversation,
      createParticipant({
        conversationId: conversation.id,
        userId: student.id,
        userName: student.nome || student.username || 'Aluno',
        username: student.username || '',
        role: student.role || 'aluno',
        status: participantStatus.requested,
      })
    )
  }

  persistAndNotify(state, 'classroom-request', { classroomId: classroom.id, studentId: student.id })
  return { classroom, request, status: classroomMembershipStatus.requested, message: 'Solicitação enviada. Aguarde aprovação do professor.' }
}

export function listClassroomJoinRequestsForTeacher(teacherId) {
  if (!teacherId) return []

  const state = safeReadStorage()
  const classroomById = new Map(state.classrooms.map((classroom) => [classroom.id, classroom]))

  return state.classroomJoinRequests
    .filter((request) => {
      const classroom = classroomById.get(request.classroomId)
      if (!classroom) return false
      return classroom.teacherId === teacherId && request.status === classroomMembershipStatus.requested
    })
    .map((request) => {
      const classroom = classroomById.get(request.classroomId)
      return {
        ...request,
        classroomName: classroom?.name || 'Turma',
        classroomSubject: classroom?.subject || '',
        classroomGrade: classroom?.grade || '',
        code: classroom?.code || '',
        classroomCode: classroom?.code || '',
      }
    })
    .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
}

export function reviewClassroomJoinRequest({ requestId, teacherId, approve }) {
  if (!requestId || !teacherId) {
    const error = new Error('Revisão inválida.')
    error.code = 'request_invalid'
    throw error
  }

  const state = safeReadStorage()
  const requestIndex = state.classroomJoinRequests.findIndex((item) => item.id === requestId)
  if (requestIndex < 0) {
    const error = new Error('Solicitação não encontrada.')
    error.code = 'request_not_found'
    throw error
  }

  const request = state.classroomJoinRequests[requestIndex]
  const classroom = getClassroomById(state, request.classroomId)
  if (!classroom || classroom.teacherId !== teacherId) {
    const error = new Error('Sem permissão para revisar solicitação.')
    error.code = 'request_forbidden'
    throw error
  }

  const reviewedStatus = approve ? classroomMembershipStatus.approved : classroomMembershipStatus.rejected
  state.classroomJoinRequests[requestIndex] = {
    ...request,
    status: reviewedStatus,
    reviewedAt: nowIso(),
    reviewedBy: teacherId,
  }

  const member = upsertClassroomMember(state, {
    classroomId: classroom.id,
    userId: request.studentId,
    userName: request.studentName,
    role: 'aluno',
    status: reviewedStatus,
  })

  const conversation = state.conversations.find((item) => item.id === classroom.conversationId)
  if (conversation) {
    if (approve) {
      ensureParticipant(
        conversation,
        createParticipant({
          conversationId: conversation.id,
          userId: request.studentId,
          userName: request.studentName,
          username: request.studentHandle,
          role: 'aluno',
          status: participantStatus.active,
        })
      )

      addMessageToState(state, {
        conversationId: conversation.id,
        senderId: teacherId,
        senderName: classroom.teacherName,
        senderRole: 'professor',
        messageType: messageType.system,
        text: `${request.studentName} entrou na sala.`,
        dedupeKey: `approved:${request.id}`,
      })
    } else {
      updateParticipantStatus(conversation, request.studentId, participantStatus.left)
    }
  }

  persistAndNotify(state, 'classroom-request-reviewed', {
    classroomId: classroom.id,
    requestId,
    approve: Boolean(approve),
  })

  return { request: state.classroomJoinRequests[requestIndex], classroom, member }
}

export function getClassroomMembershipForUser(classroomId, userId) {
  if (!classroomId || !userId) return classroomMembershipStatus.notMember
  const state = safeReadStorage()
  const member = getClassroomMember(state, classroomId, userId)
  return normalizeClassroomMemberStatus(member?.status || classroomMembershipStatus.notMember)
}

export function listClassroomMembers(classroomId) {
  if (!classroomId) return []
  const state = safeReadStorage()

  return state.classroomMembers
    .filter((member) => member.classroomId === classroomId)
    .sort((a, b) => {
      if (a.role === b.role) return a.userName.localeCompare(b.userName, 'pt-BR')
      if (a.role === 'professor') return -1
      if (b.role === 'professor') return 1
      return a.userName.localeCompare(b.userName, 'pt-BR')
    })
}

export function updateClassroomMemberStatus({ classroomId, userId, status, actingUserId }) {
  if (!classroomId || !userId || !status || !actingUserId) return false

  const state = safeReadStorage()
  const classroom = getClassroomById(state, classroomId)
  if (!classroom || classroom.teacherId !== actingUserId) return false

  const normalized = normalizeClassroomMemberStatus(status)
  upsertClassroomMember(state, {
    classroomId,
    userId,
    userName: getClassroomMember(state, classroomId, userId)?.userName || 'Aluno',
    role: getClassroomMember(state, classroomId, userId)?.role || 'aluno',
    status: normalized,
  })

  const conversation = state.conversations.find((item) => item.id === classroom.conversationId)
  if (conversation) {
    const participantState = classroomToParticipantStatus(normalized)
    ensureParticipant(
      conversation,
      createParticipant({
        conversationId: conversation.id,
        userId,
        userName:
          getClassroomMember(state, classroomId, userId)?.userName ||
          (conversation.participants || []).find((participant) => participant.userId === userId)?.userName ||
          'Aluno',
        role: getClassroomMember(state, classroomId, userId)?.role || 'aluno',
        status: participantState,
      })
    )
  }

  persistAndNotify(state, 'classroom-member-status', { classroomId, userId, status: normalized })
  return true
}




