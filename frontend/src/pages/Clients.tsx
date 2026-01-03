import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { sanitizeText, sanitizeEmail, sanitizePhone, sanitizeCIN, sanitizeNotes } from '@/lib/sanitize'
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
import { Plus, Edit, Trash2, User, Eye, ShoppingCart } from 'lucide-react'
import type { Client, Sale, Reservation } from '@/types/database'

interface ClientWithRelations extends Client {
  sales?: Sale[]
  reservations?: Reservation[]
}

export function Clients() {
  const { hasPermission } = useAuth()
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

      // Sanitize all inputs
      const sanitizedCIN = sanitizeCIN(form.cin)
      if (!sanitizedCIN) {
        setErrorMessage('رقم CIN غير صالح')
        setSaving(false)
        return
      }

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

      const clientData = {
        name: sanitizeText(form.name),
        cin: sanitizedCIN,
        phone: form.phone ? sanitizePhone(form.phone) : null,
        email: form.email ? sanitizeEmail(form.email) : null,
        address: form.address ? sanitizeText(form.address) : null,
        client_type: form.client_type,
        notes: form.notes ? sanitizeNotes(form.notes) : null,
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

  const viewDetails = (client: ClientWithRelations) => {
    setSelectedClient(client)
    setDetailsOpen(true)
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
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">إدارة العملاء</h1>
          <p className="text-muted-foreground text-sm sm:text-base">إدارة عملائك ومعلوماتهم</p>
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
        <CardContent className="pt-6">
          <Input
            placeholder="البحث بالاسم، رقم الهوية، أو الهاتف..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value)
              debouncedSearchFn(e.target.value)
            }}
            maxLength={255}
          />
        </CardContent>
      </Card>

      {/* Clients Table */}
      <Card>
        <CardContent className="pt-6">
          {filteredClients.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">لا توجد عملاء</p>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>الاسم</TableHead>
                  <TableHead>رقم الهوية</TableHead>
                  <TableHead>الهاتف</TableHead>
                  <TableHead>النوع</TableHead>
                  <TableHead>المبيعات</TableHead>
                  <TableHead>إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {client.name}
                      </div>
                    </TableCell>
                    <TableCell>{client.cin}</TableCell>
                    <TableCell>{client.phone || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {client.client_type === 'Individual' ? 'فردي' : 'شركة'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                        {client.sales?.length || 0}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => viewDetails(client)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {hasPermission('edit_clients') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openDialog(client)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {hasPermission('delete_clients') && (
                          <Button
                            variant="ghost"
                            size="icon"
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
          )}
        </CardContent>
      </Card>

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
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">الاسم</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={255}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cin">رقم الهوية</Label>
                <Input
                  id="cin"
                  value={form.cin}
                  onChange={(e) => setForm({ ...form, cin: e.target.value })}
                  maxLength={50}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">الهاتف</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  maxLength={254}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">العنوان</Label>
              <Input
                id="address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                maxLength={5000}
              />
            </div>
            {errorMessage && (
              <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">
                {errorMessage}
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
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
            <DialogTitle>Client Details</DialogTitle>
          </DialogHeader>
          {selectedClient && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Name</p>
                  <p className="font-medium">{selectedClient.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">CIN</p>
                  <p className="font-medium">{selectedClient.cin}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <p className="font-medium">{selectedClient.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <p className="font-medium">{selectedClient.email || '-'}</p>
                </div>
              </div>

              {selectedClient.sales && selectedClient.sales.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Sales History</h4>
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedClient.sales.map((sale) => (
                        <TableRow key={sale.id}>
                          <TableCell>{formatDate(sale.sale_date)}</TableCell>
                          <TableCell>{sale.payment_type}</TableCell>
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
                              {sale.status}
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
