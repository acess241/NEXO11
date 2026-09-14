import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const FILTERS = [
  { id: 'portugues-lado', subject: 'portugues', mode: 'lado', label: 'Portugues', short: 'POR', color: '#ff4f8b' },
  { id: 'matematica-lado', subject: 'matematica', mode: 'lado', label: 'Matematica', short: 'MAT', color: '#1aa7ff' },
  { id: 'ingles-quiz', subject: 'ingles', mode: 'quiz', label: 'Ingles', short: 'ING', color: '#7c5cff' },
  { id: 'ciencias-chuva', subject: 'ciencias', mode: 'chuva', label: 'Ciencias', short: 'CIE', color: '#22c55e' },
  { id: 'amigo-caminho', subject: 'matematica', mode: 'amigo', label: 'Leve o amigo', short: 'AMG', color: '#facc15' },
  { id: 'portugues-sequencia', subject: 'portugues', mode: 'sequencia', label: 'Frase certa', short: 'ABC', color: '#f97316' },
  { id: 'matematica-chuva', subject: 'matematica', mode: 'chuva', label: 'Conta caiu', short: '123', color: '#06b6d4' },
]

const QUESTION_BANK = {
  portugues: [
    { prompt: 'Qual palavra esta correta?', options: ['excessao', 'excecao'], answer: 'excecao', hint: 'A correta e excecao.' },
    { prompt: 'Qual e o verbo?', options: ['menina', 'correu'], answer: 'correu', hint: 'Verbo indica acao.' },
    { prompt: 'Sinonimo de rapido:', options: ['veloz', 'fraco'], answer: 'veloz', hint: 'Veloz tem sentido parecido.' },
    { prompt: 'Qual esta no plural?', options: ['O aluno chegou', 'Os alunos chegaram'], answer: 'Os alunos chegaram', hint: 'Plural: os alunos.' },
  ],
  matematica: [
    { prompt: '7 x 8 = ?', options: ['54', '56'], answer: '56', hint: '7 x 8 = 56.' },
    { prompt: 'Metade e:', options: ['1/2', '1/3'], answer: '1/2', hint: 'Metade e uma parte de duas.' },
    { prompt: '15 + 27 = ?', options: ['42', '41'], answer: '42', hint: '15 + 27 = 42.' },
    { prompt: 'Numero primo:', options: ['9', '11'], answer: '11', hint: '11 so divide por 1 e 11.' },
  ],
  ingles: [
    { prompt: 'Casa em ingles:', options: ['house', 'horse'], answer: 'house', hint: 'House significa casa.' },
    { prompt: 'I ___ a student.', options: ['am', 'are'], answer: 'am', hint: 'Com I usamos am.' },
    { prompt: 'Livro em ingles:', options: ['book', 'door'], answer: 'book', hint: 'Book significa livro.' },
    { prompt: 'Past of go:', options: ['went', 'goed'], answer: 'went', hint: 'Go vira went.' },
  ],
  ciencias: [
    { prompt: 'Bombeia sangue:', options: ['coracao', 'pulmao'], answer: 'coracao', hint: 'O coracao bombeia sangue.' },
    { prompt: 'Agua ferve perto de:', options: ['100°C', '10°C'], answer: '100°C', hint: 'Perto de 100°C.' },
    { prompt: 'Plantas fazem:', options: ['fotossintese', 'evaporacao'], answer: 'fotossintese', hint: 'Fotossintese usa luz.' },
    { prompt: 'Energia renovavel:', options: ['solar', 'carvao'], answer: 'solar', hint: 'Solar e renovavel.' },
  ],
}

const SEQUENCES = {
  portugues: [
    { prompt: 'Monte a frase:', answer: ['O', 'aluno', 'estuda'], distractors: ['ontem'] },
    { prompt: 'Narrativa:', answer: ['inicio', 'meio', 'fim'], distractors: ['capa'] },
  ],
  matematica: [
    { prompt: 'Menor para maior:', answer: ['2', '5', '9'], distractors: ['1'] },
    { prompt: 'Soma com reserva:', answer: ['unidades', 'dezenas', 'resultado'], distractors: ['titulo'] },
  ],
  ingles: [
    { prompt: 'Monte:', answer: ['I', 'like', 'school'], distractors: ['am'] },
    { prompt: 'Pergunta:', answer: ['How', 'are', 'you?'], distractors: ['is'] },
  ],
  ciencias: [
    { prompt: 'Ciclo da agua:', answer: ['evaporacao', 'condensacao', 'chuva'], distractors: ['combustao'] },
    { prompt: 'Cadeia alimentar:', answer: ['planta', 'inseto', 'passaro'], distractors: ['rocha'] },
  ],
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5)
}

