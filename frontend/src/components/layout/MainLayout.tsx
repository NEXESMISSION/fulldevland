import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PullToRefresh } from './PullToRefresh'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Pull to refresh handler - reload the page
  const handleRefresh = useCallback(async () => {
    window.location.reload()
  }, [])

  // Swipe gesture: swipe right from left edge to open sidebar only
  // Disabled swipe left to prevent browser back navigation interference
  useSwipeGesture({
    onSwipeRight: () => {
      // Swipe right (from left edge toward right) to open sidebar on mobile
      // Only when sidebar is closed - prevents interference with browser navigation
      if (window.innerWidth < 768 && !sidebarOpen) {
        setSidebarOpen(true)
      }
    },
    // Removed onSwipeLeft to prevent browser back navigation
    threshold: 100, // Start swipe detection within 100px of left edge
    minSwipeDistance: 80, // Minimum swipe distance to trigger (increased to reduce false triggers)
    disabled: false,
  })

  // Scroll to top on route change - ensure it works reliably
  useEffect(() => {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      // Scroll window to top
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      
      // Also scroll document element (for mobile browsers)
      if (document.documentElement) {
        document.documentElement.scrollTop = 0
      }
      
      // Scroll body element
      if (document.body) {
        document.body.scrollTop = 0
      }
      
      // Scroll main container if it exists
      const mainElement = document.querySelector('main')
      if (mainElement) {
        mainElement.scrollTop = 0
      }
    })
  }, [location.pathname])

  return (
    <div className="flex min-h-screen bg-background" style={{ overscrollBehaviorX: 'none', touchAction: 'pan-y' }}>
      {/* Mobile burger menu button */}
      <div className="fixed top-4 left-4 z-50 md:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="bg-background"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Sidebar - hidden on mobile, shown when sidebarOpen is true */}
      <div className={`
        fixed md:sticky md:top-0 inset-y-0 left-0 z-40 md:h-screen
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex-1 w-full md:ml-0 min-h-screen" style={{ overscrollBehaviorX: 'none', touchAction: 'pan-y' }}>
        <PullToRefresh onRefresh={handleRefresh} />
        <div className="container mx-auto p-3 sm:p-4 md:p-6 pb-6 sm:pb-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
