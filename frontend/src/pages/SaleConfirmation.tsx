import { useEffect, useState, useMemo, useRef } from 'react'
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils'
import { retryWithBackoff, isRetryableError } from '@/lib/retry'
import { CheckCircle, XCircle, Clock, DollarSign, AlertTriangle, Calendar, Edit, Save } from 'lucide-react'
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
  const { hasPermission, user, profile } = useAuth()
  const { t } = useLanguage()
  const [sales, setSales] = useState<SaleWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSale, setSelectedSale] = useState<SaleWithDetails | null>(null)
  const [selectedPiece, setSelectedPiece] = useState<LandPiece | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const confirmingRef = useRef(false) // Use ref to prevent race conditions
  const [confirmBeforeConfirmOpen, setConfirmBeforeConfirmOpen] = useState(false)
  const [pendingConfirmationType, setPendingConfirmationType] = useState<'full' | 'bigAdvance' | null>(null)
  const [successDialogOpen, setSuccessDialogOpen] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  
  // Search state
  const [searchTerm, setSearchTerm] = useState('')
  const [locationFilter, setLocationFilter] = useState<string>('all')
  const [uniqueLocations, setUniqueLocations] = useState<string[]>([])
  
  // Confirmation form state
  const [companyFeePercentage, setCompanyFeePercentage] = useState('2')
  const [numberOfInstallments, setNumberOfInstallments] = useState('12')
  const [receivedAmount, setReceivedAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [confirmationNotes, setConfirmationNotes] = useState('')
  const [confirmationType, setConfirmationType] = useState<'full' | 'bigAdvance'>('full')
  const [installmentStartDate, setInstallmentStartDate] = useState('')
  const [selectedOffer, setSelectedOffer] = useState<PaymentOffer | null>(null)
  const [contractEditors, setContractEditors] = useState<Array<{ id: string; type: string; name: string; place: string }>>([])
  const [selectedContractEditorId, setSelectedContractEditorId] = useState<string>('')
  const [confirmingAllPieces, setConfirmingAllPieces] = useState(false)
  const [keepPiecesTogether, setKeepPiecesTogether] = useState(true) // Default to keeping pieces together
  
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
  
  // Edit sale dialog (Owner only)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingSale, setEditingSale] = useState<SaleWithDetails | null>(null)
  const [editingPiece, setEditingPiece] = useState<LandPiece | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editForm, setEditForm] = useState({
    total_selling_price: '',
    company_fee_percentage: '',
    company_fee_amount: '',
    commission_input_method: 'percentage' as 'percentage' | 'amount',
    company_fee_note: '', // Note explaining why commission is 0 or different
    small_advance_amount: '',
    selected_offer_id: '',
    notes: '',
    sale_date: '',
    deadline_date: '',
    contract_editor_id: '',
    // Installment fields
    installment_start_date: '',
    number_of_installments: '',
    monthly_installment_amount: '',
    // Promise of Sale fields
    promise_initial_payment: '',
    promise_completion_date: '',
  })
  const [availableOffersForEdit, setAvailableOffersForEdit] = useState<PaymentOffer[]>([])
  
  // Create new offer dialog
  const [createOfferDialogOpen, setCreateOfferDialogOpen] = useState(false)
  const [creatingOffer, setCreatingOffer] = useState(false)
  const [newOfferForm, setNewOfferForm] = useState({
    offer_name: '',
    company_fee_percentage: '2',
    advance_amount: '',
    advance_is_percentage: false,
    monthly_payment: '',
    notes: '',
    is_default: false,
  })

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

  // Open edit dialog for sale (Owner only)
  const openEditDialog = async (sale: SaleWithDetails, piece: LandPiece) => {
    if (profile?.role !== 'Owner') {
      showNotification('ليس لديك صلاحية لتعديل المبيعات', 'error')
      return
    }

    // Fetch fresh sale data from database to ensure we have the latest values
    let freshSale: SaleWithDetails | null = null
    try {
      const { data, error: saleError } = await supabase
        .from('sales')
        .select(`
          *,
          client:clients(*),
          contract_editor:contract_editors(*),
          created_by_user:users!sales_created_by_fkey(id, name)
        `)
        .eq('id', sale.id)
        .single()

      if (saleError) {
        console.error('Error fetching fresh sale data:', saleError)
        freshSale = sale // Fallback to passed sale data
      } else if (data) {
        freshSale = data as SaleWithDetails
      } else {
        freshSale = sale
      }
    } catch (error) {
      console.error('Error fetching fresh sale:', error)
      freshSale = sale
    }

    // Fetch fresh piece data from database
    let freshPiece: LandPiece | null = null
    try {
      const { data, error: pieceError } = await supabase
        .from('land_pieces')
        .select(`
          *,
          land_batch:land_batches(*)
        `)
        .eq('id', piece.id)
        .single()

      if (pieceError) {
        console.error('Error fetching fresh piece data:', pieceError)
        freshPiece = piece
      } else if (data) {
        freshPiece = data as LandPiece
      } else {
        freshPiece = piece
      }
    } catch (error) {
      console.error('Error fetching fresh piece:', error)
      freshPiece = piece
    }

    // Set the fresh data
    if (freshSale) setEditingSale(freshSale)
    if (freshPiece) setEditingPiece(freshPiece)
    
    // Use the fresh sale data (or fallback to passed sale)
    const currentSale = freshSale || sale
    const currentPiece = freshPiece || piece
    
    // Calculate per-piece price
    const pieceCount = currentSale.land_piece_ids.length
    const pricePerPiece = currentSale.total_selling_price / pieceCount
    
    // Initialize form with current sale values
    const currentCommissionAmount = currentSale.company_fee_amount ? (currentSale.company_fee_amount / pieceCount).toFixed(2) : ''
    const currentReservationPerPiece = currentSale.small_advance_amount ? (currentSale.small_advance_amount / pieceCount).toFixed(2) : ''
    setEditForm({
      total_selling_price: pricePerPiece.toFixed(2),
      company_fee_percentage: (currentSale.company_fee_percentage || 0).toString(),
      company_fee_amount: currentCommissionAmount,
      commission_input_method: 'percentage',
      company_fee_note: (currentSale as any).company_fee_note || '',
      small_advance_amount: currentReservationPerPiece,
      selected_offer_id: currentSale.selected_offer_id || '',
      notes: currentSale.notes || '',
      sale_date: currentSale.sale_date || '',
      deadline_date: currentSale.deadline_date || '',
      contract_editor_id: currentSale.contract_editor_id || '',
      installment_start_date: currentSale.installment_start_date || '',
      number_of_installments: currentSale.number_of_installments?.toString() || '',
      monthly_installment_amount: currentSale.monthly_installment_amount ? (currentSale.monthly_installment_amount / pieceCount).toFixed(2) : '',
      promise_initial_payment: currentSale.promise_initial_payment ? (currentSale.promise_initial_payment / pieceCount).toFixed(2) : '',
      promise_completion_date: currentSale.promise_completion_date || '',
    })
    
    // Load available payment offers for this piece
    try {
      const offers: PaymentOffer[] = []
      
      // Get piece-specific offers
      const { data: pieceOffers } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('land_piece_id', piece.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
      
      if (pieceOffers) {
        offers.push(...(pieceOffers as PaymentOffer[]))
      }
      
      // Get batch offers
      if (piece.land_batch_id) {
        const { data: batchOffers } = await supabase
          .from('payment_offers')
          .select('*')
          .eq('land_batch_id', piece.land_batch_id)
          .is('land_piece_id', null)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
        
        if (batchOffers) {
          offers.push(...(batchOffers as PaymentOffer[]))
        }
      }
      
      setAvailableOffersForEdit(offers)
    } catch (error) {
      console.error('Error loading offers:', error)
      setAvailableOffersForEdit([])
    }
    
    setEditDialogOpen(true)
  }

  // Save edited sale
  const saveEditSale = async () => {
    if (!editingSale || !editingPiece || savingEdit) return
    
    // Server-side permission validation
    try {
      const { validatePermissionServerSide } = await import('@/lib/permissionValidation')
      const hasPermission = await validatePermissionServerSide('edit_sales')
      if (!hasPermission) {
        showNotification('ليس لديك صلاحية لتعديل المبيعات', 'error')
        return
      }
    } catch (error) {
      console.error('Error validating permission:', error)
      showNotification('خطأ في التحقق من الصلاحيات', 'error')
      return
    }
    
    setSavingEdit(true)
    
    try {
      const pieceCount = editingSale.land_piece_ids.length
      const newPricePerPiece = parseFloat(editForm.total_selling_price) || 0
      
      if (newPricePerPiece <= 0) {
        showNotification('السعر يجب أن يكون أكبر من الصفر', 'error')
        setSavingEdit(false)
        return
      }
      
      // Calculate commission based on input method
      let newCompanyFeePercentage = 0
      let newCompanyFee = 0
      
      if (editForm.commission_input_method === 'amount') {
        // User entered amount directly
        const enteredAmount = parseFloat(editForm.company_fee_amount) || 0
        newCompanyFee = enteredAmount
        newCompanyFeePercentage = newPricePerPiece > 0 ? (enteredAmount / newPricePerPiece) * 100 : 0
      } else {
        // User entered percentage
        newCompanyFeePercentage = parseFloat(editForm.company_fee_percentage) || 0
        newCompanyFee = (newPricePerPiece * newCompanyFeePercentage) / 100
      }
      
      // Calculate reservation amount
      const newReservationPerPiece = parseFloat(editForm.small_advance_amount) || 0
      const newTotalReservation = newReservationPerPiece * pieceCount
      
      // Calculate new totals for the sale
      // If single piece sale, update directly
      // If multi-piece sale, recalculate totals
      let updates: any = {
        // IMPORTANT: Preserve 0 as 0, not null. Only set to null if user didn't specify a value
        // If user explicitly set it to 0, we need to store 0 to distinguish from "not set" (null)
        company_fee_percentage: (editForm.commission_input_method === 'percentage' && editForm.company_fee_percentage !== '') 
          ? newCompanyFeePercentage  // User specified a percentage (including 0), use it
          : (newCompanyFeePercentage > 0 ? newCompanyFeePercentage : null), // Only set to null if not explicitly set
        company_fee_note: editForm.company_fee_note || null,
        small_advance_amount: newTotalReservation > 0 ? parseFloat(newTotalReservation.toFixed(2)) : 0,
        selected_offer_id: editForm.selected_offer_id || null,
        notes: editForm.notes || null,
        sale_date: editForm.sale_date || null,
        deadline_date: editForm.deadline_date || null,
        contract_editor_id: editForm.contract_editor_id || null,
      }
      
      // Add installment fields if payment type is Installment
      if (editingSale.payment_type === 'Installment') {
        updates.installment_start_date = editForm.installment_start_date || null
        
        // Calculate relationship between number_of_installments and monthly_installment_amount
        const pricePerPiece = parseFloat(editForm.total_selling_price) || 0
        const reservationPerPiece = parseFloat(editForm.small_advance_amount) || 0
        const advancePerPiece = editingSale.big_advance_amount ? (editingSale.big_advance_amount / pieceCount) : 0
        const commissionPerPiece = newCompanyFee > 0 ? (newCompanyFee / pieceCount) : 0
        const remainingForInstallments = pricePerPiece - reservationPerPiece - advancePerPiece - commissionPerPiece
        
        if (editForm.number_of_installments && editForm.monthly_installment_amount) {
          // Both provided - use monthly_installment_amount and recalculate number_of_installments
          const monthlyAmount = parseFloat(editForm.monthly_installment_amount)
          if (monthlyAmount > 0 && remainingForInstallments > 0) {
            const calculatedMonths = Math.ceil(remainingForInstallments / monthlyAmount)
            updates.number_of_installments = calculatedMonths
            updates.monthly_installment_amount = parseFloat(monthlyAmount.toFixed(2)) * pieceCount
          }
        } else if (editForm.number_of_installments) {
          // Only number_of_installments provided - calculate monthly_installment_amount
          const months = parseInt(editForm.number_of_installments)
          if (months > 0 && remainingForInstallments > 0) {
            const monthlyAmount = remainingForInstallments / months
            updates.number_of_installments = months
            updates.monthly_installment_amount = parseFloat(monthlyAmount.toFixed(2)) * pieceCount
          }
        } else if (editForm.monthly_installment_amount) {
          // Only monthly_installment_amount provided - calculate number_of_installments
          const monthlyAmount = parseFloat(editForm.monthly_installment_amount)
          if (monthlyAmount > 0 && remainingForInstallments > 0) {
            const calculatedMonths = Math.ceil(remainingForInstallments / monthlyAmount)
            updates.number_of_installments = calculatedMonths
            updates.monthly_installment_amount = parseFloat(monthlyAmount.toFixed(2)) * pieceCount
          }
        }
        
        // Calculate installment end date
        if (updates.installment_start_date && updates.number_of_installments) {
          const startDate = new Date(updates.installment_start_date)
          startDate.setMonth(startDate.getMonth() + updates.number_of_installments - 1)
          updates.installment_end_date = startDate.toISOString().split('T')[0]
        }
      }
      
      // Add promise of sale fields if payment type is PromiseOfSale
      if (editingSale.payment_type === 'PromiseOfSale') {
        if (editForm.promise_initial_payment) {
          updates.promise_initial_payment = parseFloat(editForm.promise_initial_payment) * pieceCount
        }
        updates.promise_completion_date = editForm.promise_completion_date || null
      }
      
      if (pieceCount === 1 || (keepPiecesTogether && confirmingAllPieces && pieceCount > 1)) {
        // Single piece - update price directly
        const pieceCost = editingPiece.purchase_cost || 0
        const newTotalPrice = newPricePerPiece
        const newProfit = newTotalPrice - pieceCost
        
        updates.total_selling_price = newTotalPrice
        // If company_fee_percentage is 0, company_fee_amount should also be 0
        // Otherwise, use calculated amount or null
        if (newCompanyFeePercentage === 0) {
          updates.company_fee_amount = 0
        } else {
          updates.company_fee_amount = newCompanyFee > 0 ? parseFloat(newCompanyFee.toFixed(2)) : null
        }
        updates.profit_margin = newProfit
      } else {
        // Multi-piece sale - need to recalculate totals
        // Get all pieces for this sale
        const { data: allPieces } = await supabase
          .from('land_pieces')
          .select('id, purchase_cost, selling_price_full, selling_price_installment')
          .in('id', editingSale.land_piece_ids)
        
        if (allPieces) {
          let totalPrice = 0
          let totalCost = 0
          
          allPieces.forEach((p: any) => {
            const piecePrice = editingSale.payment_type === 'Full' || editingSale.payment_type === 'PromiseOfSale'
              ? (p.id === editingPiece.id ? newPricePerPiece : (p.selling_price_full || 0))
              : (p.id === editingPiece.id ? newPricePerPiece : (p.selling_price_installment || p.selling_price_full || 0))
            
            totalPrice += piecePrice
            totalCost += p.purchase_cost || 0
          })
          
          // For multi-piece, calculate total commission
          // If user entered amount, multiply by piece count, otherwise calculate from percentage
          const totalCompanyFee = editForm.commission_input_method === 'amount'
            ? newCompanyFee * pieceCount
            : (totalPrice * newCompanyFeePercentage) / 100
          const totalProfit = totalPrice - totalCost
          
          updates.total_selling_price = totalPrice
          updates.total_purchase_cost = totalCost
          // If company_fee_percentage is 0, company_fee_amount should also be 0
          if (newCompanyFeePercentage === 0) {
            updates.company_fee_amount = 0
          } else {
            updates.company_fee_amount = totalCompanyFee > 0 ? parseFloat(totalCompanyFee.toFixed(2)) : null
          }
          updates.profit_margin = totalProfit
        }
      }
      
      // Handle offer updates when price or installments change
      if (editingSale.payment_type === 'Installment') {
        const pricePerPiece = parseFloat(editForm.total_selling_price) || 0
        const reservationPerPiece = parseFloat(editForm.small_advance_amount) || 0
        
        // Get advance amount from selected offer or existing sale
        let advancePerPiece = 0
        if (editForm.selected_offer_id) {
          const selectedOffer = availableOffersForEdit.find(o => o.id === editForm.selected_offer_id)
          if (selectedOffer) {
            advancePerPiece = selectedOffer.advance_is_percentage
              ? (pricePerPiece * selectedOffer.advance_amount) / 100
              : selectedOffer.advance_amount
          }
        } else {
          advancePerPiece = editingSale.big_advance_amount ? (editingSale.big_advance_amount / pieceCount) : 0
        }
        
        const commissionPerPiece = newCompanyFee > 0 ? (newCompanyFee / pieceCount) : 0
        const remainingForInstallments = pricePerPiece - reservationPerPiece - advancePerPiece - commissionPerPiece
        
        // Calculate monthly amount and months
        let monthlyAmount = 0
        let months = 0
        
        // Priority: form values > updates > existing sale values
        if (editForm.monthly_installment_amount) {
          monthlyAmount = parseFloat(editForm.monthly_installment_amount)
          months = remainingForInstallments > 0 ? Math.ceil(remainingForInstallments / monthlyAmount) : 0
        } else if (editForm.number_of_installments) {
          months = parseInt(editForm.number_of_installments)
          monthlyAmount = remainingForInstallments > 0 ? remainingForInstallments / months : 0
        } else if (updates.monthly_installment_amount) {
          monthlyAmount = updates.monthly_installment_amount / pieceCount
          months = updates.number_of_installments || 0
        } else {
          // Use existing values
          monthlyAmount = editingSale.monthly_installment_amount ? (editingSale.monthly_installment_amount / pieceCount) : 0
          months = editingSale.number_of_installments || 0
        }
        
        // Update offer's price_per_m2_installment to match the new price (always update if offer exists)
        const pricePerM2 = editingPiece.surface_area > 0 ? (pricePerPiece / editingPiece.surface_area) : 0
        
        if (editForm.selected_offer_id) {
          // Update selected offer with new price and installments
          const selectedOffer = availableOffersForEdit.find(o => o.id === editForm.selected_offer_id)
          
          try {
            // If user manually changed installments/monthly amount, use those values
            // Otherwise, recalculate from offer's monthly_payment
            let finalMonthlyAmount = monthlyAmount
            let finalMonths = months
            
            if (!editForm.monthly_installment_amount && !editForm.number_of_installments && selectedOffer) {
              // User didn't manually change installments, recalculate from offer
              if (selectedOffer.monthly_payment && selectedOffer.monthly_payment > 0) {
                finalMonths = remainingForInstallments > 0 ? Math.ceil(remainingForInstallments / selectedOffer.monthly_payment) : 0
                finalMonthlyAmount = selectedOffer.monthly_payment
                updates.number_of_installments = finalMonths
                updates.monthly_installment_amount = parseFloat(finalMonthlyAmount.toFixed(2)) * pieceCount
              } else if (selectedOffer.number_of_months && selectedOffer.number_of_months > 0) {
                finalMonths = selectedOffer.number_of_months
                finalMonthlyAmount = remainingForInstallments / finalMonths
                updates.number_of_installments = finalMonths
                updates.monthly_installment_amount = parseFloat(finalMonthlyAmount.toFixed(2)) * pieceCount
              }
            } else {
              // User manually changed installments, use those values and update offer
              updates.number_of_installments = months
              updates.monthly_installment_amount = monthlyAmount > 0 ? parseFloat(monthlyAmount.toFixed(2)) * pieceCount : null
            }
            
            // Always update offer with new price_per_m2_installment
            await supabase
              .from('payment_offers')
              .update({
                price_per_m2_installment: pricePerM2,
                company_fee_percentage: newCompanyFeePercentage,
                monthly_payment: finalMonthlyAmount > 0 ? finalMonthlyAmount : null,
                number_of_months: finalMonths > 0 ? finalMonths : null,
              })
              .eq('id', editForm.selected_offer_id)
          } catch (error) {
            console.error('Error updating offer:', error)
          }
        } else if (editForm.number_of_installments || editForm.monthly_installment_amount) {
          // Create or update default offer if installments changed manually
          try {
            const { data: existingOffer } = await supabase
              .from('payment_offers')
              .select('id')
              .eq('land_piece_id', editingPiece.id)
              .eq('is_default', true)
              .maybeSingle()
            
            const offerData = {
              land_piece_id: editingPiece.id,
              land_batch_id: editingPiece.land_batch_id,
              price_per_m2_installment: pricePerM2,
              company_fee_percentage: newCompanyFeePercentage,
              advance_amount: advancePerPiece,
              advance_is_percentage: false,
              monthly_payment: monthlyAmount > 0 ? monthlyAmount : null,
              number_of_months: months > 0 ? months : null,
              is_default: true,
            }
            
            if (existingOffer) {
              await supabase
                .from('payment_offers')
                .update(offerData)
                .eq('id', existingOffer.id)
            } else {
              const { data: newOffer } = await supabase
                .from('payment_offers')
                .insert([offerData])
                .select()
                .single()
              
              if (newOffer) {
                updates.selected_offer_id = newOffer.id
              }
            }
          } catch (error) {
            console.error('Error creating/updating offer:', error)
            // Continue without offer - not critical
          }
        }
      }
      
      // Update piece price in database FIRST (for both single and multi-piece sales)
      // This ensures the piece price is stored and will be used by calculatePieceValues
      const updatedPiecePrice = newPricePerPiece
      if (editingSale.payment_type === 'Full' || editingSale.payment_type === 'PromiseOfSale') {
        const { error: pieceUpdateError } = await supabase
          .from('land_pieces')
          .update({ selling_price_full: newPricePerPiece })
          .eq('id', editingPiece.id)
        if (pieceUpdateError) {
          console.error('Error updating piece price:', pieceUpdateError)
          throw pieceUpdateError
        }
      } else {
        // For installment, update selling_price_installment
        const { error: pieceUpdateError } = await supabase
          .from('land_pieces')
          .update({ selling_price_installment: newPricePerPiece })
          .eq('id', editingPiece.id)
        if (pieceUpdateError) {
          console.error('Error updating piece price:', pieceUpdateError)
          throw pieceUpdateError
        }
      }
      
      // Update the sale
      const { error: updateError } = await supabase
        .from('sales')
        .update(updates)
        .eq('id', editingSale.id)
      
      if (updateError) throw updateError
      
      // Fetch updated offer if one was selected/created or if offer was updated
      let updatedOffer: PaymentOffer | null = null
      const offerIdToFetch = updates.selected_offer_id || editForm.selected_offer_id
      if (offerIdToFetch) {
        try {
          const { data: offerData } = await supabase
            .from('payment_offers')
            .select('*')
            .eq('id', offerIdToFetch)
            .single()
          if (offerData) {
            updatedOffer = offerData as PaymentOffer
          }
        } catch (error) {
          console.error('Error fetching updated offer:', error)
        }
      }
      
      // Update the sale in state immediately to reflect changes
      setSales(prevSales => prevSales.map(sale => {
        if (sale.id === editingSale.id) {
          // Update the piece in land_pieces array with new price
          const updatedPieces = sale.land_pieces?.map((p: any) => {
            if (p.id === editingPiece.id) {
              if (sale.payment_type === 'Full' || sale.payment_type === 'PromiseOfSale') {
                return { ...p, selling_price_full: updatedPiecePrice }
              } else {
                return { ...p, selling_price_installment: updatedPiecePrice }
              }
            }
            return p
          }) || []
          
          return {
            ...sale,
            ...updates,
            land_pieces: updatedPieces,
            // Update selected_offer if it was changed
            selected_offer: updatedOffer || (sale as any).selected_offer,
            // Ensure company_fee_percentage is set correctly (preserve 0 as 0, not null)
            company_fee_percentage: (editForm.commission_input_method === 'percentage' && editForm.company_fee_percentage !== '') 
              ? newCompanyFeePercentage  // User specified a percentage (including 0), use it
              : (newCompanyFeePercentage > 0 ? newCompanyFeePercentage : null),
            // Ensure company_fee_amount matches company_fee_percentage
            company_fee_amount: (newCompanyFeePercentage === 0) ? 0 : (updates.company_fee_amount || null)
          }
        }
        return sale
      }))
      
      showNotification('تم تحديث بيانات البيع بنجاح', 'success')
      setEditDialogOpen(false)
      setEditingSale(null)
      setEditingPiece(null)
      
      // No need to refresh - state is already updated above
      // This prevents losing scroll position
    } catch (error: any) {
      console.error('Error saving sale edit:', error)
      showNotification(error?.message || 'حدث خطأ أثناء حفظ التعديلات', 'error')
    } finally {
      setSavingEdit(false)
    }
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
  
  // Fetch unique locations from land_batches for filter dropdown
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const { data, error } = await supabase
          .from('land_batches')
          .select('location')
          .not('location', 'is', null)
        
        if (error) {
          console.error('Error fetching locations:', error)
          return
        }
        
        const locations = new Set<string>()
        ;(data || []).forEach((batch: any) => {
          if (batch.location) {
            locations.add(batch.location)
          }
        })
        
        setUniqueLocations(Array.from(locations).sort())
      } catch (err) {
        console.error('Error fetching locations:', err)
      }
    }
    
    fetchLocations()
  }, [])

  // Filter sales based on search and filters - MUST be before any early returns
  // Maintain sort order: newest first (by created_at, then sale_date)
  const filteredSales = useMemo(() => {
    const filtered = sales.filter(sale => {
      const client = sale.client
      const clientName = client?.name?.toLowerCase() || ''
      const clientPhone = client?.phone?.toLowerCase() || ''
      const saleId = sale.id.toLowerCase()
      
      // Location filter
      if (locationFilter !== 'all') {
        const hasMatchingLocation = sale.land_pieces?.some((p: any) => 
          p.land_batch?.location === locationFilter
        )
        if (!hasMatchingLocation) return false
      }
      
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
    
    // Sort by newest first: created_at DESC, then sale_date DESC
    return filtered.sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0
      
      if (dateB !== dateA) {
        return dateB - dateA // Newest first
      }
      
      // If created_at is the same, sort by sale_date
      const saleDateA = a.sale_date ? new Date(a.sale_date).getTime() : 0
      const saleDateB = b.sale_date ? new Date(b.sale_date).getTime() : 0
      return saleDateB - saleDateA // Newest first
    })
  }, [sales, searchTerm, locationFilter])


  // Recalculate receivedAmount when companyFeePercentage or selectedSale changes for installment sales
  useEffect(() => {
    if (confirmDialogOpen && selectedSale && selectedPiece && confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment') {
      const offerToUse = selectedOffer || ((selectedSale as any).selected_offer as PaymentOffer | null)
      if (offerToUse) {
        // Recalculate receivedAmount when commission changes
        const values = calculatePieceValues(selectedSale, selectedPiece, offerToUse)
        const pricePerPiece = values.pricePerPiece
        const reservationPerPiece = values.reservationPerPiece
        const companyFeePerPiece = values.companyFeePerPiece
        
        // Calculate advance amount
        const advanceAmount = offerToUse.advance_is_percentage
          ? (pricePerPiece * offerToUse.advance_amount) / 100
          : offerToUse.advance_amount
        
        // التسبقة = Advance - Reservation (العربون is deducted from التسبقة)
        const advanceAmountAfterReservation = Math.max(0, advanceAmount - reservationPerPiece)
        // Total to receive = Advance (after reservation) + Commission
        const totalToReceive = advanceAmountAfterReservation + companyFeePerPiece
        setReceivedAmount(totalToReceive.toFixed(2))
      }
    }
  }, [confirmDialogOpen, selectedSale, selectedPiece, confirmationType, selectedOffer, companyFeePercentage])

  useEffect(() => {
    if (!canAccess) {
      setError('ليس لديك صلاحية للوصول إلى هذه الصفحة')
      setLoading(false)
      return
    }
    fetchSales()
    fetchContractEditors()
  }, [canAccess])

  const fetchContractEditors = async () => {
    try {
      const { data, error } = await supabase
        .from('contract_editors')
        .select('id, type, name, place')
        .order('type', { ascending: true })
        .order('name', { ascending: true })

      if (error) {
        // If table doesn't exist (404), just set empty array and don't log error
        if (error.code === 'PGRST116' || error.message?.includes('does not exist') || error.message?.includes('404')) {
          console.warn('contract_editors table does not exist yet. Please run the SQL migration.')
          setContractEditors([])
        } else {
          console.error('Error fetching contract editors:', error)
          setContractEditors([])
        }
      } else {
        setContractEditors(data || [])
      }
    } catch (error: any) {
      // Handle CORS or other errors gracefully
      if (error?.message?.includes('CORS') || error?.message?.includes('404') || error?.message?.includes('does not exist')) {
        console.warn('contract_editors table does not exist yet. Please run the SQL migration.')
        setContractEditors([])
      } else {
        console.error('Error fetching contract editors:', error)
        setContractEditors([])
      }
    }
  }

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
            selected_offer:payment_offers!selected_offer_id(*),
            created_by_user:users!sales_created_by_fkey(id, name)
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
        const smallAdvancePaidBySale: Record<string, number> = {}
        paymentsData.forEach((payment: any) => {
          if (payment.sale_id) {
            const amount = parseFloat(payment.amount_paid || 0)
            totalPaidBySale[payment.sale_id] = (totalPaidBySale[payment.sale_id] || 0) + amount
            
            if (payment.payment_type === 'BigAdvance') {
              bigAdvancePaidBySale[payment.sale_id] = (bigAdvancePaidBySale[payment.sale_id] || 0) + amount
            } else if (payment.payment_type === 'SmallAdvance') {
              smallAdvancePaidBySale[payment.sale_id] = (smallAdvancePaidBySale[payment.sale_id] || 0) + amount
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
          
          // If this is a PromiseOfSale and has been fully completed (both parts paid)
          if (sale.payment_type === 'PromiseOfSale' && sale.promise_completed) {
            return false // Exclude fully completed promises
          }
          // PromiseOfSale with initial payment should stay in list for completion
          
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
              .select('*, land_batch:land_batches(name, location, company_fee_percentage_full)')
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
              sale._smallAdvancePaid = smallAdvancePaidBySale[sale.id] || 0
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

  const openConfirmDialog = async (sale: SaleWithDetails, piece: LandPiece, type: 'full' | 'bigAdvance', isConfirmingAll: boolean = false) => {
    // Set confirmingAllPieces flag based on parameter
    setConfirmingAllPieces(isConfirmingAll)
    
    // Fetch the latest sale data to ensure we have the most up-to-date company_fee_percentage
    const { data: latestSaleData, error: saleError } = await supabase
      .from('sales')
      .select('*, client:clients(*), selected_offer:payment_offers(*)')
      .eq('id', sale.id)
      .single()
    
    // Use latest sale data if available, otherwise fall back to passed sale
    // Merge carefully to ensure company_fee_percentage is preserved (including 0)
    const saleToUse = latestSaleData 
      ? { 
          ...sale, 
          ...latestSaleData,
          // Explicitly preserve company_fee_percentage and company_fee_amount from latest data
          company_fee_percentage: latestSaleData.company_fee_percentage,
          company_fee_amount: latestSaleData.company_fee_amount
        } 
      : sale
    
    // Debug log removed to reduce console noise
    
    setSelectedSale(saleToUse as SaleWithDetails)
    setSelectedPiece(piece)
    setConfirmationType(type)
    
    // Load payment offer for this piece
    // If sale has selected_offer_id (reserved sale), use that offer
    // Otherwise, try to get offer from piece or batch
    let offer: PaymentOffer | null = null
    try {
      // First, if sale has selected_offer_id, use that offer
      if (saleToUse.selected_offer_id) {
        const { data: selectedOfferData } = await supabase
          .from('payment_offers')
          .select('*')
          .eq('id', saleToUse.selected_offer_id)
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
    
    // Calculate values using the offer - need to calculate pricePerPiece first
    // Use saleToUse which has the latest data from database
    let calculatedPricePerPiece = 0
    if (saleToUse.payment_type === 'Installment' && offer && offer.price_per_m2_installment) {
      // Use offer price per m²
      calculatedPricePerPiece = piece.surface_area * offer.price_per_m2_installment
    } else if (saleToUse.payment_type === 'Installment') {
      calculatedPricePerPiece = piece.selling_price_installment || piece.selling_price_full || 0
    } else {
      calculatedPricePerPiece = piece.selling_price_full || 0
    }
    
    // If still 0, fall back to dividing total
    if (calculatedPricePerPiece === 0) {
      const pieceCount = saleToUse.land_piece_ids.length
      calculatedPricePerPiece = saleToUse.total_selling_price / pieceCount
    }
    
    const pieceCount = saleToUse.land_piece_ids.length
    const reservationPerPiece = (saleToUse.small_advance_amount || 0) / pieceCount
    
    // Calculate company fee - prioritize sale's company_fee_percentage (user-edited value) over offer's commission
    // ALWAYS check if sale has company_fee_percentage set first (including 0), before falling back to defaults
    // Use saleToUse which has the latest data from database
    let companyFeePercentage = 0
    if (saleToUse.company_fee_percentage !== null && saleToUse.company_fee_percentage !== undefined) {
      // Sale has company_fee_percentage set (including 0), use it - this is the user-edited value
      companyFeePercentage = saleToUse.company_fee_percentage
    } else if (saleToUse.payment_type === 'Installment') {
      // For Installment, use offer's commission if sale doesn't have company_fee_percentage set
      if (offer && offer.company_fee_percentage !== null && offer.company_fee_percentage !== undefined) {
        companyFeePercentage = offer.company_fee_percentage
      } else {
        companyFeePercentage = 0
      }
    } else if (saleToUse.payment_type === 'Full' || saleToUse.payment_type === 'PromiseOfSale') {
      // For Full payment or PromiseOfSale, use batch default only if sale doesn't have company_fee_percentage set
      const batch = (piece as any).land_batch
      companyFeePercentage = batch?.company_fee_percentage_full || 0
    } else {
      companyFeePercentage = 0
    }
    
    // Set company fee percentage state for display (prioritize sale's value, including 0)
    // Use saleToUse which has the latest data from database
    if (saleToUse.company_fee_percentage !== null && saleToUse.company_fee_percentage !== undefined) {
      // Sale has company_fee_percentage set (including 0), use it
      setCompanyFeePercentage(saleToUse.company_fee_percentage.toString())
    } else if (offer && offer.company_fee_percentage !== null && offer.company_fee_percentage !== undefined) {
      // Sale doesn't have company_fee_percentage, use offer's commission
      setCompanyFeePercentage(offer.company_fee_percentage.toString())
    } else if (saleToUse.payment_type === 'Full' || saleToUse.payment_type === 'PromiseOfSale') {
      // For Full/PromiseOfSale, use batch default
      const batch = (piece as any).land_batch
      const batchFee = batch?.company_fee_percentage_full || 0
      setCompanyFeePercentage(batchFee.toString())
    } else {
      // Default fallback
      setCompanyFeePercentage('2')
    }
    
    const companyFeePerPiece = (calculatedPricePerPiece * companyFeePercentage) / 100
    const totalPayablePerPiece = calculatedPricePerPiece + companyFeePerPiece
    
    // Calculate number of months from offer if available
    if (offer && type === 'bigAdvance' && sale.payment_type === 'Installment') {
      // Advance is calculated from PRICE (without commission)
      const advanceAmount = offer.advance_is_percentage
        ? (calculatedPricePerPiece * offer.advance_amount) / 100
        : offer.advance_amount
      // Remaining for installments = Price - Reservation - Advance (commission is paid at confirmation)
      const remainingAmount = calculatedPricePerPiece - reservationPerPiece - advanceAmount
      
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
    
    // Auto-fill received amount (advance + commission) for installment from offer
    if (type === 'bigAdvance' && sale.payment_type === 'Installment' && offer) {
      // If confirming all pieces, calculate totals for all pieces
      if (confirmingAllPieces && sale.land_pieces && sale.land_pieces.length > 1) {
        let totalPrice = 0
        let totalReservation = 0
        let totalCompanyFee = 0
        
        sale.land_pieces.forEach((piece: any) => {
          const pieceValues = calculatePieceValues(sale, piece, offer)
          totalPrice += pieceValues.pricePerPiece
          totalReservation += pieceValues.reservationPerPiece
          totalCompanyFee += pieceValues.companyFeePerPiece
        })
        
        // Advance is calculated from PRICE (without commission)
        const advanceAmount = offer.advance_is_percentage
          ? (totalPrice * offer.advance_amount) / 100
          : offer.advance_amount * sale.land_pieces.length
        // التسبقة = Advance - Reservation (العربون is deducted from التسبقة)
        const advanceAmountAfterReservation = Math.max(0, advanceAmount - totalReservation)
        // Total to receive = Advance (after reservation) + Commission
        const totalToReceive = advanceAmountAfterReservation + totalCompanyFee
        setReceivedAmount(totalToReceive.toFixed(2))
      } else {
        // Single piece calculation
        const advanceAmount = offer.advance_is_percentage
          ? (calculatedPricePerPiece * offer.advance_amount) / 100
          : offer.advance_amount
        // Calculate reservation per piece
        const pieceCount = sale.land_piece_ids.length
        const reservationPerPiece = (sale.small_advance_amount || 0) / pieceCount
        // التسبقة = Advance - Reservation (العربون is deducted from التسبقة)
        const advanceAmountAfterReservation = Math.max(0, advanceAmount - reservationPerPiece)
        // Total to receive = Advance (after reservation) + Commission
        const totalToReceive = advanceAmountAfterReservation + companyFeePerPiece
        setReceivedAmount(totalToReceive.toFixed(2))
      }
    } else if (type === 'full') {
      // For PromiseOfSale
      if ((sale.payment_type as any) === 'PromiseOfSale') {
        if (confirmingAllPieces && sale.land_pieces && sale.land_pieces.length > 1) {
          // Calculate totals for all pieces
          let totalPrice = 0
          let totalReservation = 0
          let totalCompanyFee = 0
          
          sale.land_pieces.forEach((piece: any) => {
            const pieceCount = sale.land_piece_ids.length
            let pricePerPiece = piece.selling_price_full || 0
            if (pricePerPiece === 0) {
              pricePerPiece = sale.total_selling_price / pieceCount
            }
            const reservationPerPiece = (sale.small_advance_amount || 0) / pieceCount
            const batch = (piece as any).land_batch
            const feePercentage = batch?.company_fee_percentage_full || sale.company_fee_percentage || (companyFeePercentage ? parseFloat(String(companyFeePercentage)) : 0) || 0
            const companyFeePerPiece = (pricePerPiece * feePercentage) / 100
            
            totalPrice += pricePerPiece
            totalReservation += reservationPerPiece
            totalCompanyFee += companyFeePerPiece
          })
          
          const totalPayable = totalPrice + totalCompanyFee
          const hasInitialPayment = (sale.promise_initial_payment || 0) > 0
          
          if (hasInitialPayment) {
            // This is completion (phase 2) - auto-fill with remaining amount
            const remainingAmount = totalPayable - totalReservation - (sale.promise_initial_payment || 0)
            setReceivedAmount(remainingAmount.toFixed(2))
          } else {
            // This is initial payment (phase 1) - leave empty for user to enter
            setReceivedAmount('')
          }
        } else {
          // Single piece calculation
          const pieceCount = sale.land_piece_ids.length
          // Use actual piece price if available
          let pricePerPiece = piece.selling_price_full || 0
          if (pricePerPiece === 0) {
            pricePerPiece = sale.total_selling_price / pieceCount
          }
          const reservationPerPiece = (sale.small_advance_amount || 0) / pieceCount
          
          // Get company fee from batch
          const batch = (piece as any).land_batch
          const feePercentage = batch?.company_fee_percentage_full || sale.company_fee_percentage || (companyFeePercentage ? parseFloat(String(companyFeePercentage)) : 0) || 0
          const companyFeePerPiece = (pricePerPiece * feePercentage) / 100
          const totalPayablePerPiece = pricePerPiece + companyFeePerPiece
          
          const hasInitialPayment = (sale.promise_initial_payment || 0) > 0
          
          if (hasInitialPayment) {
            // This is completion (phase 2) - auto-fill with remaining amount
            const initialPaymentPerPiece = (sale.promise_initial_payment || 0) / pieceCount
            const remainingAmount = totalPayablePerPiece - reservationPerPiece - initialPaymentPerPiece
            setReceivedAmount(remainingAmount.toFixed(2))
          } else {
            // This is initial payment (phase 1) - leave empty for user to enter
            setReceivedAmount('')
          }
        }
        
        // Set company fee percentage for display
        const batchForDisplay = (piece as any).land_batch
        if (batchForDisplay?.company_fee_percentage_full) {
          setCompanyFeePercentage(batchForDisplay.company_fee_percentage_full.toString())
        } else if (sale.company_fee_percentage) {
          setCompanyFeePercentage(sale.company_fee_percentage.toString())
        }
      } else {
        // For full payment, calculate remaining amount using company_fee_percentage_full from batch
        if (confirmingAllPieces && sale.land_pieces && sale.land_pieces.length > 1) {
          // Calculate totals for all pieces
          let totalPrice = 0
          let totalReservation = 0
          let totalCompanyFee = 0
          
          sale.land_pieces.forEach((piece: any) => {
            const pieceCount = sale.land_piece_ids.length
            let pricePerPiece = piece.selling_price_full || 0
            if (pricePerPiece === 0) {
              pricePerPiece = sale.total_selling_price / pieceCount
            }
            const reservationPerPiece = (sale.small_advance_amount || 0) / pieceCount
            const batch = (piece as any).land_batch
            const feePercentage = batch?.company_fee_percentage_full || sale.company_fee_percentage || (companyFeePercentage ? parseFloat(String(companyFeePercentage)) : 0) || 0
            const companyFeePerPiece = (pricePerPiece * feePercentage) / 100
            
            totalPrice += pricePerPiece
            totalReservation += reservationPerPiece
            totalCompanyFee += companyFeePerPiece
          })
          
          const totalPayable = totalPrice + totalCompanyFee
          const remainingAmount = totalPayable - totalReservation
          setReceivedAmount(remainingAmount.toFixed(2))
        } else {
          // Single piece calculation
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
          
          const remainingAmount = totalPayablePerPiece - reservationPerPiece
          setReceivedAmount(remainingAmount.toFixed(2))
        }
        
        // Set company fee percentage for display
        const batchForDisplay = (piece as any).land_batch
        if (batchForDisplay?.company_fee_percentage_full) {
          setCompanyFeePercentage(batchForDisplay.company_fee_percentage_full.toString())
        } else if (sale.company_fee_percentage) {
          setCompanyFeePercentage(sale.company_fee_percentage.toString())
        }
      }
    } else {
      setReceivedAmount('')
    }
    
    // Set default installment start date to today
    setInstallmentStartDate(new Date().toISOString().split('T')[0])
    
    setPaymentMethod('cash')
    setConfirmationNotes('')
    setSelectedContractEditorId(sale.contract_editor_id || '')
    setConfirmDialogOpen(true)
  }

  // Calculate per-piece values
  const calculatePieceValues = (sale: SaleWithDetails, piece: LandPiece, offer?: PaymentOffer | null) => {
    const pieceCount = sale.land_piece_ids.length
    
    // Get the offer to use - prioritize passed offer, then selectedOffer state, then sale's selected_offer
    const offerToUse = offer || selectedOffer || ((sale as any).selected_offer as PaymentOffer | null)
    
    // PRIORITY: Always use the piece's stored price first (user-edited price takes precedence)
    // Use actual piece price instead of dividing total by count
    // This ensures correct calculation when pieces have different prices
    let pricePerPiece = 0
    if (sale.payment_type === 'Full' || sale.payment_type === 'PromiseOfSale') {
      // For Full/PromiseOfSale, use piece's stored full price
      pricePerPiece = piece.selling_price_full || 0
    } else {
      // For installment, PRIORITIZE piece's stored installment price over offer calculation
      // If piece has a stored installment price, use it (this is the user-edited price)
      if (piece.selling_price_installment && piece.selling_price_installment > 0) {
        pricePerPiece = piece.selling_price_installment
      } else if (piece.selling_price_full && piece.selling_price_full > 0) {
        // Fallback to full price if installment price not set
        pricePerPiece = piece.selling_price_full
      } else if (offerToUse && offerToUse.price_per_m2_installment) {
        // Only use offer calculation if piece doesn't have a stored price
        pricePerPiece = (piece.surface_area * offerToUse.price_per_m2_installment)
      } else {
        pricePerPiece = 0
      }
    }
    
    // If piece price is still 0, fall back to dividing total by piece count
    if (pricePerPiece === 0) {
      pricePerPiece = sale.total_selling_price / pieceCount
    }
    
    const reservationPerPiece = (sale.small_advance_amount || 0) / pieceCount
    
    // Calculate fee percentage FIRST (needed to determine companyFeePerPiece)
    let feePercentage = 0
    
    // PRIORITY 1: Always check if sale has company_fee_percentage set first (including 0)
    // This takes precedence over everything else (batch defaults, offers, etc.)
    if (sale.company_fee_percentage !== null && sale.company_fee_percentage !== undefined) {
      // Use sale's stored percentage (including 0 if explicitly set)
      // This is the user-edited value and should always be used
      feePercentage = sale.company_fee_percentage
    } else if (sale.payment_type === 'Full' || sale.payment_type === 'PromiseOfSale') {
      // PRIORITY 2: For Full payment or PromiseOfSale, use company_fee_percentage_full from batch
      // Only if sale doesn't have company_fee_percentage set (null)
      const batch = (piece as any).land_batch
      feePercentage = batch?.company_fee_percentage_full || parseFloat(companyFeePercentage) || 0
    } else {
      // PRIORITY 3: For Installment, use offer's commission if sale doesn't have one
      if (offerToUse && offerToUse.company_fee_percentage !== null && offerToUse.company_fee_percentage !== undefined) {
        // Sale doesn't have company_fee_percentage, use offer's commission
        feePercentage = offerToUse.company_fee_percentage
      } else {
        // Fallback to default
        feePercentage = parseFloat(companyFeePercentage) || 0
      }
    }
    
    // Calculate company_fee_amount based on feePercentage
    // PRIORITY: If sale has company_fee_percentage set (including 0), use that to calculate amount
    // Only use stored company_fee_amount if company_fee_percentage is null/undefined
    let companyFeePerPiece = 0
    if (sale.company_fee_percentage !== null && sale.company_fee_percentage !== undefined) {
      // Sale has company_fee_percentage set (including 0), calculate from percentage
      // This ensures that if user set it to 0%, the amount is 0 regardless of stored company_fee_amount
      if (feePercentage === 0) {
        companyFeePerPiece = 0
      } else if (pricePerPiece > 0) {
        companyFeePerPiece = (pricePerPiece * feePercentage) / 100
      } else {
        companyFeePerPiece = 0
      }
    } else if (sale.company_fee_amount && sale.company_fee_amount > 0) {
      // Sale doesn't have company_fee_percentage set, use stored company_fee_amount
      companyFeePerPiece = sale.company_fee_amount / pieceCount
    } else if (feePercentage > 0 && pricePerPiece > 0) {
      // Calculate from percentage (from offer or batch default)
      companyFeePerPiece = (pricePerPiece * feePercentage) / 100
    } else {
      companyFeePerPiece = 0
    }
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
      
      if (pieceCount === 1 || (keepPiecesTogether && confirmingAllPieces && pieceCount > 1)) {
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
      const error = err as any
      let errorMessage = error.message || 'خطأ غير معروف'
      
      // Log full error details for debugging
      if (error.details) {
        console.error('Error details:', error.details)
        errorMessage = error.details
      }
      if (error.hint) {
        console.error('Error hint:', error.hint)
      }
      if (error.code) {
        console.error('Error code:', error.code)
      }
      
      // Check for the specific "Confirmed" enum error
      if (errorMessage.includes('sale_status') && errorMessage.includes('Confirmed')) {
        errorMessage = 'خطأ في قاعدة البيانات: يرجى تشغيل السكريبت fix_sale_status_confirmed_error.sql في Supabase SQL Editor لإصلاح المشكلة'
        console.error('DATABASE TRIGGER ISSUE: A trigger is trying to set sale status to "Confirmed" which is not a valid enum value.')
      }
      
      setError('حدث خطأ أثناء إلغاء القطعة: ' + errorMessage)
      showNotification('حدث خطأ أثناء إلغاء القطعة: ' + errorMessage, 'error')
    }
  }


  const handleConfirmation = async () => {
    if (!selectedSale || !selectedPiece) return
    
    // Set pendingConfirmationType before showing pre-confirmation dialog
    setPendingConfirmationType(confirmationType)
    
    // Show pre-confirmation dialog for all sales
    if (confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment') {
      // For installment, show confirmation dialog before proceeding
      setConfirmBeforeConfirmOpen(true)
      return
    }
    
    // For full payment (including PromiseOfSale), show confirmation dialog
    if (confirmationType === 'full') {
      setConfirmBeforeConfirmOpen(true)
      return
    }
    
    // Fallback (shouldn't reach here)
    await proceedWithConfirmation()
  }

  const proceedWithConfirmation = async () => {
    if (!selectedSale || !selectedPiece) return
    
    // Prevent double execution using ref (more reliable than state for race conditions)
    if (confirmingRef.current) {
      console.warn('Confirmation already in progress, ignoring duplicate call')
      return
    }
    
    confirmingRef.current = true
    setConfirming(true)
    setError(null)
    setConfirmBeforeConfirmOpen(false)
    
    try {
      const pieceCount = selectedSale.land_piece_ids.length
      // Get the offer to use - prioritize selectedOffer state, then sale's selected_offer
      const offerToUse = selectedOffer || ((selectedSale as any).selected_offer as PaymentOffer | null)
      
      // If confirming all pieces, calculate totals for all pieces first
      let pricePerPiece = 0
      let reservationPerPiece = 0
      let companyFeePerPiece = 0
      let totalPayablePerPiece = 0
      let received = parseFloat(receivedAmount) || 0
      
      if (confirmingAllPieces && selectedSale.land_pieces && selectedSale.land_pieces.length > 1) {
        // Calculate totals for all pieces
        let totalPrice = 0
        let totalReservation = 0
        let totalCompanyFee = 0
        let totalPayable = 0
        
        selectedSale.land_pieces.forEach((piece: any) => {
          const pieceValues = calculatePieceValues(selectedSale, piece, offerToUse)
          totalPrice += pieceValues.pricePerPiece
          totalReservation += pieceValues.reservationPerPiece
          totalCompanyFee += pieceValues.companyFeePerPiece
          totalPayable += pieceValues.totalPayablePerPiece
        })
        
        pricePerPiece = totalPrice
        reservationPerPiece = totalReservation
        companyFeePerPiece = totalCompanyFee
        totalPayablePerPiece = totalPayable
      } else {
        // Single piece calculation
        const values = calculatePieceValues(selectedSale, selectedPiece, offerToUse)
        pricePerPiece = values.pricePerPiece
        reservationPerPiece = values.reservationPerPiece
        companyFeePerPiece = values.companyFeePerPiece
        totalPayablePerPiece = values.totalPayablePerPiece
      }
      
      // For installment sales with offers, always recalculate received amount from current values
      // This ensures it matches the current commission percentage even if it was changed
      if (confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment' && offerToUse) {
        // Advance calculated from pricePerPiece (WITHOUT commission)
        // When confirming all pieces, pricePerPiece is the total price for all pieces
        // When confirming all pieces and advance is not percentage, multiply by number of pieces
        const advanceAmount = offerToUse.advance_is_percentage
          ? (pricePerPiece * offerToUse.advance_amount) / 100
          : (confirmingAllPieces && selectedSale.land_pieces && selectedSale.land_pieces.length > 1
              ? offerToUse.advance_amount * selectedSale.land_pieces.length
              : offerToUse.advance_amount)
        // التسبقة = Advance - Reservation (العربون is deducted from التسبقة)
        const advanceAmountAfterReservation = Math.max(0, advanceAmount - reservationPerPiece)
        // Total to receive = Advance (after reservation) + Commission
        const totalToReceive = advanceAmountAfterReservation + companyFeePerPiece
        // For installment sales, the amount is auto-calculated, so use the calculated value directly
        received = totalToReceive
        // Also update the form state to keep it in sync
        setReceivedAmount(totalToReceive.toFixed(2))
      }
      
      // For full payment, just ensure the amount is positive
      // The amount is auto-calculated by the system, so we don't need strict validation
        if (confirmationType === 'full') {
          if (received <= 0) {
            setError('المبلغ المستلم يجب أن يكون أكبر من صفر')
            confirmingRef.current = false
            setConfirming(false)
            return
          }
        } else if (confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment') {
          // For installment without offer, just check that amount is positive
          if (!offerToUse && received <= 0) {
            setError('المبلغ المستلم يجب أن يكون أكبر من صفر')
            confirmingRef.current = false
            setConfirming(false)
            return
          }
        }

      if (pieceCount === 1 || (keepPiecesTogether && confirmingAllPieces && pieceCount > 1)) {
        // Single piece - update the sale directly
        const offerToUse = selectedOffer || ((selectedSale as any).selected_offer as PaymentOffer | null)
        const { feePercentage } = calculatePieceValues(selectedSale, selectedPiece, offerToUse)
        // Use current confirmation time for sale_date (ensures finance page uses confirmation time)
        const confirmationDate = new Date().toISOString().split('T')[0]
        const confirmationDateTime = new Date().toISOString()
        
        const updates: any = {
          sale_date: confirmationDate, // Update sale_date to confirmation date for finance calculations
          updated_at: confirmationDateTime, // Update timestamp to confirmation time
          // Always set company_fee_percentage and company_fee_amount (even if 0) to mark sale as confirmed
          // This allows the system to know the sale was confirmed, even if commission is 0
          company_fee_percentage: feePercentage !== null && feePercentage !== undefined ? feePercentage : null,
          company_fee_amount: companyFeePerPiece !== null && companyFeePerPiece !== undefined ? parseFloat(companyFeePerPiece.toFixed(2)) : 0,
          contract_editor_id: selectedContractEditorId || null,
          confirmed_by: user?.id || null,
          is_confirmed: true,
          big_advance_confirmed: true,
        }

        if (confirmationType === 'full') {
          if ((selectedSale.payment_type as any) === 'PromiseOfSale') {
            // Fetch current sale data to get latest promise_initial_payment
            const { data: currentSale, error: fetchError } = await supabase
              .from('sales')
              .select('promise_initial_payment, promise_completed')
              .eq('id', selectedSale.id)
              .single()
            
            const currentInitialPayment = fetchError ? (selectedSale.promise_initial_payment || 0) : (currentSale?.promise_initial_payment || 0)
            const hasInitialPayment = currentInitialPayment > 0
            
            if (hasInitialPayment) {
              // This is the completion (second part) - mark as completed
              updates.promise_completed = true
              updates.status = 'Completed'
            } else {
              // This is the initial payment (first part) - keep in pending
              updates.promise_initial_payment = received
              updates.status = 'Pending'
              updates.promise_completed = false
            }
          } else {
            updates.status = 'Completed'
          }
          updates.big_advance_amount = 0
        } else if (confirmationType === 'bigAdvance') {
          updates.big_advance_amount = received
          updates.status = 'Pending'
          
          // If this is an installment sale, create installments automatically
          if (selectedSale.payment_type === 'Installment') {
            // Calculate from offer if available
            let installments = 0
            let monthlyAmount = 0
            
            // NOTE: Received amount includes both advance (after reservation) + commission
            // التسبقة = Advance - Reservation (العربون is deducted from التسبقة)
            const advanceOnly = received - companyFeePerPiece // Extract advance portion (already after reservation deduction)
            // Remaining for installments = Price - Advance (after reservation deduction) - Commission
            const remainingAfterAdvance = pricePerPiece - advanceOnly - companyFeePerPiece
            if (remainingAfterAdvance <= 0) {
              setError('المبلغ المتبقي للتقسيط يجب أن يكون أكبر من صفر')
              confirmingRef.current = false
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
              confirmingRef.current = false
              setConfirming(false)
              return
              }
              monthlyAmount = remainingAfterAdvance / installments
            }
            
            updates.number_of_installments = installments
            updates.monthly_installment_amount = parseFloat(monthlyAmount.toFixed(2))
            const startDateStr = installmentStartDate || new Date().toISOString().split('T')[0]
            updates.installment_start_date = startDateStr
            // Calculate end date (start date + number of months - 1)
            const endDate = new Date(startDateStr)
            endDate.setMonth(endDate.getMonth() + installments - 1)
            updates.installment_end_date = endDate.toISOString().split('T')[0]
            
            // Get existing installments to see what we're working with
            const { data: existingInstallments } = await supabase
              .from('installments')
              .select('id, installment_number')
              .eq('sale_id', selectedSale.id)
            
            // Try to delete existing installments (non-blocking - if it fails, we'll use UPSERT)
            if (existingInstallments && existingInstallments.length > 0) {
              // Try to delete, but don't fail if it doesn't work
              const { error: deleteError } = await supabase
                .from('installments')
                .delete()
                .eq('sale_id', selectedSale.id)
              
              if (deleteError) {
                console.warn('Could not delete existing installments, will use UPSERT instead:', deleteError.message)
                // Wait a bit in case deletion is still processing
                await new Promise(resolve => setTimeout(resolve, 500))
              } else {
                // Wait for delete to propagate
                await new Promise(resolve => setTimeout(resolve, 300))
              }
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
            
            // Insert or update installments - optimized batch processing
            // Fetch all existing installments for this sale in one query
            const { data: allExistingInstallments } = await supabase
              .from('installments')
              .select('id, installment_number, amount_paid, stacked_amount')
              .eq('sale_id', selectedSale.id)
            
            // Create a map of existing installments by installment_number for fast lookup
            const existingMap = new Map<number, { id: string; amount_paid: number; stacked_amount: number }>()
            if (allExistingInstallments) {
              for (const existing of allExistingInstallments) {
                existingMap.set(existing.installment_number, {
                  id: existing.id,
                  amount_paid: existing.amount_paid ?? 0,
                  stacked_amount: existing.stacked_amount ?? 0,
                })
              }
            }
            
            // Separate installments into updates and inserts
            const toUpdate: Array<{ id: string; data: any }> = []
            const toInsert: any[] = []
            
            for (const installment of installmentsToCreate) {
              const existing = existingMap.get(installment.installment_number)
              if (existing) {
                // Add to update list
                toUpdate.push({
                  id: existing.id,
                  data: {
                    amount_due: installment.amount_due,
                    due_date: installment.due_date,
                    status: installment.status,
                    amount_paid: existing.amount_paid,
                    stacked_amount: existing.stacked_amount,
                  }
                })
              } else {
                // Add to insert list
                toInsert.push(installment)
              }
            }
            
            // Batch update existing installments
            if (toUpdate.length > 0) {
              // Update each installment (Supabase doesn't support batch update by different IDs easily)
              for (const item of toUpdate) {
                const { error: updateError } = await supabase
                  .from('installments')
                  .update(item.data)
                  .eq('id', item.id)
                
                if (updateError) {
                  throw new Error(`فشل في تحديث الأقساط: ${updateError.message || 'خطأ في قاعدة البيانات'}`)
                }
              }
            }
            
            // Batch insert new installments
            if (toInsert.length > 0) {
              const { error: insertError } = await supabase
                .from('installments')
                .insert(toInsert)
              
              if (insertError) {
                // If batch insert fails, try individual inserts with conflict handling
                for (const installment of toInsert) {
                  const { error: singleInsertError } = await supabase
                    .from('installments')
                    .insert([installment])
                  
                  if (singleInsertError) {
                    // Check if it exists now (race condition)
                    const { data: retryExisting } = await supabase
                      .from('installments')
                      .select('id, amount_paid, stacked_amount')
                      .eq('sale_id', installment.sale_id)
                      .eq('installment_number', installment.installment_number)
                      .maybeSingle()
                    
                    if (retryExisting) {
                      // Update it
                      const { error: retryUpdateError } = await supabase
                        .from('installments')
                        .update({
                          amount_due: installment.amount_due,
                          due_date: installment.due_date,
                          status: installment.status,
                          amount_paid: retryExisting.amount_paid ?? 0,
                          stacked_amount: retryExisting.stacked_amount ?? 0,
                        })
                        .eq('id', retryExisting.id)
                      
                      if (retryUpdateError) {
                        throw new Error(`فشل في إنشاء/تحديث القسط ${installment.installment_number}: ${retryUpdateError.message || 'خطأ في قاعدة البيانات'}`)
                      }
                    } else {
                      throw new Error(`فشل في إنشاء القسط ${installment.installment_number}: ${singleInsertError.message || 'خطأ في قاعدة البيانات'}`)
                    }
                  }
                }
              }
            }
            
            // Clean up any extra installments that shouldn't exist (if number of installments decreased)
            if (existingInstallments && existingInstallments.length > installments) {
              // Delete installments with numbers greater than the new count
              await supabase
                .from('installments')
                .delete()
                .eq('sale_id', selectedSale.id)
                .gt('installment_number', installments)
            }
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
                // Ensure all required fields have valid values
                const pieceOffersToCreate = batchOffers
                  .filter((offer: any) => {
                    // Validate required fields before creating
                    return offer &&
                      typeof offer.company_fee_percentage === 'number' &&
                      typeof offer.advance_amount === 'number' &&
                      typeof offer.monthly_payment === 'number' &&
                      typeof offer.advance_is_percentage === 'boolean' &&
                      typeof offer.is_default === 'boolean'
                  })
                  .map((offer: any) => ({
                  land_batch_id: null, // Piece-specific offers don't reference batch
                  land_piece_id: selectedPiece.id,
                    price_per_m2_installment: offer.price_per_m2_installment ?? null,
                    company_fee_percentage: offer.company_fee_percentage ?? 0,
                    advance_amount: offer.advance_amount ?? 0,
                    advance_is_percentage: offer.advance_is_percentage ?? false,
                    monthly_payment: offer.monthly_payment ?? 0,
                    number_of_months: offer.number_of_months ?? null,
                    offer_name: offer.offer_name ?? null,
                    notes: offer.notes ?? null,
                    is_default: offer.is_default ?? false,
                  created_by: user?.id || null,
                }))

                // Only insert if there are valid offers to create
                if (pieceOffersToCreate.length > 0) {
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
        }

        // For PromiseOfSale completion, we need to check the current state from DB
        let currentSaleData = selectedSale
        if ((selectedSale.payment_type as any) === 'PromiseOfSale' && confirmationType === 'full') {
          // Fetch current sale data to get latest promise_initial_payment
          const { data: currentSale, error: fetchError } = await supabase
            .from('sales')
            .select('promise_initial_payment, promise_completed')
            .eq('id', selectedSale.id)
            .single()
          
          if (!fetchError && currentSale) {
            currentSaleData = { ...selectedSale, ...currentSale }
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
          let paymentType = confirmationType === 'full' ? 'Full' : 'BigAdvance'
          // For PromiseOfSale, use Partial for first part, Full for completion
          if ((currentSaleData.payment_type as any) === 'PromiseOfSale' && confirmationType === 'full') {
            const hasInitialPayment = (currentSaleData.promise_initial_payment || 0) > 0
            paymentType = hasInitialPayment ? 'Full' : 'Partial'
          }
          
          // Use current confirmation time for payment date (ensures finance page uses confirmation time)
          const confirmationDate = new Date().toISOString().split('T')[0]
          const confirmationDateTime = new Date().toISOString()
          
          // Check if payment already exists to prevent duplicates
          const { data: existingPayments, error: checkError } = await supabase
            .from('payments')
            .select('id')
            .eq('sale_id', selectedSale.id)
            .eq('payment_type', paymentType)
            .eq('payment_date', confirmationDate)
            .eq('amount_paid', received)
            .limit(1)
          
          if (checkError) {
            console.error('Error checking for existing payment:', checkError)
            // Continue anyway - might be a permission issue
          }
          
          // Only create payment if it doesn't already exist
          if (!existingPayments || existingPayments.length === 0) {
            const { error: paymentError } = await supabase.from('payments').insert([{
              client_id: selectedSale.client_id,
              sale_id: selectedSale.id,
              amount_paid: received,
              payment_type: paymentType,
              payment_date: confirmationDate, // Use confirmation date for finance calculations
              notes: confirmationNotes || null,
              recorded_by: user?.id || null,
            }] as any)
            if (paymentError) throw paymentError
            
            // Update sale_date to confirmation date so finance page uses confirmation time
            const { error: saleDateUpdateError } = await supabase
              .from('sales')
              .update({ 
                sale_date: confirmationDate,
                updated_at: confirmationDateTime
              } as any)
              .eq('id', selectedSale.id)
            
            if (saleDateUpdateError) {
              console.warn('Could not update sale_date to confirmation date:', saleDateUpdateError)
              // Don't throw - this is not critical, but helps with finance calculations
            }
          } else {
            console.warn('Payment already exists for this sale, skipping duplicate creation')
          }
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
      } else if (!keepPiecesTogether || !confirmingAllPieces) {
        // Multiple pieces - split the sale (only if not keeping pieces together or not confirming all)
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
          // Always set company_fee_percentage and company_fee_amount (even if 0) to mark sale as confirmed
          company_fee_percentage: calculatedFeePercentage !== null && calculatedFeePercentage !== undefined ? calculatedFeePercentage : null,
          company_fee_amount: companyFeePerPiece !== null && companyFeePerPiece !== undefined ? parseFloat(companyFeePerPiece.toFixed(2)) : 0,
          big_advance_amount: 0,
          number_of_installments: null,
          monthly_installment_amount: null,
          status: 'Pending', // Will be set correctly below based on payment type
          sale_date: new Date().toISOString().split('T')[0], // Use confirmation date, not original sale date
          notes: `تأكيد قطعة من البيع #${selectedSale.id.slice(0, 8)}`,
          created_by: selectedSale.created_by || user?.id || null, // Keep original creator
          confirmed_by: user?.id || null,
          is_confirmed: true,
          big_advance_confirmed: true,
          contract_editor_id: selectedContractEditorId || null,
          sale_date: new Date().toISOString().split('T')[0], // Use confirmation date, not original sale date
        }

        if (confirmationType === 'full') {
          if ((selectedSale.payment_type as any) === 'PromiseOfSale') {
            // Fetch current sale data to get latest promise_initial_payment
            const { data: currentSale, error: fetchError } = await supabase
              .from('sales')
              .select('promise_initial_payment, promise_completed')
              .eq('id', selectedSale.id)
              .single()
            
            const currentInitialPayment = fetchError ? (selectedSale.promise_initial_payment || 0) : (currentSale?.promise_initial_payment || 0)
            const hasInitialPayment = currentInitialPayment > 0
            
            if (hasInitialPayment) {
              // This is the completion (second part) - mark as completed
              newSaleData.promise_completed = true
              newSaleData.status = 'Completed'
            } else {
              // This is the initial payment (first part) - keep in pending
              newSaleData.promise_initial_payment = received
              newSaleData.status = 'Pending'
              newSaleData.promise_completed = false
            }
          } else {
            newSaleData.status = 'Completed'
          }
          newSaleData.big_advance_amount = 0
        } else if (confirmationType === 'bigAdvance') {
          newSaleData.big_advance_amount = received
          newSaleData.status = 'Pending'
          
          // If this is an installment sale, create installments automatically
          if (selectedSale.payment_type === 'Installment') {
            // Calculate from offer if available
            let installments = 0
            let monthlyAmount = 0
            
            // NOTE: Received amount includes both advance (after reservation) + commission
            // التسبقة = Advance - Reservation (العربون is deducted from التسبقة)
            const advanceOnly = received - companyFeePerPiece // Extract advance portion (already after reservation deduction)
            // Remaining for installments = Price - Advance (after reservation deduction) - Commission
            const remainingAfterAdvance = pricePerPiece - advanceOnly - companyFeePerPiece
            if (remainingAfterAdvance <= 0) {
              setError('المبلغ المتبقي للتقسيط يجب أن يكون أكبر من صفر')
              confirmingRef.current = false
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
              confirmingRef.current = false
              setConfirming(false)
              return
              }
              monthlyAmount = remainingAfterAdvance / installments
            }
            
            newSaleData.number_of_installments = installments
            newSaleData.monthly_installment_amount = parseFloat(monthlyAmount.toFixed(2))
            const startDateStr = installmentStartDate || new Date().toISOString().split('T')[0]
            newSaleData.installment_start_date = startDateStr
            // Calculate end date (start date + number of months - 1)
            const endDate = new Date(startDateStr)
            endDate.setMonth(endDate.getMonth() + installments - 1)
            newSaleData.installment_end_date = endDate.toISOString().split('T')[0]
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
          let paymentType = confirmationType === 'full' ? 'Full' : 'BigAdvance'
          // For PromiseOfSale, use Partial for first part, Full for completion
          if ((selectedSale.payment_type as any) === 'PromiseOfSale' && confirmationType === 'full') {
            // Fetch current sale data to get latest promise_initial_payment
            const { data: currentSale, error: fetchError } = await supabase
              .from('sales')
              .select('promise_initial_payment')
              .eq('id', selectedSale.id)
              .single()
            
            const currentInitialPayment = fetchError ? (selectedSale.promise_initial_payment || 0) : (currentSale?.promise_initial_payment || 0)
            const hasInitialPayment = currentInitialPayment > 0
            paymentType = hasInitialPayment ? 'Full' : 'Partial'
          }
          
          // Use current confirmation time for payment date (ensures finance page uses confirmation time)
          const confirmationDate = new Date().toISOString().split('T')[0]
          const confirmationDateTime = new Date().toISOString()
          
          // Check if payment already exists to prevent duplicates
          const { data: existingPayments, error: checkError } = await supabase
            .from('payments')
            .select('id')
            .eq('sale_id', newSale.id)
            .eq('payment_type', paymentType)
            .eq('payment_date', confirmationDate)
            .eq('amount_paid', received)
            .limit(1)
          
          if (checkError) {
            console.error('Error checking for existing payment:', checkError)
            // Continue anyway - might be a permission issue
          }
          
          // Only create payment if it doesn't already exist
          if (!existingPayments || existingPayments.length === 0) {
            const { error: paymentError } = await supabase.from('payments').insert([{
              client_id: selectedSale.client_id,
              sale_id: newSale.id,
              amount_paid: received,
              payment_type: paymentType,
              payment_date: confirmationDate, // Use confirmation date for finance calculations
              notes: confirmationNotes || null,
              recorded_by: user?.id || null,
            }] as any)
            
            if (paymentError) throw paymentError
            
            // Update sale_date to confirmation date so finance page uses confirmation time
            const { error: saleDateUpdateError } = await supabase
              .from('sales')
              .update({ 
                sale_date: confirmationDate,
                updated_at: confirmationDateTime
              } as any)
              .eq('id', newSale.id)
            
            if (saleDateUpdateError) {
              console.warn('Could not update sale_date to confirmation date:', saleDateUpdateError)
              // Don't throw - this is not critical, but helps with finance calculations
            }
          } else {
            console.warn('Payment already exists for this sale, skipping duplicate creation')
          }
        }

        // Create installments schedule if needed (for bigAdvance with installments)
        if (confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment' && newSaleData.number_of_installments) {
          // Get existing installments to see what we're working with
          const { data: existingInstallments } = await supabase
            .from('installments')
            .select('id, installment_number')
            .eq('sale_id', newSale.id)
          
          // Try to delete existing installments (non-blocking - if it fails, we'll use UPSERT)
          if (existingInstallments && existingInstallments.length > 0) {
            // Try to delete, but don't fail if it doesn't work
            const { error: deleteError } = await supabase
              .from('installments')
              .delete()
              .eq('sale_id', newSale.id)
            
            if (deleteError) {
              console.warn('Could not delete existing installments, will use UPSERT instead:', deleteError.message)
              // Wait a bit in case deletion is still processing
              await new Promise(resolve => setTimeout(resolve, 500))
            } else {
              // Wait for delete to propagate
              await new Promise(resolve => setTimeout(resolve, 300))
            }
          }
          
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
          
          // Insert or update installments - optimized batch processing
          // Fetch all existing installments for this sale in one query
          const { data: allExistingInstallments } = await supabase
            .from('installments')
            .select('id, installment_number, amount_paid, stacked_amount')
            .eq('sale_id', newSale.id)
          
          // Create a map of existing installments by installment_number for fast lookup
          const existingMap = new Map<number, { id: string; amount_paid: number; stacked_amount: number }>()
          if (allExistingInstallments) {
            for (const existing of allExistingInstallments) {
              existingMap.set(existing.installment_number, {
                id: existing.id,
                amount_paid: existing.amount_paid ?? 0,
                stacked_amount: existing.stacked_amount ?? 0,
              })
            }
          }
          
          // Separate installments into updates and inserts
          const toUpdate: Array<{ id: string; data: any }> = []
          const toInsert: any[] = []
          
          for (const installment of installmentsToCreate) {
            const existing = existingMap.get(installment.installment_number)
            if (existing) {
              // Add to update list
              toUpdate.push({
                id: existing.id,
                data: {
                  amount_due: installment.amount_due,
                  due_date: installment.due_date,
                  status: installment.status,
                  amount_paid: existing.amount_paid,
                  stacked_amount: existing.stacked_amount,
                }
              })
            } else {
              // Add to insert list
              toInsert.push(installment)
            }
          }
          
          // Batch update existing installments
          if (toUpdate.length > 0) {
            // Update each installment (Supabase doesn't support batch update by different IDs easily)
            for (const item of toUpdate) {
              const { error: updateError } = await supabase
                .from('installments')
                .update(item.data)
                .eq('id', item.id)
              
              if (updateError) {
                throw new Error(`فشل في تحديث الأقساط: ${updateError.message || 'خطأ في قاعدة البيانات'}`)
              }
            }
          }
          
          // Batch insert new installments
          if (toInsert.length > 0) {
            const { error: insertError } = await supabase
              .from('installments')
              .insert(toInsert)
            
            if (insertError) {
              // If batch insert fails, try individual inserts with conflict handling
              for (const installment of toInsert) {
                const { error: singleInsertError } = await supabase
                  .from('installments')
                  .insert([installment])
                
                if (singleInsertError) {
                  // Check if it exists now (race condition)
                  const { data: retryExisting } = await supabase
                    .from('installments')
                    .select('id, amount_paid, stacked_amount')
                    .eq('sale_id', installment.sale_id)
                    .eq('installment_number', installment.installment_number)
                    .maybeSingle()
                  
                  if (retryExisting) {
                    // Update it
                    const { error: retryUpdateError } = await supabase
                      .from('installments')
                      .update({
                        amount_due: installment.amount_due,
                        due_date: installment.due_date,
                        status: installment.status,
                        amount_paid: retryExisting.amount_paid ?? 0,
                        stacked_amount: retryExisting.stacked_amount ?? 0,
                      })
                      .eq('id', retryExisting.id)
                    
                    if (retryUpdateError) {
                      throw new Error(`فشل في إنشاء/تحديث القسط ${installment.installment_number}: ${retryUpdateError.message || 'خطأ في قاعدة البيانات'}`)
                    }
                  } else {
                    throw new Error(`فشل في إنشاء القسط ${installment.installment_number}: ${singleInsertError.message || 'خطأ في قاعدة البيانات'}`)
                  }
                }
              }
            }
          }
          
          // Clean up any extra installments that shouldn't exist (if number of installments decreased)
          if (existingInstallments && existingInstallments.length > newSaleData.number_of_installments) {
            // Delete installments with numbers greater than the new count
            await supabase
              .from('installments')
              .delete()
              .eq('sale_id', newSale.id)
              .gt('installment_number', newSaleData.number_of_installments)
          }
        }

        // Update the original sale - remove this piece and recalculate
        // If confirming all pieces, we'll handle the original sale deletion in the loop
        // Otherwise, update it here
        if (!confirmingAllPieces) {
          const remainingPieces = selectedSale.land_piece_ids.filter(id => id !== selectedPiece.id)
          const remainingCount = remainingPieces.length
          const remainingPrice = selectedSale.total_selling_price - pricePerPiece
          const remainingCost = selectedSale.total_purchase_cost - costPerPiece
          const remainingProfit = selectedSale.profit_margin - profitPerPiece
          const remainingReservation = (selectedSale.small_advance_amount || 0) - reservationPerPiece
          
          // If this was the last piece, delete the original sale
          if (remainingCount === 0) {
            await supabase
              .from('sales')
              .delete()
              .eq('id', selectedSale.id)
          } else {
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
        } else {
          // When confirming all pieces, update the original sale to remove the first piece
          // The loop will handle the rest and delete it when empty
          const remainingPieces = selectedSale.land_piece_ids.filter(id => id !== selectedPiece.id)
          const remainingCount = remainingPieces.length
          const remainingPrice = selectedSale.total_selling_price - pricePerPiece
          const remainingCost = selectedSale.total_purchase_cost - costPerPiece
          const remainingProfit = selectedSale.profit_margin - profitPerPiece
          const remainingReservation = (selectedSale.small_advance_amount || 0) - reservationPerPiece
          
          if (remainingCount > 0) {
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
        }
      }

      // If confirming all pieces and NOT keeping them together, confirm each remaining piece automatically
      // Use pieceCount to check, as it's more reliable than land_pieces array
      if (confirmingAllPieces && pieceCount > 1 && !keepPiecesTogether) {
        // Wait a moment for the first piece confirmation to complete and sale to be updated
        await new Promise(resolve => setTimeout(resolve, 200))
        console.log(`[CONFIRM ALL] Starting confirmation loop for ${pieceCount} pieces`)
        // Store original sale ID and piece IDs BEFORE any confirmations
        const originalSaleId = selectedSale.id
        // Get all pieces - use land_pieces if available, otherwise fetch them
        let allPieces: LandPiece[] = []
        if (selectedSale.land_pieces && selectedSale.land_pieces.length > 0) {
          allPieces = [...selectedSale.land_pieces]
        } else {
          // Fetch pieces if not in the sale object
          const { data: piecesData } = await supabase
            .from('land_pieces')
            .select('*')
            .in('id', selectedSale.land_piece_ids)
          if (piecesData) {
            allPieces = piecesData as LandPiece[]
          }
        }
        
        // Store all piece IDs that need to be confirmed (excluding the first one which is already being confirmed)
        const allPieceIds = allPieces.map(p => p.id)
        const firstPieceId = selectedPiece.id
        const remainingPieceIds = allPieceIds.filter(id => id !== firstPieceId)
        
        console.log(`[CONFIRM ALL] ${allPieces.length} total pieces, first piece ${firstPieceId} confirmed, ${remainingPieceIds.length} remaining:`, remainingPieceIds)
        
        // If no pieces to confirm, skip the loop
        if (remainingPieceIds.length === 0) {
          console.warn('[CONFIRM ALL] No remaining pieces to confirm')
          setConfirmingAllPieces(false)
        } else {
          // Fetch pieces data for remaining pieces
          const { data: remainingPiecesData, error: fetchPiecesError } = await supabase
            .from('land_pieces')
            .select('*')
            .in('id', remainingPieceIds)
          
          if (fetchPiecesError) {
            console.error('[CONFIRM ALL] Error fetching remaining pieces:', fetchPiecesError)
            setConfirmingAllPieces(false)
          } else if (!remainingPiecesData || remainingPiecesData.length === 0) {
            console.warn('[CONFIRM ALL] Could not fetch remaining pieces data')
            setConfirmingAllPieces(false)
          } else {
            console.log(`[CONFIRM ALL] Fetched ${remainingPiecesData.length} remaining pieces, starting loop`)
            // Confirm each remaining piece
            let confirmedCount = 0
            for (let i = 0; i < remainingPiecesData.length; i++) {
              const piece = remainingPiecesData[i] as LandPiece
              try {
                console.log(`[CONFIRM ALL] Processing piece ${i + 1}/${remainingPiecesData.length}: ${piece.id} (${piece.piece_number || 'unknown'})`)
                // Always fetch the latest sale state to get current piece count and values
                const { data: currentSaleData, error: fetchError } = await supabase
                  .from('sales')
                  .select('*, client:clients(*), selected_offer:payment_offers!selected_offer_id(*)')
                  .eq('id', originalSaleId)
                  .single()
                
                // If sale doesn't exist or has no pieces left, stop
                if (fetchError || !currentSaleData || !(currentSaleData as any).land_piece_ids || (currentSaleData as any).land_piece_ids.length === 0) {
                  console.warn(`[CONFIRM ALL] Sale ${originalSaleId} no longer exists or has no pieces, stopping confirmation loop`)
                  break
                }
                
                console.log(`[CONFIRM ALL] Sale ${originalSaleId} still exists with ${(currentSaleData as any).land_piece_ids.length} pieces`)
                
                // Check if this piece is still in the sale
                const currentPieceIds = (currentSaleData as any).land_piece_ids as string[]
                if (!currentPieceIds.includes(piece.id)) {
                  console.warn(`[CONFIRM ALL] Piece ${piece.id} is no longer in sale ${originalSaleId}, skipping`)
                  continue // Skip this piece and continue with next
                }
                
                console.log(`[CONFIRM ALL] Piece ${piece.id} is still in sale, proceeding with confirmation`)
                
                // Check if this piece already has a confirmed sale (to prevent duplicates)
                const { data: existingSales } = await supabase
                  .from('sales')
                  .select('id, status, company_fee_percentage')
                  .contains('land_piece_ids', [piece.id])
                  .neq('id', originalSaleId)
                
                // If piece already has a confirmed sale (has company_fee_percentage set), skip it
                if (existingSales && existingSales.length > 0) {
                  const hasConfirmedSale = existingSales.some((s: any) => 
                    s.company_fee_percentage !== null && s.company_fee_percentage !== undefined
                  )
                  if (hasConfirmedSale) {
                    console.warn(`[CONFIRM ALL] Piece ${piece.id} already has a confirmed sale, skipping to prevent duplicates`)
                    continue
                  }
                }
                
                console.log(`[CONFIRM ALL] No existing confirmed sale for piece ${piece.id}, creating new sale`)
                
                const currentSale = currentSaleData as SaleWithDetails
                const pieceToConfirm = piece as LandPiece
                
                // Calculate values for this piece (each piece should be calculated individually)
                const pieceValues = calculatePieceValues(currentSale, pieceToConfirm, offerToUse)
                const pieceCount = (currentSale as any).land_piece_ids.length
                const costPerPiece = currentSale.total_purchase_cost / pieceCount
                const profitPerPiece = currentSale.profit_margin / pieceCount
                const { feePercentage: calculatedFeePercentage } = pieceValues
                
                // Calculate received amount for THIS piece (not divided from total)
                let pieceReceived = 0
                if (confirmationType === 'bigAdvance' && currentSale.payment_type === 'Installment' && offerToUse) {
                  // Calculate advance for this specific piece
                  const advanceAmount = offerToUse.advance_is_percentage
                    ? (pieceValues.pricePerPiece * offerToUse.advance_amount) / 100
                    : offerToUse.advance_amount
                  const advanceAmountAfterReservation = Math.max(0, advanceAmount - pieceValues.reservationPerPiece)
                  pieceReceived = advanceAmountAfterReservation + pieceValues.companyFeePerPiece
                } else if (confirmationType === 'full') {
                  pieceReceived = pieceValues.totalPayablePerPiece - pieceValues.reservationPerPiece
                }
                
                // Create a new sale for this piece (same logic as single piece confirmation)
                const newSaleData: any = {
                  client_id: currentSale.client_id,
                  land_piece_ids: [pieceToConfirm.id],
                  payment_type: currentSale.payment_type,
                  total_purchase_cost: costPerPiece,
                  total_selling_price: pieceValues.pricePerPiece,
                  profit_margin: profitPerPiece,
                  small_advance_amount: pieceValues.reservationPerPiece,
                  company_fee_percentage: calculatedFeePercentage !== null && calculatedFeePercentage !== undefined ? calculatedFeePercentage : null,
                  company_fee_amount: pieceValues.companyFeePerPiece !== null && pieceValues.companyFeePerPiece !== undefined ? parseFloat(pieceValues.companyFeePerPiece.toFixed(2)) : 0,
                  big_advance_amount: 0,
                  number_of_installments: null,
                  monthly_installment_amount: null,
                  status: 'Pending',
                  sale_date: currentSale.sale_date,
                  notes: `تأكيد قطعة من البيع #${currentSale.id.slice(0, 8)}`,
                  created_by: currentSale.created_by || user?.id || null,
                  confirmed_by: user?.id || null,
                  is_confirmed: true,
                  big_advance_confirmed: true,
                  contract_editor_id: selectedContractEditorId || null,
                }
                
                if (confirmationType === 'full') {
                  if ((currentSale.payment_type as any) === 'PromiseOfSale') {
                    const { data: currentSaleData } = await supabase
                      .from('sales')
                      .select('promise_initial_payment, promise_completed')
                      .eq('id', currentSale.id)
                      .single()
                    
                    const hasInitialPayment = (currentSaleData?.promise_initial_payment || 0) > 0
                    if (hasInitialPayment) {
                      newSaleData.promise_completed = true
                      newSaleData.status = 'Completed'
                    } else {
                      newSaleData.promise_initial_payment = pieceReceived
                      newSaleData.status = 'Pending'
                      newSaleData.promise_completed = false
                    }
                  } else {
                    newSaleData.status = 'Completed'
                  }
                  newSaleData.big_advance_amount = 0
                } else if (confirmationType === 'bigAdvance') {
                  newSaleData.big_advance_amount = pieceReceived
                  newSaleData.status = 'Pending'
                  
                  if (currentSale.payment_type === 'Installment') {
                    // Calculate advance only (without commission) for this piece
                    const advanceOnly = pieceReceived - pieceValues.companyFeePerPiece
                    // Remaining for installments = Price - Advance (after reservation deduction) - Commission
                    const remainingAfterAdvance = pieceValues.pricePerPiece - advanceOnly - pieceValues.companyFeePerPiece
                    
                    if (remainingAfterAdvance > 0) {
                      let installments = 0
                      let monthlyAmount = 0
                      
                      if (offerToUse && offerToUse.monthly_payment && offerToUse.monthly_payment > 0) {
                        installments = Math.ceil(remainingAfterAdvance / offerToUse.monthly_payment)
                        monthlyAmount = offerToUse.monthly_payment
                      } else if (offerToUse && offerToUse.number_of_months && offerToUse.number_of_months > 0) {
                        installments = offerToUse.number_of_months
                        monthlyAmount = remainingAfterAdvance / offerToUse.number_of_months
                      } else {
                        installments = parseInt(numberOfInstallments) || currentSale.number_of_installments || 12
                        monthlyAmount = remainingAfterAdvance / installments
                      }
                      
                      newSaleData.number_of_installments = installments
                      newSaleData.monthly_installment_amount = parseFloat(monthlyAmount.toFixed(2))
                      const startDateStr = installmentStartDate || new Date().toISOString().split('T')[0]
                      newSaleData.installment_start_date = startDateStr
                      const endDate = new Date(startDateStr)
                      endDate.setMonth(endDate.getMonth() + installments - 1)
                      newSaleData.installment_end_date = endDate.toISOString().split('T')[0]
                    }
                  }
                }
                
                // Insert the new sale
                const saleDataToInsert = { ...newSaleData }
                delete (saleDataToInsert as any).company_fee_percentage
                delete (saleDataToInsert as any).company_fee_amount
                
                const { data: newSaleDataArray, error: insertError } = await supabase
                  .from('sales')
                  .insert([saleDataToInsert] as any)
                  .select('*')
                
                if (insertError) {
                  console.error('Error inserting sale for piece:', pieceToConfirm.id, insertError)
                  continue // Skip this piece and continue with next
                }
                
                const newSale = newSaleDataArray?.[0]
                if (!newSale) {
                  console.warn(`Sale insert succeeded but no data returned for piece ${pieceToConfirm.id}`)
                  continue
                }
                
                console.log(`Successfully created sale ${newSale.id} for piece ${pieceToConfirm.id}`)
                
                // Update company fee if needed
                if (pieceValues.companyFeePerPiece > 0) {
                  await supabase
                    .from('sales')
                    .update({
                      company_fee_percentage: calculatedFeePercentage !== null && calculatedFeePercentage !== undefined ? calculatedFeePercentage : null,
                      company_fee_amount: pieceValues.companyFeePerPiece
                    } as any)
                    .eq('id', newSale.id)
                }
                
                // Create payment record
                if (pieceReceived > 0) {
                  let paymentType = confirmationType === 'full' ? 'Full' : 'BigAdvance'
                  if ((currentSale.payment_type as any) === 'PromiseOfSale' && confirmationType === 'full') {
                    const { data: currentSaleData } = await supabase
                      .from('sales')
                      .select('promise_initial_payment')
                      .eq('id', currentSale.id)
                      .single()
                    const hasInitialPayment = (currentSaleData?.promise_initial_payment || 0) > 0
                    paymentType = hasInitialPayment ? 'Full' : 'Partial'
                  }
                  
                  const today = new Date().toISOString().split('T')[0]
                  await supabase.from('payments').insert([{
                    client_id: currentSale.client_id,
                    sale_id: newSale.id,
                    amount_paid: pieceReceived,
                    payment_type: paymentType,
                    payment_date: today,
                    notes: confirmationNotes || null,
                    recorded_by: user?.id || null,
                  }] as any)
                }
                
                // Create installments if needed
                if (confirmationType === 'bigAdvance' && currentSale.payment_type === 'Installment' && newSaleData.number_of_installments) {
                  // First, check if installments already exist and delete them
                  const { data: existingInstallments } = await supabase
                    .from('installments')
                    .select('id')
                    .eq('sale_id', newSale.id)
                  
                  if (existingInstallments && existingInstallments.length > 0) {
                    // Delete existing installments
                    const { error: deleteError } = await supabase
                      .from('installments')
                      .delete()
                      .eq('sale_id', newSale.id)
                    
                    if (deleteError && deleteError.code !== '23503') {
                      console.error('Error deleting existing installments:', deleteError)
                    }
                    
                    // Wait for delete to complete
                    await new Promise(resolve => setTimeout(resolve, 300))
                    
                    // Verify deletion
                    const { data: verifyDelete } = await supabase
                      .from('installments')
                      .select('id')
                      .eq('sale_id', newSale.id)
                    
                    if (verifyDelete && verifyDelete.length > 0) {
                      // Still exists, try one more time
                      await supabase
                        .from('installments')
                        .delete()
                        .eq('sale_id', newSale.id)
                      await new Promise(resolve => setTimeout(resolve, 500))
                    }
                  }
                  
                  const installmentsToCreate = []
                  const startDate = new Date(newSaleData.installment_start_date || new Date())
                  startDate.setHours(0, 0, 0, 0)
                  const monthlyAmount = newSaleData.monthly_installment_amount || 0
                  
                  for (let i = 0; i < newSaleData.number_of_installments; i++) {
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
                  
                  // Insert installments
                  const { error: installmentsError } = await supabase.from('installments').insert(installmentsToCreate as any)
                  if (installmentsError) {
                    if (installmentsError.code === '23505' || installmentsError.message?.includes('duplicate') || installmentsError.message?.includes('unique')) {
                      console.warn('[CONFIRM ALL] Duplicate installments detected, attempting final cleanup')
                      // Final attempt: delete all and wait longer
                      await supabase
                        .from('installments')
                        .delete()
                        .eq('sale_id', newSale.id)
                      await new Promise(resolve => setTimeout(resolve, 500))
                      
                      const { error: finalRetryError } = await supabase.from('installments').insert(installmentsToCreate as any)
                      if (finalRetryError) {
                        console.error('[CONFIRM ALL] Error creating installments after final retry:', finalRetryError)
                        // Don't throw - continue with next piece
                      }
                    } else {
                      console.error('[CONFIRM ALL] Error creating installments:', installmentsError)
                      // Don't throw - continue with next piece
                    }
                  }
                }
                
                // Update piece status - for bigAdvance, status should be 'Reserved', not 'Sold'
                const pieceStatus = (confirmationType === 'bigAdvance' && currentSale.payment_type === 'Installment') ? 'Reserved' : 'Sold'
                await supabase
                  .from('land_pieces')
                  .update({ status: pieceStatus } as any)
                  .eq('id', pieceToConfirm.id)
                
                // Update original sale - remove this piece
                const remainingPieces = (currentSale as any).land_piece_ids.filter((id: string) => id !== pieceToConfirm.id)
                const remainingCount = remainingPieces.length
                const remainingPrice = currentSale.total_selling_price - pieceValues.pricePerPiece
                const remainingCost = currentSale.total_purchase_cost - costPerPiece
                const remainingProfit = currentSale.profit_margin - profitPerPiece
                const remainingReservation = (currentSale.small_advance_amount || 0) - pieceValues.reservationPerPiece
                
                // If this was the last piece, delete the original sale instead of updating it
                if (remainingCount === 0) {
                  await supabase
                    .from('sales')
                    .delete()
                    .eq('id', currentSale.id)
                } else {
                  await supabase
                    .from('sales')
                    .update({
                      land_piece_ids: remainingPieces,
                      total_selling_price: remainingPrice,
                      total_purchase_cost: remainingCost,
                      profit_margin: remainingProfit,
                      small_advance_amount: remainingReservation,
                      big_advance_amount: currentSale.big_advance_amount ? (currentSale.big_advance_amount * remainingCount / pieceCount) : 0,
                      monthly_installment_amount: currentSale.monthly_installment_amount ? (currentSale.monthly_installment_amount * remainingCount / pieceCount) : null,
                    } as any)
                    .eq('id', currentSale.id)
                }
            } catch (error) {
              console.error(`[CONFIRM ALL] Error confirming piece ${piece.id}:`, error)
              console.error('[CONFIRM ALL] Error details:', error)
              // Continue with next piece instead of stopping
              continue
            }
            confirmedCount++
            console.log(`[CONFIRM ALL] Successfully confirmed piece ${piece.id} (${confirmedCount}/${remainingPiecesData.length})`)
          }
          console.log(`[CONFIRM ALL] Finished processing all remaining pieces. Confirmed: ${confirmedCount}/${remainingPiecesData.length}`)
        }
      }
        
        // Reset the flag and show success
        setConfirmingAllPieces(false)
        setSuccessMessage(`تم تأكيد جميع القطع (${allPieces.length} قطع) بنجاح`)
        setSuccessDialogOpen(true)
        // Auto-dismiss after 3 seconds
        setTimeout(() => setSuccessDialogOpen(false), 3000)
      } else {
        // Show success message
        const isPromiseCompletion = selectedSale.payment_type === 'PromiseOfSale' && confirmationType === 'full' && (selectedSale.promise_initial_payment || 0) > 0
        const message = confirmationType === 'full' 
          ? (selectedSale.payment_type === 'PromiseOfSale' 
              ? (isPromiseCompletion 
                  ? 'تم استكمال الوعد بالبيع بنجاح' 
                  : 'تم تأكيد الوعد بالبيع بنجاح - يمكنك الآن استكمال الدفع المتبقي')
              : 'تم تأكيد البيع بنجاح')
          : 'تم تأكيد التسبقة بنجاح'
        setSuccessMessage(message)
        setSuccessDialogOpen(true)
        setConfirmingAllPieces(false)
        // Auto-dismiss after 3 seconds
        setTimeout(() => setSuccessDialogOpen(false), 3000)
      }
      
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
      const error = err as any
      console.error('Error confirming sale:', error)
      
      // Log full error details for debugging
      if (error.details) {
        console.error('Error details:', error.details)
      }
      if (error.hint) {
        console.error('Error hint:', error.hint)
      }
      if (error.code) {
        console.error('Error code:', error.code)
      }
      
      // Check for the specific "Confirmed" enum error
      let errorMessage = error.message || error.details || 'خطأ غير معروف'
      if (errorMessage.includes('sale_status') && errorMessage.includes('Confirmed')) {
        errorMessage = 'خطأ في قاعدة البيانات: يرجى تشغيل السكريبت fix_sale_status_confirmed_error.sql في Supabase SQL Editor لإصلاح المشكلة'
        console.error('DATABASE TRIGGER ISSUE: A trigger is trying to set sale status to "Confirmed" which is not a valid enum value.')
        console.error('Full error object:', JSON.stringify(error, null, 2))
      }
      
      setError('حدث خطأ أثناء تأكيد البيع: ' + errorMessage)
      showNotification('حدث خطأ أثناء تأكيد البيع: ' + errorMessage, 'error')
    } finally {
      confirmingRef.current = false
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

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="بحث (اسم العميل، رقم الهاتف، رقم البيع، رقم القطعة)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
              {uniqueLocations.length > 0 && (
                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  className="flex h-10 w-full sm:w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="all">جميع المواقع</option>
                  {uniqueLocations.map(location => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
              )}
            </div>
            {(searchTerm || locationFilter !== 'all') && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {filteredSales.length} نتيجة من {sales.length}
                </span>
                {(searchTerm || locationFilter !== 'all') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSearchTerm('')
                      setLocationFilter('all')
                    }}
                    className="text-xs"
                  >
                    مسح الفلاتر
                  </Button>
                )}
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
                          تسبقة: {formatCurrency(sale._totalBigAdvancePaid || 0)} / {formatCurrency(sale.big_advance_amount)}
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
                      {(sale as any).created_by_user && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                          <span className="text-gray-500">باعه:</span>
                          <span className="font-medium">{(sale as any).created_by_user.name}</span>
                        </div>
                      )}
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
                                {(sale.payment_type as any) === 'PromiseOfSale' && (() => {
                                  const pieceCount = sale.land_piece_ids.length
                                  const initialPaymentPerPiece = (sale.promise_initial_payment || 0) / pieceCount
                                  return (
                                    <div>
                                      <span className="text-muted-foreground">المستلم:</span>
                                      <div className="font-medium text-green-600">{formatCurrency(initialPaymentPerPiece)}</div>
                                    </div>
                                  )
                                })()}
                                {(sale.payment_type as any) === 'PromiseOfSale' && (() => {
                                  const pieceCount = sale.land_piece_ids.length
                                  const totalPricePerPiece = totalPayablePerPiece
                                  const initialPaymentPerPiece = (sale.promise_initial_payment || 0) / pieceCount
                                  const remaining = totalPricePerPiece - initialPaymentPerPiece - reservationPerPiece
                                  return (
                                    <div>
                                      <span className="text-muted-foreground">المتبقي:</span>
                                      <div className="font-bold text-orange-600">{formatCurrency(Math.max(0, remaining))}</div>
                                    </div>
                                  )
                                })()}
                              </div>
                              
                              <div className="flex flex-wrap gap-2 pt-2 border-t">
                                {profile?.role === 'Owner' && (
                                  <Button
                                    onClick={() => openEditDialog(sale, piece)}
                                    variant="outline"
                                    size="sm"
                                    className="text-xs h-8 flex-1 border-blue-300 text-blue-700 hover:bg-blue-50"
                                  >
                                    <Edit className="ml-1 h-3 w-3" />
                                    تعديل
                                  </Button>
                                )}
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
                                {(sale.payment_type as any) === 'PromiseOfSale' && (
                                  <Button
                                    onClick={() => {
                                      setSelectedSale(sale)
                                      setSelectedPiece(piece)
                                      setPendingConfirmationType('full')
                                      openConfirmDialog(sale, piece, 'full')
                                    }}
                                    className={`${(sale.promise_initial_payment || 0) > 0 ? 'bg-orange-600 hover:bg-orange-700' : 'bg-purple-600 hover:bg-purple-700'} text-xs h-8 flex-1`}
                                    size="sm"
                                  >
                                    <CheckCircle className="ml-1 h-3 w-3" />
                                    {(sale.promise_initial_payment || 0) > 0 ? 'استكمال الوعد بالبيع' : 'تأكيد الوعد بالبيع'}
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
                                  {profile?.role === 'Owner' && (
                                    <Button
                                      onClick={() => openEditDialog(sale, piece)}
                                      variant="outline"
                                      size="sm"
                                      className="text-xs px-2 h-7 border-blue-300 text-blue-700 hover:bg-blue-50"
                                    >
                                      <Edit className="ml-1 h-3 w-3" />
                                      تعديل
                                    </Button>
                                  )}
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
                                      className={`${(sale.promise_initial_payment || 0) > 0 ? 'bg-orange-600 hover:bg-orange-700' : 'bg-purple-600 hover:bg-purple-700'} text-xs px-2 h-7`}
                                      size="sm"
                                    >
                                      <CheckCircle className="ml-1 h-3 w-3" />
                                      {(sale.promise_initial_payment || 0) > 0 ? 'استكمال الوعد بالبيع' : 'تأكيد الوعد بالبيع'}
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
              {(() => {
                const isConfirmingAll = confirmingAllPieces && selectedSale?.land_pieces && selectedSale.land_pieces.length > 1
                const allPiecesSuffix = isConfirmingAll ? ` - جميع القطع (${selectedSale.land_pieces.length} قطع)` : ''
                const pieceSuffix = !isConfirmingAll && selectedPiece ? ` - #${selectedPiece.piece_number}` : ''
                
                if (confirmationType === 'full') {
                  if (selectedSale?.payment_type === 'PromiseOfSale') {
                    return ((selectedSale.promise_initial_payment || 0) > 0 
                      ? 'استكمال الوعد بالبيع' 
                      : 'تأكيد الوعد بالبيع') + allPiecesSuffix + pieceSuffix
                  }
                  return 'تأكيد بالحاضر' + allPiecesSuffix + pieceSuffix
                } else if (confirmationType === 'bigAdvance') {
                  if (selectedSale?.payment_type === 'Full') {
                    return 'تأكيد بالحاضر' + allPiecesSuffix + pieceSuffix
                  }
                  return 'تأكيد بالتقسيط' + allPiecesSuffix + pieceSuffix
                }
                return 'تأكيد البيع' + allPiecesSuffix + pieceSuffix
              })()}
            </DialogTitle>
          </DialogHeader>
          {selectedSale && selectedPiece && (() => {
                  // Get the offer to use - prioritize selectedOffer state, then sale's selected_offer
                  const offerToUse = selectedOffer || ((selectedSale as any).selected_offer as PaymentOffer | null)
                  
                  // If confirming all pieces, calculate totals for all pieces
                  let pricePerPiece = 0
                  let reservationPerPiece = 0
                  let companyFeePerPiece = 0
                  let totalPayablePerPiece = 0
                  let feePercentage = 0
                  let calculatedOffer = offerToUse
                  
                  if (confirmingAllPieces && selectedSale.land_pieces && selectedSale.land_pieces.length > 1) {
                    // Calculate totals for all pieces
                    let totalPrice = 0
                    let totalReservation = 0
                    let totalCompanyFee = 0
                    let totalPayable = 0
                    let totalFeePercentage = 0
                    
                    selectedSale.land_pieces.forEach((piece: any) => {
                      const pieceValues = calculatePieceValues(selectedSale, piece, offerToUse)
                      totalPrice += pieceValues.pricePerPiece
                      totalReservation += pieceValues.reservationPerPiece
                      totalCompanyFee += pieceValues.companyFeePerPiece
                      totalPayable += pieceValues.totalPayablePerPiece
                      totalFeePercentage = pieceValues.feePercentage // Use the same percentage for all
                    })
                    
                    pricePerPiece = totalPrice
                    reservationPerPiece = totalReservation
                    companyFeePerPiece = totalCompanyFee
                    totalPayablePerPiece = totalPayable
                    feePercentage = totalFeePercentage
                  } else {
                    // Single piece calculation
                    const values = calculatePieceValues(selectedSale, selectedPiece, offerToUse)
                    pricePerPiece = values.pricePerPiece
                    reservationPerPiece = values.reservationPerPiece
                    companyFeePerPiece = values.companyFeePerPiece
                    totalPayablePerPiece = values.totalPayablePerPiece
                    feePercentage = values.feePercentage
                    calculatedOffer = values.offer
                  }
            
            // Check if reservation has been paid
            // By default, all reservations are paid unless small_advance_amount is 0
            // Reservations are always paid when a sale is created, so we assume they're paid
            const totalReservationForSale = (selectedSale.small_advance_amount || 0)
            
            // Reservation is unpaid ONLY if small_advance_amount is explicitly 0
            // Otherwise, assume it's paid (default behavior)
            const reservationPaid = totalReservationForSale > 0
            
            // Only include unpaid reservation in amount due - if paid, unpaidReservation = 0
            const unpaidReservation = reservationPaid ? 0 : reservationPerPiece
            
            // Calculate advance amount from offer if available
            // NOTE: For installments, advance is calculated from PRICE (not total payable with commission)
            // Commission is collected SEPARATELY at confirmation with the advance
            let advanceAmount = 0
            if (calculatedOffer && confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment') {
              // Advance should be calculated from pricePerPiece (WITHOUT commission)
              // For "confirm all", pricePerPiece is already the total for all pieces
              const fullAdvanceAmount = calculatedOffer.advance_is_percentage
                ? (pricePerPiece * calculatedOffer.advance_amount) / 100
                : (confirmingAllPieces && selectedSale.land_pieces && selectedSale.land_pieces.length > 1
                    ? calculatedOffer.advance_amount * selectedSale.land_pieces.length
                    : calculatedOffer.advance_amount)
              // التسبقة = Advance - Reservation (العربون is deducted from التسبقة)
              advanceAmount = Math.max(0, fullAdvanceAmount - reservationPerPiece)
            } else if (confirmationType === 'full') {
              if ((selectedSale.payment_type as any) === 'PromiseOfSale') {
                // For PromiseOfSale, calculate remaining after initial payment
                const pieceCount = confirmingAllPieces && selectedSale.land_pieces 
                  ? selectedSale.land_pieces.length 
                  : selectedSale.land_piece_ids.length
                const initialPaymentPerPiece = (selectedSale.promise_initial_payment || 0) / pieceCount
                const totalInitialPayment = confirmingAllPieces && selectedSale.land_pieces && selectedSale.land_pieces.length > 1
                  ? (selectedSale.promise_initial_payment || 0)
                  : initialPaymentPerPiece
                advanceAmount = totalPayablePerPiece - reservationPerPiece - totalInitialPayment
              } else {
              advanceAmount = totalPayablePerPiece - reservationPerPiece
            }
            }
            
            // Calculate remaining for installments = Price - Advance (after reservation deduction) - Commission
            // التسبقة = Advance - Reservation (العربون is deducted from التسبقة)
            // Commission is collected separately at confirmation with advance
            let remainingAfterAdvance = pricePerPiece - advanceAmount - companyFeePerPiece
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
                // For "confirm all", multiply monthly payment by number of pieces
                monthlyPaymentAmount = confirmingAllPieces && selectedSale.land_pieces && selectedSale.land_pieces.length > 1
                  ? calculatedOffer.monthly_payment * selectedSale.land_pieces.length
                  : calculatedOffer.monthly_payment
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
                    {confirmingAllPieces && selectedSale?.land_pieces && selectedSale.land_pieces.length > 1 && (
                      <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded space-y-2">
                        <div className="text-xs text-blue-800">
                        <span className="font-medium">تأكيد جميع القطع ({selectedSale.land_pieces.length} قطع)</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="checkbox"
                            id="keepPiecesTogether"
                            checked={keepPiecesTogether}
                            onChange={(e) => setKeepPiecesTogether(e.target.checked)}
                            className="h-4 w-4 text-blue-600 rounded"
                          />
                          <label htmlFor="keepPiecesTogether" className="text-xs text-blue-800 cursor-pointer">
                            الاحتفاظ بجميع القطع في صفقة واحدة (مثبت معاً)
                          </label>
                        </div>
                        {!keepPiecesTogether && (
                          <div className="text-xs text-orange-700 bg-orange-50 p-2 rounded mt-1">
                            ⚠️ سيتم إنشاء صفقة منفصلة لكل قطعة
                          </div>
                        )}
                      </div>
                    )}
                    <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                      <span className="text-sm sm:text-base text-gray-700">
                        {confirmingAllPieces && selectedSale?.land_pieces && selectedSale.land_pieces.length > 1 
                          ? 'سعر جميع القطع:' 
                          : 'سعر القطعة:'}
                      </span>
                      <span className="text-sm sm:text-base font-semibold text-gray-900">{formatCurrency(pricePerPiece)}</span>
                      </div>
                    
                    <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="text-sm sm:text-base text-gray-700">عمولة الشركة (%):</span>
                        {/* Show "من العرض" only if sale doesn't have company_fee_percentage set (null) AND there's an offer */}
                        {calculatedOffer && (selectedSale.company_fee_percentage === null || selectedSale.company_fee_percentage === undefined) && (
                          <Badge variant="default" className="text-xs">من العرض</Badge>
                        )}
                        {/* Show "معدلة" if sale has company_fee_percentage set (including 0) */}
                        {(selectedSale.company_fee_percentage !== null && selectedSale.company_fee_percentage !== undefined) && (
                          <Badge variant="secondary" className="text-xs">معدلة</Badge>
                        )}
                      </div>
                      <span className="text-sm sm:text-base font-semibold text-blue-700">
                        {/* Always use feePercentage from calculatePieceValues, which respects sale's company_fee_percentage (including 0) */}
                        {feePercentage.toFixed(2)}%
                      </span>
                      </div>
                    
                    {/* Commission Note */}
                    {(selectedSale as any).company_fee_note && (
                      <div className="mt-2 p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-800 italic">
                        <span className="font-medium">ملاحظة على العمولة: </span>
                        {(selectedSale as any).company_fee_note}
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                      <span className="text-sm sm:text-base text-gray-700">
                        {confirmingAllPieces && selectedSale?.land_pieces && selectedSale.land_pieces.length > 1 
                          ? 'عمولة الشركة (لجميع القطع):' 
                          : 'عمولة الشركة:'}
                      </span>
                      <span className="text-sm sm:text-base font-semibold text-blue-600">{formatCurrency(companyFeePerPiece)}</span>
                      </div>
                    
                    <div className="flex justify-between items-center py-2 border-t-2 border-gray-300 mt-2">
                      <span className="text-base sm:text-lg font-bold text-gray-900">المبلغ الإجمالي المستحق:</span>
                      <span className="text-base sm:text-lg font-bold text-green-600">{formatCurrency(totalPayablePerPiece)}</span>
                      </div>
                    
                    <div className="flex justify-between items-center py-1.5 border-b border-gray-200">
                      <span className="text-sm sm:text-base text-gray-700">
                        {confirmingAllPieces && selectedSale?.land_pieces && selectedSale.land_pieces.length > 1 
                          ? 'المدفوع مسبقاً (العربون - لجميع القطع):' 
                          : 'المدفوع مسبقاً (العربون):'}
                      </span>
                      <span className="text-sm sm:text-base font-semibold text-green-600">
                        {formatCurrency(reservationPaid ? reservationPerPiece : 0)}
                        {!reservationPaid && reservationPerPiece > 0 && (
                          <span className="text-xs text-orange-600 mr-1"> (غير مدفوع: {formatCurrency(reservationPerPiece)})</span>
                        )}
                      </span>
                    </div>
                    
                    {confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment' && calculatedOffer && (() => {
                      // Calculate full advance amount for display
                      // For "confirm all", pricePerPiece is already the total for all pieces
                      const fullAdvanceAmount = calculatedOffer.advance_is_percentage
                        ? (pricePerPiece * calculatedOffer.advance_amount) / 100
                        : (confirmingAllPieces && selectedSale.land_pieces && selectedSale.land_pieces.length > 1
                            ? calculatedOffer.advance_amount * selectedSale.land_pieces.length
                            : calculatedOffer.advance_amount)
                      
                      return (
                        <>
                          {/* Amount to collect at confirmation = التسبقة (after reservation deduction) + Commission */}
                          <div className="bg-purple-50 border border-purple-200 rounded p-3 mt-2">
                            {/* Breakdown of التسبقة calculation */}
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-xs sm:text-sm">
                                <span className="text-purple-700">التسبقة:</span>
                                <span className="font-semibold text-purple-800">
                                  {formatCurrency(fullAdvanceAmount)}
                                </span>
                              </div>
                              {reservationPaid && reservationPerPiece > 0 && (
                                <div className="flex justify-between items-center text-xs sm:text-sm text-purple-600 pl-2">
                                  <span>(-) العربون:</span>
                                  <span className="font-semibold">
                                    {formatCurrency(reservationPerPiece)}
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between items-center text-xs sm:text-sm border-t border-purple-200 pt-1 mt-1">
                                <span className="text-purple-700 font-medium">= التسبقة (بعد خصم العربون):</span>
                                <span className="font-semibold text-purple-800">
                                  {formatCurrency(advanceAmount)}
                                </span>
                              </div>
                              <div className="flex justify-between items-center text-xs sm:text-sm mt-2">
                                <span className="text-purple-700">العمولة:</span>
                                <span className="font-semibold text-purple-800">
                                  {formatCurrency(companyFeePerPiece)}
                                </span>
                              </div>
                            </div>
                            {/* Result: Amount to collect at confirmation */}
                            <div className="flex justify-between items-center py-1.5 mt-2 pt-2 border-t border-purple-300">
                              <span className="text-sm sm:text-base font-bold text-purple-800">المستحق عند التأكيد (التسبقة + العمولة):</span>
                              <span className="text-sm sm:text-base font-bold text-purple-800">
                                {formatCurrency(advanceAmount + companyFeePerPiece)}
                              </span>
                            </div>
                          </div>
                        </>
                      )
                    })()}
                    
                    {confirmationType === 'bigAdvance' && selectedSale.payment_type === 'Installment' && calculatedOffer && (
                      <>
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
                      
                      {/* Installment Period Display */}
                      {installmentStartDate && calculatedMonths > 0 && (
                        <div className="bg-blue-100 rounded p-2 mt-2 border border-blue-200">
                          <p className="text-xs font-medium text-blue-800 mb-1">فترة التقسيط:</p>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-blue-700">من:</span>
                            <span className="font-medium">{new Date(installmentStartDate).toLocaleDateString('ar-TN', { year: 'numeric', month: 'long', day: 'numeric' })}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs mt-1">
                            <span className="text-blue-700">إلى:</span>
                            <span className="font-medium">
                              {(() => {
                                const endDate = new Date(installmentStartDate)
                                endDate.setMonth(endDate.getMonth() + calculatedMonths - 1)
                                return endDate.toLocaleDateString('ar-TN', { year: 'numeric', month: 'long', day: 'numeric' })
                              })()}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                    )}
                    
                    <div className="flex justify-between items-center py-2 border-t-2 border-blue-300 mt-2 bg-blue-50 rounded px-2">
                      <span className="text-base sm:text-lg font-bold text-gray-900">
                        {confirmationType === 'full' 
                          ? ((selectedSale.payment_type as any) === 'PromiseOfSale' 
                              ? ((selectedSale.promise_initial_payment || 0) > 0 
                                  ? 'المبلغ المتبقي (بعد العربون والجزء الأول):' 
                                  : 'المبلغ المتبقي (بعد العربون):')
                              : 'المبلغ المتبقي:')
                          : 'المتبقي للتقسيط (بدون العمولة):'}
                      </span>
                      <span className="text-base sm:text-lg font-bold text-blue-700">
                        {formatCurrency(confirmationType === 'full' 
                          ? ((selectedSale.payment_type as any) === 'PromiseOfSale' && (selectedSale.promise_initial_payment || 0) > 0
                              ? advanceAmount  // Use calculated advanceAmount which already subtracts initial payment
                              : (totalPayablePerPiece - (reservationPaid ? reservationPerPiece : 0))) // Subtract only if reservation is paid
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
                  {(selectedSale as any)?.created_by_user && (
                    <div className="mt-3 pt-3 border-t border-gray-300">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-700">باعه:</span>
                        <span className="text-sm font-semibold text-gray-900">{(selectedSale as any).created_by_user.name}</span>
                      </div>
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
                      سيتم إنشاء جدول الأقساط تلقائياً بعد تأكيد التسبقة
                    </p>
                  </div>
                </div>
              )}

              {/* Promise of Sale - Amount Received Now */}
              {confirmationType === 'full' && selectedSale?.payment_type === 'PromiseOfSale' && (
                <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-xs sm:text-sm font-medium text-purple-800 mb-2 sm:mb-3">معلومات وعد البيع</p>
                  
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="promiseReceivedAmount" className="text-xs sm:text-sm">المبلغ المستلم الآن *</Label>
                    <Input
                      id="promiseReceivedAmount"
                      type="number"
                      value={receivedAmount}
                      onChange={e => setReceivedAmount(e.target.value)}
                      placeholder="المبلغ المستلم الآن"
                      className="text-xs sm:text-sm"
                      min="0"
                      step="0.01"
                    />
                    <p className="text-xs text-muted-foreground">
                      المبلغ الذي سيتم استلامه الآن. الباقي سيتم تأكيده لاحقاً.
                    </p>
                    {receivedAmount && parseFloat(receivedAmount) > 0 && (
                      <div className="mt-2 p-2 bg-white rounded border border-purple-200">
                        <p className="text-xs sm:text-sm font-medium text-purple-800">
                          المبلغ المتبقي بعد هذا الدفع: {formatCurrency(Math.max(0, 
                            (selectedSale.promise_initial_payment || 0) > 0 
                              ? (advanceAmount - parseFloat(receivedAmount))
                              : ((totalPayablePerPiece - reservationPerPiece) - parseFloat(receivedAmount))
                          ))}
                        </p>
                      </div>
                    )}
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
                <Label htmlFor="contractEditor" className="text-xs sm:text-sm">محرر العقد</Label>
                <Select
                  id="contractEditor"
                  value={selectedContractEditorId}
                  onChange={e => setSelectedContractEditorId(e.target.value)}
                  className="text-xs sm:text-sm"
                >
                  <option value="">-- اختر محرر العقد --</option>
                  {contractEditors.map((editor) => (
                    <option key={editor.id} value={editor.id}>
                      {editor.type} - {editor.name} ({editor.place})
                    </option>
                  ))}
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
                    {confirming ? 'جاري التأكيد...' : (selectedSale?.payment_type === 'PromiseOfSale' 
                      ? ((selectedSale.promise_initial_payment || 0) > 0 ? 'استكمال الوعد بالبيع' : 'تأكيد الوعد بالبيع')
                      : 'اتمام البيع')}
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
          if (selectedSale && selectedPiece && pendingConfirmationType && !confirming) {
            setConfirmBeforeConfirmOpen(false)
            proceedWithConfirmation()
          }
        }}
        disabled={confirming}
        title="تأكيد البيع"
        description={
          selectedSale && selectedPiece && (() => {
            const clientName = selectedSale.client?.name || 'غير معروف'
            const pieceInfo = confirmingAllPieces && selectedSale.land_pieces && selectedSale.land_pieces.length > 1
              ? `${selectedSale.land_pieces.length} قطع`
              : `#${selectedPiece.piece_number}`
            
            return `هل أنت متأكد أنك تريد إتمام البيع للعميل ${clientName} (${pieceInfo})؟`
          })() || 'هل أنت متأكد أنك تريد إتمام البيع؟'
        }
        confirmText={confirming ? 'جاري التأكيد...' : 'نعم، متأكد'}
        cancelText="إلغاء"
      />

      {/* Success Dialog - Matches ConfirmDialog design */}
      <Dialog open={successDialogOpen} onOpenChange={setSuccessDialogOpen}>
        <DialogContent 
          preventClose={false}
          className="confirm-dialog-high-z bg-white border-2 border-[#10b981] rounded-[16px] p-[22px_26px] max-w-[440px] shadow-[0_24px_48px_rgba(0,0,0,0.45)]"
        >
          <DialogHeader className="text-center">
            <div className="flex justify-center mb-3">
              <div className="h-16 w-16 rounded-full bg-[#10b981]/10 flex items-center justify-center">
                <CheckCircle className="h-8 w-8 text-[#10b981]" />
              </div>
            </div>
            <DialogTitle className="text-[18px] font-semibold text-[#020617] mb-2">
              تم بنجاح
            </DialogTitle>
            <DialogDescription className="text-[15px] text-[#334155] mb-4">
              {successMessage || 'تم تنفيذ العملية بنجاح'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-center gap-[10px] mt-2">
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setSuccessDialogOpen(false)
              }}
              onTouchEnd={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setSuccessDialogOpen(false)
              }}
              className="px-[14px] py-[8px] rounded-[10px] text-[14px] font-medium border-none bg-[#10b981] text-white hover:bg-[#059669]"
            >
              موافق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Edit Sale Dialog (Owner only) */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تعديل بيانات البيع</DialogTitle>
          </DialogHeader>
          {editingSale && editingPiece && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm font-medium">العميل: {editingSale.client?.name || 'غير معروف'}</p>
                <p className="text-xs text-muted-foreground">
                  القطعة: {(editingPiece as any).land_batch?.name || 'دفعة'} - #{editingPiece.piece_number} ({editingPiece.surface_area} م²)
                </p>
                <p className="text-xs text-muted-foreground">نوع الدفع: {
                  editingSale.payment_type === 'Full' ? 'بالحاضر' :
                  editingSale.payment_type === 'Installment' ? 'بالتقسيط' :
                  'وعد البيع'
                }</p>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-price">سعر القطعة (DT) *</Label>
                  <Input
                    id="edit-price"
                    type="number"
                    value={editForm.total_selling_price}
                    onChange={(e) => {
                      const newPrice = e.target.value
                      
                      // If number of installments is set, recalculate monthly amount
                      if (editingSale.payment_type === 'Installment' && editForm.number_of_installments && parseInt(editForm.number_of_installments) > 0) {
                        const pieceCount = editingSale.land_piece_ids.length
                        const pricePerPiece = parseFloat(newPrice) || 0
                        const reservationPerPiece = parseFloat(editForm.small_advance_amount) || 0
                        const advancePerPiece = editingSale.big_advance_amount ? (editingSale.big_advance_amount / pieceCount) : 0
                        
                        // Calculate commission per piece (same logic as save function)
                        let commissionPerPiece = 0
                        if (editForm.commission_input_method === 'percentage') {
                          const feePercentage = parseFloat(editForm.company_fee_percentage) || 0
                          commissionPerPiece = (pricePerPiece * feePercentage) / 100
                        } else {
                          commissionPerPiece = parseFloat(editForm.company_fee_amount) || 0
                        }
                        
                        const remainingForInstallments = pricePerPiece - reservationPerPiece - advancePerPiece - commissionPerPiece
                        
                        if (remainingForInstallments > 0) {
                          const months = parseInt(editForm.number_of_installments)
                          const monthlyAmount = remainingForInstallments / months
                          setEditForm(prev => ({ ...prev, total_selling_price: newPrice, monthly_installment_amount: monthlyAmount.toFixed(2) }))
                        } else {
                          setEditForm(prev => ({ ...prev, total_selling_price: newPrice }))
                        }
                      } else {
                        setEditForm(prev => ({ ...prev, total_selling_price: newPrice }))
                      }
                    }}
                    placeholder="السعر"
                    min="0"
                    step="0.01"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    السعر الحالي: {formatCurrency(editingSale.total_selling_price / editingSale.land_piece_ids.length)}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="edit-company-fee">عمولة الشركة</Label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const price = parseFloat(editForm.total_selling_price) || 0
                          const currentAmount = parseFloat(editForm.company_fee_amount) || 0
                          const currentPercentage = parseFloat(editForm.company_fee_percentage) || 0
                          
                          if (editForm.commission_input_method === 'percentage') {
                            // Switching to amount: calculate amount from percentage
                            const calculatedAmount = price > 0 ? (price * currentPercentage) / 100 : 0
                            setEditForm({ ...editForm, commission_input_method: 'amount', company_fee_amount: calculatedAmount > 0 ? calculatedAmount.toFixed(2) : '' })
                          } else {
                            // Switching to percentage: calculate percentage from amount
                            const calculatedPercentage = price > 0 ? (currentAmount / price) * 100 : 0
                            setEditForm({ ...editForm, commission_input_method: 'percentage', company_fee_percentage: calculatedPercentage > 0 ? calculatedPercentage.toFixed(2) : '' })
                          }
                        }}
                        className={`text-xs px-2 py-1 rounded border ${
                          editForm.commission_input_method === 'percentage'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        نسبة (%)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const price = parseFloat(editForm.total_selling_price) || 0
                          const currentAmount = parseFloat(editForm.company_fee_amount) || 0
                          const currentPercentage = parseFloat(editForm.company_fee_percentage) || 0
                          
                          if (editForm.commission_input_method === 'amount') {
                            // Switching to percentage: calculate percentage from amount
                            const calculatedPercentage = price > 0 ? (currentAmount / price) * 100 : 0
                            setEditForm({ ...editForm, commission_input_method: 'percentage', company_fee_percentage: calculatedPercentage > 0 ? calculatedPercentage.toFixed(2) : '' })
                          } else {
                            // Switching to amount: calculate amount from percentage
                            const calculatedAmount = price > 0 ? (price * currentPercentage) / 100 : 0
                            setEditForm({ ...editForm, commission_input_method: 'amount', company_fee_amount: calculatedAmount > 0 ? calculatedAmount.toFixed(2) : '' })
                          }
                        }}
                        className={`text-xs px-2 py-1 rounded border ${
                          editForm.commission_input_method === 'amount'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200'
                        }`}
                      >
                        مبلغ (DT)
                      </button>
                    </div>
                  </div>
                  
                  {editForm.commission_input_method === 'percentage' ? (
                    <>
                      <Input
                        id="edit-company-fee"
                        type="number"
                        value={editForm.company_fee_percentage}
                        onChange={(e) => {
                          const percentage = parseFloat(e.target.value) || 0
                          const price = parseFloat(editForm.total_selling_price) || 0
                          const calculatedAmount = price > 0 ? (price * percentage) / 100 : 0
                          
                          const updatedForm = {
                            ...editForm,
                            company_fee_percentage: e.target.value,
                            company_fee_amount: calculatedAmount > 0 ? calculatedAmount.toFixed(2) : ''
                          }
                          
                          // Recalculate monthly amount if installments are set
                          if (editingSale.payment_type === 'Installment' && editForm.number_of_installments && parseInt(editForm.number_of_installments) > 0) {
                            const pieceCount = editingSale.land_piece_ids.length
                            const pricePerPiece = price
                            const reservationPerPiece = parseFloat(editForm.small_advance_amount) || 0
                            const advancePerPiece = editingSale.big_advance_amount ? (editingSale.big_advance_amount / pieceCount) : 0
                            const commissionPerPiece = calculatedAmount
                            const remainingForInstallments = pricePerPiece - reservationPerPiece - advancePerPiece - commissionPerPiece
                            
                            if (remainingForInstallments > 0) {
                              const months = parseInt(editForm.number_of_installments)
                              const monthlyAmount = remainingForInstallments / months
                              updatedForm.monthly_installment_amount = monthlyAmount.toFixed(2)
                            }
                          }
                          
                          setEditForm(updatedForm)
                        }}
                        placeholder="نسبة العمولة"
                        min="0"
                        max="100"
                        step="0.01"
                      />
                      <p className="text-xs text-muted-foreground">
                        النسبة الحالية: {editingSale.company_fee_percentage || 0}%
                        {parseFloat(editForm.company_fee_percentage) > 0 && parseFloat(editForm.total_selling_price) > 0 && (
                          <span className="mr-2"> = {formatCurrency((parseFloat(editForm.total_selling_price) * parseFloat(editForm.company_fee_percentage)) / 100)}</span>
                        )}
                      </p>
                    </>
                  ) : (
                    <>
                      <Input
                        id="edit-company-fee-amount"
                        type="number"
                        value={editForm.company_fee_amount}
                        onChange={(e) => {
                          const amount = parseFloat(e.target.value) || 0
                          const price = parseFloat(editForm.total_selling_price) || 0
                          const calculatedPercentage = price > 0 ? (amount / price) * 100 : 0
                          
                          const updatedForm = {
                            ...editForm,
                            company_fee_amount: e.target.value,
                            company_fee_percentage: calculatedPercentage > 0 ? calculatedPercentage.toFixed(2) : ''
                          }
                          
                          // Recalculate monthly amount if installments are set
                          if (editingSale.payment_type === 'Installment' && editForm.number_of_installments && parseInt(editForm.number_of_installments) > 0) {
                            const pieceCount = editingSale.land_piece_ids.length
                            const pricePerPiece = price
                            const reservationPerPiece = parseFloat(editForm.small_advance_amount) || 0
                            const advancePerPiece = editingSale.big_advance_amount ? (editingSale.big_advance_amount / pieceCount) : 0
                            const commissionPerPiece = amount
                            const remainingForInstallments = pricePerPiece - reservationPerPiece - advancePerPiece - commissionPerPiece
                            
                            if (remainingForInstallments > 0) {
                              const months = parseInt(editForm.number_of_installments)
                              const monthlyAmount = remainingForInstallments / months
                              updatedForm.monthly_installment_amount = monthlyAmount.toFixed(2)
                            }
                          }
                          
                          setEditForm(updatedForm)
                        }}
                        placeholder="مبلغ العمولة"
                        min="0"
                        step="0.01"
                      />
                      <p className="text-xs text-muted-foreground">
                        المبلغ الحالي: {formatCurrency((editingSale.company_fee_amount || 0) / editingSale.land_piece_ids.length)}
                        {parseFloat(editForm.company_fee_amount) > 0 && parseFloat(editForm.total_selling_price) > 0 && (
                          <span className="mr-2"> = {((parseFloat(editForm.company_fee_amount) / parseFloat(editForm.total_selling_price)) * 100).toFixed(2)}%</span>
                        )}
                      </p>
                    </>
                  )}
                  
                  {/* Commission Note Field */}
                  <div className="mt-2">
                    <Label htmlFor="edit-company-fee-note" className="text-xs text-muted-foreground">ملاحظة على العمولة (اختياري)</Label>
                    <Textarea
                      id="edit-company-fee-note"
                      value={editForm.company_fee_note}
                      onChange={(e) => setEditForm({ ...editForm, company_fee_note: e.target.value })}
                      placeholder="مثال: خطأ في الحساب - تم تعديل المبلغ يدوياً"
                      rows={2}
                      className="text-xs"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      استخدم هذا الحقل لتوضيح سبب اختلاف العمولة عن النسبة المحددة
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-reservation">العربون (DT)</Label>
                  <Input
                    id="edit-reservation"
                    type="number"
                    value={editForm.small_advance_amount}
                    onChange={(e) => {
                      const reservation = e.target.value
                      
                      // If number of installments is set, recalculate monthly amount
                      if (editingSale.payment_type === 'Installment' && editForm.number_of_installments && parseInt(editForm.number_of_installments) > 0) {
                        const pieceCount = editingSale.land_piece_ids.length
                        const pricePerPiece = parseFloat(editForm.total_selling_price) || 0
                        const reservationPerPiece = parseFloat(reservation) || 0
                        const advancePerPiece = editingSale.big_advance_amount ? (editingSale.big_advance_amount / pieceCount) : 0
                        
                        // Calculate commission per piece (same logic as save function)
                        let commissionPerPiece = 0
                        if (editForm.commission_input_method === 'percentage') {
                          const feePercentage = parseFloat(editForm.company_fee_percentage) || 0
                          commissionPerPiece = (pricePerPiece * feePercentage) / 100
                        } else {
                          commissionPerPiece = parseFloat(editForm.company_fee_amount) || 0
                        }
                        
                        const remainingForInstallments = pricePerPiece - reservationPerPiece - advancePerPiece - commissionPerPiece
                        
                        if (remainingForInstallments > 0) {
                          const months = parseInt(editForm.number_of_installments)
                          const monthlyAmount = remainingForInstallments / months
                          setEditForm(prev => ({ ...prev, small_advance_amount: reservation, monthly_installment_amount: monthlyAmount.toFixed(2) }))
                        } else {
                          setEditForm(prev => ({ ...prev, small_advance_amount: reservation }))
                        }
                      } else {
                        setEditForm(prev => ({ ...prev, small_advance_amount: reservation }))
                      }
                    }}
                    placeholder="مبلغ العربون"
                    min="0"
                    step="0.01"
                  />
                  <p className="text-xs text-muted-foreground">
                    العربون الحالي: {formatCurrency((editingSale.small_advance_amount || 0) / editingSale.land_piece_ids.length)}
                  </p>
                </div>

                {editingSale.payment_type === 'Installment' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="edit-offer">عرض الدفع</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCreateOfferDialogOpen(true)}
                        className="text-xs h-7"
                      >
                        <Edit className="ml-1 h-3 w-3" />
                        إنشاء عرض جديد
                      </Button>
                    </div>
                    {availableOffersForEdit.length > 0 ? (
                      <>
                        <Select
                          id="edit-offer"
                          value={editForm.selected_offer_id}
                          onChange={(e) => setEditForm({ ...editForm, selected_offer_id: e.target.value })}
                        >
                          <option value="">-- لا يوجد عرض محدد --</option>
                          {availableOffersForEdit.map((offer) => (
                            <option key={offer.id} value={offer.id}>
                              {offer.offer_name || `عرض ${offer.id.slice(0, 8)}`} - 
                              عمولة: {offer.company_fee_percentage}% - 
                              تسبقة: {offer.advance_is_percentage ? `${offer.advance_amount}%` : formatCurrency(offer.advance_amount)} - 
                              شهري: {formatCurrency(offer.monthly_payment)}
                            </option>
                          ))}
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          العرض المحدد حالياً: {editingSale.selected_offer_id ? 'نعم' : 'لا'}
                        </p>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground p-2 bg-gray-50 rounded">
                        لا توجد عروض متاحة. اضغط على "إنشاء عرض جديد" لإنشاء عرض لهذه القطعة.
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="edit-notes">ملاحظات</Label>
                  <Textarea
                    id="edit-notes"
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="ملاحظات إضافية..."
                    rows={3}
                  />
                </div>

                {/* Sale Date */}
                <div className="space-y-2">
                  <Label htmlFor="edit-sale-date">تاريخ البيع *</Label>
                  <Input
                    id="edit-sale-date"
                    type="date"
                    value={editForm.sale_date}
                    onChange={(e) => setEditForm({ ...editForm, sale_date: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    التاريخ الحالي: {editingSale.sale_date ? formatDate(editingSale.sale_date) : 'غير محدد'}
                  </p>
                </div>

                {/* Deadline Date */}
                <div className="space-y-2">
                  <Label htmlFor="edit-deadline-date">آخر أجل لإتمام الإجراءات</Label>
                  <Input
                    id="edit-deadline-date"
                    type="date"
                    value={editForm.deadline_date}
                    onChange={(e) => setEditForm({ ...editForm, deadline_date: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    التاريخ الحالي: {editingSale.deadline_date ? formatDate(editingSale.deadline_date) : 'غير محدد'}
                  </p>
                </div>

                {/* Contract Editor */}
                <div className="space-y-2">
                  <Label htmlFor="edit-contract-editor">محرر العقد</Label>
                  <Select
                    id="edit-contract-editor"
                    value={editForm.contract_editor_id}
                    onChange={(e) => setEditForm({ ...editForm, contract_editor_id: e.target.value })}
                  >
                    <option value="">-- اختر محرر العقد --</option>
                    {contractEditors.map((editor) => (
                      <option key={editor.id} value={editor.id}>
                        {editor.type} - {editor.name} ({editor.place})
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    المحرر الحالي: {editingSale.contract_editor_id ? (contractEditors.find(e => e.id === editingSale.contract_editor_id) ? `${contractEditors.find(e => e.id === editingSale.contract_editor_id)?.type} - ${contractEditors.find(e => e.id === editingSale.contract_editor_id)?.name} (${contractEditors.find(e => e.id === editingSale.contract_editor_id)?.place})` : 'غير محدد') : 'غير محدد'}
                  </p>
                </div>

                {/* Installment Fields - Only for Installment sales */}
                {editingSale.payment_type === 'Installment' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="edit-installment-start-date">تاريخ بداية الأقساط</Label>
                      <Input
                        id="edit-installment-start-date"
                        type="date"
                        value={editForm.installment_start_date}
                        onChange={(e) => setEditForm({ ...editForm, installment_start_date: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        التاريخ الحالي: {editingSale.installment_start_date ? formatDate(editingSale.installment_start_date) : 'غير محدد'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-number-of-installments">عدد الأقساط</Label>
                      <Input
                        id="edit-number-of-installments"
                        type="number"
                        value={editForm.number_of_installments}
                        onChange={(e) => {
                          const months = e.target.value
                          
                          // Calculate monthly amount if months is provided and valid
                          if (months && parseInt(months) > 0) {
                            const pieceCount = editingSale.land_piece_ids.length
                            const pricePerPiece = parseFloat(editForm.total_selling_price) || 0
                            const reservationPerPiece = parseFloat(editForm.small_advance_amount) || 0
                            const advancePerPiece = editingSale.big_advance_amount ? (editingSale.big_advance_amount / pieceCount) : 0
                            
                            // Calculate commission per piece (same logic as save function)
                            let commissionPerPiece = 0
                            if (editForm.commission_input_method === 'percentage') {
                              const feePercentage = parseFloat(editForm.company_fee_percentage) || 0
                              commissionPerPiece = (pricePerPiece * feePercentage) / 100
                            } else {
                              commissionPerPiece = parseFloat(editForm.company_fee_amount) || 0
                            }
                            
                            const remainingForInstallments = pricePerPiece - reservationPerPiece - advancePerPiece - commissionPerPiece
                            
                            if (remainingForInstallments > 0) {
                              const monthlyAmount = remainingForInstallments / parseInt(months)
                              setEditForm(prev => ({ ...prev, number_of_installments: months, monthly_installment_amount: monthlyAmount.toFixed(2) }))
                            } else {
                              setEditForm(prev => ({ ...prev, number_of_installments: months }))
                            }
                          } else {
                            setEditForm(prev => ({ ...prev, number_of_installments: months }))
                          }
                        }}
                        placeholder="عدد الأشهر"
                        min="1"
                      />
                      <p className="text-xs text-muted-foreground">
                        العدد الحالي: {editingSale.number_of_installments || 'غير محدد'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-monthly-installment-amount">المبلغ الشهري (DT)</Label>
                      <Input
                        id="edit-monthly-installment-amount"
                        type="number"
                        value={editForm.monthly_installment_amount}
                        onChange={(e) => {
                          const monthlyAmount = e.target.value
                          
                          // Calculate number of installments if monthly amount is provided and valid
                          if (monthlyAmount && parseFloat(monthlyAmount) > 0) {
                            const pieceCount = editingSale.land_piece_ids.length
                            const pricePerPiece = parseFloat(editForm.total_selling_price) || 0
                            const reservationPerPiece = parseFloat(editForm.small_advance_amount) || 0
                            const advancePerPiece = editingSale.big_advance_amount ? (editingSale.big_advance_amount / pieceCount) : 0
                            
                            // Calculate commission per piece (same logic as save function)
                            let commissionPerPiece = 0
                            if (editForm.commission_input_method === 'percentage') {
                              const feePercentage = parseFloat(editForm.company_fee_percentage) || 0
                              commissionPerPiece = (pricePerPiece * feePercentage) / 100
                            } else {
                              commissionPerPiece = parseFloat(editForm.company_fee_amount) || 0
                            }
                            
                            const remainingForInstallments = pricePerPiece - reservationPerPiece - advancePerPiece - commissionPerPiece
                            
                            if (remainingForInstallments > 0) {
                              const calculatedMonths = Math.ceil(remainingForInstallments / parseFloat(monthlyAmount))
                              setEditForm(prev => ({ ...prev, monthly_installment_amount: monthlyAmount, number_of_installments: calculatedMonths.toString() }))
                            } else {
                              setEditForm(prev => ({ ...prev, monthly_installment_amount: monthlyAmount }))
                            }
                          } else {
                            setEditForm(prev => ({ ...prev, monthly_installment_amount: monthlyAmount }))
                          }
                        }}
                        placeholder="المبلغ الشهري"
                        min="0"
                        step="0.01"
                      />
                      <p className="text-xs text-muted-foreground">
                        المبلغ الحالي: {editingSale.monthly_installment_amount ? formatCurrency(editingSale.monthly_installment_amount / editingSale.land_piece_ids.length) : 'غير محدد'}
                      </p>
                    </div>
                  </>
                )}

                {/* Promise of Sale Fields - Only for PromiseOfSale sales */}
                {editingSale.payment_type === 'PromiseOfSale' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="edit-promise-initial-payment">المبلغ المستلم (DT)</Label>
                      <Input
                        id="edit-promise-initial-payment"
                        type="number"
                        value={editForm.promise_initial_payment}
                        onChange={(e) => setEditForm({ ...editForm, promise_initial_payment: e.target.value })}
                        placeholder="المبلغ المستلم"
                        min="0"
                        step="0.01"
                      />
                      <p className="text-xs text-muted-foreground">
                        المبلغ الحالي: {editingSale.promise_initial_payment ? formatCurrency(editingSale.promise_initial_payment / editingSale.land_piece_ids.length) : 'غير محدد'}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="edit-promise-completion-date">تاريخ إتمام الوعد</Label>
                      <Input
                        id="edit-promise-completion-date"
                        type="date"
                        value={editForm.promise_completion_date}
                        onChange={(e) => setEditForm({ ...editForm, promise_completion_date: e.target.value })}
                      />
                      <p className="text-xs text-muted-foreground">
                        التاريخ الحالي: {editingSale.promise_completion_date ? formatDate(editingSale.promise_completion_date) : 'غير محدد'}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={savingEdit}>
                  إلغاء
                </Button>
                <Button onClick={saveEditSale} disabled={savingEdit} className="bg-blue-600 hover:bg-blue-700">
                  {savingEdit ? (
                    <>
                      <Clock className="ml-2 h-4 w-4 animate-spin" />
                      جاري الحفظ...
                    </>
                  ) : (
                    <>
                      <Save className="ml-2 h-4 w-4" />
                      حفظ التعديلات
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create New Offer Dialog */}
      <Dialog open={createOfferDialogOpen} onOpenChange={setCreateOfferDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إنشاء عرض دفع جديد</DialogTitle>
          </DialogHeader>
          {editingPiece && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm font-medium">
                  القطعة: {(editingPiece as any).land_batch?.name || 'دفعة'} - #{editingPiece.piece_number} ({editingPiece.surface_area} م²)
                </p>
                <p className="text-xs text-muted-foreground">
                  سعر القطعة: {formatCurrency(parseFloat(editForm.total_selling_price) || 0)}
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="offer-name">اسم العرض</Label>
                  <Input
                    id="offer-name"
                    type="text"
                    value={newOfferForm.offer_name}
                    onChange={(e) => setNewOfferForm({ ...newOfferForm, offer_name: e.target.value })}
                    placeholder="مثال: عرض 1000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="offer-company-fee">عمولة الشركة (%) *</Label>
                  <Input
                    id="offer-company-fee"
                    type="number"
                    value={newOfferForm.company_fee_percentage}
                    onChange={(e) => setNewOfferForm({ ...newOfferForm, company_fee_percentage: e.target.value })}
                    placeholder="2.00"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="offer-advance">التسبقة *</Label>
                  <Input
                    id="offer-advance"
                    type="number"
                    value={newOfferForm.advance_amount}
                    onChange={(e) => setNewOfferForm({ ...newOfferForm, advance_amount: e.target.value })}
                    placeholder={newOfferForm.advance_is_percentage ? "10.00" : "1000.00"}
                    min="0"
                    step="0.01"
                    required
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="checkbox"
                      id="advance-is-percentage"
                      checked={newOfferForm.advance_is_percentage}
                      onChange={(e) => setNewOfferForm({ ...newOfferForm, advance_is_percentage: e.target.checked })}
                      className="h-4 w-4"
                    />
                    <Label htmlFor="advance-is-percentage" className="text-xs font-normal cursor-pointer">
                      التسبقة كنسبة مئوية من السعر
                    </Label>
                  </div>
                  {newOfferForm.advance_amount && (
                    <p className="text-xs text-muted-foreground">
                      {newOfferForm.advance_is_percentage
                        ? `التسبقة: ${newOfferForm.advance_amount}% من السعر = ${formatCurrency((parseFloat(editForm.total_selling_price) || 0) * parseFloat(newOfferForm.advance_amount) / 100)}`
                        : `التسبقة: ${formatCurrency(parseFloat(newOfferForm.advance_amount) || 0)}`}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="offer-monthly">المبلغ الشهري (DT) *</Label>
                  <Input
                    id="offer-monthly"
                    type="number"
                    value={newOfferForm.monthly_payment}
                    onChange={(e) => setNewOfferForm({ ...newOfferForm, monthly_payment: e.target.value })}
                    placeholder="70.00"
                    min="0"
                    step="0.01"
                    required
                  />
                  {newOfferForm.monthly_payment && newOfferForm.advance_amount && (
                    <p className="text-xs text-muted-foreground">
                      {(() => {
                        const price = parseFloat(editForm.total_selling_price) || 0
                        const advance = newOfferForm.advance_is_percentage
                          ? (price * parseFloat(newOfferForm.advance_amount)) / 100
                          : parseFloat(newOfferForm.advance_amount) || 0
                        const reservation = editingSale ? (editingSale.small_advance_amount || 0) / editingSale.land_piece_ids.length : 0
                        const remaining = price - reservation - advance
                        const monthly = parseFloat(newOfferForm.monthly_payment) || 0
                        const months = monthly > 0 ? Math.ceil(remaining / monthly) : 0
                        return `عدد الأشهر: ${months} شهر (المتبقي: ${formatCurrency(remaining)})`
                      })()}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="offer-notes">ملاحظات</Label>
                  <Textarea
                    id="offer-notes"
                    value={newOfferForm.notes}
                    onChange={(e) => setNewOfferForm({ ...newOfferForm, notes: e.target.value })}
                    placeholder="ملاحظات إضافية..."
                    rows={3}
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="offer-is-default"
                    checked={newOfferForm.is_default}
                    onChange={(e) => setNewOfferForm({ ...newOfferForm, is_default: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <Label htmlFor="offer-is-default" className="text-sm font-normal cursor-pointer">
                    تعيين كعرض افتراضي لهذه القطعة
                  </Label>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setCreateOfferDialogOpen(false)} disabled={creatingOffer}>
                  إلغاء
                </Button>
                <Button
                  onClick={async () => {
                    if (!editingPiece || creatingOffer) return

                    // Validate form
                    if (!newOfferForm.company_fee_percentage || parseFloat(newOfferForm.company_fee_percentage) < 0) {
                      showNotification('يرجى إدخال نسبة عمولة صحيحة', 'error')
                      return
                    }
                    if (!newOfferForm.advance_amount || parseFloat(newOfferForm.advance_amount) <= 0) {
                      showNotification('يرجى إدخال مبلغ التسبقة', 'error')
                      return
                    }
                    if (!newOfferForm.monthly_payment || parseFloat(newOfferForm.monthly_payment) <= 0) {
                      showNotification('يرجى إدخال المبلغ الشهري', 'error')
                      return
                    }

                    setCreatingOffer(true)
                    try {
                      // Calculate price per m² for installment
                      const pricePerPiece = parseFloat(editForm.total_selling_price) || 0
                      const pricePerM2 = editingPiece.surface_area > 0 ? pricePerPiece / editingPiece.surface_area : null

                      const offerData: any = {
                        land_piece_id: editingPiece.id,
                        land_batch_id: null, // Piece-specific offer
                        price_per_m2_installment: pricePerM2 ?? null,
                        company_fee_percentage: parseFloat(newOfferForm.company_fee_percentage) || 0,
                        advance_amount: parseFloat(newOfferForm.advance_amount) || 0,
                        advance_is_percentage: newOfferForm.advance_is_percentage ?? false,
                        monthly_payment: parseFloat(newOfferForm.monthly_payment) || 0,
                        number_of_months: null, // Can be calculated later if needed
                        offer_name: newOfferForm.offer_name || null,
                        notes: newOfferForm.notes || null,
                        is_default: newOfferForm.is_default ?? false,
                        created_by: user?.id || null,
                      }

                      const { data: newOffer, error: createError } = await supabase
                        .from('payment_offers')
                        .insert([offerData])
                        .select()
                        .single()

                      if (createError) throw createError

                      showNotification('تم إنشاء العرض بنجاح', 'success')

                      // Reload offers
                      const offers: PaymentOffer[] = []
                      
                      // Get piece-specific offers
                      const { data: pieceOffers } = await supabase
                        .from('payment_offers')
                        .select('*')
                        .eq('land_piece_id', editingPiece.id)
                        .order('is_default', { ascending: false })
                        .order('created_at', { ascending: true })
                      
                      if (pieceOffers) {
                        offers.push(...(pieceOffers as PaymentOffer[]))
                      }
                      
                      // Get batch offers
                      if (editingPiece.land_batch_id) {
                        const { data: batchOffers } = await supabase
                          .from('payment_offers')
                          .select('*')
                          .eq('land_batch_id', editingPiece.land_batch_id)
                          .is('land_piece_id', null)
                          .order('is_default', { ascending: false })
                          .order('created_at', { ascending: true })
                        
                        if (batchOffers) {
                          offers.push(...(batchOffers as PaymentOffer[]))
                        }
                      }
                      
                      setAvailableOffersForEdit(offers)

                      // Auto-select the new offer
                      if (newOffer) {
                        setEditForm({ ...editForm, selected_offer_id: newOffer.id })
                      }

                      // Reset form
                      setNewOfferForm({
                        offer_name: '',
                        company_fee_percentage: '2',
                        advance_amount: '',
                        advance_is_percentage: false,
                        monthly_payment: '',
                        notes: '',
                        is_default: false,
                      })

                      setCreateOfferDialogOpen(false)
                    } catch (error: any) {
                      console.error('Error creating offer:', error)
                      showNotification(error?.message || 'حدث خطأ أثناء إنشاء العرض', 'error')
                    } finally {
                      setCreatingOffer(false)
                    }
                  }}
                  disabled={creatingOffer}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {creatingOffer ? (
                    <>
                      <Clock className="ml-2 h-4 w-4 animate-spin" />
                      جاري الإنشاء...
                    </>
                  ) : (
                    <>
                      <Save className="ml-2 h-4 w-4" />
                      إنشاء العرض
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

