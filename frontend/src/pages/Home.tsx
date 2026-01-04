import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Map, TrendingDown, Building2, Users, ShoppingCart, DollarSign, Settings, Shield } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

export function Home() {
  const navigate = useNavigate()
  const { profile, isReady, hasPermission, hasPageAccess } = useAuth()

  // Get allowed_pages from profile
  const allowedPages = (profile as any)?.allowed_pages as string[] | null | undefined
  
  // Check if user has explicit allowed_pages configured (non-Owner with pages set)
  const hasExplicitPageAccess = profile?.role !== 'Owner' && 
    Array.isArray(allowedPages) && 
    allowedPages.length > 0
    
  // Don't render content until profile is fully loaded
  const shouldRenderContent = isReady && !!profile

  const mainSystems = [
    {
      title: 'نظام الأراضي',
      description: 'إدارة قطع الأراضي والمبيعات والعملاء',
      icon: Map,
      color: 'blue',
      route: '/land',
      permission: 'view_land',
      pageId: 'land',
    },
    {
      title: 'التطوير والبناء',
      description: 'إدارة المشاريع العقارية والمباني',
      icon: Building2,
      color: 'teal',
      route: '/real-estate-buildings',
      permission: null,
      pageId: 'real-estate',
    },
    {
      title: 'الديون',
      description: 'تتبع الديون وإدارة سدادها',
      icon: TrendingDown,
      color: 'red',
      route: '/debts',
      permission: null,
      pageId: 'debts',
    },
  ]

  const quickAccess = [
    {
      title: 'العملاء',
      icon: Users,
      route: '/clients',
      permission: 'view_clients',
      color: 'purple',
      pageId: 'clients',
    },
    {
      title: 'المبيعات',
      icon: ShoppingCart,
      route: '/sales',
      permission: 'view_sales',
      color: 'green',
      pageId: 'sales',
    },
    {
      title: 'المالية',
      icon: DollarSign,
      route: '/financial',
      permission: 'view_financial',
      color: 'yellow',
      pageId: 'finance',
    },
    {
      title: 'المستخدمين',
      icon: Settings,
      route: '/users',
      permission: 'manage_users',
      color: 'gray',
      pageId: 'users',
    },
    {
      title: 'الأمان',
      icon: Shield,
      route: '/security',
      permission: 'view_audit_logs',
      color: 'orange',
      pageId: 'security',
    },
  ]

  const colorClasses = {
    blue: 'bg-blue-100 text-blue-600 hover:bg-blue-200',
    red: 'bg-red-100 text-red-600 hover:bg-red-200',
    purple: 'bg-purple-100 text-purple-600 hover:bg-purple-200',
    green: 'bg-green-100 text-green-600 hover:bg-green-200',
    yellow: 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200',
    gray: 'bg-gray-100 text-gray-600 hover:bg-gray-200',
    orange: 'bg-orange-100 text-orange-600 hover:bg-orange-200',
    teal: 'bg-teal-100 text-teal-600 hover:bg-teal-200',
  }

  // Filter based on page access OR permission (explicit page access overrides role permissions)
  const filteredMainSystems = mainSystems.filter(item => {
    if (hasExplicitPageAccess) {
      // Only check page access
      return hasPageAccess(item.pageId)
    } else {
      // Check role permission
      return !item.permission || hasPermission(item.permission)
    }
  })

  const filteredQuickAccess = quickAccess.filter(item => {
    if (hasExplicitPageAccess) {
      // Only check page access
      return hasPageAccess(item.pageId)
    } else {
      // Check role permission
      return !item.permission || hasPermission(item.permission)
    }
  })

  // Show loading skeleton while profile loads to prevent flash of unauthorized content
  if (!shouldRenderContent) {
    return (
      <div className="min-h-[calc(100vh-4rem)] p-3 sm:p-4 md:p-6 bg-gradient-to-br from-background via-background to-muted/20">
        <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
          <div className="text-center space-y-2 sm:space-y-4 mb-6 sm:mb-8 md:mb-12">
            <div className="h-8 sm:h-10 md:h-12 w-48 sm:w-56 md:w-64 bg-muted/50 rounded-lg mx-auto animate-pulse" />
            <div className="h-4 sm:h-5 md:h-6 w-64 sm:w-80 md:w-96 bg-muted/30 rounded mx-auto animate-pulse" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 sm:h-56 md:h-64 bg-muted/30 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] p-3 sm:p-4 md:p-6 bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
        {/* Header - Mobile Optimized */}
        <div className="text-center space-y-2 sm:space-y-4 mb-6 sm:mb-8 md:mb-12">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            نظام إدارة الأراضي
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-muted-foreground max-w-2xl mx-auto px-2">
            منصة شاملة لإدارة قطع الأراضي والمبيعات والعملاء والمالية
          </p>
        </div>

        {/* Main Systems - Mobile Optimized */}
        {filteredMainSystems.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6 mb-4 sm:mb-6 md:mb-8">
            {filteredMainSystems.map((system) => {
              const Icon = system.icon
              return (
                <Card 
                  key={system.route}
                  className="group hover:shadow-lg transition-all duration-300 border hover:border-primary/30 cursor-pointer overflow-hidden"
                  onClick={() => navigate(system.route)}
                >
                  <CardContent className="p-4 sm:p-6 md:p-8">
                    <div className="flex flex-col items-center justify-center gap-3 sm:gap-4 md:gap-6">
                      <div className={`${colorClasses[system.color as keyof typeof colorClasses]} p-4 sm:p-6 md:p-8 rounded-xl sm:rounded-2xl transition-transform group-hover:scale-105`}>
                        <Icon className="h-12 w-12 sm:h-16 sm:w-16 md:h-20 md:w-20" />
                      </div>
                      <div className="text-center space-y-1 sm:space-y-2">
                        <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold">{system.title}</h2>
                        <p className="text-xs sm:text-sm md:text-base text-muted-foreground">
                          {system.description}
                        </p>
                      </div>
                      <Button 
                        variant="default" 
                        size="sm"
                        className="mt-2 sm:mt-4 text-xs sm:text-sm px-4 sm:px-6"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(system.route)
                        }}
                      >
                        الدخول
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Quick Access - Mobile Optimized */}
        {filteredQuickAccess.length > 0 && (
          <Card className="border">
            <CardHeader className="p-3 sm:p-4 md:p-6">
              <CardTitle className="text-lg sm:text-xl md:text-2xl">الوصول السريع</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 md:p-6 pt-0">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 md:gap-4">
                {filteredQuickAccess.map((item) => {
                  const Icon = item.icon
                  return (
                    <Button
                      key={item.route}
                      variant="outline"
                      className="h-auto flex flex-col items-center justify-center gap-2 sm:gap-3 p-3 sm:p-4 md:p-6 hover:bg-accent transition-all"
                      onClick={() => navigate(item.route)}
                    >
                      <div className={`${colorClasses[item.color as keyof typeof colorClasses]} p-2 sm:p-3 md:p-4 rounded-full`}>
                        <Icon className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
                      </div>
                      <span className="font-medium text-xs sm:text-sm md:text-base">{item.title}</span>
                    </Button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  )
}
