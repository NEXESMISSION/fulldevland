import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Plus, Edit, Trash2, User, Shield, Activity, TrendingUp, CheckCircle2, ShoppingCart, Map as MapIcon, Users as UsersIcon, Calendar, FileText, CreditCard, Home, Building, Wallet, DollarSign, Lock, Eye, EyeOff, AlertCircle, Briefcase, MessageSquare, XCircle, ArrowUp, ArrowDown } from 'lucide-react'
import type { User as UserType, UserRole, Sale, WorkerProfile } from '@/types/database'
import { sanitizeText, sanitizeEmail } from '@/lib/sanitize'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { formatCurrency, formatDate } from '@/lib/utils'

const WORKER_TYPES = [
  'electrician',
  'surveyor',
  'agent',
  'supervisor',
  'engineer',
  'contractor',
  'other'
]

const roleColors: Record<UserRole, 'default' | 'secondary' | 'destructive'> = {
  Owner: 'default',
  Worker: 'secondary',
}

// All available pages in the system - IDs must match Sidebar.tsx pageId values
const ALL_PAGES = [
  { id: 'home', name: 'الرئيسية', icon: Home, description: 'الصفحة الرئيسية' },
  { id: 'land', name: 'إدارة الأراضي', icon: MapIcon, description: 'إدارة قطع الأراضي' },
  { id: 'clients', name: 'العملاء', icon: UsersIcon, description: 'إدارة العملاء' },
  { id: 'sales', name: 'المبيعات', icon: ShoppingCart, description: 'إدارة المبيعات' },
  { id: 'confirm-sales', name: 'تأكيد المبيعات', icon: CheckCircle2, description: 'تأكيد عمليات البيع' },
  { id: 'installments', name: 'الأقساط', icon: Calendar, description: 'إدارة الأقساط' },
  { id: 'finance', name: 'المالية', icon: TrendingUp, description: 'التقارير المالية' },
  { id: 'expenses', name: 'المصاريف', icon: Wallet, description: 'إدارة المصاريف' },
  { id: 'debts', name: 'الديون', icon: CreditCard, description: 'إدارة الديون' },
  { id: 'real-estate', name: 'التطوير والبناء', icon: Building, description: 'المشاريع العقارية' },
  { id: 'workers', name: 'العمال', icon: Briefcase, description: 'إدارة العمال' },
  { id: 'messages', name: 'الرسائل', icon: MessageSquare, description: 'الرسائل والمحادثات' },
  { id: 'users', name: 'المستخدمين', icon: User, description: 'إدارة المستخدمين' },
  { id: 'security', name: 'الأمان', icon: Shield, description: 'سجلات الأمان' },
]

interface UserStats {
  userId: string
  salesCreated: number
  salesConfirmed: number
  totalSalesValue: number
  totalConfirmedValue: number
  lastActivity: string | null
}

