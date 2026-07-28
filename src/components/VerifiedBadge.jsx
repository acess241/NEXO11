export default function VerifiedBadge({ verified, label = 'Conta oficial verificada' }) {
  if (!verified) return null

  return (
    <span className="verified-badge" title={label} aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.8l2.1 1.45 2.55-.18.82 2.42 2.18 1.35-.82 2.42.82 2.42-2.18 1.35-.82 2.42-2.55-.18L12 21.2l-2.1-1.45-2.55.18-.82-2.42-2.18-1.35.82-2.42-.82-2.42 2.18-1.35.82-2.42 2.55.18L12 2.8z" />
        <path className="verified-badge-check" d="M8.2 12.1l2.35 2.35 5.2-5.2" />
      </svg>
    </span>
  )
}
