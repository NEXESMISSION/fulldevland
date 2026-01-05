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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { retryWithBackoff, isRetryableError } from '@/lib/retry'
import { CheckCircle, XCircle, Clock, DollarSign, AlertTriangle } from 'lucide-react'
import { showNotification } from '@/components/ui/notification'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Sale, Client, LandPiece } from '@/types/database'

interface SaleWithDetails extends Sale {
  client: Client | null
  land_pieces: LandPiece[]
  _totalBigAdvancePaid?: number
  _totalPaid?: number
}

export function SaleConfirmation() {
  const { hasPermission, user } = useAuth()
  const [sales, setSales] = useState<SaleWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSale, setSelectedSale] = useState<SaleWithDetails | null>(null)
  const [selectedPiece, setSelectedPiece] = useState<LandPiece | null>(null)
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  
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
  
  // Client details dialog
  const [clientDetailsOpen, setClientDetailsOpen] = useState(false)
  const [selectedClientForDetails, setSelectedClientForDetails] = useState<Client | null>(null)
  const [clientSales, setClientSales] = useState<Sale[]>([])

  // Check permissions - anyone with edit_sales or sale_confirm permission
  const canAccess = hasPermission('edit_sales') || hasPermission('sale_confirm')
  
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
        // First get sales
        const res = await supabase
          .from('sales')
          .select(`
            *,
            client:clients(*)
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
              .select('*, land_batch:land_batches(name)')
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

  const openConfirmDialog = (sale: SaleWithDetails, piece: LandPiece, type: 'full' | 'bigAdvance') => {
    setSelectedSale(sale)
    setSelectedPiece(piece)
    setConfirmationType(type)
    setCompanyFeePercentage(sale.company_fee_percentage?.toString() || '2')
    setNumberOfInstallments(sale.number_of_installments?.toString() || '12')
    
    // Auto-fill received amount for full payment with remaining amount
    if (type === 'full') {
      const pieceCount = sale.land_piece_ids.length
      const pricePerPiece = sale.total_selling_price / pieceCount
      const reservationPerPiece = (sale.small_advance_amount || 0) / pieceCount
      const feePercentage = parseFloat(sale.company_fee_percentage?.toString() || '2') || 2
      const companyFeePerPiece = (pricePerPiece * feePercentage) / 100
      const totalPayablePerPiece = pricePerPiece + companyFeePerPiece
      const remainingAmount = totalPayablePerPiece - reservationPerPiece
      setReceivedAmount(remainingAmount.toFixed(2))
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
  const calculatePieceValues = (sale: SaleWithDetails, piece: LandPiece) => {
    const pieceCount = sale.land_piece_ids.length
    const pricePerPiece = sale.total_selling_price / pieceCount
    const reservationPerPiece = (sale.small_advance_amount || 0) / pieceCount
    const feePercentage = parseFloat(companyFeePercentage) || 0
    const companyFeePerPiece = (pricePerPiece * feePercentage) / 100
    const totalPayablePerPiece = pricePerPiece + companyFeePerPiece
    
    return {
      pricePerPiece,
      reservationPerPiece,
      companyFeePerPiece,
      totalPayablePerPiece,
      feePercentage
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
    
    setConfirming(true)
    setError(null)
    
    try {
      const pieceCount = selectedSale.land_piece_ids.length
      const { pricePerPiece, reservationPerPiece, companyFeePerPiece, totalPayablePerPiece } = calculatePieceValues(selectedSale, selectedPiece)
      const received = parseFloat(receivedAmount) || 0
      
      // For full payment, check against remaining amount (not total)
      const remainingAmount = totalPayablePerPiece - reservationPerPiece
      if (confirmationType === 'full' && received < remainingAmount) {
        setError(`المبلغ المستلم (${formatCurrency(received)}) أقل من المبلغ المتبقي (${formatCurrency(remainingAmount)})`)
        setConfirming(false)
        return
      }

      if (pieceCount === 1) {
        // Single piece - update the sale directly
        const updates: any = {
          company_fee_percentage: parseFloat(companyFeePercentage) || null,
          company_fee_amount: companyFeePerPiece > 0 ? companyFeePerPiece : null,
        }

        if (confirmationType === 'full') {
          updates.status = 'Completed'
          updates.big_advance_amount = 0
        } else if (confirmationType === 'bigAdvance') {
          updates.big_advance_amount = received
          updates.status = 'Pending'
          
          // If this is an installment sale, create installments automatically
          if (selectedSale.payment_type === 'Installment') {
            const installments = parseInt(numberOfInstallments) || selectedSale.number_of_installments || 12
            if (installments <= 0) {
              setError('عدد الأشهر يجب أن يكون أكبر من صفر')
              setConfirming(false)
              return
            }
            
            const remainingAfterAdvance = pricePerPiece - reservationPerPiece - received
            if (remainingAfterAdvance <= 0) {
              setError('المبلغ المتبقي بعد الدفعة الأولى والعربون يجب أن يكون أكبر من صفر')
              setConfirming(false)
              return
            }
            
            const monthlyAmount = remainingAfterAdvance / installments
            
            updates.number_of_installments = installments
            updates.monthly_installment_amount = parseFloat(monthlyAmount.toFixed(2))
            updates.installment_start_date = installmentStartDate || new Date().toISOString().split('T')[0]
            
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
        
        // Create a new sale for this piece
        const newSaleData: any = {
          client_id: selectedSale.client_id,
          land_piece_ids: [selectedPiece.id],
          payment_type: selectedSale.payment_type,
          total_purchase_cost: costPerPiece,
          total_selling_price: pricePerPiece,
          profit_margin: profitPerPiece,
          small_advance_amount: reservationPerPiece,
          company_fee_percentage: parseFloat(companyFeePercentage) || null,
          company_fee_amount: companyFeePerPiece > 0 ? companyFeePerPiece : null,
          big_advance_amount: 0,
          number_of_installments: null,
          monthly_installment_amount: null,
          status: confirmationType === 'full' ? 'Completed' : 'Pending',
          sale_date: selectedSale.sale_date,
          notes: `تأكيد قطعة من البيع #${selectedSale.id.slice(0, 8)}`,
          created_by: selectedSale.created_by || user?.id || null, // Keep original creator
        }

        if (confirmationType === 'full') {
          newSaleData.status = 'Completed'
          newSaleData.big_advance_amount = 0
        } else if (confirmationType === 'bigAdvance') {
          newSaleData.big_advance_amount = received
          newSaleData.status = 'Pending'
          
          // If this is an installment sale, create installments automatically
          if (selectedSale.payment_type === 'Installment') {
            const installments = parseInt(numberOfInstallments) || selectedSale.number_of_installments || 12
            if (installments <= 0) {
              setError('عدد الأشهر يجب أن يكون أكبر من صفر')
              setConfirming(false)
              return
            }
            
            const remainingAfterAdvance = pricePerPiece - reservationPerPiece - received
            if (remainingAfterAdvance <= 0) {
              setError('المبلغ المتبقي بعد الدفعة الأولى والعربون يجب أن يكون أكبر من صفر')
              setConfirming(false)
              return
            }
            
            const monthlyAmount = remainingAfterAdvance / installments
            
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
          ? 'تم تأكيد البيع بنجاح (دفع كامل)' 
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
      setError('حدث خطأ أثناء تأكيد البيع: ' + error.message)
      showNotification('حدث خطأ أثناء تأكيد البيع: ' + error.message, 'error')
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
                      {sale.deadline_date && sale.status !== 'Completed' && (() => {
                        const deadline = new Date(sale.deadline_date)
                        const today = new Date()
                        today.setHours(0, 0, 0, 0)
                        deadline.setHours(0, 0, 0, 0)
                        const daysUntil = Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
                        const isOverdue = daysUntil < 0
                        const isToday = daysUntil === 0
                        const isClose = daysUntil > 0 && daysUntil <= 3
                        
                        if (isOverdue || isToday || isClose) {
                          return (
                            <Badge variant="destructive" className="text-xs">
                              {isOverdue ? `⚠ تجاوز الموعد (${Math.abs(daysUntil)} يوم)` : isToday ? '⚠ اليوم هو الموعد النهائي' : `⚠ قريب (${daysUntil} يوم)`}
                            </Badge>
                          )
                        }
                        return null
                      })()}
                      <Badge variant={sale.status === 'Pending' ? 'warning' : 'secondary'} className="text-xs">
                        {sale.status === 'Pending' ? 'محجوز' : 'قيد الدفع'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {sale.payment_type === 'Full' ? 'بالحاضر' : sale.payment_type === 'Installment' ? 'بالتقسيط' : sale.payment_type || '-'}
                      </Badge>
                      {sale.payment_type === 'Installment' && sale.big_advance_amount && sale.big_advance_amount > 0 && (
                        <Badge 
                          variant={((sale._totalBigAdvancePaid || 0) >= sale.big_advance_amount) ? 'default' : 'secondary'} 
                          className="text-xs"
                        >
                          دفعة كبيرة: {formatCurrency(sale._totalBigAdvancePaid || 0)} / {formatCurrency(sale.big_advance_amount)}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">{formatDate(sale.sale_date)}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-3">
                  {/* Mobile Card View / Desktop Table View for Pieces */}
                  <div className="md:hidden space-y-2">
                    {pieces.map((piece: any) => {
                      const { pricePerPiece, reservationPerPiece, companyFeePerPiece, totalPayablePerPiece } = calculatePieceValues(sale, piece)
                      
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
                              </div>
                              
                              <div className="flex flex-wrap gap-2 pt-2 border-t">
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
                                    onClick={() => openConfirmDialog(sale, piece, 'full')}
                                    className="bg-green-600 hover:bg-green-700 text-xs h-8 flex-1"
                                    size="sm"
                                  >
                                    <CheckCircle className="ml-1 h-3 w-3" />
                                    اتمام البيع
                                  </Button>
                                )}
                                {sale.payment_type === 'Installment' && (
                                  <Button
                                    onClick={() => openConfirmDialog(sale, piece, 'bigAdvance')}
                                    className="bg-blue-600 hover:bg-blue-700 text-xs h-8 flex-1"
                                    size="sm"
                                  >
                                    <DollarSign className="ml-1 h-3 w-3" />
                                    دفعة
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
                          <TableHead className="text-xs">إجراء</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pieces.map((piece: any) => {
                          const { pricePerPiece, reservationPerPiece, companyFeePerPiece, totalPayablePerPiece } = calculatePieceValues(sale, piece)
                          
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
                              <TableCell className="py-2">
                                <div className="flex flex-wrap gap-1">
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
                                      onClick={() => openConfirmDialog(sale, piece, 'full')}
                                      className="bg-green-600 hover:bg-green-700 text-xs px-2 h-7"
                                      size="sm"
                                    >
                                      <CheckCircle className="ml-1 h-3 w-3" />
                                      اتمام البيع
                                    </Button>
                                  )}
                                  {sale.payment_type === 'Installment' && (
                                    <>
                                      <Button
                                        onClick={() => openConfirmDialog(sale, piece, 'bigAdvance')}
                                        className="bg-blue-600 hover:bg-blue-700 text-xs px-2 h-7"
                                        size="sm"
                                      >
                                        <DollarSign className="ml-1 h-3 w-3" />
                                        دفعة
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
            )
          })}
        </div>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {confirmationType === 'full' && 'تأكيد الدفع الكامل'}
              {confirmationType === 'bigAdvance' && 'تأكيد الدفعة الكبيرة'}
              {selectedPiece && ` - #${selectedPiece.piece_number}`}
            </DialogTitle>
          </DialogHeader>
          {selectedSale && selectedPiece && (
            <div className="space-y-3 sm:space-y-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 sm:p-4 space-y-2">
                {(() => {
                  const { pricePerPiece, reservationPerPiece, companyFeePerPiece, totalPayablePerPiece } = calculatePieceValues(selectedSale, selectedPiece)
                  return (
                    <>
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">سعر القطعة:</span>
                        <span className="font-medium">{formatCurrency(pricePerPiece)}</span>
                      </div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                        <Label htmlFor="companyFeePercentage" className="text-xs sm:text-sm whitespace-nowrap">عمولة الشركة (%):</Label>
                        <Input
                          id="companyFeePercentage"
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={companyFeePercentage}
                          onChange={e => setCompanyFeePercentage(e.target.value)}
                          className="w-full sm:w-24 text-xs sm:text-sm"
                        />
                      </div>
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">عمولة الشركة:</span>
                        <span className="font-medium text-blue-600">{formatCurrency(companyFeePerPiece)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-sm sm:text-lg pt-2 border-t">
                        <span>المبلغ الإجمالي المستحق:</span>
                        <span className="text-green-600">{formatCurrency(totalPayablePerPiece)}</span>
                      </div>
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span className="text-muted-foreground">المدفوع مسبقاً:</span>
                        <span className="text-green-600">{formatCurrency(reservationPerPiece)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-sm sm:text-base pt-2 border-t">
                        <span>المتبقي:</span>
                        <span className="text-orange-600">
                          {formatCurrency(totalPayablePerPiece - reservationPerPiece)}
                        </span>
                      </div>
                    </>
                  )
                })()}
              </div>

              {confirmationType === 'bigAdvance' && selectedSale?.payment_type === 'Installment' && (
                <div className="space-y-3 sm:space-y-4 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs sm:text-sm font-medium text-blue-800 mb-2 sm:mb-3">إعدادات الأقساط</p>
                  
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="numberOfInstallments" className="text-xs sm:text-sm">عدد الأشهر *</Label>
                    <Input
                      id="numberOfInstallments"
                      type="number"
                      min="1"
                      value={numberOfInstallments}
                      onChange={e => setNumberOfInstallments(e.target.value)}
                      placeholder="أدخل عدد الأشهر"
                      className="text-xs sm:text-sm"
                    />
                  </div>
                  
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
                <Label htmlFor="receivedAmount" className="text-xs sm:text-sm">المبلغ المستلم *</Label>
                <Input
                  id="receivedAmount"
                  type="number"
                  value={receivedAmount}
                  onChange={e => setReceivedAmount(e.target.value)}
                  placeholder="أدخل المبلغ المستلم"
                  className="text-xs sm:text-sm"
                />
              </div>

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
          )}
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
    </div>
  )
}
