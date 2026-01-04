import { useEffect, useRef } from 'react'

interface UseSwipeGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
  minSwipeDistance?: number
  disabled?: boolean
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  threshold = 50,
  minSwipeDistance = 50,
  disabled = false,
}: UseSwipeGestureOptions) {
  const touchStartX = useRef<number>(0)
  const touchStartY = useRef<number>(0)
  const touchEndX = useRef<number>(0)
  const touchEndY = useRef<number>(0)
  const isSwipeFromEdge = useRef<boolean>(false)
  const touchMoveHandler = useRef<((e: TouchEvent) => void) | null>(null)

  useEffect(() => {
    if (disabled) return

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX
      touchStartY.current = e.touches[0].clientY
      
      // Check if touch started near the left edge
      isSwipeFromEdge.current = touchStartX.current < threshold
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartX.current) return
      
      touchEndX.current = e.touches[0].clientX
      touchEndY.current = e.touches[0].clientY
      
      const deltaX = touchEndX.current - touchStartX.current
      const deltaY = Math.abs(touchEndY.current - touchStartY.current)
      
      // If swiping from left edge to the right, prevent browser back navigation
      if (isSwipeFromEdge.current && deltaX > 0 && Math.abs(deltaX) > deltaY) {
        // Prevent default to stop browser back navigation
        e.preventDefault()
      }
      
      // If swiping left (right to left) from anywhere, prevent browser back navigation
      if (deltaX < -10 && Math.abs(deltaX) > deltaY) {
        // Prevent browser back navigation on left swipe
        e.preventDefault()
      }
    }

    const handleTouchEnd = () => {
      if (!touchStartX.current || !touchEndX.current) {
        // Reset
        touchStartX.current = 0
        touchStartY.current = 0
        touchEndX.current = 0
        touchEndY.current = 0
        isSwipeFromEdge.current = false
        return
      }

      const deltaX = touchStartX.current - touchEndX.current
      const deltaY = touchStartY.current - touchEndY.current
      const absDeltaX = Math.abs(deltaX)
      const absDeltaY = Math.abs(deltaY)

      // Only trigger if horizontal swipe is more dominant than vertical
      if (absDeltaX > absDeltaY && absDeltaX > minSwipeDistance) {
        // Swipe right (start is more left than end) - swipe from left to right
        if (deltaX < 0 && onSwipeRight) {
          // Check if swipe started near the left edge (within threshold)
          // This allows opening sidebar by swiping from left edge toward right
          if (isSwipeFromEdge.current) {
            onSwipeRight()
          }
        }
        // Swipe left (start is more right than end) - DISABLED to prevent browser back navigation
        // Only allow closing sidebar via overlay click or button
      }

      // Reset
      touchStartX.current = 0
      touchStartY.current = 0
      touchEndX.current = 0
      touchEndY.current = 0
      isSwipeFromEdge.current = false
    }

    // Store handler reference for cleanup
    touchMoveHandler.current = handleTouchMove

    // Use non-passive touchmove to allow preventDefault
    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      if (touchMoveHandler.current) {
        document.removeEventListener('touchmove', touchMoveHandler.current)
      }
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onSwipeLeft, onSwipeRight, threshold, minSwipeDistance, disabled])
}

