import { useEffect, useState, useMemo, useCallback, memo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { sanitizeText, sanitizeNotes, sanitizeEmail, sanitizePhone, sanitizeCIN } from '@/lib/sanitize'
import { showNotification } from '@/components/ui/notification'
import { debounce } from '@/lib/throttle'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Map, ChevronDown, ChevronRight, Calculator, X, DollarSign, AlertTriangle, ShoppingCart, Upload, Image as ImageIcon, Settings, RotateCcw, CheckCircle, XCircle, Eye, User } from 'lucide-react'
import type { LandBatch, LandPiece, LandStatus, Client, PaymentOffer } from '@/types/database'

interface LandBatchWithPieces extends LandBatch {
  land_pieces: LandPiece[]
}

interface PieceConfig {
  count: number
  surface: number
}

// New flexible piece generation interface - integrates all modes
interface PieceGenerationItem {
  id: string
  type: 'auto' | 'custom' | 'uniform' | 'auto_smart' | 'smart' | 'advanced'
  // For auto/uniform: start number and count
  startNumber?: number
  count?: number
  surface?: number
  // For custom: specific piece number
  pieceNumber?: string
  customSurface?: number
  // For auto_smart: min, max, preferred sizes
  minSize?: number
  maxSize?: number
  preferredSize?: number
  // For smart: optimization strategy
  optimization?: 'balanced' | 'max_pieces' | 'min_waste'
  // For advanced: JSON pattern
  pattern?: string
}

type GenerationMode = 'none' | 'uniform' | 'mixed' | 'custom_flexible' | 'auto' | 'smart' | 'advanced'

const statusColors: Record<LandStatus, 'success' | 'warning' | 'default' | 'secondary'> = {
  Available: 'success',
  Reserved: 'warning',
  Sold: 'default',
  Cancelled: 'secondary',
}

