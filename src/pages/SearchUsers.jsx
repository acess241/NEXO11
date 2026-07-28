import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import { formatDisplayName } from '../lib/textFormat'
import { supabase } from '../lib/supabase'

const RECENT_SEARCHES_KEY = 'nexo_recent_profile_searches'
const RECENT_SEARCHES_LIMIT = 8

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10.75 4.75a6 6 0 1 0 0 12a6 6 0 0 0 0-12Zm-7.5 6a7.5 7.5 0 1 1 13.199 4.914l3.818 3.817a.75.75 0 1 1-1.06 1.061l-3.818-3.818A7.5 7.5 0 0 1 3.25 10.75Z"
        fill="currentColor"
      />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7.28 7.22a.75.75 0 0 1 1.06 0L12 10.94l3.66-3.72a.75.75 0 1 1 1.07 1.06L13.06 12l3.67 3.72a.75.75 0 1 1-1.07 1.06L12 13.06l-3.66 3.72a.75.75 0 0 1-1.06-1.06L10.94 12L7.28 8.28a.75.75 0 0 1 0-1.06Z"
        fill="currentColor"
      />
    </svg>
  )
}

function loadRecentSearches() {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const rawValue = window.localStorage.getItem(RECENT_SEARCHES_KEY)
    const parsedValue = rawValue ? JSON.parse(rawValue) : []

    if (!Array.isArray(parsedValue)) {
      return []
    }

    return parsedValue.filter((item) => item?.id && item?.username).slice(0, RECENT_SEARCHES_LIMIT)
  } catch {
    return []
  }
}

function saveRecentSearches(items) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items.slice(0, RECENT_SEARCHES_LIMIT)))
  } catch {
    // Ignora falhas de armazenamento local para não travar a busca.
  }
}

