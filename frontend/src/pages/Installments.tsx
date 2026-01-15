import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { debounce } from '@/lib/throttle'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { sanitizeNotes } from '@/lib/sanitize'
import { formatCurrency, formatDate } from '@/lib/utils'
import { User, ChevronDown, ChevronUp, RefreshCw, AlertTriangle, X, Merge } from 'lucide-react'
import type { Installment, Sale, Client, InstallmentStatus } from '@/types/database'

interface ContractEditor {
  id: string
  type: string
  name: string
  place: string
  created_by: string | null
  created_at: string
  updated_at: string
}

interface InstallmentWithRelations extends Installment {
  sale?: Sale & { 
    client?: Client
    contract_editor?: ContractEditor | null
  }
}

interface ClientInstallmentGroup {
  clientId: string
  clientName: string
  sales: {
    saleId: string
    saleDate: string
    totalPrice: number
    installments: InstallmentWithRelations[]
    totalDue: number
    totalPaid: number
    nextDueDate: string | null
    progress: number
    isConfirmed?: boolean
    landPieceCount?: number
  }[]
  totalDue: number
  totalPaid: number
  overdueCount: number
}

const statusColors: Record<InstallmentStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  Paid: 'success',
  Unpaid: 'warning',
  Late: 'destructive',
  Partial: 'secondary',
}

// Deadline Countdown Component
function DeadlineCountdown({ deadlineDate }: { deadlineDate: string }) {
  const [countdown, setCountdown] = useState<{
    days: number
    hours: number
    minutes: number
    isOverdue: boolean
  } | null>(null)
  
  useEffect(() => {
    const updateCountdown = () => {
      const deadline = new Date(deadlineDate)
      const now = new Date()
      deadline.setHours(23, 59, 59, 999)
      
      const diffMs = deadline.getTime() - now.getTime()
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      const isOverdue = diffMs < 0
      
      setCountdown({ days: Math.abs(days), hours: Math.abs(hours), minutes: Math.abs(minutes), isOverdue })
    }
    
    updateCountdown()
    const interval = setInterval(updateCountdown, 60000) // Update every minute
    
    return () => clearInterval(interval)
  }, [deadlineDate])
  
  if (!countdown) return null
  
  const isToday = countdown.days === 0 && !countdown.isOverdue
  const isClose = countdown.days > 0 && countdown.days <= 3 && !countdown.isOverdue
  
  let countdownText = ''
  if (countdown.isOverdue) {
    countdownText = `⚠ تجاوز الموعد بـ ${countdown.days} ${countdown.days === 1 ? 'يوم' : 'أيام'}`
    if (countdown.hours > 0) {
      countdownText += ` و ${countdown.hours} ${countdown.hours === 1 ? 'ساعة' : 'ساعات'}`
    }
  } else if (isToday) {
    if (countdown.hours > 0) {
      countdownText = `⚠ متبقي: ${countdown.hours} ${countdown.hours === 1 ? 'ساعة' : 'ساعات'} و ${countdown.minutes} ${countdown.minutes === 1 ? 'دقيقة' : 'دقائق'}`
    } else if (countdown.minutes > 0) {
      countdownText = `⚠ متبقي: ${countdown.minutes} ${countdown.minutes === 1 ? 'دقيقة' : 'دقائق'}`
    } else {
      countdownText = '⚠ الموعد النهائي اليوم'
    }
  } else {
    countdownText = `⏰ متبقي: ${countdown.days} ${countdown.days === 1 ? 'يوم' : 'أيام'}`
    if (countdown.hours > 0) {
      countdownText += ` و ${countdown.hours} ${countdown.hours === 1 ? 'ساعة' : 'ساعات'}`
    }
  }
  
  return (
    <div className="sm:col-span-2">
      <p className="text-xs sm:text-sm text-muted-foreground mb-1">آخر أجل لإتمام الإجراءات</p>
      <Badge 
        variant={countdown.isOverdue ? "destructive" : isToday || isClose ? "warning" : "default"} 
        className="text-xs sm:text-sm font-medium"
      >
        {countdownText}
      </Badge>
      <p className="text-xs text-muted-foreground mt-1">
        {formatDate(deadlineDate)}
      </p>
    </div>
  )
}

// Installment Countdown Component (for individual installments)
function InstallmentCountdown({ dueDate }: { dueDate: string }) {
  const [countdown, setCountdown] = useState<{
    days: number
    hours: number
    minutes: number
    isOverdue: boolean
  } | null>(null)
  
  useEffect(() => {
    const updateCountdown = () => {
      const due = new Date(dueDate)
      const now = new Date()
      due.setHours(23, 59, 59, 999)
      
      const diffMs = due.getTime() - now.getTime()
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
      const isOverdue = diffMs < 0
      
      setCountdown({ days: Math.abs(days), hours: Math.abs(hours), minutes: Math.abs(minutes), isOverdue })
    }
    
    updateCountdown()
    const interval = setInterval(updateCountdown, 60000) // Update every minute
    
    return () => clearInterval(interval)
  }, [dueDate])
  
  if (!countdown) return null
  
  const isToday = countdown.days === 0 && !countdown.isOverdue
  const isClose = countdown.days > 0 && countdown.days <= 3 && !countdown.isOverdue
  
  let countdownText = ''
  if (countdown.isOverdue) {
    countdownText = `⚠ تجاوز بـ ${countdown.days} ${countdown.days === 1 ? 'يوم' : 'أيام'}`
    if (countdown.hours > 0) {
      countdownText += ` و ${countdown.hours} ${countdown.hours === 1 ? 'ساعة' : 'ساعات'}`
    }
  } else if (isToday) {
    if (countdown.hours > 0) {
      countdownText = `⚠ متبقي: ${countdown.hours} ${countdown.hours === 1 ? 'ساعة' : 'ساعات'} و ${countdown.minutes} ${countdown.minutes === 1 ? 'دقيقة' : 'دقائق'}`
    } else if (countdown.minutes > 0) {
      countdownText = `⚠ متبقي: ${countdown.minutes} ${countdown.minutes === 1 ? 'دقيقة' : 'دقائق'}`
    } else {
      countdownText = '⚠ اليوم'
    }
  } else {
    countdownText = `⏰ متبقي: ${countdown.days} ${countdown.days === 1 ? 'يوم' : 'أيام'}`
    if (countdown.hours > 0) {
      countdownText += ` و ${countdown.hours} ${countdown.hours === 1 ? 'ساعة' : 'ساعات'}`
    }
  }
  
  return (
    <Badge 
      variant={countdown.isOverdue ? "destructive" : isToday || isClose ? "warning" : "default"} 
      className="text-xs font-medium mt-1"
    >
      {countdownText}
    </Badge>
  )
}

