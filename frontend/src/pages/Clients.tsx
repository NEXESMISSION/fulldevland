import { useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
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
import { Plus, Edit, Trash2, User, Eye, ShoppingCart, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import type { Client, Sale, Reservation } from '@/types/database'

interface ClientWithRelations extends Client {
  sales?: Sale[]
  reservations?: Reservation[]
}

export function Clients() {
  const { hasPermission, user, profile } = useAuth()
  const { t } = useLanguage()
  const [clients, setClients] = useState<ClientWithRelations[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  
  // Debounced search
  const debouncedSearchFn = useMemo(
    () => debounce((value: string) => setDebouncedSearchTerm(value), 300),
    []
  )

  // Client search states
  const [clientSearchStatus, setClientSearchStatus] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle')
  const [searchingClient, setSearchingClient] = useState(false)
  const [foundClient, setFoundClient] = useState<Client | null>(null)

  // Debounced CIN search for client form
  const debouncedCINSearch = useMemo(
    () => debounce(async (cin: string, isEditing: boolean) => {
      // Don't search if editing existing client
      if (isEditing) {
        setFoundClient(null)
        setClientSearchStatus('idle')
        return
      }

      // Only search when CIN is 8 characters or more
      if (!cin || cin.trim().length < 8) {
        setFoundClient(null)
        setClientSearchStatus('idle')
        return
      }

      const sanitizedCIN = sanitizeCIN(cin)
      if (!sanitizedCIN || sanitizedCIN.length < 8) {
        setFoundClient(null)
        setClientSearchStatus('idle')
        return
      }

      setSearchingClient(true)
      setClientSearchStatus('searching')
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .eq('cin', sanitizedCIN)
          .limit(1)
          .single()

        if (!error && data) {
          setFoundClient(data)
          setClientSearchStatus('found')
          // Auto-fill form with found client data
          setForm({
            name: data.name,
            cin: data.cin,
            phone: data.phone || '',
            email: data.email || '',
            address: data.address || '',
            client_type: data.client_type,
            notes: data.notes || '',
          })
        } else {
          setFoundClient(null)
          // Only show "not found" if CIN is long enough to be valid
          if (sanitizedCIN.length >= 4) {
            setClientSearchStatus('not_found')
          } else {
            setClientSearchStatus('idle')
          }
        }
      } catch (error) {
        setFoundClient(null)
        if (sanitizedCIN.length >= 4) {
          setClientSearchStatus('not_found')
        } else {
          setClientSearchStatus('idle')
        }
      } finally {
        setSearchingClient(false)
      }
    }, 400),
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
      setLoading(true)
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          sales (*),
          reservations (*)
        `)
        .order('name', { ascending: true })

      if (error) {
        console.error('Error fetching clients:', error)
        throw error
      }
      
      console.log('Fetched clients:', data?.length || 0)
      setClients((data as ClientWithRelations[]) || [])
    } catch (error) {
      console.error('Error in fetchClients:', error)
      setErrorMessage('خطأ في تحميل قائمة العملاء')
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
      setFoundClient(null)
      setClientSearchStatus('idle')
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
      setFoundClient(null)
      setClientSearchStatus('idle')
    }
    setDialogOpen(true)
  }

  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [clientToDelete, setClientToDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

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
      setErrorMessage(null)
      fetchClients()
    } catch (error: any) {
      console.error('Error saving client:', error)
      setErrorMessage(error?.message || 'خطأ في حفظ العميل')
    } finally {
      setSaving(false)
    }
  }

  const deleteClient = async (clientId: string) => {
    setClientToDelete(clientId)
    setDeleteConfirmOpen(true)
  }

  const confirmDelete = async () => {
    if (!clientToDelete || deleting) return

    setDeleting(true)
    setErrorMessage(null)

    try {
      // Check permissions
      if (!hasPermission('delete_clients')) {
        setErrorMessage('ليس لديك صلاحية لحذف العملاء')
        setDeleting(false)
        return
      }

      // Check if client has sales or reservations
      const client = clients.find(c => c.id === clientToDelete)
      if (client && ((client.sales && client.sales.length > 0) || (client.reservations && client.reservations.length > 0))) {
        setErrorMessage('لا يمكن حذف العميل لأنه لديه مبيعات أو حجوزات مرتبطة به')
        setDeleteConfirmOpen(false)
        setClientToDelete(null)
        setDeleting(false)
        return
      }

      console.log('Attempting to delete client:', clientToDelete)
      console.log('Current user:', user?.id)
      console.log('User profile:', profile)
      console.log('User role:', profile?.role)
      console.log('Has delete permission:', hasPermission('delete_clients'))
      
      // First verify the client exists
      const { data: clientCheck, error: checkError } = await supabase
        .from('clients')
        .select('id, name')
        .eq('id', clientToDelete)
        .single()
      
      if (checkError || !clientCheck) {
        console.error('Client not found:', checkError)
        throw new Error('العميل غير موجود')
      }
      
      console.log('Client found:', clientCheck)
      
      // Try delete without select first to see the actual error
      const { error: deleteError } = await supabase
        .from('clients')
        .delete()
        .eq('id', clientToDelete)
      
      if (deleteError) {
        console.error('Delete error:', deleteError)
        throw deleteError
      }
      
      // Verify deletion by checking if client still exists
      const { data: verifyData, error: verifyError } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientToDelete)
        .single()
      
      if (verifyError && verifyError.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is what we want
        console.error('Verification error:', verifyError)
      }
      
      if (verifyData) {
        console.warn('Client still exists after delete - RLS policy may be blocking')
        throw new Error('فشل الحذف - قد لا يكون لديك صلاحية. يرجى التحقق من صلاحياتك.')
      }
      
      console.log('Delete successful - client removed')
      
      // Remove from local state immediately for better UX
      setClients(prevClients => prevClients.filter(c => c.id !== clientToDelete))
      
      // Then refresh from server to ensure consistency
      await fetchClients()
      
      setDeleteConfirmOpen(false)
      setClientToDelete(null)
      setErrorMessage(null)
    } catch (error: any) {
      console.error('Error deleting client:', error)
      let errorMsg = 'خطأ في حذف العميل'
      
      if (error?.code === '23503' || error?.message?.includes('foreign key')) {
        errorMsg = 'لا يمكن حذف العميل لأنه مرتبط ببيانات أخرى (مبيعات أو حجوزات)'
      } else if (error?.code === '42501' || error?.message?.includes('permission') || error?.message?.includes('403')) {
        errorMsg = 'ليس لديك صلاحية لحذف العملاء'
      } else if (error?.message) {
        errorMsg = `خطأ: ${error.message}`
      }
      
      setErrorMessage(errorMsg)
      // Keep dialog open so user can see the error
      // setDeleteConfirmOpen(false)
      // setClientToDelete(null)
    } finally {
      setDeleting(false)
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

  // Calculate client statistics - MUST be before any conditional returns
  const clientStats = useMemo(() => {
    const total = clients.length
    const withSales = clients.filter(c => c.sales && c.sales.length > 0).length
    const individuals = clients.filter(c => c.client_type === 'Individual').length
    const companies = clients.filter(c => c.client_type === 'Company').length
    return { total, withSales, individuals, companies }
  }, [clients])

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
          <Button onClick={() => openDialog()} className="w-full sm:w-auto">
            <Plus className="mr-2 h-4 w-4" />
            إضافة عميل
          </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{clientStats.total}</p>
            <p className="text-xs text-blue-600">إجمالي العملاء</p>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-700">{clientStats.withSales}</p>
            <p className="text-xs text-green-600">لديهم مبيعات</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-50 border-purple-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-purple-700">{clientStats.individuals}</p>
            <p className="text-xs text-purple-600">أفراد</p>
          </CardContent>
        </Card>
        <Card className="bg-orange-50 border-orange-200">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-orange-700">{clientStats.companies}</p>
            <p className="text-xs text-orange-600">شركات</p>
          </CardContent>
        </Card>
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
                          type="button"
                          variant="outline"
                          size="sm"
                          className="text-xs h-8"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            deleteClient(client.id)
                          }}
                          onTouchEnd={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            deleteClient(client.id)
                          }}
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
                            type="button"
                            variant="ghost"
                            size="icon"
                                className="h-8 w-8"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              deleteClient(client.id)
                            }}
                            onTouchEnd={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              deleteClient(client.id)
                            }}
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
        onOpenChange={(open) => {
          if (!open && !deleting) {
            setDeleteConfirmOpen(false)
            setClientToDelete(null)
            setErrorMessage(null)
          }
        }}
        onConfirm={confirmDelete}
        title="تأكيد الحذف"
        description="هل أنت متأكد من حذف هذا العميل؟ لا يمكن التراجع عن هذا الإجراء."
        confirmText={deleting ? 'جاري الحذف...' : 'حذف'}
        cancelText="إلغاء"
        variant="destructive"
        disabled={deleting}
        errorMessage={errorMessage}
      />

      {/* Client Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!open && !saving) {
          setDialogOpen(false)
          setErrorMessage(null)
        }
      }}>
          <DialogContent 
            className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto"
            preventClose={saving}
          >
          <DialogHeader>
            <DialogTitle>{editingClient ? 'تعديل العميل' : 'إضافة عميل جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4">
            {/* CIN Field - First Field */}
              <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="cin" className="text-xs sm:text-sm">رقم الهوية *</Label>
              <Input
                id="cin"
                value={form.cin}
                onChange={(e) => {
                  const newCIN = e.target.value
                  setForm({ ...form, cin: newCIN })
                  // Clear found client if CIN changes
                  if (foundClient && newCIN !== foundClient.cin) {
                    setFoundClient(null)
                    setClientSearchStatus('idle')
                  }
                  // Trigger search only if not editing and CIN is 8+ chars
                  debouncedCINSearch(newCIN, !!editingClient)
                }}
                maxLength={50}
                placeholder="رقم الهوية (8 أرقام)"
                className={`h-9 ${clientSearchStatus === 'found' ? 'border-green-500' : ''}`}
                autoFocus={!editingClient}
                disabled={!!editingClient}
              />
              {searchingClient && form.cin.trim().length >= 8 && (
                <p className="text-xs text-gray-500 mt-1">جاري البحث...</p>
              )}
              {foundClient && form.cin.trim().length >= 8 && !editingClient && (
                <p className="text-xs text-green-600 mt-1">
                  ✓ تم العثور على عميل: {foundClient.name} | CIN: {foundClient.cin} {foundClient.phone && `| الهاتف: ${foundClient.phone}`}
                </p>
              )}
              {clientSearchStatus === 'not_found' && !foundClient && form.cin.trim().length >= 8 && !editingClient && (
                <p className="text-xs text-blue-600 mt-1">
                  لا يوجد عميل بهذا الرقم - يمكنك المتابعة لإضافة عميل جديد
                </p>
              )}
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="name" className="text-xs sm:text-sm">الاسم *</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  maxLength={255}
                />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label htmlFor="phone" className="text-xs sm:text-sm">الهاتف</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  maxLength={50}
                  placeholder="مثال: 5822092120192614/10/593"
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
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="client_type" className="text-xs sm:text-sm">النوع</Label>
              <select
                id="client_type"
                value={form.client_type}
                onChange={(e) => setForm({ ...form, client_type: e.target.value as 'Individual' | 'Company' })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="Individual">فردي</option>
                <option value="Company">شركة</option>
              </select>
            </div>
            {errorMessage && (
              <div className="bg-destructive/10 border-2 border-destructive/30 text-destructive p-3 sm:p-4 rounded-lg text-xs sm:text-sm flex items-start gap-2 shadow-md">
                <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                <p className="flex-1 font-medium break-words">{errorMessage}</p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button 
              type="button"
              variant="outline" 
              onClick={() => {
              setDialogOpen(false)
              setErrorMessage(null)
                setFoundClient(null)
                setClientSearchStatus('idle')
              }} 
              className="w-full sm:w-auto"
            >
              إلغاء
            </Button>
            <Button 
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                saveClient()
              }}
              onTouchEnd={(e) => {
                e.preventDefault()
                e.stopPropagation()
                if (!saving) {
                  saveClient()
                }
              }}
              disabled={saving} 
              className="w-full sm:w-auto touch-manipulation"
            >
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </Button>
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
                          // Format: "#6 (tanyour)" or just "#6" if no batch
                          const pieceDisplay = landPieces.map((p: any) => {
                            if (!p?.piece_number) return null
                            const batchName = p?.land_batch?.name
                            return batchName ? `#${p.piece_number} (${batchName})` : `#${p.piece_number}`
                          }).filter(Boolean).join('، ')
                          
                          // Fallback: if no piece data, show count
                          const pieceCount = sale.land_piece_ids?.length || 0
                          const displayText = pieceDisplay || (pieceCount > 0 ? `${pieceCount} قطعة` : '-')
                          
                          return (
                            <TableRow key={sale.id} className="hover:bg-blue-50/50 transition-colors">
                              <TableCell className="font-medium">{formatDate(sale.sale_date)}</TableCell>
                              <TableCell>
                                <Badge variant={sale.payment_type === 'Full' ? 'success' : 'secondary'} className="text-xs">
                                  {sale.payment_type === 'Full' ? 'بالحاضر' : 'بالتقسيط'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {pieceDisplay ? (
                                  <div className="flex flex-wrap gap-1">
                                    {landPieces.map((p: any, idx: number) => {
                                      if (!p?.piece_number) return null
                                      const batchName = p?.land_batch?.name
                                      return (
                                        <Badge key={idx} variant="outline" className="text-xs">
                                          #{p.piece_number}{batchName ? ` (${batchName})` : ''}
                                        </Badge>
                                      )
                                    })}
                                  </div>
                                ) : pieceCount > 0 ? (
                                  <span className="text-muted-foreground text-xs">{pieceCount} قطعة</span>
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
    </div>
  )
}