export default function StudyFilters() {
  const navigate = useNavigate()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const timerRef = useRef(null)
  const recorderRef = useRef(null)
  const recorderChunksRef = useRef([])
  const drawFrameRef = useRef(null)
  const [activeFilter, setActiveFilter] = useState(FILTERS[0])
  const [round, setRound] = useState(0)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [feedback, setFeedback] = useState(null)
  const [selectedSequence, setSelectedSequence] = useState([])
  const [friends, setFriends] = useState([])
  const [friendIndex, setFriendIndex] = useState(0)
  const [friendStep, setFriendStep] = useState(0)
  const [timeLeft, setTimeLeft] = useState(25)
  const [cameraState, setCameraState] = useState('loading')
  const [recording, setRecording] = useState(false)
  const [recordedUrl, setRecordedUrl] = useState('')

  const questions = QUESTION_BANK[activeFilter.subject]
  const current = questions[(round + (activeFilter.mode === 'amigo' ? friendStep : 0)) % questions.length]
  const sequenceSet = SEQUENCES[activeFilter.subject][round % SEQUENCES[activeFilter.subject].length]
  const friend = friends[friendIndex % Math.max(1, friends.length)] || { nome: 'um amigo', username: 'amigo', foto_url: '' }
  const mixedOptions = useMemo(() => shuffle(current.options), [current])
  const rainOptions = useMemo(() => shuffle([...current.options, current.hint.split(' ')[0]]).slice(0, 3), [current])
  const sequenceOptions = useMemo(() => shuffle([...sequenceSet.answer, ...sequenceSet.distractors]), [sequenceSet])

  useEffect(() => {
    let active = true

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } },
        })

        if (!active) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setCameraState('ready')
      } catch {
        setCameraState('blocked')
      }
    }

    void startCamera()
    return () => {
      active = false
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadFriends() {
      try {
        const { data: auth } = await supabase.auth.getUser()
        if (!auth?.user) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('id,nome,username,foto_url')
          .eq('account_id', auth.user.id)
          .maybeSingle()

        if (!profile) return

        const { data: follows } = await supabase
          .from('follows')
          .select('following_profile_id')
          .eq('follower_profile_id', profile.id)
          .limit(80)

        const ids = (follows || []).map((item) => item.following_profile_id).filter(Boolean)
        if (!ids.length) {
          if (active) setFriends([profile])
          return
        }

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id,nome,username,foto_url')
          .in('id', ids)

        if (active) {
          setFriends((profiles?.length ? profiles : [profile]))
          setFriendIndex(Math.floor(Math.random() * Math.max(1, profiles?.length || 1)))
        }
      } catch {
        if (active) setFriends([{ nome: 'um amigo', username: 'amigo', foto_url: '' }])
      }
    }

    void loadFriends()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    setFeedback(null)
    setSelectedSequence([])
    setFriendStep(0)
    setTimeLeft(activeFilter.mode === 'quiz' ? 18 : 25)
    window.clearInterval(timerRef.current)
    timerRef.current = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timerRef.current)
          setFeedback({ type: 'bad', text: 'Tempo! Vai para a proxima.' })
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(timerRef.current)
  }, [activeFilter, round])

  function chooseFilter(filter) {
    setActiveFilter(filter)
    setRound(0)
    setScore(0)
    setStreak(0)
    setFeedback(null)
    setSelectedSequence([])
    setFriendStep(0)
    setFriendIndex((value) => value + 1)
  }

  function nextRound() {
    setRound((value) => value + 1)
    setFeedback(null)
    setFriendStep(0)
  }

  function answer(value) {
    if (feedback) return
    const ok = value === current.answer
    setFeedback({ type: ok ? 'good' : 'bad', text: ok ? 'Acertou!' : current.hint })
    if (ok) {
      setScore((valueScore) => valueScore + (streak >= 2 ? 15 : 10))
      setStreak((valueStreak) => valueStreak + 1)
    } else {
      setStreak(0)
    }
  }

  function pickSequence(value) {
    if (feedback || selectedSequence.includes(value)) return
    const next = [...selectedSequence, value]
    setSelectedSequence(next)
    if (next.length !== sequenceSet.answer.length) return
    const ok = next.join('|') === sequenceSet.answer.join('|')
    setFeedback({ type: ok ? 'good' : 'bad', text: ok ? 'Perfeito!' : sequenceSet.answer.join(' > ') })
    if (ok) {
      setScore((valueScore) => valueScore + 15)
      setStreak((valueStreak) => valueStreak + 1)
    } else {
      setStreak(0)
    }
  }

  function answerFriendObstacle(value) {
    if (feedback) return
    const ok = value === current.answer
    if (!ok) {
      setFeedback({ type: 'bad', text: current.hint })
      setStreak(0)
      return
    }

    const nextStep = friendStep + 1
    setScore((valueScore) => valueScore + 10)
    setStreak((valueStreak) => valueStreak + 1)
    if (nextStep >= 3) {
      setFeedback({ type: 'good', text: `${friend.nome || 'Seu amigo'} chegou em casa!` })
      setFriendStep(0)
    } else {
      setFriendStep(nextStep)
    }
  }

  function drawRecordingFrame() {
    const canvas = canvasRef.current
    const video = videoRef.current
    if (!canvas || !video) return

    const ctx = canvas.getContext('2d')
    const width = canvas.width
    const height = canvas.height
    ctx.fillStyle = '#05070b'
    ctx.fillRect(0, 0, width, height)

    if (video.readyState >= 2) {
      ctx.save()
      ctx.translate(width, 0)
      ctx.scale(-1, 1)
      const ratio = Math.max(width / video.videoWidth, height / video.videoHeight)
      const drawWidth = video.videoWidth * ratio
      const drawHeight = video.videoHeight * ratio
      ctx.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
      ctx.restore()
    }

    ctx.fillStyle = 'rgba(0,0,0,.55)'
    ctx.fillRect(26, 28, width - 52, 86)
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.font = '700 34px Arial'
    ctx.fillText(activeFilter.mode === 'amigo' ? `Leve ${friend.nome || 'seu amigo'}` : activeFilter.label, width / 2, 64)
    ctx.font = '800 30px Arial'
    ctx.fillText(activeFilter.mode === 'sequencia' ? sequenceSet.prompt : current.prompt, width / 2, 102)

    ctx.fillStyle = activeFilter.color
    ctx.beginPath()
    ctx.roundRect(42, height - 150, width - 84, 86, 26)
    ctx.fill()
    ctx.fillStyle = '#061016'
    ctx.font = '900 32px Arial'
    ctx.fillText(`${score} pts  |  ${timeLeft}s`, width / 2, height - 97)

    if (activeFilter.mode === 'amigo') {
      ctx.fillStyle = '#fff'
      ctx.font = '900 26px Arial'
      ctx.fillText(`Obstaculo ${friendStep + 1}/3`, width / 2, 158)
    }

    drawFrameRef.current = requestAnimationFrame(drawRecordingFrame)
  }

  function startRecording() {
    const canvas = canvasRef.current
    if (!canvas || !window.MediaRecorder) return
    setRecordedUrl('')
    recorderChunksRef.current = []
    drawRecordingFrame()
    const stream = canvas.captureStream(30)
    const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' })
    recorder.ondataavailable = (event) => {
      if (event.data?.size) recorderChunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      cancelAnimationFrame(drawFrameRef.current)
      const blob = new Blob(recorderChunksRef.current, { type: 'video/webm' })
      setRecordedUrl(URL.createObjectURL(blob))
    }
    recorderRef.current = recorder
    recorder.start()
    setRecording(true)
  }

  function stopRecording() {
    recorderRef.current?.stop()
    setRecording(false)
  }

  return (
    <main className="study-filter-camera" style={{ '--filter-accent': activeFilter.color }}>
      <video ref={videoRef} className="study-filter-video" playsInline muted autoPlay />
      <canvas ref={canvasRef} className="study-filter-recording-canvas" width="720" height="1280" />
      <div className={`study-filter-camera-fallback ${cameraState === 'ready' ? 'hidden' : ''}`}>
        <strong>{cameraState === 'loading' ? 'Abrindo camera...' : 'Camera bloqueada'}</strong>
        <span>{cameraState === 'blocked' ? 'Permita a camera no navegador para o filtro aparecer sobre seu rosto.' : 'Segura ai, senhora.'}</span>
      </div>

      <div className="study-filter-vignette" />
      <button type="button" className="study-filter-close" onClick={() => navigate(-1)} aria-label="Fechar filtros">×</button>
      <button type="button" className={`study-filter-record ${recording ? 'recording' : ''}`} onClick={recording ? stopRecording : startRecording}>
        {recording ? 'Parar' : 'Gravar'}
      </button>
      {recordedUrl && <a className="study-filter-download" href={recordedUrl} download="nexo-filtro.webm">Baixar video</a>}

      <section className="study-filter-top">
        <b>{activeFilter.label}</b>
        <span>{score} pts</span>
        <span>{timeLeft}s</span>
      </section>

      <section className={`study-filter-effect is-${activeFilter.mode}`}>
        <div className="study-filter-question">
          {activeFilter.mode === 'amigo'
            ? `Leve ${friend.nome || 'seu amigo'} para casa: obstaculo ${friendStep + 1}/3`
            : activeFilter.mode === 'sequencia' ? sequenceSet.prompt : current.prompt}
        </div>

        {activeFilter.mode === 'amigo' && (
          <div className="study-filter-friend-game">
            <div className="study-filter-path">
              <span className={friendStep >= 0 ? 'active' : ''}>🏁</span>
              <i />
              <span className={friendStep >= 1 ? 'active' : ''}>?</span>
              <i />
              <span className={friendStep >= 2 ? 'active' : ''}>?</span>
              <i />
              <span className={friendStep >= 3 ? 'active' : ''}>⌂</span>
            </div>
            <div className="study-filter-friend-card">
              {friend.foto_url ? <img src={friend.foto_url} alt="" /> : <b>{friend.nome?.charAt(0)?.toUpperCase() || '?'}</b>}
              <strong>{friend.nome || 'Amigo'}</strong>
              <small>@{friend.username || 'amigo'}</small>
            </div>
            <p>{current.prompt}</p>
            <div className="study-filter-quiz-game">
              {mixedOptions.map((option) => <button key={option} type="button" onClick={() => answerFriendObstacle(option)}>{option}</button>)}
            </div>
          </div>
        )}

        {activeFilter.mode === 'lado' && (
          <div className="study-filter-side-game">
            {mixedOptions.map((option, index) => (
              <button key={option} type="button" onClick={() => answer(option)}>
                <small>{index === 0 ? 'ESQUERDA' : 'DIREITA'}</small>
                {option}
              </button>
            ))}
          </div>
        )}

        {activeFilter.mode === 'quiz' && (
          <div className="study-filter-quiz-game">
            {mixedOptions.map((option) => <button key={option} type="button" onClick={() => answer(option)}>{option}</button>)}
          </div>
        )}

        {activeFilter.mode === 'chuva' && (
          <div className="study-filter-rain-game">
            {rainOptions.map((option, index) => (
              <button key={`${option}-${index}`} type="button" style={{ '--drop-left': `${12 + index * 31}%`, '--drop-delay': `${index * 0.42}s` }} onClick={() => answer(option)}>
                {option}
              </button>
            ))}
          </div>
        )}

        {activeFilter.mode === 'sequencia' && (
          <div className="study-filter-sequence-game">
            <div>{sequenceSet.answer.map((_, index) => <span key={index}>{selectedSequence[index] || index + 1}</span>)}</div>
            <nav>{sequenceOptions.map((option) => <button key={option} type="button" disabled={selectedSequence.includes(option)} onClick={() => pickSequence(option)}>{option}</button>)}</nav>
          </div>
        )}
      </section>

      {feedback && (
        <section className={`study-filter-result ${feedback.type}`}>
          <strong>{feedback.type === 'good' ? 'Boa!' : 'Quase!'}</strong>
          <span>{feedback.text}</span>
          <button type="button" onClick={nextRound}>Continuar</button>
        </section>
      )}

      <section className="study-filter-picker" aria-label="Escolher filtro">
        <span>Filtros</span>
        <div>
          {FILTERS.map((filter) => (
            <button key={filter.id} type="button" className={filter.id === activeFilter.id ? 'active' : ''} onClick={() => chooseFilter(filter)} style={{ '--item-color': filter.color }}>
              <i>{filter.short}</i>
              <small>{filter.label}</small>
            </button>
          ))}
        </div>
      </section>
    </main>
  )
}
