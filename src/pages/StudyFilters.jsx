import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { saveCaptureDraft } from '../lib/captureDraft'
import { STUDY_FILTERS, GAME_QUESTIONS } from '../lib/studyGames'
import { paintCameraFrame, recorderOptions } from '../lib/cameraCapture'
import './StudyFilters.css'

function Icon({ name, ...props }) {
  const paths = {
    close: <path d="m6 6 12 12M18 6 6 18" />,
    flip: <path d="M3 10a9 9 0 0 1 16-5l2 3M21 3v5h-5M21 14A9 9 0 0 1 5 19l-2-3M3 21v-5h5" />,
    camera: <><path d="M3 7h4l2-3h6l2 3h4v13H3Z" /><circle cx="12" cy="13" r="4" /></>,
    gallery: <><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 6-6 5 5 3-3 4 4" /></>,
    mic: <><rect x="9" y="2" width="6" height="13" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
    none: <><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></>,
    route: <><path d="M4 20c0-7 12-2 12-9M14 7l5-4 4 4v6h-9Z" /><circle cx="5" cy="6" r="3" /><path d="M5 9v5M2 12h6" /></>,
    judge: <path d="m5 3 5-1 9 9-1 5-4-1-9-9Zm7 8-8 8M3 22h16" />,
    food: <path d="M3 10a9 9 0 0 1 18 0ZM2 14h20M3 18h18v3H3ZM8 6h1M14 5h1" />,
    lab: <><path d="M8 2h8M9 2v7L3 19q-1 3 3 3h12q4 0 3-3L15 9V2M7 15h10" /><circle cx="10" cy="18" r="1" /></>,
    chat: <path d="M3 4h18v13H9l-6 4ZM7 9h10M7 13h6" />,
    letters: <path d="m2 19 6-15 6 15M4 14h8M17 8h4v11h-4Z" />,
    numbers: <path d="M5 5h5v6H5v8h5M15 5h5v14h-5M15 12h5" />,
    play: <path d="m8 4 12 8-12 8Z" />,
  }
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name] || paths.play}</svg>
}