export function Installments() {
  const { hasPermission, user } = useAuth()
  const { t } = useLanguage()
  const [installments, setInstallments] = useState<InstallmentWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false) // Track refresh state separately
  const [refreshKey, setRefreshKey] = useState(0) // Force re-render trigger
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterOverdue, setFilterOverdue] = useState<boolean>(false)
  const [filterDueThisMonth, setFilterDueThisMonth] = useState<boolean>(false)
  const [filterMinRemaining, setFilterMinRemaining] = useState<string>('')
  const [filterProgress, setFilterProgress] = useState<string>('all') // all, low, medium, high
  const [searchTerm, setSearchTerm] = useState('') // Search by client name
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  
  // Details drawer state
  const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false)
  const [selectedSaleForDetails, setSelectedSaleForDetails] = useState<{
    saleId: string
    clientName: string
    clientCin?: string
    saleDate: string
    deadlineDate?: string | null
    installments: InstallmentWithRelations[]
    totalDue: number
    totalPaid: number
    totalUnpaid: number
    landPieces: string
    contractEditor?: { type: string; name: string; place: string } | null
    createdByUser?: { id: string; name: string } | null
    confirmedByUser?: { id: string; name: string } | null
    isConfirmed?: boolean
  } | null>(null)
  
  // Debounced search
  const debouncedSearchFn = useCallback(
    debounce((value: string) => setDebouncedSearchTerm(value), 300),
    []
  )

  // Payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentWithRelations | null>(null)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [monthsToPayCount, setMonthsToPayCount] = useState(1)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  
  // Merge installments dialog
  const [mergeDialogOpen, setMergeDialogOpen] = useState(false)
  const [mergingSales, setMergingSales] = useState(false)
  const [mergeableGroups, setMergeableGroups] = useState<Array<{
    clientId: string
    clientName: string
    sales: Array<{
      saleId: string
      saleDate: string
      landPieces: string
      totalUnpaid: number
      remainingInstallments: number
      monthlyAmount: number
      selectedOfferId?: string
    }>
  }>>([])
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [paymentConfirmOpen, setPaymentConfirmOpen] = useState(false)
  
  // Client details dialog
  const [clientDetailsOpen, setClientDetailsOpen] = useState(false)
  const [selectedClientForDetails, setSelectedClientForDetails] = useState<any>(null)
  const [clientSales, setClientSales] = useState<any[]>([])
  
  const openClientDetails = async (client: any) => {
    if (!client || !client.id) return
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
      const sales = data || []
      
      // Fetch land pieces for all sales
      const allPieceIds = new Set<string>()
      sales.forEach((sale: any) => {
        if (sale.land_piece_ids) {
          sale.land_piece_ids.forEach((id: string) => allPieceIds.add(id))
        }
      })
      
      if (allPieceIds.size > 0) {
        try {
          const { data: piecesData, error: piecesError } = await supabase
            .from('land_pieces')
            .select('id, piece_number, land_batch_id')
            .in('id', Array.from(allPieceIds))
          
          if (piecesError) {
            console.error('Error fetching land pieces:', piecesError)
          } else if (piecesData) {
            // Fetch batch names separately if needed
            const batchIds = new Set(piecesData.map((p: any) => p.land_batch_id).filter(Boolean))
            let batchMap = new Map()
            
            if (batchIds.size > 0) {
              const { data: batchesData } = await supabase
                .from('land_batches')
                .select('id, name')
                .in('id', Array.from(batchIds))
              
              if (batchesData) {
                batchMap = new Map(batchesData.map((b: any) => [b.id, b.name]))
              }
            }
            
            const piecesMap = new Map(piecesData.map((p: any) => [
              p.id, 
              {
                ...p,
                land_batch: batchMap.get(p.land_batch_id) ? { name: batchMap.get(p.land_batch_id) } : null
              }
            ]))
            
            sales.forEach((sale: any) => {
              if (sale.land_piece_ids) {
                sale._landPieces = sale.land_piece_ids
                  .map((id: string) => piecesMap.get(id))
                  .filter(Boolean)
              }
            })
          }
        } catch (err) {
          console.error('Error processing land pieces:', err)
          // Continue without land pieces data
        }
      }
      
      setClientSales(sales)
    } catch (err) {
      console.error('Error fetching client sales:', err)
      setClientSales([])
    }
  }

  // Summary stats
  const [stats, setStats] = useState({
    totalDue: 0,
    totalPaid: 0,
    totalOverdue: 0,
    overdueCount: 0,
    clientsWithOverdue: 0,
    totalClients: 0,
  })

  useEffect(() => {
    fetchInstallments()
    
    // Cleanup timeout on unmount
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
        loadingTimeoutRef.current = null
      }
    }
  }, [])

  // IMPROVED: Auto-refresh details drawer when installments change (after payment)
  // Uses refreshKey to ensure updates are detected
  useEffect(() => {
    if (detailsDrawerOpen && selectedSaleForDetails) {
      console.log('[useEffect:autoRefresh] Checking for updates, refreshKey:', refreshKey)
      
      // Find fresh installments for this sale from the updated installments state
      const freshInstallments = installments.filter(inst => inst.sale_id === selectedSaleForDetails.saleId)
      
      if (freshInstallments.length > 0) {
        const firstInst = freshInstallments[0]
        
        // Get land pieces from the sale data (should already be attached)
        const landPieces = (firstInst.sale as any)?._landPieces || []
        const pieceNumbers = landPieces.map((p: any) => p?.piece_number).filter(Boolean).join('، ')
        
        // Calculate totals from fresh installments
        const totalDue = freshInstallments.reduce((sum, inst) => sum + inst.amount_due, 0)
        // Include big advance amount (التسبقة) in total paid - this is paid at confirmation
        const bigAdvanceAmount = (firstInst.sale as any)?.big_advance_amount || 0
        const totalPaid = freshInstallments.reduce((sum, inst) => sum + (inst.amount_paid || 0), 0) + bigAdvanceAmount
        const totalUnpaid = freshInstallments.reduce((sum, inst) => {
          const remaining = inst.amount_due + (inst.stacked_amount || 0) - (inst.amount_paid || 0)
          return sum + Math.max(0, remaining)
        }, 0)
        
        // Check if any installment data changed (include big advance in comparison)
        const currentBigAdvance = (selectedSaleForDetails.installments[0]?.sale as any)?.big_advance_amount || 0
        const currentPaid = selectedSaleForDetails.installments.reduce((sum, i) => sum + (i.amount_paid || 0), 0) + currentBigAdvance
        const hasChanges = Math.abs(totalPaid - currentPaid) > 0.01
        
        // Also check installment count in case new payments affected status
        const currentCount = selectedSaleForDetails.installments.filter(i => i.status === 'Paid').length
        const newCount = freshInstallments.filter(i => i.status === 'Paid').length
        const statusChanged = currentCount !== newCount
        
        if (hasChanges || statusChanged) {
          console.log('[useEffect:autoRefresh] Updating details drawer:', {
            previousPaid: currentPaid,
            newPaid: totalPaid,
            previousPaidCount: currentCount,
            newPaidCount: newCount
          })
          
          const firstInst = freshInstallments[0]
          const sale = firstInst?.sale as any
          const isConfirmed = sale?.confirmed_by !== null || 
                              sale?.is_confirmed === true || 
                              sale?.big_advance_confirmed === true ||
                              freshInstallments.length > 0
          
          setSelectedSaleForDetails({
            saleId: selectedSaleForDetails.saleId,
            clientName: selectedSaleForDetails.clientName,
            clientCin: selectedSaleForDetails.clientCin,
            saleDate: selectedSaleForDetails.saleDate,
            deadlineDate: selectedSaleForDetails.deadlineDate,
            installments: [...freshInstallments].sort((a, b) => a.installment_number - b.installment_number),
            totalDue,
            totalPaid,
            totalUnpaid,
            landPieces: pieceNumbers || selectedSaleForDetails.landPieces,
            contractEditor: selectedSaleForDetails.contractEditor,
            createdByUser: selectedSaleForDetails.createdByUser,
            confirmedByUser: selectedSaleForDetails.confirmedByUser,
            isConfirmed: isConfirmed || selectedSaleForDetails.isConfirmed || false
          })
        }
      }
    }
  }, [installments, refreshKey, detailsDrawerOpen, selectedSaleForDetails?.saleId])

  // Stack unpaid overdue installments onto the first unpaid installment
  useEffect(() => {
    const stackOverdueInstallments = async () => {
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      
      // Group installments by sale
      const installmentsBySale = new Map<string, InstallmentWithRelations[]>()
      installments.forEach(inst => {
        if (!installmentsBySale.has(inst.sale_id)) {
          installmentsBySale.set(inst.sale_id, [])
        }
        installmentsBySale.get(inst.sale_id)!.push(inst)
      })
      
      // For each sale, stack overdue installments
      for (const [saleId, saleInstallments] of installmentsBySale.entries()) {
        // Sort by installment number
        saleInstallments.sort((a, b) => a.installment_number - b.installment_number)
        
        // Find first unpaid installment (lowest number with remaining amount)
        const firstUnpaid = saleInstallments.find(i => {
          const remaining = i.amount_due + (i.stacked_amount || 0) - i.amount_paid
          return remaining > 0.01
        })
        
        if (!firstUnpaid) continue
        
        // Find all overdue unpaid installments that come before the first unpaid
        const overdueBeforeFirst = saleInstallments.filter(i => {
          if (i.id === firstUnpaid.id) return false
          const dueDate = new Date(i.due_date)
          dueDate.setHours(0, 0, 0, 0)
          const remaining = i.amount_due + (i.stacked_amount || 0) - i.amount_paid
          return dueDate < now && remaining > 0.01 && i.installment_number < firstUnpaid.installment_number
        })
        
        if (overdueBeforeFirst.length === 0) continue
        
        // Calculate total to stack from overdue installments
        let totalToStack = 0
        const overdueToStack: Array<{ id: string; remaining: number }> = []
        
        for (const overdue of overdueBeforeFirst) {
          const remaining = overdue.amount_due + (overdue.stacked_amount || 0) - overdue.amount_paid
          if (remaining > 0.01) {
            totalToStack += remaining
            overdueToStack.push({ id: overdue.id, remaining })
          }
        }
        
        if (totalToStack <= 0.01) continue
        
        // Check if first unpaid already has this stacked amount (avoid duplicate stacking)
        const currentStacked = firstUnpaid.stacked_amount || 0
        const expectedStacked = overdueToStack.reduce((sum, o) => sum + o.remaining, 0)
        
        // Only update if the stacked amount doesn't already include these overdue amounts
        if (Math.abs(currentStacked - expectedStacked) > 0.01) {
          // Add stacked amount to first unpaid installment
          const newStackedAmount = currentStacked + totalToStack
          
          await supabase
            .from('installments')
            .update({ stacked_amount: newStackedAmount })
            .eq('id', firstUnpaid.id)
          
          // Mark overdue installments as having their amounts stacked (but keep them as unpaid)
          // We don't mark them as Paid - they remain unpaid but their amounts are stacked
          for (const overdue of overdueToStack) {
            // Update the overdue installment to reflect that its amount is stacked
            // Keep it as unpaid but set amount_paid to include the amount_due so remaining is 0
            const overdueInst = saleInstallments.find(i => i.id === overdue.id)
            if (overdueInst) {
              const newAmountPaid = overdueInst.amount_paid + overdueInst.amount_due + (overdueInst.stacked_amount || 0)
              await supabase
                .from('installments')
                .update({ 
                  stacked_amount: 0,
                  amount_paid: newAmountPaid,
                  // Keep status as Unpaid or Late, don't mark as Paid
                  status: overdueInst.status === 'Late' ? 'Late' : 'Unpaid'
                })
                .eq('id', overdue.id)
            }
          }
        }
      }
    }
    
    // Run stacking check when installments change (debounced to avoid too many updates)
    if (installments.length > 0) {
      const timeoutId = setTimeout(() => {
        stackOverdueInstallments().catch(err => {
          console.error('Error stacking overdue installments:', err)
        })
      }, 1000) // Wait 1 second after installments change
      
      return () => clearTimeout(timeoutId)
    }
  }, [installments])

  // IMPROVED: Fetch installments with retry logic and proper error handling
  const fetchInstallments = async (retryCount = 0): Promise<boolean> => {
    const maxRetries = 3
    const retryDelay = 1000 // 1 second
    
    // Clear any existing timeout
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current)
      loadingTimeoutRef.current = null
    }
    
    // Set loading timeout (30 seconds) to prevent stuck loading
    loadingTimeoutRef.current = setTimeout(() => {
      console.warn('[fetchInstallments] Loading timeout reached - forcing loading to stop')
      setLoading(false)
      setIsRefreshing(false)
      loadingTimeoutRef.current = null
    }, 30000)
    
    try {
      console.log(`[fetchInstallments] Starting fetch (attempt ${retryCount + 1}/${maxRetries + 1})...`)
      
      const { data, error } = await supabase
        .from('installments')
        .select(`
          *,
          sale:sales (
            *,
            client:clients (*),
            contract_editor:contract_editors (*),
            land_piece_ids,
            is_confirmed,
            big_advance_confirmed,
            confirmed_by,
            created_by_user:users!sales_created_by_fkey(id, name),
            confirmed_by_user:users!sales_confirmed_by_fkey(id, name)
          )
        `)
        .order('due_date', { ascending: true })

      if (error) {
        console.error('[fetchInstallments] Supabase error:', error)
        throw error
      }
      
      const installmentData = (data as InstallmentWithRelations[]) || []
      console.log(`[fetchInstallments] Fetched ${installmentData.length} installments`)

      // Fetch land pieces for all sales to get piece numbers
      if (installmentData && installmentData.length > 0) {
        const allPieceIds = new Set<string>()
        installmentData.forEach((inst: any) => {
          if (inst.sale?.land_piece_ids) {
            inst.sale.land_piece_ids.forEach((id: string) => allPieceIds.add(id))
          }
        })
        
        if (allPieceIds.size > 0) {
          try {
            const { data: piecesData, error: piecesError } = await supabase
              .from('land_pieces')
              .select('id, piece_number, land_batch_id')
              .in('id', Array.from(allPieceIds))
            
            if (piecesError) {
              console.error('[fetchInstallments] Error fetching land pieces:', piecesError)
            } else if (piecesData) {
              // Fetch batch names separately if needed
              const batchIds = new Set(piecesData.map((p: any) => p.land_batch_id).filter(Boolean))
              let batchMap = new Map()
              
              if (batchIds.size > 0) {
                const { data: batchesData } = await supabase
                  .from('land_batches')
                  .select('id, name')
                  .in('id', Array.from(batchIds))
                
                if (batchesData) {
                  batchMap = new Map(batchesData.map((b: any) => [b.id, b.name]))
                }
              }
              
              // Attach piece info to sales
              const piecesMap = new Map(piecesData.map((p: any) => [
                p.id, 
                {
                  ...p,
                  land_batch: batchMap.get(p.land_batch_id) ? { name: batchMap.get(p.land_batch_id) } : null
                }
              ]))
              
              installmentData.forEach((inst: any) => {
                if (inst.sale?.land_piece_ids) {
                  inst.sale._landPieces = inst.sale.land_piece_ids
                    .map((id: string) => piecesMap.get(id))
                    .filter(Boolean)
                }
              })
            }
          } catch (err) {
            console.error('[fetchInstallments] Error processing land pieces:', err)
            // Continue without land pieces data
          }
        }
      }
      
      // CRITICAL: Create new array to force React to detect state change
      const newInstallmentsArray = [...installmentData]
      
      // Set installments after attaching land pieces
      setInstallments(newInstallmentsArray)
      
      // Force re-render by incrementing refresh key
      setRefreshKey(prev => prev + 1)
      
      console.log('[fetchInstallments] State updated:', {
        count: newInstallmentsArray.length,
        sampleInstallment: newInstallmentsArray[0] ? {
          id: newInstallmentsArray[0].id,
          amount_paid: newInstallmentsArray[0].amount_paid,
          status: newInstallmentsArray[0].status
        } : null,
        timestamp: new Date().toISOString()
      })

      // Calculate stats
      const totalDue = installmentData.reduce((sum, i) => sum + i.amount_due, 0)
      // Include big advance amounts (التسبقة) - count once per sale
      const salesWithBigAdvance = new Map<string, number>()
      installmentData.forEach(i => {
        const saleId = i.sale_id
        if (!salesWithBigAdvance.has(saleId)) {
          const bigAdvanceAmount = ((i.sale as any)?.big_advance_amount || 0)
          salesWithBigAdvance.set(saleId, bigAdvanceAmount)
        }
      })
      const totalBigAdvance = Array.from(salesWithBigAdvance.values()).reduce((sum, amount) => sum + amount, 0)
      const totalPaid = installmentData.reduce((sum, i) => sum + i.amount_paid, 0) + totalBigAdvance
      // Check overdue based on due date, not just status
      const now = new Date()
      now.setHours(0, 0, 0, 0)
      const overdue = installmentData.filter((i) => {
        if (i.status === 'Paid') return false
        const dueDate = new Date(i.due_date)
        dueDate.setHours(0, 0, 0, 0)
        return dueDate < now
      })
      // Calculate total overdue only for installments with actual remaining amounts
      const totalOverdue = overdue.reduce((sum, i) => {
        const remaining = i.amount_due + i.stacked_amount - i.amount_paid
        return sum + Math.max(0, remaining)
      }, 0)
      
      // Count unique clients
      const uniqueClients = new Set(installmentData.map(i => i.sale?.client_id).filter(Boolean))
      const clientsWithOverdue = new Set(overdue.map(i => i.sale?.client_id).filter(Boolean))

      setStats({
        totalDue,
        totalPaid,
        totalOverdue,
        overdueCount: overdue.length,
        clientsWithOverdue: clientsWithOverdue.size,
        totalClients: uniqueClients.size,
      })
      
      console.log('[fetchInstallments] Stats updated:', { totalDue, totalPaid, totalOverdue })
      return true // Success
      
    } catch (error: any) {
      console.error('[fetchInstallments] Error:', error)
      
      // Check if it's a network error and we should retry
      const isNetworkError = error?.message?.includes('ERR_CONNECTION') || 
                            error?.message?.includes('Failed to fetch') ||
                            error?.code === 'NETWORK_ERROR'
      
      if (isNetworkError && retryCount < maxRetries) {
        console.log(`[fetchInstallments] Network error, retrying in ${retryDelay}ms...`)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        return fetchInstallments(retryCount + 1)
      }
      
      setErrorMessage('خطأ في تحميل الأقساط. يرجى المحاولة مرة أخرى.')
      return false // Failure
    } finally {
      // Clear loading timeout
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current)
        loadingTimeoutRef.current = null
      }
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  // Get next unpaid installment for a sale
  const getNextInstallment = (saleId: string, currentInstallmentNumber: number) => {
    return installments.find(
      (i) => i.sale_id === saleId && 
             i.installment_number > currentInstallmentNumber && 
             i.status !== 'Paid'
    )
  }

  // Get all unpaid installments for a sale (for multi-month payment) - Memoized
  const getUnpaidInstallmentsForSale = useCallback((saleId: string) => {
    return installments
      .filter((i) => {
        if (i.sale_id !== saleId) return false
        // Check if there's actually an amount remaining (including stacked amounts)
        const remaining = i.amount_due + (i.stacked_amount || 0) - i.amount_paid
        return remaining > 0.01
      })
      .sort((a, b) => a.installment_number - b.installment_number)
  }, [installments])

  // Recalculate sale status based on installment payments
  const recalculateSaleStatus = async (saleId: string) => {
    try {
      // Get all installments for this sale
      const { data: saleInstallments } = await supabase
        .from('installments')
        .select('*')
        .eq('sale_id', saleId)

      if (!saleInstallments || saleInstallments.length === 0) return

      // Check if all installments are paid
      const allPaid = saleInstallments.every(i => i.status === 'Paid')
      
      // Update sale status accordingly
      const newStatus = allPaid ? 'Completed' : 'InstallmentsOngoing'
      await supabase
        .from('sales')
        .update({ status: newStatus })
        .eq('id', saleId)
    } catch (error) {
      // Silent fail - status recalculation is not critical
    }
  }

  const openPaymentDialog = (installment: InstallmentWithRelations) => {
    // VALIDATION: Check if installment is already paid
    const remainingAmount = getRemainingAmount(installment)
    if (remainingAmount <= 0.01 || installment.status === 'Paid') {
      // Alert user that this installment is already paid
      setErrorMessage(`⚠️ هذا القسط #${installment.installment_number} مدفوع بالكامل بالفعل!`)
      console.log('[openPaymentDialog] Attempted to pay already paid installment:', {
        installmentId: installment.id,
        installmentNumber: installment.installment_number,
        status: installment.status,
        remaining: remainingAmount
      })
      return // Don't open dialog
    }
    
    setErrorMessage(null)
    setSelectedInstallment(installment)
    
    // Auto-calculate payment amount for ALL unpaid installments (including stacked amounts)
    const unpaid = getUnpaidInstallmentsForSale(installment.sale_id)
    
    // Double-check there are unpaid installments
    if (unpaid.length === 0) {
      setErrorMessage('⚠️ جميع أقساط هذه الصفقة مدفوعة بالكامل!')
      return
    }
    
    // Check if this is an installment sale or full payment sale
    const isInstallmentSale = installment.sale?.payment_type !== 'Full'
    
    if (isInstallmentSale) {
      // For installment sales: auto-select all overdue installments (accumulated)
      const overdueInstallments = unpaid.filter(inst => isInstallmentOverdue(inst))
      
      if (overdueInstallments.length > 0) {
        // Auto-select all overdue installments
        setMonthsToPayCount(overdueInstallments.length)
        // Calculate total of overdue installments (all stacked amounts should be on the first unpaid)
        const overdueTotal = overdueInstallments.reduce((sum, inst) => {
          return sum + getRemainingAmount(inst)
        }, 0)
        const roundedAmount = Math.round(overdueTotal * 100) / 100
        setPaymentAmount(String(roundedAmount))
      } else {
        // No overdue, default to first installment
        setMonthsToPayCount(1)
        const firstAmount = unpaid.length > 0 ? getRemainingAmount(unpaid[0]) : 0
        const roundedAmount = Math.round(firstAmount * 100) / 100
        setPaymentAmount(String(roundedAmount))
      }
    } else {
      // For full payment sales: show total remaining
      setMonthsToPayCount(1)
      const totalUnpaidAmount = unpaid.reduce((sum, inst) => {
        return sum + getRemainingAmount(inst)
      }, 0)
      const roundedAmount = Math.round(totalUnpaidAmount * 100) / 100
      setPaymentAmount(String(roundedAmount))
    }
    
    setPaymentDialogOpen(true)
  }

  const recordPayment = async () => {
    if (!selectedInstallment || !paymentAmount) return

    // Authorization check
    if (!hasPermission('record_payments')) {
      setErrorMessage('ليس لديك صلاحية لتسجيل المدفوعات')
      setPaymentConfirmOpen(false)
      return
    }

    const amount = parseFloat(paymentAmount)
    if (isNaN(amount) || amount <= 0) {
      setErrorMessage('يرجى إدخال مبلغ صحيح')
      setPaymentConfirmOpen(false)
      return
    }

    // Check network connection
    if (!navigator.onLine) {
      setErrorMessage('لا يوجد اتصال بالإنترنت. يرجى التحقق من الاتصال والمحاولة مرة أخرى.')
      setPaymentConfirmOpen(false)
      return
    }

    setErrorMessage(null)
    setIsRefreshing(true) // Show loading state during payment
    
    console.log('[recordPayment] Starting payment recording...')
    
    try {
      // CRITICAL: Re-check from database that installment is not already paid
      // This prevents double payment if UI data is stale
      const { data: freshInstallment, error: checkError } = await supabase
        .from('installments')
        .select('id, amount_paid, amount_due, stacked_amount, status')
        .eq('id', selectedInstallment.id)
        .single()
      
      if (checkError) {
        console.error('[recordPayment] Error checking installment status:', checkError)
        setErrorMessage('خطأ في التحقق من حالة القسط')
        setIsRefreshing(false)
        setPaymentConfirmOpen(false)
        return
      }
      
      if (freshInstallment) {
        const freshRemaining = freshInstallment.amount_due + (freshInstallment.stacked_amount || 0) - freshInstallment.amount_paid
        if (freshRemaining <= 0.01 || freshInstallment.status === 'Paid') {
          // Installment was paid in another session/tab
          setErrorMessage(`⚠️ هذا القسط مدفوع بالكامل بالفعل! يرجى تحديث الصفحة.`)
          console.log('[recordPayment] Installment already paid (detected from database):', freshInstallment)
          setIsRefreshing(false)
          setPaymentConfirmOpen(false)
          setPaymentDialogOpen(false)
          // Force refresh to get latest data
          await fetchInstallments()
          return
        }
      }
      
      // CRITICAL: Only get installments for THIS specific sale (per-client isolation)
      // This ensures overpayments only affect the same client's installments
      const clientId = selectedInstallment.sale?.client_id
      if (!clientId) {
        setErrorMessage('خطأ: لا يمكن تحديد العميل')
        setIsRefreshing(false)
        setPaymentConfirmOpen(false)
        return
      }

      // Get installments to pay (for multi-month payment) - ONLY for this sale
      const unpaidInstallments = getUnpaidInstallmentsForSale(selectedInstallment.sale_id)
      const installmentsToPay = unpaidInstallments.slice(0, monthsToPayCount)
      
      // Validate that there are installments to pay
      if (installmentsToPay.length === 0) {
        setErrorMessage('⚠️ لا توجد أقساط غير مدفوعة لهذه الصفقة!')
        setIsRefreshing(false)
        setPaymentConfirmOpen(false)
        setPaymentDialogOpen(false)
        await fetchInstallments()
        return
      }
      
      let remainingPayment = amount
      const today = new Date().toISOString().split('T')[0]

      // Process each installment for THIS sale only
      for (const inst of installmentsToPay) {
        if (remainingPayment <= 0) break

        // Calculate remaining amount for this specific installment (per-client calculation)
        const totalDue = getRemainingAmount(inst)
        
        // If this installment is already fully paid, skip to next
        if (totalDue <= 0.01) continue
        
        const paymentForThis = Math.min(remainingPayment, totalDue)
        const newPaid = inst.amount_paid + paymentForThis
        const totalRequired = inst.amount_due + inst.stacked_amount
        const isFullyPaid = newPaid >= totalRequired - 0.01 // Use threshold for floating point

        // Calculate new stacked_amount correctly
        // If fully paid, stacked_amount should be 0
        // Otherwise, it's the remaining amount after payment
        const newStackedAmount = isFullyPaid ? 0 : Math.max(0, totalRequired - newPaid)

        // Update installment - per-client, isolated calculation
        const { error: updateError } = await supabase
          .from('installments')
          .update({
            amount_paid: newPaid,
            status: isFullyPaid ? 'Paid' : newPaid > 0.01 ? 'Partial' : inst.status,
            paid_date: isFullyPaid ? today : null,
            stacked_amount: newStackedAmount,
          })
          .eq('id', inst.id)
        
        if (updateError) {
          console.error('Error updating installment:', updateError)
          console.error('Installment ID:', inst.id)
          console.error('Update data:', {
            amount_paid: newPaid,
            status: isFullyPaid ? 'Paid' : newPaid > 0.01 ? 'Partial' : inst.status,
            paid_date: isFullyPaid ? today : null,
            stacked_amount: newStackedAmount,
          })
          // Provide more helpful error message
          const errorMessage = updateError.code === 'PGRST116' 
            ? 'القسط غير موجود' 
            : updateError.code === '42501'
            ? 'ليس لديك صلاحية لتحديث هذا القسط'
            : updateError.message || 'خطأ في تحديث القسط'
          throw new Error(errorMessage)
        }

        // Record individual payment - linked to this specific client and sale
        const { error: paymentError } = await supabase.from('payments').insert([{
          client_id: clientId, // Ensure payment is linked to correct client
          sale_id: selectedInstallment.sale_id, // Ensure payment is linked to correct sale
          installment_id: inst.id,
          amount_paid: paymentForThis,
          payment_type: 'Installment',
          payment_date: today,
          recorded_by: user?.id || null, // Track who recorded this payment
        }])
        
        if (paymentError) {
          console.error('Error recording payment:', paymentError)
          throw paymentError
        }

        remainingPayment -= paymentForThis
      }

      // If there's remaining payment after paying all installments for this sale,
      // it should be stored as credit for this client's future installments
      // For now, we'll just log it - future enhancement could add a credit system
      if (remainingPayment > 0.01) {
        console.log(`Overpayment of ${remainingPayment} for sale ${selectedInstallment.sale_id} - could be applied to future installments`)
        // TODO: Implement credit system for overpayments
      }

      // Recalculate sale status after payment - only affects this sale
      await recalculateSaleStatus(selectedInstallment.sale_id)

      const paidSaleId = selectedInstallment.sale_id
      const wasDetailsDrawerOpen = detailsDrawerOpen && selectedSaleForDetails?.saleId === paidSaleId
      
      console.log('[recordPayment] Payment recorded successfully, refreshing data...')
      
      // DON'T close dialog until refresh is complete - keep user informed
      // setPaymentDialogOpen(false) // Moved below
      
      // Minimal delay for database commit (reduced from 800ms to 200ms)
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // CRITICAL: Refresh installments data to update UI
      // Retry up to 2 times if initial fetch fails (reduced from 3)
      let refreshSuccess = false
      for (let attempt = 1; attempt <= 2; attempt++) {
        console.log(`[recordPayment] Refresh attempt ${attempt}/2...`)
        try {
          refreshSuccess = await fetchInstallments()
          if (refreshSuccess) {
            console.log('[recordPayment] Refresh successful!')
            break
          }
        } catch (fetchError) {
          console.error(`[recordPayment] Refresh attempt ${attempt} failed:`, fetchError)
        }
        
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 200)) // Reduced from 500ms
        }
      }
      
      // Force refresh of deals table by incrementing refreshKey
      setRefreshKey(prev => prev + 1)
      
      // NOW close the dialogs after refresh completes
      setPaymentConfirmOpen(false)
      setPaymentDialogOpen(false)
      setPaymentAmount('')
      setMonthsToPayCount(1)
      setSelectedInstallment(null)
      
      // If details drawer was open for this sale, refresh it by fetching fresh data from database
      if (wasDetailsDrawerOpen) {
        console.log('[recordPayment] Refreshing details drawer...')
        
        // Minimal delay for database consistency (reduced from 300ms to 100ms)
        await new Promise(resolve => setTimeout(resolve, 100))
        
        try {
          // Fetch fresh installments for this sale from database
          const { data: freshData, error } = await supabase
            .from('installments')
            .select(`
              *,
              sale:sales (
                *,
                client:clients (*),
                contract_editor:contract_editors (*),
                land_piece_ids,
                created_by_user:users!sales_created_by_fkey(id, name),
                confirmed_by_user:users!sales_confirmed_by_fkey(id, name)
              )
            `)
            .eq('sale_id', paidSaleId)
            .order('installment_number', { ascending: true })
          
          if (error) {
            console.error('[recordPayment] Error fetching fresh installments:', error)
          } else if (freshData && freshData.length > 0) {
            const freshInstallments = freshData as InstallmentWithRelations[]
            const firstInst = freshInstallments[0]
            
            // Fetch land pieces if needed
            let pieceNumbers = '-'
            if (firstInst.sale?.land_piece_ids && firstInst.sale.land_piece_ids.length > 0) {
              const { data: piecesData } = await supabase
                .from('land_pieces')
                .select('piece_number')
                .in('id', firstInst.sale.land_piece_ids)
              
              if (piecesData) {
                const numbers = piecesData.map(p => p.piece_number).filter(Boolean)
                pieceNumbers = numbers.length > 0 ? numbers.join('، ') : '-'
              }
            }
            
            // Calculate totals from fresh installments
            const totalDue = freshInstallments.reduce((sum, inst) => sum + inst.amount_due, 0)
            // Include big advance amount (التسبقة) in total paid - this is paid at confirmation
            const bigAdvanceAmount = (firstInst.sale as any)?.big_advance_amount || 0
            const totalPaid = freshInstallments.reduce((sum, inst) => sum + (inst.amount_paid || 0), 0) + bigAdvanceAmount
            const totalUnpaid = freshInstallments.reduce((sum, inst) => {
              const remaining = inst.amount_due + (inst.stacked_amount || 0) - (inst.amount_paid || 0)
              return sum + Math.max(0, remaining)
            }, 0)
            
            console.log('[recordPayment] Refreshing details drawer with fresh data:', {
              saleId: paidSaleId,
              installmentsCount: freshInstallments.length,
              totalPaid,
              totalUnpaid,
              paidInstallments: freshInstallments.filter(i => i.status === 'Paid').length
            })
            
            const sale = firstInst.sale as any
            const isConfirmed = sale?.confirmed_by !== null || 
                                sale?.is_confirmed === true || 
                                sale?.big_advance_confirmed === true ||
                                freshInstallments.length > 0
            
            // If confirmed_by exists but confirmed_by_user is not loaded, fetch it
            let confirmedByUser = sale?.confirmed_by_user || selectedSaleForDetails?.confirmedByUser || null
            if (!confirmedByUser && sale?.confirmed_by) {
              try {
                const { data: userData } = await supabase
                  .from('users')
                  .select('id, name')
                  .eq('id', sale.confirmed_by)
                  .single()
                
                if (userData) {
                  confirmedByUser = { id: userData.id, name: userData.name }
                }
              } catch (err) {
                console.error('Error fetching confirmed_by user:', err)
              }
            }
            
            setSelectedSaleForDetails({
              saleId: paidSaleId,
              clientName: firstInst.sale?.client?.name || selectedSaleForDetails?.clientName || '',
              clientCin: firstInst.sale?.client?.cin || selectedSaleForDetails?.clientCin,
              saleDate: firstInst.sale?.sale_date || selectedSaleForDetails?.saleDate || '',
              installments: [...freshInstallments], // Create new array to force update
              totalDue,
              totalPaid,
              totalUnpaid,
              landPieces: pieceNumbers,
              contractEditor: firstInst.sale?.contract_editor || selectedSaleForDetails?.contractEditor || null,
              createdByUser: sale?.created_by_user || selectedSaleForDetails?.createdByUser || null,
              confirmedByUser,
              isConfirmed
            })
          } else {
            console.warn('[recordPayment] No fresh installments data found for sale:', paidSaleId)
          }
        } catch (err) {
          console.error('[recordPayment] Error refreshing sale details:', err)
        }
      }
      
      setErrorMessage(null)
      setIsRefreshing(false)
      
      // Show success message
      const totalPaidAmount = parseFloat(paymentAmount)
      setSuccessMessage(`✅ تم تسجيل الدفعة بنجاح! (${totalPaidAmount.toLocaleString('ar-TN', { style: 'currency', currency: 'TND' })})`)
      
      // Auto-hide success message after 4 seconds
      setTimeout(() => setSuccessMessage(null), 4000)
      
      console.log('[recordPayment] Payment process completed successfully!')
      
    } catch (error: any) {
      console.error('[recordPayment] Payment recording error:', error)
      setIsRefreshing(false)
      
      // Close confirmation dialog on error (keep payment dialog open so user can retry)
      setPaymentConfirmOpen(false)
      
      // Show more specific error message
      if (error?.message?.includes('ERR_CONNECTION') || error?.message?.includes('Failed to fetch')) {
        setErrorMessage('خطأ في الاتصال بالخادم. يرجى التحقق من الاتصال بالإنترنت والمحاولة مرة أخرى.')
      } else if (error?.message) {
        setErrorMessage(error.message)
      } else if (error?.code) {
        setErrorMessage(`خطأ في تسجيل الدفع (${error.code})`)
      } else {
        setErrorMessage('خطأ في تسجيل الدفع. يرجى المحاولة مرة أخرى.')
      }
    }
  }

  // Helper function to check if installment is overdue
  // Only returns true if: due date passed AND there's actually an amount remaining
  const isInstallmentOverdue = (inst: InstallmentWithRelations): boolean => {
    if (inst.status === 'Paid') return false
    
    // Calculate remaining amount for this specific installment
    const remainingAmount = inst.amount_due + inst.stacked_amount - inst.amount_paid
    
    // If fully paid, not overdue
    if (remainingAmount <= 0.01) return false // Use small threshold for floating point
    
    const dueDate = new Date(inst.due_date)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)
    
    // Only overdue if date passed AND there's amount due
    return dueDate < now && remainingAmount > 0.01
  }
  
  // Helper function to get remaining amount for an installment (per-client calculation)
  const getRemainingAmount = (inst: InstallmentWithRelations): number => {
    return Math.max(0, inst.amount_due + inst.stacked_amount - inst.amount_paid)
  }

  // Helper function to get days until due or overdue
  const getDaysUntilDue = (inst: InstallmentWithRelations): number => {
    const dueDate = new Date(inst.due_date)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)
    return Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  // Filter installments - also check if overdue based on due date
  // For 'Paid' status: only show installments that still have remaining amount (partially paid)
  // IMPORTANT: Only show installments for CONFIRMED sales
  // A sale is confirmed if:
  // 1. status = 'Completed' OR
  // 2. company_fee_amount > 0 (commission was calculated and set) OR
  // 3. big_advance_confirmed = true (for BigAdvance specifically) OR
  // 4. is_confirmed = true
  // Filter out installments for reset sales (sales that have been reset back to confirmation page)
  // Reset sales have: status = 'Pending', big_advance_amount = 0, company_fee_amount = null
  const filteredInstallments = installments.filter((inst) => {
    const sale = inst.sale as any
    if (!sale) return false
    
    // Exclude installments for cancelled sales
    if (sale.status === 'Cancelled') return false
    
    // Always include Completed sales - they are confirmed
    if (sale.status === 'Completed') return true
    
    // Exclude installments for reset sales (sales that have been reset back to confirmation page)
    // These are sales that were confirmed but then reset, so they shouldn't show installments
    if (sale.status === 'Pending' && 
        sale.big_advance_amount === 0 && 
        !sale.company_fee_amount) {
      return false // Exclude installments for reset sales
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
  }).filter((inst) => {
    if (filterStatus === 'all') return true
    if (filterStatus === 'Late') {
      // Check if actually overdue: due date passed AND not fully paid
      return isInstallmentOverdue(inst)
    }
    if (filterStatus === 'Paid') {
      // Only show 'Paid' installments that still have remaining amount (partially paid)
      // Exclude fully paid installments
      const remaining = getRemainingAmount(inst)
      return inst.status === 'Paid' && remaining > 0.01
    }
    return inst.status === filterStatus
  })


  // Smart installment grouping - group consecutive installments with same amount and date pattern
  const groupInstallments = (installments: InstallmentWithRelations[]) => {
    if (installments.length === 0) return []
    
    const groups: Array<{
      type: 'single' | 'range'
      installments: InstallmentWithRelations[]
      startNumber?: number
      endNumber?: number
      amount?: number
      date?: string
    }> = []
    
    let currentGroup: InstallmentWithRelations[] = [installments[0]]
    
    for (let i = 1; i < installments.length; i++) {
      const prev = installments[i - 1]
      const curr = installments[i]
      
      const prevAmount = prev.amount_due + prev.stacked_amount - prev.amount_paid
      const currAmount = curr.amount_due + curr.stacked_amount - curr.amount_paid
      const prevDate = new Date(prev.due_date)
      const currDate = new Date(curr.due_date)
      
      // Check if same amount and consecutive dates (within 35 days - monthly pattern)
      const daysDiff = Math.abs((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24))
      const sameAmount = Math.abs(prevAmount - currAmount) < 0.01
      const consecutive = daysDiff <= 35 && curr.installment_number === prev.installment_number + 1
      
      if (sameAmount && consecutive) {
        currentGroup.push(curr)
      } else {
        // Save current group
        if (currentGroup.length > 3) {
          groups.push({
            type: 'range',
            installments: currentGroup,
            startNumber: currentGroup[0].installment_number,
            endNumber: currentGroup[currentGroup.length - 1].installment_number,
            amount: prevAmount,
            date: formatDate(currentGroup[0].due_date)
          })
        } else {
          currentGroup.forEach(inst => {
            groups.push({
              type: 'single',
              installments: [inst],
              amount: inst.amount_due + inst.stacked_amount - inst.amount_paid,
              date: formatDate(inst.due_date)
            })
          })
        }
        currentGroup = [curr]
      }
    }
    
    // Save last group
    if (currentGroup.length > 3) {
      const last = currentGroup[currentGroup.length - 1]
      groups.push({
        type: 'range',
        installments: currentGroup,
        startNumber: currentGroup[0].installment_number,
        endNumber: last.installment_number,
        amount: last.amount_due + last.stacked_amount - last.amount_paid,
        date: formatDate(currentGroup[0].due_date)
      })
    } else {
      currentGroup.forEach(inst => {
        groups.push({
          type: 'single',
          installments: [inst],
          amount: inst.amount_due + inst.stacked_amount - inst.amount_paid,
          date: formatDate(inst.due_date)
        })
      })
    }
    
    return groups
  }

  // Group installments by client
  const clientGroups = useMemo((): ClientInstallmentGroup[] => {
    const groups = new Map<string, ClientInstallmentGroup>()
    
    filteredInstallments.forEach(inst => {
      const clientId = inst.sale?.client_id || 'unknown'
      const clientName = inst.sale?.client?.name || 'عميل غير معروف'
      
      if (!groups.has(clientId)) {
        groups.set(clientId, {
          clientId,
          clientName,
          sales: [],
          totalDue: 0,
          totalPaid: 0,
          overdueCount: 0,
        })
      }
      
      const group = groups.get(clientId)!
      group.totalDue += inst.amount_due
      group.totalPaid += inst.amount_paid
      // Check if actually overdue based on due date
      if (isInstallmentOverdue(inst)) group.overdueCount++
      
      // Group by sale
      let saleGroup = group.sales.find(s => s.saleId === inst.sale_id)
      if (!saleGroup) {
        const sale = inst.sale
        const isConfirmed = (sale as any)?.is_confirmed || (sale as any)?.big_advance_confirmed || false
        // Get big advance amount from sale (التسبقة) - this is paid at confirmation
        const bigAdvanceAmount = (sale as any)?.big_advance_amount || 0
        saleGroup = {
          saleId: inst.sale_id,
          saleDate: sale?.sale_date || '',
          totalPrice: sale?.total_selling_price || 0,
          installments: [],
          totalDue: 0,
          totalPaid: bigAdvanceAmount, // Initialize with big advance amount
          nextDueDate: null,
          progress: 0,
          isConfirmed,
          landPieceCount: sale?.land_piece_ids?.length || 0,
        }
        group.sales.push(saleGroup)
        // Add big advance to group total (only once per sale)
        group.totalPaid += bigAdvanceAmount
      }
      
      saleGroup.installments.push(inst)
      saleGroup.totalDue += inst.amount_due
      saleGroup.totalPaid += inst.amount_paid
      
      // Find next due date
      if (inst.status !== 'Paid' && (!saleGroup.nextDueDate || inst.due_date < saleGroup.nextDueDate)) {
        saleGroup.nextDueDate = inst.due_date
      }
    })
    
    // Calculate progress for each sale
    groups.forEach(group => {
      group.sales.forEach(sale => {
        sale.progress = sale.totalDue > 0 ? (sale.totalPaid / sale.totalDue) * 100 : 0
        sale.installments.sort((a, b) => a.installment_number - b.installment_number)
      })
    })
    
    return Array.from(groups.values())
  }, [filteredInstallments, refreshKey]) // Add refreshKey to force recalculation
  
  // Create deals table data - one row per sale/deal
  // IMPROVED: Added refreshKey dependency to ensure recalculation after payment
  const dealsTableData = useMemo(() => {
    console.log('[dealsTableData] Recalculating deals table data, refreshKey:', refreshKey)
    const deals: Array<{
      saleId: string
      clientId: string
      clientName: string
      clientCin?: string
      saleDate: string
      deadlineDate?: string | null
      landPieces: string
      totalInstallments: number
      paidInstallments: number
      totalDue: number
      totalPaid: number
      totalUnpaid: number
      progress: number
      nextDueDate: string | null
      daysUntilDue: number
      isOverdue: boolean
      overdueAmount: number
      installments: InstallmentWithRelations[]
      contractEditor?: { type: string; name: string; place: string } | null
      createdByUser?: { id: string; name: string } | null
      confirmedByUser?: { id: string; name: string } | null
    }> = []
    
    clientGroups.forEach(group => {
      group.sales.forEach(sale => {
        // When filterStatus is 'Paid', only include installments with status 'Paid' that have remaining amounts
        let saleInstallments = sale.installments
        if (filterStatus === 'Paid') {
          saleInstallments = sale.installments.filter(i => {
            const remaining = getRemainingAmount(i)
            return i.status === 'Paid' && remaining > 0.01
          })
          // If no paid installments with remaining, skip this sale
          if (saleInstallments.length === 0) return
        }
        
        const unpaidInstallments = saleInstallments.filter(i => {
          const remaining = getRemainingAmount(i)
          return remaining > 0.01 && i.status !== 'Paid'
        })
        const nextInst = unpaidInstallments[0]
        
        // Skip fully paid deals - check if all installments are paid
        const allPaid = saleInstallments.every(i => {
          const remaining = getRemainingAmount(i)
          return remaining <= 0.01 || i.status === 'Paid'
        })
        if (allPaid) return // Skip fully paid deals
        
        const totalUnpaid = unpaidInstallments.reduce((sum, inst) => sum + getRemainingAmount(inst), 0)
        const daysUntilDue = nextInst ? getDaysUntilDue(nextInst) : 999
        const isOverdue = nextInst ? isInstallmentOverdue(nextInst) : false
        
        // Calculate overdue amount: sum only installments that are actually overdue (past due date)
        const overdueInstallments = sale.installments.filter(inst => {
          const remaining = getRemainingAmount(inst)
          return remaining > 0.01 && isInstallmentOverdue(inst)
        })
        const overdueAmount = overdueInstallments.reduce((sum, inst) => sum + getRemainingAmount(inst), 0)
        
        // Get land pieces
        const landPieces = (nextInst.sale as any)?._landPieces || []
        const pieceNumbers = landPieces.map((p: any) => p?.piece_number).filter(Boolean).join('، ')
        
        const deadlineDate = nextInst.sale?.deadline_date || null
        
        // Get contract editor from first installment's sale
        const contractEditor = sale.installments[0]?.sale?.contract_editor || null
        const createdByUser = sale.installments[0]?.sale?.created_by_user || null
        const confirmedByUser = sale.installments[0]?.sale?.confirmed_by_user || null
        
        deals.push({
          saleId: sale.saleId,
          clientId: group.clientId,
          clientName: group.clientName,
          clientCin: group.sales[0]?.installments[0]?.sale?.client?.cin,
          saleDate: sale.saleDate,
          deadlineDate,
          landPieces: pieceNumbers || '-',
          totalInstallments: sale.installments.length,
          paidInstallments: sale.installments.filter(i => getRemainingAmount(i) <= 0.01).length,
          totalDue: sale.totalDue,
          totalPaid: sale.totalPaid,
          totalUnpaid,
          progress: sale.progress,
          nextDueDate: sale.nextDueDate,
          daysUntilDue,
          isOverdue,
          overdueAmount,
          installments: saleInstallments,
          contractEditor, // Add contract editor to deal
          createdByUser,
          confirmedByUser
        })
      })
    })
    
    // Apply filters
    let filtered = deals
    
    // Status filter - ensure only deals with matching status installments are shown
    if (filterStatus !== 'all') {
      if (filterStatus === 'Paid') {
        // Only show deals that have at least one installment with status 'Paid' and remaining > 0.01
        filtered = filtered.filter(deal => {
          return deal.installments.some(inst => {
            const remaining = getRemainingAmount(inst)
            return inst.status === 'Paid' && remaining > 0.01
          })
        })
      } else if (filterStatus === 'Late') {
        // Only show deals that have overdue installments
        filtered = filtered.filter(deal => deal.isOverdue)
      } else {
        // For other statuses, filter by installment status
        filtered = filtered.filter(deal => {
          return deal.installments.some(inst => inst.status === filterStatus)
        })
      }
    }
    
    // Search filter
    if (debouncedSearchTerm.trim()) {
      const search = debouncedSearchTerm.toLowerCase().trim()
      filtered = filtered.filter(deal => 
        deal.clientName.toLowerCase().includes(search) ||
        deal.clientCin?.toLowerCase().includes(search) ||
        deal.landPieces.toLowerCase().includes(search)
      )
    }
    
    // Overdue filter
    if (filterOverdue) {
      filtered = filtered.filter(deal => deal.isOverdue)
    }
    
    // Due this month filter
    if (filterDueThisMonth) {
      const now = new Date()
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      filtered = filtered.filter(deal => {
        if (!deal.nextDueDate) return false
        const dueDate = new Date(deal.nextDueDate)
        return dueDate >= now && dueDate <= endOfMonth
      })
    }
    
    // Minimum remaining amount filter
    if (filterMinRemaining) {
      const minAmount = parseFloat(filterMinRemaining) || 0
      filtered = filtered.filter(deal => deal.totalUnpaid >= minAmount)
    }
    
    // Progress filter
    if (filterProgress !== 'all') {
      if (filterProgress === 'low') {
        filtered = filtered.filter(deal => deal.progress < 33)
      } else if (filterProgress === 'medium') {
        filtered = filtered.filter(deal => deal.progress >= 33 && deal.progress < 66)
      } else if (filterProgress === 'high') {
        filtered = filtered.filter(deal => deal.progress >= 66)
      }
    }
    
    // Default sorting: Overdue first, then closest due dates, then others
    filtered.sort((a, b) => {
      // Overdue deals first
      if (a.isOverdue && !b.isOverdue) return -1
      if (!a.isOverdue && b.isOverdue) return 1
      
      // If both overdue, sort by overdue amount (highest first)
      if (a.isOverdue && b.isOverdue) {
        return b.overdueAmount - a.overdueAmount
      }
      
      // Then by days until due (closest first)
      if (a.daysUntilDue !== b.daysUntilDue) {
        return a.daysUntilDue - b.daysUntilDue
      }
      
      // Finally by total unpaid (highest first)
      return b.totalUnpaid - a.totalUnpaid
    })
    
    return filtered
  }, [clientGroups, debouncedSearchTerm, filterOverdue, filterDueThisMonth, filterMinRemaining, filterProgress, filterStatus, refreshKey, getRemainingAmount])
  
  const openSaleDetails = async (deal: typeof dealsTableData[0]) => {
    // Get contract editor from deal or first installment's sale
    const contractEditor = deal.contractEditor || deal.installments[0]?.sale?.contract_editor || null
    const firstSale = deal.installments[0]?.sale as any
    
    // If sale has installments, it's confirmed - fetch fresh sale data to get confirmed_by
    let confirmedByUser = deal.confirmedByUser || firstSale?.confirmed_by_user || null
    let isConfirmed = firstSale?.confirmed_by !== null || 
                      firstSale?.is_confirmed === true || 
                      firstSale?.big_advance_confirmed === true ||
                      deal.installments.length > 0
    
    // If sale is confirmed (has installments) but confirmed_by_user is not loaded, fetch it
    if (isConfirmed && !confirmedByUser) {
      try {
        // Always fetch fresh sale data to get confirmed_by_user
        const { data: saleData, error: saleError } = await supabase
          .from('sales')
          .select('confirmed_by, confirmed_by_user:users!sales_confirmed_by_fkey(id, name)')
          .eq('id', deal.saleId)
          .single()
        
        if (saleError) {
          console.error('Error fetching sale data:', saleError)
        } else if (saleData) {
          const sale = saleData as any
          if (sale.confirmed_by_user) {
            confirmedByUser = sale.confirmed_by_user
          } else if (sale.confirmed_by) {
            // If confirmed_by exists but confirmed_by_user is null, fetch user directly
            const { data: userData, error: userError } = await supabase
              .from('users')
              .select('id, name')
              .eq('id', sale.confirmed_by)
              .single()
            
            if (userError) {
              console.error('Error fetching user data:', userError)
            } else if (userData) {
              confirmedByUser = { id: userData.id, name: userData.name }
            }
          }
        }
      } catch (err) {
        console.error('Error fetching confirmed_by user:', err)
      }
    }
    
    setSelectedSaleForDetails({
      saleId: deal.saleId,
      clientName: deal.clientName,
      clientCin: deal.clientCin,
      saleDate: deal.saleDate,
      deadlineDate: deal.deadlineDate,
      installments: deal.installments,
      totalDue: deal.totalDue,
      totalPaid: deal.totalPaid,
      totalUnpaid: deal.totalUnpaid,
      landPieces: deal.landPieces,
      contractEditor,
      createdByUser: deal.createdByUser || firstSale?.created_by_user || null,
      confirmedByUser,
      isConfirmed
    })
    setDetailsDrawerOpen(true)
  }

  // Find mergeable sales for the same client
  const findMergeableSales = () => {
    const groups = new Map<string, Array<typeof dealsTableData[0]>>()
    
    // Group sales by client
    dealsTableData.forEach(deal => {
      if (!groups.has(deal.clientId)) {
        groups.set(deal.clientId, [])
      }
      groups.get(deal.clientId)!.push(deal)
    })
    
    const mergeable: typeof mergeableGroups = []
    
    // Check each client group
    groups.forEach((sales, clientId) => {
      // Need at least 2 sales to merge
      if (sales.length < 2) return
      
      // Group sales by similar characteristics
      const salesByKey = new Map<string, typeof sales>()
      
      sales.forEach(sale => {
        // Get unpaid installments
        const unpaidInsts = sale.installments.filter(i => getRemainingAmount(i) > 0.01)
        if (unpaidInsts.length === 0) return
        
        // Calculate monthly amount (should be same for all installments)
        // Use average monthly amount to handle slight variations
        const monthlyAmounts = unpaidInsts.map(i => i.amount_due)
        const avgMonthlyAmount = monthlyAmounts.reduce((sum, amt) => sum + amt, 0) / monthlyAmounts.length
        const remainingCount = unpaidInsts.length
        
        // Create key: clientId + remainingCount + rounded monthlyAmount (more flexible)
        // Round to nearest 0.01 to handle floating point precision issues
        const roundedMonthlyAmount = Math.round(avgMonthlyAmount * 100) / 100
        const key = `${clientId}-${remainingCount}-${roundedMonthlyAmount.toFixed(2)}`
        
        if (!salesByKey.has(key)) {
          salesByKey.set(key, [])
        }
        salesByKey.get(key)!.push(sale)
      })
      
      // Check each group for mergeable sales
      salesByKey.forEach((groupSales, key) => {
        if (groupSales.length >= 2) {
          // Verify they have same remaining amount (within 1 DT tolerance for rounding)
          const firstUnpaid = groupSales[0].totalUnpaid
          const allSameRemaining = groupSales.every(s => 
            Math.abs(s.totalUnpaid - firstUnpaid) < 1.0
          )
          
          // Also verify same remaining installments count
          const firstRemainingCount = groupSales[0].installments.filter(i => getRemainingAmount(i) > 0.01).length
          const allSameRemainingCount = groupSales.every(s => {
            const count = s.installments.filter(i => getRemainingAmount(i) > 0.01).length
            return count === firstRemainingCount
          })
          
          if (allSameRemaining && allSameRemainingCount) {
            const firstSale = groupSales[0]
            const unpaidInsts = firstSale.installments.filter(i => getRemainingAmount(i) > 0.01)
            // Calculate average monthly amount
            const monthlyAmounts = unpaidInsts.map(i => i.amount_due)
            const monthlyAmount = monthlyAmounts.length > 0 
              ? Math.round((monthlyAmounts.reduce((sum, amt) => sum + amt, 0) / monthlyAmounts.length) * 100) / 100
              : 0
            
            mergeable.push({
              clientId: firstSale.clientId,
              clientName: firstSale.clientName,
              sales: groupSales.map(sale => {
                const landPieces = (sale.installments[0]?.sale as any)?._landPieces || []
                const pieceNumbers = landPieces.map((p: any) => p?.piece_number).filter(Boolean).join('، ')
                const saleData = sale.installments[0]?.sale as any
                
                return {
                  saleId: sale.saleId,
                  saleDate: sale.saleDate,
                  landPieces: pieceNumbers || '-',
                  totalUnpaid: sale.totalUnpaid,
                  remainingInstallments: sale.installments.filter(i => getRemainingAmount(i) > 0.01).length,
                  monthlyAmount,
                  selectedOfferId: saleData?.selected_offer_id
                }
              })
            })
          }
        }
      })
    })
    
    setMergeableGroups(mergeable)
    setMergeDialogOpen(true)
  }

  // Merge sales installments
  const mergeSalesInstallments = async (group: typeof mergeableGroups[0]) => {
    if (group.sales.length < 2) return
    
    setMergingSales(true)
    setErrorMessage(null)
    
    try {
      // Get all sales data
      const salesData = await Promise.all(
        group.sales.map(async (saleInfo) => {
          const { data: saleData } = await supabase
            .from('sales')
            .select('*, selected_offer:payment_offers!selected_offer_id(*)')
            .eq('id', saleInfo.saleId)
            .single()
          
          const { data: installmentsData } = await supabase
            .from('installments')
            .select('*')
            .eq('sale_id', saleInfo.saleId)
            .order('installment_number', { ascending: true })
          
          const { data: paymentsData } = await supabase
            .from('payments')
            .select('*')
            .eq('sale_id', saleInfo.saleId)
          
          return {
            sale: saleData,
            installments: installmentsData || [],
            payments: paymentsData || []
          }
        })
      )
      
      // Use first sale as the base sale to merge into
      const baseSale = salesData[0].sale
      const otherSales = salesData.slice(1)
      
      // Collect all piece IDs
      const allPieceIds = new Set<string>(baseSale.land_piece_ids || [])
      otherSales.forEach(({ sale }) => {
        (sale.land_piece_ids || []).forEach((id: string) => allPieceIds.add(id))
      })
      
      // Calculate totals
      const totalSellingPrice = salesData.reduce((sum, { sale }) => sum + (sale.total_selling_price || 0), 0)
      const totalPurchaseCost = salesData.reduce((sum, { sale }) => sum + (sale.total_purchase_cost || 0), 0)
      const totalProfitMargin = totalSellingPrice - totalPurchaseCost
      const totalSmallAdvance = salesData.reduce((sum, { sale }) => sum + (sale.small_advance_amount || 0), 0)
      const totalBigAdvance = salesData.reduce((sum, { sale }) => sum + (sale.big_advance_amount || 0), 0)
      const totalCompanyFee = salesData.reduce((sum, { sale }) => sum + (sale.company_fee_amount || 0), 0)
      
      // Get installment details from first sale
      const firstSaleInsts = salesData[0].installments.filter(i => {
        const remaining = i.amount_due + (i.stacked_amount || 0) - i.amount_paid
        return remaining > 0.01
      })
      
      if (firstSaleInsts.length === 0) {
        throw new Error('لا توجد أقساط متبقية للدمج')
      }
      
      const monthlyAmount = firstSaleInsts[0].amount_due
      const numberOfInstallments = firstSaleInsts.length
      const installmentStartDate = firstSaleInsts[0].due_date
      
      // Calculate end date
      const startDate = new Date(installmentStartDate)
      const endDate = new Date(startDate)
      endDate.setMonth(endDate.getMonth() + numberOfInstallments - 1)
      
      // Update base sale with merged data
      const { error: updateError } = await supabase
        .from('sales')
        .update({
          land_piece_ids: Array.from(allPieceIds),
          total_selling_price: totalSellingPrice,
          total_purchase_cost: totalPurchaseCost,
          profit_margin: totalProfitMargin,
          small_advance_amount: totalSmallAdvance,
          big_advance_amount: totalBigAdvance,
          company_fee_amount: totalCompanyFee,
          number_of_installments: numberOfInstallments,
          monthly_installment_amount: monthlyAmount,
          installment_start_date: installmentStartDate,
          installment_end_date: endDate.toISOString().split('T')[0],
        })
        .eq('id', baseSale.id)
      
      if (updateError) throw updateError
      
      // Transfer all payments from other sales to base sale
      for (const { payments } of otherSales) {
        for (const payment of payments) {
          const { error: paymentError } = await supabase
            .from('payments')
            .update({ sale_id: baseSale.id })
            .eq('id', payment.id)
          
          if (paymentError) {
            console.warn('Error transferring payment:', paymentError)
          }
        }
      }
      
      // Calculate total paid from installments BEFORE deleting them
      // This is the most accurate way to preserve payment information
      const totalPaidFromInstallments = salesData.reduce((sum, { installments }) => {
        return sum + installments.reduce((instSum, inst) => {
          return instSum + (inst.amount_paid || 0)
        }, 0)
      }, 0)
      
      // Delete ALL old installments from ALL sales (base + others) before creating new ones
      const allSaleIds = [baseSale.id, ...otherSales.map(({ sale }) => sale.id)]
      
      // Delete all installments with retry logic
      let allDeleted = false
      let deleteAttempts = 0
      const maxDeleteAttempts = 10
      
      while (!allDeleted && deleteAttempts < maxDeleteAttempts) {
        // Delete from all sales
        for (const saleId of allSaleIds) {
          await supabase
            .from('installments')
            .delete()
            .eq('sale_id', saleId)
        }
        
        // Wait for deletions to complete
        await new Promise(resolve => setTimeout(resolve, 1000 * (deleteAttempts + 1)))
        
        // Verify all installments are deleted
        const { data: remainingInstallments } = await supabase
          .from('installments')
          .select('id, sale_id')
          .in('sale_id', allSaleIds)
        
        if (!remainingInstallments || remainingInstallments.length === 0) {
          allDeleted = true
          break
        }
        
        // If still exists, try to delete by ID
        if (remainingInstallments.length > 0) {
          await supabase
            .from('installments')
            .delete()
            .in('id', remainingInstallments.map(i => i.id))
        }
        
        deleteAttempts++
      }
      
      if (!allDeleted) {
        throw new Error(`فشل في حذف الأقساط القديمة بعد ${maxDeleteAttempts} محاولات. يرجى استخدام SQL script لإصلاح المشكلة.`)
      }
      
      // Wait additional time to ensure database consistency
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Use the calculated total paid
      const totalPaid = totalPaidFromInstallments
      
      // Create new installments for merged sale
      const installmentsToCreate = []
      for (let i = 0; i < numberOfInstallments; i++) {
        const dueDate = new Date(startDate)
        dueDate.setMonth(dueDate.getMonth() + i)
        
        installmentsToCreate.push({
          sale_id: baseSale.id,
          installment_number: i + 1,
          amount_due: monthlyAmount,
          amount_paid: 0,
          stacked_amount: 0,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'Unpaid',
        })
      }
      
      // Distribute payments across installments
      let remainingPaid = totalPaid
      for (let i = 0; i < installmentsToCreate.length && remainingPaid > 0.01; i++) {
        const inst = installmentsToCreate[i]
        if (remainingPaid >= monthlyAmount) {
          inst.amount_paid = monthlyAmount
          inst.status = 'Paid'
          remainingPaid -= monthlyAmount
        } else {
          inst.amount_paid = remainingPaid
          inst.status = remainingPaid > 0.01 ? 'Partial' : 'Unpaid'
          remainingPaid = 0
        }
      }
      
      // Final verification - ensure NO installments exist for base sale
      const { data: finalCheck } = await supabase
        .from('installments')
        .select('id')
        .eq('sale_id', baseSale.id)
      
      if (finalCheck && finalCheck.length > 0) {
        // Force delete any remaining
        await supabase
          .from('installments')
          .delete()
          .in('id', finalCheck.map(i => i.id))
        
        await new Promise(resolve => setTimeout(resolve, 500))
      }
      
      // Now insert new installments - use optimized batch approach
      // Insert all at once, but if it fails, do one by one
      const { error: batchInsertError } = await supabase
        .from('installments')
        .insert(installmentsToCreate)
      
      if (batchInsertError) {
        // Batch insert failed, try one by one
        for (const installment of installmentsToCreate) {
          // Check if exists
          const { data: existing } = await supabase
            .from('installments')
            .select('id')
            .eq('sale_id', installment.sale_id)
            .eq('installment_number', installment.installment_number)
            .maybeSingle()
          
          if (existing) {
            // Update existing
            const { error: updateError } = await supabase
              .from('installments')
              .update({
                amount_due: installment.amount_due,
                amount_paid: installment.amount_paid,
                stacked_amount: installment.stacked_amount,
                due_date: installment.due_date,
                status: installment.status,
              })
              .eq('id', existing.id)
            
            if (updateError) {
              throw new Error(`فشل في تحديث القسط ${installment.installment_number}: ${updateError.message}`)
            }
          } else {
            // Insert new
            const { error: insertError } = await supabase
              .from('installments')
              .insert([installment])
            
            if (insertError) {
              // If duplicate, try update
              if (insertError.code === '23505' || insertError.message?.includes('duplicate')) {
                const { data: retryExisting } = await supabase
                  .from('installments')
                  .select('id')
                  .eq('sale_id', installment.sale_id)
                  .eq('installment_number', installment.installment_number)
                  .maybeSingle()
                
                if (retryExisting) {
                  const { error: retryUpdateError } = await supabase
                    .from('installments')
                    .update({
                      amount_due: installment.amount_due,
                      amount_paid: installment.amount_paid,
                      stacked_amount: installment.stacked_amount,
                      due_date: installment.due_date,
                      status: installment.status,
                    })
                    .eq('id', retryExisting.id)
                  
                  if (retryUpdateError) {
                    throw new Error(`فشل في إنشاء/تحديث القسط ${installment.installment_number}: ${retryUpdateError.message}`)
                  }
                } else {
                  throw new Error(`فشل في إنشاء القسط ${installment.installment_number}: ${insertError.message}`)
                }
              } else {
                throw new Error(`فشل في إنشاء القسط ${installment.installment_number}: ${insertError.message}`)
              }
            }
          }
        }
      }
      
      // Delete other sales
      for (const { sale } of otherSales) {
        await supabase
          .from('sales')
          .delete()
          .eq('id', sale.id)
      }
      
      // Update land pieces status
      const allPieceIdsArray = Array.from(allPieceIds)
      await supabase
        .from('land_pieces')
        .update({ status: 'Sold' })
        .in('id', allPieceIdsArray)
      
      setSuccessMessage(`تم دمج ${group.sales.length} صفقة بنجاح`)
      setMergeDialogOpen(false)
      setRefreshKey(prev => prev + 1)
      fetchInstallments()
      
      setTimeout(() => setSuccessMessage(null), 5000)
    } catch (error: any) {
      console.error('Error merging sales:', error)
      setErrorMessage(error?.message || 'حدث خطأ أثناء دمج الأقساط')
    } finally {
      setMergingSales(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">جاري تحميل الأقساط...</div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">الأقساط</h1>
        {hasPermission('manage_sales') && (
          <Button
            onClick={findMergeableSales}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Merge className="h-4 w-4" />
            دمج الأقساط
          </Button>
        )}
      </div>

      {/* Search and Advanced Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="text"
                placeholder="🔍 ابحث عن عميل أو رقم قطعة..."
                value={searchTerm}
                maxLength={255}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  debouncedSearchFn(e.target.value)
                }}
                className="flex-1"
              />
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Button
                variant={filterOverdue ? 'destructive' : 'outline'}
                size="sm"
                onClick={() => setFilterOverdue(!filterOverdue)}
              >
                {filterOverdue ? '✓ ' : ''}متأخر فقط
              </Button>
              <Button
                variant={filterDueThisMonth ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilterDueThisMonth(!filterDueThisMonth)}
              >
                {filterDueThisMonth ? '✓ ' : ''}مستحق هذا الشهر
              </Button>
              <div className="flex items-center gap-2">
                <Label htmlFor="minRemaining" className="text-sm whitespace-nowrap">الحد الأدنى:</Label>
                <Input
                  id="minRemaining"
                  type="number"
                  placeholder="0"
                  value={filterMinRemaining}
                  onChange={(e) => setFilterMinRemaining(e.target.value)}
                  className="w-24"
                />
              </div>
              <Select 
                value={filterProgress} 
                onChange={(e) => setFilterProgress(e.target.value)} 
                className="w-32"
              >
                <option value="all">كل التقدم</option>
                <option value="low">منخفض (&lt;33%)</option>
                <option value="medium">متوسط (33-66%)</option>
                <option value="high">عالي (&gt;66%)</option>
              </Select>
              {(filterOverdue || filterDueThisMonth || filterMinRemaining || filterProgress !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterOverdue(false)
                    setFilterDueThisMonth(false)
                    setFilterMinRemaining('')
                    setFilterProgress('all')
                  }}
                >
                  مسح الفلاتر
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mobile Card View / Desktop Table View */}
      {dealsTableData.length === 0 ? (
      <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground text-sm">لا توجد صفقات</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="space-y-3 md:hidden">
            {dealsTableData.map((deal) => {
              let statusIndicator = '🟢'
              let statusText = 'على المسار'
              let statusColor = 'text-green-600'
              let statusBg = 'bg-green-50 border-green-200'
              
              if (deal.isOverdue) {
                statusIndicator = '🔴'
                statusText = 'متأخر'
                statusColor = 'text-red-600'
                statusBg = 'bg-red-50 border-red-200'
              } else if (deal.daysUntilDue <= 7) {
                statusIndicator = '🟡'
                statusText = 'قريب الاستحقاق'
                statusColor = 'text-orange-600'
                statusBg = 'bg-orange-50 border-orange-200'
              }
              
              return (
                <Card 
                  key={deal.saleId}
                  className={`cursor-pointer hover:shadow-md transition-all ${statusBg} border-2`}
                  onClick={() => openSaleDetails(deal)}
                >
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm">{deal.clientName}</div>
                          {deal.clientCin && (
                            <div className="text-xs text-muted-foreground mt-0.5">{deal.clientCin}</div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">{formatDate(deal.saleDate)}</div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <span className="text-base">{statusIndicator}</span>
                          <span className={`text-xs font-medium ${statusColor}`}>{statusText}</span>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">القطع:</span>
                          <Badge variant="outline" className="text-xs ml-1">{deal.landPieces}</Badge>
                        </div>
                        <div>
                          <span className="text-muted-foreground">الأقساط:</span>
                          <span className="font-medium ml-1">{deal.paidInstallments}/{deal.totalInstallments}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">المدفوع:</span>
                          <span className="font-medium text-green-600 ml-1">{formatCurrency(deal.totalPaid)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">المتبقي:</span>
                          <span className="font-medium ml-1">{formatCurrency(deal.totalUnpaid)}</span>
                        </div>
                      </div>
                      
                      {deal.isOverdue && (
                        <div className="bg-red-100 border border-red-200 rounded p-2">
                          <div className="text-xs font-semibold text-red-700">
                            متأخر: {formatCurrency(deal.overdueAmount)}
                          </div>
                        </div>
                      )}
                      
                      {deal.nextDueDate && (
                        <div className="text-xs text-muted-foreground">
                          تاريخ الاستحقاق: {formatDate(deal.nextDueDate)}
                          {deal.daysUntilDue >= 0 && ` (${deal.daysUntilDue} يوم)`}
                        </div>
                      )}
                      
                      {hasPermission('record_payments') && deal.totalUnpaid > 0.01 && (
                        <Button
                          size="sm"
                          variant={deal.isOverdue ? 'destructive' : 'default'}
                          className="w-full text-xs h-8"
                          onClick={(e) => {
                            e.stopPropagation()
                            const nextInst = deal.installments.find(i => getRemainingAmount(i) > 0.01)
                            if (nextInst) {
                              openPaymentDialog(nextInst)
                            }
                          }}
                        >
                          دفع {formatCurrency(deal.totalUnpaid)}
                        </Button>
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
          <div className="overflow-x-auto">
                <Table className="min-w-full">
              <TableHeader>
                <TableRow className="bg-gray-50">
                      <TableHead className="font-semibold text-xs sm:text-sm whitespace-nowrap text-right">العميل</TableHead>
                      <TableHead className="font-semibold text-xs sm:text-sm whitespace-nowrap text-center">الصفقة</TableHead>
                      <TableHead className="font-semibold text-xs sm:text-sm whitespace-nowrap text-center">القطع</TableHead>
                      <TableHead className="font-semibold text-xs sm:text-sm whitespace-nowrap text-center">الأقساط</TableHead>
                      <TableHead className="font-semibold text-xs sm:text-sm whitespace-nowrap text-right">المدفوع</TableHead>
                      <TableHead className="font-semibold text-xs sm:text-sm whitespace-nowrap text-right">المتبقي</TableHead>
                      <TableHead className="font-semibold text-xs sm:text-sm whitespace-nowrap text-right">المتأخر</TableHead>
                      <TableHead className="font-semibold text-xs sm:text-sm whitespace-nowrap text-center">تاريخ الاستحقاق</TableHead>
                      <TableHead className="font-semibold text-xs sm:text-sm whitespace-nowrap text-center">الحالة</TableHead>
                      <TableHead className="font-semibold text-xs sm:text-sm whitespace-nowrap text-center">إجراء</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                    {dealsTableData.map((deal) => {
                    let statusIndicator = '🟢'
                    let statusText = 'على المسار'
                    let statusColor = 'text-green-600'
                    
                    if (deal.isOverdue) {
                      statusIndicator = '🔴'
                      statusText = 'متأخر'
                      statusColor = 'text-red-600'
                    } else if (deal.daysUntilDue <= 7) {
                      statusIndicator = '🟡'
                      statusText = 'قريب الاستحقاق'
                      statusColor = 'text-orange-600'
                    }
                    
                    return (
                      <TableRow 
                        key={deal.saleId}
                        className={`cursor-pointer hover:bg-blue-50/50 transition-colors ${
                          deal.isOverdue ? 'bg-red-50/30' : deal.daysUntilDue <= 7 ? 'bg-orange-50/20' : ''
                        }`}
                        onClick={() => openSaleDetails(deal)}
                      >
                        <TableCell className="text-right">
                          <div>
                              <div className="font-medium text-xs sm:text-sm">{deal.clientName}</div>
                            {deal.clientCin && (
                              <div className="text-xs text-muted-foreground">{deal.clientCin}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                            <div className="text-xs sm:text-sm">{formatDate(deal.saleDate)}</div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-xs">
                            {deal.landPieces}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                            <div className="text-xs sm:text-sm">
                            {deal.paidInstallments}/{deal.totalInstallments}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="text-xs sm:text-sm font-medium text-green-600">
                            {formatCurrency(deal.totalPaid)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                            <div className="text-xs sm:text-sm font-medium">
                            {formatCurrency(deal.totalUnpaid)}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {deal.isOverdue ? (
                              <div className="text-xs sm:text-sm font-semibold text-red-600">
                              {formatCurrency(deal.overdueAmount)}
                            </div>
                          ) : (
                              <div className="text-xs sm:text-sm text-muted-foreground">-</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {deal.nextDueDate ? (
                              <div className="text-xs sm:text-sm">
                              {formatDate(deal.nextDueDate)}
                              {deal.daysUntilDue >= 0 && (
                                <div className="text-xs text-muted-foreground">
                                  ({deal.daysUntilDue} يوم)
                                </div>
                              )}
                            </div>
                          ) : (
                              <div className="text-xs sm:text-sm text-muted-foreground">-</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center gap-1 justify-center">
                              <span className="text-xs">{statusIndicator}</span>
                              <span className={`text-xs sm:text-sm font-medium ${statusColor}`}>
                              {statusText}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          {hasPermission('record_payments') && deal.totalUnpaid > 0.01 && (
                            <Button
                              size="sm"
                              variant={deal.isOverdue ? 'destructive' : 'default'}
                                className="text-xs px-2 sm:px-4"
                              onClick={() => {
                                const nextInst = deal.installments.find(i => getRemainingAmount(i) > 0.01)
                                if (nextInst) {
                                  openPaymentDialog(nextInst)
                                }
                              }}
                            >
                              دفع
                            </Button>
                          )}
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

      {/* Old views removed - using table view only */}
      {/* Commented out old card-based views to avoid errors */}
      {false && false && (
        <div className="space-y-4">
          {clientGroups.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">لا توجد أقساط</CardContent>
            </Card>
          ) : (
            clientGroups.map(group => {
              // Get client CIN and total pieces count
              const clientCin = group.sales[0]?.installments[0]?.sale?.client?.cin || ''
              const totalPieces = group.sales.reduce((sum, s) => {
                return sum + (s.installments[0]?.sale?.land_piece_ids?.length || 0)
              }, 0)
              
              return (
                <Card key={group.clientId} className="overflow-hidden">
                <CardHeader 
                  className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b cursor-pointer hover:from-blue-100 hover:to-indigo-100 transition-colors"
                  onClick={() => {
                    // Old expansion logic - disabled
                    const newExpanded = new Set<string>()
                    if (newExpanded.has(group.clientId)) {
                      newExpanded.delete(group.clientId)
                    } else {
                      newExpanded.add(group.clientId)
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <button 
                          onClick={(e) => {
                            e.stopPropagation()
                            const firstInst = group.sales[0]?.installments[0]
                            if (firstInst?.sale?.client) {
                              openClientDetails(firstInst.sale.client)
                            }
                          }}
                          className="hover:underline text-primary font-semibold"
                        >
                          {group.clientName}
                        </button>
                        {clientCin && (
                          <span className="text-sm text-muted-foreground font-normal">
                            ({clientCin})
                          </span>
                        )}
                      </CardTitle>
                      <div className="text-sm text-muted-foreground mt-1">
                        {totalPieces} قطعة • {group.sales.length} صفقة • {group.sales.reduce((sum, s) => sum + s.installments.length, 0)} قسط
                        {group.overdueCount > 0 && (
                          <span className="text-red-600 font-semibold mr-2">
                            • {group.overdueCount} متأخر
                          </span>
                        )}
                      </div>
                    </div>
                    <button className="p-1 hover:bg-white/50 rounded transition-colors">
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    </button>
                  </div>
                </CardHeader>
                {false && (
                  <CardContent className="p-0">
                    {group.sales.map(sale => {
                    const unpaidInstallments = sale.installments.filter(i => getRemainingAmount(i) > 0.01)
                    const nextInst = unpaidInstallments[0] // First unpaid installment (with all stacked amounts)
                    if (!nextInst) return null
                    
                    // Calculate TOTAL unpaid amount for this sale (including all stacked amounts)
                    const totalUnpaidAmount = unpaidInstallments.reduce((sum, inst) => {
                      return sum + getRemainingAmount(inst)
                    }, 0)
                    
                    const daysLeft = getDaysUntilDue(nextInst)
                    const isOverdue = isInstallmentOverdue(nextInst)
                    const paidCount = sale.installments.filter(i => i.status === 'Paid' || getRemainingAmount(i) <= 0.01).length
                    const totalCount = sale.installments.length
                    
                    // Get land piece numbers
                    const landPieces = (nextInst.sale as any)?._landPieces || []
                    const pieceNumbers = landPieces.map((p: any) => p?.piece_number).filter(Boolean).join('، ')
                    
                    // Determine urgency level - show FULL amount due
                    let actionText = 'دفع'
                    let actionVariant: 'destructive' | 'default' | 'outline' = 'default'
                    
                    if (totalUnpaidAmount <= 0.01) {
                      actionText = 'مدفوع بالكامل'
                      actionVariant = 'outline'
                    } else if (isOverdue) {
                      actionText = `${formatCurrency(totalUnpaidAmount)} • متأخر ${Math.abs(daysLeft)} يوم`
                      actionVariant = 'destructive'
                    } else if (daysLeft <= 7) {
                      actionText = `${formatCurrency(totalUnpaidAmount)} • متبقي ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`
                      actionVariant = daysLeft <= 3 ? 'default' : 'outline'
                    } else {
                      actionText = `${formatCurrency(totalUnpaidAmount)} • متبقي ${daysLeft} يوم`
                      actionVariant = 'outline'
                    }
                    
                    return (
                      <div 
                        key={sale.saleId} 
                        className={`border-b last:border-b-0 p-4 hover:bg-gray-50/50 transition-colors ${
                          isOverdue && totalUnpaidAmount > 0.01 ? 'bg-red-50/30 border-red-200' : 
                          daysLeft <= 7 && daysLeft > 3 && totalUnpaidAmount > 0.01 ? 'bg-orange-50/20 border-orange-200' :
                          daysLeft <= 3 && totalUnpaidAmount > 0.01 ? 'bg-red-50/20 border-red-200' : ''
                        }`}
                      >
                        <div className="space-y-3">
                          {/* Header Row */}
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <button
                                  onClick={() => {}}
                                  className="p-1 hover:bg-gray-200 rounded transition-colors"
                                >
                                  <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                </button>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-semibold text-base">
                                      {formatDate(sale.saleDate)}
                                    </p>
                                    {pieceNumbers && (
                                      <Badge variant="outline" className="text-xs">
                                        القطع: {pieceNumbers}
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {totalCount} قسط • {paidCount} مدفوع • {unpaidInstallments.length} متبقي
                                  </p>
                                </div>
                              </div>
                              
                              {/* Progress Bar */}
                              <div className="mt-2">
                                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                  <span>التقدم: {paidCount}/{totalCount}</span>
                                  <span>{Math.round((paidCount / totalCount) * 100)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-green-500 h-2 rounded-full transition-all" 
                                    style={{ width: `${totalCount > 0 ? (paidCount / totalCount) * 100 : 0}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                            
                            {/* Amount Info */}
                            <div className="text-right space-y-1">
                              <div className="text-sm">
                                <span className="text-muted-foreground">المدفوع: </span>
                                <span className="text-green-600 font-bold">{formatCurrency(sale.totalPaid)}</span>
                              </div>
                              <div className="text-sm">
                                <span className="text-muted-foreground">الإجمالي: </span>
                                <span className="font-bold">{formatCurrency(sale.totalDue)}</span>
                              </div>
                              <div className="text-base font-bold text-primary border-t pt-1 mt-1">
                                <span className="text-muted-foreground text-sm">المتبقي: </span>
                                {formatCurrency(totalUnpaidAmount)}
                              </div>
                            </div>
                          </div>
                          
                          {/* Action Button */}
                          {hasPermission('record_payments') && totalUnpaidAmount > 0.01 && (
                            <div className="flex items-center justify-between pt-2 border-t">
                              <div className="text-sm text-muted-foreground">
                                {isOverdue ? (
                                  <span className="text-red-600 font-medium">⚠️ متأخر {Math.abs(daysLeft)} يوم</span>
                                ) : daysLeft <= 3 ? (
                                  <span className="text-orange-600 font-medium">⏳ متبقي {daysLeft} أيام</span>
                                ) : daysLeft <= 7 ? (
                                  <span className="text-yellow-600 font-medium">📅 متبقي {daysLeft} أيام</span>
                                ) : (
                                  <span className="text-muted-foreground">📅 {formatDate(nextInst.due_date)}</span>
                                )}
                              </div>
                              <Button 
                                size="sm" 
                                variant={actionVariant}
                                onClick={() => openPaymentDialog(nextInst)}
                                className={`${
                                  isOverdue ? 'bg-red-600 hover:bg-red-700 text-white' :
                                  daysLeft <= 7 && daysLeft > 3 ? 'bg-orange-500 hover:bg-orange-600 text-white' :
                                  daysLeft <= 3 ? 'bg-red-500 hover:bg-red-600 text-white' :
                                  ''
                                }`}
                              >
                                {actionText}
                              </Button>
                            </div>
                          )}
                        </div>
                         {false && (
                          <div className="overflow-x-auto mt-3 -mx-4 sm:mx-0 px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                            {(() => {
                              const grouped = groupInstallments(sale.installments)
                              return (
                                <div className="space-y-2">
                                  {grouped.map((group, idx) => {
                                    if (group.type === 'range') {
                                      const firstInst = group.installments[0]
                                      const lastInst = group.installments[group.installments.length - 1]
                                      const instDaysLeft = getDaysUntilDue(firstInst)
                                      const instIsOverdue = isInstallmentOverdue(firstInst)
                                      const totalGroupAmount = group.amount! * group.installments.length
                                      const totalGroupPaid = group.installments.reduce((sum, inst) => sum + inst.amount_paid, 0)
                                      const totalGroupRemaining = totalGroupAmount - totalGroupPaid
                                      
                                      // Get land piece numbers
                                      const landPieces = (firstInst.sale as any)?._landPieces || []
                                      const pieceNumbers = landPieces.map((p: any) => p?.piece_number).filter(Boolean).join('، ')
                                      
                                      return (
                                        <div key={idx} className={`p-4 rounded-lg border shadow-sm ${
                                          instIsOverdue && totalGroupRemaining > 0.01 ? 'bg-red-50/50 border-red-300' : 
                                          totalGroupRemaining <= 0.01 ? 'bg-green-50/50 border-green-300' :
                                          'bg-white border-gray-200'
                                        }`}>
                                          <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                              <div className="flex items-center gap-2">
                                                <p className="font-semibold text-sm">
                                                  أقساط #{group.startNumber} - #{group.endNumber}
                                                </p>
                                                <Badge variant="outline" className="text-xs">
                                                  {group.installments.length} قسط
                                                </Badge>
                                                {pieceNumbers && (
                                                  <Badge variant="secondary" className="text-xs">
                                                    القطع: {pieceNumbers}
                                                  </Badge>
                                                )}
                                              </div>
                                              <Badge 
                                                variant={instIsOverdue && totalGroupRemaining > 0.01 ? 'destructive' : 
                                                        totalGroupRemaining <= 0.01 ? 'success' : 'secondary'} 
                                                className="text-xs"
                                              >
                                                {instIsOverdue && totalGroupRemaining > 0.01 ? 'متأخر' : 
                                                 totalGroupRemaining <= 0.01 ? 'مدفوع' : 'مستحق'}
                                              </Badge>
                                            </div>
                                            <div className="flex items-center justify-between text-sm">
                                              <span className="text-muted-foreground">
                                                {formatCurrency(group.amount!)} × {group.installments.length}
                                              </span>
                                              <span className="font-bold text-primary">
                                                {formatCurrency(totalGroupAmount)}
                                              </span>
                                            </div>
                                            {totalGroupRemaining > 0.01 && (
                                              <div className="flex items-center justify-between text-xs pt-1 border-t">
                                                <span className="text-muted-foreground">المتبقي:</span>
                                                <span className="font-semibold text-red-600">
                                                  {formatCurrency(totalGroupRemaining)}
                                                </span>
                                              </div>
                                            )}
                                            <p className="text-xs text-muted-foreground">
                                              {formatDate(firstInst.due_date)} → {formatDate(lastInst.due_date)}
                                            </p>
                                          </div>
                                        </div>
                                      )
                                    } else {
                                      const inst = group.installments[0]
                                      const instDaysLeft = getDaysUntilDue(inst)
                                      const instIsOverdue = isInstallmentOverdue(inst)
                                      const instRemainingAmount = getRemainingAmount(inst)
                                      
                                      let instActionText = 'دفع'
                                      let instActionVariant: 'destructive' | 'default' | 'outline' = 'default'
                                      
                                      // Only show action if there's actually an amount due
                                      if (instRemainingAmount <= 0.01) {
                                        instActionText = 'مدفوع'
                                        instActionVariant = 'outline'
                                      } else if (instIsOverdue) {
                                        instActionText = `دفع (متأخر ${Math.abs(instDaysLeft)} يوم)`
                                        instActionVariant = 'destructive'
                                      } else if (instDaysLeft <= 3) {
                                        instActionText = instDaysLeft === 0 ? 'دفع (مستحق اليوم)' : `دفع (متبقي ${instDaysLeft} يوم)`
                                        instActionVariant = 'default'
                                      } else if (instDaysLeft <= 7) {
                                        instActionText = `دفع (متبقي ${instDaysLeft} أيام)`
                                        instActionVariant = 'outline'
                                      }
                                      
                                      // Get land piece numbers for this sale
                                      const landPieces = (inst.sale as any)?._landPieces || []
                                      const pieceNumbers = landPieces.map((p: any) => p?.piece_number).filter(Boolean).join('، ')
                                      
                                      return (
                                        <div key={idx} className={`p-4 rounded-lg border shadow-sm ${
                                          instIsOverdue ? 'bg-red-50/50 border-red-300' : 
                                          instDaysLeft <= 3 ? 'bg-yellow-50/50 border-yellow-300' : 
                                          'bg-white border-gray-200'
                                        }`}>
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1">
                                              <div className="flex items-center gap-2 mb-1">
                                                <p className="font-semibold text-sm">
                                                  قسط #{inst.installment_number}
                                                </p>
                                                {pieceNumbers && (
                                                  <Badge variant="outline" className="text-xs">
                                                    القطع: {pieceNumbers}
                                                  </Badge>
                                                )}
                                              </div>
                                              <p className="text-lg font-bold text-primary mb-1">{formatCurrency(instRemainingAmount)}</p>
                                              <p className="text-xs text-muted-foreground">
                                                {formatDate(inst.due_date)}
                                              </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Badge 
                                                variant={instIsOverdue ? 'destructive' : statusColors[inst.status]} 
                                                className="text-xs"
                                              >
                                                {inst.status === 'Paid' || getRemainingAmount(inst) <= 0.01 ? 'مدفوع' :
                                                 instIsOverdue && getRemainingAmount(inst) > 0.01 ? 'متأخر' :
                                                 inst.status === 'Late' && getRemainingAmount(inst) > 0.01 ? 'متأخر' :
                                                 inst.status === 'Partial' ? 'جزئي' : 'غير مدفوع'}
                                              </Badge>
                                              {hasPermission('record_payments') && inst.status !== 'Paid' && (
                                                <Button 
                                                  size="sm" 
                                                  variant={instActionVariant}
                                                  onClick={() => openPaymentDialog(inst)}
                                                  className={`${
                                                    instIsOverdue ? 'bg-red-600 hover:bg-red-700 text-white' :
                                                    instDaysLeft <= 3 ? 'bg-orange-500 hover:bg-orange-600 text-white' :
                                                    ''
                                                  }`}
                                                >
                                                  {instActionText}
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    }
                                  })}
                                </div>
                              )
                            })()}
                          </div>
                        )}
                         {false && sale.installments.length > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground text-center">
                            اضغط على السهم لعرض {sale.installments.length} قسط
                          </div>
                        )}
                      </div>
                    )
                  })}
                </CardContent>
                )}
                </Card>
              )
            })
          )}
        </div>
      )}

      {/* Old views removed - using table view only */}
      {false && false && (() => {
        // Group installments by client, then by sale
        const groupedByClient = new Map<string, {
          clientId: string
          clientName: string
          sales: Map<string, {
            saleId: string
            saleDate: string
            installments: InstallmentWithRelations[]
            isConfirmed?: boolean
            landPieceCount?: number
          }>
          overdueCount?: number
        }>()
        
        // Filter out fully paid installments (but keep partially paid if they still have amount due)
        let filtered = filteredInstallments.filter(i => {
          const remaining = i.amount_due + i.stacked_amount - i.amount_paid
          return remaining > 0.01 // Only show if there's actually an amount due
        })
        
        // Filter by search term
        if (debouncedSearchTerm.trim()) {
          const search = debouncedSearchTerm.toLowerCase().trim()
          filtered = filtered.filter(inst => 
            inst.sale?.client?.name?.toLowerCase().includes(search)
          )
        }
        
        filtered.forEach(inst => {
            const clientId = inst.sale?.client_id || 'unknown'
            const clientName = inst.sale?.client?.name || 'غير معروف'
            const saleId = inst.sale_id
            
            if (!groupedByClient.has(clientId)) {
              groupedByClient.set(clientId, {
                clientId,
                clientName,
                sales: new Map(),
                overdueCount: 0
              })
            }
            
            const clientGroup = groupedByClient.get(clientId)!
            if (!clientGroup.sales.has(saleId)) {
              const sale = inst.sale
              const isConfirmed = (sale as any)?.is_confirmed || (sale as any)?.big_advance_confirmed || false
              clientGroup.sales.set(saleId, {
                saleId,
                saleDate: sale?.sale_date || '',
                installments: [],
                isConfirmed,
                landPieceCount: sale?.land_piece_ids?.length || 0,
              })
            }
            
            clientGroup.sales.get(saleId)!.installments.push(inst)
            
            // Count overdue installments
            if (isInstallmentOverdue(inst)) {
              clientGroup.overdueCount = (clientGroup.overdueCount || 0) + 1
            }
          })
        
        // Sort installments within each sale by due date
        groupedByClient.forEach(clientGroup => {
          clientGroup.sales.forEach(sale => {
            sale.installments.sort((a, b) => {
              const dateA = new Date(a.due_date).getTime()
              const dateB = new Date(b.due_date).getTime()
              return dateA - dateB
            })
          })
        })
        
        return (
          <div className="space-y-4">
            {groupedByClient.size === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  لا توجد أقساط مستحقة
                </CardContent>
              </Card>
            ) : (
              Array.from(groupedByClient.values()).map(clientGroup => (
                <Card key={clientGroup.clientId} className="overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
                    <CardTitle className="text-lg">
                      <button 
                        onClick={() => {
                          const firstInst = Array.from(clientGroup.sales.values())[0]?.installments[0]
                          if (firstInst?.sale?.client) {
                            openClientDetails(firstInst.sale.client)
                          }
                        }}
                        className="hover:underline text-primary font-semibold"
                      >
                        {clientGroup.clientName}
                      </button>
                      {(() => {
                        const firstInst = Array.from(clientGroup.sales.values())[0]?.installments[0]
                        const clientCin = firstInst?.sale?.client?.cin
                        return clientCin ? (
                          <span className="text-sm text-muted-foreground font-normal mr-2">
                            ({clientCin})
                          </span>
                        ) : null
                      })()}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground mt-1">
                      {(() => {
                        const totalPieces = Array.from(clientGroup.sales.values()).reduce((sum, sale) => {
                          return sum + (sale.landPieceCount || 0)
                        }, 0)
                        const totalInstallments = Array.from(clientGroup.sales.values()).reduce((sum, s) => sum + s.installments.length, 0)
                        const overdueCount = clientGroup.overdueCount || 0
                        return (
                          <>
                            {totalPieces} قطعة • {clientGroup.sales.size} صفقة • {totalInstallments} قسط
                            {overdueCount > 0 && (
                              <span className="text-red-600 font-semibold mr-2">
                                • {overdueCount} متأخر
                              </span>
                            )}
                          </>
                        )
                      })()}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    {Array.from(clientGroup.sales.values()).map(sale => {
                      const nextInst = sale.installments[0] // First unpaid installment
                      if (!nextInst) return null
                      
                      const daysLeft = getDaysUntilDue(nextInst)
                      const isOverdue = isInstallmentOverdue(nextInst)
                      const remainingAmount = getRemainingAmount(nextInst)
                      
                      // Determine urgency level - only show if there's actually an amount due
                      let actionText = 'دفع'
                      let actionVariant: 'destructive' | 'default' | 'outline' = 'default'
                      
                      if (remainingAmount <= 0.01) {
                        actionText = 'مدفوع'
                        actionVariant = 'outline'
                      } else if (isOverdue) {
                        actionText = `${formatCurrency(remainingAmount)} • متأخر ${Math.abs(daysLeft)} يوم`
                        actionVariant = 'destructive'
                      } else if (daysLeft <= 7) {
                        actionText = `${formatCurrency(remainingAmount)} • متبقي ${daysLeft} ${daysLeft === 1 ? 'يوم' : 'أيام'}`
                        actionVariant = daysLeft <= 3 ? 'default' : 'outline'
                      } else {
                        actionText = `${formatCurrency(remainingAmount)} • متبقي ${daysLeft} يوم`
                        actionVariant = 'outline'
                      }
                      
                      return (
                        <div 
                          key={sale.saleId} 
                          className={`border-b last:border-b-0 p-4 ${
                            isOverdue ? 'bg-red-50/30' : daysLeft <= 3 ? 'bg-yellow-50/20' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {}}
                                className="p-1 hover:bg-gray-100 rounded transition-colors"
                              >
                                 {false ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                              <div>
                                <p className="font-medium text-sm text-muted-foreground">
                                  تاريخ البيع: {formatDate(sale.saleDate)}
                                </p>
                                <div className="text-xs text-muted-foreground">
                                  {sale.landPieceCount || 0} قطعة • {sale.installments.length} قسط مستحق
                                  {!sale.isConfirmed && (
                                    <Badge variant="outline" className="text-xs mr-2">محجوز</Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                            {hasPermission('record_payments') && remainingAmount > 0.01 && (
                              <Button 
                                size="sm" 
                                variant={actionVariant}
                                onClick={() => openPaymentDialog(nextInst)}
                                className={`${
                                  isOverdue ? 'bg-red-700 hover:bg-red-800 text-white' :
                                  daysLeft <= 7 && daysLeft > 3 ? 'bg-orange-500 hover:bg-orange-600 text-white' :
                                  daysLeft <= 3 ? 'bg-red-500 hover:bg-red-600 text-white' :
                                  ''
                                }`}
                              >
                                {actionText}
                              </Button>
                            )}
                          </div>
                          {false && (
                            <div className="overflow-x-auto mt-3 -mx-4 sm:mx-0 px-4 sm:px-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                              {(() => {
                                const grouped = groupInstallments(sale.installments)
                                return (
                                  <div className="space-y-2">
                                    {grouped.map((group, idx) => {
                                      if (group.type === 'range') {
                                        const firstInst = group.installments[0]
                                        const lastInst = group.installments[group.installments.length - 1]
                                        const instDaysLeft = getDaysUntilDue(firstInst)
                                        const instIsOverdue = isInstallmentOverdue(firstInst)
                                        
                                        return (
                                          <div key={idx} className="bg-gray-50 p-3 rounded-lg border">
                                            <div className="flex items-center justify-between">
                                              <div>
                                                <p className="font-medium text-sm">
                                                  أقساط #{group.startNumber} - #{group.endNumber} ({group.installments.length} قسط)
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                  {formatCurrency(group.amount!)} × {group.installments.length} = {formatCurrency(group.amount! * group.installments.length)}
                                                </p>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                  من {formatDate(firstInst.due_date)} إلى {formatDate(lastInst.due_date)}
                                                </p>
                                              </div>
                                              <div className="text-right">
                                                <Badge 
                                                  variant={instIsOverdue ? 'destructive' : 'secondary'} 
                                                  className="text-xs"
                                                >
                                                {instIsOverdue && getRemainingAmount(firstInst) > 0.01 ? 'متأخر' : 
                                                 getRemainingAmount(firstInst) <= 0.01 ? 'مدفوع' : 'مستحق'}
                                                </Badge>
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      } else {
                                        const inst = group.installments[0]
                                        const instDaysLeft = getDaysUntilDue(inst)
                                        const instIsOverdue = isInstallmentOverdue(inst)
                                        const instRemainingAmount = inst.amount_due + inst.stacked_amount - inst.amount_paid
                                        
                                        let instActionText = 'دفع'
                                        let instActionVariant: 'destructive' | 'default' | 'outline' = 'default'
                                        
                                        if (instRemainingAmount <= 0.01) {
                                          instActionText = 'مدفوع'
                                          instActionVariant = 'outline'
                                        } else if (instIsOverdue) {
                                          instActionText = `${formatCurrency(instRemainingAmount)} • متأخر ${Math.abs(instDaysLeft)} يوم`
                                          instActionVariant = 'destructive'
                                        } else if (instDaysLeft <= 7) {
                                          instActionText = `${formatCurrency(instRemainingAmount)} • متبقي ${instDaysLeft} ${instDaysLeft === 1 ? 'يوم' : 'أيام'}`
                                          instActionVariant = instDaysLeft <= 3 ? 'default' : 'outline'
                                        } else {
                                          instActionText = `${formatCurrency(instRemainingAmount)} • متبقي ${instDaysLeft} يوم`
                                          instActionVariant = 'outline'
                                        }
                                        
                                        return (
                                          <div key={idx} className={`p-3 rounded-lg border ${
                                            instIsOverdue ? 'bg-red-50/50 border-red-300' : 
                                            instDaysLeft <= 7 && instDaysLeft > 3 ? 'bg-orange-50/30 border-orange-200' :
                                            instDaysLeft <= 3 ? 'bg-red-50/30 border-red-200' : 
                                            'bg-gray-50'
                                          }`}>
                                            <div className="flex items-center justify-between">
                                              <div>
                                                <p className="font-medium text-sm">
                                                  قسط #{inst.installment_number}
                                                </p>
                                                <p className="text-sm font-bold">{formatCurrency(instRemainingAmount)}</p>
                                                <p className="text-xs text-muted-foreground">
                                                  {formatDate(inst.due_date)}
                                                </p>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <Badge 
                                                  variant={instIsOverdue ? 'destructive' : statusColors[inst.status]} 
                                                  className="text-xs"
                                                >
                                                  {inst.status === 'Paid' ? 'مدفوع' :
                                                   instIsOverdue ? 'متأخر' :
                                                   inst.status === 'Late' ? 'متأخر' :
                                                   inst.status === 'Partial' ? 'جزئي' : 'غير مدفوع'}
                                                </Badge>
                                                {hasPermission('record_payments') && instRemainingAmount > 0.01 && (
                                                  <Button 
                                                    size="sm" 
                                                    variant={instActionVariant}
                                                    onClick={() => openPaymentDialog(inst)}
                                                    className={`${
                                                      instIsOverdue ? 'bg-red-700 hover:bg-red-800 text-white' :
                                                      instDaysLeft <= 7 && instDaysLeft > 3 ? 'bg-orange-500 hover:bg-orange-600 text-white' :
                                                      instDaysLeft <= 3 ? 'bg-red-500 hover:bg-red-600 text-white' :
                                                      ''
                                                    }`}
                                                  >
                                                    {instActionText}
                                                  </Button>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        )
                                      }
                                    })}
                                  </div>
                                )
                              })()}
                            </div>
                          )}
                          {false && sale.installments.length > 0 && (
                            <div className="mt-2 text-xs text-muted-foreground text-center">
                              اضغط على السهم لعرض {sale.installments.length} قسط
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        )
      })()}

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تسجيل دفعة</DialogTitle>
          </DialogHeader>
          {selectedInstallment && (
            <div className="space-y-3 sm:space-y-4">
              {(() => {
                // Calculate total unpaid amount for the entire sale
                const unpaid = getUnpaidInstallmentsForSale(selectedInstallment.sale_id)
                const totalUnpaidAmount = unpaid.reduce((sum, inst) => {
                  return sum + getRemainingAmount(inst)
                }, 0)
                
                // Get all installments for this sale to calculate actual paid amount
                const allSaleInstallments = installments.filter(i => i.sale_id === selectedInstallment.sale_id)
                const actualTotalPaid = allSaleInstallments.reduce((sum, inst) => {
                  return sum + (inst.amount_paid || 0)
                }, 0)
                
                // Get sale totals
                const saleTotalDue = selectedInstallment.sale?.total_selling_price || 0
                
                // Check if this is an installment sale or full payment sale
                const isInstallmentSale = selectedInstallment.sale?.payment_type !== 'Full'
                
                // Round amounts to avoid floating point precision issues
                const roundedUnpaid = Math.round(totalUnpaidAmount * 100) / 100
                const roundedPaid = Math.round(actualTotalPaid * 100) / 100
                const roundedTotal = Math.round(saleTotalDue * 100) / 100
                
                return (
                  <>
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 sm:p-4 rounded-lg border">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
                        <div>
                          <p className="text-muted-foreground mb-1">العميل</p>
                          <p className="font-semibold text-sm sm:text-base">
                            {selectedInstallment.sale?.client?.name}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground mb-1">رقم القسط</p>
                          <p className="font-semibold text-sm sm:text-base">#{selectedInstallment.installment_number}</p>
                        </div>
                        {isInstallmentSale && (
                          <div className="sm:col-span-2">
                            <Badge variant="secondary" className="text-xs">
                              {selectedInstallment.sale?.payment_type === 'Installment' ? 'بالتقسيط' : 'بالحاضر'}
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2 sm:space-y-3">
                      <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg text-xs sm:text-sm">
                        <span className="text-muted-foreground">المدفوع:</span>
                        <span className="font-bold text-green-600">{formatCurrency(roundedPaid)}</span>
                      </div>
                      <div className="flex justify-between items-center p-2 sm:p-3 bg-gray-50 rounded-lg text-xs sm:text-sm">
                        <span className="text-muted-foreground">الإجمالي:</span>
                        <span className="font-bold">{formatCurrency(roundedTotal)}</span>
                      </div>
                      {!isInstallmentSale && (
                        // Only show "المتبقي" for full payment sales
                        <div className="flex justify-between items-center p-2 sm:p-3 bg-primary/10 rounded-lg border-2 border-primary text-xs sm:text-sm">
                          <span className="text-muted-foreground font-medium">المتبقي:</span>
                          <span className="font-bold text-sm sm:text-lg text-primary">{formatCurrency(roundedUnpaid)}</span>
                        </div>
                      )}
                    </div>

                    {/* Multi-month payment selector - Only for installment sales */}
                    {isInstallmentSale && (() => {
                      // Pre-calculate all month totals once - use getRemainingAmount to include stacked amounts
                      const monthTotals: number[] = []
                      for (let i = 0; i < unpaid.length; i++) {
                        const prevTotal = i > 0 ? monthTotals[i - 1] : 0
                        const remaining = getRemainingAmount(unpaid[i])
                        // Round to avoid floating point issues
                        const roundedRemaining = Math.round(remaining * 100) / 100
                        monthTotals.push(Math.round((prevTotal + roundedRemaining) * 100) / 100)
                      }
                      
                      // Find overdue installments count
                      const overdueInstallments = unpaid.filter(inst => isInstallmentOverdue(inst))
                      const overdueCount = overdueInstallments.length
                      
                      // Calculate total amount for selected months
                      const totalAmount = monthTotals[monthsToPayCount - 1] || 0
                      
                      return (
                        <div className="space-y-2 bg-blue-50 p-2 sm:p-3 rounded-md border border-blue-200">
                          <Label className="font-semibold text-xs sm:text-sm">دفع عدة أشهر معاً</Label>
                          {overdueCount > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded p-2 mb-2">
                              <p className="text-xs text-red-700 font-medium">
                                ⚠️ يوجد {overdueCount} قسط متأخر - تم تحديدها تلقائياً
                              </p>
                            </div>
                          )}
                          <Select
                            value={String(monthsToPayCount)}
                            onChange={(e) => {
                              const count = parseInt(e.target.value)
                              setMonthsToPayCount(count)
                              const amount = monthTotals[count - 1] || 0
                              setPaymentAmount(String(Math.round(amount * 100) / 100))
                            }}
                            className="text-xs sm:text-sm"
                          >
                            {unpaid.map((inst, idx) => {
                              const amount = monthTotals[idx] || Math.round(getRemainingAmount(inst) * 100) / 100
                              const isOverdue = isInstallmentOverdue(inst)
                              return (
                                <option key={idx + 1} value={idx + 1}>
                                  {idx + 1} شهر ({formatCurrency(amount)}) {isOverdue ? '⚠️ متأخر' : ''}
                                </option>
                              )
                            })}
                          </Select>
                          <p className="text-xs text-blue-600">
                            الأقساط: {unpaid.slice(0, monthsToPayCount).map(i => `#${i.installment_number}`).join('، ')}
                          </p>
                          <p className="text-xs sm:text-sm font-bold text-blue-800 mt-2">
                            المبلغ الإجمالي: {formatCurrency(Math.round(totalAmount * 100) / 100)}
                          </p>
                        </div>
                      )
                    })()}

                    <div className="space-y-2">
                      <Label htmlFor="paymentAmount" className="text-xs sm:text-sm">المبلغ *</Label>
                      <Input
                        id="paymentAmount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={paymentAmount}
                        onChange={(e) => {
                          const value = e.target.value
                          // Allow empty string for user input
                          if (value === '') {
                            setPaymentAmount('')
                            return
                          }
                          const numValue = parseFloat(value)
                          if (!isNaN(numValue) && numValue >= 0) {
                            // Round to 2 decimal places
                            const rounded = Math.round(numValue * 100) / 100
                            setPaymentAmount(String(rounded))
                          }
                        }}
                        placeholder="أدخل المبلغ"
                        className="text-base sm:text-lg font-semibold"
                      />
                      {isInstallmentSale ? (
                        <p className="text-xs text-muted-foreground">
                          المبلغ المحدد: {formatCurrency(Math.round((parseFloat(paymentAmount) || 0) * 100) / 100)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          المبلغ المطلوب: {formatCurrency(Math.round(roundedUnpaid * 100) / 100)}
                        </p>
                      )}
                    </div>

                    <p className="text-xs sm:text-sm text-muted-foreground">
                      المتبقي بعد الدفع:{' '}
                      <span className="font-medium">
                        {formatCurrency(
                          Math.max(
                            0,
                            Math.round((roundedUnpaid - (parseFloat(paymentAmount) || 0)) * 100) / 100
                          )
                        )}
                      </span>
                    </p>
                  </>
                )
              })()}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button onClick={() => setPaymentConfirmOpen(true)} className="w-full sm:w-auto">تسجيل الدفعة</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Confirmation Dialog */}
      <ConfirmDialog
        open={paymentConfirmOpen}
        onOpenChange={setPaymentConfirmOpen}
        onConfirm={recordPayment}
        title="تأكيد تسجيل الدفعة"
        description={selectedInstallment ? `هل أنت متأكد من تسجيل دفعة بقيمة ${formatCurrency(parseFloat(paymentAmount) || 0)}؟` : ''}
        confirmText="نعم، تسجيل"
        cancelText="إلغاء"
      />

      {/* Merge Installments Dialog */}
      <Dialog open={mergeDialogOpen} onOpenChange={setMergeDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-3xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>دمج الأقساط</DialogTitle>
          </DialogHeader>
          {mergeableGroups.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-muted-foreground">لا توجد صفقات قابلة للدمج</p>
              <p className="text-sm text-muted-foreground mt-2">
                يجب أن تكون الصفقات لنفس العميل مع نفس المتبقي ونفس عدد الأقساط المتبقية ونفس العرض
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {mergeableGroups.map((group, groupIdx) => (
                <Card key={groupIdx} className="border-2">
                  <CardHeader>
                    <CardTitle className="text-lg">{group.clientName}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {group.sales.length} صفقة قابلة للدمج
                    </p>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {group.sales.map((sale, saleIdx) => (
                        <div key={saleIdx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div className="flex-1">
                            <p className="font-medium">تاريخ: {formatDate(sale.saleDate)}</p>
                            <p className="text-sm text-muted-foreground">القطع: {sale.landPieces}</p>
                            <p className="text-sm text-muted-foreground">
                              المتبقي: {formatCurrency(sale.totalUnpaid)} • {sale.remainingInstallments} قسط متبقي
                            </p>
                          </div>
                        </div>
                      ))}
                      <div className="pt-3 border-t">
                        <Button
                          onClick={() => mergeSalesInstallments(group)}
                          disabled={mergingSales}
                          className="w-full"
                          variant="default"
                        >
                          {mergingSales ? 'جاري الدمج...' : `دمج ${group.sales.length} صفقة`}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDialogOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Message - Use notification system instead of fixed card */}
      {errorMessage && (
        <div className="fixed top-16 left-4 right-4 z-[10001] md:top-4 pointer-events-none">
          <Card className="bg-destructive/10 border-2 border-destructive/30 shadow-2xl max-w-md mx-auto pointer-events-auto">
            <CardContent className="p-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-destructive text-sm font-medium break-words">{errorMessage}</p>
                </div>
                <button
                  onClick={() => setErrorMessage(null)}
                  className="flex-shrink-0 rounded-full bg-red-500 hover:bg-red-600 text-white transition-colors p-1.5 flex items-center justify-center"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <Card className="bg-green-100 border-green-300 fixed top-4 right-4 z-50 max-w-md shadow-lg animate-in slide-in-from-right">
          <CardContent className="p-4">
            <p className="text-green-800 font-medium text-sm">{successMessage}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSuccessMessage(null)}
              className="mt-2 text-green-700 hover:text-green-900 hover:bg-green-200"
            >
              إغلاق
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Client Details Dialog */}
      <Dialog open={clientDetailsOpen} onOpenChange={setClientDetailsOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل العميل</DialogTitle>
          </DialogHeader>
          {selectedClientForDetails && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border">
                <h3 className="font-semibold text-lg mb-4">معلومات العميل</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">الاسم الكامل</p>
                    <p className="font-semibold text-base">{selectedClientForDetails.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">رقم CIN</p>
                    <p className="font-semibold text-base">{selectedClientForDetails.cin || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">رقم الهاتف</p>
                    <p className="font-semibold text-base">{selectedClientForDetails.phone || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">البريد الإلكتروني</p>
                    <p className="font-semibold text-base">{selectedClientForDetails.email || '-'}</p>
                  </div>
                  {selectedClientForDetails.address && (
                    <div className="sm:col-span-2">
                      <p className="text-sm text-muted-foreground mb-1">العنوان</p>
                      <p className="font-semibold text-base">{selectedClientForDetails.address}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* All Land Pieces Summary */}
              {clientSales.length > 0 && (() => {
                // Collect all unique land pieces from all sales
                const allLandPieces = new Map<string, { piece_number: string | number; batch_name: string }>()
                clientSales.forEach((sale: any) => {
                  const landPieces = sale._landPieces || []
                  landPieces.forEach((p: any) => {
                    if (p && p.piece_number) {
                      const key = `${p.land_batch?.name || 'غير معروف'}-${p.piece_number}`
                      if (!allLandPieces.has(key)) {
                        allLandPieces.set(key, {
                          piece_number: p.piece_number,
                          batch_name: p.land_batch?.name || 'غير معروف'
                        })
                      }
                    }
                  })
                })
                
                const uniquePieces = Array.from(allLandPieces.values())
                
                if (uniquePieces.length > 0) {
                  return (
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <h4 className="font-semibold mb-3 text-lg text-green-800">القطع المملوكة</h4>
                      <div className="flex flex-wrap gap-2">
                        {uniquePieces.map((piece, idx) => (
                          <Badge key={idx} variant="success" className="text-sm py-1 px-3">
                            {piece.batch_name} - #{piece.piece_number}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        إجمالي القطع: <strong className="text-green-700">{uniquePieces.length}</strong>
                      </p>
                    </div>
                  )
                }
                return null
              })()}

              {clientSales.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 text-lg">سجل المبيعات</h4>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-100">
                          <TableHead className="font-semibold">التاريخ</TableHead>
                          <TableHead className="font-semibold">النوع</TableHead>
                          <TableHead className="font-semibold">القطع</TableHead>
                          <TableHead className="font-semibold">السعر</TableHead>
                          <TableHead className="font-semibold">الحالة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {clientSales
                          .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime()) // Sort by date descending (newest first)
                          .map((sale) => {
                            const landPieces = sale._landPieces || []
                            const pieceNumbers = landPieces.map((p: any) => p?.piece_number).filter(Boolean).join('، ')
                            
                            return (
                              <TableRow key={sale.id} className="hover:bg-blue-50/50 transition-colors">
                                <TableCell className="font-medium">{formatDate(sale.sale_date)}</TableCell>
                                <TableCell>
                                  <Badge variant={sale.payment_type === 'Full' ? 'success' : 'secondary'} className="text-xs">
                                    {sale.payment_type === 'Full' ? 'بالحاضر' : 'بالتقسيط'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {pieceNumbers ? (
                                    <Badge variant="outline" className="text-xs">
                                      {pieceNumbers}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">-</span>
                                  )}
                                </TableCell>
                                <TableCell className="font-semibold">{formatCurrency(sale.total_selling_price)}</TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      sale.status === 'Completed'
                                        ? 'success'
                                        : sale.status === 'Cancelled'
                                        ? 'destructive'
                                        : 'warning'
                                    }
                                    className="text-xs"
                                  >
                                    {(sale.status === 'Completed' || (sale as any).status === 'Completed') ? 'مباع' :
                                     sale.payment_type === 'Installment' && (sale as any).status !== 'Completed' ? 'بالتقسيط' :
                                     sale.payment_type === 'Full' && (sale as any).status !== 'Completed' ? 'بالحاضر' :
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

      {/* Sale Details Drawer - Progressive Disclosure */}
      <Dialog open={detailsDrawerOpen} onOpenChange={setDetailsDrawerOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
            <DialogTitle>تفاصيل الصفقة</DialogTitle>
              {selectedSaleForDetails && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    // Manually refresh the details drawer
                    try {
                      const { data: freshData, error } = await supabase
                        .from('installments')
                        .select(`
                          *,
                          sale:sales (
                            *,
                            client:clients (*),
                            contract_editor:contract_editors (*),
                            land_piece_ids,
                            created_by_user:users!sales_created_by_fkey(id, name),
                            confirmed_by_user:users!sales_confirmed_by_fkey(id, name)
                          )
                        `)
                        .eq('sale_id', selectedSaleForDetails.saleId)
                        .order('installment_number', { ascending: true })
                      
                      if (!error && freshData && freshData.length > 0) {
                        const freshInstallments = freshData as InstallmentWithRelations[]
                        const firstInst = freshInstallments[0]
                        
                        let pieceNumbers = selectedSaleForDetails.landPieces
                        if (firstInst.sale?.land_piece_ids && firstInst.sale.land_piece_ids.length > 0) {
                          const { data: piecesData } = await supabase
                            .from('land_pieces')
                            .select('piece_number')
                            .in('id', firstInst.sale.land_piece_ids)
                          
                          if (piecesData) {
                            const numbers = piecesData.map(p => p.piece_number).filter(Boolean)
                            pieceNumbers = numbers.length > 0 ? numbers.join('، ') : '-'
                          }
                        }
                        
                        const totalDue = freshInstallments.reduce((sum, inst) => sum + inst.amount_due, 0)
                        // Include big advance amount (التسبقة) in total paid - this is paid at confirmation
                        const bigAdvanceAmount = (firstInst.sale as any)?.big_advance_amount || 0
                        const totalPaid = freshInstallments.reduce((sum, inst) => sum + (inst.amount_paid || 0), 0) + bigAdvanceAmount
                        const totalUnpaid = freshInstallments.reduce((sum, inst) => {
                          const remaining = inst.amount_due + (inst.stacked_amount || 0) - (inst.amount_paid || 0)
                          return sum + Math.max(0, remaining)
                        }, 0)
                        
                        const sale = firstInst.sale as any
                        const isConfirmed = sale?.confirmed_by !== null || 
                                            sale?.is_confirmed === true || 
                                            sale?.big_advance_confirmed === true ||
                                            freshInstallments.length > 0
                        
                        // If confirmed_by exists but confirmed_by_user is not loaded, fetch it
                        let confirmedByUser = sale?.confirmed_by_user || selectedSaleForDetails.confirmedByUser || null
                        if (!confirmedByUser && sale?.confirmed_by) {
                          try {
                            const { data: userData } = await supabase
                              .from('users')
                              .select('id, name')
                              .eq('id', sale.confirmed_by)
                              .single()
                            
                            if (userData) {
                              confirmedByUser = { id: userData.id, name: userData.name }
                            }
                          } catch (err) {
                            console.error('Error fetching confirmed_by user:', err)
                          }
                        }
                        
                        setSelectedSaleForDetails({
                          saleId: selectedSaleForDetails.saleId,
                          clientName: firstInst.sale?.client?.name || selectedSaleForDetails.clientName,
                          clientCin: firstInst.sale?.client?.cin || selectedSaleForDetails.clientCin,
                          saleDate: firstInst.sale?.sale_date || selectedSaleForDetails.saleDate,
                          deadlineDate: firstInst.sale?.deadline_date || selectedSaleForDetails.deadlineDate,
                          installments: freshInstallments,
                          totalDue,
                          totalPaid,
                          totalUnpaid,
                          landPieces: pieceNumbers,
                          contractEditor: firstInst.sale?.contract_editor || null,
                          createdByUser: sale?.created_by_user || selectedSaleForDetails.createdByUser || null,
                          confirmedByUser,
                          isConfirmed
                        })
                      }
                    } catch (err) {
                      console.error('Error manually refreshing sale details:', err)
                    }
                  }}
                  className="h-8 w-8 p-0"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </DialogHeader>
          {selectedSaleForDetails && (
            <div className="space-y-4 sm:space-y-6">
              {/* Sale Summary */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-3 sm:p-4 rounded-lg border">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">العميل</p>
                    <p className="font-semibold text-sm sm:text-base">{selectedSaleForDetails.clientName}</p>
                    {selectedSaleForDetails.clientCin && (
                      <p className="text-xs text-muted-foreground mt-1">CIN: {selectedSaleForDetails.clientCin}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">تاريخ البيع</p>
                    <p className="font-semibold text-sm sm:text-base">{formatDate(selectedSaleForDetails.saleDate)}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">القطع</p>
                    <Badge variant="outline" className="text-xs sm:text-sm">
                      {selectedSaleForDetails.landPieces}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">إجمالي المبلغ</p>
                    <p className="font-semibold text-sm sm:text-base text-primary">{formatCurrency(selectedSaleForDetails.totalDue)}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">المدفوع</p>
                    <p className="font-semibold text-sm sm:text-base text-green-600">{formatCurrency(selectedSaleForDetails.totalPaid)}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">المتبقي</p>
                    <p className="font-semibold text-sm sm:text-base text-red-600">{formatCurrency(selectedSaleForDetails.totalUnpaid)}</p>
                  </div>
                  {selectedSaleForDetails.deadlineDate && <DeadlineCountdown deadlineDate={selectedSaleForDetails.deadlineDate} />}
                  {selectedSaleForDetails.contractEditor && (
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">محرر العقد</p>
                      <p className="font-semibold text-sm sm:text-base">
                        {selectedSaleForDetails.contractEditor.type} - {selectedSaleForDetails.contractEditor.name} ({selectedSaleForDetails.contractEditor.place})
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">باعه</p>
                    <p className="font-semibold text-sm sm:text-base">
                      {selectedSaleForDetails.createdByUser ? selectedSaleForDetails.createdByUser.name : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">أكده</p>
                    <p className="font-semibold text-sm sm:text-base">
                      {selectedSaleForDetails.confirmedByUser 
                        ? selectedSaleForDetails.confirmedByUser.name 
                        : (selectedSaleForDetails.isConfirmed 
                            ? 'مؤكد (مستخدم غير معروف)' 
                            : 'لم يتم التأكيد بعد')}
                    </p>
                  </div>
                </div>
                <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <span className="text-muted-foreground">التقدم</span>
                    <span className="font-semibold">
                      {Math.round((selectedSaleForDetails.totalPaid / selectedSaleForDetails.totalDue) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                    <div 
                      className="bg-green-500 h-2 rounded-full transition-all" 
                      style={{ width: `${(selectedSaleForDetails.totalPaid / selectedSaleForDetails.totalDue) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Installments Schedule */}
              <div>
                <h4 className="font-semibold mb-2 sm:mb-3 text-sm sm:text-lg flex items-center justify-between">
                  <span>جدول الأقساط</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      // Manual refresh button
                      setIsRefreshing(true)
                      await fetchInstallments()
                      // Re-fetch details for this sale
                      if (selectedSaleForDetails) {
                        const { data: freshData } = await supabase
                          .from('installments')
                          .select(`*, sale:sales (*, client:clients (*), contract_editor:contract_editors (*), land_piece_ids, created_by_user:users!sales_created_by_fkey(id, name), confirmed_by_user:users!sales_confirmed_by_fkey(id, name))`)
                          .eq('sale_id', selectedSaleForDetails.saleId)
                          .order('installment_number', { ascending: true })
                        
                        if (freshData && freshData.length > 0) {
                          const freshInstallments = freshData as InstallmentWithRelations[]
                          const firstInst = freshInstallments[0]
                          const totalDue = freshInstallments.reduce((sum, inst) => sum + inst.amount_due, 0)
                          // Include big advance amount (التسبقة) in total paid - this is paid at confirmation
                          const bigAdvanceAmount = (firstInst.sale as any)?.big_advance_amount || 0
                          const totalPaid = freshInstallments.reduce((sum, inst) => sum + (inst.amount_paid || 0), 0) + bigAdvanceAmount
                          const totalUnpaid = freshInstallments.reduce((sum, inst) => {
                            const remaining = inst.amount_due + (inst.stacked_amount || 0) - (inst.amount_paid || 0)
                            return sum + Math.max(0, remaining)
                          }, 0)
                          
                          const sale = firstInst?.sale as any
                          const isConfirmed = sale?.confirmed_by !== null || 
                                              sale?.is_confirmed === true || 
                                              sale?.big_advance_confirmed === true ||
                                              freshInstallments.length > 0
                          
                          // If confirmed_by exists but confirmed_by_user is not loaded, fetch it
                          let confirmedByUser = sale?.confirmed_by_user || selectedSaleForDetails.confirmedByUser || null
                          if (!confirmedByUser && sale?.confirmed_by) {
                            try {
                              const { data: userData } = await supabase
                                .from('users')
                                .select('id, name')
                                .eq('id', sale.confirmed_by)
                                .single()
                              
                              if (userData) {
                                confirmedByUser = { id: userData.id, name: userData.name }
                              }
                            } catch (err) {
                              console.error('Error fetching confirmed_by user:', err)
                            }
                          }
                          
                          setSelectedSaleForDetails({
                            ...selectedSaleForDetails,
                            installments: freshInstallments,
                            totalDue,
                            totalPaid,
                            totalUnpaid,
                            contractEditor: firstInst?.sale?.contract_editor || selectedSaleForDetails.contractEditor || null,
                            createdByUser: sale?.created_by_user || selectedSaleForDetails.createdByUser || null,
                            confirmedByUser,
                            isConfirmed
                          })
                        }
                      }
                      setIsRefreshing(false)
                    }}
                    disabled={isRefreshing}
                  >
                    <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  </Button>
                </h4>
                {/* Mobile Card View / Desktop Table View */}
                <div className="md:hidden space-y-2">
                  {selectedSaleForDetails.installments
                    .sort((a, b) => a.installment_number - b.installment_number)
                    .map((inst) => {
                      const freshInst = installments.find(i => i.id === inst.id) || inst
                      const remaining = getRemainingAmount(freshInst)
                      const daysLeft = getDaysUntilDue(freshInst)
                      const isOverdue = isInstallmentOverdue(freshInst)
                      const isPaid = remaining <= 0.01 || freshInst.status === 'Paid'
                      
                      return (
                        <Card 
                          key={`${freshInst.id}-${freshInst.amount_paid}-${refreshKey}`}
                          className={`${isPaid ? 'bg-green-50/50' : isOverdue ? 'bg-red-50/30' : ''}`}
                        >
                          <CardContent className="p-3">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm">#{freshInst.installment_number}</div>
                                <Badge
                                  variant={
                                    isPaid ? 'success' :
                                    isOverdue ? 'destructive' :
                                    'warning'
                                  }
                                  className="text-xs"
                                >
                                  {isPaid ? 'مدفوع' :
                                   isOverdue ? 'متأخر' :
                                   'مستحق'}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-muted-foreground">المبلغ المستحق:</span>
                                  <div className="font-medium">{formatCurrency(freshInst.amount_due + freshInst.stacked_amount)}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">المدفوع:</span>
                                  <div className="font-medium text-green-600">{formatCurrency(freshInst.amount_paid)}</div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">المتبقي:</span>
                                  <div className={`font-semibold ${remaining > 0.01 ? 'text-red-600' : 'text-green-600'}`}>
                                    {formatCurrency(remaining)}
                                  </div>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">تاريخ الاستحقاق:</span>
                                  <div className="font-medium">{formatDate(freshInst.due_date)}</div>
                                  {!isPaid && <InstallmentCountdown dueDate={freshInst.due_date} />}
                                </div>
                              </div>
                              {hasPermission('record_payments') && !isPaid && (
                                <Button
                                  size="sm"
                                  variant={isOverdue ? 'destructive' : 'default'}
                                  onClick={() => {
                                    setDetailsDrawerOpen(false)
                                    openPaymentDialog(freshInst)
                                  }}
                                  className="w-full text-xs h-8"
                                >
                                  دفع
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <Table key={`installments-table-${selectedSaleForDetails.totalPaid}-${refreshKey}`}>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="font-semibold">#</TableHead>
                        <TableHead className="font-semibold">المبلغ المستحق</TableHead>
                        <TableHead className="font-semibold">المدفوع</TableHead>
                        <TableHead className="font-semibold">المتبقي</TableHead>
                        <TableHead className="font-semibold">تاريخ الاستحقاق</TableHead>
                        <TableHead className="font-semibold">الحالة</TableHead>
                        <TableHead className="font-semibold">إجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedSaleForDetails.installments
                        .sort((a, b) => a.installment_number - b.installment_number)
                        .map((inst) => {
                          const freshInst = installments.find(i => i.id === inst.id) || inst
                          const remaining = getRemainingAmount(freshInst)
                          const daysLeft = getDaysUntilDue(freshInst)
                          const isOverdue = isInstallmentOverdue(freshInst)
                          const isPaid = remaining <= 0.01 || freshInst.status === 'Paid'
                          
                          return (
                            <TableRow 
                              key={`${freshInst.id}-${freshInst.amount_paid}-${refreshKey}`}
                              className={isPaid ? 'bg-green-50/50' : isOverdue ? 'bg-red-50/30' : ''}
                            >
                              <TableCell className="font-medium">#{freshInst.installment_number}</TableCell>
                              <TableCell>{formatCurrency(freshInst.amount_due + freshInst.stacked_amount)}</TableCell>
                              <TableCell className="text-green-600 font-medium">
                                {formatCurrency(freshInst.amount_paid)}
                              </TableCell>
                              <TableCell className={remaining > 0.01 ? 'text-red-600 font-semibold' : 'text-green-600'}>
                                {formatCurrency(remaining)}
                              </TableCell>
                              <TableCell>
                                <div>{formatDate(freshInst.due_date)}</div>
                                {!isPaid && <InstallmentCountdown dueDate={freshInst.due_date} />}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={
                                    isPaid ? 'success' :
                                    isOverdue ? 'destructive' :
                                    'warning'
                                  }
                                  className="text-xs"
                                >
                                  {isPaid ? 'مدفوع' :
                                   isOverdue ? 'متأخر' :
                                   'مستحق'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {hasPermission('record_payments') && !isPaid && (
                                  <Button
                                    size="sm"
                                    variant={isOverdue ? 'destructive' : 'default'}
                                    onClick={() => {
                                      setDetailsDrawerOpen(false)
                                      openPaymentDialog(freshInst)
                                    }}
                                  >
                                    دفع
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
