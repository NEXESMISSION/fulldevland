import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Menu, X, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PullToRefresh } from './PullToRefresh'
import { useSwipeGesture } from '@/hooks/useSwipeGesture'
import { NotificationBell } from '@/components/ui/notification-bell'
import { useAuth } from '@/contexts/AuthContext'

function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { profile, hasPageAccess } = useAuth()
  
  // Check if we can go back (not on home page)
  const canGoBack = location.pathname !== '/'
  
  // Map pathname to pageId for access check
  const pathToPageId: Record<string, string> = {
    '/land': 'land',
    '/clients': 'clients',
    '/sales': 'sales',
    '/sale-confirmation': 'confirm-sales',
    '/installments': 'installments',
    '/financial': 'finance',
    '/expenses': 'expenses',
    '/debts': 'debts',
    '/real-estate-buildings': 'real-estate',
    '/messages': 'messages',
    '/users': 'users',
    '/security': 'security',
    '/workers': 'workers',
  }
  
  // Smart back navigation: for workers, only go back to accessible pages
  const handleGoBack = useCallback(() => {
    // For Real Estate Buildings page, use browser back (handles internal navigation)
    if (location.pathname === '/real-estate-buildings') {
      navigate(-1)
      return
    }
    
    // For workers, navigate to home instead of browser back
    // This prevents going to pages they don't have access to
    if (profile?.role === 'Worker') {
      const allowedPages = (profile as any)?.allowed_pages as string[] | null | undefined
      // If worker has explicit page restrictions, go to home
      if (Array.isArray(allowedPages) && allowedPages.length > 0) {
        navigate('/', { replace: true })
        return
      }
    }
    
    // Default: use browser back
    navigate(-1)
  }, [location.pathname, navigate, profile])

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
      {/* Mobile header buttons */}
      <div className="fixed top-0 left-0 right-0 z-50 md:hidden bg-white border-b shadow-sm">
        <div className="px-2 py-2 flex items-center gap-2">
        {/* Burger menu button */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setSidebarOpen(!sidebarOpen)}
            className="bg-white shrink-0 h-9 w-9 border-gray-200"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        
          {/* Spacer */}
          <div className="flex-1" />
          
          {/* Right side buttons */}
          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <div className="bg-white border border-gray-200 rounded-md">
              <NotificationBell />
            </div>
        
        {/* Go back button */}
        {canGoBack && (
          <Button
            variant="outline"
            size="icon"
            onClick={handleGoBack}
              className="bg-white shrink-0 h-9 w-9 border-gray-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
          </div>
        </div>
      </div>

      {/* Sidebar - hidden on mobile, shown when sidebarOpen is true */}
      <div className={`
        fixed md:sticky md:top-0 inset-y-0 left-0 z-[60] md:h-screen
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[55] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main className="flex-1 w-full md:ml-0 min-h-screen" style={{ overscrollBehaviorX: 'none', touchAction: 'pan-y' }}>
        <PullToRefresh onRefresh={handleRefresh} />
        <div className="container mx-auto p-3 sm:p-4 md:p-6 pb-6 sm:pb-8 pt-20 md:pt-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

export { MainLayout }
export default MainLayout
