import { useEffect, useState, useMemo } from 'react'
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
import { Plus, Edit, Trash2, CheckCircle, XCircle, Filter, Download, TrendingUp, DollarSign, Calendar } from 'lucide-react'
import type { Expense, ExpenseCategory, LandBatch, Sale, PaymentMethod } from '@/types/database'

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
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
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
            .select('*')
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
        category_id: expense.category_id,
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
        category_id: expenseForm.category_id,
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
      if (filterCategory !== 'all' && e.category_id !== filterCategory) return false
      if (filterPaymentMethod !== 'all' && e.payment_method !== filterPaymentMethod) return false
      if (dateRangeStart && e.expense_date < dateRangeStart) return false
      if (dateRangeEnd && e.expense_date > dateRangeEnd) return false
      if (amountMin && e.amount < parseFloat(amountMin)) return false
      if (amountMax && e.amount > parseFloat(amountMax)) return false
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const category = categories.find(c => c.id === e.category_id)
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
      const current = byCategory.get(e.category_id) || 0
      byCategory.set(e.category_id, current + e.amount)
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
      if (filterCategory !== 'all' && e.category_id !== filterCategory) return false
      if (filterPaymentMethod !== 'all' && e.payment_method !== filterPaymentMethod) return false
      if (dateRangeStart && e.expense_date < dateRangeStart) return false
      if (dateRangeEnd && e.expense_date > dateRangeEnd) return false
      if (amountMin && e.amount < parseFloat(amountMin)) return false
      if (amountMax && e.amount > parseFloat(amountMax)) return false
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const category = categories.find(c => c.id === e.category_id)
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

      {/* Mobile Card View / Desktop Table View */}
      {filteredExpenses.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>قائمة المصاريف (0)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground py-8">لا توجد مصاريف</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="space-y-3 md:hidden">
            {filteredExpenses.map(expense => {
              const category = categories.find(c => c.id === expense.category_id)
              return (
                <Card key={expense.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-base text-orange-600">
                            {formatCurrency(expense.amount)}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {formatDate(expense.expense_date)}
                          </div>
                        </div>
                        <Badge 
                          variant={
                            expense.status === 'Approved' ? 'success' :
                            expense.status === 'Rejected' ? 'destructive' : 'warning'
                          }
                          className="text-xs flex-shrink-0"
                        >
                          {expense.status === 'Approved' ? 'معتمد' :
                           expense.status === 'Rejected' ? 'مرفوض' : 'في انتظار'}
                        </Badge>
                      </div>
                      
                      <div className="space-y-1.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">الفئة:</span>
                          <span className="font-medium">{category?.name || 'غير معروف'}</span>
                        </div>
                        {expense.description && (
                          <div>
                            <span className="text-muted-foreground">الوصف:</span>
                            <div className="font-medium mt-0.5">{expense.description}</div>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">طريقة الدفع:</span>
                          <span className="font-medium">
                            {expense.payment_method === 'Cash' ? 'نقد' :
                             expense.payment_method === 'BankTransfer' ? 'تحويل بنكي' :
                             expense.payment_method === 'Check' ? 'شيك' :
                             expense.payment_method === 'CreditCard' ? 'بطاقة ائتمان' : 'أخرى'}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 pt-2 border-t">
                        {expense.status === 'Pending' && hasPermission('manage_financial') && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 text-xs h-8 text-green-600"
                              onClick={() => approveExpense(expense.id)}
                            >
                              <CheckCircle className="h-3 w-3 mr-1" />
                              موافقة
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1 text-xs h-8 text-red-600"
                              onClick={() => {
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
                              className="flex-1 text-xs h-8"
                              onClick={() => openExpenseDialog(expense)}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              تعديل
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs h-8"
                              onClick={() => deleteExpense(expense.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
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
              <CardTitle>قائمة المصاريف ({filteredExpenses.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>التاريخ</TableHead>
                      <TableHead>الفئة</TableHead>
                      <TableHead>المبلغ</TableHead>
                      <TableHead>الوصف</TableHead>
                      <TableHead>طريقة الدفع</TableHead>
                      <TableHead>الحالة</TableHead>
                      <TableHead className="text-center">إجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.map(expense => {
                      const category = categories.find(c => c.id === expense.category_id)
                      return (
                        <TableRow key={expense.id}>
                          <TableCell>{formatDate(expense.expense_date)}</TableCell>
                          <TableCell>{category?.name || 'غير معروف'}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(expense.amount)}</TableCell>
                          <TableCell className="max-w-xs truncate">{expense.description || '-'}</TableCell>
                          <TableCell>
                            {expense.payment_method === 'Cash' ? 'نقد' :
                             expense.payment_method === 'BankTransfer' ? 'تحويل بنكي' :
                             expense.payment_method === 'Check' ? 'شيك' :
                             expense.payment_method === 'CreditCard' ? 'بطاقة ائتمان' : 'أخرى'}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                expense.status === 'Approved' ? 'success' :
                                expense.status === 'Rejected' ? 'destructive' : 'warning'
                              }
                            >
                              {expense.status === 'Approved' ? 'معتمد' :
                               expense.status === 'Rejected' ? 'مرفوض' : 'في انتظار'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-2">
                              {expense.status === 'Pending' && hasPermission('manage_financial') && (
                                <>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => approveExpense(expense.id)}
                                    className="h-8 w-8 text-green-600"
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => {
                                      const reason = prompt('سبب الرفض:')
                                      if (reason) rejectExpense(expense.id, reason)
                                    }}
                                    className="h-8 w-8 text-red-600"
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {canEditExpenses && (
                                <>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => openExpenseDialog(expense)}
                                    className="h-8 w-8"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => deleteExpense(expense.id)}
                                    className="h-8 w-8 text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Expense Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'تعديل مصروف' : 'إضافة مصروف جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category_id">الفئة *</Label>
                <Select
                  id="category_id"
                  value={expenseForm.category_id}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })}
                >
                  <option value="">اختر الفئة</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">المبلغ (DT) *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expense_date">التاريخ *</Label>
                <Input
                  id="expense_date"
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment_method">طريقة الدفع *</Label>
                <Select
                  id="payment_method"
                  value={expenseForm.payment_method}
                  onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value as any })}
                >
                  <option value="Cash">نقد</option>
                  <option value="BankTransfer">تحويل بنكي</option>
                  <option value="Check">شيك</option>
                  <option value="CreditCard">بطاقة ائتمان</option>
                  <option value="Other">أخرى</option>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">الوصف</Label>
              <Textarea
                id="description"
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                placeholder="وصف المصروف..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="related_batch_id">متعلق بدفعة أرض (اختياري)</Label>
                <Select
                  id="related_batch_id"
                  value={expenseForm.related_batch_id}
                  onChange={(e) => setExpenseForm({ ...expenseForm, related_batch_id: e.target.value })}
                >
                  <option value="">لا يوجد</option>
                  {batches.map(batch => (
                    <option key={batch.id} value={batch.id}>{batch.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="tags">العلامات (مفصولة بفواصل)</Label>
                <Input
                  id="tags"
                  value={expenseForm.tags}
                  onChange={(e) => setExpenseForm({ ...expenseForm, tags: e.target.value })}
                  placeholder="مثال: عاجل، شهري، صيانة"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                placeholder="ملاحظات إضافية..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
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

