import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react'

export function AccountDisabled() {
  const { signOut, profile } = useAuth()

  const handleLogout = async () => {
    await signOut()
    window.location.href = '/login'
  }

  const handleRefresh = () => {
    window.location.reload()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-2 border-red-200 shadow-xl">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="h-10 w-10 text-red-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-red-800">
            الحساب معطل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center space-y-2">
            <p className="text-gray-700 text-lg">
              عذراً، حسابك معطل حالياً
            </p>
            <p className="text-gray-500 text-sm">
              تم تعطيل الوصول إلى حسابك من قبل المسؤول. 
              إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع الإدارة.
            </p>
          </div>

          {profile && (
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-600">الحساب:</p>
              <p className="font-medium text-gray-900">{profile.email}</p>
              <p className="text-xs text-gray-500 mt-1">
                {profile.name}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <Button 
              onClick={handleRefresh}
              variant="outline" 
              className="w-full"
            >
              <RefreshCw className="h-4 w-4 ml-2" />
              تحديث الصفحة
            </Button>
            
            <Button 
              onClick={handleLogout}
              variant="destructive" 
              className="w-full"
            >
              <LogOut className="h-4 w-4 ml-2" />
              تسجيل الخروج
            </Button>
          </div>

          <p className="text-center text-xs text-gray-400">
            للتواصل مع الدعم، يرجى الاتصال بالمسؤول
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

