import { useState } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download as DownloadIcon, Smartphone, CheckCircle2, Loader2, AlertCircle } from 'lucide-react'
import { showNotification } from '@/components/ui/notification'

export function Download() {
  const { t } = useLanguage()
  const [downloading, setDownloading] = useState(false)

  // APK file path in Supabase Storage or public URL
  // Option 1: From Supabase Storage (bucket: 'app-downloads', file: 'app.apk')
  // Option 2: Direct URL from public folder or CDN
  const apkStoragePath = 'app-downloads/app.apk'
  const apkDirectUrl = '/app.apk' // If APK is in public folder
  const appVersion = '1.0.0'
  const lastUpdated = new Date().toLocaleDateString('ar-TN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  const handleDownload = async () => {
    setDownloading(true)
    
    try {
      let blob: Blob | null = null
      let fileName = 'LandDev.apk'

      // Try method 1: Download from Supabase Storage
      try {
        const { data, error } = await supabase.storage
          .from('app-downloads')
          .download('app.apk')

        if (!error && data && data.size > 0) {
          blob = data
        } else if (error) {
          console.log('Supabase Storage error:', error.message)
          // Don't throw, try other methods
        }
      } catch (storageError: any) {
        console.log('Supabase Storage download failed:', storageError?.message || 'Unknown error')
        // Continue to try other methods
      }

      // Try method 2: Direct download from public folder
      if (!blob) {
        try {
          const response = await fetch(apkDirectUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/vnd.android.package-archive, application/octet-stream, */*'
            }
          })
          
          if (response.ok) {
            const contentType = response.headers.get('content-type')
            // Check if response is actually APK, not HTML
            if (contentType && (contentType.includes('octet-stream') || contentType.includes('package-archive'))) {
              blob = await response.blob()
            } else {
              // If HTML, try to get from Supabase public URL
              throw new Error('Response is not APK file')
            }
          }
        } catch (fetchError) {
          console.log('Direct URL fetch failed')
        }
      }

      // Try method 3: Get public URL from Supabase Storage and download (without image transform)
      if (!blob) {
        try {
          const { data: urlData } = supabase.storage
            .from('app-downloads')
            .getPublicUrl('app.apk')

          if (urlData?.publicUrl) {
            const response = await fetch(urlData.publicUrl, {
              method: 'GET',
              headers: {
                'Accept': 'application/vnd.android.package-archive, application/octet-stream, */*'
              }
            })
            
            if (response.ok) {
              const contentType = response.headers.get('content-type')
              // Check if response is actually APK (not HTML error page)
              if (contentType && (contentType.includes('octet-stream') || contentType.includes('package-archive') || contentType.includes('application'))) {
                const responseBlob = await response.blob()
                // Double check - if blob is too small or is HTML, skip it
                if (responseBlob.size > 1000 && !responseBlob.type.includes('html')) {
                  blob = responseBlob
                }
              }
            }
          }
        } catch (urlError) {
          console.log('Public URL download failed:', urlError)
        }
      }

      // If we have a blob, trigger download
      if (blob) {
        // Force download with proper MIME type
        const url = window.URL.createObjectURL(new Blob([blob], { 
          type: 'application/vnd.android.package-archive' 
        }))
        
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        
        // Cleanup
        setTimeout(() => {
          document.body.removeChild(link)
          window.URL.revokeObjectURL(url)
        }, 100)
        
        showNotification('تم بدء التحميل بنجاح', 'success')
        setDownloading(false)
        return
      }

      // If all methods fail, show helpful error message
      const errorMessage = `
لم يتم العثور على ملف APK. 

يرجى التأكد من:
1. إنشاء bucket باسم "app-downloads" في Supabase Storage
2. رفع ملف APK باسم "app.apk" في الـ bucket
3. أو وضع ملف APK في مجلد public باسم app.apk

للإعداد:
- شغّل ملف create_app_downloads_bucket.sql في Supabase
- ارفع ملف APK إلى الـ bucket
      `.trim()
      
      throw new Error(errorMessage)
    } catch (error: any) {
      console.error('Download error:', error)
      showNotification(
        error.message || 'حدث خطأ أثناء التحميل. يرجى المحاولة مرة أخرى.',
        'error'
      )
    } finally {
      setDownloading(false)
    }
  }

  // Android deep link / intent URL
  const androidPackageName = 'com.fulldevland.app' // TODO: Replace with actual package name
  const androidIntentUrl = `intent://#Intent;package=${androidPackageName};scheme=https;end`
  const androidPlayStoreUrl = `https://play.google.com/store/apps/details?id=${androidPackageName}`

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
                disabled={downloading}
                size="lg"
                className="w-full sm:w-auto min-w-[200px] bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {downloading ? (
                  <>
                    <Loader2 className="h-5 w-5 ml-2 animate-spin" />
                    جاري التحميل...
                  </>
                ) : (
                  <>
                    <DownloadIcon className="h-5 w-5 ml-2" />
                    تحميل APK للأندرويد
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center max-w-md">
                اضغط على الزر أعلاه لتحميل ملف APK للتطبيق على جهاز Android الخاص بك
              </p>
              
              {/* Android App Links */}
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto max-w-md">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Try to open Android app via intent
                    window.location.href = androidIntentUrl
                    // Fallback to Play Store after delay
                    setTimeout(() => {
                      window.open(androidPlayStoreUrl, '_blank')
                    }, 2000)
                  }}
                  className="flex-1 sm:flex-none"
                >
                  <Smartphone className="h-4 w-4 ml-1" />
                  فتح التطبيق
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(androidPlayStoreUrl, '_blank')}
                  className="flex-1 sm:flex-none"
                >
                  متجر Google Play
                </Button>
              </div>

              {/* Setup Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md">
                <h4 className="font-semibold mb-2 text-sm flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  إعداد التحميل
                </h4>
                <div className="text-xs text-blue-800 space-y-2">
                  <p><strong>لتفعيل التحميل:</strong></p>
                  <ol className="list-decimal list-inside mr-2 space-y-1">
                    <li>اذهب إلى Supabase Dashboard → Storage</li>
                    <li>أنشئ bucket جديد باسم: <code className="bg-blue-100 px-1 rounded">app-downloads</code></li>
                    <li>فعّل "Public bucket"</li>
                    <li>شغّل ملف <code className="bg-blue-100 px-1 rounded">create_app_downloads_bucket.sql</code></li>
                    <li>ارفع ملف APK باسم <code className="bg-blue-100 px-1 rounded">app.apk</code></li>
                  </ol>
                  <p className="mt-2 text-blue-700">
                    <strong>أو:</strong> ضع ملف APK في <code className="bg-blue-100 px-1 rounded">frontend/public/app.apk</code>
                  </p>
                </div>
              </div>
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