// Simple and Robust Image Zoom Viewer (Mobile only)
function ImageZoomViewer({ src, alt, onError }: { src: string; alt: string; onError: (e: React.SyntheticEvent<HTMLImageElement>) => void }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isZoomed, setIsZoomed] = useState(false)
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number; distance: number; zoom: number } | null>(null)

  const isMobile = window.innerWidth < 768

  const reset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setIsZoomed(false)
    touchStartRef.current = null
  }

  const handleTouchStart = (e: React.TouchEvent<HTMLImageElement>) => {
    if (!isMobile) return
    
    if (e.touches.length === 2) {
      // Pinch to zoom
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      )
      touchStartRef.current = {
        x: 0,
        y: 0,
        distance,
        zoom
      }
      e.preventDefault()
    } else if (e.touches.length === 1 && isZoomed) {
      // Pan when zoomed
      const touch = e.touches[0]
      touchStartRef.current = {
        x: touch.clientX - pan.x,
        y: touch.clientY - pan.y,
        distance: 0,
        zoom
      }
      e.preventDefault()
    }
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLImageElement>) => {
    if (!isMobile || !touchStartRef.current) return
    
    if (e.touches.length === 2) {
      // Pinch zoom
      const touch1 = e.touches[0]
      const touch2 = e.touches[1]
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) + 
        Math.pow(touch2.clientY - touch1.clientY, 2)
      )
      
      const scaleChange = distance / touchStartRef.current.distance
      const newZoom = Math.max(1, Math.min(touchStartRef.current.zoom * scaleChange, 5))
      setZoom(newZoom)
      setIsZoomed(newZoom > 1)
      e.preventDefault()
    } else if (e.touches.length === 1 && isZoomed && touchStartRef.current.distance === 0) {
      // Pan
      const touch = e.touches[0]
      const newX = touch.clientX - touchStartRef.current.x
      const newY = touch.clientY - touchStartRef.current.y
      
      // Simple bounds checking
      if (imageRef.current && containerRef.current) {
        const img = imageRef.current
        const container = containerRef.current
        const maxX = (img.offsetWidth * zoom - container.offsetWidth) / 2
        const maxY = (img.offsetHeight * zoom - container.offsetHeight) / 2
        
        setPan({
          x: Math.max(-maxX, Math.min(maxX, newX)),
          y: Math.max(-maxY, Math.min(maxY, newY))
        })
      }
      e.preventDefault()
    }
  }

  const handleTouchEnd = () => {
    touchStartRef.current = null
  }

  const handleDoubleClick = () => {
    if (!isMobile) return
    if (isZoomed) {
      reset()
    } else {
      setZoom(2.5)
      setIsZoomed(true)
    }
  }

  return (
    <div 
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden relative"
      style={{ touchAction: isMobile ? 'none' : 'auto' }}
    >
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        onError={onError}
        className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg select-none"
        style={{
          transform: isMobile ? `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` : undefined,
          transformOrigin: 'center center',
          touchAction: isMobile ? 'none' : 'auto',
          transition: isMobile && !isZoomed ? 'transform 0.2s ease-out' : 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={handleDoubleClick}
        draggable={false}
      />
      {isMobile && isZoomed && (
        <Button
          onClick={reset}
          size="sm"
          variant="secondary"
          className="absolute top-4 left-4 z-10 shadow-lg bg-white/90 hover:bg-white"
        >
          <RotateCcw className="h-4 w-4 ml-1" />
          إعادة تعيين
        </Button>
      )}
    </div>
  )
}

export function LandManagement() {
  const { hasPermission, user } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [batches, setBatches] = useState<LandBatchWithPieces[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  
  // Track touch events to prevent accidental clicks during scrolling
  const touchStateRef = useRef<{
    startX: number
    startY: number
    hasMoved: boolean
    target: HTMLElement | null
  }>({
    startX: 0,
    startY: 0,
    hasMoved: false,
    target: null,
  })
  
  // Helper function to handle button clicks with scroll detection
  const createButtonHandler = (handler: () => void) => {
    return {
      onTouchStart: (e: React.TouchEvent) => {
        const touch = e.touches[0]
        touchStateRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          hasMoved: false,
          target: e.currentTarget as HTMLElement,
        }
      },
      onTouchMove: (e: React.TouchEvent) => {
        if (!touchStateRef.current.target) return
        const touch = e.touches[0]
        const deltaX = Math.abs(touch.clientX - touchStateRef.current.startX)
        const deltaY = Math.abs(touch.clientY - touchStateRef.current.startY)
        // If moved more than 10px, consider it a scroll
        if (deltaX > 10 || deltaY > 10) {
          touchStateRef.current.hasMoved = true
        }
      },
      onTouchEnd: (e: React.TouchEvent) => {
        // Only execute if it wasn't a scroll
        if (!touchStateRef.current.hasMoved && touchStateRef.current.target === e.currentTarget) {
          e.preventDefault()
          e.stopPropagation()
          handler()
        }
        // Reset
        touchStateRef.current = {
          startX: 0,
          startY: 0,
          hasMoved: false,
          target: null,
        }
      },
      onClick: (e: React.MouseEvent) => {
        // For desktop/mouse clicks, always execute
        handler()
      },
    }
  }
  // Filter status removed - only search is used now
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null)
  const [deletePieceConfirmOpen, setDeletePieceConfirmOpen] = useState(false)
  const [pieceToDelete, setPieceToDelete] = useState<{ id: string; piece_number: string; batch_id: string } | null>(null)
  const [imageViewDialogOpen, setImageViewDialogOpen] = useState(false)
  const [viewingImageUrl, setViewingImageUrl] = useState<string | null>(null)
  const [viewingImageName, setViewingImageName] = useState<string>('')
  
  // Multi-select for selling
  const [selectedPieces, setSelectedPieces] = useState<Set<string>>(new Set())
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
  const [saleDialogOpen, setSaleDialogOpen] = useState(false)
  const [newClient, setNewClient] = useState<Client | null>(null)
  const [clientForm, setClientForm] = useState({
    name: '',
    cin: '',
    phone: '',
    email: '',
    address: '',
    client_type: 'Individual',
    notes: '',
  })
  const [saleForm, setSaleForm] = useState({
    payment_type: 'Full' as 'Full' | 'Installment' | 'PromiseOfSale',
    reservation_amount: '',
    deadline_date: '',
    selected_offer_id: '',
    promise_initial_payment: '',
  })
  const [availableOffers, setAvailableOffers] = useState<PaymentOffer[]>([])
  const [selectedOffer, setSelectedOffer] = useState<PaymentOffer | null>(null)
  const [savingClient, setSavingClient] = useState(false)
  const [creatingSale, setCreatingSale] = useState(false)
  const [searchingClient, setSearchingClient] = useState(false)
  const [foundClient, setFoundClient] = useState<Client | null>(null)
  
  // Reserved sales management
  const [reservedSales, setReservedSales] = useState<any[]>([])
  const [changeOfferDialogOpen, setChangeOfferDialogOpen] = useState(false)
  const [selectedSaleForOfferChange, setSelectedSaleForOfferChange] = useState<any | null>(null)
  const [availableOffersForSale, setAvailableOffersForSale] = useState<PaymentOffer[]>([])
  const [selectedNewOffer, setSelectedNewOffer] = useState<PaymentOffer | null>(null)
  const [changingOffer, setChangingOffer] = useState(false)
  
  // Debounced search
  const debouncedSearchFn = useCallback(
    debounce((value: string) => setDebouncedSearchTerm(value), 300),
    []
  )

  // State for client search status
  const [clientSearchStatus, setClientSearchStatus] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle')
  
  // State for sale form client search
  const [saleClientCIN, setSaleClientCIN] = useState('')
  const [saleClientSearchStatus, setSaleClientSearchStatus] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle')
  const [saleClientSearching, setSaleClientSearching] = useState(false)
  const [saleClientFound, setSaleClientFound] = useState<Client | null>(null)
  
  // State for clients statistics
  const [clientsStats, setClientsStats] = useState({
    total: 0,
    individuals: 0,
    companies: 0,
  })

  // Debounced CIN search - starts searching after 2 characters
  const debouncedCINSearch = useCallback(
    debounce(async (cin: string) => {
      if (!cin || cin.trim().length < 2) {
        setFoundClient(null)
        setClientSearchStatus('idle')
        return
      }

      const sanitizedCIN = sanitizeCIN(cin)
      if (!sanitizedCIN || sanitizedCIN.length < 2) {
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
          setClientForm({
            name: data.name,
            cin: data.cin,
            phone: data.phone || '',
            email: data.email || '',
            address: data.address || '',
            client_type: data.client_type,
            notes: data.notes || '',
          })
          setNewClient(data) // Set as selected client
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
    }, 400), // Reduced delay for faster response
    []
  )

  // Debounced CIN search for sale form
  const debouncedSaleCINSearch = useCallback(
    debounce(async (cin: string) => {
      if (!cin || cin.trim().length < 2) {
        setSaleClientFound(null)
        setSaleClientSearchStatus('idle')
        return
      }

      const sanitizedCIN = sanitizeCIN(cin)
      if (!sanitizedCIN || sanitizedCIN.length < 2) {
        setSaleClientFound(null)
        setSaleClientSearchStatus('idle')
        return
      }

      setSaleClientSearching(true)
      setSaleClientSearchStatus('searching')
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('*')
          .eq('cin', sanitizedCIN)
          .limit(1)
          .single()

        if (!error && data) {
          setSaleClientFound(data)
          setSaleClientSearchStatus('found')
          setNewClient(data) // Set as selected client for sale
        } else {
          setSaleClientFound(null)
          if (sanitizedCIN.length >= 4) {
            setSaleClientSearchStatus('not_found')
          } else {
            setSaleClientSearchStatus('idle')
          }
        }
      } catch (error) {
        setSaleClientFound(null)
        if (sanitizedCIN.length >= 4) {
          setSaleClientSearchStatus('not_found')
        } else {
          setSaleClientSearchStatus('idle')
        }
      } finally {
        setSaleClientSearching(false)
      }
    }, 400),
    []
  )

  // Fetch clients statistics
  const fetchClientsStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('client_type')

      if (!error && data) {
        const total = data.length
        const individuals = data.filter(c => c.client_type === 'Individual').length
        const companies = data.filter(c => c.client_type === 'Company').length
        
        setClientsStats({
          total,
          individuals,
          companies,
        })
      }
    } catch (error) {
      console.error('Error fetching clients stats:', error)
    }
  }, [])

  useEffect(() => {
    fetchClientsStats()
  }, [fetchClientsStats])

  // Batch dialog
  const [batchDialogOpen, setBatchDialogOpen] = useState(false)
  const [editingBatch, setEditingBatch] = useState<LandBatch | null>(null)
  const [batchForm, setBatchForm] = useState({
    name: '',
    location: '',
    total_surface: '',
    total_cost: '',
    date_acquired: '',
    notes: '',
    real_estate_tax_number: '',
    price_per_m2_full: '',
    price_per_m2_installment: '',
    company_fee_percentage: '',
    company_fee_percentage_full: '',
    received_amount: '',
    number_of_months: '',
    image_url: '',
  })
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  
  // Advanced generation options
  const [autoMinSize, setAutoMinSize] = useState('200')
  const [autoMaxSize, setAutoMaxSize] = useState('600')
  const [autoPreferredSize, setAutoPreferredSize] = useState('400')
  const [smartOptimization, setSmartOptimization] = useState<'balanced' | 'max_pieces' | 'min_waste'>('balanced')
  const [advancedPattern, setAdvancedPattern] = useState<string>('') // JSON string for complex patterns

  // Piece generation options
  const [generationMode, setGenerationMode] = useState<GenerationMode>('none')
  const [uniformSize, setUniformSize] = useState('400')
  const [customConfigs, setCustomConfigs] = useState<PieceConfig[]>([
    { count: 50, surface: 900 },
    { count: 20, surface: 200 },
  ])
  const [restPieceSize, setRestPieceSize] = useState('400') // Size for remaining surface

  // New flexible piece generation items
  const [flexiblePieces, setFlexiblePieces] = useState<PieceGenerationItem[]>([])

  // Functions to manage flexible pieces
  const addFlexiblePiece = (type: 'auto' | 'custom' | 'uniform' | 'auto_smart' | 'smart' | 'advanced') => {
    const newItem: PieceGenerationItem = {
      id: Date.now().toString(),
      type,
      ...(type === 'auto' 
        ? { startNumber: 1, count: 10, surface: 400 }
        : { pieceNumber: 'P001', customSurface: 400 }
      )
    }
    setFlexiblePieces([...flexiblePieces, newItem])
  }

  const removeFlexiblePiece = (id: string) => {
    setFlexiblePieces(flexiblePieces.filter(p => p.id !== id))
  }

  const updateFlexiblePiece = (id: string, updates: Partial<PieceGenerationItem>) => {
    setFlexiblePieces(flexiblePieces.map(p => 
      p.id === id ? { ...p, ...updates } : p
    ))
  }

  // Functions to manage custom configs (for backward compatibility)
  const addCustomConfig = () => {
    setCustomConfigs([...customConfigs, { count: 10, surface: 400 }])
  }

  const removeCustomConfig = (index: number) => {
    if (customConfigs.length > 1) {
      setCustomConfigs(customConfigs.filter((_, i) => i !== index))
    }
  }

  const updateCustomConfig = (index: number, field: 'count' | 'surface', value: number) => {
    const updated = [...customConfigs]
    updated[index] = { ...updated[index], [field]: value }
    setCustomConfigs(updated)
  }

  // Piece dialog
  const [pieceDialogOpen, setPieceDialogOpen] = useState(false)
  const [bulkAddDialogOpen, setBulkAddDialogOpen] = useState(false)
  const [editingPiece, setEditingPiece] = useState<LandPiece | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [selectedBatchForPiece, setSelectedBatchForPiece] = useState<LandBatch | null>(null)
  const [bulkAddForm, setBulkAddForm] = useState({
    from: '',
    to: '',
    surface_area: '',
  })
  const [pieceForm, setPieceForm] = useState({
    piece_number: '', // Just a number (1, 2, 99, etc.)
    surface_area: '', // Optional - will use default if empty
    selling_price_full: '',
    selling_price_installment: '',
    price_per_m2_full: '',
    price_per_m2_installment: '',
    company_fee_percentage: '',
    received_amount: '',
    number_of_months: '',
    notes: '',
  })

  // Default values for new pieces (can be overridden)
  const [defaultSurfaceArea, setDefaultSurfaceArea] = useState('400') // Default 400 m²
  
  // Price edit dialog
  const [priceEditDialogOpen, setPriceEditDialogOpen] = useState(false)
  const [editingPricePiece, setEditingPricePiece] = useState<LandPiece | null>(null)
  const [priceForm, setPriceForm] = useState({
    selling_price_full: '',
    selling_price_installment: '',
  })
  
  // Sale details dialog for sold/reserved pieces
  const [saleDetailsDialogOpen, setSaleDetailsDialogOpen] = useState(false)
  const [saleDetailsPiece, setSaleDetailsPiece] = useState<LandPiece | null>(null)
  const [saleDetailsData, setSaleDetailsData] = useState<any>(null)
  const [loadingSaleDetails, setLoadingSaleDetails] = useState(false)
  
  const openSaleDetailsDialog = async (piece: LandPiece) => {
    setSaleDetailsPiece(piece)
    setSaleDetailsDialogOpen(true)
    setLoadingSaleDetails(true)
    setSaleDetailsData(null)
    
    try {
      // Find the sale for this piece
      const { data: salesData, error } = await supabase
        .from('sales')
        .select(`
          *,
          client:clients(*)
        `)
        .contains('land_piece_ids', [piece.id])
        .not('status', 'eq', 'Cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      
      if (error) {
        console.error('Error fetching sale details:', error)
      } else {
        setSaleDetailsData(salesData)
      }
    } catch (err) {
      console.error('Error loading sale details:', err)
    } finally {
      setLoadingSaleDetails(false)
    }
  }
  
  // Bulk price update dialog
  const [bulkPriceDialogOpen, setBulkPriceDialogOpen] = useState(false)
  const [bulkPriceBatch, setBulkPriceBatch] = useState<LandBatchWithPieces | null>(null)
  const [bulkPriceForm, setBulkPriceForm] = useState({
    price_per_m2_full: '',
    price_per_m2_installment: '',
  })

  // Payment offers management
  const [batchOffers, setBatchOffers] = useState<PaymentOffer[]>([])
  const [pieceOffers, setPieceOffers] = useState<PaymentOffer[]>([])
  const [selectedPieceOfferId, setSelectedPieceOfferId] = useState<string | null>(null) // Selected offer for the piece (from sale if reserved)
  const [editingOffer, setEditingOffer] = useState<PaymentOffer | null>(null)
  const [offerDialogOpen, setOfferDialogOpen] = useState(false)
  const [isBatchOffer, setIsBatchOffer] = useState(true) // true for batch, false for piece
  const [offerForm, setOfferForm] = useState({
    price_per_m2_installment: '',
    company_fee_percentage: '',
    advance_amount: '',
    advance_is_percentage: false,
    monthly_payment: '',
    number_of_months: '',
    calculation_method: 'monthly' as 'monthly' | 'months', // 'monthly' = use monthly payment, 'months' = use number of months
    offer_name: '',
    notes: '',
    is_default: false,
  })

  // Auto-calculate prices based on batch price per m² or existing pieces
  const calculatePieceValues = (pieceNumber: string, surfaceArea: string) => {
    if (!selectedBatchForPiece) return null
    
    const surface = parseFloat(surfaceArea || defaultSurfaceArea) || 400
    if (isNaN(surface) || surface <= 0) return null
    
    let sellingPriceFull = 0
    let sellingPriceInstallment = 0
    
    // First, try to use batch price per m² from the actual batch data (most reliable)
    const batchPricePerM2Full = (selectedBatchForPiece as any).price_per_m2_full
    const batchPricePerM2Installment = (selectedBatchForPiece as any).price_per_m2_installment
    
    // If batch data doesn't have prices, try batchForm (for newly created batches)
    const pricePerM2Full = batchPricePerM2Full !== undefined && batchPricePerM2Full !== null
      ? parseFloat(String(batchPricePerM2Full))
      : parseFloat(batchForm.price_per_m2_full) || 0
    const pricePerM2Installment = batchPricePerM2Installment !== undefined && batchPricePerM2Installment !== null
      ? parseFloat(String(batchPricePerM2Installment))
      : parseFloat(batchForm.price_per_m2_installment) || 0
    
    if (!isNaN(pricePerM2Full) && !isNaN(pricePerM2Installment) && pricePerM2Full > 0 && pricePerM2Installment > 0) {
      // Use batch price per m²
      sellingPriceFull = Math.round(surface * pricePerM2Full * 100) / 100
      sellingPriceInstallment = Math.round(surface * pricePerM2Installment * 100) / 100
    } else {
      // Get average prices from existing pieces in this batch
      const batchWithPieces = selectedBatchForPiece as LandBatchWithPieces
      const existingPieces = batchWithPieces.land_pieces || []
      
      if (existingPieces.length > 0) {
        // Calculate average price per m² from existing pieces
        const totalFull = existingPieces.reduce((sum, p) => sum + (p.selling_price_full || 0), 0)
        const totalInstallment = existingPieces.reduce((sum, p) => sum + (p.selling_price_installment || 0), 0)
        const totalSurface = existingPieces.reduce((sum, p) => sum + (p.surface_area || 0), 0)
        
        if (totalSurface > 0) {
          const avgPricePerM2Full = totalFull / totalSurface
          const avgPricePerM2Installment = totalInstallment / totalSurface
          sellingPriceFull = Math.round(surface * avgPricePerM2Full * 100) / 100
          sellingPriceInstallment = Math.round(surface * avgPricePerM2Installment * 100) / 100
        } else {
          // Fallback defaults
          sellingPriceFull = surface * 100
          sellingPriceInstallment = surface * 110
        }
      } else {
        // Default: 100 DT per m² for full, 110 DT per m² for installment
        sellingPriceFull = surface * 100
        sellingPriceInstallment = surface * 110
      }
    }
    
    return {
      selling_price_full: sellingPriceFull,
      selling_price_installment: sellingPriceInstallment,
    }
  }

  useEffect(() => {
    fetchBatches()
  }, [])

  const fetchBatches = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('land_batches')
        .select(`
          *,
          land_pieces(*),
          payment_offers!payment_offers_land_batch_id_fkey(*)
        `)
        .order('date_acquired', { ascending: false })

      if (fetchError) {
        setError('خطأ في تحميل البيانات')
        if (fetchError.code === '42P01') {
          setError('Database tables not found. Please run the SQL schema in Supabase first.')
        } else {
          setError(fetchError.message)
        }
        return
      }
      
      // Also fetch offers for pieces
      const { data: piecesData } = await supabase
        .from('land_pieces')
        .select(`
          *,
          payment_offers!payment_offers_land_piece_id_fkey(*)
        `)

      const batchesData = (data as any[]) || []
      
      // Fetch all completed sales to check which pieces are fully sold
      const { data: completedSalesData } = await supabase
        .from('sales')
        .select('id, land_piece_ids, status')
        .eq('status', 'Completed')
      
      // Create a set of piece IDs that have completed sales
      const soldPieceIds = new Set<string>()
      if (completedSalesData) {
        completedSalesData.forEach((sale: any) => {
          if (sale.land_piece_ids && Array.isArray(sale.land_piece_ids)) {
            sale.land_piece_ids.forEach((pieceId: string) => {
              soldPieceIds.add(pieceId)
            })
          }
        })
      }
      
      // Sync piece statuses in database: update pieces with Completed sales to 'Sold'
      if (soldPieceIds.size > 0) {
        // Update pieces in batches to 'Sold' if they have completed sales
        const piecesToUpdate: string[] = []
        batchesData.forEach(batch => {
          (batch.land_pieces || []).forEach((piece: any) => {
            if (soldPieceIds.has(piece.id) && piece.status !== 'Sold') {
              piecesToUpdate.push(piece.id)
            }
          })
        })
        
        // Update pieces in database (fire and forget - don't wait for it)
        if (piecesToUpdate.length > 0) {
          supabase
            .from('land_pieces')
            .update({ status: 'Sold' } as any)
            .in('id', piecesToUpdate)
            .then(({ error }) => {
              if (error) {
                console.warn('Error syncing piece statuses:', error)
              } else {
                console.log(`Synced ${piecesToUpdate.length} piece statuses to Sold`)
              }
            })
        }
      }
      
      // Attach offers to batches and pieces, and update status for fully sold pieces
      const batchesWithOffers = batchesData.map(batch => {
        const batchOffers = (batch.payment_offers || []) as PaymentOffer[]
        const pieces = (batch.land_pieces || []).map((piece: any) => {
          const pieceOffers = (piecesData || []).find((p: any) => p.id === piece.id)?.payment_offers || []
          
          // If piece has a completed sale, mark it as Sold
          const displayStatus = soldPieceIds.has(piece.id) ? 'Sold' : piece.status
          
          return {
            ...piece,
            payment_offers: pieceOffers as PaymentOffer[],
            status: displayStatus // Override status for display
          }
        })
        
        // Calculate total_surface from pieces if not set or is 0
        const calculatedTotalSurface = pieces.reduce((sum: number, piece: any) => {
          return sum + (piece.surface_area || 0)
        }, 0)
        
        return {
          ...batch,
          payment_offers: batchOffers,
          land_pieces: pieces,
          total_surface: (batch.total_surface && batch.total_surface > 0) ? batch.total_surface : calculatedTotalSurface
        }
      }) as LandBatchWithPieces[]
      
      setBatches(batchesWithOffers)
      
      // Update selectedBatchForPiece if it's still selected
      if (selectedBatchId) {
        const updatedBatch = batchesWithOffers.find(b => b.id === selectedBatchId)
        if (updatedBatch) {
          setSelectedBatchForPiece(updatedBatch)
        }
      }
      
      // Fetch reserved sales (Pending status with Installment payment type)
      await fetchReservedSales()
    } catch (err) {
      setError('خطأ في تحميل الدفعات')
    } finally {
      setLoading(false)
    }
  }
  
  // Fetch reserved sales for installment payments
  const fetchReservedSales = async () => {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select(`
          *,
          client:clients(id, name, cin, phone),
          selected_offer:payment_offers!selected_offer_id(*)
        `)
        .eq('payment_type', 'Installment')
        .eq('status', 'Pending')
        .order('sale_date', { ascending: false })
      
      if (error) {
        console.error('Error fetching reserved sales:', error)
        return
      }
      
      setReservedSales((data || []) as any[])
    } catch (err) {
      console.error('Error in fetchReservedSales:', err)
    }
  }
  
  // Open dialog to change offer for a reserved sale
  const openChangeOfferDialog = async (sale: any) => {
    setSelectedSaleForOfferChange(sale)
    
    // Get piece IDs from sale
    const pieceIds = sale.land_piece_ids || []
    if (pieceIds.length === 0) return
    
    // Fetch pieces to get their batch IDs
    const { data: piecesData } = await supabase
      .from('land_pieces')
      .select('id, land_batch_id')
      .in('id', pieceIds)
    
    if (!piecesData || piecesData.length === 0) return
    
    // Get all unique batch IDs
    const batchIds = [...new Set(piecesData.map((p: any) => p.land_batch_id))]
    
    // Fetch offers from batches and pieces
    const offers: PaymentOffer[] = []
    
    // Get batch offers
    if (batchIds.length > 0) {
      const { data: batchOffers } = await supabase
        .from('payment_offers')
        .select('*')
        .in('land_batch_id', batchIds)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
      
      if (batchOffers) {
        offers.push(...(batchOffers as PaymentOffer[]))
      }
    }
    
    // Get piece-specific offers
    const { data: pieceOffers } = await supabase
      .from('payment_offers')
      .select('*')
      .in('land_piece_id', pieceIds)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
    
    if (pieceOffers) {
      offers.push(...(pieceOffers as PaymentOffer[]))
    }
    
    // Remove duplicates
    const uniqueOffers = offers.filter((offer, index, self) =>
      index === self.findIndex((o) => o.id === offer.id)
    )
    
    setAvailableOffersForSale(uniqueOffers)
    
    // Set current offer if exists
    if (sale.selected_offer_id) {
      const currentOffer = uniqueOffers.find(o => o.id === sale.selected_offer_id)
      setSelectedNewOffer(currentOffer || null)
    } else {
      setSelectedNewOffer(null)
    }
    
    setChangeOfferDialogOpen(true)
  }
  
  // Change offer for a reserved sale
  const handleChangeOffer = async () => {
    if (!selectedSaleForOfferChange || !selectedNewOffer) return
    
    setChangingOffer(true)
    setError(null)
    
    try {
      // Get piece data to calculate new installment values
      const pieceIds = selectedSaleForOfferChange.land_piece_ids || []
      const { data: piecesData } = await supabase
        .from('land_pieces')
        .select('id, surface_area, selling_price_installment, selling_price_full')
        .in('id', pieceIds)
      
      if (!piecesData || piecesData.length === 0) {
        setError('لم يتم العثور على بيانات القطع')
        setChangingOffer(false)
        return
      }
      
      // Calculate values per piece (each piece has its own price)
      const pieceCount = pieceIds.length
      const reservationPerPiece = (selectedSaleForOfferChange.small_advance_amount || 0) / pieceCount
      
      // Use the first piece's price as reference (or calculate average if pieces have different prices)
      // In practice, if pieces have different prices, we should calculate per piece
      // For now, we'll use the average price per piece
      const totalPrice = selectedSaleForOfferChange.total_selling_price
      const averagePricePerPiece = totalPrice / pieceCount
      
      // But if we have pieces data, use the actual piece prices
      let totalCompanyFee = 0
      let maxMonths = 0
      let monthlyAmount = selectedNewOffer.monthly_payment
      const companyFeePercentage = selectedNewOffer.company_fee_percentage || 0
      
      // Calculate for each piece separately
      for (const piece of piecesData) {
        const pricePerPiece = piece.selling_price_installment || piece.selling_price_full || averagePricePerPiece
        const companyFeePerPiece = (pricePerPiece * companyFeePercentage) / 100
        const advanceAmount = selectedNewOffer.advance_is_percentage
          ? (pricePerPiece * selectedNewOffer.advance_amount) / 100
          : selectedNewOffer.advance_amount
        const totalPayablePerPiece = pricePerPiece + companyFeePerPiece
        const remainingAfterAdvance = totalPayablePerPiece - reservationPerPiece - advanceAmount
        
        totalCompanyFee += companyFeePerPiece
        
        if (monthlyAmount > 0 && remainingAfterAdvance > 0) {
          const monthsForPiece = Math.ceil(remainingAfterAdvance / monthlyAmount)
          maxMonths = Math.max(maxMonths, monthsForPiece)
        }
      }
      
      const numberOfMonths = maxMonths
      
      // Update sale with new offer
      const { error: updateError } = await supabase
        .from('sales')
        .update({
          selected_offer_id: selectedNewOffer.id,
          company_fee_percentage: companyFeePercentage,
          company_fee_amount: totalCompanyFee,
          number_of_installments: numberOfMonths,
          monthly_installment_amount: monthlyAmount,
        } as any)
        .eq('id', selectedSaleForOfferChange.id)
      
      if (updateError) throw updateError
      
      // Delete existing installments
      const { error: deleteError } = await supabase
        .from('installments')
        .delete()
        .eq('sale_id', selectedSaleForOfferChange.id)
      
      if (deleteError) throw deleteError
      
      // Create new installments if sale is confirmed (has big_advance_amount)
      if (selectedSaleForOfferChange.big_advance_amount > 0 && numberOfMonths > 0) {
        const installmentsToCreate = []
        const startDate = new Date(selectedSaleForOfferChange.installment_start_date || new Date())
        startDate.setHours(0, 0, 0, 0)
        
        for (let i = 0; i < numberOfMonths; i++) {
          const dueDate = new Date(startDate)
          dueDate.setMonth(dueDate.getMonth() + i)
          installmentsToCreate.push({
            sale_id: selectedSaleForOfferChange.id,
            installment_number: i + 1,
            amount_due: parseFloat(monthlyAmount.toFixed(2)),
            amount_paid: 0,
            stacked_amount: 0,
            due_date: dueDate.toISOString().split('T')[0],
            status: 'Unpaid',
          })
        }
        
        const { error: installmentsError } = await supabase
          .from('installments')
          .insert(installmentsToCreate as any)
        
        if (installmentsError) throw installmentsError
      }
      
      showNotification('تم تحديث العرض بنجاح', 'success')
      setChangeOfferDialogOpen(false)
      setSelectedSaleForOfferChange(null)
      setSelectedNewOffer(null)
      setAvailableOffersForSale([])
      
      // Refresh data
      await fetchReservedSales()
      await fetchBatches()
    } catch (err: any) {
      console.error('Error changing offer:', err)
      setError(err.message || 'خطأ في تحديث العرض')
      showNotification('خطأ في تحديث العرض: ' + (err.message || 'خطأ غير معروف'), 'error')
    } finally {
      setChangingOffer(false)
    }
  }

  const toggleBatch = (batchId: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev)
      if (next.has(batchId)) {
        next.delete(batchId)
      } else {
        next.add(batchId)
      }
      return next
    })
  }

  const openBatchDialog = async (batch?: LandBatch) => {
    if (batch) {
      setEditingBatch(batch)
      setBatchForm({
        name: batch.name,
        location: batch.location || '',
        total_surface: batch.total_surface.toString(),
        total_cost: batch.total_cost.toString(),
        date_acquired: batch.date_acquired,
        notes: batch.notes || '',
        real_estate_tax_number: (batch as any).real_estate_tax_number || '',
        price_per_m2_full: (batch as any).price_per_m2_full?.toString() || '',
        price_per_m2_installment: (batch as any).price_per_m2_installment?.toString() || '',
        company_fee_percentage: '',
        company_fee_percentage_full: (batch as any).company_fee_percentage_full?.toString() || '',
        received_amount: '',
        number_of_months: '',
        image_url: (batch as any).image_url || '',
      })
      setImagePreview((batch as any).image_url || null)
      setImageFile(null)
      
      // Load offers for this batch - try both from batch object and database
      let offers: PaymentOffer[] = []
      
      // First, try to get offers from the batch object (if loaded with fetchBatches)
      if ((batch as any).payment_offers && Array.isArray((batch as any).payment_offers)) {
        offers = (batch as any).payment_offers as PaymentOffer[]
        console.log('Loaded batch offers from batch object:', offers)
      }
      
      // Also fetch from database to ensure we have the latest
      const { data: dbOffers, error: offersError } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('land_batch_id', batch.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
      
      if (offersError) {
        console.error('Error loading batch offers from database:', offersError)
      } else if (dbOffers && dbOffers.length > 0) {
        // Use database offers if available (more up-to-date)
        offers = dbOffers as PaymentOffer[]
        console.log('Loaded batch offers from database:', offers)
      }
      
      setBatchOffers(offers)
      console.log('Final batch offers set:', offers.length, offers)
      // No generation mode when editing
    } else {
      setEditingBatch(null)
      setBatchForm({
        name: '',
        location: '',
        total_surface: '',
        total_cost: '',
        date_acquired: '',
        notes: '',
        real_estate_tax_number: '',
        price_per_m2_full: '',
        price_per_m2_installment: '',
        company_fee_percentage: '',
        company_fee_percentage_full: '',
        received_amount: '',
        number_of_months: '',
        image_url: '',
      })
      setImagePreview(null)
      setImageFile(null)
      setGenerationMode('none')
      setUniformSize('400')
      setCustomConfigs([
        { count: 50, surface: 900 },
        { count: 20, surface: 200 },
      ])
      setRestPieceSize('400')
      setFlexiblePieces([])
      setBatchOffers([]) // Only clear offers when creating new batch
    }
    setBatchDialogOpen(true)
  }

  // Payment Offers Management Functions
  const addBatchOffer = () => {
    setEditingOffer(null)
    setIsBatchOffer(true)
    setOfferForm({
      price_per_m2_installment: '',
      company_fee_percentage: '',
      advance_amount: '',
      advance_is_percentage: false,
      monthly_payment: '',
      number_of_months: '',
      calculation_method: 'monthly',
      offer_name: '',
      notes: '',
      is_default: false,
    })
    setOfferDialogOpen(true)
  }

  const editBatchOffer = (offer: PaymentOffer) => {
    setEditingOffer(offer)
    setIsBatchOffer(true)
    // Determine calculation method based on what's available
    // If monthly_payment exists and > 0, use 'monthly', otherwise use 'months'
    const hasMonthly = offer.monthly_payment && offer.monthly_payment > 0
    const hasMonths = offer.number_of_months && offer.number_of_months > 0
    // If neither has value, default to monthly
    const calculationMethod = hasMonthly ? 'monthly' : (hasMonths ? 'months' : 'monthly')
    setOfferForm({
      price_per_m2_installment: offer.price_per_m2_installment?.toString() || '',
      company_fee_percentage: offer.company_fee_percentage?.toString() || '',
      advance_amount: offer.advance_amount?.toString() || '',
      advance_is_percentage: offer.advance_is_percentage || false,
      monthly_payment: offer.monthly_payment?.toString() || '',
      number_of_months: offer.number_of_months?.toString() || '',
      calculation_method: calculationMethod,
      offer_name: offer.offer_name || '',
      notes: offer.notes || '',
      is_default: offer.is_default || false,
    })
    setOfferDialogOpen(true)
  }

  const saveBatchOffer = async () => {
    if (!editingBatch) return

    // Validate based on calculation method
    if (offerForm.calculation_method === 'monthly' && !offerForm.monthly_payment) {
      setError('يرجى إدخال المبلغ الشهري')
      return
    }
    if (offerForm.calculation_method === 'months' && !offerForm.number_of_months) {
      setError('يرجى إدخال عدد الأشهر')
      return
    }

    // Save only the value entered by user based on calculation_method
    // The other value will be calculated later when the offer is used in a sale
    const finalMonthlyPayment = offerForm.calculation_method === 'monthly' && offerForm.monthly_payment
      ? parseFloat(offerForm.monthly_payment)
      : 0
    const finalNumberOfMonths = offerForm.calculation_method === 'months' && offerForm.number_of_months
      ? parseFloat(offerForm.number_of_months)
      : 0 // Use 0 instead of null to satisfy NOT NULL constraint

    if (finalMonthlyPayment <= 0 && finalNumberOfMonths <= 0) {
      setError('يرجى إدخال المبلغ الشهري أو عدد الأشهر')
      return
    }

    try {
      const offerData: any = {
        land_batch_id: editingBatch.id,
        land_piece_id: null, // Batch offers should not be tied to specific pieces
        price_per_m2_installment: offerForm.price_per_m2_installment ? parseFloat(offerForm.price_per_m2_installment) : null,
        company_fee_percentage: offerForm.company_fee_percentage ? parseFloat(offerForm.company_fee_percentage) : 0,
        advance_amount: offerForm.advance_amount ? parseFloat(offerForm.advance_amount) : 0,
        advance_is_percentage: offerForm.advance_is_percentage,
        monthly_payment: finalMonthlyPayment > 0 ? finalMonthlyPayment : 0, // Use 0 instead of null
        number_of_months: finalNumberOfMonths > 0 ? finalNumberOfMonths : 0, // Use 0 instead of null
        offer_name: offerForm.offer_name.trim() || null,
        notes: offerForm.notes.trim() || null,
        is_default: offerForm.is_default,
        created_by: user?.id || null,
      }

      if (editingOffer) {
        const { error } = await supabase
          .from('payment_offers')
          .update(offerData)
          .eq('id', editingOffer.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('payment_offers')
          .insert([offerData])
        if (error) throw error
      }

      // Reload offers
      const { data: offers } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('land_batch_id', editingBatch.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
      setBatchOffers((offers as PaymentOffer[]) || [])

      // Note: Available pieces use batch offers directly (no need to update)
      // Reserved pieces have their own copy of offers (created when reserved)
      
      setOfferDialogOpen(false)
      setEditingOffer(null)
      setOfferForm({
        price_per_m2_installment: '',
        company_fee_percentage: '',
        advance_amount: '',
        advance_is_percentage: false,
        monthly_payment: '',
        number_of_months: '',
        calculation_method: 'monthly',
        offer_name: '',
        notes: '',
        is_default: false,
      })
    } catch (err: any) {
      setError(err.message || 'خطأ في حفظ العرض')
    }
  }

  const deleteBatchOffer = async (offerId: string) => {
    if (!editingBatch) return
    
    try {
      const { error } = await supabase
        .from('payment_offers')
        .delete()
        .eq('id', offerId)
      if (error) throw error

      // Reload offers
      const { data: offers } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('land_batch_id', editingBatch.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
      setBatchOffers((offers as PaymentOffer[]) || [])
    } catch (err: any) {
      setError(err.message || 'خطأ في حذف العرض')
    }
  }

  // Calculate pieces preview based on generation mode
  const calculatePiecesPreview = () => {
    const totalSurface = parseFloat(batchForm.total_surface) || 0
    const totalCost = parseFloat(batchForm.total_cost) || 0
    
    if (generationMode === 'uniform') {
      const pieceSize = parseFloat(uniformSize) || 400
      const count = Math.floor(totalSurface / pieceSize)
      const costPerPiece = count > 0 ? totalCost / count : 0
      return { count, pieces: [{ count, surface: pieceSize, cost: costPerPiece }], totalUsed: count * pieceSize }
    }
    
    if (generationMode === 'custom_flexible') {
      const pieces: { count: number; surface: number; cost: number; startNumber?: number; pieceNumbers?: string[] }[] = []
      let usedSurface = 0
      
      // Calculate total surface from pieces if not provided
      let effectiveTotalSurface = totalSurface
      if (!batchForm.total_surface || totalSurface === 0) {
        // Calculate from pieces first
        let calculatedSurface = 0
        for (const item of flexiblePieces) {
          if (item.type === 'auto' || item.type === 'uniform') {
            calculatedSurface += (item.count || 0) * (item.surface || 0)
          } else if (item.type === 'custom') {
            calculatedSurface += item.customSurface || 0
          }
          // Note: auto_smart and smart need total_surface to calculate, so they use provided value or 0
        }
        effectiveTotalSurface = calculatedSurface > 0 ? calculatedSurface : totalSurface
      }
      
      // Process all flexible pieces
      for (const item of flexiblePieces) {
        if (item.type === 'auto') {
          const count = item.count || 0
          const surface = item.surface || 0
          if (count > 0 && surface > 0) {
            usedSurface += count * surface
            const costPerPiece = effectiveTotalSurface > 0 ? (surface / effectiveTotalSurface) * totalCost : 0
            pieces.push({ 
              count, 
              surface, 
              cost: costPerPiece,
              startNumber: item.startNumber || 1
            })
          }
        } else if (item.type === 'custom') {
          const surface = item.customSurface || 0
          if (surface > 0 && item.pieceNumber) {
            usedSurface += surface
            const costPerPiece = effectiveTotalSurface > 0 ? (surface / effectiveTotalSurface) * totalCost : 0
            pieces.push({ 
              count: 1, 
              surface, 
              cost: costPerPiece,
              pieceNumbers: [item.pieceNumber]
            })
          }
        } else if (item.type === 'auto_smart') {
          // Auto smart: Use min/max/preferred sizes to generate pieces
          // This uses the remaining surface from total, not just what's left
          const minSize = item.minSize || parseFloat(autoMinSize) || 200
          const maxSize = item.maxSize || parseFloat(autoMaxSize) || 600
          const preferredSize = item.preferredSize || parseFloat(autoPreferredSize) || 400
          let remaining = effectiveTotalSurface - usedSurface
          
          if (remaining <= 0) continue // Skip if no surface left
          
          // Try to use preferred size first
          const preferredCount = Math.floor(remaining / preferredSize)
          if (preferredCount > 0) {
            const costPerPiece = effectiveTotalSurface > 0 ? (preferredSize / effectiveTotalSurface) * totalCost : 0
            pieces.push({ count: preferredCount, surface: preferredSize, cost: costPerPiece })
            remaining -= preferredCount * preferredSize
            usedSurface += preferredCount * preferredSize
          }
          
          // Use remaining space for last piece if > minSize
          if (remaining >= minSize && remaining <= maxSize) {
            const costPerPiece = effectiveTotalSurface > 0 ? (remaining / effectiveTotalSurface) * totalCost : 0
            pieces.push({ count: 1, surface: remaining, cost: costPerPiece })
            usedSurface += remaining
          } else if (remaining > maxSize) {
            const extraCount = Math.floor(remaining / preferredSize)
            if (extraCount > 0) {
              const costPerPiece = effectiveTotalSurface > 0 ? (preferredSize / effectiveTotalSurface) * totalCost : 0
              pieces.push({ count: extraCount, surface: preferredSize, cost: costPerPiece })
              remaining -= extraCount * preferredSize
              usedSurface += extraCount * preferredSize
            }
            if (remaining >= minSize) {
              const costPerPiece = effectiveTotalSurface > 0 ? (remaining / effectiveTotalSurface) * totalCost : 0
              pieces.push({ count: 1, surface: remaining, cost: costPerPiece })
              usedSurface += remaining
            }
          }
        } else if (item.type === 'smart') {
          // Smart: Optimize based on strategy
          // This uses the remaining surface from total
          let remaining = effectiveTotalSurface - usedSurface
          const optimization = item.optimization || smartOptimization
          
          if (remaining <= 0) continue // Skip if no surface left
          
          if (optimization === 'max_pieces') {
            const optimalSize = 300
            const count = Math.floor(remaining / optimalSize)
            if (count > 0) {
              const actualSize = remaining / count
              const costPerPiece = effectiveTotalSurface > 0 ? (actualSize / effectiveTotalSurface) * totalCost : 0
              pieces.push({ count, surface: actualSize, cost: costPerPiece })
              usedSurface += remaining
            }
          } else if (optimization === 'min_waste') {
            const optimalSize = 500
            const count = Math.floor(remaining / optimalSize)
            const used = count * optimalSize
            if (count > 0) {
              const costPerPiece = effectiveTotalSurface > 0 ? (optimalSize / effectiveTotalSurface) * totalCost : 0
              pieces.push({ count, surface: optimalSize, cost: costPerPiece })
              remaining -= used
              usedSurface += used
            }
            if (remaining > 0) {
              const costPerPiece = effectiveTotalSurface > 0 ? (remaining / effectiveTotalSurface) * totalCost : 0
              pieces.push({ count: 1, surface: remaining, cost: costPerPiece })
              usedSurface += remaining
            }
          } else {
            // Balanced: mix of sizes
            const largeCount = Math.floor(remaining * 0.3 / 600)
            const largeSize = 600
            const largeUsed = largeCount * largeSize
            remaining -= largeUsed
            
            const mediumCount = Math.floor(remaining * 0.5 / 400)
            const mediumSize = 400
            const mediumUsed = mediumCount * mediumSize
            remaining -= mediumUsed
            
            const smallSize = remaining > 0 ? remaining : 0
            const smallCount = smallSize > 200 ? 1 : 0
            
            if (largeCount > 0) {
              pieces.push({ count: largeCount, surface: largeSize, cost: effectiveTotalSurface > 0 ? (largeSize / effectiveTotalSurface) * totalCost : 0 })
              usedSurface += largeUsed
            }
            if (mediumCount > 0) {
              pieces.push({ count: mediumCount, surface: mediumSize, cost: effectiveTotalSurface > 0 ? (mediumSize / effectiveTotalSurface) * totalCost : 0 })
              usedSurface += mediumUsed
            }
            if (smallCount > 0) {
              pieces.push({ count: smallCount, surface: smallSize, cost: effectiveTotalSurface > 0 ? (smallSize / effectiveTotalSurface) * totalCost : 0 })
              usedSurface += smallSize
            }
          }
        }
      }
      
      const totalCount = pieces.reduce((sum, p) => sum + p.count, 0)
      const totalUsed = pieces.reduce((sum, p) => sum + p.count * p.surface, 0)
      return { count: totalCount, pieces, totalUsed }
    }
    
    if (generationMode === 'mixed') {
      const pieces: { count: number; surface: number; cost: number }[] = []
      let usedSurface = 0
      
      // Process all custom configs
      for (const config of customConfigs) {
        if (config.count > 0 && config.surface > 0) {
          usedSurface += config.count * config.surface
          const costPerPiece = totalSurface > 0 ? (config.surface / totalSurface) * totalCost : 0
          pieces.push({ count: config.count, surface: config.surface, cost: costPerPiece })
        }
      }
      
      // Calculate "rest" using restPieceSize
      const restSize = parseFloat(restPieceSize) || 400
      const remainingSurface = totalSurface - usedSurface
      const restCount = restSize > 0 ? Math.floor(remainingSurface / restSize) : 0
      const restCostPerPiece = totalSurface > 0 ? (restSize / totalSurface) * totalCost : 0
      if (restCount > 0) {
        pieces.push({ count: restCount, surface: restSize, cost: restCostPerPiece })
      }
      
      const totalCount = pieces.reduce((sum, p) => sum + p.count, 0)
      const totalUsed = pieces.reduce((sum, p) => sum + p.count * p.surface, 0)
      return { count: totalCount, pieces, totalUsed }
    }
    
    if (generationMode === 'auto') {
      // Auto mode: Generate pieces with sizes between min and max, preferring preferred size
      const minSize = parseFloat(autoMinSize) || 200
      const maxSize = parseFloat(autoMaxSize) || 600
      const preferredSize = parseFloat(autoPreferredSize) || 400
      const pieces: { count: number; surface: number; cost: number }[] = []
      let remaining = totalSurface
      
      // Try to use preferred size first
      const preferredCount = Math.floor(remaining / preferredSize)
      if (preferredCount > 0) {
        const costPerPiece = totalSurface > 0 ? (preferredSize / totalSurface) * totalCost : 0
        pieces.push({ count: preferredCount, surface: preferredSize, cost: costPerPiece })
        remaining -= preferredCount * preferredSize
      }
      
      // Use remaining space for last piece if > minSize
      if (remaining >= minSize && remaining <= maxSize) {
        const costPerPiece = totalSurface > 0 ? (remaining / totalSurface) * totalCost : 0
        pieces.push({ count: 1, surface: remaining, cost: costPerPiece })
        remaining = 0
      } else if (remaining > maxSize) {
        // If remaining is too large, create more pieces
        const extraCount = Math.floor(remaining / preferredSize)
        if (extraCount > 0) {
          const costPerPiece = totalSurface > 0 ? (preferredSize / totalSurface) * totalCost : 0
          pieces.push({ count: extraCount, surface: preferredSize, cost: costPerPiece })
          remaining -= extraCount * preferredSize
        }
        // Add final piece if remaining is valid
        if (remaining >= minSize) {
          const costPerPiece = totalSurface > 0 ? (remaining / totalSurface) * totalCost : 0
          pieces.push({ count: 1, surface: remaining, cost: costPerPiece })
        }
      }
      
      const totalCount = pieces.reduce((sum, p) => sum + p.count, 0)
      const totalUsed = pieces.reduce((sum, p) => sum + p.count * p.surface, 0)
      return { count: totalCount, pieces, totalUsed }
    }
    
    if (generationMode === 'smart') {
      // Smart mode: Optimize based on strategy
      const pieces: { count: number; surface: number; cost: number }[] = []
      let remaining = totalSurface
      
      if (smartOptimization === 'max_pieces') {
        // Maximize number of pieces (use smaller sizes)
        const optimalSize = 300 // Smaller pieces = more pieces
        const count = Math.floor(remaining / optimalSize)
        if (count > 0) {
          const actualSize = remaining / count
          const costPerPiece = totalSurface > 0 ? (actualSize / totalSurface) * totalCost : 0
          pieces.push({ count, surface: actualSize, cost: costPerPiece })
          remaining = 0
        }
      } else if (smartOptimization === 'min_waste') {
        // Minimize waste (use larger sizes, fill exactly)
        const optimalSize = 500
        const count = Math.floor(remaining / optimalSize)
        const used = count * optimalSize
        if (count > 0) {
          const costPerPiece = totalSurface > 0 ? (optimalSize / totalSurface) * totalCost : 0
          pieces.push({ count, surface: optimalSize, cost: costPerPiece })
          remaining -= used
        }
        // Use remaining for one piece
        if (remaining > 0) {
          const costPerPiece = totalSurface > 0 ? (remaining / totalSurface) * totalCost : 0
          pieces.push({ count: 1, surface: remaining, cost: costPerPiece })
        }
      } else {
        // Balanced: mix of sizes
        const largeCount = Math.floor(remaining * 0.3 / 600) // 30% as large pieces
        const largeSize = 600
        const largeUsed = largeCount * largeSize
        remaining -= largeUsed
        
        const mediumCount = Math.floor(remaining * 0.5 / 400) // 50% as medium
        const mediumSize = 400
        const mediumUsed = mediumCount * mediumSize
        remaining -= mediumUsed
        
        const smallSize = remaining > 0 ? remaining : 0
        const smallCount = smallSize > 200 ? 1 : 0
        
        if (largeCount > 0) {
          pieces.push({ count: largeCount, surface: largeSize, cost: totalSurface > 0 ? (largeSize / totalSurface) * totalCost : 0 })
        }
        if (mediumCount > 0) {
          pieces.push({ count: mediumCount, surface: mediumSize, cost: totalSurface > 0 ? (mediumSize / totalSurface) * totalCost : 0 })
        }
        if (smallCount > 0) {
          pieces.push({ count: smallCount, surface: smallSize, cost: totalSurface > 0 ? (smallSize / totalSurface) * totalCost : 0 })
        }
      }
      
      const totalCount = pieces.reduce((sum, p) => sum + p.count, 0)
      const totalUsed = pieces.reduce((sum, p) => sum + p.count * p.surface, 0)
      return { count: totalCount, pieces, totalUsed }
    }
    
    if (generationMode === 'advanced') {
      // Advanced: Parse JSON pattern or use default
      try {
        const pattern = advancedPattern ? JSON.parse(advancedPattern) : []
        const pieces: { count: number; surface: number; cost: number }[] = []
        let usedSurface = 0
        
        pattern.forEach((p: { count: number; surface: number }) => {
          if (p.count > 0 && p.surface > 0) {
            usedSurface += p.count * p.surface
            const costPerPiece = totalSurface > 0 ? (p.surface / totalSurface) * totalCost : 0
            pieces.push({ count: p.count, surface: p.surface, cost: costPerPiece })
          }
        })
        
        const totalCount = pieces.reduce((sum, p) => sum + p.count, 0)
        return { count: totalCount, pieces, totalUsed: usedSurface }
      } catch {
        return { count: 0, pieces: [], totalUsed: 0 }
      }
    }
    
    return { count: 0, pieces: [], totalUsed: 0 }
  }

  const piecesPreview = useMemo(calculatePiecesPreview, [
    batchForm.total_surface, 
    batchForm.total_cost, 
    generationMode, 
    uniformSize, 
    customConfigs, 
    restPieceSize,
    autoMinSize,
    autoMaxSize,
    autoPreferredSize,
    smartOptimization,
    advancedPattern,
    flexiblePieces
  ])

  const [savingBatch, setSavingBatch] = useState(false)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('يرجى اختيار ملف صورة صحيح')
        return
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('حجم الصورة كبير جداً. الحد الأقصى 5 ميجابايت')
        return
      }
      setImageFile(file)
      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const uploadImage = async (batchId: string): Promise<string | null> => {
    if (!imageFile) return batchForm.image_url || null

    try {
      setUploadingImage(true)
      const fileExt = imageFile.name.split('.').pop()
      const fileName = `${batchId}-${Date.now()}.${fileExt}`
      const filePath = `land-batches/${fileName}`

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('land-images')
        .upload(filePath, imageFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        
        // Provide specific error messages
        if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('RLS')) {
          throw new Error('خطأ في الصلاحيات: يرجى التأكد من تشغيل ملف SQL لإعداد Storage Bucket (ADD_IMAGE_TO_LAND_BATCHES.sql)')
        } else if (uploadError.message?.includes('Bucket not found') || uploadError.message?.includes('does not exist')) {
          throw new Error('خطأ: Bucket غير موجود. يرجى تشغيل ملف SQL لإعداد Storage Bucket')
        } else if (uploadError.message?.includes('file size')) {
          throw new Error('حجم الملف كبير جداً. الحد الأقصى 5 ميجابايت')
        } else {
          throw new Error(uploadError.message || 'خطأ في رفع الصورة')
        }
      }

      // Get public URL
      const { data } = supabase.storage
        .from('land-images')
        .getPublicUrl(filePath)

      return data.publicUrl
    } catch (error: any) {
      console.error('Error uploading image:', error)
      const errorMessage = error.message || 'خطأ غير معروف في رفع الصورة'
      setError(errorMessage)
      return null
    } finally {
      setUploadingImage(false)
    }
  }

  const saveBatch = async () => {
    if (savingBatch) return // Prevent double submission
    
    // Authorization check
    if (!hasPermission('edit_land')) {
      setError('ليس لديك صلاحية لتعديل الأراضي')
      return
    }
    
    setSavingBatch(true)
    setError(null)
    
    try {
      // For manual mode, totals will be calculated from pieces later
      // Set to 0 initially - will be updated when pieces are added
      const totalSurface = 0
      const totalCost = 0
      
      // Sanitize inputs
      // Use today's date as default (since DB requires NOT NULL)
      const dateAcquired = new Date().toISOString().split('T')[0]
      
      // Ensure total_surface and total_cost are numbers (required by DB - NOT NULL)
      const finalTotalSurface = totalSurface ? parseFloat(String(totalSurface)) || 0 : 0
      const finalTotalCost = totalCost ? parseFloat(String(totalCost)) || 0 : 0
      
      const batchData: any = {
        name: sanitizeText(batchForm.name),
        total_surface: finalTotalSurface,
        total_cost: finalTotalCost,
        date_acquired: dateAcquired,
        notes: batchForm.notes ? sanitizeNotes(batchForm.notes) : null,
      }
      
      // Add location if provided (column may not exist if migration not run)
      if (batchForm.location && batchForm.location.trim()) {
        batchData.location = sanitizeText(batchForm.location)
      }
      
      // Add real estate tax number if provided (column may not exist if migration not run)
      if (batchForm.real_estate_tax_number && batchForm.real_estate_tax_number.trim()) {
        batchData.real_estate_tax_number = sanitizeText(batchForm.real_estate_tax_number)
      }

      // Add price per m² - always include these fields (even if 0 or null) so they can be updated later
      const pricePerM2Full = batchForm.price_per_m2_full && batchForm.price_per_m2_full.trim() 
        ? parseFloat(batchForm.price_per_m2_full) 
        : null
      const pricePerM2Installment = batchForm.price_per_m2_installment && batchForm.price_per_m2_installment.trim()
        ? parseFloat(batchForm.price_per_m2_installment)
        : null
      
      // Always include these fields in batchData (even if null) to ensure they're saved
      batchData.price_per_m2_full = pricePerM2Full !== null && !isNaN(pricePerM2Full) ? pricePerM2Full : null
      batchData.price_per_m2_installment = pricePerM2Installment !== null && !isNaN(pricePerM2Installment) ? pricePerM2Installment : null

      // Add company fee for installment, company fee for full payment, received amount, and number of months
      const companyFeePercentage = batchForm.company_fee_percentage && batchForm.company_fee_percentage.trim()
        ? parseFloat(batchForm.company_fee_percentage)
        : null
      const companyFeePercentageFull = batchForm.company_fee_percentage_full && batchForm.company_fee_percentage_full.trim()
        ? parseFloat(batchForm.company_fee_percentage_full)
        : null
      const receivedAmount = batchForm.received_amount && batchForm.received_amount.trim()
        ? parseFloat(batchForm.received_amount)
        : null
      const numberOfMonths = batchForm.number_of_months && batchForm.number_of_months.trim()
        ? parseInt(batchForm.number_of_months, 10)
        : null
      
      // Add these fields to batchData (even if null)
      if (companyFeePercentage !== null && !isNaN(companyFeePercentage)) {
        batchData.company_fee_percentage = companyFeePercentage
      }
      if (companyFeePercentageFull !== null && !isNaN(companyFeePercentageFull)) {
        batchData.company_fee_percentage_full = companyFeePercentageFull
      }
      if (receivedAmount !== null && !isNaN(receivedAmount)) {
        batchData.received_amount = receivedAmount
      }
      if (numberOfMonths !== null && !isNaN(numberOfMonths)) {
        batchData.number_of_months = numberOfMonths
      }

      // Handle image upload
      let imageUrl = batchForm.image_url || null
      if (imageFile) {
        // For new batches, we'll upload after creation
        // For existing batches, upload now
        if (editingBatch) {
          const uploadedUrl = await uploadImage(editingBatch.id)
          if (uploadedUrl) {
            imageUrl = uploadedUrl
          }
        }
      }
      batchData.image_url = imageUrl

      // Add created_by for new batches (track who created this batch)
      if (!editingBatch) {
        batchData.created_by = user?.id || null
      }

      if (editingBatch) {
        // Check if pricing changed - if so, update all available land pieces
        const oldPricePerM2Full = (editingBatch as any).price_per_m2_full
        const oldPricePerM2Installment = (editingBatch as any).price_per_m2_installment
        
        // Compare old and new prices (handle null/undefined and numeric comparison)
        const oldFullNum = oldPricePerM2Full !== null && oldPricePerM2Full !== undefined ? parseFloat(String(oldPricePerM2Full)) : null
        const oldInstallmentNum = oldPricePerM2Installment !== null && oldPricePerM2Installment !== undefined ? parseFloat(String(oldPricePerM2Installment)) : null
        
        const pricingChanged = (pricePerM2Full !== null && !isNaN(pricePerM2Full) && (oldFullNum === null || Math.abs(oldFullNum - pricePerM2Full) > 0.01)) ||
                              (pricePerM2Installment !== null && !isNaN(pricePerM2Installment) && (oldInstallmentNum === null || Math.abs(oldInstallmentNum - pricePerM2Installment) > 0.01))
        
        const { error } = await supabase
          .from('land_batches')
          .update(batchData)
          .eq('id', editingBatch.id)
        if (error) throw error

        // Reload offers after batch update to ensure they're fresh
        const { data: updatedOffers } = await supabase
          .from('payment_offers')
          .select('*')
          .eq('land_batch_id', editingBatch.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
        setBatchOffers((updatedOffers as PaymentOffer[]) || [])

        // If pricing changed and both prices are valid, update all available land pieces in this batch
        if (pricingChanged && pricePerM2Full !== null && !isNaN(pricePerM2Full) && pricePerM2Full > 0 && 
            pricePerM2Installment !== null && !isNaN(pricePerM2Installment) && pricePerM2Installment > 0) {
          // Fetch all available pieces for this batch
          const { data: availablePieces, error: piecesError } = await supabase
            .from('land_pieces')
            .select('id, surface_area')
            .eq('land_batch_id', editingBatch.id)
            .eq('status', 'Available')
          
          if (piecesError) {
            console.error('Error fetching available pieces:', piecesError)
            // Don't throw - batch update was successful, piece update is optional
          } else if (availablePieces && availablePieces.length > 0) {
            // Update prices for all available pieces
            const updates = availablePieces.map((piece: any) => ({
              id: piece.id,
              selling_price_full: Math.round((piece.surface_area || 0) * pricePerM2Full * 100) / 100,
              selling_price_installment: Math.round((piece.surface_area || 0) * pricePerM2Installment * 100) / 100,
            }))

            // Update pieces one by one (Supabase doesn't support bulk updates with different values)
            for (const update of updates) {
              const { error: updateError } = await supabase
                .from('land_pieces')
                .update({
                  selling_price_full: update.selling_price_full,
                  selling_price_installment: update.selling_price_installment,
                })
                .eq('id', update.id)
              
              if (updateError) {
                console.error(`Error updating piece ${update.id}:`, updateError)
                // Continue with other pieces even if one fails
              }
            }
          }
        }
      } else {
        // Create batch
        const { data: newBatch, error: batchError } = await supabase
          .from('land_batches')
          .insert([batchData])
          .select('*')
          .single()
        if (batchError) throw batchError

        // Upload image for new batch if provided
        if (newBatch && imageFile) {
          const uploadedUrl = await uploadImage(newBatch.id)
          if (uploadedUrl) {
            // Update batch with image URL
            await supabase
              .from('land_batches')
              .update({ image_url: uploadedUrl })
              .eq('id', newBatch.id)
            batchData.image_url = uploadedUrl
          }
        }

        // If this is a new batch and user might add pieces immediately, set it as selected
        // This ensures the price_per_m2 fields are available when calculating piece prices
        if (newBatch) {
          setSelectedBatchForPiece(newBatch as LandBatch)
          setSelectedBatchId(newBatch.id)
        }

        // Pieces will be added manually after batch creation
        if (false && newBatch) {
          const piecesToCreate: {
            land_batch_id: string
            piece_number: string
            surface_area: number
            purchase_cost: number
            selling_price_full: number
            selling_price_installment: number
            status: string
          }[] = []
          
          // Calculate totals - for flexible mode, calculate from pieces if not provided
          let totalSurface = parseFloat(batchForm.total_surface) || 0
          let totalCost = parseFloat(batchForm.total_cost) || 0

          if (generationMode === 'custom_flexible') {
            // Calculate total surface from pieces if not provided
            if (!batchForm.total_surface || totalSurface === 0) {
              totalSurface = piecesPreview.totalUsed
            }
            
            // If total_cost not provided, set to 0 (will be calculated per piece based on surface ratio)
            if (!batchForm.total_cost) {
              totalCost = 0
            }
            
            // Update batch with calculated totals
            if (totalSurface > 0 || totalCost > 0) {
              const { error: updateError } = await supabase
                .from('land_batches')
                .update({ 
                  total_surface: totalSurface || 0,
                  total_cost: totalCost || 0
                })
                .eq('id', newBatch.id)
              if (updateError) throw updateError
            }
            
            // Handle flexible piece generation
            // Calculate effective totals for cost calculation
            let effectiveTotalSurface = totalSurface
            if (effectiveTotalSurface === 0) {
              effectiveTotalSurface = piecesPreview.totalUsed
            }
            
            let pieceNumberCounter = 1
            for (const pieceConfig of piecesPreview.pieces) {
              if ((pieceConfig as any).pieceNumbers) {
                // Custom piece with specific number
                const pieceNumber = (pieceConfig as any).pieceNumbers[0]
                const purchaseCost = effectiveTotalSurface > 0 
                  ? (pieceConfig.surface / effectiveTotalSurface) * totalCost 
                  : 0
                
                const pricePerM2Full = parseFloat(batchForm.price_per_m2_full) || 0
                const pricePerM2Installment = parseFloat(batchForm.price_per_m2_installment) || 0
                
                piecesToCreate.push({
                  land_batch_id: newBatch.id,
                  piece_number: pieceNumber,
                  surface_area: pieceConfig.surface,
                  purchase_cost: purchaseCost,
                  selling_price_full: pricePerM2Full * pieceConfig.surface,
                  selling_price_installment: pricePerM2Installment * pieceConfig.surface,
                  status: 'Available',
                })
              } else if ((pieceConfig as any).startNumber !== undefined) {
                // Auto range - support alphanumeric patterns (B1, R1, P001, etc.)
                const startNumber = (pieceConfig as any).startNumber
                const startNumberStr = String(startNumber)
                
                for (let i = 0; i < pieceConfig.count; i++) {
                  const purchaseCost = effectiveTotalSurface > 0 
                    ? (pieceConfig.surface / effectiveTotalSurface) * totalCost 
                    : 0
                  
                  // Format number - support alphanumeric patterns (B1, R1, P001, etc.)
                  let formattedNumber = ''
                  
                  // Check if startNumber is alphanumeric (e.g., B1, R1, P001, B0)
                  const alphanumericMatch = startNumberStr.match(/^([A-Za-z\u0600-\u06FF]+)(\d+)$/i)
                  if (alphanumericMatch) {
                    const prefix = alphanumericMatch[1]
                    const startNum = parseInt(alphanumericMatch[2], 10)
                    const numDigits = alphanumericMatch[2].length
                    const newNumber = startNum + i
                    formattedNumber = `${prefix}${String(newNumber).padStart(numDigits, '0')}`
                  } else {
                    // Pure number - check if it's a number
                    const numberMatch = startNumberStr.match(/^(\d+)$/)
                    if (numberMatch) {
                      const startNum = parseInt(numberMatch[1], 10)
                      formattedNumber = String(startNum + i)
                    } else {
                      // Fallback: use as-is and append counter
                      formattedNumber = `${startNumberStr}${i > 0 ? i : ''}`
                    }
                  }
                  
                  const pricePerM2Full = parseFloat(batchForm.price_per_m2_full) || 0
                  const pricePerM2Installment = parseFloat(batchForm.price_per_m2_installment) || 0
                  
                  piecesToCreate.push({
                    land_batch_id: newBatch.id,
                    piece_number: formattedNumber,
                    surface_area: pieceConfig.surface,
                    purchase_cost: purchaseCost,
                    selling_price_full: pricePerM2Full * pieceConfig.surface,
                    selling_price_installment: pricePerM2Installment * pieceConfig.surface,
                    status: 'Available',
                  })
                }
              } else {
                // Handle auto_smart and smart pieces (no specific numbering, use sequential)
                for (let i = 0; i < pieceConfig.count; i++) {
                  const purchaseCost = effectiveTotalSurface > 0 
                    ? (pieceConfig.surface / effectiveTotalSurface) * totalCost 
                    : 0
                  
                  const pricePerM2Full = parseFloat(batchForm.price_per_m2_full) || 0
                  const pricePerM2Installment = parseFloat(batchForm.price_per_m2_installment) || 0
                  
                  piecesToCreate.push({
                    land_batch_id: newBatch.id,
                    piece_number: `P${String(pieceNumberCounter).padStart(3, '0')}`,
                    surface_area: pieceConfig.surface,
                    purchase_cost: purchaseCost,
                    selling_price_full: pricePerM2Full * pieceConfig.surface,
                    selling_price_installment: pricePerM2Installment * pieceConfig.surface,
                    status: 'Available',
                  })
                  pieceNumberCounter++
                }
              }
            }
          } else {
            // Original logic for other modes
            let pieceNumber = 1
            for (const pieceConfig of piecesPreview.pieces) {
              for (let i = 0; i < pieceConfig.count; i++) {
                // Calculate purchase cost based on surface ratio
                const purchaseCost = totalSurface > 0 
                  ? (pieceConfig.surface / totalSurface) * totalCost 
                  : 0
                
                const pricePerM2Full = parseFloat(batchForm.price_per_m2_full) || 0
                const pricePerM2Installment = parseFloat(batchForm.price_per_m2_installment) || 0
                
                piecesToCreate.push({
                  land_batch_id: newBatch.id,
                  piece_number: `P${String(pieceNumber).padStart(3, '0')}`,
                  surface_area: pieceConfig.surface,
                  purchase_cost: Math.round(purchaseCost * 100) / 100,
                  selling_price_full: pricePerM2Full * pieceConfig.surface,
                  selling_price_installment: pricePerM2Installment * pieceConfig.surface,
                  status: 'Available',
                })
                pieceNumber++
              }
            }
          }

          if (piecesToCreate.length > 0) {
            const { error: piecesError } = await supabase
              .from('land_pieces')
              .insert(piecesToCreate)
            if (piecesError) throw piecesError
          }
        }
      }

      // Reload offers if editing batch (before closing dialog)
      if (editingBatch) {
        const { data: offers } = await supabase
          .from('payment_offers')
          .select('*')
          .eq('land_batch_id', editingBatch.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
        setBatchOffers((offers as PaymentOffer[]) || [])
      }

      setBatchDialogOpen(false)
      
      // Always refresh batches after save to show updated data
        await fetchBatches()
      
      setError(null)
    } catch (error: any) {
      console.error('Error saving batch:', error)
      let errorMessage = 'خطأ في حفظ الدفعة. يرجى المحاولة مرة أخرى.'
      
      // Check for specific database errors
      if (error?.code === '42703' || error?.message?.includes('column') || error?.message?.includes('does not exist')) {
        errorMessage = 'خطأ: عمود غير موجود في قاعدة البيانات. يرجى التأكد من تشغيل جميع ملفات SQL المطلوبة (add_location_to_land_batches.sql و add_real_estate_tax_number.sql)'
      } else if (error?.code === '23502' || error?.message?.includes('NOT NULL')) {
        errorMessage = 'خطأ: بعض الحقول المطلوبة فارغة. يرجى التأكد من ملء جميع الحقول المطلوبة.'
      } else if (error?.message) {
        errorMessage = `خطأ في حفظ الدفعة: ${error.message}`
      }
      
      setError(errorMessage)
    } finally {
      setSavingBatch(false)
    }
  }

  const deleteBatch = async (batchId: string) => {
    // Authorization check
    if (!hasPermission('delete_land')) {
      setError('ليس لديك صلاحية لحذف الأراضي')
      return
    }
    
    setBatchToDelete(batchId)
    setDeleteConfirmOpen(true)
  }

  const confirmDeleteBatch = async () => {
    if (!batchToDelete) return

    setError(null)
    try {
      const { error } = await supabase
        .from('land_batches')
        .delete()
        .eq('id', batchToDelete)
      if (error) throw error
      fetchBatches()
      setError(null)
    } catch (error) {
      setError('خطأ في حذف الدفعة')
    } finally {
      setBatchToDelete(null)
      setDeleteConfirmOpen(false)
    }
  }

  const deletePiece = (piece: LandPiece, batchId: string) => {
    if (!hasPermission('edit_land')) {
      setError('ليس لديك صلاحية لحذف القطع')
      return
    }
    setPieceToDelete({ id: piece.id, piece_number: piece.piece_number, batch_id: batchId })
    setDeletePieceConfirmOpen(true)
  }

  const confirmDeletePiece = async () => {
    if (!pieceToDelete) return

    setError(null)
    try {
      // Check if piece is sold or reserved
      const { data: pieceData, error: fetchError } = await supabase
        .from('land_pieces')
        .select('status')
        .eq('id', pieceToDelete.id)
        .single()

      if (fetchError) throw fetchError

      if (pieceData?.status === 'Sold') {
        setError('لا يمكن حذف قطعة مباعة')
        setDeletePieceConfirmOpen(false)
        setPieceToDelete(null)
        return
      }

      // Check if piece has active reservations
      const { data: reservations } = await supabase
        .from('reservations')
        .select('id')
        .contains('land_piece_ids', [pieceToDelete.id])
        .in('status', ['Pending', 'Completed'])

      if (reservations && reservations.length > 0) {
        setError('لا يمكن حذف قطعة محجوزة. يرجى إلغاء الحجز أولاً')
        setDeletePieceConfirmOpen(false)
        setPieceToDelete(null)
        return
      }

      // Check if piece has active sales
      const { data: sales } = await supabase
        .from('sales')
        .select('id, status')
        .contains('land_piece_ids', [pieceToDelete.id])
        .neq('status', 'Cancelled')

      if (sales && sales.length > 0) {
        const hasActiveSale = sales.some(s => s.status !== 'Completed')
        if (hasActiveSale) {
          setError('لا يمكن حذف قطعة مرتبطة ببيع نشط')
          setDeletePieceConfirmOpen(false)
          setPieceToDelete(null)
          return
        }
      }

      const { error } = await supabase
        .from('land_pieces')
        .delete()
        .eq('id', pieceToDelete.id)

      if (error) throw error
      
      fetchBatches()
      setError(null)
    } catch (error: any) {
      setError(error.message || 'خطأ في حذف القطعة')
    } finally {
      setPieceToDelete(null)
      setDeletePieceConfirmOpen(false)
    }
  }

  const openPriceEditDialog = (batchId: string, piece: LandPiece) => {
    setEditingPricePiece(piece)
    setPriceForm({
      selling_price_full: piece.selling_price_full.toString(),
      selling_price_installment: piece.selling_price_installment.toString(),
    })
    setPriceEditDialogOpen(true)
  }

  const openBulkPriceDialog = (batch: LandBatchWithPieces) => {
    setBulkPriceBatch(batch)
    // Calculate average price per m² from existing pieces
    if (batch.land_pieces.length > 0) {
      const avgFull = batch.land_pieces.reduce((sum, p) => sum + (p.selling_price_full || 0), 0) / batch.land_pieces.length
      const avgInstallment = batch.land_pieces.reduce((sum, p) => sum + (p.selling_price_installment || 0), 0) / batch.land_pieces.length
      const avgSurface = batch.land_pieces.reduce((sum, p) => sum + (p.surface_area || 0), 0) / batch.land_pieces.length
      setBulkPriceForm({
        price_per_m2_full: avgSurface > 0 ? (avgFull / avgSurface).toFixed(2) : '',
        price_per_m2_installment: avgSurface > 0 ? (avgInstallment / avgSurface).toFixed(2) : '',
      })
    } else {
      setBulkPriceForm({
        price_per_m2_full: '',
        price_per_m2_installment: '',
      })
    }
    setBulkPriceDialogOpen(true)
  }

  const savePriceEdit = async () => {
    if (!editingPricePiece || !user || user.role !== 'Owner') {
      setError('فقط المالك يمكنه تعديل الأسعار')
      return
    }

    setError(null)
    try {
      const oldFull = editingPricePiece.selling_price_full
      const oldInstallment = editingPricePiece.selling_price_installment
      const newFull = parseFloat(priceForm.selling_price_full)
      const newInstallment = parseFloat(priceForm.selling_price_installment)

      if (isNaN(newFull) || isNaN(newInstallment) || newFull < 0 || newInstallment < 0) {
        setError('يرجى إدخال أسعار صحيحة')
        return
      }

      // Update piece prices
      const { error } = await supabase
        .from('land_pieces')
        .update({
          selling_price_full: newFull,
          selling_price_installment: newInstallment,
        })
        .eq('id', editingPricePiece.id)

      if (error) throw error

      // Log price change in audit log
      try {
        await supabase.from('audit_logs').insert({
          action: 'price_change',
          entity_type: 'land_piece',
          entity_id: editingPricePiece.id,
          details: JSON.stringify({
            piece_number: editingPricePiece.piece_number,
            old_price_full: oldFull,
            new_price_full: newFull,
            old_price_installment: oldInstallment,
            new_price_installment: newInstallment,
            note: 'تم تعديل أسعار القطعة - سيؤثر فقط على المبيعات المستقبلية',
          }),
          user_id: user?.id,
        })
      } catch (auditError) {
        console.warn('Failed to log price change:', auditError)
        // Don't fail the operation if audit log fails
      }

      setPriceEditDialogOpen(false)
      fetchBatches()
      setError(null)
    } catch (err: any) {
      setError(err.message || 'خطأ في حفظ الأسعار')
    }
  }

  const saveBulkPriceUpdate = async () => {
    if (!bulkPriceBatch || !user || user.role !== 'Owner') {
      setError('فقط المالك يمكنه تعديل الأسعار')
      return
    }

    setError(null)
    try {
      const pricePerM2Full = parseFloat(bulkPriceForm.price_per_m2_full)
      const pricePerM2Installment = parseFloat(bulkPriceForm.price_per_m2_installment)

      if (isNaN(pricePerM2Full) || isNaN(pricePerM2Installment) || pricePerM2Full < 0 || pricePerM2Installment < 0) {
        setError('يرجى إدخال أسعار صحيحة')
        return
      }

      const batchWithPieces = bulkPriceBatch as LandBatchWithPieces
      // Update all pieces in batch
      const updates = batchWithPieces.land_pieces.map(piece => ({
        id: piece.id,
        selling_price_full: piece.surface_area * pricePerM2Full,
        selling_price_installment: piece.surface_area * pricePerM2Installment,
      }))

      for (const update of updates) {
        const { error } = await supabase
          .from('land_pieces')
          .update({
            selling_price_full: update.selling_price_full,
            selling_price_installment: update.selling_price_installment,
          })
          .eq('id', update.id)

        if (error) throw error

        // Log price change for each piece
        try {
          await supabase.from('audit_logs').insert({
            action: 'bulk_price_change',
            entity_type: 'land_batch',
            entity_id: bulkPriceBatch.id,
            details: JSON.stringify({
              piece_id: update.id,
              price_per_m2_full: pricePerM2Full,
              price_per_m2_installment: pricePerM2Installment,
              note: 'تحديث جماعي للأسعار - سيؤثر فقط على المبيعات المستقبلية',
            }),
            user_id: user?.id,
          })
        } catch (auditError) {
          console.warn('Failed to log bulk price change:', auditError)
        }
      }

      setBulkPriceDialogOpen(false)
      fetchBatches()
      setError(null)
    } catch (err: any) {
      setError(err.message || 'خطأ في تحديث الأسعار')
    }
  }

  const openBulkAddDialog = (batchId: string) => {
    setSelectedBatchId(batchId)
    const batch = batches.find(b => b.id === batchId)
    setSelectedBatchForPiece(batch || null)
    
    // Get default surface area
    let avgSurface = defaultSurfaceArea
    if (batch?.land_pieces && batch.land_pieces.length > 0) {
      const totalSurface = batch.land_pieces.reduce((sum, p) => sum + (p.surface_area || 0), 0)
      avgSurface = Math.round(totalSurface / batch.land_pieces.length).toString()
    }
    
    setBulkAddForm({
      from: '',
      to: '',
      surface_area: avgSurface,
    })
    setBulkAddDialogOpen(true)
  }

  const openPieceDialog = async (batchId: string, piece?: LandPiece) => {
    setSelectedBatchId(batchId)
    // Find the batch for auto-calculation
    const batch = batches.find(b => b.id === batchId)
    setSelectedBatchForPiece(batch || null)
    
    if (piece) {
      setEditingPiece(piece)
      // Keep the full alphanumeric piece number (B1, R1, P001, etc.)
      const pieceNumber = piece.piece_number || ''
      // Calculate price_per_m2_full from selling_price_full and surface_area
      const pricePerM2Full = piece.surface_area > 0 && piece.selling_price_full 
        ? (piece.selling_price_full / piece.surface_area).toFixed(2)
        : ''
      
      setPieceForm({
        piece_number: pieceNumber,
        surface_area: piece.surface_area.toString(),
        selling_price_full: piece.selling_price_full?.toString() || '',
        selling_price_installment: piece.selling_price_installment?.toString() || '',
        price_per_m2_full: pricePerM2Full,
        price_per_m2_installment: '',
        company_fee_percentage: '',
        received_amount: '',
        number_of_months: '',
        notes: piece.notes || '',
      })
      
      // Load offers for this piece - combine piece-specific and batch offers
      let offers: PaymentOffer[] = []
      
      // Get piece-specific offers
      const { data: pieceOffers, error: pieceOffersError } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('land_piece_id', piece.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
      
      if (pieceOffersError) {
        console.error('Error loading piece offers:', pieceOffersError)
      } else if (pieceOffers && pieceOffers.length > 0) {
        offers = pieceOffers as PaymentOffer[]
        console.log('Loaded piece offers from piece:', offers)
      }
      
      // Also get batch offers to show all available options
      if (piece.land_batch_id) {
        const { data: batchOffers, error: batchOffersError } = await supabase
          .from('payment_offers')
          .select('*')
          .eq('land_batch_id', piece.land_batch_id)
          .is('land_piece_id', null) // Only batch offers, not piece-specific
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
        
        if (batchOffersError) {
          console.error('Error loading batch offers for piece:', batchOffersError)
        } else if (batchOffers && batchOffers.length > 0) {
          offers.push(...(batchOffers as PaymentOffer[]))
          console.log('Loaded batch offers for piece:', batchOffers)
        }
      }
      
      setPieceOffers(offers)
      console.log('Final piece offers set:', offers.length, offers)
      
      // If piece is reserved, load the selected offer ID from the sale
      if (piece.status === 'Reserved') {
        try {
          const { data: allSales } = await supabase
            .from('sales')
            .select('id, land_piece_ids, selected_offer_id, payment_type, status')
            .eq('status', 'Pending')
            .limit(100)
          
          const sale = allSales?.find((s: any) => {
            const pieceIds = s.land_piece_ids || []
            return Array.isArray(pieceIds) && pieceIds.includes(piece.id) && s.payment_type === 'Installment'
          })
          
          if (sale && (sale as any).selected_offer_id) {
            setSelectedPieceOfferId((sale as any).selected_offer_id)
          } else {
            setSelectedPieceOfferId(null)
          }
        } catch (error) {
          console.error('Error loading selected offer ID:', error)
          setSelectedPieceOfferId(null)
        }
      } else {
        setSelectedPieceOfferId(null)
      }
    } else {
      setEditingPiece(null)
      // Get next piece number - support alphanumeric patterns (B1, R1, P001, 1, etc.)
      let nextPieceNumber = '1'
      
      if (batch?.land_pieces && batch.land_pieces.length > 0) {
        // Analyze existing piece numbers to detect pattern
        const pieceNumbers = batch.land_pieces
          .map(p => p.piece_number)
          .filter(Boolean)
        
        // Natural sort for alphanumeric (B0, B1, B2, B10, not B1, B10, B2)
        const sortedPieces = [...pieceNumbers].sort((a, b) => {
          // Extract prefix and number for comparison
          const matchA = a.match(/^([A-Za-z\u0600-\u06FF]*)(\d*)$/i)
          const matchB = b.match(/^([A-Za-z\u0600-\u06FF]*)(\d*)$/i)
          
          if (matchA && matchB) {
            const prefixA = matchA[1] || ''
            const prefixB = matchB[1] || ''
            const numA = parseInt(matchA[2] || '0', 10)
            const numB = parseInt(matchB[2] || '0', 10)
            
            // Compare prefixes first
            if (prefixA !== prefixB) {
              return prefixA.localeCompare(prefixB)
            }
            // Then compare numbers
            return numA - numB
          }
          // Fallback to string comparison
          return a.localeCompare(b)
        })
        
        if (sortedPieces.length > 0) {
          // Get the most recent pattern (last piece's pattern)
          const lastPiece = sortedPieces[sortedPieces.length - 1]
          const lastAlphanumericMatch = lastPiece.match(/^([A-Za-z\u0600-\u06FF]+)(\d+)$/i)
          const lastNumberMatch = lastPiece.match(/^(\d+)$/)
          
          if (lastAlphanumericMatch) {
            // Last piece is alphanumeric - continue that pattern
            const prefix = lastAlphanumericMatch[1]
            const lastNumber = parseInt(lastAlphanumericMatch[2], 10)
            const numDigits = lastAlphanumericMatch[2].length
            const nextNumber = lastNumber + 1
            
            if (numDigits > 1 && lastNumber.toString().length < numDigits) {
              // Preserve zero padding
              nextPieceNumber = `${prefix}${String(nextNumber).padStart(numDigits, '0')}`
            } else {
              nextPieceNumber = `${prefix}${nextNumber}`
            }
          } else if (lastNumberMatch) {
            // Last piece is pure number - continue numeric sequence
            const lastNumber = parseInt(lastNumberMatch[1], 10)
            nextPieceNumber = (lastNumber + 1).toString()
          } else {
            // Unknown pattern - suggest next in sequence
            nextPieceNumber = (sortedPieces.length + 1).toString()
          }
        }
      }
      
      // Get average surface area from existing pieces, or use default
      let avgSurface = defaultSurfaceArea
      if (batch?.land_pieces && batch.land_pieces.length > 0) {
        const totalSurface = batch.land_pieces.reduce((sum, p) => sum + (p.surface_area || 0), 0)
        avgSurface = Math.round(totalSurface / batch.land_pieces.length).toString()
        setDefaultSurfaceArea(avgSurface)
      }
      
      setPieceForm({
        piece_number: nextPieceNumber,
        surface_area: avgSurface,
        selling_price_full: '',
        selling_price_installment: '',
        price_per_m2_full: '',
        price_per_m2_installment: '',
        company_fee_percentage: '',
        received_amount: '',
        number_of_months: '',
        notes: '',
      })
      setPieceOffers([])
    }
    setPieceDialogOpen(true)
  }

  // Piece Offers Management Functions
  const addPieceOffer = () => {
    setEditingOffer(null)
    setIsBatchOffer(false)
    setOfferForm({
      price_per_m2_installment: '',
      company_fee_percentage: '',
      advance_amount: '',
      advance_is_percentage: false,
      monthly_payment: '',
      number_of_months: '',
      calculation_method: 'monthly',
      offer_name: '',
      notes: '',
      is_default: false,
    })
    setOfferDialogOpen(true)
  }

  const editPieceOffer = (offer: PaymentOffer) => {
    setEditingOffer(offer)
    setIsBatchOffer(false)
    // Determine calculation method based on what's available
    // If monthly_payment exists and > 0, use 'monthly', otherwise use 'months'
    const hasMonthly = offer.monthly_payment && offer.monthly_payment > 0
    const hasMonths = offer.number_of_months && offer.number_of_months > 0
    // If neither has value, default to monthly
    const calculationMethod = hasMonthly ? 'monthly' : (hasMonths ? 'months' : 'monthly')
    setOfferForm({
      price_per_m2_installment: offer.price_per_m2_installment?.toString() || '',
      company_fee_percentage: offer.company_fee_percentage?.toString() || '',
      advance_amount: offer.advance_amount?.toString() || '',
      advance_is_percentage: offer.advance_is_percentage || false,
      monthly_payment: offer.monthly_payment?.toString() || '',
      number_of_months: offer.number_of_months?.toString() || '',
      calculation_method: calculationMethod,
      offer_name: offer.offer_name || '',
      notes: offer.notes || '',
      is_default: offer.is_default || false,
    })
    setOfferDialogOpen(true)
  }

  const savePieceOffer = async () => {
    if (!editingPiece) return

    // Validate based on calculation method
    if (offerForm.calculation_method === 'monthly' && !offerForm.monthly_payment) {
      setError('يرجى إدخال المبلغ الشهري')
      return
    }
    if (offerForm.calculation_method === 'months' && !offerForm.number_of_months) {
      setError('يرجى إدخال عدد الأشهر')
      return
    }

    // Save only the value entered by user based on calculation_method
    // The other value will be calculated later when the offer is used in a sale
    const finalMonthlyPayment = offerForm.calculation_method === 'monthly' && offerForm.monthly_payment
      ? parseFloat(offerForm.monthly_payment)
      : 0
    const finalNumberOfMonths = offerForm.calculation_method === 'months' && offerForm.number_of_months
      ? parseFloat(offerForm.number_of_months)
      : 0 // Use 0 instead of null to satisfy NOT NULL constraint

    if (finalMonthlyPayment <= 0 && finalNumberOfMonths <= 0) {
      setError('يرجى إدخال المبلغ الشهري أو عدد الأشهر')
      return
    }

    try {
      const offerData: any = {
        land_piece_id: editingPiece.id,
        land_batch_id: null, // Piece-specific offers should not be tied to batch (they override batch offers)
        price_per_m2_installment: offerForm.price_per_m2_installment ? parseFloat(offerForm.price_per_m2_installment) : null,
        company_fee_percentage: offerForm.company_fee_percentage ? parseFloat(offerForm.company_fee_percentage) : 0,
        advance_amount: offerForm.advance_amount ? parseFloat(offerForm.advance_amount) : 0,
        advance_is_percentage: offerForm.advance_is_percentage,
        monthly_payment: finalMonthlyPayment > 0 ? finalMonthlyPayment : 0, // Use 0 instead of null
        number_of_months: finalNumberOfMonths > 0 ? finalNumberOfMonths : 0, // Use 0 instead of null
        offer_name: offerForm.offer_name.trim() || null,
        notes: offerForm.notes.trim() || null,
        is_default: offerForm.is_default,
        created_by: user?.id || null,
      }

      if (editingOffer) {
        // Check if the offer is from batch (shared) or piece-specific
        if (editingOffer.land_batch_id && !editingOffer.land_piece_id) {
          // This is a batch offer - create a new piece-specific copy
          const { error } = await supabase
            .from('payment_offers')
            .insert([offerData])
          if (error) throw error
        } else {
          // This is a piece-specific offer - update it directly
          const { error } = await supabase
            .from('payment_offers')
            .update(offerData)
            .eq('id', editingOffer.id)
          if (error) throw error
          
          // If this offer is selected for a reserved sale, update the sale
          if (selectedPieceOfferId === editingOffer.id) {
            const { data: allSales } = await supabase
              .from('sales')
              .select('id, land_piece_ids, total_selling_price, small_advance_amount')
              .eq('status', 'Pending')
              .eq('payment_type', 'Installment')
              .limit(100)
            
            const saleData = allSales?.find((s: any) => {
              const pieceIds = s.land_piece_ids || []
              return Array.isArray(pieceIds) && pieceIds.includes(editingPiece.id)
            })
            
            if (saleData) {
              // Use the piece's actual selling price (per piece, not divided by count)
              const pricePerPiece = editingPiece.selling_price_installment || editingPiece.selling_price_full || 0
              
              // Find the reservation amount for this specific piece
              const pieceCount = (saleData as any).land_piece_ids?.length || 1
              const reservationPerPiece = ((saleData as any).small_advance_amount || 0) / pieceCount
              
              // Calculate values per piece based on the updated offer
              const companyFeePercentage = offerData.company_fee_percentage || 0
              const companyFeePerPiece = (pricePerPiece * companyFeePercentage) / 100
              const advanceAmount = offerData.advance_is_percentage
                ? (pricePerPiece * offerData.advance_amount) / 100
                : offerData.advance_amount
              const remainingAfterAdvance = (pricePerPiece + companyFeePerPiece) - reservationPerPiece - advanceAmount
              const monthlyAmount = offerData.monthly_payment
              const numberOfMonths = monthlyAmount > 0 && remainingAfterAdvance > 0
                ? Math.ceil(remainingAfterAdvance / monthlyAmount)
                : 0
              
              await supabase
                .from('sales')
                .update({
                  selected_offer_id: editingOffer.id,
                  company_fee_percentage: companyFeePercentage,
                  company_fee_amount: companyFeePerPiece * pieceCount, // Total for all pieces
                  number_of_installments: numberOfMonths,
                  monthly_installment_amount: monthlyAmount, // Per piece
                } as any)
                .eq('id', (saleData as any).id)
            }
          }
        }
      } else {
        // New offer - just insert it
        const { error, data: newOffer } = await supabase
          .from('payment_offers')
          .insert([offerData])
          .select()
          .single()
        if (error) throw error
        
        // Auto-select the new offer if piece is reserved
        if (editingPiece.status === 'Reserved' && newOffer) {
          const { data: allSales } = await supabase
            .from('sales')
            .select('id, land_piece_ids, total_selling_price, small_advance_amount')
            .eq('status', 'Pending')
            .eq('payment_type', 'Installment')
            .limit(100)
          
          const saleData = allSales?.find((s: any) => {
            const pieceIds = s.land_piece_ids || []
            return Array.isArray(pieceIds) && pieceIds.includes(editingPiece.id)
          })
          
          if (saleData) {
            // Use the piece's actual selling price (per piece, not divided by count)
            const pricePerPiece = editingPiece.selling_price_installment || editingPiece.selling_price_full || 0
            
            // Find the reservation amount for this specific piece
            const pieceCount = (saleData as any).land_piece_ids?.length || 1
            const reservationPerPiece = ((saleData as any).small_advance_amount || 0) / pieceCount
            
            // Calculate values per piece based on the new offer
            const companyFeePercentage = offerData.company_fee_percentage || 0
            const companyFeePerPiece = (pricePerPiece * companyFeePercentage) / 100
            const advanceAmount = offerData.advance_is_percentage
              ? (pricePerPiece * offerData.advance_amount) / 100
              : offerData.advance_amount
            const remainingAfterAdvance = (pricePerPiece + companyFeePerPiece) - reservationPerPiece - advanceAmount
            const monthlyAmount = offerData.monthly_payment
            const numberOfMonths = monthlyAmount > 0 && remainingAfterAdvance > 0
              ? Math.ceil(remainingAfterAdvance / monthlyAmount)
              : 0
            
            await supabase
              .from('sales')
              .update({
                selected_offer_id: newOffer.id,
                company_fee_percentage: companyFeePercentage,
                company_fee_amount: companyFeePerPiece * pieceCount, // Total for all pieces
                number_of_installments: numberOfMonths,
                monthly_installment_amount: monthlyAmount, // Per piece
              } as any)
              .eq('id', (saleData as any).id)
            
            setSelectedPieceOfferId(newOffer.id)
          }
        }
      }

      // Reload offers - separate piece-specific and batch offers
      let allOffers: PaymentOffer[] = []
      
      // Get piece-specific offers (only for this piece, not batch offers)
      const { data: pieceOffersData } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('land_piece_id', editingPiece.id)
        .is('land_batch_id', null) // Only piece-specific offers, not batch offers
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
      
      if (pieceOffersData && pieceOffersData.length > 0) {
        allOffers.push(...(pieceOffersData as PaymentOffer[]))
      }
      
      // Also get batch offers (for reference, but they're separate)
      if (editingPiece.land_batch_id) {
        const { data: batchOffersData } = await supabase
          .from('payment_offers')
          .select('*')
          .eq('land_batch_id', editingPiece.land_batch_id)
          .is('land_piece_id', null) // Only batch offers, not piece-specific
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
        
        if (batchOffersData && batchOffersData.length > 0) {
          allOffers.push(...(batchOffersData as PaymentOffer[]))
        }
      }
      
      setPieceOffers(allOffers)
      
      setOfferDialogOpen(false)
      setEditingOffer(null)
      setOfferForm({
        price_per_m2_installment: '',
        company_fee_percentage: '',
        advance_amount: '',
        advance_is_percentage: false,
        monthly_payment: '',
        number_of_months: '',
        calculation_method: 'monthly',
        offer_name: '',
        notes: '',
        is_default: false,
      })
    } catch (err: any) {
      setError(err.message || 'خطأ في حفظ العرض')
    }
  }

  const handleSelectOfferForPiece = async (offerId: string) => {
    if (!editingPiece || editingPiece.status !== 'Reserved') return
    
    try {
      // Find the selected offer
      const selectedOffer = pieceOffers.find(o => o.id === offerId)
      if (!selectedOffer) return
      
      // Find the sale for this piece
      const { data: allSales } = await supabase
        .from('sales')
        .select('id, land_piece_ids, total_selling_price, small_advance_amount')
        .eq('status', 'Pending')
        .eq('payment_type', 'Installment')
        .limit(100)
      
      const saleData = allSales?.find((s: any) => {
        const pieceIds = s.land_piece_ids || []
        return Array.isArray(pieceIds) && pieceIds.includes(editingPiece.id)
      })
      
      if (!saleData) return
      
      // Use the piece's actual selling price (per piece, not divided by count)
      const pricePerPiece = editingPiece.selling_price_installment || editingPiece.selling_price_full || 0
      
      // Find the reservation amount for this specific piece
      const pieceCount = (saleData as any).land_piece_ids?.length || 1
      const reservationPerPiece = ((saleData as any).small_advance_amount || 0) / pieceCount
      
      // Calculate values per piece based on the selected offer
      const companyFeePercentage = selectedOffer.company_fee_percentage || 0
      const companyFeePerPiece = (pricePerPiece * companyFeePercentage) / 100
      const advanceAmount = selectedOffer.advance_is_percentage
        ? (pricePerPiece * selectedOffer.advance_amount) / 100
        : selectedOffer.advance_amount
      const remainingAfterAdvance = (pricePerPiece + companyFeePerPiece) - reservationPerPiece - advanceAmount
      
      // Calculate based on what the offer has: monthly_payment or number_of_months
      let monthlyAmount = 0
      let numberOfMonths = 0
      
      if (selectedOffer.monthly_payment && selectedOffer.monthly_payment > 0) {
        // Offer has monthly_payment - calculate number of months
        monthlyAmount = selectedOffer.monthly_payment
        numberOfMonths = remainingAfterAdvance > 0
          ? Math.ceil(remainingAfterAdvance / selectedOffer.monthly_payment)
          : 0
      } else if (selectedOffer.number_of_months && selectedOffer.number_of_months > 0) {
        // Offer has number_of_months - calculate monthly payment
        numberOfMonths = selectedOffer.number_of_months
        monthlyAmount = remainingAfterAdvance > 0
          ? remainingAfterAdvance / selectedOffer.number_of_months
          : 0
      }
      
      // Update the sale with the selected offer (values are per piece)
      const { error: updateError } = await supabase
        .from('sales')
        .update({
          selected_offer_id: offerId,
          company_fee_percentage: companyFeePercentage,
          company_fee_amount: companyFeePerPiece * pieceCount, // Total for all pieces
          number_of_installments: numberOfMonths,
          monthly_installment_amount: monthlyAmount, // Per piece
        } as any)
        .eq('id', (saleData as any).id)
      
      if (updateError) throw updateError
      
      // Update local state
      setSelectedPieceOfferId(offerId)
      
      // Show success notification
      showNotification('تم تحديث العرض المختار للبيع بنجاح', 'success')
    } catch (err: any) {
      setError(err.message || 'خطأ في اختيار العرض')
    }
  }

  const deletePieceOffer = async (offerId: string) => {
    if (!editingPiece) return
    
    // Don't allow deleting if it's the selected offer for a reserved piece
    if (editingPiece.status === 'Reserved' && selectedPieceOfferId === offerId) {
      setError('لا يمكن حذف العرض المختار للبيع. يرجى اختيار عرض آخر أولاً.')
      return
    }
    
    try {
      const { error } = await supabase
        .from('payment_offers')
        .delete()
        .eq('id', offerId)
        .eq('land_piece_id', editingPiece.id) // Only delete piece-specific offers
      if (error) throw error

      // Reload offers - combine piece-specific and batch offers
      let reloadedOffers: PaymentOffer[] = []
      
      // Get piece-specific offers
      const { data: pieceOffers } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('land_piece_id', editingPiece.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
      
      if (pieceOffers && pieceOffers.length > 0) {
        reloadedOffers = pieceOffers as PaymentOffer[]
      }
      
      // Also get batch offers
      if (editingPiece.land_batch_id) {
        const { data: batchOffers } = await supabase
          .from('payment_offers')
          .select('*')
          .eq('land_batch_id', editingPiece.land_batch_id)
          .is('land_piece_id', null) // Only batch offers
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
        
        if (batchOffers && batchOffers.length > 0) {
          reloadedOffers.push(...(batchOffers as PaymentOffer[]))
        }
      }
      
      setPieceOffers(reloadedOffers)
    } catch (err: any) {
      setError(err.message || 'خطأ في حذف العرض')
    }
  }

  // Handle piece number or surface area change - allow alphanumeric (B1, R1, P001, etc.)
  const handlePieceNumberChange = (value: string) => {
    // Allow alphanumeric: letters, numbers, and common separators
    // Remove only special characters that aren't useful, keep letters and numbers
    const cleaned = value.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '')
    setPieceForm({
      ...pieceForm,
      piece_number: cleaned,
    })
  }
  
  const handleSurfaceAreaChange = (value: string) => {
    setPieceForm({
      ...pieceForm,
      surface_area: value,
    })
    // Update default for next piece
    if (value) {
      setDefaultSurfaceArea(value)
    }
  }

  const savePiece = async () => {
    // Authorization check
    if (!hasPermission('edit_land')) {
      setError('ليس لديك صلاحية لتعديل الأراضي')
      return
    }

    setError(null)
    try {
      // Validate batch is selected
      if (!selectedBatchId) {
        setError('يرجى اختيار دفعة أرض أولاً')
        return
      }

      // Validate inputs
      if (!pieceForm.piece_number || !pieceForm.piece_number.trim()) {
        setError('يرجى إدخال رقم القطعة')
        return
      }
      
      const surfaceArea = parseFloat(pieceForm.surface_area || defaultSurfaceArea)
      if (isNaN(surfaceArea) || surfaceArea <= 0) {
        setError('يرجى إدخال مساحة صحيحة')
        return
      }
      
      // Use piece number as-is (just the number, no formatting)
      const pieceNumber = pieceForm.piece_number.trim()
      
      // Determine prices: use form values if editing and provided, otherwise calculate
      let sellingPriceFull = 0
      let sellingPriceInstallment = 0
      
      if (editingPiece && pieceForm.selling_price_full && pieceForm.selling_price_installment) {
        // Editing: use provided prices
        sellingPriceFull = parseFloat(pieceForm.selling_price_full)
        sellingPriceInstallment = parseFloat(pieceForm.selling_price_installment)
        
        if (isNaN(sellingPriceFull) || sellingPriceFull <= 0 || isNaN(sellingPriceInstallment) || sellingPriceInstallment <= 0) {
          setError('يرجى إدخال أسعار صحيحة')
          return
        }
      } else {
        // New piece or no prices provided: auto-calculate
        const calculatedValues = calculatePieceValues(pieceForm.piece_number, pieceForm.surface_area || defaultSurfaceArea)
        if (!calculatedValues) {
          setError('خطأ في حساب القيم. يرجى التأكد من بيانات الدفعة أو إدخال أسعار البيع.')
          return
        }
        
        if (!calculatedValues.selling_price_full || calculatedValues.selling_price_full <= 0) {
          setError('خطأ في حساب السعر. يرجى التأكد من إدخال أسعار البيع في نموذج الدفعة أو إدخالها يدوياً.')
          return
        }
        
        sellingPriceFull = calculatedValues.selling_price_full
        sellingPriceInstallment = calculatedValues.selling_price_installment
      }
      
      // Sanitize inputs
      const pieceData: any = {
        land_batch_id: selectedBatchId,
        piece_number: pieceNumber,
        surface_area: surfaceArea,
        purchase_cost: 0, // Purchase cost removed - always 0
        selling_price_full: sellingPriceFull,
        selling_price_installment: sellingPriceInstallment,
        notes: pieceForm.notes ? sanitizeNotes(pieceForm.notes) : null,
      }

      // Note: price_per_m2_full, price_per_m2_installment, company_fee_percentage, received_amount, number_of_months
      // are stored in payment_offers table, not in land_pieces table

      if (editingPiece) {
        const { error } = await supabase
          .from('land_pieces')
          .update(pieceData)
          .eq('id', editingPiece.id)
        if (error) {
          console.error('Error updating piece:', error)
          throw error
        }
        
        // Reload offers after piece update
        let reloadedOffers: PaymentOffer[] = []
        
        // First, try to get offers from piece
        const { data: pieceOffers } = await supabase
          .from('payment_offers')
          .select('*')
          .eq('land_piece_id', editingPiece.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
        
        if (pieceOffers && pieceOffers.length > 0) {
          reloadedOffers = pieceOffers as PaymentOffer[]
        } else if (editingPiece.land_batch_id) {
          // If no piece offers, try to get offers from batch
          const { data: batchOffers } = await supabase
            .from('payment_offers')
            .select('*')
            .eq('land_batch_id', editingPiece.land_batch_id)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: true })
          
          if (batchOffers && batchOffers.length > 0) {
            reloadedOffers = batchOffers as PaymentOffer[]
          }
        }
        
        setPieceOffers(reloadedOffers)
      } else {
        const { error, data } = await supabase
          .from('land_pieces')
          .insert([{ ...pieceData, status: 'Available' }])
          .select()
        if (error) {
          console.error('Error inserting piece:', error)
          // Provide more specific error message
          if (error.code === '23505') {
            setError(`القطعة رقم ${pieceNumber} موجودة بالفعل في هذه الدفعة`)
          } else if (error.code === '23503') {
            setError('الدفعة المحددة غير موجودة. يرجى تحديث الصفحة والمحاولة مرة أخرى.')
          } else {
            setError(`خطأ في حفظ القطعة: ${error.message}`)
          }
          throw error
      }
        console.log('Piece inserted successfully:', data)
      }

      // Reset form and close dialog
      setPieceDialogOpen(false)
      setPieceForm({
        piece_number: '',
        surface_area: '',
        selling_price_full: '',
        selling_price_installment: '',
        price_per_m2_full: '',
        price_per_m2_installment: '',
        company_fee_percentage: '',
        received_amount: '',
        number_of_months: '',
        notes: '',
      })
      setEditingPiece(null)
      setPieceOffers([])
      
      // Refresh batches and ensure the batch is expanded
      await fetchBatches()
      
      // Expand the batch to show the new piece
      if (selectedBatchId) {
        setExpandedBatches(prev => new Set(prev).add(selectedBatchId))
      }
      
      setError(null)
    } catch (error: any) {
      console.error('Error in savePiece:', error)
      // Error message already set in catch block above if it's a database error
      if (!error.message || error.message === 'خطأ في حفظ القطعة') {
        setError(error.message || 'خطأ في حفظ القطعة. يرجى التحقق من البيانات والمحاولة مرة أخرى.')
    }
  }
  }

  const saveBulkPieces = async () => {
    if (!hasPermission('edit_land')) {
      setError('ليس لديك صلاحية لتعديل الأراضي')
      return
    }

    setError(null)
    try {
      if (!selectedBatchId || !selectedBatchForPiece) {
        setError('يرجى اختيار دفعة أرض أولاً')
        return
      }

      const fromStr = bulkAddForm.from.trim()
      const toStr = bulkAddForm.to.trim()
      const surfaceArea = parseFloat(bulkAddForm.surface_area || defaultSurfaceArea)

      if (!fromStr || !toStr) {
        setError('يرجى إدخال رقم البداية والنهاية')
        return
      }

      if (isNaN(surfaceArea) || surfaceArea <= 0) {
        setError('يرجى إدخال مساحة صحيحة')
        return
      }

      // Parse from and to - support both numeric and alphanumeric
      const fromMatch = fromStr.match(/^([A-Za-z\u0600-\u06FF]*)(\d+)$/i)
      const toMatch = toStr.match(/^([A-Za-z\u0600-\u06FF]*)(\d+)$/i)

      if (!fromMatch || !toMatch) {
        setError('تنسيق غير صحيح. استخدم أرقام فقط (مثل: 1، 10) أو حروف وأرقام (مثل: B1، B10)')
        return
      }

      const fromPrefix = fromMatch[1] || ''
      const fromNumber = parseInt(fromMatch[2], 10)
      const toPrefix = toMatch[1] || ''
      const toNumber = parseInt(toMatch[2], 10)

      if (fromPrefix !== toPrefix) {
        setError('يجب أن يكون البادئة (الحروف) متطابقة في البداية والنهاية')
        return
      }

      if (fromNumber > toNumber) {
        setError('رقم البداية يجب أن يكون أصغر من أو يساوي رقم النهاية')
        return
      }

      const numDigits = Math.max(fromMatch[2].length, toMatch[2].length)
      const piecesToCreate: Array<{ piece_number: string; surface_area: number }> = []

      // Generate piece numbers from "from" to "to"
      for (let i = fromNumber; i <= toNumber; i++) {
        const pieceNumber = fromPrefix 
          ? `${fromPrefix}${String(i).padStart(numDigits, '0')}`
          : String(i)
        piecesToCreate.push({
          piece_number: pieceNumber,
          surface_area: surfaceArea,
        })
      }

      if (piecesToCreate.length === 0) {
        setError('لا توجد قطع لإضافتها')
        return
      }

      if (piecesToCreate.length > 100) {
        setError('لا يمكن إضافة أكثر من 100 قطعة في المرة الواحدة')
        return
      }

      // Calculate prices for all pieces
      const calculatedValues = calculatePieceValues(piecesToCreate[0].piece_number, surfaceArea.toString())
      if (!calculatedValues) {
        setError('خطأ في حساب القيم. يرجى التأكد من بيانات الدفعة.')
        return
      }

      // Prepare data for bulk insert
      const piecesData = piecesToCreate.map(piece => ({
        land_batch_id: selectedBatchId,
        piece_number: piece.piece_number,
        surface_area: piece.surface_area,
        purchase_cost: 0,
        selling_price_full: calculatedValues.selling_price_full,
        selling_price_installment: calculatedValues.selling_price_installment,
        status: 'Available' as LandStatus,
        notes: null,
      }))

      // Insert all pieces
      const { error, data } = await supabase
        .from('land_pieces')
        .insert(piecesData)
        .select()

      if (error) {
        console.error('Error inserting bulk pieces:', error)
        if (error.code === '23505') {
          setError('بعض القطع موجودة بالفعل. يرجى التحقق من الأرقام.')
        } else {
          setError(`خطأ في حفظ القطع: ${error.message}`)
        }
        throw error
      }

      // Reset form and close dialog
      setBulkAddDialogOpen(false)
      setBulkAddForm({
        from: '',
        to: '',
        surface_area: '',
      })

      // Refresh batches and expand the batch
      await fetchBatches()
      if (selectedBatchId) {
        setExpandedBatches(prev => new Set(prev).add(selectedBatchId))
      }

      setError(null)
    } catch (error: any) {
      console.error('Error in saveBulkPieces:', error)
      if (!error.message || !error.message.includes('خطأ في حفظ القطع')) {
        setError(error.message || 'خطأ في حفظ القطع. يرجى التحقق من البيانات والمحاولة مرة أخرى.')
    }
  }
  }

  // Filter batches by search term (name, location) and filter pieces within each batch
  // Calculate statistics for all pieces
  const statistics = useMemo(() => {
    let total = 0
    let available = 0
    let reserved = 0
    let sold = 0
    
    batches.forEach((batch) => {
      if (batch.land_pieces) {
        batch.land_pieces.forEach((piece: LandPiece) => {
          total++
          if (piece.status === 'Available') available++
          else if (piece.status === 'Reserved') reserved++
          else if (piece.status === 'Sold') sold++
        })
      }
    })
    
    return { total, available, reserved, sold }
  }, [batches])

  const filteredBatches = batches
    .filter((batch) => {
      // Filter batches by name, location, or piece numbers
      if (debouncedSearchTerm) {
        const search = debouncedSearchTerm.toLowerCase().trim()
        if (!search) return true
        
        const matchesName = batch.name?.toLowerCase().includes(search) || false
        const matchesLocation = batch.location?.toLowerCase().includes(search) || false
        
        // Also check if any piece number matches
        const matchesPiece = batch.land_pieces?.some((piece: LandPiece) => 
          piece.piece_number?.toLowerCase().includes(search)
        ) || false
        
        if (!matchesName && !matchesLocation && !matchesPiece) {
          return false // Hide batch if it doesn't match search
        }
      }
      return true
    })
    .map((batch) => ({
    ...batch,
      land_pieces: (Array.isArray(batch.land_pieces) ? batch.land_pieces : [])
        .filter((piece) => {
        const matchesStatus = true // All statuses shown - filter removed
      const matchesSearch =
            !debouncedSearchTerm || debouncedSearchTerm.trim() === '' ||
            piece.piece_number?.toLowerCase().includes(debouncedSearchTerm.toLowerCase().trim())
      return matchesStatus && matchesSearch
        })
        .sort((a, b) => {
          // Natural sort for alphanumeric piece numbers
          const aNum = a.piece_number || ''
          const bNum = b.piece_number || ''
          
          // Extract prefix and number for comparison
          const matchA = aNum.match(/^([A-Za-z\u0600-\u06FF]*)(\d*)$/i)
          const matchB = bNum.match(/^([A-Za-z\u0600-\u06FF]*)(\d*)$/i)
          
          if (matchA && matchB) {
            const prefixA = matchA[1] || ''
            const prefixB = matchB[1] || ''
            const numA = parseInt(matchA[2] || '0', 10)
            const numB = parseInt(matchB[2] || '0', 10)
            
            // Compare prefixes first
            if (prefixA !== prefixB) {
              return prefixA.localeCompare(prefixB, 'ar')
            }
            // Then compare numbers
            return numA - numB
          }
          // Fallback to string comparison
          return aNum.localeCompare(bNum, 'ar')
    }),
  }))
    .sort((a, b) => {
      // Sort batches by name (alphabetically)
      const nameA = a.name?.toLowerCase() || ''
      const nameB = b.name?.toLowerCase() || ''
      return nameA.localeCompare(nameB, 'ar')
    })

  // Load offers for selected pieces
  const loadOffersForSelectedPieces = async () => {
    if (selectedPieces.size === 0) {
      setAvailableOffers([])
      setSelectedOffer(null)
      return
    }

    try {
      // Get all pieces with their batch IDs
      const pieceIds = Array.from(selectedPieces)
      const { data: pieces } = await supabase
        .from('land_pieces')
        .select('id, land_batch_id')
        .in('id', pieceIds)

      if (!pieces || pieces.length === 0) {
        setAvailableOffers([])
        setSelectedOffer(null)
        return
      }

      // Collect all batch IDs and piece IDs
      const batchIds = [...new Set(pieces.map(p => p.land_batch_id).filter(Boolean))]
      const pieceIdsList = pieces.map(p => p.id)

      // Load batch offers
      const batchOffersPromises = batchIds.map(batchId =>
        supabase
          .from('payment_offers')
          .select('*')
          .eq('land_batch_id', batchId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
      )

      // Load piece offers
      const pieceOffersPromises = pieceIdsList.map(pieceId =>
        supabase
          .from('payment_offers')
          .select('*')
          .eq('land_piece_id', pieceId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true })
      )

      const [batchOffersResults, pieceOffersResults] = await Promise.all([
        Promise.all(batchOffersPromises),
        Promise.all(pieceOffersPromises)
      ])

      // Combine all offers
      const allOffers: PaymentOffer[] = []
      
      // Add batch offers (apply to all pieces)
      batchOffersResults.forEach(result => {
        if (result.data) {
          allOffers.push(...(result.data as PaymentOffer[]))
        }
      })

      // Add piece offers (specific to each piece)
      pieceOffersResults.forEach(result => {
        if (result.data) {
          allOffers.push(...(result.data as PaymentOffer[]))
        }
      })

      // Remove duplicates (same offer might be from batch and piece)
      const uniqueOffersMap: Record<string, PaymentOffer> = {}
      allOffers.forEach((offer) => {
        const key = `${offer.price_per_m2_installment || ''}_${offer.company_fee_percentage}_${offer.advance_amount}_${offer.advance_is_percentage}_${offer.monthly_payment}`
        if (!uniqueOffersMap[key]) {
          uniqueOffersMap[key] = offer
        }
      })

      const offersArray = Object.values(uniqueOffersMap) as PaymentOffer[]
      
      // Sort: default first, then by creation date
      offersArray.sort((a, b) => {
        if (a.is_default && !b.is_default) return -1
        if (!a.is_default && b.is_default) return 1
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      })

      setAvailableOffers(offersArray)
      
      // Auto-select default offer if exists (but don't auto-fill reservation_amount)
      const defaultOffer = offersArray.find(o => o.is_default)
      if (defaultOffer) {
        setSelectedOffer(defaultOffer)
        setSaleForm(prev => ({
          ...prev,
          selected_offer_id: defaultOffer.id,
        }))
      } else {
        setSelectedOffer(null)
        setSaleForm(prev => ({
          ...prev,
          selected_offer_id: '',
        }))
      }
    } catch (error) {
      console.error('Error loading offers:', error)
      setAvailableOffers([])
      setSelectedOffer(null)
    }
  }

  // Apply selected offer to sale form
  const applyOfferToSaleForm = (offer: PaymentOffer) => {
    if (!offer) return

    // Don't auto-fill reservation_amount - let user enter it manually
    setSaleForm(prev => ({
      ...prev,
      selected_offer_id: offer.id,
    }))
  }

  // Handle create client
  const handleCreateClient = async () => {
    if (savingClient) return
    
    setSavingClient(true)
    
    try {
      if (!clientForm.name.trim() || !clientForm.cin.trim() || !clientForm.phone.trim()) {
        showNotification('يرجى ملء جميع الحقول المطلوبة', 'error')
        setSavingClient(false)
        return
      }

      const sanitizedCIN = sanitizeCIN(clientForm.cin)
      if (!sanitizedCIN) {
        showNotification('رقم CIN غير صالح', 'error')
        setSavingClient(false)
        return
      }

      const sanitizedPhone = sanitizePhone(clientForm.phone)
      
      // Check for duplicate CIN - if found, use it instead of showing error
      const { data: existingClients, error: checkError } = await supabase
        .from('clients')
        .select('*')
        .eq('cin', sanitizedCIN)
        .limit(1)

      if (existingClients && existingClients.length > 0) {
        const existingClient = existingClients[0]
        // Client exists - use it instead of creating new one
        setFoundClient(existingClient)
        setNewClient(existingClient)
        setClientForm({
          name: existingClient.name,
          cin: existingClient.cin,
          phone: existingClient.phone || '',
          email: existingClient.email || '',
          address: existingClient.address || '',
          client_type: existingClient.client_type,
          notes: existingClient.notes || '',
        })
        setClientDialogOpen(false)
        if (selectedPieces.size > 0) {
          await loadOffersForSelectedPieces()
          setSaleDialogOpen(true)
        }
        setSavingClient(false)
        return
      }

      const clientData: any = {
        name: sanitizeText(clientForm.name),
        cin: sanitizedCIN,
        phone: sanitizedPhone,
        email: clientForm.email ? sanitizeEmail(clientForm.email) : null,
        address: clientForm.address ? sanitizeText(clientForm.address) : null,
        client_type: clientForm.client_type,
        notes: clientForm.notes ? sanitizeNotes(clientForm.notes) : null,
        created_by: user?.id || null,
      }

      const { data: newClientData, error } = await supabase
        .from('clients')
        .insert([clientData])
        .select()
        .single()

      if (error) throw error

      setNewClient(newClientData)
      setClientDialogOpen(false)
      
      // Only open sale dialog if there are selected pieces
      if (selectedPieces.size > 0) {
        // Load offers for selected pieces
        await loadOffersForSelectedPieces()
        setSaleDialogOpen(true)
      }
      showNotification('تم إضافة العميل بنجاح', 'success')
    } catch (error: any) {
      console.error('Error creating client:', error)
      showNotification('خطأ في إضافة العميل: ' + (error.message || 'خطأ غير معروف'), 'error')
    } finally {
      setSavingClient(false)
    }
  }

  // Handle create sale
  const handleCreateSale = async () => {
    if (creatingSale || !newClient || selectedPieces.size === 0) return
    
    setCreatingSale(true)
    
    try {
      // Validate pieces are still available
      const { data: currentPieces } = await supabase
        .from('land_pieces')
        .select(`
          id, status, piece_number, selling_price_full, selling_price_installment, 
          surface_area, purchase_cost, land_batch_id,
          land_batch:land_batches!inner(id, price_per_m2_full, company_fee_percentage_full)
        `)
        .in('id', Array.from(selectedPieces))
      
      const unavailablePieces = (currentPieces || []).filter((p: any) => p.status !== 'Available')
      if (unavailablePieces.length > 0) {
        const pieceNumbers = unavailablePieces.map((p: any) => `#${p.piece_number}`).join(', ')
        showNotification(`القطع التالية لم تعد متاحة: ${pieceNumbers}`, 'error')
        fetchBatches()
        setCreatingSale(false)
        return
      }

      const selectedPieceObjects = currentPieces || []
      
      const totalCost = parseFloat(selectedPieceObjects.reduce((sum, p) => sum + (parseFloat(p.purchase_cost) || 0), 0).toFixed(2))
      const totalPrice = parseFloat(selectedPieceObjects.reduce((sum, p: any) => {
        if (saleForm.payment_type === 'Full' || saleForm.payment_type === 'PromiseOfSale') {
          // For Available pieces, calculate from batch price_per_m2_full
          // For Reserved pieces, use stored selling_price_full
          if (p.status === 'Available' && p.land_batch?.price_per_m2_full) {
            return sum + (p.surface_area * parseFloat(p.land_batch.price_per_m2_full))
          } else {
            return sum + (parseFloat(p.selling_price_full) || 0)
          }
        } else {
          // For installment, use selected offer price if available
          if (selectedOffer && selectedOffer.price_per_m2_installment) {
            return sum + (p.surface_area * selectedOffer.price_per_m2_installment)
          } else {
            // For Available pieces without offer, calculate from batch if possible
            // For Reserved pieces, use stored selling_price_installment
            if (p.status === 'Available') {
              return sum + (parseFloat(p.selling_price_installment) || parseFloat(p.selling_price_full) || 0)
            } else {
              return sum + (parseFloat(p.selling_price_installment) || parseFloat(p.selling_price_full) || 0)
            }
          }
        }
      }, 0).toFixed(2))
      
      if (totalPrice <= 0 || isNaN(totalPrice)) {
        showNotification('يرجى التأكد من أن القطع المختارة لها أسعار محددة', 'error')
        setCreatingSale(false)
        return
      }

      // Get reservation amount (small advance for reservation) from form
      const reservation = parseFloat(saleForm.reservation_amount) || 0
      
      if (reservation < 0) {
        showNotification('مبلغ العربون لا يمكن أن يكون سالباً', 'error')
        setCreatingSale(false)
        return
      }
      
      // Calculate total payable for validation (price + company fee for Full payment or PromiseOfSale)
      let totalPayableForValidation = totalPrice
      if (saleForm.payment_type === 'Full' || saleForm.payment_type === 'PromiseOfSale') {
        // Get company fee from batch - use the batch data we fetched with pieces
        const firstPiece = selectedPieceObjects[0] as any
        const companyFeePercentage = firstPiece?.land_batch?.company_fee_percentage_full || 0
        const companyFeeAmount = (totalPrice * companyFeePercentage) / 100
        totalPayableForValidation = totalPrice + companyFeeAmount
      }
      
      if (reservation > totalPayableForValidation) {
        showNotification(`مبلغ العربون لا يمكن أن يكون أكبر من المبلغ الإجمالي المستحق (${formatCurrency(totalPayableForValidation)})`, 'error')
        setCreatingSale(false)
        return
      }

      const saleData: any = {
        client_id: newClient.id,
        land_piece_ids: Array.from(selectedPieces),
        payment_type: saleForm.payment_type,
        total_purchase_cost: totalCost,
        total_selling_price: totalPrice,
        profit_margin: parseFloat((totalPrice - totalCost).toFixed(2)),
        small_advance_amount: reservation,
        big_advance_amount: 0,
        status: 'Pending',
        sale_date: new Date().toISOString().split('T')[0],
        created_by: user?.id || null,
      }
      
      // Add Promise of Sale fields if payment type is PromiseOfSale
      if (saleForm.payment_type === 'PromiseOfSale') {
        // Validate Promise of Sale fields
        if (!saleForm.promise_initial_payment || parseFloat(saleForm.promise_initial_payment) <= 0) {
          showNotification('يرجى إدخال المبلغ المستلم الآن', 'error')
          setCreatingSale(false)
          return
        }
        
        const initialPayment = parseFloat(saleForm.promise_initial_payment)
        const totalWithFee = totalPayableForValidation
        if (initialPayment >= totalWithFee) {
          showNotification('المبلغ المستلم الآن يجب أن يكون أقل من المبلغ الإجمالي المستحق', 'error')
          setCreatingSale(false)
          return
        }
        
        saleData.promise_initial_payment = initialPayment
        saleData.promise_completion_date = saleForm.deadline_date // Use deadline_date as completion date
        saleData.promise_completed = false
      }
      
      // Add company fee for Full payment or PromiseOfSale
      if (saleForm.payment_type === 'Full' || saleForm.payment_type === 'PromiseOfSale') {
        // Get company fee percentage from batch - use the batch data we fetched with pieces
        const firstPiece = selectedPieceObjects[0] as any
        const companyFeePercentage = firstPiece?.land_batch?.company_fee_percentage_full || 0
        const companyFeeAmount = (totalPrice * companyFeePercentage) / 100
        
        if (companyFeePercentage > 0) {
          saleData.company_fee_percentage = companyFeePercentage
          saleData.company_fee_amount = parseFloat(companyFeeAmount.toFixed(2))
        }
      }
      
      // Add Promise of Sale fields if payment type is PromiseOfSale
      if (saleForm.payment_type === 'PromiseOfSale') {
        // Validate Promise of Sale fields
        if (!saleForm.promise_initial_payment || parseFloat(saleForm.promise_initial_payment) <= 0) {
          showNotification('يرجى إدخال المبلغ المستلم الآن', 'error')
          setCreatingSale(false)
          return
        }
        
        const initialPayment = parseFloat(saleForm.promise_initial_payment)
        if (initialPayment >= totalPrice) {
          showNotification('المبلغ المستلم الآن يجب أن يكون أقل من السعر الإجمالي', 'error')
          setCreatingSale(false)
          return
        }
        
        // Add company fee for PromiseOfSale (same as Full payment)
        const firstPiece = selectedPieceObjects[0] as any
        const companyFeePercentage = firstPiece?.land_batch?.company_fee_percentage_full || 0
        const companyFeeAmount = (totalPrice * companyFeePercentage) / 100
        
        if (companyFeePercentage > 0) {
          saleData.company_fee_percentage = companyFeePercentage
          saleData.company_fee_amount = parseFloat(companyFeeAmount.toFixed(2))
        }
        
        saleData.promise_initial_payment = initialPayment
        saleData.promise_completion_date = saleForm.deadline_date // Use deadline_date as completion date
        saleData.promise_completed = false
      }
      
      // Add selected_offer_id if an offer was selected and payment type is Installment
      if (saleForm.payment_type === 'Installment' && selectedOffer?.id) {
        saleData.selected_offer_id = selectedOffer.id
        
        // Calculate per piece
        const pieceCount = selectedPieceObjects.length
        const reservationPerPiece = reservation / pieceCount
        
        const piecesCalculations = selectedPieceObjects.map(p => {
          const piecePrice = selectedOffer.price_per_m2_installment 
            ? (p.surface_area * selectedOffer.price_per_m2_installment)
            : (parseFloat(p.selling_price_installment) || parseFloat(p.selling_price_full) || 0)
          
          const companyFeePercentage = selectedOffer.company_fee_percentage || 0
          const companyFeePerPiece = (piecePrice * companyFeePercentage) / 100
          const totalPayablePerPiece = piecePrice + companyFeePerPiece
          
          const advancePerPiece = selectedOffer.advance_is_percentage
            ? (piecePrice * selectedOffer.advance_amount) / 100
            : selectedOffer.advance_amount
          
          const remainingPerPiece = totalPayablePerPiece - reservationPerPiece - advancePerPiece
          
          // Calculate based on what the offer has: monthly_payment or number_of_months
          let monthsPerPiece = 0
          let monthlyAmountPerPiece = 0
          
          if (selectedOffer.monthly_payment && selectedOffer.monthly_payment > 0) {
            // Offer has monthly_payment - calculate number of months
            monthlyAmountPerPiece = selectedOffer.monthly_payment
            monthsPerPiece = remainingPerPiece > 0
              ? Math.ceil(remainingPerPiece / selectedOffer.monthly_payment)
              : 0
          } else if (selectedOffer.number_of_months && selectedOffer.number_of_months > 0) {
            // Offer has number_of_months - calculate monthly payment
            monthsPerPiece = selectedOffer.number_of_months
            monthlyAmountPerPiece = remainingPerPiece > 0
              ? remainingPerPiece / selectedOffer.number_of_months
              : 0
          }
          
          return {
            companyFeePerPiece,
            advancePerPiece,
            remainingPerPiece,
            monthsPerPiece,
            monthlyAmountPerPiece
          }
        })
        
        // Sum up totals
        const companyFeePercentage = selectedOffer.company_fee_percentage || 0
        const companyFeeAmount = piecesCalculations.reduce((sum, calc) => sum + calc.companyFeePerPiece, 0)
        const advanceAmount = piecesCalculations.reduce((sum, calc) => sum + calc.advancePerPiece, 0)
        const maxMonths = Math.max(...piecesCalculations.map(calc => calc.monthsPerPiece), 0)
        // For monthly amount, use the average or max - typically we use the max monthly amount needed
        // But since each piece might have different monthly amounts, we use the maximum
        const monthlyAmount = Math.max(...piecesCalculations.map(calc => calc.monthlyAmountPerPiece), 0)
        
        saleData.company_fee_percentage = companyFeePercentage
        saleData.company_fee_amount = companyFeeAmount
        saleData.number_of_installments = maxMonths
        saleData.monthly_installment_amount = monthlyAmount
      }
      
      // Deadline date is now required
      if (!saleForm.deadline_date || saleForm.deadline_date.trim() === '') {
        showNotification('يرجى إدخال آخر أجل لإتمام الإجراءات', 'error')
        setCreatingSale(false)
        return
      }
      saleData.deadline_date = saleForm.deadline_date

      const { data: newSale, error } = await supabase
        .from('sales')
        .insert(saleData)
        .select()
        .single()
      
      if (error) throw error

      // Create SmallAdvance payment if reservation amount > 0
      if (reservation > 0 && newSale) {
        await supabase.from('payments').insert([{
          client_id: newClient.id,
          sale_id: newSale.id,
          amount_paid: reservation,
          payment_type: 'SmallAdvance',
          payment_date: new Date().toISOString().split('T')[0],
          recorded_by: user?.id || null,
        }] as any)
      }
      
      // Create initial payment for PromiseOfSale
      if (saleForm.payment_type === 'PromiseOfSale' && newSale && saleForm.promise_initial_payment) {
        const initialPayment = parseFloat(saleForm.promise_initial_payment)
        if (initialPayment > 0) {
          await supabase.from('payments').insert([{
            client_id: newClient.id,
            sale_id: newSale.id,
            amount_paid: initialPayment,
            payment_type: 'Partial', // Use Partial for promise initial payment
            payment_date: new Date().toISOString().split('T')[0],
            recorded_by: user?.id || null,
            notes: 'دفعة أولية لوعد البيع',
          }] as any)
        }
      }

      // Update all selected pieces status to Reserved and save calculated prices
      for (const pieceId of selectedPieces) {
        const piece = selectedPieceObjects.find((p: any) => p.id === pieceId)
        if (!piece) continue

        // Calculate the price that was used in the sale
        let calculatedPrice = 0
        let calculatedInstallmentPrice = 0

        // Get batch data - land_batch might be an object or array
        const batchData = Array.isArray(piece.land_batch) ? piece.land_batch[0] : piece.land_batch
        const batchPricePerM2Full = (batchData as any)?.price_per_m2_full

        if (saleForm.payment_type === 'Full' || saleForm.payment_type === 'PromiseOfSale') {
          // For Full payment or PromiseOfSale, calculate from batch price_per_m2_full for Available pieces
          if (piece.status === 'Available' && batchPricePerM2Full) {
            calculatedPrice = piece.surface_area * parseFloat(batchPricePerM2Full)
          } else {
            calculatedPrice = parseFloat(piece.selling_price_full) || 0
          }
        } else {
          // For Installment payment
          if (selectedOffer && selectedOffer.price_per_m2_installment) {
            calculatedInstallmentPrice = piece.surface_area * selectedOffer.price_per_m2_installment
            // Also calculate full price from batch if available
            if (piece.status === 'Available' && batchPricePerM2Full) {
              calculatedPrice = piece.surface_area * parseFloat(batchPricePerM2Full)
            } else {
              calculatedPrice = parseFloat(piece.selling_price_full) || 0
            }
          } else {
            calculatedPrice = parseFloat(piece.selling_price_full) || 0
            calculatedInstallmentPrice = parseFloat(piece.selling_price_installment) || 0
          }
        }

        // Update piece with calculated prices and status
        const updateData: any = { status: 'Reserved' }
        if (calculatedPrice > 0) {
          updateData.selling_price_full = Math.round(calculatedPrice * 100) / 100
        }
        if (calculatedInstallmentPrice > 0) {
          updateData.selling_price_installment = Math.round(calculatedInstallmentPrice * 100) / 100
        }

        await supabase
          .from('land_pieces')
          .update(updateData)
          .eq('id', pieceId)
      }

      showNotification('تم إنشاء البيع بنجاح', 'success')
      setSaleDialogOpen(false)
      setNewClient(null)
      setSelectedPieces(new Set())
      setClientForm({
        name: '',
        cin: '',
        phone: '',
        email: '',
        address: '',
        client_type: 'Individual',
        notes: '',
      })
      setSaleForm({
        payment_type: 'Full',
        reservation_amount: '',
        deadline_date: '',
        selected_offer_id: '',
                  promise_initial_payment: '',
      })
      setAvailableOffers([])
      setSelectedOffer(null)
      fetchBatches()
    } catch (error: any) {
      console.error('Error creating sale:', error)
      showNotification('خطأ في إنشاء البيع: ' + (error.message || 'خطأ غير معروف'), 'error')
    } finally {
      setCreatingSale(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">Loading land data...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <Map className="h-12 w-12 text-destructive mx-auto" />
              <p className="text-destructive font-medium">{error}</p>
              <p className="text-sm text-muted-foreground">
                Make sure you have run the SQL schema in Supabase.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-3 sm:space-y-4 pb-20 md:pb-4">
      {/* Desktop/Tablet: Sticky Header Container */}
      <div className="hidden md:block sticky top-0 z-30 bg-background border-b shadow-sm mb-4 -mt-6 -mx-3 md:-mx-6">
        <div className="px-3 md:px-6 pt-6 pb-4 space-y-3">
          {/* Header Row */}
        <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">الأراضي</h1>
            <div className="flex items-center gap-2">
        {hasPermission('edit_land') && (
            <Button onClick={() => openBatchDialog()} size="sm">
              <Plus className="ml-1 h-4 w-4" />
              إضافة
          </Button>
        )}
            </div>
      </div>

          {/* Search Bar */}
          <div>
              <Input
              placeholder="بحث في الأراضي..."
                value={searchTerm}
                maxLength={50}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  debouncedSearchFn(e.target.value)
                }}
              className="w-full h-10 text-base shadow-sm focus:shadow-md transition-shadow border-2 focus:border-primary"
              />
          </div>
          
          {/* Statistics Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-sm text-muted-foreground">إجمالي القطع:</span>
              <span className="text-sm font-semibold text-gray-900">{statistics.total}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 rounded-lg border border-green-200">
              <span className="text-sm text-muted-foreground">متاح:</span>
              <span className="text-sm font-semibold text-green-700">{statistics.available}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 rounded-lg border border-yellow-200">
              <span className="text-sm text-muted-foreground">محجوز:</span>
              <span className="text-sm font-semibold text-yellow-700">{statistics.reserved}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200">
              <span className="text-sm text-muted-foreground">مباع:</span>
              <span className="text-sm font-semibold text-blue-700">{statistics.sold}</span>
            </div>
          </div>
          </div>
      </div>

      {/* Mobile: Combined Header with Search Bar */}
      <div className="md:hidden">
        {/* Mobile Header Container - Fixed at top with white background, below MainLayout header */}
        <div className="fixed top-[50px] left-0 right-0 z-40 bg-white border-b shadow-sm">
          {/* Search Bar */}
          <div className="px-3 py-2.5">
            <Input
              placeholder="بحث في الأراضي..."
              value={searchTerm}
              maxLength={50}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                debouncedSearchFn(e.target.value)
              }}
              className="w-full h-10 text-sm shadow-sm focus:shadow-md transition-shadow border-2 focus:border-primary"
            />
          </div>
        </div>
        
        {/* Header - Below search bar */}
        <div className="flex flex-col gap-3 mb-3 pt-28">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold">الأراضي</h1>
            <div className="flex items-center gap-2">
              {hasPermission('edit_land') && (
                <Button onClick={() => openBatchDialog()} size="sm">
                  <Plus className="ml-1 h-4 w-4" />
                  إضافة
                </Button>
              )}
            </div>
          </div>
          
          {/* Statistics Filters - Mobile */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-xs text-muted-foreground">إجمالي:</span>
              <span className="text-xs font-semibold text-gray-900">{statistics.total}</span>
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1 bg-green-50 rounded-lg border border-green-200">
              <span className="text-xs text-muted-foreground">متاح:</span>
              <span className="text-xs font-semibold text-green-700">{statistics.available}</span>
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1 bg-yellow-50 rounded-lg border border-yellow-200">
              <span className="text-xs text-muted-foreground">محجوز:</span>
              <span className="text-xs font-semibold text-yellow-700">{statistics.reserved}</span>
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 rounded-lg border border-blue-200">
              <span className="text-xs text-muted-foreground">مباع:</span>
              <span className="text-xs font-semibold text-blue-700">{statistics.sold}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div>
      {/* Batches - Compact Design */}
      {filteredBatches.map((batch) => {
        const availableCount = batch.land_pieces.filter(p => p.status === 'Available').length
        const soldCount = batch.land_pieces.filter(p => p.status === 'Sold').length
        const reservedCount = batch.land_pieces.filter(p => p.status === 'Reserved').length
        
        return (
          <Card key={batch.id} className="border-gray-200">
            {/* Batch Header - Compact */}
            <div 
              className="p-3 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation"
              onClick={() => toggleBatch(batch.id)}
            >
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                {expandedBatches.has(batch.id) ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-500" />
                ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-500" />
                )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm truncate">{batch.name}</span>
                      {batch.location && (
                        <span className="text-xs text-primary font-medium">{batch.location}</span>
                    )}
                </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span>{batch.total_surface} م²</span>
                      <span className="flex items-center gap-1">
                        <span className="text-green-600 font-medium">{availableCount} متاح</span>
                        {soldCount > 0 && <span>• {soldCount} مباع</span>}
                        {reservedCount > 0 && <span>• {reservedCount} محجوز</span>}
                      </span>
              </div>
                  </div>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {hasPermission('edit_land') && (
                  <>
                      <Button variant="ghost" size="icon" onClick={() => openBatchDialog(batch)} className="h-7 w-7">
                        <Edit className="h-3.5 w-3.5" />
                    </Button>
                    {hasPermission('delete_land') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteBatch(batch.id)}
                          className="h-7 w-7 text-red-500 hover:text-red-600"
                      >
                          <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            </div>

            {/* Expanded Content */}
          {expandedBatches.has(batch.id) && (
              <div className="border-t">
                {/* Add Piece Buttons */}
                {hasPermission('edit_land') && (
                  <div className="p-2 bg-gray-50 border-b flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openPieceDialog(batch.id)} className="flex-1 h-8 text-xs">
                      <Plus className="ml-1 h-3.5 w-3.5" />
                    إضافة قطعة
                  </Button>
                    <Button variant="outline" size="sm" onClick={() => openBulkAddDialog(batch.id)} className="flex-1 h-8 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200">
                      <Plus className="ml-1 h-3.5 w-3.5" />
                      إضافة متعددة
                  </Button>
              </div>
                )}

                {/* Land Batch Image */}
                {(batch as any).image_url && (
                  <div className="p-2 border-b bg-gray-50">
                    <div className="relative group">
                      <img 
                        src={(batch as any).image_url} 
                        alt={batch.name}
                        className="w-full h-auto max-h-48 sm:max-h-64 object-cover rounded-lg border shadow-sm cursor-pointer transition-transform hover:scale-[1.02]"
                        onClick={() => {
                          setViewingImageUrl((batch as any).image_url)
                          setViewingImageName(batch.name)
                          setImageViewDialogOpen(true)
                        }}
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none'
                        }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors rounded-lg">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setViewingImageUrl((batch as any).image_url)
                            setViewingImageName(batch.name)
                            setImageViewDialogOpen(true)
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 hover:bg-white"
                        >
                          <ImageIcon className="h-4 w-4 ml-1" />
                          عرض الصورة
                        </Button>
                      </div>
                    </div>
              </div>
                )}

              {(!batch.land_pieces || batch.land_pieces.length === 0) ? (
                  <p className="text-center text-muted-foreground py-4 text-sm">لا توجد قطع</p>
              ) : (
                  <>
                    {/* Mobile: Compact Grid */}
                    <div className="grid grid-cols-2 gap-2 p-2 md:hidden">
                      {batch.land_pieces.map((piece) => {
                        const isAvailable = piece.status === 'Available' && hasPermission('create_sales')
                        const isSelected = selectedPieces.has(piece.id)
                        
                        // Track touch start position to detect scrolling
                        let touchStartX = 0
                        let touchStartY = 0
                        let hasMoved = false
                        
                        const handleTouchStart = (e: React.TouchEvent) => {
                          const touch = e.touches[0]
                          touchStartX = touch.clientX
                          touchStartY = touch.clientY
                          hasMoved = false
                        }
                        
                        const handleTouchMove = (e: React.TouchEvent) => {
                          if (!touchStartX || !touchStartY) return
                          const touch = e.touches[0]
                          const deltaX = Math.abs(touch.clientX - touchStartX)
                          const deltaY = Math.abs(touch.clientY - touchStartY)
                          // If moved more than 10px, consider it a scroll
                          if (deltaX > 10 || deltaY > 10) {
                            hasMoved = true
                          }
                        }
                        
                        const handleTouchEnd = (e: React.TouchEvent) => {
                          // Only toggle if it wasn't a scroll
                          if (!hasMoved && isAvailable && !(e.target as HTMLElement).closest('button') && !(e.target as HTMLElement).closest('input')) {
                            e.preventDefault()
                            e.stopPropagation()
                            setSelectedPieces(prev => {
                              const newSelected = new Set(prev)
                              if (prev.has(piece.id)) {
                                newSelected.delete(piece.id)
                              } else {
                                newSelected.add(piece.id)
                              }
                              return newSelected
                            })
                          }
                          // Reset
                          touchStartX = 0
                          touchStartY = 0
                          hasMoved = false
                        }
                        
                        const handleClick = (e: React.MouseEvent) => {
                          // Only handle click if not from touch event
                          if (isAvailable && !(e.target as HTMLElement).closest('button') && !(e.target as HTMLElement).closest('input')) {
                            setSelectedPieces(prev => {
                              const newSelected = new Set(prev)
                              if (prev.has(piece.id)) {
                                newSelected.delete(piece.id)
                              } else {
                                newSelected.add(piece.id)
                              }
                              return newSelected
                            })
                          }
                        }
                        
                        const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
                          e.stopPropagation()
                          setSelectedPieces(prev => {
                            const newSelected = new Set(prev)
                            if (e.target.checked) {
                              newSelected.add(piece.id)
                            } else {
                              newSelected.delete(piece.id)
                            }
                            return newSelected
                          })
                        }
                        
                        return (
                        <div 
                          key={piece.id} 
                            className={`p-2.5 rounded-lg border text-xs ${
                            piece.status === 'Available' ? 'bg-green-50 border-green-200' :
                            piece.status === 'Reserved' ? 'bg-orange-50 border-orange-200' :
                            piece.status === 'Sold' ? 'bg-gray-100 border-gray-200' : 'bg-gray-50 border-gray-200'
                            } ${isSelected ? 'ring-2 ring-green-500 border-green-500 bg-green-100' : ''} ${isAvailable ? 'cursor-pointer' : ''}`}
                            onClick={handleClick}
                            onTouchStart={handleTouchStart}
                            onTouchMove={handleTouchMove}
                            onTouchEnd={handleTouchEnd}
                            style={{ touchAction: 'pan-y', WebkitTapHighlightColor: 'transparent' }}
                          >
                            {/* Header with Checkbox and Badge */}
                            <div className="flex items-start justify-between mb-2 gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                {isAvailable && (
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={handleCheckboxChange}
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      e.preventDefault()
                                    }}
                                    onTouchStart={(e) => {
                                      e.stopPropagation()
                                    }}
                                    onTouchEnd={(e) => {
                                      e.stopPropagation()
                                      e.preventDefault()
                                    }}
                                    className="h-5 w-5 min-h-[20px] min-w-[20px] text-green-600 rounded cursor-pointer flex-shrink-0"
                                    style={{ 
                                      WebkitTapHighlightColor: 'transparent',
                                      accentColor: '#16a34a',
                                      cursor: 'pointer',
                                      touchAction: 'none'
                                    }}
                                  />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-sm truncate">{piece.piece_number}</div>
                                  <div className="text-xs text-muted-foreground mt-0.5">{piece.surface_area} م²</div>
                                </div>
                              </div>
                              <Badge variant={statusColors[piece.status]} className="text-xs px-1.5 py-0.5 flex-shrink-0">
                              {piece.status === 'Available' ? 'متاح' :
                               piece.status === 'Reserved' ? 'محجوز' :
                               piece.status === 'Sold' ? 'مباع' : 'ملغي'}
                            </Badge>
                          </div>
                            
                            <div className="font-semibold text-green-600 text-sm mb-2">
                              {(() => {
                                // For Available pieces, calculate from batch price_per_m2_full
                                // For Reserved/Sold pieces, use stored selling_price_full
                                if (piece.status === 'Available' && (batch as any).price_per_m2_full) {
                                  const calculatedPrice = piece.surface_area * parseFloat((batch as any).price_per_m2_full)
                                  return formatCurrency(calculatedPrice)
                                } else {
                                  return formatCurrency(piece.selling_price_full || 0)
                                }
                              })()}
                            </div>
                            <div className="font-semibold text-blue-600 text-sm mb-2">
                              {(() => {
                                // Only show installment price for reserved pieces with selected offer
                                if (piece.status === 'Reserved') {
                                  const sale = reservedSales.find(s => 
                                    s.land_piece_ids && s.land_piece_ids.includes(piece.id) && 
                                    s.payment_type === 'Installment'
                                  )
                                  if (sale && sale.selected_offer) {
                                    const offer = sale.selected_offer as PaymentOffer
                                    if (offer.price_per_m2_installment) {
                                      const installmentPrice = piece.surface_area * offer.price_per_m2_installment
                                      const companyFee = (installmentPrice * (offer.company_fee_percentage || 0)) / 100
                                      return formatCurrency(installmentPrice + companyFee)
                                    }
                                  }
                                }
                                // For available pieces or reserved without offer, show dash
                                return <span className="text-muted-foreground text-xs">-</span>
                              })()}
                            </div>
                          
                            {/* Show sale details button for Reserved/Sold pieces */}
                            {(piece.status === 'Reserved' || piece.status === 'Sold') && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openSaleDetailsDialog(piece)
                                }}
                                className="w-full h-7 text-xs mb-2 bg-white hover:bg-gray-50"
                              >
                                <Eye className="h-3 w-3 ml-1" />
                                عرض تفاصيل البيع
                              </Button>
                            )}
                            
                            {/* Show sale info for reserved pieces */}
                            {piece.status === 'Reserved' && (() => {
                              const sale = reservedSales.find(s => 
                                s.land_piece_ids && s.land_piece_ids.includes(piece.id) && 
                                s.payment_type === 'Installment'
                              )
                              if (!sale) return null
                              
                              return (
                                <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                                  <div className="font-medium text-blue-800 mb-1">
                                    {sale.client?.name || 'عميل'}
                                  </div>
                                  {hasPermission('edit_sales') && user?.role === 'Owner' && (
                            <Button
                              size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openChangeOfferDialog(sale)
                                      }}
                                      className="w-full h-7 text-xs mt-1 bg-white hover:bg-blue-50 border-blue-300 text-blue-700"
                                    >
                                      <Settings className="h-3 w-3 ml-1" />
                                      تغيير عرض التقسيط
                                    </Button>
                                  )}
                                </div>
                              )
                            })()}
                          
                            {/* Sell Button for Available - Only show if not using multi-select */}
                            {isAvailable && !isSelected && (
                            <Button
                              size="sm"
                                {...createButtonHandler(() => {
                                  setSelectedPieces(new Set([piece.id]))
                                  setClientDialogOpen(true)
                                })}
                                className="w-full h-8 text-xs bg-green-600 hover:bg-green-700 active:bg-green-800 mb-1 touch-manipulation"
                                style={{ touchAction: 'manipulation' }}
                            >
                                <ShoppingCart className="h-3.5 w-3.5 ml-1" />
                              بيع
                            </Button>
                          )}
                            
                            {/* Selected indicator */}
                            {isSelected && (
                              <div className="w-full h-8 flex items-center justify-center text-xs font-semibold text-green-700 bg-green-200 rounded border border-green-400 mb-1">
                                ✓ مختارة
                              </div>
                          )}
                          
                          {/* Edit buttons */}
                          {hasPermission('edit_land') && (
                            <div className="flex gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                {...createButtonHandler(() => {
                                  openPieceDialog(batch.id, piece)
                                })}
                                className="flex-1 h-7 text-xs touch-manipulation"
                                style={{ touchAction: 'manipulation' }}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              {user?.role === 'Owner' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  {...createButtonHandler(() => {
                                    openPriceEditDialog(batch.id, piece)
                                  })}
                                  className="h-7 w-7 text-blue-600 p-0 touch-manipulation"
                                  style={{ touchAction: 'manipulation' }}
                                >
                                  <DollarSign className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                {...createButtonHandler(() => {
                                  deletePiece(piece, batch.id)
                                })}
                                className="h-7 w-7 text-red-600 hover:bg-red-50 p-0 touch-manipulation"
                                style={{ touchAction: 'manipulation' }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          )}
                        </div>
                        )
                      })}
                    </div>

                    {/* Desktop: Compact Table */}
                    <div className="hidden md:block">
                      <Table>
                    <TableHeader>
                          <TableRow className="text-xs">
                            {hasPermission('create_sales') && (
                              <TableHead className="py-2 w-10 text-center"></TableHead>
                            )}
                            <TableHead className="py-2 text-center">قطعة</TableHead>
                            <TableHead className="py-2 text-center">م²</TableHead>
                            <TableHead className="py-2 text-right">بالحاضر</TableHead>
                            <TableHead className="py-2 text-right">بالتقسيط</TableHead>
                            <TableHead className="py-2 text-center">الحالة</TableHead>
                            <TableHead className="py-2 text-center">إجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batch.land_pieces.map((piece) => (
                            <TableRow 
                              key={piece.id} 
                              className={`text-sm ${selectedPieces.has(piece.id) ? 'bg-green-50' : ''}`}
                            >
                              {hasPermission('create_sales') && (
                                <TableCell className="py-2 text-center">
                                  {piece.status === 'Available' ? (
                                    <input
                                      type="checkbox"
                                      checked={selectedPieces.has(piece.id)}
                                      onChange={(e) => {
                                        const newSelected = new Set(selectedPieces)
                                        if (e.target.checked) {
                                          newSelected.add(piece.id)
                                        } else {
                                          newSelected.delete(piece.id)
                                        }
                                        setSelectedPieces(newSelected)
                                      }}
                                      className="h-5 w-5 text-green-600 rounded cursor-pointer"
                                    />
                                  ) : null}
                                </TableCell>
                              )}
                              <TableCell className="py-2 font-medium text-center">{piece.piece_number}</TableCell>
                              <TableCell className="py-2 text-center">{piece.surface_area}</TableCell>
                              <TableCell className="py-2 text-green-600 font-medium text-right">
                                {(() => {
                                  // For Available pieces, calculate from batch price_per_m2_full
                                  // For Reserved/Sold pieces, use stored selling_price_full
                                  if (piece.status === 'Available' && (batch as any).price_per_m2_full) {
                                    const calculatedPrice = piece.surface_area * parseFloat((batch as any).price_per_m2_full)
                                    return formatCurrency(calculatedPrice)
                                  } else {
                                    return formatCurrency(piece.selling_price_full || 0)
                                  }
                                })()}
                              </TableCell>
                              <TableCell className="py-2 text-blue-600 font-medium text-right">
                                {(() => {
                                  // Only show installment price for reserved pieces with selected offer
                                  if (piece.status === 'Reserved') {
                                    const sale = reservedSales.find(s => 
                                      s.land_piece_ids && s.land_piece_ids.includes(piece.id) && 
                                      s.payment_type === 'Installment'
                                    )
                                    if (sale && sale.selected_offer) {
                                      const offer = sale.selected_offer as PaymentOffer
                                      if (offer.price_per_m2_installment) {
                                        const installmentPrice = piece.surface_area * offer.price_per_m2_installment
                                        const companyFee = (installmentPrice * (offer.company_fee_percentage || 0)) / 100
                                        return formatCurrency(installmentPrice + companyFee)
                                      }
                                    }
                                  }
                                  // For available pieces or reserved without offer, show dash
                                  return <span className="text-muted-foreground">-</span>
                                })()}
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <Badge variant={statusColors[piece.status]} className="text-xs">
                              {piece.status === 'Available' ? 'متاح' :
                               piece.status === 'Reserved' ? 'محجوز' :
                               piece.status === 'Sold' ? 'مباع' : 'ملغي'}
                            </Badge>
                          </TableCell>
                              <TableCell className="py-2 text-center">
                                <div className="flex items-center gap-0.5">
                                  {piece.status === 'Available' && hasPermission('create_sales') && (
                                    <Button
                                      size="sm"
                                      {...createButtonHandler(() => {
                                        setSelectedPieces(new Set([piece.id]))
                                        setClientDialogOpen(true)
                                      })}
                                      className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                    >
                                      <ShoppingCart className="h-3 w-3 ml-1" />
                                      بيع
                                    </Button>
                                  )}
                          {hasPermission('edit_land') && (
                              <>
                              <Button
                                variant="ghost"
                                size="icon"
                                {...createButtonHandler(() => {
                                  openPieceDialog(batch.id, piece)
                                })}
                                      className="h-7 w-7"
                              >
                                      <Edit className="h-3.5 w-3.5" />
                              </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  {...createButtonHandler(() => {
                                    deletePiece(piece, batch.id)
                                  })}
                                  className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                                  )}
                                {user?.role === 'Owner' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    {...createButtonHandler(() => {
                                      openPriceEditDialog(batch.id, piece)
                                    })}
                                      className="h-7 w-7 text-blue-600"
                                  >
                                      <DollarSign className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                  </>
              )}
              </div>
          )}
        </Card>
        )
      })}

      {filteredBatches.length === 0 && (
        <div className="text-center text-muted-foreground py-8 text-sm">
          لا توجد أراضي
        </div>
      )}
      </div>

      {/* Batch Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBatch ? 'تعديل الدفعة' : 'إضافة قطع أرض'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">اسم الأرض *</Label>
                <Input
                  id="name"
                  value={batchForm.name}
                  maxLength={255}
                  onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })}
                  placeholder="مثال: دفعة تانيور"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">الموقع</Label>
                <Input
                  id="location"
                  value={batchForm.location}
                  maxLength={255}
                  onChange={(e) => setBatchForm({ ...batchForm, location: e.target.value })}
                  placeholder="مثال: تانيور - شارع الرئيسي"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="real_estate_tax_number">الرسم العقاري عدد</Label>
                <Input
                  id="real_estate_tax_number"
                  value={batchForm.real_estate_tax_number}
                  maxLength={100}
                  onChange={(e) => setBatchForm({ ...batchForm, real_estate_tax_number: e.target.value })}
                  placeholder="رقم الرسم العقاري (اختياري)"
                />
              </div>
            </div>
            
            {/* Price per m² field - Only full payment price */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
              <p className="text-sm font-medium text-blue-800">أسعار البيع لكل متر مربع</p>
                <div className="space-y-2">
                <Label htmlFor="price_per_m2_full">سعر المتر المربع (بالحاضر) *</Label>
                  <Input
                    id="price_per_m2_full"
                    type="number"
                    step="0.01"
                    value={batchForm.price_per_m2_full}
                    onChange={(e) => setBatchForm({ ...batchForm, price_per_m2_full: e.target.value })}
                    placeholder="10.00"
                  />
                  <p className="text-xs text-muted-foreground">سيتم تطبيق هذا السعر على القطع الجديدة فقط. القطع الموجودة والمبيعات السابقة لن تتأثر.</p>
                <p className="text-xs text-muted-foreground">ملاحظة: سعر المتر المربع (بالتقسيط) يتم تحديده في العروض أدناه.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_fee_percentage_full">عمولة الشركة للدفع بالحاضر (%)</Label>
                  <Input
                    id="company_fee_percentage_full"
                    type="number"
                    step="0.01"
                    value={batchForm.company_fee_percentage_full}
                    onChange={(e) => setBatchForm({ ...batchForm, company_fee_percentage_full: e.target.value })}
                    placeholder="0.00"
                    min="0"
                    max="100"
                  />
                  <p className="text-xs text-muted-foreground">
                    نسبة عمولة الشركة للدفع بالحاضر (اختياري). سيتم تطبيقها على جميع المبيعات بالحاضر لهذه الدفعة.
                  </p>
                </div>
              </div>
            
            {/* Payment Offers Management */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-green-800">عروض التقسيط</p>
                <Button type="button" size="sm" onClick={addBatchOffer} variant="outline">
                  <Plus className="h-4 w-4 ml-1" />
                  إضافة عرض
                </Button>
              </div>
              
              {/* Offers List */}
              {batchOffers.length > 0 ? (
                <div className="space-y-2">
                  {batchOffers.map((offer) => (
                    <div key={offer.id} className="bg-white border border-green-200 rounded-lg p-3 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {offer.is_default && (
                            <Badge variant="default" className="text-xs">افتراضي</Badge>
                          )}
                          {offer.offer_name && (
                            <span className="font-medium text-sm">{offer.offer_name}</span>
                          )}
                </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {offer.price_per_m2_installment && `السعر/م²: ${offer.price_per_m2_installment} | `}
                          عمولة: {offer.company_fee_percentage}% | 
                          التسبقة: {offer.advance_is_percentage ? `${offer.advance_amount}%` : formatCurrency(offer.advance_amount)} | 
                          الشهري: {formatCurrency(offer.monthly_payment)}
              </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => editBatchOffer(offer)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteBatchOffer(offer.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  لا توجد عروض. اضغط "إضافة عرض" لإضافة عرض جديد.
                </p>
              )}

              {/* Offer Form Dialog - will be shown at the end of component */}
            </div>
            
            {/* Manual Piece Addition - Simple approach */}
            {!editingBatch && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-primary" />
                  <Label className="text-base font-semibold">إضافة قطع يدوياً</Label>
                </div>
                
                    <p className="text-sm text-muted-foreground">
                  بعد إنشاء الدفعة، يمكنك إضافة القطع يدوياً من خلال النقر على الدفعة وتحديد "إضافة قطعة"
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                value={batchForm.notes}
                maxLength={5000}
                onChange={(e) => setBatchForm({ ...batchForm, notes: e.target.value })}
                placeholder="ملاحظات إضافية (اختياري)"
                rows={3}
              />
            </div>

            {/* Image Upload */}
            <div className="space-y-2">
              <Label htmlFor="image">صورة الأرض (اختياري)</Label>
              <div className="space-y-3">
                {imagePreview && (
                  <div className="relative">
                    <img 
                      src={imagePreview} 
                      alt="Preview" 
                      className="w-full h-auto max-h-64 object-cover rounded-lg border"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={() => {
                        setImagePreview(null)
                        setImageFile(null)
                        setBatchForm({ ...batchForm, image_url: '' })
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                    disabled={uploadingImage}
                  />
                  <Label 
                    htmlFor="image" 
                    className="flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer hover:bg-accent transition-colors"
                  >
                    <Upload className="h-4 w-4" />
                    {imageFile ? 'تغيير الصورة' : 'اختر صورة'}
                  </Label>
                  {uploadingImage && (
                    <span className="text-sm text-muted-foreground">جاري الرفع...</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  الحد الأقصى لحجم الصورة: 5 ميجابايت. الصيغ المدعومة: JPG, PNG, GIF, WebP
                </p>
              </div>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setBatchDialogOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button onClick={saveBatch} disabled={savingBatch} className="w-full sm:w-auto">
              {editingBatch ? 'حفظ' : (generationMode !== 'none' ? `إنشاء مع ${piecesPreview.count} قطعة` : 'إنشاء الدفعة')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Piece Dialog */}
      <Dialog open={pieceDialogOpen} onOpenChange={setPieceDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingPiece ? 'تعديل القطعة' : 'إضافة قطعة جديدة'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="piece_number">رقم القطعة *</Label>
              <Input
                id="piece_number"
                type="text"
                value={pieceForm.piece_number}
                onChange={(e) => handlePieceNumberChange(e.target.value)}
                placeholder="مثال: 1، B1، R1، P001"
                autoFocus
                maxLength={20}
              />
              <p className="text-xs text-muted-foreground">
                أدخل رقم القطعة (يمكن أن يكون رقم فقط مثل 1، أو حروف وأرقام مثل B1، R1، P001). سيتم حساب باقي القيم تلقائياً.
              </p>
            </div>
            
              <div className="space-y-2">
              <Label htmlFor="surface_area">المساحة (م²) {pieceForm.surface_area ? '' : '(اختياري - سيتم استخدام القيمة الافتراضية)'}</Label>
                <Input
                  id="surface_area"
                  type="number"
                  value={pieceForm.surface_area}
                  onChange={(e) => handleSurfaceAreaChange(e.target.value)}
                placeholder={defaultSurfaceArea}
                min="1"
                />
                  <p className="text-xs text-muted-foreground">
                {pieceForm.surface_area 
                  ? `سيتم حساب التكلفة والأسعار بناءً على ${pieceForm.surface_area} م²`
                  : `القيمة الافتراضية: ${defaultSurfaceArea} م² (من القطع السابقة أو القيمة الافتراضية)`
                }
                  </p>
              </div>
            
            {/* Price fields - show when editing with automatic calculation */}
            {editingPiece ? (
            <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                  <Label htmlFor="price_per_m2_full">سعر المتر المربع (بالحاضر) *</Label>
                <Input
                    id="price_per_m2_full"
                  type="number"
                    step="0.01"
                    value={pieceForm.price_per_m2_full}
                    onChange={(e) => {
                      const pricePerM2 = e.target.value
                      const surface = parseFloat(pieceForm.surface_area) || 0
                      setPieceForm({ 
                        ...pieceForm, 
                        price_per_m2_full: pricePerM2,
                        selling_price_full: surface > 0 && pricePerM2 ? (parseFloat(pricePerM2) * surface).toFixed(2) : pieceForm.selling_price_full
                      })
                    }}
                    placeholder="10.00"
                />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="selling_price_full">السعر (بالحاضر) *</Label>
                <Input
                    id="selling_price_full"
                  type="number"
                    step="0.01"
                    value={pieceForm.selling_price_full}
                    onChange={(e) => {
                      const totalPrice = e.target.value
                      const surface = parseFloat(pieceForm.surface_area) || 0
                      setPieceForm({ 
                        ...pieceForm, 
                        selling_price_full: totalPrice,
                        price_per_m2_full: surface > 0 && totalPrice ? (parseFloat(totalPrice) / surface).toFixed(2) : pieceForm.price_per_m2_full
                      })
                    }}
                    placeholder="0.00"
                />
                </div>
              </div>
            </div>
            ) : (
              /* Show calculated values preview for new pieces */
              pieceForm.piece_number && selectedBatchForPiece && (() => {
                const calculated = calculatePieceValues(pieceForm.piece_number, pieceForm.surface_area || defaultSurfaceArea)
                if (calculated) {
                  return (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                      <p className="text-sm font-medium mb-2">القيم المحسوبة تلقائياً:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <div>
                          <span className="text-muted-foreground">السعر (بالحاضر):</span>
                          <span className="mr-2 font-medium text-green-600">{formatCurrency(calculated.selling_price_full)}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">السعر (بالتقسيط):</span>
                          <span className="mr-2 font-medium text-blue-600">{formatCurrency(calculated.selling_price_installment)}</span>
                        </div>
                      </div>
                    </div>
                  )
                }
                return null
              })()
            )}
            
            {/* Payment Offers Management - show when editing */}
            {editingPiece && (() => {
              const isReserved = editingPiece.status === 'Reserved'
              const pieceSpecificOffers = pieceOffers.filter(o => o.land_piece_id === editingPiece.id)
              const batchOffers = pieceOffers.filter(o => o.land_batch_id === editingPiece.land_batch_id && !o.land_piece_id)
              
              return (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-green-800">عروض التقسيط</p>
                    <Button type="button" size="sm" onClick={addPieceOffer} variant="outline">
                      <Plus className="h-4 w-4 ml-1" />
                      إضافة عرض
                    </Button>
                  </div>
                  
                  {isReserved && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-xs font-medium text-blue-900 mb-1">
                            هذه القطعة محجوزة
                          </p>
                          {selectedPieceOfferId ? (
                            <p className="text-xs text-blue-800">
                              العرض المختار للبيع موضح أدناه بعلامة "مختار للبيع". يمكنك تغيير العرض المختار أو تعديله.
                            </p>
                          ) : (
                            <p className="text-xs text-blue-800">
                              لم يتم اختيار عرض للبيع بعد. يرجى اختيار عرض من القائمة أدناه.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Piece-specific offers (for both available and reserved pieces) */}
                  {pieceSpecificOffers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-700">
                        {isReserved ? 'عروض هذه القطعة (العرض المختار موضح أدناه):' : 'عروض هذه القطعة:'}
                      </p>
                      {pieceSpecificOffers.map((offer) => {
                        const isSelected = isReserved && selectedPieceOfferId === offer.id
                        return (
                        <div 
                          key={offer.id} 
                          className={`bg-white border rounded-lg p-3 flex items-center justify-between ${
                            isSelected 
                              ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500 shadow-sm' 
                              : 'border-green-300'
                          } ${isReserved ? 'cursor-pointer hover:bg-green-50 transition-colors' : ''}`}
                          onClick={isReserved ? () => handleSelectOfferForPiece(offer.id) : undefined}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              {isSelected && (
                                <Badge variant="default" className="text-xs bg-blue-600 text-white font-semibold">
                                  ✓ مختار للبيع (يستخدم حالياً)
                                </Badge>
                              )}
                              {offer.is_default && !isSelected && (
                                <Badge variant="default" className="text-xs">افتراضي</Badge>
                              )}
                              {offer.offer_name && (
                                <span className={`font-medium text-sm ${isSelected ? 'text-blue-900' : ''}`}>
                                  {offer.offer_name}
                                </span>
                              )}
                              <Badge variant="outline" className="text-xs">خاص بالقطعة</Badge>
                            </div>
                            <div className={`text-xs mt-1 ${isSelected ? 'text-blue-800 font-medium' : 'text-muted-foreground'}`}>
                              {offer.price_per_m2_installment && `السعر/م²: ${offer.price_per_m2_installment} | `}
                              عمولة: {offer.company_fee_percentage}% | 
                              التسبقة: {offer.advance_is_percentage ? `${offer.advance_amount}%` : formatCurrency(offer.advance_amount)} | 
                              {offer.monthly_payment && offer.monthly_payment > 0 ? (
                                <>الشهري: {formatCurrency(offer.monthly_payment)}</>
                              ) : offer.number_of_months && offer.number_of_months > 0 ? (
                                <>عدد الأشهر: {offer.number_of_months} شهر</>
                              ) : (
                                <>الشهري: غير محدد</>
                              )}
                            </div>
                            {isSelected && isReserved && (
                              <div className="mt-2 pt-2 border-t border-blue-200">
                                <p className="text-xs text-blue-700 font-medium">
                                  هذا هو العرض المستخدم حالياً للبيع. سيتم استخدامه عند تأكيد البيع.
                                </p>
                              </div>
                            )}
                          </div>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            {isReserved && isSelected && user?.role === 'Owner' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => editPieceOffer(offer)}
                                className="text-blue-700 hover:bg-blue-100"
                                title="تغيير العرض (للمالك فقط)"
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isReserved && !isSelected && user?.role === 'Owner' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleSelectOfferForPiece(offer.id)
                                }}
                                className="text-blue-700 hover:bg-blue-100 border-blue-300"
                                title="تغيير العرض (للمالك فقط)"
                              >
                                <Edit className="h-3.5 w-3.5 ml-1" />
                                تغيير العرض
                              </Button>
                            )}
                            {!isReserved && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => editPieceOffer(offer)}
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deletePieceOffer(offer.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                      })}
                    </div>
                  )}
                  
                  {/* Batch offers (for both available and reserved) */}
                  {batchOffers.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-700">
                        {isReserved ? 'عروض الدفعة (العرض المختار موضح أدناه):' : 'عروض الدفعة:'}
                      </p>
                      {batchOffers.map((offer) => {
                        const isSelected = isReserved && selectedPieceOfferId === offer.id
                        return (
                          <div 
                            key={offer.id} 
                            className={`bg-white border rounded-lg p-3 flex items-center justify-between ${
                              isSelected 
                                ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500 shadow-sm' 
                                : 'border-green-200'
                            } ${isReserved ? 'cursor-pointer hover:bg-green-50 transition-colors' : ''}`}
                            onClick={isReserved ? () => handleSelectOfferForPiece(offer.id) : undefined}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {isSelected && (
                                  <Badge variant="default" className="text-xs bg-blue-600 text-white font-semibold">
                                    ✓ مختار للبيع (يستخدم حالياً)
                                  </Badge>
                                )}
                                {offer.is_default && !isSelected && (
                                  <Badge variant="default" className="text-xs">افتراضي</Badge>
                                )}
                                {offer.offer_name && (
                                  <span className={`font-medium text-sm ${isSelected ? 'text-blue-900' : ''}`}>
                                    {offer.offer_name}
                                  </span>
                                )}
                                {!isReserved && (
                                  <Badge variant="outline" className="text-xs">من الدفعة</Badge>
                                )}
                              </div>
                              <div className={`text-xs mt-1 ${isSelected ? 'text-blue-800 font-medium' : 'text-muted-foreground'}`}>
                                {offer.price_per_m2_installment && `السعر/م²: ${offer.price_per_m2_installment} | `}
                                عمولة: {offer.company_fee_percentage}% | 
                                التسبقة: {offer.advance_is_percentage ? `${offer.advance_amount}%` : formatCurrency(offer.advance_amount)} | 
                                {offer.monthly_payment && offer.monthly_payment > 0 ? (
                                  <>الشهري: {formatCurrency(offer.monthly_payment)}</>
                                ) : offer.number_of_months && offer.number_of_months > 0 ? (
                                  <>عدد الأشهر: {offer.number_of_months} شهر</>
                                ) : (
                                  <>الشهري: غير محدد</>
                                )}
                              </div>
                              {isSelected && isReserved && (
                                <div className="mt-2 pt-2 border-t border-blue-200">
                                  <p className="text-xs text-blue-700 font-medium">
                                    هذا هو العرض المستخدم حالياً للبيع. سيتم استخدامه عند تأكيد البيع.
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                              {isReserved && isSelected && user?.role === 'Owner' && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    // Edit the selected offer - create a piece-specific copy
                                    editPieceOffer(offer)
                                  }}
                                  className="text-blue-700 hover:bg-blue-100"
                                  title="تغيير العرض (للمالك فقط)"
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              {isReserved && !isSelected && user?.role === 'Owner' && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleSelectOfferForPiece(offer.id)
                                  }}
                                  className="text-blue-700 hover:bg-blue-100 border-blue-300"
                                  title="تغيير العرض (للمالك فقط)"
                                >
                                  <Edit className="h-3.5 w-3.5 ml-1" />
                                  تغيير العرض
                                </Button>
                              )}
                              {!isReserved && (
                                <>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      // Create a piece-specific copy of batch offer
                                      editPieceOffer(offer)
                                    }}
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  
                  {/* No offers message */}
                  {pieceOffers.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      {isReserved 
                        ? 'لا توجد عروض متاحة. يرجى إضافة عرض في تفاصيل الدفعة.'
                        : 'لا توجد عروض. اضغط "إضافة عرض" لإضافة عرض جديد لهذه القطعة.'}
                    </p>
                  )}
                  
                </div>
              )
            })()}
            
            <div className="space-y-2">
              <Label htmlFor="piece_notes">ملاحظات (اختياري)</Label>
              <Textarea
                id="piece_notes"
                value={pieceForm.notes}
                maxLength={5000}
                onChange={(e) => setPieceForm({ ...pieceForm, notes: e.target.value })}
                placeholder="ملاحظات إضافية (اختياري)"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPieceDialogOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button onClick={savePiece} className="w-full sm:w-auto">
              {editingPiece ? 'حفظ' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Add Pieces Dialog */}
      <Dialog open={bulkAddDialogOpen} onOpenChange={setBulkAddDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة قطع متعددة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-medium mb-1">إضافة سريعة:</p>
                  <p>أدخل رقم البداية والنهاية لإنشاء عدة قطع بنفس المساحة. مثال: من 1 إلى 10، أو من B1 إلى B10</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bulk_from">من *</Label>
                <Input
                  id="bulk_from"
                  type="text"
                  value={bulkAddForm.from}
                  onChange={(e) => setBulkAddForm({ ...bulkAddForm, from: e.target.value })}
                  placeholder="مثال: 1، B1، R1"
                  autoFocus
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  رقم القطعة الأولى (رقم فقط أو حروف وأرقام)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bulk_to">إلى *</Label>
                <Input
                  id="bulk_to"
                  type="text"
                  value={bulkAddForm.to}
                  onChange={(e) => setBulkAddForm({ ...bulkAddForm, to: e.target.value })}
                  placeholder="مثال: 10، B10، R10"
                  maxLength={20}
                />
                <p className="text-xs text-muted-foreground">
                  رقم القطعة الأخيرة (يجب أن يكون نفس البادئة)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bulk_surface_area">المساحة (م²) *</Label>
              <Input
                id="bulk_surface_area"
                type="number"
                value={bulkAddForm.surface_area}
                onChange={(e) => setBulkAddForm({ ...bulkAddForm, surface_area: e.target.value })}
                placeholder={defaultSurfaceArea}
                min="1"
              />
              <p className="text-xs text-muted-foreground">
                المساحة المشتركة لجميع القطع
              </p>
            </div>

            {bulkAddForm.from && bulkAddForm.to && bulkAddForm.surface_area && (() => {
              try {
                const fromMatch = bulkAddForm.from.match(/^([A-Za-z\u0600-\u06FF]*)(\d+)$/i)
                const toMatch = bulkAddForm.to.match(/^([A-Za-z\u0600-\u06FF]*)(\d+)$/i)
                
                if (fromMatch && toMatch && fromMatch[1] === toMatch[1]) {
                  const fromNumber = parseInt(fromMatch[2], 10)
                  const toNumber = parseInt(toMatch[2], 10)
                  const numDigits = Math.max(fromMatch[2].length, toMatch[2].length)
                  const prefix = fromMatch[1] || ''
                  const count = toNumber >= fromNumber ? toNumber - fromNumber + 1 : 0
                  
                  if (count > 0 && count <= 100) {
                    const calculated = calculatePieceValues(
                      prefix ? `${prefix}${String(fromNumber).padStart(numDigits, '0')}` : String(fromNumber),
                      bulkAddForm.surface_area
                    )
                    
                    if (calculated) {
                      return (
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
                          <p className="text-sm font-medium mb-2">معاينة:</p>
                          <div className="space-y-1 text-sm">
                            <div>
                              <span className="text-muted-foreground">عدد القطع:</span>
                              <span className="mr-2 font-medium">{count}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">المساحة لكل قطعة:</span>
                              <span className="mr-2 font-medium">{bulkAddForm.surface_area} م²</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">السعر (بالحاضر):</span>
                              <span className="mr-2 font-medium text-green-600">{formatCurrency(calculated.selling_price_full)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">السعر (بالتقسيط):</span>
                              <span className="mr-2 font-medium text-blue-600">{formatCurrency(calculated.selling_price_installment)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    }
                  } else if (count > 100) {
                    return (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                        <p className="text-sm text-red-800">لا يمكن إضافة أكثر من 100 قطعة في المرة الواحدة</p>
                      </div>
                    )
                  }
                }
              } catch (e) {
                // Ignore errors in preview
              }
              return null
            })()}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setBulkAddDialogOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button 
              onClick={saveBulkPieces} 
              disabled={!bulkAddForm.from || !bulkAddForm.to || !bulkAddForm.surface_area}
              className="w-full sm:w-auto"
            >
              إضافة القطع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price Edit Dialog */}
      <Dialog open={priceEditDialogOpen} onOpenChange={setPriceEditDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg">
          <DialogHeader>
            <DialogTitle>تعديل أسعار القطعة #{editingPricePiece?.piece_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">ملاحظة مهمة:</p>
                  <p>تغيير الأسعار سيؤثر فقط على المبيعات المستقبلية. المبيعات الحالية والمباعة لن تتأثر بهذا التغيير.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="selling_price_full">السعر (بالحاضر) *</Label>
                <Input
                  id="selling_price_full"
                  type="number"
                  step="0.01"
                  value={priceForm.selling_price_full}
                  onChange={(e) => setPriceForm({ ...priceForm, selling_price_full: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="selling_price_installment">السعر (بالتقسيط) *</Label>
                <Input
                  id="selling_price_installment"
                  type="number"
                  step="0.01"
                  value={priceForm.selling_price_installment}
                  onChange={(e) => setPriceForm({ ...priceForm, selling_price_installment: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            {editingPricePiece && (
              <div className="text-sm text-muted-foreground">
                <p>المساحة: {editingPricePiece.surface_area} م²</p>
                <p>السعر الحالي بالحاضر: {formatCurrency(editingPricePiece.selling_price_full)}</p>
                <p>السعر الحالي للتقسيط: {formatCurrency(editingPricePiece.selling_price_installment)}</p>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setPriceEditDialogOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button 
              onClick={savePriceEdit} 
              disabled={!priceForm.selling_price_full || !priceForm.selling_price_installment}
              className="w-full sm:w-auto"
            >
              حفظ الأسعار
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Price Update Dialog */}
      <Dialog open={bulkPriceDialogOpen} onOpenChange={setBulkPriceDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg">
          <DialogHeader>
            <DialogTitle>تحديث أسعار جميع القطع في {bulkPriceBatch?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  <p className="font-medium mb-1">تحذير:</p>
                  <p>سيتم تحديث أسعار جميع القطع في هذه الدفعة ({bulkPriceBatch?.land_pieces.length} قطعة).</p>
                  <p className="mt-1">هذا التغيير سيؤثر فقط على المبيعات المستقبلية. المبيعات الحالية والمباعة لن تتأثر.</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
                <Label htmlFor="bulk_price_per_m2_full">السعر لكل م² (بالحاضر) *</Label>
                <Input
                  id="bulk_price_per_m2_full"
                  type="number"
                  step="0.01"
                  value={bulkPriceForm.price_per_m2_full}
                  onChange={(e) => setBulkPriceForm({ ...bulkPriceForm, price_per_m2_full: e.target.value })}
                  placeholder="0.00"
              />
            </div>
              <div className="space-y-2">
                <Label htmlFor="bulk_price_per_m2_installment">السعر لكل م² (بالتقسيط) *</Label>
                <Input
                  id="bulk_price_per_m2_installment"
                  type="number"
                  step="0.01"
                  value={bulkPriceForm.price_per_m2_installment}
                  onChange={(e) => setBulkPriceForm({ ...bulkPriceForm, price_per_m2_installment: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            {bulkPriceBatch && bulkPriceForm.price_per_m2_full && bulkPriceForm.price_per_m2_installment && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-medium mb-2">معاينة الأسعار الجديدة:</p>
                <div className="space-y-1">
                  {(bulkPriceBatch as LandBatchWithPieces).land_pieces.slice(0, 5).map(piece => (
                    <div key={piece.id} className="flex justify-between">
                      <span>#{piece.piece_number} ({piece.surface_area} م²):</span>
                      <span>
                        {formatCurrency(piece.surface_area * parseFloat(bulkPriceForm.price_per_m2_full))} / {formatCurrency(piece.surface_area * parseFloat(bulkPriceForm.price_per_m2_installment))}
                      </span>
                    </div>
                  ))}
                  {(bulkPriceBatch as LandBatchWithPieces).land_pieces.length > 5 && (
                    <p className="text-muted-foreground">... و {(bulkPriceBatch as LandBatchWithPieces).land_pieces.length - 5} قطعة أخرى</p>
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setBulkPriceDialogOpen(false)} className="w-full sm:w-auto">
              إلغاء
            </Button>
            <Button 
              onClick={saveBulkPriceUpdate} 
              disabled={!bulkPriceForm.price_per_m2_full || !bulkPriceForm.price_per_m2_installment}
              className="w-full sm:w-auto"
            >
              تحديث جميع الأسعار
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image View Dialog */}
      <Dialog open={imageViewDialogOpen} onOpenChange={setImageViewDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-4xl max-h-[95vh] p-0">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>{viewingImageName}</DialogTitle>
          </DialogHeader>
          <div className="p-6 flex items-center justify-center bg-gray-50 min-h-[400px] overflow-hidden relative">
            {viewingImageUrl && (
              <ImageZoomViewer 
                src={viewingImageUrl} 
                alt={viewingImageName}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = ''
                  ;(e.target as HTMLImageElement).alt = 'خطأ في تحميل الصورة'
                }}
              />
            )}
          </div>
          <DialogFooter className="px-6 py-4 border-t">
            <Button variant="outline" onClick={() => setImageViewDialogOpen(false)} className="w-full sm:w-auto">
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Batch Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={confirmDeleteBatch}
        title="تأكيد الحذف"
        description="هل أنت متأكد من حذف هذه الدفعة وجميع قطعها؟ لا يمكن التراجع عن هذا الإجراء."
        variant="destructive"
        confirmText="نعم، حذف"
        cancelText="إلغاء"
      />

      {/* Delete Piece Confirmation Dialog */}
      <ConfirmDialog
        open={deletePieceConfirmOpen}
        onOpenChange={setDeletePieceConfirmOpen}
        onConfirm={confirmDeletePiece}
        title="تأكيد حذف القطعة"
        description={pieceToDelete ? `هل أنت متأكد من حذف القطعة رقم ${pieceToDelete.piece_number}؟ لا يمكن التراجع عن هذا الإجراء.` : 'هل أنت متأكد من حذف هذه القطعة؟'}
        variant="destructive"
        confirmText="نعم، حذف"
        cancelText="إلغاء"
      />

      {/* New Client Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={(open) => {
        setClientDialogOpen(open)
        if (!open) {
          // Reset form when dialog closes
          setClientForm({
            name: '',
            cin: '',
            phone: '',
            email: '',
            address: '',
            client_type: 'Individual',
            notes: '',
          })
          setFoundClient(null)
          setNewClient(null)
          setClientSearchStatus('idle')
        } else {
          // Clear found client when dialog opens (so message only shows after search)
          setFoundClient(null)
          setClientSearchStatus('idle')
        }
      }}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة عميل جديد</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="clientCIN" className="text-sm">رقم الهوية *</Label>
              <div className="relative">
                <Input
                  id="clientCIN"
                  value={clientForm.cin}
                  onChange={(e) => {
                    const newCIN = e.target.value
                    setClientForm({ ...clientForm, cin: newCIN })
                    // Clear found client if CIN changes
                    if (foundClient && newCIN !== foundClient.cin) {
                      setFoundClient(null)
                      setNewClient(null)
                      setClientSearchStatus('idle')
                    }
                    // Trigger search
                    debouncedCINSearch(newCIN)
                  }}
                  placeholder="رقم الهوية"
                  className={`h-9 ${searchingClient ? 'pr-10' : ''} ${clientSearchStatus === 'found' ? 'border-green-500' : clientSearchStatus === 'not_found' ? 'border-blue-300' : ''}`}
                  autoFocus
                />
                {searchingClient && (
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <div className="h-4 w-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin"></div>
                  </div>
                )}
                {!searchingClient && clientForm.cin && clientForm.cin.trim().length >= 2 && (
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    {clientSearchStatus === 'found' && (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    )}
                    {clientSearchStatus === 'not_found' && (
                      <XCircle className="h-4 w-4 text-blue-500" />
                )}
              </div>
                )}
              </div>
              {foundClient && clientForm.cin && clientForm.cin.trim().length >= 2 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 mt-1">
                  <div className="flex items-start gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-green-800 flex-1">
                      <p className="font-medium mb-0.5">✓ تم العثور على عميل: {foundClient.name}</p>
                      <p className="text-xs">CIN: {foundClient.cin} {foundClient.phone && `| الهاتف: ${foundClient.phone}`}</p>
                      <p className="text-xs mt-1">تم ملء البيانات تلقائياً. يمكنك تعديلها أو المتابعة.</p>
                    </div>
                  </div>
                </div>
              )}
              {clientSearchStatus === 'not_found' && !foundClient && clientForm.cin && clientForm.cin.trim().length >= 4 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 mt-1">
                  <div className="flex items-start gap-2">
                    <XCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-blue-800">
                      <p className="font-medium mb-0.5">لا يوجد عميل بهذا الرقم</p>
                      <p className="text-xs">يمكنك المتابعة لإضافة عميل جديد.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientName" className="text-sm">الاسم *</Label>
              <Input
                id="clientName"
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                placeholder="اسم العميل"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientPhone" className="text-sm">رقم الهاتف *</Label>
              <Input
                id="clientPhone"
                value={clientForm.phone}
                onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                placeholder="مثال: 5822092120192614/10/593"
                className="h-9"
                maxLength={50}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientEmail" className="text-sm">البريد الإلكتروني</Label>
              <Input
                id="clientEmail"
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                placeholder="البريد الإلكتروني (اختياري)"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientAddress" className="text-sm">العنوان</Label>
              <Input
                id="clientAddress"
                value={clientForm.address}
                onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
                placeholder="العنوان (اختياري)"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientType" className="text-sm">نوع العميل</Label>
              <Select
                value={clientForm.client_type}
                onChange={(e) => setClientForm({ ...clientForm, client_type: e.target.value as 'Individual' | 'Company' })}
              >
                <option value="Individual">فردي</option>
                <option value="Company">شركة</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clientNotes" className="text-sm">ملاحظات</Label>
              <Textarea
                id="clientNotes"
                value={clientForm.notes}
                onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                placeholder="ملاحظات (اختياري)"
                className="min-h-[70px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClientDialogOpen(false)}>
              إلغاء
            </Button>
            <Button 
              onClick={async () => {
                // If client found, use it directly, otherwise create new
                if (foundClient) {
                  setNewClient(foundClient)
                  setClientDialogOpen(false)
                  
                  // Load offers for selected pieces
                  await loadOffersForSelectedPieces()
                  
                  setSaleDialogOpen(true)
                } else {
                  await handleCreateClient()
                }
              }}
              disabled={savingClient || searchingClient || !clientForm.name || !clientForm.cin || !clientForm.phone}
            >
              {savingClient ? 'جاري الحفظ...' : searchingClient ? 'جاري البحث...' : foundClient ? 'استخدام والمتابعة' : 'حفظ والمتابعة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale Creation Dialog */}
      <Dialog 
        open={saleDialogOpen} 
        onOpenChange={(open) => {
          // Only allow closing if explicitly requested (not from internal clicks)
          // This prevents accidental closes from event bubbling
          if (!open) {
            // Check if we have unsaved data
            if (newClient && selectedPieces.size > 0) {
              // Show confirmation if there's data
              if (window.confirm('هل أنت متأكد من إغلاق النافذة؟ سيتم فقدان البيانات غير المحفوظة.')) {
                setSaleDialogOpen(false)
                setNewClient(null)
                setSelectedPieces(new Set())
                setSaleClientCIN('')
                setSaleClientFound(null)
                setSaleClientSearchStatus('idle')
              }
            } else {
              setSaleDialogOpen(false)
              setNewClient(null)
              setSelectedPieces(new Set())
              setSaleClientCIN('')
              setSaleClientFound(null)
              setSaleClientSearchStatus('idle')
            }
          }
        }}
      >
        <DialogContent 
          className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto"
          onClick={(e) => {
            // Prevent clicks inside dialog from bubbling up and closing the dialog
            e.stopPropagation()
          }}
          onMouseDown={(e) => {
            // Prevent mouse down events from bubbling
            e.stopPropagation()
          }}
          onTouchStart={(e) => {
            // Prevent touch events from bubbling (mobile)
            e.stopPropagation()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('land.createNewSale')}</DialogTitle>
          </DialogHeader>
          {newClient && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="font-medium text-sm">العميل: {newClient.name}</p>
                <p className="text-xs text-muted-foreground">CIN: {newClient.cin} | الهاتف: {newClient.phone}</p>
              </div>
              
              <div className="space-y-2">
                <Label>القطع المختارة:</Label>
                <div className="bg-gray-50 rounded-lg p-2 max-h-40 overflow-y-auto space-y-1">
                  {Array.from(selectedPieces).map(pieceId => {
                    const piece = batches.flatMap(b => b.land_pieces).find(p => p.id === pieceId)
                    if (!piece) return null
                    const batch = batches.find(b => b.id === piece.land_batch_id)
                    
                    // Calculate price based on payment type
                    let piecePrice = 0
                    if (saleForm.payment_type === 'Full') {
                      piecePrice = piece.selling_price_full || 0
                    } else {
                      // For installment, use selected offer price or default installment price
                      if (selectedOffer && selectedOffer.price_per_m2_installment) {
                        piecePrice = piece.surface_area * selectedOffer.price_per_m2_installment
                      } else {
                        piecePrice = piece.selling_price_installment || piece.selling_price_full || 0
                      }
                    }
                    
                    return (
                      <div key={pieceId} className="flex items-center justify-between text-sm py-1.5 px-2 bg-white rounded border border-gray-200 hover:bg-gray-50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{batch?.name || 'دفعة'} - #{piece.piece_number} ({piece.surface_area} م²)</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 ml-2 flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            setSelectedPieces(prev => {
                              const newSelected = new Set(prev)
                              newSelected.delete(pieceId)
                              // Prevent removing the last piece - show warning instead
                              if (newSelected.size === 0) {
                                showNotification('يجب أن يكون هناك قطعة واحدة على الأقل في البيع', 'warning')
                                return prev // Keep the original set
                              }
                              return newSelected
                            })
                          }}
                          onTouchEnd={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
    </div>
  )
                  })}
                </div>
              </div>

              {/* Reservation Amount Field - Show before payment type and offers */}
              <div className="space-y-2">
                <Label htmlFor="reservationAmountGlobal">العربون (مبلغ الحجز) *</Label>
                <Input
                  id="reservationAmountGlobal"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={saleForm.reservation_amount}
                  key={`reservation-${saleDialogOpen}`}
                  onBlur={(e) => {
                    e.stopPropagation()
                    setSaleForm(prev => ({ ...prev, reservation_amount: e.target.value }))
                  }}
                  onChange={(e) => {
                    e.stopPropagation()
                    // Use functional update to avoid stale closure
                    setSaleForm(prev => ({ ...prev, reservation_amount: e.target.value }))
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                  }}
                  placeholder="أدخل مبلغ العربون"
                />
                <p className="text-xs text-muted-foreground">
                  دفعة صغيرة للحجز حتى يأتي العميل لتأكيد البيع. سيتم احتسابها كمدفوع مسبقاً عند التأكيد.
                </p>
              </div>

              {/* Available Offers - Show only for Installment payment */}
              {saleForm.payment_type === 'Installment' && availableOffers.length > 0 && (
                <div className="space-y-2">
                  <Label>اختر عرض الدفع (اختياري)</Label>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
                    {availableOffers.map((offer) => {
                      const selectedPieceIds = Array.from(selectedPieces)
                      const selectedPiecesData = batches.flatMap(b => b.land_pieces).filter(p => selectedPieceIds.includes(p.id))
                      
                      // Calculate per piece
                      const piecesCalculations = selectedPiecesData.map(p => {
                        const piecePrice = offer.price_per_m2_installment 
                          ? (p.surface_area * offer.price_per_m2_installment)
                          : (p.selling_price_installment || p.selling_price_full || 0)
                        
                        const companyFeePercentage = offer.company_fee_percentage || 0
                        const companyFeePerPiece = (piecePrice * companyFeePercentage) / 100
                        const totalPayablePerPiece = piecePrice + companyFeePerPiece
                        
                        const advancePerPiece = offer.advance_is_percentage
                          ? (piecePrice * offer.advance_amount) / 100
                          : offer.advance_amount
                        
                        const remainingPerPiece = totalPayablePerPiece - advancePerPiece
                        const monthsPerPiece = offer.monthly_payment > 0 && remainingPerPiece > 0
                          ? Math.ceil(remainingPerPiece / offer.monthly_payment)
                          : 0
                        
                        return {
                          piecePrice,
                          companyFeePerPiece,
                          totalPayablePerPiece,
                          advancePerPiece,
                          remainingPerPiece,
                          monthsPerPiece
                        }
                      })
                      
                      // Sum up totals
                      const totalPrice = piecesCalculations.reduce((sum, calc) => sum + calc.piecePrice, 0)
                      const totalAdvance = piecesCalculations.reduce((sum, calc) => sum + calc.advancePerPiece, 0)
                      const maxMonths = Math.max(...piecesCalculations.map(calc => calc.monthsPerPiece), 0)

                      const isSelected = selectedOffer?.id === offer.id

                      return (
                        <div
                          key={offer.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            setSelectedOffer(offer)
                            applyOfferToSaleForm(offer)
                          }}
                          onMouseDown={(e) => {
                            e.stopPropagation()
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation()
                          }}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-green-100 border-green-500 ring-2 ring-green-500'
                              : 'bg-white border-green-200 hover:bg-green-50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {offer.is_default && (
                                  <Badge variant="default" className="text-xs">افتراضي</Badge>
                                )}
                                {offer.offer_name && (
                                  <span className="font-medium text-sm">{offer.offer_name}</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                {offer.price_per_m2_installment && (
                                  <div>سعر المتر المربع: {offer.price_per_m2_installment} DT</div>
                                )}
                                <div>عمولة الشركة: {offer.company_fee_percentage}%</div>
                                <div>
                                  التسبقة: {offer.advance_is_percentage 
                                    ? `${offer.advance_amount}% (${formatCurrency(totalAdvance)})`
                                    : `${formatCurrency(offer.advance_amount)} لكل قطعة (${formatCurrency(totalAdvance)} إجمالي)`}
                                </div>
                                <div>المبلغ الشهري: {formatCurrency(offer.monthly_payment)}</div>
                                {maxMonths > 0 && (
                                  <div className="font-medium text-green-700 mt-1">
                                    عدد الأشهر: {maxMonths} شهر
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="ml-2">
                              <input
                                type="radio"
                                checked={isSelected}
                                onChange={(e) => {
                                  e.stopPropagation()
                                  setSelectedOffer(offer)
                                  applyOfferToSaleForm(offer)
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                }}
                                onMouseDown={(e) => {
                                  e.stopPropagation()
                                }}
                                className="h-4 w-4 text-green-600"
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    اختر عرضاً لملء الحقول تلقائياً، أو املأها يدوياً
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="paymentType">نوع الدفع *</Label>
                <Select
                  id="paymentType"
                  value={saleForm.payment_type}
                  onChange={(e) => {
                    e.stopPropagation()
                    const newPaymentType = e.target.value as 'Full' | 'Installment' | 'PromiseOfSale'
                    setSaleForm({ ...saleForm, payment_type: newPaymentType })
                    // Reload offers when switching to Installment
                    if (newPaymentType === 'Installment') {
                      loadOffersForSelectedPieces()
                    } else {
                      setAvailableOffers([])
                      setSelectedOffer(null)
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                  }}
                >
                  <option value="Full">بالحاضر</option>
                  <option value="Installment">بالتقسيط</option>
                  <option value="PromiseOfSale">وعد بالبيع (Les Promesses de Vente)</option>
                </Select>
              </div>

              {/* Promise of Sale Fields */}
              {saleForm.payment_type === 'PromiseOfSale' && (
                <div className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-blue-800 mb-2">معلومات وعد البيع</p>
                  
                  <div className="space-y-2">
                    <Label htmlFor="promiseInitialPayment" className="text-sm">المبلغ المستلم الآن *</Label>
                    <Input
                      id="promiseInitialPayment"
                      type="number"
                      value={saleForm.promise_initial_payment}
                      onChange={(e) => {
                        e.stopPropagation()
                        setSaleForm({ ...saleForm, promise_initial_payment: e.target.value })
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation()
                      }}
                      placeholder="المبلغ المستلم الآن"
                      className="h-9"
                      min="0"
                      step="0.01"
                    />
                    <p className="text-xs text-muted-foreground">
                      المبلغ الذي سيتم استلامه الآن. الباقي سيتم تأكيده في صفحة تأكيد المبيعات.
                    </p>
                  </div>
                </div>
              )}

              {/* Sale Details Summary - Different for Full vs Installment */}
              {(() => {
                const selectedPieceIds = Array.from(selectedPieces)
                const selectedPiecesData = batches.flatMap(b => b.land_pieces).filter(p => selectedPieceIds.includes(p.id))
                
                if (saleForm.payment_type === 'Full' || saleForm.payment_type === 'PromiseOfSale') {
                  // Full Payment or Promise of Sale Details
                  // For Available pieces, calculate from batch price_per_m2_full
                  // For Reserved pieces, use stored selling_price_full
                  const totalPrice = selectedPiecesData.reduce((sum, p) => {
                    if (p.status === 'Available') {
                      const batch = batches.find(b => b.id === p.land_batch_id)
                      if ((batch as any)?.price_per_m2_full) {
                        return sum + (p.surface_area * parseFloat((batch as any).price_per_m2_full))
                      }
                    }
                    return sum + (p.selling_price_full || 0)
                  }, 0)
                  
                  // Get company fee percentage from batch (use first batch's fee, or default to 0)
                  const firstBatch = batches.find(b => b.id === selectedPiecesData[0]?.land_batch_id)
                  const companyFeePercentage = (firstBatch as any)?.company_fee_percentage_full || 0
                  const companyFeeAmount = (totalPrice * companyFeePercentage) / 100
                  const totalPayable = totalPrice + companyFeeAmount
                  
                  // Get reservation amount from form
                  const reservation = parseFloat(saleForm.reservation_amount) || 0
                  
                  // For PromiseOfSale, get initial payment
                  const initialPayment = saleForm.payment_type === 'PromiseOfSale' 
                    ? (parseFloat(saleForm.promise_initial_payment) || 0)
                    : 0
                  
                  // Calculate remaining
                  let remainingAfterReservation = totalPayable - reservation
                  if (saleForm.payment_type === 'PromiseOfSale') {
                    remainingAfterReservation = totalPayable - reservation - initialPayment
                  }
                  
                  return (
                    <div className={`${saleForm.payment_type === 'PromiseOfSale' ? 'bg-purple-50 border-purple-200' : 'bg-green-50 border-green-200'} border rounded-lg p-4 space-y-3`}>
                      <p className={`font-semibold ${saleForm.payment_type === 'PromiseOfSale' ? 'text-purple-800' : 'text-green-800'} text-sm mb-2`}>
                        {saleForm.payment_type === 'PromiseOfSale' ? 'تفاصيل البيع (وعد بالبيع):' : 'تفاصيل البيع (بالحاضر):'}
                      </p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">عدد القطع:</span>
                          <span className="font-medium">{selectedPiecesData.length}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">السعر الإجمالي:</span>
                          <span className="font-semibold text-green-700">{formatCurrency(totalPrice)}</span>
                        </div>
                        {companyFeePercentage > 0 && (
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">عمولة الشركة ({companyFeePercentage}%):</span>
                            <span className="font-medium text-green-700">{formatCurrency(companyFeeAmount)}</span>
                          </div>
                        )}
                        <div className={`flex justify-between border-t ${saleForm.payment_type === 'PromiseOfSale' ? 'border-purple-200' : 'border-green-200'} pt-2`}>
                          <span className="font-medium text-muted-foreground">المبلغ الإجمالي المستحق:</span>
                          <span className={`font-semibold ${saleForm.payment_type === 'PromiseOfSale' ? 'text-purple-800' : 'text-green-800'}`}>{formatCurrency(totalPayable)}</span>
                        </div>
                        {reservation > 0 && (
                          <>
                            <div className={`flex justify-between ${saleForm.payment_type === 'PromiseOfSale' ? 'text-purple-700' : 'text-green-700'}`}>
                              <span>العربون (مدفوع عند الحجز):</span>
                              <span className="font-medium">{formatCurrency(reservation)}</span>
                            </div>
                            {saleForm.payment_type === 'PromiseOfSale' && initialPayment > 0 && (
                              <div className={`flex justify-between ${saleForm.payment_type === 'PromiseOfSale' ? 'text-purple-700' : 'text-green-700'}`}>
                                <span>المبلغ المستلم الآن:</span>
                                <span className="font-medium">{formatCurrency(initialPayment)}</span>
                              </div>
                            )}
                            <div className={`flex justify-between border-t ${saleForm.payment_type === 'PromiseOfSale' ? 'border-purple-200' : 'border-green-200'} pt-2`}>
                              <span className="font-medium text-muted-foreground">المبلغ المتبقي:</span>
                              <span className={`font-semibold ${saleForm.payment_type === 'PromiseOfSale' ? 'text-purple-800' : 'text-green-800'}`}>{formatCurrency(Math.max(0, remainingAfterReservation))}</span>
                            </div>
                          </>
                        )}
                        {saleForm.payment_type === 'PromiseOfSale' && reservation === 0 && initialPayment > 0 && (
                          <>
                            <div className="flex justify-between text-purple-700">
                              <span>المبلغ المستلم الآن:</span>
                              <span className="font-medium">{formatCurrency(initialPayment)}</span>
                            </div>
                            <div className="flex justify-between border-t border-purple-200 pt-2">
                              <span className="font-medium text-muted-foreground">المبلغ المتبقي:</span>
                              <span className="font-semibold text-purple-800">{formatCurrency(Math.max(0, remainingAfterReservation))}</span>
                            </div>
                          </>
                        )}
                        {selectedPiecesData.map((piece, idx) => {
                          const batch = batches.find(b => b.id === piece.land_batch_id)
                          // For Available pieces, calculate from batch price_per_m2_full
                          // For Reserved pieces, use stored selling_price_full
                          const piecePrice = piece.status === 'Available' && (batch as any)?.price_per_m2_full
                            ? (piece.surface_area * parseFloat((batch as any).price_per_m2_full))
                            : (piece.selling_price_full || 0)
                          const pieceCompanyFee = (piecePrice * companyFeePercentage) / 100
                          const pieceTotalPayable = piecePrice + pieceCompanyFee
                          const reservationPerPiece = reservation / selectedPiecesData.length
                          const initialPaymentPerPiece = saleForm.payment_type === 'PromiseOfSale' 
                            ? (initialPayment / selectedPiecesData.length)
                            : 0
                          const pieceRemaining = saleForm.payment_type === 'PromiseOfSale'
                            ? (pieceTotalPayable - reservationPerPiece - initialPaymentPerPiece)
                            : (pieceTotalPayable - reservationPerPiece)
                          
                          return (
                            <div key={piece.id} className={`bg-white rounded p-2 border ${saleForm.payment_type === 'PromiseOfSale' ? 'border-purple-100' : 'border-green-100'}`}>
                              <div className="flex justify-between items-start mb-1">
                                <div className="flex-1">
                                  <p className="font-medium text-xs">{batch?.name || 'دفعة'} - #{piece.piece_number}</p>
                                  <p className="text-xs text-muted-foreground">{piece.surface_area} م²</p>
                                </div>
                                <p className={`font-semibold text-sm ${saleForm.payment_type === 'PromiseOfSale' ? 'text-purple-700' : 'text-green-700'}`}>{formatCurrency(piecePrice)}</p>
                              </div>
                              <div className={`text-xs text-muted-foreground space-y-0.5 pl-2 border-t ${saleForm.payment_type === 'PromiseOfSale' ? 'border-purple-50' : 'border-green-50'} pt-1 mt-1`}>
                                {companyFeePercentage > 0 && (
                                  <div>عمولة ({companyFeePercentage}%): {formatCurrency(pieceCompanyFee)}</div>
                                )}
                                <div>المستحق: {formatCurrency(pieceTotalPayable)}</div>
                                {reservation > 0 && (
                                  <div className={saleForm.payment_type === 'PromiseOfSale' ? 'text-purple-700' : 'text-green-700'}>العربون (مدفوع): {formatCurrency(reservationPerPiece)}</div>
                                )}
                                {saleForm.payment_type === 'PromiseOfSale' && initialPaymentPerPiece > 0 && (
                                  <div className="text-purple-700">المستلم الآن: {formatCurrency(initialPaymentPerPiece)}</div>
                                )}
                                {(reservation > 0 || (saleForm.payment_type === 'PromiseOfSale' && initialPaymentPerPiece > 0)) && (
                                  <div>المتبقي: {formatCurrency(Math.max(0, pieceRemaining))}</div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                } else {
                  // Installment Payment Details
                  if (!selectedOffer) {
                    return (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-xs text-yellow-800">يرجى اختيار عرض الدفع لعرض التفاصيل</p>
                      </div>
                    )
                  }
                  
                  // Get reservation amount and calculate per piece
                  const reservation = parseFloat(saleForm.reservation_amount) || 0
                  const reservationPerPiece = reservation / selectedPiecesData.length
                  
                  // Calculate per piece
                  const piecesCalculations = selectedPiecesData.map(p => {
                    const piecePrice = selectedOffer.price_per_m2_installment 
                      ? (p.surface_area * selectedOffer.price_per_m2_installment)
                      : (p.selling_price_installment || p.selling_price_full || 0)
                    
                    const companyFeePercentage = selectedOffer.company_fee_percentage || 0
                    const companyFeePerPiece = (piecePrice * companyFeePercentage) / 100
                    const totalPayablePerPiece = piecePrice + companyFeePerPiece
                    
                    const advancePerPiece = selectedOffer.advance_is_percentage
                      ? (piecePrice * selectedOffer.advance_amount) / 100
                      : selectedOffer.advance_amount
                    
                    // Remaining after reservation (paid at sale creation) and advance (paid at confirmation)
                    const remainingPerPiece = totalPayablePerPiece - reservationPerPiece - advancePerPiece
                    
                    // Calculate based on what the offer has: monthly_payment or number_of_months
                    let monthsPerPiece = 0
                    let monthlyAmountPerPiece = 0
                    
                    if (selectedOffer.monthly_payment && selectedOffer.monthly_payment > 0) {
                      // Offer has monthly_payment - calculate number of months
                      monthlyAmountPerPiece = selectedOffer.monthly_payment
                      monthsPerPiece = remainingPerPiece > 0
                        ? Math.ceil(remainingPerPiece / selectedOffer.monthly_payment)
                        : 0
                    } else if (selectedOffer.number_of_months && selectedOffer.number_of_months > 0) {
                      // Offer has number_of_months - calculate monthly payment
                      monthsPerPiece = selectedOffer.number_of_months
                      monthlyAmountPerPiece = remainingPerPiece > 0
                        ? remainingPerPiece / selectedOffer.number_of_months
                        : 0
                    }
                    
                    return {
                      piece: p,
                      piecePrice,
                      companyFeePerPiece,
                      totalPayablePerPiece,
                      reservationPerPiece,
                      advancePerPiece,
                      remainingPerPiece,
                      monthsPerPiece,
                      monthlyAmountPerPiece
                    }
                  })
                  
                  // Sum up totals
                  const totalPrice = piecesCalculations.reduce((sum, calc) => sum + calc.piecePrice, 0)
                  const companyFeePercentage = selectedOffer.company_fee_percentage || 0
                  const companyFeeAmount = piecesCalculations.reduce((sum, calc) => sum + calc.companyFeePerPiece, 0)
                  const totalPayable = piecesCalculations.reduce((sum, calc) => sum + calc.totalPayablePerPiece, 0)
                  const totalReservation = piecesCalculations.reduce((sum, calc) => sum + calc.reservationPerPiece, 0)
                  const advanceAmount = piecesCalculations.reduce((sum, calc) => sum + calc.advancePerPiece, 0)
                  const remainingAfterPayments = piecesCalculations.reduce((sum, calc) => sum + calc.remainingPerPiece, 0)
                  // For monthly amount, use the average or max - typically we use the max monthly amount needed
                  // But since each piece might have different monthly amounts, we use the maximum
                  const monthlyAmountPerPiece = Math.max(...piecesCalculations.map(calc => calc.monthlyAmountPerPiece), 0)
                  const totalMonthlyAmount = monthlyAmountPerPiece * selectedPiecesData.length // Multiply by number of pieces
                  const maxMonths = Math.max(...piecesCalculations.map(calc => calc.monthsPerPiece), 0)
                  
                  return (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                      {selectedPiecesData.length > 0 && (
                        <div className="bg-white rounded p-2 border border-blue-100 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground mb-2">تفاصيل القطع:</p>
                          {piecesCalculations.map((calc) => {
                            const batch = batches.find(b => b.id === calc.piece.land_batch_id)
                            return (
                              <div key={calc.piece.id} className="border-b border-blue-50 last:border-0 pb-1.5 last:pb-0 mb-1.5 last:mb-0">
                                <div className="flex justify-between items-start mb-1">
                                  <div>
                                    <p className="font-medium text-xs">{batch?.name || 'دفعة'} - #{calc.piece.piece_number}</p>
                                    <p className="text-muted-foreground text-xs">{calc.piece.surface_area} م²</p>
                                  </div>
                                  <p className="font-semibold text-blue-700 text-xs">{formatCurrency(calc.piecePrice)}</p>
                                </div>
                                <div className="text-xs text-muted-foreground space-y-0.5 pl-2">
                                  <div>عمولة ({companyFeePercentage}%): {formatCurrency(calc.companyFeePerPiece)}</div>
                                  <div>المستحق: {formatCurrency(calc.totalPayablePerPiece)}</div>
                                  <div className="text-green-700">العربون (مدفوع): {formatCurrency(calc.reservationPerPiece)}</div>
                                  <div>التسبقة (عند التأكيد): {formatCurrency(calc.advancePerPiece)}</div>
                                  <div>المتبقي للتقسيط: {formatCurrency(calc.remainingPerPiece)}</div>
                                  {calc.monthlyAmountPerPiece > 0 && (
                                    <div>المبلغ الشهري (لكل قطعة): {formatCurrency(calc.monthlyAmountPerPiece)}</div>
                                  )}
                                  {calc.monthsPerPiece > 0 && (
                                    <div className="font-medium text-blue-700">عدد الأشهر: {calc.monthsPerPiece} شهر</div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                          {/* Total Summary */}
                          <div className="border-t border-blue-200 pt-2 mt-2 space-y-1">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs font-semibold text-blue-800">الإجمالي:</span>
                            </div>
                            <div className="text-xs text-muted-foreground space-y-1 pl-2 bg-blue-50 rounded p-2">
                              <div className="flex justify-between">
                                <span>السعر الإجمالي:</span>
                                <span className="font-medium">{formatCurrency(totalPrice)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>عمولة الشركة ({companyFeePercentage}%):</span>
                                <span className="font-medium">{formatCurrency(companyFeeAmount)}</span>
                              </div>
                              <div className="flex justify-between border-t border-blue-100 pt-1 mt-1">
                                <span className="font-medium">المبلغ الإجمالي المستحق:</span>
                                <span className="font-semibold text-blue-800">{formatCurrency(totalPayable)}</span>
                              </div>
                              <div className="flex justify-between text-green-700">
                                <span>العربون (مدفوع عند الحجز):</span>
                                <span className="font-medium">{formatCurrency(totalReservation)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>التسبقة (عند التأكيد):</span>
                                <span className="font-medium">{formatCurrency(advanceAmount)}</span>
                              </div>
                              <div className="flex justify-between border-t border-blue-100 pt-1 mt-1">
                                <span className="font-medium">المبلغ المتبقي للتقسيط:</span>
                                <span className="font-semibold text-blue-800">{formatCurrency(remainingAfterPayments)}</span>
                              </div>
                              {maxMonths > 0 && (
                                <>
                                  <div className="flex justify-between">
                                    <span>المبلغ الشهري (لكل قطعة):</span>
                                    <span className="font-medium">{formatCurrency(monthlyAmountPerPiece)}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>المبلغ الشهري الإجمالي ({selectedPiecesData.length} قطع):</span>
                                    <span className="font-semibold text-blue-800">{formatCurrency(totalMonthlyAmount)}</span>
                                  </div>
                                  <div className="flex justify-between border-t border-blue-100 pt-1 mt-1">
                                    <span className="font-medium">عدد الأشهر:</span>
                                    <span className="font-semibold text-blue-800">{maxMonths} شهر</span>
                                  </div>
                                </>
                              )}
                              <div className="text-xs text-muted-foreground mt-2 pt-2 border-t border-blue-100">
                                <p className="font-medium mb-1">ملاحظة:</p>
                                <p>• العربون: مبلغ يتم دفعه عند إنشاء البيع (الحجز)</p>
                                <p>• التسبقة: مبلغ يتم دفعه عند تأكيد البيع</p>
                                <p>• المبلغ المتبقي: يتم تقسيطه على {maxMonths} شهر بمبلغ {formatCurrency(totalMonthlyAmount)} شهرياً ({formatCurrency(monthlyAmountPerPiece)} لكل قطعة × {selectedPiecesData.length} قطع)</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }
              })()}

              <div className="space-y-2">
                <Label htmlFor="deadlineDate">آخر أجل لإتمام الإجراءات *</Label>
                <Input
                  id="deadlineDate"
                  type="date"
                  value={saleForm.deadline_date}
                  onChange={(e) => {
                    e.stopPropagation()
                    setSaleForm({ ...saleForm, deadline_date: e.target.value })
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                  }}
                  placeholder="mm/dd/yyyy"
                />
                <p className="text-xs text-muted-foreground">
                  تاريخ آخر أجل لإتمام إجراءات البيع. سيتم عرض تحذيرات عند اقتراب الموعد النهائي.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={(e) => {
                e.stopPropagation()
                setSaleDialogOpen(false)
                setNewClient(null)
                setSelectedPieces(new Set())
              }}
            >
              إلغاء
            </Button>
            <Button 
              onClick={(e) => {
                e.stopPropagation()
                handleCreateSale()
              }}
              disabled={creatingSale || !saleForm.reservation_amount}
            >
              {creatingSale ? 'جاري الإنشاء...' : 'إنشاء البيع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Offer Dialog for Reserved Sales */}
      <Dialog open={changeOfferDialogOpen} onOpenChange={setChangeOfferDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>تغيير عرض التقسيط</DialogTitle>
          </DialogHeader>
          {selectedSaleForOfferChange && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="font-medium text-sm">العميل: {selectedSaleForOfferChange.client?.name || 'غير محدد'}</p>
                <p className="text-xs text-muted-foreground">
                  CIN: {selectedSaleForOfferChange.client?.cin || '-'} | 
                  الهاتف: {selectedSaleForOfferChange.client?.phone || '-'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  عدد القطع: {selectedSaleForOfferChange.land_piece_ids?.length || 0} | 
                  السعر الإجمالي: {formatCurrency(selectedSaleForOfferChange.total_selling_price || 0)}
                </p>
              </div>

              {availableOffersForSale.length > 0 ? (
                <div className="space-y-2">
                  <Label>اختر العرض الجديد</Label>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2 max-h-96 overflow-y-auto">
                    {availableOffersForSale.map((offer) => {
                      const isSelected = selectedNewOffer?.id === offer.id
                      
                      return (
                        <div
                          key={offer.id}
                          onClick={() => setSelectedNewOffer(offer)}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-green-100 border-green-500 ring-2 ring-green-500'
                              : 'bg-white border-green-200 hover:bg-green-50'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {offer.is_default && (
                                  <Badge variant="default" className="text-xs">افتراضي</Badge>
                                )}
                                {offer.offer_name && (
                                  <span className="font-medium text-sm">{offer.offer_name}</span>
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                {offer.price_per_m2_installment && (
                                  <div>سعر المتر المربع: {offer.price_per_m2_installment} DT</div>
                                )}
                                <div>عمولة الشركة: {offer.company_fee_percentage}%</div>
                                <div>
                                  التسبقة: {offer.advance_is_percentage 
                                    ? `${offer.advance_amount}%`
                                    : formatCurrency(offer.advance_amount)}
                                </div>
                                <div>المبلغ الشهري: {formatCurrency(offer.monthly_payment)}</div>
                              </div>
                            </div>
                            <div className="ml-2">
                              <input
                                type="radio"
                                checked={isSelected}
                                onChange={() => setSelectedNewOffer(offer)}
                                className="h-4 w-4 text-green-600"
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    سيتم إعادة حساب الأقساط بناءً على العرض الجديد
                  </p>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                  <p className="text-sm text-yellow-800">لا توجد عروض متاحة لهذه القطع</p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setChangeOfferDialogOpen(false)
                  setSelectedSaleForOfferChange(null)
                  setSelectedNewOffer(null)
                  setAvailableOffersForSale([])
                }}>
                  إلغاء
                </Button>
                <Button 
                  onClick={handleChangeOffer}
                  disabled={changingOffer || !selectedNewOffer}
                >
                  {changingOffer ? 'جاري التحديث...' : 'تحديث العرض'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Floating Sell Button for Mobile and Desktop - Red for multiple sales */}
      {selectedPieces.size > 0 && hasPermission('create_sales') && !clientDialogOpen && !saleDialogOpen && (
        <>
          {/* Mobile: Full width button */}
          <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-white/95 backdrop-blur-sm border-t shadow-2xl md:hidden">
            <Button 
              onClick={() => setClientDialogOpen(true)} 
              size="lg"
              className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 h-12 text-base font-semibold shadow-lg transition-all"
            >
              <ShoppingCart className="ml-2 h-5 w-5" />
              بيع ({selectedPieces.size} {selectedPieces.size === 1 ? 'قطعة' : 'قطعة'})
            </Button>
          </div>
          
          {/* Desktop: Compact floating button */}
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 hidden md:block">
            <Button 
              onClick={() => setClientDialogOpen(true)} 
              size="lg"
              className="bg-red-600 hover:bg-red-700 active:bg-red-800 h-12 px-8 text-base font-semibold shadow-xl rounded-full transition-all hover:shadow-2xl min-w-[180px]"
            >
              <ShoppingCart className="ml-2 h-5 w-5" />
              بيع ({selectedPieces.size})
            </Button>
          </div>
        </>
      )}

      {/* Unified Offer Dialog */}
      <Dialog open={offerDialogOpen} onOpenChange={setOfferDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingOffer ? 'تعديل العرض' : 'إضافة عرض جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="offer_name">اسم العرض (اختياري)</Label>
              <Input
                id="offer_name"
                value={offerForm.offer_name}
                onChange={(e) => setOfferForm({ ...offerForm, offer_name: e.target.value })}
                placeholder="مثال: عرض خاص، عرض تقسيط طويل..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer_price_per_m2_installment">سعر المتر المربع (بالتقسيط) *</Label>
              <Input
                id="offer_price_per_m2_installment"
                type="number"
                step="0.01"
                value={offerForm.price_per_m2_installment}
                onChange={(e) => setOfferForm({ ...offerForm, price_per_m2_installment: e.target.value })}
                placeholder="110.00"
              />
              <p className="text-xs text-muted-foreground">سيتم تطبيق هذا السعر على القطع الجديدة فقط. القطع الموجودة والمبيعات السابقة لن تتأثر.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="offer_company_fee_percentage">عمولة الشركة (%)</Label>
                <Input
                  id="offer_company_fee_percentage"
                  type="number"
                  step="0.01"
                  value={offerForm.company_fee_percentage}
                  onChange={(e) => setOfferForm({ ...offerForm, company_fee_percentage: e.target.value })}
                  placeholder="2.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer_advance_amount">التسبقة *</Label>
                <Input
                  id="offer_advance_amount"
                  type="number"
                  step="0.01"
                  value={offerForm.advance_amount}
                  onChange={(e) => setOfferForm({ ...offerForm, advance_amount: e.target.value })}
                  placeholder={offerForm.advance_is_percentage ? "10.00" : "0.00"}
                />
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="checkbox"
                    id="offer_advance_is_percentage"
                    checked={offerForm.advance_is_percentage}
                    onChange={(e) => {
                      const isPercentage = e.target.checked
                      // Clear advance_amount when toggling percentage checkbox
                      setOfferForm({ ...offerForm, advance_is_percentage: isPercentage, advance_amount: '' })
                    }}
                    className="h-4 w-4 rounded cursor-pointer touch-manipulation"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  />
                  <Label htmlFor="offer_advance_is_percentage" className="text-xs cursor-pointer touch-manipulation" style={{ WebkitTapHighlightColor: 'transparent' }}>نسبة مئوية</Label>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>اختر طريقة الحساب *</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="calculation_method"
                      value="monthly"
                      checked={offerForm.calculation_method === 'monthly'}
                      onChange={(e) => {
                        setOfferForm({ 
                          ...offerForm, 
                          calculation_method: 'monthly',
                          number_of_months: '' // Clear months when switching to monthly
                        })
                      }}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">المبلغ الشهري</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="calculation_method"
                      value="months"
                      checked={offerForm.calculation_method === 'months'}
                      onChange={(e) => {
                        setOfferForm({ 
                          ...offerForm, 
                          calculation_method: 'months',
                          monthly_payment: '' // Clear monthly when switching to months
                        })
                      }}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">عدد الأشهر</span>
                  </label>
                </div>
              </div>
              
              {offerForm.calculation_method === 'monthly' ? (
                <div className="space-y-2">
                  <Label htmlFor="offer_monthly_payment">المبلغ الشهري *</Label>
                  <Input
                    id="offer_monthly_payment"
                    type="number"
                    step="0.01"
                    value={offerForm.monthly_payment}
                    onChange={(e) => {
                      const monthlyValue = e.target.value
                      // Just save the value, calculation will happen later when pieces are selected
                      setOfferForm({ ...offerForm, monthly_payment: monthlyValue, number_of_months: '' })
                    }}
                    placeholder="0.00"
                    min="0.01"
                  />
                  <p className="text-xs text-muted-foreground">
                    سيتم حساب عدد الأشهر تلقائياً عند اختيار هذا العرض في البيع بناءً على القطع المختارة
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="offer_number_of_months">عدد الأشهر *</Label>
                  <Input
                    id="offer_number_of_months"
                    type="number"
                    step="1"
                    value={offerForm.number_of_months}
                    onChange={(e) => {
                      const monthsValue = e.target.value
                      // Just save the value, calculation will happen later when pieces are selected
                      setOfferForm({ ...offerForm, number_of_months: monthsValue, monthly_payment: '' })
                    }}
                    placeholder="12"
                    min="1"
                  />
                  <p className="text-xs text-muted-foreground">
                    سيتم حساب المبلغ الشهري تلقائياً عند اختيار هذا العرض في البيع بناءً على القطع المختارة
                  </p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              اختر إما "المبلغ الشهري" أو "عدد الأشهر". سيتم حساب الآخر تلقائياً عند اختيار هذا العرض في البيع بناءً على القطع المختارة والمبلغ المتبقي بعد التسبقة
            </p>
            <div className="space-y-2">
              <Label htmlFor="offer_notes">ملاحظات (اختياري)</Label>
              <Textarea
                id="offer_notes"
                value={offerForm.notes}
                onChange={(e) => setOfferForm({ ...offerForm, notes: e.target.value })}
                placeholder="ملاحظات إضافية..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setOfferDialogOpen(false)
              setEditingOffer(null)
              setOfferForm({
                price_per_m2_installment: '',
                company_fee_percentage: '',
                advance_amount: '',
                advance_is_percentage: false,
                monthly_payment: '',
                number_of_months: '',
                calculation_method: 'monthly',
                offer_name: '',
                notes: '',
                is_default: false,
              })
            }}>
              إلغاء
            </Button>
            <Button onClick={isBatchOffer ? saveBatchOffer : savePieceOffer} disabled={!offerForm.price_per_m2_installment || (offerForm.calculation_method === 'monthly' && !offerForm.monthly_payment) || (offerForm.calculation_method === 'months' && !offerForm.number_of_months)}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale Details Dialog */}
      <Dialog open={saleDetailsDialogOpen} onOpenChange={setSaleDetailsDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              تفاصيل البيع - قطعة #{saleDetailsPiece?.piece_number}
            </DialogTitle>
          </DialogHeader>
          
          {loadingSaleDetails ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
            </div>
          ) : saleDetailsData ? (
            <div className="space-y-4">
              {/* Client Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  معلومات العميل
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">الاسم:</span>
                    <p className="font-medium">{saleDetailsData.client?.name || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">رقم الهوية:</span>
                    <p className="font-medium">{saleDetailsData.client?.cin || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">الهاتف:</span>
                    <p className="font-medium">{saleDetailsData.client?.phone || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">نوع العميل:</span>
                    <p className="font-medium">{saleDetailsData.client?.client_type === 'Individual' ? 'فردي' : 'شركة'}</p>
                  </div>
                </div>
              </div>

              {/* Sale Info */}
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <h4 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4" />
                  معلومات البيع
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">نوع الدفع:</span>
                    <p className="font-medium">
                      {saleDetailsData.payment_type === 'Full' ? 'بالحاضر' : 
                       saleDetailsData.payment_type === 'Installment' ? 'بالتقسيط' : 
                       saleDetailsData.payment_type === 'PromiseOfSale' ? 'وعد بالبيع' : saleDetailsData.payment_type}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">الحالة:</span>
                    <p className="font-medium">
                      {saleDetailsData.status === 'Pending' ? 'محجوز' :
                       saleDetailsData.status === 'Completed' ? 'مباع' :
                       saleDetailsData.status === 'Cancelled' ? 'ملغي' : saleDetailsData.status}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">تاريخ البيع:</span>
                    <p className="font-medium">{saleDetailsData.sale_date ? formatDate(saleDetailsData.sale_date) : '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">آخر أجل:</span>
                    <p className="font-medium">{saleDetailsData.deadline_date ? formatDate(saleDetailsData.deadline_date) : '-'}</p>
                  </div>
                </div>
              </div>

              {/* Financial Info */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  المعلومات المالية
                </h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">سعر البيع:</span>
                    <p className="font-medium text-green-600">{formatCurrency(saleDetailsData.total_selling_price || 0)}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">العربون:</span>
                    <p className="font-medium">{formatCurrency(saleDetailsData.small_advance_amount || 0)}</p>
                  </div>
                  {saleDetailsData.payment_type === 'Installment' && (
                    <>
                      <div>
                        <span className="text-gray-500">التسبقة:</span>
                        <p className="font-medium">{formatCurrency(saleDetailsData.big_advance_amount || 0)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">عدد الأقساط:</span>
                        <p className="font-medium">{saleDetailsData.number_of_installments || '-'}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">القسط الشهري:</span>
                        <p className="font-medium">{formatCurrency(saleDetailsData.monthly_installment_amount || 0)}</p>
                      </div>
                    </>
                  )}
                  {saleDetailsData.payment_type === 'PromiseOfSale' && (
                    <>
                      <div>
                        <span className="text-gray-500">المبلغ المستلم:</span>
                        <p className="font-medium">{formatCurrency(saleDetailsData.promise_initial_payment || 0)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">حالة الاستكمال:</span>
                        <p className="font-medium">{saleDetailsData.promise_completed ? 'مكتمل' : 'قيد الانتظار'}</p>
                      </div>
                    </>
                  )}
                  {saleDetailsData.company_fee_percentage && (
                    <div>
                      <span className="text-gray-500">عمولة الشركة:</span>
                      <p className="font-medium">{saleDetailsData.company_fee_percentage}% ({formatCurrency(saleDetailsData.company_fee_amount || 0)})</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Notes */}
              {saleDetailsData.notes && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">ملاحظات</h4>
                  <p className="text-sm text-gray-600">{saleDetailsData.notes}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              لا توجد معلومات بيع لهذه القطعة
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaleDetailsDialogOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default LandManagement
