import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const NOTICE_VERSION = 'biblioteca-2026-07'

export default function UpdateAnnouncement({ session }) {
  const [visivel, setVisivel] = useState(false)
  const navigate = useNavigate()
  const userId = session?.user?.id
  const storageKey = userId ? `nexo_update_notice_${NOTICE_VERSION}_${userId}` : ''

  useEffect(() => {
    if (!storageKey) {
      setVisivel(false)
      return
    }
    setVisivel(window.localStorage.getItem(storageKey) !== 'seen')
  }, [storageKey])

  function concluir(destino = '') {
    if (storageKey) window.localStorage.setItem(storageKey, 'seen')
    setVisivel(false)
    if (destino) navigate(destino)
  }

  if (!visivel) return null

  return (
    <div className="update-notice-overlay" role="dialog" aria-modal="true" aria-labelledby="update-notice-title">
      <article className="update-notice-card">
        <span className="update-notice-kicker">AVISO DE ATUALIZAÇÃO</span>
        <div className="update-notice-icon" aria-hidden="true">N</div>
        <h2 id="update-notice-title">Atenção, alunos!</h2>
        <p>
          Nossa biblioteca já está disponível. Agora você pode acessar livros didáticos
          do Ensino Médio e obras da literatura brasileira diretamente pelo NEXO.
        </p>
        <div className="update-notice-actions">
          <button type="button" className="primary" onClick={() => concluir('/oxente?tab=biblioteca')}>
            Ir para a biblioteca
          </button>
          <button type="button" className="secondary" onClick={() => concluir()}>
            Continuar por aqui
          </button>
        </div>
        <small>Este aviso aparecerá somente uma vez nesta conta.</small>
      </article>
    </div>
  )
}

