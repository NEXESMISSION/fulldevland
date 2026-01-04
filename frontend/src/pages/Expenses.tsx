import React, { useEffect, useState, useMemo } from 'react'
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
import { formatCurrency, formatDate } from '@/lib/utils'
import { retryWithBackoff } from '@/lib/retry'
import { Plus, Edit, Trash2, CheckCircle, XCircle, Filter, ChevronDown, ChevronUp, User } from 'lucide-react'
import type { Expense, ExpenseCategory, LandBatch, Sale, PaymentMethod } from '@/types/database'

interface ExpenseWithUser extends Expense {
  submitted_by_user?: { id: string; name: string; email?: string }
}

interface ExpensesByUser {
  userId: string
  userName: string
  totalAmount: number
  expenseCount: number
  dailyExpenses: Map<string, ExpenseWithUser[]>
}

export function Expenses() {
  const { hasPermission, hasPageAccess, profile, user } = useAuth()
  
  // Check if user has explicit page access configured
  const allowedPages = (profile as any)?.allowed_pages as string[] | null | undefined
  const hasExplicitPageAccess = profile?.role !== 'Owner' && 
    Array.isArray(allowedPages) && 
    allowedPages.length > 0
  const canEditExpenses = hasExplicitPageAccess 
    ? hasPageAccess('expenses') // If explicit page access, use page access
    : hasPermission('edit_expenses') // Otherwise use role permission
  const [expenses, setExpenses] = useState<ExpenseWithUser[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set())
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())
  
  // Dialog states
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [expenseForm, setExpenseForm] = useState({
    category_id: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    description: '',
    payment_method: 'Cash' as PaymentMethod,
    related_batch_id: '',
    related_sale_id: '',
    tags: '',
    notes: '',
  })
  
  // Filter states - default to today
  const today = new Date().toISOString().split('T')[0]
  const [filterCategory, setFilterCategory] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPaymentMethod, setFilterPaymentMethod] = useState('all')
  const [dateRangeStart, setDateRangeStart] = useState(today)
  const [dateRangeEnd, setDateRangeEnd] = useState(today)
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('today')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      await retryWithBackoff(async () => {
        const [expensesRes, categoriesRes, batchesRes] = await Promise.all([
          supabase
            .from('expenses')
            .select('*, submitted_by_user:users!expenses_submitted_by_fkey(id, name, email)')
            .order('expense_date', { ascending: false })
            .order('created_at', { ascending: false }),
          supabase
            .from('expense_categories')
            .select('*')
            .order('name'),
          supabase
            .from('land_batches')
            .select('id, name')
            .order('name'),
        ])
        
        if (expensesRes.error) throw expensesRes.error
        if (categoriesRes.error) throw categoriesRes.error
        if (batchesRes.error) throw batchesRes.error
        
        setExpenses(expensesRes.data || [])
        setCategories(categoriesRes.data || [])
        setBatches(batchesRes.data || [])
      }, { maxRetries: 3, timeout: 10000 })
    } catch (err: any) {
      setError(err.message || 'خطأ في تحميل البيانات')
    } finally {
      setLoading(false)
    }
  }

  const openExpenseDialog = (expense?: Expense) => {
    if (expense) {
      setEditingExpense(expense)
      setExpenseForm({
        category_id: expense.category,
        amount: expense.amount.toString(),
        expense_date: expense.expense_date,
        description: expense.description || '',
        payment_method: expense.payment_method,
        related_batch_id: expense.related_batch_id || '',
        related_sale_id: expense.related_sale_id || '',
        tags: expense.tags?.join(', ') || '',
        notes: expense.notes || '',
      })
    } else {
      setEditingExpense(null)
      setExpenseForm({
        category_id: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        description: '',
        payment_method: 'Cash',
        related_batch_id: '',
        related_sale_id: '',
        tags: '',
        notes: '',
      })
    }
    setExpenseDialogOpen(true)
  }

  const saveExpense = async () => {
    if (!canEditExpenses) {
      setError('ليس لديك صلاحية لإضافة المصاريف')
      return
    }

    setError(null)
    try {
      const expenseData: any = {
        category: expenseForm.category_id, // Database column is 'category', not 'category_id'
        amount: parseFloat(expenseForm.amount),
        expense_date: expenseForm.expense_date,
        description: expenseForm.description || null,
        payment_method: expenseForm.payment_method,
        related_batch_id: expenseForm.related_batch_id || null,
        related_sale_id: expenseForm.related_sale_id || null,
        tags: expenseForm.tags ? expenseForm.tags.split(',').map(t => t.trim()).filter(t => t) : null,
        notes: expenseForm.notes || null,
        submitted_by: user?.id,
        status: hasPermission('manage_financial') || profile?.role === 'Owner' ? 'Approved' : 'Pending',
      }

      if (editingExpense) {
        const { error } = await supabase
          .from('expenses')
          .update(expenseData)
          .eq('id', editingExpense.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('expenses')
          .insert([expenseData])
        if (error) throw error
      }

      setExpenseDialogOpen(false)
      fetchData()
      setError(null)
    } catch (err: any) {
      setError(err.message || 'خطأ في حفظ المصروف')
    }
  }

  const approveExpense = async (expenseId: string) => {
    if (!hasPermission('manage_financial')) {
      setError('ليس لديك صلاحية للموافقة على المصاريف')
      return
    }

    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          status: 'Approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', expenseId)
      if (error) throw error
      fetchData()
    } catch (err: any) {
      setError(err.message || 'خطأ في الموافقة على المصروف')
    }
  }

  const rejectExpense = async (expenseId: string, reason: string) => {
    if (!hasPermission('manage_financial')) {
      setError('ليس لديك صلاحية لرفض المصاريف')
      return
    }

    try {
      const { error } = await supabase
        .from('expenses')
        .update({
          status: 'Rejected',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: reason,
        })
        .eq('id', expenseId)
      if (error) throw error
      fetchData()
    } catch (err: any) {
      setError(err.message || 'خطأ في رفض المصروف')
    }
  }

  const deleteExpense = async (expenseId: string) => {
    if (!canEditExpenses) {
      setError('ليس لديك صلاحية لحذف المصاريف')
      return
    }

    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return

    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', expenseId)
      if (error) throw error
      fetchData()
    } catch (err: any) {
      setError(err.message || 'خطأ في حذف المصروف')
    }
  }

  // Calculate statistics
  const stats = useMemo(() => {
    const now = new Date()
    const thisMonth = now.getMonth()
    const thisYear = now.getFullYear()
    
    const filtered = expenses.filter(e => {
      if (filterStatus !== 'all' && e.status !== filterStatus) return false
      if (filterCategory !== 'all' && e.category !== filterCategory) return false
      if (filterPaymentMethod !== 'all' && e.payment_method !== filterPaymentMethod) return false
      if (dateRangeStart && e.expense_date < dateRangeStart) return false
      if (dateRangeEnd && e.expense_date > dateRangeEnd) return false
      if (amountMin && e.amount < parseFloat(amountMin)) return false
      if (amountMax && e.amount > parseFloat(amountMax)) return false
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const category = categories.find(c => c.id === e.category)
        const matches = 
          (category?.name.toLowerCase().includes(search)) ||
          (e.description?.toLowerCase().includes(search)) ||
          (e.notes?.toLowerCase().includes(search)) ||
          (e.tags?.some(t => t.toLowerCase().includes(search)))
        if (!matches) return false
      }
      return true
    })

    const approved = filtered.filter(e => e.status === 'Approved')
    const thisMonthExpenses = approved.filter(e => {
      const date = new Date(e.expense_date)
      return date.getMonth() === thisMonth && date.getFullYear() === thisYear
    })

    const byCategory = new Map<string, number>()
    approved.forEach(e => {
      const current = byCategory.get(e.category) || 0
      byCategory.set(e.category, current + e.amount)
    })

    const topCategories = Array.from(byCategory.entries())
      .map(([id, amount]) => ({
        category: categories.find(c => c.id === id)?.name || 'غير معروف',
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)

    return {
      total: filtered.length,
      totalAmount: filtered.reduce((sum, e) => sum + e.amount, 0),
      approvedCount: approved.length,
      approvedAmount: approved.reduce((sum, e) => sum + e.amount, 0),
      pendingCount: filtered.filter(e => e.status === 'Pending').length,
      thisMonthAmount: thisMonthExpenses.reduce((sum, e) => sum + e.amount, 0),
      topCategories,
    }
  }, [expenses, categories, filterStatus, filterCategory, filterPaymentMethod, dateRangeStart, dateRangeEnd, amountMin, amountMax, searchTerm, dateFilter])

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (filterStatus !== 'all' && e.status !== filterStatus) return false
      if (filterCategory !== 'all' && e.category !== filterCategory) return false
      if (filterPaymentMethod !== 'all' && e.payment_method !== filterPaymentMethod) return false
      if (dateRangeStart && e.expense_date < dateRangeStart) return false
      if (dateRangeEnd && e.expense_date > dateRangeEnd) return false
      if (amountMin && e.amount < parseFloat(amountMin)) return false
      if (amountMax && e.amount > parseFloat(amountMax)) return false
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const category = categories.find(c => c.id === e.category)
        const matches = 
          (category?.name.toLowerCase().includes(search)) ||
          (e.description?.toLowerCase().includes(search)) ||
          (e.notes?.toLowerCase().includes(search)) ||
          (e.tags?.some(t => t.toLowerCase().includes(search)))
        if (!matches) return false
      }
      return true
    })
  }, [expenses, categories, filterStatus, filterCategory, filterPaymentMethod, dateRangeStart, dateRangeEnd, amountMin, amountMax, searchTerm, dateFilter])

  // Group expenses by user
  const expensesByUser = useMemo(() => {
    const userGroups = new Map<string, ExpensesByUser>()
    
    filteredExpenses.forEach(expense => {
      const userId = expense.submitted_by || 'unknown'
      const userName = (expense as ExpenseWithUser).submitted_by_user?.name || 'غير معروف'
      
      if (!userGroups.has(userId)) {
        userGroups.set(userId, {
          userId,
          userName,
          totalAmount: 0,
          expenseCount: 0,
          dailyExpenses: new Map(),
        })
      }
      
      const userGroup = userGroups.get(userId)!
      userGroup.totalAmount += expense.amount
      userGroup.expenseCount++
      
      const dateKey = expense.expense_date
      if (!userGroup.dailyExpenses.has(dateKey)) {
        userGroup.dailyExpenses.set(dateKey, [])
      }
      userGroup.dailyExpenses.get(dateKey)!.push(expense as ExpenseWithUser)
    })
    
    return Array.from(userGroups.values()).sort((a, b) => b.totalAmount - a.totalAmount)
  }, [filteredExpenses])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">المصاريف</h1>
          <p className="text-muted-foreground text-sm sm:text-base">إدارة وتتبع مصاريف الشركة</p>
        </div>
        {canEditExpenses && (
          <Button onClick={() => openExpenseDialog()} size="lg">
            <Plus className="ml-2 h-4 w-4" />
            إضافة مصروف جديد
          </Button>
        )}
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Statistics Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">إجمالي المصاريف</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalAmount)}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.total} مصروف</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">المصاريف المعتمدة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(stats.approvedAmount)}</div>
            <p className="text-xs text-muted-foreground mt-1">{stats.approvedCount} معتمد</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">مصاريف هذا الشهر</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.thisMonthAmount)}</div>
            <p className="text-xs text-muted-foreground mt-1">المصاريف المعتمدة فقط</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">في انتظار الموافقة</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.pendingCount}</div>
            <p className="text-xs text-muted-foreground mt-1">مصروف يحتاج موافقة</p>
          </CardContent>
        </Card>
      </div>

      {/* Top Categories */}
      {stats.topCategories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>أهم الفئات</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topCategories.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <span className="text-sm">{item.category}</span>
                  <span className="font-medium">{formatCurrency(item.amount)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            الفلاتر
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Date Filter - Quick Selection */}
            <div className="space-y-2">
              <Label>الفترة</Label>
              <Select value={dateFilter} onChange={(e) => {
                const filter = e.target.value as 'today' | 'week' | 'month' | 'all'
                setDateFilter(filter)
                const now = new Date()
                const today = now.toISOString().split('T')[0]
                
                if (filter === 'today') {
                  setDateRangeStart(today)
                  setDateRangeEnd(today)
                } else if (filter === 'week') {
                  const weekAgo = new Date(now)
                  weekAgo.setDate(weekAgo.getDate() - 7)
                  setDateRangeStart(weekAgo.toISOString().split('T')[0])
                  setDateRangeEnd(today)
                } else if (filter === 'month') {
                  const monthAgo = new Date(now)
                  monthAgo.setMonth(monthAgo.getMonth() - 1)
                  setDateRangeStart(monthAgo.toISOString().split('T')[0])
                  setDateRangeEnd(today)
                } else {
                  setDateRangeStart('')
                  setDateRangeEnd('')
                }
              }}>
                <option value="today">اليوم</option>
                <option value="week">هذا الأسبوع</option>
                <option value="month">هذا الشهر</option>
                <option value="all">الكل</option>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>البحث</Label>
              <Input
                type="text"
                placeholder="بحث..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>الفئة</Label>
              <Select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                <option value="all">الكل</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الحالة</Label>
              <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">الكل</option>
                <option value="Pending">في انتظار الموافقة</option>
                <option value="Approved">معتمد</option>
                <option value="Rejected">مرفوض</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Expenses by User - Grouped View */}
      {expensesByUser.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>قائمة المصاريف (0)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">لا توجد مصاريف</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Desktop Table View - Grouped by User */}
          <div className="hidden md:block">
            <Card>
              <CardHeader>
                <CardTitle>المصاريف حسب المستخدم ({filteredExpenses.length} مصروف)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="font-bold">المستخدم</TableHead>
                      <TableHead className="font-bold">التاريخ</TableHead>
                      <TableHead className="font-bold">الفئة</TableHead>
                      <TableHead className="font-bold">الوصف</TableHead>
                      <TableHead className="font-bold text-right">المبلغ</TableHead>
                      <TableHead className="font-bold">الحالة</TableHead>
                      <TableHead className="font-bold text-center">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expensesByUser.map((userGroup) => {
                      const isUserExpanded = expandedUsers.has(userGroup.userId)
                      const sortedDates = Array.from(userGroup.dailyExpenses.keys()).sort((a, b) => b.localeCompare(a))
                      
                      return (
                        <React.Fragment key={userGroup.userId}>
                          {/* User Summary Row */}
                          <TableRow 
                            className="bg-blue-50 cursor-pointer hover:bg-blue-100"
                            onClick={() => {
                              setExpandedUsers(prev => {
                                const next = new Set(prev)
                                if (next.has(userGroup.userId)) {
                                  next.delete(userGroup.userId)
                                } else {
                                  next.add(userGroup.userId)
                                }
                                return next
                              })
                            }}
                          >
                            <TableCell className="font-bold">
                              <div className="flex items-center gap-2">
                                <User className="h-4 w-4 text-blue-600" />
                                {userGroup.userName}
                              </div>
                            </TableCell>
                            <TableCell colSpan={3} className="text-muted-foreground">
                              {sortedDates.length} يوم • {userGroup.expenseCount} مصروف
                            </TableCell>
                            <TableCell className="text-right font-bold text-lg text-orange-600">
                              {formatCurrency(userGroup.totalAmount)}
                            </TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-center">
                              {isUserExpanded ? <ChevronUp className="h-4 w-4 inline" /> : <ChevronDown className="h-4 w-4 inline" />}
                            </TableCell>
                          </TableRow>
                          
                          {/* Expanded User Details */}
                          {isUserExpanded && sortedDates.map(dateKey => {
                            const dayExpenses = userGroup.dailyExpenses.get(dateKey) || []
                            const dayTotal = dayExpenses.reduce((sum, e) => sum + e.amount, 0)
                            const dateExpandKey = `${userGroup.userId}-${dateKey}`
                            const isDateExpanded = expandedDates.has(dateExpandKey)
                            
                            return (
                              <React.Fragment key={dateKey}>
                                {/* Date Summary Row */}
                                <TableRow 
                                  className="bg-gray-50 cursor-pointer hover:bg-gray-100"
                                  onClick={() => {
                                    setExpandedDates(prev => {
                                      const next = new Set(prev)
                                      if (next.has(dateExpandKey)) {
                                        next.delete(dateExpandKey)
                                      } else {
                                        next.add(dateExpandKey)
                                      }
                                      return next
                                    })
                                  }}
                                >
                                  <TableCell className="pr-8"></TableCell>
                                  <TableCell className="font-medium">{formatDate(dateKey)}</TableCell>
                                  <TableCell colSpan={2} className="text-muted-foreground">
                                    {dayExpenses.length} مصروف
                                  </TableCell>
                                  <TableCell className="text-right font-semibold text-orange-600">
                                    {formatCurrency(dayTotal)}
                                  </TableCell>
                                  <TableCell></TableCell>
                                  <TableCell className="text-center">
                                    {isDateExpanded ? <ChevronUp className="h-3 w-3 inline" /> : <ChevronDown className="h-3 w-3 inline" />}
                                  </TableCell>
                                </TableRow>
                                
                                {/* Expense Details */}
                                {isDateExpanded && dayExpenses.map(expense => {
                                  const category = categories.find(c => c.id === expense.category)
                                  return (
                                    <TableRow key={expense.id} className="bg-white">
                                      <TableCell className="pr-12"></TableCell>
                                      <TableCell className="text-sm text-muted-foreground">{formatDate(expense.expense_date)}</TableCell>
                                      <TableCell className="text-sm">{category?.name || 'غير معروف'}</TableCell>
                                      <TableCell className="text-sm max-w-xs truncate">{expense.description || '-'}</TableCell>
                                      <TableCell className="text-right font-medium">{formatCurrency(expense.amount)}</TableCell>
                                      <TableCell>
                                        <Badge 
                                          variant={
                                            expense.status === 'Approved' ? 'success' :
                                            expense.status === 'Rejected' ? 'destructive' : 'warning'
                                          }
                                          className="text-xs"
                                        >
                                          {expense.status === 'Approved' ? 'معتمد' :
                                           expense.status === 'Rejected' ? 'مرفوض' : 'في انتظار'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center justify-center gap-1">
                                          {expense.status === 'Pending' && hasPermission('manage_financial') && (
                                            <>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={(e) => { e.stopPropagation(); approveExpense(expense.id) }}
                                                className="h-7 w-7 text-green-600"
                                              >
                                                <CheckCircle className="h-3 w-3" />
                                              </Button>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  const reason = prompt('سبب الرفض:')
                                                  if (reason) rejectExpense(expense.id, reason)
                                                }}
                                                className="h-7 w-7 text-red-600"
                                              >
                                                <XCircle className="h-3 w-3" />
                                              </Button>
                                            </>
                                          )}
                                          {canEditExpenses && (
                                            <>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={(e) => { e.stopPropagation(); openExpenseDialog(expense) }}
                                                className="h-7 w-7"
                                              >
                                                <Edit className="h-3 w-3" />
                                              </Button>
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={(e) => { e.stopPropagation(); deleteExpense(expense.id) }}
                                                className="h-7 w-7 text-destructive"
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                              </React.Fragment>
                            )
                          })}
                        </React.Fragment>
                      )
                    })}
                    {/* Total Row */}
                    <TableRow className="bg-gray-100 font-bold border-t-2">
                      <TableCell colSpan={4} className="font-bold text-lg">الإجمالي</TableCell>
                      <TableCell className="text-right font-bold text-lg text-orange-600">
                        {formatCurrency(filteredExpenses.reduce((sum, e) => sum + e.amount, 0))}
                      </TableCell>
                      <TableCell colSpan={2}></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Mobile Card View - Grouped by User */}
          <div className="md:hidden space-y-3">
            {expensesByUser.map((userGroup) => {
              const isUserExpanded = expandedUsers.has(userGroup.userId)
              const sortedDates = Array.from(userGroup.dailyExpenses.keys()).sort((a, b) => b.localeCompare(a))
              
              return (
                <Card key={userGroup.userId} className="border-blue-200">
                  <CardContent className="p-3">
                    {/* User Header */}
                    <div 
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => {
                        setExpandedUsers(prev => {
                          const next = new Set(prev)
                          if (next.has(userGroup.userId)) {
                            next.delete(userGroup.userId)
                          } else {
                            next.add(userGroup.userId)
                          }
                          return next
                        })
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-blue-600" />
                        <span className="font-bold text-sm">{userGroup.userName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-right">
                          <div className="text-sm font-bold text-orange-600">{formatCurrency(userGroup.totalAmount)}</div>
                          <div className="text-xs text-muted-foreground">{userGroup.expenseCount} مصروف</div>
                        </div>
                        {isUserExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                    </div>
                    
                    {/* Expanded User Details */}
                    {isUserExpanded && (
                      <div className="mt-3 pt-3 border-t space-y-2">
                        {sortedDates.map(dateKey => {
                          const dayExpenses = userGroup.dailyExpenses.get(dateKey) || []
                          const dayTotal = dayExpenses.reduce((sum, e) => sum + e.amount, 0)
                          const dateExpandKey = `${userGroup.userId}-${dateKey}`
                          const isDateExpanded = expandedDates.has(dateExpandKey)
                          
                          return (
                            <div key={dateKey} className="bg-gray-50 rounded-md p-2">
                              <div 
                                className="flex items-center justify-between cursor-pointer"
                                onClick={() => {
                                  setExpandedDates(prev => {
                                    const next = new Set(prev)
                                    if (next.has(dateExpandKey)) {
                                      next.delete(dateExpandKey)
                                    } else {
                                      next.add(dateExpandKey)
                                    }
                                    return next
                                  })
                                }}
                              >
                                <span className="text-xs font-medium">{formatDate(dateKey)}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-orange-600">{formatCurrency(dayTotal)}</span>
                                  <span className="text-xs text-muted-foreground">({dayExpenses.length})</span>
                                  {isDateExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </div>
                              </div>
                              
                              {isDateExpanded && (
                                <div className="mt-2 space-y-1.5">
                                  {dayExpenses.map(expense => {
                                    const category = categories.find(c => c.id === expense.category)
                                    return (
                                      <div key={expense.id} className="bg-white rounded p-2 border border-gray-100">
                                        <div className="flex items-start justify-between">
                                          <div className="flex-1">
                                            <div className="text-xs font-medium">{category?.name || 'غير معروف'}</div>
                                            {expense.description && (
                                              <div className="text-xs text-muted-foreground mt-0.5">{expense.description}</div>
                                            )}
                                          </div>
                                          <div className="text-right">
                                            <div className="text-xs font-bold text-orange-600">{formatCurrency(expense.amount)}</div>
                                            <Badge 
                                              variant={
                                                expense.status === 'Approved' ? 'success' :
                                                expense.status === 'Rejected' ? 'destructive' : 'warning'
                                              }
                                              className="text-xs mt-0.5"
                                            >
                                              {expense.status === 'Approved' ? 'معتمد' :
                                               expense.status === 'Rejected' ? 'مرفوض' : 'في انتظار'}
                                            </Badge>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 mt-2 pt-1.5 border-t">
                                          {expense.status === 'Pending' && hasPermission('manage_financial') && (
                                            <>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="flex-1 text-xs h-7 text-green-600"
                                                onClick={(e) => { e.stopPropagation(); approveExpense(expense.id) }}
                                              >
                                                <CheckCircle className="h-3 w-3 mr-1" />
                                                موافقة
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="flex-1 text-xs h-7 text-red-600"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  const reason = prompt('سبب الرفض:')
                                                  if (reason) rejectExpense(expense.id, reason)
                                                }}
                                              >
                                                <XCircle className="h-3 w-3 mr-1" />
                                                رفض
                                              </Button>
                                            </>
                                          )}
                                          {canEditExpenses && (
                                            <>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="flex-1 text-xs h-7"
                                                onClick={(e) => { e.stopPropagation(); openExpenseDialog(expense) }}
                                              >
                                                <Edit className="h-3 w-3 mr-1" />
                                                تعديل
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="text-xs h-7"
                                                onClick={(e) => { e.stopPropagation(); deleteExpense(expense.id) }}
                                              >
                                                <Trash2 className="h-3 w-3" />
                                              </Button>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Expense Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'تعديل مصروف' : 'إضافة مصروف جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="category_id" className="text-xs sm:text-sm">الفئة *</Label>
                <Select
                  id="category_id"
                  value={expenseForm.category_id}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })}
                  className="text-xs sm:text-sm"
                >
                  <option value="">اختر الفئة</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="amount" className="text-xs sm:text-sm">المبلغ (DT) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  placeholder="0.00"
                  className="text-xs sm:text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="expense_date" className="text-xs sm:text-sm">التاريخ *</Label>
                <Input
                  id="expense_date"
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                  className="text-xs sm:text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="payment_method" className="text-xs sm:text-sm">طريقة الدفع *</Label>
                <Select
                  id="payment_method"
                  value={expenseForm.payment_method}
                  onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value as any })}
                  className="text-xs sm:text-sm"
                >
                  <option value="Cash">نقد</option>
                  <option value="BankTransfer">تحويل بنكي</option>
                  <option value="Check">شيك</option>
                  <option value="CreditCard">بطاقة ائتمان</option>
                  <option value="Other">أخرى</option>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="description" className="text-xs sm:text-sm">الوصف</Label>
              <Textarea
                id="description"
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                placeholder="وصف المصروف..."
                rows={3}
                className="text-xs sm:text-sm min-h-[80px] sm:min-h-[100px]"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="related_batch_id" className="text-xs sm:text-sm">متعلق بدفعة أرض (اختياري)</Label>
                <Select
                  id="related_batch_id"
                  value={expenseForm.related_batch_id}
                  onChange={(e) => setExpenseForm({ ...expenseForm, related_batch_id: e.target.value })}
                  className="text-xs sm:text-sm"
                >
                  <option value="">لا يوجد</option>
                  {batches.map(batch => (
                    <option key={batch.id} value={batch.id}>{batch.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="tags" className="text-xs sm:text-sm">العلامات (مفصولة بفواصل)</Label>
                <Input
                  id="tags"
                  value={expenseForm.tags}
                  onChange={(e) => setExpenseForm({ ...expenseForm, tags: e.target.value })}
                  placeholder="مثال: عاجل، شهري، صيانة"
                  className="text-xs sm:text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="notes" className="text-xs sm:text-sm">ملاحظات</Label>
              <Textarea
                id="notes"
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                placeholder="ملاحظات إضافية..."
                rows={2}
                className="text-xs sm:text-sm min-h-[60px] sm:min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button 
              onClick={saveExpense} 
              disabled={!expenseForm.category_id || !expenseForm.amount || !expenseForm.expense_date}
              className="w-full sm:w-auto"
            >
              {editingExpense ? 'حفظ' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

