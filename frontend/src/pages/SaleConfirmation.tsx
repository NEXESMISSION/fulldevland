import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { retryWithBackoff, isRetryableError } from '@/lib/retry'
import { CheckCircle, XCircle, Clock, DollarSign, AlertTriangle, Calendar } from 'lucide-react'
import { showNotification } from '@/components/ui/notification'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Sale, Client, LandPiece, PaymentOffer } from '@/types/database'

interface Rendezvous {
  id: string
  sale_id: string
  rendezvous_date: string
  rendezvous_time: string
  notes: string | null
  status: string
}

interface SaleWithDetails extends Sale {
  client: Client | null
  land_pieces: LandPiece[]
  _totalBigAdvancePaid?: number
  _totalPaid?: number
  rendezvous?: Rendezvous[]
}

export function SaleConfirmation() {
  const { hasPermission, user } = useAuth()
  const { t } = useLanguage()
  const [sales, setSales] = useState<SaleWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSale, setSelectedSale] = useState<SaleWithDetails | null>(null)
  const [selectedPiece, setSelectedPiece] = useState<LandPiece | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmBeforeConfirmOpen, setConfirmBeforeConfirmOpen] = useState(false)
  const [pendingConfirmationType, setPendingConfirmationType] = useState<'full' | 'bigAdvance' | null>(null)
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('')
  
  // Confirmation form state
  const [companyFeePercentage, setCompanyFeePercentage] = useState('2')
  const [numberOfInstallments, setNumberOfInstallments] = useState('12')
  const [receivedAmount, setReceivedAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [confirmationNotes, setConfirmationNotes] = useState('')
  const [confirmationType, setConfirmationType] = useState<'full' | 'bigAdvance'>('full')
  const [installmentStartDate, setInstallmentStartDate] = useState('')
  const [selectedOffer, setSelectedOffer] = useState<PaymentOffer | null>(null)
  
  // Client details dialog
  const [clientDetailsOpen, setClientDetailsOpen] = useState(false)
  const [selectedClientForDetails, setSelectedClientForDetails] = useState<Client | null>(null)
  const [clientSales, setClientSales] = useState<Sale[]>([])
  
  // Rendez-vous dialog
  const [rendezvousDialogOpen, setRendezvousDialogOpen] = useState(false)
  const [rendezvousDate, setRendezvousDate] = useState('')
  const [rendezvousTime, setRendezvousTime] = useState('')
  const [rendezvousNotes, setRendezvousNotes] = useState('')
  const [selectedSaleForRendezvous, setSelectedSaleForRendezvous] = useState<SaleWithDetails | null>(null)

  // Check permissions - anyone with edit_sales or sale_confirm permission
  const canAccess = hasPermission('edit_sales') || hasPermission('sale_confirm')
  
  // Helper function to format rendezvous date and time in a clean, readable way
  const formatRendezvousDateTime = (date: string, time: string): string => {
    const dateObj = new Date(date)
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    const day = dateObj.getDate()
    const month = months[dateObj.getMonth()]
    const year = dateObj.getFullYear()
    
    // Format time (HH:MM)
    const [hours, minutes] = time.split(':')
    const formattedTime = `${hours}:${minutes}`
    
    return `${day} ${month} ${year}، ${formattedTime}`
  }
  
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

  const openRendezvousDialog = (sale: SaleWithDetails) => {
    setSelectedSaleForRendezvous(sale)
    // Set default date to tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setRendezvousDate(tomorrow.toISOString().split('T')[0])
    setRendezvousTime('09:00')
    setRendezvousNotes('')
    setRendezvousDialogOpen(true)
  }

  const handleCreateRendezvous = async () => {
    if (!selectedSaleForRendezvous || !rendezvousDate || !rendezvousTime) {
      showNotification('يرجى إدخال التاريخ والوقت', 'error')
      return
    }

    try {
      const { error } = await supabase
        .from('sale_rendezvous')
        .insert([{
          sale_id: selectedSaleForRendezvous.id,
          rendezvous_date: rendezvousDate,
          rendezvous_time: rendezvousTime,
          notes: rendezvousNotes || null,
          status: 'scheduled',
          created_by: user?.id || null,
        }])

      if (error) throw error

      showNotification('تم إنشاء الموعد بنجاح', 'success')
      setRendezvousDialogOpen(false)
      setRendezvousDate('')
      setRendezvousTime('')
      setRendezvousNotes('')
      setSelectedSaleForRendezvous(null)
      
      // Refresh sales to show the new rendezvous
      await fetchSales()
    } catch (err) {
      console.error('Error creating rendezvous:', err)
      showNotification('حدث خطأ أثناء إنشاء الموعد', 'error')
    }
  }
  
  // Filter sales based on search and filters - MUST be before any early returns
  const filteredSales = useMemo(() => {
    return sales.filter(sale => {
      const client = sale.client
      const clientName = client?.name?.toLowerCase() || ''
      const clientPhone = client?.phone?.toLowerCase() || ''
      const saleId = sale.id.toLowerCase()
      
      // Search filter
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        const matchesSearch = 
          clientName.includes(search) ||
          clientPhone.includes(search) ||
          saleId.includes(search) ||
          sale.land_pieces.some((p: any) => 
            p.piece_number?.toLowerCase().includes(search) ||
            p.land_batch?.name?.toLowerCase().includes(search)
          )
        if (!matchesSearch) return false
      }
      
      return true
    })
  }, [sales, searchTerm])


  useEffect(() => {
    if (!canAccess) {
      setError('ليس لديك صلاحية للوصول إلى هذه الصفحة')
      setLoading(false)
      return
    }
    fetchSales()
  }, [canAccess])

  const fetchSales = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const { data: salesData, error: salesError } = await retryWithBackoff(async () => {
        // First get sales with selected offer
        const res = await supabase
          .from('sales')
          .select(`
            *,
            client:clients(*),
            selected_offer:payment_offers!selected_offer_id(*)
          `)
          .eq('status', 'Pending')
          .order('sale_date', { ascending: false })
          .order('created_at', { ascending: false })
        
        if (res.error) throw res.error
        
        // Get all sale IDs to fetch payments
        const saleIds = (res.data || []).map((s: any) => s.id)
        
        // Fetch payments for all sales
        let paymentsData: any[] = []
        if (saleIds.length > 0) {
          const { data: payments, error: paymentsError } = await supabase
            .from('payments')
            .select('sale_id, amount_paid, payment_type')
            .in('sale_id', saleIds)
          
          if (paymentsError) {
            console.warn('Error fetching payments:', paymentsError)
          } else {
            paymentsData = payments || []
          }
        }
        
        // Calculate total big advance paid per sale
        const bigAdvancePaidBySale: Record<string, number> = {}
        const totalPaidBySale: Record<string, number> = {}
        paymentsData.forEach((payment: any) => {
          if (payment.sale_id) {
            const amount = parseFloat(payment.amount_paid || 0)
            totalPaidBySale[payment.sale_id] = (totalPaidBySale[payment.sale_id] || 0) + amount
            
            if (payment.payment_type === 'BigAdvance') {
              bigAdvancePaidBySale[payment.sale_id] = (bigAdvancePaidBySale[payment.sale_id] || 0) + amount
            }
          }
        })
        
        // Filter out sales where big advance has been fully paid
        const salesNeedingConfirmation = (res.data || []).filter((sale: any) => {
          const totalBigAdvancePaid = bigAdvancePaidBySale[sale.id] || 0
          const totalPaid = totalPaidBySale[sale.id] || 0
          const requiredBigAdvance = parseFloat(sale.big_advance_amount || 0)
          const totalSellingPrice = parseFloat(sale.total_selling_price || 0)
          const smallAdvance = parseFloat(sale.small_advance_amount || 0)
          
          // If this is an installment sale and big advance is required
          if (sale.payment_type === 'Installment' && requiredBigAdvance > 0) {
            // If big advance has been fully paid, exclude from confirmation page
            if (totalBigAdvancePaid >= requiredBigAdvance) {
              // Auto-update sale status if big advance is fully paid
              supabase
                .from('sales')
                .update({ 
                  status: 'Pending' // Keep as Pending for installment sales
                } as any)
                .eq('id', sale.id)
                .then(({ error }) => {
                  if (error) console.warn('Error auto-updating sale status:', error)
                })
              return false // Exclude from list
            }
          }
          
          // If this is a full payment sale and full amount has been paid
          if (sale.payment_type === 'Full' && totalPaid >= totalSellingPrice) {
            // Auto-update sale status
            supabase
              .from('sales')
              .update({ 
                status: 'Completed'
              } as any)
              .eq('id', sale.id)
              .then(({ error }) => {
                if (error) console.warn('Error auto-updating sale status:', error)
              })
            return false // Exclude from list
          }
          
          // If this is a PromiseOfSale and has been completed
          if (sale.payment_type === 'PromiseOfSale' && sale.promise_completed) {
            return false // Exclude completed promises
          }
          
          return true // Include in list
        })
        
        // Then get land pieces for remaining sales
        if (salesNeedingConfirmation.length > 0) {
          const allPieceIds = new Set<string>()
          salesNeedingConfirmation.forEach((sale: any) => {
            if (sale.land_piece_ids && Array.isArray(sale.land_piece_ids)) {
              sale.land_piece_ids.forEach((id: string) => allPieceIds.add(id))
            }
          })
          
          if (allPieceIds.size > 0) {
            const { data: piecesData, error: piecesError } = await supabase
              .from('land_pieces')
              .select('*, land_batch:land_batches(name, company_fee_percentage_full)')
              .in('id', Array.from(allPieceIds))
            
            if (piecesError) {
              console.warn('Error fetching pieces:', piecesError)
            }
            
            // Attach pieces to each sale
            salesNeedingConfirmation.forEach((sale: any) => {
              sale.land_pieces = (piecesData || []).filter((p: any) => 
                sale.land_piece_ids && Array.isArray(sale.land_piece_ids) && sale.land_piece_ids.includes(p.id)
              )
              
              // Attach payment info for display
              sale._totalBigAdvancePaid = bigAdvancePaidBySale[sale.id] || 0
              sale._totalPaid = totalPaidBySale[sale.id] || 0
            })
          } else {
            salesNeedingConfirmation.forEach((sale: any) => {
              sale.land_pieces = []
            })
          }
          
          // Fetch rendezvous data for all sales
          const { data: rendezvousData, error: rendezvousError } = await supabase
            .from('sale_rendezvous')
            .select('*')
            .in('sale_id', salesNeedingConfirmation.map((s: any) => s.id))
            .eq('status', 'scheduled')
            .order('rendezvous_date', { ascending: true })
            .order('rendezvous_time', { ascending: true })
          
          if (rendezvousError) {
            console.warn('Error fetching rendezvous:', rendezvousError)
          } else {
            // Attach rendezvous to each sale
            salesNeedingConfirmation.forEach((sale: any) => {
              sale.rendezvous = (rendezvousData || []).filter((r: any) => r.sale_id === sale.id)
            })
          }
        }
        
        return { data: salesNeedingConfirmation, error: null }
      })

      if (salesError) throw salesError
      
      setSales((salesData as any[]) || [])
    } catch (err) {
      const error = err as Error
      console.error('Error fetching sales:', error)
      if (isRetryableError(error)) {
        setError('خطأ في الاتصال. يرجى المحاولة مرة أخرى.')
      } else {
        setError('حدث خطأ أثناء تحميل المبيعات')
      }
    } finally {
      setLoading(false)
    }
  }

  const openConfirmDialog = async (sale: SaleWithDetails, piece: LandPiece, type: 'full' | 'bigAdvance') => {
    setSelectedSale(sale)
    setSelectedPiece(piece)
    setConfirmationType(type)
    
    // Load payment offer for this piece
    // If sale has selected_offer_id (reserved sale), use that offer
    // Otherwise, try to get offer from piece or batch
    let offer: PaymentOffer | null = null
    try {
      // First, if sale has selected_offer_id, use that offer
      if (sale.selected_offer_id) {
        const { data: selectedOfferData } = await supabase
          .from('payment_offers')
          .select('*')
          .eq('id', sale.selected_offer_id)
          .single()
        
        if (selectedOfferData) {
          offer = selectedOfferData as PaymentOffer
        }
      }
      
      // If no selected offer, try to get offer from piece
      if (!offer) {
        const { data: pieceOffers } = await supabase
          .from('payment_offers')
          .select('*')
          .eq('land_piece_id', piece.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(1)
        
        if (pieceOffers && pieceOffers.length > 0) {
          offer = pieceOffers[0] as PaymentOffer
        }
      }
      
      // If still no offer, try to get offer from batch
      if (!offer) {
        const { data: batchOffers } = await supabase
          .from('payment_offers')
          .select('*')
          .eq('land_batch_id', piece.land_batch_id)
          .is('land_piece_id', null) // Only batch offers
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
          .limit(1)
        
        if (batchOffers && batchOffers.length > 0) {
          offer = batchOffers[0] as PaymentOffer
        }
      }
    } catch (error) {
      console.error('Error loading payment offer:', error)
    }
    
    setSelectedOffer(offer)
    
    // Set company fee from offer or sale
    if (offer) {
      setCompanyFeePercentage(offer.company_fee_percentage.toString())
    } else {
    setCompanyFeePercentage(sale.company_fee_percentage?.toString() || '2')
    }
    
    // Calculate values using the offer - need to calculate pricePerPiece first
    let calculatedPricePerPiece = 0
    if (sale.payment_type === 'Installment' && offer && offer.price_per_m2_installment) {
      // Use offer price per m²
      calculatedPricePerPiece = piece.surface_area * offer.price_per_m2_installment
    } else if (sale.payment_type === 'Installment') {
      calculatedPricePerPiece = piece.selling_price_installment || piece.selling_price_full || 0
    } else {
      calculatedPricePerPiece = piece.selling_price_full || 0
    }
    
    // If still 0, fall back to dividing total
    if (calculatedPricePerPiece === 0) {
      const pieceCount = sale.land_piece_ids.length
      calculatedPricePerPiece = sale.total_selling_price / pieceCount
    }
    
    const pieceCount = sale.land_piece_ids.length
    const reservationPerPiece = (sale.small_advance_amount || 0) / pieceCount
    
    // Calculate company fee
    let companyFeePercentage = 0
    if (sale.payment_type === 'Installment' && offer) {
      companyFeePercentage = offer.company_fee_percentage || 0
    } else if (sale.payment_type === 'Full' || sale.payment_type === 'PromiseOfSale') {
      const batch = (piece as any).land_batch
      companyFeePercentage = batch?.company_fee_percentage_full || sale.company_fee_percentage || 0
    } else {
      companyFeePercentage = sale.company_fee_percentage || 0
    }
    
    const companyFeePerPiece = (calculatedPricePerPiece * companyFeePercentage) / 100
    const totalPayablePerPiece = calculatedPricePerPiece + companyFeePerPiece
    
    // Calculate number of months from offer if available
    if (offer && type === 'bigAdvance' && sale.payment_type === 'Installment') {
      // Advance should be calculated from totalPayablePerPiece (price + company fee), not just price
      const advanceAmount = offer.advance_is_percentage
        ? (totalPayablePerPiece * offer.advance_amount) / 100
        : offer.advance_amount
      const remainingAmount = totalPayablePerPiece - reservationPerPiece - advanceAmount
      
      let numberOfMonths = 0
      if (offer.monthly_payment && offer.monthly_payment > 0) {
        numberOfMonths = remainingAmount > 0 ? Math.ceil(remainingAmount / offer.monthly_payment) : 0
      } else if (offer.number_of_months && offer.number_of_months > 0) {
        numberOfMonths = offer.number_of_months
      } else {
        numberOfMonths = 12
      }
      setNumberOfInstallments(numberOfMonths.toString())
    } else {
    setNumberOfInstallments(sale.number_of_installments?.toString() || '12')
    }
    
    // Auto-fill received amount (advance) for installment from offer
    if (type === 'bigAdvance' && sale.payment_type === 'Installment' && offer) {
      // Advance should be calculated from totalPayablePerPiece (price + company fee), not just price
      const advanceAmount = offer.advance_is_percentage
        ? (totalPayablePerPiece * offer.advance_amount) / 100
        : offer.advance_amount
      setReceivedAmount(advanceAmount.toFixed(2))
    } else if (type === 'full') {
      // For full payment, calculate remaining amount using company_fee_percentage_full from batch
      const pieceCount = sale.land_piece_ids.length
      // Use actual piece price if available
      let pricePerPiece = piece.selling_price_full || 0
      if (pricePerPiece === 0) {
        pricePerPiece = sale.total_selling_price / pieceCount
      }
      const reservationPerPiece = (sale.small_advance_amount || 0) / pieceCount
      
      // Get company fee from batch for full payment
      const batch = (piece as any).land_batch
      const feePercentage = batch?.company_fee_percentage_full || sale.company_fee_percentage || (companyFeePercentage ? parseFloat(String(companyFeePercentage)) : 0) || 0
      const companyFeePerPiece = (pricePerPiece * feePercentage) / 100
      const totalPayablePerPiece = pricePerPiece + companyFeePerPiece
      
      // For PromiseOfSale, also subtract initial payment already received
      let remainingAmount = totalPayablePerPiece - reservationPerPiece
      if (sale.payment_type === 'PromiseOfSale') {
        const initialPaymentPerPiece = (sale.promise_initial_payment || 0) / pieceCount
        remainingAmount = totalPayablePerPiece - reservationPerPiece - initialPaymentPerPiece
      }
      setReceivedAmount(remainingAmount.toFixed(2))
      
      // Set company fee percentage for display
      if (batch?.company_fee_percentage_full) {
        setCompanyFeePercentage(batch.company_fee_percentage_full.toString())
      } else if (sale.company_fee_percentage) {
        setCompanyFeePercentage(sale.company_fee_percentage.toString())
      }
    } else {
      setReceivedAmount('')
    }
    
    // Set default installment start date to today
    setInstallmentStartDate(new Date().toISOString().split('T')[0])
    
    setPaymentMethod('cash')
    setConfirmationNotes('')
    setConfirmDialogOpen(true)
  }

  // Calculate per-piece values
  const calculatePieceValues = (sale: SaleWithDetails, piece: LandPiece, offer?: PaymentOffer | null) => {
    const pieceCount = sale.land_piece_ids.length
    
    // Get the offer to use - prioritize passed offer, then selectedOffer state, then sale's selected_offer
    const offerToUse = offer || selectedOffer || ((sale as any).selected_offer as PaymentOffer | null)
    
    // Use actual piece price instead of dividing total by count
    // This ensures correct calculation when pieces have different prices
    let pricePerPiece = 0
    if (sale.payment_type === 'Full' || sale.payment_type === 'PromiseOfSale') {
      pricePerPiece = piece.selling_price_full || 0
    } else {
      // For installment, use offer price if available, otherwise piece price
      if (offerToUse && offerToUse.price_per_m2_installment) {
        pricePerPiece = (piece.surface_area * offerToUse.price_per_m2_installment)
      } else {
        pricePerPiece = piece.selling_price_installment || piece.selling_price_full || 0
      }
    }
    
    // If piece price is not available, fall back to dividing total
    if (pricePerPiece === 0) {
      pricePerPiece = sale.total_selling_price / pieceCount
    }
    
    const reservationPerPiece = (sale.small_advance_amount || 0) / pieceCount
    
    // Use company fee based on payment type
    let feePercentage = 0
    if (sale.payment_type === 'Full' || sale.payment_type === 'PromiseOfSale') {
      // For Full payment or PromiseOfSale, use company_fee_percentage_full from batch
      const batch = (piece as any).land_batch
      feePercentage = batch?.company_fee_percentage_full || sale.company_fee_percentage || parseFloat(companyFeePercentage) || 0
    } else {
      // For Installment, use company fee from offer if available, otherwise from sale or form
      feePercentage = offerToUse 
        ? (offerToUse.company_fee_percentage || 0)
        : (sale.company_fee_percentage || parseFloat(companyFeePercentage) || 0)
    }
    
    const companyFeePerPiece = (pricePerPiece * feePercentage) / 100
    const totalPayablePerPiece = pricePerPiece + companyFeePerPiece
    
    // Calculate advance amount (التسبقة) from offer if available
    let advancePerPiece = 0
    if (sale.payment_type === 'Installment' && offerToUse) {
      if (offerToUse.advance_is_percentage) {
        advancePerPiece = (pricePerPiece * offerToUse.advance_amount) / 100
      } else {
        advancePerPiece = offerToUse.advance_amount
      }
    } else if (sale.payment_type === 'Installment' && sale.big_advance_amount) {
      // Fallback to sale's big_advance_amount if no offer
      advancePerPiece = sale.big_advance_amount / pieceCount
    }
    
    return {
      pricePerPiece,
      reservationPerPiece,
      companyFeePerPiece,
      totalPayablePerPiece,
      advancePerPiece,
      feePercentage,
      offer: offerToUse
    }
  }

  const handleCancelPiece = async (sale: SaleWithDetails, piece: LandPiece) => {
    if (!confirm('هل أنت متأكد من إلغاء هذه القطعة وإعادتها إلى الحالة المتاحة؟ سيتم استرداد المبلغ المدفوع لهذه القطعة.')) {
      return
    }

    try {
      setError(null)
      
      const pieceCount = sale.land_piece_ids.length
      
      // Get all payments for this sale to calculate refund per piece
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('amount_paid')
        .eq('sale_id', sale.id)
      
      const totalPaid = (paymentsData || []).reduce((sum, p) => sum + (parseFloat(p.amount_paid.toString()) || 0), 0)
      const paidPerPiece = totalPaid / pieceCount
      
      if (pieceCount === 1) {
        // Only one piece - cancel the entire sale
        const { error: cancelError } = await supabase
          .from('sales')
          .update({ status: 'Cancelled' } as any)
          .eq('id', sale.id)
        
        if (cancelError) throw cancelError
        
        // Create refund if money was paid
        if (totalPaid > 0) {
          await supabase.from('payments').insert([{
            client_id: sale.client_id,
            sale_id: sale.id,
            amount_paid: -totalPaid,
            payment_type: 'Refund',
            payment_date: new Date().toISOString().split('T')[0],
            notes: `استرداد لإلغاء البيع #${sale.id.slice(0, 8)}`,
            recorded_by: user?.id || null,
          }] as any)
        }
        
        // Release the piece
        await supabase
          .from('land_pieces')
          .update({ status: 'Available' } as any)
          .eq('id', piece.id)
      } else {
        // Multiple pieces - split the sale
        const pricePerPiece = sale.total_selling_price / pieceCount
        const costPerPiece = sale.total_purchase_cost / pieceCount
        const profitPerPiece = sale.profit_margin / pieceCount
        const reservationPerPiece = (sale.small_advance_amount || 0) / pieceCount
        
        // Create a new cancelled sale for this piece
        const { data: cancelledSale, error: newSaleError } = await supabase
          .from('sales')
          .insert([{
            client_id: sale.client_id,
            land_piece_ids: [piece.id],
            payment_type: sale.payment_type,
            total_purchase_cost: costPerPiece,
            total_selling_price: pricePerPiece,
            profit_margin: profitPerPiece,
            small_advance_amount: reservationPerPiece,
            big_advance_amount: 0,
            number_of_installments: null,
            monthly_installment_amount: null,
            status: 'Cancelled',
            sale_date: sale.sale_date,
            notes: `إلغاء قطعة من البيع #${sale.id.slice(0, 8)}`,
          }] as any)
          .select()
          .single()
        
        if (newSaleError) throw newSaleError
        
        // Create refund for this piece if money was paid
        if (paidPerPiece > 0 && cancelledSale) {
          await supabase.from('payments').insert([{
            client_id: sale.client_id,
            sale_id: cancelledSale.id,
            amount_paid: -paidPerPiece,
            payment_type: 'Refund',
            payment_date: new Date().toISOString().split('T')[0],
            notes: `استرداد لإلغاء القطعة #${piece.piece_number}`,
            recorded_by: user?.id || null,
          }] as any)
        }
        
        // Release the piece
        await supabase
          .from('land_pieces')
          .update({ status: 'Available' } as any)
          .eq('id', piece.id)
        
        // Update the original sale - remove this piece and recalculate
        const remainingPieces = sale.land_piece_ids.filter(id => id !== piece.id)
        const remainingCount = remainingPieces.length
        const remainingPrice = sale.total_selling_price - pricePerPiece
        const remainingCost = sale.total_purchase_cost - costPerPiece
        const remainingProfit = sale.profit_margin - profitPerPiece
        const remainingReservation = (sale.small_advance_amount || 0) - reservationPerPiece
        
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
          .eq('id', sale.id)
      }
      
      fetchSales()
    } catch (err) {
      console.error('Error cancelling piece:', err)
      setError('حدث خطأ أثناء إلغاء القطعة: ' + ((err as Error).message || 'خطأ غير معروف'))
    }
  }

  const handleConfirmation = async () => {
    if (!selectedSale || !selectedPiece) return
    
    // Show pre-confirmation dialog first for installment sales
    if (confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment') {
      // For installment, show confirmation dialog before proceeding
      setConfirmBeforeConfirmOpen(true)
      return
    }
    
    // For full payment, proceed directly without pre-confirmation
    await proceedWithConfirmation()
  }

  const proceedWithConfirmation = async () => {
    if (!selectedSale || !selectedPiece) return
    
    setConfirming(true)
    setError(null)
    setConfirmBeforeConfirmOpen(false)
    
    try {
      const pieceCount = selectedSale.land_piece_ids.length
      const { pricePerPiece, reservationPerPiece, companyFeePerPiece, totalPayablePerPiece } = calculatePieceValues(selectedSale, selectedPiece)
      const received = parseFloat(receivedAmount) || 0
      
      // For full payment, just ensure the amount is positive
      // The amount is auto-calculated by the system, so we don't need strict validation
      if (confirmationType === 'full') {
        if (received <= 0) {
          setError('المبلغ المستلم يجب أن يكون أكبر من صفر')
          setConfirming(false)
          return
        }
      } else if (confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment') {
        // For installment, use advance amount from offer
        if (selectedOffer) {
          // Advance should be calculated from totalPayablePerPiece (price + company fee), not just price
          const advanceAmount = selectedOffer.advance_is_percentage
            ? (totalPayablePerPiece * selectedOffer.advance_amount) / 100
            : selectedOffer.advance_amount
          if (Math.abs(received - advanceAmount) > 0.01) {
            setError(`التسبقة يجب أن تكون ${formatCurrency(advanceAmount)} حسب العرض المختار`)
            setConfirming(false)
            return
          }
        }
      }

      if (pieceCount === 1) {
        // Single piece - update the sale directly
        const offerToUse = selectedOffer || ((selectedSale as any).selected_offer as PaymentOffer | null)
        const { feePercentage } = calculatePieceValues(selectedSale, selectedPiece, offerToUse)
        const updates: any = {
          company_fee_percentage: feePercentage > 0 ? feePercentage : null,
          company_fee_amount: companyFeePerPiece > 0 ? parseFloat(companyFeePerPiece.toFixed(2)) : null,
        }

        if (confirmationType === 'full') {
          if (selectedSale.payment_type === 'PromiseOfSale') {
            updates.promise_completed = true
          }
          updates.status = 'Completed'
          updates.big_advance_amount = 0
        } else if (confirmationType === 'bigAdvance') {
          updates.big_advance_amount = received
          updates.status = 'Pending'
          
          // If this is an installment sale, create installments automatically
          if (selectedSale.payment_type === 'Installment') {
            // Calculate from offer if available
            let installments = 0
            let monthlyAmount = 0
            
            const remainingAfterAdvance = totalPayablePerPiece - reservationPerPiece - received
            if (remainingAfterAdvance <= 0) {
              setError('المبلغ المتبقي بعد التسبقة والعربون يجب أن يكون أكبر من صفر')
              setConfirming(false)
              return
            }
            
            if (selectedOffer && selectedOffer.monthly_payment && selectedOffer.monthly_payment > 0) {
              // Offer has monthly_payment - calculate number of months
              installments = Math.ceil(remainingAfterAdvance / selectedOffer.monthly_payment)
              monthlyAmount = selectedOffer.monthly_payment
            } else if (selectedOffer && selectedOffer.number_of_months && selectedOffer.number_of_months > 0) {
              // Offer has number_of_months - calculate monthly payment
              installments = selectedOffer.number_of_months
              monthlyAmount = remainingAfterAdvance / selectedOffer.number_of_months
            } else {
              // No offer or offer doesn't have payment info - use form values
              installments = parseInt(numberOfInstallments) || selectedSale.number_of_installments || 12
              if (installments <= 0) {
                setError('عدد الأشهر يجب أن يكون أكبر من صفر')
              setConfirming(false)
              return
              }
              monthlyAmount = remainingAfterAdvance / installments
            }
            
            updates.number_of_installments = installments
            updates.monthly_installment_amount = parseFloat(monthlyAmount.toFixed(2))
            updates.installment_start_date = installmentStartDate || new Date().toISOString().split('T')[0]
            
            // Delete existing installments for this sale to avoid duplicates
            const { error: deleteError } = await supabase
              .from('installments')
              .delete()
              .eq('sale_id', selectedSale.id)
            
            if (deleteError) {
              console.warn('Error deleting existing installments:', deleteError)
              // Continue anyway - might be first time creating installments
            }
            
            // Create installments schedule
            const installmentsToCreate = []
            const startDate = new Date(installmentStartDate || new Date())
            startDate.setHours(0, 0, 0, 0) // Ensure consistent date handling
            for (let i = 0; i < installments; i++) {
              const dueDate = new Date(startDate)
              // First installment (i=0) should be on startDate, second (i=1) should be 1 month later, etc.
              dueDate.setMonth(dueDate.getMonth() + i)
              installmentsToCreate.push({
                sale_id: selectedSale.id,
                installment_number: i + 1,
                amount_due: parseFloat(monthlyAmount.toFixed(2)),
                amount_paid: 0,
                stacked_amount: 0,
                due_date: dueDate.toISOString().split('T')[0],
                status: 'Unpaid',
              })
            }
            
            const { error: installmentsError } = await supabase.from('installments').insert(installmentsToCreate as any)
            if (installmentsError) throw installmentsError
          }
        }

        if (confirmationNotes) {
          updates.notes = (selectedSale.notes || '') + '\n' + confirmationNotes
        }

        // Update land piece status first
        if (confirmationType === 'full') {
          const { error: pieceError } = await supabase
            .from('land_pieces')
            .update({ status: 'Sold' } as any)
            .eq('id', selectedPiece.id)
          if (pieceError) throw pieceError
        } else {
          const { error: pieceError } = await supabase
            .from('land_pieces')
            .update({ status: 'Reserved' } as any)
            .eq('id', selectedPiece.id)
          if (pieceError) throw pieceError

          // When piece becomes Reserved, create a copy of batch offers as piece-specific offers
          // This allows the reserved piece to have its own offers that can be modified independently
          if (selectedPiece.land_batch_id) {
            // Fetch all batch offers
            const { data: batchOffers } = await supabase
              .from('payment_offers')
              .select('*')
              .eq('land_batch_id', selectedPiece.land_batch_id)
            
            if (batchOffers && batchOffers.length > 0) {
              // Check if piece already has offers (to avoid duplicates)
              const { data: existingPieceOffers } = await supabase
                .from('payment_offers')
                .select('id')
                .eq('land_piece_id', selectedPiece.id)
              
              // Only create copies if piece doesn't already have offers
              if (!existingPieceOffers || existingPieceOffers.length === 0) {
                // Create copies of batch offers as piece-specific offers
                const pieceOffersToCreate = batchOffers.map((offer: any) => ({
                  land_batch_id: null, // Piece-specific offers don't reference batch
                  land_piece_id: selectedPiece.id,
                  price_per_m2_installment: offer.price_per_m2_installment,
                  company_fee_percentage: offer.company_fee_percentage,
                  advance_amount: offer.advance_amount,
                  advance_is_percentage: offer.advance_is_percentage,
                  monthly_payment: offer.monthly_payment,
                  number_of_months: offer.number_of_months,
                  offer_name: offer.offer_name,
                  notes: offer.notes,
                  is_default: offer.is_default,
                  created_by: user?.id || null,
                }))

                // Insert all piece offers
                const { error: offersError } = await supabase
                  .from('payment_offers')
                  .insert(pieceOffersToCreate)
                
                if (offersError) {
                  console.error('Error creating piece offers:', offersError)
                  // Don't throw - piece status update was successful, offers are secondary
                }
              }
            }
          }
        }

        // Update sale status
        const { error: updateError, data: updatedSale } = await supabase
          .from('sales')
          .update(updates)
          .eq('id', selectedSale.id)
          .select()
          .single()

        if (updateError) throw updateError

        // Create payment record
        if (received > 0) {
          const paymentType = confirmationType === 'full' ? 'Full' : 'BigAdvance'
          const { error: paymentError } = await supabase.from('payments').insert([{
            client_id: selectedSale.client_id,
            sale_id: selectedSale.id,
            amount_paid: received,
            payment_type: paymentType,
            payment_date: new Date().toISOString().split('T')[0],
            notes: confirmationNotes || null,
            recorded_by: user?.id || null,
          }] as any)
          if (paymentError) throw paymentError
        }

        // Verify the update worked
        if (confirmationType === 'full' && updatedSale && updatedSale.status !== 'Completed') {
          console.warn('Sale status was not updated to Completed, retrying...')
          const { error: retryError } = await supabase
            .from('sales')
            .update({ status: 'Completed' } as any)
            .eq('id', selectedSale.id)
          if (retryError) throw retryError
        }
      } else {
        // Multiple pieces - split the sale
        const costPerPiece = selectedSale.total_purchase_cost / pieceCount
        const profitPerPiece = selectedSale.profit_margin / pieceCount
        const { feePercentage: calculatedFeePercentage } = calculatePieceValues(selectedSale, selectedPiece)
        
        // Create a new sale for this piece
        const newSaleData: any = {
          client_id: selectedSale.client_id,
          land_piece_ids: [selectedPiece.id],
          payment_type: selectedSale.payment_type,
          total_purchase_cost: costPerPiece,
          total_selling_price: pricePerPiece,
          profit_margin: profitPerPiece,
          small_advance_amount: reservationPerPiece,
          company_fee_percentage: calculatedFeePercentage > 0 ? calculatedFeePercentage : null,
          company_fee_amount: companyFeePerPiece > 0 ? parseFloat(companyFeePerPiece.toFixed(2)) : null,
          big_advance_amount: 0,
          number_of_installments: null,
          monthly_installment_amount: null,
          status: confirmationType === 'full' ? 'Completed' : 'Pending',
          sale_date: selectedSale.sale_date,
          notes: `تأكيد قطعة من البيع #${selectedSale.id.slice(0, 8)}`,
          created_by: selectedSale.created_by || user?.id || null, // Keep original creator
        }

        if (confirmationType === 'full') {
          if (selectedSale.payment_type === 'PromiseOfSale') {
            newSaleData.promise_completed = true
          }
          newSaleData.status = 'Completed'
          newSaleData.big_advance_amount = 0
        } else if (confirmationType === 'bigAdvance') {
          newSaleData.big_advance_amount = received
          newSaleData.status = 'Pending'
          
          // If this is an installment sale, create installments automatically
          if (selectedSale.payment_type === 'Installment') {
            // Calculate from offer if available
            let installments = 0
            let monthlyAmount = 0
            
            const remainingAfterAdvance = totalPayablePerPiece - reservationPerPiece - received
            if (remainingAfterAdvance <= 0) {
              setError('المبلغ المتبقي بعد التسبقة والعربون يجب أن يكون أكبر من صفر')
              setConfirming(false)
              return
            }
            
            if (selectedOffer && selectedOffer.monthly_payment && selectedOffer.monthly_payment > 0) {
              // Offer has monthly_payment - calculate number of months
              installments = Math.ceil(remainingAfterAdvance / selectedOffer.monthly_payment)
              monthlyAmount = selectedOffer.monthly_payment
            } else if (selectedOffer && selectedOffer.number_of_months && selectedOffer.number_of_months > 0) {
              // Offer has number_of_months - calculate monthly payment
              installments = selectedOffer.number_of_months
              monthlyAmount = remainingAfterAdvance / selectedOffer.number_of_months
            } else {
              // No offer or offer doesn't have payment info - use form values
              installments = parseInt(numberOfInstallments) || selectedSale.number_of_installments || 12
              if (installments <= 0) {
                setError('عدد الأشهر يجب أن يكون أكبر من صفر')
              setConfirming(false)
              return
              }
              monthlyAmount = remainingAfterAdvance / installments
            }
            
            newSaleData.number_of_installments = installments
            newSaleData.monthly_installment_amount = parseFloat(monthlyAmount.toFixed(2))
            newSaleData.installment_start_date = installmentStartDate || new Date().toISOString().split('T')[0]
          }
        }

        // Create the new sale for the confirmed piece
        // Temporarily remove company_fee columns if they don't exist in DB (will be added via SQL)
        const saleDataToInsert = { ...newSaleData }
        delete (saleDataToInsert as any).company_fee_percentage
        delete (saleDataToInsert as any).company_fee_amount
        
        let newSale: any = null
        
        // Try inserting the sale
        const { data: newSaleDataArray, error: insertError } = await supabase
          .from('sales')
          .insert([saleDataToInsert] as any)
          .select('*')
        
        if (insertError) {
          console.error('Error inserting sale:', insertError)
          console.error('Error details:', JSON.stringify(insertError, null, 2))
          console.error('Sale data attempted:', saleDataToInsert)
          throw new Error(`فشل في إنشاء البيع الجديد: ${insertError.message || insertError.code || 'خطأ غير معروف'}`)
        }
        
        if (newSaleDataArray && newSaleDataArray.length > 0) {
          newSale = newSaleDataArray[0]
        } else {
          // If select() didn't return data, try fetching it manually
          console.warn('Insert succeeded but select() returned no data. Attempting to fetch...')
          
          // Wait a moment for the insert to complete
          await new Promise(resolve => setTimeout(resolve, 100))
          
          // Try to fetch the most recent sale for this client with matching data
          const { data: fetchedSales, error: fetchError } = await supabase
            .from('sales')
            .select('*')
            .eq('client_id', saleDataToInsert.client_id)
            .eq('total_selling_price', saleDataToInsert.total_selling_price)
            .eq('status', saleDataToInsert.status)
            .order('created_at', { ascending: false })
            .limit(1)
          
          if (fetchError) {
            console.error('Error fetching inserted sale:', fetchError)
            throw new Error('فشل في إنشاء البيع الجديد: تم الإدراج لكن فشل في جلب البيانات')
          }
          
          if (!fetchedSales || fetchedSales.length === 0) {
            throw new Error('فشل في إنشاء البيع الجديد: لم يتم إرجاع بيانات من قاعدة البيانات. يرجى التحقق من قاعدة البيانات.')
          }
          
          newSale = fetchedSales[0]
        }
        
        // Update with company fee if columns exist (after SQL migration)
        // We'll try to update, but ignore errors if columns don't exist yet
        if (companyFeePerPiece > 0) {
          try {
            const { error: updateError } = await supabase
              .from('sales')
              .update({
                company_fee_percentage: parseFloat(companyFeePercentage) || null,
                company_fee_amount: companyFeePerPiece
              } as any)
              .eq('id', newSale.id)
            
            if (updateError) {
              console.warn('Could not update company fee (columns may not exist yet):', updateError.message)
              // Don't throw - this is optional, will work after SQL migration
            }
          } catch (e) {
            console.warn('Error updating company fee:', e)
            // Continue anyway
          }
        }

        // Create payment record if amount was received
        if (received > 0) {
          const paymentType = confirmationType === 'full' ? 'Full' : 'BigAdvance'
          const { error: paymentError } = await supabase.from('payments').insert([{
            client_id: selectedSale.client_id,
            sale_id: newSale.id,
            amount_paid: received,
            payment_type: paymentType,
            payment_date: new Date().toISOString().split('T')[0],
            notes: confirmationNotes || null,
            recorded_by: user?.id || null,
          }] as any)
          
          if (paymentError) throw paymentError
        }

        // Create installments schedule if needed (for bigAdvance with installments)
        if (confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment' && newSaleData.number_of_installments) {
          const installmentsToCreate = []
          const startDate = new Date(newSaleData.installment_start_date || new Date())
          startDate.setHours(0, 0, 0, 0) // Ensure consistent date handling
          const monthlyAmount = newSaleData.monthly_installment_amount || 0
          
          for (let i = 0; i < newSaleData.number_of_installments; i++) {
            const dueDate = new Date(startDate)
            // First installment (i=0) should be on startDate, second (i=1) should be 1 month later, etc.
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
          
          const { error: installmentsError } = await supabase.from('installments').insert(installmentsToCreate as any)
          if (installmentsError) throw installmentsError
        }

        // Update the original sale - remove this piece and recalculate
        const remainingPieces = selectedSale.land_piece_ids.filter(id => id !== selectedPiece.id)
        const remainingCount = remainingPieces.length
        const remainingPrice = selectedSale.total_selling_price - pricePerPiece
        const remainingCost = selectedSale.total_purchase_cost - costPerPiece
        const remainingProfit = selectedSale.profit_margin - profitPerPiece
        const remainingReservation = (selectedSale.small_advance_amount || 0) - reservationPerPiece
        
        await supabase
          .from('sales')
          .update({
            land_piece_ids: remainingPieces,
            total_selling_price: remainingPrice,
            total_purchase_cost: remainingCost,
            profit_margin: remainingProfit,
            small_advance_amount: remainingReservation,
            big_advance_amount: selectedSale.big_advance_amount ? (selectedSale.big_advance_amount * remainingCount / pieceCount) : 0,
            monthly_installment_amount: selectedSale.monthly_installment_amount ? (selectedSale.monthly_installment_amount * remainingCount / pieceCount) : null,
          } as any)
          .eq('id', selectedSale.id)
      }

      // Show success message
      showNotification(
        confirmationType === 'full' 
          ? (selectedSale.payment_type === 'PromiseOfSale' 
              ? 'تم استكمال وعد البيع بنجاح' 
              : 'تم تأكيد البيع بنجاح (دفع كامل)')
          : 'تم تأكيد الدفعة الكبيرة بنجاح',
        'success'
      )
      
      setConfirmDialogOpen(false)
      // Reset form
      setReceivedAmount('')
      setConfirmationNotes('')
      setCompanyFeePercentage('2')
      setNumberOfInstallments('12')
      
      // Wait a moment for database to sync, then refresh
      await new Promise(resolve => setTimeout(resolve, 300))
      await fetchSales()
    } catch (err) {
      const error = err as Error
      console.error('Error confirming sale:', error)
      // Check for the specific "Confirmed" enum error
      let errorMessage = error.message
      if (error.message.includes('sale_status') && error.message.includes('Confirmed')) {
        errorMessage = 'خطأ في قاعدة البيانات: يرجى تشغيل السكريبت fix_sale_status_confirmed_error.sql لإصلاح المشكلة'
        console.error('DATABASE TRIGGER ISSUE: There is likely a trigger trying to set sale status to "Confirmed" which is not a valid enum value.')
      }
      setError('حدث خطأ أثناء تأكيد البيع: ' + errorMessage)
      showNotification('حدث خطأ أثناء تأكيد البيع: ' + errorMessage, 'error')
    } finally {
      setConfirming(false)
    }
  }

  if (!canAccess) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive font-medium">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
            </div>
          </CardContent>
        </Card>
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

  if (error && sales.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <XCircle className="h-12 w-12 text-destructive mx-auto" />
              <p className="text-destructive font-medium">{error}</p>
              <Button onClick={fetchSales}>إعادة المحاولة</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">تأكيد المبيعات</h1>
          <p className="text-muted-foreground text-sm sm:text-base">تأكيد المبيعات المعلقة وتحديث الحالة</p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="بحث (اسم العميل، رقم الهاتف، رقم البيع، رقم القطعة)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            {searchTerm && (
              <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {filteredSales.length} نتيجة من {sales.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                  onClick={() => setSearchTerm('')}
                className="text-xs"
              >
                  مسح
              </Button>
            </div>
          )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-destructive text-sm">{error}</p>
          </CardContent>
        </Card>
      )}

      {filteredSales.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <CheckCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">لا توجد مبيعات معلقة</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredSales.map((sale) => {
            const client = sale.client
            const pieces = sale.land_pieces || []
            
            return (
              <Card key={sale.id} className="border-l-4 border-l-primary">
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">
                        #{sale.id.slice(0, 8)} - {client?.name || 'عميل غير معروف'}
                      </CardTitle>
                      {client?.phone && <span className="text-xs text-muted-foreground">({client.phone})</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {sale.deadline_date && sale.status !== 'Completed' && sale.payment_type !== 'PromiseOfSale' && (() => {
                        const deadline = new Date(sale.deadline_date)
                        const now = new Date()
                        deadline.setHours(23, 59, 59, 999) // End of deadline day
                        
                        const diffMs = deadline.getTime() - now.getTime()
                        const daysUntil = Math.floor(diffMs / (1000 * 60 * 60 * 24))
                        const hoursUntil = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                        const minutesUntil = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
                        
                        const isOverdue = diffMs < 0
                        const isToday = daysUntil === 0 && hoursUntil >= 0
                        const isClose = daysUntil > 0 && daysUntil <= 3
                        
                        // Always show countdown for deadline
                        let countdownText = ''
                        if (isOverdue) {
                          const overdueDays = Math.abs(daysUntil)
                          countdownText = `⚠ تجاوز الموعد بـ ${overdueDays} ${overdueDays === 1 ? 'يوم' : 'أيام'}`
                        } else if (isToday) {
                          if (hoursUntil > 0) {
                            countdownText = `⚠ متبقي: ${hoursUntil} ${hoursUntil === 1 ? 'ساعة' : 'ساعات'} و ${minutesUntil} ${minutesUntil === 1 ? 'دقيقة' : 'دقائق'}`
                          } else if (minutesUntil > 0) {
                            countdownText = `⚠ متبقي: ${minutesUntil} ${minutesUntil === 1 ? 'دقيقة' : 'دقائق'}`
                          } else {
                            countdownText = '⚠ الموعد النهائي اليوم'
                          }
                        } else {
                          const hoursText = hoursUntil > 0 ? ` و ${hoursUntil} ${hoursUntil === 1 ? 'ساعة' : 'ساعات'}` : ''
                          const minutesText = minutesUntil > 0 ? ` و ${minutesUntil} ${minutesUntil === 1 ? 'دقيقة' : 'دقائق'}` : ''
                          countdownText = `⏰ متبقي: ${daysUntil} ${daysUntil === 1 ? 'يوم' : 'أيام'}${hoursText}${minutesText}`
                        }
                        
                          return (
                          <Badge 
                            variant={isOverdue ? "destructive" : isToday || isClose ? "warning" : "default"} 
                            className="text-xs font-medium"
                          >
                            {countdownText}
                            </Badge>
                          )
                      })()}
                      <Badge variant={sale.status === 'Pending' ? 'warning' : 'secondary'} className="text-xs">
                        {sale.status === 'Pending' ? 'محجوز' : 'قيد الدفع'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {sale.payment_type === 'Full' ? 'بالحاضر' : 
                         sale.payment_type === 'Installment' ? 'بالتقسيط' : 
                         sale.payment_type === 'PromiseOfSale' ? 'وعد بالبيع' : 
                         sale.payment_type || '-'}
                      </Badge>
                      {sale.payment_type === 'Installment' && sale.big_advance_amount && sale.big_advance_amount > 0 && (
                        <Badge 
                          variant={((sale._totalBigAdvancePaid || 0) >= sale.big_advance_amount) ? 'default' : 'secondary'} 
                          className="text-xs"
                        >
                          دفعة كبيرة: {formatCurrency(sale._totalBigAdvancePaid || 0)} / {formatCurrency(sale.big_advance_amount)}
                        </Badge>
                      )}
                      {sale.payment_type === 'PromiseOfSale' && sale.deadline_date && (() => {
                        const completionDate = new Date(sale.deadline_date)
                        const now = new Date()
                        completionDate.setHours(23, 59, 59, 999)
                        
                        const diffMs = completionDate.getTime() - now.getTime()
                        const daysUntil = Math.floor(diffMs / (1000 * 60 * 60 * 24))
                        const hoursUntil = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                        const minutesUntil = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
                        
                        const isOverdue = diffMs < 0
                        const isToday = daysUntil === 0 && hoursUntil >= 0
                        const isClose = daysUntil > 0 && daysUntil <= 3
                        
                        let countdownText = ''
                        if (isOverdue) {
                          const overdueDays = Math.abs(daysUntil)
                          countdownText = `⚠ تجاوز الموعد بـ ${overdueDays} ${overdueDays === 1 ? 'يوم' : 'أيام'}`
                        } else if (isToday) {
                          if (hoursUntil > 0) {
                            countdownText = `⏰ متبقي: ${hoursUntil} ${hoursUntil === 1 ? 'ساعة' : 'ساعات'} و ${minutesUntil} ${minutesUntil === 1 ? 'دقيقة' : 'دقائق'}`
                          } else if (minutesUntil > 0) {
                            countdownText = `⏰ متبقي: ${minutesUntil} ${minutesUntil === 1 ? 'دقيقة' : 'دقائق'}`
                          } else {
                            countdownText = '⚠ الموعد النهائي اليوم'
                          }
                        } else {
                          const hoursText = hoursUntil > 0 ? ` و ${hoursUntil} ${hoursUntil === 1 ? 'ساعة' : 'ساعات'}` : ''
                          const minutesText = minutesUntil > 0 ? ` و ${minutesUntil} ${minutesUntil === 1 ? 'دقيقة' : 'دقائق'}` : ''
                          countdownText = `⏰ متبقي: ${daysUntil} ${daysUntil === 1 ? 'يوم' : 'أيام'}${hoursText}${minutesText}`
                        }
                        
                        const totalPrice = sale.total_selling_price + (sale.company_fee_amount || 0)
                        const initialPayment = sale.promise_initial_payment || 0
                        const remainingAmount = totalPrice - initialPayment - (sale._totalPaid || 0) + (sale.small_advance_amount || 0)
                        
                        return (
                          <>
                            <Badge 
                              variant={isOverdue ? "destructive" : isToday || isClose ? "warning" : "default"} 
                              className="text-xs font-medium"
                            >
                              {countdownText}
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              متبقي: {formatCurrency(Math.max(0, remainingAmount))}
                            </Badge>
                          </>
                        )
                      })()}
                      {sale.rendezvous && sale.rendezvous.length > 0 && (() => {
                        const latestRendezvous = sale.rendezvous[0]
                        return (
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-md">
                            <Calendar className="h-3.5 w-3.5 text-blue-600" />
                            <span className="text-xs font-medium text-blue-700">
                              {formatRendezvousDateTime(latestRendezvous.rendezvous_date, latestRendezvous.rendezvous_time)}
                            </span>
                          </div>
                        )
                      })()}
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDateTime(sale.created_at || sale.sale_date)}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-3">
                  {/* Mobile Card View / Desktop Table View for Pieces */}
                  <div className="md:hidden space-y-2">
                    {pieces.map((piece: any) => {
                      const { pricePerPiece, reservationPerPiece, companyFeePerPiece, totalPayablePerPiece, advancePerPiece } = calculatePieceValues(sale, piece)
                      
                      return (
                        <Card key={piece.id} className="bg-muted/30">
                          <CardContent className="p-3">
                            <div className="space-y-2">
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="font-medium text-sm">
                                    {piece.land_batch?.name || 'دفعة'} - #{piece.piece_number}
                                  </div>
                                  <div className="text-xs text-muted-foreground">{piece.surface_area} م²</div>
                                </div>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">السعر:</span>
                                  <div className="font-medium">{formatCurrency(pricePerPiece)}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">العمولة:</span>
                                  <div className="font-medium text-blue-600">{formatCurrency(companyFeePerPiece)}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">الإجمالي:</span>
                                  <div className="font-bold text-green-600">{formatCurrency(totalPayablePerPiece)}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">العربون:</span>
                                  <div className="font-medium text-green-600">{formatCurrency(reservationPerPiece)}</div>
                                </div>
                                {sale.payment_type === 'Installment' && advancePerPiece > 0 && (
                                  <div>
                                    <span className="text-muted-foreground">التسبقة:</span>
                                    <div className="font-medium text-purple-600">{formatCurrency(advancePerPiece)}</div>
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex flex-wrap gap-2 pt-2 border-t">
                                <Button
                                  onClick={() => openRendezvousDialog(sale)}
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-8 flex-1"
                                >
                                  <Calendar className="ml-1 h-3 w-3" />
                                  موعد
                                </Button>
                                <Button
                                  onClick={() => handleCancelPiece(sale, piece)}
                                  variant="destructive"
                                  size="sm"
                                  className="text-xs h-8 flex-1"
                                >
                                  <XCircle className="ml-1 h-3 w-3" />
                                  إلغاء
                                </Button>
                                {sale.payment_type === 'Full' && (
                                  <Button
                                    onClick={() => {
                                      setSelectedSale(sale)
                                      setSelectedPiece(piece)
                                      setPendingConfirmationType('full')
                                      openConfirmDialog(sale, piece, 'full')
                                    }}
                                    className="bg-green-600 hover:bg-green-700 text-xs h-8 flex-1"
                                    size="sm"
                                  >
                                    <CheckCircle className="ml-1 h-3 w-3" />
                                    تأكيد بالحاضر
                                  </Button>
                                )}
                                {sale.payment_type === 'Installment' && (
                                  <Button
                                    onClick={() => {
                                      setSelectedSale(sale)
                                      setSelectedPiece(piece)
                                      setPendingConfirmationType('bigAdvance')
                                      openConfirmDialog(sale, piece, 'bigAdvance')
                                    }}
                                    className="bg-blue-600 hover:bg-blue-700 text-xs h-8 flex-1"
                                    size="sm"
                                  >
                                    <DollarSign className="ml-1 h-3 w-3" />
                                    تأكيد بالتقسيط
                                  </Button>
                                )}
                                {sale.payment_type === 'PromiseOfSale' && (
                                  <Button
                                    onClick={() => {
                                      setSelectedSale(sale)
                                      setSelectedPiece(piece)
                                      setPendingConfirmationType('full')
                                      openConfirmDialog(sale, piece, 'full')
                                    }}
                                    className="bg-purple-600 hover:bg-purple-700 text-xs h-8 flex-1"
                                    size="sm"
                                  >
                                    <CheckCircle className="ml-1 h-3 w-3" />
                                    استكمال الدفع
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                  
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                    <Table className="min-w-full text-sm">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">القطعة</TableHead>
                          <TableHead className="text-right text-xs">السعر</TableHead>
                          <TableHead className="text-right text-xs">العمولة</TableHead>
                          <TableHead className="text-right text-xs">الإجمالي</TableHead>
                          <TableHead className="text-right text-xs">العربون</TableHead>
                          {sale.payment_type === 'Installment' && (
                            <TableHead className="text-right text-xs">التسبقة</TableHead>
                          )}
                          {sale.payment_type === 'PromiseOfSale' && (
                            <TableHead className="text-right text-xs">المستلم</TableHead>
                          )}
                          {sale.payment_type === 'PromiseOfSale' && (
                            <TableHead className="text-right text-xs">المتبقي</TableHead>
                          )}
                          <TableHead className="text-xs">إجراء</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pieces.map((piece: any) => {
                          const { pricePerPiece, reservationPerPiece, companyFeePerPiece, totalPayablePerPiece, advancePerPiece } = calculatePieceValues(sale, piece, (sale as any).selected_offer)
                          
                          return (
                            <TableRow key={piece.id} className="hover:bg-gray-50">
                              <TableCell className="py-2">
                                <div className="font-medium text-xs">
                                  {piece.land_batch?.name || 'دفعة'} - #{piece.piece_number}
                                </div>
                                <div className="text-xs text-muted-foreground">{piece.surface_area} م²</div>
                              </TableCell>
                              <TableCell className="text-right py-2 text-xs">{formatCurrency(pricePerPiece)}</TableCell>
                              <TableCell className="text-right py-2 text-xs text-blue-600">{formatCurrency(companyFeePerPiece)}</TableCell>
                              <TableCell className="text-right py-2 font-bold text-xs text-green-600">{formatCurrency(totalPayablePerPiece)}</TableCell>
                              <TableCell className="text-right py-2 text-xs text-green-600">{formatCurrency(reservationPerPiece)}</TableCell>
                              {sale.payment_type === 'Installment' && (
                                <TableCell className="text-right py-2 text-xs text-purple-600">{formatCurrency(advancePerPiece)}</TableCell>
                              )}
                              {sale.payment_type === 'PromiseOfSale' && (() => {
                                const initialPayment = (sale.promise_initial_payment || 0) / sale.land_piece_ids.length
                                return (
                                  <TableCell className="text-right py-2 text-xs text-green-600">{formatCurrency(initialPayment)}</TableCell>
                                )
                              })()}
                              {sale.payment_type === 'PromiseOfSale' && (() => {
                                const pieceCount = sale.land_piece_ids.length
                                const totalPricePerPiece = totalPayablePerPiece
                                const initialPaymentPerPiece = (sale.promise_initial_payment || 0) / pieceCount
                                const reservationAmount = reservationPerPiece
                                const remaining = totalPricePerPiece - initialPaymentPerPiece - reservationAmount
                                return (
                                  <TableCell className="text-right py-2 text-xs font-bold text-orange-600">{formatCurrency(Math.max(0, remaining))}</TableCell>
                                )
                              })()}
                              <TableCell className="py-2">
                                <div className="flex flex-wrap gap-1">
                                  <Button
                                    onClick={() => openRendezvousDialog(sale)}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs px-2 h-7"
                                  >
                                    <Calendar className="ml-1 h-3 w-3" />
                                    موعد
                                  </Button>
                                  <Button
                                    onClick={() => handleCancelPiece(sale, piece)}
                                    variant="destructive"
                                    size="sm"
                                    className="text-xs px-2 h-7"
                                  >
                                    <XCircle className="ml-1 h-3 w-3" />
                                    إلغاء
                                  </Button>
                                  {sale.payment_type === 'Full' && (
                                    <Button
                                      onClick={() => {
                                        setSelectedSale(sale)
                                        setSelectedPiece(piece)
                                        setPendingConfirmationType('full')
                                        openConfirmDialog(sale, piece, 'full')
                                      }}
                                      className="bg-green-600 hover:bg-green-700 text-xs px-2 h-7"
                                      size="sm"
                                    >
                                      <CheckCircle className="ml-1 h-3 w-3" />
                                      تأكيد بالحاضر
                                    </Button>
                                  )}
                                  {sale.payment_type === 'Installment' && (
                                    <>
                                      <Button
                                        onClick={() => {
                                          setSelectedSale(sale)
                                          setSelectedPiece(piece)
                                          setPendingConfirmationType('bigAdvance')
                                          openConfirmDialog(sale, piece, 'bigAdvance')
                                        }}
                                        className="bg-blue-600 hover:bg-blue-700 text-xs px-2 h-7"
                                        size="sm"
                                      >
                                        <DollarSign className="ml-1 h-3 w-3" />
                                        تأكيد بالتقسيط
                                      </Button>
                                    </>
                                  )}
                                  {sale.payment_type === 'PromiseOfSale' && (
                                    <Button
                                      onClick={() => {
                                        setSelectedSale(sale)
                                        setSelectedPiece(piece)
                                        setPendingConfirmationType('full')
                                        openConfirmDialog(sale, piece, 'full')
                                      }}
                                      className="bg-purple-600 hover:bg-purple-700 text-xs px-2 h-7"
                                      size="sm"
                                    >
                                      <CheckCircle className="ml-1 h-3 w-3" />
                                      استكمال الدفع
                                    </Button>
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
            )
          })}
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {confirmationType === 'full' && (selectedSale?.payment_type === 'PromiseOfSale' ? 'استكمال وعد البيع' : 'تأكيد بالحاضر')}
              {confirmationType === 'bigAdvance' && (selectedSale?.payment_type === 'Full' ? 'تأكيد بالحاضر' : 'تأكيد بالتقسيط')}
              {selectedPiece && ` - #${selectedPiece.piece_number}`}
            </DialogTitle>
          </DialogHeader>
          {selectedSale && selectedPiece && (() => {
                  // Get the offer to use - prioritize selectedOffer state, then sale's selected_offer
                  const offerToUse = selectedOffer || ((selectedSale as any).selected_offer as PaymentOffer | null)
                  const { pricePerPiece, reservationPerPiece, companyFeePerPiece, totalPayablePerPiece, offer: calculatedOffer } = calculatePieceValues(selectedSale, selectedPiece, offerToUse)
            
            // Calculate advance amount from offer if available
            let advanceAmount = 0
            if (calculatedOffer && confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment') {
              // Advance should be calculated from totalPayablePerPiece (price + company fee), not just price
              advanceAmount = calculatedOffer.advance_is_percentage
                ? (totalPayablePerPiece * calculatedOffer.advance_amount) / 100
                : calculatedOffer.advance_amount
            } else if (confirmationType === 'full') {
              if (selectedSale.payment_type === 'PromiseOfSale') {
                // For PromiseOfSale, calculate remaining after initial payment
                const pieceCount = selectedSale.land_piece_ids.length
                const initialPaymentPerPiece = (selectedSale.promise_initial_payment || 0) / pieceCount
                advanceAmount = totalPayablePerPiece - reservationPerPiece - initialPaymentPerPiece
              } else {
              advanceAmount = totalPayablePerPiece - reservationPerPiece
              }
            }
            
            // Calculate remaining amount after advance
            let remainingAfterAdvance = totalPayablePerPiece - reservationPerPiece - advanceAmount
            if (confirmationType === 'full' && selectedSale.payment_type === 'PromiseOfSale') {
              // For PromiseOfSale, remaining is already calculated in advanceAmount
              remainingAfterAdvance = advanceAmount
            }
            
            // Calculate number of months and monthly payment from offer
            let calculatedMonths = 0
            let monthlyPaymentAmount = 0
            if (calculatedOffer && confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment') {
              if (calculatedOffer.monthly_payment && calculatedOffer.monthly_payment > 0) {
                // Offer has monthly_payment - calculate number of months
                monthlyPaymentAmount = calculatedOffer.monthly_payment
                calculatedMonths = remainingAfterAdvance > 0 ? Math.ceil(remainingAfterAdvance / monthlyPaymentAmount) : 0
              } else if (calculatedOffer.number_of_months && calculatedOffer.number_of_months > 0) {
                // Offer has number_of_months - calculate monthly payment
                calculatedMonths = calculatedOffer.number_of_months
                monthlyPaymentAmount = remainingAfterAdvance > 0 ? remainingAfterAdvance / calculatedOffer.number_of_months : 0
              }
            }
            
                  return (
              <div className="space-y-4 sm:space-y-5">
                {/* Detailed Summary Box */}
                <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-300 rounded-lg p-4 sm:p-5 space-y-3 shadow-sm">
                  <h3 className="text-base sm:text-lg font-bold text-gray-800 mb-3">تفاصيل الحساب</h3>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                      <span className="text-sm sm:text-base text-gray-700">سعر القطعة:</span>
                      <span className="text-sm sm:text-base font-semibold text-gray-900">{formatCurrency(pricePerPiece)}</span>
                      </div>
                    
                    <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="text-sm sm:text-base text-gray-700">عمولة الشركة (%):</span>
                        {calculatedOffer && (
                          <Badge variant="default" className="text-xs">من العرض</Badge>
                        )}
                      </div>
                      <span className="text-sm sm:text-base font-semibold text-blue-700">
                        {calculatedOffer ? calculatedOffer.company_fee_percentage : companyFeePercentage}%
                      </span>
                      </div>
                    
                    <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                      <span className="text-sm sm:text-base text-gray-700">عمولة الشركة:</span>
                      <span className="text-sm sm:text-base font-semibold text-blue-600">{formatCurrency(companyFeePerPiece)}</span>
                      </div>
                    
                    <div className="flex justify-between items-center py-2 border-t-2 border-gray-300 mt-2">
                      <span className="text-base sm:text-lg font-bold text-gray-900">المبلغ الإجمالي المستحق:</span>
                      <span className="text-base sm:text-lg font-bold text-green-600">{formatCurrency(totalPayablePerPiece)}</span>
                      </div>
                    
                    <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                      <span className="text-sm sm:text-base text-gray-700">المدفوع مسبقاً (العربون):</span>
                      <span className="text-sm sm:text-base font-semibold text-green-600">{formatCurrency(reservationPerPiece)}</span>
                    </div>
                    
                    {confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment' && calculatedOffer && (
                      <>
                        <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                          <div className="flex items-center gap-2">
                            <span className="text-sm sm:text-base text-gray-700">التسبقة:</span>
                            <Badge variant="default" className="text-xs">من العرض</Badge>
                          </div>
                          <span className="text-sm sm:text-base font-semibold text-purple-600">
                            {calculatedOffer.advance_is_percentage 
                              ? `${calculatedOffer.advance_amount}% = ${formatCurrency(advanceAmount)}`
                              : formatCurrency(advanceAmount)}
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                          <div className="flex items-center gap-2">
                            <span className="text-sm sm:text-base text-gray-700">عدد الأشهر:</span>
                            <Badge variant="default" className="text-xs">محسوب تلقائياً</Badge>
                          </div>
                          <span className="text-sm sm:text-base font-semibold text-blue-700">{calculatedMonths} شهر</span>
                        </div>
                        
                        <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                          <span className="text-sm sm:text-base text-gray-700">المبلغ الشهري:</span>
                          <span className="text-sm sm:text-base font-semibold text-blue-700">
                            {formatCurrency(monthlyPaymentAmount)}
                        </span>
                      </div>
                    </>
                    )}
                    
                    <div className="flex justify-between items-center py-2 border-t-2 border-orange-300 mt-2 bg-orange-50 rounded px-2">
                      <span className="text-base sm:text-lg font-bold text-gray-900">
                        {confirmationType === 'full' 
                          ? (selectedSale.payment_type === 'PromiseOfSale' ? 'المبلغ المتبقي (بعد الدفعة الأولية):' : 'المبلغ المتبقي:')
                          : 'المبلغ المتبقي بعد التسبقة:'}
                      </span>
                      <span className="text-base sm:text-lg font-bold text-orange-600">
                        {formatCurrency(confirmationType === 'full' 
                          ? (selectedSale.payment_type === 'PromiseOfSale' ? remainingAfterAdvance : totalPayablePerPiece - reservationPerPiece)
                          : remainingAfterAdvance)}
                      </span>
                    </div>
              </div>

                  {calculatedOffer && (
                    <div className="mt-3 pt-3 border-t border-gray-300 bg-white rounded p-2">
                      <p className="text-xs text-gray-600 mb-1">معلومات العرض:</p>
                      {calculatedOffer.offer_name && (
                        <p className="text-xs font-medium text-gray-800">اسم العرض: {calculatedOffer.offer_name}</p>
                      )}
                      {calculatedOffer.notes && (
                        <p className="text-xs text-gray-600 mt-1">{calculatedOffer.notes}</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Editable Fields */}
              {confirmationType === 'bigAdvance' && selectedSale?.payment_type === 'Installment' && (
                <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs sm:text-sm font-medium text-blue-800 mb-2 sm:mb-3">إعدادات الأقساط</p>
                  
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="installmentStartDate" className="text-xs sm:text-sm">تاريخ بداية الأقساط *</Label>
                    <Input
                      id="installmentStartDate"
                      type="date"
                      value={installmentStartDate}
                      onChange={e => setInstallmentStartDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="text-xs sm:text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      سيتم إنشاء جدول الأقساط تلقائياً بعد تأكيد الدفعة الكبيرة
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="paymentMethod" className="text-xs sm:text-sm">طريقة الدفع</Label>
                <Select
                  id="paymentMethod"
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value)}
                  className="text-xs sm:text-sm"
                >
                  <option value="cash">نقدي</option>
                  <option value="check">شيك</option>
                  <option value="transfer">تحويل بنكي</option>
                </Select>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="confirmationNotes" className="text-xs sm:text-sm">ملاحظات</Label>
                <Textarea
                  id="confirmationNotes"
                  value={confirmationNotes}
                  onChange={e => setConfirmationNotes(e.target.value)}
                  placeholder="ملاحظات إضافية..."
                  rows={3}
                  className="text-xs sm:text-sm min-h-[80px] sm:min-h-[100px]"
                />
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} className="w-full sm:w-auto">
                  إلغاء
                </Button>
                <Button onClick={handleConfirmation} disabled={confirming} className="w-full sm:w-auto">
                    {confirming ? 'جاري التأكيد...' : 'اتمام البيع'}
                </Button>
              </DialogFooter>
            </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Client Details Dialog */}
      <Dialog open={clientDetailsOpen} onOpenChange={setClientDetailsOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل العميل</DialogTitle>
          </DialogHeader>
          {selectedClientForDetails && (
            <div className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">الاسم</p>
                  <p className="font-medium text-sm sm:text-base">{selectedClientForDetails.name}</p>
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
                                {(sale.status === 'Completed' || (sale as any).status === 'Completed') ? 'مباع' :
                                 sale.payment_type === 'Installment' && (sale as any).status !== 'Completed' ? 'بالتقسيط' :
                                 sale.payment_type === 'Full' && (sale as any).status !== 'Completed' ? 'بالحاضر' :
                                 'محجوز'}
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

      {/* Pre-Confirmation Dialog - Shows after clicking اتمام البيع */}
      <ConfirmDialog
        open={confirmBeforeConfirmOpen}
        onOpenChange={setConfirmBeforeConfirmOpen}
        onConfirm={() => {
          if (selectedSale && selectedPiece && pendingConfirmationType) {
            setConfirmBeforeConfirmOpen(false)
            proceedWithConfirmation()
          }
        }}
        title={pendingConfirmationType === 'full' ? 'تأكيد البيع بالحاضر' : 'تأكيد البيع بالتقسيط'}
        description={
          selectedSale && selectedPiece && (() => {
            const offerToUse = selectedOffer || ((selectedSale as any).selected_offer as PaymentOffer | null)
            const { pricePerPiece, reservationPerPiece, companyFeePerPiece, totalPayablePerPiece } = calculatePieceValues(selectedSale, selectedPiece, offerToUse)
            
            let amountToReceive = 0
            if (pendingConfirmationType === 'full') {
              amountToReceive = totalPayablePerPiece - reservationPerPiece
            } else if (pendingConfirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment') {
              const calculatedOffer = offerToUse
              if (calculatedOffer) {
                // Advance should be calculated from totalPayablePerPiece (price + company fee), not just price
                // We need to recalculate totalPayablePerPiece here
                const { totalPayablePerPiece: totalPayable } = calculatePieceValues(selectedSale, selectedPiece, calculatedOffer)
                amountToReceive = calculatedOffer.advance_is_percentage
                  ? (totalPayable * calculatedOffer.advance_amount) / 100
                  : calculatedOffer.advance_amount
              }
            }
            
            return `هل أنت متأكد أنك ستحصل على مبلغ ${formatCurrency(amountToReceive)} من العميل ${selectedSale.client?.name || 'غير معروف'}؟`
          })() || ''
        }
        confirmText="نعم، متأكد"
        cancelText="إلغاء"
      />

      {/* Rendez-vous Dialog */}
      <Dialog open={rendezvousDialogOpen} onOpenChange={setRendezvousDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle>موعد البيع (Rendez-vous de vente)</DialogTitle>
          </DialogHeader>
          {selectedSaleForRendezvous && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm font-medium">العميل: {selectedSaleForRendezvous.client?.name || 'غير معروف'}</p>
                <p className="text-xs text-muted-foreground">رقم البيع: #{selectedSaleForRendezvous.id.slice(0, 8)}</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="rendezvous-date">التاريخ *</Label>
                <Input
                  id="rendezvous-date"
                  type="date"
                  value={rendezvousDate}
                  onChange={(e) => setRendezvousDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="rendezvous-time">الوقت *</Label>
                <Input
                  id="rendezvous-time"
                  type="time"
                  value={rendezvousTime}
                  onChange={(e) => setRendezvousTime(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="rendezvous-notes">ملاحظات</Label>
                <Textarea
                  id="rendezvous-notes"
                  value={rendezvousNotes}
                  onChange={(e) => setRendezvousNotes(e.target.value)}
                  placeholder="ملاحظات إضافية حول الموعد..."
                  rows={3}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRendezvousDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleCreateRendezvous}>
              حفظ الموعد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
