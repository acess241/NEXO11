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
  }

  tentarRecuperar = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback">
          <h1>Algo deu errado</h1>
          <p>O app encontrou um erro inesperado. Tente abrir a tela novamente.</p>
          <button type="button" onClick={this.tentarRecuperar}>
            Tentar novamente
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
