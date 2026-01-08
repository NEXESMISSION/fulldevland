import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Captcha } from '@/components/ui/captcha'
import { Map } from 'lucide-react'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [requiresCaptcha, setRequiresCaptcha] = useState(false)
  const [captchaVerified, setCaptchaVerified] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const { signIn, user, loading: authLoading, getFailedAttemptsCount } = useAuth()
  const navigate = useNavigate()

  // Navigate when user is loaded after login
  useEffect(() => {
    if (!authLoading && user) {
      navigate('/', { replace: true })
    }
  }, [user, authLoading, navigate])

  // Check if CAPTCHA is required when email changes
  useEffect(() => {
    const checkCaptchaRequirement = async () => {
      if (email.trim()) {
        const attempts = await getFailedAttemptsCount(email.trim())
        setFailedAttempts(attempts)
        setRequiresCaptcha(attempts >= 3)
        if (attempts < 3) {
          setCaptchaVerified(false) // Reset CAPTCHA if attempts dropped below threshold
        }
      } else {
        setRequiresCaptcha(false)
        setCaptchaVerified(false)
        setFailedAttempts(0)
      }
    }
    
    // Debounce the check
    const timeoutId = setTimeout(checkCaptchaRequirement, 500)
    return () => clearTimeout(timeoutId)
  }, [email, getFailedAttemptsCount])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    // Validate CAPTCHA if required
    if (requiresCaptcha && !captchaVerified) {
      setError('يرجى إكمال التحقق من الهوية (CAPTCHA)')
      return
    }
    
    setLoading(true)

    try {
      const result = await signIn(email, password, captchaVerified)
      if (result.error) {
        setError(result.error.message)
        setRequiresCaptcha(result.requiresCaptcha || false)
        setFailedAttempts(result.failedAttempts || 0)
        if (result.requiresCaptcha) {
          setCaptchaVerified(false) // Reset CAPTCHA on error
        }
        setLoading(false)
      } else {
        // Clear CAPTCHA state on success
        setRequiresCaptcha(false)
        setCaptchaVerified(false)
        setFailedAttempts(0)
        // Don't navigate here - let useEffect handle it when user is loaded
        // This ensures the profile is fetched before navigation
      }
    } catch {
      setError('حدث خطأ غير متوقع')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/10 via-background to-secondary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-primary/10 p-3">
              <Map className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">LandDev</CardTitle>
          <CardDescription>
            Land & Real Estate Management System
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {requiresCaptcha && (
              <div className="space-y-2">
                <Captcha 
                  onVerify={setCaptchaVerified}
                  required={true}
                />
                {failedAttempts > 0 && (
                  <p className="text-sm text-muted-foreground">
                    محاولات فاشلة: {failedAttempts} من 5 (سيتم حظر الحساب بعد 5 محاولات)
                  </p>
                )}
              </div>
            )}
            {failedAttempts >= 5 && (
              <div className="rounded-md bg-yellow-500/10 p-3 text-sm text-yellow-600 dark:text-yellow-400">
                تم حظر الحساب مؤقتاً. يرجى المحاولة بعد 15 دقيقة.
              </div>
            )}
            <Button type="submit" className="w-full" disabled={loading || (requiresCaptcha && !captchaVerified)}>
              {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
