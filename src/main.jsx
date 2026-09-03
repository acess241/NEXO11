import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { aplicarTema, obterTemaSalvo } from './lib/theme'
import './index.css'

aplicarTema(obterTemaSalvo())

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  window.__nexoInstallPrompt = event
  window.dispatchEvent(new CustomEvent('nexo-install-available'))
})

window.addEventListener('appinstalled', () => {
  window.__nexoInstallPrompt = null
  window.dispatchEvent(new CustomEvent('nexo-app-installed'))
})

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
)
