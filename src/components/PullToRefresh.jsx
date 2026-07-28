import { useEffect, useRef, useState } from 'react'

const REFRESH_DISTANCE = 104
const MIN_DRAG = 16

function isCoarsePointer() {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
}

function isInteractiveTarget(target) {
  return Boolean(
    target?.closest?.(
      'a, button, input, textarea, select, [contenteditable="true"], [role="button"], [role="tab"], .modal-overlay'
    )
  )
}

function hasScrollableParent(target) {
  let node = target?.parentElement

  while (node && node !== document.body && node !== document.documentElement) {
    const style = window.getComputedStyle(node)
    const canScroll = /(auto|scroll)/.test(style.overflowY)

    if (canScroll && node.scrollHeight > node.clientHeight + 2) {
      return true
    }

    node = node.parentElement
  }

  return false
}

function getPageEdge() {
  const scrollElement = document.scrollingElement || document.documentElement
  const scrollTop = window.scrollY || scrollElement.scrollTop || 0
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight
  const scrollHeight = Math.max(scrollElement.scrollHeight, document.body.scrollHeight)

  return {
    atTop: scrollTop <= 2,
    atBottom: Math.ceil(scrollTop + viewportHeight) >= scrollHeight - 2,
  }
}

export default function PullToRefresh() {
  const gestureRef = useRef(null)
  const [state, setState] = useState({
    active: false,
    ready: false,
    refreshing: false,
    direction: 'down',
    progress: 0,
  })

  useEffect(() => {
    if (!isCoarsePointer()) return undefined

    function resetGesture() {
      gestureRef.current = null
      setState((current) => ({
        ...current,
        active: false,
        ready: false,
        progress: 0,
      }))
    }

    function handleTouchStart(event) {
      if (event.touches.length !== 1) return
      if (isInteractiveTarget(event.target)) return
      if (hasScrollableParent(event.target)) return

      const edge = getPageEdge()

      if (!edge.atTop && !edge.atBottom) return

      const touch = event.touches[0]
      gestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        edge,
        direction: null,
      }
    }

    function handleTouchMove(event) {
      const gesture = gestureRef.current
      if (!gesture || event.touches.length !== 1) return

      const touch = event.touches[0]
      const deltaX = touch.clientX - gesture.startX
      const deltaY = touch.clientY - gesture.startY
      const absX = Math.abs(deltaX)
      const absY = Math.abs(deltaY)

      if (absX > absY) {
        resetGesture()
        return
      }

      const pullingDown = gesture.edge.atTop && deltaY > MIN_DRAG
      const pullingUp = gesture.edge.atBottom && deltaY < -MIN_DRAG

      if (!pullingDown && !pullingUp) return

      event.preventDefault()

      const direction = pullingUp ? 'up' : 'down'
      gesture.direction = direction

      const distance = Math.min(Math.abs(deltaY), REFRESH_DISTANCE)
      const progress = distance / REFRESH_DISTANCE

      setState({
        active: true,
        ready: progress >= 1,
        refreshing: false,
        direction,
        progress,
      })
    }

    function handleTouchEnd() {
      const gesture = gestureRef.current

      if (!gesture) return

      setState((current) => {
        if (current.ready) {
          window.setTimeout(() => {
            window.location.reload()
          }, 180)

          return {
            ...current,
            active: true,
            ready: true,
            refreshing: true,
            progress: 1,
          }
        }

        return {
          ...current,
          active: false,
          ready: false,
          progress: 0,
        }
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

  const label = state.refreshing
    ? 'Atualizando'
    : state.ready
      ? 'Solte para atualizar'
      : state.direction === 'up'
        ? 'Arraste para atualizar'
        : 'Puxe para atualizar'

  return (
    <div
      className={`pull-refresh ${state.active ? 'active' : ''} ${state.ready ? 'ready' : ''} ${
        state.refreshing ? 'refreshing' : ''
      } ${state.direction === 'up' ? 'from-bottom' : 'from-top'}`}
      style={{ '--pull-progress': state.progress }}
      aria-hidden="true"
    >
      <span className="pull-refresh-icon" />
      <span>{label}</span>
    </div>
  )
}
