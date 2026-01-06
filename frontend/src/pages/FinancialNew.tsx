import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
import { DollarSign, CreditCard, TrendingUp, X, ChevronDown, ChevronUp, Calendar } from 'lucide-react'
import type { Sale, Client, Payment, LandPiece, LandBatch } from '@/types/database'

interface SaleWithClient extends Sale {
  client?: Client
  created_by_user?: { id: string; name: string; email?: string }
}

interface PaymentWithDetails extends Payment {
  client?: Client
  sale?: {
    land_piece_ids?: string[]
    payment_type?: 'Full' | 'Installment'
    total_selling_price?: number
    created_by?: string
    created_by_user?: { id: string; name: string; email?: string }
  }
  land_pieces?: Array<LandPiece & { land_batch?: LandBatch }>
  recorded_by_user?: { id: string; name: string; email?: string }
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

interface PaymentByLandPiece {
  pieceId: string
  pieceNumber: string
  landBatchName: string
  location: string | null
  totalAmount: number
  installmentCount: number
  payments: PaymentWithDetails[]
  recordedByUsers: Set<string>
  soldByUsers: Set<string>
}

interface PaymentByLand {
  landBatchName: string
  location: string | null
  totalAmount: number
  percentage: number
  paymentCount: number
  pieces: PaymentByLandPiece[]
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
  salesCount: number
  piecesCount: number
  sales: SaleWithClient[]
}

type DateFilter = 'today' | 'week' | 'month' | 'all' | 'custom'
type PaymentTypeFilter = 'Installment' | 'SmallAdvance' | 'Full' | 'BigAdvance' | null

export function Financial() {
  const { hasPermission } = useAuth()
  const [sales, setSales] = useState<SaleWithClient[]>([])
  const [payments, setPayments] = useState<PaymentWithDetails[]>([])
  const [landPieces, setLandPieces] = useState<Array<LandPiece & { land_batch?: LandBatch }>>([])
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [expandedPaymentType, setExpandedPaymentType] = useState<PaymentTypeFilter | null>(null)
  const [expandedLandGroups, setExpandedLandGroups] = useState<Set<string>>(new Set())
  const [expandedPieceGroups, setExpandedPieceGroups] = useState<Set<string>>(new Set())
  const [selectedPaymentTypeForDialog, setSelectedPaymentTypeForDialog] = useState<PaymentTypeFilter | null>(null)
  const [paymentDetailDialogOpen, setPaymentDetailDialogOpen] = useState(false)
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
          .select('*, client:clients(*), created_by_user:users!sales_created_by_fkey(id, name, email)')
          .order('sale_date', { ascending: false }),
        supabase
          .from('payments')
          .select('*, client:clients(*), sale:sales(land_piece_ids, payment_type, total_selling_price, created_by, created_by_user:users!sales_created_by_fkey(id, name, email)), recorded_by_user:users!payments_recorded_by_fkey(id, name, email)')
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
      case 'custom':
        if (selectedDate) {
          const filterDate = new Date(selectedDate)
          filterDate.setHours(0, 0, 0, 0)
          const filterDateEnd = new Date(selectedDate)
          filterDateEnd.setHours(23, 59, 59, 999)
          return { start: filterDate, end: filterDateEnd }
        }
        return { start: new Date(0), end: null }
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
      default:
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
      .filter(p => isDateInRange(p.payment_date, startDate, endDate))
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

    // Group company fees by land batch for table display
    const groupCompanyFeesByLand = (): CompanyFeeByLand[] => {
      const companyFeeSales = filteredSales
        .filter(s => s.company_fee_amount && s.company_fee_amount > 0 && s.status !== 'Cancelled')
      
      const landGroups = new Map<string, CompanyFeeByLand>()
      
      companyFeeSales.forEach(sale => {
        const pieceIds = sale.land_piece_ids || []
        const pieces = landPieces.filter(p => pieceIds.includes(p.id))
        const landBatch = pieces[0]?.land_batch
        const landBatchName = landBatch?.name || 'غير محدد'
        const location = landBatch?.location || null
        const key = `${landBatchName}-${location || ''}`
        
        if (!landGroups.has(key)) {
          landGroups.set(key, {
            landBatchName,
            location,
            totalAmount: 0,
            percentage: 0,
            salesCount: 0,
            piecesCount: 0,
            sales: [],
          })
        }
        
        const group = landGroups.get(key)!
        group.totalAmount += sale.company_fee_amount || 0
        group.salesCount++
        group.piecesCount += pieceIds.length
        group.sales.push(sale)
      })
      
      return Array.from(landGroups.values()).sort((a, b) => b.totalAmount - a.totalAmount)
    }

    const companyFeesByLand = groupCompanyFeesByLand()

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
      companyFeesByLand,
    }
  }, [sales, payments, landPieces, dateFilter, selectedDate])

  // Group payments by land batch and piece - don't repeat installments for same piece
  // This function uses filteredData which already has date filtering and excludes cancelled sales
  const getPaymentsByLand = (paymentType: PaymentTypeFilter): PaymentByLand[] => {
    // Get the appropriate payment list from filteredData based on type
    let filteredPayments: PaymentWithDetails[] = []
    
    if (paymentType === 'Installment') {
      filteredPayments = filteredData.installmentPaymentsList
    } else if (paymentType === 'SmallAdvance') {
      filteredPayments = filteredData.smallAdvancePaymentsList
    } else if (paymentType === 'Full') {
      filteredPayments = filteredData.fullPaymentsList
    } else if (paymentType === 'BigAdvance') {
      filteredPayments = filteredData.bigAdvancePaymentsList
    } else {
      filteredPayments = filteredData.payments
    }
    
    // Attach land pieces to payments (already filtered and excluding cancelled sales in filteredData)
    const paymentsWithPieces = filteredPayments.map(payment => {
      const pieceIds = payment.sale?.land_piece_ids || []
      const pieces = landPieces.filter(p => pieceIds.includes(p.id))
      return {
        ...payment,
        land_pieces: pieces,
      }
    })
    
    // Group by land batch, then by piece
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
            pieces: [],
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
          const batchKey = `${batchName}-${location || 'no-location'}`
          
          if (!landGroups.has(batchKey)) {
            landGroups.set(batchKey, {
              landBatchName: batchName,
              location,
              totalAmount: 0,
              percentage: 0,
              paymentCount: 0,
              pieces: [],
              payments: [],
            })
          }
          const group = landGroups.get(batchKey)!
          
          // Find or create piece group
          let pieceGroup = group.pieces.find(p => p.pieceId === piece.id)
          if (!pieceGroup) {
            pieceGroup = {
              pieceId: piece.id,
              pieceNumber: piece.piece_number,
              landBatchName: batchName,
              location,
              totalAmount: 0,
              installmentCount: 0,
              payments: [],
              recordedByUsers: new Set(),
              soldByUsers: new Set(),
            }
            group.pieces.push(pieceGroup)
          }
          
          // Add payment to piece group (amount per piece = total payment / number of pieces)
          const amountPerPiece = payment.amount_paid / pieces.length
          pieceGroup.totalAmount += amountPerPiece
          if (payment.payment_type === 'Installment') {
            pieceGroup.installmentCount += 1
          }
          if (!pieceGroup.payments.find(p => p.id === payment.id)) {
          pieceGroup.payments.push(payment)
          }
          
          // Track users
          if ((payment as any).recorded_by_user?.name) {
            pieceGroup.recordedByUsers.add((payment as any).recorded_by_user.name)
          }
          if ((payment.sale as any)?.created_by_user?.name) {
            pieceGroup.soldByUsers.add((payment.sale as any).created_by_user.name)
          }
          
          // Also add to batch totals (only once per payment, not per piece)
          if (!group.payments.find(p => p.id === payment.id)) {
          group.totalAmount += payment.amount_paid
          group.paymentCount += 1
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

  const togglePaymentDetails = (paymentType: PaymentTypeFilter) => {
    setExpandedPaymentType(expandedPaymentType === paymentType ? null : paymentType)
  }
  
  // Helper function to render expandable payment details by land
  const renderPaymentDetailsByLand = (paymentType: PaymentTypeFilter, colorConfig: {
    border: string
    bg: string
    bgHover: string
    text: string
    textLight: string
    textBold: string
    chevron: string
  }) => {
    const paymentsByLand = getPaymentsByLand(paymentType)
    if (paymentsByLand.length === 0) {
      return <p className="text-xs text-muted-foreground text-center py-2">لا توجد مدفوعات</p>
    }
    return (
      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {paymentsByLand.map((landGroup, idx) => {
          const isExpanded = expandedLandGroups.has(`${landGroup.landBatchName}-${landGroup.location || ''}`)
          return (
            <div key={idx} className={`border ${colorConfig.border} rounded overflow-hidden`}>
              <div 
                className={`${colorConfig.bg} p-1.5 cursor-pointer ${colorConfig.bgHover} transition-colors flex items-center justify-between`}
                onClick={() => {
                  const key = `${landGroup.landBatchName}-${landGroup.location || ''}`
                  setExpandedLandGroups(prev => {
                    const next = new Set(prev)
                    if (next.has(key)) {
                      next.delete(key)
                    } else {
                      next.add(key)
                    }
                    return next
                  })
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold text-xs ${colorConfig.text} truncate`}>{landGroup.landBatchName}</div>
                  {landGroup.location && <div className={`text-xs ${colorConfig.textLight} truncate`}>{landGroup.location}</div>}
                </div>
                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                  <div className="text-right">
                    <div className={`text-xs font-bold ${colorConfig.textBold}`}>{formatCurrency(landGroup.totalAmount)}</div>
                    <div className={`text-xs ${colorConfig.textLight}`}>{landGroup.pieces.length} قطعة</div>
                  </div>
                  {isExpanded ? <ChevronUp className={`h-3 w-3 ${colorConfig.chevron}`} /> : <ChevronDown className={`h-3 w-3 ${colorConfig.chevron}`} />}
                </div>
              </div>
              {isExpanded && (
                <div className="p-1.5 bg-white space-y-1">
                  {landGroup.pieces.map((piece, pIdx) => (
                    <div key={pIdx} className={`border ${colorConfig.border} rounded p-1.5 ${colorConfig.bg}/50`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`font-medium text-xs ${colorConfig.text}`}>#{piece.pieceNumber}</span>
                        <div className="text-right">
                          <span className={`text-xs font-bold ${colorConfig.textBold}`}>{formatCurrency(piece.totalAmount)}</span>
                          {piece.installmentCount > 0 && (
                            <span className={`text-xs ${colorConfig.textLight} mr-1`}>({piece.installmentCount} قسط)</span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {piece.recordedByUsers.size > 0 && (
                          <div>سجل: {Array.from(piece.recordedByUsers).join('، ')}</div>
                        )}
                        {piece.soldByUsers.size > 0 && (
                          <div>باع: {Array.from(piece.soldByUsers).join('، ')}</div>
                        )}
                      </div>
                      {/* Show individual payments with users */}
                      {piece.payments.length > 0 && (
                        <div className="mt-1 pt-1 border-t border-gray-200 space-y-0.5">
                          {piece.payments.map((payment, payIdx) => {
                            const recordedBy = (payment as any).recorded_by_user?.name || '-'
                            const soldBy = (payment.sale as any)?.created_by_user?.name || '-'
                            return (
                              <div key={payIdx} className="text-xs text-gray-600 flex items-center justify-between">
                                <span>{formatCurrency(payment.amount_paid)} - {formatDate(payment.payment_date)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {recordedBy !== '-' && `سجل: ${recordedBy}`}
                                  {soldBy !== '-' && recordedBy !== '-' && ' • '}
                                  {soldBy !== '-' && `باع: ${soldBy}`}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
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
    custom: 'تاريخ محدد',
  }

  const paymentTypeLabels: Record<Exclude<PaymentTypeFilter, null>, string> = {
    'Installment': 'الأقساط',
    'SmallAdvance': 'العربون (مبلغ الحجز)',
    'Full': 'الدفع الكامل',
    'BigAdvance': 'الدفعة الأولى',
  }
  
  const getPaymentTypeLabel = (type: PaymentTypeFilter): string => {
    if (type === null) return 'الكل'
    return paymentTypeLabels[type]
  }

  const paymentsByLand = getPaymentsByLand(expandedPaymentType)
  
  const openPaymentDetailsDialog = (paymentType: PaymentTypeFilter) => {
    setSelectedPaymentTypeForDialog(paymentType)
    setPaymentDetailDialogOpen(true)
  }

  return (
    <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">المالية</h1>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {(['today', 'week', 'month', 'all'] as DateFilter[]).map(filter => (
            <Button
              key={filter}
              variant={dateFilter === filter && !selectedDate ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setDateFilter(filter)
                setSelectedDate('')
              }}
              className="flex-1 sm:flex-none text-xs sm:text-sm"
            >
              {filterLabels[filter]}
            </Button>
          ))}
          <div className="flex items-center gap-2 border rounded-md px-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value)
                if (e.target.value) {
                  setDateFilter('custom')
                }
              }}
              className="h-8 w-auto text-xs border-0 focus-visible:ring-0 p-0"
            />
            {selectedDate && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedDate('')
                  setDateFilter('today')
                }}
                className="h-6 w-6 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Grand Total - Most Important */}
      <Card className="bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg">
        <CardContent className="pt-3 sm:pt-4 pb-3 sm:pb-4 px-3 sm:px-4 md:px-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm font-medium text-green-100 mb-1">المجموع الإجمالي (المستلم + العمولة المستحقة)</p>
              <p className="text-2xl sm:text-3xl md:text-4xl font-bold">{formatCurrency(filteredData.cashReceived + filteredData.companyFeesTotal)}</p>
              <p className="text-xs text-green-100 mt-1">
                المستلم نقداً: {formatCurrency(filteredData.cashReceived)} | العمولة المستحقة: {formatCurrency(filteredData.companyFeesTotal)}
              </p>
              <p className="text-xs text-green-200 mt-1 opacity-90">
                ملاحظة: العمولة هي مبلغ مستحق يتم إضافته لسعر البيع، وليس مبلغاً مستلماً نقداً
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

      {/* Cash Received Summary - Single Card (العمولة is in the table below) */}
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

      {/* Payments & Commission - 5 Categories */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">المدفوعات والعمولة</h2>
        
        {/* Desktop: Table View for all 5 categories */}
        <div className="hidden md:block">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-bold">النوع</TableHead>
                    <TableHead className="font-bold">المكان</TableHead>
                    <TableHead className="font-bold text-center">القطع</TableHead>
                    <TableHead className="font-bold text-center">العمليات</TableHead>
                    <TableHead className="font-bold text-right">المبلغ</TableHead>
                    <TableHead className="font-bold text-center">تفاصيل</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* الأقساط */}
                  {(() => {
                    const data = getPaymentsByLand('Installment')
                    const totalAmount = filteredData.installmentPaymentsTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    
                    if (data.length === 0) {
                      return (
                        <TableRow className="bg-blue-50/50">
                          <TableCell className="font-bold text-blue-700">الأقساط</TableCell>
                          <TableCell className="text-muted-foreground">-</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-right font-bold text-blue-600">{formatCurrency(0)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    return [
                      ...data.map((group, idx) => (
                        <TableRow key={`inst-${idx}`} className="bg-blue-50/50 hover:bg-blue-100/50">
                          <TableCell className="font-bold text-blue-700">{idx === 0 ? 'الأقساط' : ''}</TableCell>
                          <TableCell>
                            <div className="font-medium">{group.landBatchName}</div>
                            {group.location && <div className="text-xs text-muted-foreground">{group.location}</div>}
                          </TableCell>
                          <TableCell className="text-center">{group.pieces.length}</TableCell>
                          <TableCell className="text-center">{group.paymentCount}</TableCell>
                          <TableCell className="text-right font-bold text-blue-600">{formatCurrency(group.totalAmount)}</TableCell>
                          <TableCell className="text-center">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => openPaymentDetailsDialog('Installment')}
                              className="text-blue-600 hover:text-blue-800"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )),
                      data.length > 1 && (
                        <TableRow key="inst-summary" className="bg-blue-100/50 font-bold">
                          <TableCell className="text-blue-800">إجمالي الأقساط</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell className="text-center">{totalPieces}</TableCell>
                          <TableCell className="text-center">{totalPayments}</TableCell>
                          <TableCell className="text-right text-blue-800">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell>-</TableCell>
                        </TableRow>
                      )
                    ]
                  })()}
                  
                  {/* العربون */}
                  {(() => {
                    const data = getPaymentsByLand('SmallAdvance')
                    const totalAmount = filteredData.smallAdvanceTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    
                    if (data.length === 0) {
                      return (
                        <TableRow className="bg-orange-50/50">
                          <TableCell className="font-bold text-orange-700">العربون</TableCell>
                          <TableCell className="text-muted-foreground">-</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-right font-bold text-orange-600">{formatCurrency(0)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    return [
                      ...data.map((group, idx) => (
                        <TableRow key={`small-${idx}`} className="bg-orange-50/50 hover:bg-orange-100/50">
                          <TableCell className="font-bold text-orange-700">{idx === 0 ? 'العربون' : ''}</TableCell>
                          <TableCell>
                            <div className="font-medium">{group.landBatchName}</div>
                            {group.location && <div className="text-xs text-muted-foreground">{group.location}</div>}
                          </TableCell>
                          <TableCell className="text-center">{group.pieces.length}</TableCell>
                          <TableCell className="text-center">{group.paymentCount}</TableCell>
                          <TableCell className="text-right font-bold text-orange-600">{formatCurrency(group.totalAmount)}</TableCell>
                          <TableCell className="text-center">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => openPaymentDetailsDialog('SmallAdvance')}
                              className="text-orange-600 hover:text-orange-800"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )),
                      data.length > 1 && (
                        <TableRow key="small-summary" className="bg-orange-100/50 font-bold">
                          <TableCell className="text-orange-800">إجمالي العربون</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell className="text-center">{totalPieces}</TableCell>
                          <TableCell className="text-center">{totalPayments}</TableCell>
                          <TableCell className="text-right text-orange-800">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell>-</TableCell>
                        </TableRow>
                      )
                    ]
                  })()}
                  
                  {/* الدفع الكامل */}
                  {(() => {
                    const data = getPaymentsByLand('Full')
                    const totalAmount = filteredData.fullPaymentsTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    
                    if (data.length === 0) {
                      return (
                        <TableRow className="bg-green-50/50">
                          <TableCell className="font-bold text-green-700">الدفع الكامل</TableCell>
                          <TableCell className="text-muted-foreground">-</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-right font-bold text-green-600">{formatCurrency(0)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    return [
                      ...data.map((group, idx) => (
                        <TableRow key={`full-${idx}`} className="bg-green-50/50 hover:bg-green-100/50">
                          <TableCell className="font-bold text-green-700">{idx === 0 ? 'الدفع الكامل' : ''}</TableCell>
                          <TableCell>
                            <div className="font-medium">{group.landBatchName}</div>
                            {group.location && <div className="text-xs text-muted-foreground">{group.location}</div>}
                          </TableCell>
                          <TableCell className="text-center">{group.pieces.length}</TableCell>
                          <TableCell className="text-center">{group.paymentCount}</TableCell>
                          <TableCell className="text-right font-bold text-green-600">{formatCurrency(group.totalAmount)}</TableCell>
                          <TableCell className="text-center">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => openPaymentDetailsDialog('Full')}
                              className="text-green-600 hover:text-green-800"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )),
                      data.length > 1 && (
                        <TableRow key="full-summary" className="bg-green-100/50 font-bold">
                          <TableCell className="text-green-800">إجمالي الدفع الكامل</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell className="text-center">{totalPieces}</TableCell>
                          <TableCell className="text-center">{totalPayments}</TableCell>
                          <TableCell className="text-right text-green-800">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell>-</TableCell>
                        </TableRow>
                      )
                    ]
                  })()}
                  
                  {/* الدفعة الأولى */}
                  {(() => {
                    const data = getPaymentsByLand('BigAdvance')
                    const totalAmount = filteredData.bigAdvanceTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    
                    if (data.length === 0) {
                      return (
                        <TableRow className="bg-purple-50/50">
                          <TableCell className="font-bold text-purple-700">الدفعة الأولى</TableCell>
                          <TableCell className="text-muted-foreground">-</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-right font-bold text-purple-600">{formatCurrency(0)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    return [
                      ...data.map((group, idx) => (
                        <TableRow key={`big-${idx}`} className="bg-purple-50/50 hover:bg-purple-100/50">
                          <TableCell className="font-bold text-purple-700">{idx === 0 ? 'الدفعة الأولى' : ''}</TableCell>
                          <TableCell>
                            <div className="font-medium">{group.landBatchName}</div>
                            {group.location && <div className="text-xs text-muted-foreground">{group.location}</div>}
                          </TableCell>
                          <TableCell className="text-center">{group.pieces.length}</TableCell>
                          <TableCell className="text-center">{group.paymentCount}</TableCell>
                          <TableCell className="text-right font-bold text-purple-600">{formatCurrency(group.totalAmount)}</TableCell>
                          <TableCell className="text-center">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => openPaymentDetailsDialog('BigAdvance')}
                              className="text-purple-600 hover:text-purple-800"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )),
                      data.length > 1 && (
                        <TableRow key="big-summary" className="bg-purple-100/50 font-bold">
                          <TableCell className="text-purple-800">إجمالي الدفعة الأولى</TableCell>
                          <TableCell>-</TableCell>
                          <TableCell className="text-center">{totalPieces}</TableCell>
                          <TableCell className="text-center">{totalPayments}</TableCell>
                          <TableCell className="text-right text-purple-800">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell>-</TableCell>
                        </TableRow>
                      )
                    ]
                  })()}
                  
                  {/* العمولة */}
                  {(() => {
                    const data = filteredData.companyFeesByLand
                    if (data.length === 0) {
                      return (
                        <TableRow className="bg-indigo-50/50">
                          <TableCell className="font-bold text-indigo-700">العمولة</TableCell>
                          <TableCell className="text-muted-foreground">-</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-right font-bold text-indigo-600">{formatCurrency(0)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    return data.map((group, idx) => (
                      <TableRow key={`fee-${idx}`} className="bg-indigo-50/50 hover:bg-indigo-100/50">
                        <TableCell className="font-bold text-indigo-700">{idx === 0 ? 'العمولة' : ''}</TableCell>
                        <TableCell>
                          <div className="font-medium">{group.landBatchName}</div>
                          {group.location && <div className="text-xs text-muted-foreground">{group.location}</div>}
                        </TableCell>
                        <TableCell className="text-center">{group.piecesCount}</TableCell>
                        <TableCell className="text-center">{group.salesCount}</TableCell>
                        <TableCell className="text-right font-bold text-indigo-600">{formatCurrency(group.totalAmount)}</TableCell>
                        <TableCell className="text-center">
                          <Button 
                            variant="ghost" 
                            size="sm" 
          onClick={() => setCompanyFeeDialogOpen(true)}
                            className="text-indigo-600 hover:text-indigo-800"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  })()}
                  
                  {/* Total Row */}
                  <TableRow className="bg-gray-100 font-bold border-t-2">
                    <TableCell colSpan={4} className="font-bold text-lg">الإجمالي</TableCell>
                    <TableCell className="text-right font-bold text-lg text-green-700">
                      {formatCurrency(
                        filteredData.installmentPaymentsTotal + 
                        filteredData.smallAdvanceTotal + 
                        filteredData.fullPaymentsTotal + 
                        filteredData.bigAdvanceTotal + 
                        filteredData.companyFeesTotal
                      )}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
          </CardContent>
        </Card>
      </div>

        {/* Mobile: Card View for all 5 categories */}
        <div className="md:hidden grid grid-cols-1 gap-3">
          {/* الأقساط */}
          <Card 
            className="border-blue-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => openPaymentDetailsDialog('Installment')}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-blue-700">الأقساط</h3>
                  {(() => {
                    const data = getPaymentsByLand('Installment')
                    if (data.length > 0) {
                      return <p className="text-xs text-blue-600">{data[0].landBatchName} {data[0].location && `- ${data[0].location}`}</p>
                    }
                    return null
                  })()}
              </div>
                        <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-blue-600">{formatCurrency(filteredData.installmentPaymentsTotal)}</span>
                  <ChevronDown className="h-4 w-4 text-blue-600" />
                        </div>
              </div>
            </CardContent>
          </Card>

          {/* العربون */}
          <Card 
            className="border-orange-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => openPaymentDetailsDialog('SmallAdvance')}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-orange-700">العربون (مبلغ الحجز)</h3>
                  {(() => {
                    const data = getPaymentsByLand('SmallAdvance')
                    if (data.length > 0) {
                      return <p className="text-xs text-orange-600">{data[0].landBatchName} {data[0].location && `- ${data[0].location}`}</p>
                    }
                    return null
                  })()}
              </div>
                      <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-orange-600">{formatCurrency(filteredData.smallAdvanceTotal)}</span>
                  <ChevronDown className="h-4 w-4 text-orange-600" />
                      </div>
                    </div>
            </CardContent>
          </Card>

          {/* الدفع الكامل */}
          <Card 
            className="border-green-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => openPaymentDetailsDialog('Full')}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-green-700">الدفع الكامل</h3>
                  {(() => {
                    const data = getPaymentsByLand('Full')
                    if (data.length > 0) {
                      return <p className="text-xs text-green-600">{data[0].landBatchName} {data[0].location && `- ${data[0].location}`}</p>
                    }
                    return null
                  })()}
                  </div>
                        <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-green-600">{formatCurrency(filteredData.fullPaymentsTotal)}</span>
                  <ChevronDown className="h-4 w-4 text-green-600" />
                        </div>
            </div>
            </CardContent>
          </Card>

          {/* الدفعة الأولى */}
          <Card 
            className="border-purple-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => openPaymentDetailsDialog('BigAdvance')}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-purple-700">الدفعة الأولى</h3>
                  {(() => {
                    const data = getPaymentsByLand('BigAdvance')
                    if (data.length > 0) {
                      return <p className="text-xs text-purple-600">{data[0].landBatchName} {data[0].location && `- ${data[0].location}`}</p>
                    }
                    return null
                  })()}
              </div>
                        <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-purple-600">{formatCurrency(filteredData.bigAdvanceTotal)}</span>
                  <ChevronDown className="h-4 w-4 text-purple-600" />
                        </div>
              </div>
            </CardContent>
          </Card>

          {/* العمولة */}
          <Card 
            className="border-indigo-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => setCompanyFeeDialogOpen(true)}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-indigo-700">العمولة</h3>
                  {(() => {
                    const data = filteredData.companyFeesByLand
                    if (data.length > 0) {
                      return <p className="text-xs text-indigo-600">{data[0].landBatchName} {data[0].location && `- ${data[0].location}`}</p>
                    }
                    return null
                  })()}
              </div>
                        <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-indigo-600">{formatCurrency(filteredData.companyFeesTotal)}</span>
                  <ChevronDown className="h-4 w-4 text-indigo-600" />
                        </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Details Dialog - Matching Company Fee Design */}
      <Dialog open={paymentDetailDialogOpen} onOpenChange={setPaymentDetailDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
              <span>تفاصيل {selectedPaymentTypeForDialog ? getPaymentTypeLabel(selectedPaymentTypeForDialog) : 'المدفوعات'}</span>
              {dateFilter !== 'all' && <span className="text-sm text-muted-foreground font-normal">- {filterLabels[dateFilter]}</span>}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 sm:space-y-6">
            {(() => {
              const paymentsByLand = getPaymentsByLand(selectedPaymentTypeForDialog)
              if (paymentsByLand.length === 0) {
                return (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">لا توجد مدفوعات</p>
                    </CardContent>
                  </Card>
                )
              }
              
              const totalAmount = paymentsByLand.reduce((sum, g) => sum + g.totalAmount, 0)
              const totalPieces = paymentsByLand.reduce((sum, g) => sum + g.pieces.length, 0)
              const totalPayments = paymentsByLand.reduce((sum, g) => sum + g.paymentCount, 0)
              const totalClients = new Set(paymentsByLand.flatMap(g => g.pieces.flatMap(p => p.payments.map(pay => pay.client_id)))).size
              
              // Get color based on payment type
              const getColorClasses = () => {
                switch (selectedPaymentTypeForDialog) {
                  case 'Installment':
                    return {
                      bg: 'from-blue-50 to-cyan-50',
                      border: 'border-blue-200',
                      text: 'text-blue-600',
                      textMuted: 'text-blue-700'
                    }
                  case 'SmallAdvance':
                    return {
                      bg: 'from-orange-50 to-amber-50',
                      border: 'border-orange-200',
                      text: 'text-orange-600',
                      textMuted: 'text-orange-700'
                    }
                  case 'Full':
                    return {
                      bg: 'from-green-50 to-emerald-50',
                      border: 'border-green-200',
                      text: 'text-green-600',
                      textMuted: 'text-green-700'
                    }
                  case 'BigAdvance':
                    return {
                      bg: 'from-purple-50 to-pink-50',
                      border: 'border-purple-200',
                      text: 'text-purple-600',
                      textMuted: 'text-purple-700'
                    }
                  default:
                    return {
                      bg: 'from-gray-50 to-slate-50',
                      border: 'border-gray-200',
                      text: 'text-gray-600',
                      textMuted: 'text-gray-700'
                    }
                }
              }
              
              const colors = getColorClasses()
              
              return (
                <>
                  {/* Summary Card */}
                  <Card className={`bg-gradient-to-r ${colors.bg} ${colors.border}`}>
                    <CardHeader className="p-4 sm:p-6">
                      <CardTitle className="text-base sm:text-lg">الملخص</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 sm:p-6 pt-0">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                        <div className="bg-white p-3 rounded-lg">
                          <p className="text-xs sm:text-sm text-muted-foreground mb-1">إجمالي المبلغ</p>
                          <p className={`text-lg sm:text-xl font-bold ${colors.text}`}>{formatCurrency(totalAmount)}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg">
                          <p className="text-xs sm:text-sm text-muted-foreground mb-1">عدد المدفوعات</p>
                          <p className={`text-lg sm:text-xl font-bold ${colors.text}`}>{totalPayments}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg">
                          <p className="text-xs sm:text-sm text-muted-foreground mb-1">عدد العملاء</p>
                          <p className={`text-lg sm:text-xl font-bold ${colors.text}`}>{totalClients}</p>
                        </div>
                        <div className="bg-white p-3 rounded-lg">
                          <p className="text-xs sm:text-sm text-muted-foreground mb-1">عدد القطع</p>
                          <p className={`text-lg sm:text-xl font-bold ${colors.text}`}>{totalPieces}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Payments Table - Grouped by Land Batch */}
                  {(() => {
                    return (
                      <>
                        {/* Mobile Card View */}
                        <div className="space-y-4 md:hidden">
                          {paymentsByLand.map((group, groupIndex) => {
                            return (
                              <div key={groupIndex} className="space-y-2">
                                {/* Group Header Card */}
                                <Card className={`bg-gradient-to-r ${colors.bg} ${colors.border}`}>
                                  <CardContent className="p-4">
                                    <div className="space-y-3">
                                      <div>
                                        <h4 className="font-bold text-base mb-1">{group.landBatchName}</h4>
                                        {group.location && <p className="text-xs text-muted-foreground">{group.location}</p>}
                                      </div>
                                      <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div>
                                          <span className="text-muted-foreground">المبلغ:</span>
                                          <div className={`font-bold text-base ${colors.text}`}>{formatCurrency(group.totalAmount)}</div>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">عدد المدفوعات:</span>
                                          <div className="font-medium">{group.paymentCount}</div>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">عدد القطع:</span>
                                          <div className="font-medium">{group.pieces.length}</div>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">النسبة:</span>
                                          <div className="font-medium">{totalAmount > 0 ? ((group.totalAmount / totalAmount) * 100).toFixed(1) : 0}%</div>
                                        </div>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                                
                                {/* Piece Cards */}
                                {group.pieces.map((piece) => {
                                  const uniqueClients = new Set(piece.payments.map(p => (p.client as any)?.name).filter(Boolean))
                                  const recordedByUsers = Array.from(piece.recordedByUsers)
                                  const soldByUsers = Array.from(piece.soldByUsers)
                                  
                                  // Group payments by date
                                  const paymentsByDate = new Map<string, PaymentWithDetails[]>()
                                  piece.payments.forEach(payment => {
                                    const dateKey = payment.payment_date
                                    if (!paymentsByDate.has(dateKey)) {
                                      paymentsByDate.set(dateKey, [])
                                    }
                                    paymentsByDate.get(dateKey)!.push(payment)
                                  })
                                  
                                  return (
                                    <Card key={piece.pieceId} className="hover:shadow-md transition-shadow">
                                      <CardContent className="p-3">
                                        <div className="space-y-2">
                                          <div className="flex items-start justify-between">
                                            <div className="flex-1 min-w-0">
                                              <div className={`font-semibold text-base ${colors.text}`}>
                                                {formatCurrency(piece.totalAmount)}
                                              </div>
                                              <div className="text-xs text-muted-foreground mt-1">
                                                #{piece.pieceNumber}
                                              </div>
                                            </div>
                                            {piece.installmentCount > 0 && (
                                              <Badge variant="secondary" className="text-xs flex-shrink-0">
                                                {piece.installmentCount} قسط
                                              </Badge>
                                            )}
                                          </div>
                                          
                                          <div className="space-y-1.5 text-xs">
                                            <div>
                                              <span className="text-muted-foreground">العميل:</span>
                                              <div className="font-medium mt-0.5">{Array.from(uniqueClients).join('، ') || 'غير معروف'}</div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                              <div>
                                                <span className="text-muted-foreground">الدفعة:</span>
                                                <div className="font-medium">{group.landBatchName}</div>
                                              </div>
                                              {group.location && (
                                                <div>
                                                  <span className="text-muted-foreground">الموقع:</span>
                                                  <div className="font-medium">{group.location}</div>
                                                </div>
                                              )}
                                              {soldByUsers.length > 0 && (
                                                <div>
                                                  <span className="text-muted-foreground">باع:</span>
                                                  <div className="font-medium">{soldByUsers.join('، ')}</div>
                                                </div>
                                              )}
                                              {recordedByUsers.length > 0 && recordedByUsers.join('') !== soldByUsers.join('') && (
                                                <div>
                                                  <span className="text-muted-foreground">سجل:</span>
                                                  <div className="font-medium">{recordedByUsers.join('، ')}</div>
                                                </div>
                                              )}
                                            </div>
                                            
                                            {/* Payment Details by Date */}
                                            {Array.from(paymentsByDate.entries()).map(([date, datePayments]) => {
                                              const totalForDate = datePayments.reduce((sum, p) => sum + p.amount_paid, 0)
                                              const dateClients = new Set(datePayments.map(p => (p.client as any)?.name).filter(Boolean))
                                              
                                              return (
                                                <div key={date} className="mt-2 pt-2 border-t border-gray-200">
                                                  <div className="flex items-center justify-between mb-1">
                                                    <span className="font-medium text-gray-800">{formatDate(date)}</span>
                                                    <span className={`font-bold ${colors.text}`}>{formatCurrency(totalForDate)}</span>
                                                  </div>
                                                  {datePayments.map((payment, idx) => (
                                                    <div key={payment.id} className="text-xs bg-gray-50 p-1.5 rounded mt-1">
                                                      <div className="flex justify-between">
                                                        <span className="text-muted-foreground">المبلغ:</span>
                                                        <span className="font-medium">{formatCurrency(payment.amount_paid)}</span>
                                                      </div>
                                                      {payment.payment_method && (
                                                        <div className="flex justify-between mt-0.5">
                                                          <span className="text-muted-foreground">طريقة الدفع:</span>
                                                          <span>{payment.payment_method}</span>
                                                        </div>
                                                      )}
                                                      {payment.notes && (
                                                        <div className="mt-0.5 text-muted-foreground">{payment.notes}</div>
                                                      )}
                                                      {payment.recorded_by_user && (
                                                        <div className="mt-0.5 text-muted-foreground">سجل: {payment.recorded_by_user.name}</div>
                                                      )}
                                                    </div>
                                                  ))}
                                                </div>
                                              )
                                            })}
                                          </div>
                                        </div>
                                      </CardContent>
                                    </Card>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>

                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                          <Table className="min-w-full">
                            <TableHeader>
                              <TableRow>
                                <TableHead>التاريخ</TableHead>
                                <TableHead>العميل</TableHead>
                                <TableHead>اسم الدفعة</TableHead>
                                <TableHead>الموقع</TableHead>
                                <TableHead>رقم القطعة</TableHead>
                                <TableHead className="text-center">عدد الأقساط</TableHead>
                                <TableHead className="text-right">المبلغ</TableHead>
                                <TableHead>طريقة الدفع</TableHead>
                                <TableHead>المستخدم</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paymentsByLand.flatMap((group, groupIndex) => {
                                return [
                                  <TableRow key={`summary-${groupIndex}`} className="bg-gray-50 font-bold">
                                    <TableCell colSpan={5} className="font-bold">
                                      {group.landBatchName} {group.location && `- ${group.location}`}
                                    </TableCell>
                                    <TableCell className="text-center">{group.paymentCount} دفعة</TableCell>
                                    <TableCell className={`text-right font-bold text-lg ${colors.text}`}>
                                      {formatCurrency(group.totalAmount)}
                                    </TableCell>
                                    <TableCell className="text-center">{group.pieces.length} قطعة</TableCell>
                                    <TableCell>-</TableCell>
                                  </TableRow>,
                                  ...group.pieces.flatMap((piece) => {
                                    const uniqueClients = new Set(piece.payments.map(p => (p.client as any)?.name).filter(Boolean))
                                    const recordedByUsers = Array.from(piece.recordedByUsers)
                                    const soldByUsers = Array.from(piece.soldByUsers)
                                    
                                    return piece.payments.map((payment, idx) => {
                                      const client = payment.client as any
                                      return (
                                        <TableRow key={`${piece.pieceId}-${payment.id}-${idx}`} className="bg-white">
                                          <TableCell>{formatDate(payment.payment_date)}</TableCell>
                                          <TableCell>
                                            <div className="flex flex-col">
                                              <span className="font-medium">{client?.name || 'غير معروف'}</span>
                                              {client?.phone && <span className="text-xs text-muted-foreground">({client.phone})</span>}
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-muted-foreground">{group.landBatchName}</TableCell>
                                          <TableCell className="text-muted-foreground">{group.location || '-'}</TableCell>
                                          <TableCell className="font-medium">#{piece.pieceNumber}</TableCell>
                                          <TableCell className="text-center">{piece.installmentCount > 0 ? piece.installmentCount : '-'}</TableCell>
                                          <TableCell className={`text-right font-bold ${colors.text}`}>
                                            {formatCurrency(payment.amount_paid)}
                                          </TableCell>
                                          <TableCell>{payment.payment_method || '-'}</TableCell>
                                          <TableCell className="text-xs">
                                            <div className="flex flex-col">
                                              {soldByUsers.length > 0 && <span>باع: {soldByUsers.join('، ')}</span>}
                                              {recordedByUsers.length > 0 && recordedByUsers.join('') !== soldByUsers.join('') && (
                                                <span>سجل: {recordedByUsers.join('، ')}</span>
                                              )}
                                              {payment.recorded_by_user && (
                                                <span>سجل: {payment.recorded_by_user.name}</span>
                                              )}
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      )
                                    })
                                  })
                                ]
                              })}
                              <TableRow className="bg-primary/10 font-bold border-t-2">
                                <TableCell colSpan={6} className="font-bold">الإجمالي:</TableCell>
                                <TableCell className={`text-right font-bold text-lg ${colors.text}`}>
                                  {formatCurrency(totalAmount)}
                                </TableCell>
                                <TableCell colSpan={2}>-</TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        </div>
                      </>
                    )
                  })()}
                </>
              )
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Company Fee Details Dialog */}
      <Dialog open={companyFeeDialogOpen} onOpenChange={setCompanyFeeDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-600" />
              <span>تفاصيل العمولة</span>
              {dateFilter !== 'all' && <span className="text-sm text-muted-foreground font-normal">- {filterLabels[dateFilter]}</span>}
              </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 sm:space-y-6">
            {/* Summary Card */}
            {filteredData.groupedCompanyFees.length > 0 && (
                          <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-base sm:text-lg">الملخص</CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 pt-0">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">إجمالي العمولة</p>
                      <p className="text-lg sm:text-xl font-bold text-indigo-600">{formatCurrency(filteredData.companyFeesTotal)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">عدد المبيعات</p>
                      <p className="text-lg sm:text-xl font-bold text-blue-600">{filteredData.groupedCompanyFees.reduce((sum, g) => sum + g.sales.length, 0)}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">عدد العملاء</p>
                      <p className="text-lg sm:text-xl font-bold text-purple-600">{filteredData.groupedCompanyFees.length}</p>
                    </div>
                    <div className="bg-white p-3 rounded-lg">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">عدد القطع</p>
                      <p className="text-lg sm:text-xl font-bold text-green-600">{filteredData.groupedCompanyFees.reduce((sum, g) => sum + g.piecesCount, 0)}</p>
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
                      salesCount: 0,
                      piecesCount: 0,
                      sales: [],
                    })
                  }
                  const group = landGroups.get(key)!
                  group.totalAmount += sale.company_fee_amount || 0
                  group.salesCount += 1
                  group.piecesCount += pieceIds.length
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
                        salesCount: 0,
                        piecesCount: 0,
                        sales: [],
                      })
                    }
                    const group = landGroups.get(key)!
                    // Distribute company fee per piece
                    const feePerPiece = (sale.company_fee_amount || 0) / pieceIds.length
                    group.totalAmount += feePerPiece
                    group.piecesCount += 1
                    if (!group.sales.find(s => s.id === sale.id)) {
                      group.sales.push(sale)
                      group.salesCount += 1
                    }
                  })
                }
              })
              
              const totalAmount = Array.from(landGroups.values()).reduce((sum, g) => sum + g.totalAmount, 0)
              const companyFeesByLand = Array.from(landGroups.values()).map(group => ({
                ...group,
                percentage: totalAmount > 0 ? (group.totalAmount / totalAmount) * 100 : 0,
              })).sort((a, b) => b.totalAmount - a.totalAmount)
              
              return companyFeesByLand.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <p className="text-muted-foreground">لا توجد عمولات</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Mobile Card View */}
                  <div className="space-y-4 md:hidden">
                    {companyFeesByLand.map((group, groupIndex) => {
                      const totalGroupAmount = group.totalAmount
                      const totalSalesAmount = group.sales.reduce((sum, s) => sum + s.total_selling_price, 0)
                      const totalPieces = group.sales.reduce((sum, s) => sum + (s.land_piece_ids?.length || 0), 0)
              
              return (
                        <div key={groupIndex} className="space-y-2">
                          {/* Group Header Card */}
                          <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
                            <CardContent className="p-4">
                              <div className="space-y-3">
                                <div>
                                  <h4 className="font-bold text-base mb-1">{group.landBatchName}</h4>
                                  {group.location && <p className="text-xs text-muted-foreground">{group.location}</p>}
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                  <div>
                                    <span className="text-muted-foreground">مبلغ العمولة:</span>
                                    <div className="font-bold text-base text-indigo-600">{formatCurrency(totalGroupAmount)}</div>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">سعر البيع:</span>
                                    <div className="font-bold text-base text-green-600">{formatCurrency(totalSalesAmount)}</div>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">عدد المبيعات:</span>
                                    <div className="font-medium">{group.salesCount}</div>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">عدد القطع:</span>
                                    <div className="font-medium">{totalPieces}</div>
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                          
                          {/* Sale Cards */}
                          {group.sales.map((sale) => {
                            const pieceIds = sale.land_piece_ids || []
                            const pieces = landPieces.filter(p => pieceIds.includes(p.id))
                            const pieceNumbers = pieces.map(p => `#${p.piece_number}`).join('، ') || '-'
                            const batchName = pieces[0]?.land_batch?.name || 'غير محدد'
                            const location = pieces[0]?.land_batch?.location || null
                            const client = sale.client as any
                            const feePerPiece = (sale.company_fee_amount || 0) / pieceIds.length
                            const feeForThisBatch = pieces.length * feePerPiece
                            const salePriceForThisBatch = (sale.total_selling_price / pieceIds.length) * pieces.length
                            
                            return (
                              <Card key={sale.id} className="hover:shadow-md transition-shadow">
                                <CardContent className="p-3">
                                  <div className="space-y-2">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-base text-indigo-600">
                                          {formatCurrency(feeForThisBatch)}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                          {formatDate(sale.sale_date)}
                                        </div>
                                      </div>
                                      <Badge variant={sale.payment_type === 'Full' ? 'success' : 'secondary'} className="text-xs flex-shrink-0">
                                        {sale.payment_type === 'Full' ? 'بالحاضر' : 'بالتقسيط'}
                                      </Badge>
                                    </div>
                                    
                                    <div className="space-y-1.5 text-xs">
                                      <div>
                                        <span className="text-muted-foreground">العميل:</span>
                                        <div className="font-medium mt-0.5">{client?.name || 'غير معروف'}</div>
                                        {client?.phone && <div className="text-xs text-muted-foreground">({client.phone})</div>}
                                      </div>
                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <span className="text-muted-foreground">الدفعة:</span>
                                          <div className="font-medium">{batchName}</div>
                                        </div>
                                        {location && (
                                          <div>
                                            <span className="text-muted-foreground">الموقع:</span>
                                            <div className="font-medium">{location}</div>
                                          </div>
                                        )}
                                        <div>
                                          <span className="text-muted-foreground">القطع:</span>
                                          <div className="font-medium">{pieces.length} {pieceNumbers !== '-' && `(${pieceNumbers})`}</div>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">سعر البيع:</span>
                                          <div className="font-medium">{formatCurrency(salePriceForThisBatch)}</div>
                                        </div>
                                        {sale.company_fee_percentage && (
                                          <div>
                                            <span className="text-muted-foreground">نسبة العمولة:</span>
                                            <div className="font-medium">{sale.company_fee_percentage}%</div>
                                          </div>
                                        )}
                                        {sale.created_by_user?.name && (
                                          <div>
                                            <span className="text-muted-foreground">باع:</span>
                                            <div className="font-medium">{sale.created_by_user.name}</div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                          {companyFeesByLand.flatMap((group, groupIndex) => {
                            const totalGroupAmount = group.totalAmount
                            
                            return [
                              <TableRow key={`summary-${groupIndex}`} className="bg-gray-50 font-bold">
                                <TableCell colSpan={4} className="font-bold">
                                  {group.landBatchName} {group.location && `- ${group.location}`}
                                </TableCell>
                                <TableCell className="text-center">
                                  {group.sales.reduce((sum, s) => sum + (s.land_piece_ids?.length || 0), 0)}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {group.salesCount} مبيعة
                                </TableCell>
                                <TableCell className="text-right font-bold">{formatCurrency(group.sales.reduce((sum, s) => sum + s.total_selling_price, 0))}</TableCell>
                              <TableCell className="text-right">-</TableCell>
                                <TableCell className="text-right font-bold">{formatCurrency(totalGroupAmount)}</TableCell>
                              </TableRow>,
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
                                    <TableCell className="text-right font-bold text-indigo-700">
                                      <div className="flex flex-col items-end">
                                        <span>{formatCurrency(feeForThisBatch)}</span>
                                        {sale.created_by_user?.name && (
                                          <span className="text-xs text-muted-foreground">باع: {sale.created_by_user.name}</span>
                                        )}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                )
                              })
                            ]
                          })}
                          <TableRow className="bg-primary/10 font-bold border-t-2">
                            <TableCell colSpan={8} className="font-bold">الإجمالي:</TableCell>
                            <TableCell className="text-right font-bold text-lg text-indigo-800">
                              {formatCurrency(filteredData.companyFeesTotal)}
                            </TableCell>
                          </TableRow>
                    </TableBody>
                  </Table>
                </div>
                </>
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
