# Database Schema Documentation

Complete database structure and table definitions for FULLLANDDEV.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Enum Types](#enum-types)
3. [Core Tables](#core-tables)
4. [Relationships](#relationships)
5. [Indexes](#indexes)
6. [Functions & Triggers](#functions--triggers)
7. [Row Level Security](#row-level-security)
8. [Views](#views)

---

## 📊 Overview

The database uses **PostgreSQL** via Supabase with:
- **UUID** primary keys
- **Row Level Security (RLS)** for access control
- **Audit logging** for all operations
- **Foreign key constraints** for data integrity
- **Enums** for type safety

---

## 🔤 Enum Types

### `land_status`
Land piece availability status:
- `Available` - Ready for sale
- `Reserved` - Temporarily reserved
- `Sold` - Sold to client
- `Cancelled` - Cancelled/removed

### `payment_type`
Payment method for sales:
- `Full` - One-time full payment
- `Installment` - Monthly installments

### `sale_status`
Sale transaction status:
- `Pending` - Created but not confirmed
- `AwaitingPayment` - Waiting for payment
- `InstallmentsOngoing` - Installments active
- `Completed` - Fully paid
- `Cancelled` - Sale cancelled

### `reservation_status`
Reservation status:
- `Pending` - Awaiting confirmation
- `Confirmed` - Confirmed reservation
- `Cancelled` - Cancelled
- `Expired` - Expired reservation

### `installment_status`
Installment payment status:
- `Unpaid` - Not yet paid
- `Paid` - Fully paid
- `Late` - Past due date
- `Partial` - Partially paid

### `payment_record_type`
Types of payment records:
- `BigAdvance` - Large upfront payment
- `SmallAdvance` - Small reservation payment
- `Installment` - Regular monthly payment
- `Full` - Complete payment
- `Partial` - Partial payment
- `Field` - Field payment
- `Refund` - Refund payment

### `user_role`
User permission levels:
- `Owner` - Full access
- `Manager` - Operational access
- `FieldStaff` - Limited access

### `user_status`
User account status:
- `Active` - Can login
- `Inactive` - Cannot login

---

## 📦 Core Tables

### `roles`
Defines role permissions.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | user_role | Role name (Owner/Manager/FieldStaff) |
| `permissions` | JSONB | Permission object |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Permissions JSONB Structure**:
```json
{
  "view_dashboard": true,
  "view_land": true,
  "edit_land": true,
  "delete_land": true,
  ...
}
```

---

### `users`
System users linked to Supabase Auth.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key (references auth.users) |
| `name` | VARCHAR(255) | User's full name |
| `email` | VARCHAR(255) | Email address (unique) |
| `role` | user_role | User role (default: FieldStaff) |
| `status` | user_status | Account status (default: Active) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Constraints**:
- `id` references `auth.users(id)` ON DELETE CASCADE
- `email` is UNIQUE

---

### `land_batches`
Groups of land purchased together.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Batch name |
| `total_surface` | DECIMAL(15,2) | Total area in m² |
| `total_cost` | DECIMAL(15,2) | Total purchase cost |
| `date_acquired` | DATE | Purchase date |
| `real_estate_tax_number` | VARCHAR(100) | Tax number (optional) |
| `notes` | TEXT | Additional notes |
| `created_by` | UUID | User who created (references users) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Constraints**:
- `name` is NOT NULL
- `total_surface` is NOT NULL
- `total_cost` is NOT NULL
- `date_acquired` is NOT NULL

---

### `land_pieces`
Individual land plots within batches.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `land_batch_id` | UUID | Batch (references land_batches) |
| `piece_number` | VARCHAR(50) | Piece identifier |
| `surface_area` | DECIMAL(15,2) | Area in m² |
| `purchase_cost` | DECIMAL(15,2) | Cost from batch |
| `selling_price_full` | DECIMAL(15,2) | Full payment price |
| `selling_price_installment` | DECIMAL(15,2) | Installment price |
| `status` | land_status | Current status (default: Available) |
| `reserved_until` | TIMESTAMPTZ | Reservation expiry |
| `reservation_client_id` | UUID | Reserved by client |
| `notes` | TEXT | Additional notes |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Constraints**:
- `land_batch_id` + `piece_number` is UNIQUE
- `land_batch_id` references `land_batches(id)` ON DELETE CASCADE

**Indexes**:
- `idx_land_pieces_status` on `status`
- `idx_land_pieces_batch` on `land_batch_id`

---

### `clients`
Customer information.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `name` | VARCHAR(255) | Client name |
| `cin` | VARCHAR(50) | National ID number |
| `phone` | VARCHAR(50) | Phone number |
| `email` | VARCHAR(255) | Email address |
| `address` | TEXT | Physical address |
| `client_type` | VARCHAR(50) | Type (Individual/Company) |
| `notes` | TEXT | Additional notes |
| `created_by` | UUID | User who created |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Constraints**:
- `name` is NOT NULL
- `cin` is NOT NULL

**Indexes**:
- `idx_clients_cin` on `cin`

---

### `sales`
Sales transactions.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `client_id` | UUID | Client (references clients) |
| `land_piece_ids` | UUID[] | Array of piece IDs |
| `payment_type` | payment_type | Full or Installment |
| `total_price` | DECIMAL(15,2) | Total sale price |
| `total_cost` | DECIMAL(15,2) | Total cost |
| `profit` | DECIMAL(15,2) | Calculated profit |
| `sale_date` | DATE | Sale date |
| `reservation_amount` | DECIMAL(15,2) | Reservation paid |
| `big_advance_amount` | DECIMAL(15,2) | Large advance |
| `big_advance_confirmed` | BOOLEAN | Advance confirmed |
| `big_advance_due_date` | DATE | Advance due date |
| `number_of_installments` | INTEGER | Installment count |
| `monthly_installment_amount` | DECIMAL(15,2) | Monthly payment |
| `installment_start_date` | DATE | First installment date |
| `status` | sale_status | Sale status |
| `is_confirmed` | BOOLEAN | Confirmation status |
| `notes` | TEXT | Additional notes |
| `created_by` | UUID | User who created |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Constraints**:
- `client_id` references `clients(id)` ON DELETE RESTRICT
- `land_piece_ids` is NOT NULL array

---

### `installments`
Monthly installment schedule.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `sale_id` | UUID | Sale (references sales) |
| `installment_number` | INTEGER | Installment sequence |
| `due_date` | DATE | Payment due date |
| `amount` | DECIMAL(15,2) | Installment amount |
| `status` | installment_status | Payment status |
| `paid_amount` | DECIMAL(15,2) | Amount paid (supports stacking) |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Constraints**:
- `sale_id` references `sales(id)` ON DELETE CASCADE
- `installment_number` is NOT NULL
- `due_date` is NOT NULL
- `amount` is NOT NULL

**Indexes**:
- `idx_installments_sale` on `sale_id`
- `idx_installments_due_date` on `due_date`

---

### `payment_records`
Payment transaction records.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `sale_id` | UUID | Sale (references sales) |
| `installment_id` | UUID | Installment (references installments, nullable) |
| `payment_type` | payment_record_type | Payment type |
| `amount` | DECIMAL(15,2) | Payment amount |
| `payment_date` | DATE | Payment date |
| `notes` | TEXT | Additional notes |
| `created_by` | UUID | User who recorded |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

**Constraints**:
- `sale_id` references `sales(id)` ON DELETE CASCADE
- `installment_id` references `installments(id)` ON DELETE CASCADE (nullable)
- `amount` is NOT NULL
- `payment_date` is NOT NULL

**Indexes**:
- `idx_payment_records_sale` on `sale_id`
- `idx_payment_records_date` on `payment_date`

---

### `reservations`
Preliminary reservations with small advance.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `client_id` | UUID | Client (references clients) |
| `land_piece_ids` | UUID[] | Array of piece IDs |
| `small_advance_amount` | DECIMAL(15,2) | Reservation amount |
| `reservation_date` | DATE | Reservation date |
| `reserved_until` | DATE | Expiry date |
| `status` | reservation_status | Reservation status |
| `notes` | TEXT | Additional notes |
| `created_by` | UUID | User who created |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

**Constraints**:
- `client_id` references `clients(id)` ON DELETE RESTRICT
- `land_piece_ids` is NOT NULL array

---

### `debts` (Optional)
Debt tracking.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `client_id` | UUID | Client (references clients) |
| `amount` | DECIMAL(15,2) | Debt amount |
| `description` | TEXT | Debt description |
| `date` | DATE | Debt date |
| `created_by` | UUID | User who created |
| `created_at` | TIMESTAMPTZ | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Last update timestamp |

---

### `debt_payments` (Optional)
Debt payment records.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `debt_id` | UUID | Debt (references debts) |
| `amount` | DECIMAL(15,2) | Payment amount |
| `payment_date` | DATE | Payment date |
| `notes` | TEXT | Additional notes |
| `created_by` | UUID | User who recorded |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

### `audit_logs`
System activity tracking.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | User who performed action |
| `action` | VARCHAR(50) | Action type (INSERT/UPDATE/DELETE) |
| `table_name` | VARCHAR(100) | Table affected |
| `record_id` | UUID | Record ID |
| `old_data` | JSONB | Previous data (for updates) |
| `new_data` | JSONB | New data |
| `ip_address` | INET | User IP address |
| `created_at` | TIMESTAMPTZ | Action timestamp |

**Indexes**:
- `idx_audit_logs_user` on `user_id`
- `idx_audit_logs_table` on `table_name`
- `idx_audit_logs_created` on `created_at`

---

### `login_attempts` (Optional)
Login attempt tracking.

| Column | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `email` | VARCHAR(255) | Email attempted |
| `success` | BOOLEAN | Login success |
| `attempted_at` | TIMESTAMPTZ | Attempt timestamp |
| `ip_address` | INET | IP address |
| `user_agent` | TEXT | Browser user agent |

**Indexes**:
- `idx_login_attempts_email` on `email, attempted_at`
- `idx_login_attempts_ip` on `ip_address, attempted_at`

---

## 🔗 Relationships

### Entity Relationship Diagram

```
users
  ├── land_batches (created_by)
  ├── clients (created_by)
  ├── sales (created_by)
  ├── audit_logs (user_id)
  └── payment_records (created_by)

land_batches
  └── land_pieces (land_batch_id)

clients
  ├── sales (client_id)
  ├── reservations (client_id)
  ├── debts (client_id)
  └── land_pieces (reservation_client_id)

sales
  ├── installments (sale_id)
  └── payment_records (sale_id)

installments
  └── payment_records (installment_id)

debts
  └── debt_payments (debt_id)
```

### Foreign Key Constraints

- **CASCADE DELETE**: When parent is deleted, children are deleted
  - `land_pieces` → `land_batches`
  - `installments` → `sales`
  - `payment_records` → `sales`, `installments`

- **RESTRICT DELETE**: Cannot delete parent if children exist
  - `sales` → `clients`
  - `reservations` → `clients`

---

## 📇 Indexes

Indexes improve query performance:

- `idx_clients_cin` - Fast client lookup by CIN
- `idx_land_pieces_status` - Filter pieces by status
- `idx_land_pieces_batch` - Get pieces by batch
- `idx_installments_sale` - Get installments by sale
- `idx_installments_due_date` - Find due installments
- `idx_payment_records_sale` - Get payments by sale
- `idx_payment_records_date` - Filter payments by date
- `idx_audit_logs_user` - Get logs by user
- `idx_audit_logs_table` - Get logs by table
- `idx_audit_logs_created` - Sort logs by date

---

## ⚙️ Functions & Triggers

### Audit Functions

**`log_audit()`**:
- Automatically logs all INSERT/UPDATE/DELETE operations
- Captures user, action, table, and data changes
- Triggered by database triggers

### Permission Functions

**`get_user_role()`**:
- Returns current user's role
- Used in RLS policies
- Returns `user_role` enum

### Update Timestamp Triggers

**`update_updated_at_column()`**:
- Automatically updates `updated_at` timestamp
- Triggered on UPDATE operations
- Applied to all tables with `updated_at` column

---

## 🔒 Row Level Security (RLS)

All tables have RLS enabled for security.

### RLS Policies

**General Pattern**:
- **SELECT**: Users can view data based on role
- **INSERT**: Users can create data (with restrictions)
- **UPDATE**: Users can edit based on role
- **DELETE**: Only Owners can delete

### Example Policy (land_batches)

```sql
-- Owners and Managers can view all
CREATE POLICY "Owners and Managers can view land batches"
  ON land_batches FOR SELECT
  TO authenticated
  USING (get_user_role() IN ('Owner', 'Manager'));

-- FieldStaff can only view
CREATE POLICY "FieldStaff can view land batches"
  ON land_batches FOR SELECT
  TO authenticated
  USING (get_user_role() = 'FieldStaff');

-- Only Owners and Managers can insert
CREATE POLICY "Owners and Managers can insert land batches"
  ON land_batches FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Only Owners can delete
CREATE POLICY "Only Owners can delete land batches"
  ON land_batches FOR DELETE
  TO authenticated
  USING (get_user_role() = 'Owner');
```

---

## 👁️ Views

### `sales_public`
Public sales view (hides sensitive cost/profit data).

**Columns**:
- All sales columns except `total_cost` and `profit`

**Used by**: Managers and FieldStaff who shouldn't see costs.

### `land_pieces_public`
Public land pieces view.

**Columns**:
- All columns except `purchase_cost`

**Used by**: FieldStaff who shouldn't see purchase costs.

---

## 📝 Data Types Reference

| Type | Description | Example |
|------|-------------|---------|
| `UUID` | Unique identifier | `550e8400-e29b-41d4-a716-446655440000` |
| `VARCHAR(n)` | Variable string | `VARCHAR(255)` |
| `TEXT` | Unlimited text | Long descriptions |
| `DECIMAL(p,s)` | Decimal number | `DECIMAL(15,2)` for money |
| `INTEGER` | Whole number | `INTEGER` for counts |
| `BOOLEAN` | True/False | `BOOLEAN` for flags |
| `DATE` | Date only | `2026-01-15` |
| `TIMESTAMPTZ` | Date + time + timezone | `2026-01-15 10:30:00+00` |
| `UUID[]` | Array of UUIDs | `{uuid1, uuid2, uuid3}` |
| `JSONB` | JSON data | `{"key": "value"}` |
| `INET` | IP address | `192.168.1.1` |

---

## 🔍 Common Queries

### Get All Available Pieces

```sql
SELECT * FROM land_pieces 
WHERE status = 'Available'
ORDER BY piece_number;
```

### Get Client's Sales

```sql
SELECT s.*, c.name as client_name
FROM sales s
JOIN clients c ON s.client_id = c.id
WHERE s.client_id = 'client-uuid'
ORDER BY s.sale_date DESC;
```

### Get Overdue Installments

```sql
SELECT i.*, s.client_id, c.name as client_name
FROM installments i
JOIN sales s ON i.sale_id = s.id
JOIN clients c ON s.client_id = c.id
WHERE i.due_date < CURRENT_DATE
  AND i.status != 'Paid'
ORDER BY i.due_date;
```

---

## 📚 Additional Resources

- [SQL Migrations Guide](./05_SQL_Migrations.md)
- [API Reference](./09_API_Reference.md)
- [Security Documentation](./06_Security.md)

---

**Last Updated**: January 2026

