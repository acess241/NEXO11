import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const TYPE_TEXT = {
  follow: 'começou a seguir você',
  follow_request: 'enviou uma solicitação para seguir',
  like_post: 'curtiu seu post',
  like_comment: 'curtiu seu comentário',
  comment: 'comentou no seu post',
  reply: 'respondeu ao seu comentário',
  repost: 'repostou seu post',
  story: 'publicou um story',
  message: 'enviou uma mensagem',
  mention: 'mencionou você em um post',
  xp_adjustment: 'atualizou seu XP',
  quiz_result: 'enviou o resultado de um quiz',
}

function textoNotificacao(type) {
  return TYPE_TEXT[type] || 'interagiu com você'
}

export default function NotificationBridge({ session }) {
  const [permission, setPermission] = useState(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  )
  const [toast, setToast] = useState(null)
  const timerRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    if (!session?.user?.id) return undefined

    let ativo = true
    let channel

    async function iniciar() {
      const { data: perfil } = await supabase
        .from('profiles')
        .select('id')
        .eq('account_id', session.user.id)
        .maybeSingle()

      if (!ativo || !perfil?.id) return

      channel = supabase
        .channel(`notificacoes-tela-${perfil.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `receiver_profile_id=eq.${perfil.id}`,
          },
          async ({ new: notificacao }) => {
            const { data: autor } = notificacao.actor_profile_id
              ? await supabase
                  .from('profiles')
                  .select('nome, username, foto_url')
                  .eq('id', notificacao.actor_profile_id)
                  .maybeSingle()
              : { data: null }

            if (!ativo) return

            const titulo = autor?.nome || 'NEXO 11'
            const corpo = textoNotificacao(notificacao.type)
            const destino =
              notificacao.type === 'message' && autor?.username
                ? `/mensagens/${autor.username}`
                : '/notificacoes'

            setToast({ titulo, corpo, destino, foto: autor?.foto_url || '' })
            window.clearTimeout(timerRef.current)
            timerRef.current = window.setTimeout(() => setToast(null), 6000)

            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const options = {
                body: corpo,
                icon: autor?.foto_url || `${import.meta.env.BASE_URL}favicon.png`,
                badge: `${import.meta.env.BASE_URL}favicon.png`,
                tag: `nexo-${notificacao.id}`,
                data: { url: `${import.meta.env.BASE_URL}${destino.replace(/^\//, '')}` },
              }

              try {
                const registration = await navigator.serviceWorker?.ready
                if (registration) {
                  await registration.showNotification(titulo, options)
                } else {
                  new Notification(titulo, options)
                }
              } catch {
                try {
                  new Notification(titulo, options)
                } catch {}
              }
            }
          }
        )
        .subscribe()
    }

    void iniciar()

    return () => {
      ativo = false
      window.clearTimeout(timerRef.current)
      if (channel) supabase.removeChannel(channel)
    }
  }, [session?.user?.id])

  async function ativarNotificacoes() {
    if (typeof Notification === 'undefined') return
    const resultado = await Notification.requestPermission()
    setPermission(resultado)
  }

  if (!session) return null

  return (
    <>
      {permission === 'default' ? (
        <aside className="notification-permission-card" aria-label="Ativar notificações">
          <div>
            <strong>Receba avisos na tela</strong>
            <span>Mensagens, menções, seguidores e atividades.</span>
          </div>
          <button type="button" onClick={ativarNotificacoes}>
            Ativar
          </button>
        </aside>
      ) : null}

      {toast ? (
        <button
          type="button"
          className="notification-screen-toast"
          onClick={() => {
            navigate(toast.destino)
            setToast(null)
          }}
        >
          <span className="notification-screen-icon">
            {toast.foto ? <img src={toast.foto} alt="" /> : 'NX'}
          </span>
          <span>
            <strong>{toast.titulo}</strong>
            <small>{toast.corpo}</small>
          </span>
        </button>
      ) : null}
    </>
  )
}
