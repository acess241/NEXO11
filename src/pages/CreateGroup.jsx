import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BottomNav from '../components/BottomNav'
import { createGroup, friendlyGroupError, getMyProfile } from '../lib/groups'
import { supabase } from '../lib/supabase'

export default function CreateGroup() {
  const navigate = useNavigate()
  const [me, setMe] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const profile = await getMyProfile()
        setMe(profile)
        const { data, error: profileError } = await supabase.from('profiles')
          .select('id,nome,username,foto_url,role').neq('id', profile.id).order('nome').limit(300)
        if (profileError) throw profileError
        setProfiles(data || [])
      } catch (err) {
        setError(friendlyGroupError(err))
      }
    }
    void load()
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return profiles
    return profiles.filter((profile) => `${profile.nome} ${profile.username}`.toLowerCase().includes(term))
  }, [profiles, search])

  function toggle(profileId) {
    setSelected((current) => current.includes(profileId)
      ? current.filter((id) => id !== profileId)
      : [...current, profileId])
  }

  async function submit(event) {
    event.preventDefault()
    if (!name.trim() || !me) return
    try {
      setSaving(true)
      setError('')
      const groupId = await createGroup(name.trim(), description.trim(), selected)
      navigate(`/mensagens/grupos/${groupId}`, { replace: true })
    } catch (err) {
      setError(friendlyGroupError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="container">
      <header className="topbar group-topbar">
        <button className="group-icon-btn" type="button" onClick={() => navigate('/mensagens')}>←</button>
        <div><h1>Novo grupo</h1><p>Escolha quem você quer convidar</p></div>
        <span className="group-selection-count">{selected.length}</span>
      </header>

      <form className="page group-create-page" onSubmit={submit}>
        {error ? <div className="alert-box erro-box">{error}</div> : null}
        <section className="group-create-card">
          <div className="group-avatar-placeholder">{name.trim()?.[0]?.toUpperCase() || 'N'}</div>
          <div className="group-create-fields">
            <input className="input" value={name} onChange={(event) => setName(event.target.value)}
              placeholder="Nome do grupo" maxLength={100} required />
            <textarea className="input textarea" value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descrição do grupo (opcional)" maxLength={500} />
          </div>
        </section>

        <input className="input" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar pessoas..." />
        <p className="group-section-label">Convidar participantes</p>
        <div className="group-people-list">
          {filtered.map((profile) => (
            <button className={`group-person-row ${selected.includes(profile.id) ? 'selected' : ''}`}
              type="button" key={profile.id} onClick={() => toggle(profile.id)}>
              <span className="group-person-avatar">
                {profile.foto_url ? <img src={profile.foto_url} alt="" /> : profile.nome?.[0]?.toUpperCase()}
              </span>
              <span><strong>{profile.nome}</strong><small>@{profile.username}</small></span>
              <i>{selected.includes(profile.id) ? '✓' : '+'}</i>
            </button>
          ))}
        </div>
        <button className="btn group-create-submit" type="submit" disabled={saving || !name.trim()}>
          {saving ? 'Criando...' : `Criar grupo${selected.length ? ` e convidar ${selected.length}` : ''}`}
        </button>
      </form>
      <BottomNav />
    </div>
  )
}
