import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { User, UserRole } from '@/types/database'

interface AuthContextType {
  user: SupabaseUser | null
  profile: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  hasPermission: (permission: string) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const rolePermissions: Record<UserRole, Record<string, boolean>> = {
  Owner: {
    view_dashboard: true,
    view_land: true,
    edit_land: true,
    delete_land: true,
    view_clients: true,
    edit_clients: true,
    delete_clients: true,
    view_sales: true,
    create_sales: true,
    edit_sales: true,
    edit_prices: true,
    view_installments: true,
    edit_installments: true,
    view_payments: true,
    record_payments: true,
    view_financial: true,
    view_profit: true,
    manage_users: true,
    view_audit_logs: true,
  },
  Manager: {
    view_dashboard: true,
    view_land: true,
    edit_land: true,
    delete_land: false,
    view_clients: true,
    edit_clients: true,
    delete_clients: false,
    view_sales: true,
    create_sales: true,
    edit_sales: true,
    edit_prices: false,
    view_installments: true,
    edit_installments: true,
    view_payments: true,
    record_payments: true,
    view_financial: true,
    view_profit: false,
    manage_users: false,
    view_audit_logs: true,
  },
  FieldStaff: {
    view_dashboard: true,
    view_land: true,
    edit_land: false,
    delete_land: false,
    view_clients: true,
    edit_clients: true,
    delete_clients: false,
    view_sales: true,
    create_sales: false,
    edit_sales: false,
    edit_prices: false,
    view_installments: true,
    edit_installments: false,
    view_payments: true,
    record_payments: true,
    view_financial: false,
    view_profit: false,
    manage_users: false,
    view_audit_logs: false,
  },
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [profile, setProfile] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const fetchingRef = useRef(false)
  const initializedRef = useRef(false)
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Session timeout: 24 hours
  const SESSION_TIMEOUT_MS = 24 * 60 * 60 * 1000
  // Inactivity timeout: 30 minutes
  const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000

  useEffect(() => {
    // Prevent double initialization in StrictMode
    if (initializedRef.current) return
    initializedRef.current = true
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    }).catch(() => {
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Only react to meaningful auth changes
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          setSession(session)
          setUser(session?.user ?? null)
          if (session?.user && event === 'SIGNED_IN') {
            await fetchProfile(session.user.id)
          } else if (event === 'SIGNED_OUT') {
            setProfile(null)
            setLoading(false)
          }
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const fetchProfile = async (userId: string) => {
    // Prevent multiple simultaneous fetches
    if (fetchingRef.current) return
    fetchingRef.current = true
    
    try {
      // Use specific columns instead of * for security
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, status, created_at, updated_at')
        .eq('id', userId)
        .single()
      
      if (error) {
        setProfile(null)
      } else {
        setProfile(data)
      }
    } catch (error) {
      setProfile(null)
    } finally {
      fetchingRef.current = false
      setLoading(false)
    }
  }

  // Reset inactivity timer
  const resetInactivityTimer = () => {
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
    }
    
    if (user) {
      inactivityTimerRef.current = setTimeout(() => {
        // Auto-logout after inactivity
        signOut()
      }, INACTIVITY_TIMEOUT_MS)
    }
  }
  
  // Reset session timeout (24 hours)
  const resetSessionTimeout = () => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current)
    }
    
    if (user) {
      sessionTimeoutRef.current = setTimeout(() => {
        // Force logout after 24 hours
        signOut()
      }, SESSION_TIMEOUT_MS)
    }
  }

  // Track login attempts in localStorage (client-side rate limiting)
  const getFailedAttempts = (email: string): number => {
    try {
      const key = `login_attempts_${email.toLowerCase()}`
      const data = localStorage.getItem(key)
      if (!data) return 0
      const parsed = JSON.parse(data)
      // Clear old attempts (older than 15 minutes)
      const fifteenMinutesAgo = Date.now() - (15 * 60 * 1000)
      const recentAttempts = parsed.attempts.filter((ts: number) => ts > fifteenMinutesAgo)
      if (recentAttempts.length !== parsed.attempts.length) {
        localStorage.setItem(key, JSON.stringify({ attempts: recentAttempts }))
      }
      return recentAttempts.length
    } catch {
      return 0
    }
  }

  const recordFailedAttempt = (email: string) => {
    try {
      const key = `login_attempts_${email.toLowerCase()}`
      const data = localStorage.getItem(key)
      const attempts = data ? JSON.parse(data).attempts : []
      attempts.push(Date.now())
      localStorage.setItem(key, JSON.stringify({ attempts }))
      
      // Also log to database if possible (for audit)
      // Fire and forget - don't await to avoid blocking
      Promise.resolve(supabase.from('login_attempts').insert([{
        email: email.toLowerCase(),
        success: false,
        attempted_at: new Date().toISOString(),
      }])).catch(() => {
        // Silent fail - table might not exist yet
      })
    } catch {
      // Silent fail
    }
  }

  const clearFailedAttempts = (email: string) => {
    try {
      const key = `login_attempts_${email.toLowerCase()}`
      localStorage.removeItem(key)
      
      // Log successful login
      // Fire and forget - don't await to avoid blocking
      Promise.resolve(supabase.from('login_attempts').insert([{
        email: email.toLowerCase(),
        success: true,
        attempted_at: new Date().toISOString(),
      }])).catch(() => {
        // Silent fail
      })
    } catch {
      // Silent fail
    }
  }

  const signIn = async (email: string, password: string) => {
    try {
      // Check for account lockout (5 failed attempts in 15 minutes)
      const failedAttempts = getFailedAttempts(email)
      if (failedAttempts >= 5) {
        return { 
          error: new Error('تم حظر الحساب مؤقتاً بسبب محاولات تسجيل دخول فاشلة متعددة. يرجى المحاولة بعد 15 دقيقة.') 
        }
      }

      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      if (error) {
        // Record failed attempt
        recordFailedAttempt(email)
        
        // Generic error message to avoid leaking information
        // Don't reveal if email exists or not
        const genericError = new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة')
        return { error: genericError }
      } else {
        // Clear failed attempts on successful login
        clearFailedAttempts(email)
      }
      
      return { error: null }
    } catch (error) {
      return { error: error as Error }
    }
  }
  
  // Track user activity to reset inactivity timer
  useEffect(() => {
    if (!user) {
      // Clear timers when user logs out
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
        inactivityTimerRef.current = null
      }
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current)
        sessionTimeoutRef.current = null
      }
      return
    }
    
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']
    const handleActivity = () => {
      resetInactivityTimer()
    }
    
    events.forEach(event => {
      document.addEventListener(event, handleActivity, true)
    })
    
    // Initialize timers when user logs in
    resetInactivityTimer()
    resetSessionTimeout()
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true)
      })
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current)
      }
      if (sessionTimeoutRef.current) {
        clearTimeout(sessionTimeoutRef.current)
      }
    }
  }, [user])

  const signOut = async () => {
    // Clear timers
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = null
    }
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current)
      sessionTimeoutRef.current = null
    }
    
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setSession(null)
  }

  const hasPermission = (permission: string): boolean => {
    if (!profile) return false
    return rolePermissions[profile.role]?.[permission] ?? false
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        signIn,
        signOut,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
