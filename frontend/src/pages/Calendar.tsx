import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatDate, formatCurrency } from '@/lib/utils'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, X, Edit, History, Info, MapPin } from 'lucide-react'
import { showNotification } from '@/components/ui/notification'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { Sale, Client } from '@/types/database'

interface Rendezvous {
  id: string
  sale_id: string
  rendezvous_date: string
  rendezvous_time: string
  notes: string | null
  status: string
  created_at: string
  updated_at: string
  sale?: Sale & { client?: Client | null }
}

export function Calendar() {
  const { user, profile } = useAuth()
  const { t } = useLanguage()
  const isOwner = profile?.role === 'Owner'
  const [currentDate, setCurrentDate] = useState(new Date())
  const [rendezvous, setRendezvous] = useState<Rendezvous[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedDateRendezvous, setSelectedDateRendezvous] = useState<Rendezvous[]>([])
  const [extendDialogOpen, setExtendDialogOpen] = useState(false)
  const [selectedRendezvousForExtend, setSelectedRendezvousForExtend] = useState<Rendezvous | null>(null)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [selectedRendezvousForCancel, setSelectedRendezvousForCancel] = useState<Rendezvous | null>(null)
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false)
  const [selectedRendezvousForHistory, setSelectedRendezvousForHistory] = useState<Rendezvous | null>(null)
  const [rendezvousHistory, setRendezvousHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [lastUpdates, setLastUpdates] = useState<Record<string, { date: string; user: string }>>({})
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [selectedRendezvousForDetails, setSelectedRendezvousForDetails] = useState<Rendezvous | null>(null)
  const [landPiecesDetails, setLandPiecesDetails] = useState<any[]>([])
  const [loadingPieces, setLoadingPieces] = useState(false)

  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()

  // Get first day of month and number of days
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  // Arabic day names
  const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

  useEffect(() => {
    fetchRendezvous()
  }, [currentYear, currentMonth])

  const fetchRendezvous = async () => {
    try {
      setLoading(true)
      const startDate = new Date(currentYear, currentMonth, 1).toISOString().split('T')[0]
      const endDate = new Date(currentYear, currentMonth + 1, 0).toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('sale_rendezvous')
        .select(`
          *,
          sale:sales(
            *,
            client:clients(*),
            selected_offer:payment_offers!sales_selected_offer_id_fkey(*),
            created_by_user:users!sales_created_by_fkey(id, name),
            confirmed_by_user:users!sales_confirmed_by_fkey(id, name)
          )
        `)
        .gte('rendezvous_date', startDate)
        .lte('rendezvous_date', endDate)
        .eq('status', 'scheduled')
        .order('rendezvous_date', { ascending: true })
        .order('rendezvous_time', { ascending: true })

      if (error) throw error
      setRendezvous((data || []) as Rendezvous[])
    } catch (err) {
      console.error('Error fetching rendezvous:', err)
      showNotification('حدث خطأ أثناء تحميل المواعيد', 'error')
    } finally {
      setLoading(false)
    }
  }


  // Group rendezvous by date
  const rendezvousByDate = useMemo(() => {
    const grouped: Record<string, Rendezvous[]> = {}
    rendezvous.forEach(r => {
      const date = r.rendezvous_date
      if (!grouped[date]) {
        grouped[date] = []
      }
      grouped[date].push(r)
    })
    return grouped
  }, [rendezvous])

  const handleDateClick = (date: number) => {
    const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
    const dayRendezvous = rendezvousByDate[dateStr] || []
    
    if (dayRendezvous.length === 0) {
      // Show notification for empty day
      showNotification('لا توجد مواعيد في هذا اليوم', 'info')
      return
    }
    
    setSelectedDate(dateStr)
    setSelectedDateRendezvous(dayRendezvous)
  }

  // Update selectedDateRendezvous when rendezvousByDate changes (e.g., after cancel)
  useEffect(() => {
    if (selectedDate && rendezvousByDate[selectedDate]) {
      setSelectedDateRendezvous(rendezvousByDate[selectedDate])
    } else if (selectedDate && !rendezvousByDate[selectedDate]) {
      // If no rendez-vous for this date after update, close the dialog
      setSelectedDate(null)
      setSelectedDateRendezvous([])
    }
  }, [rendezvousByDate, selectedDate])

  // Fetch last update for workers when dialog opens
  useEffect(() => {
    if (!isOwner && selectedDateRendezvous.length > 0) {
      // Fetch last update for each rendez-vous
      selectedDateRendezvous.forEach(r => {
        // Only fetch if we don't already have it
        if (!lastUpdates[r.id]) {
          fetchLastUpdate(r)
        }
      })
    }
  }, [selectedDateRendezvous, isOwner]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExtend = (rendezvousItem: Rendezvous) => {
    setSelectedRendezvousForExtend(rendezvousItem)
    setNewDate(rendezvousItem.rendezvous_date)
    setNewTime(rendezvousItem.rendezvous_time)
    setExtendDialogOpen(true)
  }

  const handleExtendConfirm = async () => {
    if (!selectedRendezvousForExtend || !newDate || !newTime) {
      showNotification('يرجى إدخال التاريخ والوقت الجديد', 'error')
      return
    }

    try {
      const { error } = await supabase
        .from('sale_rendezvous')
        .update({
          rendezvous_date: newDate,
          rendezvous_time: newTime,
          status: 'rescheduled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedRendezvousForExtend.id)

      if (error) throw error

      // Create new rendezvous with new date
      const { error: insertError } = await supabase
        .from('sale_rendezvous')
        .insert([{
          sale_id: selectedRendezvousForExtend.sale_id,
          rendezvous_date: newDate,
          rendezvous_time: newTime,
          notes: selectedRendezvousForExtend.notes,
          status: 'scheduled',
          rescheduled_from_id: selectedRendezvousForExtend.id,
          created_by: user?.id || null,
        }])

      if (insertError) throw insertError

      showNotification('تم تغيير الموعد بنجاح', 'success')
      setExtendDialogOpen(false)
      setSelectedRendezvousForExtend(null)
      fetchRendezvous()
    } catch (err) {
      console.error('Error extending rendezvous:', err)
      showNotification('حدث خطأ أثناء تغيير الموعد', 'error')
    }
  }

  const handleCancel = (rendezvousItem: Rendezvous) => {
    setSelectedRendezvousForCancel(rendezvousItem)
    setCancelDialogOpen(true)
  }

  const fetchLastUpdate = async (rendezvousItem: Rendezvous) => {
    try {
      // Fetch the most recent update from both histories
      const [rendezvousHistoryResult, saleHistoryResult] = await Promise.all([
        supabase
          .from('sale_rendezvous_history')
          .select(`
            created_at,
            changed_by_user:users(id, name, email)
          `)
          .eq('rendezvous_id', rendezvousItem.id)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('sales_history')
          .select(`
            created_at,
            changed_by_user:users(id, name, email)
          `)
          .eq('sale_id', rendezvousItem.sale_id)
          .order('created_at', { ascending: false })
          .limit(1)
      ])

      // Get the most recent update
      const updates = [
        ...(rendezvousHistoryResult.data || []),
        ...(saleHistoryResult.data || [])
      ].sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )

      if (updates.length > 0) {
        const latest = updates[0] as any
        setLastUpdates(prev => ({
          ...prev,
          [rendezvousItem.id]: {
            date: new Date(latest.created_at).toLocaleString('ar-TN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
            user: latest.changed_by_user?.name || latest.changed_by_user?.email || 'غير معروف'
          }
        }))
      }
    } catch (err) {
      console.error('Error fetching last update:', err)
    }
  }

  const handleViewHistory = async (rendezvousItem: Rendezvous) => {
    setSelectedRendezvousForHistory(rendezvousItem)
    setHistoryDialogOpen(true)
    setLoadingHistory(true)
    
    try {
      // First, find all related rendez-vous for this sale (including old ones that were rescheduled)
      const { data: allRendezvous, error: rendezvousError } = await supabase
        .from('sale_rendezvous')
        .select('id')
        .eq('sale_id', rendezvousItem.sale_id)
        .order('created_at', { ascending: true })

      if (rendezvousError) throw rendezvousError

      // Get all rendez-vous IDs (current and all previous ones for this sale)
      const rendezvousIds = (allRendezvous || []).map(r => r.id)

      // Fetch history for ALL rendez-vous related to this sale
      const [rendezvousHistoryResult, saleHistoryResult] = await Promise.all([
        supabase
          .from('sale_rendezvous_history')
          .select(`
            *,
            changed_by_user:users(id, name, email)
          `)
          .in('rendezvous_id', rendezvousIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('sales_history')
          .select(`
            *,
            changed_by_user:users(id, name, email)
          `)
          .eq('sale_id', rendezvousItem.sale_id)
          .order('created_at', { ascending: false })
      ])

      if (rendezvousHistoryResult.error) throw rendezvousHistoryResult.error
      if (saleHistoryResult.error) throw saleHistoryResult.error

      // Combine both histories and sort by date
      const combinedHistory = [
        ...(rendezvousHistoryResult.data || []).map((item: any) => ({ ...item, history_type: 'rendezvous' })),
        ...(saleHistoryResult.data || []).map((item: any) => ({ ...item, history_type: 'sale' }))
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setRendezvousHistory(combinedHistory)
    } catch (err) {
      console.error('Error fetching history:', err)
      showNotification('حدث خطأ أثناء تحميل السجل', 'error')
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleCancelConfirm = async () => {
    if (!selectedRendezvousForCancel) return

    try {
      // Update rendezvous status to cancelled
      const { error: updateError } = await supabase
        .from('sale_rendezvous')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedRendezvousForCancel.id)

      if (updateError) throw updateError

      // Cancel the sale (remove from confirmation page)
      if (selectedRendezvousForCancel.sale_id) {
        const { error: saleError } = await supabase
          .from('sales')
          .update({ status: 'Cancelled' } as any)
          .eq('id', selectedRendezvousForCancel.sale_id)

        if (saleError) throw saleError
      }

      // Close cancel confirmation dialog first
      setCancelDialogOpen(false)
      setSelectedRendezvousForCancel(null)
      
      // Close the main rendez-vous dialog immediately
      setSelectedDate(null)
      setSelectedDateRendezvous([])
      
      // Refresh the rendez-vous list to update the calendar
      await fetchRendezvous()
      
      showNotification('تم إلغاء الموعد والبيع بنجاح', 'success')
    } catch (err) {
      console.error('Error cancelling rendezvous:', err)
      showNotification('حدث خطأ أثناء إلغاء الموعد', 'error')
    }
  }

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentYear, currentMonth + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ]

  const today = new Date()
  const isToday = (date: number) => {
    return (
      date === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
    )
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Card className="shadow-lg border-0">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-center gap-2">
              <CalendarIcon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              <CardTitle className="text-xl sm:text-2xl font-bold text-center">تقويم المواعيد</CardTitle>
            </div>
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={goToToday}
                className="text-xs sm:text-sm px-3 sm:px-4 h-9 sm:h-10 shrink-0 bg-white hover:bg-gray-50 shadow-sm"
              >
                اليوم
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={goToPreviousMonth}
                className="h-9 w-9 sm:h-10 sm:w-10 p-0 flex items-center justify-center shrink-0 bg-white hover:bg-gray-50 shadow-sm"
              >
                <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <span className="text-base sm:text-lg font-bold text-center px-3 sm:px-5 min-w-[140px] sm:min-w-[200px] bg-white rounded-lg py-2 shadow-sm">
                {monthNames[currentMonth]} {currentYear}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={goToNextMonth}
                className="h-9 w-9 sm:h-10 sm:w-10 p-0 flex items-center justify-center shrink-0 bg-white hover:bg-gray-50 shadow-sm"
              >
                <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block h-8 w-8 border-4 border-gray-300 border-t-primary rounded-full animate-spin mb-2"></div>
              <p className="text-sm text-muted-foreground">جاري التحميل...</p>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2 sm:gap-3">
              {/* Day headers - Modern style */}
              {dayNames.map((day, index) => (
                <div key={index} className="text-center font-bold text-xs sm:text-sm py-2 sm:py-3 text-gray-600 bg-gray-50 rounded-lg">
                  {day}
                </div>
              ))}

              {/* Empty cells for days before month starts */}
              {Array.from({ length: startingDayOfWeek }).map((_, index) => (
                <div key={`empty-${index}`} className="aspect-square" />
              ))}

              {/* Days of the month - Modern design */}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((date) => {
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
                const dayRendezvous = rendezvousByDate[dateStr] || []
                const hasRendezvous = dayRendezvous.length > 0
                const isTodayDate = isToday(date)

                return (
                  <div
                    key={date}
                    onClick={() => handleDateClick(date)}
                    className={`
                      aspect-square rounded-xl p-2 sm:p-3 cursor-pointer transition-all duration-200
                      flex flex-col items-center justify-center
                      ${isTodayDate 
                        ? 'bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg ring-2 ring-primary/50' 
                        : hasRendezvous
                        ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 hover:border-blue-400 hover:shadow-md'
                        : 'bg-white border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm'
                      }
                    `}
                  >
                    <div className={`text-base sm:text-lg font-bold ${isTodayDate ? 'text-white' : 'text-gray-800'}`}>
                      {date}
                    </div>
                    {hasRendezvous && (
                      <div className="mt-1">
                        <Badge 
                          variant={isTodayDate ? "secondary" : "default"} 
                          className={`text-xs font-bold ${
                            isTodayDate 
                              ? 'bg-white/20 text-white border-white/30' 
                              : 'bg-blue-500 text-white border-blue-600'
                          }`}
                        >
                          {dayRendezvous.length}
                        </Badge>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Rendezvous Dialog for Selected Date */}
      <Dialog open={selectedDate !== null} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              المواعيد - {selectedDate && formatDate(selectedDate)}
            </DialogTitle>
          </DialogHeader>
          {selectedDateRendezvous.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              لا توجد مواعيد في هذا اليوم
            </div>
          ) : (
            <div className="space-y-3">
              {selectedDateRendezvous.map((r) => {
                const sale = r.sale as any
                const getPaymentTypeLabel = () => {
                  if (sale?.payment_type === 'Full') return 'بالحاضر'
                  if (sale?.payment_type === 'Installment') return 'بالتقسيط'
                  if (sale?.payment_type === 'PromiseOfSale') {
                    const isFirstPart = !sale?.promise_completed && !sale?.promise_initial_payment
                    const isSecondPart = sale?.promise_initial_payment > 0 || sale?.promise_completed
                    if (isSecondPart) return 'وعد بالبيع (الجزء الثاني - استكمال الدفع)'
                    return 'وعد بالبيع (الجزء الأول)'
                  }
                  return sale?.payment_type || 'غير محدد'
                }
                const paymentType = getPaymentTypeLabel()
                const offer = sale?.selected_offer
                
                return (
                  <Card key={r.id} className="border-l-4 border-l-primary">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">{r.rendezvous_time}</span>
                          </div>
                          <div>
                            <p className="font-medium text-sm mb-1">
                              العميل: {sale?.client?.name || 'غير معروف'}
                            </p>
                            <p className="text-xs text-muted-foreground mb-1">
                              رقم البيع: #{r.sale_id.slice(0, 8)}
                            </p>
                          </div>
                          
                          {/* Sale Details */}
                          {sale && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 space-y-1">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-medium">نوع الدفع:</span>
                                <Badge variant="outline" className="text-xs">
                                  {paymentType}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                <span className="font-medium">السعر الإجمالي:</span> {formatCurrency(sale.total_selling_price || 0)}
                              </div>
                              {sale.small_advance_amount > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  <span className="font-medium">العربون:</span> {formatCurrency(sale.small_advance_amount)}
                                </div>
                              )}
                              {sale.big_advance_amount > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  <span className="font-medium">التسبقة:</span> {formatCurrency(sale.big_advance_amount)}
                                </div>
                              )}
                              {offer && (
                                <div className="text-xs text-muted-foreground mt-1 pt-1 border-t border-blue-300">
                                  <span className="font-medium">العرض المختار:</span> {offer.name || 'عرض التقسيط'}
                                  {offer.monthly_payment && (
                                    <span className="mr-2"> - القسط الشهري: {formatCurrency(offer.monthly_payment)}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          
                          {r.notes && (
                            <p className="text-xs text-muted-foreground mt-2 p-2 bg-gray-50 rounded">{r.notes}</p>
                          )}
                          {!isOwner && lastUpdates[r.id] && (
                            <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                              <p className="text-muted-foreground">
                                آخر تحديث: {lastUpdates[r.id].date}
                              </p>
                              <p className="text-muted-foreground">
                                بواسطة: {lastUpdates[r.id].user}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              setSelectedRendezvousForDetails(r)
                              setDetailsDialogOpen(true)
                              // Fetch land pieces details
                              if (r.sale?.land_piece_ids && r.sale.land_piece_ids.length > 0) {
                                setLoadingPieces(true)
                                try {
                                  const { data: piecesData, error: piecesError } = await supabase
                                    .from('land_pieces')
                                    .select('id, piece_number, surface_area, land_batch_id, land_batch:land_batches(name)')
                                    .in('id', r.sale.land_piece_ids)
                                  
                                  if (piecesError) {
                                    console.error('Error fetching land pieces:', piecesError)
                                  } else {
                                    setLandPiecesDetails(piecesData || [])
                                  }
                                } catch (err) {
                                  console.error('Error fetching land pieces:', err)
                                } finally {
                                  setLoadingPieces(false)
                                }
                              } else {
                                setLandPiecesDetails([])
                              }
                            }}
                            className="text-xs"
                          >
                            <Info className="h-3 w-3 ml-1" />
                            التفاصيل
                          </Button>
                          {isOwner && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewHistory(r)}
                              className="text-xs"
                            >
                              <History className="h-3 w-3 ml-1" />
                              السجل
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleExtend(r)}
                            className="text-xs"
                          >
                            <Edit className="h-3 w-3 ml-1" />
                            تغيير
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleCancel(r)}
                            className="text-xs"
                          >
                            <X className="h-3 w-3 ml-1" />
                            إلغاء
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDate(null)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend Rendezvous Dialog */}
      <Dialog open={extendDialogOpen} onOpenChange={setExtendDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle>تغيير الموعد</DialogTitle>
          </DialogHeader>
          {selectedRendezvousForExtend && (
            <div className="space-y-4">
              <div className="bg-muted/50 p-3 rounded-lg">
                <p className="text-sm font-medium">
                  العميل: {selectedRendezvousForExtend.sale?.client?.name || 'غير معروف'}
                </p>
                <p className="text-xs text-muted-foreground">
                  الموعد الحالي: {formatDate(selectedRendezvousForExtend.rendezvous_date)} - {selectedRendezvousForExtend.rendezvous_time}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="new-date">التاريخ الجديد *</Label>
                <Input
                  id="new-date"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="new-time">الوقت الجديد *</Label>
                <Input
                  id="new-time"
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  required
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleExtendConfirm}>
              حفظ التغيير
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel Rendezvous Dialog */}
      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        onConfirm={handleCancelConfirm}
        title="إلغاء الموعد والبيع"
        description={
          selectedRendezvousForCancel
            ? `هل أنت متأكد من إلغاء الموعد والبيع للعميل ${selectedRendezvousForCancel.sale?.client?.name || 'غير معروف'}؟ سيتم إلغاء الموعد وإزالة البيع من صفحة التأكيد.`
            : ''
        }
        confirmText="نعم، إلغاء"
        cancelText="إلغاء"
      />

      {/* History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              سجل التغييرات - {selectedRendezvousForHistory?.sale?.client?.name || 'غير معروف'}
            </DialogTitle>
          </DialogHeader>
          {selectedRendezvousForHistory && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="font-medium text-sm mb-1">
                  العميل: {selectedRendezvousForHistory.sale?.client?.name || 'غير معروف'}
                </p>
                <p className="text-xs text-muted-foreground mb-1">
                  رقم البيع: #{selectedRendezvousForHistory.sale_id.slice(0, 8)}
                </p>
                <p className="text-xs text-muted-foreground">
                  التاريخ الحالي: {selectedRendezvousForHistory.rendezvous_date} {selectedRendezvousForHistory.rendezvous_time}
                </p>
                {selectedRendezvousForHistory.notes && (
                  <p className="text-xs text-muted-foreground mt-2">
                    ملاحظات: {selectedRendezvousForHistory.notes}
                  </p>
                )}
              </div>

              {loadingHistory ? (
                <div className="text-center py-8">
                  <div className="inline-block h-8 w-8 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                  <p className="mt-2 text-sm text-muted-foreground">جاري تحميل السجل...</p>
                </div>
              ) : rendezvousHistory.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  لا يوجد سجل للتغييرات
                </div>
              ) : (
                <div className="space-y-3">
                  {rendezvousHistory.map((historyItem: any) => {
                    const changeTypeLabels: Record<string, string> = {
                      created: historyItem.history_type === 'sale' ? 'تم إنشاء البيع' : 'تم إنشاء الموعد',
                      updated: historyItem.history_type === 'sale' ? 'تم تحديث البيع' : 'تم تحديث الموعد',
                      cancelled: historyItem.history_type === 'sale' ? 'تم إلغاء البيع' : 'تم إلغاء الموعد',
                      rescheduled: 'تم تغيير الموعد',
                      completed: 'تم الإكمال',
                      status_changed: 'تم تغيير الحالة',
                      confirmed: 'تم تأكيد البيع',
                      payment_updated: 'تم تحديث معلومات الدفع',
                    }

                    const changeTypeColors: Record<string, string> = {
                      created: 'bg-green-100 text-green-800 border-green-200',
                      updated: 'bg-blue-100 text-blue-800 border-blue-200',
                      cancelled: 'bg-red-100 text-red-800 border-red-200',
                      rescheduled: 'bg-yellow-100 text-yellow-800 border-yellow-200',
                      completed: 'bg-purple-100 text-purple-800 border-purple-200',
                      status_changed: 'bg-orange-100 text-orange-800 border-orange-200',
                      confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                      payment_updated: 'bg-cyan-100 text-cyan-800 border-cyan-200',
                    }

                    // Format date and time for display - simpler format
                    const formatDateTime = (date: string, time: string) => {
                      if (!date) return ''
                      try {
                        const dateObj = new Date(date)
                        const formattedDate = dateObj.toLocaleDateString('ar-TN', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })
                        return time ? `${formattedDate} ${time}` : formattedDate
                      } catch {
                        return time ? `${date} ${time}` : date
                      }
                    }

                    // Get the main change description - simplified
                    let mainChange = ''
                    if (historyItem.old_rendezvous_date && historyItem.new_rendezvous_date) {
                      const oldDate = formatDateTime(historyItem.old_rendezvous_date, historyItem.old_rendezvous_time || '')
                      const newDate = formatDateTime(historyItem.new_rendezvous_date, historyItem.new_rendezvous_time || '')
                      mainChange = `${oldDate} → ${newDate}`
                    } else if (historyItem.new_rendezvous_date) {
                      mainChange = formatDateTime(historyItem.new_rendezvous_date, historyItem.new_rendezvous_time || '')
                    } else if (historyItem.old_status && historyItem.new_status && historyItem.old_status !== historyItem.new_status) {
                      mainChange = `${historyItem.old_status} → ${historyItem.new_status}`
                    } else if (historyItem.new_status) {
                      mainChange = historyItem.new_status
                    }

                    // Format timestamp more simply
                    const timestamp = new Date(historyItem.created_at).toLocaleString('ar-TN', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })

                    // Get user name
                    const userName = historyItem.changed_by_user?.name || historyItem.changed_by_user?.email || 'غير معروف'

                    return (
                      <div key={historyItem.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                        <div className="flex-shrink-0 mt-1">
                          <div className={`w-2 h-2 rounded-full ${
                            historyItem.change_type === 'created' ? 'bg-green-500' :
                            historyItem.change_type === 'rescheduled' ? 'bg-yellow-500' :
                            historyItem.change_type === 'status_changed' ? 'bg-orange-500' :
                            historyItem.change_type === 'cancelled' ? 'bg-red-500' :
                            'bg-blue-500'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium">
                              {changeTypeLabels[historyItem.change_type] || historyItem.change_type}
                            </span>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">{timestamp}</span>
                          </div>
                          {mainChange && (
                            <p className="text-sm text-gray-700 mb-1">{mainChange}</p>
                          )}
                          <p className="text-xs text-muted-foreground">{userName}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryDialogOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              تفاصيل الموعد - {selectedRendezvousForDetails?.sale?.client?.name || 'غير معروف'}
            </DialogTitle>
          </DialogHeader>
          {selectedRendezvousForDetails && (() => {
            const r = selectedRendezvousForDetails
            const sale = r.sale as any
            const getPaymentTypeLabel = () => {
              if (sale?.payment_type === 'Full') return 'بالحاضر'
              if (sale?.payment_type === 'Installment') return 'بالتقسيط'
              if (sale?.payment_type === 'PromiseOfSale') {
                const isSecondPart = sale?.promise_initial_payment > 0 || sale?.promise_completed
                if (isSecondPart) return 'وعد بالبيع (الجزء الثاني - استكمال الدفع)'
                return 'وعد بالبيع (الجزء الأول)'
              }
              return sale?.payment_type || 'غير محدد'
            }
            const paymentType = getPaymentTypeLabel()
            const offer = sale?.selected_offer
            
            return (
              <div className="space-y-4">
                {/* Client Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">معلومات العميل</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-medium">الاسم:</span> {sale?.client?.name || 'غير معروف'}
                    </div>
                    <div>
                      <span className="font-medium">الهاتف:</span> {sale?.client?.phone || 'غير متوفر'}
                    </div>
                    {sale?.client?.email && (
                      <div>
                        <span className="font-medium">البريد:</span> {sale.client.email}
                      </div>
                    )}
                    {sale?.client?.cin && (
                      <div>
                        <span className="font-medium">CIN:</span> {sale.client.cin}
                      </div>
                    )}
                  </div>
                </div>

                {/* Sale Details */}
                {sale && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">تفاصيل البيع</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium">رقم البيع:</span> #{r.sale_id.slice(0, 8)}
                      </div>
                      <div>
                        <span className="font-medium">نوع الدفع:</span>
                        <Badge variant="outline" className="mr-2">{paymentType}</Badge>
                      </div>
                      <div>
                        <span className="font-medium">السعر الإجمالي:</span> {formatCurrency(sale.total_selling_price || 0)}
                      </div>
                      {sale.small_advance_amount > 0 && (
                        <div>
                          <span className="font-medium">العربون:</span> {formatCurrency(sale.small_advance_amount)}
                        </div>
                      )}
                      {sale.big_advance_amount > 0 && (
                        <div>
                          <span className="font-medium">التسبقة:</span> {formatCurrency(sale.big_advance_amount)}
                        </div>
                      )}
                      {sale.payment_type === 'Installment' && sale.number_of_installments && (
                        <>
                          <div>
                            <span className="font-medium">عدد الأقساط:</span> {sale.number_of_installments}
                          </div>
                          {sale.monthly_installment_amount && (
                            <div>
                              <span className="font-medium">القسط الشهري:</span> {formatCurrency(sale.monthly_installment_amount)}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* Offer Details */}
                {offer && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">تفاصيل العرض</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="font-medium">اسم العرض:</span> {offer.name || 'عرض التقسيط'}
                      </div>
                      {offer.price_per_m2_installment && (
                        <div>
                          <span className="font-medium">السعر لكل م²:</span> {formatCurrency(offer.price_per_m2_installment)}
                        </div>
                      )}
                      {offer.advance_amount > 0 && (
                        <div>
                          <span className="font-medium">التسبقة:</span> {
                            offer.advance_is_percentage 
                              ? `${offer.advance_amount}%`
                              : formatCurrency(offer.advance_amount)
                          }
                        </div>
                      )}
                      {offer.monthly_payment && (
                        <div>
                          <span className="font-medium">القسط الشهري:</span> {formatCurrency(offer.monthly_payment)}
                        </div>
                      )}
                      {offer.company_fee_percentage && (
                        <div>
                          <span className="font-medium">عمولة الشركة:</span> {offer.company_fee_percentage}%
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Land Pieces */}
                {sale?.land_piece_ids && sale.land_piece_ids.length > 0 && (
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="font-semibold mb-2 flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      قطع الأراضي ({sale.land_piece_ids.length})
                    </h3>
                    {loadingPieces ? (
                      <div className="text-sm text-muted-foreground">
                        <p>جاري تحميل تفاصيل القطع...</p>
                      </div>
                    ) : landPiecesDetails.length > 0 ? (
                      <div className="space-y-2">
                        {landPiecesDetails.map((piece: any) => (
                          <div key={piece.id} className="bg-white border border-purple-200 rounded p-2 text-sm">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium">القطعة #{piece.piece_number}</span>
                                {piece.surface_area && (
                                  <span className="text-muted-foreground mr-2"> - {piece.surface_area} م²</span>
                                )}
                              </div>
                              <div className="text-muted-foreground">
                                <span className="font-medium">الدفعة:</span> {piece.land_batch?.name || 'غير معروف'}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        <p>لا توجد تفاصيل متاحة للقطع</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Sale User Info */}
                {sale && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <h3 className="font-semibold mb-2">معلومات البيع</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {sale.created_by_user && (
                        <div>
                          <span className="font-medium">باعه:</span> {sale.created_by_user.name}
                        </div>
                      )}
                      <div>
                        <span className="font-medium">أكده:</span> {
                          sale.confirmed_by_user 
                            ? sale.confirmed_by_user.name 
                            : ((sale as any).is_confirmed === true || (sale as any).big_advance_confirmed === true || sale.confirmed_by !== null
                                ? 'مؤكد (مستخدم غير معروف)'
                                : 'لم يتم التأكيد بعد')
                        }
                      </div>
                    </div>
                  </div>
                )}

                {/* Rendezvous Info */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold mb-2">معلومات الموعد</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="font-medium">التاريخ:</span> {formatDate(r.rendezvous_date)}
                    </div>
                    <div>
                      <span className="font-medium">الوقت:</span> {r.rendezvous_time}
                    </div>
                    {r.notes && (
                      <div className="sm:col-span-2">
                        <span className="font-medium">ملاحظات:</span> {r.notes}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

