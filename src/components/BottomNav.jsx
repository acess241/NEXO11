import { NavLink } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  CHAT_UPDATED_EVENT,
  contarMensagensNaoLidas,
  traduzirErroChat,
} from '../lib/chat'
import {
  LIVE_CHAT_UPDATED_EVENT,
  countUnreadLiveMessages,
  ensureClassroomGroupsForProfile,
} from '../lib/liveConversations'
import { supabase } from '../lib/supabase'

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10L12 3L21 10V21H3V10Z" />
    </svg>
  )
}

function IconSearch() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function IconBell() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
      <path d="M9 17a3 3 0 0 0 6 0" />
    </svg>
  )
}

function IconNexis() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="16" rx="4" />
      <path d="m10 9 5 3-5 3V9Z" />
      <path d="M7 4 9 7M15 4l2 3" />
    </svg>
  )
}

function IconMessage() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
      <path d="M8 9h8" />
      <path d="M8 13h5" />
    </svg>
  )
}

function IconUser() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="7" r="4" />
      <path d="M5.5 21C5.5 16.5 18.5 16.5 18.5 21" />
    </svg>
  )
}

export default function BottomNav() {
  const [quantidadeNaoLidas, setQuantidadeNaoLidas] = useState(0)
  const [quantidadeMensagens, setQuantidadeMensagens] = useState(0)

  useEffect(() => {
    let channel
    let requestsChannel
    let chatChannel
    let removerEvento = () => {}
    let intervaloSync = null

    async function iniciar() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      const { data: meuPerfil, error: perfilError } = await supabase
        .from('profiles')
        .select('id')
        .eq('account_id', user.id)
        .limit(1)
        .maybeSingle()

      if (perfilError || !meuPerfil) return

      ensureClassroomGroupsForProfile(meuPerfil)
      await carregarNaoLidas(meuPerfil.id)
      await carregarMensagens(meuPerfil.id)

      channel = supabase
        .channel(`badge-notificacoes-${meuPerfil.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'notifications',
            filter: `receiver_profile_id=eq.${meuPerfil.id}`,
          },
          async () => {
            await carregarNaoLidas(meuPerfil.id)
            await carregarMensagens(meuPerfil.id)
          }
        )
        .subscribe()

      requestsChannel = supabase
        .channel(`badge-follow-requests-${meuPerfil.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'follow_requests',
            filter: `receiver_profile_id=eq.${meuPerfil.id}`,
          },
          async () => {
            await carregarNaoLidas(meuPerfil.id)
          }
        )
        .subscribe()

      chatChannel = supabase
        .channel(`badge-chat-${meuPerfil.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_messages',
          },
          async () => {
            await carregarMensagens(meuPerfil.id)
          }
        )
        .subscribe()

      const aoAtualizarChat = async () => {
        await carregarMensagens(meuPerfil.id)
      }

      const aoAtualizarAoVivo = async () => {
        await carregarMensagens(meuPerfil.id)
      }

      intervaloSync = window.setInterval(async () => {
        await carregarNaoLidas(meuPerfil.id)
        await carregarMensagens(meuPerfil.id)
      }, 5000)

      window.addEventListener(CHAT_UPDATED_EVENT, aoAtualizarChat)
      window.addEventListener(LIVE_CHAT_UPDATED_EVENT, aoAtualizarAoVivo)

      removerEvento = () => {
        window.removeEventListener(CHAT_UPDATED_EVENT, aoAtualizarChat)
        window.removeEventListener(LIVE_CHAT_UPDATED_EVENT, aoAtualizarAoVivo)
      }
    }

    async function carregarNaoLidas(profileId) {
      const { count: countNotificacoes } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_profile_id', profileId)
        .is('read_at', null)

      const { count: countSolicitacoes } = await supabase
        .from('follow_requests')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_profile_id', profileId)
        .eq('status', 'pending')

      setQuantidadeNaoLidas((countNotificacoes || 0) + (countSolicitacoes || 0))
    }

    async function carregarMensagens(profileId) {
      try {
        const { total } = await contarMensagensNaoLidas(profileId)
        const live = countUnreadLiveMessages(profileId)
        setQuantidadeMensagens(Number(total || 0) + Number(live.total || 0))
      } catch (error) {
        traduzirErroChat(error, '')
        setQuantidadeMensagens(0)
      }
    }

    iniciar()

    return () => {
      removerEvento()

      if (intervaloSync) {
        window.clearInterval(intervaloSync)
      }

      if (channel) {
        supabase.removeChannel(channel)
      }

      if (requestsChannel) {
        supabase.removeChannel(requestsChannel)
      }

      if (chatChannel) {
        supabase.removeChannel(chatChannel)
      }
    }
  }, [])

  return (
    <nav className="bottom-nav">
      <NavLink to="/" className={({ isActive }) => (isActive ? 'active' : '')}>
        <IconHome />
      </NavLink>

      <NavLink
        to="/pesquisar"
        className={({ isActive }) => (isActive ? 'active' : '')}
      >
        <IconSearch />
      </NavLink>

      <NavLink
        to="/mensagens"
        className={({ isActive }) => (isActive ? 'active' : '')}
      >
        <div className="nav-icon-wrapper">
          <IconMessage />
          {quantidadeMensagens > 0 && (
            <span className="nav-badge chat">
              {quantidadeMensagens > 9 ? '9+' : quantidadeMensagens}
            </span>
          )}
        </div>
      </NavLink>

      <NavLink to="/nexis" className={({ isActive }) => (isActive ? 'active' : '')} aria-label="Nexis">
        <IconNexis />
      </NavLink>

      <NavLink
        to="/notificacoes"
        className={({ isActive }) => (isActive ? 'active' : '')}
      >
        <div className="nav-icon-wrapper">
          <IconBell />
          {quantidadeNaoLidas > 0 && (
            <span className="nav-badge">
              {quantidadeNaoLidas > 9 ? '9+' : quantidadeNaoLidas}
            </span>
          )}
        </div>
      </NavLink>

      <NavLink
        to="/perfil"
        className={({ isActive }) => (isActive ? 'active' : '')}
      >
        <IconUser />
      </NavLink>
    </nav>
  )
}
