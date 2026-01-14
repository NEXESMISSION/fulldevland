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
import { showNotification } from '@/components/ui/notification'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Phone, Plus, Calendar as CalendarIcon, CheckCircle2, XCircle, Clock, MapPin, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import type { LandBatch } from '@/types/database'

interface PhoneCall {
  id: string
  phone_number: string
  name: string
  rendezvous_time: string
  land_batch_id: string | null
  motorized: 'motorisé' | 'non motorisé'
  status: 'pending' | 'done' | 'not_done'
  notes: string | null
  created_at: string
  updated_at: string
  land_batch?: LandBatch | null
}

type DateFilter = 'today' | 'week' | 'all' | 'custom'

export function PhoneCalls() {
  const { user, profile } = useAuth()
  const { t, language } = useLanguage()
  const isOwner = profile?.role === 'Owner'
  const [phoneCalls, setPhoneCalls] = useState<PhoneCall[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dateFilter, setDateFilter] = useState<DateFilter>('today')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedDateForPopup, setSelectedDateForPopup] = useState<string | null>(null)
  const [batches, setBatches] = useState<LandBatch[]>([])
  
  const [form, setForm] = useState({
    phone_number: '',
    name: '',
    rendezvous_datetime: '',
    land_batch_id: '',
    motorized: 'non motorisé' as 'motorisé' | 'non motorisé',
  })

  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null)
  const [statusNote, setStatusNote] = useState('')
  const [currentCalendarDate, setCurrentCalendarDate] = useState(new Date())
  const [deletingCallId, setDeletingCallId] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [callToDelete, setCallToDelete] = useState<PhoneCall | null>(null)

  useEffect(() => {
    fetchPhoneCalls()
    fetchBatches()
    
    // Set up realtime subscription for phone calls
    const phoneCallsChannel = supabase
      .channel('phone-calls-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'phone_calls',
        },
        () => {
          // Refresh phone calls when any change occurs
          fetchPhoneCalls()
        }
      )
      .subscribe()
    
    return () => {
      supabase.removeChannel(phoneCallsChannel)
    }
  }, [currentCalendarDate]) // Fetch when calendar month changes

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('land_batches')
        .select('id, name')
        .order('name', { ascending: true })

      if (error) throw error
      setBatches((data || []) as LandBatch[])
    } catch (err) {
      console.error('Error fetching batches:', err)
    }
  }

  const fetchPhoneCalls = async () => {
    try {
      setLoading(true)
      
      // For calendar view, fetch all calls for the displayed month
      const calendarYear = currentCalendarDate.getFullYear()
      const calendarMonth = currentCalendarDate.getMonth()
      const monthStart = new Date(calendarYear, calendarMonth, 1)
      const monthEnd = new Date(calendarYear, calendarMonth + 1, 0, 23, 59, 59, 999)
      
      let query = supabase
        .from('phone_calls')
        .select(`
          *,
          land_batch:land_batches(id, name)
        `)
        .gte('rendezvous_time', monthStart.toISOString())
        .lte('rendezvous_time', monthEnd.toISOString())
        .order('rendezvous_time', { ascending: true })

      const { data, error } = await query

      if (error) throw error
      setPhoneCalls((data || []) as PhoneCall[])
    } catch (err) {
      console.error('Error fetching phone calls:', err)
      showNotification(t('phoneCalls.errorCreating'), 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!form.phone_number || !form.name || !form.rendezvous_datetime) {
      showNotification(t('phoneCalls.requiredFields'), 'error')
      return
    }

    try {
      const rendezvousDateTime = new Date(form.rendezvous_datetime).toISOString()

      const { error } = await supabase
        .from('phone_calls')
        .insert([{
          phone_number: form.phone_number,
          name: form.name,
          rendezvous_time: rendezvousDateTime,
          land_batch_id: form.land_batch_id || null,
          motorized: form.motorized,
          created_by: user?.id || null,
        }])

      if (error) throw error

      showNotification(t('phoneCalls.successCreating'), 'success')
      setDialogOpen(false)
      setForm({
        phone_number: '',
        name: '',
        rendezvous_datetime: '',
        land_batch_id: '',
        motorized: 'non motorisé',
      })
      fetchPhoneCalls()
    } catch (err) {
      console.error('Error creating phone call:', err)
      showNotification(t('phoneCalls.errorCreating'), 'error')
    }
  }

  const handleUpdateStatus = async (callId: string, status: 'done' | 'not_done') => {
    setUpdatingStatus(callId)
    try {
      const { error } = await supabase
        .from('phone_calls')
        .update({
          status,
          notes: statusNote || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', callId)

      if (error) throw error

      showNotification(t('phoneCalls.updateStatus'), 'success')
      setStatusNote('')
      fetchPhoneCalls()
    } catch (err) {
      console.error('Error updating status:', err)
      showNotification(t('phoneCalls.errorUpdating'), 'error')
    } finally {
      setUpdatingStatus(null)
    }
  }

  const handleDeleteCall = (call: PhoneCall) => {
    setCallToDelete(call)
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteCall = async () => {
    if (!callToDelete) return

    setDeletingCallId(callToDelete.id)
    try {
      const { error } = await supabase
        .from('phone_calls')
        .delete()
        .eq('id', callToDelete.id)

      if (error) throw error

      showNotification('تم حذف الموعد بنجاح', 'success')
      setDeleteConfirmOpen(false)
      setCallToDelete(null)
      fetchPhoneCalls()
    } catch (err) {
      console.error('Error deleting phone call:', err)
      showNotification('حدث خطأ أثناء حذف الموعد', 'error')
    } finally {
      setDeletingCallId(null)
    }
  }

  // Group calls by date for calendar view
  const callsByDate = useMemo(() => {
    const grouped: Record<string, PhoneCall[]> = {}
    phoneCalls.forEach(call => {
      const date = new Date(call.rendezvous_time).toISOString().split('T')[0]
      if (!grouped[date]) {
        grouped[date] = []
      }
      grouped[date].push(call)
    })
    return grouped
  }, [phoneCalls])

  // Get all unique dates
  const allDates = useMemo(() => {
    return Object.keys(callsByDate).sort()
  }, [callsByDate])

  // Get current month dates for calendar
  const currentDate = new Date()
  const currentMonth = currentDate.getMonth()
  const currentYear = currentDate.getFullYear()
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0)
  const daysInMonth = lastDayOfMonth.getDate()
  const startingDayOfWeek = firstDayOfMonth.getDay()

  const isToday = (date: number) => {
    const today = new Date()
    return (
      date === today.getDate() &&
      currentMonth === today.getMonth() &&
      currentYear === today.getFullYear()
    )
  }

  // Get day names based on language
  const locale = language === 'fr' ? 'fr-FR' : 'ar-TN'
  
  const dayNames = useMemo(() => {
    const days = []
    const date = new Date(2024, 0, 7) // Sunday
    for (let i = 0; i < 7; i++) {
      days.push(date.toLocaleDateString(locale, { weekday: 'long' }))
      date.setDate(date.getDate() + 1)
    }
    return days
  }, [locale])

  const filterLabels: Record<DateFilter, string> = {
    today: t('phoneCalls.today'),
    week: t('phoneCalls.thisWeek'),
    all: t('phoneCalls.all'),
    custom: t('phoneCalls.customDate'),
  }

  const monthNames = [
    'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
    'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
  ]

  const goToPreviousMonth = () => {
    setCurrentCalendarDate(new Date(currentYear, currentMonth - 1, 1))
  }

  const goToNextMonth = () => {
    setCurrentCalendarDate(new Date(currentYear, currentMonth + 1, 1))
  }

  const goToToday = () => {
    setCurrentCalendarDate(new Date())
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Phone className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">{t('phoneCalls.title')}</h1>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 ml-2" />
          {t('phoneCalls.addCall')}
        </Button>
      </div>

      {/* Calendar View */}
      <Card className="shadow-lg">
        <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
          <div className="flex flex-col gap-4">
          <div className="flex items-center justify-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <CardTitle className="text-xl font-bold">{t('phoneCalls.calendar')}</CardTitle>
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
              <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-2 sm:gap-3">
              {/* Day headers */}
              {dayNames.map((day, index) => (
                <div key={index} className="text-center font-bold text-xs sm:text-sm py-2 sm:py-3 text-gray-600 bg-gray-50 rounded-lg">
                  {day}
                </div>
              ))}

              {/* Empty cells */}
              {Array.from({ length: startingDayOfWeek }).map((_, index) => (
                <div key={`empty-${index}`} className="aspect-square" />
              ))}

              {/* Days */}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((date) => {
                const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`
                const dayCalls = callsByDate[dateStr] || []
                const hasCalls = dayCalls.length > 0
                const isTodayDate = isToday(date)

                return (
                  <div
                    key={date}
                    onClick={() => setSelectedDateForPopup(dateStr)}
                    className={`
                      aspect-square rounded-xl p-2 sm:p-3 cursor-pointer transition-all duration-200
                      flex flex-col items-center justify-center
                      ${isTodayDate 
                        ? 'bg-gradient-to-br from-primary to-primary/80 text-white shadow-lg ring-2 ring-primary/50' 
                        : hasCalls
                        ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 hover:border-blue-400 hover:shadow-md'
                        : 'bg-white border-2 border-gray-200 hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm'
                      }
                    `}
                  >
                    <div className={`text-base sm:text-lg font-bold ${isTodayDate ? 'text-white' : 'text-gray-800'}`}>
                      {date}
                    </div>
                    {hasCalls && (
                      <div className="mt-1">
                        <Badge 
                          variant={isTodayDate ? "secondary" : "default"} 
                          className={`text-xs font-bold ${
                            isTodayDate 
                              ? 'bg-white/20 text-white border-white/30' 
                              : 'bg-blue-500 text-white border-blue-600'
                          }`}
                        >
                          {dayCalls.length}
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

      {/* Add Phone Call Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md">
          <DialogHeader>
            <DialogTitle>{t('phoneCalls.addCall')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phone">{t('phoneCalls.phoneNumber')} *</Label>
              <Input
                id="phone"
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                placeholder={t('phoneCalls.phoneNumber')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">{t('phoneCalls.name')} *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('phoneCalls.name')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="datetime">{t('phoneCalls.rendezvousDateTime')} *</Label>
              <Input
                id="datetime"
                type="datetime-local"
                value={form.rendezvous_datetime}
                onChange={(e) => setForm({ ...form, rendezvous_datetime: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="land">{t('phoneCalls.landBatch')}</Label>
              <Select
                id="land"
                value={form.land_batch_id}
                onChange={(e) => setForm({ ...form, land_batch_id: e.target.value })}
              >
                <option value="">{t('phoneCalls.selectLand')}</option>
                {batches.map(batch => (
                  <option key={batch.id} value={batch.id}>{batch.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="motorized">{t('phoneCalls.motorized')} *</Label>
              <Select
                id="motorized"
                value={form.motorized}
                onChange={(e) => setForm({ ...form, motorized: e.target.value as 'motorisé' | 'non motorisé' })}
              >
                <option value="non motorisé">{t('phoneCalls.nonMotorizedOption')}</option>
                <option value="motorisé">{t('phoneCalls.motorizedOption')}</option>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit}>
              {t('common.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Date Calls Popup */}
      <Dialog open={selectedDateForPopup !== null} onOpenChange={(open) => !open && setSelectedDateForPopup(null)}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDateForPopup && (() => {
                const date = new Date(selectedDateForPopup)
                return date.toLocaleDateString(locale, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'long'
                })
              })()}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            {selectedDateForPopup && callsByDate[selectedDateForPopup]?.length > 0 ? (
              callsByDate[selectedDateForPopup].map((call) => {
                const callDate = new Date(call.rendezvous_time)
                const timeStr = callDate.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })

                return (
                  <Card key={call.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold text-lg">{call.name}</span>
                            <Badge variant={call.status === 'done' ? 'default' : call.status === 'not_done' ? 'destructive' : 'secondary'}>
                              {call.status === 'done' ? t('phoneCalls.done') : call.status === 'not_done' ? t('phoneCalls.notDone') : t('phoneCalls.pending')}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{timeStr}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              <span>{call.phone_number}</span>
                            </div>
                            {call.land_batch && (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                <span>{call.land_batch.name}</span>
                              </div>
                            )}
                            <Badge variant="outline">
                              {call.motorized === 'motorisé' ? t('phoneCalls.motorizedOption') : t('phoneCalls.nonMotorizedOption')}
                            </Badge>
                          </div>
                          {call.notes && (
                            <p className="text-sm text-muted-foreground mt-2 p-2 bg-gray-50 rounded">
                              {call.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                        {call.status === 'pending' ? (
                          <div className="flex gap-2 w-full sm:w-auto">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setStatusNote('')
                                handleUpdateStatus(call.id, 'done')
                              }}
                              disabled={updatingStatus === call.id}
                              className="flex-1 sm:flex-none bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                            >
                              <CheckCircle2 className="h-4 w-4 ml-1" />
                              {t('phoneCalls.done')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const note = prompt(t('phoneCalls.addNote'))
                                if (note !== null) {
                                  setStatusNote(note)
                                  handleUpdateStatus(call.id, 'not_done')
                                }
                              }}
                              disabled={updatingStatus === call.id}
                              className="flex-1 sm:flex-none bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                            >
                              <XCircle className="h-4 w-4 ml-1" />
                              {t('phoneCalls.notDone')}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {call.status === 'done' && (
                              <Badge variant="default" className="bg-green-100 text-green-700 border-green-200">
                                <CheckCircle2 className="h-3 w-3 ml-1" />
                                {t('phoneCalls.done')}
                              </Badge>
                            )}
                            {call.status === 'not_done' && (
                              <Badge variant="destructive" className="bg-red-100 text-red-700 border-red-200">
                                <XCircle className="h-3 w-3 ml-1" />
                                {t('phoneCalls.notDone')}
                              </Badge>
                            )}
                          </div>
                        )}
                          {isOwner && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDeleteCall(call)}
                              disabled={deletingCallId === call.id}
                              className="w-full sm:w-auto"
                            >
                              <Trash2 className="h-4 w-4 ml-1" />
                              {deletingCallId === call.id ? 'جاري الحذف...' : 'حذف'}
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })
            ) : (
              <div className="text-center py-8">
                <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{t('phoneCalls.noCalls')}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDateForPopup(null)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={confirmDeleteCall}
        title="حذف الموعد"
        description={
          callToDelete
            ? `هل أنت متأكد من حذف موعد ${callToDelete.name} (${callToDelete.phone_number})؟`
            : ''
        }
        confirmText="نعم، حذف"
        cancelText="إلغاء"
        variant="destructive"
        disabled={deletingCallId !== null}
      />
    </div>
  )
}

