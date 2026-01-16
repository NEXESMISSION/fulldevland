import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { sanitizeText, sanitizePhone, sanitizeCIN, sanitizeEmail, sanitizeNotes, validateLebanesePhone } from '@/lib/sanitize'
import { debounce } from '@/lib/throttle'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { retryWithBackoff, isRetryableError } from '@/lib/retry'
import { validatePermissionServerSide } from '@/lib/permissionValidation'
import { Plus, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, X, AlertCircle, Calendar, ChevronDown, ChevronRight } from 'lucide-react'
import type { Sale, Client, LandPiece, Installment } from '@/types/database'

// Types for per-piece tracking
interface PieceSale {
  id: string
  saleId: string
  pieceId: string
  pieceName: string
  batchName: string
  surfaceArea: number
  clientId: string
  clientName: string
  paymentType: 'Full' | 'Installment' | 'PromiseOfSale'
  price: number
  cost: number
  profit: number
  saleDate: string
  createdAt: string // For secondary sorting (newest first)
  updatedAt: string | null // When sale was last updated/completed
  deadlineDate: string | null // Deadline for completing procedures
  // Reservation (عربون) - paid on spot
  reservationAmount: number
  // Company fee
  companyFeePercentage: number | null
  companyFeeAmount: number | null
  // Remaining amount after payments
  remainingAmount?: number
  // Full payment fields
  fullPaymentConfirmed: boolean
  // Installment fields
  numberOfInstallments: number | null
  bigAdvanceAmount: number
  bigAdvanceConfirmed: boolean
  bigAdvanceDueDate: string | null
  monthlyInstallmentAmount: number | null
  installmentStartDate: string | null
  installmentsData: Installment[]
  // Status - matches SaleStatus type
  status: 'Pending' | 'AwaitingPayment' | 'InstallmentsOngoing' | 'Completed' | 'Cancelled'
}

interface ClientMonthlySummary {
  clientId: string
  clientName: string
  totalDueThisMonth: number
  overdueAmount: number
  piecesCount: number
}

