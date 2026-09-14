import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4h8v3.5c0 3.2-1.7 5.5-4 5.5s-4-2.3-4-5.5V4Z" />
      <path d="M8 6H5v1.5C5 10 6.5 11 9 11M16 6h3v1.5c0 2.5-1.5 3.5-4 3.5M12 13v4M8.5 20h7M10 17h4v3h-4z" />
    </svg>
  )
}

export default function GlobalXpRanking() {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadRanking = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('id, nome, username, foto_url, xp_total, level')
      .eq('role', 'student')
      .order('xp_total', { ascending: false })
      .order('nome', { ascending: true })

    if (queryError) {
      setError('Não foi possível carregar o ranking agora.')
      setRows([])
    } else {
      setRows(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return undefined
    void loadRanking()
    const onKeyDown = (event) => event.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, loadRanking])

  return (
    <>
      <button
        type="button"
        className="global-xp-ranking-button"
        onClick={() => setOpen(true)}
        aria-label="Abrir ranking geral de XP"
        title="Ranking geral de XP"
      >
        <TrophyIcon />
      </button>

      {open && (
        <div className="global-xp-ranking-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
          <section className="global-xp-ranking-modal" role="dialog" aria-modal="true" aria-labelledby="global-ranking-title">
            <header>
              <div className="global-xp-ranking-title-icon"><TrophyIcon /></div>
              <div>
                <span>CLASSIFICAÇÃO GERAL</span>
                <h2 id="global-ranking-title">Ranking de XP</h2>
                <p>Todo o XP acumulado desde a estreia do NEXO 11.</p>
              </div>
              <button type="button" className="global-xp-ranking-close" onClick={() => setOpen(false)} aria-label="Fechar ranking">×</button>
            </header>

            <div className="global-xp-ranking-list">
              {loading && <p className="global-xp-ranking-state">Carregando classificação...</p>}
              {!loading && error && <p className="global-xp-ranking-state is-error">{error}<button type="button" onClick={loadRanking}>Tentar novamente</button></p>}
              {!loading && !error && !rows.length && <p className="global-xp-ranking-state">O ranking será exibido assim que houver XP registrado.</p>}
              {!loading && !error && rows.map((item, index) => (
                <article key={item.id} className={index < 3 ? `is-podium podium-${index + 1}` : ''}>
                  <b className="global-xp-ranking-position">{index + 1}º</b>
                  {item.foto_url
                    ? <img src={item.foto_url} alt="" />
                    : <i>{item.nome?.trim()?.charAt(0)?.toUpperCase() || '?'}</i>}
                  <div>
                    <strong>{item.nome || 'Estudante'}</strong>
                    <span>{item.username ? `@${item.username}` : `Nível ${Number(item.level || 1)}`}</span>
                  </div>
                  <em>{Number(item.xp_total || 0).toLocaleString('pt-BR')} XP</em>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
