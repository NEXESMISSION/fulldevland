import { useLanguage } from '@/contexts/LanguageContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download as DownloadIcon, Smartphone, CheckCircle2 } from 'lucide-react'

export function Download() {
  const { t } = useLanguage()

  // TODO: Replace with actual APK download URL
  const apkDownloadUrl = 'https://your-domain.com/downloads/app.apk'
  const appVersion = '1.0.0'
  const lastUpdated = new Date().toLocaleDateString('ar-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const handleDownload = () => {
    // Open download link
    window.open(apkDownloadUrl, '_blank')
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Card className="shadow-lg">
        <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
          <div className="flex items-center gap-3">
            <Smartphone className="h-6 w-6 text-green-600" />
            <CardTitle className="text-2xl font-bold">تحميل التطبيق</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            {/* App Info */}
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg">
                <Smartphone className="h-12 w-12 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2">LandDev</h2>
                <p className="text-muted-foreground">تطبيق إدارة الأراضي والعقارات</p>
              </div>
            </div>

            {/* Version Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-blue-900">الإصدار:</span>
                  <span className="mr-2 text-blue-700">{appVersion}</span>
                </div>
                <div>
                  <span className="font-medium text-blue-900">آخر تحديث:</span>
                  <span className="mr-2 text-blue-700">{lastUpdated}</span>
                </div>
              </div>
            </div>

            {/* Download Button */}
            <div className="flex flex-col items-center gap-4">
              <Button
                onClick={handleDownload}
                size="lg"
                className="w-full sm:w-auto min-w-[200px] bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg"
              >
                <DownloadIcon className="h-5 w-5 ml-2" />
                تحميل APK للأندرويد
              </Button>
              <p className="text-xs text-muted-foreground text-center max-w-md">
                اضغط على الزر أعلاه لتحميل ملف APK للتطبيق على جهاز Android الخاص بك
              </p>
            </div>

            {/* Instructions */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-yellow-600" />
                تعليمات التثبيت
              </h3>
              <ol className="space-y-2 text-sm list-decimal list-inside text-muted-foreground">
                <li>قم بتحميل ملف APK من الزر أعلاه</li>
                <li>افتح إعدادات جهازك واسمح بتثبيت التطبيقات من مصادر غير معروفة</li>
                <li>افتح ملف APK الذي تم تحميله واضغط على "تثبيت"</li>
                <li>انتظر حتى يكتمل التثبيت ثم افتح التطبيق</li>
              </ol>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">المميزات</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• إدارة الأراضي والعقارات</li>
                  <li>• تتبع المبيعات والأقساط</li>
                  <li>• إدارة العملاء</li>
                  <li>• التقارير المالية</li>
                </ul>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">المتطلبات</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• Android 6.0 أو أحدث</li>
                  <li>• اتصال بالإنترنت</li>
                  <li>• حساب مستخدم نشط</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

