import { useEffect, useState, useCallback } from 'react'
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { sanitizeText, sanitizeNotes } from '@/lib/sanitize'
import { showNotification } from '@/components/ui/notification'
import { debounce } from '@/lib/throttle'
import { formatCurrency, formatDate } from '@/lib/utils'
import { validatePermissionServerSide } from '@/lib/permissionValidation'
import { Plus, Edit, Trash2, ShoppingCart, X, AlertTriangle } from 'lucide-react'
import type { House, LandStatus, Client, PaymentOffer } from '@/types/database'

const statusColors: Record<LandStatus, 'success' | 'warning' | 'default' | 'secondary'> = {
  Available: 'success',
  Reserved: 'warning',
  Sold: 'default',
  Cancelled: 'secondary',
}

export function Homes() {
  const { hasPermission, user, profile } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [houses, setHouses] = useState<House[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [houseToDelete, setHouseToDelete] = useState<string | null>(null)
  
  // House dialog
  const [houseDialogOpen, setHouseDialogOpen] = useState(false)
  const [editingHouse, setEditingHouse] = useState<House | null>(null)
  const [houseForm, setHouseForm] = useState({
    name: '',
    place: '',
    surface: '',
    price_full: '',
    price_installment: '',
    company_fee_percentage: '',
    notes: '',
  })
  
  // Payment offer form for installment price calculation
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [offerForm, setOfferForm] = useState({
    company_fee_percentage: '',
    advance_amount: '',
    advance_is_percentage: false,
    monthly_payment: '',
    number_of_months: '',
    calculation_method: 'monthly' as 'monthly' | 'months',
    offer_name: '',
    notes: '',
    is_default: false,
  })

  // Sale dialog
  const [selectedHouse, setSelectedHouse] = useState<House | null>(null)
  const [saleDialogOpen, setSaleDialogOpen] = useState(false)
  const [clientDialogOpen, setClientDialogOpen] = useState(false)
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
  const [saleClientCIN, setSaleClientCIN] = useState('')
  const [saleClientSearchStatus, setSaleClientSearchStatus] = useState<'idle' | 'searching' | 'found' | 'not_found'>('idle')
  const [saleClientSearching, setSaleClientSearching] = useState(false)
  const [saleClientFound, setSaleClientFound] = useState<Client | null>(null)

  // Debounced search
  const debouncedSearchFn = useCallback(
    debounce((value: string) => setDebouncedSearchTerm(value), 300),
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

      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('cin', cin)
        .maybeSingle()

      if (!error && data) {
        setSaleClientFound(data)
        setSaleClientSearchStatus('found')
        setNewClient(data)
      } else {
        setSaleClientFound(null)
        if (cin.length >= 4) {
          setSaleClientSearchStatus('not_found')
        } else {
          setSaleClientSearchStatus('idle')
        }
      }
    }, 400),
    []
  )

  useEffect(() => {
    if (saleClientCIN) {
      debouncedSaleCINSearch(saleClientCIN)
    }
  }, [saleClientCIN, debouncedSaleCINSearch])

  useEffect(() => {
    if (searchTerm !== debouncedSearchTerm) {
      debouncedSearchFn(searchTerm)
    }
  }, [searchTerm, debouncedSearchTerm, debouncedSearchFn])

  useEffect(() => {
    fetchHouses()
  }, [])

  const fetchHouses = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('houses')
        .select(`
          *,
          payment_offers!payment_offers_house_id_fkey(*)
        `)
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(t('homes.errorLoadingData'))
        if (fetchError.code === '42P01') {
          setError(t('homes.tableNotFound'))
        } else {
          setError(fetchError.message)
        }
        return
      }

      const housesData = (data as any[]) || []
      setHouses(housesData.map(house => ({
        ...house,
        payment_offers: house.payment_offers || []
      })) as House[])
    } catch (err) {
      setError(t('homes.errorLoadingHouses'))
    } finally {
      setLoading(false)
    }
  }

  // Calculate installment price from offer details
  const calculateInstallmentPrice = useCallback(() => {
    if (!houseForm.price_full) return
    
    const priceFull = parseFloat(houseForm.price_full)
    if (isNaN(priceFull) || priceFull <= 0) return
    
    const advanceAmount = offerForm.advance_amount 
      ? (offerForm.advance_is_percentage 
          ? (priceFull * parseFloat(offerForm.advance_amount)) / 100
          : parseFloat(offerForm.advance_amount))
      : 0
    
    const companyFeePercentage = houseForm.company_fee_percentage 
      ? parseFloat(houseForm.company_fee_percentage) 
      : 0
    const companyFee = (priceFull * companyFeePercentage) / 100
    
    let remainingForInstallments = priceFull - advanceAmount
    
    if (offerForm.calculation_method === 'monthly' && offerForm.monthly_payment) {
      const monthlyPayment = parseFloat(offerForm.monthly_payment)
      if (monthlyPayment > 0 && remainingForInstallments > 0) {
        const numberOfMonths = Math.ceil(remainingForInstallments / monthlyPayment)
        const totalInstallments = monthlyPayment * numberOfMonths
        const calculatedPrice = advanceAmount + totalInstallments + companyFee
        setHouseForm(prev => ({ ...prev, price_installment: calculatedPrice.toFixed(2) }))
        setOfferForm(prev => ({ ...prev, number_of_months: numberOfMonths.toString() }))
      }
    } else if (offerForm.calculation_method === 'months' && offerForm.number_of_months) {
      const numberOfMonths = parseFloat(offerForm.number_of_months)
      if (numberOfMonths > 0 && remainingForInstallments > 0) {
        const monthlyPayment = remainingForInstallments / numberOfMonths
        const totalInstallments = monthlyPayment * numberOfMonths
        const calculatedPrice = advanceAmount + totalInstallments + companyFee
        setHouseForm(prev => ({ ...prev, price_installment: calculatedPrice.toFixed(2) }))
        setOfferForm(prev => ({ ...prev, monthly_payment: monthlyPayment.toFixed(2) }))
      }
    }
  }, [houseForm.price_full, houseForm.company_fee_percentage, showOfferForm, offerForm.advance_amount, offerForm.advance_is_percentage, offerForm.monthly_payment, offerForm.number_of_months, offerForm.calculation_method])

  useEffect(() => {
    if (houseForm.price_full) {
      calculateInstallmentPrice()
    }
  }, [houseForm.price_full, calculateInstallmentPrice])

  const openHouseDialog = async (house?: House) => {
    if (house) {
      setEditingHouse(house)
      setHouseForm({
        name: house.name,
        place: house.place,
        surface: (house as any).surface?.toString() || '',
        price_full: house.price_full.toString(),
        price_installment: house.price_installment.toString(),
        company_fee_percentage: (house as any).company_fee_percentage?.toString() || '',
        notes: house.notes || '',
      })
      
      // Load existing offer if any
      const { data: offers } = await supabase
        .from('payment_offers')
        .select('*')
        .eq('house_id', house.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      
      if (offers) {
        const offer = offers as PaymentOffer
        setOfferForm({
          company_fee_percentage: '', // Not used in offer form anymore
          advance_amount: offer.advance_amount?.toString() || '',
          advance_is_percentage: offer.advance_is_percentage || false,
          monthly_payment: offer.monthly_payment?.toString() || '',
          number_of_months: offer.number_of_months?.toString() || '',
          calculation_method: offer.monthly_payment && offer.monthly_payment > 0 ? 'monthly' : 'months',
          offer_name: offer.offer_name || '',
          notes: offer.notes || '',
          is_default: offer.is_default || false,
        })
        setShowOfferForm(true)
      } else {
        setShowOfferForm(true) // Always show offer form
        setOfferForm({
          company_fee_percentage: '', // Not used
          advance_amount: '',
          advance_is_percentage: false,
          monthly_payment: '',
          number_of_months: '',
          calculation_method: 'monthly',
          offer_name: '',
          notes: '',
          is_default: false,
        })
      }
    } else {
      setEditingHouse(null)
      setHouseForm({
        name: '',
        place: '',
        surface: '',
        price_full: '',
        price_installment: '',
        company_fee_percentage: '',
        notes: '',
      })
      setShowOfferForm(true) // Always show offer form
      setOfferForm({
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
    }
    setHouseDialogOpen(true)
  }

  const saveHouse = async () => {
    console.log('[saveHouse] Starting save process...')
    console.log('[saveHouse] Form data:', houseForm)
    console.log('[saveHouse] User:', user?.id)
    
    if (!houseForm.name.trim() || !houseForm.place.trim() || !houseForm.price_full || !houseForm.price_installment) {
      console.log('[saveHouse] Validation failed - missing required fields')
      setError(t('homes.fillAllRequiredFields'))
      return
    }

    try {
      const houseData: any = {
        name: sanitizeText(houseForm.name),
        place: sanitizeText(houseForm.place),
        surface: houseForm.surface ? parseFloat(houseForm.surface) : null,
        price_full: parseFloat(houseForm.price_full),
        price_installment: parseFloat(houseForm.price_installment),
        company_fee_percentage: houseForm.company_fee_percentage ? parseFloat(houseForm.company_fee_percentage) : null,
        notes: houseForm.notes ? sanitizeNotes(houseForm.notes) : null,
        created_by: user?.id || null,
      }

      console.log('[saveHouse] Prepared house data:', houseData)
      console.log('[saveHouse] Editing house?', !!editingHouse)

      let houseId: string

      if (editingHouse) {
        console.log('[saveHouse] Updating existing house:', editingHouse.id)
        const { data, error } = await supabase
          .from('houses')
          .update(houseData)
          .eq('id', editingHouse.id)
          .select('id')
          .single()
        
        console.log('[saveHouse] Update response - data:', data, 'error:', error)
        
        if (error) {
          console.error('[saveHouse] Update error:', error)
          throw error
        }
        if (!data) {
          console.error('[saveHouse] Update failed - no data returned')
          throw new Error('فشل في تحديث المنزل: لم يتم إرجاع بيانات')
        }
        houseId = data.id
        console.log('[saveHouse] House updated successfully, ID:', houseId)
        showNotification(t('homes.houseUpdatedSuccess'), 'success')
      } else {
        console.log('[saveHouse] Creating new house...')
        console.log('[saveHouse] Attempting insert with data:', JSON.stringify(houseData, null, 2))
        
        // Try without .single() first to see what we get
        const { data: insertData, error: insertError } = await supabase
          .from('houses')
          .insert([houseData])
          .select('id')
        
        console.log('[saveHouse] Insert response (without single):', { data: insertData, error: insertError })
        console.log('[saveHouse] Insert response type:', typeof insertData)
        console.log('[saveHouse] Insert response is array?', Array.isArray(insertData))
        console.log('[saveHouse] Insert response length:', insertData?.length)
        
        if (insertError) {
          console.error('[saveHouse] Insert error:', insertError)
          console.error('[saveHouse] Error code:', insertError.code)
          console.error('[saveHouse] Error message:', insertError.message)
          console.error('[saveHouse] Error details:', insertError.details)
          console.error('[saveHouse] Error hint:', insertError.hint)
          
          // Check if it's an RLS error
          if (insertError.code === '42501' || insertError.message?.includes('permission denied') || insertError.message?.includes('policy')) {
            throw new Error('خطأ في الصلاحيات: لا يمكنك إضافة منزل. يرجى التحقق من أنك Owner.')
          }
          
          throw insertError
        }
        
        if (!insertData || !Array.isArray(insertData) || insertData.length === 0) {
          console.error('[saveHouse] Insert failed - no data returned or empty array')
          console.error('[saveHouse] Response:', { insertData, insertError })
          console.error('[saveHouse] insertData type:', typeof insertData)
          console.error('[saveHouse] insertData value:', JSON.stringify(insertData))
          
          // Try to query the house we just inserted by name and created_by
          console.log('[saveHouse] Attempting to find inserted house by name and created_by...')
          const { data: foundHouse, error: findError } = await supabase
            .from('houses')
            .select('id, name, created_by')
            .eq('name', houseData.name)
            .eq('created_by', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          
          console.log('[saveHouse] Found house query result:', { foundHouse, findError })
          
          if (findError) {
            console.error('[saveHouse] Error finding house:', findError)
          }
          
          // Check if table exists by trying a simple select
          const { data: testData, error: testError } = await supabase
            .from('houses')
            .select('id')
            .limit(1)
          
          console.log('[saveHouse] Table existence check:', { testData, testError })
          
          if (testError && testError.code === '42P01') {
            throw new Error('جدول المنازل غير موجود. يرجى تنفيذ ملف SQL لإنشاء الجدول أولاً.')
          }
          
          // If we found the house, use it
          if (foundHouse && foundHouse.id) {
            console.log('[saveHouse] Found house after insert, using it:', foundHouse.id)
            houseId = foundHouse.id
            showNotification(t('homes.houseAddedSuccess'), 'success')
            setHouseDialogOpen(false)
            await fetchHouses()
            return
          }
          
          throw new Error('فشل في إضافة المنزل: لم يتم إرجاع بيانات من قاعدة البيانات. قد تكون هناك مشكلة في صلاحيات قاعدة البيانات (RLS). يرجى تنفيذ ملف fix_houses_rls_v2.sql في Supabase.')
        }
        
        const data = insertData[0]
        if (!data || !data.id) {
          console.error('[saveHouse] Insert failed - data exists but no ID:', data)
          throw new Error('فشل في إضافة المنزل: لم يتم إرجاع معرف المنزل')
        }
        
        houseId = data.id
        console.log('[saveHouse] House created successfully, ID:', houseId)
        showNotification(t('homes.houseAddedSuccess'), 'success')
      }

      // Save payment offer if offer form is filled
      if (showOfferForm && (offerForm.monthly_payment || offerForm.number_of_months)) {
        const offerData: any = {
          house_id: houseId,
          land_batch_id: null,
          land_piece_id: null,
          price_per_m2_installment: null, // Not applicable for houses
          company_fee_percentage: houseForm.company_fee_percentage ? parseFloat(houseForm.company_fee_percentage) : 0,
          advance_amount: offerForm.advance_amount ? parseFloat(offerForm.advance_amount) : 0,
          advance_is_percentage: offerForm.advance_is_percentage,
          monthly_payment: offerForm.monthly_payment ? parseFloat(offerForm.monthly_payment) : 0,
          number_of_months: offerForm.number_of_months ? parseInt(offerForm.number_of_months) : null,
          offer_name: offerForm.offer_name.trim() || null,
          notes: offerForm.notes.trim() || null,
          is_default: offerForm.is_default,
          created_by: user?.id || null,
        }

        // Check if offer already exists for this house
        const { data: existingOffer, error: offerCheckError } = await supabase
          .from('payment_offers')
          .select('id')
          .eq('house_id', houseId)
          .maybeSingle()

        if (offerCheckError) {
          console.error('Error checking existing offer:', offerCheckError)
          // Continue anyway - try to create new offer
        }

        if (existingOffer && existingOffer.id) {
          // Update existing offer
          const { error: updateError } = await supabase
            .from('payment_offers')
            .update(offerData)
            .eq('id', existingOffer.id)
          if (updateError) {
            console.error('Error updating offer:', updateError)
            // Don't throw - house was saved successfully
          }
        } else {
          // Create new offer
          const { error: insertError } = await supabase
            .from('payment_offers')
            .insert([offerData])
          if (insertError) {
            console.error('Error creating offer:', insertError)
            // Don't throw - house was saved successfully
          }
        }
      }

      setHouseDialogOpen(false)
      await fetchHouses()
    } catch (err: any) {
      setError(err.message || t('homes.errorSavingHouse'))
      showNotification(t('homes.errorSavingHouse') + ': ' + (err.message || t('homes.unknownError')), 'error')
    }
  }

  const deleteHouse = async () => {
    if (!houseToDelete) return

    try {
      // Check if house is sold or reserved
      const house = houses.find(h => h.id === houseToDelete)
      if (house && (house.status === 'Sold' || house.status === 'Reserved')) {
        setError(t('homes.cannotDeleteSoldOrReserved'))
        setDeleteConfirmOpen(false)
        return
      }

      const { error } = await supabase
        .from('houses')
        .delete()
        .eq('id', houseToDelete)
      
      if (error) throw error
      
      showNotification(t('homes.houseDeletedSuccess'), 'success')
      setDeleteConfirmOpen(false)
      await fetchHouses()
    } catch (err: any) {
      setError(err.message || t('homes.errorDeletingHouse'))
      showNotification(t('homes.errorDeletingHouse') + ': ' + (err.message || t('homes.unknownError')), 'error')
    }
  }

  const openSaleDialog = async (house: House) => {
    if (house.status === 'Sold') {
      showNotification(t('homes.houseAlreadySold'), 'warning')
      return
    }

    setSelectedHouse(house)
    setSaleForm({
      payment_type: 'Full',
      reservation_amount: '',
      deadline_date: '',
      selected_offer_id: '',
      promise_initial_payment: '',
    })
    setNewClient(null)
    setSaleClientCIN('')
    setSaleClientFound(null)
    setSaleClientSearchStatus('idle')

    // Fetch offers for this house
    const { data: offers } = await supabase
      .from('payment_offers')
      .select('*')
      .eq('house_id', house.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })

    setAvailableOffers((offers as PaymentOffer[]) || [])
    setSaleDialogOpen(true)
  }

  const saveClient = async () => {
    if (!clientForm.name.trim() || !clientForm.cin.trim()) {
      setError(t('homes.fillNameAndCIN'))
      return
    }

    setSavingClient(true)
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert([{
          name: sanitizeText(clientForm.name),
          cin: clientForm.cin,
          phone: clientForm.phone || null,
          email: clientForm.email || null,
          address: clientForm.address || null,
          client_type: clientForm.client_type,
          notes: clientForm.notes || null,
          created_by: user?.id || null,
        }])
        .select()
        .single()

      if (error) throw error
      
      setNewClient(data)
      setClientDialogOpen(false)
      showNotification(t('homes.clientAddedSuccess'), 'success')
    } catch (err: any) {
      setError(err.message || t('homes.errorSavingClient'))
      showNotification(t('homes.errorSavingClient') + ': ' + (err.message || t('homes.unknownError')), 'error')
    } finally {
      setSavingClient(false)
    }
  }

  const createSale = async () => {
    if (!selectedHouse || !newClient) {
      setError(t('homes.selectClient'))
      return
    }

    if (!saleForm.reservation_amount || parseFloat(saleForm.reservation_amount) <= 0) {
      setError(t('homes.enterReservationAmount'))
      return
    }

    setCreatingSale(true)
    try {
      // Create sale similar to land sales
      const reservationAmount = parseFloat(saleForm.reservation_amount)
      const price = saleForm.payment_type === 'Full' 
        ? selectedHouse.price_full 
        : selectedHouse.price_installment
      
      const purchaseCost = 0 // No purchase cost for houses
      const companyFeePercentage = (selectedHouse as any).company_fee_percentage || (selectedOffer?.company_fee_percentage || 0)
      const companyFeeAmount = (price * companyFeePercentage) / 100
      
      const saleData: any = {
        client_id: newClient.id,
        house_ids: [selectedHouse.id], // Using house_ids instead of land_piece_ids
        payment_type: saleForm.payment_type,
        total_purchase_cost: purchaseCost,
        total_selling_price: price,
        profit_margin: price - purchaseCost,
        small_advance_amount: reservationAmount,
        big_advance_amount: 0,
        company_fee_percentage: companyFeePercentage,
        company_fee_amount: companyFeeAmount,
        status: 'Pending',
        sale_date: new Date().toISOString().split('T')[0],
        deadline_date: saleForm.deadline_date || null,
        notes: `${t('homes.sellingHouseNote')}: ${selectedHouse.name}`,
        created_by: user?.id || null,
      }

      if (saleForm.payment_type === 'Installment' && selectedOffer) {
        saleData.selected_offer_id = selectedOffer.id
        // Company fee already set above from house (applies to both types)
      }

      const { data: sale, error } = await supabase
        .from('sales')
        .insert([saleData])
        .select()
        .single()

      if (error) throw error

      // Update house status to Reserved
      await supabase
        .from('houses')
        .update({ 
          status: 'Reserved',
          reservation_client_id: newClient.id,
          reserved_until: saleForm.deadline_date || null,
        } as any)
        .eq('id', selectedHouse.id)

      // Create payment record for reservation
      await supabase
        .from('payments')
        .insert([{
          client_id: newClient.id,
          sale_id: sale.id,
          amount_paid: reservationAmount,
          payment_type: 'SmallAdvance',
          payment_date: new Date().toISOString().split('T')[0],
          payment_method: 'Cash',
          recorded_by: user?.id || null,
        }])

      showNotification(t('homes.saleCreatedSuccess'), 'success')
      setSaleDialogOpen(false)
      await fetchHouses()
      navigate('/sales')
    } catch (err: any) {
      setError(err.message || t('homes.errorCreatingSale'))
      showNotification(t('homes.errorCreatingSale') + ': ' + (err.message || t('homes.unknownError')), 'error')
    } finally {
      setCreatingSale(false)
    }
  }

  const filteredHouses = houses.filter(house => {
    if (!debouncedSearchTerm) return true
    const search = debouncedSearchTerm.toLowerCase()
    return (
      house.name.toLowerCase().includes(search) ||
      house.place.toLowerCase().includes(search)
    )
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('homes.title')}</h1>
          <p className="text-gray-500 mt-1">{t('homes.subtitle')}</p>
        </div>
        <Button onClick={() => openHouseDialog()} className="w-full md:w-auto">
          <Plus className="h-4 w-4 ml-2" />
          {t('homes.newHouse')}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <CardTitle>{t('homes.housesList')}</CardTitle>
            <div className="flex-1 max-w-md">
              <Input
                placeholder={t('common.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
          {filteredHouses.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-500">{t('common.noData')}</p>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[150px]">{t('homes.name')}</TableHead>
                      <TableHead className="min-w-[120px]">{t('homes.place')}</TableHead>
                      <TableHead className="min-w-[100px]">{t('homes.surface')}</TableHead>
                      <TableHead className="min-w-[120px]">{t('homes.priceFull')}</TableHead>
                      <TableHead className="min-w-[140px]">{t('homes.priceInstallment')}</TableHead>
                      <TableHead className="min-w-[100px]">{t('homes.status')}</TableHead>
                      <TableHead className="min-w-[150px]">{t('common.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHouses.map((house) => (
                      <TableRow key={house.id}>
                        <TableCell className="font-medium">{house.name}</TableCell>
                        <TableCell>{house.place}</TableCell>
                        <TableCell>{(house as any).surface ? `${(house as any).surface} ${t('land.surface')}` : '-'}</TableCell>
                        <TableCell>{formatCurrency(house.price_full)}</TableCell>
                        <TableCell>{formatCurrency(house.price_installment)}</TableCell>
                        <TableCell>
                          <Badge variant={statusColors[house.status]}>
                            {t(`land.${house.status.toLowerCase()}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openHouseDialog(house)}
                              title={t('common.edit')}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {house.status === 'Available' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openSaleDialog(house)}
                                  title={t('homes.createSale')}
                                >
                                  <ShoppingCart className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setHouseToDelete(house.id)
                                    setDeleteConfirmOpen(true)
                                  }}
                                  title={t('common.delete')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card View */}
              <div className="md:hidden space-y-4 p-4">
                {filteredHouses.map((house) => (
                  <Card key={house.id} className="border shadow-sm">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">{house.name}</h3>
                          <p className="text-sm text-gray-600 mt-1">{house.place}</p>
                        </div>
                        <Badge variant={statusColors[house.status]} className="ml-2">
                          {t(`land.${house.status.toLowerCase()}`)}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-gray-500">{t('homes.surface')}</p>
                          <p className="font-medium">{(house as any).surface ? `${(house as any).surface} ${t('land.surface')}` : '-'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500">{t('homes.priceFull')}</p>
                          <p className="font-medium">{formatCurrency(house.price_full)}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-gray-500">{t('homes.priceInstallment')}</p>
                          <p className="font-medium">{formatCurrency(house.price_installment)}</p>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2 border-t">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openHouseDialog(house)}
                          className="flex-1"
                        >
                          <Edit className="h-4 w-4 ml-1" />
                          {t('common.edit')}
                        </Button>
                        {house.status === 'Available' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openSaleDialog(house)}
                              className="flex-1"
                            >
                              <ShoppingCart className="h-4 w-4 ml-1" />
                              {t('homes.createSale')}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setHouseToDelete(house.id)
                                setDeleteConfirmOpen(true)
                              }}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* House Dialog */}
      <Dialog open={houseDialogOpen} onOpenChange={setHouseDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">
              {editingHouse ? t('homes.editHouse') : t('homes.newHouse')}
            </DialogTitle>
            <DialogDescription className="text-sm">{t('homes.houseFormDescription')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label>{t('homes.name')} *</Label>
              <Input
                value={houseForm.name}
                onChange={(e) => setHouseForm({ ...houseForm, name: e.target.value })}
                placeholder={t('homes.namePlaceholder')}
              />
            </div>
            <div>
              <Label>{t('homes.place')} *</Label>
              <Input
                value={houseForm.place}
                onChange={(e) => setHouseForm({ ...houseForm, place: e.target.value })}
                placeholder={t('homes.placePlaceholder')}
              />
            </div>
            <div>
              <Label>{t('homes.surface')}</Label>
              <Input
                type="number"
                value={houseForm.surface}
                onChange={(e) => setHouseForm({ ...houseForm, surface: e.target.value })}
                placeholder={t('homes.surfacePlaceholder')}
              />
            </div>
            <div>
              <Label>{t('homes.priceFull')} *</Label>
              <Input
                type="number"
                value={houseForm.price_full}
                onChange={(e) => setHouseForm({ ...houseForm, price_full: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>{t('homes.companyFeePercentage')}</Label>
              <Input
                type="number"
                value={houseForm.company_fee_percentage}
                onChange={(e) => setHouseForm({ ...houseForm, company_fee_percentage: e.target.value })}
                placeholder="0"
                step="0.1"
              />
              <p className="text-xs text-gray-500 mt-1">{t('homes.companyFeeAppliesToBoth')}</p>
            </div>
            
            {/* Payment Offer Form - Always visible */}
            <div className="border-t pt-4 space-y-4">
              <h3 className="font-semibold">{t('homes.installmentOffer')}</h3>
              
              <div>
                <Label>{t('homes.priceInstallment')} *</Label>
                <Input
                  type="number"
                  value={houseForm.price_installment}
                  onChange={(e) => setHouseForm({ ...houseForm, price_installment: e.target.value })}
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 mt-1">{t('homes.priceWillBeCalculated')}</p>
              </div>
              
              <div>
                <Label>{t('land.offerName')}</Label>
                <Input
                  value={offerForm.offer_name}
                  onChange={(e) => setOfferForm({ ...offerForm, offer_name: e.target.value })}
                  placeholder={t('land.offerName')}
                />
              </div>

              <div>
                <Label>{t('land.advanceAmount')}</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={offerForm.advance_amount}
                    onChange={(e) => setOfferForm({ ...offerForm, advance_amount: e.target.value })}
                    placeholder="0"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={offerForm.advance_is_percentage}
                      onChange={(e) => setOfferForm({ ...offerForm, advance_is_percentage: e.target.checked })}
                      className="rounded"
                    />
                    <Label className="text-sm">{t('land.advanceIsPercentage')}</Label>
                  </div>
                </div>
              </div>

              <div>
                <Label>{t('land.calculationMethod')}</Label>
                <Select
                  value={offerForm.calculation_method}
                  onChange={(e) => setOfferForm({ ...offerForm, calculation_method: e.target.value as 'monthly' | 'months' })}
                >
                  <option value="monthly">{t('land.calculateByMonthly')}</option>
                  <option value="months">{t('land.calculateByMonths')}</option>
                </Select>
              </div>

              {offerForm.calculation_method === 'monthly' ? (
                <div>
                  <Label>{t('land.monthlyPayment')} *</Label>
                  <Input
                    type="number"
                    value={offerForm.monthly_payment}
                    onChange={(e) => setOfferForm({ ...offerForm, monthly_payment: e.target.value })}
                    placeholder="0"
                  />
                  {offerForm.monthly_payment && houseForm.price_full && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t('land.numberOfMonths')}: {offerForm.number_of_months || '...'}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <Label>{t('land.numberOfMonths')} *</Label>
                  <Input
                    type="number"
                    value={offerForm.number_of_months}
                    onChange={(e) => setOfferForm({ ...offerForm, number_of_months: e.target.value })}
                    placeholder="0"
                  />
                  {offerForm.number_of_months && houseForm.price_full && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t('land.monthlyPayment')}: {formatCurrency(parseFloat(offerForm.monthly_payment) || 0)}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label>{t('common.notes')}</Label>
              <Textarea
                value={houseForm.notes}
                onChange={(e) => setHouseForm({ ...houseForm, notes: e.target.value })}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setHouseDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={saveHouse}
              className="w-full sm:w-auto"
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sale Dialog */}
      <Dialog open={saleDialogOpen} onOpenChange={setSaleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 md:p-6">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">{t('homes.createSale')}</DialogTitle>
            <DialogDescription className="text-sm">
              {selectedHouse && `${t('homes.sellingHouse')}: ${selectedHouse.name}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            {/* Client Search */}
            <div>
              <Label>{t('clients.cin')}</Label>
              <Input
                value={saleClientCIN}
                onChange={(e) => {
                  setSaleClientCIN(e.target.value)
                  setSaleClientSearchStatus('searching')
                }}
                placeholder={t('clients.cin')}
              />
              {saleClientSearchStatus === 'searching' && (
                <p className="text-sm text-gray-500 mt-1">{t('common.loading')}</p>
              )}
              {saleClientSearchStatus === 'found' && saleClientFound && (
                <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded">
                  <p className="text-sm font-medium">{saleClientFound.name}</p>
                  <p className="text-xs text-gray-600">{saleClientFound.phone}</p>
                </div>
              )}
              {saleClientSearchStatus === 'not_found' && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => setClientDialogOpen(true)}
                >
                  {t('clients.newClient')}
                </Button>
              )}
            </div>

            {/* Payment Type */}
            <div>
              <Label>{t('sales.type')}</Label>
              <Select
                value={saleForm.payment_type}
                onChange={(e) => {
                  setSaleForm({ ...saleForm, payment_type: e.target.value as 'Full' | 'Installment' | 'PromiseOfSale' })
                  setSelectedOffer(null)
                }}
              >
                <option value="Full">{t('sales.full')}</option>
                <option value="Installment">{t('sales.installment')}</option>
              </Select>
            </div>

            {/* Installment Offer Selection */}
            {saleForm.payment_type === 'Installment' && availableOffers.length > 0 && (
              <div>
                <Label>{t('land.selectedOffer')}</Label>
                <Select
                  value={saleForm.selected_offer_id}
                  onChange={(e) => {
                    setSaleForm({ ...saleForm, selected_offer_id: e.target.value })
                    const offer = availableOffers.find(o => o.id === e.target.value)
                    setSelectedOffer(offer || null)
                  }}
                >
                  <option value="">{t('land.selectOffer')}</option>
                  {availableOffers.map(offer => (
                    <option key={offer.id} value={offer.id}>
                      {offer.offer_name || t('land.offer')} {offer.id.slice(0, 8)}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {/* Reservation Amount */}
            <div>
              <Label>{t('sales.reservation')} *</Label>
              <Input
                type="number"
                value={saleForm.reservation_amount}
                onChange={(e) => setSaleForm({ ...saleForm, reservation_amount: e.target.value })}
                placeholder="0"
              />
            </div>

            {/* Deadline Date */}
            <div>
              <Label>{t('saleConfirmation.deadline')}</Label>
              <Input
                type="date"
                value={saleForm.deadline_date}
                onChange={(e) => setSaleForm({ ...saleForm, deadline_date: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setSaleDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={createSale} 
              disabled={!newClient || creatingSale}
              className="w-full sm:w-auto"
            >
              {creatingSale ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Client Dialog */}
      <Dialog open={clientDialogOpen} onOpenChange={setClientDialogOpen}>
        <DialogContent className="p-4 md:p-6 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">{t('clients.newClient')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label>{t('clients.clientName')} *</Label>
              <Input
                value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('clients.cin')} *</Label>
              <Input
                value={clientForm.cin}
                onChange={(e) => setClientForm({ ...clientForm, cin: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('clients.phone')}</Label>
              <Input
                value={clientForm.phone}
                onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('clients.email')}</Label>
              <Input
                type="email"
                value={clientForm.email}
                onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('clients.address')}</Label>
              <Input
                value={clientForm.address}
                onChange={(e) => setClientForm({ ...clientForm, address: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 pt-4">
            <Button 
              variant="outline" 
              onClick={() => setClientDialogOpen(false)}
              className="w-full sm:w-auto"
            >
              {t('common.cancel')}
            </Button>
            <Button 
              onClick={saveClient} 
              disabled={savingClient}
              className="w-full sm:w-auto"
            >
              {savingClient ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={deleteHouse}
        title={t('common.deleteConfirm')}
        description={t('homes.deleteHouseConfirm')}
      />
    </div>
  )
}

