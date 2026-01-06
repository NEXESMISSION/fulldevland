export type LandStatus = 'Available' | 'Reserved' | 'Sold' | 'Cancelled'
export type PaymentType = 'Full' | 'Installment'
export type SaleStatus = 'Pending' | 'AwaitingPayment' | 'InstallmentsOngoing' | 'Completed' | 'Cancelled'
export type ReservationStatus = 'Pending' | 'Confirmed' | 'Cancelled' | 'Expired'
export type ExpenseStatus = 'Pending' | 'Approved' | 'Rejected'
export type PaymentMethod = 'Cash' | 'BankTransfer' | 'Check' | 'CreditCard' | 'Other'
export type InstallmentStatus = 'Unpaid' | 'Paid' | 'Late' | 'Partial'
export type PaymentRecordType = 'BigAdvance' | 'SmallAdvance' | 'Installment' | 'Full' | 'Partial' | 'Field' | 'Refund'
export type UserRole = 'Owner' | 'Worker'
export type UserStatus = 'Active' | 'Inactive'
export type WorkerAvailabilityStatus = 'Available' | 'Busy' | 'Unavailable'
export type ConversationStatus = 'open' | 'closed'
export type NotificationType = 'new_message' | 'task_update' | 'system'
export type RecurrenceType = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly'

export interface Role {
  id: string
  name: UserRole
  permissions: Record<string, boolean>
  created_at: string
  updated_at: string
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  sidebar_order?: string[] | null
  created_at: string
  updated_at: string
}

export interface PermissionTemplate {
  id: string
  name: string
  description: string | null
  permissions: Record<string, boolean>
  created_at: string
  updated_at: string
}

