import { NavLink } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { NotificationBell } from '@/components/ui/notification-bell'
import {
  LayoutDashboard,
  Map,
  MapPin,
  Users,
  ShoppingCart,
  CreditCard,
  DollarSign,
  Settings,
  Shield,
  LogOut,
  TrendingDown,
  CheckCircle2,
  Settings2,
  Receipt,
  Building2,
  MessageSquare,
  Languages,
  Calendar as CalendarIcon,
  Briefcase,
  Phone,
  Download as DownloadIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Select } from '@/components/ui/select'

// Nav items with pageId for access control
// pageId must match the IDs used in Users.tsx ALL_PAGES and stored in allowed_pages
// Labels will be translated using useLanguage hook
const getNavItems = (t: (key: string) => string) => [
  { to: '/', icon: LayoutDashboard, label: t('nav.home'), permission: null, pageId: 'home' },
  { to: '/land', icon: Map, label: t('nav.land'), permission: 'view_land', pageId: 'land' },
  { to: '/clients', icon: Users, label: t('nav.clients'), permission: 'view_clients', pageId: 'clients' },
  { to: '/sales', icon: ShoppingCart, label: t('nav.sales'), permission: 'view_sales', pageId: 'sales' },
  { to: '/sale-confirmation', icon: CheckCircle2, label: t('nav.confirmSales'), permission: 'edit_sales', pageId: 'confirm-sales' },
  { to: '/calendar', icon: CalendarIcon, label: t('nav.calendar'), permission: 'edit_sales', pageId: 'calendar' },
  { to: '/phone-calls', icon: Phone, label: t('nav.phoneCalls'), permission: null, pageId: 'phone-calls' },
  { to: '/download', icon: DownloadIcon, label: t('nav.download'), permission: null, pageId: 'download' },
  { to: '/installments', icon: CreditCard, label: t('nav.installments'), permission: 'view_installments', pageId: 'installments' },
  { to: '/financial', icon: DollarSign, label: t('nav.financial'), permission: 'view_financial', pageId: 'finance' },
  { to: '/expenses', icon: Receipt, label: t('nav.expenses'), permission: 'view_financial', pageId: 'expenses' },
  { to: '/debts', icon: TrendingDown, label: t('nav.debts'), permission: null, pageId: 'debts' },
  { to: '/real-estate-buildings', icon: Building2, label: t('nav.realEstate'), permission: null, pageId: 'real-estate' },
  { to: '/workers', icon: Briefcase, label: t('nav.workers'), permission: 'view_workers', pageId: 'workers' },
  { to: '/messages', icon: MessageSquare, label: t('nav.messages'), permission: 'view_messages', pageId: 'messages' },
  { to: '/users', icon: Settings, label: t('nav.users'), permission: 'manage_users', pageId: 'users' },
  { to: '/security', icon: Shield, label: t('nav.security'), permission: 'view_audit_logs', pageId: 'security' },
]

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const { profile, isReady, signOut, hasPermission, hasPageAccess } = useAuth()
  const { language, setLanguage, t } = useLanguage()

  const handleNavClick = () => {
    if (onClose) {
      onClose()
    }
  }

  // Get allowed_pages from profile
  const allowedPages = (profile as any)?.allowed_pages as string[] | null | undefined
  
  // Get page_order (for Owner) or sidebar_order (for Worker) from profile
  const pageOrder = (profile as any)?.page_order as string[] | null | undefined
  const sidebarOrder = (profile as any)?.sidebar_order as string[] | null | undefined
  
  // For Owner, use page_order; for Worker, use sidebar_order
  const customOrder = profile?.role === 'Owner' ? pageOrder : sidebarOrder
  
  // Check if user has explicit allowed_pages configured (non-Owner with pages set)
  const hasExplicitPageAccess = profile?.role !== 'Owner' && 
    Array.isArray(allowedPages) && 
    allowedPages.length > 0

  // Don't render navigation items until profile is fully loaded
  // This prevents flash of unauthorized content
  const shouldRenderNav = isReady && !!profile

  // Get nav items with translations
  const navItems = getNavItems(t)

  // Filter and sort navigation items based on user's custom order
  const getOrderedNavItems = () => {
    // For both Owner and Worker: use page_order to control which pages are shown and their order
    let filteredItems: typeof navItems = []
    
    if (profile?.role === 'Owner') {
      // Owner: if page_order exists, only show pages in page_order, otherwise show all pages
      if (Array.isArray(pageOrder) && pageOrder.length > 0) {
        // Only show pages that are in page_order
        filteredItems = navItems.filter(item => pageOrder.includes(item.pageId))
      } else {
        // No page_order set, show all pages with permissions
        filteredItems = navItems.filter((item) => {
          if (item.permission && !hasPermission(item.permission)) return false
          return true
        })
      }
    } else {
      // Worker: only show pages in allowed_pages (which should match page_order)
      if (Array.isArray(allowedPages) && allowedPages.length > 0) {
        // Use allowed_pages to filter (should match page_order)
        filteredItems = navItems.filter(item => allowedPages.includes(item.pageId))
      } else if (Array.isArray(pageOrder) && pageOrder.length > 0) {
        // Fallback to page_order if allowed_pages is not set
        filteredItems = navItems.filter(item => pageOrder.includes(item.pageId))
      } else {
        // No explicit page access configured - use role permissions
        filteredItems = navItems.filter((item) => {
          if (item.permission && !hasPermission(item.permission)) return false
          return true
        })
      }
    }

    // Sort items based on page_order (for both Owner and Worker)
    // Use page_order if available, otherwise use allowed_pages order
    const orderSource = Array.isArray(pageOrder) && pageOrder.length > 0 
      ? pageOrder 
      : (Array.isArray(allowedPages) && allowedPages.length > 0 ? allowedPages : null)
    
    if (orderSource) {
      // Create a map for quick lookup
      const orderMap: Record<string, number> = {}
      orderSource.forEach((pageId, index) => {
        orderMap[pageId] = index
      })

      // Sort items: items in order first (by their order), then items not in order
      return filteredItems.sort((a, b) => {
        const aOrder = orderMap[a.pageId] !== undefined ? orderMap[a.pageId] : Infinity
        const bOrder = orderMap[b.pageId] !== undefined ? orderMap[b.pageId] : Infinity
        
        if (aOrder !== Infinity && bOrder !== Infinity) {
          return aOrder - bOrder
        } else if (aOrder !== Infinity) {
          return -1 // a comes first
        } else if (bOrder !== Infinity) {
          return 1 // b comes first
        } else {
          // Both not in order, maintain original order
          const currentNavItems = getNavItems(t)
          return currentNavItems.findIndex(item => item.pageId === a.pageId) - currentNavItems.findIndex(item => item.pageId === b.pageId)
        }
      })
    }

    // No order specified, return filtered items in original order
    return filteredItems
  }

  const orderedNavItems = shouldRenderNav ? getOrderedNavItems() : []

  return (
    <aside className="flex h-screen w-64 flex-col border-l bg-card shadow-lg md:shadow-none overflow-hidden">
      <div className="flex h-16 items-center justify-end border-b px-4 md:px-6 shrink-0">
        {/* Desktop notification bell in sidebar header */}
        <div className="hidden md:block">
          <NotificationBell />
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4 overflow-y-auto min-h-0">
        {!shouldRenderNav ? (
          // Show loading skeleton while profile loads
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : orderedNavItems.map((item) => {
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={handleNavClick}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="border-t p-4 shrink-0 bg-card">
        {/* Language Selector */}
        <div className="mb-3 px-3">
          <label className="text-xs text-muted-foreground mb-2 block">{t('common.language')}</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLanguage('ar')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                language === 'ar'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Languages className="h-3.5 w-3.5" />
              {t('common.arabic')}
            </button>
            <button
              onClick={() => setLanguage('fr')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                language === 'fr'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Languages className="h-3.5 w-3.5" />
              {t('common.french')}
            </button>
          </div>
        </div>
        
        <div className="mb-3 px-3">
          <p className="text-sm font-medium">{profile?.name}</p>
          <p className="text-xs text-muted-foreground">
            {String(profile?.role) === 'owner' ? 'مالك' : 
             String(profile?.role) === 'manager' ? 'مدير' : 
             String(profile?.role) === 'field_staff' ? 'موظف ميداني' : profile?.role}
          </p>
        </div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-5 w-5" />
          {t('common.logout')}
        </button>
      </div>
    </aside>
  )
}
