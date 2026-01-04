import { useEffect, useRef } from 'react'

/**
 * Hook to automatically refresh data after a period of inactivity
 * Prevents stale data when users return to the app after some time
 */
export function useStaleDataRefresh(
  refreshCallback: () => void | Promise<void>,
  staleTimeoutMs: number = 5 * 60 * 1000, // 5 minutes default
  enabled: boolean = true
) {
  const lastActiveRef = useRef<number>(Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return

    // Update last active time on user interaction
    const updateActivity = () => {
      lastActiveRef.current = Date.now()
    }

    // Listen for user activity
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart']
    events.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true })
    })

    // Check periodically if data is stale
    const checkStale = () => {
      const timeSinceActive = Date.now() - lastActiveRef.current
      if (timeSinceActive >= staleTimeoutMs) {
        // Data is stale, refresh it
        refreshCallback()
        lastActiveRef.current = Date.now() // Reset after refresh
      }
    }

    // Check every minute
    intervalRef.current = setInterval(checkStale, 60 * 1000)

    // Initial check after timeout
    timeoutRef.current = setTimeout(() => {
      checkStale()
    }, staleTimeoutMs)

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, updateActivity)
      })
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [refreshCallback, staleTimeoutMs, enabled])
}