export interface UserPermission {
  id: string
  user_id: string
  resource_type: 'land' | 'client' | 'sale' | 'payment' | 'report' | 'user' | 'expense'
  permission_type: 'view' | 'create' | 'edit' | 'delete' | 'export'
  granted: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LandBatch {
  id: string
  name: string
  location: string | null
  total_surface: number
  total_cost: number
  date_acquired: string
  notes: string | null
  real_estate_tax_number: string | null
  price_per_m2_full?: number | null
  price_per_m2_installment?: number | null
  company_fee_percentage_full?: number | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LandPiece {
  id: string
  land_batch_id: string
  piece_number: string
  surface_area: number
  purchase_cost: number
  selling_price_full: number
  selling_price_installment: number
  status: LandStatus
  reserved_until: string | null
  reservation_client_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
  payment_offers?: PaymentOffer[]
}

export interface PaymentOffer {
  id: string
  land_batch_id: string | null
  land_piece_id: string | null
  price_per_m2_installment: number | null
  company_fee_percentage: number
  advance_amount: number
  advance_is_percentage: boolean
  monthly_payment: number
  number_of_months: number | null
  offer_name: string | null
  notes: string | null
  is_default: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Client {
  id: string
  name: string
  cin: string
  phone: string | null
  email: string | null
  address: string | null
  client_type: string
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Reservation {
  id: string
  client_id: string
  land_piece_ids: string[]
  small_advance_amount: number
  reservation_date: string
  reserved_until: string
  status: ReservationStatus
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Sale {
  id: string
  client_id: string
  land_piece_ids: string[]
  reservation_id: string | null
  payment_type: PaymentType
  total_purchase_cost: number
  total_selling_price: number
  profit_margin: number
  small_advance_amount: number
  big_advance_amount: number
  company_fee_percentage: number | null
  company_fee_amount: number | null
  installment_start_date: string | null
  installment_end_date: string | null
  number_of_installments: number | null
  monthly_installment_amount: number | null
  selected_offer_id: string | null
  status: SaleStatus
  sale_date: string
  deadline_date: string | null
  notes: string | null
  created_by: string | null
  confirmed_by: string | null
  created_at: string
  updated_at: string
}

export interface Installment {
  id: string
  sale_id: string
  installment_number: number
  amount_due: number
  amount_paid: number
  stacked_amount: number
  due_date: string
  paid_date: string | null
  status: InstallmentStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  client_id: string
  sale_id: string | null
  installment_id: string | null
  reservation_id: string | null
  amount_paid: number
  payment_type: PaymentRecordType
  payment_date: string
  payment_method: string
  notes: string | null
  recorded_by: string | null
  created_at: string
  updated_at: string
}

export interface AuditLog {
  id: string
  user_id: string | null
  action: string
  table_name: string
  record_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

export interface Debt {
  id: string
  creditor_name: string
  amount_owed: number
  due_date: string
  check_number: string | null
  reference_number: string | null
  notes: string | null
  status: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      roles: {
        Row: Role
        Insert: Omit<Role, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Role, 'id'>>
      }
      users: {
        Row: User
        Insert: Omit<User, 'created_at' | 'updated_at'>
        Update: Partial<Omit<User, 'id'>>
      }
      land_batches: {
        Row: LandBatch
        Insert: Omit<LandBatch, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<LandBatch, 'id'>>
      }
      land_pieces: {
        Row: LandPiece
        Insert: Omit<LandPiece, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<LandPiece, 'id'>>
      }
      clients: {
        Row: Client
        Insert: Omit<Client, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Client, 'id'>>
      }
      reservations: {
        Row: Reservation
        Insert: Omit<Reservation, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Reservation, 'id'>>
      }
      sales: {
        Row: Sale
        Insert: Omit<Sale, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Sale, 'id'>>
      }
      installments: {
        Row: Installment
        Insert: Omit<Installment, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Installment, 'id'>>
      }
      payments: {
        Row: Payment
        Insert: Omit<Payment, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Payment, 'id'>>
      }
      audit_logs: {
        Row: AuditLog
        Insert: Omit<AuditLog, 'id' | 'created_at'>
        Update: never
      }
      expense_categories: {
        Row: ExpenseCategory
        Insert: Omit<ExpenseCategory, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ExpenseCategory, 'id'>>
      }
      expenses: {
        Row: Expense
        Insert: Omit<Expense, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Expense, 'id'>>
      }
      worker_profiles: {
        Row: WorkerProfile
        Insert: Omit<WorkerProfile, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<WorkerProfile, 'id'>>
      }
      conversations: {
        Row: Conversation
        Insert: Omit<Conversation, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Conversation, 'id'>>
      }
      messages: {
        Row: Message
        Insert: Omit<Message, 'id' | 'created_at'>
        Update: Partial<Omit<Message, 'id' | 'created_at'>>
      }
      notifications: {
        Row: Notification
        Insert: Omit<Notification, 'id' | 'created_at'>
        Update: Partial<Omit<Notification, 'id' | 'created_at'>>
      }
    }
  }
}

export interface ExpenseCategory {
  id: string
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface Expense {
  id: string
  category: string // Changed from category_id to match database column
  amount: number
  expense_date: string
  description: string | null
  payment_method: PaymentMethod
  receipt_url: string | null
  related_batch_id: string | null
  related_sale_id: string | null
  tags: string[] | null
  status: ExpenseStatus
  submitted_by: string
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  notes: string | null
  created_at: string
  updated_at: string
  // Recurring expense fields
  is_recurring?: boolean
  is_revenue?: boolean
  recurrence_type?: RecurrenceType | null
  recurrence_day?: number | null
  recurrence_time?: string | null // TIME format (HH:MM:SS)
  recurrence_template_id?: string | null
  next_occurrence_date?: string | null
  last_generated_date?: string | null
}

export interface RecurringExpenseTemplate {
  id: string
  name: string
  category_id: string
  amount: number
  description: string | null
  payment_method: PaymentMethod
  is_revenue: boolean
  recurrence_type: RecurrenceType
  recurrence_day: number
  recurrence_time: string // TIME format (HH:MM:SS)
  is_active: boolean
  next_occurrence_date: string
  last_generated_date: string | null
  related_batch_id: string | null
  related_sale_id: string | null
  tags: string[] | null
  created_by: string
  created_at: string
  updated_at: string
}

export interface WorkerProfile {
  id: string
  user_id: string
  worker_type: string
  region: string | null
  skills: string[] | null
  availability: WorkerAvailabilityStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  subject: string
  created_by: string
  worker_id: string
  status: ConversationStatus
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  reference_id: string | null
  is_read: boolean
  created_at: string
}
