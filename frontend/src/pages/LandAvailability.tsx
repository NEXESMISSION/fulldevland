import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { debounce } from '@/lib/throttle'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Check, Clock, X, Search, MapPin, Package } from 'lucide-react'
import { showNotification } from '@/components/ui/notification'

interface PieceWithStatus {
  id: string
  piece_number: string | number
  surface_area: number
  purchase_cost: number
  selling_price_full: number
  selling_price_installment: number
  notes?: string | null
  land_batch?: { name: string; id: string; real_estate_tax_number?: string | null; location?: string | null; notes?: string | null }
  status_display: 'Available' | 'Reserved' | 'Sold'
  sale?: any
  reservation?: any
}

export function LandAvailability() {
  const [pieces, setPieces] = useState<PieceWithStatus[]>([])
  const [batches, setBatches] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'Available' | 'Reserved' | 'Sold'>('all')
  const [batchFilter, setBatchFilter] = useState<string>('all')
  const [pieceSearch, setPieceSearch] = useState('')
  const [searchedPieces, setSearchedPieces] = useState<PieceWithStatus[]>([])
  
  const [selectedPiece, setSelectedPiece] = useState<PieceWithStatus | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce((searchValue: string) => {
      if (!searchValue.trim()) {
        setSearchedPieces([])
        return
      }
      
      const filteredByBatch = batchFilter === 'all' 
        ? pieces 
        : pieces.filter(p => p.land_batch?.name === batchFilter)
      
      const found = filteredByBatch.filter(p => {
        const pieceNum = String(p.piece_number)
        const pieceDigits = pieceNum.replace(/\D/g, '')
        const searchDigits = searchValue.replace(/\D/g, '')
        
        if (searchDigits && pieceDigits) {
          const pieceInt = parseInt(pieceDigits, 10)
          const searchInt = parseInt(searchDigits, 10)
          if (!isNaN(pieceInt) && !isNaN(searchInt) && pieceInt === searchInt) {
            return true
          }
        }
        
        const pieceNumLower = pieceNum.toLowerCase()
        const searchLower = searchValue.toLowerCase()
        if (pieceNumLower === searchLower) return true
        
        const normalize = (str: string): string => {
          return str.toLowerCase().replace(/^[p#]/, '').replace(/^0+/, '').trim()
        }
        const pieceNorm = normalize(pieceNum)
        const searchNorm = normalize(searchValue)
        if (pieceNorm && searchNorm && pieceNorm === searchNorm) return true
        
        return false
      })
      setSearchedPieces(found)
    }, 300),
    [pieces, batchFilter]
  )

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      const { data: piecesData, error: piecesError } = await supabase
        .from('land_pieces')
        .select('id, piece_number, surface_area, purchase_cost, selling_price_full, selling_price_installment, status, notes, land_batch:land_batches(name, real_estate_tax_number, location, notes)')
        .order('piece_number', { ascending: true })

      if (piecesError) throw piecesError

      const { data: salesData } = await supabase
        .from('sales')
        .select('*, client:clients(*)')
        .neq('status', 'Cancelled')

      const { data: reservationsData } = await supabase
        .from('reservations')
        .select('*, client:clients(*)')
        .in('status', ['Pending', 'Confirmed'])

      const batchMap = new Map<string, { id: string; name: string }>()
      ;(piecesData || []).forEach((p: any) => {
        if (p.land_batch && p.land_batch.name) {
          const batchName = p.land_batch.name
          if (!batchMap.has(batchName)) {
            batchMap.set(batchName, { 
              id: p.land_batch.id || batchName, 
              name: batchName 
            })
          }
        }
      })
      setBatches(Array.from(batchMap.values()))

      const piecesWithStatus: PieceWithStatus[] = ((piecesData || []) as any[]).map((piece: any) => {
        // Check for completed/confirmed sales first
        const completedSale = ((salesData || []) as any[]).find((s: any) => 
          s.land_piece_ids?.includes(piece.id) && 
          (s.status === 'Completed' || (s as any).is_confirmed === true || (s as any).big_advance_confirmed === true)
        )
        
        // Check for active (non-completed, non-cancelled) sales
        const activeSale = ((salesData || []) as any[]).find((s: any) => 
          s.land_piece_ids?.includes(piece.id) && 
          s.status !== 'Completed' && 
          s.status !== 'Cancelled' &&
          !(s as any).is_confirmed &&
          !(s as any).big_advance_confirmed
        )
        
        // Check for reservations (only if no active sale)
        const reservation = !completedSale && !activeSale ? ((reservationsData || []) as any[]).find((r: any) => 
          r.land_piece_ids?.includes(piece.id) &&
          r.status !== 'Cancelled' &&
          r.status !== 'Expired'
        ) : null

        let status_display: 'Available' | 'Reserved' | 'Sold' = 'Available'
        // Priority: Completed/Confirmed sale > Active sale > Reservation > Available
        if (completedSale) {
          status_display = 'Sold'
        } else if (activeSale || reservation) {
          status_display = 'Reserved'
        }

        return {
          id: piece.id,
          piece_number: piece.piece_number,
          surface_area: piece.surface_area,
          purchase_cost: piece.purchase_cost || 0,
          selling_price_full: piece.selling_price_full || 0,
          selling_price_installment: piece.selling_price_installment || 0,
          notes: piece.notes || null,
          land_batch: piece.land_batch,
          status_display,
          sale: completedSale || activeSale || undefined,
          reservation: reservation || undefined,
        }
      })

      setPieces(piecesWithStatus)
    } catch (error: any) {
      console.error('Error fetching data:', error)
      showNotification('خطأ في تحميل البيانات: ' + (error.message || 'خطأ غير معروف'), 'error')
    } finally {
      setLoading(false)
    }
  }

  // Filter pieces - MUST be before any early returns
  const filteredPieces = useMemo(() => {
    const basePieces = pieceSearch.trim() && searchedPieces.length > 0 ? searchedPieces : pieces
    
    return basePieces.filter(p => {
      if (statusFilter !== 'all' && p.status_display !== statusFilter) return false
      if (batchFilter !== 'all' && p.land_batch?.name !== batchFilter) return false
      return true
    })
  }, [pieces, searchedPieces, pieceSearch, statusFilter, batchFilter])

  const stats = useMemo(() => ({
    total: pieces.length,
    available: pieces.filter(p => p.status_display === 'Available').length,
    reserved: pieces.filter(p => p.status_display === 'Reserved').length,
    sold: pieces.filter(p => p.status_display === 'Sold').length,
  }), [pieces])

  const handleSearch = () => {
    if (!pieceSearch.trim()) {
      setSearchedPieces([])
      return
    }
    debouncedSearch(pieceSearch.trim())
  }

  const handleFilterChange = (filterType: 'status' | 'batch', value: string) => {
    if (filterType === 'status') {
      setStatusFilter(value as any)
    } else {
      setBatchFilter(value)
    }
    // Re-search if there's a search term
    if (pieceSearch.trim()) {
      handleSearch()
    }
  }

  const resetFilters = () => {
    setStatusFilter('all')
    setBatchFilter('all')
    setPieceSearch('')
    setSearchedPieces([])
  }

  const openDetails = (piece: PieceWithStatus) => {
    setSelectedPiece(piece)
    setDetailsOpen(true)
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Header - Centered */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl sm:text-4xl font-bold">توفر الأراضي</h1>
        <p className="text-muted-foreground">عرض حالة قطع الأراضي</p>
        </div>

      {/* Stats Cards - Centered Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 max-w-4xl mx-auto">
        <Card className="text-center">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-gray-700">{stats.total}</div>
            <div className="text-sm text-muted-foreground mt-1">إجمالي القطع</div>
          </CardContent>
        </Card>
        <Card className="text-center border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-green-600">{stats.available}</div>
            <div className="text-sm text-muted-foreground mt-1">متاح</div>
          </CardContent>
        </Card>
        <Card className="text-center border-orange-200 bg-orange-50">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-orange-600">{stats.reserved}</div>
            <div className="text-sm text-muted-foreground mt-1">محجوز</div>
          </CardContent>
        </Card>
        <Card className="text-center border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="text-3xl font-bold text-red-600">{stats.sold}</div>
            <div className="text-sm text-muted-foreground mt-1">مباع</div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters - Centered */}
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-center">البحث والفلترة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Bar */}
          <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="ابحث برقم القطعة (مثال: P001 أو 88)..."
                  value={pieceSearch}
                  onChange={(e) => {
                    const value = e.target.value
                    setPieceSearch(value)
                    if (!value.trim()) {
                      setSearchedPieces([])
                    } else {
                      debouncedSearch(value.trim())
                    }
                  }}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="flex-1"
                />
            <Button onClick={handleSearch}>
                <Search className="h-4 w-4 ml-2" />
                بحث
              </Button>
            </div>

          {/* Filters Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">المنطقة</label>
              <Select
                value={batchFilter}
                onChange={(e) => handleFilterChange('batch', e.target.value)}
              >
                <option value="all">جميع المناطق</option>
                {batches.map(b => (
                  <option key={b.id} value={b.name}>{b.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">الحالة</label>
              <Select
                value={statusFilter}
                onChange={(e) => handleFilterChange('status', e.target.value)}
              >
                <option value="all">جميع الحالات</option>
                <option value="Available">متاح</option>
                <option value="Reserved">محجوز</option>
                <option value="Sold">مباع</option>
              </Select>
            </div>
          </div>

          {/* Reset Button */}
          {(statusFilter !== 'all' || batchFilter !== 'all' || pieceSearch.trim()) && (
            <Button variant="outline" onClick={resetFilters} className="w-full">
              <X className="h-4 w-4 ml-2" />
              إعادة تعيين الفلاتر
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Results Count */}
      <div className="text-center text-sm text-muted-foreground">
        عرض {filteredPieces.length} من {pieces.length} قطعة
                  </div>

      {/* Results Grid - Centered */}
      {filteredPieces.length === 0 ? (
        <Card className="max-w-2xl mx-auto">
          <CardContent className="pt-6 text-center py-12">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">لا توجد قطع مطابقة للبحث</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto">
          {filteredPieces.map((piece) => (
            <Card 
              key={piece.id} 
              className={`cursor-pointer transition-all hover:shadow-lg ${
                piece.status_display === 'Available' ? 'border-green-300 hover:border-green-400' :
                piece.status_display === 'Reserved' ? 'border-orange-300 hover:border-orange-400' :
                'border-red-300 hover:border-red-400'
              }`}
              onClick={() => openDetails(piece)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">#{piece.piece_number}</CardTitle>
                  <Badge 
                    variant={
                      piece.status_display === 'Available' ? 'success' :
                      piece.status_display === 'Reserved' ? 'warning' : 'destructive'
                    }
                  >
                    {piece.status_display === 'Available' ? 'متاح' :
                     piece.status_display === 'Reserved' ? 'محجوز' : 'مباع'}
                  </Badge>
                </div>
                {piece.land_batch?.name && (
                  <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                    <MapPin className="h-3 w-3" />
                    {piece.land_batch.name}
                    {piece.land_batch.location && ` - ${piece.land_batch.location}`}
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">المساحة</p>
                    <p className="font-bold">{piece.surface_area} م²</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">السعر (كامل)</p>
                    <p className="font-bold">{formatCurrency(piece.selling_price_full)}</p>
                  </div>
                </div>
                {piece.reservation && (
                  <div className="p-2 bg-orange-50 rounded text-xs">
                    <p><strong>العميل:</strong> {piece.reservation.client?.name || 'غير معروف'}</p>
                  </div>
                )}
                {piece.sale && (
                  <div className={`p-2 rounded text-xs ${
                    piece.sale.status === 'Completed' ? 'bg-red-50' : 'bg-orange-50'
                  }`}>
                    <p><strong>العميل:</strong> {piece.sale.client?.name}</p>
                    <p><strong>النوع:</strong> {piece.sale.payment_type === 'Full' ? 'بالحاضر' : 'بالتقسيط'}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-md max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              تفاصيل القطعة #{selectedPiece?.piece_number}
            </DialogTitle>
          </DialogHeader>
          
          {selectedPiece && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المجموعة:</span>
                  <span className="font-medium">{selectedPiece.land_batch?.name}</span>
                </div>
                {selectedPiece.land_batch?.location && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الموقع:</span>
                    <span className="font-medium">{selectedPiece.land_batch.location}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المساحة:</span>
                  <span className="font-medium">{selectedPiece.surface_area} م²</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">سعر البيع (كامل):</span>
                  <span className="font-medium">{formatCurrency(selectedPiece.selling_price_full)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">سعر البيع (أقساط):</span>
                  <span className="font-medium">{formatCurrency(selectedPiece.selling_price_installment)}</span>
                </div>
              </div>

              <div className={`p-4 rounded-lg ${
                selectedPiece.status_display === 'Available' ? 'bg-green-100' :
                selectedPiece.status_display === 'Reserved' ? 'bg-orange-100' : 'bg-red-100'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant={
                    selectedPiece.status_display === 'Available' ? 'success' :
                    selectedPiece.status_display === 'Reserved' ? 'warning' : 'destructive'
                  }>
                    {selectedPiece.status_display === 'Available' ? 'متاح للبيع' :
                     selectedPiece.status_display === 'Reserved' ? 'محجوز' : 'مباع'}
                  </Badge>
                </div>

                {selectedPiece.status_display === 'Reserved' && selectedPiece.reservation && (
                  <div className="space-y-1 text-sm">
                    <p><strong>العميل:</strong> {selectedPiece.reservation.client?.name || 'غير معروف'}</p>
                    <p><strong>تاريخ الحجز:</strong> {formatDate(selectedPiece.reservation.reservation_date || selectedPiece.reservation.created_at)}</p>
                    {selectedPiece.reservation.small_advance_amount && (
                      <p><strong>مبلغ الحجز:</strong> {formatCurrency(selectedPiece.reservation.small_advance_amount)}</p>
                    )}
                    {selectedPiece.reservation.reserved_until && (
                      <p><strong>صالح حتى:</strong> {formatDate(selectedPiece.reservation.reserved_until)}</p>
                    )}
                  </div>
                )}

                {selectedPiece.sale && (
                  <div className="space-y-1 text-sm">
                    <p><strong>العميل:</strong> {selectedPiece.sale.client?.name}</p>
                    <p><strong>تاريخ البيع:</strong> {formatDate(selectedPiece.sale.sale_date)}</p>
                    <p><strong>نوع الدفع:</strong> {selectedPiece.sale.payment_type === 'Full' ? 'بالحاضر' : 'بالتقسيط'}</p>
                    <p><strong>السعر:</strong> {formatCurrency(selectedPiece.sale.total_selling_price)}</p>
                    <p><strong>حالة البيع:</strong> {
                      selectedPiece.sale.status === 'Completed' ? 'مباع' :
                      selectedPiece.sale.status === 'Pending' ? 'معلق' : 'قيد المعالجة'
                    }</p>
                  </div>
                )}

                {selectedPiece.status_display === 'Available' && (
                  <p className="text-sm text-green-700">هذه القطعة متاحة للبيع أو الحجز</p>
                )}
              </div>

              {/* Piece Notes - Show first if exists */}
              {selectedPiece.notes && selectedPiece.notes.trim() && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">ملاحظات القطعة:</h4>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{selectedPiece.notes}</p>
                </div>
              )}

              {/* Land Batch Notes - Show after piece notes if exists */}
              {selectedPiece.land_batch?.notes && selectedPiece.land_batch.notes.trim() && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-2">ملاحظات الأرض:</h4>
                  <p className="text-sm text-blue-800 whitespace-pre-wrap">{selectedPiece.land_batch.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