export default function SearchUsers() {
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState([])
  const [erro, setErro] = useState('')
  const [loading, setLoading] = useState(true)
  const [recentSearches, setRecentSearches] = useState([])
  const navigate = useNavigate()
  const latestRequestRef = useRef(0)

  useEffect(() => {
    setRecentSearches(loadRecentSearches())
  }, [])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void fetchUsers(search)
    }, 220)

    return () => clearTimeout(timeoutId)
  }, [search])

  async function fetchUsers(term = '') {
    const requestId = latestRequestRef.current + 1
    latestRequestRef.current = requestId
    setErro('')
    setLoading(true)

    let query = supabase
      .from('profiles')
      .select('id, nome, username, foto_url, bio, is_private')
      .order('created_at', { ascending: false })

    if (term.trim()) {
      query = query.or(`nome.ilike.%${term}%,username.ilike.%${term}%`)
    }

    const { data, error } = await query.limit(30)

    if (latestRequestRef.current !== requestId) {
      return
    }

    if (error) {
      setErro('Não foi possível buscar usuários.')
      setUsers([])
      setLoading(false)
      return
    }

    setUsers(data || [])
    setLoading(false)
  }

  function getInitials(name) {
    if (!name) return 'N'
    return formatDisplayName(name).charAt(0).toUpperCase()
  }

  function updateRecentSearches(updater) {
    setRecentSearches((currentItems) => {
      const nextItems = updater(currentItems).slice(0, RECENT_SEARCHES_LIMIT)
      saveRecentSearches(nextItems)
      return nextItems
    })
  }

  function addRecentSearch(user) {
    if (!user?.id || !user?.username) {
      return
    }

    const recentUser = {
      id: user.id,
      nome: user.nome || '',
      username: user.username,
      foto_url: user.foto_url || '',
      bio: user.bio || '',
      is_private: Boolean(user.is_private),
    }

    updateRecentSearches((currentItems) => [recentUser, ...currentItems.filter((item) => item.id !== user.id)])
  }

  function removeRecentSearch(event, profileId) {
    event.stopPropagation()
    event.preventDefault()
    updateRecentSearches((currentItems) => currentItems.filter((item) => item.id !== profileId))
  }

  function clearRecentSearches() {
    updateRecentSearches(() => [])
  }

  function handleOpenProfile(user) {
    addRecentSearch(user)
    navigate(`/usuario/${user.username}`)
  }

  const hasSearch = search.trim().length > 0
  const showRecentSearches = !hasSearch && recentSearches.length > 0

  return (
    <div className="container">
      <div className="topbar search-topbar">
        <div className="search-topbar-copy">
          <h1>Pesquisar</h1>
          <p>Encontre perfis do Nexo</p>
        </div>
      </div>

      <div className="page search-page">
        <label className="search-shell" aria-label="Pesquisar perfis">
          <span className="search-shell-icon">
            <SearchIcon />
          </span>
          <input
            className="search-shell-input"
            type="text"
            placeholder="Pesquisar"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {hasSearch && (
            <button
              type="button"
              className="search-shell-clear"
              aria-label="Limpar pesquisa"
              onClick={() => setSearch('')}
            >
              <ClearIcon />
            </button>
          )}
        </label>

        {showRecentSearches && (
          <section className="search-recent-section">
            <div className="search-section-head">
              <strong>Pesquisas recentes</strong>
              <button
                type="button"
                className="search-section-action"
                onClick={clearRecentSearches}
              >
                Limpar tudo
              </button>
            </div>

            <div className="search-results-list search-recent-list">
              {recentSearches.map((user) => (
                <div key={user.id} className="search-profile-row-wrap">
                  <button
                    type="button"
                    onClick={() => handleOpenProfile(user)}
                    className="search-profile-row search-profile-row-recent"
                  >
                    <div className="search-profile-avatar">
                      {user.foto_url ? (
                        <img
                          src={user.foto_url}
                          alt={formatDisplayName(user.nome) || user.username}
                          className="search-profile-avatar-image"
                        />
                      ) : (
                        getInitials(user.nome)
                      )}
                    </div>

                    <div className="search-profile-copy">
                      <strong>@{user.username}</strong>
                      <span>{formatDisplayName(user.nome) || 'Usuário Nexo'}</span>
                      {user.is_private ? <small className="connections-private-chip">Conta privada</small> : null}
                    </div>
                  </button>

                  <button
                    type="button"
                    className="search-profile-remove"
                    aria-label={`Remover ${user.username} das pesquisas recentes`}
                    onClick={(event) => removeRecentSearch(event, user.id)}
                  >
                    <ClearIcon />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="search-results-head">
          <strong>{hasSearch ? 'Resultados' : 'Perfis para descobrir'}</strong>
          <span>{loading ? 'Buscando...' : hasSearch ? `${users.length} perfis` : 'Novos e recentes'}</span>
        </div>

        {erro && <div className="alert-box erro-box">{erro}</div>}

        <div className="search-results-list">
          {loading ? (
            <div className="search-loading-list" aria-hidden="true">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="search-loading-card">
                  <div className="search-loading-avatar" />
                  <div className="search-loading-lines">
                    <span />
                    <span />
                  </div>
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <div className="empty-state search-empty-state">
              <p>{hasSearch ? 'Nenhum perfil encontrado.' : 'Nenhum perfil disponível agora.'}</p>
            </div>
          ) : (
            users.map((user) => (
              <button
                key={user.id}
                type="button"
                onClick={() => handleOpenProfile(user)}
                className="search-profile-row"
              >
                <div className="search-profile-avatar">
                  {user.foto_url ? (
                    <img
                      src={user.foto_url}
                      alt={formatDisplayName(user.nome) || user.username}
                      className="search-profile-avatar-image"
                    />
                  ) : (
                    getInitials(user.nome)
                  )}
                </div>

                <div className="search-profile-copy">
                  <strong>@{user.username}</strong>
                  <span>{formatDisplayName(user.nome) || 'Usuário Nexo'}</span>
                  {user.is_private ? <small className="connections-private-chip">Conta privada</small> : null}
                  {user.bio && <p>{user.bio}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
