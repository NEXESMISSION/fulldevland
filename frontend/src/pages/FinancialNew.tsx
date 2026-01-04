import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
} from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { retryWithBackoff, isRetryableError } from '@/lib/retry'
import { DollarSign, CreditCard, TrendingUp, X } from 'lucide-react'
import type { Sale, Client, Payment, LandPiece, LandBatch } from '@/types/database'

interface SaleWithClient extends Sale {
  client?: Client
}

interface PaymentWithDetails extends Payment {
  client?: Client
  sale?: {
    land_piece_ids?: string[]
    payment_type?: 'Full' | 'Installment'
    total_selling_price?: number
  }
  land_pieces?: Array<LandPiece & { land_batch?: LandBatch }>
}

interface GroupedPayment {
  clientId: string
  clientName: string
  clientCin?: string
  piecesCount: number
  paymentDate: string
  totalAmount: number
  payments: PaymentWithDetails[]
}

interface PaymentByLand {
  landBatchName: string
  location: string | null
  totalAmount: number
  percentage: number
  paymentCount: number
  payments: PaymentWithDetails[]
}

interface GroupedCompanyFee {
  clientId: string
  clientName: string
  clientCin?: string
  clientPhone?: string
  piecesCount: number
  saleDate: string
  totalAmount: number
  sales: SaleWithClient[]
}

interface CompanyFeeByLand {
  landBatchName: string
  location: string | null
  totalAmount: number
  percentage: number
  saleCount: number
  sales: SaleWithClient[]
}

type DateFilter = 'today' | 'week' | 'month' | 'all'
type PaymentTypeFilter = 'Installment' | 'SmallAdvance' | 'Full' | 'BigAdvance' | null

