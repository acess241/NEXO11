export function fitVideo(sw, sh, width, height) {
  const scale = Math.min(width / sw, height / sh)
  return { x: (width - sw * scale) / 2, y: (height - sh * scale) / 2, width: sw * scale, height: sh * scale }
}
function coverVideo(sw, sh, width, height) {
  const scale = Math.max(width / sw, height / sh)
  return { x: (width - sw * scale) / 2, y: (height - sh * scale) / 2, width: sw * scale, height: sh * scale }
}
export function recorderOptions(Recorder = globalThis.MediaRecorder) {
  const mimeType = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(type => Recorder?.isTypeSupported?.(type))
  return { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2000000, audioBitsPerSecond: 96000 }
}
const overlayCache = new WeakMap()
function wrapText(ctx, value, x, y, width, lineHeight, maxLines = 4) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean), lines = []
  let line = ''
  for (const word of words) {
    const next = `${line} ${word}`.trim()
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word }
    else line = next
  }
  if (line) lines.push(line)
  const visible = lines.slice(0, maxLines)
  if (lines.length > maxLines && visible.length) visible[visible.length - 1] = `${visible[visible.length - 1].replace(/[.…]+$/, '')}…`
  visible.forEach((item, index) => ctx.fillText(item, x, y + index * lineHeight, width))
  return visible.length * lineHeight
}
function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath()
  if (ctx.roundRect) ctx.roundRect(x, y, width, height, radius)
  else ctx.rect(x, y, width, height)
}
function drawVideo(ctx, video, rect, mirrored) {
  ctx.save()
  if (mirrored) { ctx.translate(ctx.canvas.width, 0); ctx.scale(-1, 1) }
  ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height)
  ctx.restore()
}
function drawPanel(ctx, x, y, width, height, options = {}) {
  const radius = options.radius ?? 16
  ctx.save()
  if (options.shadow !== false) { ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 7 }
  ctx.fillStyle = options.fill || 'rgba(5,18,12,.82)'
  roundRect(ctx, x, y, width, height, radius); ctx.fill()
  ctx.restore()
  ctx.strokeStyle = options.stroke || 'rgba(255,255,255,.24)'
  ctx.lineWidth = options.lineWidth || 1
  roundRect(ctx, x + .5, y + .5, width - 1, height - 1, radius); ctx.stroke()
}
function drawText(ctx, text, x, y, width, options = {}) {
  const size = options.size || 15
  ctx.fillStyle = options.color || '#fff'
  ctx.font = `${options.weight || 750} ${size}px system-ui, sans-serif`
  ctx.textAlign = options.align || 'left'
  ctx.textBaseline = 'top'
  const tx = options.align === 'center' ? x + width / 2 : options.align === 'right' ? x + width : x
  const height = wrapText(ctx, text, tx, y, width, options.lineHeight || size * 1.28, options.maxLines || 4)
  ctx.textAlign = 'left'
  return height
}
function drawCaptureNode(ctx, node, bounds, accent) {
  const rect = node.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const x = rect.left - bounds.left, y = rect.top - bounds.top, width = rect.width, height = rect.height
  if (node.classList.contains('nc-game-head')) {
    drawPanel(ctx, x, y, width, height, { radius: height / 2, fill: 'rgba(3,16,10,.76)', stroke: `${accent}88`, shadow: false })
    const title = node.querySelector('span')?.textContent || '', score = node.querySelector('b')?.textContent || ''
    if (width < 320) drawText(ctx, `${title}  •  ${score}`, x + 10, y + Math.max(5, height / 2 - 6), width - 20, { size: 10, weight: 850, align: 'center', maxLines: 1 })
    else {
      drawText(ctx, title, x + 13, y + Math.max(5, height / 2 - 6), width * .62, { size: 10, weight: 750, maxLines: 1 })
      drawText(ctx, score, x + width * .58, y + Math.max(5, height / 2 - 6), width * .38 - 13, { size: 10, weight: 900, color: accent, align: 'right', maxLines: 1 })
    }
    return
  }
  if (node.classList.contains('nc-question')) {
    drawPanel(ctx, x, y, width, height, { radius: 17, fill: 'rgba(3,18,12,.84)', stroke: `${accent}aa`, lineWidth: 1.4 })
    ctx.fillStyle = accent; roundRect(ctx, x + width * .38, y, width * .24, 3, 2); ctx.fill()
    drawText(ctx, node.querySelector('small')?.textContent, x + 12, y + 9, width - 24, { size: 9, weight: 900, color: accent, align: 'center', maxLines: 1 })
    drawText(ctx, node.querySelector('h1')?.textContent, x + 14, y + 26, width - 28, { size: Math.min(22, Math.max(15, width / 28)), weight: 850, align: 'center', maxLines: 3 })
    return
  }
  if (node.classList.contains('nc-answer')) {
    drawPanel(ctx, x, y, width, height, { radius: 15, fill: 'rgba(6,24,16,.88)', stroke: 'rgba(255,255,255,.38)', shadow: false })
    const number = node.querySelector('small')?.textContent || '', answer = node.querySelector('span')?.textContent || ''
    const badge = Math.min(24, height - 16)
    ctx.fillStyle = `${accent}22`; roundRect(ctx, x + 9, y + (height - badge) / 2, badge, badge, 7); ctx.fill()
    drawText(ctx, number, x + 9, y + height / 2 - 6, badge, { size: 10, weight: 900, color: accent, align: 'center', maxLines: 1 })
    drawText(ctx, answer, x + badge + 16, y + Math.max(8, height / 2 - 9), width - badge - 24, { size: Math.min(16, Math.max(11, width / 13)), weight: 820, align: 'center', maxLines: 2 })
    return
  }
  if (node.classList.contains('nc-intro')) {
    drawPanel(ctx, x, y, width, height, { radius: 20, fill: 'rgba(3,18,11,.88)', stroke: `${accent}88` })
    drawText(ctx, node.querySelector('h1')?.textContent, x + 16, y + 14, width - 32, { size: 18, weight: 900, color: accent, align: 'center', maxLines: 1 })
    drawText(ctx, node.querySelector('p')?.textContent, x + 18, y + 42, width - 36, { size: 12, weight: 600, color: '#e0e9e3', align: 'center', maxLines: 3 })
    const button = node.querySelector('.nc-primary'), buttonText = button?.textContent?.trim()
    if (buttonText) { ctx.fillStyle = accent; roundRect(ctx, x + 14, y + height - 50, width - 28, 38, 11); ctx.fill(); drawText(ctx, buttonText, x + 22, y + height - 40, width - 44, { size: 13, weight: 900, color: '#061004', align: 'center', maxLines: 1 }) }
    return
  }
  if (node.classList.contains('nc-feedback') || node.classList.contains('nc-finish')) {
    const title = node.querySelector('strong,span')?.textContent || '', main = node.querySelector('h1')?.textContent || '', description = node.querySelector('p')?.textContent || ''
    drawPanel(ctx, x, y, width, height, { radius: 18, fill: 'rgba(3,18,11,.92)', stroke: `${accent}aa` })
    drawText(ctx, title, x + 14, y + 12, width - 28, { size: 13, weight: 900, color: accent, align: 'center', maxLines: 1 })
    if (main) drawText(ctx, main, x + 14, y + 34, width - 28, { size: 27, weight: 950, color: accent, align: 'center', maxLines: 1 })
    drawText(ctx, description, x + 18, y + (main ? 70 : 38), width - 36, { size: 12, weight: 650, color: '#edf4ef', align: 'center', maxLines: 3 })
    return
  }
  if (node.classList.contains('nc-friend')) {
    drawPanel(ctx, x, y, width, height, { radius: height / 2, fill: 'rgba(4,20,13,.82)', stroke: `${accent}77`, shadow: false })
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x + 22, y + height / 2, Math.min(16, height / 2 - 5), 0, Math.PI * 2); ctx.fill()
    drawText(ctx, node.querySelector('span:last-child')?.textContent || 'Amigo', x + 42, y + height / 2 - 7, width - 49, { size: 11, weight: 850, maxLines: 1 })
    return
  }
  if (node.classList.contains('nc-route')) {
    const points = [...node.querySelectorAll('span')]
    points.forEach((point, index) => {
      const cx = x + 15 + index * 31, cy = y + height / 2
      ctx.fillStyle = point.classList.contains('done') ? accent : 'rgba(4,20,13,.80)'; ctx.strokeStyle = `${accent}aa`; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
      drawText(ctx, point.textContent, cx - 8, cy - 6, 16, { size: 9, weight: 900, color: point.classList.contains('done') ? '#071005' : '#fff', align: 'center', maxLines: 1 })
    })
    return
  }
  drawPanel(ctx, x, y, width, height, { radius: 14, fill: 'rgba(4,20,13,.86)', stroke: `${accent}66`, shadow: false })
  drawText(ctx, node.textContent?.replace(/\s+/g, ' ').trim(), x + 12, y + 10, width - 24, { size: Math.min(14, Math.max(10, width / 22)), weight: 750, align: 'center', maxLines: 4 })
}
// Read live cards so the recording follows answers, scores and rounds.
export function paintCameraFrame(canvas, video, stage, mirrored) {
  const ctx = canvas.getContext('2d'), { width, height } = canvas
  ctx.fillStyle = '#0c110f'; ctx.fillRect(0, 0, width, height)
  if (video.readyState >= 2 && video.videoWidth) {
    const cover = coverVideo(video.videoWidth, video.videoHeight, width, height)
    const fit = fitVideo(video.videoWidth, video.videoHeight, width, height)
    ctx.save(); ctx.globalAlpha = .46; drawVideo(ctx, video, cover, mirrored); ctx.restore()
    ctx.fillStyle = 'rgba(0,0,0,.24)'; ctx.fillRect(0, 0, width, height)
    drawVideo(ctx, video, fit, mirrored)
  }
  const shade = ctx.createLinearGradient(0, 0, 0, height)
  shade.addColorStop(0, 'rgba(0,0,0,.42)'); shade.addColorStop(.22, 'rgba(0,0,0,0)'); shade.addColorStop(.7, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.38)')
  ctx.fillStyle = shade; ctx.fillRect(0, 0, width, height)
  const now = performance.now()
  let cached = overlayCache.get(canvas)
  if (!cached || cached.width !== width || cached.height !== height) {
    const overlay = document.createElement('canvas')
    overlay.width = width; overlay.height = height
    cached = { overlay, width, height, updatedAt: 0 }
    overlayCache.set(canvas, cached)
  }
  if (now - cached.updatedAt >= 100) {
    const overlayCtx = cached.overlay.getContext('2d'), bounds = stage.getBoundingClientRect()
    overlayCtx.clearRect(0, 0, width, height)
    if (bounds.width && bounds.height) {
      const scaleX = width / bounds.width, scaleY = height / bounds.height
      const accent = getComputedStyle(stage.closest('.nexo-camera') || stage).getPropertyValue('--game-color').trim() || '#b2ee67'
      overlayCtx.save(); overlayCtx.scale(scaleX, scaleY)
      drawPanel(overlayCtx, 14, 14, 116, 27, { radius: 14, fill: 'rgba(2,13,8,.66)', stroke: `${accent}66`, shadow: false })
      drawText(overlayCtx, 'NEXO  •  APRENDER', 21, 22, 102, { size: 9, weight: 900, color: '#ecfff0', maxLines: 1 })
      for (const node of stage.querySelectorAll('[data-capture]')) drawCaptureNode(overlayCtx, node, bounds, accent)
      overlayCtx.restore()
    }
    cached.updatedAt = now
  }
  ctx.drawImage(cached.overlay, 0, 0)
}
