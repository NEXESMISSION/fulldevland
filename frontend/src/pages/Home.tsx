import { useNavigate } from 'react-router-dom'
import { 
  Map, 
  TrendingDown, 
  Building2, 
  Users, 
  ShoppingCart, 
  DollarSign, 
  Settings, 
  Shield, 
  ChevronLeft, 
  Receipt,
  CreditCard,
  CheckCircle2,
  MessageSquare,
  UserCog
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'

export function Home() {
  const navigate = useNavigate()
  const { profile, isReady, hasPermission, hasPageAccess } = useAuth()
  const { t } = useLanguage()

  // Get allowed_pages from profile
  const allowedPages = (profile as any)?.allowed_pages as string[] | null | undefined
  
  // Check if user has explicit allowed_pages configured (non-Owner with pages set)
  const hasExplicitPageAccess = profile?.role !== 'Owner' && 
    Array.isArray(allowedPages) && 
    allowedPages.length > 0
    
  // Don't render content until profile is fully loaded
  const shouldRenderContent = isReady && !!profile

  const allItems = [
    {
      title: t('nav.land'),
      icon: Map,
      color: 'bg-blue-500',
      route: '/land',
      permission: 'view_land',
      pageId: 'land',
    },
    {
      title: t('nav.clients'),
      icon: Users,
      color: 'bg-purple-500',
      route: '/clients',
      permission: 'view_clients',
      pageId: 'clients',
    },
    {
      title: t('nav.sales'),
      icon: ShoppingCart,
      color: 'bg-green-500',
      route: '/sales',
      permission: 'view_sales',
      pageId: 'sales',
    },
    {
      title: t('nav.confirmSales'),
      icon: CheckCircle2,
      color: 'bg-emerald-500',
      route: '/sale-confirmation',
      permission: 'edit_sales',
      pageId: 'confirm-sales',
    },
    {
      title: t('nav.installments'),
      icon: CreditCard,
      color: 'bg-indigo-500',
      route: '/installments',
      permission: 'view_installments',
      pageId: 'installments',
    },
    {
      title: t('nav.financial'),
      icon: DollarSign,
      color: 'bg-yellow-500',
      route: '/financial',
      permission: 'view_financial',
      pageId: 'finance',
    },
    {
      title: t('nav.expenses'),
      icon: Receipt,
      color: 'bg-rose-500',
      route: '/expenses',
      permission: 'view_financial',
      pageId: 'expenses',
    },
    {
      title: t('nav.debts'),
      icon: TrendingDown,
      color: 'bg-red-500',
      route: '/debts',
      permission: null,
      pageId: 'debts',
    },
    {
      title: t('nav.realEstate'),
      icon: Building2,
      color: 'bg-teal-500',
      route: '/real-estate-buildings',
      permission: null,
      pageId: 'real-estate',
    },
    {
      title: t('nav.messages'),
      icon: MessageSquare,
      color: 'bg-cyan-500',
      route: '/messages',
      permission: 'view_messages',
      pageId: 'messages',
    },
    {
      title: t('nav.users'),
      icon: Settings,
      color: 'bg-gray-500',
      route: '/users',
      permission: 'manage_users',
      pageId: 'users',
    },
    {
      title: t('nav.security'),
      icon: Shield,
      color: 'bg-orange-500',
      route: '/security',
      permission: 'view_audit_logs',
      pageId: 'security',
    },
  ]

  // Filter based on page access OR permission
  const filteredItems = allItems.filter(item => {
    if (hasExplicitPageAccess) {
      return hasPageAccess(item.pageId)
    } else {
      return !item.permission || hasPermission(item.permission)
    }
  })

  // Show loading skeleton
  if (!shouldRenderContent) {
    return (
      <div className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
            ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4">
      {/* Simple Grid of Navigation Items */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
        {filteredItems.map((item) => {
                  const Icon = item.icon
                  return (
            <button
                      key={item.route}
                      onClick={() => navigate(item.route)}
              className="flex items-center gap-3 p-3 sm:p-4 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all group text-right"
                    >
              <div className={`${item.color} p-2 sm:p-2.5 rounded-lg flex-shrink-0`}>
                <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                      </div>
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-sm sm:text-base text-gray-800 block truncate">
                  {item.title}
                </span>
              </div>
              <ChevronLeft className="h-4 w-4 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
            </button>
          )
        })}
      </div>
    </div>
  )
}