export default function StudyFilters() {
  const navigate = useNavigate()
  const videoRef = useRef(null), backdropRef = useRef(null), stageRef = useRef(null), canvasRef = useRef(null)
  const streamRef = useRef(null), micRef = useRef(null), recorderRef = useRef(null), animationRef = useRef(null)
  const mountedRef = useRef(false), operationRef = useRef(0), captureBusyRef = useRef(false), answerLockRef = useRef(false)
  const recordingStartRef = useRef(0), recordingDurationRef = useRef(0), fileInputRef = useRef(null)
  const [filter, setFilter] = useState(STUDY_FILTERS[0])
  const [mode, setMode] = useState('NEXIS'), [storyVideo, setStoryVideo] = useState(true)
  const [facing, setFacing] = useState('user'), [cameraState, setCameraState] = useState('loading')
  const [cameraRetry, setCameraRetry] = useState(0), [micEnabled, setMicEnabled] = useState(true)
  const [notice, setNotice] = useState(''), [phase, setPhase] = useState('ready')
  const [round, setRound] = useState(0), [score, setScore] = useState(0), [timeLeft, setTimeLeft] = useState(25)
  const [feedback, setFeedback] = useState(null), [sequence, setSequence] = useState([])
  const [friends, setFriends] = useState([]), [friendIndex, setFriendIndex] = useState(0)
  const [recording, setRecording] = useState(false), [starting, setStarting] = useState(false), [elapsed, setElapsed] = useState(0)
  const [capture, setCapture] = useState(null), [previewUrl, setPreviewUrl] = useState('')
  const hasGame = filter.id !== 'none'
  const current = GAME_QUESTIONS[filter.id]?.[round % GAME_QUESTIONS[filter.id].length]
  const friend = friends[friendIndex % Math.max(1, friends.length)] || { nome: 'Seu parceiro', foto_url: '' }
  const wantsVideo = mode === 'NEXIS' || (mode === 'STORY' && storyVideo)

  useEffect(() => {
    mountedRef.current = true
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      mountedRef.current = false; document.body.style.overflow = oldOverflow
      cancelAnimationFrame(animationRef.current)
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      micRef.current?.getTracks().forEach(track => track.stop())
    }
  }, [])
  useEffect(() => {
    let active = true
    const operation = ++operationRef.current
    setCameraState('loading'); streamRef.current?.getTracks().forEach(track => track.stop())
    async function open() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('unavailable')
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 720 },
            aspectRatio: { ideal: 16 / 9 },
          },
        })
        if (!active || operation !== operationRef.current) { stream.getTracks().forEach(track => track.stop()); return }
        streamRef.current = stream
        const track = stream.getVideoTracks()[0], zoom = track.getCapabilities?.().zoom
        if (zoom) await track.applyConstraints({ advanced: [{ zoom: zoom.min }] }).catch(() => {})
        for (const video of [videoRef.current, backdropRef.current]) { if (video) { video.srcObject = stream; await video.play() } }
        if (active) setCameraState('ready')
      } catch (error) {
        if (active) { setCameraState('blocked'); setNotice(error.name === 'NotAllowedError' ? 'Permita a câmera nas configurações do navegador. Você também pode jogar sem gravar.' : 'Não foi possível abrir a câmera. Tente novamente ou escolha um arquivo da galeria.') }
      }
    }
    void open()
    return () => { active = false; streamRef.current?.getTracks().forEach(track => track.stop()) }
  }, [facing, cameraRetry])
  useEffect(() => {
    let active = true
    async function load() {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth?.user) return
      const { data: profile } = await supabase.from('profiles').select('id,nome,username,foto_url').eq('account_id', auth.user.id).maybeSingle()
      if (!profile) return
      const { data: follows } = await supabase.from('follows').select('following_profile_id').eq('follower_profile_id', profile.id).limit(80)
      const ids = (follows || []).map(row => row.following_profile_id).filter(Boolean)
      const { data } = ids.length ? await supabase.from('profiles').select('id,nome,username,foto_url').in('id', ids) : { data: [profile] }
      if (active) setFriends(data?.length ? data : [profile])
    }
    void load().catch(() => {})
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (phase !== 'playing' || capture) return
    const timer = setInterval(() => setTimeLeft(value => Math.max(0, value - 1)), 1000)
    return () => clearInterval(timer)
  }, [phase, round, capture])
  useEffect(() => {
    if (phase === 'playing' && timeLeft === 0 && !answerLockRef.current) finishAnswer(false, 'O tempo acabou. ' + current.hint)
  }, [timeLeft, phase])
  useEffect(() => {
    if (!recording) return
    const timer = setInterval(() => { const seconds = (performance.now() - recordingStartRef.current) / 1000; setElapsed(Math.floor(seconds)); if (seconds >= 59) stopRecording() }, 200)
    return () => clearInterval(timer)
  }, [recording])
  useEffect(() => {
    if (!capture) { setPreviewUrl(''); return }
    const url = URL.createObjectURL(capture.file); setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [capture])
  useEffect(() => {
    const keydown = event => {
      if (event.repeat || event.target.closest('input,textarea,select') || capture) return
      const index = Number(event.key) - 1
      if (phase === 'playing' && index >= 0 && index < current.options.length) { event.preventDefault(); answer(current.options[index]) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  })
  function resetGame(start = false) {
    answerLockRef.current = false
    setRound(0); setScore(0); setTimeLeft(25); setFeedback(null); setSequence([]); setPhase(start ? 'playing' : 'ready')
  }
  function chooseFilter(next, event) { setFilter(next); resetGame(); event?.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }) }
  function finishAnswer(ok, text) { answerLockRef.current = true; if (ok) setScore(value => value + 1); setFeedback({ ok, text }); setPhase('feedback') }
  function answer(option) {
    if (phase !== 'playing' || answerLockRef.current) return
    if (filter.id === 'frase') {
      if (sequence.includes(option)) return
      const next = [...sequence, option]; setSequence(next)
      if (next.length < current.options.length) return
      finishAnswer(next.join(' ') === current.answer, current.hint)
    } else finishAnswer(option === current.answer, current.hint)
  }
  function nextRound() {
    if (round + 1 >= filter.rounds) { setPhase('finished'); return }
    answerLockRef.current = false
    setRound(value => value + 1); setTimeLeft(25); setFeedback(null); setSequence([]); setPhase('playing')
  }
  function prepareCanvas() {
    const bounds = stageRef.current.getBoundingClientRect(), canvas = canvasRef.current
    const largestSide = Math.max(bounds.width, bounds.height)
    const scale = Math.min(2, 1280 / Math.max(1, largestSide), devicePixelRatio || 1)
    canvas.width = Math.max(2, Math.round(bounds.width * scale))
    canvas.height = Math.max(2, Math.round(bounds.height * scale))
    return canvas
  }
  function draw() { paintCameraFrame(canvasRef.current, videoRef.current, stageRef.current, facing === 'user'); animationRef.current = requestAnimationFrame(draw) }
  async function startRecording() {
    if (captureBusyRef.current || recording || cameraState !== 'ready') return
    captureBusyRef.current = true; setStarting(true); setNotice('')
    let output
    try {
      if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) throw new Error('Este navegador não consegue gravar com efeitos. Atualize o navegador ou envie um vídeo da galeria.')
      let mic
      if (micEnabled) {
        try { mic = await navigator.mediaDevices.getUserMedia({ audio: true }); micRef.current = mic }
        catch { if (mountedRef.current) setNotice('Microfone indisponível. A gravação ficará sem som.') }
      }
      if (!mountedRef.current) { mic?.getTracks().forEach(track => track.stop()); return }
      prepareCanvas()
      if (hasGame && (phase === 'ready' || phase === 'finished')) resetGame(true)
      draw(); output = canvasRef.current.captureStream(30)
      mic?.getAudioTracks().forEach(track => output.addTrack(track))
      const recorder = new MediaRecorder(output, recorderOptions()), chunks = []
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        cancelAnimationFrame(animationRef.current); output.getTracks().forEach(track => track.stop()); micRef.current = null
        if (!mountedRef.current) return
        const type = recorder.mimeType || chunks[0]?.type || 'video/webm'
        const file = new File(chunks, `nexo-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type })
        setRecording(false)
        if (file.size) setCapture({ file, duration: recordingDurationRef.current || 1 })
        else setNotice('A gravação ficou vazia. Tente gravar novamente.')
      }
      recorder.onerror = () => { setNotice('Não foi possível concluir a gravação. Tente novamente.'); stopRecording() }
      recorderRef.current = recorder; recordingStartRef.current = performance.now(); recordingDurationRef.current = 0
      recorder.start(250); setElapsed(0); setRecording(true)
    } catch (error) {
      cancelAnimationFrame(animationRef.current); output?.getTracks().forEach(track => track.stop()); micRef.current?.getTracks().forEach(track => track.stop())
      setNotice(error.message || 'Não foi possível iniciar a gravação.')
    } finally { captureBusyRef.current = false; if (mountedRef.current) setStarting(false) }
  }
  function stopRecording() {
    if (recorderRef.current?.state !== 'recording') return
    recordingDurationRef.current = Math.min(60, (performance.now() - recordingStartRef.current) / 1000)
    recorderRef.current.stop(); setRecording(false)
  }
  async function takePhoto() {
    if (cameraState !== 'ready' || captureBusyRef.current) return
    captureBusyRef.current = true; setStarting(true)
    try {
      const canvas = prepareCanvas(); paintCameraFrame(canvas, videoRef.current, stageRef.current, facing === 'user')
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92))
      if (!blob) throw new Error('Não foi possível capturar a foto. Tente novamente.')
      setCapture({ file: new File([blob], `nexo-${Date.now()}.jpg`, { type: 'image/jpeg' }), duration: 15 })
    } catch (error) { setNotice(error.message) }
    finally { captureBusyRef.current = false; setStarting(false) }
  }
  function continueToPublish() {
    const target = mode === 'STORY' ? 'story' : 'post'
    saveCaptureDraft({ ...capture, target }); navigate(target === 'story' ? '/novo-story?camera=1' : '/novo-post?camera=1')
  }
  function selectMode(value) { if (recording || starting) return; setMode(value); if (value === 'NOTAS') navigate('/novo-post?tipo=nota') }
  function fromGallery(event) {
    const file = event.target.files?.[0]; event.target.value = ''
    if (!file) return
    if (!/^(image|video)\//.test(file.type)) { setNotice('Escolha uma foto ou um vídeo.'); return }
    if (file.size > 100 * 1024 * 1024) { setNotice('Escolha um arquivo de até 100 MB.'); return }
    if (mode === 'STORY') { saveCaptureDraft({ file, target: 'story', fromGallery: true }); navigate('/novo-story?camera=1') }
    else setCapture({ file, duration: 0 })
  }
  return createPortal(
    <main className="nexo-camera" style={{ '--game-color': filter.color }}>
      <section className="nc-stage" ref={stageRef} aria-label="Câmera e jogo">
        <video className={`nc-backdrop ${facing === 'user' ? 'mirrored' : ''}`} ref={backdropRef} muted playsInline autoPlay disablePictureInPicture aria-hidden="true" />
        <video className={`nc-video ${facing === 'user' ? 'mirrored' : ''}`} ref={videoRef} muted playsInline autoPlay disablePictureInPicture aria-label="Sua câmera ao vivo" />
        <div className="nc-shade" />
        {cameraState !== 'ready' && <div className="nc-camera-empty"><Icon name="camera" /><strong>{cameraState === 'loading' ? 'Abrindo sua câmera…' : 'Sua câmera está desativada'}</strong>{cameraState === 'blocked' && <button onClick={() => setCameraRetry(value => value + 1)}>Tentar novamente</button>}</div>}
        <header className="nc-header"><button className="nc-icon-button" aria-label="Fechar câmera" onClick={() => navigate('/')}><Icon name="close" /></button><div className="nc-brand">NEXO<span>criar</span></div><div className="nc-tools"><button className={`nc-icon-button ${!micEnabled ? 'is-muted' : ''}`} disabled={recording || starting} aria-label={micEnabled ? 'Desativar microfone' : 'Ativar microfone'} aria-pressed={micEnabled} onClick={() => setMicEnabled(value => !value)}><Icon name="mic" /></button><button className="nc-icon-button" aria-label="Trocar câmera" disabled={recording || starting} onClick={() => setFacing(value => value === 'user' ? 'environment' : 'user')}><Icon name="flip" /></button></div></header>
        {notice && <div className="nc-notice" role="status">{notice}<button aria-label="Fechar aviso" onClick={() => setNotice('')}>×</button></div>}
        {recording && <div className="nc-recording-badge">● REC {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')} / 01:00</div>}
        {hasGame && <div className="nc-game">
          <div className="nc-game-head" data-capture><span>{filter.subject} · {filter.label}</span><b>{phase === 'ready' ? `${filter.rounds} desafios` : `${score} acertos · ${timeLeft}s`}</b></div>
          {phase !== 'ready' && phase !== 'finished' && <div className="nc-question" data-capture><small>DESAFIO {round + 1} DE {filter.rounds}</small><h1>{current.prompt}</h1></div>}
          <div className="nc-face-space" aria-hidden="true" />
          <div className="nc-game-bottom">
            {phase === 'ready' ? <section className="nc-intro" data-capture><span className="nc-intro-icon"><Icon name={filter.icon} /></span><div><h1>{filter.label}</h1><p>{filter.description}</p></div><button className="nc-primary" onClick={() => resetGame(true)}><Icon name="play" /> Jogar agora</button><small>Toque nas respostas · No PC, use 1, 2 ou 3</small></section> : phase === 'finished' ? <section className="nc-finish" data-capture><span>DESAFIO CONCLUÍDO</span><h1>{score} / {filter.rounds}</h1><p>{filter.id === 'amigo' ? (score === 3 ? `${friend.nome} chegou em casa!` : 'Treine mais uma vez para vencer os três obstáculos.') : 'Mandou bem em participar! Que tal mais uma rodada?'}</p><button className="nc-primary" onClick={() => resetGame(true)}>Jogar novamente</button>{recording && <button className="nc-secondary" onClick={stopRecording}>Finalizar vídeo</button>}</section> : <>
              {['amigo', 'cantina', 'lab'].includes(filter.id) && <div className={`nc-world is-${filter.id}`}>
                <div className="nc-friend" data-capture><span className="nc-avatar">{friend.foto_url ? <img src={friend.foto_url} alt="" /> : (friend.nome || 'A').charAt(0)}</span><span>{friend.nome}</span></div>
                {filter.id === 'amigo' && <div className="nc-route" data-capture>{[0, 1, 2].map(i => <span key={i} className={i < score ? 'done' : ''}>{i < score ? '✓' : i + 1}</span>)}<Icon name="route" /></div>}
                {filter.id === 'cantina' && <div className="nc-tray" data-capture>{[0, 1, 2].map(i => <Icon key={i} name="food" className={i < score ? 'earned' : ''} />)}<small>{score} lanches</small></div>}
                {filter.id === 'lab' && <div className="nc-capsules" data-capture>{[0, 1, 2].map(i => <span className={i < score ? 'open' : ''} key={i}><Icon name="lab" />{i < score ? 'Livre!' : '?'}</span>)}</div>}
              </div>}
              {filter.id === 'frase' && <div className="nc-sequence" data-capture>{sequence.join(' ') || 'Toque nas palavras abaixo, em ordem.'}</div>}
              {phase === 'feedback' ? <section className={`nc-feedback ${feedback.ok ? 'correct' : 'incorrect'}`} data-capture role="status"><strong>{feedback.ok ? '✓ Acertou!' : 'Vamos aprender!'}</strong><p>{feedback.text}</p><button className="nc-primary" onClick={nextRound}>{round + 1 === filter.rounds ? 'Ver resultado' : 'Próxima pergunta'} →</button></section> : <div className={`nc-answers ${filter.id === 'conta' ? 'bubbles' : ''}`} style={{ '--answer-count': current.options.length }}>{current.options.map((option, index) => <button key={option} data-capture className="nc-answer" disabled={sequence.includes(option)} onClick={() => answer(option)}><small>{index + 1}</small><span>{option}</span></button>)}</div>}
            </>}
          </div>
        </div>}
      </section>
      <footer className="nc-controls">
        <div className="nc-effects" aria-label="Escolher efeito">{STUDY_FILTERS.map(item => <button key={item.id} disabled={recording || starting} aria-pressed={item.id === filter.id} className={item.id === filter.id ? 'selected' : ''} onClick={event => chooseFilter(item, event)} style={{ '--thumb-color': item.color }}><span><Icon name={item.icon} /></span><small>{item.label}</small></button>)}</div>
        <div className="nc-capture-row"><button className="nc-gallery" aria-label="Abrir galeria" disabled={recording || starting} onClick={() => fileInputRef.current?.click()}><Icon name="gallery" /><span>Galeria</span></button><div className="nc-shutter-wrap"><button className={`nc-shutter ${recording ? 'recording' : ''}`} disabled={cameraState !== 'ready' || starting} aria-label={recording ? 'Parar gravação' : wantsVideo ? 'Iniciar gravação' : 'Tirar foto'} onClick={recording ? stopRecording : wantsVideo ? startRecording : takePhoto}><span>{!recording && <Icon name={wantsVideo ? 'play' : 'camera'} />}</span></button><small>{starting ? 'Preparando…' : recording ? 'Toque para parar' : wantsVideo ? 'Gravar até 60 s' : 'Tirar foto'}</small></div><div className="nc-capture-extra">{mode === 'STORY' ? <button disabled={recording || starting} onClick={() => setStoryVideo(value => !value)}>{storyVideo ? 'Vídeo' : 'Foto'} ⇄</button> : hasGame && friends.length > 1 ? <button disabled={recording || starting} onClick={() => setFriendIndex(value => value + 1)}>Trocar<br />amigo ↻</button> : <span>1×<small>sem zoom</small></span>}</div></div>
        <nav className="nc-modes" aria-label="Tipo de publicação">{['POST', 'NEXIS', 'STORY', 'FOTO', 'NOTAS'].map(value => <button key={value} aria-pressed={value === mode} disabled={recording || starting} className={value === mode ? 'selected' : ''} onClick={() => selectMode(value)}>{value}</button>)}</nav>
      </footer>
      <canvas className="nc-hidden" ref={canvasRef} /><input className="nc-hidden" ref={fileInputRef} type="file" accept="image/*,video/*" onChange={fromGallery} />
      {capture && <section className="nc-review" role="dialog" aria-modal="true" aria-label="Prévia da captura"><header><button className="nc-icon-button" aria-label="Voltar à câmera" onClick={() => setCapture(null)}><Icon name="close" /></button><strong>Gostou do resultado?</strong><span>{capture.file.type.startsWith('video/') ? 'Vídeo' : 'Foto'}</span></header><div className="nc-review-media">{capture.file.type.startsWith('video/') ? <video src={previewUrl} controls playsInline autoPlay loop /> : <img src={previewUrl} alt="Foto capturada" />}</div><footer><button className="nc-primary" onClick={continueToPublish}>Continuar para publicar →</button><div><button onClick={() => setCapture(null)}>Fazer novamente</button><a href={previewUrl} download={capture.file.name}>Salvar no aparelho</a></div><small>Na próxima tela, adicione uma legenda e publique seu {mode === 'STORY' ? 'story' : capture.file.type.startsWith('video/') ? 'Nexis' : 'post'}.</small></footer></section>}
    </main>, document.body,
  )
}