export function Financial() {
  const { hasPermission } = useAuth()
  const [sales, setSales] = useState<SaleWithClient[]>([])
  const [payments, setPayments] = useState<PaymentWithDetails[]>([])
  const [landPieces, setLandPieces] = useState<Array<LandPiece & { land_batch?: LandBatch }>>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const [paymentDetailDialogOpen, setPaymentDetailDialogOpen] = useState(false)
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentTypeFilter>(null)
  const [companyFeeDialogOpen, setCompanyFeeDialogOpen] = useState(false)

  useEffect(() => {
    if (!hasPermission('view_financial')) return
    fetchData()
  }, [hasPermission])

  const fetchData = async () => {
    setLoading(true)
    
    try {
      const [salesRes, paymentsRes, piecesRes] = await retryWithBackoff(
        async () => {
          return await Promise.all([
        supabase
          .from('sales')
          .select('*, client:clients(*)')
          .order('sale_date', { ascending: false }),
        supabase
          .from('payments')
          .select('*, client:clients(*), sale:sales(land_piece_ids, payment_type, total_selling_price)')
          .order('payment_date', { ascending: false }),
        supabase
          .from('land_pieces')
          .select('*, land_batch:land_batches(name, location)')
          .order('created_at', { ascending: false }),
      ])
        },
        {
          maxRetries: 3,
          timeout: 10000,
          onRetry: (attempt) => {
            console.log(`Retrying financial data fetch (attempt ${attempt})...`)
          },
        }
      )

      if (salesRes.error) {
        console.error('Error fetching sales:', salesRes.error)
      }
      if (paymentsRes.error) {
        console.error('Error fetching payments:', paymentsRes.error)
      }
      if (piecesRes.error) {
        console.error('Error fetching land pieces:', piecesRes.error)
      }

      setSales((salesRes.data as SaleWithClient[]) || [])
      setPayments((paymentsRes.data as PaymentWithDetails[]) || [])
      setLandPieces((piecesRes.data as Array<LandPiece & { land_batch?: LandBatch }>) || [])
    } catch (error) {
      const err = error as Error
      console.error('Financial fetch error:', err)
      
      if (isRetryableError(err)) {
        console.warn('Network error fetching financial data')
      }
    } finally {
      setLoading(false)
    }
  }

  // Filter data by date
  const getDateRange = (filter: DateFilter): { start: Date; end: Date | null } => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    today.setHours(0, 0, 0, 0)
    
    switch (filter) {
      case 'today':
        const todayEnd = new Date(today)
        todayEnd.setHours(23, 59, 59, 999)
        return { start: today, end: todayEnd }
      case 'week':
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        weekAgo.setHours(0, 0, 0, 0)
        return { start: weekAgo, end: null }
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
        monthStart.setHours(0, 0, 0, 0)
        return { start: monthStart, end: null }
      case 'all':
        return { start: new Date(0), end: null }
    }
  }

  const filteredData = useMemo(() => {
    const { start: startDate, end: endDate } = getDateRange(dateFilter)
    
    // Helper function to compare dates
    const isDateInRange = (dateString: string, start: Date, end: Date | null): boolean => {
      const date = new Date(dateString)
      date.setHours(0, 0, 0, 0)
      const startOnly = new Date(start)
      startOnly.setHours(0, 0, 0, 0)
      
      if (end) {
        const endOnly = new Date(end)
        endOnly.setHours(23, 59, 59, 999)
        return date >= startOnly && date <= endOnly
      } else {
        return date >= startOnly
      }
    }
    
    const filteredSales = sales.filter(s => {
      return isDateInRange(s.sale_date, startDate, endDate)
    })
    
    // Exclude refunds from payments completely
    const filteredPayments = payments
      .filter(p => {
        return isDateInRange(p.payment_date, startDate, endDate)
      })
      .filter(p => p.payment_type !== 'Refund')
    
    // Attach land pieces to payments and exclude payments for cancelled sales
    const paymentsWithPieces = filteredPayments
      .filter(payment => {
        // Exclude payments for cancelled sales
        const sale = sales.find(s => s.id === payment.sale_id)
        return sale && sale.status !== 'Cancelled'
      })
      .map(payment => {
        const pieceIds = payment.sale?.land_piece_ids || []
        const pieces = landPieces.filter(p => pieceIds.includes(p.id))
        return {
          ...payment,
          land_pieces: pieces,
        }
      })
    
    // Separate payments by type
    const installmentPaymentsList = paymentsWithPieces.filter(p => p.payment_type === 'Installment')
    const bigAdvancePaymentsList = paymentsWithPieces.filter(p => p.payment_type === 'BigAdvance')
    const smallAdvancePaymentsList = paymentsWithPieces.filter(p => p.payment_type === 'SmallAdvance')
    const fullPaymentsList = paymentsWithPieces.filter(p => p.payment_type === 'Full')
    
    // Calculate totals from payments
    const installmentPaymentsTotal = installmentPaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    const bigAdvanceTotal = bigAdvancePaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    const fullPaymentsTotal = fullPaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    
    // Calculate small advance (reservation) from sales table
    const smallAdvanceFromPayments = smallAdvancePaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    const smallAdvanceFromSales = filteredSales
      .filter(s => s.status !== 'Cancelled')
      .reduce((sum, s) => sum + (s.small_advance_amount || 0), 0)
    
    const smallAdvanceTotal = smallAdvanceFromPayments > 0 ? smallAdvanceFromPayments : smallAdvanceFromSales
    
    const cashReceived = filteredPayments.reduce((sum, p) => sum + p.amount_paid, 0)

    // Calculate company fees from sales
    const companyFeesTotal = filteredSales
      .filter(s => s.status !== 'Cancelled')
      .reduce((sum, s) => sum + (s.company_fee_amount || 0), 0)

    // Group payments by client and date
    const groupPayments = (paymentList: PaymentWithDetails[]): GroupedPayment[] => {
      const groups = new Map<string, GroupedPayment>()
      
      paymentList.forEach(payment => {
        const clientId = payment.client_id || 'unknown'
        const clientName = (payment.client as any)?.name || 'عميل غير معروف'
        const clientCin = (payment.client as any)?.cin || ''
        const paymentDate = payment.payment_date
        const key = `${clientId}-${paymentDate}`
        
        if (!groups.has(key)) {
          const piecesCount = payment.land_pieces?.length || 0
          groups.set(key, {
            clientId,
            clientName,
            clientCin,
            piecesCount,
            paymentDate,
            totalAmount: 0,
            payments: [],
          })
        }
        
        const group = groups.get(key)!
        group.totalAmount += payment.amount_paid
        group.payments.push(payment)
      })
      
      return Array.from(groups.values()).sort((a, b) => 
        new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
      )
    }

    const groupedInstallmentPayments = groupPayments(installmentPaymentsList)
    const groupedBigAdvancePayments = groupPayments(bigAdvancePaymentsList)
    const groupedSmallAdvancePayments = groupPayments(smallAdvancePaymentsList)
    const groupedFullPayments = groupPayments(fullPaymentsList)

    // Group company fees by client and date
    const groupCompanyFees = (): GroupedCompanyFee[] => {
      const companyFeeSales = filteredSales
        .filter(s => s.company_fee_amount && s.company_fee_amount > 0 && s.status !== 'Cancelled')
      
      const groups = new Map<string, GroupedCompanyFee>()
      
      companyFeeSales.forEach(sale => {
        const client = sale.client as any
        const clientId = sale.client_id || 'unknown'
        const clientName = client?.name || 'عميل غير معروف'
        const clientCin = client?.cin || ''
        const clientPhone = client?.phone || ''
        const saleDate = sale.sale_date
        const key = `${clientId}-${saleDate}`
        
        if (!groups.has(key)) {
          const piecesCount = sale.land_piece_ids?.length || 0
          groups.set(key, {
            clientId,
            clientName,
            clientCin,
            clientPhone,
            piecesCount,
            saleDate,
            totalAmount: 0,
            sales: [],
          })
        }
        
        const group = groups.get(key)!
        group.totalAmount += sale.company_fee_amount || 0
        group.sales.push(sale)
      })
      
      return Array.from(groups.values()).sort((a, b) => 
        new Date(b.saleDate).getTime() - new Date(a.saleDate).getTime()
      )
    }

    const groupedCompanyFees = groupCompanyFees()

    return {
      sales: filteredSales,
      payments: filteredPayments,
      cashReceived,
      // Payment lists by type
      installmentPaymentsList,
      bigAdvancePaymentsList,
      smallAdvancePaymentsList,
      fullPaymentsList,
      // Grouped payments
      groupedInstallmentPayments,
      groupedBigAdvancePayments,
      groupedSmallAdvancePayments,
      groupedFullPayments,
      // Payment totals
      installmentPaymentsTotal,
      bigAdvanceTotal,
      smallAdvanceTotal,
      fullPaymentsTotal,
      companyFeesTotal,
      // Grouped company fees
      groupedCompanyFees,
    }
  }, [sales, payments, landPieces, dateFilter])

  // Group payments by land batch
  const getPaymentsByLand = (paymentType: PaymentTypeFilter): PaymentByLand[] => {
    const { start: startDate, end: endDate } = getDateRange(dateFilter)
    
    const isDateInRange = (dateString: string, start: Date, end: Date | null): boolean => {
      const date = new Date(dateString)
      date.setHours(0, 0, 0, 0)
      const startOnly = new Date(start)
      startOnly.setHours(0, 0, 0, 0)
      
      if (end) {
        const endOnly = new Date(end)
        endOnly.setHours(23, 59, 59, 999)
        return date >= startOnly && date <= endOnly
      } else {
        return date >= startOnly
      }
    }
    
    let filteredPayments = payments
      .filter(p => isDateInRange(p.payment_date, startDate, endDate))
      .filter(p => p.payment_type !== 'Refund')
    
    if (paymentType) {
      filteredPayments = filteredPayments.filter(p => p.payment_type === paymentType)
    }
    
    // Attach land pieces to payments
    const paymentsWithPieces = filteredPayments.map(payment => {
      const pieceIds = payment.sale?.land_piece_ids || []
      const pieces = landPieces.filter(p => pieceIds.includes(p.id))
      return {
        ...payment,
        land_pieces: pieces,
      }
    })
    
    // Group by land batch
    const landGroups = new Map<string, PaymentByLand>()
    
    paymentsWithPieces.forEach(payment => {
      const pieces = payment.land_pieces || []
      
      if (pieces.length === 0) {
        // No land pieces - group as "غير محدد"
        const key = 'غير محدد'
        if (!landGroups.has(key)) {
          landGroups.set(key, {
            landBatchName: 'غير محدد',
            location: null,
            totalAmount: 0,
            percentage: 0,
            paymentCount: 0,
            payments: [],
          })
        }
        const group = landGroups.get(key)!
        group.totalAmount += payment.amount_paid
        group.paymentCount += 1
        group.payments.push(payment)
      } else {
        pieces.forEach(piece => {
          const batchName = piece.land_batch?.name || 'غير محدد'
          const location = piece.land_batch?.location || null
          const key = `${batchName}-${location || 'no-location'}`
          
          if (!landGroups.has(key)) {
            landGroups.set(key, {
              landBatchName: batchName,
              location,
              totalAmount: 0,
              percentage: 0,
              paymentCount: 0,
              payments: [],
            })
          }
          const group = landGroups.get(key)!
          group.totalAmount += payment.amount_paid
          group.paymentCount += 1
          if (!group.payments.find(p => p.id === payment.id)) {
            group.payments.push(payment)
          }
        })
      }
    })
    
    const totalAmount = Array.from(landGroups.values()).reduce((sum, g) => sum + g.totalAmount, 0)
    
    // Calculate percentages
    const result = Array.from(landGroups.values()).map(group => ({
      ...group,
      percentage: totalAmount > 0 ? (group.totalAmount / totalAmount) * 100 : 0,
    }))
    
    return result.sort((a, b) => b.totalAmount - a.totalAmount)
  }

  const openPaymentDetails = (paymentType: PaymentTypeFilter) => {
    setSelectedPaymentType(paymentType)
    setPaymentDetailDialogOpen(true)
  }

  if (!hasPermission('view_financial')) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">ليس لديك صلاحية</div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    )
  }

  const filterLabels: Record<DateFilter, string> = {
    today: 'اليوم',
    week: 'هذا الأسبوع',
    month: 'هذا الشهر',
    all: 'الكل',
  }

  const paymentTypeLabels: Record<Exclude<PaymentTypeFilter, null>, string> = {
    'Installment': 'الأقساط',
    'SmallAdvance': 'العربون (مبلغ الحجز)',
    'Full': 'الدفع الكامل',
    'BigAdvance': 'الدفعة الأولى (الكبيرة)',
  }
  
  const getPaymentTypeLabel = (type: PaymentTypeFilter): string => {
    if (type === null) return 'الكل'
    return paymentTypeLabels[type]
  }

  const paymentsByLand = getPaymentsByLand(selectedPaymentType)

  return (
    <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">المالية</h1>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {(['today', 'week', 'month', 'all'] as DateFilter[]).map(filter => (
            <Button
              key={filter}
              variant={dateFilter === filter ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDateFilter(filter)}
              className="flex-1 sm:flex-none text-xs sm:text-sm"
            >
              {filterLabels[filter]}
            </Button>
          ))}
        </div>
      </div>

      {/* Grand Total - Most Important */}
      <Card className="bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg">
        <CardContent className="pt-3 sm:pt-4 pb-3 sm:pb-4 px-3 sm:px-4 md:px-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-green-100 mb-1">المجموع الإجمالي</p>
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold">{formatCurrency(filteredData.cashReceived + filteredData.companyFeesTotal)}</p>
              <p className="text-xs text-green-100 mt-1">
                المستلم ({formatCurrency(filteredData.cashReceived)}) + العمولة ({formatCurrency(filteredData.companyFeesTotal)})
              </p>
            </div>
            <div className="text-right hidden sm:block">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center">
                <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
      {/* Cash Received Summary */}
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-purple-700 mb-1">المستلم نقداً</p>
                <p className="text-xl sm:text-2xl font-bold text-purple-800">{formatCurrency(filteredData.cashReceived)}</p>
              </div>
              <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500 flex-shrink-0" />
            </div>
            <p className="text-xs text-purple-600">{filteredData.payments.length} عملية دفع</p>
          </CardContent>
        </Card>

      {/* Company Fees Summary - Clickable Card */}
        <Card 
          className="bg-indigo-50 border-indigo-200 cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setCompanyFeeDialogOpen(true)}
        >
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex-1">
                <p className="text-sm font-medium text-indigo-700 mb-1">العمولة</p>
                <p className="text-xl sm:text-2xl font-bold text-indigo-800">{formatCurrency(filteredData.companyFeesTotal)}</p>
              </div>
              <DollarSign className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-500 flex-shrink-0" />
            </div>
            <p className="text-xs text-indigo-600">عمولة الشركة من المبيعات</p>
            {filteredData.groupedCompanyFees.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto mt-4">
                {filteredData.groupedCompanyFees.slice(0, 3).map((group) => (
                  <div key={`${group.clientId}-${group.saleDate}`} className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg border border-indigo-100">
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-indigo-800">{group.clientName}</span>
                        {group.clientCin && (
                          <span className="text-xs text-indigo-600">({group.clientCin})</span>
                        )}
                        {group.piecesCount > 0 && (
                          <span className="text-xs text-indigo-500">{group.piecesCount} قطعة</span>
                        )}
                      </div>
                      <span className="text-xs text-indigo-600">{formatDate(group.saleDate)}</span>
                    </div>
                    <span className="font-bold text-indigo-700">+{formatCurrency(group.totalAmount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payments - Organized by Type - Clickable Cards */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">المدفوعات</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* الأقساط - Installments Section */}
          <Card 
            className="border-blue-200 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openPaymentDetails('Installment')}
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-blue-700">الأقساط</h3>
                <span className="text-xl font-bold text-blue-600">{formatCurrency(filteredData.installmentPaymentsTotal)}</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {filteredData.groupedInstallmentPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">لا توجد أقساط</p>
                ) : (
                  filteredData.groupedInstallmentPayments.slice(0, 3).map((group) => (
                    <div key={`${group.clientId}-${group.paymentDate}`} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex flex-col flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-blue-800">{group.clientName}</span>
                          {group.clientCin && (
                            <span className="text-xs text-blue-600">({group.clientCin})</span>
                          )}
                          {group.piecesCount > 0 && (
                            <span className="text-xs text-blue-500">{group.piecesCount} قطعة</span>
                          )}
                        </div>
                        <span className="text-xs text-blue-600">{formatDate(group.paymentDate)}</span>
                      </div>
                      <span className="font-bold text-blue-700">+{formatCurrency(group.totalAmount)}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* العربون (مبلغ الحجز) - Reservation/Deposit Section */}
          <Card 
            className="border-orange-200 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openPaymentDetails('SmallAdvance')}
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-orange-700">العربون (مبلغ الحجز)</h3>
                <span className="text-xl font-bold text-orange-600">{formatCurrency(filteredData.smallAdvanceTotal)}</span>
              </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {filteredData.smallAdvanceTotal === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">لا توجد عربون</p>
              ) : filteredData.groupedSmallAdvancePayments.length > 0 ? (
                filteredData.groupedSmallAdvancePayments.slice(0, 3).map((group) => (
                  <div key={`${group.clientId}-${group.paymentDate}`} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100">
                    <div className="flex flex-col flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-orange-800">{group.clientName}</span>
                        {group.clientCin && (
                          <span className="text-xs text-orange-600">({group.clientCin})</span>
                        )}
                        {group.piecesCount > 0 && (
                          <span className="text-xs text-orange-500">{group.piecesCount} قطعة</span>
                        )}
                      </div>
                      <span className="text-xs text-orange-600">{formatDate(group.paymentDate)}</span>
                    </div>
                    <span className="font-bold text-orange-700">+{formatCurrency(group.totalAmount)}</span>
                  </div>
                ))
              ) : (
                filteredData.sales
                  .filter(s => s.small_advance_amount && s.small_advance_amount > 0 && s.status !== 'Cancelled')
                  .slice(0, 3)
                  .map((sale) => (
                    <div key={sale.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100">
                      <div className="flex flex-col flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-orange-800">{sale.client?.name || 'عميل غير معروف'}</span>
                          {sale.client?.cin && (
                            <span className="text-xs text-orange-600">({sale.client.cin})</span>
                          )}
                          {sale.land_piece_ids && sale.land_piece_ids.length > 0 && (
                            <span className="text-xs text-orange-500">{sale.land_piece_ids.length} قطعة</span>
                          )}
                        </div>
                        <span className="text-xs text-orange-600">{formatDate(sale.sale_date)}</span>
                      </div>
                      <span className="font-bold text-orange-700">+{formatCurrency(sale.small_advance_amount || 0)}</span>
                    </div>
                  ))
              )}
            </div>
            </CardContent>
          </Card>

          {/* الدفع الكامل - Full Payment Section */}
          <Card 
            className="border-green-200 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openPaymentDetails('Full')}
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-green-700">الدفع الكامل</h3>
                <span className="text-xl font-bold text-green-600">{formatCurrency(filteredData.fullPaymentsTotal)}</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {filteredData.groupedFullPayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">لا توجد دفعات كاملة</p>
                ) : (
                  filteredData.groupedFullPayments.slice(0, 3).map((group) => (
                    <div key={`${group.clientId}-${group.paymentDate}`} className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
                      <div className="flex flex-col flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-green-800">{group.clientName}</span>
                          {group.clientCin && (
                            <span className="text-xs text-green-600">({group.clientCin})</span>
                          )}
                          {group.piecesCount > 0 && (
                            <span className="text-xs text-green-500">{group.piecesCount} قطعة</span>
                          )}
                        </div>
                        <span className="text-xs text-green-600">{formatDate(group.paymentDate)}</span>
                      </div>
                      <span className="font-bold text-green-700">+{formatCurrency(group.totalAmount)}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* الدفعة الأولى (الكبيرة) - Big Advance Payments Section */}
          <Card 
            className="border-purple-200 cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => openPaymentDetails('BigAdvance')}
          >
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-lg text-purple-700">الدفعة الأولى (الكبيرة)</h3>
                <span className="text-xl font-bold text-purple-600">{formatCurrency(filteredData.bigAdvanceTotal)}</span>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {filteredData.groupedBigAdvancePayments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">لا توجد دفعات أولى</p>
                ) : (
                  filteredData.groupedBigAdvancePayments.slice(0, 3).map((group) => (
                    <div key={`${group.clientId}-${group.paymentDate}`} className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100">
                      <div className="flex flex-col flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-purple-800">{group.clientName}</span>
                          {group.clientCin && (
                            <span className="text-xs text-purple-600">({group.clientCin})</span>
                          )}
                          {group.piecesCount > 0 && (
                            <span className="text-xs text-purple-500">{group.piecesCount} قطعة</span>
                          )}
                        </div>
                        <span className="text-xs text-purple-600">{formatDate(group.paymentDate)}</span>
                      </div>
                      <span className="font-bold text-purple-700">+{formatCurrency(group.totalAmount)}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Details Dialog */}
      <Dialog open={paymentDetailDialogOpen} onOpenChange={setPaymentDetailDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                تفاصيل {selectedPaymentType ? getPaymentTypeLabel(selectedPaymentType) : 'المدفوعات'}
                {dateFilter !== 'all' && ` - ${filterLabels[dateFilter]}`}
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPaymentDetailDialogOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4">
            {/* Summary Card */}
            {paymentsByLand.length > 0 && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-3 sm:pt-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">إجمالي المدفوعات</p>
                      <p className="text-base sm:text-xl font-bold">{formatCurrency(paymentsByLand.reduce((sum, g) => sum + g.totalAmount, 0))}</p>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">عدد الدفعات</p>
                      <p className="text-base sm:text-xl font-bold">{paymentsByLand.length}</p>
                    </div>
                <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">إجمالي المدفوعات</p>
                      <p className="text-base sm:text-xl font-bold">{paymentsByLand.reduce((sum, g) => sum + g.paymentCount, 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Combined Table - Summary and Details in One */}
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead>التاريخ</TableHead>
                    <TableHead>العميل</TableHead>
                    <TableHead>اسم الدفعة</TableHead>
                    <TableHead>الموقع</TableHead>
                    <TableHead>عدد القطع</TableHead>
                    <TableHead>نوع الدفع</TableHead>
                    <TableHead className="text-right">المبلغ</TableHead>
                    <TableHead>ملاحظات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentsByLand.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        لا توجد مدفوعات
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {paymentsByLand.flatMap((group, groupIndex) => {
                        const totalGroupAmount = group.totalAmount
                        const groupPercentage = group.percentage
                        
                        // Calculate payment type breakdown for this group
                        const fullCount = group.payments.filter(p => p.payment_type === 'Full').length
                        const bigAdvanceCount = group.payments.filter(p => p.payment_type === 'BigAdvance').length
                        const installmentCount = group.payments.filter(p => p.payment_type === 'Installment').length
                        const smallAdvanceCount = group.payments.filter(p => p.payment_type === 'SmallAdvance').length
                        
                        return [
                          // Summary row for this land batch
                          <TableRow key={`summary-${groupIndex}`} className="bg-gray-50 font-bold">
                            <TableCell colSpan={4} className="font-bold">
                              {group.landBatchName} {group.location && `- ${group.location}`}
                            </TableCell>
                            <TableCell className="text-center">{group.payments.reduce((sum, p) => sum + (p.land_pieces?.length || 0), 0)}</TableCell>
                            <TableCell className="text-sm">
                              {fullCount > 0 && <span className="mr-2">بالحاضر: {fullCount}</span>}
                              {bigAdvanceCount > 0 && <span className="mr-2">دفعة: {bigAdvanceCount}</span>}
                              {installmentCount > 0 && <span className="mr-2">بالتقسيط: {installmentCount}</span>}
                              {smallAdvanceCount > 0 && <span className="mr-2">عربون: {smallAdvanceCount}</span>}
                            </TableCell>
                            <TableCell className="text-right font-bold">{formatCurrency(totalGroupAmount)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{group.paymentCount} دفعة</TableCell>
                          </TableRow>,
                          // Detail rows for each payment
                          ...group.payments.map((payment) => {
                            const pieces = payment.land_pieces || []
                            const batchName = pieces[0]?.land_batch?.name || 'غير محدد'
                            const location = pieces[0]?.land_batch?.location || null
                            const piecesCount = pieces.length || 0
                            const paymentTypeLabel = 
                              payment.payment_type === 'Full' ? 'دفع كامل' :
                              payment.payment_type === 'BigAdvance' ? 'دفعة كبيرة' :
                              payment.payment_type === 'Installment' ? 'قسط' :
                              payment.payment_type === 'SmallAdvance' ? 'عربون' : payment.payment_type || '-'
                            
                            const client = payment.client as any
                            const saleType = payment.sale?.payment_type === 'Full' ? 'بالحاضر' : payment.sale?.payment_type === 'Installment' ? 'بالتقسيط' : '-'
                            const pieceNumbers = pieces.map(p => `#${p.piece_number}`).join(', ') || '-'
                            
                            return (
                              <TableRow key={payment.id} className="bg-white">
                                <TableCell>{formatDate(payment.payment_date)}</TableCell>
                                <TableCell>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{client?.name || 'غير معروف'}</span>
                                    {client?.phone && <span className="text-xs text-muted-foreground">({client.phone})</span>}
                                  </div>
                                </TableCell>
                                <TableCell className="text-muted-foreground">{batchName}</TableCell>
                                <TableCell className="text-muted-foreground">{location || '-'}</TableCell>
                                <TableCell className="text-center">
                                  <div className="flex flex-col">
                                    <span>{piecesCount}</span>
                                    {pieceNumbers !== '-' && <span className="text-xs text-muted-foreground">{pieceNumbers}</span>}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">
                                  <div className="flex flex-col">
                                    <span>{paymentTypeLabel}</span>
                                    {saleType !== '-' && <span className="text-xs text-muted-foreground">({saleType})</span>}
                </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">{formatCurrency(payment.amount_paid)}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{payment.notes || '-'}</TableCell>
                              </TableRow>
                            )
                          })
                        ]
                      })}
                      {/* Grand Total Row */}
                      <TableRow className="bg-primary/10 font-bold border-t-2">
                        <TableCell colSpan={4} className="font-bold">الإجمالي</TableCell>
                        <TableCell className="text-center font-bold">
                          {paymentsByLand.reduce((sum, g) => sum + g.payments.reduce((s, p) => s + (p.land_pieces?.length || 0), 0), 0)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {(() => {
                            const allPayments = paymentsByLand.flatMap(g => g.payments)
                            const full = allPayments.filter(p => p.payment_type === 'Full').length
                            const bigAdvance = allPayments.filter(p => p.payment_type === 'BigAdvance').length
                            const installment = allPayments.filter(p => p.payment_type === 'Installment').length
                            const smallAdvance = allPayments.filter(p => p.payment_type === 'SmallAdvance').length
                            return (
                              <>
                                {full > 0 && <span className="mr-2">بالحاضر: {full}</span>}
                                {bigAdvance > 0 && <span className="mr-2">دفعة: {bigAdvance}</span>}
                                {installment > 0 && <span className="mr-2">بالتقسيط: {installment}</span>}
                                {smallAdvance > 0 && <span className="mr-2">عربون: {smallAdvance}</span>}
                              </>
                            )
                          })()}
                        </TableCell>
                        <TableCell className="text-right font-bold text-lg">
                          {formatCurrency(paymentsByLand.reduce((sum, g) => sum + g.totalAmount, 0))}
                        </TableCell>
                        <TableCell className="text-sm">
                          {paymentsByLand.reduce((sum, g) => sum + g.paymentCount, 0)} دفعة
                        </TableCell>
                      </TableRow>
                    </>
                )}
                </TableBody>
              </Table>
              </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Company Fee Details Dialog */}
      <Dialog open={companyFeeDialogOpen} onOpenChange={setCompanyFeeDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>
                تفاصيل العمولة
                {dateFilter !== 'all' && ` - ${filterLabels[dateFilter]}`}
              </DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCompanyFeeDialogOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4">
            {/* Summary Card */}
            {filteredData.groupedCompanyFees.length > 0 && (
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="pt-3 sm:pt-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">إجمالي العمولة</p>
                      <p className="text-base sm:text-xl font-bold">{formatCurrency(filteredData.companyFeesTotal)}</p>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">عدد المبيعات</p>
                      <p className="text-base sm:text-xl font-bold">{filteredData.groupedCompanyFees.reduce((sum, g) => sum + g.sales.length, 0)}</p>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">عدد العملاء</p>
                      <p className="text-base sm:text-xl font-bold">{filteredData.groupedCompanyFees.length}</p>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">عدد القطع</p>
                      <p className="text-base sm:text-xl font-bold">{filteredData.groupedCompanyFees.reduce((sum, g) => sum + g.piecesCount, 0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Company Fees Table - Grouped by Land Batch */}
            {(() => {
              // Group company fees by land batch
              const companyFeeSales = filteredData.groupedCompanyFees.flatMap(g => g.sales)
              const landGroups = new Map<string, CompanyFeeByLand>()
              
              companyFeeSales.forEach(sale => {
                const pieceIds = sale.land_piece_ids || []
                const pieces = landPieces.filter(p => pieceIds.includes(p.id))
                
                if (pieces.length === 0) {
                  const key = 'غير محدد'
                  if (!landGroups.has(key)) {
                    landGroups.set(key, {
                      landBatchName: 'غير محدد',
                      location: null,
                      totalAmount: 0,
                      percentage: 0,
                      saleCount: 0,
                      sales: [],
                    })
                  }
                  const group = landGroups.get(key)!
                  group.totalAmount += sale.company_fee_amount || 0
                  group.saleCount += 1
                  group.sales.push(sale)
                } else {
                  pieces.forEach(piece => {
                    const batchName = piece.land_batch?.name || 'غير محدد'
                    const location = piece.land_batch?.location || null
                    const key = `${batchName}-${location || 'no-location'}`
                    
                    if (!landGroups.has(key)) {
                      landGroups.set(key, {
                        landBatchName: batchName,
                        location,
                        totalAmount: 0,
                        percentage: 0,
                        saleCount: 0,
                        sales: [],
                      })
                    }
                    const group = landGroups.get(key)!
                    // Distribute company fee per piece
                    const feePerPiece = (sale.company_fee_amount || 0) / pieceIds.length
                    group.totalAmount += feePerPiece
                    if (!group.sales.find(s => s.id === sale.id)) {
                      group.sales.push(sale)
                      group.saleCount += 1
                    }
                  })
                }
              })
              
              const totalAmount = Array.from(landGroups.values()).reduce((sum, g) => sum + g.totalAmount, 0)
              const companyFeesByLand = Array.from(landGroups.values()).map(group => ({
                ...group,
                percentage: totalAmount > 0 ? (group.totalAmount / totalAmount) * 100 : 0,
              })).sort((a, b) => b.totalAmount - a.totalAmount)
              
              return (
                <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <Table className="min-w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead>التاريخ</TableHead>
                        <TableHead>العميل</TableHead>
                        <TableHead>اسم الدفعة</TableHead>
                        <TableHead>الموقع</TableHead>
                        <TableHead>عدد القطع</TableHead>
                        <TableHead>نوع البيع</TableHead>
                        <TableHead className="text-right">سعر البيع</TableHead>
                        <TableHead className="text-right">نسبة العمولة</TableHead>
                        <TableHead className="text-right">مبلغ العمولة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {companyFeesByLand.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            لا توجد عمولات
                          </TableCell>
                        </TableRow>
                      ) : (
                        <>
                          {companyFeesByLand.flatMap((group, groupIndex) => {
                            const totalGroupAmount = group.totalAmount
                            
                            return [
                              // Summary row for this land batch
                              <TableRow key={`summary-${groupIndex}`} className="bg-gray-50 font-bold">
                                <TableCell colSpan={4} className="font-bold">
                                  {group.landBatchName} {group.location && `- ${group.location}`}
                                </TableCell>
                                <TableCell className="text-center">
                                  {group.sales.reduce((sum, s) => sum + (s.land_piece_ids?.length || 0), 0)}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {group.saleCount} مبيعة
                                </TableCell>
                                <TableCell className="text-right font-bold">{formatCurrency(group.sales.reduce((sum, s) => sum + s.total_selling_price, 0))}</TableCell>
                                <TableCell className="text-right font-bold">{formatCurrency(totalGroupAmount)}</TableCell>
                                <TableCell className="text-right font-bold">{formatCurrency(totalGroupAmount)}</TableCell>
                              </TableRow>,
                              // Detail rows for each sale
                              ...group.sales.map((sale) => {
                                const pieceIds = sale.land_piece_ids || []
                                const pieces = landPieces.filter(p => pieceIds.includes(p.id))
                                const pieceNumbers = pieces.map(p => `#${p.piece_number}`).join('، ') || '-'
                                const batchName = pieces[0]?.land_batch?.name || 'غير محدد'
                                const location = pieces[0]?.land_batch?.location || null
                                const client = sale.client as any
                                const feePerPiece = (sale.company_fee_amount || 0) / pieceIds.length
                                const feeForThisBatch = pieces.length * feePerPiece
                                
                                return (
                                  <TableRow key={sale.id} className="bg-white">
                                    <TableCell>{formatDate(sale.sale_date)}</TableCell>
                                    <TableCell>
                                      <div className="flex flex-col">
                                        <span className="font-medium">{client?.name || 'غير معروف'}</span>
                                        {client?.phone && <span className="text-xs text-muted-foreground">({client.phone})</span>}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-muted-foreground">{batchName}</TableCell>
                                    <TableCell className="text-muted-foreground">{location || '-'}</TableCell>
                                    <TableCell className="text-center">
                                      <div className="flex flex-col">
                                        <span>{pieces.length}</span>
                                        {pieceNumbers !== '-' && <span className="text-xs text-muted-foreground">{pieceNumbers}</span>}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                      <Badge variant={sale.payment_type === 'Full' ? 'success' : 'secondary'} className="text-xs">
                                        {sale.payment_type === 'Full' ? 'بالحاضر' : 'بالتقسيط'}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                      {formatCurrency((sale.total_selling_price / pieceIds.length) * pieces.length)}
                                    </TableCell>
                                    <TableCell className="text-right">{sale.company_fee_percentage ? `${sale.company_fee_percentage}%` : '-'}</TableCell>
                                    <TableCell className="text-right font-bold text-indigo-700">{formatCurrency(feeForThisBatch)}</TableCell>
                                  </TableRow>
                                )
                              })
                            ]
                          })}
                          {/* Grand Total Row */}
                          <TableRow className="bg-primary/10 font-bold border-t-2">
                            <TableCell colSpan={8} className="font-bold">الإجمالي:</TableCell>
                            <TableCell className="text-right font-bold text-lg text-indigo-800">
                              {formatCurrency(filteredData.companyFeesTotal)}
                            </TableCell>
                          </TableRow>
                        </>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {filteredData.payments.length === 0 && filteredData.sales.length === 0 && (
        <p className="text-center text-muted-foreground py-8">لا توجد بيانات لهذه الفترة</p>
      )}
    </div>
  )
}
