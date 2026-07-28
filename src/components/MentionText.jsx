import { useNavigate } from 'react-router-dom'

const MENTION_PATTERN = /(@[a-zA-Z0-9._]+)/g

export default function MentionText({ text, className = '' }) {
  const navigate = useNavigate()
  const parts = String(text || '').split(MENTION_PATTERN)

  return (
    <span className={className}>
      {parts.map((part, index) => {
        if (!part.startsWith('@') || part.length === 1) {
          return <span key={`${part}-${index}`}>{part}</span>
        }

        const username = part.slice(1)

        return (
          <button
            key={`${part}-${index}`}
            type="button"
            className="post-mention"
            onClick={(event) => {
              event.stopPropagation()
              navigate(`/usuario/${encodeURIComponent(username.toLowerCase())}`)
            }}
            aria-label={`Abrir perfil de ${part}`}
          >
            {part}
          </button>
        )
      })}
    </span>
  )
}
