import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { friendlyGroupError, getGroup, getMyProfile, listGroupMembers, notifyGroupsUpdated } from '../lib/groups'
import { supabase } from '../lib/supabase'
import ConfirmDialog from '../components/ConfirmDialog'
import AutoLinkText from '../components/AutoLinkText'

function ComposerIcon({ name }) {
  const paths = {
    attach: <><path d="M21.4 11.6 12 21a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.6-8.6" /></>,
    mic: <><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none" />,
    send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
    once: <><circle cx="12" cy="12" r="9" /><path d="M10.5 9.5 12 8v8M10 16h4" /></>,
  }
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export default function GroupRoom() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const bottomRef = useRef(null)
  const mediaInputRef = useRef(null)
  const avatarInputRef = useRef(null)
  const recorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const [me, setMe] = useState(null)
  const [group, setGroup] = useState(null)
  const [members, setMembers] = useState([])
  const [messages, setMessages] = useState([])
  const [requests, setRequests] = useState([])
  const [profiles, setProfiles] = useState([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [details, setDetails] = useState(false)
  const [inviteSearch, setInviteSearch] = useState('')
  const [tab, setTab] = useState('members')
  const [uploading, setUploading] = useState(false)
  const [pendingMedia, setPendingMedia] = useState(null)
  const [hiddenIds, setHiddenIds] = useState(new Set())
  const [viewedIds, setViewedIds] = useState(new Set())
  const [clearedAt, setClearedAt] = useState(null)
  const [oncePreview, setOncePreview] = useState(null)
  const [recording, setRecording] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [memberMenuId, setMemberMenuId] = useState('')
  const [clearConfirm, setClearConfirm] = useState(false)

  const myMember = members.find((member) => member.profile_id === me?.id)
  const isAdmin = myMember?.role === 'owner' || myMember?.role === 'admin'
  const canSend = group && (!group.only_admins_send || isAdmin)

  async function loadAll() {
    try {
      const profile = me || await getMyProfile()
      if (!me) setMe(profile)
      const [groupData, memberData, messageResult, hiddenResult, viewsResult, readResult] = await Promise.all([
        getGroup(groupId),
        listGroupMembers(groupId),
        supabase.from('nexo_group_messages')
          .select('*,sender:profiles!nexo_group_messages_sender_profile_id_fkey(id,nome,username,foto_url)')
          .eq('group_id', groupId)
          .order('created_at').limit(500),
        supabase.from('nexo_group_message_hidden').select('message_id').eq('profile_id', profile.id),
        supabase.from('nexo_group_media_views').select('message_id').eq('profile_id', profile.id),
        supabase.from('nexo_group_reads').select('cleared_at').eq('group_id', groupId).eq('profile_id', profile.id).maybeSingle(),
      ])
      if (messageResult.error) throw messageResult.error
      setGroup(groupData)
      setMembers(memberData)
      setMessages(messageResult.data || [])
      setHiddenIds(new Set((hiddenResult.data || []).map((item) => item.message_id)))
      setViewedIds(new Set((viewsResult.data || []).map((item) => item.message_id)))
      setClearedAt(readResult.data?.cleared_at || null)
      if (memberData.some((member) => ['owner', 'admin'].includes(member.role) && member.profile_id === profile.id)) {
        const { data } = await supabase.from('nexo_group_join_requests')
          .select('*,profile:profiles!nexo_group_join_requests_profile_id_fkey(id,nome,username,foto_url)')
          .eq('group_id', groupId)
          .eq('status', 'pending')
        setRequests(data || [])
      }
      await supabase.from('nexo_group_reads').upsert({
        group_id: groupId, profile_id: profile.id, last_read_at: new Date().toISOString(),
      })
    } catch (err) {
      setError(friendlyGroupError(err))
    }
  }

  useEffect(() => { void loadAll() }, [groupId])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length])
  useEffect(() => {
    const channel = supabase.channel(`nexo-group-${groupId}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'nexo_group_messages', filter: `group_id=eq.${groupId}`,
    }, () => void loadAll()).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [groupId, me?.id])

  async function send(event) {
    event.preventDefault()
    const content = text.trim()
    if (!content || !me || !canSend) return
    setText('')
    const { error: sendError } = await supabase.from('nexo_group_messages').insert({
      group_id: groupId, sender_profile_id: me.id, content,
    })
    if (sendError) setError(friendlyGroupError(sendError))
    else void loadAll()
  }

  async function uploadFile(file, kindOverride = '', sendOnce = false) {
    if (!file || !me) return
    try {
      setUploading(true)
      setError('')
      const extension = file.name?.split('.').pop()?.toLowerCase() || 'bin'
      const path = `groups/${groupId}/${me.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('stories').upload(path, file, {
        contentType: file.type, upsert: false,
      })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('stories').getPublicUrl(path)
      const kind = kindOverride || (file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'file')
      const { error: messageError } = await supabase.from('nexo_group_messages').insert({
        group_id: groupId,
        sender_profile_id: me.id,
        content: kind === 'image' ? 'Foto' : kind === 'video' ? 'Vídeo' : kind === 'audio' ? 'Áudio' : file.name,
        message_type: kind,
        media_url: data.publicUrl,
        media_name: file.name,
        media_size: file.size,
        view_once: Boolean(sendOnce) && ['image', 'video', 'audio'].includes(kind),
      })
      if (messageError) throw messageError
      setPendingMedia(null)
      await loadAll()
    } catch (err) {
      setError(friendlyGroupError(err))
    } finally {
      setUploading(false)
    }
  }

  async function updateAvatar(file) {
    if (!file || !isAdmin) return
    try {
      setUploading(true)
      const extension = file.name?.split('.').pop() || 'jpg'
      const path = `groups/${groupId}/avatar-${Date.now()}.${extension}`
      const { error: uploadError } = await supabase.storage.from('stories').upload(path, file, { contentType: file.type })
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('stories').getPublicUrl(path)
      await updateGroup({ avatar_url: data.publicUrl })
    } catch (err) {
      setError(friendlyGroupError(err))
    } finally {
      setUploading(false)
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop()
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data)
      }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        setRecording(false)
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const file = new File([blob], `audio-${Date.now()}.webm`, { type: blob.type })
        setPendingMedia({ file, kind: 'audio', preview: URL.createObjectURL(file) })
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch {
      setError('Não foi possível acessar o microfone. Verifique a permissão do navegador.')
    }
  }

  async function openOnce(message) {
    if (message.sender_profile_id === me?.id || !message.view_once || viewedIds.has(message.id)) return
    const { error: viewError } = await supabase.from('nexo_group_media_views').insert({
      message_id: message.id, profile_id: me.id,
    })
    if (viewError) {
      setError(friendlyGroupError(viewError))
      return
    }
    setViewedIds((current) => new Set([...current, message.id]))
    setOncePreview(message)
  }

  function closeOnce() {
    setOncePreview(null)
  }

  async function deleteMessage(message, forEveryone) {
    await rpc(forEveryone ? 'nexo_delete_group_message_for_everyone' : 'nexo_hide_group_message',
      forEveryone ? { p_message_id: message.id } : { p_message_id: message.id })
    setDeleteTarget(null)
  }

  async function clearChat() {
    await rpc('nexo_clear_group_chat', { p_group_id: groupId })
    setClearConfirm(false)
  }

  async function updateGroup(patch) {
    const { error: updateError } = await supabase.from('nexo_groups').update(patch).eq('id', groupId)
    if (updateError) setError(friendlyGroupError(updateError))
    else { notifyGroupsUpdated(); void loadAll() }
  }

  async function rpc(name, params) {
    const { error: rpcError } = await supabase.rpc(name, params)
    if (rpcError) setError(friendlyGroupError(rpcError))
    else void loadAll()
  }

  async function loadProfiles() {
    setTab('invite')
    if (profiles.length) return
    const ids = members.map((member) => member.profile_id)
    let query = supabase.from('profiles').select('id,nome,username,foto_url').order('nome').limit(300)
    if (ids.length) query = query.not('id', 'in', `(${ids.join(',')})`)
    const { data } = await query
    setProfiles(data || [])
  }

  const availableProfiles = useMemo(() => {
    const term = inviteSearch.toLowerCase().trim()
    return profiles.filter((profile) => !term || `${profile.nome} ${profile.username}`.toLowerCase().includes(term))
  }, [profiles, inviteSearch])

  if (!group) return <div className="container"><div className="page">{error || 'Carregando grupo...'}</div></div>

  return (
    <div className="container group-room-shell">
      <header className="topbar group-room-topbar">
        <button className="group-icon-btn" onClick={() => navigate('/mensagens')}>←</button>
        <button className="group-room-identity" onClick={() => setDetails(true)}>
          <span className="group-person-avatar">{group.avatar_url ? <img src={group.avatar_url} alt="" /> : group.name[0]}</span>
          <span><strong>{group.name}</strong><small>{members.length} participantes</small></span>
        </button>
        <button className="group-icon-btn" onClick={() => setDetails(true)}>⋮</button>
      </header>

      <main className="group-messages">
        {error ? <div className="alert-box erro-box">{error}</div> : null}
        <div className="group-encryption-note">🔒 As mensagens são visíveis apenas para participantes do grupo.</div>
        {messages.filter((message) => !hiddenIds.has(message.id) && (!clearedAt || new Date(message.created_at) > new Date(clearedAt))).map((message) => {
          const mine = message.sender_profile_id === me?.id
          const onceConsumed = message.view_once && !mine && viewedIds.has(message.id)
          return (
            <article className={`group-message ${mine ? 'mine' : ''}`} key={message.id}
              onContextMenu={(event) => { event.preventDefault(); setDeleteTarget(message) }}>
              {!mine ? <strong>{message.sender?.nome || 'Participante'}</strong> : null}
              {message.deleted_at ? <p className="group-deleted-message">🚫 Mensagem apagada</p> : <>
                {message.media_url && message.message_type === 'image' ? (
                  onceConsumed ? <button className="group-once-consumed">◉ Foto de visualização única aberta</button>
                    : <button className="group-media-button" onClick={() => openOnce(message)}>
                      {message.view_once && !mine ? <span className="group-once-placeholder">◉ Abrir foto de visualização única</span>
                        : <img src={message.media_url} alt={message.content || 'Foto'} />}
                      {message.view_once && mine ? <span>◉ Visualização única</span> : null}
                    </button>
                ) : null}
                {message.media_url && message.message_type === 'video' ? (
                  onceConsumed ? <button className="group-once-consumed">◉ Vídeo de visualização única aberto</button>
                    : message.view_once && !mine
                      ? <button className="group-once-consumed available" onClick={() => openOnce(message)}>◉ Abrir vídeo de visualização única</button>
                      : <div><video className="group-message-video" src={message.media_url} controls />
                        {message.view_once ? <span className="group-once-label">◉ Visualização única</span> : null}</div>
                ) : null}
                {message.media_url && message.message_type === 'audio' ? (
                  onceConsumed ? <button className="group-once-consumed">Áudio de visualização única aberto</button>
                    : message.view_once && !mine
                      ? <button className="group-once-consumed available" onClick={() => openOnce(message)}>
                        <ComposerIcon name="once" /> Abrir áudio de visualização única
                      </button>
                      : <div><audio className="group-message-audio" src={message.media_url} controls />
                        {message.view_once ? <span className="group-once-label">Visualização única</span> : null}</div>
                ) : null}
                {message.message_type === 'text' || !message.media_url ? <p><AutoLinkText text={message.content} /></p> : null}
              </>}
              {!message.deleted_at ? <div className="group-message-actions">
                <button onClick={() => setDeleteTarget(message)}>Apagar</button>
              </div> : null}
              <time>{new Date(message.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</time>
            </article>
          )
        })}
        <div ref={bottomRef} />
      </main>

      <form className="group-composer" onSubmit={send}>
        <input ref={mediaInputRef} type="file" hidden accept="image/*,video/*,audio/*"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (!file) return
            const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'file'
            setPendingMedia({ file, kind, preview: URL.createObjectURL(file) })
          }} />
        <button type="button" className="group-composer-tool" onClick={() => mediaInputRef.current?.click()}
          disabled={uploading} aria-label="Anexar foto, vídeo ou áudio" title="Anexar mídia">
          <ComposerIcon name="attach" />
        </button>
        <button type="button" className={`group-composer-tool ${recording ? 'recording' : ''}`}
          onClick={toggleRecording} disabled={uploading}
          aria-label={recording ? 'Parar gravação' : 'Gravar áudio'} title={recording ? 'Parar gravação' : 'Gravar áudio'}>
          <ComposerIcon name={recording ? 'stop' : 'mic'} />
        </button>
        <input value={text} onChange={(event) => setText(event.target.value)}
          placeholder={canSend ? 'Mensagem' : 'Somente administradores podem enviar'} disabled={!canSend} />
        <button className="group-composer-send" disabled={!canSend || !text.trim()} aria-label="Enviar mensagem">
          <ComposerIcon name="send" />
        </button>
      </form>

      {details ? (
        <div className="group-drawer-overlay" onClick={() => setDetails(false)}>
          <aside className="group-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="group-drawer-head">
              <button className="group-icon-btn" onClick={() => setDetails(false)}>←</button><h2>Dados do grupo</h2>
            </div>
            <div className="group-info-hero">
              <input ref={avatarInputRef} type="file" hidden accept="image/*"
                onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void updateAvatar(file) }} />
              <button className="group-avatar-edit" onClick={() => isAdmin && avatarInputRef.current?.click()}>
                {group.avatar_url ? <img src={group.avatar_url} alt="" /> : group.name[0]}
                {isAdmin ? <i>Alterar foto</i> : null}
              </button>
              <h2>{group.name}</h2><p>{group.description || 'Sem descrição'}</p>
              <small>{members.length} participantes</small>
            </div>

            <div className="group-tabs">
              <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>Participantes</button>
              {isAdmin ? <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>Solicitações ({requests.length})</button> : null}
              <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Configurações</button>
            </div>

            {tab === 'members' ? <div className="group-details-list">
              <button className="group-action-row accent" onClick={loadProfiles}>＋ Adicionar participantes</button>
              {members.map((member) => (
                <div className="group-member-admin-row" key={member.profile_id}>
                  <span className="group-person-avatar">{member.profile?.foto_url ? <img src={member.profile.foto_url} alt="" /> : member.profile?.nome?.[0]}</span>
                  <span><strong>{member.profile?.nome}</strong><small>@{member.profile?.username} {member.role !== 'member' ? `• ${member.role === 'owner' ? 'Dono' : 'ADM'}` : ''}</small></span>
                  {isAdmin && member.role !== 'owner' && member.profile_id !== me?.id ? <div className="group-member-menu">
                    <button className="group-member-menu-trigger" onClick={() => setMemberMenuId((id) => id === member.profile_id ? '' : member.profile_id)}>•••</button>
                    {memberMenuId === member.profile_id ? <div className="group-member-menu-popover">
                      <button onClick={() => { setMemberMenuId(''); rpc('nexo_set_group_member_role', { p_group_id: groupId, p_profile_id: member.profile_id, p_role: member.role === 'admin' ? 'member' : 'admin' }) }}>
                        <span>{member.role === 'admin' ? '↓' : '★'}</span>
                        <span><strong>{member.role === 'admin' ? 'Remover como ADM' : 'Promover a ADM'}</strong><small>{member.role === 'admin' ? 'Manter como participante' : 'Dar permissões administrativas'}</small></span>
                      </button>
                      <button className="danger" onClick={() => { setMemberMenuId(''); rpc('nexo_remove_group_member', { p_group_id: groupId, p_profile_id: member.profile_id }) }}>
                        <span>×</span><span><strong>Remover do grupo</strong><small>O participante perderá o acesso</small></span>
                      </button>
                    </div> : null}
                  </div> : null}
                </div>
              ))}
            </div> : null}

            {tab === 'invite' ? <div className="group-details-list">
              <input className="input" placeholder="Buscar pessoas" value={inviteSearch} onChange={(event) => setInviteSearch(event.target.value)} />
              {availableProfiles.map((profile) => <button className="group-person-row" key={profile.id}
                onClick={() => rpc('nexo_invite_group_member', { p_group_id: groupId, p_profile_id: profile.id })}>
                <span className="group-person-avatar">{profile.foto_url ? <img src={profile.foto_url} alt="" /> : profile.nome?.[0]}</span>
                <span><strong>{profile.nome}</strong><small>@{profile.username}</small></span><i>Convidar</i>
              </button>)}
            </div> : null}

            {tab === 'requests' ? <div className="group-details-list">
              {requests.length === 0 ? <p className="group-muted-copy">Nenhuma solicitação pendente.</p> : requests.map((request) => (
                <div className="group-request-row" key={request.id}>
                  <span><strong>{request.profile?.nome}</strong><small>@{request.profile?.username}</small></span>
                  <button onClick={() => rpc('nexo_review_join_request', { p_request_id: request.id, p_approve: true })}>Aceitar</button>
                  <button onClick={() => rpc('nexo_review_join_request', { p_request_id: request.id, p_approve: false })}>Recusar</button>
                </div>
              ))}
            </div> : null}

            {tab === 'settings' ? <div className="group-settings-list">
              <div className="group-invite-code"><span>Link/código de convite</span><strong>{group.invite_code}</strong>
                <button onClick={() => navigator.clipboard?.writeText(group.invite_code)}>Copiar</button></div>
              {isAdmin ? <>
                <label><span>Aprovar novos participantes<small>Solicitações aguardam um administrador</small></span>
                  <input type="checkbox" checked={group.approval_required} onChange={(e) => updateGroup({ approval_required: e.target.checked })} /></label>
                <label><span>Somente ADMs enviam mensagens</span>
                  <input type="checkbox" checked={group.only_admins_send} onChange={(e) => updateGroup({ only_admins_send: e.target.checked })} /></label>
                <label><span>Membros podem convidar pessoas</span>
                  <input type="checkbox" checked={group.members_can_invite} onChange={(e) => updateGroup({ members_can_invite: e.target.checked })} /></label>
              </> : null}
              {myMember?.role !== 'owner' ? <button className="group-danger-action"
                onClick={async () => { await rpc('nexo_leave_group', { p_group_id: groupId }); navigate('/mensagens') }}>Sair do grupo</button> : null}
              <button className="group-danger-action" onClick={() => setClearConfirm(true)}>Limpar conversa para mim</button>
            </div> : null}
          </aside>
        </div>
      ) : null}
      {oncePreview ? (
        <div className="group-once-overlay">
          <button className="group-once-close" onClick={closeOnce}>Fechar</button>
          {oncePreview.message_type === 'image'
            ? <img src={oncePreview.media_url} alt="Visualização única" onContextMenu={(event) => event.preventDefault()} />
            : oncePreview.message_type === 'audio'
              ? <audio src={oncePreview.media_url} controls controlsList="nodownload noplaybackrate" autoPlay />
              : <video src={oncePreview.media_url} controls controlsList="nodownload noplaybackrate" disablePictureInPicture autoPlay />}
          <p>Esta mídia não poderá ser aberta novamente.</p>
        </div>
      ) : null}
      {pendingMedia ? (
        <div className="group-media-preview-overlay">
          <section className="group-media-preview-card">
            <div className="group-media-preview-head">
              <div><strong>Enviar mídia</strong><small>Escolha como ela poderá ser aberta</small></div>
              <button onClick={() => { URL.revokeObjectURL(pendingMedia.preview); setPendingMedia(null) }}>×</button>
            </div>
            <div className="group-media-preview-content">
              {pendingMedia.kind === 'image' ? <img src={pendingMedia.preview} alt="Prévia" />
                : pendingMedia.kind === 'video' ? <video src={pendingMedia.preview} controls />
                  : <audio src={pendingMedia.preview} controls />}
            </div>
            <div className="group-media-send-options">
              <button onClick={() => uploadFile(pendingMedia.file, pendingMedia.kind, false)} disabled={uploading}>
                <span className="group-send-option-icon"><ComposerIcon name="send" /></span>
                <span><strong>Enviar normal</strong><small>Pode ser aberta quantas vezes quiser</small></span>
              </button>
              <button className="once" onClick={() => uploadFile(pendingMedia.file, pendingMedia.kind, true)} disabled={uploading}>
                <span className="group-send-option-icon"><ComposerIcon name="once" /></span>
                <span><strong>Visualização única</strong><small>Abre uma vez e não pode abrir novamente</small></span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Apagar mensagem?"
        description="Escolha onde essa mensagem deve desaparecer."
        onClose={() => setDeleteTarget(null)}
        options={[
          {
            id: 'mine',
            label: 'Apagar para mim',
            hint: 'Os outros participantes ainda verão',
            onClick: () => deleteMessage(deleteTarget, false),
          },
          ...(deleteTarget && (deleteTarget.sender_profile_id === me?.id || isAdmin) ? [{
            id: 'everyone',
            label: 'Apagar para todos',
            hint: 'A mensagem será removida do grupo',
            danger: true,
            onClick: () => deleteMessage(deleteTarget, true),
          }] : []),
        ]}
      />
      <ConfirmDialog
        open={clearConfirm}
        title="Limpar conversa?"
        description="As mensagens desaparecerão somente para você. Os outros participantes continuarão vendo normalmente."
        onClose={() => setClearConfirm(false)}
        options={[{
          id: 'clear',
          label: 'Limpar conversa',
          hint: 'Esta ação não pode ser desfeita',
          danger: true,
          onClick: clearChat,
        }]}
      />
    </div>
  )
}
