import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import SocialLoader from '../components/SocialLoader'
import { formatDisplayName } from '../lib/textFormat'
import { supabase } from '../lib/supabase'

export default function BlockedProfiles() {
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [suportaBloqueio, setSuportaBloqueio] = useState(true)
  const [perfisBloqueados, setPerfisBloqueados] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    void carregar()
  }, [])

  async function carregar() {
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

      const { data: perfil } = await supabase.from('profiles').select('id').eq('account_id', user.id).single()
      if (!perfil?.id) {
        setPerfisBloqueados([])
        return
      }

      let bloqueiosResp = await supabase
        .from('blocked_profiles')
        .select('blocked_profile_id, created_at')
        .eq('blocker_profile_id', perfil.id)
        .order('created_at', { ascending: false })

      if (bloqueiosResp.error) {
        bloqueiosResp = await supabase
          .from('blocked_profiles')
          .select('blocked_profile_id, created_at')
          .eq('profile_id', perfil.id)
          .order('created_at', { ascending: false })
      }

      if (bloqueiosResp.error) {
        setSuportaBloqueio(false)
        setPerfisBloqueados([])
        return
      }

      const ids = [...new Set((bloqueiosResp.data || []).map((item) => item.blocked_profile_id).filter(Boolean))]
      if (ids.length === 0) {
        setPerfisBloqueados([])
        return
      }

      const { data: perfisResp, error: perfisErro } = await supabase
        .from('profiles')
        .select('id, nome, username, foto_url')
        .in('id', ids)

      if (perfisErro) throw perfisErro

      const mapPerfis = new Map((perfisResp || []).map((item) => [item.id, item]))
      const lista = ids.map((id) => mapPerfis.get(id)).filter(Boolean)
      setPerfisBloqueados(lista)
      setSuportaBloqueio(true)
    } catch {
      setErro('Não foi possível carregar seus bloqueados agora.')
    } finally {
      setCarregando(false)
    }
  }

  if (carregando) return <SocialLoader variant="feed" showBottomNav />

  return (
    <div className="container">
      <div className="topbar settings-topbar">
        <button type="button" className="edit-back-btn" onClick={() => navigate('/perfil')}>
          Voltar
        </button>
        <h1>Bloqueados</h1>
        <button type="button" className="edit-save-link" onClick={carregar}>
          Atualizar
        </button>
      </div>

      <div className="page settings-page">
        {erro ? <div className="alert-box erro-box">{erro}</div> : null}

        {!suportaBloqueio ? (
          <div className="empty-state settings-empty">
            <p>Lista de bloqueados completa chega na próxima atualização.</p>
          </div>
        ) : perfisBloqueados.length === 0 ? (
          <div className="empty-state settings-empty">
            <p>Você ainda não bloqueou nenhum perfil.</p>
          </div>
        ) : (
          <div className="settings-list">
            {perfisBloqueados.map((perfil) => (
              <button
                key={perfil.id}
                type="button"
                className="settings-list-card"
                onClick={() => (perfil.username ? navigate(`/usuario/${perfil.username}`) : navigate('/'))}
              >
                <div className="settings-list-avatar">
                  {perfil.foto_url ? (
                    <img src={perfil.foto_url} alt={formatDisplayName(perfil.nome) || perfil.username} />
                  ) : (
                    <span>{formatDisplayName(perfil.nome)?.charAt(0)?.toUpperCase() || 'U'}</span>
                  )}
                </div>
                <div className="settings-list-copy">
                  <strong>{formatDisplayName(perfil.nome) || 'Usuário'}</strong>
                  <span>@{perfil.username}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
