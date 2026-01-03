import { useEffect, useState, useMemo, useCallback } from 'react'
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
import { Plus, Edit, Trash2, Map, ChevronDown, ChevronRight, Calculator, X } from 'lucide-react'
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
  const { hasPermission } = useAuth()
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
    piece_number: '',
    surface_area: '',
    purchase_cost: '',
    selling_price_full: '',
    selling_price_installment: '',
    notes: '',
  })

  // Auto-calculate purchase cost when surface area changes
  const calculatePurchaseCost = (surfaceArea: string) => {
    if (!selectedBatchForPiece || !surfaceArea) return ''
    const surface = parseFloat(surfaceArea)
    if (isNaN(surface) || surface <= 0) return ''
    const ratio = surface / selectedBatchForPiece.total_surface
    const cost = ratio * selectedBatchForPiece.total_cost
    return Math.round(cost * 100) / 100
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
      setBatches((data as LandBatchWithPieces[]) || [])
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
        total_surface: batch.total_surface.toString(),
        total_cost: batch.total_cost.toString(),
        date_acquired: batch.date_acquired,
        notes: batch.notes || '',
        real_estate_tax_number: (batch as any).real_estate_tax_number || '',
        price_per_m2_full: '',
        price_per_m2_installment: '',
      })
      setGenerationMode('none') // Can't generate pieces when editing
    } else {
      setEditingBatch(null)
      setBatchForm({
        name: '',
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
    
    // Validate required fields based on generation mode
    // Only require total_surface and total_cost for non-flexible automatic generation
    // Flexible mode allows optional totals (will be calculated from pieces)
    if (generationMode !== 'none' && generationMode !== 'custom_flexible') {
      if (!batchForm.total_surface || !batchForm.total_cost) {
        setError('يرجى إدخال إجمالي المساحة والتكلفة عند استخدام تقسيم تلقائي')
        return
      }
    }
    
    // For manual mode (none) and flexible mode, totals are optional
    // They will be calculated from pieces if not provided
    
    setSavingBatch(true)
    setError(null)
    
    try {
      // Calculate total surface and cost if not provided (for manual addition mode)
      // If generationMode is 'none', allow empty values (will be calculated from pieces later)
      let totalSurface = parseFloat(batchForm.total_surface) || 0
      let totalCost = parseFloat(batchForm.total_cost) || 0
      
      // For manual mode, if totals are not provided, set to 0 (will be calculated from pieces)
      if (generationMode === 'none' && !batchForm.total_surface && !batchForm.total_cost) {
        totalSurface = 0
        totalCost = 0
      }
      
      // Sanitize inputs
      // Use today's date as default if date_acquired is not provided (since DB requires NOT NULL)
      const dateAcquired = batchForm.date_acquired || new Date().toISOString().split('T')[0]
      
      const batchData: any = {
        name: sanitizeText(batchForm.name),
        total_surface: totalSurface,
        total_cost: totalCost,
        date_acquired: dateAcquired,
        notes: batchForm.notes ? sanitizeNotes(batchForm.notes) : null,
      }
      
      // Add real estate tax number if provided
      if (batchForm.real_estate_tax_number) {
        batchData.real_estate_tax_number = sanitizeText(batchForm.real_estate_tax_number)
      }

      if (editingBatch) {
        const { error } = await supabase
          .from('land_batches')
          .update(batchData)
          .eq('id', editingBatch.id)
        if (error) throw error
      } else {
        // Create batch
        const { data: newBatch, error: batchError } = await supabase
          .from('land_batches')
          .insert([batchData])
          .select('*')
          .single()
        if (batchError) throw batchError

        // Generate pieces if mode is not 'none'
        if (generationMode !== 'none' && newBatch) {
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
                // Auto range
                const startNumber = (pieceConfig as any).startNumber || 1
                for (let i = 0; i < pieceConfig.count; i++) {
                  const currentNumber = startNumber + i
                  const purchaseCost = effectiveTotalSurface > 0 
                    ? (pieceConfig.surface / effectiveTotalSurface) * totalCost 
                    : 0
                  
                  // Format number (support P001, 001, or just number)
                  let formattedNumber = String(currentNumber)
                  if (startNumber.toString().includes('P') || startNumber.toString().startsWith('0')) {
                    formattedNumber = `P${String(currentNumber).padStart(3, '0')}`
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
      fetchBatches()
      setError(null)
    } catch (error: any) {
      console.error('Error saving batch:', error)
      if (error?.message) {
        setError('خطأ في حفظ الدفعة. يرجى المحاولة مرة أخرى.')
      } else if (error?.code) {
        setError('خطأ في حفظ الدفعة. يرجى المحاولة مرة أخرى.')
      } else {
        setError('خطأ في حفظ الدفعة')
      }
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

  const openPieceDialog = (batchId: string, piece?: LandPiece) => {
    setSelectedBatchId(batchId)
    // Find the batch for auto-calculation
    const batch = batches.find(b => b.id === batchId)
    setSelectedBatchForPiece(batch || null)
    
    if (piece) {
      setEditingPiece(piece)
      setPieceForm({
        piece_number: piece.piece_number,
        surface_area: piece.surface_area.toString(),
        purchase_cost: piece.purchase_cost.toString(),
        selling_price_full: piece.selling_price_full.toString(),
        selling_price_installment: piece.selling_price_installment.toString(),
        notes: piece.notes || '',
      })
    } else {
      setEditingPiece(null)
      // Get next piece number
      const existingPieces = batch?.land_pieces.length || 0
      setPieceForm({
        piece_number: `P${String(existingPieces + 1).padStart(3, '0')}`,
        surface_area: '',
        purchase_cost: '',
        selling_price_full: '',
        selling_price_installment: '',
        notes: '',
      })
    }
    setPieceDialogOpen(true)
  }

  // Handle surface area change and auto-calculate purchase cost
  const handleSurfaceAreaChange = (value: string) => {
    const calculatedCost = calculatePurchaseCost(value)
    setPieceForm({
      ...pieceForm,
      surface_area: value,
      purchase_cost: calculatedCost.toString(),
    })
  }

  const savePiece = async () => {
    // Authorization check
    if (!hasPermission('edit_land')) {
      setError('ليس لديك صلاحية لتعديل الأراضي')
      return
    }

    setError(null)
    try {
      // Sanitize inputs
      const pieceData = {
        land_batch_id: selectedBatchId,
        piece_number: sanitizeText(pieceForm.piece_number),
        surface_area: parseFloat(pieceForm.surface_area),
        purchase_cost: parseFloat(pieceForm.purchase_cost),
        selling_price_full: parseFloat(pieceForm.selling_price_full),
        selling_price_installment: parseFloat(pieceForm.selling_price_installment),
        notes: pieceForm.notes ? sanitizeNotes(pieceForm.notes) : null,
      }

      if (editingPiece) {
        const { error } = await supabase
          .from('land_pieces')
          .update(pieceData)
          .eq('id', editingPiece.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('land_pieces')
          .insert([{ ...pieceData, status: 'Available' }])
        if (error) throw error
      }

      setPieceDialogOpen(false)
      fetchBatches()
      setError(null)
    } catch (error) {
      setError('خطأ في حفظ القطعة')
    }
  }

  const filteredBatches = batches.map((batch) => ({
    ...batch,
    land_pieces: batch.land_pieces.filter((piece) => {
      const matchesStatus = filterStatus === 'all' || piece.status === filterStatus
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">إدارة الأراضي</h1>
          <p className="text-muted-foreground text-sm sm:text-base">إدارة دفعات الأراضي والقطع</p>
        </div>
        {hasPermission('edit_land') && (
          <Button onClick={() => openBatchDialog()} className="w-full sm:w-auto">
            <Plus className="ml-2 h-4 w-4" />
            إضافة دفعة
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 sm:pt-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
            <div className="flex-1 w-full">
              <Input
                placeholder="بحث برقم القطعة..."
                value={searchTerm}
                maxLength={50}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  debouncedSearchFn(e.target.value)
                }}
                className="w-full"
              />
            </div>
            <Select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full sm:w-auto"
            >
              <option value="all">جميع الحالات</option>
              <option value="Available">متاح</option>
              <option value="Reserved">محجوز</option>
              <option value="Sold">مباع</option>
              <option value="Cancelled">ملغي</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Batches */}
      {filteredBatches.map((batch) => (
        <Card key={batch.id}>
          <CardHeader className="cursor-pointer" onClick={() => toggleBatch(batch.id)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {expandedBatches.has(batch.id) ? (
                  <ChevronDown className="h-5 w-5" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
                <Map className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>{batch.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(batch.date_acquired)} • {batch.total_surface} م² •{' '}
                    {batch.land_pieces.length} قطعة
                    {(batch as any).real_estate_tax_number && (
                      <span> • الرسم العقاري: {(batch as any).real_estate_tax_number}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {hasPermission('edit_land') && (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => openBatchDialog(batch)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    {hasPermission('delete_land') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteBatch(batch.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardHeader>

          {expandedBatches.has(batch.id) && (
            <CardContent>
              <div className="flex justify-end mb-4">
                {hasPermission('edit_land') && (
                  <Button variant="outline" size="sm" onClick={() => openPieceDialog(batch.id)} className="w-full sm:w-auto">
                    <Plus className="ml-2 h-4 w-4" />
                    إضافة قطعة
                  </Button>
                )}
              </div>

              {batch.land_pieces.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">لا توجد قطع</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>رقم القطعة</TableHead>
                        <TableHead>المساحة</TableHead>
                        <TableHead>الحالة</TableHead>
                        {hasPermission('edit_land') && <TableHead>إجراء</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batch.land_pieces.map((piece) => (
                        <TableRow key={piece.id}>
                          <TableCell className="font-medium">{piece.piece_number}</TableCell>
                          <TableCell>{piece.surface_area} م²</TableCell>
                          <TableCell>
                            <Badge variant={statusColors[piece.status]}>
                              {piece.status === 'Available' ? 'متاح' :
                               piece.status === 'Reserved' ? 'محجوز' :
                               piece.status === 'Sold' ? 'مباع' : 'ملغي'}
                            </Badge>
                          </TableCell>
                          {hasPermission('edit_land') && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openPieceDialog(batch.id, piece)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      ))}

      {filteredBatches.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No land batches found
          </CardContent>
        </Card>
      )}

      {/* Batch Dialog */}
      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-full max-w-4xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBatch ? 'تعديل الدفعة' : 'إضافة دفعة أرض جديدة'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">اسم الدفعة *</Label>
                <Input
                  id="name"
                  value={batchForm.name}
                  maxLength={255}
                  onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })}
                  placeholder="مثال: دفعة تانيور"
                />
              </div>
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
                  <Label htmlFor="price_per_m2_full">سعر المتر المربع (دفع كامل) *</Label>
                  <Input
                    id="price_per_m2_full"
                    type="number"
                    step="0.01"
                    value={batchForm.price_per_m2_full}
                    onChange={(e) => setBatchForm({ ...batchForm, price_per_m2_full: e.target.value })}
                    placeholder="10.00"
                  />
                  <p className="text-xs text-muted-foreground">سيتم تطبيق هذا السعر على جميع القطع عند الإنشاء</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="price_per_m2_installment">سعر المتر المربع (أقساط) *</Label>
                  <Input
                    id="price_per_m2_installment"
                    type="number"
                    step="0.01"
                    value={batchForm.price_per_m2_installment}
                    onChange={(e) => setBatchForm({ ...batchForm, price_per_m2_installment: e.target.value })}
                    placeholder="12.00"
                  />
                  <p className="text-xs text-muted-foreground">سيتم تطبيق هذا السعر على جميع القطع عند الإنشاء</p>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="total_surface">إجمالي المساحة (م²) {(generationMode === 'none' || generationMode === 'custom_flexible') ? '(اختياري)' : '*'}</Label>
                <Input
                  id="total_surface"
                  type="number"
                  value={batchForm.total_surface}
                  onChange={(e) => setBatchForm({ ...batchForm, total_surface: e.target.value })}
                  placeholder={(generationMode === 'none' || generationMode === 'custom_flexible') ? "اختياري - سيتم حسابها تلقائياً" : "مثال: 50000"}
                />
                {(generationMode === 'none' || generationMode === 'custom_flexible') && (
                  <p className="text-xs text-muted-foreground">يمكنك تركها فارغة - سيتم حسابها من القطع المضافة</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="total_cost">إجمالي التكلفة (DT) {(generationMode === 'none' || generationMode === 'custom_flexible') ? '(اختياري)' : '*'}</Label>
                <Input
                  id="total_cost"
                  type="number"
                  value={batchForm.total_cost}
                  onChange={(e) => setBatchForm({ ...batchForm, total_cost: e.target.value })}
                  placeholder={(generationMode === 'none' || generationMode === 'custom_flexible') ? "اختياري - سيتم حسابها تلقائياً" : "مثال: 100000"}
                />
                {(generationMode === 'none' || generationMode === 'custom_flexible') && (
                  <p className="text-xs text-muted-foreground">يمكنك تركها فارغة - سيتم حسابها من القطع المضافة</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="date_acquired">تاريخ الشراء (اختياري)</Label>
              <Input
                id="date_acquired"
                type="date"
                value={batchForm.date_acquired}
                onChange={(e) => setBatchForm({ ...batchForm, date_acquired: e.target.value })}
              />
            </div>

            {/* Piece Generation Options - Only for new batches */}
            {!editingBatch && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
                <div className="flex items-center gap-2">
                  <Calculator className="h-5 w-5 text-primary" />
                  <Label className="text-base font-semibold">تقسيم الأرض تلقائياً</Label>
                </div>
                
                <Select
                  value={generationMode}
                  onChange={(e) => {
                    setGenerationMode(e.target.value as GenerationMode)
                    if (e.target.value === 'custom_flexible' && flexiblePieces.length === 0) {
                      // Initialize with one auto piece
                      addFlexiblePiece('auto')
                    }
                  }}
                  className="w-full"
                >
                  <option value="none">لا تقسم (إضافة يدوية لاحقاً)</option>
                  <option value="custom_flexible">مخصص مرن (تحكم كامل في الترقيم)</option>
                </Select>

                {generationMode === 'custom_flexible' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <Label className="text-sm font-medium">تكوينات القطع المرنة</Label>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addFlexiblePiece('auto')}
                        >
                          <Plus className="h-4 w-4 ml-1" />
                          نطاق تلقائي
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addFlexiblePiece('custom')}
                        >
                          <Plus className="h-4 w-4 ml-1" />
                          قطعة مخصصة
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addFlexiblePiece('uniform')}
                        >
                          <Plus className="h-4 w-4 ml-1" />
                          موحد (نفس الحجم)
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addFlexiblePiece('auto_smart')}
                        >
                          <Plus className="h-4 w-4 ml-1" />
                          تلقائي ذكي
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => addFlexiblePiece('smart')}
                        >
                          <Plus className="h-4 w-4 ml-1" />
                          محسّن
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {flexiblePieces.map((item, index) => (
                        <Card key={item.id} className="p-3">
                          <div className="flex items-start justify-between mb-2">
                            <Badge variant={item.type === 'auto' || item.type === 'uniform' ? 'default' : 'secondary'}>
                              {item.type === 'auto' ? 'نطاق تلقائي' : 
                               item.type === 'custom' ? 'مخصص' :
                               item.type === 'uniform' ? 'موحد' :
                               item.type === 'auto_smart' ? 'تلقائي ذكي' :
                               item.type === 'smart' ? 'محسّن' : 'متقدم'}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeFlexiblePiece(item.id)}
                              className="h-6 w-6"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          
                          {item.type === 'auto' || item.type === 'uniform' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">من رقم</Label>
                                <Input
                                  type="number"
                                  value={item.startNumber || ''}
                                  onChange={(e) => updateFlexiblePiece(item.id, { startNumber: parseInt(e.target.value) || 1 })}
                                  placeholder="1"
                                  className="w-full"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">العدد</Label>
                                <Input
                                  type="number"
                                  value={item.count || ''}
                                  onChange={(e) => updateFlexiblePiece(item.id, { count: parseInt(e.target.value) || 0 })}
                                  placeholder="10"
                                  className="w-full"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">الحجم (م²)</Label>
                                <Input
                                  type="number"
                                  value={item.surface || ''}
                                  onChange={(e) => updateFlexiblePiece(item.id, { surface: parseFloat(e.target.value) || 0 })}
                                  placeholder="400"
                                  className="w-full"
                                />
                              </div>
                            </div>
                          ) : item.type === 'custom' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">رقم القطعة</Label>
                                <Input
                                  type="text"
                                  value={item.pieceNumber || ''}
                                  onChange={(e) => updateFlexiblePiece(item.id, { pieceNumber: e.target.value })}
                                  placeholder="P001"
                                  className="w-full"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">الحجم (م²)</Label>
                                <Input
                                  type="number"
                                  value={item.customSurface || ''}
                                  onChange={(e) => updateFlexiblePiece(item.id, { customSurface: parseFloat(e.target.value) || 0 })}
                                  placeholder="400"
                                  className="w-full"
                                />
                              </div>
                            </div>
                          ) : item.type === 'auto_smart' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">الحد الأدنى (م²)</Label>
                                <Input
                                  type="number"
                                  value={item.minSize || autoMinSize}
                                  onChange={(e) => updateFlexiblePiece(item.id, { minSize: parseFloat(e.target.value) || 200 })}
                                  placeholder="200"
                                  className="w-full"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">الحجم المفضل (م²)</Label>
                                <Input
                                  type="number"
                                  value={item.preferredSize || autoPreferredSize}
                                  onChange={(e) => updateFlexiblePiece(item.id, { preferredSize: parseFloat(e.target.value) || 400 })}
                                  placeholder="400"
                                  className="w-full"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">الحد الأقصى (م²)</Label>
                                <Input
                                  type="number"
                                  value={item.maxSize || autoMaxSize}
                                  onChange={(e) => updateFlexiblePiece(item.id, { maxSize: parseFloat(e.target.value) || 600 })}
                                  placeholder="600"
                                  className="w-full"
                                />
                              </div>
                            </div>
                          ) : item.type === 'smart' ? (
                            <div className="space-y-2">
                              <Label className="text-xs">استراتيجية التحسين</Label>
                              <Select
                                value={item.optimization || smartOptimization}
                                onChange={(e) => updateFlexiblePiece(item.id, { optimization: e.target.value as any })}
                                className="w-full"
                              >
                                <option value="balanced">متوازن (مزيج من الأحجام)</option>
                                <option value="max_pieces">تعظيم عدد القطع (قطع أصغر)</option>
                                <option value="min_waste">تقليل الهدر (قطع أكبر، ملء دقيق)</option>
                              </Select>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">نوع غير مدعوم</p>
                          )}
                          
                          {item.type === 'auto' && item.startNumber !== undefined && item.count !== undefined && (
                            <p className="text-xs text-muted-foreground mt-2">
                              سيتم إنشاء القطع من #{item.startNumber} إلى #{item.startNumber + (item.count || 0) - 1}
                            </p>
                          )}
                        </Card>
                      ))}
                    </div>
                    
                    {flexiblePieces.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        اضغط على "نطاق تلقائي" أو "قطعة مخصصة" لإضافة قطع
                      </p>
                    )}
                  </div>
                )}
                
                {generationMode === 'auto' && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      الوضع التلقائي: يقوم بتقسيم الأرض تلقائياً بأحجام متغيرة بين الحد الأدنى والأقصى مع تفضيل الحجم المفضل
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <Label className="text-xs">الحد الأدنى (م²)</Label>
                        <Input
                          type="number"
                          value={autoMinSize}
                          onChange={(e) => setAutoMinSize(e.target.value)}
                          placeholder="200"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">الحجم المفضل (م²)</Label>
                        <Input
                          type="number"
                          value={autoPreferredSize}
                          onChange={(e) => setAutoPreferredSize(e.target.value)}
                          placeholder="400"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">الحد الأقصى (م²)</Label>
                        <Input
                          type="number"
                          value={autoMaxSize}
                          onChange={(e) => setAutoMaxSize(e.target.value)}
                          placeholder="600"
                        />
                      </div>
                    </div>
                  </div>
                )}
                
                {generationMode === 'smart' && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      الوضع الذكي: يحسّن التقسيم حسب الاستراتيجية المختارة
                    </p>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">استراتيجية التحسين</Label>
                      <Select
                        value={smartOptimization}
                        onChange={(e) => setSmartOptimization(e.target.value as any)}
                        className="w-full"
                      >
                        <option value="balanced">متوازن (مزيج من الأحجام)</option>
                        <option value="max_pieces">تعظيم عدد القطع (قطع أصغر)</option>
                        <option value="min_waste">تقليل الهدر (قطع أكبر، ملء دقيق)</option>
                      </Select>
                    </div>
                  </div>
                )}
                
                {generationMode === 'advanced' && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      الوضع المتقدم: نمط مخصص معقد بصيغة JSON
                    </p>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">النمط (JSON)</Label>
                      <Textarea
                        value={advancedPattern}
                        onChange={(e) => setAdvancedPattern(e.target.value)}
                        placeholder='[{"count": 10, "surface": 500}, {"count": 20, "surface": 300}]'
                        className="font-mono text-xs"
                        rows={4}
                      />
                      <p className="text-xs text-muted-foreground">
                        مثال: [&#123;"count": 10, "surface": 500&#125;, &#123;"count": 20, "surface": 300&#125;]
                      </p>
                    </div>
                  </div>
                )}

                {/* Preview */}
                {generationMode !== 'none' && piecesPreview.count > 0 && (
                  <div className="bg-background rounded-md p-3 space-y-2">
                    <p className="font-medium text-sm">معاينة:</p>
                    {piecesPreview.pieces.map((p, i) => {
                      const pieceInfo = p as any
                      if (generationMode === 'custom_flexible') {
                        if (pieceInfo.pieceNumbers) {
                          return (
                            <p key={i} className="text-sm text-muted-foreground">
                              • قطعة #{pieceInfo.pieceNumbers[0]}: {p.surface} م² = {formatCurrency(p.cost)} تكلفة شراء
                            </p>
                          )
                        } else if (pieceInfo.startNumber !== undefined) {
                          const endNumber = pieceInfo.startNumber + p.count - 1
                          return (
                            <p key={i} className="text-sm text-muted-foreground">
                              • {p.count} قطعة (#{pieceInfo.startNumber} - #{endNumber}) × {p.surface} م² = {formatCurrency(p.cost)} تكلفة شراء لكل قطعة
                            </p>
                          )
                        }
                      }
                      return (
                        <p key={i} className="text-sm text-muted-foreground">
                          • {p.count} قطعة × {p.surface} م² = {formatCurrency(p.cost)} تكلفة شراء لكل قطعة
                        </p>
                      )
                    })}
                    <p className="text-sm font-medium pt-2 border-t">
                      الإجمالي: {piecesPreview.count} قطعة ({piecesPreview.totalUsed} م² مستخدم)
                    </p>
                    {parseFloat(batchForm.total_surface) - piecesPreview.totalUsed > 0 && (
                      <p className="text-xs text-yellow-600">
                        ⚠ {(parseFloat(batchForm.total_surface) - piecesPreview.totalUsed).toFixed(0)} م² غير مستخدم
                      </p>
                    )}
                    {parseFloat(batchForm.total_surface) - piecesPreview.totalUsed < 0 && (
                      <p className="text-xs text-red-600">
                        ⚠ المساحة المطلوبة تتجاوز المساحة الإجمالية!
                      </p>
                    )}
                  </div>
                )}
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
                value={pieceForm.piece_number}
                maxLength={50}
                onChange={(e) => setPieceForm({ ...pieceForm, piece_number: e.target.value })}
                placeholder="مثال: P001"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="surface_area">المساحة (م²) *</Label>
                <Input
                  id="surface_area"
                  type="number"
                  value={pieceForm.surface_area}
                  onChange={(e) => handleSurfaceAreaChange(e.target.value)}
                  placeholder="400"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchase_cost">
                  تكلفة الشراء
                  {selectedBatchForPiece && (
                    <span className="text-xs text-muted-foreground mr-1">(محسوبة تلقائياً)</span>
                  )}
                </Label>
                <Input
                  id="purchase_cost"
                  type="number"
                  value={pieceForm.purchase_cost}
                  onChange={(e) => setPieceForm({ ...pieceForm, purchase_cost: e.target.value })}
                  className={selectedBatchForPiece ? 'bg-muted/50' : ''}
                  placeholder="0"
                />
                {selectedBatchForPiece && pieceForm.surface_area && (
                  <p className="text-xs text-muted-foreground">
                    بناءً على {pieceForm.surface_area}م² / {selectedBatchForPiece.total_surface}م² × {formatCurrency(selectedBatchForPiece.total_cost)}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="selling_price_full">السعر (دفع كامل)</Label>
                <Input
                  id="selling_price_full"
                  type="number"
                  value={pieceForm.selling_price_full}
                  onChange={(e) => setPieceForm({ ...pieceForm, selling_price_full: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="selling_price_installment">السعر (أقساط)</Label>
                <Input
                  id="selling_price_installment"
                  type="number"
                  value={pieceForm.selling_price_installment}
                  onChange={(e) => setPieceForm({ ...pieceForm, selling_price_installment: e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="piece_notes">ملاحظات</Label>
              <Textarea
                id="piece_notes"
                value={pieceForm.notes}
                maxLength={5000}
                onChange={(e) => setPieceForm({ ...pieceForm, notes: e.target.value })}
                placeholder="ملاحظات إضافية (اختياري)"
                rows={3}
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
