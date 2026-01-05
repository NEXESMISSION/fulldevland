import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { sanitizeText, sanitizeEmail, sanitizePhone, sanitizeCIN, sanitizeNotes, validateLebanesePhone } from '@/lib/sanitize'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { debounce } from '@/lib/throttle'
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
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, User, Eye, ShoppingCart, AlertCircle } from 'lucide-react'
import type { Client, Sale, Reservation } from '@/types/database'

interface ClientWithRelations extends Client {
  sales?: Sale[]
  reservations?: Reservation[]
}

export function Clients() {
  const { hasPermission, user } = useAuth()
  const [clients, setClients] = useState<ClientWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  
  // Debounced search
  const debouncedSearchFn = useCallback(
    debounce((value: string) => setDebouncedSearchTerm(value), 300),
    []
  )

  // Client dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [form, setForm] = useState({
    name: '',
    cin: '',
    phone: '',
    email: '',
    address: '',
    client_type: 'Individual',
    notes: '',
  })

  // Details dialog
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [selectedClient, setSelectedClient] = useState<ClientWithRelations | null>(null)

  useEffect(() => {
    fetchClients()
  }, [])

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          sales (*),
          reservations (*)
        `)
        .order('name', { ascending: true })

      if (error) throw error
      setClients((data as ClientWithRelations[]) || [])
    } catch (error) {
      // Error fetching clients - silent fail
    } finally {
      setLoading(false)
    }
  }

  const openDialog = (client?: Client) => {
    if (client) {
      setEditingClient(client)
      setForm({
        name: client.name,
        cin: client.cin,
        phone: client.phone || '',
        email: client.email || '',
        address: client.address || '',
        client_type: client.client_type,
        notes: client.notes || '',
      })
    } else {
      setEditingClient(null)
      setForm({
        name: '',
        cin: '',
        phone: '',
        email: '',
        address: '',
        client_type: 'Individual',
        notes: '',
      })
    }
    setDialogOpen(true)
  }

  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [clientToDelete, setClientToDelete] = useState<string | null>(null)

  const saveClient = async () => {
    if (saving) return // Prevent double submission
    
    // Authorization check
    if (editingClient && !hasPermission('edit_clients')) {
      setErrorMessage('ليس لديك صلاحية لتعديل العملاء')
      return
    }
    if (!editingClient && !hasPermission('edit_clients')) {
      setErrorMessage('ليس لديك صلاحية لإضافة عملاء')
      return
    }
    
    setSaving(true)
    setErrorMessage(null)
    
    try {
      // Validate CIN is not empty
      if (!form.cin.trim()) {
        setErrorMessage('رقم CIN مطلوب')
        setSaving(false)
        return
      }

      // Validate phone is not empty (required only, no format check)
      if (!form.phone.trim()) {
        setErrorMessage('رقم الهاتف مطلوب')
        setSaving(false)
        return
      }

      // Sanitize all inputs
      const sanitizedCIN = sanitizeCIN(form.cin)
      if (!sanitizedCIN) {
        setErrorMessage('رقم CIN غير صالح')
        setSaving(false)
        return
      }

      // Sanitize phone (no format validation, just required)
      const sanitizedPhone = sanitizePhone(form.phone)

      // Check for duplicate CIN (only for new clients or if CIN changed)
      if (!editingClient || editingClient.cin !== sanitizedCIN) {
        const { data: existingClient } = await supabase
          .from('clients')
          .select('id, name')
          .eq('cin', sanitizedCIN)
          .limit(1)

        if (existingClient && existingClient.length > 0) {
          setErrorMessage(`عميل برقم CIN "${sanitizedCIN}" موجود بالفعل: ${existingClient[0].name}`)
          setSaving(false)
          return
        }
      }

      const clientData: any = {
        name: sanitizeText(form.name),
        cin: sanitizedCIN,
        phone: sanitizedPhone, // Now required, so always set
        email: form.email ? sanitizeEmail(form.email) : null,
        address: form.address ? sanitizeText(form.address) : null,
        client_type: form.client_type,
        notes: form.notes ? sanitizeNotes(form.notes) : null,
      }

      // Only add created_by for new clients
      if (!editingClient) {
        clientData.created_by = user?.id || null
      }

      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', editingClient.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('clients')
          .insert([clientData])
        if (error) throw error
      }

      setDialogOpen(false)
      fetchClients()
    } catch (error) {
      setErrorMessage('خطأ في حفظ العميل')
    } finally {
      setSaving(false)
    }
  }

  const deleteClient = async (clientId: string) => {
    setClientToDelete(clientId)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!clientToDelete) return

    try {
      const { error } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientToDelete)
      if (error) throw error
      fetchClients()
      setDeleteConfirmOpen(false)
      setClientToDelete(null)
    } catch (error) {
      setErrorMessage('خطأ في حذف العميل')
      setDeleteConfirmOpen(false)
      setClientToDelete(null)
    }
  }

  const viewDetails = async (client: ClientWithRelations) => {
    setSelectedClient(client)
    setDetailsOpen(true)
    
    // Fetch land pieces for all sales
    if (client.sales && client.sales.length > 0) {
      try {
        const allPieceIds = new Set<string>()
        client.sales.forEach((sale: any) => {
          if (sale.land_piece_ids) {
            sale.land_piece_ids.forEach((id: string) => allPieceIds.add(id))
          }
        })
        
        if (allPieceIds.size > 0) {
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
            
            // Attach piece info to sales
            const updatedSales = client.sales.map((sale: any) => {
              if (sale.land_piece_ids) {
                sale._landPieces = sale.land_piece_ids
                  .map((id: string) => piecesMap.get(id))
                  .filter(Boolean)
              }
              return sale
            })
            
            // Update selected client with land pieces
            setSelectedClient({
              ...client,
              sales: updatedSales
            })
          }
        }
      } catch (err) {
        console.error('Error processing land pieces:', err)
        // Continue without land pieces data
      }
    }
  }

  const filteredClients = useMemo(() => {
    if (!debouncedSearchTerm) return clients
    const search = debouncedSearchTerm.toLowerCase()
    return clients.filter((client) => (
      client.name.toLowerCase().includes(search) ||
      client.cin.toLowerCase().includes(search) ||
      (client.phone && client.phone.toLowerCase().includes(search))
    ))
  }, [clients, debouncedSearchTerm])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading clients...</div>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4 md:space-y-6 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">إدارة العملاء</h1>
          <p className="text-muted-foreground text-xs sm:text-sm md:text-base mt-1">إدارة عملائك ومعلوماتهم</p>
        </div>
        {hasPermission('edit_clients') && (
          <Button onClick={() => openDialog()} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            إضافة عميل
          </Button>
        )}
      </div>

      {/* Search */}
      <Card>
        <CardContent className="p-3 sm:p-4 md:p-6 pt-4 sm:pt-5 md:pt-6">
          <Input
            placeholder="البحث بالاسم، رقم الهوية، أو الهاتف..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              debouncedSearchFn(e.target.value)
            }}
            maxLength={255}
            className="text-sm sm:text-base"
          />
        </CardContent>
      </Card>

      {/* Clients - Mobile Card View / Desktop Table View */}
      {filteredClients.length === 0 ? (
      <Card>
          <CardContent className="p-6">
            <p className="text-center text-muted-foreground text-sm sm:text-base">لا توجد عملاء</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card View */}
          <div className="space-y-3 md:hidden">
            {filteredClients.map((client) => (
              <Card key={client.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-sm truncate">{client.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {client.cin}
                          </div>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {client.client_type === 'Individual' ? 'فردي' : 'شركة'}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">الهاتف:</span>
                        <span className="font-medium">{client.phone || '-'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <ShoppingCart className="h-3 w-3 text-muted-foreground" />
                        <span className="text-muted-foreground">المبيعات:</span>
                        <span className="font-medium">{client.sales?.length || 0}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 pt-2 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 text-xs h-8"
                        onClick={() => viewDetails(client)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        التفاصيل
                      </Button>
                      {hasPermission('edit_clients') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 text-xs h-8"
                          onClick={() => openDialog(client)}
                        >
                          <Edit className="h-3 w-3 mr-1" />
                          تعديل
                        </Button>
                      )}
                      {hasPermission('delete_clients') && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-8"
                          onClick={() => deleteClient(client.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop Table View */}
          <Card className="hidden md:block">
        <CardContent className="p-0 sm:p-3 md:p-6 pt-3 sm:pt-4 md:pt-6">
              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                <Table className="min-w-full text-xs sm:text-sm md:text-base">
              <TableHeader>
                <TableRow>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">الاسم</TableHead>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">رقم الهوية</TableHead>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">الهاتف</TableHead>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">النوع</TableHead>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">المبيعات</TableHead>
                      <TableHead className="text-xs sm:text-sm whitespace-nowrap">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                      <TableRow key={client.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {client.name}
                      </div>
                    </TableCell>
                        <TableCell className="text-xs sm:text-sm">{client.cin}</TableCell>
                        <TableCell className="text-xs sm:text-sm">{client.phone || '-'}</TableCell>
                    <TableCell>
                          <Badge variant="secondary" className="text-xs">
                        {client.client_type === 'Individual' ? 'فردي' : 'شركة'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                            <span className="text-xs sm:text-sm">{client.sales?.length || 0}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                              className="h-8 w-8"
                          onClick={() => viewDetails(client)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {hasPermission('edit_clients') && (
                          <Button
                            variant="ghost"
                            size="icon"
                                className="h-8 w-8"
                            onClick={() => openDialog(client)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {hasPermission('delete_clients') && (
                          <Button
                            variant="ghost"
                            size="icon"
                                className="h-8 w-8"
                            onClick={() => deleteClient(client.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
        </CardContent>
      </Card>
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        description="هل أنت متأكد من حذف هذا العميل؟ لا يمكن التراجع عن هذا الإجراء."
        confirmText="حذف"
        cancelText="إلغاء"
        variant="destructive"
      />

      {/* Client Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingClient ? 'تعديل العميل' : 'إضافة عميل جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="name" className="text-xs sm:text-sm">الاسم</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={255}
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="cin" className="text-xs sm:text-sm">رقم الهوية</Label>
                <Input
                  id="cin"
                  value={form.cin}
                  onChange={(e) => setForm({ ...form, cin: e.target.value })}
                  maxLength={50}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="phone" className="text-xs sm:text-sm">الهاتف</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  maxLength={20}
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="email" className="text-xs sm:text-sm">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  maxLength={254}
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="address" className="text-xs sm:text-sm">العنوان</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                maxLength={500}
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="notes" className="text-xs sm:text-sm">ملاحظات</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                maxLength={5000}
                className="min-h-[80px] sm:min-h-[100px]"
              />
            </div>
            {errorMessage && (
              <div className="bg-destructive/10 border-2 border-destructive/30 text-destructive p-3 sm:p-4 rounded-lg text-xs sm:text-sm flex items-start gap-2 shadow-md">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p className="flex-1 font-medium break-words">{errorMessage}</p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => {
              setDialogOpen(false)
              setErrorMessage(null)
            }} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button onClick={saveClient} disabled={saving} className="w-full sm:w-auto">حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تفاصيل العميل</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">الاسم</p>
                  <p className="font-medium text-sm sm:text-base">{selectedClient.name}</p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">رقم CIN</p>
                  <p className="font-medium text-sm sm:text-base">{selectedClient.cin}</p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">رقم الهاتف</p>
                  <p className="font-medium text-sm sm:text-base">{selectedClient.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground mb-1">البريد الإلكتروني</p>
                  <p className="font-medium text-sm sm:text-base">{selectedClient.email || '-'}</p>
                </div>
                {selectedClient.address && (
                  <div className="sm:col-span-2">
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">العنوان</p>
                    <p className="font-medium text-sm sm:text-base">{selectedClient.address}</p>
                  </div>
                )}
              </div>

              {selectedClient.sales && selectedClient.sales.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2 sm:mb-3 text-base sm:text-lg">سجل المبيعات</h4>
                  <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
                  <Table className="text-xs sm:text-sm">
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
                      {selectedClient.sales
                        .sort((a, b) => new Date(b.sale_date).getTime() - new Date(a.sale_date).getTime()) // Sort by date descending (newest first)
                        .map((sale) => {
                          const landPieces = (sale as any)._landPieces || []
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
                                  {sale.status === 'Completed' ? 'مباع' :
                                   sale.status === 'Cancelled' ? 'ملغي' :
                                   (sale as any).is_confirmed || (sale as any).big_advance_confirmed ? 'قيد الدفع' :
                                   'غير مؤكد'}
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
