import React, { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
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
import { DollarSign, CreditCard, TrendingUp, X, ChevronDown, ChevronUp, Calendar, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react'
import type { Sale, Client, Payment, LandPiece, LandBatch } from '@/types/database'

interface SaleWithClient extends Sale {
  client?: Client
  created_by_user?: { id: string; name: string; email?: string }
}

interface PaymentWithDetails extends Payment {
  client?: Client
  sale?: {
    land_piece_ids?: string[]
    payment_type?: 'Full' | 'Installment' | 'PromiseOfSale'
    total_selling_price?: number
    created_by?: string
    created_by_user?: { id: string; name: string; email?: string }
    promise_initial_payment?: number
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
type PaymentTypeFilter = 'Installment' | 'SmallAdvance' | 'Full' | 'BigAdvance' | 'InitialPayment' | null

export function Financial() {
  const { hasPermission } = useAuth()
  const { t } = useLanguage()
  const [sales, setSales] = useState<SaleWithClient[]>([])
  const [payments, setPayments] = useState<PaymentWithDetails[]>([])
  const [landPieces, setLandPieces] = useState<Array<LandPiece & { land_batch?: LandBatch }>>([])
  const [installments, setInstallments] = useState<Array<any & { sale?: SaleWithClient }>>([])
  const [loading, setLoading] = useState(true)
  
  // Installment dialogs
  const [installmentStatsDialogOpen, setInstallmentStatsDialogOpen] = useState(false)
  const [selectedInstallmentView, setSelectedInstallmentView] = useState<'thisMonth' | 'total' | 'unpaid' | 'paid' | null>(null)
  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [expandedPaymentType, setExpandedPaymentType] = useState<PaymentTypeFilter | null>(null)
  const [expandedLandGroups, setExpandedLandGroups] = useState<Set<string>>(new Set())
  const [expandedPieceGroups, setExpandedPieceGroups] = useState<Set<string>>(new Set())
  const [selectedPaymentTypeForDialog, setSelectedPaymentTypeForDialog] = useState<PaymentTypeFilter | null>(null)
  const [paymentDetailDialogOpen, setPaymentDetailDialogOpen] = useState(false)
  const [companyFeeDialogOpen, setCompanyFeeDialogOpen] = useState(false)
  const [selectedGroupForDetails, setSelectedGroupForDetails] = useState<PaymentByLand | null>(null)
  const [selectedGroupPaymentType, setSelectedGroupPaymentType] = useState<PaymentTypeFilter | null>(null)
  const [groupDetailsDialogOpen, setGroupDetailsDialogOpen] = useState(false)

  useEffect(() => {
    if (!hasPermission('view_financial')) return
    fetchData()
  }, [hasPermission])

  const fetchData = async () => {
    setLoading(true)
    
    try {
      const [salesRes, paymentsRes, piecesRes, installmentsRes] = await retryWithBackoff(
        async () => {
          return await Promise.all([
        supabase
          .from('sales')
          .select('*, client:clients(*), created_by_user:users!sales_created_by_fkey(id, name, email)')
          .order('sale_date', { ascending: false }),
        supabase
          .from('payments')
          .select('*, client:clients(*), sale:sales(land_piece_ids, payment_type, total_selling_price, created_by, created_by_user:users!sales_created_by_fkey(id, name, email), promise_initial_payment, promise_completion_date, promise_completed), recorded_by_user:users!payments_recorded_by_fkey(id, name, email)')
          .order('payment_date', { ascending: false }),
        supabase
          .from('land_pieces')
          .select('*, land_batch:land_batches(name, location)')
          .order('created_at', { ascending: false }),
        supabase
          .from('installments')
          .select('*, sale:sales(*, client:clients(*))')
          .order('due_date', { ascending: true }),
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
      if (installmentsRes.error) {
        console.error('Error fetching installments:', installmentsRes.error)
      }

      const salesData = (salesRes.data as SaleWithClient[]) || []
      const paymentsData = (paymentsRes.data as PaymentWithDetails[]) || []
      let allPieces = (piecesRes.data as Array<LandPiece & { land_batch?: LandBatch }>) || []
      
      // Ensure we have all pieces referenced in sales - fetch missing ones
      const allReferencedPieceIds = new Set<string>()
      salesData.forEach(sale => {
        if (sale.land_piece_ids) {
          sale.land_piece_ids.forEach(id => allReferencedPieceIds.add(id))
        }
      })
      paymentsData.forEach(payment => {
        if (payment.sale?.land_piece_ids) {
          payment.sale.land_piece_ids.forEach(id => allReferencedPieceIds.add(id))
        }
      })
      
      // Check if we're missing any pieces and fetch them
      const existingPieceIds = new Set(allPieces.map(p => p.id))
      const missingPieceIds = Array.from(allReferencedPieceIds).filter(id => !existingPieceIds.has(id))
      
      if (missingPieceIds.length > 0) {
        try {
          const { data: missingPieces, error: missingError } = await supabase
            .from('land_pieces')
            .select('*, land_batch:land_batches(name, location)')
            .in('id', missingPieceIds)
          
          if (!missingError && missingPieces) {
            allPieces = [...allPieces, ...(missingPieces as Array<LandPiece & { land_batch?: LandBatch }>)]
          }
        } catch (err) {
          console.warn('Error fetching missing pieces:', err)
        }
      }

      setSales(salesData)
      setPayments(paymentsData)
      setLandPieces(allPieces)
      setInstallments((installmentsRes.data as any[]) || [])
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
    
    // Attach land pieces to payments and exclude payments for cancelled sales and reset sales
    // For advance payments (SmallAdvance, BigAdvance), only include if sale is confirmed
    const paymentsWithPieces = filteredPayments
      .filter(payment => {
        // Exclude payments for cancelled sales
        const sale = sales.find(s => s.id === payment.sale_id)
        if (!sale || sale.status === 'Cancelled') return false
        
        // Always preserve payments for Completed sales - they should always be included
        if (sale.status === 'Completed') return true
        
        // IMPORTANT: SmallAdvance (العربون) should be shown for ALL sales (both confirmed and unconfirmed)
        // BigAdvance (التسبقة) should only be shown for confirmed sales
        if (payment.payment_type === 'BigAdvance') {
          // Only include BigAdvance if sale is confirmed
          const saleStatus = (sale as any).status
          const isConfirmed = saleStatus === 'Completed' || 
                             (sale.company_fee_amount && sale.company_fee_amount > 0) ||
                             (sale as any).big_advance_confirmed === true ||
                             (sale as any).is_confirmed === true
          if (!isConfirmed) return false // Exclude unconfirmed big advance payments
        }
        // SmallAdvance payments are always included (for both confirmed and unconfirmed sales)
        
        // Exclude payments for sales that have been reset (big_advance_amount = 0 and company_fee_amount is null)
        // This ensures reset sales don't show their old payments
        // Check for ALL payment types except SmallAdvance (which should remain for reset sales)
        // IMPORTANT: Only exclude Pending sales that were reset, NOT completed sales
        if (payment.payment_type !== 'SmallAdvance' &&
            sale.big_advance_amount === 0 && 
            !sale.company_fee_amount && 
            sale.status === 'Pending') {
          return false // Exclude all non-SmallAdvance payments for reset sales
        }
        
        return true
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
    const partialPaymentsList = paymentsWithPieces.filter(p => p.payment_type === 'Partial')
    const initialPaymentsList = paymentsWithPieces.filter(p => p.payment_type === 'InitialPayment')
    
    // Get PromiseOfSale payments - these are payments where the sale has payment_type='PromiseOfSale'
    // PromiseOfSale payments are stored as 'Partial' (initial payment) or 'Full' (completion) in payments table
    const promiseOfSalePaymentsList = paymentsWithPieces.filter(p => {
      const salePaymentType = p.sale?.payment_type
      return salePaymentType === 'PromiseOfSale'
    })
    
    // Calculate totals from payments
    const installmentPaymentsTotal = installmentPaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    const bigAdvanceTotal = bigAdvancePaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    const fullPaymentsTotal = fullPaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    const partialPaymentsTotal = partialPaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    const initialPaymentsTotal = initialPaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    
    // Calculate PromiseOfSale total from payment records
    const promiseOfSaleTotalFromPayments = promiseOfSalePaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    
    // Also check sales table for promise_initial_payment if no payment records exist
    // This handles cases where PromiseOfSale was created but payment wasn't recorded yet
    // Exclude reset sales
    const promiseOfSaleFromSales = filteredSales
      .filter(s => {
        if (s.status === 'Cancelled') return false
        if ((s as any).payment_type !== 'PromiseOfSale') return false
        
        // Exclude reset sales
        if (s.status === 'Pending' && 
            s.big_advance_amount === 0 && 
            !s.company_fee_amount) {
          return false
        }
        
        return true
      })
      .reduce((sum, s) => {
        const promiseInitialPayment = (s as any).promise_initial_payment || 0
        // Only add if there's no payment record for this sale in the filtered payments
        const hasPaymentRecord = promiseOfSalePaymentsList.some(p => p.sale_id === s.id)
        return sum + (hasPaymentRecord ? 0 : promiseInitialPayment)
      }, 0)
    
    // Total PromiseOfSale payments (from payment records + sales table if no payment records)
    const totalPromiseOfSalePayments = promiseOfSaleTotalFromPayments + promiseOfSaleFromSales
    
    // Calculate small advance (reservation) from sales table
    const smallAdvanceFromPayments = smallAdvancePaymentsList.reduce((sum, p) => sum + p.amount_paid, 0)
    const smallAdvanceFromSales = filteredSales
      .filter(s => {
        // Always preserve Completed sales
        if (s.status === 'Completed') return true
        
        if (s.status === 'Cancelled') return false
        if (!s.small_advance_amount || s.small_advance_amount <= 0) return false
        
        // Exclude reset sales (only Pending sales that were reset)
        if (s.status === 'Pending' && 
            s.big_advance_amount === 0 && 
            !s.company_fee_amount) {
          return false
        }
        
        return true
      })
      .reduce((sum, s) => sum + (s.small_advance_amount || 0), 0)
    
    const smallAdvanceTotal = smallAdvanceFromPayments > 0 ? smallAdvanceFromPayments : smallAdvanceFromSales
    
    // Calculate cash received - only actual cash payments (exclude Refund, exclude company fees)
    // Include: Installment, SmallAdvance, BigAdvance, Full, Partial, InitialPayment, Field
    // This should match the sum of all payment types in the breakdown
    const cashReceived = 
      installmentPaymentsTotal + 
      smallAdvanceTotal + 
      fullPaymentsTotal + 
      bigAdvanceTotal + 
      totalPromiseOfSalePayments

    // Calculate company fees from sales
    // NOTE: Commission is counted for CONFIRMED sales (either Completed status OR has been confirmed)
    // Commission is collected at confirmation time, not at reservation
    // IMPORTANT: Always preserve Completed sales - they should always be included
    // Exclude reset sales (status = 'Pending', big_advance_amount = 0, company_fee_amount = null)
    const companyFeesTotal = filteredSales
      .filter(s => {
        // Always include Completed sales - preserve their commission stats
        if (s.status === 'Completed') return true
        
        if (s.status === 'Cancelled') return false
        
        // Exclude reset sales - these are sales that were reset back to confirmation page
        // This only applies to Pending sales that were reset, NOT completed sales
        if (s.status === 'Pending' && 
            s.big_advance_amount === 0 && 
            !s.company_fee_amount) {
          return false // Exclude reset sales
        }
        
        // Include if:
        // Has company_fee_amount > 0 (means it was confirmed and commission was set)
        return (s.company_fee_amount && s.company_fee_amount > 0)
      })
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
    const groupedPromiseOfSalePayments = groupPayments(promiseOfSalePaymentsList)
    const groupedInitialPayments = groupPayments(initialPaymentsList)

    // Group company fees by client and date
    // NOTE: Commission is counted for CONFIRMED sales (either Completed status OR has been confirmed)
    // IMPORTANT: Always preserve Completed sales - they should always be included
    // Exclude reset sales
    const groupCompanyFees = (): GroupedCompanyFee[] => {
      const companyFeeSales = filteredSales
        .filter(s => {
          // Always include Completed sales - preserve their commission stats
          if (s.status === 'Completed' && s.company_fee_amount && s.company_fee_amount > 0) return true
          
          if (s.status === 'Cancelled') return false
          if (!s.company_fee_amount || s.company_fee_amount <= 0) return false
          
          // Exclude reset sales (only Pending sales that were reset)
          if (s.status === 'Pending' && 
              s.big_advance_amount === 0 && 
              !s.company_fee_amount) {
            return false
          }
          
          return true
        })
      
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
    // NOTE: Commission is counted for CONFIRMED sales (either Completed status OR has been confirmed)
    // IMPORTANT: Always preserve Completed sales - they should always be included
    // Exclude reset sales
    const groupCompanyFeesByLand = (): CompanyFeeByLand[] => {
      const companyFeeSales = filteredSales
        .filter(s => {
          // Always include Completed sales - preserve their commission stats
          if (s.status === 'Completed' && s.company_fee_amount && s.company_fee_amount > 0) return true
          
          if (s.status === 'Cancelled') return false
          if (!s.company_fee_amount || s.company_fee_amount <= 0) return false
          
          // Exclude reset sales (only Pending sales that were reset)
          if (s.status === 'Pending' && 
              s.big_advance_amount === 0 && 
              !s.company_fee_amount) {
            return false
          }
          
          return true
        })
      
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
      promiseOfSalePaymentsList,
      initialPaymentsList,
      // Grouped payments
      groupedInstallmentPayments,
      groupedBigAdvancePayments,
      groupedSmallAdvancePayments,
      groupedFullPayments,
      groupedPromiseOfSalePayments,
      groupedInitialPayments,
      // Payment totals
      installmentPaymentsTotal,
      bigAdvanceTotal,
      smallAdvanceTotal,
      fullPaymentsTotal,
      promiseOfSalePaymentsTotal: totalPromiseOfSalePayments,
      initialPaymentsTotal,
      companyFeesTotal,
      // Grouped company fees
      groupedCompanyFees,
      companyFeesByLand,
    }
  }, [sales, payments, landPieces, dateFilter, selectedDate])

  // Get small advance (reservation) from sales table grouped by land
  // IMPORTANT: Show small advance (العربون) for ALL sales, not just confirmed ones
  // This is the reservation amount that should always be visible
  const getSmallAdvanceByLand = (): PaymentByLand[] => {
    // Get filtered sales with small_advance_amount
    // Include ALL sales with small_advance_amount (both confirmed and unconfirmed)
    // Exclude reset sales (status = 'Pending', big_advance_amount = 0, company_fee_amount = null, small_advance_amount = 0)
    const salesWithAdvance = filteredData.sales
      .filter(s => {
        if (s.status === 'Cancelled') return false
        if (!s.small_advance_amount || s.small_advance_amount <= 0) return false
        
        // Exclude reset sales - these are sales that were reset back to confirmation page
        // Reset sales have: status = 'Pending', big_advance_amount = 0, company_fee_amount = null, small_advance_amount = 0
        // But if they have small_advance_amount > 0, they're not reset, so include them
        // We only exclude if ALL amounts are 0/null
        if (s.status === 'Pending' && 
            s.big_advance_amount === 0 && 
            !s.company_fee_amount &&
            (!s.small_advance_amount || s.small_advance_amount === 0)) {
          return false // Exclude reset sales (no amounts at all)
        }
        
        // Include ALL sales with small_advance_amount (both confirmed and unconfirmed)
        return true
      })
    
    // Group by land batch
    const landGroups = new Map<string, PaymentByLand>()
    
    salesWithAdvance.forEach(sale => {
      const pieceIds = sale.land_piece_ids || []
      const pieces = landPieces.filter(p => pieceIds.includes(p.id))
      
      if (pieces.length === 0) {
        // Pieces not found - try to find batch info from piece IDs in landPieces
        // This can happen if pieces were deleted or IDs don't match, but some pieces with same batch might exist
        let batchName = 'غير محدد'
        let location: string | null = null
        
        // Try to find batch information from any piece in landPieces that matches the piece ID pattern
        // Or try to find pieces with similar IDs
        const foundPieces = landPieces.filter(p => pieceIds.includes(p.id))
        if (foundPieces.length > 0) {
          const firstPiece = foundPieces[0]
          batchName = firstPiece.land_batch?.name || 'غير محدد'
          location = firstPiece.land_batch?.location || null
        } else {
          // Try to find batch from any piece that might be related
          // This is a fallback - if we can't find exact matches, try partial matches
          const anyPiece = landPieces.find(p => p.land_batch?.name)
          if (anyPiece?.land_batch) {
            // Use a generic batch name from existing pieces
            batchName = anyPiece.land_batch.name || 'غير محدد'
            location = anyPiece.land_batch.location || null
          }
        }
        
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
        group.totalAmount += sale.small_advance_amount || 0
        group.paymentCount += 1
        
        // Add virtual pieces based on sale's land_piece_ids to ensure correct count
        if (pieceIds.length > 0) {
          const advancePerPiece = (sale.small_advance_amount || 0) / pieceIds.length
          pieceIds.forEach((pieceId, idx) => {
            // Try to find the actual piece from landPieces to get correct piece number
            // First try exact ID match
            let actualPiece = landPieces.find(p => p.id === pieceId)
            
            // If not found, try to find it in payments that reference this piece
            if (!actualPiece) {
              const paymentWithPiece = filteredData.payments.find(p => 
                p.sale_id === sale.id && 
                p.sale?.land_piece_ids?.includes(pieceId)
              )
              if (paymentWithPiece?.land_pieces && paymentWithPiece.land_pieces.length > 0) {
                actualPiece = paymentWithPiece.land_pieces.find(p => p.id === pieceId) as any
              }
            }
            
            // Use actual piece number if found - if not found, pieces should be in landPieces array
            // If still not found after fetching missing pieces, this indicates a data issue
            const pieceNumber = actualPiece?.piece_number || ''
            const actualBatchName = actualPiece?.land_batch?.name || batchName
            const actualLocation = actualPiece?.land_batch?.location || location
            
            const virtualPiece = {
              pieceId,
              pieceNumber,
              landBatchName: actualBatchName,
              location: actualLocation,
              totalAmount: advancePerPiece,
              installmentCount: 0,
              payments: [] as PaymentWithDetails[],
              recordedByUsers: new Set<string>(),
              soldByUsers: new Set<string>(),
            }
            
            // Create virtual payment with client information
            const virtualPayment: PaymentWithDetails = {
              id: `virtual-small-advance-${sale.id}-${pieceId}`,
              client_id: sale.client_id,
              sale_id: sale.id,
              installment_id: null,
              reservation_id: null,
              amount_paid: advancePerPiece,
              payment_type: 'SmallAdvance' as any,
              payment_date: sale.sale_date,
              payment_method: 'Cash',
              notes: null,
              recorded_by: sale.created_by || null,
              created_at: sale.created_at,
              updated_at: sale.updated_at,
              client: sale.client || (sale as any).client,
              sale: {
                land_piece_ids: pieceIds,
                payment_type: sale.payment_type,
                total_selling_price: sale.total_selling_price,
                created_by: sale.created_by,
                created_by_user: (sale as any).created_by_user,
                client: sale.client || (sale as any).client,
              } as any,
              recorded_by_user: (sale as any).created_by_user,
            }
            
            virtualPiece.payments.push(virtualPayment)
            
            // Track users
            if ((sale as any).created_by_user?.name) {
              virtualPiece.soldByUsers.add((sale as any).created_by_user.name)
              virtualPiece.recordedByUsers.add((sale as any).created_by_user.name)
            }
            
            group.pieces.push(virtualPiece)
          })
        }
      } else {
        // Group by land batch - each sale contributes to one or more batches
        const batchGroups = new Map<string, { batchName: string; location: string | null; pieces: typeof pieces }>()
        
        pieces.forEach(piece => {
          const batchName = piece.land_batch?.name || 'غير محدد'
          const location = piece.land_batch?.location || null
          const batchKey = `${batchName}-${location || 'no-location'}`
          
          if (!batchGroups.has(batchKey)) {
            batchGroups.set(batchKey, {
              batchName,
              location,
              pieces: [],
            })
          }
          batchGroups.get(batchKey)!.pieces.push(piece)
        })
        
        // For each batch, distribute the sale's advance
        batchGroups.forEach((batchInfo, batchKey) => {
          if (!landGroups.has(batchKey)) {
            landGroups.set(batchKey, {
              landBatchName: batchInfo.batchName,
              location: batchInfo.location,
              totalAmount: 0,
              percentage: 0,
              paymentCount: 0,
              pieces: [],
              payments: [],
            })
          }
          const group = landGroups.get(batchKey)!
          
          // Calculate advance for pieces in this batch
          const piecesInBatch = batchInfo.pieces.length
          const advanceForBatch = (sale.small_advance_amount || 0) * (piecesInBatch / pieceIds.length)
          
          // Add pieces to group
          batchInfo.pieces.forEach(piece => {
            const advancePerPiece = (sale.small_advance_amount || 0) / pieceIds.length
            
            let pieceGroup = group.pieces.find(p => p.pieceId === piece.id)
            if (!pieceGroup) {
              pieceGroup = {
                pieceId: piece.id,
                pieceNumber: piece.piece_number,
                landBatchName: batchInfo.batchName,
                location: batchInfo.location,
                totalAmount: 0,
                installmentCount: 0,
                payments: [],
                recordedByUsers: new Set(),
                soldByUsers: new Set(),
              }
              group.pieces.push(pieceGroup)
            }
            
            pieceGroup.totalAmount += advancePerPiece
            
            // Create virtual payment object with client information for display
            const virtualPayment: PaymentWithDetails = {
              id: `virtual-small-advance-${sale.id}-${piece.id}`,
              client_id: sale.client_id,
              sale_id: sale.id,
              installment_id: null,
              reservation_id: null,
              amount_paid: advancePerPiece,
              payment_type: 'SmallAdvance' as any,
              payment_date: sale.sale_date,
              payment_method: 'Cash',
              notes: null,
              recorded_by: sale.created_by || null,
              created_at: sale.created_at,
              updated_at: sale.updated_at,
              client: sale.client,
              sale: {
                land_piece_ids: pieceIds,
                payment_type: sale.payment_type,
                total_selling_price: sale.total_selling_price,
                created_by: sale.created_by,
                created_by_user: (sale as any).created_by_user,
              } as any,
              recorded_by_user: (sale as any).created_by_user,
            }
            
            if (!pieceGroup.payments.find(p => p.id === virtualPayment.id)) {
              pieceGroup.payments.push(virtualPayment)
            }
            
            // Track users
            if ((sale as any).created_by_user?.name) {
              pieceGroup.soldByUsers.add((sale as any).created_by_user.name)
            }
            if ((sale as any).created_by_user?.name) {
              pieceGroup.recordedByUsers.add((sale as any).created_by_user.name)
            }
          })
          
          // Add to batch totals (only once per sale)
          group.totalAmount += advanceForBatch
          group.paymentCount += 1
        })
      }
    })
    
    const totalAmount = Array.from(landGroups.values()).reduce((sum, g) => sum + g.totalAmount, 0)
    
    return Array.from(landGroups.values()).map(group => ({
      ...group,
      percentage: totalAmount > 0 ? (group.totalAmount / totalAmount) * 100 : 0,
    })).sort((a, b) => b.totalAmount - a.totalAmount)
  }

  // Get big advance (التسبقة) from sales table grouped by land
  // IMPORTANT: Only show big advance for CONFIRMED sales
  const getBigAdvanceByLand = (): PaymentByLand[] => {
    // Get filtered sales with big_advance_amount
    // Only include CONFIRMED sales (have company_fee_amount set OR status = 'Completed')
    const salesWithAdvance = filteredData.sales
      .filter(s => {
        if (s.status === 'Cancelled') return false
        if (!s.big_advance_amount || s.big_advance_amount <= 0) return false
        
        // Always include Completed sales - they are confirmed
        if (s.status === 'Completed') return true
        
        // Exclude reset sales - these are sales that were reset back to confirmation page
        if (s.status === 'Pending' && 
            s.big_advance_amount === 0 && 
            (s.company_fee_amount === null || s.company_fee_amount === undefined)) {
          return false // Exclude reset sales
        }
        
        // Only include confirmed sales - must have company_fee_amount set (even if 0)
        // OR big_advance_amount > 0 (which also indicates confirmation)
        const isConfirmed = (s.company_fee_amount !== null && s.company_fee_amount !== undefined) ||
                           (s.big_advance_amount && s.big_advance_amount > 0)
        
        if (!isConfirmed) {
          return false // Exclude unconfirmed sales
        }
        
        return true
      })
    
    // Group by land batch (same structure as getSmallAdvanceByLand)
    const landGroups = new Map<string, PaymentByLand>()
    
    salesWithAdvance.forEach(sale => {
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
            paymentCount: 0,
            pieces: [],
            payments: [],
          })
        }
        const group = landGroups.get(key)!
        group.totalAmount += sale.big_advance_amount || 0
        group.paymentCount += 1
      } else {
        // Group by land batch - each sale contributes to one or more batches
        const batchGroups = new Map<string, { batchName: string; location: string | null; pieces: typeof pieces }>()
        
        pieces.forEach(piece => {
          const batchName = piece.land_batch?.name || 'غير محدد'
          const location = piece.land_batch?.location || null
          const batchKey = `${batchName}-${location || 'no-location'}`
          
          if (!batchGroups.has(batchKey)) {
            batchGroups.set(batchKey, {
              batchName,
              location,
              pieces: [],
            })
          }
          batchGroups.get(batchKey)!.pieces.push(piece)
        })
        
        // For each batch, distribute the sale's advance
        batchGroups.forEach((batchInfo, batchKey) => {
          if (!landGroups.has(batchKey)) {
            landGroups.set(batchKey, {
              landBatchName: batchInfo.batchName,
              location: batchInfo.location,
              totalAmount: 0,
              percentage: 0,
              paymentCount: 0,
              pieces: [],
              payments: [],
            })
          }
          const group = landGroups.get(batchKey)!
          
          // Calculate advance for pieces in this batch
          const piecesInBatch = batchInfo.pieces.length
          const advanceForBatch = (sale.big_advance_amount || 0) * (piecesInBatch / pieceIds.length)
          
          // Add pieces to group
          batchInfo.pieces.forEach(piece => {
            const advancePerPiece = (sale.big_advance_amount || 0) / pieceIds.length
            
            let pieceGroup = group.pieces.find(p => p.pieceId === piece.id)
            if (!pieceGroup) {
              pieceGroup = {
                pieceId: piece.id,
                pieceNumber: piece.piece_number,
                landBatchName: batchInfo.batchName,
                location: batchInfo.location,
                totalAmount: 0,
                installmentCount: 0,
                payments: [],
                recordedByUsers: new Set(),
                soldByUsers: new Set(),
              }
              group.pieces.push(pieceGroup)
            }
            
            pieceGroup.totalAmount += advancePerPiece
            
            // Create virtual payment object with client information for display
            const virtualPayment: PaymentWithDetails = {
              id: `virtual-big-advance-${sale.id}-${piece.id}`,
              client_id: sale.client_id,
              sale_id: sale.id,
              installment_id: null,
              reservation_id: null,
              amount_paid: advancePerPiece,
              payment_type: 'BigAdvance' as any,
              payment_date: sale.sale_date,
              payment_method: 'Cash',
              notes: null,
              recorded_by: sale.created_by || null,
              created_at: sale.created_at,
              updated_at: sale.updated_at,
              client: sale.client,
              sale: {
                land_piece_ids: pieceIds,
                payment_type: sale.payment_type,
                total_selling_price: sale.total_selling_price,
                created_by: sale.created_by,
                created_by_user: (sale as any).created_by_user,
              } as any,
              recorded_by_user: (sale as any).created_by_user,
            }
            
            if (!pieceGroup.payments.find(p => p.id === virtualPayment.id)) {
              pieceGroup.payments.push(virtualPayment)
            }
            
            // Track users
            if ((sale as any).created_by_user?.name) {
              pieceGroup.soldByUsers.add((sale as any).created_by_user.name)
            }
            if ((sale as any).created_by_user?.name) {
              pieceGroup.recordedByUsers.add((sale as any).created_by_user.name)
            }
          })
          
          // Add to batch totals (only once per sale)
          group.totalAmount += advanceForBatch
          group.paymentCount += 1
        })
      }
    })
    
    const totalAmount = Array.from(landGroups.values()).reduce((sum, g) => sum + g.totalAmount, 0)
    
    return Array.from(landGroups.values()).map(group => ({
      ...group,
      percentage: totalAmount > 0 ? (group.totalAmount / totalAmount) * 100 : 0,
    })).sort((a, b) => b.totalAmount - a.totalAmount)
  }

  // Group payments by land batch and piece - don't repeat installments for same piece
  // This function uses filteredData which already has date filtering and excludes cancelled sales
  const getPaymentsByLand = (paymentType: PaymentTypeFilter): PaymentByLand[] => {
    // Special handling for SmallAdvance - get from sales table
    if (paymentType === 'SmallAdvance') {
      return getSmallAdvanceByLand()
    }
    
    // Special handling for BigAdvance - get from sales table (for confirmed sales)
    if (paymentType === 'BigAdvance') {
      // First get from sales table (for confirmed sales)
      const bigAdvanceFromSales = getBigAdvanceByLand()
      
      // Also get from payment records (for confirmed sales)
      const bigAdvanceFromPayments = filteredData.bigAdvancePaymentsList
      
      // Combine both sources, avoiding duplicates
      const combinedMap = new Map<string, PaymentByLand>()
      
      // Add sales table data first
      bigAdvanceFromSales.forEach(group => {
        const key = `${group.landBatchName}-${group.location || ''}`
        combinedMap.set(key, { ...group })
      })
      
      // Add payment records data (merge with existing or create new)
      bigAdvanceFromPayments.forEach(payment => {
        const pieceIds = payment.sale?.land_piece_ids || []
        const pieces = landPieces.filter(p => pieceIds.includes(p.id))
        
        if (pieces.length === 0) return
        
        pieces.forEach(piece => {
          const batchName = piece.land_batch?.name || 'غير محدد'
          const location = piece.land_batch?.location || null
          const key = `${batchName}-${location || 'no-location'}`
          
          if (!combinedMap.has(key)) {
            combinedMap.set(key, {
              landBatchName: batchName,
              location,
              totalAmount: 0,
              percentage: 0,
              paymentCount: 0,
              pieces: [],
              payments: [],
            })
          }
          
          const group = combinedMap.get(key)!
          const amountPerPiece = payment.amount_paid / pieces.length
          
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
          
          pieceGroup.totalAmount += amountPerPiece
          if (!pieceGroup.payments.find(p => p.id === payment.id)) {
            pieceGroup.payments.push(payment)
          }
          
          if (!group.payments.find(p => p.id === payment.id)) {
            group.totalAmount += payment.amount_paid
            group.paymentCount += 1
            group.payments.push(payment)
          }
        })
      })
      
      const totalAmount = Array.from(combinedMap.values()).reduce((sum, g) => sum + g.totalAmount, 0)
      
      return Array.from(combinedMap.values()).map(group => ({
        ...group,
        percentage: totalAmount > 0 ? (group.totalAmount / totalAmount) * 100 : 0,
      })).sort((a, b) => b.totalAmount - a.totalAmount)
    }
    
    // Special handling for PromiseOfSale (InitialPayment) - get from both payment records and sales table
    if (paymentType === 'InitialPayment') {
      // Get payments from payment records
      const paymentsFromRecords = filteredData.promiseOfSalePaymentsList
      
      // Get PromiseOfSale sales that don't have payment records yet
      const promiseOfSaleSales = filteredData.sales
        .filter(s => s.status !== 'Cancelled' && (s as any).payment_type === 'PromiseOfSale')
        .filter(s => {
          const hasPaymentRecord = paymentsFromRecords.some(p => p.sale_id === s.id)
          return !hasPaymentRecord && ((s as any).promise_initial_payment || 0) > 0
        })
      
      // Create virtual payment entries from sales table
      const virtualPayments: PaymentWithDetails[] = promiseOfSaleSales.map(sale => {
        const pieceIds = sale.land_piece_ids || []
        const pieces = landPieces.filter(p => pieceIds.includes(p.id))
        const client = sale.client || (sale as any).client
        
        return {
          id: `virtual-${sale.id}`,
          client_id: sale.client_id,
          sale_id: sale.id,
          installment_id: null,
          reservation_id: null,
          amount_paid: (sale as any).promise_initial_payment || 0,
          payment_type: 'InitialPayment' as any,
          payment_date: sale.sale_date,
          payment_method: 'Cash',
          notes: null,
          recorded_by: sale.created_by || null,
          created_at: sale.created_at,
          updated_at: sale.updated_at,
          client: client,
          sale: {
            land_piece_ids: pieceIds,
            payment_type: 'PromiseOfSale',
            total_selling_price: sale.total_selling_price,
            created_by: sale.created_by,
            created_by_user: (sale as any).created_by_user,
            promise_initial_payment: (sale as any).promise_initial_payment,
            client: client,
          } as any,
          recorded_by_user: (sale as any).created_by_user,
          land_pieces: pieces,
        } as PaymentWithDetails
      })
      
      // Combine payment records and virtual payments
      const allPromisePayments = [...paymentsFromRecords, ...virtualPayments]
      
      // Attach land pieces to payments and ensure client information
      const paymentsWithPieces = allPromisePayments.map(payment => {
        const pieceIds = payment.sale?.land_piece_ids || []
        const pieces = landPieces.filter(p => pieceIds.includes(p.id))
        
        // Ensure client information is present
        let client = payment.client
        if (!client && payment.sale) {
          const sale = payment.sale as any
          if (sale.client) {
            client = sale.client
          }
        }
        if (!client && payment.sale_id) {
          const saleFromData = filteredData.sales.find(s => s.id === payment.sale_id)
          if (saleFromData?.client) {
            client = saleFromData.client
          }
        }
        
        return {
          ...payment,
          client: client || payment.client,
          land_pieces: pieces.length > 0 ? pieces : payment.land_pieces || [],
        }
      })
      
      // Continue with grouping logic below
      const landGroups = new Map<string, PaymentByLand>()
      
      paymentsWithPieces.forEach(payment => {
        const pieces = payment.land_pieces || []
        
        if (pieces.length === 0) {
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
            
            const amountPerPiece = payment.amount_paid / pieces.length
            pieceGroup.totalAmount += amountPerPiece
            if (!pieceGroup.payments.find(p => p.id === payment.id)) {
              pieceGroup.payments.push(payment)
            }
            
            if ((payment as any).recorded_by_user?.name) {
              pieceGroup.recordedByUsers.add((payment as any).recorded_by_user.name)
            }
            if ((payment.sale as any)?.created_by_user?.name) {
              pieceGroup.soldByUsers.add((payment.sale as any).created_by_user.name)
            }
            
            if (!group.payments.find(p => p.id === payment.id)) {
              group.totalAmount += payment.amount_paid
              group.paymentCount += 1
              group.payments.push(payment)
            }
          })
        }
      })
      
      const totalAmount = Array.from(landGroups.values()).reduce((sum, g) => sum + g.totalAmount, 0)
      
      return Array.from(landGroups.values()).map(group => ({
        ...group,
        percentage: totalAmount > 0 ? (group.totalAmount / totalAmount) * 100 : 0,
      })).sort((a, b) => b.totalAmount - a.totalAmount)
    }
    
    // Get the appropriate payment list from filteredData based on type
    let filteredPayments: PaymentWithDetails[] = []
    
    if (paymentType === 'Installment') {
      filteredPayments = filteredData.installmentPaymentsList
    } else if (paymentType === 'Full') {
      filteredPayments = filteredData.fullPaymentsList
    } else if (paymentType === 'BigAdvance') {
      filteredPayments = filteredData.bigAdvancePaymentsList
    } else {
      filteredPayments = filteredData.payments
    }
    
    // Attach land pieces to payments (already filtered and excluding cancelled sales in filteredData)
    // Also ensure client information is attached from sale if payment doesn't have it
    const paymentsWithPieces = filteredPayments.map(payment => {
      const pieceIds = payment.sale?.land_piece_ids || []
      const pieces = landPieces.filter(p => pieceIds.includes(p.id))
      
      // If payment doesn't have client info, try to get it from sale
      let client = payment.client
      if (!client && payment.sale) {
        const sale = payment.sale as any
        if (sale.client) {
          client = sale.client
        } else if (payment.sale_id) {
          // Try to find client from sales array
          const saleFromData = filteredData.sales.find(s => s.id === payment.sale_id)
          if (saleFromData?.client) {
            client = saleFromData.client
          }
        }
      }
      
      return {
        ...payment,
        client: client || payment.client,
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

  // Calculate totals by land batch name (instead of location)
  // NOTE: For batch totals, we use ALL sales (not filtered by date) to show all batches with their amounts
  // This ensures all batches are represented even if their sales are outside the selected date range
  const getTotalsByPlace = () => {
    const placeTotals = new Map<string, {
      place: string
      installment: number
      smallAdvance: number
      full: number
      bigAdvance: number
      promiseOfSale: number
      companyFee: number
      total: number
    }>()

    // Helper to add to batch total (using land batch name instead of location)
    const addToPlace = (batchName: string | null, amount: number, type: 'installment' | 'smallAdvance' | 'full' | 'bigAdvance' | 'promiseOfSale' | 'companyFee') => {
      const place = batchName || 'غير محدد'
      if (!placeTotals.has(place)) {
        placeTotals.set(place, {
          place,
          installment: 0,
          smallAdvance: 0,
          full: 0,
          bigAdvance: 0,
          promiseOfSale: 0,
          companyFee: 0,
          total: 0
        })
      }
      const placeData = placeTotals.get(place)!
      placeData[type] += amount
    }

    // First, collect all unique land batch names from all sales (including pending ones) to ensure all batches are shown
    const allPlaces = new Set<string>()
    filteredData.sales.forEach(sale => {
      if (sale.status === 'Cancelled') return
      const pieceIds = sale.land_piece_ids || []
      const pieces = landPieces.filter(p => pieceIds.includes(p.id))
      
      if (pieces.length === 0) {
        // If no pieces found, add "غير محدد" to ensure the sale is still represented
        allPlaces.add('غير محدد')
      } else {
        pieces.forEach(piece => {
          const batchName = piece.land_batch?.name || null
          const place = batchName || 'غير محدد'
          allPlaces.add(place)
        })
      }
    })
    
    // Also collect batch names from all land pieces to ensure we don't miss any batches
    landPieces.forEach(piece => {
      const batchName = piece.land_batch?.name || null
      const place = batchName || 'غير محدد'
      allPlaces.add(place)
    })

    // Initialize all batches with 0 amounts
    allPlaces.forEach(place => {
      if (!placeTotals.has(place)) {
        placeTotals.set(place, {
          place,
          installment: 0,
          smallAdvance: 0,
          full: 0,
          bigAdvance: 0,
          promiseOfSale: 0,
          companyFee: 0,
          total: 0
        })
      }
    })

    // Process filtered sales to match the main payment tables
    // This ensures consistency between place totals and the main financial data
    // IMPORTANT: Include ALL sales (even unconfirmed) to show all places
    // But only add amounts based on confirmation status
    filteredData.sales.forEach(sale => {
      if (sale.status === 'Cancelled') return
      
      // Exclude reset sales (sales with no amounts at all)
      if (sale.status === 'Pending' && 
          sale.big_advance_amount === 0 && 
          !sale.company_fee_amount &&
          (!sale.small_advance_amount || sale.small_advance_amount === 0)) {
        return
      }
      
      // Check if sale is confirmed
      // A sale is confirmed if company_fee_amount is set (even if 0) OR big_advance_amount > 0
      const isConfirmed = sale.status === 'Completed' || 
                         (sale.company_fee_amount !== null && sale.company_fee_amount !== undefined) ||
                         (sale.big_advance_amount && sale.big_advance_amount > 0)
      
      const pieceIds = sale.land_piece_ids || []
      const pieces = landPieces.filter(p => pieceIds.includes(p.id))
      if (pieces.length === 0) return
      
      // Get land batch names from pieces - handle multiple batches in one sale
      const batchNames = new Map<string, number>() // batch name -> piece count
      pieces.forEach(piece => {
        const batchName = piece.land_batch?.name || null
        const place = batchName || 'غير محدد'
        batchNames.set(place, (batchNames.get(place) || 0) + 1)
      })
      
      // Distribute sale amounts across batches by piece count
      batchNames.forEach((pieceCountInBatch, place) => {
        const totalPieceCount = pieces.length
        const ratio = pieceCountInBatch / totalPieceCount
        
        // Check if this sale has payment records (for confirmed sales)
        const hasSmallAdvancePayment = filteredData.payments.some(p => 
          p.sale_id === sale.id && p.payment_type === 'SmallAdvance'
        )
        const hasBigAdvancePayment = filteredData.payments.some(p => 
          p.sale_id === sale.id && p.payment_type === 'BigAdvance'
        )
        const hasFullPayment = filteredData.payments.some(p => 
          p.sale_id === sale.id && p.payment_type === 'Full'
        )
        const hasInstallmentPayment = filteredData.payments.some(p => 
          p.sale_id === sale.id && p.payment_type === 'Installment'
        )
        const hasPromisePayment = filteredData.payments.some(p => 
          p.sale_id === sale.id && (p.payment_type === 'InitialPayment' || p.payment_type === 'Partial')
        )
        
        // Add small advance (reservation) - from sales table if no payment record
        // IMPORTANT: Show small advance (العربون) for ALL sales, not just confirmed ones
        // This is the reservation amount that should always be visible
        if ((sale.small_advance_amount || 0) > 0 && !hasSmallAdvancePayment) {
          // Include small advance for ALL sales (both confirmed and unconfirmed)
          const amountForBatch = (sale.small_advance_amount || 0) * ratio
          addToPlace(place, amountForBatch, 'smallAdvance')
        }
        
        // Add big advance (التسبقة) - from sales table if no payment record
        // Only include if sale is confirmed (has company_fee_amount > 0 OR status = 'Completed')
        if ((sale.big_advance_amount || 0) > 0 && !hasBigAdvancePayment) {
          // Use the isConfirmed variable defined in the outer scope
          if (isConfirmed) {
            const amountForBatch = (sale.big_advance_amount || 0) * ratio
            addToPlace(place, amountForBatch, 'bigAdvance')
          }
        }
        
        // Add company fee - from sales table (only for confirmed sales)
        if (isConfirmed && (sale.company_fee_amount || 0) > 0) {
          const amountForBatch = (sale.company_fee_amount || 0) * ratio
          addToPlace(place, amountForBatch, 'companyFee')
        }
        
        // For Full payment type, only if sale is confirmed/completed
        // IMPORTANT: Exclude reset sales (status = 'Pending', big_advance_amount = 0, company_fee_amount = null, small_advance_amount = 0)
        if (isConfirmed && sale.payment_type === 'Full' && !hasFullPayment) {
          // Double check this is not a reset sale - reset sales should not show in finance
          const isResetSale = sale.status === 'Pending' && 
                              sale.big_advance_amount === 0 && 
                              !sale.company_fee_amount &&
                              (!sale.small_advance_amount || sale.small_advance_amount === 0)
          if (isResetSale) return // Skip reset sales completely
          
          const pricePerPiece = sale.total_selling_price / totalPieceCount
          const amountForBatch = pricePerPiece * pieceCountInBatch
          addToPlace(place, amountForBatch, 'full')
        }
        
        // For PromiseOfSale, add initial payment if exists (only for confirmed sales)
        if (isConfirmed && (sale as any).payment_type === 'PromiseOfSale') {
          const promiseInitialPayment = (sale as any).promise_initial_payment || 0
          if (promiseInitialPayment > 0 && !hasPromisePayment) {
            const amountForBatch = promiseInitialPayment * ratio
            addToPlace(place, amountForBatch, 'promiseOfSale')
          }
        }
      })
    })
    
    // Also process payments from payment records (for confirmed sales with payment records)
    // Use filtered payments to match the main tables
    // Only include payments for confirmed sales (has company_fee_amount > 0 OR status = 'Completed')
    filteredData.payments.forEach(payment => {
      if (payment.payment_type === 'Refund') return
      
      const sale = filteredData.sales.find(s => s.id === payment.sale_id)
      if (!sale || sale.status === 'Cancelled') return
      
      // For SmallAdvance: show for ALL sales (both confirmed and unconfirmed)
      // For BigAdvance: only show if sale is confirmed
      // For other payment types: only show if sale is confirmed
      if (payment.payment_type === 'BigAdvance') {
        // A sale is confirmed if company_fee_amount is set (even if 0) OR big_advance_amount > 0
        const isConfirmed = sale.status === 'Completed' || 
                           (sale.company_fee_amount !== null && sale.company_fee_amount !== undefined) ||
                           (sale.big_advance_amount && sale.big_advance_amount > 0)
        if (!isConfirmed) return // Skip unconfirmed big advance payments
      } else if (payment.payment_type !== 'SmallAdvance') {
        // For non-advance payments (Installment, Full, etc.), only show if confirmed
        const isConfirmed = sale.status === 'Completed' || 
                           (sale.company_fee_amount !== null && sale.company_fee_amount !== undefined) ||
                           (sale.big_advance_amount && sale.big_advance_amount > 0)
        if (!isConfirmed) return // Skip unconfirmed payments
      }
      // SmallAdvance payments are always included (for both confirmed and unconfirmed sales)
      
      const pieceIds = payment.sale?.land_piece_ids || sale.land_piece_ids || []
      const pieces = landPieces.filter(p => pieceIds.includes(p.id))
      
      if (pieces.length === 0) {
        // If no pieces found, add to "غير محدد" batch
        const place = 'غير محدد'
        switch (payment.payment_type) {
          case 'Installment':
            addToPlace(place, payment.amount_paid, 'installment')
            break
          case 'SmallAdvance':
            // Always add SmallAdvance payments (for both confirmed and unconfirmed sales)
            // Only skip if already counted from sales table
            if (!(sale.small_advance_amount && sale.small_advance_amount > 0)) {
              addToPlace(place, payment.amount_paid, 'smallAdvance')
            }
            break
          case 'BigAdvance':
            // Only add if not already counted from sales table
            if (!(sale.big_advance_amount && sale.big_advance_amount > 0)) {
              addToPlace(place, payment.amount_paid, 'bigAdvance')
            }
            break
          case 'Full':
            addToPlace(place, payment.amount_paid, 'full')
            break
          case 'InitialPayment':
          case 'Partial':
            if ((sale as any).payment_type === 'PromiseOfSale') {
              addToPlace(place, payment.amount_paid, 'promiseOfSale')
            }
            break
        }
        return
      }
      
      // Group pieces by land batch name to distribute payments across multiple batches
      const batchNameGroups = new Map<string, number>() // batch name -> piece count
      pieces.forEach(piece => {
        const batchName = piece.land_batch?.name || null
        const place = batchName || 'غير محدد'
        batchNameGroups.set(place, (batchNameGroups.get(place) || 0) + 1)
      })
      
      const totalPieceCount = pieces.length
      
      // Distribute payment across batches by piece count
      batchNameGroups.forEach((pieceCountInBatch, place) => {
        const ratio = pieceCountInBatch / totalPieceCount
        const amountForBatch = payment.amount_paid * ratio
        
        // Add payment amount based on type
        switch (payment.payment_type) {
          case 'Installment':
            addToPlace(place, amountForBatch, 'installment')
            break
          case 'SmallAdvance':
            // Always add SmallAdvance payments (for both confirmed and unconfirmed sales)
            // Only skip if already counted from sales table
            if (!(sale.small_advance_amount && sale.small_advance_amount > 0)) {
              addToPlace(place, amountForBatch, 'smallAdvance')
            }
            break
          case 'BigAdvance':
            // Only add if not already counted from sales table
            if (!(sale.big_advance_amount && sale.big_advance_amount > 0)) {
              addToPlace(place, amountForBatch, 'bigAdvance')
            }
            break
          case 'Full':
            addToPlace(place, amountForBatch, 'full')
            break
          case 'InitialPayment':
          case 'Partial':
            if ((sale as any).payment_type === 'PromiseOfSale') {
              addToPlace(place, amountForBatch, 'promiseOfSale')
            }
            break
        }
      })
    })

    // Calculate total for each place AFTER all amounts are added
    placeTotals.forEach((placeData) => {
      placeData.total = placeData.installment + placeData.smallAdvance + placeData.full + 
                       placeData.bigAdvance + placeData.promiseOfSale + placeData.companyFee
    })

    // Return all places, sorted by total (descending), then by name for places with same total
    const placesArray = Array.from(placeTotals.values())
    return placesArray.sort((a, b) => {
      // First sort by total (descending)
      if (b.total !== a.total) {
        return b.total - a.total
      }
      // If totals are equal, sort by name (ascending)
      return a.place.localeCompare(b.place)
    })
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
                  {landGroup.pieces.map((piece, pIdx) => {
                    // Get actual piece number from landPieces to ensure accuracy
                    const actualPiece = landPieces.find(lp => lp.id === piece.pieceId)
                    const pieceNum = actualPiece?.piece_number || piece.pieceNumber?.replace(/^#/, '') || piece.pieceNumber
                    const displayPieceNumber = pieceNum ? (pieceNum.startsWith('#') ? pieceNum : `#${pieceNum}`) : piece.pieceNumber
                    return (
                    <div key={pIdx} className={`border ${colorConfig.border} rounded p-1.5 ${colorConfig.bg}/50`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`font-medium text-xs ${colorConfig.text}`}>{displayPieceNumber}</span>
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
                  )
                  })}
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
    'Full': 'بالحاضر',
    'BigAdvance': 'التسبقة',
    'InitialPayment': 'وعد بالبيع',
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
      </div>

      {/* Installment Statistics - 3 Boxes */}
      {(() => {
        const now = new Date()
        const currentMonth = now.getMonth()
        const currentYear = now.getFullYear()
        const monthStart = new Date(currentYear, currentMonth, 1)
        const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59)
        
        // Calculate this month's due installments
        // IMPORTANT: Only show installments for CONFIRMED sales
        // Filter out installments for reset sales
        // IMPORTANT: Preserve Completed sales - they should always be included
        const validInstallments = installments.filter(inst => {
          const sale = inst.sale as any
          if (!sale) return false
          
          // Always include Completed sales - preserve their stats
          if (sale.status === 'Completed') return true
          
          // Exclude installments for cancelled sales
          if (sale.status === 'Cancelled') return false
          
          // Exclude installments for reset sales (status = 'Pending', big_advance_amount = 0, company_fee_amount = null)
          // This only applies to Pending sales that were reset, NOT completed sales
          if (sale.status === 'Pending' && 
              sale.big_advance_amount === 0 && 
              !sale.company_fee_amount) {
            return false
          }
          
          // Only include installments for CONFIRMED sales
          // A sale is confirmed if:
          // 1. company_fee_amount IS NOT NULL (even if 0) - means commission was calculated and set
          // 2. big_advance_amount > 0 - means big advance was paid
          // 3. big_advance_confirmed = true
          // 4. is_confirmed = true
          const isConfirmed = sale.company_fee_amount !== null && sale.company_fee_amount !== undefined ||
                             (sale.big_advance_amount && sale.big_advance_amount > 0) ||
                             sale.big_advance_confirmed === true ||
                             sale.is_confirmed === true
          
          if (!isConfirmed) {
            return false // Exclude installments for unconfirmed sales
          }
          
          return true
        })
        
        const thisMonthInstallments = validInstallments.filter(inst => {
          const dueDate = new Date(inst.due_date)
          return dueDate >= monthStart && dueDate <= monthEnd
        })
        
        // This month expected amount - calculate ALL installments due this month
        // This is the total amount we should receive this month from all installments
        // Calculate the full amount due (amount_due + stacked_amount) for each installment
        const thisMonthExpected = thisMonthInstallments.reduce((sum, inst) => {
          // The full amount due is what we should receive this month
          // This is the original installment amount (amount_due + stacked_amount)
          const fullAmountDue = (inst.amount_due || 0) + (inst.stacked_amount || 0)
          return sum + fullAmountDue
        }, 0)
        
        // Total remaining installments (using filtered installments)
        const totalRemaining = validInstallments.reduce((sum, inst) => {
          const remaining = (inst.amount_due + inst.stacked_amount) - inst.amount_paid
          return sum + Math.max(0, remaining)
        }, 0)
        
        // Unpaid this month (clients who didn't pay)
        const unpaidThisMonth = thisMonthInstallments.filter(inst => {
          const remaining = (inst.amount_due + inst.stacked_amount) - inst.amount_paid
          return remaining > 0.01
        })
        const uniqueUnpaidClients = new Set(unpaidThisMonth.map(inst => inst.sale?.client?.id).filter(Boolean))
        
        // Unpaid amount this month
        const unpaidAmountThisMonth = unpaidThisMonth.reduce((sum, inst) => {
          const remaining = (inst.amount_due + inst.stacked_amount) - inst.amount_paid
          return sum + Math.max(0, remaining)
        }, 0)
        
        // Paid this month
        const paidThisMonth = thisMonthInstallments.filter(inst => {
          const remaining = (inst.amount_due + inst.stacked_amount) - inst.amount_paid
          return remaining <= 0.01
        })
        const uniquePaidClients = new Set(paidThisMonth.map(inst => inst.sale?.client?.id).filter(Boolean))
        
        // Paid amount this month
        const paidAmountThisMonth = paidThisMonth.reduce((sum, inst) => {
          return sum + inst.amount_paid
        }, 0)
        
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {/* Unpaid Amount This Month */}
            <Card 
              className="bg-gradient-to-r from-red-500 to-orange-600 text-white shadow-lg cursor-pointer hover:shadow-xl transition-shadow"
              onClick={() => {
                setSelectedInstallmentView('unpaid')
                setInstallmentStatsDialogOpen(true)
              }}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-red-100 mb-1">المبلغ غير المدفوع</p>
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold">{formatCurrency(unpaidAmountThisMonth)}</p>
                    <p className="text-xs text-red-100 mt-1">{unpaidThisMonth.length} قسط | {uniqueUnpaidClients.size} عميل</p>
                  </div>
                  <AlertTriangle className="h-8 w-8 sm:h-10 sm:w-10 text-red-200" />
                </div>
              </CardContent>
            </Card>

            {/* Paid Amount This Month */}
            <Card 
              className="bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg cursor-pointer hover:shadow-xl transition-shadow"
              onClick={() => {
                setSelectedInstallmentView('paid')
                setInstallmentStatsDialogOpen(true)
              }}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-green-100 mb-1">المبالغ المدفوعة</p>
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold">{formatCurrency(paidAmountThisMonth)}</p>
                    <p className="text-xs text-green-100 mt-1">{paidThisMonth.length} قسط | {uniquePaidClients.size} عميل</p>
                  </div>
                  <CheckCircle className="h-8 w-8 sm:h-10 sm:w-10 text-green-200" />
                </div>
              </CardContent>
            </Card>

            {/* This Month Expected + Total */}
            <Card 
              className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg cursor-pointer hover:shadow-xl transition-shadow"
              onClick={() => {
                setSelectedInstallmentView('thisMonth')
                setInstallmentStatsDialogOpen(true)
              }}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm font-medium text-blue-100 mb-1">المتوقع هذا الشهر</p>
                    <p className="text-xl sm:text-2xl md:text-3xl font-bold">{formatCurrency(thisMonthExpected)}</p>
                    <p className="text-xs text-blue-100 mt-1">الإجمالي: {formatCurrency(totalRemaining)}</p>
                  </div>
                  <Calendar className="h-8 w-8 sm:h-10 sm:w-10 text-blue-200" />
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })()}

      {/* Date Filters - Moved below the 3 summary boxes */}
      <div className="flex flex-wrap gap-2 w-full justify-center sm:justify-start">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            setLoading(true)
            await fetchData()
          }}
          disabled={loading}
          className="flex-1 sm:flex-none"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          تحديث
        </Button>
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
        <div className="flex items-center gap-2 border rounded-md px-2 min-w-[140px] flex-1 sm:flex-none">
          <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value)
              if (e.target.value) {
                setDateFilter('custom')
              }
            }}
            onClick={(e) => {
              e.stopPropagation()
              e.currentTarget.showPicker?.()
            }}
            className="h-8 w-full min-w-[120px] text-xs border-0 focus-visible:ring-0 p-0 cursor-pointer"
            style={{ WebkitAppearance: 'none' }}
          />
          {selectedDate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setSelectedDate('')
                setDateFilter('today')
              }}
              className="h-6 w-6 p-0 flex-shrink-0"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

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
                    <TableHead className="font-bold text-right">النوع</TableHead>
                    <TableHead className="font-bold text-right">الدفعة</TableHead>
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
                    const placeTotals = getTotalsByPlace()
                    const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.installment, 0)
                    const totalAmount = totalFromPlaces > 0 ? totalFromPlaces : filteredData.installmentPaymentsTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    
                    if (data.length === 0 && totalAmount === 0) {
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
                    
                    // Always show data rows if we have data
                    if (data.length > 0) {
                      return [
                        ...data.map((group, idx) => {
                        // Get unique clients and piece numbers for this group
                        const uniqueClients = new Set<string>()
                        // Get actual piece numbers from landPieces to ensure accuracy
                        const pieceNumbers = group.pieces.map(p => {
                          const actualPiece = landPieces.find(lp => lp.id === p.pieceId)
                          const pieceNum = actualPiece?.piece_number || p.pieceNumber?.replace(/^#/, '') || ''
                          return pieceNum ? `#${pieceNum}` : p.pieceNumber
                        }).filter(Boolean).join(', ')
                        group.payments.forEach(p => {
                          const clientName = (p.client as any)?.name
                          if (clientName) uniqueClients.add(clientName)
                        })
                        
                        return (
                        <TableRow key={`inst-${idx}`} className="bg-blue-50/50 hover:bg-blue-100/50">
                          <TableCell className="font-bold text-blue-700 text-right">{idx === 0 ? 'الأقساط' : ''}</TableCell>
                          <TableCell className="text-right">
                            <div className="font-medium">{group.landBatchName}</div>
                            {pieceNumbers && <div className="text-xs text-blue-600 mt-1">{pieceNumbers}</div>}
                            {uniqueClients.size > 0 && <div className="text-xs text-muted-foreground mt-1">{Array.from(uniqueClients).slice(0, 2).join(', ')}{uniqueClients.size > 2 ? '...' : ''}</div>}
                          </TableCell>
                          <TableCell className="text-center">{group.pieces.length}</TableCell>
                          <TableCell className="text-center">{group.paymentCount}</TableCell>
                          <TableCell className="text-right font-bold text-blue-600">{formatCurrency(group.totalAmount)}</TableCell>
                          <TableCell className="text-center">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setSelectedGroupForDetails(group)
                                setSelectedGroupPaymentType('Installment')
                                setGroupDetailsDialogOpen(true)
                              }}
                              className="text-blue-600 hover:text-blue-800"
                              title="عرض التفاصيل"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        )
                      }),
                      data.length > 1 && (
                        <TableRow key="inst-summary" className="bg-blue-100/50 font-bold">
                          <TableCell className="text-blue-800 text-right">إجمالي الأقساط</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-center">{totalPieces}</TableCell>
                          <TableCell className="text-center">{totalPayments}</TableCell>
                          <TableCell className="text-right text-blue-800">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    ]
                    }
                    
                    // If no data but we have totals from places, show summary row
                    if (data.length === 0 && totalAmount > 0) {
                      return (
                        <TableRow className="bg-blue-50/50">
                          <TableCell className="font-bold text-blue-700">الأقساط</TableCell>
                          <TableCell className="text-muted-foreground">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-right font-bold text-blue-600">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    
                    return null
                  })()}
                  
                  {/* Separator */}
                  <TableRow className="h-2 bg-transparent">
                    <TableCell colSpan={6} className="p-0"></TableCell>
                  </TableRow>
                  
                  {/* العربون */}
                  {(() => {
                    const data = getPaymentsByLand('SmallAdvance')
                    const placeTotals = getTotalsByPlace()
                    const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.smallAdvance, 0)
                    const totalAmount = totalFromPlaces > 0 ? totalFromPlaces : filteredData.smallAdvanceTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    
                    if (data.length === 0 && totalAmount === 0) {
                      return (
                        <TableRow className="bg-orange-50/50">
                          <TableCell className="font-bold text-orange-700 text-right">العربون</TableCell>
                          <TableCell className="text-muted-foreground text-right">-</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-right font-bold text-orange-600">{formatCurrency(0)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    
                    // Always show data rows if we have data
                    if (data.length > 0) {
                      return [
                        ...data.map((group, idx) => {
                        // Get unique clients and piece numbers for this group
                        const uniqueClients = new Set<string>()
                        // Get actual piece numbers from landPieces to ensure accuracy
                        const pieceNumbers = group.pieces.map(p => {
                          const actualPiece = landPieces.find(lp => lp.id === p.pieceId)
                          const pieceNum = actualPiece?.piece_number || p.pieceNumber?.replace(/^#/, '') || ''
                          return pieceNum ? `#${pieceNum}` : p.pieceNumber
                        }).filter(Boolean).join(', ')
                        group.payments.forEach(p => {
                          const clientName = (p.client as any)?.name
                          if (clientName) uniqueClients.add(clientName)
                        })
                        
                        return (
                        <TableRow key={`small-${idx}`} className="bg-orange-50/50 hover:bg-orange-100/50">
                          <TableCell className="font-bold text-orange-700 text-right">{idx === 0 ? 'العربون' : ''}</TableCell>
                          <TableCell className="text-right">
                            <div className="font-medium">{group.landBatchName}</div>
                            {pieceNumbers && <div className="text-xs text-orange-600 mt-1">{pieceNumbers}</div>}
                            {uniqueClients.size > 0 && <div className="text-xs text-muted-foreground mt-1">{Array.from(uniqueClients).slice(0, 2).join(', ')}{uniqueClients.size > 2 ? '...' : ''}</div>}
                          </TableCell>
                          <TableCell className="text-center">{group.pieces.length}</TableCell>
                          <TableCell className="text-center">{group.paymentCount}</TableCell>
                          <TableCell className="text-right font-bold text-orange-600">{formatCurrency(group.totalAmount)}</TableCell>
                          <TableCell className="text-center">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setSelectedGroupForDetails(group)
                                setSelectedGroupPaymentType('SmallAdvance')
                                setGroupDetailsDialogOpen(true)
                              }}
                              className="text-orange-600 hover:text-orange-800"
                              title="عرض التفاصيل"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        )
                      }),
                      data.length > 1 && (
                        <TableRow key="small-summary" className="bg-orange-100/50 font-bold">
                          <TableCell className="text-orange-800 text-right">إجمالي العربون</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-center">{totalPieces}</TableCell>
                          <TableCell className="text-center">{totalPayments}</TableCell>
                          <TableCell className="text-right text-orange-800">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    ]
                    }
                    
                    // If no data but we have totals from places, show summary row
                    if (data.length === 0 && totalAmount > 0) {
                      return (
                        <TableRow className="bg-orange-50/50">
                          <TableCell className="font-bold text-orange-700 text-right">العربون</TableCell>
                          <TableCell className="text-muted-foreground text-right">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-right font-bold text-orange-600">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    
                    return null
                  })()}
                  
                  {/* Separator */}
                  <TableRow className="h-2 bg-transparent">
                    <TableCell colSpan={6} className="p-0"></TableCell>
                  </TableRow>
                  
                  {/* بالحاضر */}
                  {(() => {
                    const data = getPaymentsByLand('Full')
                    const placeTotals = getTotalsByPlace()
                    const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.full, 0)
                    const totalAmount = totalFromPlaces > 0 ? totalFromPlaces : filteredData.fullPaymentsTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    
                    if (data.length === 0 && totalAmount === 0) {
                      return (
                        <TableRow className="bg-green-50/50">
                          <TableCell className="font-bold text-green-700 text-right">بالحاضر</TableCell>
                          <TableCell className="text-muted-foreground text-right">-</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-right font-bold text-green-600">{formatCurrency(0)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    
                    // Always show data rows if we have data
                    if (data.length > 0) {
                      return [
                        ...data.map((group, idx) => (
                      <TableRow key={`full-${idx}`} className="bg-green-50/50 hover:bg-green-100/50">
                        <TableCell className="font-bold text-green-700 text-right">{idx === 0 ? 'بالحاضر' : ''}</TableCell>
                          <TableCell className="text-right">
                            <div className="font-medium">{group.landBatchName}</div>
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
                          <TableCell className="text-green-800 text-right">إجمالي بالحاضر</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-center">{totalPieces}</TableCell>
                          <TableCell className="text-center">{totalPayments}</TableCell>
                          <TableCell className="text-right text-green-800">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    ]
                    }
                    
                    // If no data but we have totals from places, show summary row
                    if (data.length === 0 && totalAmount > 0) {
                      return (
                        <TableRow className="bg-green-50/50">
                          <TableCell className="font-bold text-green-700 text-right">بالحاضر</TableCell>
                          <TableCell className="text-muted-foreground text-right">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-right font-bold text-green-600">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    
                    return null
                  })()}
                  
                  {/* Separator */}
                  <TableRow className="h-2 bg-transparent">
                    <TableCell colSpan={6} className="p-0"></TableCell>
                  </TableRow>
                  
                  {/* التسبقة - Only BigAdvance (for confirmed sales only) */}
                  {(() => {
                    const bigAdvanceData = getPaymentsByLand('BigAdvance')
                    
                    // Only use BigAdvance data (not combining with SmallAdvance)
                    const data = bigAdvanceData
                    // Total is only BigAdvance (not including SmallAdvance)
                    const placeTotals = getTotalsByPlace()
                    const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.bigAdvance, 0)
                    const totalAmount = totalFromPlaces > 0 ? totalFromPlaces : filteredData.bigAdvanceTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    
                    if (data.length === 0 && totalAmount === 0) {
                      return (
                        <TableRow className="bg-purple-50/50">
                          <TableCell className="font-bold text-purple-700 text-right">التسبقة</TableCell>
                          <TableCell className="text-muted-foreground text-right">-</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-right font-bold text-purple-600">{formatCurrency(0)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    
                    // Always show data rows if we have data
                    if (data.length > 0) {
                      return [
                        ...data.map((group, idx) => {
                        // Get unique clients and piece numbers for this group
                        const uniqueClients = new Set<string>()
                        // Get actual piece numbers from landPieces to ensure accuracy
                        const pieceNumbers = group.pieces.map(p => {
                          const actualPiece = landPieces.find(lp => lp.id === p.pieceId)
                          const pieceNum = actualPiece?.piece_number || p.pieceNumber?.replace(/^#/, '') || ''
                          return pieceNum ? `#${pieceNum}` : p.pieceNumber
                        }).filter(Boolean).join(', ')
                        group.payments.forEach(p => {
                          const clientName = (p.client as any)?.name
                          if (clientName) uniqueClients.add(clientName)
                        })
                        
                        return (
                        <TableRow key={`big-${idx}`} className="bg-purple-50/50 hover:bg-purple-100/50">
                          <TableCell className="font-bold text-purple-700 text-right">{idx === 0 ? 'التسبقة' : ''}</TableCell>
                          <TableCell className="text-right">
                            <div className="font-medium">{group.landBatchName}</div>
                            {pieceNumbers && <div className="text-xs text-purple-600 mt-1">{pieceNumbers}</div>}
                            {uniqueClients.size > 0 && <div className="text-xs text-muted-foreground mt-1">{Array.from(uniqueClients).slice(0, 2).join(', ')}{uniqueClients.size > 2 ? '...' : ''}</div>}
                          </TableCell>
                          <TableCell className="text-center">{group.pieces.length}</TableCell>
                          <TableCell className="text-center">{group.paymentCount}</TableCell>
                          <TableCell className="text-right font-bold text-purple-600">{formatCurrency(group.totalAmount)}</TableCell>
                          <TableCell className="text-center">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setSelectedGroupForDetails(group)
                                setSelectedGroupPaymentType('BigAdvance')
                                setGroupDetailsDialogOpen(true)
                              }}
                              className="text-purple-600 hover:text-purple-800"
                              title="عرض التفاصيل"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        )
                      }),
                      data.length > 1 && (
                        <TableRow key="big-summary" className="bg-purple-100/50 font-bold">
                          <TableCell className="text-purple-800 text-right">إجمالي التسبقة</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-center">{totalPieces}</TableCell>
                          <TableCell className="text-center">{totalPayments}</TableCell>
                          <TableCell className="text-right text-purple-800">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    ]
                    }
                    
                    // If no data but we have totals from places, show summary row
                    if (data.length === 0 && totalAmount > 0) {
                      return (
                        <TableRow className="bg-purple-50/50">
                          <TableCell className="font-bold text-purple-700 text-right">التسبقة</TableCell>
                          <TableCell className="text-muted-foreground text-right">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-right font-bold text-purple-600">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    
                    return null
                  })()}
                  
                  {/* Separator */}
                  <TableRow className="h-2 bg-transparent">
                    <TableCell colSpan={6} className="p-0"></TableCell>
                  </TableRow>
                  
                  {/* وعد بالبيع (المبلغ المستلم) */}
                  {(() => {
                    const data = getPaymentsByLand('InitialPayment')
                    const placeTotals = getTotalsByPlace()
                    const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.promiseOfSale, 0)
                    const totalAmount = totalFromPlaces > 0 ? totalFromPlaces : filteredData.promiseOfSalePaymentsTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    
                    if (data.length === 0 && totalAmount === 0) {
                      return (
                        <TableRow className="bg-pink-50/50">
                          <TableCell className="font-bold text-pink-700 text-right">وعد بالبيع</TableCell>
                          <TableCell className="text-muted-foreground text-right">-</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-center">0</TableCell>
                          <TableCell className="text-right font-bold text-pink-600">{formatCurrency(0)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    
                    // If no data but we have totals from places, show summary row
                    if (data.length === 0 && totalAmount > 0) {
                      return (
                        <TableRow className="bg-pink-50/50">
                          <TableCell className="font-bold text-pink-700 text-right">وعد بالبيع</TableCell>
                          <TableCell className="text-muted-foreground text-right">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-right font-bold text-pink-600">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    return [
                      ...data.map((group, idx) => {
                        // Get unique clients and piece numbers for this group
                        const uniqueClients = new Set<string>()
                        // Get actual piece numbers from landPieces to ensure accuracy
                        const pieceNumbers = group.pieces.map(p => {
                          const actualPiece = landPieces.find(lp => lp.id === p.pieceId)
                          const pieceNum = actualPiece?.piece_number || p.pieceNumber?.replace(/^#/, '') || ''
                          return pieceNum ? `#${pieceNum}` : p.pieceNumber
                        }).filter(Boolean).join(', ')
                        group.payments.forEach(p => {
                          const clientName = (p.client as any)?.name
                          if (clientName) uniqueClients.add(clientName)
                        })
                        
                        return (
                        <TableRow key={`promise-${idx}`} className="bg-pink-50/50 hover:bg-pink-100/50">
                          <TableCell className="font-bold text-pink-700 text-right">{idx === 0 ? 'وعد بالبيع' : ''}</TableCell>
                          <TableCell className="text-right">
                            <div className="font-medium">{group.landBatchName}</div>
                            {pieceNumbers && <div className="text-xs text-pink-600 mt-1">{pieceNumbers}</div>}
                            {uniqueClients.size > 0 && <div className="text-xs text-muted-foreground mt-1">{Array.from(uniqueClients).slice(0, 2).join(', ')}{uniqueClients.size > 2 ? '...' : ''}</div>}
                          </TableCell>
                          <TableCell className="text-center">{group.pieces.length}</TableCell>
                          <TableCell className="text-center">{group.paymentCount}</TableCell>
                          <TableCell className="text-right font-bold text-pink-600">{formatCurrency(group.totalAmount)}</TableCell>
                          <TableCell className="text-center">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => {
                                setSelectedGroupForDetails(group)
                                setSelectedGroupPaymentType('InitialPayment')
                                setGroupDetailsDialogOpen(true)
                              }}
                              className="text-pink-600 hover:text-pink-800"
                              title="عرض التفاصيل"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                        )
                      }),
                      data.length > 1 && (
                        <TableRow key="promise-summary" className="bg-pink-100/50 font-bold">
                          <TableCell className="text-pink-800 text-right">إجمالي وعد بالبيع</TableCell>
                          <TableCell className="text-right">-</TableCell>
                          <TableCell className="text-center">{totalPieces}</TableCell>
                          <TableCell className="text-center">{totalPayments}</TableCell>
                          <TableCell className="text-right text-pink-800">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    ]
                  })()}
                  
                  {/* Separator */}
                  <TableRow className="h-2 bg-transparent">
                    <TableCell colSpan={6} className="p-0"></TableCell>
                  </TableRow>
                  
                  {/* العمولة */}
                  {(() => {
                    const data = filteredData.companyFeesByLand
                    const placeTotals = getTotalsByPlace()
                    const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.companyFee, 0)
                    const totalAmount = totalFromPlaces > 0 ? totalFromPlaces : filteredData.companyFeesTotal
                    
                    if (data.length === 0 && totalAmount === 0) {
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
                    
                    // If no data but we have totals from places, show summary row
                    if (data.length === 0 && totalAmount > 0) {
                      return (
                        <TableRow className="bg-indigo-50/50">
                          <TableCell className="font-bold text-indigo-700">العمولة</TableCell>
                          <TableCell className="text-muted-foreground">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-center">-</TableCell>
                          <TableCell className="text-right font-bold text-indigo-600">{formatCurrency(totalAmount)}</TableCell>
                          <TableCell className="text-center">-</TableCell>
                        </TableRow>
                      )
                    }
                    return data.map((group, idx) => {
                      // Get unique clients and piece numbers for this group
                      const uniqueClients = new Set<string>()
                      const pieceNumbers: string[] = []
                      group.sales.forEach(sale => {
                        const client = (sale.client as any)
                        if (client?.name) uniqueClients.add(client.name)
                        // Get piece numbers for this sale
                        const salePieces = landPieces.filter(p => sale.land_piece_ids?.includes(p.id))
                        salePieces.forEach(p => pieceNumbers.push(p.piece_number || ''))
                      })
                      
                      return (
                        <TableRow key={`fee-${idx}`} className="bg-indigo-50/50 hover:bg-indigo-100/50">
                          <TableCell className="font-bold text-indigo-700">{idx === 0 ? 'العمولة' : ''}</TableCell>
                          <TableCell>
                            <div className="font-medium">{group.landBatchName}</div>
                            {pieceNumbers.length > 0 && <div className="text-xs text-indigo-600 mt-1">#{pieceNumbers.slice(0, 5).join(', ')}{pieceNumbers.length > 5 ? '...' : ''}</div>}
                            {uniqueClients.size > 0 && <div className="text-xs text-muted-foreground mt-1">{Array.from(uniqueClients).slice(0, 2).join(', ')}{uniqueClients.size > 2 ? '...' : ''}</div>}
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
                              title="عرض التفاصيل"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  })()}
                  
                  {/* Total Row */}
                  <TableRow className="bg-gray-100 font-bold border-t-2">
                    <TableCell colSpan={4} className="font-bold text-lg text-right">الإجمالي</TableCell>
                    <TableCell className="text-right font-bold text-lg text-green-700">
                      {(() => {
                        const placeTotals = getTotalsByPlace()
                        const grandTotal = placeTotals.reduce((sum, p) => sum + p.total, 0)
                        // Use place totals if available, otherwise use filtered data totals
                        return formatCurrency(
                          grandTotal > 0 ? grandTotal : (
                            filteredData.installmentPaymentsTotal + 
                            filteredData.fullPaymentsTotal + 
                            filteredData.bigAdvanceTotal + 
                            filteredData.smallAdvanceTotal + // SmallAdvance is separate from BigAdvance
                            filteredData.promiseOfSalePaymentsTotal + 
                            filteredData.companyFeesTotal
                          )
                        )
                      })()}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableBody>
              </Table>
          </CardContent>
        </Card>

        {/* Place-based Totals - Desktop */}
        {(() => {
          const placeTotals = getTotalsByPlace()
          // Show section even if empty, or if there's at least one place with data
          if (placeTotals.length === 0) {
            // Check if there are any payments at all
            const hasAnyPayments = filteredData.installmentPaymentsTotal > 0 || 
                                  filteredData.smallAdvanceTotal > 0 || 
                                  filteredData.fullPaymentsTotal > 0 || 
                                  filteredData.bigAdvanceTotal > 0 || 
                                  filteredData.promiseOfSalePaymentsTotal > 0 || 
                                  filteredData.companyFeesTotal > 0
            if (!hasAnyPayments) return null
          }
          
          return (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg font-bold">الإجمالي حسب الدفعة</CardTitle>
              </CardHeader>
              <CardContent>
                {placeTotals.length === 0 ? (
                  <p className="text-center text-muted-foreground py-4">لا توجد بيانات حسب الدفعة</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-bold text-right">الدفعة</TableHead>
                        <TableHead className="font-bold text-right">الأقساط</TableHead>
                        <TableHead className="font-bold text-right">العربون</TableHead>
                        <TableHead className="font-bold text-right">بالحاضر</TableHead>
                        <TableHead className="font-bold text-right">التسبقة</TableHead>
                        <TableHead className="font-bold text-right">وعد بالبيع</TableHead>
                        <TableHead className="font-bold text-right">العمولة</TableHead>
                        <TableHead className="font-bold text-right">الإجمالي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {placeTotals.map((placeData, idx) => (
                        <TableRow key={idx} className="hover:bg-gray-50">
                          <TableCell className="font-semibold text-right">{placeData.place}</TableCell>
                          <TableCell className="text-right text-blue-600">{formatCurrency(placeData.installment)}</TableCell>
                          <TableCell className="text-right text-orange-600">{formatCurrency(placeData.smallAdvance)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatCurrency(placeData.full)}</TableCell>
                          <TableCell className="text-right text-purple-600">{formatCurrency(placeData.bigAdvance)}</TableCell>
                          <TableCell className="text-right text-pink-600">{formatCurrency(placeData.promiseOfSale)}</TableCell>
                          <TableCell className="text-right text-indigo-600">{formatCurrency(placeData.companyFee)}</TableCell>
                          <TableCell className="text-right font-bold text-green-700">{formatCurrency(placeData.total)}</TableCell>
                        </TableRow>
                      ))}
                    {/* Grand Total Row */}
                    <TableRow className="bg-gray-100 font-bold border-t-2">
                      <TableCell className="font-bold text-lg text-right">الإجمالي</TableCell>
                      <TableCell className="text-right font-bold text-lg text-blue-700">
                        {formatCurrency(placeTotals.reduce((sum, p) => sum + p.installment, 0))}
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg text-orange-700">
                        {formatCurrency(placeTotals.reduce((sum, p) => sum + p.smallAdvance, 0))}
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg text-green-700">
                        {formatCurrency(placeTotals.reduce((sum, p) => sum + p.full, 0))}
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg text-purple-700">
                        {formatCurrency(placeTotals.reduce((sum, p) => sum + p.bigAdvance, 0))}
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg text-pink-700">
                        {formatCurrency(placeTotals.reduce((sum, p) => sum + p.promiseOfSale, 0))}
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg text-indigo-700">
                        {formatCurrency(placeTotals.reduce((sum, p) => sum + p.companyFee, 0))}
                      </TableCell>
                      <TableCell className="text-right font-bold text-lg text-green-700">
                        {formatCurrency(placeTotals.reduce((sum, p) => sum + p.total, 0))}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
                )}
              </CardContent>
            </Card>
          )
        })()}
      </div>

        {/* Mobile: Card View for all 6 categories - Matching Desktop Structure */}
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
                    const placeTotals = getTotalsByPlace()
                    const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.installment, 0)
                    const totalAmount = totalFromPlaces > 0 ? totalFromPlaces : filteredData.installmentPaymentsTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    if (data.length > 0 || totalAmount > 0) {
                      return (
                        <div className="text-xs text-blue-600 mt-1">
                          {totalPieces > 0 && <span>{totalPieces} قطعة</span>}
                          {totalPieces > 0 && totalPayments > 0 && <span> • </span>}
                          {totalPayments > 0 && <span>{totalPayments} عملية</span>}
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-blue-600">
                    {(() => {
                      const placeTotals = getTotalsByPlace()
                      const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.installment, 0)
                      return formatCurrency(totalFromPlaces > 0 ? totalFromPlaces : filteredData.installmentPaymentsTotal)
                    })()}
                  </span>
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
                  <h3 className="font-bold text-sm text-orange-700">العربون</h3>
                  {(() => {
                    const data = getPaymentsByLand('SmallAdvance')
                    const placeTotals = getTotalsByPlace()
                    const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.smallAdvance, 0)
                    const totalAmount = totalFromPlaces > 0 ? totalFromPlaces : filteredData.smallAdvanceTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    if (data.length > 0 || totalAmount > 0) {
                      return (
                        <div className="text-xs text-orange-600 mt-1">
                          {totalPieces > 0 && <span>{totalPieces} قطعة</span>}
                          {totalPieces > 0 && totalPayments > 0 && <span> • </span>}
                          {totalPayments > 0 && <span>{totalPayments} عملية</span>}
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-orange-600">
                    {(() => {
                      const placeTotals = getTotalsByPlace()
                      const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.smallAdvance, 0)
                      return formatCurrency(totalFromPlaces > 0 ? totalFromPlaces : filteredData.smallAdvanceTotal)
                    })()}
                  </span>
                  <ChevronDown className="h-4 w-4 text-orange-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* بالحاضر */}
          <Card 
            className="border-green-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => openPaymentDetailsDialog('Full')}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-green-700">بالحاضر</h3>
                  {(() => {
                    const data = getPaymentsByLand('Full')
                    const placeTotals = getTotalsByPlace()
                    const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.full, 0)
                    const totalAmount = totalFromPlaces > 0 ? totalFromPlaces : filteredData.fullPaymentsTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    if (data.length > 0 || totalAmount > 0) {
                      return (
                        <div className="text-xs text-green-600 mt-1">
                          {totalPieces > 0 && <span>{totalPieces} قطعة</span>}
                          {totalPieces > 0 && totalPayments > 0 && <span> • </span>}
                          {totalPayments > 0 && <span>{totalPayments} عملية</span>}
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-green-600">
                    {(() => {
                      const placeTotals = getTotalsByPlace()
                      const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.full, 0)
                      return formatCurrency(totalFromPlaces > 0 ? totalFromPlaces : filteredData.fullPaymentsTotal)
                    })()}
                  </span>
                  <ChevronDown className="h-4 w-4 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* التسبقة */}
          <Card 
            className="border-purple-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => openPaymentDetailsDialog('BigAdvance')}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-purple-700">التسبقة</h3>
                  {(() => {
                    const data = getPaymentsByLand('BigAdvance')
                    const placeTotals = getTotalsByPlace()
                    const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.bigAdvance, 0)
                    const totalAmount = totalFromPlaces > 0 ? totalFromPlaces : filteredData.bigAdvanceTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    if (data.length > 0 || totalAmount > 0) {
                      return (
                        <div className="text-xs text-purple-600 mt-1">
                          {totalPieces > 0 && <span>{totalPieces} قطعة</span>}
                          {totalPieces > 0 && totalPayments > 0 && <span> • </span>}
                          {totalPayments > 0 && <span>{totalPayments} عملية</span>}
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-purple-600">
                    {(() => {
                      const placeTotals = getTotalsByPlace()
                      const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.bigAdvance, 0)
                      return formatCurrency(totalFromPlaces > 0 ? totalFromPlaces : filteredData.bigAdvanceTotal)
                    })()}
                  </span>
                  <ChevronDown className="h-4 w-4 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* وعد بالبيع */}
          <Card 
            className="border-pink-200 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => openPaymentDetailsDialog('InitialPayment')}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm text-pink-700">وعد بالبيع</h3>
                  {(() => {
                    const data = getPaymentsByLand('InitialPayment')
                    const placeTotals = getTotalsByPlace()
                    const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.promiseOfSale, 0)
                    const totalAmount = totalFromPlaces > 0 ? totalFromPlaces : filteredData.promiseOfSalePaymentsTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.pieces.length, 0)
                    const totalPayments = data.reduce((sum, g) => sum + g.paymentCount, 0)
                    if (data.length > 0 || totalAmount > 0) {
                      return (
                        <div className="text-xs text-pink-600 mt-1">
                          {totalPieces > 0 && <span>{totalPieces} قطعة</span>}
                          {totalPieces > 0 && totalPayments > 0 && <span> • </span>}
                          {totalPayments > 0 && <span>{totalPayments} عملية</span>}
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-pink-600">
                    {(() => {
                      const placeTotals = getTotalsByPlace()
                      const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.promiseOfSale, 0)
                      return formatCurrency(totalFromPlaces > 0 ? totalFromPlaces : filteredData.promiseOfSalePaymentsTotal)
                    })()}
                  </span>
                  <ChevronDown className="h-4 w-4 text-pink-600" />
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
                    const placeTotals = getTotalsByPlace()
                    const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.companyFee, 0)
                    const totalAmount = totalFromPlaces > 0 ? totalFromPlaces : filteredData.companyFeesTotal
                    const totalPieces = data.reduce((sum, g) => sum + g.piecesCount, 0)
                    const totalSales = data.reduce((sum, g) => sum + g.salesCount, 0)
                    if (data.length > 0 || totalAmount > 0) {
                      return (
                        <div className="text-xs text-indigo-600 mt-1">
                          {totalPieces > 0 && <span>{totalPieces} قطعة</span>}
                          {totalPieces > 0 && totalSales > 0 && <span> • </span>}
                          {totalSales > 0 && <span>{totalSales} عملية</span>}
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-indigo-600">
                    {(() => {
                      const placeTotals = getTotalsByPlace()
                      const totalFromPlaces = placeTotals.reduce((sum, p) => sum + p.companyFee, 0)
                      return formatCurrency(totalFromPlaces > 0 ? totalFromPlaces : filteredData.companyFeesTotal)
                    })()}
                  </span>
                  <ChevronDown className="h-4 w-4 text-indigo-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* الإجمالي - Total Card */}
          <Card className="border-2 border-gray-400 bg-gradient-to-br from-gray-50 to-gray-100">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base text-gray-900">الإجمالي</h3>
                  <p className="text-xs text-gray-600 mt-1">جميع المدفوعات والعمولات</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xl font-bold text-green-700">
                    {(() => {
                      const placeTotals = getTotalsByPlace()
                      const grandTotal = placeTotals.reduce((sum, p) => sum + p.total, 0)
                      return formatCurrency(
                        grandTotal > 0 ? grandTotal : (
                          filteredData.installmentPaymentsTotal + 
                          filteredData.fullPaymentsTotal + 
                          filteredData.bigAdvanceTotal + 
                          filteredData.smallAdvanceTotal + 
                          filteredData.promiseOfSalePaymentsTotal + 
                          filteredData.companyFeesTotal
                        )
                      )
                    })()}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Place-based Totals - Mobile */}
          {(() => {
            const placeTotals = getTotalsByPlace()
            if (placeTotals.length === 0) return null
            
            return (
              <div className="space-y-3 mt-4">
                <h3 className="font-bold text-base text-gray-800 mb-3">الإجمالي حسب الدفعة</h3>
                {placeTotals.map((placeData, idx) => (
                  <Card key={idx} className="border-2 border-gray-300 bg-gradient-to-br from-gray-50 to-gray-100">
                    <CardContent className="p-4">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between border-b border-gray-300 pb-2">
                          <h4 className="font-bold text-base text-gray-900">{placeData.place}</h4>
                          <span className="text-lg font-bold text-green-700">
                            {formatCurrency(placeData.total)}
                          </span>
                        </div>
                        <div className="space-y-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-blue-600">الأقساط:</span>
                            <span className="font-semibold text-blue-700">{formatCurrency(placeData.installment)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-orange-600">العربون:</span>
                            <span className="font-semibold text-orange-700">{formatCurrency(placeData.smallAdvance)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-green-600">بالحاضر:</span>
                            <span className="font-semibold text-green-700">{formatCurrency(placeData.full)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-purple-600">التسبقة:</span>
                            <span className="font-semibold text-purple-700">{formatCurrency(placeData.bigAdvance)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-pink-600">وعد بالبيع:</span>
                            <span className="font-semibold text-pink-700">{formatCurrency(placeData.promiseOfSale)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-indigo-600">العمولة:</span>
                            <span className="font-semibold text-indigo-700">{formatCurrency(placeData.companyFee)}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Payment Details Dialog - Matching Company Fee Design */}
      <Dialog open={paymentDetailDialogOpen} onOpenChange={setPaymentDetailDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-7xl max-h-[95vh] overflow-y-auto">
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
                  case 'InitialPayment':
                    return {
                      bg: 'from-pink-50 to-rose-50',
                      border: 'border-pink-200',
                      text: 'text-pink-600',
                      textMuted: 'text-pink-700'
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
                                
                                // Get actual piece number from landPieces to ensure accuracy
                                const actualPiece = landPieces.find(lp => lp.id === piece.pieceId)
                                const pieceNum = actualPiece?.piece_number || piece.pieceNumber?.replace(/^#/, '') || piece.pieceNumber
                                const displayPieceNumber = pieceNum ? (pieceNum.startsWith('#') ? pieceNum : `#${pieceNum}`) : '-'
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
                                                {displayPieceNumber}
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
                                <TableHead className="text-right">التاريخ</TableHead>
                                <TableHead className="text-right">العميل</TableHead>
                                <TableHead className="text-right">اسم الدفعة</TableHead>
                                <TableHead className="text-right">رقم القطعة</TableHead>
                                <TableHead className="text-center">عدد الأقساط</TableHead>
                                <TableHead className="text-right">المبلغ</TableHead>
                                <TableHead className="text-right">طريقة الدفع</TableHead>
                                <TableHead className="text-right">المستخدم</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paymentsByLand.flatMap((group, groupIndex) => {
                                return [
                                  <TableRow key={`summary-${groupIndex}`} className="bg-gray-50 font-bold">
                                    <TableCell colSpan={4} className="font-bold text-right">
                                      {group.landBatchName}
                                    </TableCell>
                                    <TableCell className="text-center">{group.paymentCount} دفعة</TableCell>
                                    <TableCell className={`text-right font-bold text-lg ${colors.text}`}>
                                      {formatCurrency(group.totalAmount)}
                                    </TableCell>
                                    <TableCell className="text-center">{group.pieces.length} قطعة</TableCell>
                                    <TableCell className="text-right">-</TableCell>
                                  </TableRow>,
                                  ...group.pieces.flatMap((piece) => {
                                    const uniqueClients = new Set(piece.payments.map(p => (p.client as any)?.name).filter(Boolean))
                                    const recordedByUsers = Array.from(piece.recordedByUsers)
                                    const soldByUsers = Array.from(piece.soldByUsers)
                                    
                                    return piece.payments.map((payment, idx) => {
                                      const client = payment.client as any
                                      // Get actual piece number from landPieces to ensure accuracy
                                      const actualPiece = landPieces.find(lp => lp.id === piece.pieceId)
                                      const pieceNum = actualPiece?.piece_number || piece.pieceNumber?.replace(/^#/, '') || piece.pieceNumber
                                      const displayPieceNumber = pieceNum ? (pieceNum.startsWith('#') ? pieceNum : `#${pieceNum}`) : '-'
                                      return (
                                        <TableRow key={`${piece.pieceId}-${payment.id}-${idx}`} className="bg-white">
                                          <TableCell className="text-right">{formatDate(payment.payment_date)}</TableCell>
                                          <TableCell className="text-right">
                                            <div className="flex flex-col items-end">
                                              <span className="font-medium">{client?.name || 'غير معروف'}</span>
                                              {client?.phone && <span className="text-xs text-muted-foreground">({client.phone})</span>}
                                            </div>
                                          </TableCell>
                                          <TableCell className="text-right text-muted-foreground">{actualPiece?.land_batch?.name || group.landBatchName}</TableCell>
                                          <TableCell className="text-right font-medium">{displayPieceNumber}</TableCell>
                                          <TableCell className="text-center">{piece.installmentCount > 0 ? piece.installmentCount : '-'}</TableCell>
                                          <TableCell className={`text-right font-bold ${colors.text}`}>
                                            {formatCurrency(payment.amount_paid)}
                                          </TableCell>
                                          <TableCell className="text-right">{payment.payment_method || '-'}</TableCell>
                                          <TableCell className="text-right text-xs">
                                            <div className="flex flex-col items-end">
                                              {soldByUsers.length > 0 && <span>باع: {soldByUsers.join('، ')}</span>}
                                              {recordedByUsers.length > 0 && recordedByUsers.join('') !== soldByUsers.join('') && (
                                                <span>سجل: {recordedByUsers.join('، ')}</span>
                                              )}
                                              {payment.recorded_by_user && !soldByUsers.includes(payment.recorded_by_user.name) && (
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
                                <TableCell colSpan={4} className="font-bold text-right">الإجمالي:</TableCell>
                                <TableCell className="text-center">-</TableCell>
                                <TableCell className={`text-right font-bold text-lg ${colors.text}`}>
                                  {formatCurrency(totalAmount)}
                                </TableCell>
                                <TableCell colSpan={2} className="text-right">-</TableCell>
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
        <DialogContent className="w-[95vw] sm:w-full max-w-7xl max-h-[95vh] overflow-y-auto">
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
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">العميل</TableHead>
                        <TableHead className="text-right">اسم الدفعة</TableHead>
                        <TableHead className="text-center">عدد القطع</TableHead>
                        <TableHead className="text-right">نوع البيع</TableHead>
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
                                    <TableCell colSpan={3} className="font-bold text-right">
                                      {group.landBatchName}
                                    </TableCell>
                                <TableCell className="text-center">
                                  {group.sales.reduce((sum, s) => sum + (s.land_piece_ids?.length || 0), 0)}
                                </TableCell>
                                <TableCell className="text-sm text-right">
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
                                    <TableCell className="text-right">{formatDate(sale.sale_date)}</TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex flex-col items-end">
                                        <span className="font-medium">{client?.name || 'غير معروف'}</span>
                                        {client?.phone && <span className="text-xs text-muted-foreground">({client.phone})</span>}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right text-muted-foreground">{batchName}</TableCell>
                                    <TableCell className="text-center">
                                      <div className="flex flex-col">
                                        <span>{pieces.length}</span>
                                        {pieceNumbers !== '-' && <span className="text-xs text-muted-foreground">{pieceNumbers}</span>}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-sm text-right">
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
                            <TableCell colSpan={8} className="font-bold text-right">الإجمالي:</TableCell>
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

      {/* Installment Statistics Dialog */}
      <Dialog open={installmentStatsDialogOpen} onOpenChange={setInstallmentStatsDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedInstallmentView === 'thisMonth' && 'الأقساط المستحقة هذا الشهر'}
              {selectedInstallmentView === 'total' && 'إجمالي الأقساط المتبقية'}
              {selectedInstallmentView === 'unpaid' && 'المبلغ غير المدفوع'}
              {selectedInstallmentView === 'paid' && 'المبالغ المدفوعة'}
            </DialogTitle>
          </DialogHeader>
          {selectedInstallmentView && (() => {
            const now = new Date()
            const currentMonth = now.getMonth()
            const currentYear = now.getFullYear()
            const monthStart = new Date(currentYear, currentMonth, 1)
            const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59)
            
            // IMPORTANT: Only show installments for CONFIRMED sales
            // Filter out installments for reset sales
            // IMPORTANT: Preserve Completed sales - they should always be included
            const validInstallments = installments.filter(inst => {
              const sale = inst.sale as any
              if (!sale) return false
              
              // Always include Completed sales - preserve their stats
              if (sale.status === 'Completed') return true
              
              // Exclude installments for cancelled sales
              if (sale.status === 'Cancelled') return false
              
              // Exclude installments for reset sales (status = 'Pending', big_advance_amount = 0, company_fee_amount = null)
              // This only applies to Pending sales that were reset, NOT completed sales
              if (sale.status === 'Pending' && 
                  sale.big_advance_amount === 0 && 
                  !sale.company_fee_amount) {
                return false
              }
              
              // Only include installments for CONFIRMED sales
              // A sale is confirmed if:
              // 1. company_fee_amount IS NOT NULL (even if 0) - means commission was calculated and set
              // 2. big_advance_amount > 0 - means big advance was paid
              // 3. big_advance_confirmed = true
              // 4. is_confirmed = true
              const isConfirmed = (sale.company_fee_amount !== null && sale.company_fee_amount !== undefined) ||
                                 (sale.big_advance_amount && sale.big_advance_amount > 0) ||
                                 sale.big_advance_confirmed === true ||
                                 sale.is_confirmed === true
              
              if (!isConfirmed) {
                return false // Exclude installments for unconfirmed sales
              }
              
              return true
            })
            
            let displayInstallments: any[] = []
            
            if (selectedInstallmentView === 'thisMonth') {
              displayInstallments = validInstallments.filter(inst => {
                const dueDate = new Date(inst.due_date)
                return dueDate >= monthStart && dueDate <= monthEnd
              })
            } else if (selectedInstallmentView === 'total') {
              displayInstallments = validInstallments.filter(inst => {
                const remaining = (inst.amount_due + inst.stacked_amount) - inst.amount_paid
                return remaining > 0.01
              })
            } else if (selectedInstallmentView === 'unpaid') {
              const thisMonthInsts = validInstallments.filter(inst => {
                const dueDate = new Date(inst.due_date)
                return dueDate >= monthStart && dueDate <= monthEnd
              })
              displayInstallments = thisMonthInsts.filter(inst => {
                const remaining = (inst.amount_due + inst.stacked_amount) - inst.amount_paid
                return remaining > 0.01
              })
            } else if (selectedInstallmentView === 'paid') {
              const thisMonthInsts = validInstallments.filter(inst => {
                const dueDate = new Date(inst.due_date)
                return dueDate >= monthStart && dueDate <= monthEnd
              })
              displayInstallments = thisMonthInsts.filter(inst => {
                const remaining = (inst.amount_due + inst.stacked_amount) - inst.amount_paid
                return remaining <= 0.01
              })
            }
            
            // Group by client
            const groupedByClient = new Map<string, {
              client: any
              installments: any[]
              totalDue: number
              totalPaid: number
              totalRemaining: number
            }>()
            
            displayInstallments.forEach(inst => {
              const clientId = inst.sale?.client?.id || 'unknown'
              const client = inst.sale?.client
              
              if (!groupedByClient.has(clientId)) {
                groupedByClient.set(clientId, {
                  client,
                  installments: [],
                  totalDue: 0,
                  totalPaid: 0,
                  totalRemaining: 0,
                })
              }
              
              const group = groupedByClient.get(clientId)!
              const remaining = (inst.amount_due + inst.stacked_amount) - inst.amount_paid
              
              group.installments.push(inst)
              group.totalDue += inst.amount_due + inst.stacked_amount
              group.totalPaid += inst.amount_paid
              group.totalRemaining += Math.max(0, remaining)
            })
            
            const paidThisMonth = validInstallments.filter(inst => {
              const dueDate = new Date(inst.due_date)
              return dueDate >= monthStart && dueDate <= monthEnd
            }).filter(inst => {
              const remaining = (inst.amount_due + inst.stacked_amount) - inst.amount_paid
              return remaining <= 0.01
            })
            
            const paidByClient = new Map<string, {
              client: any
              installments: any[]
              totalPaid: number
            }>()
            
            paidThisMonth.forEach(inst => {
              const clientId = inst.sale?.client?.id || 'unknown'
              const client = inst.sale?.client
              
              if (!paidByClient.has(clientId)) {
                paidByClient.set(clientId, {
                  client,
                  installments: [],
                  totalPaid: 0,
                })
              }
              
              const group = paidByClient.get(clientId)!
              group.installments.push(inst)
              group.totalPaid += inst.amount_paid
            })
            
            return (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">عدد العملاء</p>
                      <p className="text-2xl font-bold">{groupedByClient.size}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">عدد الأقساط</p>
                      <p className="text-2xl font-bold">{displayInstallments.length}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">المبلغ المستحق</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {formatCurrency(Array.from(groupedByClient.values()).reduce((sum, g) => sum + g.totalRemaining, 0))}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground mb-1">من دفعوا</p>
                      <p className="text-2xl font-bold text-green-600">{paidByClient.size}</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Tabs for Paid/Unpaid */}
                <div className="flex gap-2 border-b">
                  <Button
                    variant={selectedInstallmentView === 'unpaid' ? 'default' : 'ghost'}
                    onClick={() => setSelectedInstallmentView('unpaid')}
                    className="rounded-b-none"
                  >
                    لم يدفعوا ({groupedByClient.size})
                  </Button>
                  <Button
                    variant={selectedInstallmentView !== 'unpaid' ? 'default' : 'ghost'}
                    onClick={() => {
                      if (selectedInstallmentView === 'unpaid') {
                        setSelectedInstallmentView('thisMonth')
                      }
                    }}
                    className="rounded-b-none"
                  >
                    دفعوا ({paidByClient.size})
                  </Button>
                </div>

                {/* Unpaid Clients */}
                {selectedInstallmentView === 'unpaid' && (
                  <div className="space-y-4">
                    {Array.from(groupedByClient.values()).map((group, idx) => (
                      <Card key={idx}>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center justify-between">
                            <span>{group.client?.name || 'غير معروف'}</span>
                            <Badge variant="destructive">
                              {formatCurrency(group.totalRemaining)} متبقي
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {group.installments.map((inst) => {
                              const remaining = (inst.amount_due + inst.stacked_amount) - inst.amount_paid
                              return (
                                <div key={inst.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                  <div>
                                    <span className="font-medium">قسط #{inst.installment_number}</span>
                                    <span className="text-sm text-muted-foreground mr-2">
                                      ({formatDate(inst.due_date)})
                                    </span>
                                  </div>
                                  <div className="text-left">
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">المستحق: </span>
                                      <span>{formatCurrency(inst.amount_due + inst.stacked_amount)}</span>
                                    </div>
                                    <div className="text-sm">
                                      <span className="text-muted-foreground">المدفوع: </span>
                                      <span className="text-green-600">{formatCurrency(inst.amount_paid)}</span>
                                    </div>
                                    <Badge variant={remaining > 0.01 ? 'destructive' : 'success'} className="text-xs">
                                      {remaining > 0.01 ? 'غير مدفوع' : 'مدفوع'}
                                    </Badge>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* Paid Clients */}
                {selectedInstallmentView !== 'unpaid' && (
                  <div className="space-y-4">
                    {Array.from(paidByClient.values()).map((group, idx) => (
                      <Card key={idx}>
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center justify-between">
                            <span>{group.client?.name || 'غير معروف'}</span>
                            <Badge variant="success">
                              {formatCurrency(group.totalPaid)} مدفوع
                            </Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {group.installments.map((inst) => (
                              <div key={inst.id} className="flex items-center justify-between p-2 bg-green-50 rounded">
                                <div>
                                  <span className="font-medium">قسط #{inst.installment_number}</span>
                                  <span className="text-sm text-muted-foreground mr-2">
                                    ({formatDate(inst.due_date)})
                                  </span>
                                </div>
                                <div className="text-left">
                                  <span className="text-green-600 font-bold">{formatCurrency(inst.amount_paid)}</span>
                                  <Badge variant="success" className="text-xs mr-2">مدفوع</Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Group Details Dialog - Shows detailed information for a specific land group */}
      <Dialog open={groupDetailsDialogOpen} onOpenChange={setGroupDetailsDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              <span>تفاصيل {selectedGroupPaymentType ? getPaymentTypeLabel(selectedGroupPaymentType) : 'المدفوعات'} - {selectedGroupForDetails?.landBatchName}</span>
            </DialogTitle>
          </DialogHeader>
          {selectedGroupForDetails && (
            <div className="space-y-4">
              {/* Summary Card */}
              <Card>
                <CardHeader>
                  <CardTitle>ملخص</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">الدفعة</p>
                      <p className="font-semibold">{selectedGroupForDetails.landBatchName}</p>
                      {selectedGroupForDetails.location && (
                        <p className="text-xs text-muted-foreground">{selectedGroupForDetails.location}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">عدد القطع</p>
                      <p className="font-semibold">{selectedGroupForDetails.pieces.length}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">عدد العمليات</p>
                      <p className="font-semibold">{selectedGroupForDetails.paymentCount}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">المبلغ الإجمالي</p>
                      <p className="font-semibold text-green-600">{formatCurrency(selectedGroupForDetails.totalAmount)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Pieces Details - Table Format */}
              <Card>
                <CardHeader>
                  <CardTitle>تفاصيل القطع</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-bold text-right">رقم القطعة</TableHead>
                          <TableHead className="font-bold text-right">الدفعة</TableHead>
                          <TableHead className="font-bold text-right">العميل</TableHead>
                          <TableHead className="font-bold text-center">عدد المدفوعات</TableHead>
                          <TableHead className="font-bold text-right">المبلغ الإجمالي</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedGroupForDetails.pieces.map((piece, idx) => {
                          // Collect all unique clients from payments
                          const uniqueClients = new Set<string>()
                          const clientDetails = new Map<string, { name: string; cin?: string }>()
                          
                          piece.payments.forEach(p => {
                            const client = p.client as any
                            if (client?.name) {
                              uniqueClients.add(client.name)
                              if (!clientDetails.has(client.name)) {
                                clientDetails.set(client.name, {
                                  name: client.name,
                                  cin: client.cin
                                })
                              }
                            }
                            // Also try to get client from sale if available
                            const sale = p.sale as any
                            if (sale?.client) {
                              const saleClient = sale.client
                              if (saleClient.name && !uniqueClients.has(saleClient.name)) {
                                uniqueClients.add(saleClient.name)
                                if (!clientDetails.has(saleClient.name)) {
                                  clientDetails.set(saleClient.name, {
                                    name: saleClient.name,
                                    cin: saleClient.cin
                                  })
                                }
                              }
                            }
                          })
                          
                          const clientNames = Array.from(uniqueClients).map(name => {
                            const details = clientDetails.get(name)
                            return details?.name || name
                          }).join(', ') || 'غير معروف'
                          
                          // Get actual piece number and batch info from landPieces to ensure accuracy
                          const actualPiece = landPieces.find(lp => lp.id === piece.pieceId)
                          const pieceNum = actualPiece?.piece_number || piece.pieceNumber?.replace(/^#/, '') || piece.pieceNumber
                          const displayPieceNumber = pieceNum ? (pieceNum.startsWith('#') ? pieceNum : `#${pieceNum}`) : '-'
                          const batchName = actualPiece?.land_batch?.name || piece.landBatchName
                          const location = actualPiece?.land_batch?.location || piece.location
                          return (
                            <TableRow key={idx} className="hover:bg-gray-50">
                              <TableCell className="text-right font-medium">{displayPieceNumber}</TableCell>
                              <TableCell className="text-right">
                                <div>{batchName !== 'غير محدد' ? batchName : '-'}</div>
                                {location && <div className="text-xs text-muted-foreground">{location}</div>}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="font-medium">{clientNames}</div>
                                {Array.from(uniqueClients).length > 0 && Array.from(uniqueClients).slice(0, 1).map((name, i) => {
                                  const details = clientDetails.get(name)
                                  return details?.cin ? (
                                    <div key={i} className="text-xs text-muted-foreground">CIN: {details.cin}</div>
                                  ) : null
                                })}
                              </TableCell>
                              <TableCell className="text-center">{piece.payments.length}</TableCell>
                              <TableCell className="text-right font-bold text-green-600">{formatCurrency(piece.totalAmount)}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}