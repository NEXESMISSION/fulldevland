import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { sanitizeText } from '@/lib/sanitize'
import {
  Building2,
  Plus,
  Edit,
  Trash2,
  DollarSign,
  Eye,
  X,
  Save,
  Box,
  Image as ImageIcon,
  Upload,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

interface Project {
  id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface ProjectBox {
  id: string
  project_id: string
  name: string
  description: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface BoxExpense {
  id: string
  box_id: string
  description: string
  amount: number
  expense_date: string
  image_url: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export function RealEstateBuildings() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // View state: 'projects' | 'boxes' | 'expenses'
  const [currentView, setCurrentView] = useState<'projects' | 'boxes' | 'expenses'>('projects')
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedBox, setSelectedBox] = useState<ProjectBox | null>(null)
  const [boxes, setBoxes] = useState<ProjectBox[]>([])
  const [expenses, setExpenses] = useState<BoxExpense[]>([])

  // Project dialog
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [projectForm, setProjectForm] = useState({ name: '', description: '' })

  // Box dialog
  const [boxDialogOpen, setBoxDialogOpen] = useState(false)
  const [editingBox, setEditingBox] = useState<ProjectBox | null>(null)
  const [boxForm, setBoxForm] = useState({ name: '', description: '' })

  // Expense dialog
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<BoxExpense | null>(null)
  const [expenseForm, setExpenseForm] = useState({
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    notes: '',
  })
  const [expenseImage, setExpenseImage] = useState<File | null>(null)
  const [expenseImagePreview, setExpenseImagePreview] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete confirmations
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteBoxConfirmOpen, setDeleteBoxConfirmOpen] = useState(false)
  const [deleteExpenseConfirmOpen, setDeleteExpenseConfirmOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<{ type: 'project' | 'box' | 'expense'; id: string } | null>(null)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      // Fetch boxes and expenses statistics for each project
      const projectsWithStats = await Promise.all(
        (data || []).map(async (project) => {
          // Get boxes for this project
          const { data: boxesData } = await supabase
            .from('project_boxes')
            .select('id')
            .eq('project_id', project.id)
          
          const boxesCount = boxesData?.length || 0
          
          // Get all expenses for all boxes in this project
          let totalExpenses = 0
          let expensesCount = 0
          
          if (boxesData && boxesData.length > 0) {
            const boxIds = boxesData.map(b => b.id)
            const { data: expensesData } = await supabase
              .from('box_expenses')
              .select('amount')
              .in('box_id', boxIds)
            
            expensesCount = expensesData?.length || 0
            totalExpenses = expensesData?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0
          }
          
          return {
            ...project,
            _boxesCount: boxesCount,
            _expensesCount: expensesCount,
            _totalExpenses: totalExpenses
          }
        })
      )
      
      setProjects(projectsWithStats as any)
    } catch (err: any) {
      console.error('Error fetching projects:', err)
      setError(err.message || 'خطأ في تحميل المشاريع')
    } finally {
      setLoading(false)
    }
  }

  const fetchBoxes = async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from('project_boxes')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      // Fetch expenses count and total for each box
      const boxesWithStats = await Promise.all(
        (data || []).map(async (box) => {
          const { data: expensesData } = await supabase
            .from('box_expenses')
            .select('amount')
            .eq('box_id', box.id)
          
          const expensesCount = expensesData?.length || 0
          const totalExpenses = expensesData?.reduce((sum, e) => sum + (e.amount || 0), 0) || 0
          
          return {
            ...box,
            _expensesCount: expensesCount,
            _totalExpenses: totalExpenses
          }
        })
      )
      
      setBoxes(boxesWithStats as any)
    } catch (err: any) {
      console.error('Error fetching boxes:', err)
      setError(err.message || 'خطأ في تحميل الصناديق')
    }
  }

  const fetchExpenses = async (boxId: string) => {
    try {
      const { data, error } = await supabase
        .from('box_expenses')
        .select('*')
        .eq('box_id', boxId)
        .order('expense_date', { ascending: false })
      
      if (error) throw error
      setExpenses(data || [])
    } catch (err: any) {
      console.error('Error fetching expenses:', err)
      setError(err.message || 'خطأ في تحميل المصروفات')
    }
  }

  const openProjectDialog = (project?: Project) => {
    if (project) {
      setEditingProject(project)
      setProjectForm({
        name: project.name,
        description: project.description || '',
      })
    } else {
      setEditingProject(null)
      setProjectForm({ name: '', description: '' })
    }
    setError(null)
    setProjectDialogOpen(true)
  }

  const saveProject = async () => {
    if (!projectForm.name.trim()) {
      setError('اسم المشروع مطلوب')
      return
    }

    setError(null)
    try {
      const projectData: any = {
        name: sanitizeText(projectForm.name),
        description: projectForm.description ? sanitizeText(projectForm.description) : null,
        created_by: user?.id || null,
      }

      if (editingProject) {
        const { error } = await supabase
          .from('projects')
          .update(projectData)
          .eq('id', editingProject.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('projects')
          .insert([projectData])
        if (error) throw error
      }

      setProjectDialogOpen(false)
      fetchProjects()
    } catch (err: any) {
      setError(err.message || 'خطأ في حفظ المشروع')
    }
  }

  const openBoxDialog = (box?: ProjectBox) => {
    if (box) {
      setEditingBox(box)
      setBoxForm({
        name: box.name,
        description: box.description || '',
      })
    } else {
      setEditingBox(null)
      setBoxForm({ name: '', description: '' })
    }
    setError(null)
    setBoxDialogOpen(true)
  }

  const saveBox = async () => {
    if (!selectedProject || !boxForm.name.trim()) {
      setError('اسم الصندوق مطلوب')
      return
    }

    setError(null)
    try {
      const boxData: any = {
        project_id: selectedProject.id,
        name: sanitizeText(boxForm.name),
        description: boxForm.description ? sanitizeText(boxForm.description) : null,
        created_by: user?.id || null,
      }

      if (editingBox) {
        const { error } = await supabase
          .from('project_boxes')
          .update(boxData)
          .eq('id', editingBox.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('project_boxes')
          .insert([boxData])
        if (error) throw error
      }

      setBoxDialogOpen(false)
      await fetchBoxes(selectedProject.id)
    } catch (err: any) {
      setError(err.message || 'خطأ في حفظ الصندوق')
    }
  }

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      setUploadingImage(true)
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random()}.${fileExt}`
      const filePath = `project-expenses/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('project-expenses')
        .upload(filePath, file)

      if (uploadError) {
        // Try to create bucket if it doesn't exist
        console.error('Upload error:', uploadError)
        return null
      }

      const { data } = supabase.storage
        .from('project-expenses')
        .getPublicUrl(filePath)

      return data.publicUrl
    } catch (err) {
      console.error('Error uploading image:', err)
      return null
    } finally {
      setUploadingImage(false)
    }
  }

  const openExpenseDialog = (expense?: BoxExpense) => {
    if (expense) {
      setEditingExpense(expense)
      setExpenseForm({
        description: expense.description,
        amount: expense.amount.toString(),
        expense_date: expense.expense_date,
        notes: expense.notes || '',
      })
      setExpenseImagePreview(expense.image_url)
      setExpenseImage(null)
    } else {
      setEditingExpense(null)
      setExpenseForm({
        description: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        notes: '',
      })
      setExpenseImagePreview(null)
      setExpenseImage(null)
    }
    setError(null)
    setExpenseDialogOpen(true)
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setExpenseImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setExpenseImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const saveExpense = async () => {
    if (!selectedBox || !expenseForm.description.trim() || !expenseForm.amount) {
      setError('الوصف والمبلغ مطلوبان')
      return
    }

    setError(null)
    try {
      let imageUrl: string | null = null

      // Upload file if selected
      if (expenseImage) {
        const uploadedUrl = await uploadImage(expenseImage)
        if (uploadedUrl) {
          imageUrl = uploadedUrl
        }
      } else if (editingExpense?.image_url) {
        // Keep existing image if no new one provided
        imageUrl = editingExpense.image_url
      }

      const expenseData: any = {
        box_id: selectedBox.id,
        description: sanitizeText(expenseForm.description),
        amount: parseFloat(expenseForm.amount),
        expense_date: expenseForm.expense_date,
        image_url: imageUrl,
        notes: expenseForm.notes ? sanitizeText(expenseForm.notes) : null,
        created_by: user?.id || null,
      }

      if (editingExpense) {
        const { error } = await supabase
          .from('box_expenses')
          .update(expenseData)
          .eq('id', editingExpense.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('box_expenses')
          .insert([expenseData])
        if (error) throw error
      }

      setExpenseDialogOpen(false)
      await fetchExpenses(selectedBox.id)
    } catch (err: any) {
      setError(err.message || 'خطأ في حفظ المصروف')
    }
  }

  const handleViewProject = async (project: Project) => {
    setSelectedProject(project)
    setSelectedBox(null)
    setExpenses([])
    await fetchBoxes(project.id)
    setCurrentView('boxes')
    // Push state to enable back navigation
    window.history.pushState({ view: 'boxes' }, '')
  }

  const handleViewBox = async (box: ProjectBox) => {
    setSelectedBox(box)
    await fetchExpenses(box.id)
    setCurrentView('expenses')
    // Push state to enable back navigation
    window.history.pushState({ view: 'expenses' }, '')
  }


  // Handle browser back button for internal navigation
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (currentView === 'expenses') {
        setCurrentView('boxes')
        setSelectedBox(null)
        setExpenses([])
      } else if (currentView === 'boxes') {
        setCurrentView('projects')
        setSelectedProject(null)
        setBoxes([])
      }
    }
    
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [currentView])

  const deleteItem = async () => {
    if (!itemToDelete) return

    try {
      if (itemToDelete.type === 'project') {
        const { error } = await supabase
          .from('projects')
          .delete()
          .eq('id', itemToDelete.id)
        if (error) throw error
        setCurrentView('projects')
        setSelectedProject(null)
        setBoxes([])
        setExpenses([])
      } else if (itemToDelete.type === 'box') {
        const { error } = await supabase
          .from('project_boxes')
          .delete()
          .eq('id', itemToDelete.id)
        if (error) throw error
        if (selectedProject) {
          await fetchBoxes(selectedProject.id)
        }
      } else if (itemToDelete.type === 'expense') {
        const { error } = await supabase
          .from('box_expenses')
          .delete()
          .eq('id', itemToDelete.id)
        if (error) throw error
        if (selectedBox) {
          await fetchExpenses(selectedBox.id)
        }
      }

      setDeleteConfirmOpen(false)
      setDeleteBoxConfirmOpen(false)
      setDeleteExpenseConfirmOpen(false)
      setItemToDelete(null)
      fetchProjects()
    } catch (err: any) {
      setError(err.message || 'خطأ في الحذف')
    }
  }

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0)
  const boxTotalExpenses = boxes.reduce(async (sum, box) => {
    const { data } = await supabase
      .from('box_expenses')
      .select('amount')
      .eq('box_id', box.id)
    const boxTotal = (data || []).reduce((s, e) => s + e.amount, 0)
    return (await sum) + boxTotal
  }, Promise.resolve(0))

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {currentView !== 'projects' && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => {
                if (currentView === 'expenses') {
                  setCurrentView('boxes')
                  setSelectedBox(null)
                  setExpenses([])
                  window.history.pushState({ view: 'boxes' }, '')
                } else if (currentView === 'boxes') {
                  setCurrentView('projects')
                  setSelectedProject(null)
                  setBoxes([])
                }
              }} 
              className="gap-2 hidden md:flex"
            >
              <ArrowRight className="h-4 w-4" />
              {t('common.back')}
            </Button>
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Building2 className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              {currentView === 'projects' && t('realEstate.title')}
              {currentView === 'boxes' && selectedProject && `${t('realEstate.boxes')}: ${selectedProject.name}`}
              {currentView === 'expenses' && selectedBox && `${t('realEstate.expenses')}: ${selectedBox.name}`}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {currentView === 'projects' && t('realEstate.subtitle')}
              {currentView === 'boxes' && t('realEstate.boxes')}
              {currentView === 'expenses' && t('realEstate.expenses')}
            </p>
          </div>
        </div>
        {currentView === 'projects' && (
          <Button onClick={() => openProjectDialog()} size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            {t('realEstate.newProject')}
          </Button>
        )}
        {currentView === 'boxes' && selectedProject && (
          <Button onClick={() => openBoxDialog()} size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            {t('realEstate.newBox')}
          </Button>
        )}
        {currentView === 'expenses' && selectedBox && (
          <Button onClick={() => openExpenseDialog()} size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            {t('realEstate.newExpense')}
          </Button>
        )}
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Projects View */}
      {currentView === 'projects' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">{t('common.noData')}</p>
              <Button onClick={() => openProjectDialog()} className="gap-2" variant="outline">
                <Plus className="h-4 w-4" />
                {t('realEstate.newProject')}
              </Button>
            </div>
          ) : (
            projects.map((project: any) => (
              <Card key={project.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex-1">{project.name}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          openProjectDialog(project)
                        }}
                        className="h-7 w-7"
                        title={t('common.edit')}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          setItemToDelete({ type: 'project', id: project.id })
                          setDeleteConfirmOpen(true)
                        }}
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {project.description && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{t('realEstate.projectDescription')}:</p>
                        <p className="text-sm text-foreground">{project.description}</p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{t('realEstate.boxesCount')}:</p>
                        <p className="text-sm font-semibold">{project._boxesCount || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{t('realEstate.expensesCount')}:</p>
                        <p className="text-sm font-semibold">{project._expensesCount || 0}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground mb-1">{t('realEstate.totalExpenses')}:</p>
                        <p className="text-sm font-semibold text-primary">{formatCurrency(project._totalExpenses || 0)}</p>
                      </div>
                    </div>
                    
                    {project.created_at && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground mb-1">{t('realEstate.createdAt')}:</p>
                        <p className="text-xs text-foreground">{formatDate(project.created_at)}</p>
                      </div>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewProject(project)}
                      className="w-full mt-2"
                    >
                      <Eye className="h-3.5 w-3.5 ml-1" />
                      {t('realEstate.viewBoxes')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Boxes View */}
      {currentView === 'boxes' && selectedProject && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boxes.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <Box className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground mb-4">{t('common.noData')}</p>
              <Button onClick={() => openBoxDialog()} className="gap-2" variant="outline">
                <Plus className="h-4 w-4" />
                {t('realEstate.newBox')}
              </Button>
            </div>
          ) : (
            boxes.map((box: any) => (
              <Card key={box.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex-1">{box.name}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          openBoxDialog(box)
                        }}
                        className="h-7 w-7"
                        title={t('common.edit')}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          setItemToDelete({ type: 'box', id: box.id })
                          setDeleteBoxConfirmOpen(true)
                        }}
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title={t('common.delete')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {box.description && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{t('realEstate.boxDescription')}:</p>
                        <p className="text-sm text-foreground">{box.description}</p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{t('realEstate.expensesCount')}:</p>
                        <p className="text-sm font-semibold">{box._expensesCount || 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{t('realEstate.totalExpenses')}:</p>
                        <p className="text-sm font-semibold text-primary">{formatCurrency(box._totalExpenses || 0)}</p>
                      </div>
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewBox(box)}
                      className="w-full mt-2"
                    >
                      <Eye className="h-3.5 w-3.5 ml-1" />
                      {t('realEstate.viewExpenses')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Expenses View */}
      {currentView === 'expenses' && selectedBox && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{t('realEstate.expenses')}</span>
                <Badge variant="outline" className="text-lg">
                  {formatCurrency(totalExpenses)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {expenses.length === 0 ? (
                <div className="text-center py-12">
                  <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground mb-4">{t('common.noData')}</p>
                  <Button onClick={() => openExpenseDialog()} className="gap-2" variant="outline">
                    <Plus className="h-4 w-4" />
                    {t('realEstate.newExpense')}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {expenses.map((expense) => (
                    <Card key={expense.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-2">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">{t('realEstate.amount')}:</p>
                                <div className="font-bold text-lg text-primary">
                                  {formatCurrency(expense.amount)}
                                </div>
                              </div>
                              
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">{t('common.date')}:</p>
                                <p className="text-sm font-medium">{formatDate(expense.expense_date)}</p>
                              </div>
                              
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">{t('realEstate.expenseDescription')}:</p>
                                <p className="text-sm font-medium">{expense.description}</p>
                              </div>
                              
                              {expense.notes && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">{t('common.notes')}:</p>
                                  <p className="text-xs text-foreground">{expense.notes}</p>
                                </div>
                              )}
                              
                              {expense.image_url && (
                                <div>
                                  <p className="text-xs text-muted-foreground mb-1">{t('realEstate.image')}:</p>
                                  <img
                                    src={expense.image_url}
                                    alt="Expense proof"
                                    className="w-full h-32 object-cover rounded-md cursor-pointer hover:opacity-80 transition-opacity border"
                                    onClick={() => window.open(expense.image_url!, '_blank')}
                                  />
                                </div>
                              )}
                            </div>
                            
                            <div className="flex flex-col gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openExpenseDialog(expense)}
                                className="h-7 w-7"
                                title={t('common.edit')}
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setItemToDelete({ type: 'expense', id: expense.id })
                                  setDeleteExpenseConfirmOpen(true)
                                }}
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                title={t('common.delete')}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingProject ? t('realEstate.editProject') : t('realEstate.newProject')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('realEstate.projectName')} *</Label>
              <Input
                value={projectForm.name}
                onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                placeholder={t('realEstate.projectName')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('realEstate.projectDescription')}</Label>
              <Textarea
                value={projectForm.description}
                onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                rows={3}
                placeholder={t('realEstate.projectDescription')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={saveProject} className="gap-2">
              <Save className="h-4 w-4" />
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Box Dialog */}
      <Dialog open={boxDialogOpen} onOpenChange={setBoxDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingBox ? t('realEstate.editBox') : t('realEstate.newBox')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('realEstate.boxName')} *</Label>
              <Input
                value={boxForm.name}
                onChange={(e) => setBoxForm({ ...boxForm, name: e.target.value })}
                placeholder={t('realEstate.boxName')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('realEstate.boxDescription')}</Label>
              <Textarea
                value={boxForm.description}
                onChange={(e) => setBoxForm({ ...boxForm, description: e.target.value })}
                rows={3}
                placeholder={t('realEstate.boxDescription')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoxDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={saveBox} className="gap-2">
              <Save className="h-4 w-4" />
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Expense Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExpense ? t('realEstate.editExpense') : t('realEstate.newExpense')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t('realEstate.expenseDescription')} *</Label>
              <Input
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                placeholder={t('realEstate.expenseDescription')}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('realEstate.amount')} (DT) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('realEstate.expenseDate')} *</Label>
                <Input
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('common.notes')}</Label>
              <Textarea
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                rows={2}
                placeholder={t('common.notes')}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('realEstate.image')}</Label>
              <div className="space-y-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full gap-2"
                  disabled={uploadingImage}
                >
                  <Upload className="h-4 w-4" />
                  {expenseImage ? t('common.edit') : t('common.add')}
                </Button>

                {/* Image Preview */}
                {expenseImagePreview && (
                  <div className="relative">
                    <img
                      src={expenseImagePreview}
                      alt="Preview"
                      className="w-full h-48 object-cover rounded-md"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setExpenseImage(null)
                        setExpenseImagePreview(null)
                        if (fileInputRef.current) {
                          fileInputRef.current.value = ''
                        }
                      }}
                      className="absolute top-2 right-2"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={saveExpense} className="gap-2" disabled={uploadingImage}>
              <Save className="h-4 w-4" />
              {uploadingImage ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmations */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={deleteItem}
        title={t('common.delete')}
        description={t('realEstate.deleteProjectConfirm')}
      />
      <ConfirmDialog
        open={deleteBoxConfirmOpen}
        onOpenChange={setDeleteBoxConfirmOpen}
        onConfirm={deleteItem}
        title={t('common.delete')}
        description={t('realEstate.deleteBoxConfirm')}
      />
      <ConfirmDialog
        open={deleteExpenseConfirmOpen}
        onOpenChange={setDeleteExpenseConfirmOpen}
        onConfirm={deleteItem}
        title={t('common.delete')}
        description={t('realEstate.deleteExpenseConfirm')}
      />
    </div>
  )
}
