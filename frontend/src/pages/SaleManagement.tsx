import { useEffect, useState } from 'react'
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
import {
  RotateCcw,
  Trash2,
  Eye,
  Search,
  Filter,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  DollarSign,
  Calendar,
  User,
  MapPin,
  FileText,
  Settings,
} from 'lucide-react'
import type { Sale, Client, LandPiece, Installment, Payment } from '@/types/database'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { showNotification } from '@/components/ui/notification'

type SaleStatus = 'Pending' | 'Completed' | 'Cancelled'
type PaymentType = 'Full' | 'Installment' | 'PromiseOfSale'

interface SaleWithDetails extends Sale {
  client: Client | null
  pieces: LandPiece[]
  installments: Installment[]
  payments: Payment[]
}

export function SaleManagement() {
  const { hasPermission } = useAuth()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [sales, setSales] = useState<SaleWithDetails[]>([])
  const [filteredSales, setFilteredSales] = useState<SaleWithDetails[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<SaleStatus | 'all'>('all')
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<PaymentType | 'all'>('all')
  
  // Dialogs
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [undoDialogOpen, setUndoDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [resetInstallmentsDialogOpen, setResetInstallmentsDialogOpen] = useState(false)
  const [selectedSale, setSelectedSale] = useState<SaleWithDetails | null>(null)
  
  // Actions
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    if (!hasPermission('edit_sales')) return
    fetchSales()
  }, [hasPermission])

  useEffect(() => {
    filterSales()
  }, [sales, searchTerm, statusFilter, paymentTypeFilter])

  const fetchSales = async () => {
    try {
      setLoading(true)
      
      // Fetch sales with client and contract editor
      const { data: salesData, error: salesError } = await supabase
        .from('sales')
        .select(`
          *,
          client:clients(*),
          contract_editor:contract_editors(*)
        `)
        .order('created_at', { ascending: false })

      if (salesError) throw salesError

      // Fetch pieces for each sale
      const salesWithDetails: SaleWithDetails[] = await Promise.all(
        (salesData || []).map(async (sale: any) => {
          const pieceIds = sale.land_piece_ids || []
          
          // Fetch pieces
          const { data: piecesData } = await supabase
            .from('land_pieces')
            .select('*, land_batch:land_batches(*)')
            .in('id', pieceIds)

          // Fetch installments
          const { data: installmentsData } = await supabase
            .from('installments')
            .select('*')
            .eq('sale_id', sale.id)
            .order('installment_number', { ascending: true })

          // Fetch payments
          const { data: paymentsData } = await supabase
            .from('payments')
            .select('*')
            .eq('sale_id', sale.id)
            .order('payment_date', { ascending: false })

          return {
            ...sale,
            client: sale.client,
            pieces: piecesData || [],
            installments: installmentsData || [],
            payments: paymentsData || [],
          }
        })
      )

      setSales(salesWithDetails)
    } catch (error: any) {
      console.error('Error fetching sales:', error)
      showNotification('خطأ في تحميل المبيعات', 'error')
    } finally {
      setLoading(false)
    }
  }

  const filterSales = () => {
    let filtered = [...sales]

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(sale => 
        sale.client?.name?.toLowerCase().includes(term) ||
        sale.client?.cin?.includes(term) ||
        sale.client?.phone?.includes(term) ||
        sale.id.toLowerCase().includes(term)
      )
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(sale => sale.status === statusFilter)
    }

    // Payment type filter
    if (paymentTypeFilter !== 'all') {
      filtered = filtered.filter(sale => sale.payment_type === paymentTypeFilter)
    }

    setFilteredSales(filtered)
  }

  const handleUndoSale = async () => {
    if (!selectedSale) return

    try {
      setActionLoading(true)

      // Step 1: Reset installments
      const { error: instError } = await supabase
        .from('installments')
        .update({
          amount_paid: 0,
          stacked_amount: 0,
          status: 'Unpaid',
          paid_date: null,
        })
        .eq('sale_id', selectedSale.id)

      if (instError) throw instError

      // Step 2: Delete payments
      const { error: payError } = await supabase
        .from('payments')
        .delete()
        .eq('sale_id', selectedSale.id)

      if (payError) throw payError

      // Step 3: Reset sale status
      const { error: saleError } = await supabase
        .from('sales')
        .update({
          status: 'Pending',
          big_advance_amount: 0,
          promise_completed: false,
          promise_initial_payment: 0,
        })
        .eq('id', selectedSale.id)

      if (saleError) throw saleError

      // Step 4: Reset piece status
      const pieceIds = selectedSale.land_piece_ids || []
      if (pieceIds.length > 0) {
        const { error: pieceError } = await supabase
          .from('land_pieces')
          .update({ status: 'Reserved' })
          .in('id', pieceIds)
          .eq('status', 'Sold')

        if (pieceError) throw pieceError
      }

      showNotification('تم إرجاع البيع بنجاح', 'success')
      setUndoDialogOpen(false)
      setSelectedSale(null)
      await fetchSales()
    } catch (error: any) {
      console.error('Error undoing sale:', error)
      showNotification('خطأ في إرجاع البيع', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDeleteSale = async () => {
    console.log('[handleDeleteSale] Starting deletion, selectedSale:', selectedSale?.id)
    if (!selectedSale) {
      console.error('[handleDeleteSale] No sale selected')
      showNotification('لم يتم اختيار بيع للحذف', 'error')
      return
    }

    try {
      setActionLoading(true)
      console.log('[handleDeleteSale] Action loading set to true')

      // Use the database function to delete sale and all related data
      // This function bypasses RLS and handles all deletions in the correct order
      console.log('[handleDeleteSale] Calling delete_sale_completely function for sale:', selectedSale.id)
      const { data: result, error: functionError } = await supabase.rpc('delete_sale_completely', {
        sale_id_to_delete: selectedSale.id
      })

      console.log('[handleDeleteSale] Delete function result:', { result, functionError })
      
      if (functionError) {
        console.error('[handleDeleteSale] Error calling delete_sale_completely function:', functionError)
        
        // Check if it's a permission error
        if (functionError.message?.includes('Only Owners')) {
          throw new Error('فقط المالك يمكنه حذف المبيعات')
        }
        
        throw new Error(`خطأ في حذف البيع: ${functionError.message || functionError.code || 'خطأ غير معروف'}`)
      }

      if (result === true) {
        console.log('[handleDeleteSale] Sale and all related data deleted successfully')
      } else if (result === false) {
        // Sale might not have existed, but related data was cleaned up
        console.warn('[handleDeleteSale] Delete function returned false - sale may not have existed or was already deleted')
        // Still remove from local state since it's gone
        setSales(prevSales => prevSales.filter(s => s.id !== selectedSale.id))
        setFilteredSales(prevFiltered => prevFiltered.filter(s => s.id !== selectedSale.id))
        showNotification('تم حذف البيع (أو كان غير موجود)', 'success')
        setDeleteDialogOpen(false)
        setSelectedSale(null)
        setActionLoading(false)
        return
      } else {
        console.warn('[handleDeleteSale] Delete function returned unexpected value:', result)
        // Assume success if no error
      }

      console.log('[handleDeleteSale] Deletion successful')
      
      // Remove the sale from the local state immediately
      setSales(prevSales => prevSales.filter(s => s.id !== selectedSale.id))
      setFilteredSales(prevFiltered => prevFiltered.filter(s => s.id !== selectedSale.id))
      
      showNotification('تم حذف البيع بنجاح', 'success')
      setDeleteDialogOpen(false)
      setSelectedSale(null)
      
      // Don't refresh from database immediately - we've already removed it from local state
      // RLS may prevent us from seeing the deletion, so refreshing would bring it back
      // Only refresh if user manually refreshes the page
      console.log('[handleDeleteSale] Sale removed from local state. Not refreshing from DB to avoid RLS issues.')
    } catch (error: any) {
      console.error('[handleDeleteSale] Error deleting sale:', error)
      const errorMessage = error?.message || error?.code || 'خطأ غير معروف'
      showNotification(`خطأ في حذف البيع: ${errorMessage}`, 'error')
    } finally {
      setActionLoading(false)
      console.log('[handleDeleteSale] Action loading set to false')
    }
  }

  const handleResetInstallments = async () => {
    if (!selectedSale) return

    try {
      setActionLoading(true)

      const { error } = await supabase
        .from('installments')
        .update({
          amount_paid: 0,
          stacked_amount: 0,
          status: 'Unpaid',
          paid_date: null,
        })
        .eq('sale_id', selectedSale.id)

      if (error) throw error

      showNotification('تم إعادة تعيين الأقساط', 'success')
      setResetInstallmentsDialogOpen(false)
      await fetchSales()
    } catch (error: any) {
      console.error('Error resetting installments:', error)
      showNotification('خطأ في إعادة تعيين الأقساط', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return <Badge variant="success" className="text-xs">مكتمل</Badge>
      case 'Pending':
        return <Badge variant="warning" className="text-xs">قيد الانتظار</Badge>
      case 'Cancelled':
        return <Badge variant="destructive" className="text-xs">ملغي</Badge>
      default:
        return <Badge variant="secondary" className="text-xs">{status}</Badge>
    }
  }

  const getPaymentTypeLabel = (type: string) => {
    switch (type) {
      case 'Full':
        return 'بالحاضر'
      case 'Installment':
        return 'بالتقسيط'
      case 'PromiseOfSale':
        return 'وعد بالبيع'
      default:
        return type
    }
  }

  if (!hasPermission('edit_sales')) {
    return (
      <div className="p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
        <p className="text-lg font-semibold">ليس لديك صلاحية للوصول إلى هذه الصفحة</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-6 text-center">
        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
        <p>جاري التحميل...</p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6 sm:h-8 sm:w-8" />
            إدارة المبيعات المتقدمة
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            إدارة وإعادة تعيين وحذف المبيعات والأقساط والمدفوعات
          </p>
        </div>
        <Button onClick={fetchSales} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          تحديث
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="بحث بالعميل، CIN، الهاتف..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pr-10"
              />
            </div>

            {/* Status Filter */}
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="all">جميع الحالات</option>
              <option value="Pending">قيد الانتظار</option>
              <option value="Completed">مكتمل</option>
              <option value="Cancelled">ملغي</option>
            </Select>

            {/* Payment Type Filter */}
            <Select
              value={paymentTypeFilter}
              onChange={(e) => setPaymentTypeFilter(e.target.value as any)}
            >
              <option value="all">جميع الأنواع</option>
              <option value="Full">بالحاضر</option>
              <option value="Installment">بالتقسيط</option>
              <option value="PromiseOfSale">وعد بالبيع</option>
            </Select>

            {/* Stats */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">العدد:</span>
              <span className="font-bold">{filteredSales.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sales Table */}
      <Card>
        <CardHeader>
          <CardTitle>المبيعات ({filteredSales.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-center">القطع</TableHead>
                  <TableHead className="text-center">الحالة</TableHead>
                  <TableHead className="text-center">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSales.length === 0 ? (
                  <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    لا توجد مبيعات
                  </TableCell>
                </TableRow>
                ) : (
                  filteredSales.map((sale) => {
                    const totalPaid = sale.payments.reduce((sum, p) => sum + (p.amount_paid || 0), 0)
                    const totalInstallments = sale.installments.length
                    const paidInstallments = sale.installments.filter(i => i.status === 'Paid').length

                    return (
                      <TableRow key={sale.id}>
                        <TableCell className="text-right">{formatDate(sale.sale_date)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <span className="font-medium">{sale.client?.name || 'غير معروف'}</span>
                            {sale.client?.cin && (
                              <span className="text-xs text-muted-foreground">CIN: {sale.client.cin}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary" className="text-xs">
                            {getPaymentTypeLabel(sale.payment_type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(sale.total_selling_price)}
                        </TableCell>
                        <TableCell className="text-center">
                          {sale.pieces.length} قطعة
                        </TableCell>
                        <TableCell className="text-center">
                          {getStatusBadge(sale.status)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedSale(sale)
                                setDetailsDialogOpen(true)
                              }}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {sale.status === 'Completed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedSale(sale)
                                  setUndoDialogOpen(true)
                                }}
                                className="text-orange-600 hover:text-orange-700"
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedSale(sale)
                                setDeleteDialogOpen(true)
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل البيع</DialogTitle>
          </DialogHeader>
          {selectedSale && (
            <div className="space-y-4">
              {/* Sale Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">معلومات البيع</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">العميل</Label>
                      <p className="font-medium">{selectedSale.client?.name || 'غير معروف'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">CIN</Label>
                      <p>{selectedSale.client?.cin || '-'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">النوع</Label>
                      <p>{getPaymentTypeLabel(selectedSale.payment_type)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">الحالة</Label>
                      <div>{getStatusBadge(selectedSale.status)}</div>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">المبلغ الإجمالي</Label>
                      <p className="font-bold text-lg">{formatCurrency(selectedSale.total_selling_price)}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">المدفوع</Label>
                      <p className="font-bold text-green-600">
                        {formatCurrency(selectedSale.payments.reduce((sum, p) => sum + (p.amount_paid || 0), 0))}
                      </p>
                    </div>
                    {(selectedSale as any).contract_editor && (
                      <div className="col-span-2">
                        <Label className="text-muted-foreground">محرر العقد</Label>
                        <p className="font-medium">
                          {(selectedSale as any).contract_editor.type} - {(selectedSale as any).contract_editor.name} ({(selectedSale as any).contract_editor.place})
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Pieces */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">القطع ({selectedSale.pieces.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {selectedSale.pieces.map((piece) => (
                      <div key={piece.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="font-medium">#{piece.piece_number}</span>
                        <span className="text-sm text-muted-foreground">{piece.surface_area} م²</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Installments */}
              {selectedSale.installments.length > 0 && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">الأقساط ({selectedSale.installments.length})</CardTitle>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setResetInstallmentsDialogOpen(true)
                        }}
                        className="text-orange-600"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        إعادة تعيين
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedSale.installments.map((inst) => (
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
                            <Badge variant={inst.status === 'Paid' ? 'success' : 'secondary'} className="text-xs">
                              {inst.status === 'Paid' ? 'مدفوع' : 'غير مدفوع'}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payments */}
              {selectedSale.payments.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">المدفوعات ({selectedSale.payments.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {selectedSale.payments.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div>
                            <span className="font-medium">{formatCurrency(payment.amount_paid)}</span>
                            <span className="text-sm text-muted-foreground mr-2">
                              ({formatDate(payment.payment_date)})
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {payment.payment_type}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
          <DialogFooter>
            {selectedSale && (() => {
              const hasBigAdvance = (selectedSale.big_advance_amount || 0) > 0
              const hasCompanyFee = (selectedSale.company_fee_amount || 0) > 0
              const canReset = hasBigAdvance || hasCompanyFee
              
              return (
                <>
                  {canReset && (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        if (!confirm('هل أنت متأكد من إرجاع هذا البيع إلى صفحة التأكيد؟ سيتم حذف دفعات التسبقة والعمولة، ولكن سيتم الاحتفاظ بالعربون.')) {
                          return
                        }
                        
                        setActionLoading(true)
                        try {
                          const saleId = selectedSale.id
                          
                          // 1. Delete ALL payment records EXCEPT SmallAdvance (reservation)
                          // First, get all payments for this sale to identify what needs to be deleted
                          const { data: allPayments, error: fetchPaymentsError } = await supabase
                            .from('payments')
                            .select('id, payment_type')
                            .eq('sale_id', saleId)
                          
                          if (fetchPaymentsError) {
                            console.warn('Error fetching payments:', fetchPaymentsError)
                          } else if (allPayments && allPayments.length > 0) {
                            // Filter out SmallAdvance payments (keep those)
                            const paymentsToDelete = allPayments.filter(p => 
                              p.payment_type !== 'SmallAdvance' && p.payment_type !== 'Refund'
                            )
                            
                            if (paymentsToDelete.length > 0) {
                              // Delete all non-SmallAdvance payments by ID
                              const paymentIdsToDelete = paymentsToDelete.map(p => p.id)
                              
                              // Delete in batches to avoid query size limits
                              const batchSize = 100
                              for (let i = 0; i < paymentIdsToDelete.length; i += batchSize) {
                                const batch = paymentIdsToDelete.slice(i, i + batchSize)
                                const { error: deleteError } = await supabase
                                  .from('payments')
                                  .delete()
                                  .in('id', batch)
                                
                                if (deleteError) {
                                  console.warn(`Error deleting payment batch ${i}-${i + batch.length}:`, deleteError)
                                  // Try individual deletes as fallback
                                  for (const paymentId of batch) {
                                    const { error: individualError } = await supabase
                                      .from('payments')
                                      .delete()
                                      .eq('id', paymentId)
                                    
                                    if (individualError) {
                                      console.warn(`Error deleting payment ${paymentId}:`, individualError)
                                    }
                                  }
                                }
                              }
                            }
                          }
                          
                          // 2. Delete all installments (since sale is going back to confirmation, installments shouldn't exist yet)
                          const { error: installmentError } = await supabase
                            .from('installments')
                            .delete()
                            .eq('sale_id', saleId)
                          
                          if (installmentError) throw installmentError
                          
                          // 3. Reset sale fields - clean all confirmation traces
                          // IMPORTANT: Keep small_advance_amount (العربون) - this is the reservation
                          // Reset all confirmation-related fields but keep the sale and client intact
                          const { error: saleError } = await supabase
                            .from('sales')
                            .update({
                              big_advance_amount: 0,
                              company_fee_amount: null,
                              company_fee_percentage: null,
                              company_fee_note: null,
                              confirmed_by: null,
                              status: 'Pending' as any,
                              // Reset installment fields
                              number_of_installments: null,
                              monthly_installment_amount: null,
                              installment_start_date: null,
                              installment_end_date: null,
                              // Reset confirmation flags if they exist
                              big_advance_confirmed: false,
                              is_confirmed: false,
                              // Reset PromiseOfSale fields if applicable
                              promise_completed: false,
                              promise_initial_payment: null,
                              // Keep small_advance_amount - DO NOT RESET
                              // Keep client_id, land_piece_ids, total_selling_price, etc.
                              updated_at: new Date().toISOString(),
                            })
                            .eq('id', saleId)
                          
                          if (saleError) {
                            console.error('Error resetting sale fields:', saleError)
                            throw saleError
                          }
                          
                          // 3b. Reset land pieces status back to Reserved (if they were Sold)
                          // This ensures pieces go back to confirmation page
                          const { data: saleData } = await supabase
                            .from('sales')
                            .select('land_piece_ids')
                            .eq('id', saleId)
                            .single()
                          
                          if (saleData && saleData.land_piece_ids && saleData.land_piece_ids.length > 0) {
                            // Update piece status to Reserved (not Available) since sale still exists
                            const { error: piecesError } = await supabase
                              .from('land_pieces')
                              .update({ status: 'Reserved' } as any)
                              .in('id', saleData.land_piece_ids)
                            
                            if (piecesError) {
                              console.warn('Error updating land pieces status:', piecesError)
                              // Don't throw - sale reset is more important
                            }
                          }
                          
                          // 4. Wait a bit for database to commit
                          await new Promise(resolve => setTimeout(resolve, 500))
                          
                          // 5. Verify the reset was successful
                          const { data: verifySale, error: verifyError } = await supabase
                            .from('sales')
                            .select('id, status, big_advance_amount, company_fee_amount, company_fee_percentage')
                            .eq('id', saleId)
                            .single()
                          
                          if (verifyError) {
                            console.warn('Error verifying sale reset:', verifyError)
                          } else if (verifySale) {
                            // Check if reset was successful
                            const isReset = verifySale.status === 'Pending' &&
                                           (verifySale.big_advance_amount === 0 || verifySale.big_advance_amount === null) &&
                                           (verifySale.company_fee_amount === null || verifySale.company_fee_amount === 0)
                            
                            if (!isReset) {
                              console.warn('Sale reset verification failed - some fields may not have been reset')
                            }
                          }
                          
                          // 6. Refresh data
                          await fetchSales()
                          setDetailsDialogOpen(false)
                          showNotification('تم إرجاع البيع إلى صفحة التأكيد بنجاح - تم حذف جميع البيانات المرتبطة', 'success')
                        } catch (error: any) {
                          console.error('Error resetting sale:', error)
                          showNotification('حدث خطأ أثناء إرجاع البيع: ' + (error.message || 'خطأ غير معروف'), 'error')
                        } finally {
                          setActionLoading(false)
                        }
                      }}
                      disabled={actionLoading}
                      className="text-orange-600 border-orange-600 hover:bg-orange-50"
                    >
                      {actionLoading ? 'جاري الإرجاع...' : 'إرجاع إلى صفحة التأكيد'}
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => setDetailsDialogOpen(false)}>
                    إغلاق
                  </Button>
                </>
              )
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Undo Sale Dialog */}
      <ConfirmDialog
        open={undoDialogOpen}
        onOpenChange={setUndoDialogOpen}
        title="إرجاع البيع إلى صفحة التأكيد"
        description="سيتم إرجاع هذا البيع إلى صفحة التأكيد. سيتم حذف جميع المدفوعات وإعادة تعيين الأقساط. هل أنت متأكد؟"
        confirmText="نعم، إرجاع"
        cancelText="إلغاء"
        onConfirm={handleUndoSale}
        disabled={actionLoading}
        variant="destructive"
      />

      {/* Delete Sale Dialog */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          console.log('[DeleteDialog] onOpenChange called with:', open)
          setDeleteDialogOpen(open)
        }}
        title="حذف البيع"
        description="سيتم حذف هذا البيع وجميع البيانات المرتبطة به (الأقساط، المدفوعات). هذه العملية لا يمكن التراجع عنها. هل أنت متأكد؟"
        confirmText="نعم، حذف"
        cancelText="إلغاء"
        onConfirm={() => {
          console.log('[DeleteDialog] onConfirm called, selectedSale:', selectedSale?.id)
          handleDeleteSale()
        }}
        disabled={actionLoading}
        variant="destructive"
      />

      {/* Reset Installments Dialog */}
      <ConfirmDialog
        open={resetInstallmentsDialogOpen}
        onOpenChange={setResetInstallmentsDialogOpen}
        title="إعادة تعيين الأقساط"
        description="سيتم إعادة تعيين جميع الأقساط إلى غير مدفوعة. هل أنت متأكد؟"
        confirmText="نعم، إعادة تعيين"
        cancelText="إلغاء"
        onConfirm={handleResetInstallments}
        disabled={actionLoading}
        variant="destructive"
      />
    </div>
  )
}

