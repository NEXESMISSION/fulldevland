import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
  DialogDescription,
} from '@/components/ui/dialog'
import { Select } from '@/components/ui/select'
import { formatCurrency, formatDate } from '@/lib/utils'
import { sanitizeText } from '@/lib/sanitize'
import {
  Building2,
  Plus,
  Edit,
  Trash2,
  DollarSign,
  Calendar,
  TrendingUp,
  Eye,
  X,
  Save,
  MapPin,
  Package,
} from 'lucide-react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type ProjectType = 'Building' | 'House' | 'Apartment'
type ProjectStatus = 'Planning' | 'InProgress' | 'OnHold' | 'Completed' | 'Cancelled'
type ExpenseCategory = 'Materials' | 'Labor' | 'Equipment' | 'Permits' | 'Design' | 'Utilities' | 'Insurance' | 'Other'

interface Project {
  id: string
  name: string
  project_type: ProjectType
  status: ProjectStatus
  location: string | null
  description: string | null
  start_date: string | null
  expected_completion_date: string | null
  actual_completion_date: string | null
  estimated_budget: number
  total_expenses: number
  units_count: number
  total_area: number | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface ProjectExpense {
  id: string
  project_id: string
  category: ExpenseCategory
  description: string
  amount: number
  expense_date: string
  supplier_name: string | null
  invoice_number: string | null
  payment_method: string
  notes: string | null
  recorded_by: string | null
  created_at: string
  updated_at: string
}

const projectTypeLabels: Record<ProjectType, string> = {
  Building: 'مبنى',
  House: 'منزل',
  Apartment: 'شقة',
}

const projectStatusLabels: Record<ProjectStatus, string> = {
  Planning: 'التخطيط',
  InProgress: 'قيد التنفيذ',
  OnHold: 'متوقف',
  Completed: 'مكتمل',
  Cancelled: 'ملغي',
}

const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  Materials: 'مواد',
  Labor: 'عمالة',
  Equipment: 'معدات',
  Permits: 'تراخيص',
  Design: 'تصميم',
  Utilities: 'مرافق',
  Insurance: 'تأمين',
  Other: 'أخرى',
}

const statusColors: Record<ProjectStatus, 'success' | 'warning' | 'default' | 'secondary' | 'destructive'> = {
  Planning: 'default',
  InProgress: 'warning',
  OnHold: 'secondary',
  Completed: 'success',
  Cancelled: 'destructive',
}

