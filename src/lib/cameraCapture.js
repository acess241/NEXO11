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
  return { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2500000 }
}
function wrapText(ctx, value, x, y, width, lineHeight) {
  let line = ''
  for (const word of value.split(/\s+/)) {
    const next = `${line} ${word}`.trim()
    if (line && ctx.measureText(next).width > width) { ctx.fillText(line, x, y); line = word; y += lineHeight }
    else line = next
  }
  if (line) ctx.fillText(line, x, y)
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
function drawTextBlock(ctx, lines, x, y, width, options = {}) {
  ctx.textAlign = options.align || 'left'
  ctx.textBaseline = 'top'
  let top = y
  for (const line of lines.filter(Boolean)) {
    ctx.font = `${line.weight || options.weight || 700} ${line.size || options.size || 16}px system-ui, sans-serif`
    ctx.fillStyle = line.color || options.color || '#fff'
    const tx = options.align === 'center' ? x + width / 2 : x
    wrapText(ctx, String(line.text || line), tx, top, width, (line.size || options.size || 16) * 1.32)
    top += (line.size || options.size || 16) * 1.45
  }
  ctx.textAlign = 'left'
}
function nodeLines(node) {
  return (node.innerText || '').split('\n').map(item => item.trim()).filter(Boolean)
}
// Read live cards so the recording follows answers, scores and rounds.
export function paintCameraFrame(canvas, video, stage, mirrored) {
  const ctx = canvas.getContext('2d'), { width, height } = canvas
  ctx.fillStyle = '#0c110f'; ctx.fillRect(0, 0, width, height)
  if (video.readyState >= 2 && video.videoWidth) {
    const cover = coverVideo(video.videoWidth, video.videoHeight, width, height)
    const fit = fitVideo(video.videoWidth, video.videoHeight, width, height)
    ctx.save()
    ctx.filter = 'blur(30px) brightness(.48)'
    drawVideo(ctx, video, cover, mirrored)
    ctx.restore()
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, width, height)
    drawVideo(ctx, video, fit, mirrored)
  }
  const bounds = stage.getBoundingClientRect(), scale = width / bounds.width
  ctx.save(); ctx.scale(scale, scale)
  for (const node of stage.querySelectorAll('[data-capture]')) {
    const rect = node.getBoundingClientRect()
    if (!rect.width || !rect.height) continue
    const style = getComputedStyle(node), x = rect.left - bounds.left, y = rect.top - bounds.top
    const lines = nodeLines(node)
    ctx.save()
    roundRect(ctx, x, y, rect.width, rect.height, node.classList.contains('nc-game-head') ? 18 : 14)
    ctx.clip()
    ctx.fillStyle = node.dataset.captureColor || (node.classList.contains('nc-answer') ? 'rgba(13,27,22,.94)' : 'rgba(9,18,14,.90)')
    roundRect(ctx, x, y, rect.width, rect.height, node.classList.contains('nc-game-head') ? 18 : 14)
    ctx.fill()
    if (node.classList.contains('nc-answer')) {
      ctx.fillStyle = 'rgba(255,255,255,.12)'
      roundRect(ctx, x + 10, y + rect.height / 2 - 11, 22, 22, 7)
      ctx.fill()
      drawTextBlock(ctx, [{ text: lines[0] || '', size: 11, weight: 800, color: '#d7e4dc' }], x + 10, y + rect.height / 2 - 8, 22, { align: 'center' })
      drawTextBlock(ctx, [{ text: lines.slice(1).join(' ') || lines[0] || '', size: Math.min(18, parseFloat(style.fontSize) || 15), weight: 850, color: '#fff' }], x + 38, y + rect.height / 2 - 10, rect.width - 48)
      ctx.restore(); continue
    }
    if (node.classList.contains('nc-question')) {
      drawTextBlock(ctx, [
        { text: lines[0] || '', size: 10, weight: 900, color: style.color || '#adff74' },
        { text: lines.slice(1).join(' ') || '', size: Math.min(28, Math.max(18, parseFloat(style.fontSize) || 22)), weight: 850, color: '#fff' },
      ], x + 12, y + 9, rect.width - 24, { align: 'center' })
      ctx.restore(); continue
    }
    if (node.classList.contains('nc-game-head')) {
      drawTextBlock(ctx, [{ text: lines.join('  '), size: 12, weight: 850, color: '#e6f0ea' }], x + 10, y + 7, rect.width - 20, { align: 'center' })
      ctx.restore(); continue
    }
    const size = parseFloat(style.fontSize) || 15
    ctx.fillStyle = style.color; ctx.font = `${style.fontWeight} ${size}px system-ui, sans-serif`; ctx.textBaseline = 'top'
    wrapText(ctx, node.innerText, x + 12, y + 10, rect.width - 24, size * 1.4)
    ctx.restore()
  }
  ctx.restore()
}
