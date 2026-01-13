import { createContext, useContext, useEffect, useState, useRef, type ReactNode } from 'react'
import type { User as SupabaseUser, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { User, UserRole, UserStatus } from '@/types/database'
import { retryWithBackoff, isRetryableError } from '@/lib/retry'

interface AuthContextType {
  user: SupabaseUser | null
  profile: User | null
  session: Session | null
  loading: boolean
  profileLoading: boolean  // True while profile is being fetched
  isReady: boolean         // True when auth AND profile are fully loaded
  signIn: (email: string, password: string, captchaVerified?: boolean) => Promise<{ error: Error | null; requiresCaptcha?: boolean; failedAttempts?: number }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>  // Refresh profile from database
  hasPermission: (permission: string) => boolean
  hasPageAccess: (pageId: string) => boolean
  getPermissionDeniedMessage: (permission: string) => string
  getFailedAttemptsCount: (email: string) => Promise<number>  // Get failed attempts from database
  requiresReAuth: () => boolean  // Check if re-authentication is required for sensitive operations
  updateLastAuthTime: () => void  // Update last authentication time (after sensitive operations)
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
  Worker: {
    view_dashboard: true,
    view_land: true,
    edit_land: false,
    delete_land: false,
    view_clients: true,
    edit_clients: true,
    delete_clients: false,
    view_sales: true,
    create_sales: true,
    edit_sales: true, // Allow confirmation of sales
    edit_prices: false,
    view_installments: true,
    edit_installments: true, // Allow recording payments
    view_payments: true,
    record_payments: true,
    view_financial: true, // For expenses
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
  const [profileLoading, setProfileLoading] = useState(false)
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({})
  const fetchingRef = useRef(false)
  const initializedRef = useRef(false)
  const profileCacheRef = useRef<{ userId: string; profile: User; timestamp: number } | null>(null)
  const CACHE_DURATION_MS = 5 * 60 * 1000 // 5 minutes cache
  
  // isReady is true when auth loading is done AND (no user OR profile is loaded)
  const isReady = !loading && (!user || (!!user && !!profile && !profileLoading))
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Session timeout: 8 hours (reduced from 24 hours for better security)
  const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000
  // Inactivity timeout: 15 minutes (reduced from 30 minutes for better security)
  const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000
  // Token refresh interval: Refresh token 5 minutes before expiry
  const TOKEN_REFRESH_INTERVAL_MS = 7 * 60 * 60 * 1000 // 7 hours (refresh before 8h expiry)
  // Re-authentication required timeout: 1 hour (force re-auth for sensitive operations)
  const REAUTH_REQUIRED_TIMEOUT_MS = 60 * 60 * 1000

  useEffect(() => {
    // Prevent double initialization in StrictMode
    if (initializedRef.current) return
    initializedRef.current = true
    
    // Hard timeout to prevent infinite loading (10 seconds - reduced from 15)
    const loadingTimeout = setTimeout(() => {
      console.warn('Loading timeout reached - forcing loading to stop')
      setLoading(false)
      setProfileLoading(false)
      fetchingRef.current = false
      // Try to use cached profile if available
      if (profileCacheRef.current && session?.user?.id === profileCacheRef.current.userId) {
        const cacheAge = Date.now() - profileCacheRef.current.timestamp
        if (cacheAge < CACHE_DURATION_MS) {
          console.log('Using cached profile due to timeout')
          setProfile(profileCacheRef.current.profile)
        }
      }
    }, 10000)
    
    // Use retry mechanism for initial session fetch
    retryWithBackoff(
      async () => {
        const { data: { session }, error } = await supabase.auth.getSession()
        if (error) throw error
        return session
      },
      {
        maxRetries: 3,
        timeout: 10000,
        onRetry: (attempt) => {
          console.log(`Retrying session fetch (attempt ${attempt})...`)
        },
      }
    )
      .then((session) => {
        clearTimeout(loadingTimeout)
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchProfile(session.user.id)
        } else {
          setLoading(false)
        }
      })
      .catch((error) => {
        clearTimeout(loadingTimeout)
        console.error('Failed to get session:', error)
        // Still allow app to load, user can try logging in
        setLoading(false)
      })
    
    return () => {
      clearTimeout(loadingTimeout)
    }

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
    // Check cache first
    if (profileCacheRef.current && profileCacheRef.current.userId === userId) {
      const cacheAge = Date.now() - profileCacheRef.current.timestamp
      if (cacheAge < CACHE_DURATION_MS) {
        console.log('Using cached profile')
        setProfile(profileCacheRef.current.profile)
        setProfileLoading(false)
        setLoading(false)
        fetchingRef.current = false
        
        // Still fetch in background to update cache
        fetchProfileFromServer(userId).catch(() => {
          // Silent fail - we already have cached data
        })
        return
      }
    }
    
    // Prevent multiple simultaneous fetches
    if (fetchingRef.current) {
      // If already fetching, wait a bit and check cache again
      setTimeout(() => {
        if (profileCacheRef.current && profileCacheRef.current.userId === userId) {
          const cacheAge = Date.now() - profileCacheRef.current.timestamp
          if (cacheAge < CACHE_DURATION_MS) {
            setProfile(profileCacheRef.current.profile)
            setProfileLoading(false)
            setLoading(false)
          }
        }
      }, 500)
      return
    }
    
    fetchingRef.current = true
    setProfileLoading(true)
    
    // Hard timeout to prevent infinite loading (10 seconds - reduced from 15)
    const profileTimeout = setTimeout(() => {
      console.warn('Profile loading timeout reached - forcing loading to stop')
      setProfileLoading(false)
      fetchingRef.current = false
      setLoading(false)
      
      // Try to use cached profile if available
      if (profileCacheRef.current && profileCacheRef.current.userId === userId) {
        console.log('Using cached profile due to timeout')
        setProfile(profileCacheRef.current.profile)
      }
    }, 10000)
    
    try {
      await fetchProfileFromServer(userId)
    } finally {
      clearTimeout(profileTimeout)
      fetchingRef.current = false
      setProfileLoading(false)
      setLoading(false)
    }
  }
  
  const fetchProfileFromServer = async (userId: string) => {
    
    try {
      // Use retry mechanism for profile fetch
      const data = await retryWithBackoff(
        async () => {
          // ALWAYS try to fetch from users table first to get allowed_pages
          // This is critical for page access control
          const { data, error } = await supabase
            .from('users')
            .select('id, name, email, role, status, created_at, updated_at, allowed_pages, page_order, sidebar_order, allowed_batches, allowed_pieces')
            .eq('id', userId)
            .limit(1)
      
          if (error) {
            // If RLS error (403, permission denied), try auth metadata as fallback
            const errorStatus = (error as any).status
            const isPermissionError = 
              error.code === 'PGRST116' || 
              error.code === '42501' || 
              error.code === 'PGRST301' ||
              errorStatus === 403 ||
              errorStatus === 406 || 
              errorStatus === 500 ||
              error.message?.includes('403') ||
              error.message?.includes('406') || 
              error.message?.includes('500') || 
              error.message?.includes('permission denied') || 
              error.message?.includes('row-level security') ||
              error.message?.includes('internal server error')
            
            if (isPermissionError) {
              console.warn('Users table query failed (RLS blocking), falling back to auth metadata:', error)
              // Try to get user from auth metadata as last resort
              // WARNING: This fallback does NOT include allowed_pages, so page restrictions won't work
              const { data: authUser } = await supabase.auth.getUser()
              if (authUser?.user) {
                const metaRole = authUser.user.user_metadata?.role
                const email = authUser.user.email || ''
                
                // Known owner emails - fallback if metadata is missing
                const knownOwnerEmails = ['saifelleuchi127@gmail.com', 'lassad.mazed@gmail.com']
                const isKnownOwner = knownOwnerEmails.includes(email.toLowerCase())
                
                const role = metaRole || (isKnownOwner ? 'Owner' : 'FieldStaff')
                
                console.warn('Using auth metadata for profile (allowed_pages NOT available):', { email, role })
                
                return {
                  id: authUser.user.id,
                  name: authUser.user.user_metadata?.name || authUser.user.email?.split('@')[0] || 'User',
                  email: email,
                  role: role as UserRole,
                  status: (authUser.user.user_metadata?.status || 'Active') as 'Active' | 'Inactive',
                  created_at: authUser.user.created_at,
                  updated_at: authUser.user.updated_at || authUser.user.created_at,
                  // No allowed_pages available from auth metadata - will use role permissions
                  allowed_pages: null,
                }
              }
              throw new Error('User not found and cannot access users table')
            }
            throw error
          }
          
          if (!data || data.length === 0) {
            // User not in users table, try auth metadata
            console.warn('User not found in users table, trying auth metadata')
            const { data: authUser } = await supabase.auth.getUser()
            if (authUser?.user) {
              const metaRole = authUser.user.user_metadata?.role
              const email = authUser.user.email || ''
              const knownOwnerEmails = ['saifelleuchi127@gmail.com', 'lassad.mazed@gmail.com']
              const isKnownOwner = knownOwnerEmails.includes(email.toLowerCase())
              const role = metaRole || (isKnownOwner ? 'Owner' : 'FieldStaff')
              
              return {
                id: authUser.user.id,
                name: authUser.user.user_metadata?.name || authUser.user.email?.split('@')[0] || 'User',
                email: email,
                role: role as UserRole,
                created_at: authUser.user.created_at,
                updated_at: authUser.user.updated_at || authUser.user.created_at,
                allowed_pages: null,
              }
            }
            throw new Error('User not found')
          }
          
          return data[0]
        },
        {
          maxRetries: 3,
          timeout: 10000,
          onRetry: (attempt) => {
            console.log(`Retrying profile fetch (attempt ${attempt})...`)
          },
        }
      )
      
      // Cache the profile
      profileCacheRef.current = {
        userId: userId,
        profile: data,
        timestamp: Date.now()
      }
      
      setProfile(data)
        
        // Fetch custom user permissions if not Owner
        if (data.role !== 'Owner') {
          await fetchUserPermissions(data.id)
        } else {
          // Owner has all permissions, no need to fetch
          setUserPermissions({})
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error)
      // If it's a retryable error, show a message but don't block
      if (isRetryableError(error as Error)) {
        console.warn('Network error fetching profile, will retry on next auth state change')
      }
      
      // Try to use cached profile if available
      if (profileCacheRef.current && profileCacheRef.current.userId === userId) {
        const cacheAge = Date.now() - profileCacheRef.current.timestamp
        // Use cache even if older than normal cache duration (up to 30 minutes)
        if (cacheAge < 30 * 60 * 1000) {
          console.log('Using cached profile due to fetch error')
          setProfile(profileCacheRef.current.profile)
          return
        }
      }
      
      setProfile(null)
      setUserPermissions({})
      throw error // Re-throw to be caught by outer try-catch
    }
  }

  const fetchUserPermissions = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_permissions')
        .select('resource_type, permission_type, granted')
        .eq('user_id', userId)
      
      if (error) {
        // If table doesn't exist yet, that's okay - use role permissions only
        if (error.code === '42P01') {
          console.warn('user_permissions table not found, using role permissions only')
          setUserPermissions({})
          return
        }
        throw error
      }
      
      // Convert to permission map (format: "resource_permission" -> boolean)
      const permissionsMap: Record<string, boolean> = {}
      if (data) {
        data.forEach((perm: any) => {
          const key = `${perm.resource_type}_${perm.permission_type}`
          permissionsMap[key] = perm.granted
        })
      }
      
      setUserPermissions(permissionsMap)
    } catch (error) {
      console.error('Failed to fetch user permissions:', error)
      setUserPermissions({})
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
  
  // Track last authentication time for re-authentication requirement
  const lastAuthTimeRef = useRef<number>(Date.now())
  const tokenRefreshIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  
  // Reset session timeout (8 hours)
  const resetSessionTimeout = () => {
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current)
    }
    
    if (user) {
      // Update last authentication time
      lastAuthTimeRef.current = Date.now()
      
      sessionTimeoutRef.current = setTimeout(() => {
        // Force logout after 8 hours
        signOut()
      }, SESSION_TIMEOUT_MS)
    }
  }

  // Refresh token before expiry
  const refreshToken = async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        // Check for invalid refresh token errors (case-insensitive)
        const errorMessage = error.message?.toLowerCase() || ''
        const isInvalidTokenError = 
          errorMessage.includes('refresh_token_not_found') ||
          errorMessage.includes('invalid_grant') ||
          errorMessage.includes('invalid refresh token') ||
          errorMessage.includes('refresh token not found') ||
          (error as any).status === 400
        
        if (isInvalidTokenError) {
          // Silently handle invalid refresh token - sign out without logging
          signOut()
        } else {
          // Log other errors
          console.error('Token refresh error:', error)
        }
      } else if (data?.session) {
        setSession(data.session)
        setUser(data.session.user)
        // Update last auth time on successful refresh
        lastAuthTimeRef.current = Date.now()
      }
    } catch (error: any) {
      // Check if it's an invalid refresh token error
      const errorMessage = error?.message?.toLowerCase() || ''
      const isInvalidTokenError = 
        errorMessage.includes('refresh_token_not_found') ||
        errorMessage.includes('invalid_grant') ||
        errorMessage.includes('invalid refresh token') ||
        errorMessage.includes('refresh token not found') ||
        error?.status === 400
      
      if (isInvalidTokenError) {
        // Silently handle invalid refresh token - sign out without logging
        signOut()
      } else {
        // Log other exceptions
        console.error('Token refresh exception:', error)
      }
    }
  }

  // Setup token refresh interval
  const setupTokenRefresh = () => {
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current)
    }
    
    if (user) {
      // Refresh token every 7 hours (before 8h expiry)
      tokenRefreshIntervalRef.current = setInterval(() => {
        refreshToken()
      }, TOKEN_REFRESH_INTERVAL_MS)
    }
  }

  // Check if re-authentication is required for sensitive operations
  const requiresReAuth = (): boolean => {
    if (!user) return true
    const timeSinceLastAuth = Date.now() - lastAuthTimeRef.current
    return timeSinceLastAuth > REAUTH_REQUIRED_TIMEOUT_MS
  }

  // Update last authentication time (call this after successful sensitive operations)
  const updateLastAuthTime = () => {
    lastAuthTimeRef.current = Date.now()
  }

  // Get client IP address (for rate limiting)
  const getClientIP = async (): Promise<string | null> => {
    try {
      // Try to get IP from a service (fire and forget)
      const response = await fetch('https://api.ipify.org?format=json')
      const data = await response.json()
      return data.ip || null
    } catch {
      // Fallback: use a placeholder or null
      return null
    }
  }

  // Get user agent (for tracking)
  const getUserAgent = (): string => {
    return typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
  }

  // Get failed attempts from database (server-side rate limiting)
  const getFailedAttemptsFromDB = async (email: string): Promise<number> => {
    try {
      const { data, error } = await supabase.rpc('get_failed_attempts', {
        email_address: email.toLowerCase()
      })
      
      if (error) {
        // Fallback to localStorage if database function fails
        return getFailedAttemptsLocal(email)
      }
      
      return data || 0
    } catch {
      // Fallback to localStorage
      return getFailedAttemptsLocal(email)
    }
  }

  // Get failed attempts from localStorage (client-side fallback)
  const getFailedAttemptsLocal = (email: string): number => {
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

  // Check if account should be locked (from database)
  const shouldLockAccount = async (email: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('should_lock_account', {
        email_address: email.toLowerCase()
      })
      
      if (error) {
        // Fallback: check localStorage
        return getFailedAttemptsLocal(email) >= 5
      }
      
      return data === true
    } catch {
      // Fallback: check localStorage
      return getFailedAttemptsLocal(email) >= 5
    }
  }

  // Record failed attempt (both database and localStorage)
  const recordFailedAttempt = async (email: string) => {
    const normalizedEmail = email.toLowerCase()
    
    // Update localStorage (client-side tracking)
    try {
      const key = `login_attempts_${normalizedEmail}`
      const data = localStorage.getItem(key)
      const attempts = data ? JSON.parse(data).attempts : []
      attempts.push(Date.now())
      localStorage.setItem(key, JSON.stringify({ attempts }))
    } catch {
      // Silent fail
    }
    
    // Log to database (server-side tracking)
    try {
      const ipAddress = await getClientIP()
      const userAgent = getUserAgent()
      
      await supabase.from('login_attempts').insert([{
        email: normalizedEmail,
        ip_address: ipAddress,
        success: false,
        attempted_at: new Date().toISOString(),
        user_agent: userAgent,
      }])
    } catch {
      // Silent fail - table might not exist or RLS blocks it
    }
  }

  // Clear failed attempts (both database and localStorage)
  const clearFailedAttempts = async (email: string) => {
    const normalizedEmail = email.toLowerCase()
    
    // Clear localStorage
    try {
      const key = `login_attempts_${normalizedEmail}`
      localStorage.removeItem(key)
    } catch {
      // Silent fail
    }
    
    // Log successful login to database
    try {
      const ipAddress = await getClientIP()
      const userAgent = getUserAgent()
      
      await supabase.from('login_attempts').insert([{
        email: normalizedEmail,
        ip_address: ipAddress,
        success: true,
        attempted_at: new Date().toISOString(),
        user_agent: userAgent,
      }])
    } catch {
      // Silent fail - table might not exist or RLS blocks it
    }
  }

  // Get failed attempts count (public method)
  const getFailedAttemptsCount = async (email: string): Promise<number> => {
    return await getFailedAttemptsFromDB(email)
  }

  const signIn = async (email: string, password: string, captchaVerified: boolean = false) => {
    try {
      // Validate inputs before attempting login
      if (!email || !email.trim()) {
        return { 
          error: new Error('البريد الإلكتروني مطلوب'),
          requiresCaptcha: false,
          failedAttempts: 0
        }
      }
      
      if (!password || !password.trim()) {
        return { 
          error: new Error('كلمة المرور مطلوبة'),
          requiresCaptcha: false,
          failedAttempts: 0
        }
      }

      // Normalize email
      const normalizedEmail = email.trim().toLowerCase()

      // Check for account lockout (5 failed attempts in 15 minutes) - from database
      const isLocked = await shouldLockAccount(normalizedEmail)
      if (isLocked) {
        return { 
          error: new Error('تم حظر الحساب مؤقتاً بسبب محاولات تسجيل دخول فاشلة متعددة. يرجى المحاولة بعد 15 دقيقة.'),
          requiresCaptcha: false,
          failedAttempts: 5
        }
      }

      // Get failed attempts count
      const failedAttempts = await getFailedAttemptsFromDB(normalizedEmail)
      
      // Require CAPTCHA after 3 failed attempts
      if (failedAttempts >= 3 && !captchaVerified) {
        return {
          error: new Error('يرجى إكمال التحقق من الهوية (CAPTCHA)'),
          requiresCaptcha: true,
          failedAttempts: failedAttempts
        }
      }

      // Use retry mechanism for sign in - but only for network errors, not auth errors
      let data, error
      try {
        const result = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password: password.trim(),
        })
        data = result.data
        error = result.error
      } catch (authError: any) {
        // If it's a 400 error (bad request), don't retry - it's likely invalid credentials
        if (authError.status === 400 || authError.code === 'invalid_credentials') {
          error = authError
        } else {
          // For other errors (network, timeout), use retry mechanism
          const retryResult = await retryWithBackoff(
            async () => {
              const result = await supabase.auth.signInWithPassword({
                email: normalizedEmail,
                password: password.trim(),
              })
              if (result.error) throw result.error
              return result
            },
            {
              maxRetries: 2,
              timeout: 10000,
              onRetry: (attempt) => {
                console.log(`Retrying sign in (attempt ${attempt})...`)
              },
            }
          )
          data = retryResult.data
          error = retryResult.error
        }
      }
      
      if (error) {
        // Record failed attempt
        await recordFailedAttempt(normalizedEmail)
        
        // Get updated failed attempts count
        const newFailedAttempts = await getFailedAttemptsFromDB(normalizedEmail)
        
        // Check error type to provide appropriate message
        const errorCode = (error as any).status || (error as any).code || ''
        const errorMsg = error.message?.toLowerCase() || ''
        
        // Don't retry on 400 errors (invalid credentials) - they're not retryable
        if (errorCode === 400 || errorMsg.includes('invalid') || errorMsg.includes('credentials')) {
          // Generic error message to avoid leaking information
          // Require CAPTCHA if we've reached 3+ failed attempts
          const requiresCaptcha = newFailedAttempts >= 3
          return { 
            error: new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة'),
            requiresCaptcha: requiresCaptcha,
            failedAttempts: newFailedAttempts
          }
        }
        
        // For other errors, provide generic message
        return { 
          error: new Error('فشل تسجيل الدخول. يرجى المحاولة مرة أخرى.'),
          requiresCaptcha: newFailedAttempts >= 3,
          failedAttempts: newFailedAttempts
        }
      } else {
        // Clear failed attempts on successful login
        await clearFailedAttempts(normalizedEmail)
        
        // Immediately update user and session state
        if (data?.user) {
          setUser(data.user)
          // Update last authentication time on successful login
          lastAuthTimeRef.current = Date.now()
        }
        if (data?.session) {
          setSession(data.session)
          // Immediately fetch profile after successful login
          await fetchProfile(data.user.id)
        }
      }
      
      return { 
        error: null,
        requiresCaptcha: false,
        failedAttempts: 0
      }
    } catch (error) {
      // Record failed attempt for unexpected errors too
      const normalizedEmail = email?.trim().toLowerCase() || ''
      if (normalizedEmail) {
        await recordFailedAttempt(normalizedEmail)
      }
      
      // Check if it's a network error
      if (isRetryableError(error as Error)) {
        return { 
          error: new Error('فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.'),
          requiresCaptcha: false,
          failedAttempts: 0
        }
      }
      
      return { 
        error: error as Error,
        requiresCaptcha: false,
        failedAttempts: 0
      }
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
    setupTokenRefresh()  // Setup token refresh when user is logged in
    
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
      if (tokenRefreshIntervalRef.current) {
        clearInterval(tokenRefreshIntervalRef.current)
      }
    }
  }, [user])

  const signOut = async () => {
    // Clear timers
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = null
    }
    if (tokenRefreshIntervalRef.current) {
      clearInterval(tokenRefreshIntervalRef.current)
      tokenRefreshIntervalRef.current = null
    }
    if (sessionTimeoutRef.current) {
      clearTimeout(sessionTimeoutRef.current)
      sessionTimeoutRef.current = null
    }
    
    // Clear cache
    profileCacheRef.current = null
    
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setSession(null)
    setUserPermissions({})
  }

  // Throttle hasPermission warnings to avoid console spam
  const lastWarningTimeRef = useRef<number>(0)

  const hasPermission = (permission: string): boolean => {
    if (!profile) {
      // Only log warning once per second to avoid console spam
      const now = Date.now()
      if (now - lastWarningTimeRef.current > 1000) {
        console.warn('hasPermission called but profile is null - user may need to log in again')
        lastWarningTimeRef.current = now
      }
      return false
    }
    
    // Owner always has all permissions
    if (profile.role === 'Owner') {
      return true
    }
    
    // Check custom user permissions first (if exists)
    // Format: "resource_permission" (e.g., "land_view", "sale_create")
    const customKey = permission.includes('_') ? permission : null
    if (customKey && userPermissions.hasOwnProperty(customKey)) {
      return userPermissions[customKey]
    }
    
    // Check legacy format in custom permissions
    // Try reverse format (e.g., "view_land" -> "land_view")
    const parts = permission.split('_')
    if (parts.length === 2) {
      const reversedKey = `${parts[1]}_${parts[0]}`
      if (userPermissions.hasOwnProperty(reversedKey)) {
        return userPermissions[reversedKey]
      }
    }
    
    // Fall back to role permissions (legacy format)
    return rolePermissions[profile.role]?.[permission] ?? false
  }

  const getPermissionDeniedMessage = (permission: string): string => {
    if (!profile) return 'يجب تسجيل الدخول للوصول إلى هذه الميزة'
    
    const permissionNames: Record<string, string> = {
      'view_dashboard': 'عرض لوحة التحكم',
      'view_land': 'عرض الأراضي',
      'edit_land': 'تعديل الأراضي',
      'delete_land': 'حذف الأراضي',
      'view_clients': 'عرض العملاء',
      'edit_clients': 'تعديل العملاء',
      'delete_clients': 'حذف العملاء',
      'view_sales': 'عرض المبيعات',
      'create_sales': 'إنشاء المبيعات',
      'edit_sales': 'تعديل المبيعات',
      'edit_prices': 'تعديل الأسعار',
      'view_installments': 'عرض الأقساط',
      'edit_installments': 'تعديل الأقساط',
      'view_payments': 'عرض المدفوعات',
      'record_payments': 'تسجيل المدفوعات',
      'view_financial': 'عرض البيانات المالية',
      'view_profit': 'عرض الأرباح',
      'manage_users': 'إدارة المستخدمين',
      'view_audit_logs': 'عرض سجلات التدقيق',
      'view_expenses': 'عرض المصاريف',
      'edit_expenses': 'تعديل المصاريف',
    }
    
    const permissionName = permissionNames[permission] || permission
    return `ليس لديك صلاحية للوصول إلى "${permissionName}". يرجى التواصل مع المدير للحصول على الصلاحيات المطلوبة.`
  }

  // Check if user has access to a specific page (optimized - no debug logging)
  const hasPageAccess = (pageId: string): boolean => {
    if (!profile) return false
    
    // Owner always has access to all pages
    if (profile.role === 'Owner') return true
    
    // Get allowed_pages from profile
    const allowedPages = (profile as any).allowed_pages as string[] | null
    
    // If allowed_pages is null or undefined, allow all (backwards compatible)
    if (!allowedPages) return true
    
    // If allowed_pages is empty array, deny all except home
    if (allowedPages.length === 0) return pageId === 'home'
    
    // Check if pageId is in allowed_pages
    return allowedPages.includes(pageId)
  }

  const refreshProfile = async () => {
    if (user?.id) {
      // Clear cache to force fresh fetch
      profileCacheRef.current = null
      fetchingRef.current = false  // Reset to allow re-fetch
      await fetchProfile(user.id)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        loading,
        profileLoading,
        isReady,
        signIn,
        signOut,
        refreshProfile,
        hasPermission,
        hasPageAccess,
        getPermissionDeniedMessage,
        getFailedAttemptsCount,
        requiresReAuth,
        updateLastAuthTime,
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

