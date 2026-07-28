import { useEffect, useRef, useState } from 'react'

function IconeFechar() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  )
}

function IconeGaleria() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  )
}

function pararStream(streamRef, videoRef) {
  if (streamRef.current) {
    streamRef.current.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  if (videoRef.current) {
    videoRef.current.srcObject = null
  }
}

function blobParaArquivo(blob, nomeArquivo) {
  if (!blob) return null
  return new File([blob], nomeArquivo, { type: blob.type || 'image/jpeg' })
}

export default function InstantCameraSheet({
  open,
  onClose,
  onCapture,
  onOpenGallery,
  title = 'Camera',
  subtitle = 'Toque no botao para capturar',
  galleryLabel = 'Galeria',
}) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)

  const [iniciando, setIniciando] = useState(false)
  const [capturando, setCapturando] = useState(false)
  const [erro, setErro] = useState('')
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (!open) {
      setErro('')
      return undefined
    }

    let ativo = true

    async function iniciarCamera() {
      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setErro('Seu navegador não suporta camera ao vivo.')
        return
      }

      setIniciando(true)
      setErro('')

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1440 },
            height: { ideal: 1080 },
          },
        })

        if (!ativo) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream

        if (videoRef.current) {
          videoRef.current.srcObject = stream
          try {
            await videoRef.current.play()
          } catch {}
        }
      } catch {
        setErro('Não foi possível abrir a camera agora.')
      } finally {
        if (ativo) {
          setIniciando(false)
        }
      }
    }

    void iniciarCamera()

    return () => {
      ativo = false
      setIniciando(false)
      setCapturando(false)
      pararStream(streamRef, videoRef)
    }
  }, [open, tentativa])

  async function capturarFoto() {
    if (!videoRef.current || !canvasRef.current || capturando) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const largura = video.videoWidth || 1280
    const altura = video.videoHeight || 720

    if (!largura || !altura) {
      setErro('A camera ainda esta iniciando. Tente novamente.')
      return
    }

    setCapturando(true)
    setErro('')

    canvas.width = largura
    canvas.height = altura

    const contexto = canvas.getContext('2d')
    if (!contexto) {
      setErro('Não foi possível capturar a foto.')
      setCapturando(false)
      return
    }

    contexto.drawImage(video, 0, 0, largura, altura)

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.92)
    })

    const arquivo = blobParaArquivo(blob, `camera-${Date.now()}.jpg`)
    setCapturando(false)

    if (!arquivo) {
      setErro('Não foi possível capturar a foto.')
      return
    }

    onCapture?.(arquivo)
    onClose?.()
  }

  function abrirGaleria() {
    onOpenGallery?.()
    onClose?.()
  }

  if (!open) return null

  return (
    <div
      className="instant-camera-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Camera instantanea"
    >
      <section className="instant-camera-sheet">
        <header className="instant-camera-header">
          <div>
            <p>{title}</p>
            <h3>{subtitle}</h3>
          </div>

          <button
            type="button"
            className="instant-camera-close"
            onClick={onClose}
            aria-label="Fechar camera"
          >
            <IconeFechar />
          </button>
        </header>

        <div className="instant-camera-preview">
          {!erro ? (
            <video
              ref={videoRef}
              className="instant-camera-video"
              autoPlay
              muted
              playsInline
            />
          ) : null}

          {iniciando ? <p className="instant-camera-status">Abrindo camera...</p> : null}

          {erro ? (
            <div className="instant-camera-error-card">
              <p>{erro}</p>
              <div className="instant-camera-error-actions">
                <button
                  type="button"
                  className="instant-camera-mini-btn"
                  onClick={() => setTentativa((valor) => valor + 1)}
                >
                  Tentar de novo
                </button>
                <button
                  type="button"
                  className="instant-camera-mini-btn"
                  onClick={abrirGaleria}
                >
                  Abrir galeria
                </button>
              </div>
            </div>
          ) : null}

          {!erro ? (
            <div className="instant-camera-controls">
              <button
                type="button"
                className="instant-camera-gallery-btn"
                onClick={abrirGaleria}
                aria-label="Abrir galeria"
              >
                <span className="instant-camera-gallery-icon">
                  <IconeGaleria />
                </span>
                <small>{galleryLabel}</small>
              </button>

              <button
                type="button"
                className="instant-camera-capture-btn"
                onClick={capturarFoto}
                aria-label="Capturar foto"
                disabled={iniciando || capturando}
              >
                <span />
              </button>

              <span className="instant-camera-control-spacer" aria-hidden="true" />
            </div>
          ) : null}
        </div>

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </section>
    </div>
  )
}
