import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import {
  NOTIFICATION_PREFERENCE_FIELDS,
  carregarPreferenciasNotificacao,
  salvarPreferenciasNotificacao,
  salvarPreferenciasNotificacaoLocal,
} from '../lib/notificationPreferences'
import { supabase } from '../lib/supabase'

const SAVE_DEBOUNCE_MS = 420

export default function NotificationSettings() {
  const [carregando, setCarregando] = useState(true)
  const [meuPerfilId, setMeuPerfilId] = useState('')
  const [preferencias, setPreferencias] = useState(null)
  const [dbAtivo, setDbAtivo] = useState(true)
  const [salvandoCampo, setSalvandoCampo] = useState('')
  const [erro, setErro] = useState('')
  const [status, setStatus] = useState('')
  const [statusSincronia, setStatusSincronia] = useState('idle')

  const saveTimerRef = useRef(null)
  const preferenciasPendentesRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    void carregarTudo()
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  async function carregarTudo() {
    try {
      setCarregando(true)
      setErro('')
      setStatus('')
      setStatusSincronia('idle')

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        navigate('/auth')
        return
      }

      const { data: perfil } = await supabase.from('profiles').select('id').eq('account_id', user.id).single()

      if (!perfil?.id) {
        setErro('Não foi possível encontrar seu perfil agora.')
        return
      }

      setMeuPerfilId(perfil.id)

      const resultado = await carregarPreferenciasNotificacao(perfil.id)
      setPreferencias(resultado.preferences)
      setDbAtivo(Boolean(resultado.dbEnabled))
    } catch {
      setErro('Não foi possível carregar as configurações de notificações agora.')
    } finally {
      setCarregando(false)
    }
  }

  function agendarSincronizacaoDb(profileId) {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = window.setTimeout(async () => {
      if (!preferenciasPendentesRef.current) {
        setSalvandoCampo('')
        setStatusSincronia('idle')
        return
      }

      try {
        setStatusSincronia('saving')
        const resultado = await salvarPreferenciasNotificacao(profileId, preferenciasPendentesRef.current)
        setPreferencias(resultado.preferences)
        setDbAtivo(Boolean(resultado.dbEnabled))
        setStatus(resultado.dbEnabled ? 'Preferências salvas com sucesso.' : 'Preferências salvas somente neste aparelho.')
        setStatusSincronia('synced')
      } catch {
        setErro('Não foi possível salvar esta configuração agora.')
        setStatusSincronia('idle')
      } finally {
        setSalvandoCampo('')
        preferenciasPendentesRef.current = null
      }
    }, SAVE_DEBOUNCE_MS)
  }

  function alternarPreferencia(campo) {
    if (!meuPerfilId || !preferencias) return

    const proximoValor = preferencias[campo.key] === false
    const preferenciasAtualizadas = {
      ...preferencias,
      [campo.key]: proximoValor,
    }

    setErro('')
    setStatus('')
    setStatusSincronia('saving')
    setSalvandoCampo(campo.key)

    const normalized = salvarPreferenciasNotificacaoLocal(meuPerfilId, preferenciasAtualizadas)
    setPreferencias(normalized)
    preferenciasPendentesRef.current = normalized

    agendarSincronizacaoDb(meuPerfilId)
  }

  if (carregando) return <SocialLoader variant="feed" showBottomNav />

  const legendaSincronia =
    statusSincronia === 'saving' ? 'Salvando...' : dbAtivo ? 'Sincronizado' : 'Somente neste aparelho'

  return (
    <div className="container">
      <div className="topbar settings-topbar">
        <button type="button" className="edit-back-btn" onClick={() => navigate('/perfil')}>
          Voltar
        </button>
        <h1>Notificações</h1>
        <button type="button" className="edit-save-link" onClick={carregarTudo}>
          Atualizar
        </button>
      </div>

      <div className="page settings-page">
        {erro ? <div className="alert-box erro-box">{erro}</div> : null}

        <div className="notification-settings-card">
          <div className="notification-settings-head">
            <h3>Gerenciamento de notificações</h3>
            <span>{legendaSincronia}</span>
          </div>

          <p>Escolha quais alertas o app pode enviar para você.</p>

          <div className="notification-settings-grid">
            {NOTIFICATION_PREFERENCE_FIELDS.map((campo) => {
              const ligado = preferencias?.[campo.key] !== false
              const estaSalvandoCampo = salvandoCampo === campo.key

              return (
                <div className="notification-pref-row" key={campo.key}>
                  <span>{campo.label}</span>

                  <button
                    type="button"
                    className={`notification-pref-toggle ${ligado ? 'on' : 'off'} ${estaSalvandoCampo ? 'is-saving' : ''}`}
                    onClick={() => alternarPreferencia(campo)}
                    disabled={statusSincronia === 'saving' && !estaSalvandoCampo}
                    aria-pressed={ligado}
                  >
                    <span className="notification-pref-toggle-thumb" aria-hidden="true" />
                    <span className="notification-pref-toggle-label">
                      {estaSalvandoCampo && statusSincronia === 'saving' ? 'Salvando' : ligado ? 'Ligado' : 'Desligado'}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>

          {status ? <p className={`notification-settings-status ${dbAtivo ? '' : 'warn'}`}>{status}</p> : null}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
