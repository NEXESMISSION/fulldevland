import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { MainLayout } from '@/components/layout/MainLayout'
import { Login } from '@/pages/Login'
import { LandManagement } from '@/pages/LandManagement'
import { Clients } from '@/pages/Clients'
import { SalesNew as Sales } from '@/pages/SalesNew'
import { SaleConfirmation } from '@/pages/SaleConfirmation'
import { SaleManagement } from '@/pages/SaleManagement'
import { Installments } from '@/pages/Installments'
import { Financial } from '@/pages/FinancialNew'
import { Users } from '@/pages/Users'
import { UserPermissions } from '@/pages/UserPermissions'
import { Security } from '@/pages/Security'
import { Home } from '@/pages/Home'
import { Debts } from '@/pages/Debts'
import { Expenses } from '@/pages/Expenses'
import { RealEstateBuildings } from '@/pages/RealEstateBuildings'
import { Workers } from '@/pages/Workers'
import { Messages } from '@/pages/Messages'
import { Calendar } from '@/pages/Calendar'
import { PhoneCalls } from '@/pages/PhoneCalls'
import { Download } from '@/pages/Download'
import { AccountDisabled } from '@/pages/AccountDisabled'
import { LoadingProgress } from '@/components/ui/loading-progress'
import { NotificationContainer } from '@/components/ui/notification'

function AppRoutes() {
  const { user, profile, loading, profileLoading, isReady, hasPermission, hasPageAccess } = useAuth()

  function ProtectedRoute({ children }: { children: React.ReactNode }) {
    // Wait for BOTH auth and profile to be ready before rendering anything
    // This prevents the "flash of unauthorized content" security issue
    if (loading || profileLoading || !isReady) {
      return (
        <div className="flex h-screen items-center justify-center bg-background">
          <LoadingProgress message="جاري تحميل بيانات المستخدم..." />
        </div>
      )
    }

    if (!user) {
      return <Navigate to="/login" replace />
    }

    // User exists but profile not loaded - show loading
    if (!profile) {
      return (
        <div className="flex h-screen items-center justify-center bg-background">
          <LoadingProgress message="جاري تحميل الصلاحيات..." />
        </div>
      )
    }

    // Status check removed - users are always active
    return <>{children}</>
  }

  function PublicRoute({ children }: { children: React.ReactNode }) {
    if (loading) {
      return (
        <div className="flex h-screen items-center justify-center">
          <LoadingProgress message="جاري التحميل..." />
        </div>
      )
    }

    if (user) {
      return <Navigate to="/" replace />
    }

    return <>{children}</>
  }

  // Combined route protection: checks page access OR permission
  // If user has explicit allowed_pages, that takes priority over role permissions
  function PermissionProtectedRoute({ 
    children, 
    permission,
    pageId
  }: { 
    children: React.ReactNode
    permission: string | null 
    pageId?: string
  }) {
    if (loading) {
      return (
        <div className="flex h-screen items-center justify-center">
          <LoadingProgress message="جاري التحميل..." />
        </div>
      )
    }

    // Get allowed_pages from profile
    const allowedPages = (profile as any)?.allowed_pages as string[] | null | undefined
    
    // Check if user has explicit allowed_pages configured (non-Owner with pages set)
    const hasExplicitPageAccess = profile?.role !== 'Owner' && 
      Array.isArray(allowedPages) && 
      allowedPages.length > 0

    if (hasExplicitPageAccess) {
      // User has explicit page access configured - use that as primary control
      if (pageId && !hasPageAccess(pageId)) {
        return (
          <div className="flex h-screen items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2">غير مصرح</h2>
              <p className="text-muted-foreground">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
              <p className="text-sm text-muted-foreground mt-2">يرجى التواصل مع المسؤول لإضافة هذه الصفحة إلى صلاحياتك</p>
            </div>
          </div>
        )
      }
    } else {
      // No explicit page access - use role permissions
      if (permission && !hasPermission(permission)) {
      return (
        <div className="flex h-screen items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-2">غير مصرح</h2>
            <p className="text-muted-foreground">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
          </div>
        </div>
      )
      }
    }

    return <>{children}</>
  }
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/account-disabled"
        element={
          // Only show to logged-in inactive users
          false ? (
            <AccountDisabled />
          ) : user ? (
            <Navigate to="/" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Home />} />
        <Route 
          path="land" 
          element={
            <PermissionProtectedRoute permission="view_land" pageId="land">
              <LandManagement />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="clients" 
          element={
            <PermissionProtectedRoute permission="view_clients" pageId="clients">
              <Clients />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="sales" 
          element={
            <PermissionProtectedRoute permission="view_sales" pageId="sales">
              <Sales />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="sale-confirmation" 
          element={
            <PermissionProtectedRoute permission="edit_sales" pageId="confirm-sales">
              <SaleConfirmation />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="sale-management" 
          element={
            <PermissionProtectedRoute permission="edit_sales" pageId="sale-management">
              <SaleManagement />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="installments" 
          element={
            <PermissionProtectedRoute permission="view_installments" pageId="installments">
              <Installments />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="financial" 
          element={
            <PermissionProtectedRoute permission="view_financial" pageId="finance">
              <Financial />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="expenses" 
          element={
            <PermissionProtectedRoute permission="view_financial" pageId="expenses">
              <Expenses />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="users" 
          element={
            <PermissionProtectedRoute permission="manage_users" pageId="users">
              <Users />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="permissions" 
          element={
            <PermissionProtectedRoute permission="manage_users" pageId="users">
              <UserPermissions />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="security" 
          element={
            <PermissionProtectedRoute permission="view_audit_logs" pageId="security">
              <Security />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="debts" 
          element={
            <PermissionProtectedRoute permission={null} pageId="debts">
              <Debts />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="real-estate-buildings" 
          element={
            <PermissionProtectedRoute permission={null} pageId="real-estate">
              <RealEstateBuildings />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="workers" 
          element={
            <PermissionProtectedRoute permission="view_workers" pageId="workers">
              <Workers />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="messages" 
          element={
            <PermissionProtectedRoute permission="view_messages" pageId="messages">
              <Messages />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="calendar" 
          element={
            <PermissionProtectedRoute permission="edit_sales" pageId="calendar">
              <Calendar />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="phone-calls" 
          element={
            <PermissionProtectedRoute permission={null} pageId="phone-calls">
              <PhoneCalls />
            </PermissionProtectedRoute>
          } 
        />
        <Route 
          path="download" 
          element={
            <PermissionProtectedRoute permission={null} pageId="download">
              <Download />
            </PermissionProtectedRoute>
          } 
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
      <AuthProvider>
        <NotificationContainer />
        <AppRoutes />
      </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  )
}

export default App
