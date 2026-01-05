import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Calendar, User, FileText, AlertCircle, DollarSign } from 'lucide-react'
import { sanitizeText, sanitizeNotes } from '@/lib/sanitize'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface Debt {
  id: string
  creditor_name: string
  amount_owed: number
  due_date: string
  check_number?: string | null
  reference_number?: string | null
  notes?: string | null
  status: string
  created_at: string
  updated_at: string
}

interface DebtPayment {
  id: string
  debt_id: string
  amount_paid: number
  payment_date: string
  notes?: string | null
  created_at: string
}

export function Debts() {
  const [debts, setDebts] = useState<Debt[]>([])
  const [payments, setPayments] = useState<DebtPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [selectedDebt, setSelectedDebt] = useState<Debt | null>(null)
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null)
  const [form, setForm] = useState({
    creditor_name: '',
    amount_owed: '',
    due_date: '',
    check_number: '',
    reference_number: '',
    notes: '',
  })
  const [paymentForm, setPaymentForm] = useState({
    amount_paid: '',
    payment_date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [debtToDelete, setDebtToDelete] = useState<string | null>(null)

  useEffect(() => {
    fetchDebts()
  }, [])

  const fetchDebts = async () => {
    try {
      const [debtsRes, paymentsRes] = await Promise.all([
        supabase
          .from('debts')
          .select('*')
          .order('due_date', { ascending: true }),
        supabase
          .from('debt_payments')
          .select('*')
          .order('payment_date', { ascending: false })
      ])

      if (debtsRes.error) throw debtsRes.error
      if (paymentsRes.error) throw paymentsRes.error

      setDebts((debtsRes.data as Debt[]) || [])
      setPayments((paymentsRes.data as DebtPayment[]) || [])
    } catch (error) {
      // Error fetching debts - silent fail
    } finally {
      setLoading(false)
    }
  }

  const openDialog = (debt?: Debt) => {
    if (debt) {
      setEditingDebt(debt)
      setForm({
        creditor_name: debt.creditor_name,
        amount_owed: debt.amount_owed.toString(),
        due_date: debt.due_date,
        check_number: debt.check_number || '',
        reference_number: debt.reference_number || '',
        notes: debt.notes || '',
      })
    } else {
      setEditingDebt(null)
      setForm({
        creditor_name: '',
        amount_owed: '',
        due_date: '',
        check_number: '',
        reference_number: '',
        notes: '',
      })
    }
    setDialogOpen(true)
  }

  const saveDebt = async () => {
    setErrorMessage(null)
    
    // Authorization check - debts management typically requires financial permissions
    // For now, allow all authenticated users, but can be restricted if needed
    
    if (!form.creditor_name || !form.amount_owed || !form.due_date) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة')
      return
    }

    try {
      const debtData = {
        creditor_name: sanitizeText(form.creditor_name),
        amount_owed: parseFloat(form.amount_owed),
        due_date: form.due_date,
        check_number: form.check_number ? sanitizeText(form.check_number) : null,
        reference_number: form.reference_number ? sanitizeText(form.reference_number) : null,
        notes: form.notes ? sanitizeNotes(form.notes) : null,
      }

      if (editingDebt) {
        const { error } = await supabase
          .from('debts')
          .update(debtData)
          .eq('id', editingDebt.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('debts').insert([debtData])
        if (error) throw error
      }

      setDialogOpen(false)
      fetchDebts()
    } catch (error) {
      setErrorMessage('خطأ في حفظ الدين')
    }
  }

  const deleteDebt = async (id: string) => {
    setDebtToDelete(id)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!debtToDelete) return

    try {
      const { error } = await supabase.from('debts').delete().eq('id', debtToDelete)
      if (error) throw error
      fetchDebts()
      setDeleteConfirmOpen(false)
      setDebtToDelete(null)
    } catch (error) {
      setErrorMessage('خطأ في حذف الدين')
      setDeleteConfirmOpen(false)
      setDebtToDelete(null)
    }
  }

  const openPaymentDialog = (debt: Debt) => {
    setSelectedDebt(debt)
    setPaymentForm({
      amount_paid: '',
      payment_date: new Date().toISOString().split('T')[0],
      notes: '',
    })
    setPaymentDialogOpen(true)
  }

  const savePayment = async () => {
    setErrorMessage(null)
    if (!selectedDebt || !paymentForm.amount_paid) {
      setErrorMessage('يرجى إدخال مبلغ الدفع')
      return
    }

    try {
      // Sanitize payment notes
      const sanitizedNotes = paymentForm.notes.trim() ? sanitizeNotes(paymentForm.notes.trim()) : null
      
      const { error } = await supabase.from('debt_payments').insert([{
        debt_id: selectedDebt.id,
        amount_paid: parseFloat(paymentForm.amount_paid),
        payment_date: paymentForm.payment_date,
        notes: sanitizedNotes,
      }])

      if (error) throw error

      // Check if debt is fully paid
      const remaining = getRemainingAmount(selectedDebt) - parseFloat(paymentForm.amount_paid)
      if (remaining <= 0) {
        await supabase
          .from('debts')
          .update({ status: 'Paid' })
          .eq('id', selectedDebt.id)
      }

      setPaymentDialogOpen(false)
      fetchDebts()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage('خطأ في تسجيل الدفع')
    }
  }

  // Calculate remaining amount for each debt (after payments)
  const getRemainingAmount = (debt: Debt): number => {
    const debtPayments = payments.filter(p => p.debt_id === debt.id)
    const totalPaid = debtPayments.reduce((sum, p) => sum + p.amount_paid, 0)
    return Math.max(0, debt.amount_owed - totalPaid)
  }

  // Calculate daily payment for each debt (using remaining amount)
  const calculateDailyPayment = (debt: Debt, remainingAmount?: number): number => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const dueDate = new Date(debt.due_date)
    dueDate.setHours(0, 0, 0, 0)

    const amount = remainingAmount !== undefined ? remainingAmount : getRemainingAmount(debt)
    const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    
    if (daysRemaining <= 0) return amount // Overdue - need to pay all
    if (daysRemaining === 0) return amount // Due today
    if (amount <= 0) return 0 // Already paid
    
    return amount / daysRemaining
  }

  // Calculate what's still required today for a specific debt (accounting for today's payments)
  const getTodayRequiredForDebt = (debt: Debt): number => {
    const today = new Date().toISOString().split('T')[0]
    
    // Calculate remaining amount BEFORE today's payments
    const paymentsBeforeToday = payments.filter(p => p.debt_id === debt.id && p.payment_date !== today)
    const totalPaidBeforeToday = paymentsBeforeToday.reduce((sum, p) => sum + p.amount_paid, 0)
    const remainingBeforeToday = Math.max(0, debt.amount_owed - totalPaidBeforeToday)
    
    // Calculate what's required today for this debt
    const dailyRequired = calculateDailyPayment(debt, remainingBeforeToday)
    
    // Subtract today's payments to this specific debt
    const todayPayments = payments.filter(p => p.debt_id === debt.id && p.payment_date === today)
    const todayPaid = todayPayments.reduce((sum, p) => sum + p.amount_paid, 0)
    
    return Math.max(0, dailyRequired - todayPaid)
  }

  // Calculate payments made today (grouped by debt to avoid duplicates)
  const getTodayPayments = (): number => {
    const today = new Date().toISOString().split('T')[0]
    const todayPayments = payments.filter(p => p.payment_date === today)
    
    // Group by debt_id to sum payments per debt
    const grouped = new Map<string, number>()
    todayPayments.forEach(p => {
      const current = grouped.get(p.debt_id) || 0
      grouped.set(p.debt_id, current + p.amount_paid)
    })
    
    return Array.from(grouped.values()).reduce((sum, amount) => sum + amount, 0)
  }

  // Calculate total daily payment required TODAY (per debt, accounting for today's payments)
  const getTotalDailyPaymentRequired = (): number => {
    const today = new Date().toISOString().split('T')[0]
    const todayPaymentsByDebt = new Map<string, number>()
    
    // Group today's payments by debt
    payments.filter(p => p.payment_date === today).forEach(p => {
      const current = todayPaymentsByDebt.get(p.debt_id) || 0
      todayPaymentsByDebt.set(p.debt_id, current + p.amount_paid)
    })
    
    const activeDebts = debts.filter(d => d.status === 'Active')
    let totalRequired = 0
    
    activeDebts.forEach(debt => {
      // Calculate remaining amount BEFORE today's payments
      const paymentsBeforeToday = payments
        .filter(p => p.debt_id === debt.id && p.payment_date !== today)
      const totalPaidBeforeToday = paymentsBeforeToday.reduce((sum, p) => sum + p.amount_paid, 0)
      const remainingBeforeToday = Math.max(0, debt.amount_owed - totalPaidBeforeToday)
      
      // Calculate what's required today for this debt
      const dailyRequired = calculateDailyPayment(debt, remainingBeforeToday)
      
      // Subtract today's payments to this specific debt
      const todayPaidToThisDebt = todayPaymentsByDebt.get(debt.id) || 0
      const stillRequired = Math.max(0, dailyRequired - todayPaidToThisDebt)
      
      totalRequired += stillRequired
    })
    
    return totalRequired
  }

  // Calculate debt statistics
  const debtStats = useMemo(() => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)

    const activeDebts = debts.filter(d => d.status === 'Active')
    const totalOwed = activeDebts.reduce((sum, d) => sum + getRemainingAmount(d), 0)
    const overdueDebts = activeDebts.filter(d => {
      const dueDate = new Date(d.due_date)
      dueDate.setHours(0, 0, 0, 0)
      return dueDate < now && getRemainingAmount(d) > 0
    })
    const overdueAmount = overdueDebts.reduce((sum, d) => sum + getRemainingAmount(d), 0)
    const todayPaid = getTodayPayments()
    
    // Calculate daily required TODAY (already accounts for today's payments per debt)
    const remainingDailyRequired = getTotalDailyPaymentRequired()

    return {
      total: activeDebts.length,
      totalOwed,
      overdue: overdueDebts.length,
      overdueAmount,
      todayPaid,
      totalDailyRequired: remainingDailyRequired, // Show remaining required today after today's payments
      remaining: remainingDailyRequired,
    }
  }, [debts, payments])

  // Calculate progress percentage
  const calculateProgress = (debt: Debt): number => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const dueDate = new Date(debt.due_date)
    dueDate.setHours(0, 0, 0, 0)
    const createdDate = new Date(debt.created_at)
    createdDate.setHours(0, 0, 0, 0)

    const totalDays = Math.ceil((dueDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
    const daysPassed = Math.ceil((now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24))

    if (totalDays <= 0) return 100
    return Math.min(100, Math.max(0, (daysPassed / totalDays) * 100))
  }

  // Get days remaining
  const getDaysRemaining = (debt: Debt): number => {
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    const dueDate = new Date(debt.due_date)
    dueDate.setHours(0, 0, 0, 0)

    return Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">الديون</h1>
          <p className="text-sm text-muted-foreground mt-1">تتبع وإدارة الديون المستحقة</p>
        </div>
        <Button onClick={() => openDialog()} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 ml-2" />
          إضافة دين جديد
        </Button>
      </div>

      {/* Daily Payment Summary - Simplified */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs font-medium text-purple-700 mb-1">المطلوب اليوم</p>
            <p className="text-xl font-bold text-purple-900">{formatCurrency(debtStats.totalDailyRequired)}</p>
            {debtStats.totalDailyRequired === 0 && (
              <p className="text-xs text-green-600 mt-0.5">✓ تم الوفاء</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs font-medium text-green-700 mb-1">المدفوع اليوم</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(debtStats.todayPaid)}</p>
            {debtStats.todayPaid > 0 && (
              <p className="text-xs text-green-600 mt-0.5">✓ تم الدفع</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-3 pb-3">
            <p className="text-xs font-medium text-blue-700 mb-1">إجمالي الديون</p>
            <p className="text-xl font-bold text-blue-800">{formatCurrency(debtStats.totalOwed)}</p>
            <p className="text-xs text-blue-600 mt-0.5">{debtStats.total} دين نشط</p>
          </CardContent>
        </Card>

        {/* Only show overdue card if there are overdue debts */}
        {debtStats.overdue > 0 && (
          <Card className="bg-red-50 border-red-200">
            <CardContent className="pt-3 pb-3">
              <p className="text-xs font-medium text-red-700 mb-1">متأخر</p>
              <p className="text-xl font-bold text-red-800">{formatCurrency(debtStats.overdueAmount)}</p>
              <p className="text-xs text-red-600 mt-0.5">{debtStats.overdue} دين متأخر</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Debts List - Compact */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {debts.filter(d => d.status === 'Active').map((debt) => {
          const dailyPayment = calculateDailyPayment(debt)
          const daysRemaining = getDaysRemaining(debt)
          const progress = calculateProgress(debt)
          const isOverdue = daysRemaining < 0
          const isDueSoon = daysRemaining >= 0 && daysRemaining <= 7

          return (
            <Card
              key={debt.id}
              className={`${
                isOverdue
                  ? 'border-red-300 bg-red-50'
                  : isDueSoon
                  ? 'border-orange-300 bg-orange-50'
                  : 'border-gray-200'
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg mb-1">{debt.creditor_name}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => openDialog(debt)}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => deleteDebt(debt.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {/* Amount - Most Dominant */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">المبلغ المستحق</p>
                  <p className="text-2xl font-bold text-primary">{formatCurrency(getRemainingAmount(debt))}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    من أصل {formatCurrency(debt.amount_owed)}
                  </p>
                  {/* المطلوب اليوم - Today's Required Amount */}
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-0.5">المطلوب اليوم</p>
                    <p className="text-lg font-semibold text-blue-600">
                      {formatCurrency(getTodayRequiredForDebt(debt))}
                    </p>
                  </div>
                </div>

                {/* Due Date and Daily Payment - Compact */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">تاريخ الاستحقاق</p>
                    <p className={`text-sm font-bold ${
                      isOverdue ? 'text-red-600' : isDueSoon ? 'text-orange-600' : 'text-gray-700'
                    }`}>
                      {formatDate(debt.due_date)}
                    </p>
                    {isOverdue && (
                      <Badge variant="destructive" className="text-xs mt-0.5 h-4">
                        متأخر {Math.abs(daysRemaining)} يوم
                      </Badge>
                    )}
                    {!isOverdue && daysRemaining <= 7 && (
                      <Badge variant="outline" className="text-xs mt-0.5 h-4 text-orange-600 border-orange-600">
                        متبقي {daysRemaining} يوم
                      </Badge>
                    )}
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">الدفع اليومي</p>
                    <p className="text-base font-bold text-red-600">
                      {formatCurrency(calculateDailyPayment(debt))}
                    </p>
                  </div>
                </div>


                {/* Payment History - Grouped by date */}
                {(() => {
                  const debtPayments = payments.filter(p => p.debt_id === debt.id)
                  if (debtPayments.length === 0) return null
                  
                  // Group payments by date
                  const groupedByDate = new Map<string, { date: string; total: number; count: number }>()
                  debtPayments.forEach(p => {
                    const date = p.payment_date
                    const existing = groupedByDate.get(date) || { date, total: 0, count: 0 }
                    existing.total += p.amount_paid
                    existing.count += 1
                    groupedByDate.set(date, existing)
                  })
                  
                  const sortedPayments = Array.from(groupedByDate.values())
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .slice(0, 3)
                  
                  return (
                    <div className="pt-2 border-t">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">آخر المدفوعات</p>
                      <div className="space-y-1.5">
                        {sortedPayments.map((group, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs bg-green-50 p-1.5 rounded">
                            <span className="text-muted-foreground">{formatDate(group.date)}</span>
                            <span className="font-bold text-green-600">+{formatCurrency(group.total)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* Pay Button */}
                {getRemainingAmount(debt) > 0 && (
                  <Button
                    className="w-full mt-2"
                    size="sm"
                    onClick={() => openPaymentDialog(debt)}
                    variant={isOverdue ? 'destructive' : 'default'}
                  >
                    <DollarSign className="h-3 w-3 ml-1" />
                    تسجيل دفعة
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {debts.filter(d => d.status === 'Active').length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">لا توجد ديون مسجلة</p>
            <Button onClick={() => openDialog()} className="mt-4">
              <Plus className="h-4 w-4 ml-2" />
              إضافة دين جديد
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDebt ? 'تعديل الدين' : 'إضافة دين جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="creditor_name">اسم الدائن *</Label>
              <Input
                id="creditor_name"
                value={form.creditor_name}
                onChange={(e) => setForm({ ...form, creditor_name: e.target.value })}
                placeholder="أدخل اسم الدائن"
                maxLength={255}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount_owed">المبلغ المستحق (DT) *</Label>
              <Input
                id="amount_owed"
                type="number"
                step="0.01"
                value={form.amount_owed}
                onChange={(e) => setForm({ ...form, amount_owed: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="due_date">تاريخ الاستحقاق *</Label>
              <Input
                id="due_date"
                type="date"
                value={form.due_date}
                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="check_number">رقم الشيك (اختياري)</Label>
                <Input
                  id="check_number"
                  value={form.check_number}
                  onChange={(e) => setForm({ ...form, check_number: e.target.value })}
                  placeholder="رقم الشيك"
                  maxLength={100}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reference_number">رقم المرجع (اختياري)</Label>
                <Input
                  id="reference_number"
                  value={form.reference_number}
                  onChange={(e) => setForm({ ...form, reference_number: e.target.value })}
                  placeholder="رقم المرجع"
                  maxLength={100}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات (اختياري)</Label>
              <textarea
                id="notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="ملاحظات إضافية"
                maxLength={5000}
              />
            </div>
            {errorMessage && (
              <div className="bg-destructive/10 border-2 border-destructive/30 text-destructive p-3 sm:p-4 rounded-lg text-sm flex items-start gap-2 shadow-md">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p className="flex-1 font-medium break-words">{errorMessage}</p>
              </div>
            )}

            {form.amount_owed && form.due_date && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-800 mb-2">حساب الدفع اليومي:</p>
                <div className="space-y-1">
                  {(() => {
                    const amount = parseFloat(form.amount_owed)
                    const dueDate = new Date(form.due_date)
                    const now = new Date()
                    now.setHours(0, 0, 0, 0)
                    dueDate.setHours(0, 0, 0, 0)
                    const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    const dailyPayment = daysRemaining > 0 ? amount / daysRemaining : amount

                    return (
                      <>
                        <p className="text-lg font-bold text-blue-900">
                          {formatCurrency(dailyPayment)} / يوم
                        </p>
                        <p className="text-xs text-blue-700">
                          {daysRemaining > 0
                            ? `${daysRemaining} يوم متبقي للدفع`
                            : 'مستحق الآن - يجب دفع المبلغ كاملاً'}
                        </p>
                      </>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={saveDebt}>
              {editingDebt ? 'حفظ' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تسجيل دفعة - {selectedDebt?.creditor_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 mb-2">المبلغ المتبقي</p>
              <p className="text-2xl font-bold text-blue-900">
                {selectedDebt ? formatCurrency(getRemainingAmount(selectedDebt)) : '0,00 DT'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_amount">مبلغ الدفع (DT) *</Label>
              <Input
                id="payment_amount"
                type="number"
                step="0.01"
                value={paymentForm.amount_paid}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount_paid: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_date">تاريخ الدفع</Label>
              <Input
                id="payment_date"
                type="date"
                value={paymentForm.payment_date}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_notes">ملاحظات (اختياري)</Label>
              <textarea
                id="payment_notes"
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={paymentForm.notes}
                onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                placeholder="ملاحظات إضافية"
                maxLength={5000}
              />
            </div>
            {errorMessage && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                {errorMessage}
              </div>
            )}

            {paymentForm.amount_paid && selectedDebt && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800 mb-1">المبلغ المتبقي بعد الدفع</p>
                <p className="text-xl font-bold text-green-900">
                  {formatCurrency(Math.max(0, getRemainingAmount(selectedDebt) - parseFloat(paymentForm.amount_paid)))}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={savePayment}>
              تسجيل الدفعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

