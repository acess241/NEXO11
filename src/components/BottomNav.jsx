import { NavLink } from 'react-router-dom'

function Icon({ type }) {
  if (type === 'home') return <svg viewBox="0 0 24 24"><path d="M4 10.5 12 4l8 6.5V20H4v-9.5Z"/><path d="M9 20v-6h6v6"/></svg>
  if (type === 'nexis') return <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="5"/><path d="m10 9 5 3-5 3V9Z"/></svg>
  if (type === 'create') return <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
  if (type === 'oxente') return <svg viewBox="0 0 24 24"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H20v16H7.5A2.5 2.5 0 0 0 5 21.5v-16Z"/><path d="M8 7h8M8 11h6"/></svg>
  return <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.7-4.2 3.2-6.3 7.5-6.3s6.8 2.1 7.5 6.3"/></svg>
}

const ITEMS = [
  { to: '/', label: 'Início', icon: 'home', end: true },
  { to: '/nexis', label: 'NEXIS', icon: 'nexis' },
  { to: '/novo-post', label: 'Criar', icon: 'create', create: true },
  { to: '/oxente', label: 'OXENTE', icon: 'oxente' },
  { to: '/perfil', label: 'Perfil', icon: 'profile' },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav nexo-main-nav" aria-label="Navegação principal">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          aria-label={item.label}
          className={({ isActive }) => `${isActive ? 'active' : ''}${item.create ? ' nexo-create-nav' : ''}`.trim()}
        >
          <span className="nexo-nav-icon"><Icon type={item.icon} /></span>
          <span className="bottom-nav-label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
