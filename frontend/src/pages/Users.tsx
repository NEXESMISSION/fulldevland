import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
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
import { Plus, Edit, Trash2, User, Shield } from 'lucide-react'
import type { User as UserType, UserRole, UserStatus } from '@/types/database'
import { sanitizeText, sanitizeEmail } from '@/lib/sanitize'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

const roleColors: Record<UserRole, 'default' | 'secondary' | 'destructive'> = {
  Owner: 'default',
  Manager: 'secondary',
  FieldStaff: 'destructive',
}

export function Users() {
  const { hasPermission, profile } = useAuth()
  const [users, setUsers] = useState<UserType[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<string | null>(null)
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false)
  const [userToToggle, setUserToToggle] = useState<UserType | null>(null)

  // User dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserType | null>(null)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'FieldStaff' as UserRole,
    status: 'Active' as UserStatus,
  })

  useEffect(() => {
    if (!hasPermission('manage_users')) return
    fetchUsers()
  }, [hasPermission])

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, status, created_at, updated_at')
        .order('name', { ascending: true })

      if (error) throw error
      setUsers((data as UserType[]) || [])
    } catch (error) {
      // Error fetching users - silent fail
    } finally {
      setLoading(false)
    }
  }

  const openDialog = (user?: UserType) => {
    setError(null) // Clear any previous errors
    if (user) {
      setEditingUser(user)
      setForm({
        name: user.name,
        email: user.email,
        password: '',
        role: user.role,
        status: user.status,
      })
    } else {
      setEditingUser(null)
      setForm({
        name: '',
        email: '',
        password: '',
        role: 'FieldStaff',
        status: 'Active',
      })
    }
    setDialogOpen(true)
  }

  const saveUser = async () => {
    setError(null)
    setSaving(true)

    try {
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
            status: form.status,
          })
          .eq('id', editingUser.id)

        if (error) {
          setError('خطأ في تحديث المستخدم. يرجى المحاولة مرة أخرى.')
          setSaving(false)
          return
        }

        setDialogOpen(false)
        setForm({ name: '', email: '', password: '', role: 'FieldStaff', status: 'Active' })
        await fetchUsers()
      } else {
        // Create new user with Supabase Auth
        if (!form.password) {
          setError('كلمة المرور مطلوبة للمستخدمين الجدد')
          setSaving(false)
          return
        }

        // Validate and sanitize email
        const cleanEmail = sanitizeEmail(form.email)
        
        if (!cleanEmail) {
          setError('البريد الإلكتروني مطلوب')
          setSaving(false)
          return
        }

        // Better email validation regex - more strict
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

        // Check if email already exists
        const { data: existingUsers } = await supabase
          .from('users')
          .select('id, email')
          .eq('email', cleanEmail)
          .limit(1)

        if (existingUsers && existingUsers.length > 0) {
          setError('البريد الإلكتروني مستخدم بالفعل')
          setSaving(false)
          return
        }

        // Validate password - strengthened policy
        if (form.password.length < 8) {
          setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل')
          setSaving(false)
          return
        }

        if (form.password.length > 72) {
          setError('كلمة المرور طويلة جداً (الحد الأقصى 72 حرف)')
          setSaving(false)
          return
        }

        // Password complexity requirements
        const hasUpperCase = /[A-Z]/.test(form.password)
        const hasLowerCase = /[a-z]/.test(form.password)
        const hasNumber = /[0-9]/.test(form.password)
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(form.password)

        if (!hasUpperCase || !hasLowerCase || !hasNumber) {
          setError('كلمة المرور يجب أن تحتوي على حرف كبير وصغير ورقم على الأقل')
          setSaving(false)
          return
        }

        // Create auth user
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: form.password,
          options: {
            data: {
              name: form.name.trim(),
            },
          },
        })

        if (authError) {
          // Generic error messages to avoid leaking information
          let errorMessage = 'خطأ في إنشاء الحساب. يرجى المحاولة مرة أخرى.'
          if (authError.message.includes('already registered')) {
            errorMessage = 'البريد الإلكتروني مستخدم بالفعل'
          } else if (authError.message.includes('invalid email')) {
            errorMessage = 'البريد الإلكتروني غير صالح'
          } else if (authError.message.includes('password')) {
            errorMessage = 'كلمة المرور غير صالحة'
          }
          
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
            status: form.status,
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
          // Note: Cannot delete auth user from frontend (requires service_role key)
          // The auth user will remain orphaned, but this is acceptable
          // In production, use a backend API/Edge Function to handle cleanup
          
          // Use generic error message to avoid leaking database details
          setError('خطأ في حفظ بيانات المستخدم. يرجى المحاولة مرة أخرى.')
          setSaving(false)
          return
        }

        // Success
        setDialogOpen(false)
        setForm({ name: '', email: '', password: '', role: 'FieldStaff', status: 'Active' })
        setError(null)
        await fetchUsers()
      }
    } catch (error: any) {
      // Generic error message to avoid leaking information
      setError('حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.')
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
      const { error } = await supabase.from('users').delete().eq('id', userToDelete)
      if (error) throw error
      fetchUsers()
      setDeleteConfirmOpen(false)
      setUserToDelete(null)
    } catch (error) {
      setError('خطأ في حذف المستخدم')
      setDeleteConfirmOpen(false)
      setUserToDelete(null)
    }
  }

  const toggleStatus = async (user: UserType) => {
    if (user.id === profile?.id) {
      setError('لا يمكنك تغيير حالتك الخاصة')
      return
    }

    setUserToToggle(user)
    setStatusConfirmOpen(true)
  }

  const confirmToggleStatus = async () => {
    if (!userToToggle) return

    try {
      const newStatus = userToToggle.status === 'Active' ? 'Inactive' : 'Active'
      const { error } = await supabase
        .from('users')
        .update({ status: newStatus })
        .eq('id', userToToggle.id)

      if (error) throw error
      fetchUsers()
      setStatusConfirmOpen(false)
      setUserToToggle(null)
    } catch (error) {
      setError('خطأ في تحديث حالة المستخدم')
      setStatusConfirmOpen(false)
      setUserToToggle(null)
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
          <h1 className="text-2xl sm:text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Manage system users and their roles</p>
        </div>
        <Button onClick={() => openDialog()} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4" />
          Add User
        </Button>
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
            <CardTitle className="text-sm font-medium">Managers</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === 'Manager').length}
            </div>
            <p className="text-xs text-muted-foreground">Limited financial access</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Field Staff</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.role === 'FieldStaff').length}
            </div>
            <p className="text-xs text-muted-foreground">Basic operations only</p>
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No users found</p>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {user.name}
                        {user.id === profile?.id && (
                          <Badge variant="outline" className="ml-2">
                            You
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={roleColors[user.role]}>{user.role}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={user.status === 'Active' ? 'success' : 'secondary'}
                        className="cursor-pointer"
                        onClick={() => toggleStatus(user)}
                      >
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDialog(user)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteUser(user.id)}
                          disabled={user.id === profile?.id}
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
          )}
        </CardContent>
      </Card>

      {/* User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open)
        if (!open) {
          setError(null)
          setForm({ name: '', email: '', password: '', role: 'FieldStaff', status: 'Active' })
          setEditingUser(null)
        }
      }}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingUser ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">الاسم</Label>
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
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
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
              />
            </div>
            {!editingUser && (
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(e) => {
                    setForm({ ...form, password: e.target.value })
                    setError(null)
                  }}
                  placeholder="6 أحرف على الأقل"
                  disabled={saving}
                  maxLength={72}
                />
                <p className="text-xs text-muted-foreground">
                  يجب أن تكون كلمة المرور 6 أحرف على الأقل
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="role">الدور</Label>
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
                disabled={saving}
              >
                <option value="Owner">مالك (Owner)</option>
                <option value="Manager">مدير (Manager)</option>
                <option value="FieldStaff">موظف ميداني (Field Staff)</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">الحالة</Label>
              <Select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as UserStatus })}
                disabled={saving}
              >
                <option value="Active">نشط</option>
                <option value="Inactive">غير نشط</option>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setDialogOpen(false)
                setError(null)
              }}
              disabled={saving}
            >
              إلغاء
            </Button>
            <Button onClick={saveUser} disabled={saving}>
              {saving ? 'جاري الحفظ...' : editingUser ? 'حفظ التغييرات' : 'إضافة المستخدم'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
