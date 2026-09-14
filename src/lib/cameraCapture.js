export function fitVideo(sw, sh, width, height) {
  const scale = Math.min(width / sw, height / sh)
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
// Read live cards so the recording follows answers, scores and rounds.
export function paintCameraFrame(canvas, video, stage, mirrored) {
  const ctx = canvas.getContext('2d'), { width, height } = canvas
  ctx.fillStyle = '#0c110f'; ctx.fillRect(0, 0, width, height)
  if (video.readyState >= 2 && video.videoWidth) {
    const fit = fitVideo(video.videoWidth, video.videoHeight, width, height)
    ctx.save()
    if (mirrored) { ctx.translate(width, 0); ctx.scale(-1, 1) }
    ctx.drawImage(video, fit.x, fit.y, fit.width, fit.height); ctx.restore()
  }
  const bounds = stage.getBoundingClientRect(), scale = width / bounds.width
  ctx.save(); ctx.scale(scale, scale)
  for (const node of stage.querySelectorAll('[data-capture]')) {
    const rect = node.getBoundingClientRect()
    if (!rect.width || !rect.height) continue
    const style = getComputedStyle(node), x = rect.left - bounds.left, y = rect.top - bounds.top
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, rect.width, rect.height); ctx.clip()
    ctx.fillStyle = node.dataset.captureColor || 'rgba(9,18,14,.88)'
    ctx.beginPath()
    if (ctx.roundRect) ctx.roundRect(x, y, rect.width, rect.height, 14)
    else ctx.rect(x, y, rect.width, rect.height)
    ctx.fill()
    const size = parseFloat(style.fontSize) || 15
    ctx.fillStyle = style.color; ctx.font = `${style.fontWeight} ${size}px system-ui, sans-serif`; ctx.textBaseline = 'top'
    wrapText(ctx, node.innerText, x + 12, y + 10, rect.width - 24, size * 1.4)
    ctx.restore()
  }
  ctx.restore()
}
