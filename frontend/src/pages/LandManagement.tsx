import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
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
import { sanitizeText, sanitizeNotes } from '@/lib/sanitize'
import { debounce } from '@/lib/throttle'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Plus, Edit, Trash2, Map, ChevronDown, ChevronRight, Calculator, X, DollarSign, AlertTriangle, ShoppingCart } from 'lucide-react'
import type { LandBatch, LandPiece, LandStatus } from '@/types/database'

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

export function LandManagement() {
  const { hasPermission, user } = useAuth()
  const navigate = useNavigate()
  const [batches, setBatches] = useState<LandBatchWithPieces[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [batchToDelete, setBatchToDelete] = useState<string | null>(null)
  
  // Debounced search
  const debouncedSearchFn = useCallback(
    debounce((value: string) => setDebouncedSearchTerm(value), 300),
    []
  )

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
  })
  
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
  const [editingPiece, setEditingPiece] = useState<LandPiece | null>(null)
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [selectedBatchForPiece, setSelectedBatchForPiece] = useState<LandBatch | null>(null)
  const [pieceForm, setPieceForm] = useState({
    piece_number: '', // Just a number (1, 2, 99, etc.)
    surface_area: '', // Optional - will use default if empty
    selling_price_full: '',
    selling_price_installment: '',
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
  
  // Bulk price update dialog
  const [bulkPriceDialogOpen, setBulkPriceDialogOpen] = useState(false)
  const [bulkPriceBatch, setBulkPriceBatch] = useState<LandBatchWithPieces | null>(null)
  const [bulkPriceForm, setBulkPriceForm] = useState({
    price_per_m2_full: '',
    price_per_m2_installment: '',
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
        .select('*, land_pieces(*)')
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
      const batchesData = (data as LandBatchWithPieces[]) || []
      setBatches(batchesData)
      
      // Update selectedBatchForPiece if it's still selected
      if (selectedBatchId) {
        const updatedBatch = batchesData.find(b => b.id === selectedBatchId)
        if (updatedBatch) {
          setSelectedBatchForPiece(updatedBatch)
        }
      }
    } catch (err) {
      setError('خطأ في تحميل الدفعات')
    } finally {
      setLoading(false)
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

  const openBatchDialog = (batch?: LandBatch) => {
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
      })
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
      })
      setGenerationMode('none')
      setUniformSize('400')
      setCustomConfigs([
        { count: 50, surface: 900 },
        { count: 20, surface: 200 },
      ])
      setRestPieceSize('400')
      setFlexiblePieces([])
    }
    setBatchDialogOpen(true)
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

      setBatchDialogOpen(false)
      
      // If we just created/updated a batch and it's selected, refresh it immediately
      if (editingBatch && selectedBatchForPiece && editingBatch.id === selectedBatchForPiece.id) {
        // Refresh batches to get updated price data
        await fetchBatches()
      } else {
      fetchBatches()
      }
      
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

  const openPieceDialog = (batchId: string, piece?: LandPiece) => {
    setSelectedBatchId(batchId)
    // Find the batch for auto-calculation
    const batch = batches.find(b => b.id === batchId)
    setSelectedBatchForPiece(batch || null)
    
    if (piece) {
      setEditingPiece(piece)
      // Keep the full alphanumeric piece number (B1, R1, P001, etc.)
      const pieceNumber = piece.piece_number || ''
      setPieceForm({
        piece_number: pieceNumber,
        surface_area: piece.surface_area.toString(),
        selling_price_full: piece.selling_price_full?.toString() || '',
        selling_price_installment: piece.selling_price_installment?.toString() || '',
        notes: piece.notes || '',
      })
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
          const lastPiece = sortedPieces[sortedPieces.length - 1]
          
          // Check if last piece uses alphanumeric pattern (e.g., B0, B1, R1, P001)
          const alphanumericMatch = lastPiece.match(/^([A-Za-z\u0600-\u06FF]+)(\d+)$/i)
          
          if (alphanumericMatch) {
            // Extract prefix and number
            const prefix = alphanumericMatch[1]
            const lastNumber = parseInt(alphanumericMatch[2], 10)
            const numDigits = alphanumericMatch[2].length
            // Increment and preserve padding if original had padding
            const nextNumber = lastNumber + 1
            if (numDigits > 1 && lastNumber.toString().length < numDigits) {
              // Preserve zero padding
              nextPieceNumber = `${prefix}${String(nextNumber).padStart(numDigits, '0')}`
            } else {
              nextPieceNumber = `${prefix}${nextNumber}`
            }
          } else {
            // Check if it's just a number
            const numberMatch = lastPiece.match(/^(\d+)$/)
            if (numberMatch) {
              const lastNumber = parseInt(numberMatch[1], 10)
              nextPieceNumber = (lastNumber + 1).toString()
            } else {
              // Default: use count + 1
              nextPieceNumber = (sortedPieces.length + 1).toString()
            }
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
        notes: '',
      })
    }
    setPieceDialogOpen(true)
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
      const pieceData = {
        land_batch_id: selectedBatchId,
        piece_number: pieceNumber,
        surface_area: surfaceArea,
        purchase_cost: 0, // Purchase cost removed - always 0
        selling_price_full: sellingPriceFull,
        selling_price_installment: sellingPriceInstallment,
        notes: pieceForm.notes ? sanitizeNotes(pieceForm.notes) : null,
      }

      if (editingPiece) {
        const { error } = await supabase
          .from('land_pieces')
          .update(pieceData)
          .eq('id', editingPiece.id)
        if (error) {
          console.error('Error updating piece:', error)
          throw error
        }
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
        notes: '',
      })
      setEditingPiece(null)
      
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

  // Filter batches by search term (name, location) and filter pieces within each batch
  const filteredBatches = batches
    .filter((batch) => {
      // Filter batches by name or location
      if (debouncedSearchTerm) {
        const search = debouncedSearchTerm.toLowerCase()
        const matchesName = batch.name.toLowerCase().includes(search)
        const matchesLocation = batch.location?.toLowerCase().includes(search) || false
        if (!matchesName && !matchesLocation) {
          return false // Hide batch if it doesn't match search
        }
      }
      return true
    })
    .map((batch) => ({
    ...batch,
      land_pieces: (Array.isArray(batch.land_pieces) ? batch.land_pieces : []).filter((piece) => {
        const matchesStatus = filterStatus === 'all' || filterStatus === '' || piece.status === filterStatus
      const matchesSearch =
        debouncedSearchTerm === '' ||
        piece.piece_number.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
      return matchesStatus && matchesSearch
    }),
  }))

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
    <div className="space-y-3 sm:space-y-4">
      {/* Compact Header with inline filters */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold">الأراضي</h1>
        {hasPermission('edit_land') && (
            <Button onClick={() => openBatchDialog()} size="sm">
              <Plus className="ml-1 h-4 w-4" />
              إضافة
          </Button>
        )}
      </div>

        {/* Inline Filters - Compact */}
        <div className="flex flex-col sm:flex-row gap-2">
              <Input
            placeholder="بحث..."
                value={searchTerm}
                maxLength={50}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  debouncedSearchFn(e.target.value)
                }}
            className="flex-1 h-9 text-sm"
              />
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full sm:w-32 h-9 text-sm"
            >
              <option value="Available">متاح</option>
              <option value="Reserved">محجوز</option>
              <option value="Sold">مباع</option>
              <option value="Cancelled">ملغي</option>
            </Select>
          </div>
      </div>

      {/* Batches - Compact Design */}
      {filteredBatches.map((batch) => {
        const availableCount = batch.land_pieces.filter(p => p.status === 'Available').length
        const soldCount = batch.land_pieces.filter(p => p.status === 'Sold').length
        const reservedCount = batch.land_pieces.filter(p => p.status === 'Reserved').length
        
        return (
          <Card key={batch.id} className="border-gray-200">
            {/* Batch Header - Compact */}
            <div 
              className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
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
                {/* Add Piece Button */}
                {hasPermission('edit_land') && (
                  <div className="p-2 bg-gray-50 border-b">
                    <Button variant="outline" size="sm" onClick={() => openPieceDialog(batch.id)} className="w-full h-8 text-xs">
                      <Plus className="ml-1 h-3.5 w-3.5" />
                    إضافة قطعة
                  </Button>
              </div>
                )}

              {(!batch.land_pieces || batch.land_pieces.length === 0) ? (
                  <p className="text-center text-muted-foreground py-4 text-sm">لا توجد قطع</p>
              ) : (
                  <>
                    {/* Mobile: Compact Grid */}
                    <div className="grid grid-cols-2 gap-2 p-2 md:hidden">
                      {batch.land_pieces.map((piece) => (
                        <div 
                          key={piece.id} 
                          className={`p-2 rounded-lg border text-xs ${
                            piece.status === 'Available' ? 'bg-green-50 border-green-200' :
                            piece.status === 'Reserved' ? 'bg-orange-50 border-orange-200' :
                            piece.status === 'Sold' ? 'bg-gray-100 border-gray-200' : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold">{piece.piece_number}</span>
                            <Badge variant={statusColors[piece.status]} className="text-xs px-1.5 py-0">
                              {piece.status === 'Available' ? 'متاح' :
                               piece.status === 'Reserved' ? 'محجوز' :
                               piece.status === 'Sold' ? 'مباع' : 'ملغي'}
                            </Badge>
                          </div>
                          <div className="text-muted-foreground">{piece.surface_area} م²</div>
                          <div className="font-semibold text-green-600 mt-1">{formatCurrency(piece.selling_price_full || 0)}</div>
                          
                          {/* Sell Button for Available */}
                          {piece.status === 'Available' && hasPermission('create_sales') && (
                            <Button
                              size="sm"
                              onClick={() => navigate(`/sales?piece=${piece.id}`)}
                              className="w-full mt-2 h-7 text-xs bg-green-600 hover:bg-green-700"
                            >
                              <ShoppingCart className="h-3 w-3 ml-1" />
                              بيع
                            </Button>
                          )}
                          
                          {/* Edit buttons */}
                          {hasPermission('edit_land') && (
                            <div className="flex gap-1 mt-1">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openPieceDialog(batch.id, piece)}
                                className="flex-1 h-6 text-xs"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              {user?.role === 'Owner' && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openPriceEditDialog(batch.id, piece)}
                                  className="h-6 text-xs text-blue-600"
                                >
                                  <DollarSign className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Desktop: Compact Table */}
                    <div className="hidden md:block">
                      <Table>
                    <TableHeader>
                          <TableRow className="text-xs">
                            <TableHead className="py-2">قطعة</TableHead>
                            <TableHead className="py-2">م²</TableHead>
                            <TableHead className="py-2">كامل</TableHead>
                            <TableHead className="py-2">أقساط</TableHead>
                            <TableHead className="py-2">الحالة</TableHead>
                            <TableHead className="py-2">إجراءات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batch.land_pieces.map((piece) => (
                            <TableRow key={piece.id} className="text-sm">
                              <TableCell className="py-2 font-medium">{piece.piece_number}</TableCell>
                              <TableCell className="py-2">{piece.surface_area}</TableCell>
                              <TableCell className="py-2 text-green-600 font-medium">{formatCurrency(piece.selling_price_full || 0)}</TableCell>
                              <TableCell className="py-2 text-blue-600">{formatCurrency(piece.selling_price_installment || 0)}</TableCell>
                              <TableCell className="py-2">
                                <Badge variant={statusColors[piece.status]} className="text-xs">
                              {piece.status === 'Available' ? 'متاح' :
                               piece.status === 'Reserved' ? 'محجوز' :
                               piece.status === 'Sold' ? 'مباع' : 'ملغي'}
                            </Badge>
                          </TableCell>
                              <TableCell className="py-2">
                                <div className="flex items-center gap-0.5">
                                  {piece.status === 'Available' && hasPermission('create_sales') && (
                                    <Button
                                      size="sm"
                                      onClick={() => navigate(`/sales?piece=${piece.id}`)}
                                      className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                    >
                                      <ShoppingCart className="h-3 w-3 ml-1" />
                                      بيع
                                    </Button>
                                  )}
                          {hasPermission('edit_land') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openPieceDialog(batch.id, piece)}
                                      className="h-7 w-7"
                              >
                                      <Edit className="h-3.5 w-3.5" />
                              </Button>
                                  )}
                                {user?.role === 'Owner' && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openPriceEditDialog(batch.id, piece)}
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
            
            {/* Price per m² fields */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-4">
              <p className="text-sm font-medium text-blue-800">أسعار البيع لكل متر مربع</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price_per_m2_installment">سعر المتر المربع (بالتقسيط) *</Label>
                  <Input
                    id="price_per_m2_installment"
                    type="number"
                    step="0.01"
                    value={batchForm.price_per_m2_installment}
                    onChange={(e) => setBatchForm({ ...batchForm, price_per_m2_installment: e.target.value })}
                    placeholder="12.00"
                  />
                  <p className="text-xs text-muted-foreground">سيتم تطبيق هذا السعر على القطع الجديدة فقط. القطع الموجودة والمبيعات السابقة لن تتأثر.</p>
                </div>
              </div>
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
            
            {/* Price fields - show when editing or allow manual entry */}
            {editingPiece ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                  <Label htmlFor="selling_price_full">السعر (كامل) *</Label>
                <Input
                  id="selling_price_full"
                  type="number"
                    step="0.01"
                  value={pieceForm.selling_price_full}
                  onChange={(e) => setPieceForm({ ...pieceForm, selling_price_full: e.target.value })}
                    placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                  <Label htmlFor="selling_price_installment">السعر (بالتقسيط) *</Label>
                <Input
                  id="selling_price_installment"
                  type="number"
                    step="0.01"
                  value={pieceForm.selling_price_installment}
                  onChange={(e) => setPieceForm({ ...pieceForm, selling_price_installment: e.target.value })}
                    placeholder="0.00"
                />
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
                          <span className="text-muted-foreground">السعر (كامل):</span>
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
                <p>السعر الحالي للكامل: {formatCurrency(editingPricePiece.selling_price_full)}</p>
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
    </div>
  )
}
