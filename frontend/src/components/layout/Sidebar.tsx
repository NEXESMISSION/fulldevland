import { NavLink } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Nav items with pageId for access control
// pageId must match the IDs used in Users.tsx ALL_PAGES and stored in allowed_pages
const navItems = [
  { to: '/land', icon: Map, label: 'إدارة الأراضي', permission: 'view_land', pageId: 'land' },
  { to: '/clients', icon: Users, label: 'العملاء', permission: 'view_clients', pageId: 'clients' },
  { to: '/sales', icon: ShoppingCart, label: 'السجل', permission: 'view_sales', pageId: 'sales' },
  { to: '/sale-confirmation', icon: CheckCircle2, label: 'تأكيد المبيعات', permission: 'edit_sales', pageId: 'confirm-sales' },
  { to: '/installments', icon: CreditCard, label: 'الأقساط', permission: 'view_installments', pageId: 'installments' },
  { to: '/financial', icon: DollarSign, label: 'المالية', permission: 'view_financial', pageId: 'finance' },
  { to: '/expenses', icon: Receipt, label: 'المصاريف', permission: 'view_financial', pageId: 'expenses' },
  { to: '/debts', icon: TrendingDown, label: 'الديون', permission: null, pageId: 'debts' },
  { to: '/real-estate-buildings', icon: Building2, label: 'التطوير والبناء', permission: null, pageId: 'real-estate' },
  { to: '/messages', icon: MessageSquare, label: 'الرسائل', permission: 'view_messages', pageId: 'messages' },
  { to: '/users', icon: Settings, label: 'المستخدمين', permission: 'manage_users', pageId: 'users' },
  { to: '/security', icon: Shield, label: 'الأمان', permission: 'view_audit_logs', pageId: 'security' },
]

interface SidebarProps {
  onClose?: () => void
}

export function Sidebar({ onClose }: SidebarProps) {
  const { profile, isReady, signOut, hasPermission, hasPageAccess } = useAuth()

  const handleNavClick = () => {
    if (onClose) {
      onClose()
    }
  }

  // Get allowed_pages from profile
  const allowedPages = (profile as any)?.allowed_pages as string[] | null | undefined
  
  // Get sidebar_order from profile
  const sidebarOrder = (profile as any)?.sidebar_order as string[] | null | undefined
  
  // Check if user has explicit allowed_pages configured (non-Owner with pages set)
  const hasExplicitPageAccess = profile?.role !== 'Owner' && 
    Array.isArray(allowedPages) && 
    allowedPages.length > 0

  // Don't render navigation items until profile is fully loaded
  // This prevents flash of unauthorized content
  const shouldRenderNav = isReady && !!profile

  // Filter and sort navigation items based on user's custom order
  const getOrderedNavItems = () => {
    // First, filter items based on permissions
    const filteredItems = navItems.filter((item) => {
      if (hasExplicitPageAccess) {
        // Only check page access (allowed_pages), ignore role permissions
        return hasPageAccess(item.pageId)
      } else {
        // No explicit page access configured - use role permissions
        if (item.permission && !hasPermission(item.permission)) return false
        return true
      }
    })

    // If user has custom sidebar order, sort items accordingly
    if (Array.isArray(sidebarOrder) && sidebarOrder.length > 0) {
      // Create a map for quick lookup
      const orderMap: Record<string, number> = {}
      sidebarOrder.forEach((pageId, index) => {
        orderMap[pageId] = index
      })

      // Sort items: items in custom order first (by their order), then items not in order
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
          // Both not in custom order, maintain original order
          return navItems.indexOf(a) - navItems.indexOf(b)
        }
      })
    }

    // No custom order, return filtered items in original order
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
          تسجيل الخروج
        </button>
      </div>
    </aside>
  )
}
