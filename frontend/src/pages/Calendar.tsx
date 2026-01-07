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
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Clock, X, Edit } from 'lucide-react'
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
  const { user } = useAuth()
  const { t } = useLanguage()
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
            client:clients(*)
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
    setSelectedDate(dateStr)
    setSelectedDateRendezvous(rendezvousByDate[dateStr] || [])
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
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3">
            <CardTitle className="text-xl sm:text-2xl font-bold text-center sm:text-right">تقويم المواعيد</CardTitle>
            <div className="flex items-center justify-center gap-2 sm:gap-3">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={goToToday}
                className="text-xs sm:text-sm px-3 sm:px-4 h-9 sm:h-10 shrink-0"
              >
                اليوم
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={goToPreviousMonth}
                className="h-9 w-9 sm:h-10 sm:w-10 p-0 flex items-center justify-center shrink-0"
              >
                <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <span className="text-base sm:text-lg font-semibold text-center px-2 sm:px-4 min-w-[140px] sm:min-w-[200px]">
                {monthNames[currentMonth]} {currentYear}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={goToNextMonth}
                className="h-9 w-9 sm:h-10 sm:w-10 p-0 flex items-center justify-center shrink-0"
              >
                <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">جاري التحميل...</div>
          ) : (
            <div className="grid grid-cols-7 gap-2">
              {/* Day headers */}
              {dayNames.map((day, index) => (
                <div key={index} className="text-center font-semibold text-sm py-2 border-b">
                  {day}
                </div>
              ))}

              {/* Empty cells for days before month starts */}
              {Array.from({ length: startingDayOfWeek }).map((_, index) => (
                <div key={`empty-${index}`} className="aspect-square" />
              ))}

              {/* Days of the month */}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((date) => {
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
                const dayRendezvous = rendezvousByDate[dateStr] || []
                const hasRendezvous = dayRendezvous.length > 0

                return (
                  <div
                    key={date}
                    onClick={() => handleDateClick(date)}
                    className={`
                      aspect-square border rounded-lg p-1 cursor-pointer transition-colors
                      ${isToday(date) ? 'bg-primary/10 border-primary' : 'border-gray-200 hover:border-primary/50'}
                      ${hasRendezvous ? 'bg-blue-50' : ''}
                    `}
                  >
                    <div className="flex flex-col h-full">
                      <div className={`text-sm font-medium ${isToday(date) ? 'text-primary' : ''}`}>
                        {date}
                      </div>
                      {hasRendezvous && (
                        <div className="mt-1 flex-1 flex items-center justify-center">
                          <Badge variant="default" className="text-xs">
                            {dayRendezvous.length}
                          </Badge>
                        </div>
                      )}
                    </div>
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
              {selectedDateRendezvous.map((r) => (
                <Card key={r.id} className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold">{r.rendezvous_time}</span>
                        </div>
                        <p className="font-medium text-sm mb-1">
                          العميل: {r.sale?.client?.name || 'غير معروف'}
                        </p>
                        <p className="text-xs text-muted-foreground mb-1">
                          رقم البيع: #{r.sale_id.slice(0, 8)}
                        </p>
                        {r.notes && (
                          <p className="text-xs text-muted-foreground mt-2">{r.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-2">
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
              ))}
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
    </div>
  )
}