export function RealEstateBuildings() {
  const { user, hasPermission } = useAuth()
  const isOwner = hasPermission('manage_financial')
  
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Project dialog
  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [projectForm, setProjectForm] = useState({
    name: '',
    project_type: 'Building' as ProjectType,
    status: 'Planning' as ProjectStatus,
    location: '',
    description: '',
    start_date: '',
    expected_completion_date: '',
    estimated_budget: '',
    units_count: '',
    total_area: '',
    notes: '',
  })

  // Details dialog
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [selectedProjectExpenses, setSelectedProjectExpenses] = useState<ProjectExpense[]>([])

  // Expense dialog
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<ProjectExpense | null>(null)
  const [expenseForm, setExpenseForm] = useState({
    category: 'Materials' as ExpenseCategory,
    description: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    supplier_name: '',
    invoice_number: '',
    payment_method: 'Cash',
    notes: '',
  })

  // Delete confirmations
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleteExpenseConfirmOpen, setDeleteExpenseConfirmOpen] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('real_estate_projects')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      setProjects(data || [])
    } catch (err: any) {
      console.error('Error fetching projects:', err)
      setError(err.message || 'خطأ في تحميل المشاريع')
    } finally {
      setLoading(false)
    }
  }

  const fetchProjectExpenses = async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from('project_expenses')
        .select('*')
        .eq('project_id', projectId)
        .order('expense_date', { ascending: false })
      
      if (error) throw error
      setSelectedProjectExpenses(data || [])
    } catch (err) {
      console.error('Error fetching expenses:', err)
    }
  }

  const openProjectDialog = (project?: Project) => {
    if (project) {
      setEditingProject(project)
      setProjectForm({
        name: project.name,
        project_type: project.project_type,
        status: project.status,
        location: project.location || '',
        description: project.description || '',
        start_date: project.start_date || '',
        expected_completion_date: project.expected_completion_date || '',
        estimated_budget: project.estimated_budget.toString(),
        units_count: project.units_count.toString(),
        total_area: project.total_area?.toString() || '',
        notes: project.notes || '',
      })
    } else {
      setEditingProject(null)
      setProjectForm({
        name: '',
        project_type: 'Building',
        status: 'Planning',
        location: '',
        description: '',
        start_date: '',
        expected_completion_date: '',
        estimated_budget: '',
        units_count: '',
        total_area: '',
        notes: '',
      })
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
        project_type: projectForm.project_type,
        status: projectForm.status,
        location: projectForm.location ? sanitizeText(projectForm.location) : null,
        description: projectForm.description ? sanitizeText(projectForm.description) : null,
        start_date: projectForm.start_date || null,
        expected_completion_date: projectForm.expected_completion_date || null,
        estimated_budget: projectForm.estimated_budget ? parseFloat(projectForm.estimated_budget) : 0,
        units_count: projectForm.units_count ? parseInt(projectForm.units_count) : 0,
        total_area: projectForm.total_area ? parseFloat(projectForm.total_area) : null,
        notes: projectForm.notes ? sanitizeText(projectForm.notes) : null,
        created_by: user?.id || null,
      }

      if (editingProject) {
        const { error } = await supabase
          .from('real_estate_projects')
          .update(projectData)
          .eq('id', editingProject.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('real_estate_projects')
          .insert([projectData])
        if (error) throw error
      }

      setProjectDialogOpen(false)
      fetchProjects()
    } catch (err: any) {
      setError(err.message || 'خطأ في حفظ المشروع')
    }
  }

  const openDetailsDialog = async (project: Project) => {
    setSelectedProject(project)
    setDetailsDialogOpen(true)
    await fetchProjectExpenses(project.id)
  }

  const openExpenseDialog = (expense?: ProjectExpense) => {
    if (!selectedProject) return
    
    if (expense) {
      setEditingExpense(expense)
      setExpenseForm({
        category: expense.category,
        description: expense.description,
        amount: expense.amount.toString(),
        expense_date: expense.expense_date,
        supplier_name: expense.supplier_name || '',
        invoice_number: expense.invoice_number || '',
        payment_method: expense.payment_method,
        notes: expense.notes || '',
      })
    } else {
      setEditingExpense(null)
      setExpenseForm({
        category: 'Materials',
        description: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        supplier_name: '',
        invoice_number: '',
        payment_method: 'Cash',
        notes: '',
      })
    }
    setError(null)
    setExpenseDialogOpen(true)
  }

  const saveExpense = async () => {
    if (!isOwner || !selectedProject) return

    if (!expenseForm.description.trim() || !expenseForm.amount) {
      setError('الوصف والمبلغ مطلوبان')
      return
    }

    setError(null)
    try {
      const expenseData: any = {
        project_id: selectedProject.id,
        category: expenseForm.category,
        description: sanitizeText(expenseForm.description),
        amount: parseFloat(expenseForm.amount),
        expense_date: expenseForm.expense_date,
        supplier_name: expenseForm.supplier_name ? sanitizeText(expenseForm.supplier_name) : null,
        invoice_number: expenseForm.invoice_number ? sanitizeText(expenseForm.invoice_number) : null,
        payment_method: expenseForm.payment_method,
        notes: expenseForm.notes ? sanitizeText(expenseForm.notes) : null,
        recorded_by: user?.id || null,
      }

      if (editingExpense) {
        const { error } = await supabase
          .from('project_expenses')
          .update(expenseData)
          .eq('id', editingExpense.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('project_expenses')
          .insert([expenseData])
        if (error) throw error
      }

      setExpenseDialogOpen(false)
      await fetchProjectExpenses(selectedProject.id)
      fetchProjects() // Refresh to update total_expenses
    } catch (err: any) {
      setError(err.message || 'خطأ في حفظ المصروف')
    }
  }

  const deleteProject = async () => {
    if (!isOwner || !selectedProject) return
    try {
      const { error } = await supabase
        .from('real_estate_projects')
        .delete()
        .eq('id', selectedProject.id)
      if (error) throw error
      setDeleteConfirmOpen(false)
      setDetailsDialogOpen(false)
      fetchProjects()
    } catch (err: any) {
      setError(err.message || 'خطأ في حذف المشروع')
    }
  }

  const deleteExpense = async () => {
    if (!isOwner || !editingExpense) return
    try {
      const { error } = await supabase
        .from('project_expenses')
        .delete()
        .eq('id', editingExpense.id)
      if (error) throw error
      setDeleteExpenseConfirmOpen(false)
      setExpenseDialogOpen(false)
      if (selectedProject) {
        await fetchProjectExpenses(selectedProject.id)
        fetchProjects()
      }
    } catch (err: any) {
      setError(err.message || 'خطأ في حذف المصروف')
    }
  }

  const totalBudget = projects.reduce((sum, p) => sum + p.estimated_budget, 0)
  const totalExpenses = projects.reduce((sum, p) => sum + p.total_expenses, 0)
  const remainingBudget = totalBudget - totalExpenses

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-muted-foreground">جاري التحميل...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" />
            التطوير والبناء
          </h1>
          <p className="text-muted-foreground mt-2">
            إدارة المشاريع العقارية وتتبع التكاليف
          </p>
        </div>
        {isOwner && (
          <Button onClick={() => openProjectDialog()} size="lg" className="gap-2">
            <Plus className="h-5 w-5" />
            مشروع جديد
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

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المشاريع</CardTitle>
            <Building2 className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projects.length}</div>
            <p className="text-xs text-muted-foreground mt-1">مشروع</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">الميزانية الإجمالية</CardTitle>
            <DollarSign className="h-5 w-5 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalBudget)}</div>
            <p className="text-xs text-muted-foreground mt-1">دينار تونسي</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">إجمالي المصروفات</CardTitle>
            <TrendingUp className="h-5 w-5 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalExpenses)}</div>
            <p className="text-xs text-muted-foreground mt-1">دينار تونسي</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">المتبقي</CardTitle>
            <Calendar className="h-5 w-5 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${remainingBudget < 0 ? 'text-destructive' : 'text-primary'}`}>
              {formatCurrency(remainingBudget)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">دينار تونسي</p>
          </CardContent>
        </Card>
      </div>

      {/* Projects Table */}
      <Card>
        <CardHeader>
          <CardTitle>المشاريع</CardTitle>
          <CardDescription>قائمة بجميع المشاريع العقارية</CardDescription>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <p className="text-muted-foreground">لا توجد مشاريع بعد</p>
              {isOwner && (
                <Button 
                  onClick={() => openProjectDialog()} 
                  className="mt-4 gap-2"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" />
                  إضافة مشروع جديد
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>اسم المشروع</TableHead>
                    <TableHead>النوع</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>الموقع</TableHead>
                    <TableHead>الميزانية</TableHead>
                    <TableHead>المصروفات</TableHead>
                    <TableHead>المتبقي</TableHead>
                    <TableHead className="text-left">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((project) => {
                    const remaining = project.estimated_budget - project.total_expenses
                    return (
                      <TableRow key={project.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium">{project.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{projectTypeLabels[project.project_type]}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[project.status]}>
                            {projectStatusLabels[project.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span>{project.location || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{formatCurrency(project.estimated_budget)}</TableCell>
                        <TableCell className="text-orange-600 font-medium">{formatCurrency(project.total_expenses)}</TableCell>
                        <TableCell className={`font-medium ${remaining < 0 ? 'text-destructive' : 'text-primary'}`}>
                          {formatCurrency(remaining)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDetailsDialog(project)}
                              className="gap-1"
                            >
                              <Eye className="h-4 w-4" />
                              <span className="hidden sm:inline">عرض</span>
                            </Button>
                            {isOwner && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openProjectDialog(project)}
                                  className="gap-1"
                                >
                                  <Edit className="h-4 w-4" />
                                  <span className="hidden sm:inline">تعديل</span>
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedProject(project)
                                    setDeleteConfirmOpen(true)
                                  }}
                                  className="gap-1 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="hidden sm:inline">حذف</span>
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Project Dialog */}
      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProject ? 'تعديل المشروع' : 'مشروع جديد'}</DialogTitle>
            <DialogDescription>
              {editingProject ? 'قم بتعديل بيانات المشروع' : 'أضف مشروعاً عقارياً جديداً'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم المشروع *</Label>
                <Input
                  value={projectForm.name}
                  onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                  placeholder="أدخل اسم المشروع"
                />
              </div>
              <div className="space-y-2">
                <Label>النوع *</Label>
                <Select
                  value={projectForm.project_type}
                  onChange={(e) => setProjectForm({ ...projectForm, project_type: e.target.value as ProjectType })}
                >
                  <option value="Building">مبنى</option>
                  <option value="House">منزل</option>
                  <option value="Apartment">شقة</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الحالة</Label>
                <Select
                  value={projectForm.status}
                  onChange={(e) => setProjectForm({ ...projectForm, status: e.target.value as ProjectStatus })}
                >
                  <option value="Planning">التخطيط</option>
                  <option value="InProgress">قيد التنفيذ</option>
                  <option value="OnHold">متوقف</option>
                  <option value="Completed">مكتمل</option>
                  <option value="Cancelled">ملغي</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>الموقع</Label>
                <Input
                  value={projectForm.location}
                  onChange={(e) => setProjectForm({ ...projectForm, location: e.target.value })}
                  placeholder="أدخل الموقع"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>تاريخ البدء</Label>
                <Input
                  type="date"
                  value={projectForm.start_date}
                  onChange={(e) => setProjectForm({ ...projectForm, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>تاريخ الانتهاء المتوقع</Label>
                <Input
                  type="date"
                  value={projectForm.expected_completion_date}
                  onChange={(e) => setProjectForm({ ...projectForm, expected_completion_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>الميزانية (DT) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={projectForm.estimated_budget}
                  onChange={(e) => setProjectForm({ ...projectForm, estimated_budget: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>عدد الوحدات</Label>
                <Input
                  type="number"
                  value={projectForm.units_count}
                  onChange={(e) => setProjectForm({ ...projectForm, units_count: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>المساحة الإجمالية (م²)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={projectForm.total_area}
                  onChange={(e) => setProjectForm({ ...projectForm, total_area: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Textarea
                value={projectForm.description}
                onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                rows={3}
                placeholder="أدخل وصف المشروع"
              />
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={projectForm.notes}
                onChange={(e) => setProjectForm({ ...projectForm, notes: e.target.value })}
                rows={2}
                placeholder="أدخل ملاحظات إضافية"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProjectDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={saveProject} className="gap-2">
              <Save className="h-4 w-4" />
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Details Dialog */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>تفاصيل المشروع</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDetailsDialogOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selectedProject && (
            <div className="space-y-6">
              {/* Project Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    {selectedProject.name}
                  </CardTitle>
                  <CardDescription>معلومات المشروع الأساسية</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">النوع</p>
                      <p className="font-medium">{projectTypeLabels[selectedProject.project_type]}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">الحالة</p>
                      <Badge className={statusColors[selectedProject.status]}>
                        {projectStatusLabels[selectedProject.status]}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">الميزانية</p>
                      <p className="font-medium">{formatCurrency(selectedProject.estimated_budget)}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">المصروفات</p>
                      <p className="font-medium text-orange-600">{formatCurrency(selectedProject.total_expenses)}</p>
                    </div>
                  </div>
                  {selectedProject.location && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        الموقع
                      </p>
                      <p className="font-medium">{selectedProject.location}</p>
                    </div>
                  )}
                  {selectedProject.description && (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">الوصف</p>
                      <p className="text-sm">{selectedProject.description}</p>
                    </div>
                  )}
                  {selectedProject.start_date && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">تاريخ البدء</p>
                        <p className="font-medium">{formatDate(selectedProject.start_date)}</p>
                      </div>
                      {selectedProject.expected_completion_date && (
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">تاريخ الانتهاء المتوقع</p>
                          <p className="font-medium">{formatDate(selectedProject.expected_completion_date)}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Expenses Section */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>المصروفات</CardTitle>
                    <CardDescription>إجمالي المصروفات: {formatCurrency(selectedProject.total_expenses)}</CardDescription>
                  </div>
                  {isOwner && (
                    <Button onClick={() => openExpenseDialog()} className="gap-2">
                      <Plus className="h-4 w-4" />
                      إضافة مصروف
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {selectedProjectExpenses.length === 0 ? (
                    <div className="text-center py-12">
                      <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                      <p className="text-muted-foreground mb-4">لا توجد مصروفات</p>
                      {isOwner && (
                        <Button onClick={() => openExpenseDialog()} variant="outline" className="gap-2">
                          <Plus className="h-4 w-4" />
                          إضافة أول مصروف
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>التاريخ</TableHead>
                            <TableHead>الفئة</TableHead>
                            <TableHead>الوصف</TableHead>
                            <TableHead>المبلغ</TableHead>
                            <TableHead>المورد</TableHead>
                            {isOwner && <TableHead className="text-left">الإجراءات</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {selectedProjectExpenses.map((expense) => (
                            <TableRow key={expense.id} className="hover:bg-muted/50">
                              <TableCell>{formatDate(expense.expense_date)}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{expenseCategoryLabels[expense.category]}</Badge>
                              </TableCell>
                              <TableCell className="max-w-xs truncate">{expense.description}</TableCell>
                              <TableCell className="font-medium">{formatCurrency(expense.amount)}</TableCell>
                              <TableCell>{expense.supplier_name || '-'}</TableCell>
                              {isOwner && (
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => openExpenseDialog(expense)}
                                      className="gap-1"
                                    >
                                      <Edit className="h-4 w-4" />
                                      <span className="hidden sm:inline">تعديل</span>
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setEditingExpense(expense)
                                        setDeleteExpenseConfirmOpen(true)
                                      }}
                                      className="gap-1 text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      <span className="hidden sm:inline">حذف</span>
                                    </Button>
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Expense Dialog */}
      <Dialog open={expenseDialogOpen} onOpenChange={setExpenseDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingExpense ? 'تعديل المصروف' : 'مصروف جديد'}</DialogTitle>
            <DialogDescription>
              {editingExpense ? 'قم بتعديل بيانات المصروف' : 'أضف مصروفاً جديداً للمشروع'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الفئة *</Label>
                <Select
                  value={expenseForm.category}
                  onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value as ExpenseCategory })}
                >
                  {Object.entries(expenseCategoryLabels).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>التاريخ *</Label>
                <Input
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الوصف *</Label>
              <Input
                value={expenseForm.description}
                onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                placeholder="أدخل وصف المصروف"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>المبلغ (DT) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Select
                  value={expenseForm.payment_method}
                  onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}
                >
                  <option value="Cash">نقد</option>
                  <option value="Check">شيك</option>
                  <option value="Bank Transfer">تحويل بنكي</option>
                  <option value="Other">أخرى</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>اسم المورد</Label>
                <Input
                  value={expenseForm.supplier_name}
                  onChange={(e) => setExpenseForm({ ...expenseForm, supplier_name: e.target.value })}
                  placeholder="أدخل اسم المورد"
                />
              </div>
              <div className="space-y-2">
                <Label>رقم الفاتورة</Label>
                <Input
                  value={expenseForm.invoice_number}
                  onChange={(e) => setExpenseForm({ ...expenseForm, invoice_number: e.target.value })}
                  placeholder="أدخل رقم الفاتورة"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={expenseForm.notes}
                onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                rows={2}
                placeholder="أدخل ملاحظات إضافية"
              />
            </div>
          </div>
          <DialogFooter>
            {editingExpense && (
              <Button
                variant="destructive"
                onClick={() => {
                  setExpenseDialogOpen(false)
                  setDeleteExpenseConfirmOpen(true)
                }}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                حذف
              </Button>
            )}
            <Button variant="outline" onClick={() => setExpenseDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={saveExpense} className="gap-2">
              <Save className="h-4 w-4" />
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmations */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        onConfirm={deleteProject}
        title="حذف المشروع"
        description={`هل أنت متأكد من حذف المشروع "${selectedProject?.name}"؟ سيتم حذف جميع المصروفات المرتبطة به أيضاً.`}
      />
      <ConfirmDialog
        open={deleteExpenseConfirmOpen}
        onOpenChange={setDeleteExpenseConfirmOpen}
        onConfirm={deleteExpense}
        title="حذف المصروف"
        description="هل أنت متأكد من حذف هذا المصروف؟"
      />
    </div>
  )
}
