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
      <div className="min-h-[calc(100vh-4rem)] p-6 bg-gradient-to-br from-background via-background to-muted/20">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="text-center space-y-4 mb-12">
            <div className="h-12 w-64 bg-muted/50 rounded-lg mx-auto animate-pulse" />
            <div className="h-6 w-96 bg-muted/30 rounded mx-auto animate-pulse" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 bg-muted/30 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] p-6 bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center space-y-4 mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            نظام إدارة الأراضي
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            منصة شاملة لإدارة قطع الأراضي والمبيعات والعملاء والمالية
          </p>
        </div>

        {/* Main Systems */}
        {filteredMainSystems.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {filteredMainSystems.map((system) => {
              const Icon = system.icon
              return (
                <Card 
                  key={system.route}
                  className="group hover:shadow-xl transition-all duration-300 border-2 hover:border-primary/50 cursor-pointer overflow-hidden"
                  onClick={() => navigate(system.route)}
                >
                  <CardContent className="p-8">
                    <div className="flex flex-col items-center justify-center gap-6">
                      <div className={`${colorClasses[system.color as keyof typeof colorClasses]} p-8 rounded-2xl transition-transform group-hover:scale-110`}>
                        <Icon className="h-20 w-20" />
                      </div>
                      <div className="text-center space-y-2">
                        <h2 className="text-3xl font-bold">{system.title}</h2>
                        <p className="text-muted-foreground text-base">
                          {system.description}
                        </p>
                      </div>
                      <Button 
                        variant="default" 
                        size="lg"
                        className="mt-4"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(system.route)
                        }}
                      >
                        الدخول إلى النظام
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Quick Access */}
        {filteredQuickAccess.length > 0 && (
          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-2xl">الوصول السريع</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {filteredQuickAccess.map((item) => {
                  const Icon = item.icon
                  return (
                    <Button
                      key={item.route}
                      variant="outline"
                      className="h-auto flex flex-col items-center justify-center gap-3 p-6 hover:bg-accent transition-all"
                      onClick={() => navigate(item.route)}
                    >
                      <div className={`${colorClasses[item.color as keyof typeof colorClasses]} p-4 rounded-full`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      <span className="font-medium">{item.title}</span>
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