export function Users() {
  const { hasPermission, profile } = useAuth()
  const [users, setUsers] = useState<UserType[]>([])
  const [userStats, setUserStats] = useState<Map<string, UserStats>>(new Map())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<string | null>(null)
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<UserType | null>(null)
  const [userDetailsOpen, setUserDetailsOpen] = useState(false)
  const [userCreatedSales, setUserCreatedSales] = useState<any[]>([])
  const [userConfirmedSales, setUserConfirmedSales] = useState<any[]>([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [userActivityLogs, setUserActivityLogs] = useState<any[]>([])
  const [userPayments, setUserPayments] = useState<any[]>([])
  const [userClients, setUserClients] = useState<any[]>([])
  const [userLandBatches, setUserLandBatches] = useState<any[]>([])
  const [userReservations, setUserReservations] = useState<any[]>([])
  const [activityFilter, setActivityFilter] = useState<'all' | 'sales' | 'payments' | 'clients' | 'land' | 'audit'>('all')
  const [activityDateFilter, setActivityDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('all')
  const [detailsTab, setDetailsTab] = useState<'overview' | 'sales' | 'payments' | 'clients' | 'activity'>('overview')

  // User dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserType | null>(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Worker' as UserRole,
    allowedPages: [] as string[],
    sidebarOrder: [] as string[],
    // Worker profile fields - always enabled for Worker role
    worker_type: '',
    region: '',
    skills: [] as string[],
    worker_notes: '',
  })
  const [skillInput, setSkillInput] = useState('')
  const [workerProfiles, setWorkerProfiles] = useState<Map<string, WorkerProfile>>(new Map())

  useEffect(() => {
    if (!hasPermission('manage_users')) return
    fetchUsers()
  }, [hasPermission])

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, created_at, updated_at, allowed_pages, sidebar_order')
        .order('name', { ascending: true })

      if (error) {
        // Check for permission errors
        const errorCode = (error as any).code || ''
        const errorStatus = (error as any).status || (error as any).hint || ''
        if (errorCode === 'PGRST301' || errorCode === '42501' || errorStatus === 403 || error.message?.includes('403') || error.message?.includes('permission')) {
          setError('ليس لديك صلاحية لعرض المستخدمين. يرجى التواصل مع المسؤول.')
          console.error('Permission denied accessing users table:', error)
        } else {
          console.error('Error fetching users:', error)
          setError('خطأ في تحميل المستخدمين. يرجى المحاولة مرة أخرى.')
        }
        throw error
      }
      
      setUsers((data as UserType[]) || [])
      setError(null) // Clear any previous errors
      
      // Fetch worker profiles
      await fetchWorkerProfiles((data as UserType[]) || [])
      
      // Fetch user statistics
      await fetchUserStats((data as UserType[]) || [])
    } catch (error) {
      // Error already handled above
      setUsers([]) // Set empty array on error
    } finally {
      setLoading(false)
    }
  }

  const fetchWorkerProfiles = async (usersList: UserType[]) => {
    try {
      const userIds = usersList.map(u => u.id)
      if (userIds.length === 0) return

      const { data, error } = await supabase
        .from('worker_profiles')
        .select('*')
        .in('user_id', userIds)

      if (error) {
        console.error('Error fetching worker profiles:', error)
        return
      }

      const profilesMap = new Map<string, WorkerProfile>()
      ;(data || []).forEach((profile: WorkerProfile) => {
        profilesMap.set(profile.user_id, profile)
      })
      setWorkerProfiles(profilesMap)
    } catch (error) {
      console.error('Error fetching worker profiles:', error)
    }
  }

  const fetchUserStats = async (usersList: UserType[]) => {
    try {
      const statsMap = new Map<string, UserStats>()
      
      // Fetch all sales with created_by and confirmed_by
      const { data: sales } = await supabase
        .from('sales')
        .select('id, created_by, confirmed_by, total_selling_price, sale_date, status')
      
      if (sales) {
        usersList.forEach(user => {
          const userSales = sales.filter(s => 
            (s as any).created_by === user.id || (s as any).confirmed_by === user.id
          )
          
          const salesCreated = sales.filter(s => (s as any).created_by === user.id)
          const salesConfirmed = sales.filter(s => (s as any).confirmed_by === user.id)
          
          const totalSalesValue = salesCreated.reduce((sum, s) => sum + (s.total_selling_price || 0), 0)
          const totalConfirmedValue = salesConfirmed.reduce((sum, s) => sum + (s.total_selling_price || 0), 0)
          
          // Get last activity date
          const allDates = userSales
            .map(s => s.sale_date)
            .filter(Boolean)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
          
          statsMap.set(user.id, {
            userId: user.id,
            salesCreated: salesCreated.length,
            salesConfirmed: salesConfirmed.length,
            totalSalesValue,
            totalConfirmedValue,
            lastActivity: allDates.length > 0 ? allDates[0] : null,
          })
        })
      }
      
      setUserStats(statsMap)
    } catch (error) {
      console.error('Error fetching user stats:', error)
    }
  }

  const openUserDetails = async (user: UserType) => {
    setSelectedUserForDetails(user)
    setLoadingDetails(true)
    setUserDetailsOpen(true)
    
    // Fetch COMPREHENSIVE user activity data - everything they've done
    try {
      const [
        createdRes, 
        confirmedRes, 
        paymentsRes, 
        clientsRes,
        landBatchesRes,
        reservationsRes,
        auditRes
      ] = await Promise.all([
        // Sales created by user
        supabase
          .from('sales')
          .select('*, client:clients(name, phone, cin)')
          .eq('created_by', user.id)
          .order('sale_date', { ascending: false })
          .limit(200),
        // Sales confirmed by user
        supabase
          .from('sales')
          .select('*, client:clients(name, phone, cin)')
          .eq('confirmed_by', user.id)
          .order('sale_date', { ascending: false })
          .limit(200),
        // Payments recorded by user
        supabase
          .from('payments')
          .select('*, client:clients(name, phone), sale:sales(id, sale_date, payment_type)')
          .eq('recorded_by', user.id)
          .order('payment_date', { ascending: false })
          .limit(200),
        // Clients added by user
        supabase
          .from('clients')
          .select('*')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(200),
        // Land batches created by user
        supabase
          .from('land_batches')
          .select('*')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(200),
        // Reservations created by user
        supabase
          .from('reservations')
          .select('*, client:clients(name, phone, cin)')
          .eq('created_by', user.id)
          .order('created_at', { ascending: false })
          .limit(200),
        // All audit logs for user
        supabase
          .from('audit_logs')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(500)
      ])
      
      setUserCreatedSales((createdRes.data || []) as any[])
      setUserConfirmedSales((confirmedRes.data || []) as any[])
      setUserPayments((paymentsRes.data || []) as any[])
      setUserClients((clientsRes.data || []) as any[])
      setUserLandBatches((landBatchesRes.data || []) as any[])
      setUserReservations((reservationsRes.data || []) as any[])
      setUserActivityLogs((auditRes.data || []) as any[])
    } catch (error) {
      console.error('Error fetching user details:', error)
      setUserCreatedSales([])
      setUserConfirmedSales([])
      setUserPayments([])
      setUserClients([])
      setUserLandBatches([])
      setUserReservations([])
      setUserActivityLogs([])
    } finally {
      setLoadingDetails(false)
    }
  }

  const getDateRange = (filter: 'today' | 'week' | 'month' | 'all') => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    switch (filter) {
      case 'today':
        return { start: today, end: new Date(today.getTime() + 24 * 60 * 60 * 1000) }
      case 'week':
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        return { start: weekAgo, end: null }
      case 'month':
        const monthAgo = new Date(today)
        monthAgo.setMonth(monthAgo.getMonth() - 1)
        return { start: monthAgo, end: null }
      default:
        return { start: new Date(0), end: null }
    }
  }

  const openDialog = (user?: UserType) => {
    setError(null) // Clear any previous errors
    if (user) {
      setEditingUser(user)
      const workerProfile = workerProfiles.get(user.id)
      setForm({
        name: user.name,
        email: user.email,
        password: '',
        role: user.role,
        allowedPages: (user as any).allowed_pages || [],
        sidebarOrder: (user as any).sidebar_order || [],
        worker_type: workerProfile?.worker_type || '',
        region: workerProfile?.region || '',
        skills: workerProfile?.skills || [],
        worker_notes: workerProfile?.notes || '',
      })
    } else {
      setEditingUser(null)
      // Default pages for new Worker
      const defaultPages = ['home', 'land', 'clients', 'sales', 'installments']
      setForm({
        name: '',
        email: '',
        password: '',
        role: 'Worker',
        sidebarOrder: [],
        allowedPages: defaultPages,
        worker_type: '',
        region: '',
        skills: [],
        worker_notes: '',
      })
    }
    setSkillInput('')
    setDialogOpen(true)
  }

  // Toggle page access
  const togglePageAccess = (pageId: string) => {
    setForm(prev => {
      const current = prev.allowedPages || []
      if (current.includes(pageId)) {
        return { ...prev, allowedPages: current.filter(p => p !== pageId) }
      } else {
        return { ...prev, allowedPages: [...current, pageId] }
      }
    })
  }

  // Select all pages
  const selectAllPages = () => {
    setForm(prev => ({ ...prev, allowedPages: ALL_PAGES.map(p => p.id) }))
  }

  // Deselect all pages
  const deselectAllPages = () => {
    setForm(prev => ({ ...prev, allowedPages: [] }))
  }

  const addSkill = () => {
    if (skillInput.trim() && !form.skills.includes(skillInput.trim())) {
      setForm({ ...form, skills: [...form.skills, skillInput.trim()] })
      setSkillInput('')
    }
  }

  const removeSkill = (skill: string) => {
    setForm({ ...form, skills: form.skills.filter(s => s !== skill) })
  }

  // Sidebar order management functions
  const movePageUp = (pageId: string) => {
    const currentOrder = [...form.sidebarOrder]
    const index = currentOrder.indexOf(pageId)
    if (index > 0) {
      [currentOrder[index], currentOrder[index - 1]] = [currentOrder[index - 1], currentOrder[index]]
      setForm({ ...form, sidebarOrder: currentOrder })
    }
  }

  const movePageDown = (pageId: string) => {
    const currentOrder = [...form.sidebarOrder]
    const index = currentOrder.indexOf(pageId)
    if (index >= 0 && index < currentOrder.length - 1) {
      [currentOrder[index], currentOrder[index + 1]] = [currentOrder[index + 1], currentOrder[index]]
      setForm({ ...form, sidebarOrder: currentOrder })
    }
  }

  const saveUser = async () => {
    setError(null)
    setSaving(true)

    try {
      // Check permissions first - with better error message
      if (!hasPermission('manage_users')) {
        setError('ليس لديك صلاحية لإدارة المستخدمين. يرجى التواصل مع المسؤول.')
        console.error('Permission check failed:', {
          hasPermission: hasPermission('manage_users'),
          profile: profile,
          profileRole: profile?.role
        })
        setSaving(false)
        return
      }
      
      // Validate form
      if (!form.name.trim()) {
        setError('الاسم مطلوب')
        setSaving(false)
        return
      }

      if (editingUser) {
        // Update existing user
        const { error } = await supabase
          .from('users')
          .update({
            name: sanitizeText(form.name),
            role: form.role,
            allowed_pages: form.role === 'Owner' ? null : form.allowedPages,
            sidebar_order: form.sidebarOrder.length > 0 ? form.sidebarOrder : null,
          })
          .eq('id', editingUser.id)

        if (error) {
          const errorCode = (error as any).code || ''
          const errorStatus = (error as any).status || ''
          if (errorCode === 'PGRST301' || errorCode === '42501' || errorStatus === 403 || error.message?.includes('403') || error.message?.includes('permission')) {
            setError('ليس لديك صلاحية لتعديل المستخدمين. يرجى التواصل مع المسؤول.')
          } else {
            setError('خطأ في تحديث المستخدم. يرجى المحاولة مرة أخرى.')
          }
          setSaving(false)
          return
        }

        // Save/update worker profile if role is Worker
        if (form.role === 'Worker' && form.worker_type) {
          const existingProfile = workerProfiles.get(editingUser.id)
          const workerData = {
            user_id: editingUser.id,
            worker_type: sanitizeText(form.worker_type),
            region: form.region ? sanitizeText(form.region) : null,
            skills: form.skills.length > 0 ? form.skills.map(s => sanitizeText(s)) : null,
            notes: form.worker_notes ? sanitizeText(form.worker_notes) : null,
          }

          if (existingProfile) {
            await supabase
              .from('worker_profiles')
              .update(workerData)
              .eq('id', existingProfile.id)
          } else {
            await supabase
              .from('worker_profiles')
              .insert([workerData])
          }
        } else if (form.role === 'Owner') {
          // Remove worker profile if changed to Owner
          const existingProfile = workerProfiles.get(editingUser.id)
          if (existingProfile) {
            await supabase
              .from('worker_profiles')
              .delete()
              .eq('id', existingProfile.id)
          }
        }

        setDialogOpen(false)
        setForm({ 
          name: '', 
          email: '', 
          password: '', 
          role: 'Worker', 
          allowedPages: [],
          sidebarOrder: [],
          worker_type: '',
          region: '',
          skills: [],
          worker_notes: '',
        })
        await fetchUsers()
      } else {
        // Create new user with Supabase Auth
        // Password is optional - will generate random password if not provided

        // Validate and sanitize email
        let cleanEmail = form.email.trim().toLowerCase()
        
        if (!cleanEmail) {
          setError('البريد الإلكتروني مطلوب')
          setSaving(false)
          return
        }

        // Remove any potentially problematic characters but keep email structure
        cleanEmail = cleanEmail.replace(/[<>]/g, '').slice(0, 254)

        // Better email validation regex - RFC 5322 compliant
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
        if (!emailRegex.test(cleanEmail)) {
          setError('البريد الإلكتروني غير صالح. يرجى إدخال بريد إلكتروني صحيح (مثال: user@example.com)')
          setSaving(false)
          return
        }
        
        // Additional validation: check for common issues
        if (cleanEmail.includes('..') || cleanEmail.startsWith('.') || cleanEmail.endsWith('.')) {
          setError('البريد الإلكتروني غير صالح. لا يمكن أن يبدأ أو ينتهي بنقطة أو يحتوي على نقطتين متتاليتين')
          setSaving(false)
          return
        }
        
        // Check for spaces
        if (cleanEmail.includes(' ')) {
          setError('البريد الإلكتروني غير صالح. لا يمكن أن يحتوي على مسافات')
          setSaving(false)
          return
        }

        // Check if email already exists in users table
        const { data: existingUsers, error: checkError } = await supabase
          .from('users')
          .select('id, email')
          .eq('email', cleanEmail)
          .limit(1)

        if (checkError) {
          const errorCode = (checkError as any).code || ''
          const errorStatus = (checkError as any).status || ''
          if (errorCode === 'PGRST301' || errorCode === '42501' || errorStatus === 403 || checkError.message?.includes('403') || checkError.message?.includes('permission')) {
            setError('ليس لديك صلاحية للوصول إلى جدول المستخدمين. يرجى التواصل مع المسؤول.')
          } else {
            setError('خطأ في التحقق من البريد الإلكتروني. يرجى المحاولة مرة أخرى.')
          }
          setSaving(false)
          return
        }

        if (existingUsers && existingUsers.length > 0) {
          setError('البريد الإلكتروني مستخدم بالفعل')
          setSaving(false)
          return
        }

        // Final validation: ensure email is properly formatted and doesn't have hidden characters
        // Remove any non-printable characters
        cleanEmail = cleanEmail.replace(/[\x00-\x1F\x7F]/g, '')
        
        // Double-check email format one more time
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          setError('البريد الإلكتروني غير صالح. يرجى التحقق من صحة البريد الإلكتروني')
          setSaving(false)
          return
        }

        // Password validation - password is required for signup
        // Generate secure random password if not provided (min 12 chars with special chars)
        let userPassword = form.password && form.password.trim().length >= 6
          ? form.password.trim()
          : null
        
        if (!userPassword) {
          // Generate secure random password: 12 chars with letters, numbers, and special chars
          const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
          userPassword = ''
          for (let i = 0; i < 12; i++) {
            userPassword += chars.charAt(Math.floor(Math.random() * chars.length))
          }
        }
        
        // Validate password meets Supabase requirements (min 6 chars)
        if (userPassword.length < 6) {
          setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل')
          setSaving(false)
          return
        }

        // IMPORTANT: Save current admin session BEFORE signup
        // signUp() automatically logs in as the new user, which logs out the admin
        const { data: currentSession } = await supabase.auth.getSession()
        const adminAccessToken = currentSession?.session?.access_token
        const adminRefreshToken = currentSession?.session?.refresh_token
        
        // Create auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: userPassword,
          options: {
            data: {
              name: form.name.trim(),
              role: form.role,
            },
            emailRedirectTo: undefined, // Don't send confirmation email
          },
        })
        
        // IMMEDIATELY restore admin session after signup
        // This prevents the auto-login as the new user
        if (adminAccessToken && adminRefreshToken) {
          await supabase.auth.setSession({
            access_token: adminAccessToken,
            refresh_token: adminRefreshToken,
          })
        }

        if (authError) {
          // Provide more specific error messages
          let errorMessage = 'خطأ في إنشاء الحساب. يرجى المحاولة مرة أخرى.'
          
          const errorMsg = authError.message.toLowerCase()
          const errorCode = (authError as any).status || (authError as any).code || ''
          
          // Check for specific error types
          if (errorMsg.includes('already registered') || errorMsg.includes('already exists') || errorMsg.includes('user already') || errorCode === 'user_already_registered') {
            errorMessage = 'البريد الإلكتروني مستخدم بالفعل في نظام المصادقة'
          } else if (errorMsg.includes('invalid email') || errorMsg.includes('email') || errorCode === 'invalid_email') {
            // If email validation passed our checks but Supabase rejects it, provide more context
            errorMessage = `البريد الإلكتروني "${cleanEmail}" غير مقبول من قبل النظام. يرجى التحقق من صحة البريد الإلكتروني أو استخدام بريد إلكتروني آخر.`
          } else if (errorMsg.includes('password') || errorMsg.includes('weak') || errorCode === 'weak_password') {
            errorMessage = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'
          } else if (errorMsg.includes('signup_disabled') || errorCode === 'signup_disabled') {
            errorMessage = 'إنشاء الحسابات معطل حالياً'
          } else if (errorMsg.includes('rate limit') || errorCode === 'too_many_requests') {
            errorMessage = 'تم تجاوز الحد المسموح. يرجى المحاولة لاحقاً'
          } else if (errorCode === 400 || errorCode === 422) {
            errorMessage = `خطأ في البيانات المرسلة: ${errorMsg}. يرجى التحقق من جميع الحقول.`
          } else if (errorCode === 422) {
            errorMessage = `خطأ في التحقق من البيانات: ${errorMsg}. قد يكون البريد الإلكتروني غير صالح أو هناك مشكلة في الإعدادات.`
          }
          
          console.error('Signup error details:', {
            message: authError.message,
            code: errorCode,
            email: cleanEmail,
            fullError: authError
          })
          setError(errorMessage)
          setSaving(false)
          return
        }

        if (!authData.user) {
          setError('فشل إنشاء المستخدم. لم يتم إنشاء حساب المصادقة')
          setSaving(false)
          return
        }

        // Wait and retry to ensure auth.users record is fully committed
        let userError = null
        let retries = 0
        const maxRetries = 5
        
        while (retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retries + 1)))
          
          const { error } = await supabase.from('users').insert([
          {
            id: authData.user.id,
            name: sanitizeText(form.name),
            email: cleanEmail,
            role: form.role,
            allowed_pages: form.role === 'Owner' ? null : form.allowedPages,
            sidebar_order: form.sidebarOrder.length > 0 ? form.sidebarOrder : null,
          },
        ])

          if (!error) {
            userError = null
            break
          }
          
          userError = error
          retries++
          
          // If it's not a foreign key error, stop retrying
          if (!error.message.includes('foreign key') && !error.message.includes('users_id_fkey')) {
            break
          }
        }

        if (userError) {
          // Check if it's a permission error
          const errorCode = (userError as any).code || ''
          const errorStatus = (userError as any).status || ''
          const errorMessage = userError.message || ''
          
          if (errorCode === 'PGRST301' || errorCode === '42501' || errorStatus === 403 || errorMessage.includes('403') || errorMessage.includes('permission') || errorMessage.includes('row-level security')) {
            setError('ليس لديك صلاحية لإضافة مستخدمين في قاعدة البيانات. يرجى التواصل مع المسؤول لإصلاح صلاحيات الوصول (RLS policies).')
          } else {
            // Use generic error message to avoid leaking database details
            setError(`خطأ في حفظ بيانات المستخدم: ${errorMessage}. يرجى المحاولة مرة أخرى أو التواصل مع المسؤول.`)
          }
          console.error('Error inserting user:', {
            code: errorCode,
            status: errorStatus,
            message: errorMessage,
            fullError: userError
          })
          
          // IMPORTANT: Restore admin session if insert failed
          // The signUp might have changed the session
          try {
            if (adminAccessToken && adminRefreshToken) {
              await supabase.auth.setSession({
                access_token: adminAccessToken,
                refresh_token: adminRefreshToken,
              })
            }
          } catch (cleanupError) {
            console.warn('Could not restore admin session:', cleanupError)
          }
          
          setSaving(false)
          return
        }

        // Create worker profile if role is Worker
        if (form.role === 'Worker' && form.worker_type && authData.user) {
          try {
            await supabase
              .from('worker_profiles')
              .insert([{
                user_id: authData.user.id,
                worker_type: sanitizeText(form.worker_type),
                region: form.region ? sanitizeText(form.region) : null,
                skills: form.skills.length > 0 ? form.skills.map(s => sanitizeText(s)) : null,
                notes: form.worker_notes ? sanitizeText(form.worker_notes) : null,
              }])
          } catch (workerError) {
            console.error('Error creating worker profile:', workerError)
            // Don't fail the whole operation if worker profile creation fails
          }
        }

        // Success
        setDialogOpen(false)
        setForm({ 
          name: '', 
          email: '', 
          password: '', 
          role: 'Worker', 
          allowedPages: [],
          sidebarOrder: [],
          worker_type: '',
          region: '',
          skills: [],
          worker_notes: '',
        })
        setError(null)
        await fetchUsers()
      }
    } catch (error: any) {
      // Provide specific error messages based on error type
      if (error?.message) {
        setError(error.message)
      } else if (error?.code === 'PGRST301' || error?.code === '42501' || error?.status === 403) {
        setError('ليس لديك صلاحية لإجراء هذه العملية. يرجى التواصل مع المسؤول.')
      } else {
        setError('خطأ في حفظ بيانات المستخدم. يرجى المحاولة مرة أخرى.')
      }
      console.error('Error saving user:', error)
    } finally {
      setSaving(false)
    }
  }

  const deleteUser = async (userId: string) => {
    if (userId === profile?.id) {
      setError('لا يمكنك حذف حسابك الخاص')
      return
    }

    setUserToDelete(userId)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!userToDelete) return

    try {
      // Delete from users table
      // Note: Deleting from auth.users requires admin privileges and should be done server-side
      // For now, deleting from users table is sufficient as RLS policies will prevent login
      // if the user doesn't exist in the users table
      const { error: deleteError } = await supabase
        .from('users')
        .delete()
        .eq('id', userToDelete)

      if (deleteError) {
        // Check if it's a foreign key constraint error
        if (deleteError.message?.includes('foreign key') || deleteError.message?.includes('constraint')) {
          throw new Error('لا يمكن حذف المستخدم لأنه مرتبط بسجلات أخرى (مبيعات، دفعات، إلخ)')
        }
        throw deleteError
      }

      fetchUsers()
      setDeleteConfirmOpen(false)
      setUserToDelete(null)
    } catch (error: any) {
      console.error('Error deleting user:', error)
      setError(error?.message || 'خطأ في حذف المستخدم. قد يكون المستخدم مرتبطاً بسجلات أخرى.')
      setDeleteConfirmOpen(false)
      setUserToDelete(null)
    }
  }


  if (!hasPermission('manage_users')) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">
          You don't have permission to manage users.
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading users...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">إدارة المستخدمين</h1>
          <p className="text-muted-foreground text-sm sm:text-base">إدارة مستخدمي النظام وأدوارهم</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button onClick={() => openDialog()} className="flex-1 sm:flex-none">
          <Plus className="mr-2 h-4 w-4" />
            إضافة مستخدم
          </Button>
          <Button 
            variant="outline" 
            onClick={() => window.location.href = '/permissions'} 
            className="flex-1 sm:flex-none"
          >
            <Shield className="mr-2 h-4 w-4" />
            إدارة الصلاحيات
        </Button>
        </div>
      </div>

      {/* Role Overview */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Owners</CardTitle>
            <Shield className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === 'Owner').length}
            </div>
            <p className="text-xs text-muted-foreground">Full system access</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Workers</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === 'Worker').length}
            </div>
            <p className="text-xs text-muted-foreground">System workers</p>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Card View / Desktop Table View */}
      {users.length === 0 ? (
      <Card>
        <CardHeader>
          <CardTitle>جميع المستخدمين</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-center text-muted-foreground py-8">لا يوجد مستخدمين</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="space-y-3 md:hidden">
            {users.map((user) => {
              const stats = userStats.get(user.id)
              return (
                <Card key={user.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div 
                          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                          onClick={() => openUserDetails(user)}
                        >
                          <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm">{user.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                          </div>
                          {user.id === profile?.id && (
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              أنت
                            </Badge>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <Badge variant={roleColors[user.role]} className="text-xs">
                          {user.role === 'Owner' ? 'مالك' : 'عامل'}
                        </Badge>
                      </div>
                      
                      {stats && (
                        <div className="text-xs space-y-1 bg-muted/50 p-2 rounded">
                          <div className="text-muted-foreground">
                            أنشأ: <span className="font-medium">{stats.salesCreated}</span> | 
                            أكد: <span className="font-medium">{stats.salesConfirmed}</span>
                          </div>
                          {stats.lastActivity && (
                            <div className="text-muted-foreground">
                              آخر نشاط: {formatDate(stats.lastActivity)}
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center gap-2 pt-2 border-t">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs h-8"
                          onClick={() => openUserDetails(user)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          التفاصيل
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs h-8"
                          onClick={() => openDialog(user)}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          تعديل
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8"
                          onClick={() => deleteUser(user.id)}
                          disabled={user.id === profile?.id}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Desktop Table View */}
          <Card className="hidden md:block">
            <CardHeader>
              <CardTitle>جميع المستخدمين</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>البريد الإلكتروني</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>الإحصائيات</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div 
                        className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => openUserDetails(user)}
                      >
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="hover:underline">{user.name}</span>
                        {user.id === profile?.id && (
                          <Badge variant="outline" className="ml-2">
                            أنت
                          </Badge>
                        )}
                        {workerProfiles.has(user.id) && (
                          <Badge variant="secondary" className="ml-2 flex items-center gap-1">
                            <Briefcase className="h-3 w-3" />
                            {workerProfiles.get(user.id)?.worker_type || 'عامل'}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={roleColors[user.role]}>
                        {user.role === 'Owner' ? 'مالك' : 'عامل'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const stats = userStats.get(user.id)
                        return stats ? (
                          <div className="flex flex-col gap-1 text-xs">
                            <span className="text-muted-foreground">
                              أنشأ: {stats.salesCreated} | أكد: {stats.salesConfirmed}
                            </span>
                            {stats.lastActivity && (
                              <span className="text-muted-foreground">
                                آخر نشاط: {formatDate(stats.lastActivity)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDialog(user)}
                          title="تعديل"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteUser(user.id)}
                          disabled={user.id === profile?.id}
                          title="حذف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
        </CardContent>
      </Card>
        </>
      )}

      {/* User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) {
          setError(null)
          setForm({ 
            name: '', 
            email: '', 
            password: '', 
            role: 'Worker', 
            allowedPages: [],
            sidebarOrder: [],
            worker_type: '',
            region: '',
            skills: [],
            worker_notes: '',
          })
          setEditingUser(null)
          setSkillInput('')
        }
      }}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4">
            {error && (
              <div className="bg-destructive/10 border-2 border-destructive/30 text-destructive p-3 sm:p-4 rounded-lg text-xs sm:text-sm flex items-start gap-2 shadow-md">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p className="flex-1 font-medium break-words">{error}</p>
              </div>
            )}
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="name" className="text-xs sm:text-sm">الاسم</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value })
                  setError(null)
                }}
                placeholder="أدخل اسم المستخدم"
                disabled={saving}
                maxLength={255}
                className="text-xs sm:text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="email" className="text-xs sm:text-sm">البريد الإلكتروني</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => {
                  setForm({ ...form, email: e.target.value })
                  setError(null)
                }}
                disabled={!!editingUser || saving}
                placeholder="user@example.com"
                maxLength={254}
                className="text-xs sm:text-sm"
              />
            </div>
            {!editingUser && (
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="password" className="text-xs sm:text-sm">كلمة المرور (اختياري)</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => {
                    setForm({ ...form, password: e.target.value })
                    setError(null)
                  }}
                  placeholder="اتركه فارغاً لإنشاء كلمة مرور عشوائية"
                  disabled={saving}
                  maxLength={72}
                  className="text-xs sm:text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  إذا تركت الحقل فارغاً، سيتم إنشاء كلمة مرور عشوائية تلقائياً
                </p>
              </div>
            )}

            {/* Role field - Only show when editing existing user */}
            {editingUser && (
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="role" className="text-xs sm:text-sm">الدور</Label>
                <Select
                  value={form.role}
                  onChange={(e) => {
                    // Prevent changing to Owner if user is not already Owner
                    if (editingUser.role !== 'Owner' && e.target.value === 'Owner') {
                      return
                    }
                    setForm({ ...form, role: e.target.value as UserRole })
                  }}
                  disabled={saving || editingUser.role !== 'Owner'}
                  className="text-xs sm:text-sm"
                >
                  <option value="Worker">عامل (Worker)</option>
                  <option 
                    value="Owner" 
                    disabled={editingUser.role !== 'Owner'}
                  >
                    {editingUser.role === 'Owner' 
                      ? 'مالك (Owner)' 
                      : 'مالك (Owner) - يتم إنشاؤه فقط في Supabase'}
                  </option>
                </Select>
                {editingUser.role !== 'Owner' && (
                  <p className="text-xs text-muted-foreground">
                    ملاحظة: لا يمكن تغيير دور المستخدم إلى مالك. المالك يتم إنشاؤه فقط مباشرة في Supabase.
                  </p>
                )}
              </div>
            )}

            {/* Worker Profile Section - Show for Worker role (always for new users, conditionally for editing) */}
            {(!editingUser || form.role === 'Worker') && (
              <div className="space-y-2 sm:space-y-3 border-t pt-3 sm:pt-4 mt-3 sm:mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Briefcase className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                  <Label className="text-sm sm:text-base font-semibold">
                    معلومات العامل
                  </Label>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="worker_type" className="text-xs sm:text-sm">نوع العامل *</Label>
                    <Input
                      id="worker_type"
                      value={form.worker_type}
                      onChange={(e) => setForm({ ...form, worker_type: e.target.value })}
                      placeholder="مثال: محامي، بائع، وكيل، مدير..."
                      disabled={saving}
                      className="text-xs sm:text-sm"
                    />
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="region" className="text-xs sm:text-sm">المنطقة / المحافظة</Label>
                    <Input
                      id="region"
                      value={form.region}
                      onChange={(e) => setForm({ ...form, region: e.target.value })}
                      placeholder="مثال: تونس، أريانة..."
                      disabled={saving}
                      className="text-xs sm:text-sm"
                    />
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label className="text-xs sm:text-sm">المهارات</Label>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={skillInput}
                        onChange={(e) => setSkillInput(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addSkill()
                          }
                        }}
                        placeholder="أضف مهارة واضغط Enter"
                        disabled={saving}
                        className="text-xs sm:text-sm"
                      />
                      <Button type="button" onClick={addSkill} size="sm" disabled={saving}>
                        إضافة
                      </Button>
                    </div>
                    {form.skills.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {form.skills.map((skill, idx) => (
                          <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                            {skill}
                            <button
                              type="button"
                              onClick={() => removeSkill(skill)}
                              className="ml-1 hover:text-destructive"
                              disabled={saving}
                            >
                              <XCircle className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="worker_notes" className="text-xs sm:text-sm">ملاحظات</Label>
                    <Textarea
                      id="worker_notes"
                      value={form.worker_notes}
                      onChange={(e) => setForm({ ...form, worker_notes: e.target.value })}
                      placeholder="ملاحظات إضافية..."
                      disabled={saving}
                      rows={3}
                      className="text-xs sm:text-sm min-h-[70px]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Page Permissions Section - Only show for non-Owner roles */}
            {form.role !== 'Owner' && (
              <div className="space-y-2 sm:space-y-3 border-t pt-3 sm:pt-4 mt-3 sm:mt-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <Label className="text-sm sm:text-base font-semibold flex items-center gap-2">
                    <Lock className="h-3 w-3 sm:h-4 sm:w-4" />
                    الصفحات المتاحة
                  </Label>
                  <div className="flex gap-2 w-full sm:w-auto">
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={selectAllPages}
                      disabled={saving}
                      className="flex-1 sm:flex-none text-xs"
                    >
                      <Eye className="h-3 w-3 mr-1" />
                      تحديد الكل
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={deselectAllPages}
                      disabled={saving}
                      className="flex-1 sm:flex-none text-xs"
                    >
                      <EyeOff className="h-3 w-3 mr-1" />
                      إلغاء الكل
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  اختر الصفحات التي يمكن للمستخدم الوصول إليها
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-64 sm:max-h-80 overflow-y-auto p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200">
                  {ALL_PAGES.map(page => {
                    const PageIcon = page.icon
                    const isSelected = form.allowedPages?.includes(page.id) || false
                    return (
                      <div
                        key={page.id}
                        className={`flex flex-col items-center gap-2 p-3 sm:p-4 rounded-lg cursor-pointer transition-all min-h-[100px] ${
                          isSelected 
                            ? 'bg-primary/10 border-2 border-primary shadow-md' 
                            : 'bg-white border-2 border-gray-200 hover:border-gray-300 hover:shadow-sm'
                        }`}
                        onClick={() => !saving && togglePageAccess(page.id)}
                      >
                        <div className={`p-2 sm:p-2.5 rounded-lg ${isSelected ? 'bg-primary text-white' : 'bg-gray-100'}`}>
                          <PageIcon className="h-5 w-5 sm:h-6 sm:w-6" />
                        </div>
                        <div className="flex-1 min-w-0 text-center">
                          <p className={`text-xs sm:text-sm font-medium ${isSelected ? 'text-primary font-semibold' : 'text-gray-700'}`}>
                            {page.name}
                          </p>
                        </div>
                        <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'border-primary bg-primary' : 'border-gray-300'
                        }`}>
                          {isSelected && <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-white" />}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {form.allowedPages?.length || 0} من {ALL_PAGES.length} صفحة محددة
                </p>
              </div>
            )}

            {form.role === 'Owner' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 sm:p-3 mt-3 sm:mt-4">
                <p className="text-xs sm:text-sm text-green-800 flex items-center gap-2">
                  <Shield className="h-3 w-3 sm:h-4 sm:w-4" />
                  المالك لديه صلاحية الوصول الكامل لجميع الصفحات
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setDialogOpen(false)
                setError(null)
              }}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button onClick={saveUser} disabled={saving} className="w-full sm:w-auto">
              {saving ? 'جاري الحفظ...' : editingUser ? 'حفظ التغييرات' : 'إضافة المستخدم'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Details Dialog - Redesigned */}
      <Dialog open={userDetailsOpen} onOpenChange={(open) => {
        setUserDetailsOpen(open)
        if (!open) {
          setSelectedUserForDetails(null)
          setUserCreatedSales([])
          setUserConfirmedSales([])
          setUserPayments([])
          setUserClients([])
          setUserLandBatches([])
          setUserReservations([])
          setUserActivityLogs([])
          setActivityFilter('all')
          setActivityDateFilter('all')
          setDetailsTab('overview')
        }
      }}>
        <DialogContent className="w-[95vw] sm:w-full max-w-5xl max-h-[95vh] overflow-hidden flex flex-col">
          {selectedUserForDetails && (
            <>
              {/* Header with User Info */}
              <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                  {selectedUserForDetails.name.charAt(0).toUpperCase()}
                    </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-gray-900">{selectedUserForDetails.name}</h2>
                  <p className="text-sm text-gray-600">{selectedUserForDetails.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={roleColors[selectedUserForDetails.role]} className="text-xs">
                        {selectedUserForDetails.role === 'Owner' ? 'مالك' : 'عامل'}
                      </Badge>
                    </div>
                  </div>
                <div className="text-left">
                  <p className="text-xs text-gray-500">تاريخ الانضمام</p>
                  <p className="text-sm font-medium">{formatDate(selectedUserForDetails.created_at)}</p>
                </div>
              </div>

              {/* Stats Summary - Quick Glance */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 py-3">
                <div className="text-center p-2 bg-blue-50 rounded-lg">
                  <ShoppingCart className="h-4 w-4 text-blue-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-blue-900">{userCreatedSales.length}</p>
                  <p className="text-[10px] text-blue-700">مبيعات</p>
                        </div>
                <div className="text-center p-2 bg-green-50 rounded-lg">
                  <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-green-900">{userConfirmedSales.length}</p>
                  <p className="text-[10px] text-green-700">مؤكدة</p>
                        </div>
                <div className="text-center p-2 bg-purple-50 rounded-lg">
                  <CreditCard className="h-4 w-4 text-purple-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-purple-900">{userPayments.length}</p>
                  <p className="text-[10px] text-purple-700">دفعات</p>
                  </div>
                <div className="text-center p-2 bg-indigo-50 rounded-lg">
                  <UsersIcon className="h-4 w-4 text-indigo-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-indigo-900">{userClients.length}</p>
                  <p className="text-[10px] text-indigo-700">عملاء</p>
                </div>
                <div className="text-center p-2 bg-teal-50 rounded-lg">
                  <MapIcon className="h-4 w-4 text-teal-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-teal-900">{userLandBatches.length}</p>
                  <p className="text-[10px] text-teal-700">أراضي</p>
                </div>
                <div className="text-center p-2 bg-orange-50 rounded-lg">
                  <Calendar className="h-4 w-4 text-orange-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-orange-900">{userReservations.length}</p>
                  <p className="text-[10px] text-orange-700">حجوزات</p>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="flex gap-1 border-b overflow-x-auto pb-0">
                {[
                  { id: 'overview', label: 'نظرة عامة', icon: Activity },
                  { id: 'sales', label: 'المبيعات', icon: ShoppingCart, count: userCreatedSales.length + userConfirmedSales.length },
                  { id: 'payments', label: 'المدفوعات', icon: CreditCard, count: userPayments.length },
                  { id: 'clients', label: 'العملاء', icon: UsersIcon, count: userClients.length },
                  { id: 'activity', label: 'السجل', icon: FileText },
                ].map(tab => {
                  const TabIcon = tab.icon
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setDetailsTab(tab.id as any)}
                      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                        detailsTab === tab.id
                          ? 'bg-primary text-white'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      <TabIcon className="h-3.5 w-3.5" />
                      {tab.label}
                      {tab.count !== undefined && tab.count > 0 && (
                        <span className={`text-[10px] px-1.5 rounded-full ${
                          detailsTab === tab.id ? 'bg-white/20' : 'bg-gray-200'
                        }`}>
                          {tab.count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-1">
              {loadingDetails ? (
                  <div className="flex items-center justify-center h-40">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
              ) : (
                <>
                    {/* Overview Tab */}
                    {detailsTab === 'overview' && (
                      <div className="space-y-4">
                        {/* Financial Summary */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-4 rounded-xl">
                            <p className="text-sm opacity-80">إجمالي المبيعات</p>
                            <p className="text-2xl font-bold">
                              {formatCurrency(userCreatedSales.reduce((sum, s) => sum + (s.total_selling_price || 0), 0))}
                            </p>
                            <p className="text-xs opacity-70 mt-1">{userCreatedSales.length} عملية بيع</p>
                          </div>
                          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-4 rounded-xl">
                            <p className="text-sm opacity-80">إجمالي المدفوعات</p>
                            <p className="text-2xl font-bold">
                              {formatCurrency(userPayments.reduce((sum, p) => sum + (p.amount_paid || 0), 0))}
                            </p>
                            <p className="text-xs opacity-70 mt-1">{userPayments.length} دفعة</p>
                          </div>
                        </div>

                        {/* Recent Activity */}
                        <div>
                          <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                            <Activity className="h-4 w-4" />
                            آخر النشاطات
                          </h4>
                          <div className="space-y-2 max-h-60 overflow-y-auto">
                            {[...userCreatedSales.slice(0, 3), ...userPayments.slice(0, 3), ...userClients.slice(0, 2)]
                              .sort((a, b) => new Date(b.created_at || b.sale_date).getTime() - new Date(a.created_at || a.sale_date).getTime())
                              .slice(0, 5)
                              .map((item: any, idx) => (
                                <div key={idx} className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg text-sm">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                                    item.sale_date ? 'bg-blue-100 text-blue-600' :
                                    item.amount_paid ? 'bg-purple-100 text-purple-600' :
                                    'bg-indigo-100 text-indigo-600'
                                  }`}>
                                    {item.sale_date ? <ShoppingCart className="h-4 w-4" /> :
                                     item.amount_paid ? <CreditCard className="h-4 w-4" /> :
                                     <UsersIcon className="h-4 w-4" />}
                                  </div>
                                  <div className="flex-1">
                                    <p className="font-medium text-xs">
                                      {item.sale_date ? `بيع - ${item.client?.name || 'عميل'}` :
                                       item.amount_paid ? `دفعة - ${formatCurrency(item.amount_paid)}` :
                                       `عميل جديد - ${item.name}`}
                                    </p>
                                    <p className="text-[10px] text-gray-500">
                                      {formatDate(item.created_at || item.sale_date)}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            {userCreatedSales.length === 0 && userPayments.length === 0 && userClients.length === 0 && (
                              <p className="text-center text-gray-500 text-sm py-4">لا يوجد نشاط بعد</p>
                            )}
                        </div>
                        </div>

                        {/* Allowed Pages */}
                        {selectedUserForDetails.role !== 'Owner' && (
                          <div>
                            <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                              <Lock className="h-4 w-4" />
                              الصفحات المتاحة
                            </h4>
                            <div className="flex flex-wrap gap-1">
                              {((selectedUserForDetails as any).allowed_pages || []).map((pageId: string) => {
                                const page = ALL_PAGES.find(p => p.id === pageId)
                                if (!page) return null
                                const PageIcon = page.icon
                                return (
                                  <div key={pageId} className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-full text-xs">
                                    <PageIcon className="h-3 w-3" />
                                    {page.name}
                                  </div>
                                )
                              })}
                              {(!(selectedUserForDetails as any).allowed_pages || (selectedUserForDetails as any).allowed_pages?.length === 0) && (
                                <p className="text-xs text-gray-500">لم يتم تحديد صفحات</p>
                              )}
                            </div>
                          </div>
                        )}
                        {selectedUserForDetails.role === 'Owner' && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                            <p className="text-sm text-green-800 flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              المالك لديه صلاحية الوصول الكامل لجميع الصفحات
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Sales Tab */}
                    {detailsTab === 'sales' && (
                      <div className="space-y-3">
                        {userCreatedSales.length === 0 && userConfirmedSales.length === 0 ? (
                          <p className="text-center text-gray-500 py-8">لا توجد مبيعات</p>
                        ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-50">
                                  <TableHead className="text-xs">التاريخ</TableHead>
                                  <TableHead className="text-xs">العميل</TableHead>
                                  <TableHead className="text-xs">النوع</TableHead>
                                  <TableHead className="text-xs text-right">المبلغ</TableHead>
                                  <TableHead className="text-xs">الحالة</TableHead>
                                  <TableHead className="text-xs">الإجراء</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                                {[...userCreatedSales, ...userConfirmedSales.filter(cs => !userCreatedSales.find(s => s.id === cs.id))]
                                  .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime())
                                  .map((sale: any) => (
                                    <TableRow key={sale.id} className="text-xs">
                                      <TableCell className="py-2">{formatDate(sale.sale_date)}</TableCell>
                                      <TableCell className="py-2">{sale.client?.name || '-'}</TableCell>
                                      <TableCell className="py-2">
                                        <Badge variant={sale.payment_type === 'Full' ? 'success' : 'secondary'} className="text-[10px]">
                                          {sale.payment_type === 'Full' ? 'حاضر' : 'تقسيط'}
                                    </Badge>
                                  </TableCell>
                                      <TableCell className="py-2 text-right font-medium">{formatCurrency(sale.total_selling_price)}</TableCell>
                                      <TableCell className="py-2">
                                        <Badge variant={sale.status === 'Completed' ? 'success' : sale.status === 'Cancelled' ? 'destructive' : 'warning'} className="text-[10px]">
                                          {sale.status === 'Completed' ? 'مكتمل' : sale.status === 'Cancelled' ? 'ملغي' : 'قيد الدفع'}
                                    </Badge>
                                  </TableCell>
                                      <TableCell className="py-2">
                                        {userCreatedSales.find(s => s.id === sale.id) && (
                                          <Badge variant="outline" className="text-[10px]">أنشأ</Badge>
                                        )}
                                        {userConfirmedSales.find(s => s.id === sale.id) && (
                                          <Badge variant="outline" className="text-[10px] mr-1">أكد</Badge>
                                        )}
                                      </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        )}
                      </div>
                  )}

                    {/* Payments Tab */}
                    {detailsTab === 'payments' && (
                      <div className="space-y-3">
                        {userPayments.length === 0 ? (
                          <p className="text-center text-gray-500 py-8">لا توجد مدفوعات</p>
                        ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                                <TableRow className="bg-gray-50">
                                  <TableHead className="text-xs">التاريخ</TableHead>
                                  <TableHead className="text-xs">العميل</TableHead>
                                  <TableHead className="text-xs">النوع</TableHead>
                                  <TableHead className="text-xs text-right">المبلغ</TableHead>
                                  <TableHead className="text-xs">ملاحظات</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {userPayments.map((payment: any) => (
                                  <TableRow key={payment.id} className="text-xs">
                                    <TableCell className="py-2">{formatDate(payment.payment_date)}</TableCell>
                                    <TableCell className="py-2">{payment.client?.name || '-'}</TableCell>
                                    <TableCell className="py-2">
                                      <Badge variant="secondary" className="text-[10px]">
                                        {payment.payment_type === 'Full' ? 'كامل' :
                                       payment.payment_type === 'Installment' ? 'قسط' :
                                         payment.payment_type === 'BigAdvance' ? 'دفعة' : 'عربون'}
                                    </Badge>
                                  </TableCell>
                                    <TableCell className="py-2 text-right font-medium text-green-600">
                                      +{formatCurrency(payment.amount_paid)}
                                  </TableCell>
                                    <TableCell className="py-2 text-gray-500">{payment.notes || '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        )}
                      </div>
                  )}

                    {/* Clients Tab */}
                    {detailsTab === 'clients' && (
                      <div className="space-y-3">
                        {userClients.length === 0 ? (
                          <p className="text-center text-gray-500 py-8">لا يوجد عملاء</p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {userClients.map((client: any) => (
                              <div key={client.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center font-bold">
                                  {client.name.charAt(0)}
                                </div>
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{client.name}</p>
                                  <p className="text-xs text-gray-500">{client.cin} • {client.phone || 'لا يوجد هاتف'}</p>
                                </div>
                                <p className="text-xs text-gray-400">{formatDate(client.created_at)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Activity Tab */}
                    {detailsTab === 'activity' && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between mb-3">
                        <Select 
                          value={activityFilter} 
                          onChange={(e) => setActivityFilter(e.target.value as any)}
                            className="w-40 text-xs"
                        >
                            <option value="all">كل النشاطات</option>
                          <option value="sales">المبيعات</option>
                          <option value="payments">المدفوعات</option>
                            <option value="clients">العملاء</option>
                            <option value="land">الأراضي</option>
                        </Select>
                      </div>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                        {(() => {
                          const allActivities: any[] = []
                          
                          userCreatedSales.forEach(sale => {
                            allActivities.push({
                                type: 'sale', date: sale.created_at, icon: ShoppingCart, color: 'blue',
                                title: 'بيع جديد', desc: `${sale.client?.name || 'عميل'} - ${formatCurrency(sale.total_selling_price)}`
                            })
                          })
                          userConfirmedSales.forEach(sale => {
                            allActivities.push({
                                type: 'sale', date: sale.updated_at || sale.created_at, icon: CheckCircle2, color: 'green',
                                title: 'تأكيد بيع', desc: `${sale.client?.name || 'عميل'} - ${formatCurrency(sale.total_selling_price)}`
                            })
                          })
                            userPayments.forEach(p => {
                            allActivities.push({
                                type: 'payment', date: p.created_at, icon: CreditCard, color: 'purple',
                                title: 'دفعة', desc: `${p.client?.name || 'عميل'} - ${formatCurrency(p.amount_paid)}`
                            })
                          })
                            userClients.forEach(c => {
                              allActivities.push({
                                type: 'client', date: c.created_at, icon: UsersIcon, color: 'indigo',
                                title: 'عميل جديد', desc: `${c.name} - ${c.cin}`
                              })
                            })
                            userLandBatches.forEach(b => {
                                allActivities.push({
                                type: 'land', date: b.created_at, icon: MapIcon, color: 'teal',
                                title: 'دفعة أراضي', desc: `${b.name} - ${formatCurrency(b.total_cost)}`
                                })
                              })
                            userReservations.forEach(r => {
                                allActivities.push({
                                type: 'land', date: r.created_at, icon: Calendar, color: 'orange',
                                title: 'حجز', desc: `${r.client?.name || 'عميل'} - ${formatCurrency(r.small_advance_amount)}`
                              })
                            })
                            
                          const filtered = activityFilter === 'all' ? allActivities :
                              activityFilter === 'sales' ? allActivities.filter(a => a.type === 'sale') :
                            activityFilter === 'payments' ? allActivities.filter(a => a.type === 'payment') :
                              activityFilter === 'clients' ? allActivities.filter(a => a.type === 'client') :
                              allActivities.filter(a => a.type === 'land')
                          
                            return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 50).map((act, idx) => {
                              const Icon = act.icon
                              const colors: Record<string, string> = {
                                  blue: 'bg-blue-100 text-blue-600',
                                  green: 'bg-green-100 text-green-600',
                                  purple: 'bg-purple-100 text-purple-600',
                                indigo: 'bg-indigo-100 text-indigo-600',
                                teal: 'bg-teal-100 text-teal-600',
                                orange: 'bg-orange-100 text-orange-600',
                                }
                                return (
                                <div key={idx} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${colors[act.color]}`}>
                                      <Icon className="h-4 w-4" />
                                    </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">{act.title}</p>
                                    <p className="text-xs text-gray-500 truncate">{act.desc}</p>
                                      </div>
                                  <p className="text-xs text-gray-400 whitespace-nowrap">{formatDate(act.date)}</p>
                                  </div>
                                )
                            })
                        })()}
                          {userCreatedSales.length === 0 && userPayments.length === 0 && userClients.length === 0 && (
                            <p className="text-center text-gray-500 py-8">لا يوجد نشاط</p>
                          )}
                      </div>
                      </div>
                    )}
                </>
              )}
            </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        description="هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء."
      />

      {/* Status Toggle Confirmation Dialog */}
    </div>
  )
}
