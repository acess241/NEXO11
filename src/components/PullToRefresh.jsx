import { useEffect, useRef, useState } from 'react'

const REFRESH_DISTANCE = 104
const MIN_DRAG = 16
const REFRESH_DELAY_MS = 650

function isCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
}

function isInteractiveTarget(target) {
  return Boolean(target?.closest?.(
    'a, button, input, textarea, select, [contenteditable="true"], [role="button"], [role="tab"], .modal-overlay'
  ))
}

function hasScrollableParent(target) {
  let node = target?.parentElement
  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node)
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 2) return true
    node = node.parentElement
  }
  return false
}

function pageIsAtTop() {
  const scrollElement = document.scrollingElement || document.documentElement
  return (window.scrollY || scrollElement.scrollTop || 0) <= 2
}

export default function PullToRefresh() {
  const gestureRef = useRef(null)
  const [state, setState] = useState({ active: false, ready: false, refreshing: false, progress: 0 })

  useEffect(() => {
    if (!isCoarsePointer()) return undefined

    function resetGesture() {
      gestureRef.current = null
      setState((current) => ({ ...current, active: false, ready: false, progress: 0 }))
    }

    function handleTouchStart(event) {
      if (event.target?.closest?.('.nexo-camera')) return
      if (event.touches.length !== 1 || isInteractiveTarget(event.target)) return
      if (hasScrollableParent(event.target) || !pageIsAtTop()) return
      const touch = event.touches[0]
      gestureRef.current = { startX: touch.clientX, startY: touch.clientY }
    }

    function handleTouchMove(event) {
      const gesture = gestureRef.current
      if (!gesture || event.touches.length !== 1) return
      const touch = event.touches[0]
      const deltaX = touch.clientX - gesture.startX
      const deltaY = touch.clientY - gesture.startY
      if (Math.abs(deltaX) > Math.abs(deltaY)) { resetGesture(); return }
      if (deltaY < -MIN_DRAG) { resetGesture(); return }
      if (!pageIsAtTop() || deltaY <= MIN_DRAG) return
      event.preventDefault()
      const progress = Math.min(deltaY, REFRESH_DISTANCE) / REFRESH_DISTANCE
      setState({ active: true, ready: progress >= 1, refreshing: false, progress })
    }

    function handleTouchEnd() {
      if (!gestureRef.current) return
      setState((current) => {
        if (!current.ready) return { ...current, active: false, ready: false, progress: 0 }
        window.setTimeout(() => window.location.reload(), REFRESH_DELAY_MS)
        return { ...current, active: true, ready: true, refreshing: true, progress: 1 }
      })
      gestureRef.current = null
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })
    window.addEventListener('touchcancel', resetGesture, { passive: true })
    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', resetGesture)
    }
  }, [])

  const label = state.refreshing ? 'Atualizando' : state.ready ? 'Solte para atualizar' : 'Puxe para atualizar'
  return (
    <div
      className={'pull-refresh ' + (state.active ? 'active ' : '') + (state.ready ? 'ready ' : '') + (state.refreshing ? 'refreshing' : '')}
      style={{ '--pull-progress': state.progress }}
      aria-hidden="true"
    >
      <span className="pull-refresh-icon" />
      <span>{label}</span>
    </div>
  )
}
