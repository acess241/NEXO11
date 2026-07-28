import { createPortal } from 'react-dom'

export default function ConfirmDialog({
  open,
  title,
  description,
  options = [],
  onClose,
}) {
  if (!open) return null

  return createPortal(
    <div className="nexo-dialog-overlay" role="presentation" onClick={onClose}>
      <section className="nexo-dialog" role="dialog" aria-modal="true" aria-labelledby="nexo-dialog-title"
        onClick={(event) => event.stopPropagation()}>
        <div className="nexo-dialog-mark">!</div>
        <h2 id="nexo-dialog-title">{title}</h2>
        {description ? <p>{description}</p> : null}
        <div className="nexo-dialog-actions">
          {options.map((option) => (
            <button key={option.id} type="button" className={option.danger ? 'danger' : ''}
              disabled={option.disabled}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                option.onClick?.()
              }}>
              <strong>{option.label}</strong>
              {option.hint ? <small>{option.hint}</small> : null}
            </button>
          ))}
          <button type="button" className="cancel" onClick={onClose}>Cancelar</button>
        </div>
      </section>
    </div>,
    document.body
  )
}
