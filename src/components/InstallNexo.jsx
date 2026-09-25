import { useEffect, useRef, useState } from 'react'
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
  const [fullscreenUnlocked, setFullscreenUnlocked] = useState(false)
  const installTapRef = useRef({ count: 0, lastTapAt: 0, timer: null })
  const fullscreenAvailable = Boolean(
    (document.fullscreenEnabled || document.webkitFullscreenEnabled)
    && (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen),
  )
  const [fullscreenActive, setFullscreenActive] = useState(() => Boolean(document.fullscreenElement || document.webkitFullscreenElement))

  useEffect(() => {
    const available = () => setHasNativePrompt(true)
    const completed = () => { setInstalled(true); setHasNativePrompt(false); setInstructionsOpen(false) }
    const fullscreenChanged = () => setFullscreenActive(Boolean(document.fullscreenElement || document.webkitFullscreenElement))
    window.addEventListener('nexo-install-available', available)
    window.addEventListener('nexo-app-installed', completed)
    document.addEventListener('fullscreenchange', fullscreenChanged)
    document.addEventListener('webkitfullscreenchange', fullscreenChanged)
    return () => {
      window.clearTimeout(installTapRef.current.timer)
      window.removeEventListener('nexo-install-available', available)
      window.removeEventListener('nexo-app-installed', completed)
      document.removeEventListener('fullscreenchange', fullscreenChanged)
      document.removeEventListener('webkitfullscreenchange', fullscreenChanged)
    }
  }, [])

  async function toggleFullscreen() {
    setMessage('')
    try {
      const active = document.fullscreenElement || document.webkitFullscreenElement
      if (active) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen
        await exit?.call(document)
        return
      }

      const root = document.documentElement
      const enter = root.requestFullscreen || root.webkitRequestFullscreen
      if (!enter) throw new Error('fullscreen unavailable')
      await enter.call(root)
      setInstructionsOpen(false)
    } catch {
      setMessage('Este navegador bloqueou a tela cheia. Tente abrir pelo menu do navegador ou use a opção Adicionar à tela inicial.')
    }
  }

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

    setMessage('')
    setInstructionsOpen(true)
  }

  function handleInstallTap() {
    // Keep the browser's native install prompt directly inside the user gesture.
    if (hasNativePrompt || fullscreenUnlocked) {
      void install()
      return
    }

    const now = Date.now()
    const taps = installTapRef.current
    taps.count = now - taps.lastTapAt <= 1200 ? taps.count + 1 : 1
    taps.lastTapAt = now
    window.clearTimeout(taps.timer)

    if (taps.count >= 7) {
      taps.count = 0
      setFullscreenUnlocked(true)
      setMessage('Atalho de tela cheia liberado.')
      return
    }

    // Wait briefly so a seven-tap sequence does not also open the install dialog.
    taps.timer = window.setTimeout(() => {
      taps.count = 0
      void install()
    }, 1250)
  }

  return <>
    <button type="button" className="profile-sidepanel-item nexo-install-button" onClick={handleInstallTap}>
      <span><b>{installed ? 'NEXO instalado' : 'Instalar NEXO'}</b><small>{installed ? 'Abra pelo ícone na tela inicial' : hasNativePrompt ? 'Adicionar como aplicativo neste aparelho' : 'Adicionar à tela inicial'}</small></span>
    </button>
    {fullscreenUnlocked ? <div className="nexo-fullscreen-unlocked">
      {fullscreenAvailable ? <button type="button" className="nexo-fullscreen-action" onClick={toggleFullscreen}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3"/></svg>
        {fullscreenActive ? 'Sair da tela cheia' : 'Entrar em tela cheia'}
      </button> : <p className="nexo-fullscreen-unavailable" role="status">Este navegador não libera tela cheia para o site.</p>}
    </div> : null}
    {message ? <p className="nexo-install-message">{message}</p> : null}
    {instructionsOpen ? createPortal(<div className="nexo-install-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setInstructionsOpen(false)}>
      <section className="nexo-install-dialog" role="dialog" aria-modal="true" aria-labelledby="nexo-install-title">
        <span className="nexo-install-logo">NX</span>
        <h2 id="nexo-install-title">Leve o NEXO com você</h2>
        <p>Adicione o NEXO à tela inicial para abrir como um aplicativo.</p>
        {isIos() ? <ol><li>Abra este site no <strong>Safari</strong>.</li><li>Toque no botão <strong>Compartilhar</strong>.</li><li>Escolha <strong>Adicionar à Tela de Início</strong>.</li><li>Confirme em <strong>Adicionar</strong>.</li></ol> : <ol><li>Abra o menu do navegador.</li><li>Toque em <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Confirme a instalação.</li></ol>}
        <p>Depois disso, o NEXO abrirá em tela cheia, como um aplicativo.</p>
        <button type="button" onClick={() => setInstructionsOpen(false)}>Entendi</button>
      </section>
    </div>, document.body) : null}
  </>
}