export function SalesNew() {
  const { hasPermission, user } = useAuth()
  const { t } = useLanguage()
  const [sales, setSales] = useState<Sale[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [pieces, setPieces] = useState<LandPiece[]>([])
  const [installments, setInstallments] = useState<Installment[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([]) // For user tracking
  const [loading, setLoading] = useState(true)
  
  // View state
  
  const [newClientForm, setNewClientForm] = useState({
    name: '',
    cin: '',
    phone: '',
    email: '',
    address: '',
    client_type: 'Individual',
    notes: '',
  })
  
  // Confirm dialogs
  const [confirmFullOpen, setConfirmFullOpen] = useState(false)
  const [confirmBigAdvanceOpen, setConfirmBigAdvanceOpen] = useState(false)
  const [selectedSale, setSelectedSale] = useState<PieceSale | null>(null)
  const [installmentStartDate, setInstallmentStartDate] = useState('')
  const [bigAdvancePaidAmount, setBigAdvancePaidAmount] = useState('')
  const [bigAdvancePaidDate, setBigAdvancePaidDate] = useState(new Date().toISOString().split('T')[0])
  const [numberOfInstallments, setNumberOfInstallments] = useState('12')
  const [applyCompanyFee, setApplyCompanyFee] = useState(false)
  const [companyFeePercentage, setCompanyFeePercentage] = useState('2')
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  // Client details dialog
  const [clientDetailsOpen, setClientDetailsOpen] = useState(false)
  const [selectedClientForDetails, setSelectedClientForDetails] = useState<Client | null>(null)
  const [clientSales, setClientSales] = useState<Sale[]>([])
  
  // Sale details dialog
  const [saleDetailsOpen, setSaleDetailsOpen] = useState(false)
  const [selectedSaleForDetails, setSelectedSaleForDetails] = useState<PieceSale | null>(null)
  const [resettingSale, setResettingSale] = useState(false)
  const [installmentsExpanded, setInstallmentsExpanded] = useState(false)
  const [paymentsExpanded, setPaymentsExpanded] = useState(false)
  
  const openClientDetails = async (client: Client) => {
    setSelectedClientForDetails(client)
    setClientDetailsOpen(true)
    
    // Fetch client's sales history
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*')
        .eq('client_id', client.id)
        .order('sale_date', { ascending: false })
      
      if (error) throw error
      setClientSales(data || [])
    } catch (err) {
      console.error('Error fetching client sales:', err)
      setClientSales([])
    }
  }

  const resetSaleToConfirmation = async () => {
    if (!selectedSaleForDetails) return
    
    if (!confirm('هل أنت متأكد من إرجاع هذا البيع إلى صفحة التأكيد؟ سيتم حذف دفعات التسبقة والعمولة، ولكن سيتم الاحتفاظ بالعربون.')) {
      return
    }
    
    setResettingSale(true)
    try {
      const saleId = selectedSaleForDetails.saleId
      
      // 1. Delete ALL payment records EXCEPT SmallAdvance (reservation)
      // Delete each payment type explicitly to ensure all are removed
      const paymentTypesToDelete = ['BigAdvance', 'Full', 'Partial', 'InitialPayment', 'Installment', 'Field']
      
      for (const paymentType of paymentTypesToDelete) {
        const { error: deleteError } = await supabase
          .from('payments')
          .delete()
          .eq('sale_id', saleId)
          .eq('payment_type', paymentType)
        
        if (deleteError) {
          console.warn(`Error deleting ${paymentType} payments:`, deleteError)
          // Continue with other types even if one fails
        }
      }
      
      // Verify no BigAdvance or Full payments remain
      const { data: remainingPayments, error: checkError } = await supabase
        .from('payments')
        .select('id, payment_type')
        .eq('sale_id', saleId)
        .in('payment_type', ['BigAdvance', 'Full', 'Partial', 'InitialPayment', 'Installment', 'Field'])
      
      if (checkError) {
        console.warn('Error checking remaining payments:', checkError)
      } else if (remainingPayments && remainingPayments.length > 0) {
        // Force delete any remaining non-SmallAdvance payments
        const { error: forceDeleteError } = await supabase
          .from('payments')
          .delete()
          .in('id', remainingPayments.map(p => p.id))
        
        if (forceDeleteError) {
          console.warn('Error force deleting remaining payments:', forceDeleteError)
        }
      }
      
      // 2. Delete all installments (since sale is going back to confirmation, installments shouldn't exist yet)
      const { error: installmentError } = await supabase
        .from('installments')
        .delete()
        .eq('sale_id', saleId)
      
      if (installmentError) throw installmentError
      
      // 3. Reset sale fields - clean all confirmation traces
      const { error: saleError } = await supabase
        .from('sales')
        .update({
          big_advance_amount: 0,
          company_fee_amount: null,
          company_fee_percentage: null,
          status: 'Pending',
          promise_completed: false,
          promise_initial_payment: null,
          number_of_installments: null,
          monthly_payment_amount: null,
          installment_start_date: null
        })
        .eq('id', saleId)
      
      if (saleError) throw saleError
      
      // 4. Wait a bit for database to commit
      await new Promise(resolve => setTimeout(resolve, 300))
      
      // 5. Refresh data
      await fetchData()
      setSaleDetailsOpen(false)
      alert('تم إرجاع البيع إلى صفحة التأكيد بنجاح - تم حذف جميع البيانات المرتبطة')
    } catch (error: any) {
      console.error('Error resetting sale:', error)
      alert('حدث خطأ أثناء إرجاع البيع: ' + (error.message || 'خطأ غير معروف'))
    } finally {
      setResettingSale(false)
    }
  }

  // UI/UX: Filter and sort states
  const [statusFilter, setStatusFilter] = useState<'all' | 'Reserved' | 'Installment' | 'Full' | 'Completed'>('all')
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<'all' | 'Full' | 'Installment'>('all')
  const [clientFilter, setClientFilter] = useState('')
  const [landBatchFilter, setLandBatchFilter] = useState<string>('all')
  const [landPieceSearch, setLandPieceSearch] = useState('')
  const [timePeriodFilter, setTimePeriodFilter] = useState<'all' | 'day' | 'week' | 'month'>('all')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [sortBy, setSortBy] = useState<'date' | 'client' | 'price' | 'status'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    setErrorMessage(null)
    
    try {
      const [salesRes, clientsRes, piecesRes, installmentsRes, paymentsRes, usersRes] = await retryWithBackoff(
        async () => {
          return await Promise.all([
        supabase.from('sales').select('*, contract_editor:contract_editors(*)').order('sale_date', { ascending: false }),
        supabase.from('clients').select('*').order('name'),
        supabase.from('land_pieces').select('*, land_batch:land_batches(name)'),
        supabase.from('installments').select('*').order('due_date'),
        supabase.from('payments').select('*').order('payment_date', { ascending: false }),
        supabase.from('users').select('id, name, email').order('name'), // Fetch users for tracking
      ])
        },
        {
          maxRetries: 3,
          timeout: 10000,
          onRetry: (attempt) => {
            console.log(`Retrying sales data fetch (attempt ${attempt})...`)
          },
        }
      )

      setSales((salesRes.data || []) as Sale[])
      setClients((clientsRes.data || []) as Client[])
      setPieces((piecesRes.data || []) as any[])
      setInstallments((installmentsRes.data || []) as Installment[])
      setPayments((paymentsRes.data || []) as any[])
      setUsers((usersRes.data || []) as any[])
    } catch (error) {
      const err = error as Error
      console.error('Sales fetch error:', err)
      
      if (isRetryableError(err)) {
        setErrorMessage('فشل الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مرة أخرى.')
      } else if (err.message.includes('timeout')) {
        setErrorMessage('انتهت مهلة الاتصال. يرجى المحاولة مرة أخرى.')
      } else {
        setErrorMessage('خطأ في تحميل البيانات. يرجى المحاولة مرة أخرى.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Transform sales data to per-piece format
  const pieceSales = useMemo((): PieceSale[] => {
    const result: PieceSale[] = []
    
    sales.forEach(sale => {
      const client = clients.find(c => c.id === sale.client_id)
      const saleInstallments = installments.filter(i => i.sale_id === sale.id)
      const salePayments = payments.filter(p => p.sale_id === sale.id)
      
      // Check if sale is reset (has been reset back to confirmation page)
      // Reset sales have: status = 'Pending', big_advance_amount = 0/null, company_fee_amount = null/0, small_advance_amount = 0/null
      const isReset = sale.status === 'Pending' &&
                     (sale.big_advance_amount === 0 || sale.big_advance_amount === null) &&
                     (!sale.company_fee_amount || sale.company_fee_amount === 0) &&
                     (!sale.small_advance_amount || sale.small_advance_amount === 0)
      
      // Filter out payments for reset sales - reset sales should show no payments
      const validPayments = isReset ? [] : salePayments.filter(p => p.payment_type !== 'Refund')
      
      // Calculate total paid for this sale (exclude refunds and reset sales)
      const totalPaid = validPayments.reduce((sum, p) => sum + (p.amount_paid || 0), 0)
      
      // Calculate big advance paid (BigAdvance payment type only)
      const bigAdvancePaid = validPayments
        .filter(p => p.payment_type === 'BigAdvance')
        .reduce((sum, p) => sum + (p.amount_paid || 0), 0)
      
      // Calculate reservation paid (SmallAdvance payment type only)
      const reservationPaid = validPayments
        .filter(p => p.payment_type === 'SmallAdvance')
        .reduce((sum, p) => sum + (p.amount_paid || 0), 0)
      
      // For each piece in the sale, create a separate entry
      sale.land_piece_ids.forEach((pieceId) => {
        const piece = pieces.find(p => p.id === pieceId) as any
        if (!piece) return
        
        const isInstallment = sale.payment_type === 'Installment'
        const isPromiseOfSale = sale.payment_type === 'PromiseOfSale'
        const pricePerPiece = sale.total_selling_price / sale.land_piece_ids.length
        const costPerPiece = sale.total_purchase_cost / sale.land_piece_ids.length
        const pieceCount = sale.land_piece_ids.length
        const paidPerPiece = totalPaid / pieceCount
        const bigAdvancePaidPerPiece = bigAdvancePaid / pieceCount
        const reservationPaidPerPiece = reservationPaid / pieceCount
        
        // Calculate company fee per piece
        const companyFeePerPiece = sale.company_fee_amount ? sale.company_fee_amount / sale.land_piece_ids.length : 0
        const totalPayablePerPiece = pricePerPiece + companyFeePerPiece
        
        // Determine status based on payment state
        let status: PieceSale['status'] = 'Pending'
        
        // Determine if sale is confirmed:
        // 1. If status is 'Completed', it's definitely confirmed
        // 2. If there are payments recorded (beyond just reservation), it's confirmed
        // 3. If big_advance_amount is set and there are payments, it's confirmed
        // 4. Check is_confirmed field if it exists
        const hasPayments = totalPaid > reservationPaid
        const hasBigAdvance = sale.big_advance_amount > 0 && bigAdvancePaid > 0
        const isConfirmed = sale.status === 'Completed' || 
                           hasPayments || 
                           hasBigAdvance ||
                           (sale as any).is_confirmed === true ||
                           (sale as any).big_advance_confirmed === true
        
        if (sale.status === 'Cancelled') {
          status = 'Cancelled'
        } else if (isInstallment) {
          // Installment sale: check big advance and installments
          // PRIORITY: If database says 'Completed', use that - payments may have been recorded
          if (sale.status === 'Completed') {
            status = 'Completed' // مباع - fully paid
          } else if (!isConfirmed) {
            // Not confirmed yet - always show as Pending (محجوز)
            status = 'Pending'
          } else {
            // Confirmed - check payment status
            // Big advance paid - check if all installments are paid
            const allPaid = saleInstallments.length > 0 && 
              saleInstallments.every(i => i.status === 'Paid')
            if (allPaid) {
              status = 'Completed'
            } else if (bigAdvancePaidPerPiece > 0) {
              status = 'InstallmentsOngoing' // أقساط جارية - big advance paid, installments ongoing
            } else {
              status = 'AwaitingPayment' // قيد الدفع - confirmed but waiting for big advance
            }
          }
        } else if (isPromiseOfSale) {
          // Promise of Sale: check initial payment and completion
          if (sale.status === 'Completed' || (sale as any).promise_completed) {
            status = 'Completed' // مباع - promise completed
          } else if (!isConfirmed) {
            status = 'Pending' // محجوز - not confirmed yet
          } else {
            status = 'AwaitingPayment' // قيد الدفع - confirmed but waiting for completion payment
          }
        } else {
          // Full payment sale
          if (sale.status === 'Completed') {
            status = 'Completed'
          } else if (!isConfirmed) {
            status = 'Pending' // محجوز - not confirmed yet
          } else {
            status = 'AwaitingPayment' // قيد الدفع - confirmed but waiting for payment
          }
        }
        
        // Calculate remaining amount: Total Payable - Total Paid
        // If status is 'Completed', remaining should be 0
        let remainingPerPiece = 0
        if (status === 'Completed') {
          remainingPerPiece = 0 // مباع - fully paid, no remaining
        } else {
          // For ALL sales (installment, full, or promise of sale): Remaining = Total Payable - Total Paid
          // Total Paid includes: العربون (SmallAdvance) + التسبقة (BigAdvance) + Full + Partial + InitialPayment + Field + installments
          // This ensures the correct calculation regardless of how installments were created
          remainingPerPiece = Math.max(0, totalPayablePerPiece - paidPerPiece)
        }
        
        result.push({
          id: `${sale.id}-${pieceId}`,
          saleId: sale.id,
          pieceId,
          pieceName: `#${piece.piece_number}`,
          batchName: piece.land_batch?.name || '',
          surfaceArea: piece.surface_area,
          clientId: sale.client_id,
          clientName: client?.name || t('sales.unknown'),
          paymentType: isInstallment ? 'Installment' : isPromiseOfSale ? 'PromiseOfSale' : 'Full',
          price: pricePerPiece,
          cost: costPerPiece,
          profit: pricePerPiece - costPerPiece,
          saleDate: sale.sale_date,
          createdAt: sale.created_at,
          updatedAt: sale.updated_at || null,
          deadlineDate: sale.deadline_date || null,
          reservationAmount: reservationPaidPerPiece > 0 ? reservationPaidPerPiece : (sale.small_advance_amount || 0) / sale.land_piece_ids.length,
          companyFeePercentage: sale.company_fee_percentage,
          companyFeeAmount: sale.company_fee_amount ? sale.company_fee_amount / sale.land_piece_ids.length : null,
          remainingAmount: remainingPerPiece, // Add remaining amount
          fullPaymentConfirmed: sale.status === 'Completed',
          numberOfInstallments: sale.number_of_installments,
          bigAdvanceAmount: bigAdvancePaidPerPiece > 0 ? bigAdvancePaidPerPiece : (sale.big_advance_amount || 0) / sale.land_piece_ids.length,
          bigAdvanceConfirmed: bigAdvancePaidPerPiece > 0 || (sale as any).big_advance_confirmed || false,
          bigAdvanceDueDate: (sale as any).big_advance_due_date,
          monthlyInstallmentAmount: sale.monthly_installment_amount 
            ? sale.monthly_installment_amount / sale.land_piece_ids.length 
            : null,
          installmentStartDate: sale.installment_start_date,
          installmentsData: saleInstallments,
          status,
        })
      })
    })
    
    return result
  }, [sales, clients, pieces, installments, payments])

  // Separate full payment and installment sales (exclude cancelled)
  const fullPaymentSales = pieceSales.filter(s => s.paymentType === 'Full' && s.status !== 'Cancelled')
  const installmentSales = pieceSales.filter(s => s.paymentType === 'Installment' && s.status !== 'Cancelled')
  const _cancelledSales = pieceSales.filter(s => s.status === 'Cancelled')

  // Filtered and sorted sales for display
  const filteredAndSortedSales = useMemo(() => {
    let filtered = pieceSales.filter(s => s.status !== 'Cancelled')

    // Apply time period filter
    if (selectedDate) {
      // Specific date filter
      const filterDate = new Date(selectedDate)
      filterDate.setHours(0, 0, 0, 0)
      const nextDay = new Date(filterDate)
      nextDay.setDate(nextDay.getDate() + 1)
      
      filtered = filtered.filter(sale => {
        const saleDate = new Date(sale.createdAt || sale.saleDate)
        saleDate.setHours(0, 0, 0, 0)
        return saleDate >= filterDate && saleDate < nextDay
      })
    } else if (timePeriodFilter !== 'all') {
      const now = new Date()
      const filterDate = new Date()
      
      switch (timePeriodFilter) {
        case 'day':
          filterDate.setHours(0, 0, 0, 0)
          break
        case 'week':
          filterDate.setDate(now.getDate() - 7)
          filterDate.setHours(0, 0, 0, 0)
          break
        case 'month':
          filterDate.setMonth(now.getMonth() - 1)
          filterDate.setHours(0, 0, 0, 0)
          break
      }
      
      filtered = filtered.filter(sale => {
        const saleDate = new Date(sale.createdAt || sale.saleDate)
        return saleDate >= filterDate
      })
    }

    // Apply other filters
    if (statusFilter !== 'all') {
      if (statusFilter === 'Reserved') {
        filtered = filtered.filter(s => s.status === 'Pending' && !(s as any).is_confirmed)
      } else if (statusFilter === 'Installment') {
        filtered = filtered.filter(s => s.paymentType === 'Installment' && s.status !== 'Completed')
      } else if (statusFilter === 'Full') {
        filtered = filtered.filter(s => s.paymentType === 'Full' && s.status !== 'Completed')
      } else if (statusFilter === 'Completed') {
        filtered = filtered.filter(s => s.status === 'Completed')
      }
    }

    if (paymentTypeFilter !== 'all') {
      filtered = filtered.filter(s => s.paymentType === paymentTypeFilter)
    }

    if (clientFilter) {
      const searchLower = clientFilter.toLowerCase()
      filtered = filtered.filter(s => 
        s.clientName.toLowerCase().includes(searchLower)
      )
    }

    if (landBatchFilter !== 'all') {
      filtered = filtered.filter(s => s.batchName === landBatchFilter)
    }

    if (landPieceSearch) {
      const searchLower = landPieceSearch.toLowerCase()
      filtered = filtered.filter(s => 
        s.pieceName.toLowerCase().includes(searchLower) ||
        s.batchName.toLowerCase().includes(searchLower)
      )
    }

    // Sort - default to newest first (DESC by sale_date, then created_at)
    filtered = [...filtered].sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'date':
          // Primary sort by sale_date
          comparison = new Date(a.saleDate).getTime() - new Date(b.saleDate).getTime()
          // If sale dates are equal, sort by created_at (newest first)
          if (comparison === 0 && a.createdAt && b.createdAt) {
            comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          }
          break
        case 'client':
          comparison = a.clientName.localeCompare(b.clientName)
          break
        case 'price':
          comparison = a.price - b.price
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
      }
      return sortOrder === 'asc' ? comparison : -comparison
    })

    return filtered
  }, [pieceSales, sortBy, sortOrder, timePeriodFilter, selectedDate, statusFilter, paymentTypeFilter, clientFilter, landBatchFilter, landPieceSearch])


  // Calculate monthly summary per client
  const clientMonthlySummary = useMemo((): ClientMonthlySummary[] => {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    
    const summaryMap = new Map<string, ClientMonthlySummary>()
    const processedSaleIds = new Set<string>() // Track processed sales to avoid double-counting
    
    installmentSales.forEach(sale => {
      if (!sale.bigAdvanceConfirmed || !sale.monthlyInstallmentAmount) return
      
      if (!summaryMap.has(sale.clientId)) {
        summaryMap.set(sale.clientId, {
          clientId: sale.clientId,
          clientName: sale.clientName,
          totalDueThisMonth: 0,
          overdueAmount: 0,
          piecesCount: 0,
        })
      }
      
      const summary = summaryMap.get(sale.clientId)!
      summary.piecesCount++
      
      // Only count installments once per sale (avoid double-counting for multi-piece sales)
      if (!processedSaleIds.has(sale.saleId)) {
        processedSaleIds.add(sale.saleId)
        
        // Check installments due this month
        sale.installmentsData.forEach(inst => {
          const dueDate = new Date(inst.due_date)
          if (dueDate.getMonth() === currentMonth && dueDate.getFullYear() === currentYear) {
            const remaining = inst.amount_due - inst.amount_paid
            if (remaining > 0) {
              summary.totalDueThisMonth += remaining
            }
          }
          // Check overdue
          if (dueDate < now && inst.status !== 'Paid') {
            summary.overdueAmount += inst.amount_due - inst.amount_paid
          }
        })
      }
    })
    
    return Array.from(summaryMap.values()).filter(s => s.totalDueThisMonth > 0 || s.overdueAmount > 0)
  }, [installmentSales])

  // New sale functionality removed - sales are now created from /land page

  // Confirm full payment - for a single piece only
  const confirmFullPayment = async () => {
    if (!selectedSale) return
    
    // Client-side authorization check (UI only)
    if (!hasPermission('edit_sales')) {
      setErrorMessage('ليس لديك صلاحية لتعديل المبيعات')
      return
    }
    
    // Server-side authorization validation (prevents bypass)
    try {
      const hasServerPermission = await validatePermissionServerSide('edit_sales')
      if (!hasServerPermission) {
        setErrorMessage('ليس لديك صلاحية لتعديل المبيعات')
        return
      }
    } catch (error) {
      console.error('Error validating permission:', error)
      setErrorMessage('خطأ في التحقق من الصلاحيات')
      return
    }
    
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      // Get the original sale
      const { data: saleData } = await supabase
        .from('sales')
        .select('*')
        .eq('id', selectedSale.saleId)
        .single()

      if (!saleData) throw new Error('Sale not found')

      const sale = saleData as Sale
      const pieceCount = sale.land_piece_ids.length

      // If this sale has multiple pieces, split it - create a new sale for this piece
      if (pieceCount > 1) {
        // Calculate per-piece values
        const pricePerPiece = sale.total_selling_price / pieceCount
        const costPerPiece = sale.total_purchase_cost / pieceCount
        const profitPerPiece = sale.profit_margin / pieceCount
        const reservationPerPiece = ((sale as any).small_advance_amount || 0) / pieceCount

        // Create a new sale for just this piece
        const { data: newSale, error: newSaleError } = await supabase
          .from('sales')
          .insert([{
            client_id: sale.client_id,
            land_piece_ids: [selectedSale.pieceId],
            payment_type: sale.payment_type,
            total_purchase_cost: costPerPiece,
            total_selling_price: pricePerPiece,
            profit_margin: profitPerPiece,
            small_advance_amount: reservationPerPiece,
            big_advance_amount: 0,
            number_of_installments: null,
            monthly_installment_amount: null,
            status: 'Completed',
            sale_date: sale.sale_date,
            notes: sale.notes,
          }] as any)
          .select()
          .single()

        if (newSaleError) throw newSaleError

        // Update the piece status
        await supabase
          .from('land_pieces')
          .update({ status: 'Sold' } as any)
          .eq('id', selectedSale.pieceId)

        // Record payment for this piece
        await supabase.from('payments').insert([{
          client_id: selectedSale.clientId,
          sale_id: newSale.id,
          amount_paid: pricePerPiece,
          payment_type: 'Full',
          payment_date: new Date().toISOString().split('T')[0],
          recorded_by: user?.id || null,
        }] as any)

        // Update the original sale - remove this piece and recalculate
        const remainingPieces = sale.land_piece_ids.filter(id => id !== selectedSale.pieceId)
        const remainingCount = remainingPieces.length
        const remainingPrice = sale.total_selling_price - pricePerPiece
        const remainingCost = sale.total_purchase_cost - costPerPiece
        const remainingProfit = sale.profit_margin - profitPerPiece
        const remainingReservation = ((sale as any).small_advance_amount || 0) - reservationPerPiece

        await supabase
          .from('sales')
          .update({
            land_piece_ids: remainingPieces,
            total_selling_price: remainingPrice,
            total_purchase_cost: remainingCost,
            profit_margin: remainingProfit,
            small_advance_amount: remainingReservation,
            big_advance_amount: sale.big_advance_amount ? (sale.big_advance_amount * remainingCount / pieceCount) : 0,
            monthly_installment_amount: sale.monthly_installment_amount ? (sale.monthly_installment_amount * remainingCount / pieceCount) : null,
          } as any)
          .eq('id', selectedSale.saleId)

        // If there are installments, we need to update them too
        if (sale.payment_type === 'Installment') {
          const { data: existingInstallments } = await supabase
            .from('installments')
            .select('*')
            .eq('sale_id', sale.id)

          if (existingInstallments && existingInstallments.length > 0) {
            // Update existing installments to reflect remaining pieces
            for (const inst of existingInstallments) {
              await supabase
                .from('installments')
                .update({
                  amount_due: (inst.amount_due as number) * remainingCount / pieceCount,
                  amount_paid: (inst.amount_paid as number) * remainingCount / pieceCount,
                  stacked_amount: (inst.stacked_amount as number) * remainingCount / pieceCount,
                } as any)
                .eq('id', inst.id)
            }
          }
        }
      } else {
        // Single piece sale - update sale and piece
        // Calculate company fee if enabled
        const feePercentage = applyCompanyFee ? parseFloat(companyFeePercentage) || 2 : 0
        const companyFee = applyCompanyFee ? parseFloat(((selectedSale.price * feePercentage) / 100).toFixed(2)) : 0
        
        await supabase
          .from('sales')
          .update({
            status: 'Completed',
            company_fee_percentage: applyCompanyFee ? feePercentage : null,
            company_fee_amount: applyCompanyFee ? companyFee : null,
          } as any)
          .eq('id', selectedSale.saleId)

        await supabase
          .from('land_pieces')
          .update({ status: 'Sold' } as any)
          .eq('id', selectedSale.pieceId)

        await supabase.from('payments').insert([{
          client_id: selectedSale.clientId,
          sale_id: selectedSale.saleId,
          amount_paid: selectedSale.price,
          payment_type: 'Full',
          payment_date: new Date().toISOString().split('T')[0],
          recorded_by: user?.id || null,
        }] as any)
      }

      setConfirmFullOpen(false)
      setSelectedSale(null)
      fetchData()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage('خطأ في تأكيد الدفع. يرجى المحاولة مرة أخرى.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Confirm big advance - for a single piece only
  const confirmBigAdvance = async () => {
    if (!selectedSale || !installmentStartDate || !bigAdvancePaidAmount || !numberOfInstallments) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة (عدد الأشهر، مبلغ الدفعة، تاريخ أول قسط)')
      return
    }
    
    // Client-side authorization check (UI only)
    if (!hasPermission('edit_sales')) {
      setErrorMessage('ليس لديك صلاحية لتعديل المبيعات')
      return
    }
    
    // Server-side authorization validation (prevents bypass)
    try {
      const hasServerPermission = await validatePermissionServerSide('edit_sales')
      if (!hasServerPermission) {
        setErrorMessage('ليس لديك صلاحية لتعديل المبيعات')
        return
      }
    } catch (error) {
      console.error('Error validating permission:', error)
      setErrorMessage('خطأ في التحقق من الصلاحيات')
      return
    }
    
    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const { data: saleData } = await supabase
        .from('sales')
        .select('*')
        .eq('id', selectedSale.saleId)
        .single()

      if (!saleData) throw new Error('Sale not found')

      const sale = saleData as Sale
      const numInstallments = parseInt(numberOfInstallments) || 12
      const bigAdvPaid = parseFloat(bigAdvancePaidAmount)
      
      const pieceCount = sale.land_piece_ids.length
      const pricePerPiece = sale.total_selling_price / pieceCount
      const reservationPerPiece = ((sale as any).small_advance_amount || 0) / pieceCount
      // عربون is part of advance payment, so remaining = price - (bigAdvance + reservation)
      const totalAdvance = bigAdvPaid + reservationPerPiece
      const remaining = pricePerPiece - totalAdvance
      const monthlyAmount = remaining / numInstallments

      // If this sale has multiple pieces, split it - create a new sale for this piece
      if (pieceCount > 1) {
        const costPerPiece = sale.total_purchase_cost / pieceCount
        const profitPerPiece = sale.profit_margin / pieceCount

        // Create a new sale for just this piece
        const { data: newSale, error: newSaleError } = await supabase
          .from('sales')
          .insert([{
            client_id: sale.client_id,
            land_piece_ids: [selectedSale.pieceId],
            payment_type: 'Installment',
            total_purchase_cost: costPerPiece,
            total_selling_price: pricePerPiece,
            profit_margin: profitPerPiece,
            small_advance_amount: reservationPerPiece,
            big_advance_amount: totalAdvance, // Include reservation in big advance
            number_of_installments: numInstallments,
            monthly_installment_amount: monthlyAmount,
            installment_start_date: installmentStartDate,
            status: 'Pending', // Use 'Pending' for ongoing installments (database enum doesn't have 'InstallmentsOngoing')
            sale_date: sale.sale_date,
            notes: sale.notes,
          }] as any)
          .select()
          .single()

        if (newSaleError) throw newSaleError

        // Update the piece status
        await supabase
          .from('land_pieces')
          .update({ status: 'Sold' } as any)
          .eq('id', selectedSale.pieceId)

        // Record big advance payment for this piece (includes reservation)
        await supabase.from('payments').insert([{
          client_id: sale.client_id,
          sale_id: newSale.id,
          amount_paid: totalAdvance, // Include reservation in big advance payment
          payment_type: 'BigAdvance',
          payment_date: new Date().toISOString().split('T')[0],
          recorded_by: user?.id || null,
        }] as any)

        // Create installments for this piece
        const installmentsToCreate = []
        const startDate = new Date(installmentStartDate)
        for (let i = 0; i < numInstallments; i++) {
          const dueDate = new Date(startDate)
          dueDate.setMonth(dueDate.getMonth() + i)
          installmentsToCreate.push({
            sale_id: newSale.id,
            installment_number: i + 1,
            amount_due: monthlyAmount,
            amount_paid: 0,
            stacked_amount: 0,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'Unpaid',
          })
        }
        await supabase.from('installments').insert(installmentsToCreate as any)

        // Update the original sale - remove this piece and recalculate
        const remainingPieces = sale.land_piece_ids.filter(id => id !== selectedSale.pieceId)
        const remainingCount = remainingPieces.length
        const remainingPrice = sale.total_selling_price - pricePerPiece
        const remainingCost = sale.total_purchase_cost - costPerPiece
        const remainingProfit = sale.profit_margin - profitPerPiece
        const remainingReservation = ((sale as any).small_advance_amount || 0) - reservationPerPiece

        await supabase
          .from('sales')
          .update({
            land_piece_ids: remainingPieces,
            total_selling_price: remainingPrice,
            total_purchase_cost: remainingCost,
            profit_margin: remainingProfit,
            small_advance_amount: remainingReservation,
            big_advance_amount: sale.big_advance_amount ? (sale.big_advance_amount * remainingCount / pieceCount) : 0,
            monthly_installment_amount: sale.monthly_installment_amount ? (sale.monthly_installment_amount * remainingCount / pieceCount) : null,
          } as any)
          .eq('id', selectedSale.saleId)

        // Update existing installments to reflect remaining pieces
        const { data: existingInstallments } = await supabase
          .from('installments')
          .select('*')
          .eq('sale_id', sale.id)

        if (existingInstallments && existingInstallments.length > 0) {
          for (const inst of existingInstallments) {
            await supabase
              .from('installments')
              .update({
                amount_due: (inst.amount_due as number) * remainingCount / pieceCount,
                amount_paid: (inst.amount_paid as number) * remainingCount / pieceCount,
                stacked_amount: (inst.stacked_amount as number) * remainingCount / pieceCount,
              } as any)
              .eq('id', inst.id)
          }
        }
      } else {
        // Single piece sale - standard flow
        // Calculate company fee if enabled
        const feePercentage = applyCompanyFee ? parseFloat(companyFeePercentage) || 2 : 0
        const companyFee = applyCompanyFee ? parseFloat(((selectedSale.price * feePercentage) / 100).toFixed(2)) : 0
        
        await supabase
          .from('sales')
          .update({
            big_advance_amount: bigAdvPaid, // Only the first payment amount, not including reservation
            company_fee_percentage: applyCompanyFee ? feePercentage : null,
            company_fee_amount: applyCompanyFee ? companyFee : null,
            number_of_installments: numInstallments,
            monthly_installment_amount: monthlyAmount,
            installment_start_date: installmentStartDate,
            status: 'AwaitingPayment', // Use 'AwaitingPayment' for ongoing installments
          } as any)
          .eq('id', selectedSale.saleId)

        await supabase
          .from('land_pieces')
          .update({ status: 'Sold' } as any)
          .eq('id', selectedSale.pieceId)

        await supabase.from('payments').insert([{
          client_id: sale.client_id,
          sale_id: sale.id,
          amount_paid: totalAdvance, // Include reservation in big advance payment
          payment_type: 'BigAdvance',
          payment_date: new Date().toISOString().split('T')[0],
          recorded_by: user?.id || null,
        }] as any)

        const installmentsToCreate = []
        const startDate = new Date(installmentStartDate)
        for (let i = 0; i < numInstallments; i++) {
          const dueDate = new Date(startDate)
          dueDate.setMonth(dueDate.getMonth() + i)
          installmentsToCreate.push({
            sale_id: sale.id,
            installment_number: i + 1,
            amount_due: monthlyAmount,
            amount_paid: 0,
            stacked_amount: 0,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'Unpaid',
          })
        }
        await supabase.from('installments').insert(installmentsToCreate as any)
      }

      setConfirmBigAdvanceOpen(false)
      setSelectedSale(null)
      setInstallmentStartDate('')
      setBigAdvancePaidAmount('')
      setBigAdvancePaidDate(new Date().toISOString().split('T')[0])
      fetchData()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage('خطأ في تأكيد التسبقة. يرجى المحاولة مرة أخرى.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Cancel sale - removes all related data
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [saleToCancel, setSaleToCancel] = useState<PieceSale | null>(null)
  const [refundAmount, setRefundAmount] = useState('')

  // Check how many pieces are in a sale
  const [salePieceCount, setSalePieceCount] = useState(1)

  const openCancelDialog = async (sale: PieceSale) => {
    setSaleToCancel(sale)
    setRefundAmount('')
    
    // Check if this sale has multiple pieces
    const { data } = await supabase
      .from('sales')
      .select('land_piece_ids')
      .eq('id', sale.saleId)
      .single()
    
    if (data) {
      setSalePieceCount((data as any).land_piece_ids?.length || 1)
    }
    
    setCancelDialogOpen(true)
  }

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)

  const cancelSale = async () => {
    if (!saleToCancel) return
    
    // Client-side authorization check (UI only)
    if (!hasPermission('edit_sales')) {
      setErrorMessage('ليس لديك صلاحية لتعديل المبيعات')
      return
    }

    // Server-side authorization validation (prevents bypass)
    try {
      const hasServerPermission = await validatePermissionServerSide('edit_sales')
      if (!hasServerPermission) {
        setErrorMessage('ليس لديك صلاحية لتعديل المبيعات')
        return
      }
    } catch (error) {
      console.error('Error validating permission:', error)
      setErrorMessage('خطأ في التحقق من الصلاحيات')
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)
    try {
      const saleId = saleToCancel.saleId
      const refund = parseFloat(refundAmount) || 0

      // Get the original sale
      const { data: saleData } = await supabase
        .from('sales')
        .select('*')
        .eq('id', saleId)
        .single()

      if (!saleData) throw new Error('Sale not found')

      const sale = saleData as Sale
      const pieceCount = sale.land_piece_ids.length

      // If this sale has multiple pieces, remove only this piece
      if (pieceCount > 1) {
        // Calculate per-piece values
        const pricePerPiece = sale.total_selling_price / pieceCount
        const costPerPiece = sale.total_purchase_cost / pieceCount
        const profitPerPiece = sale.profit_margin / pieceCount
        const reservationPerPiece = ((sale as any).small_advance_amount || 0) / pieceCount

        // Get payments and installments for this sale
        const { data: payments } = await supabase
          .from('payments')
          .select('*')
          .eq('sale_id', saleId)

        const { data: installments } = await supabase
          .from('installments')
          .select('*')
          .eq('sale_id', saleId)

        // Delete payments related to this piece (proportional)
        if (payments && payments.length > 0) {
          for (const payment of payments) {
            const piecePaymentAmount = payment.amount_paid / pieceCount
            if (piecePaymentAmount > 0) {
              // Update payment to reflect remaining pieces
              await supabase
                .from('payments')
                .update({ amount_paid: payment.amount_paid - piecePaymentAmount } as any)
                .eq('id', payment.id)
            }
          }
        }

        // Delete installments related to this piece (proportional)
        if (installments && installments.length > 0) {
          for (const inst of installments) {
            const pieceAmount = (inst.amount_due as number) / pieceCount
            const piecePaid = (inst.amount_paid as number) / pieceCount
            const pieceStacked = (inst.stacked_amount as number) / pieceCount

            // Update installment to reflect remaining pieces
            await supabase
              .from('installments')
              .update({
                amount_due: (inst.amount_due as number) - pieceAmount,
                amount_paid: (inst.amount_paid as number) - piecePaid,
                stacked_amount: (inst.stacked_amount as number) - pieceStacked,
              } as any)
              .eq('id', inst.id)
          }
        }

        // If refund amount specified, record it
        if (refund > 0) {
          await supabase.from('payments').insert([{
            client_id: saleToCancel.clientId,
            sale_id: saleId,
            amount_paid: refund,
            payment_type: 'Refund',
            payment_date: new Date().toISOString().split('T')[0],
            recorded_by: user?.id || null,
          }] as any)
        }

        // Update only this specific piece back to Available
        await supabase
          .from('land_pieces')
          .update({ status: 'Available' } as any)
          .eq('id', saleToCancel.pieceId)

        // Update the original sale - remove this piece and recalculate
        const remainingPieces = sale.land_piece_ids.filter(id => id !== saleToCancel.pieceId)
        const remainingCount = remainingPieces.length
        const remainingPrice = sale.total_selling_price - pricePerPiece
        const remainingCost = sale.total_purchase_cost - costPerPiece
        const remainingProfit = sale.profit_margin - profitPerPiece
        const remainingReservation = ((sale as any).small_advance_amount || 0) - reservationPerPiece

        await supabase
          .from('sales')
          .update({
            land_piece_ids: remainingPieces,
            total_selling_price: remainingPrice,
            total_purchase_cost: remainingCost,
            profit_margin: remainingProfit,
            small_advance_amount: remainingReservation,
            big_advance_amount: sale.big_advance_amount ? (sale.big_advance_amount * remainingCount / pieceCount) : 0,
            monthly_installment_amount: sale.monthly_installment_amount ? (sale.monthly_installment_amount * remainingCount / pieceCount) : null,
          } as any)
          .eq('id', saleId)
      } else {
        // Single piece sale - cancel the entire sale
        // 1. Delete all installments for this sale
        await supabase
          .from('installments')
          .delete()
          .eq('sale_id', saleId)

        // 2. Delete all payments for this sale
        await supabase
          .from('payments')
          .delete()
          .eq('sale_id', saleId)

        // 3. If refund amount specified, record it
        if (refund > 0) {
          await supabase.from('payments').insert([{
            client_id: saleToCancel.clientId,
            sale_id: saleId,
            amount_paid: refund,
            payment_type: 'Refund',
            payment_date: new Date().toISOString().split('T')[0],
            recorded_by: user?.id || null,
          }] as any)
        }

        // 4. Update land piece back to Available - CRITICAL: Must be done before sale update
        const { error: pieceError } = await supabase
          .from('land_pieces')
          .update({ status: 'Available' } as any)
          .eq('id', saleToCancel.pieceId)

        if (pieceError) {
          throw pieceError
        }

        // 5. Cancel the entire sale (single piece sale)
        await supabase
          .from('sales')
          .update({ status: 'Cancelled' } as any)
          .eq('id', saleId)
      }

      setCancelDialogOpen(false)
      setSaleToCancel(null)
      setRefundAmount('')
      
      // Force refresh of pieces to ensure cancelled piece shows as available
      await fetchData()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage('خطأ في إلغاء البيع. يرجى المحاولة مرة أخرى.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Error Message */}
      {errorMessage && (
        <Card className="bg-destructive/10 border-destructive/20">
          <CardContent className="p-3">
            <p className="text-destructive text-sm">{errorMessage}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setErrorMessage(null)}
              className="mt-2"
            >
              إغلاق
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">السجل</h1>
      </div>

      {/* Time Period Filter */}
      <div className="flex flex-wrap items-center gap-2">
        <Label className="text-sm font-medium">الفترة الزمنية:</Label>
        <div className="flex gap-2 flex-wrap">
          <Button 
            variant={timePeriodFilter === 'all' && !selectedDate ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setTimePeriodFilter('all')
              setSelectedDate('')
            }}
          >
            الكل
          </Button>
          <Button
            variant={timePeriodFilter === 'day' && !selectedDate ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setTimePeriodFilter('day')
              setSelectedDate('')
            }}
          >
            اليوم
          </Button>
          <Button
            variant={timePeriodFilter === 'week' && !selectedDate ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setTimePeriodFilter('week')
              setSelectedDate('')
            }}
          >
            الأسبوع
          </Button>
          <Button
            variant={timePeriodFilter === 'month' && !selectedDate ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setTimePeriodFilter('month')
              setSelectedDate('')
            }}
          >
            الشهر
          </Button>
          <div className="flex items-center gap-2 border rounded-md px-2 min-w-[140px]">
            <Calendar className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <Input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value)
                if (e.target.value) {
                  setTimePeriodFilter('all')
                }
              }}
              onClick={(e) => {
                e.stopPropagation()
                // For mobile, trigger the native date picker
                if (e.currentTarget.showPicker) {
                  e.currentTarget.showPicker()
                }
              }}
              onTouchStart={(e) => {
                e.stopPropagation()
                // For mobile touch, ensure the input is focusable
                e.currentTarget.focus()
              }}
              className="h-8 w-full min-w-[120px] text-xs border-0 focus-visible:ring-0 p-0 cursor-pointer touch-manipulation"
              style={{ 
                WebkitAppearance: 'none',
                touchAction: 'manipulation',
                minHeight: '32px',
                fontSize: '14px'
              }}
            />
            {selectedDate && (
            <Button
                variant="ghost"
              size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedDate('')
                  setTimePeriodFilter('all')
                }}
                className="h-6 w-6 p-0 flex-shrink-0"
            >
                <X className="h-3 w-3" />
            </Button>
        )}
          </div>
        </div>
      </div>

      {/* Compact Stats - Inline */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
        <span className="text-muted-foreground">{t('sales.total')}: <strong className="text-blue-600">{filteredAndSortedSales.length}</strong></span>
        <span className="text-muted-foreground">{t('sales.sold')}: <strong className="text-green-600">{filteredAndSortedSales.filter(s => s.status === 'Completed').length}</strong></span>
        <span className="text-muted-foreground">{t('sales.full')}: <strong className="text-blue-600">{filteredAndSortedSales.filter(s => s.paymentType === 'Full' && s.status !== 'Completed').length}</strong></span>
        <span className="text-muted-foreground">{t('sales.installment')}: <strong className="text-purple-600">{filteredAndSortedSales.filter(s => s.paymentType === 'Installment' && s.status !== 'Completed').length}</strong></span>
        <span className="text-muted-foreground">{t('sales.reserved')}: <strong className="text-orange-600">{filteredAndSortedSales.filter(s => s.status === 'Pending' && !(s as any).is_confirmed).length}</strong></span>
      </div>


      {/* Mobile Card View / Desktop Table View */}
      {filteredAndSortedSales.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">لا توجد مبيعات</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="space-y-3 md:hidden">
            {filteredAndSortedSales.map(sale => {
              const salePayments = payments.filter(p => p.sale_id === sale.saleId && p.payment_type === 'BigAdvance')
              const bigAdvancePaid = sale.paymentType === 'Installment' 
                ? salePayments.reduce((sum, p) => sum + (p.amount_paid || 0), 0) / (sales.find(s => s.id === sale.saleId)?.land_piece_ids.length || 1)
                : 0
              const saleData = sales.find(s => s.id === sale.saleId)
              const createdByUser = saleData?.created_by ? users.find(u => u.id === saleData.created_by) : null
              const confirmedByUser = (saleData as any)?.confirmed_by ? users.find(u => u.id === (saleData as any).confirmed_by) : null
              
              return (
                <Card 
                  key={sale.id} 
                  className="hover:shadow-lg transition-all cursor-pointer border-2 hover:border-primary/50"
                  onClick={() => {
                    setSelectedSaleForDetails(sale)
                    setSaleDetailsOpen(true)
                  }}
                >
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0 flex items-start gap-2">
                          {/* Status Dot */}
                          <div className="mt-1 flex-shrink-0">
                            {(() => {
                              const isCompleted = sale.status === 'Completed' || (sale as any).status === 'Completed'
                              const isConfirmed = sale.bigAdvanceConfirmed || sale.fullPaymentConfirmed || (sale as any).is_confirmed
                              const isPending = sale.status === 'Pending' && !isConfirmed
                              
                              if (isCompleted) {
                                return <div className="w-3 h-3 rounded-full bg-green-500" title="مباع" />
                              } else if (isConfirmed) {
                                return <div className="w-3 h-3 rounded-full bg-orange-500" title="مؤكد" />
                              } else {
                                return <div className="w-3 h-3 rounded-full bg-red-500" title="في انتظار التأكيد" />
                              }
                            })()}
                          </div>
                        <div className="flex-1 min-w-0">
                          <button 
                            onClick={() => {
                              const client = clients.find(c => c.id === sale.clientId)
                              if (client) openClientDetails(client)
                            }}
                            className="font-semibold text-sm text-primary hover:underline"
                          >
                            {sale.clientName}
                          </button>
                          <div className="text-xs text-muted-foreground mt-1">
                            {sale.batchName} - {sale.pieceName} • {sale.surfaceArea} م²
                            </div>
                          </div>
                        </div>
                        <Badge 
                          variant={
                            sale.status === 'Completed' ? 'success' :
                            sale.status === 'InstallmentsOngoing' ? 'secondary' :
                            sale.status === 'AwaitingPayment' ? 'warning' : 'destructive'
                          }
                          className="text-xs flex-shrink-0"
                        >
                          {(sale.status === 'Completed' || (sale as any).status === 'Completed') ? 'مباع' :
                           sale.paymentType === 'Installment' && (sale as any).status !== 'Completed' ? 'بالتقسيط' :
                           sale.paymentType === 'Full' && (sale as any).status !== 'Completed' ? 'بالحاضر' :
                           sale.status === 'Pending' && !(sale as any).is_confirmed ? 'محجوز' :
                           'محجوز'}
                        </Badge>
                      </div>
                      
                      {sale.deadlineDate && sale.status !== 'Completed' && !sale.bigAdvanceConfirmed && (() => {
                        const deadline = new Date(sale.deadlineDate)
                        const today = new Date()
                        today.setHours(0, 0, 0, 0)
                        deadline.setHours(0, 0, 0, 0)
                        const daysUntil = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                        const isExpired = daysUntil <= 0
                        const isApproaching = daysUntil > 0 && daysUntil <= 3
                        
                        return (
                          <div className={`text-xs p-2 rounded ${
                            isExpired ? 'bg-red-50 text-red-700 border border-red-200' : 
                            isApproaching ? 'bg-orange-50 text-orange-700 border border-orange-200' : 
                            'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}>
                            {isExpired ? `⚠ انتهى الموعد النهائي (${daysUntil === 0 ? 'اليوم' : Math.abs(daysUntil) + ' يوم مضى'})` :
                             isApproaching ? `⚠ الموعد النهائي قريب (${daysUntil} يوم)` :
                             `آخر أجل: ${formatDate(sale.deadlineDate)}`}
                          </div>
                        )
                      })()}
                      
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">{t('sales.type')}:</span>
                          <Badge variant={sale.paymentType === 'Full' ? 'success' : 'secondary'} className="text-xs ml-1">
                            {sale.paymentType === 'Full' ? t('sales.full') : t('sales.installment')}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('sales.price')}:</span>
                          <span className="font-medium ml-1">{formatCurrency(sale.price)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t('sales.reservation')}:</span>
                          <span className="font-medium text-green-600 ml-1">{formatCurrency(sale.reservationAmount)}</span>
                        </div>
                        {sale.paymentType === 'Installment' && (
                          <div>
                            <span className="text-muted-foreground">{t('sales.firstPayment')}:</span>
                            <span className="font-medium text-blue-600 ml-1">{formatCurrency(bigAdvancePaid)}</span>
                          </div>
                        )}
                        <div className="col-span-2">
                          <span className="text-muted-foreground">{t('sales.remaining')}:</span>
                          <span className="font-medium ml-1">{formatCurrency((sale as any).remainingAmount ?? sale.price)}</span>
                        </div>
                      </div>
                      
                      {sale.companyFeeAmount && sale.companyFeeAmount > 0 && (
                        <div className="text-xs bg-blue-50 p-2 rounded border border-blue-200">
                          <span className="text-blue-700">{t('sales.companyFee')}: {formatCurrency(sale.companyFeeAmount)}</span>
                        </div>
                      )}
                      
                      {/* Seller Account Name */}
                      {(confirmedByUser || createdByUser) && (
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                          <div className="font-medium">{t('sales.seller')}:</div>
                          <div className="text-blue-600">{confirmedByUser?.name || createdByUser?.name || t('sales.unknown')}</div>
                        </div>
                      )}
                      
                      {user?.role === 'Owner' && (createdByUser || confirmedByUser) && (
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                          {createdByUser && <div>{t('sales.created')}: {createdByUser.name}</div>}
                          {confirmedByUser && <div className="text-green-600">{t('sales.confirmed')}: {confirmedByUser.name}</div>}
                        </div>
                      )}
                      
                      {/* Date and Time */}
                      <div className="text-xs text-muted-foreground pt-2 border-t">
                        <div className="font-medium">{t('sales.completionDate')}:</div>
                        <div>{formatDateTime(sale.updatedAt || sale.createdAt || sale.saleDate)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Desktop Table View */}
          <Card className="hidden md:block">
          <CardContent className="p-0">
              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px] text-right">{t('sales.client')}</TableHead>
                    <TableHead className="w-[120px] text-right">{t('sales.piece')}</TableHead>
                    <TableHead className="w-[80px] text-center">{t('sales.type')}</TableHead>
                    <TableHead className="w-[100px] text-right">{t('sales.price')}</TableHead>
                    <TableHead className="w-[100px] text-right">{t('sales.reservation')}</TableHead>
                    <TableHead className="w-[120px] text-right">{t('sales.bigAdvance')}</TableHead>
                    <TableHead className="w-[100px] text-right">{t('sales.remaining')}</TableHead>
                    <TableHead className="w-[100px] text-center">{t('sales.status')}</TableHead>
                    <TableHead className="w-[180px] text-right">{t('sales.seller')}</TableHead>
                    {user?.role === 'Owner' && (
                      <TableHead className="w-[120px]">{t('sales.user')}</TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAndSortedSales.map(sale => (
                    <TableRow 
                      key={sale.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => {
                        setSelectedSaleForDetails(sale)
                        setSaleDetailsOpen(true)
                      }}
                    >
                      <TableCell className="font-medium text-right">
                        <div className="flex items-center gap-2 justify-end">
                          {/* Status Dot */}
                          {(() => {
                            const saleData = sales.find(s => s.id === sale.saleId)
                            const saleStatus = (saleData?.status as any) || sale.status
                            const isCompleted = saleStatus === 'Completed'
                            const isPending = saleStatus === 'Pending'
                            const isCancelled = saleStatus === 'Cancelled'
                            
                            if (isCompleted) {
                              return <div className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" title="مباع" />
                            } else if (isPending) {
                              return <div className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0" title="قيد الانتظار" />
                            } else if (isCancelled) {
                              return <div className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" title="ملغي" />
                            } else {
                              return <div className="w-3 h-3 rounded-full bg-yellow-500 flex-shrink-0" title="محجوز" />
                            }
                          })()}
                        <button 
                          onClick={() => {
                            const client = clients.find(c => c.id === sale.clientId)
                            if (client) openClientDetails(client)
                          }}
                          className="hover:underline text-primary font-medium"
                        >
                          {sale.clientName}
                        </button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="text-sm">
                          <div>{sale.batchName} - {sale.pieceName}</div>
                          <div className="text-xs text-muted-foreground">{sale.surfaceArea} م²</div>
                          {sale.deadlineDate && sale.status !== 'Completed' && !sale.bigAdvanceConfirmed && (() => {
                            const deadline = new Date(sale.deadlineDate)
                            const today = new Date()
                            today.setHours(0, 0, 0, 0)
                            deadline.setHours(0, 0, 0, 0)
                            const daysUntil = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                            const isExpired = daysUntil <= 0
                            const isApproaching = daysUntil > 0 && daysUntil <= 3
                            
                            return (
                              <div className={`text-xs mt-1 font-medium ${
                                isExpired ? 'text-red-600' : 
                                isApproaching ? 'text-orange-600' : 
                                'text-blue-600'
                              }`}>
                                {isExpired ? `⚠ انتهى الموعد النهائي (${daysUntil === 0 ? 'اليوم' : Math.abs(daysUntil) + ' يوم مضى'})` :
                                 isApproaching ? `⚠ الموعد النهائي قريب (${daysUntil} يوم)` :
                                 `آخر أجل: ${formatDate(sale.deadlineDate)}`}
                              </div>
                            )
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={sale.paymentType === 'Full' ? 'success' : 'secondary'} className="text-xs">
                          {sale.paymentType === 'Full' ? 'بالحاضر' : 'بالتقسيط'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(sale.price)}
                        {sale.companyFeeAmount && sale.companyFeeAmount > 0 && (
                          <div className="text-xs text-blue-600 mt-1">
                            + عمولة: {formatCurrency(sale.companyFeeAmount)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-green-600">{formatCurrency(sale.reservationAmount)}</TableCell>
                      <TableCell className="text-right font-medium text-blue-600">
                        {(() => {
                          if (sale.paymentType === 'Installment') {
                            const salePayments = payments.filter(p => p.sale_id === sale.saleId && p.payment_type === 'BigAdvance')
                            const bigAdvancePaid = salePayments.reduce((sum, p) => sum + (p.amount_paid || 0), 0) / (sales.find(s => s.id === sale.saleId)?.land_piece_ids.length || 1)
                            return formatCurrency(bigAdvancePaid > 0 ? bigAdvancePaid : 0)
                          }
                          return formatCurrency(0)
                        })()}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency((sale as any).remainingAmount ?? sale.price)}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge 
                          variant={
                            sale.status === 'Completed' ? 'success' :
                            sale.status === 'InstallmentsOngoing' ? 'secondary' :
                            sale.status === 'AwaitingPayment' ? 'warning' : 'destructive'
                          }
                          className="text-xs"
                        >
                          {(sale.status === 'Completed' || (sale as any).status === 'Completed') ? 'مباع' :
                           sale.paymentType === 'Installment' && (sale as any).status !== 'Completed' ? 'بالتقسيط' :
                           sale.paymentType === 'Full' && (sale as any).status !== 'Completed' ? 'بالحاضر' :
                           sale.status === 'Pending' && !(sale as any).is_confirmed ? 'محجوز' :
                           'محجوز'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground text-right">
                        {formatDateTime(sale.updatedAt || sale.createdAt || sale.saleDate)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {(() => {
                          const saleData = sales.find(s => s.id === sale.saleId)
                          const confirmedByUser = (saleData as any)?.confirmed_by ? users.find(u => u.id === (saleData as any).confirmed_by) : null
                          const createdByUser = saleData?.created_by ? users.find(u => u.id === saleData.created_by) : null
                          const sellerName = confirmedByUser?.name || createdByUser?.name || '-'
                          return (
                            <div>
                              <div className="font-medium text-blue-600 mb-1">البائع: {sellerName}</div>
                              {formatDateTime(sale.updatedAt || sale.createdAt || sale.saleDate)}
                            </div>
                          )
                        })()}
                      </TableCell>
                      {user?.role === 'Owner' && (() => {
                        const saleData = sales.find(s => s.id === sale.saleId)
                        const createdByUser = saleData?.created_by ? users.find(u => u.id === saleData.created_by) : null
                        const confirmedByUser = (saleData as any)?.confirmed_by ? users.find(u => u.id === (saleData as any).confirmed_by) : null
                        
                        return (
                          <TableCell className="text-xs">
                            {createdByUser && (
                              <div className="text-muted-foreground mb-1">
                                أنشأ: {createdByUser.name}
                              </div>
                            )}
                            {confirmedByUser && (
                              <div className="text-green-600 font-medium">
                                أكد: {confirmedByUser.name}
                              </div>
                            )}
                            {!createdByUser && !confirmedByUser && (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        )
                      })()}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        </>
      )}

      {/* Confirm Full Payment Dialog */}
      <Dialog open={confirmFullOpen} onOpenChange={setConfirmFullOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد بالحاضر</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-3 sm:space-y-4">
              <div className="bg-muted/50 p-3 sm:p-4 rounded-lg space-y-2 text-xs sm:text-sm">
                <p><strong>{t('sales.client')}:</strong> {selectedSale.clientName}</p>
                <p><strong>{t('sales.piece')}:</strong> {selectedSale.batchName} - {selectedSale.pieceName}</p>
                <p><strong>{t('sales.price')}:</strong> {formatCurrency(selectedSale.price)}</p>
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground">
                {t('sales.confirmFullPayment')}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmFullOpen(false)} className="w-full sm:w-auto">
              {t('sales.cancel')}
            </Button>
            <Button onClick={confirmFullPayment} disabled={isSubmitting} className="bg-green-600 w-full sm:w-auto">
              {isSubmitting ? t('sales.confirming') : t('sales.confirmPayment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Big Advance Dialog */}
      <Dialog open={confirmBigAdvanceOpen} onOpenChange={setConfirmBigAdvanceOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('sales.confirmFirstPayment')}</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-3 sm:space-y-4">
              <div className="bg-muted/50 p-3 sm:p-4 rounded-lg space-y-2 text-xs sm:text-sm">
                <p><strong>{t('sales.client')}:</strong> {selectedSale.clientName}</p>
                <p><strong>{t('sales.piece')}:</strong> {selectedSale.batchName} - {selectedSale.pieceName}</p>
                <p><strong>{t('sales.totalPrice')}:</strong> {formatCurrency(selectedSale.price)}</p>
                {selectedSale.bigAdvanceDueDate && (
                  <p><strong>{t('sales.dueDate')}:</strong> {formatDate(selectedSale.bigAdvanceDueDate)}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs sm:text-sm">عدد الأشهر</Label>
                <Input
                  type="number"
                  value={numberOfInstallments}
                  onChange={e => setNumberOfInstallments(e.target.value)}
                  placeholder="أدخل عدد الأشهر (مثال: 12)"
                  min="1"
                  max="120"
                  className="text-xs sm:text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  عدد الأشهر لسداد المبلغ المتبقي
                </p>
              </div>

              {/* Company Fee Section */}
              <div className="space-y-3 bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="applyCompanyFeeInstallment"
                    checked={applyCompanyFee}
                    onChange={(e) => setApplyCompanyFee(e.target.checked)}
                    className="rounded"
                  />
                  <Label htmlFor="applyCompanyFeeInstallment" className="font-medium cursor-pointer">
                    {t('sales.applyCompanyFee')}
                  </Label>
                </div>
                {applyCompanyFee && (
                  <div className="space-y-2 pr-6">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="companyFeePercentageInstallment" className="text-sm">{t('sales.percentage')}:</Label>
                      <Input
                        id="companyFeePercentageInstallment"
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={companyFeePercentage}
                        onChange={e => setCompanyFeePercentage(e.target.value)}
                        className="w-20"
                      />
                      <span className="text-sm">%</span>
                    </div>
                    <div className="space-y-1 text-sm border-t pt-2 mt-2">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('sales.sellingPrice')}:</span>
                        <span className="font-medium">{formatCurrency(selectedSale.price)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('sales.companyFeePercent', { percent: companyFeePercentage })}:</span>
                        <span className="font-medium text-blue-600">
                          {formatCurrency((selectedSale.price * parseFloat(companyFeePercentage || '2')) / 100)}
                        </span>
                      </div>
                      <div className="flex justify-between font-bold text-lg pt-1 border-t">
                        <span>{t('sales.totalAmountDue')}:</span>
                        <span className="text-green-600">
                          {formatCurrency(selectedSale.price + (selectedSale.price * parseFloat(companyFeePercentage || '2')) / 100)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>{t('sales.firstPaymentReceived')}</Label>
                <Input
                  type="number"
                  value={bigAdvancePaidAmount}
                  onChange={e => setBigAdvancePaidAmount(e.target.value)}
                  placeholder={t('sales.enterAmountReceived')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('sales.firstPaymentOnly')}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t('sales.firstMonthlyInstallmentDate')}</Label>
                <Input
                  type="date"
                  value={installmentStartDate}
                  onChange={e => setInstallmentStartDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t('sales.monthlyInstallmentsCalculatedFrom')}
                </p>
              </div>

              {installmentStartDate && numberOfInstallments && bigAdvancePaidAmount && (
                <div className="bg-blue-50 p-3 rounded-lg space-y-1">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-800">{t('sales.reservation')}:</span>
                      <span className="font-medium text-blue-800">{formatCurrency(selectedSale.reservationAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-800">{t('sales.firstPaymentAmount')}:</span>
                      <span className="font-medium text-blue-800">{formatCurrency(parseFloat(bigAdvancePaidAmount))}</span>
                    </div>
                    {applyCompanyFee && (
                      <div className="flex justify-between">
                        <span className="text-blue-800">{t('sales.companyFeePercent', { percent: companyFeePercentage })}:</span>
                        <span className="font-medium text-blue-800">
                          {formatCurrency((selectedSale.price * parseFloat(companyFeePercentage || '2')) / 100)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <p className="text-sm text-blue-800 font-bold">
                      <strong>{t('sales.totalFirstPayment')}:</strong>{' '}
                      {formatCurrency(
                        parseFloat(bigAdvancePaidAmount) + 
                        selectedSale.reservationAmount + 
                        (applyCompanyFee ? (selectedSale.price * parseFloat(companyFeePercentage || '2')) / 100 : 0)
                      )}
                  </p>
                  </div>
                  <div className="border-t pt-2 mt-2 space-y-1">
                  <p className="text-sm text-blue-800">
                      <strong>{t('sales.remainingAfterFirstPayment')}:</strong>{' '}
                    {formatCurrency(selectedSale.price - parseFloat(bigAdvancePaidAmount) - selectedSale.reservationAmount)}
                  </p>
                  <p className="text-sm text-blue-800">
                    <strong>{t('sales.monthlyInstallment')}:</strong>{' '}
                    {formatCurrency(
                        (selectedSale.price - parseFloat(bigAdvancePaidAmount) - selectedSale.reservationAmount) / parseInt(numberOfInstallments || '12')
                    )}
                  </p>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBigAdvanceOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={confirmBigAdvance} disabled={isSubmitting || !installmentStartDate || !bigAdvancePaidAmount || !numberOfInstallments}>
              {isSubmitting ? 'جاري التأكيد...' : 'تأكيد وإنشاء الأقساط'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Sale Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">إلغاء البيع</DialogTitle>
          </DialogHeader>
          {saleToCancel && (
            <div className="space-y-4">
              <div className="bg-destructive/10 p-4 rounded-lg space-y-2 border border-destructive/20">
                <p><strong>العميل:</strong> {saleToCancel.clientName}</p>
                <p><strong>القطعة:</strong> {saleToCancel.batchName} - {saleToCancel.pieceName}</p>
                <p><strong>السعر:</strong> {formatCurrency(saleToCancel.price)}</p>
                <p><strong>نوع الدفع:</strong> {saleToCancel.paymentType === 'Full' ? 'دفع كامل' : 'أقساط'}</p>
              </div>

              {salePieceCount > 1 && (
                <div className="bg-red-100 p-3 rounded-lg border border-red-300">
                  <p className="text-sm text-red-800 font-bold">
                    ⚠️ تحذير هام: هذا البيع يحتوي على {salePieceCount} قطع!
                  </p>
                  <p className="text-sm text-red-700 mt-1">
                    سيتم إلغاء جميع القطع في هذا البيع معاً. لإلغاء قطعة واحدة فقط، يرجى تشغيل سكريبت تقسيم المبيعات أولاً.
                  </p>
                </div>
              )}

              <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                <p className="text-sm text-yellow-800">
                  <strong>تحذير:</strong> سيتم حذف جميع المدفوعات والأقساط المرتبطة بهذا البيع وإرجاع {salePieceCount > 1 ? 'القطع' : 'القطعة'} إلى حالة "متاحة".
                </p>
              </div>

              <div className="space-y-2">
                <Label>مبلغ الاسترداد للعميل (اختياري)</Label>
                <Input
                  type="number"
                  value={refundAmount}
                  onChange={e => setRefundAmount(e.target.value)}
                  placeholder="أدخل المبلغ المسترد إن وجد"
                />
                <p className="text-xs text-muted-foreground">
                  إذا تم دفع مبالغ سابقاً وتريد تسجيل استرداد، أدخل المبلغ هنا
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>
              تراجع
            </Button>
            <Button variant="destructive" onClick={() => {
              setCancelDialogOpen(false)
              setCancelConfirmOpen(true)
            }} disabled={isSubmitting}>
              متابعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Sale Confirmation Dialog */}
      <ConfirmDialog
        open={cancelConfirmOpen}
        onOpenChange={setCancelConfirmOpen}
        onConfirm={cancelSale}
        title="تأكيد الإلغاء"
        description={saleToCancel ? `هل أنت متأكد من إلغاء هذه القطعة؟ سيتم إرجاع القطعة إلى حالة "متاحة".${salePieceCount > 1 ? ` تحذير: هذا البيع يحتوي على ${salePieceCount} قطع!` : ''}` : ''}
        variant="destructive"
        confirmText="نعم، إلغاء"
        cancelText="تراجع"
      />

      {/* Sale Details Dialog */}
      <Dialog open={saleDetailsOpen} onOpenChange={setSaleDetailsOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل البيع الكاملة</DialogTitle>
          </DialogHeader>
          {selectedSaleForDetails && (() => {
            const saleData = sales.find(s => s.id === selectedSaleForDetails.saleId) as any
            const piece = pieces.find(p => p.id === selectedSaleForDetails.pieceId) as any
            const client = clients.find(c => c.id === selectedSaleForDetails.clientId)
            const salePayments = payments.filter(p => p.sale_id === selectedSaleForDetails.saleId)
            const saleInstallments = installments.filter(i => i.sale_id === selectedSaleForDetails.saleId)
            const createdByUser = saleData?.created_by ? users.find(u => u.id === saleData.created_by) : null
            const confirmedByUser = (saleData as any)?.confirmed_by ? users.find(u => u.id === (saleData as any).confirmed_by) : null
            
            // Calculate payments per piece (divide by number of pieces)
            const pieceCount = saleData?.land_piece_ids?.length || 1
            
            // Check if sale is reset (has been reset back to confirmation page)
            // Reset sales have: status = 'Pending', big_advance_amount = 0/null, company_fee_amount = null/0, small_advance_amount = 0/null
            const isReset = saleData.status === 'Pending' &&
                           (saleData.big_advance_amount === 0 || saleData.big_advance_amount === null) &&
                           (!saleData.company_fee_amount || saleData.company_fee_amount === 0) &&
                           (!saleData.small_advance_amount || saleData.small_advance_amount === 0)
            
            // Filter out payments for reset sales - reset sales should show no payments
            const validPayments = isReset ? [] : salePayments
            
            // Calculate total payments for the entire sale (not per piece)
            const totalReservationPaid = validPayments
              .filter(p => p.payment_type === 'SmallAdvance')
              .reduce((sum, p) => sum + (p.amount_paid || 0), 0)
            
            const totalBigAdvancePaid = validPayments
              .filter(p => p.payment_type === 'BigAdvance')
              .reduce((sum, p) => sum + (p.amount_paid || 0), 0)
            
            // Calculate full payment (Full payment type)
            const totalFullPaymentPaid = validPayments
              .filter(p => p.payment_type === 'Full')
              .reduce((sum, p) => sum + (p.amount_paid || 0), 0)
            
            // Calculate partial payments (Partial payment type)
            const totalPartialPaymentPaid = validPayments
              .filter(p => p.payment_type === 'Partial')
              .reduce((sum, p) => sum + (p.amount_paid || 0), 0)
            
            // Calculate initial payment for Promise of Sale (InitialPayment type) from payments table
            const totalInitialPaymentPaidFromPayments = validPayments
              .filter(p => p.payment_type === 'InitialPayment')
              .reduce((sum, p) => sum + (p.amount_paid || 0), 0)
            
            // Also check if there's promise_initial_payment in the sale (for PromiseOfSale type)
            // Use payments if available, otherwise use sale's promise_initial_payment
            const totalInitialPaymentPaid = totalInitialPaymentPaidFromPayments > 0 
              ? totalInitialPaymentPaidFromPayments 
              : (saleData?.payment_type === 'PromiseOfSale' ? (saleData?.promise_initial_payment || 0) : 0)
            
            // Calculate field payments (Field payment type)
            const totalFieldPaymentPaid = salePayments
              .filter(p => p.payment_type === 'Field')
              .reduce((sum, p) => sum + (p.amount_paid || 0), 0)
            
            // Calculate installment payments from payments table (Installment payment type)
            // Note: Regular installments are tracked in installments table, but some may be recorded as Installment type in payments
            const totalInstallmentPaymentPaid = salePayments
              .filter(p => p.payment_type === 'Installment')
              .reduce((sum, p) => sum + (p.amount_paid || 0), 0)
            
            // Calculate installment paid from installments table (this is the main source for installment payments)
            const totalInstallmentPaid = saleInstallments
              .reduce((sum, inst) => sum + (inst.amount_paid || 0), 0)
            
            // Total paid for the entire sale (exclude Refund)
            // Include all payment types: SmallAdvance, BigAdvance, Full, Partial, InitialPayment, Field, Installment (from payments), and installments (from installments table)
            const totalPaidForSale = totalReservationPaid + 
                                    totalBigAdvancePaid + 
                                    totalFullPaymentPaid + 
                                    totalPartialPaymentPaid + 
                                    totalInitialPaymentPaid + 
                                    totalFieldPaymentPaid + 
                                    totalInstallmentPaymentPaid + 
                                    totalInstallmentPaid
            
            // Per-piece amounts (for display purposes)
            const reservationPaid = totalReservationPaid / pieceCount
            const bigAdvancePaid = totalBigAdvancePaid / pieceCount
            const installmentPaid = totalInstallmentPaid / pieceCount
            
            // Total paid per piece
            const totalPaid = totalPaidForSale / pieceCount
            
            // Debug logging
            console.log('[SaleDetails] Payment calculations:', {
              saleId: selectedSaleForDetails.saleId,
              paymentType: saleData?.payment_type,
              pieceCount,
              totalReservationPaid,
              totalBigAdvancePaid,
              totalFullPaymentPaid,
              totalPartialPaymentPaid,
              totalInitialPaymentPaid,
              totalFieldPaymentPaid,
              totalInstallmentPaymentPaid,
              totalInstallmentPaid,
              totalPaidForSale,
              reservationPaid,
              bigAdvancePaid,
              installmentPaid,
              totalPaid,
              salePaymentsCount: salePayments.length,
              saleInstallmentsCount: saleInstallments.length,
              allPaymentTypes: salePayments.map(p => ({ type: p.payment_type, amount: p.amount_paid }))
            })
            
            return (
              <div className="space-y-6">
                {/* Status Badge */}
                <div className="flex items-center gap-3">
                  {(() => {
                    const saleStatus = (saleData?.status as any) || selectedSaleForDetails.status
                    const isCompleted = saleStatus === 'Completed'
                    const isConfirmed = selectedSaleForDetails.bigAdvanceConfirmed || selectedSaleForDetails.fullPaymentConfirmed
                    const isPending = saleStatus === 'Pending' && !isConfirmed
                    
                    if (isCompleted) {
                      return <div className="w-4 h-4 rounded-full bg-green-500" />
                    } else if (isConfirmed || saleStatus === 'Pending') {
                      return <div className="w-4 h-4 rounded-full bg-orange-500" />
                    } else {
                      return <div className="w-4 h-4 rounded-full bg-red-500" />
                    }
                  })()}
                  <Badge 
                    variant={
                      (saleData?.status as any) === 'Completed' ? 'success' :
                      (saleData?.status as any) === 'Pending' ? 'secondary' :
                      (saleData?.status as any) === 'Cancelled' ? 'destructive' : 'warning'
                    }
                    className="text-sm"
                  >
                    {(saleData?.status as any) === 'Completed' ? 'مباع' :
                     (saleData?.status as any) === 'Pending' ? 'قيد الانتظار' :
                     (saleData?.status as any) === 'Cancelled' ? 'ملغي' :
                     (saleData?.status as any) === 'InstallmentsOngoing' ? 'أقساط جارية' :
                     (saleData?.status as any) === 'AwaitingPayment' ? 'قيد الدفع' :
                     selectedSaleForDetails.status === 'Completed' ? 'مباع' :
                     selectedSaleForDetails.status === 'InstallmentsOngoing' ? 'أقساط جارية' :
                     selectedSaleForDetails.status === 'AwaitingPayment' ? 'قيد الدفع' :
                     'محجوز'}
                  </Badge>
              </div>

                {/* Client Information */}
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3 text-lg">معلومات العميل</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{t('sales.clientName')}</p>
                        <p className="font-medium">{client?.name || t('sales.unknown')}</p>
              </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('sales.cin')}</p>
                        <p className="font-medium">{client?.cin || '-'}</p>
            </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('sales.phone')}</p>
                        <p className="font-medium">{client?.phone || '-'}</p>
              </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('sales.email')}</p>
                        <p className="font-medium">{client?.email || '-'}</p>
              </div>
                      {client?.address && (
                        <div className="sm:col-span-2">
                          <p className="text-sm text-muted-foreground">{t('sales.address')}</p>
                          <p className="font-medium">{client.address}</p>
            </div>
                      )}
            </div>
                  </CardContent>
                </Card>

                {/* Piece Information */}
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3 text-lg">معلومات القطعة</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">الدفعة</p>
                        <p className="font-medium">{selectedSaleForDetails.batchName}</p>
            </div>
                      <div>
                        <p className="text-sm text-muted-foreground">رقم القطعة</p>
                        <p className="font-medium">{selectedSaleForDetails.pieceName}</p>
              </div>
                      <div>
                        <p className="text-sm text-muted-foreground">المساحة (م²)</p>
                        <p className="font-medium">{selectedSaleForDetails.surfaceArea} م²</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Sale Information */}
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3 text-lg">معلومات البيع</h3>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">نوع الدفع</p>
                          <Badge variant={
                            selectedSaleForDetails.paymentType === 'Full' ? 'success' : 
                            selectedSaleForDetails.paymentType === 'PromiseOfSale' ? 'warning' : 
                            'secondary'
                          }>
                            {selectedSaleForDetails.paymentType === 'Full' ? 'بالحاضر' : 
                             selectedSaleForDetails.paymentType === 'PromiseOfSale' ? 'وعد بالبيع' : 
                             'بالتقسيط'}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">تاريخ البيع</p>
                          <p className="font-medium">{formatDate(selectedSaleForDetails.saleDate)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">سعر البيع</p>
                          <p className="font-medium text-lg">{formatCurrency(selectedSaleForDetails.price)}</p>
                        </div>
                        {(selectedSaleForDetails.companyFeeAmount && selectedSaleForDetails.companyFeeAmount > 0) || saleData?.company_fee_note ? (
                          <>
                            {selectedSaleForDetails.companyFeeAmount && selectedSaleForDetails.companyFeeAmount > 0 && (
                              <>
                                <div>
                                  <p className="text-sm text-muted-foreground">عمولة الشركة (%)</p>
                                  <p className="font-medium">{selectedSaleForDetails.companyFeePercentage || 0}%</p>
                                </div>
                                <div>
                                  <p className="text-sm text-muted-foreground">عمولة الشركة</p>
                                  <p className="font-medium text-blue-600">{formatCurrency(selectedSaleForDetails.companyFeeAmount)}</p>
                                </div>
                              </>
                            )}
                            {saleData?.company_fee_note && (
                              <div className="sm:col-span-2">
                                <p className="text-sm text-muted-foreground">ملاحظة على العمولة</p>
                                <p className="font-medium text-orange-600 italic">{saleData.company_fee_note}</p>
                              </div>
                            )}
                            {selectedSaleForDetails.companyFeeAmount && selectedSaleForDetails.companyFeeAmount > 0 && (
                              <div className="sm:col-span-2">
                                <p className="text-sm text-muted-foreground">المبلغ الإجمالي المستحق</p>
                                <p className="font-medium text-lg text-green-600">
                                  {formatCurrency(selectedSaleForDetails.price + (selectedSaleForDetails.companyFeeAmount || 0))}
                                </p>
                              </div>
                            )}
                          </>
                        ) : null}
          </div>
                      
                      {selectedSaleForDetails.deadlineDate && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                          <p className="text-sm text-muted-foreground">آخر أجل لإتمام الإجراءات</p>
                          <p className="font-medium text-blue-700">{formatDate(selectedSaleForDetails.deadlineDate)}</p>
                        </div>
                      )}
                      {(saleData as any)?.contract_editor && (
                        <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                          <p className="text-sm text-muted-foreground">محرر العقد</p>
                          <p className="font-medium text-purple-700">
                            {(saleData as any).contract_editor.type} - {(saleData as any).contract_editor.name} ({(saleData as any).contract_editor.place})
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Payment Information */}
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3 text-lg">معلومات الدفع</h3>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">العربون (المدفوع)</p>
                          <p className="font-medium text-green-600">{formatCurrency(reservationPaid || selectedSaleForDetails.reservationAmount)}</p>
                        </div>
                        {selectedSaleForDetails.paymentType === 'Installment' && (
                          <>
                            <div>
                              <p className="text-sm text-muted-foreground">التسبقة (المدفوعة)</p>
                              <p className="font-medium text-blue-600">{formatCurrency(bigAdvancePaid || selectedSaleForDetails.bigAdvanceAmount || 0)}</p>
                            </div>
                            {selectedSaleForDetails.numberOfInstallments && (
                              <div>
                                <p className="text-sm text-muted-foreground">عدد الأقساط</p>
                                <p className="font-medium">{selectedSaleForDetails.numberOfInstallments} شهر</p>
                              </div>
                            )}
                            {selectedSaleForDetails.monthlyInstallmentAmount && (
                              <div>
                                <p className="text-sm text-muted-foreground">المبلغ الشهري</p>
                                <p className="font-medium">{formatCurrency(selectedSaleForDetails.monthlyInstallmentAmount)}</p>
                              </div>
                            )}
                            {selectedSaleForDetails.installmentStartDate && (
                              <div>
                                <p className="text-sm text-muted-foreground">تاريخ بداية الأقساط</p>
                                <p className="font-medium">{formatDate(selectedSaleForDetails.installmentStartDate)}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-sm text-muted-foreground">الأقساط المدفوعة</p>
                              <p className="font-medium text-green-600">{formatCurrency(installmentPaid)}</p>
                            </div>
                          </>
                        )}
                        {selectedSaleForDetails.paymentType === 'PromiseOfSale' && (
                          <>
                            {saleData?.promise_initial_payment && saleData.promise_initial_payment > 0 && (
                              <div>
                                <p className="text-sm text-muted-foreground">المبلغ المستلم (وعد بالبيع)</p>
                                <p className="font-medium text-purple-600">{formatCurrency((saleData.promise_initial_payment || 0) / pieceCount)}</p>
                              </div>
                            )}
                            {saleData?.promise_completion_date && (
                              <div>
                                <p className="text-sm text-muted-foreground">تاريخ الاستكمال المحدد</p>
                                <p className="font-medium">{formatDate(saleData.promise_completion_date)}</p>
                              </div>
                            )}
                            {saleData?.promise_completed && (
                              <div>
                                <p className="text-sm text-muted-foreground">حالة الاستكمال</p>
                                <p className="font-medium text-green-600">مكتمل</p>
                              </div>
                            )}
                          </>
                        )}
                        <div>
                          <p className="text-sm text-muted-foreground">إجمالي المدفوع</p>
                          <p className="font-medium text-lg text-green-600">{formatCurrency(totalPaid)}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">المبلغ المتبقي</p>
                          <p className="font-medium text-lg text-orange-600">
                            {formatCurrency((selectedSaleForDetails as any).remainingAmount ?? (selectedSaleForDetails.price + (selectedSaleForDetails.companyFeeAmount || 0) - totalPaid))}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Installments Schedule */}
                {saleInstallments.length > 0 && (
                  <Card>
                    <CardContent className="p-0">
                      <button
                        onClick={() => setInstallmentsExpanded(!installmentsExpanded)}
                        className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                      >
                        <h3 className="font-semibold text-lg">جدول الأقساط</h3>
                        {installmentsExpanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      {installmentsExpanded && (
                        <div className="px-4 pb-4 overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>رقم القسط</TableHead>
                                <TableHead>المبلغ المستحق</TableHead>
                                <TableHead>المبلغ المدفوع</TableHead>
                                <TableHead>تاريخ الاستحقاق</TableHead>
                                <TableHead>تاريخ الدفع</TableHead>
                                <TableHead>الحالة</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {saleInstallments.map((inst) => (
                                <TableRow key={inst.id}>
                                  <TableCell>{inst.installment_number}</TableCell>
                                  <TableCell>{formatCurrency(inst.amount_due)}</TableCell>
                                  <TableCell>{formatCurrency(inst.amount_paid)}</TableCell>
                                  <TableCell>{formatDate(inst.due_date)}</TableCell>
                                  <TableCell>{inst.paid_date ? formatDate(inst.paid_date) : '-'}</TableCell>
                                  <TableCell>
                                    <Badge
                                      variant={
                                        inst.status === 'Paid' ? 'success' :
                                        inst.status === 'Late' ? 'destructive' :
                                        inst.status === 'Partial' ? 'warning' : 'secondary'
                                      }
                                    >
                                      {inst.status === 'Paid' ? 'مدفوع' :
                                       inst.status === 'Late' ? 'متأخر' :
                                       inst.status === 'Partial' ? 'جزئي' : 'غير مدفوع'}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Payment History */}
                {salePayments.length > 0 && (
                  <Card>
                    <CardContent className="p-0">
                      <button
                        onClick={() => setPaymentsExpanded(!paymentsExpanded)}
                        className="w-full p-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
                      >
                        <h3 className="font-semibold text-lg">سجل المدفوعات</h3>
                        {paymentsExpanded ? (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      {paymentsExpanded && (
                        <div className="px-4 pb-4 overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>التاريخ</TableHead>
                                <TableHead>النوع</TableHead>
                                <TableHead>المبلغ</TableHead>
                                <TableHead>طريقة الدفع</TableHead>
                                <TableHead>ملاحظات</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {salePayments.map((payment) => (
                                <TableRow key={payment.id}>
                                  <TableCell>{formatDate(payment.payment_date)}</TableCell>
                                  <TableCell>
                                    {payment.payment_type === 'SmallAdvance' ? 'عربون' :
                                     payment.payment_type === 'BigAdvance' ? 'دفعة أولى' :
                                     payment.payment_type === 'Installment' ? 'قسط' :
                                     payment.payment_type === 'Full' ? 'دفع كامل' :
                                     payment.payment_type === 'Refund' ? 'استرداد' : payment.payment_type}
                                  </TableCell>
                                  <TableCell className={payment.payment_type === 'Refund' ? 'text-red-600' : 'text-green-600'}>
                                    {payment.payment_type === 'Refund' ? '-' : ''}{formatCurrency(Math.abs(payment.amount_paid || 0))}
                                  </TableCell>
                                  <TableCell>{payment.payment_method || '-'}</TableCell>
                                  <TableCell className="text-xs">{payment.notes || '-'}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* User Information */}
                {(createdByUser || confirmedByUser) && (
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-3 text-lg">معلومات المستخدمين</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {createdByUser && (
                          <div>
                            <p className="text-sm text-muted-foreground">أنشأ البيع</p>
                            <p className="font-medium">{createdByUser.name}</p>
                            {createdByUser.email && (
                              <p className="text-xs text-muted-foreground">{createdByUser.email}</p>
                            )}
                          </div>
                        )}
                        {confirmedByUser && (
                          <div>
                            <p className="text-sm text-muted-foreground">أكد البيع</p>
                            <p className="font-medium text-green-600">{confirmedByUser.name}</p>
                            {confirmedByUser.email && (
                              <p className="text-xs text-muted-foreground">{confirmedByUser.email}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Timestamps */}
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3 text-lg">التواريخ والأوقات</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">تاريخ إنشاء البيع</p>
                        <p className="font-medium">{formatDateTime(selectedSaleForDetails.createdAt)}</p>
                      </div>
                      {selectedSaleForDetails.updatedAt && (
                        <div>
                          <p className="text-sm text-muted-foreground">تاريخ آخر تحديث</p>
                          <p className="font-medium">{formatDateTime(selectedSaleForDetails.updatedAt)}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Notes */}
                {saleData?.notes && (
                  <Card>
                    <CardContent className="p-4">
                      <h3 className="font-semibold mb-3 text-lg">ملاحظات</h3>
                      <p className="text-sm whitespace-pre-wrap">{saleData.notes}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )
          })()}
          <DialogFooter>
            {selectedSaleForDetails && (() => {
              const saleData = sales.find(s => s.id === selectedSaleForDetails.saleId)
              const hasBigAdvance = saleData && (saleData.big_advance_amount || 0) > 0
              const hasCompanyFee = saleData && (saleData.company_fee_amount || 0) > 0
              const canReset = hasBigAdvance || hasCompanyFee
              
              return (
                <>
                  {canReset && (
                    <Button
                      variant="outline"
                      onClick={resetSaleToConfirmation}
                      disabled={resettingSale}
                      className="text-orange-600 border-orange-600 hover:bg-orange-50"
                    >
                      {resettingSale ? 'جاري الإرجاع...' : 'إرجاع إلى صفحة التأكيد'}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setSaleDetailsOpen(false)}>
                    إغلاق
                  </Button>
                </>
              )
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Details Dialog */}
      <Dialog open={clientDetailsOpen} onOpenChange={setClientDetailsOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل العميل</DialogTitle>
          </DialogHeader>
          {selectedClientForDetails && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">{t('sales.clientName')}</p>
                  <p className="font-medium">{selectedClientForDetails.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('sales.cin')}</p>
                  <p className="font-medium">{selectedClientForDetails.cin}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('sales.phone')}</p>
                  <p className="font-medium">{selectedClientForDetails.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('sales.email')}</p>
                  <p className="font-medium">{selectedClientForDetails.email || '-'}</p>
                </div>
                {selectedClientForDetails.address && (
                  <div className="sm:col-span-2">
                    <p className="text-sm text-muted-foreground">{t('sales.address')}</p>
                    <p className="font-medium">{selectedClientForDetails.address}</p>
                  </div>
                )}
              </div>

              {clientSales.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">{t('sales.salesHistory')}</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('sales.saleDate')}</TableHead>
                          <TableHead>{t('sales.saleType')}</TableHead>
                          <TableHead>{t('sales.salePrice')}</TableHead>
                          <TableHead>{t('sales.saleStatus')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientSales.map((sale) => {
                          const pieceSale = pieceSales.find(ps => ps.saleId === sale.id)
                          return (
                            <TableRow 
                              key={sale.id}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                if (pieceSale) {
                                  setClientDetailsOpen(false) // Close client details dialog
                                  setSelectedSaleForDetails(pieceSale)
                                  setSaleDetailsOpen(true)
                                }
                              }}
                            >
                            <TableCell>{formatDate(sale.sale_date)}</TableCell>
                            <TableCell>{sale.payment_type === 'Full' ? t('sales.full') : t('sales.installment')}</TableCell>
                            <TableCell>{formatCurrency(sale.total_selling_price)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  sale.status === 'Completed'
                                    ? 'success'
                                    : sale.status === 'Cancelled'
                                    ? 'destructive'
                                    : 'warning'
                                }
                              >
                                {sale.status === 'Completed' ? 'مباع' :
                                 sale.status === 'Cancelled' ? 'ملغي' :
                                 (sale as any).is_confirmed || (sale as any).big_advance_confirmed ? 'قيد الدفع' :
                                   'محجوز'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
