import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export default function InstallNexo() {
  const [installed, setInstalled] = useState(() => isStandalone())
  const [hasNativePrompt, setHasNativePrompt] = useState(() => Boolean(window.__nexoInstallPrompt))
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const available = () => setHasNativePrompt(true)
    const completed = () => { setInstalled(true); setHasNativePrompt(false); setInstructionsOpen(false) }
    window.addEventListener('nexo-install-available', available)
    window.addEventListener('nexo-app-installed', completed)
    return () => {
      window.removeEventListener('nexo-install-available', available)
      window.removeEventListener('nexo-app-installed', completed)
    }
  }, [])

  async function install() {
    if (installed) {
      setMessage('O NEXO já está instalado neste aparelho.')
      return
    }

    const prompt = window.__nexoInstallPrompt
    if (prompt) {
      try {
        await prompt.prompt()
        const choice = await prompt.userChoice
        if (choice.outcome === 'accepted') {
          window.__nexoInstallPrompt = null
          setHasNativePrompt(false)
        }
        return
      } catch {
        window.__nexoInstallPrompt = null
        setHasNativePrompt(false)
      }
    }

    setInstructionsOpen(true)
  }

  return <>
    <button type="button" className="profile-sidepanel-item nexo-install-button" onClick={install}>
      <span><b>{installed ? 'NEXO instalado' : 'Instalar NEXO'}</b><small>{installed ? 'Abra pelo ícone na tela inicial' : hasNativePrompt ? 'Adicionar como aplicativo neste aparelho' : 'Adicionar à tela inicial'}</small></span>
    </button>
    {message ? <p className="nexo-install-message">{message}</p> : null}
    {instructionsOpen ? createPortal(<div className="nexo-install-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setInstructionsOpen(false)}>
      <section className="nexo-install-dialog" role="dialog" aria-modal="true" aria-labelledby="nexo-install-title">
        <span className="nexo-install-logo">NX</span>
        <h2 id="nexo-install-title">Leve o NEXO com você</h2>
        {isIos() ? <ol><li>Abra este site no <strong>Safari</strong>.</li><li>Toque no botão <strong>Compartilhar</strong>.</li><li>Escolha <strong>Adicionar à Tela de Início</strong>.</li><li>Confirme em <strong>Adicionar</strong>.</li></ol> : <ol><li>Abra o menu do navegador.</li><li>Toque em <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Confirme a instalação.</li></ol>}
        <p>Depois disso, o NEXO abrirá em tela cheia, como um aplicativo.</p>
        <button type="button" onClick={() => setInstructionsOpen(false)}>Entendi</button>
      </section>
    </div>, document.body) : null}
  </>
}
