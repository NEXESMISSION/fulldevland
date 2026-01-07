import { useState, useEffect } from 'react'
import { useLanguage } from '@/contexts/LanguageContext'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Smartphone, CheckCircle2, AlertCircle, Install, Share2, Globe, Download as DownloadIcon } from 'lucide-react'
import { showNotification } from '@/components/ui/notification'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function Download() {
  const { t, locale } = useLanguage()
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setIsInstallable(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true)
      setIsInstallable(false)
      setDeferredPrompt(null)
      showNotification('تم تثبيت التطبيق بنجاح!', 'success')
    })

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallPWA = async () => {
    if (!deferredPrompt) {
      // If prompt is not available, show manual instructions
      showManualInstallInstructions()
      return
    }

    try {
      // Show the install prompt
      await deferredPrompt.prompt()
      
      // Wait for user's response
      const { outcome } = await deferredPrompt.userChoice
      
      if (outcome === 'accepted') {
        showNotification('جاري تثبيت التطبيق...', 'success')
      } else {
        showNotification('تم إلغاء التثبيت', 'info')
      }
      
      // Clear the prompt
      setDeferredPrompt(null)
      setIsInstallable(false)
    } catch (error) {
      console.error('Install prompt error:', error)
      showManualInstallInstructions()
    }
  }

  const showManualInstallInstructions = () => {
    const message = `
لتثبيت التطبيق على Android:
1. اضغط على زر القائمة (⋮) في المتصفح
2. اختر "تثبيت التطبيق" أو "Add to Home Screen"
3. اضغط "تثبيت" في النافذة المنبثقة

أو:
1. افتح القائمة في Chrome
2. اختر "Install app" أو "Add to Home screen"
    `.trim()
    
    showNotification(message, 'info')
  }

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'تطبيق إدارة الأراضي',
          text: 'قم بتثبيت تطبيق إدارة الأراضي والعقارات',
          url: window.location.origin,
        })
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Share error:', error)
        }
      }
    } else {
      // Fallback: copy URL to clipboard
      try {
        await navigator.clipboard.writeText(window.location.origin)
        showNotification('تم نسخ الرابط إلى الحافظة', 'success')
      } catch (error) {
        showNotification('تعذر نسخ الرابط', 'error')
      }
    }
  }

  const appVersion = '1.0.0'
  const lastUpdated = new Date().toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Card className="shadow-lg">
        <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 border-b">
          <div className="flex items-center gap-3">
            <Smartphone className="h-6 w-6 text-green-600" />
            <CardTitle className="text-2xl font-bold">{t('download.title')}</CardTitle>
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
                <p className="text-muted-foreground">{t('download.subtitle')}</p>
              </div>
            </div>

            {/* Version Info */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-blue-900">{t('download.version')}:</span>
                  <span className="mr-2 text-blue-700">{appVersion}</span>
                </div>
                <div>
                  <span className="font-medium text-blue-900">{t('download.lastUpdated')}:</span>
                  <span className="mr-2 text-blue-700">{lastUpdated}</span>
                </div>
              </div>
            </div>

            {/* Install Button */}
            <div className="flex flex-col items-center gap-4">
              {isInstalled ? (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 w-full max-w-md text-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
                  <p className="font-semibold text-green-800">{t('download.installed')}</p>
                  <p className="text-sm text-green-700 mt-1">{t('download.installedDescription')}</p>
                </div>
              ) : isInstallable ? (
                <Button
                  onClick={handleInstallPWA}
                  size="lg"
                  className="w-full sm:w-auto min-w-[250px] bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg"
                >
                  <Install className="h-5 w-5 ml-2" />
                  {t('download.installApp')}
                </Button>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 w-full max-w-md">
                  <AlertCircle className="h-6 w-6 text-yellow-600 mx-auto mb-2" />
                  <p className="text-sm text-yellow-800 text-center mb-3">
                    {t('download.installNotAvailable')}
                  </p>
                  <Button
                    onClick={showManualInstallInstructions}
                    variant="outline"
                    size="sm"
                    className="w-full"
                  >
                    {t('download.showInstructions')}
                  </Button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto max-w-md">
                <Button
                  onClick={handleShare}
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none"
                >
                  <Share2 className="h-4 w-4 ml-1" />
                  {t('download.share')}
                </Button>
                <Button
                  onClick={() => window.open(window.location.origin, '_blank')}
                  variant="outline"
                  size="sm"
                  className="flex-1 sm:flex-none"
                >
                  <Globe className="h-4 w-4 ml-1" />
                  {t('download.openInBrowser')}
                </Button>
              </div>
            </div>

            {/* Installation Instructions */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-yellow-600" />
                {t('download.installationInstructions')}
              </h3>
              <div className="space-y-3 text-sm text-muted-foreground">
                <div>
                  <p className="font-semibold mb-2">{t('download.forAndroid')}:</p>
                  <ol className="space-y-1 list-decimal list-inside mr-2">
                    <li>{t('download.instruction1')}</li>
                    <li>{t('download.instruction2')}</li>
                    <li>{t('download.instruction3')}</li>
                    <li>{t('download.instruction4')}</li>
                  </ol>
                </div>
                <div className="bg-white/50 rounded p-2 mt-3">
                  <p className="font-semibold text-yellow-800 mb-1">{t('download.note')}:</p>
                  <p className="text-xs text-yellow-700">
                    {t('download.pwaNote')}
                  </p>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">{t('download.features')}</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• {t('download.feature1')}</li>
                  <li>• {t('download.feature2')}</li>
                  <li>• {t('download.feature3')}</li>
                  <li>• {t('download.feature4')}</li>
                </ul>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-semibold mb-2">{t('download.requirements')}</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• {t('download.requirement1')}</li>
                  <li>• {t('download.requirement2')}</li>
                  <li>• {t('download.requirement3')}</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
