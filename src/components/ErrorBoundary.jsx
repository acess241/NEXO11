import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('[Nexo11 ErrorBoundary]', error, info?.componentStack)

    const message = String(error?.message || error || '')
    const falhaDeArquivoDaVersao = /failed to fetch dynamically imported module|importing a module script failed|loading (?:javascript )?chunk .* failed|unable to preload css|failed to load module script|mime type.*text\/html|unexpected token.*</i.test(message)

    if (falhaDeArquivoDaVersao) {
      try {
        const chave = 'nexo11:recuperacao-chunk-tentada'
        if (!window.sessionStorage.getItem(chave)) {
          window.sessionStorage.setItem(chave, '1')
          window.location.reload()
        }
      } catch {}
    }
  }

  recarregarPagina = () => {
    try {
      window.sessionStorage.removeItem('nexo11:recuperacao-chunk-tentada')
    } catch {}
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="error-boundary-fallback" role="alert">
          <section className="error-boundary-card">
            <div className="error-boundary-scene" aria-hidden="true">
              <span className="error-boundary-star star-one">✦</span>
              <span className="error-boundary-star star-two">✧</span>
              <div className="chat-pet-avatar waiting error-boundary-mascot">
                <span className="chat-pet-aura" />
                <span className="chat-pet-tail" />
                <span className="chat-pet-ear left" />
                <span className="chat-pet-ear right" />
                <span className="chat-pet-body" />
                <span className="chat-pet-eye left" />
                <span className="chat-pet-eye right" />
                <span className="chat-pet-mouth" />
                <span className="chat-pet-blush left" />
                <span className="chat-pet-blush right" />
              </div>
              <span className="error-boundary-teardrop">💧</span>
            </div>
            <p className="error-boundary-brand">NEXO 11</p>
            <h1>Ops! Saímos do ar por um instante.</h1>
            <p className="error-boundary-copy">O Nexinho sentiu a queda por aqui. Pode recarregar a página?</p>
            <button type="button" onClick={this.recarregarPagina}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5m10-1a7 7 0 0 0-12.2-4.6L4 8m16 8-2.8 1.6A7 7 0 0 1 4 12" /></svg>
              Recarregar página
            </button>
            <small>Se o erro continuar, tente mais uma vez em alguns segundos.</small>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
