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
  { to: '/', icon: LayoutDashboard, label: 'الرئيسية', permission: null, pageId: 'home' },
  { to: '/land', icon: Map, label: 'إدارة الأراضي', permission: 'view_land', pageId: 'land' },
  { to: '/availability', icon: MapPin, label: 'توفر الأراضي', permission: 'view_land', pageId: 'availability' },
  { to: '/clients', icon: Users, label: 'العملاء', permission: 'view_clients', pageId: 'clients' },
  { to: '/sales', icon: ShoppingCart, label: 'المبيعات', permission: 'view_sales', pageId: 'sales' },
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
  
  // Check if user has explicit allowed_pages configured (non-Owner with pages set)
  const hasExplicitPageAccess = profile?.role !== 'Owner' && 
    Array.isArray(allowedPages) && 
    allowedPages.length > 0

  // Don't render navigation items until profile is fully loaded
  // This prevents flash of unauthorized content
  const shouldRenderNav = isReady && !!profile

  return (
    <aside className="flex h-screen w-64 flex-col border-l bg-card shadow-lg md:shadow-none">
      <div className="flex h-16 items-center justify-between border-b px-4 md:px-6">
        <h1 className="text-xl font-bold text-primary">نظام الأراضي</h1>
        {/* Desktop notification bell in sidebar header */}
        <div className="hidden md:block">
          <NotificationBell />
        </div>
      </div>

      <nav className="flex-1 space-y-1 p-4">
        {!shouldRenderNav ? (
          // Show loading skeleton while profile loads
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-10 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : navItems.map((item) => {
          // If user has explicit page access configured, use that as primary control
          // This allows Owners to give page access that overrides role restrictions
          if (hasExplicitPageAccess) {
            // Only check page access (allowed_pages), ignore role permissions
            if (!hasPageAccess(item.pageId)) return null
          } else {
            // No explicit page access configured - use role permissions
          if (item.permission && !hasPermission(item.permission)) return null
          }

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

      <div className="border-t p-4">
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
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-5 w-5" />
          تسجيل الخروج
        </button>
      </div>
    </aside>
  )
}
