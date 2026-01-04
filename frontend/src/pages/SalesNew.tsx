import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { sanitizeText, sanitizePhone, sanitizeCIN, validateLebanesePhone } from '@/lib/sanitize'
import { debounce } from '@/lib/throttle'
import { formatCurrency, formatDate } from '@/lib/utils'
import { retryWithBackoff, isRetryableError } from '@/lib/retry'
import { Plus, Search, Filter, ArrowUpDown, ArrowUp, ArrowDown, X } from 'lucide-react'
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
  paymentType: 'Full' | 'Installment'
  price: number
  cost: number
  profit: number
  saleDate: string
  createdAt: string // For secondary sorting (newest first)
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
  const [sales, setSales] = useState<Sale[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [pieces, setPieces] = useState<LandPiece[]>([])
  const [installments, setInstallments] = useState<Installment[]>([])
  const [payments, setPayments] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([]) // For user tracking
  const [loading, setLoading] = useState(true)
  
  // View state
  
  // New Sale Dialog
  const [newSaleOpen, setNewSaleOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState('')
  const [clientSearch, setClientSearch] = useState('') // Search for clients by ID, phone, name
  const [selectedPieces, setSelectedPieces] = useState<string[]>([])
  const [pieceSearch, setPieceSearch] = useState('') // Search for land pieces by number
  const [pieceBatchFilter, setPieceBatchFilter] = useState<string>('') // Filter by batch in new sale dialog - empty means no batch selected
  const [paymentType, setPaymentType] = useState<'Full' | 'Installment'>('Full')
  const [numberOfInstallments, setNumberOfInstallments] = useState('12')
  const [reservationAmount, setReservationAmount] = useState('')
  const [applyCompanyFee, setApplyCompanyFee] = useState(false)
  const [companyFeePercentage, setCompanyFeePercentage] = useState('2') // Default 2%, configurable
  const [deadlineDate, setDeadlineDate] = useState('') // Deadline for completing sale procedures
  
  // New Client Dialog (from sale popup)
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [newClientName, setNewClientName] = useState('')
  const [newClientPhone, setNewClientPhone] = useState('')
  const [newClientAddress, setNewClientAddress] = useState('')
  const [newClientCin, setNewClientCin] = useState('')
  
  // Confirm dialogs
  const [confirmFullOpen, setConfirmFullOpen] = useState(false)
  const [confirmBigAdvanceOpen, setConfirmBigAdvanceOpen] = useState(false)
  const [selectedSale, setSelectedSale] = useState<PieceSale | null>(null)
  const [installmentStartDate, setInstallmentStartDate] = useState('')
  const [bigAdvancePaidAmount, setBigAdvancePaidAmount] = useState('')
  const [bigAdvancePaidDate, setBigAdvancePaidDate] = useState(new Date().toISOString().split('T')[0])
  
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  // Client details dialog
  const [clientDetailsOpen, setClientDetailsOpen] = useState(false)
  const [selectedClientForDetails, setSelectedClientForDetails] = useState<Client | null>(null)
  const [clientSales, setClientSales] = useState<Sale[]>([])
  
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

  // UI/UX: Filter and sort states
  const [statusFilter, setStatusFilter] = useState<'all' | 'Pending' | 'AwaitingPayment' | 'InstallmentsOngoing' | 'Completed'>('all')
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<'all' | 'Full' | 'Installment'>('all')
  const [clientFilter, setClientFilter] = useState('')
  const [landBatchFilter, setLandBatchFilter] = useState<string>('all')
  const [landPieceSearch, setLandPieceSearch] = useState('')
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
        supabase.from('sales').select('*').order('sale_date', { ascending: false }),
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
      
      // Calculate total paid for this sale (exclude refunds)
      const totalPaid = salePayments
        .filter(p => p.payment_type !== 'Refund')
        .reduce((sum, p) => sum + (p.amount_paid || 0), 0)
      
      // Calculate big advance paid (BigAdvance payment type only)
      const bigAdvancePaid = salePayments
        .filter(p => p.payment_type === 'BigAdvance')
        .reduce((sum, p) => sum + (p.amount_paid || 0), 0)
      
      // Calculate reservation paid (SmallAdvance payment type only)
      const reservationPaid = salePayments
        .filter(p => p.payment_type === 'SmallAdvance')
        .reduce((sum, p) => sum + (p.amount_paid || 0), 0)
      
      // For each piece in the sale, create a separate entry
      sale.land_piece_ids.forEach((pieceId) => {
        const piece = pieces.find(p => p.id === pieceId) as any
        if (!piece) return
        
        const isInstallment = sale.payment_type === 'Installment'
        const pricePerPiece = sale.total_selling_price / sale.land_piece_ids.length
        const costPerPiece = sale.total_purchase_cost / sale.land_piece_ids.length
        const pieceCount = sale.land_piece_ids.length
        const paidPerPiece = totalPaid / pieceCount
        const bigAdvancePaidPerPiece = bigAdvancePaid / pieceCount
        const reservationPaidPerPiece = reservationPaid / pieceCount
        
        // Calculate remaining: total price - reservation - big advance - other payments
        const companyFeePerPiece = sale.company_fee_amount ? sale.company_fee_amount / sale.land_piece_ids.length : 0
        const totalPayablePerPiece = pricePerPiece + companyFeePerPiece
        const remainingPerPiece = Math.max(0, totalPayablePerPiece - reservationPaidPerPiece - bigAdvancePaidPerPiece - (paidPerPiece - reservationPaidPerPiece - bigAdvancePaidPerPiece))
        
        // Determine status based on payment state
        let status: PieceSale['status'] = 'Pending'
        const isConfirmed = (sale as any).is_confirmed === true
        
        if (sale.status === 'Cancelled') {
          status = 'Cancelled'
        } else if (isInstallment) {
          // Installment sale: check big advance and installments
          // PRIORITY: If database says 'Completed', use that - payments may have been recorded
          if (sale.status === 'Completed') {
            status = 'Completed' // مباع - fully paid
          } else if (!isConfirmed && !bigAdvancePaidPerPiece) {
            status = 'Pending' // معلق - not confirmed yet
          } else if (!isConfirmed) {
            status = 'AwaitingPayment' // قيد الدفع - waiting for big advance confirmation
          } else {
            // Big advance paid - check if all installments are paid
            const allPaid = saleInstallments.length > 0 && 
              saleInstallments.every(i => i.status === 'Paid')
            status = allPaid ? 'Completed' : 'InstallmentsOngoing' // أقساط جارية
          }
        } else {
          // Full payment sale
          status = sale.status === 'Completed' ? 'Completed' : 'AwaitingPayment'
        }
        
        result.push({
          id: `${sale.id}-${pieceId}`,
          saleId: sale.id,
          pieceId,
          pieceName: `#${piece.piece_number}`,
          batchName: piece.land_batch?.name || '',
          surfaceArea: piece.surface_area,
          clientId: sale.client_id,
          clientName: client?.name || 'غير معروف',
          paymentType: isInstallment ? 'Installment' : 'Full',
          price: pricePerPiece,
          cost: costPerPiece,
          profit: pricePerPiece - costPerPiece,
          saleDate: sale.sale_date,
          createdAt: sale.created_at,
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

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(s => s.status === statusFilter)
    }

    // Apply payment type filter
    if (paymentTypeFilter !== 'all') {
      filtered = filtered.filter(s => s.paymentType === paymentTypeFilter)
    }

    // Apply client filter
    if (clientFilter) {
      const search = clientFilter.toLowerCase()
      filtered = filtered.filter(s => 
        s.clientName.toLowerCase().includes(search) ||
        s.clientId.toLowerCase().includes(search)
      )
    }

    // Apply land batch filter
    if (landBatchFilter !== 'all') {
      filtered = filtered.filter(s => s.batchName === landBatchFilter)
    }

    // Apply land piece number search
    if (landPieceSearch) {
      const search = landPieceSearch.toLowerCase().trim()
      filtered = filtered.filter(s => {
        // Search in piece name (e.g., "#123")
        const pieceName = s.pieceName.toLowerCase()
        // Remove # and compare
        const pieceNumber = pieceName.replace('#', '').replace(/\D/g, '')
        const searchNumber = search.replace('#', '').replace(/\D/g, '')
        
        return pieceName.includes(search) || 
               pieceNumber.includes(searchNumber) ||
               s.batchName.toLowerCase().includes(search)
      })
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
  }, [pieceSales, statusFilter, paymentTypeFilter, clientFilter, landBatchFilter, landPieceSearch, sortBy, sortOrder])

  // Get unique land batch names for filter dropdown
  const uniqueLandBatches = useMemo(() => {
    const batches = new Set(pieceSales.map(s => s.batchName).filter(Boolean))
    return Array.from(batches).sort()
  }, [pieceSales])

  // Clear all filters
  const clearFilters = () => {
    setStatusFilter('all')
    setPaymentTypeFilter('all')
    setClientFilter('')
    setLandBatchFilter('all')
    setLandPieceSearch('')
  }

  // Check if any filters are active
  const hasActiveFilters = statusFilter !== 'all' || 
                           paymentTypeFilter !== 'all' || 
                           clientFilter !== '' || 
                           landBatchFilter !== 'all' || 
                           landPieceSearch !== ''

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

  // Available pieces for new sale
  const availablePieces = pieces.filter((p: any) => p.status === 'Available')

  // Create new sale (supports multiple pieces)
  const createSale = async () => {
    if (isSubmitting) return // Prevent double submission
    
    // Authorization check
    if (!hasPermission('create_sales')) {
      setErrorMessage('ليس لديك صلاحية لإنشاء مبيعات')
      return
    }
    
    setIsSubmitting(true)
    setErrorMessage(null)
    
    if (!selectedClient || selectedPieces.length === 0) {
      setErrorMessage('يرجى ملء جميع الحقول المطلوبة')
      setIsSubmitting(false)
      return
    }

    setIsSubmitting(true)
    try {
      // Double-check that selected pieces are still available (prevent double-selling)
      const { data: currentPieces } = await supabase
        .from('land_pieces')
        .select('id, status, piece_number')
        .in('id', selectedPieces)
      
      const unavailablePieces = (currentPieces || []).filter((p: any) => p.status !== 'Available')
      if (unavailablePieces.length > 0) {
        const pieceNumbers = unavailablePieces.map((p: any) => `#${p.piece_number}`).join(', ')
        setErrorMessage(`القطع التالية لم تعد متاحة: ${pieceNumbers}. يرجى تحديث الصفحة واختيار قطع أخرى.`)
        fetchData() // Refresh data
        setIsSubmitting(false)
        return
      }

      // Calculate totals from selected pieces using m² pricing
      const selectedPieceObjects = pieces.filter(p => selectedPieces.includes(p.id)) as any[]
      
      // Validate pieces exist
      if (selectedPieceObjects.length === 0) {
        setErrorMessage('يرجى اختيار قطع أرض صحيحة')
        setIsSubmitting(false)
        return
      }
      
      const totalCost = parseFloat(selectedPieceObjects.reduce((sum, p) => sum + (parseFloat(p.purchase_cost) || 0), 0).toFixed(2))
      const totalSurface = selectedPieceObjects.reduce((sum, p) => sum + (parseFloat(p.surface_area) || 0), 0)
      
      // Calculate total price based on payment type and pre-set prices
      const totalPrice = parseFloat(selectedPieceObjects.reduce((sum, p) => {
        if (paymentType === 'Full') {
          return sum + (parseFloat(p.selling_price_full) || 0)
        } else {
          return sum + (parseFloat(p.selling_price_installment) || 0)
        }
      }, 0).toFixed(2))
      
      if (totalPrice <= 0 || isNaN(totalPrice)) {
        setErrorMessage('يرجى التأكد من أن القطع المختارة لها أسعار محددة. يمكنك تحديد الأسعار من صفحة إدارة الأراضي عند إنشاء الدفعة.')
        setIsSubmitting(false)
        return
      }
      
      // Validate calculation
      if (isNaN(totalCost) || totalCost < 0) {
        setErrorMessage('خطأ في حساب التكلفة الإجمالية. يرجى التحقق من البيانات')
        setIsSubmitting(false)
        return
      }
      
      const reservation = parseFloat(reservationAmount) || 0
      
      // Validate reservation doesn't exceed total price
      if (reservation > totalPrice) {
        setErrorMessage('مبلغ العربون لا يمكن أن يكون أكبر من السعر الإجمالي')
        setIsSubmitting(false)
        return
      }
      
      // Company fee will be set at confirmation, not during sale creation
      
      // Validate land_piece_ids is an array and not empty
      if (!Array.isArray(selectedPieces) || selectedPieces.length === 0) {
        setErrorMessage('يرجى اختيار قطعة أرض واحدة على الأقل')
        setIsSubmitting(false)
        return
      }
      
      // Validate client_id exists
      if (!selectedClient || selectedClient.trim() === '') {
        setErrorMessage('يرجى اختيار عميل')
        setIsSubmitting(false)
        return
      }
      
      // Build saleData with proper types - only include fields that definitely exist
      const saleData: any = {
        client_id: selectedClient,
        land_piece_ids: selectedPieces, // Array of UUIDs - REQUIRED
        payment_type: paymentType, // 'Full' or 'Installment' - REQUIRED
        total_purchase_cost: totalCost, // DECIMAL - REQUIRED
        total_selling_price: totalPrice, // DECIMAL - REQUIRED
        profit_margin: parseFloat((totalPrice - totalCost).toFixed(2)), // DECIMAL - REQUIRED
        small_advance_amount: reservation, // DECIMAL - has DEFAULT 0
        big_advance_amount: 0, // DECIMAL - has DEFAULT 0
        status: 'Pending', // sale_status enum - has DEFAULT 'Pending'
        sale_date: new Date().toISOString().split('T')[0], // DATE - has DEFAULT CURRENT_DATE
        created_by: user?.id || null, // Track who created this sale
      }
      
      // Add optional fields (these columns might not exist if migrations haven't been run)
      if (deadlineDate && deadlineDate.trim() !== '') {
        saleData.deadline_date = deadlineDate
      }
      
      // Company fee and number_of_installments will be set at confirmation, not during sale creation

      const { data: newSale, error } = await supabase
        .from('sales')
        .insert(saleData)
        .select()
        .single()
      
      if (error) {
        console.error('Error creating sale:', error)
        console.error('Sale data sent:', JSON.stringify(saleData, null, 2))
        
        // Provide more specific error messages
        if (error.code === '23503') {
          setErrorMessage('العميل أو القطع المحددة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.')
        } else if (error.code === '23505') {
          setErrorMessage('هذا البيع موجود بالفعل')
        } else if (error.code === 'PGRST116' || error.message?.includes('column') || error.message?.includes('does not exist')) {
          setErrorMessage('بعض الأعمدة غير موجودة في قاعدة البيانات. يرجى تشغيل ملف fix_sales_table_columns.sql في Supabase SQL Editor.')
        } else if (error.message?.includes('null value') || error.message?.includes('NOT NULL')) {
          setErrorMessage('يرجى ملء جميع الحقول المطلوبة')
        } else {
          setErrorMessage(`خطأ في إنشاء البيع: ${error.message || 'خطأ غير معروف'}. يرجى التحقق من البيانات والمحاولة مرة أخرى.`)
        }
        setIsSubmitting(false)
        return
      }

      // Create SmallAdvance payment if reservation amount > 0
      if (reservation > 0 && newSale) {
        await supabase.from('payments').insert([{
          client_id: selectedClient,
          sale_id: newSale.id,
          amount_paid: reservation,
          payment_type: 'SmallAdvance',
          payment_date: new Date().toISOString().split('T')[0],
          recorded_by: user?.id || null, // Track who recorded this payment
        }] as any)
      }

      // Update all selected pieces status to Reserved
      for (const pieceId of selectedPieces) {
        await supabase
          .from('land_pieces')
          .update({ status: 'Reserved' } as any)
          .eq('id', pieceId)
      }

      setNewSaleOpen(false)
      resetForm()
      fetchData()
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage('خطأ في إنشاء البيع')
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setSelectedClient('')
    setClientSearch('')
    setSelectedPieces([])
    setPieceSearch('')
    setPieceBatchFilter('all')
    setPaymentType('Full')
    setNumberOfInstallments('12')
    setReservationAmount('')
    setApplyCompanyFee(false)
    setCompanyFeePercentage('2')
    setDeadlineDate('')
    setNewClientName('')
    setNewClientPhone('')
    setNewClientAddress('')
    setNewClientCin('')
  }
  
  // Calculate total price based on selected pieces and payment type
  const calculatedTotalPrice = useMemo(() => {
    if (selectedPieces.length === 0) return 0
    const selectedPieceObjects = pieces.filter(p => selectedPieces.includes(p.id))
    return selectedPieceObjects.reduce((sum, p) => {
      if (paymentType === 'Full') {
        return sum + (p.selling_price_full || 0)
      } else {
        return sum + (p.selling_price_installment || 0)
      }
    }, 0)
  }, [selectedPieces, paymentType, pieces])
  
  // Calculate total surface
  const calculatedTotalSurface = useMemo(() => {
    if (selectedPieces.length === 0) return 0
    const selectedPieceObjects = pieces.filter(p => selectedPieces.includes(p.id))
    return selectedPieceObjects.reduce((sum, p) => sum + (p.surface_area || 0), 0)
  }, [selectedPieces, pieces])

  const [creatingClient, setCreatingClient] = useState(false)

  // Create new client from sale popup
  const createNewClient = async () => {
    if (creatingClient) return // Prevent double submission
    setCreatingClient(true)
    setErrorMessage(null)
    
    // Sanitize inputs
    const sanitizedName = sanitizeText(newClientName)
    const sanitizedCIN = sanitizeCIN(newClientCin)
    const sanitizedPhone = newClientPhone ? sanitizePhone(newClientPhone) : null
    const sanitizedAddress = newClientAddress ? sanitizeText(newClientAddress) : null
    
    if (!sanitizedName || !sanitizedCIN) {
      setErrorMessage('يرجى إدخال اسم العميل ورقم CIN')
      setCreatingClient(false)
      return
    }
    
    // Validate phone is required (no format check, just required)
    if (!newClientPhone || !newClientPhone.trim()) {
      setErrorMessage('رقم الهاتف مطلوب')
      setCreatingClient(false)
      return
    }
    
    try {
      // Check for duplicate CIN
      const { data: existingClients, error: checkError } = await supabase
        .from('clients')
        .select('id, name')
        .eq('cin', sanitizedCIN)
        .limit(1)
      
      // Handle 406 error gracefully (might be RLS issue)
      if (checkError && checkError.code !== 'PGRST116') {
        // Continue anyway - let the insert handle duplicates
      }
      
      const existingClient = existingClients && existingClients.length > 0 ? existingClients[0] : null

      if (existingClient) {
        setErrorMessage(`يوجد عميل بنفس رقم CIN: ${existingClient.name}`)
        setCreatingClient(false)
        return
      }

      const { data, error } = await supabase
        .from('clients')
        .insert([{
          name: sanitizedName,
          cin: sanitizedCIN,
          phone: sanitizedPhone, // Now required
          address: sanitizedAddress,
          client_type: 'Individual',
        }])
        .select()
        .single()
      
      if (error) throw error
      
      // Add to clients list and automatically select the new client
      setClients([...clients, data])
      setSelectedClient(data.id)
      setClientSearch(data.name)
      
      // Reset and close new client dialog
      setNewClientName('')
      setNewClientPhone('')
      setNewClientAddress('')
      setNewClientCin('')
      setNewClientOpen(false)
      setErrorMessage(null)
    } catch (error) {
      setErrorMessage('خطأ في إضافة العميل')
    } finally {
      setCreatingClient(false)
    }
  }

  // Debounced client search
  const [debouncedClientSearch, setDebouncedClientSearch] = useState('')
  const debouncedClientSearchFn = useCallback(
    debounce((value: string) => setDebouncedClientSearch(value), 300),
    []
  )

  // Debounced piece search
  const [debouncedPieceSearch, setDebouncedPieceSearch] = useState('')
  const debouncedPieceSearchFn = useCallback(
    debounce((value: string) => setDebouncedPieceSearch(value), 300),
    []
  )

  // Filter clients by search (ID, phone, name)
  const filteredClients = useMemo(() => {
    if (!debouncedClientSearch) return clients
    const search = debouncedClientSearch.toLowerCase()
    return clients.filter(client => 
      client.id.toLowerCase().includes(search) ||
      client.phone?.toLowerCase().includes(search) ||
      client.name.toLowerCase().includes(search) ||
      client.cin?.toLowerCase().includes(search)
    )
  }, [clients, debouncedClientSearch])

  // Filter pieces by land number and batch
  const filteredAvailablePieces = useMemo(() => {
    // Don't show any pieces until a batch is selected
    if (!pieceBatchFilter || pieceBatchFilter === '') {
      return []
    }
    
    let filtered = availablePieces
    
    // Filter by batch (required)
      filtered = filtered.filter((piece: any) => 
        piece.land_batch?.name === pieceBatchFilter
      )
    
    // Filter by piece number search
    if (debouncedPieceSearch) {
    const search = debouncedPieceSearch.toLowerCase()
      filtered = filtered.filter((piece: any) => 
        piece.piece_number?.toString().toLowerCase().includes(search) ||
        piece.land_batch?.name?.toLowerCase().includes(search)
      )
    }
    
    // Sort by batch name first, then by piece number (to show lands grouped by batch)
    filtered = filtered.sort((a: any, b: any) => {
      const batchA = a.land_batch?.name || ''
      const batchB = b.land_batch?.name || ''
      if (batchA !== batchB) {
        return batchA.localeCompare(batchB, 'ar')
      }
      // If same batch, sort by piece number
      const numA = parseInt(a.piece_number?.toString().replace(/\D/g, '')) || 0
      const numB = parseInt(b.piece_number?.toString().replace(/\D/g, '')) || 0
      return numA - numB
    })
    
    return filtered
  }, [availablePieces, debouncedPieceSearch, pieceBatchFilter])

  // Get unique batch names from available pieces for filter dropdown
  const availableBatchNames = useMemo(() => {
    const batches = new Set(
      availablePieces
        .map((p: any) => p.land_batch?.name)
        .filter(Boolean)
    )
    return Array.from(batches).sort()
  }, [availablePieces])

  // Confirm full payment - for a single piece only
  const confirmFullPayment = async () => {
    if (!selectedSale) return
    
    // Authorization check
    if (!hasPermission('edit_sales')) {
      setErrorMessage('ليس لديك صلاحية لتعديل المبيعات')
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
    
    // Authorization check
    if (!hasPermission('edit_sales')) {
      setErrorMessage('ليس لديك صلاحية لتعديل المبيعات')
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
            is_confirmed: true,
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
      setErrorMessage('خطأ في تأكيد الدفعة الأولى. يرجى المحاولة مرة أخرى.')
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
    
    // Authorization check
    if (!hasPermission('edit_sales')) {
      setErrorMessage('ليس لديك صلاحية لتعديل المبيعات')
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
        <h1 className="text-2xl sm:text-3xl font-bold">المبيعات</h1>
        {hasPermission('create_sales') && (
          <Button 
            onClick={() => setNewSaleOpen(true)} 
            size="sm"
            className="bg-green-600 hover:bg-green-700 w-full sm:w-auto"
          >
            <Plus className="h-4 w-4 ml-1" />
            بيع جديد
          </Button>
        )}
      </div>

      {/* Compact Stats - Inline */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
        <span className="text-muted-foreground">إجمالي: <strong className="text-blue-600">{filteredAndSortedSales.length}</strong></span>
        <span className="text-muted-foreground">مباع: <strong className="text-green-600">{filteredAndSortedSales.filter(s => s.status === 'Completed').length}</strong></span>
        <span className="text-muted-foreground">قيد الدفع: <strong className="text-yellow-600">{filteredAndSortedSales.filter(s => s.status === 'AwaitingPayment').length}</strong></span>
        <span className="text-muted-foreground">بالتقسيط: <strong className="text-purple-600">{filteredAndSortedSales.filter(s => s.status === 'InstallmentsOngoing').length}</strong></span>
      </div>

      {/* Compact Search and Filters */}
      <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          type="text"
            placeholder="بحث عن العميل..."
          value={clientFilter}
          onChange={e => setClientFilter(e.target.value)}
          className="flex-1"
        />
          <Input
            type="text"
            placeholder="بحث عن رقم القطعة..."
            value={landPieceSearch}
            onChange={e => setLandPieceSearch(e.target.value)}
            className="flex-1"
          />
          <Select 
            value={landBatchFilter} 
            onChange={e => setLandBatchFilter(e.target.value)} 
            className="w-full sm:w-48"
          >
            <option value="all">كل الدفعات</option>
            {uniqueLandBatches.map(batch => (
              <option key={batch} value={batch}>{batch}</option>
            ))}
          </Select>
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="w-full sm:w-40">
            <option value="all">كل الحالات</option>
          <option value="Pending">معلق</option>
          <option value="AwaitingPayment">قيد الدفع</option>
          <option value="InstallmentsOngoing">بالتقسيط</option>
          <option value="Completed">مباع</option>
        </Select>
          <Select value={paymentTypeFilter} onChange={e => setPaymentTypeFilter(e.target.value as any)} className="w-full sm:w-40">
            <option value="all">كل الأنواع</option>
            <option value="Full">بالحاضر</option>
            <option value="Installment">بالتقسيط</option>
        </Select>
        </div>
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {filteredAndSortedSales.length} نتيجة من {pieceSales.filter(s => s.status !== 'Cancelled').length}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              className="text-xs"
            >
              <X className="h-3 w-3 ml-1" />
              مسح الفلاتر
            </Button>
          </div>
        )}
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
                <Card key={sale.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
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
                        <Badge 
                          variant={
                            sale.status === 'Completed' ? 'success' :
                            sale.status === 'InstallmentsOngoing' ? 'secondary' :
                            sale.status === 'AwaitingPayment' ? 'warning' : 'destructive'
                          }
                          className="text-xs flex-shrink-0"
                        >
                          {sale.status === 'Completed' ? 'مباع' :
                           sale.status === 'InstallmentsOngoing' ? 'بالتقسيط' :
                           sale.status === 'Pending' && !sale.bigAdvanceConfirmed && !(sale as any).is_confirmed ? 'غير مؤكد' :
                           sale.status === 'AwaitingPayment' ? 'قيد الدفع' :
                           sale.status === 'Pending' ? 'معلق' : 'ملغي'}
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
                          <span className="text-muted-foreground">النوع:</span>
                          <Badge variant={sale.paymentType === 'Full' ? 'success' : 'secondary'} className="text-xs ml-1">
                            {sale.paymentType === 'Full' ? 'بالحاضر' : 'بالتقسيط'}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">السعر:</span>
                          <span className="font-medium ml-1">{formatCurrency(sale.price)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">عربون:</span>
                          <span className="font-medium text-green-600 ml-1">{formatCurrency(sale.reservationAmount)}</span>
                        </div>
                        {sale.paymentType === 'Installment' && (
                          <div>
                            <span className="text-muted-foreground">الدفعة الأولى:</span>
                            <span className="font-medium text-blue-600 ml-1">{formatCurrency(bigAdvancePaid)}</span>
                          </div>
                        )}
                        <div className="col-span-2">
                          <span className="text-muted-foreground">المتبقي:</span>
                          <span className="font-medium ml-1">{formatCurrency((sale as any).remainingAmount ?? sale.price)}</span>
                        </div>
                      </div>
                      
                      {sale.companyFeeAmount && sale.companyFeeAmount > 0 && (
                        <div className="text-xs bg-blue-50 p-2 rounded border border-blue-200">
                          <span className="text-blue-700">عمولة الشركة: {formatCurrency(sale.companyFeeAmount)}</span>
                        </div>
                      )}
                      
                      {user?.role === 'Owner' && (createdByUser || confirmedByUser) && (
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                          {createdByUser && <div>أنشأ: {createdByUser.name}</div>}
                          {confirmedByUser && <div className="text-green-600">أكد: {confirmedByUser.name}</div>}
                        </div>
                      )}
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
                      <TableHead className="w-[150px]">العميل</TableHead>
                      <TableHead className="w-[120px]">القطعة</TableHead>
                      <TableHead className="w-[80px]">النوع</TableHead>
                      <TableHead className="w-[100px] text-right">السعر</TableHead>
                      <TableHead className="w-[100px] text-right">عربون</TableHead>
                      <TableHead className="w-[120px] text-right">الدفعة الأولى</TableHead>
                      <TableHead className="w-[100px] text-right">المتبقي</TableHead>
                      <TableHead className="w-[100px]">الحالة</TableHead>
                      {user?.role === 'Owner' && (
                        <TableHead className="w-[120px]">المستخدم</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedSales.map(sale => (
                      <TableRow key={sale.id}>
                        <TableCell className="font-medium">
                          <button 
                            onClick={() => {
                              const client = clients.find(c => c.id === sale.clientId)
                              if (client) openClientDetails(client)
                            }}
                            className="hover:underline text-primary font-medium"
                          >
                            {sale.clientName}
                          </button>
                        </TableCell>
                        <TableCell>
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
                        <TableCell>
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
                        <TableCell>
                          <Badge 
                            variant={
                              sale.status === 'Completed' ? 'success' :
                              sale.status === 'InstallmentsOngoing' ? 'secondary' :
                              sale.status === 'AwaitingPayment' ? 'warning' : 'destructive'
                            }
                            className="text-xs"
                          >
                            {sale.status === 'Completed' ? 'مباع' :
                             sale.status === 'InstallmentsOngoing' ? 'بالتقسيط' :
                             sale.status === 'Pending' && !sale.bigAdvanceConfirmed && !(sale as any).is_confirmed ? 'غير مؤكد' :
                             sale.status === 'AwaitingPayment' ? 'قيد الدفع' :
                             sale.status === 'Pending' ? 'معلق' : 'ملغي'}
                          </Badge>
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

      {/* New Sale Dialog */}
      <Dialog open={newSaleOpen} onOpenChange={setNewSaleOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>بيع جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>العميل</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewClientOpen(true)
                  }}
                >
                  <Plus className="h-4 w-4 ml-1" />
                  إضافة عميل جديد
                </Button>
              </div>
              <Input
                type="text"
                placeholder="بحث عن العميل (الاسم، رقم الهاتف، أو ID)..."
                value={clientSearch}
                maxLength={255}
                onChange={e => {
                  setClientSearch(e.target.value)
                  debouncedClientSearchFn(e.target.value)
                  // Auto-select if exact match found
                  const exactMatch = clients.find(c => 
                    c.id === e.target.value || 
                    c.phone === e.target.value ||
                    c.name.toLowerCase() === e.target.value.toLowerCase()
                  )
                  if (exactMatch) {
                    setSelectedClient(exactMatch.id)
                  }
                }}
                className="mb-2"
              />
              <Select 
                value={selectedClient} 
                onChange={e => {
                  setSelectedClient(e.target.value)
                  const selected = clients.find(c => c.id === e.target.value)
                  if (selected) {
                    setClientSearch(selected.name)
                  }
                }}
              >
                <option value="">اختر العميل</option>
                {filteredClients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.name} {client.phone ? `- ${client.phone}` : ''}
                  </option>
                ))}
              </Select>
              {clientSearch && filteredClients.length === 0 && (
                <p className="text-xs text-muted-foreground">لم يتم العثور على عميل</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>قطع الأرض ({selectedPieces.length} محددة)</Label>
              <div className="space-y-2">
                <Select 
                  value={pieceBatchFilter} 
                  onChange={e => {
                    setPieceBatchFilter(e.target.value)
                    setSelectedPieces([]) // Clear selected pieces when changing batch
                    setPieceSearch('') // Clear search when changing batch
                  }} 
                  className="w-full"
                >
                  <option value="">اختر موقع الأرض / الدفعة</option>
                  {availableBatchNames.map(batch => (
                    <option key={batch} value={batch}>{batch}</option>
                  ))}
                </Select>
                {pieceBatchFilter && (
                  <>
              <Input
                type="text"
                placeholder="بحث عن قطعة برقم القطعة..."
                value={pieceSearch}
                maxLength={50}
                onChange={e => {
                  setPieceSearch(e.target.value)
                  debouncedPieceSearchFn(e.target.value)
                }}
                      className="w-full"
              />
              <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                {filteredAvailablePieces.length === 0 ? (
                  <p className="text-sm text-muted-foreground">لا توجد قطع متاحة</p>
                ) : (
                  filteredAvailablePieces.map((piece: any) => (
                    <label key={piece.id} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedPieces.includes(piece.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedPieces([...selectedPieces, piece.id])
                          } else {
                            setSelectedPieces(selectedPieces.filter(id => id !== piece.id))
                          }
                        }}
                        className="rounded"
                      />
                      <span className="text-sm">
                              #{piece.piece_number} ({piece.surface_area} م²)
                      </span>
                    </label>
                  ))
                )}
              </div>
              {selectedPieces.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  إجمالي المساحة: {pieces.filter(p => selectedPieces.includes(p.id)).reduce((sum, p: any) => sum + p.surface_area, 0)} م²
                      </p>
                    )}
                  </>
                )}
                {!pieceBatchFilter && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    يرجى اختيار موقع الأرض / الدفعة أولاً
                </p>
              )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>نوع الدفع</Label>
              <Select value={paymentType} onChange={e => setPaymentType(e.target.value as any)}>
                <option value="Full">بالحاضر</option>
                <option value="Installment">بالتقسيط</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>العربون (مبلغ الحجز)</Label>
              <Input
                type="number"
                value={reservationAmount}
                onChange={e => setReservationAmount(e.target.value)}
                placeholder="أدخل مبلغ العربون"
              />
              {reservationAmount && selectedPieces.length > 0 && calculatedTotalPrice > 0 && (
                <p className="text-sm text-muted-foreground">
                  المتبقي: {formatCurrency(calculatedTotalPrice)}
                  <span className="mr-2">(العربون سيُضاف للدفعة الأولى)</span>
                </p>
              )}
            </div>


              <div className="space-y-2">
              <Label htmlFor="deadlineDate">آخر أجل لإتمام الإجراءات (اختياري)</Label>
                <Input
                id="deadlineDate"
                type="date"
                value={deadlineDate}
                onChange={e => setDeadlineDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                />
                <p className="text-xs text-muted-foreground">
                تاريخ آخر أجل لإتمام إجراءات البيع. سيتم عرض تحذيرات عند اقتراب الموعد النهائي.
                </p>
              </div>


          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setNewSaleOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button onClick={createSale} disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting ? 'جاري الإنشاء...' : 'إنشاء البيع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Full Payment Dialog */}
      <Dialog open={confirmFullOpen} onOpenChange={setConfirmFullOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>تأكيد الدفع الكامل</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p><strong>العميل:</strong> {selectedSale.clientName}</p>
                <p><strong>القطعة:</strong> {selectedSale.batchName} - {selectedSale.pieceName}</p>
                <p><strong>السعر:</strong> {formatCurrency(selectedSale.price)}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                سيتم تأكيد استلام الدفعة الكاملة وتحويل حالة القطعة إلى "مباعة".
              </p>
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setConfirmFullOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button onClick={confirmFullPayment} disabled={isSubmitting} className="bg-green-600 w-full sm:w-auto">
              {isSubmitting ? 'جاري التأكيد...' : 'تأكيد الدفع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Big Advance Dialog */}
      <Dialog open={confirmBigAdvanceOpen} onOpenChange={setConfirmBigAdvanceOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تأكيد الدفعة الأولى وإنشاء جدول الأقساط</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                <p><strong>العميل:</strong> {selectedSale.clientName}</p>
                <p><strong>القطعة:</strong> {selectedSale.batchName} - {selectedSale.pieceName}</p>
                <p><strong>السعر الإجمالي:</strong> {formatCurrency(selectedSale.price)}</p>
                {selectedSale.bigAdvanceDueDate && (
                  <p><strong>تاريخ استحقاق الدفعة:</strong> {formatDate(selectedSale.bigAdvanceDueDate)}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>عدد الأشهر</Label>
                <Input
                  type="number"
                  value={numberOfInstallments}
                  onChange={e => setNumberOfInstallments(e.target.value)}
                  placeholder="أدخل عدد الأشهر (مثال: 12)"
                  min="1"
                  max="120"
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
                    تطبيق عمولة الشركة
                  </Label>
                </div>
                {applyCompanyFee && (
                  <div className="space-y-2 pr-6">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="companyFeePercentageInstallment" className="text-sm">النسبة المئوية:</Label>
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
                        <span className="text-muted-foreground">سعر البيع:</span>
                        <span className="font-medium">{formatCurrency(selectedSale.price)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">عمولة الشركة ({companyFeePercentage}%):</span>
                        <span className="font-medium text-blue-600">
                          {formatCurrency((selectedSale.price * parseFloat(companyFeePercentage || '2')) / 100)}
                        </span>
                      </div>
                      <div className="flex justify-between font-bold text-lg pt-1 border-t">
                        <span>المبلغ الإجمالي المستحق:</span>
                        <span className="text-green-600">
                          {formatCurrency(selectedSale.price + (selectedSale.price * parseFloat(companyFeePercentage || '2')) / 100)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>مبلغ الدفعة الأولى المستلم</Label>
                <Input
                  type="number"
                  value={bigAdvancePaidAmount}
                  onChange={e => setBigAdvancePaidAmount(e.target.value)}
                  placeholder="أدخل المبلغ المستلم"
                />
                <p className="text-xs text-muted-foreground">
                  مبلغ الدفعة الأولى فقط (بدون العربون وبدون عمولة الشركة)
                </p>
              </div>

              <div className="space-y-2">
                <Label>تاريخ أول قسط شهري</Label>
                <Input
                  type="date"
                  value={installmentStartDate}
                  onChange={e => setInstallmentStartDate(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  سيتم حساب الأقساط الشهرية ابتداءً من هذا التاريخ
                </p>
              </div>

              {installmentStartDate && numberOfInstallments && bigAdvancePaidAmount && (
                <div className="bg-blue-50 p-3 rounded-lg space-y-1">
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-800">العربون:</span>
                      <span className="font-medium text-blue-800">{formatCurrency(selectedSale.reservationAmount)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-800">مبلغ الدفعة الأولى:</span>
                      <span className="font-medium text-blue-800">{formatCurrency(parseFloat(bigAdvancePaidAmount))}</span>
                    </div>
                    {applyCompanyFee && (
                      <div className="flex justify-between">
                        <span className="text-blue-800">عمولة الشركة ({companyFeePercentage}%):</span>
                        <span className="font-medium text-blue-800">
                          {formatCurrency((selectedSale.price * parseFloat(companyFeePercentage || '2')) / 100)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="border-t pt-2 mt-2">
                    <p className="text-sm text-blue-800 font-bold">
                      <strong>الدفعة الأولى الإجمالية (تشمل العربون + الدفعة الأولى + عمولة الشركة):</strong>{' '}
                      {formatCurrency(
                        parseFloat(bigAdvancePaidAmount) + 
                        selectedSale.reservationAmount + 
                        (applyCompanyFee ? (selectedSale.price * parseFloat(companyFeePercentage || '2')) / 100 : 0)
                      )}
                  </p>
                  </div>
                  <div className="border-t pt-2 mt-2 space-y-1">
                  <p className="text-sm text-blue-800">
                      <strong>المبلغ المتبقي (بعد الدفعة الأولى والعربون):</strong>{' '}
                    {formatCurrency(selectedSale.price - parseFloat(bigAdvancePaidAmount) - selectedSale.reservationAmount)}
                  </p>
                  <p className="text-sm text-blue-800">
                    <strong>القسط الشهري:</strong>{' '}
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

      {/* New Client Dialog */}
      <Dialog open={newClientOpen} onOpenChange={setNewClientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة عميل جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الاسم *</Label>
              <Input
                value={newClientName}
                onChange={e => setNewClientName(e.target.value)}
                placeholder="اسم العميل"
                maxLength={255}
              />
            </div>
            <div className="space-y-2">
              <Label>CIN *</Label>
              <Input
                value={newClientCin}
                onChange={e => setNewClientCin(e.target.value)}
                placeholder="رقم CIN"
                maxLength={50}
              />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف <span className="text-destructive">*</span></Label>
              <Input
                value={newClientPhone}
                onChange={e => setNewClientPhone(e.target.value)}
                placeholder="03123456 أو 70123456"
                maxLength={20}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input
                value={newClientAddress}
                onChange={e => setNewClientAddress(e.target.value)}
                placeholder="العنوان (اختياري)"
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setNewClientOpen(false)
              setNewClientName('')
              setNewClientPhone('')
              setNewClientAddress('')
              setNewClientCin('')
            }}>
              إلغاء
            </Button>
            <Button onClick={createNewClient} disabled={creatingClient}>
              إضافة واختيار
            </Button>
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
                  <p className="text-sm text-muted-foreground">الاسم</p>
                  <p className="font-medium">{selectedClientForDetails.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">رقم CIN</p>
                  <p className="font-medium">{selectedClientForDetails.cin}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">رقم الهاتف</p>
                  <p className="font-medium">{selectedClientForDetails.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">البريد الإلكتروني</p>
                  <p className="font-medium">{selectedClientForDetails.email || '-'}</p>
                </div>
                {selectedClientForDetails.address && (
                  <div className="sm:col-span-2">
                    <p className="text-sm text-muted-foreground">العنوان</p>
                    <p className="font-medium">{selectedClientForDetails.address}</p>
                  </div>
                )}
              </div>

              {clientSales.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">سجل المبيعات</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>التاريخ</TableHead>
                          <TableHead>النوع</TableHead>
                          <TableHead>السعر</TableHead>
                          <TableHead>الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientSales.map((sale) => (
                          <TableRow key={sale.id}>
                            <TableCell>{formatDate(sale.sale_date)}</TableCell>
                            <TableCell>{sale.payment_type === 'Full' ? 'بالحاضر' : 'بالتقسيط'}</TableCell>
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
                                 'غير مؤكد'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
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
