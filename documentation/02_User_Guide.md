# User Guide

Complete guide to using FULLLANDDEV - all features explained step by step.

---

## 📑 Table of Contents

1. [Dashboard](#dashboard)
2. [Land Management](#land-management)
3. [Land Availability](#land-availability)
4. [Client Management](#client-management)
5. [Sales Management](#sales-management)
6. [Installments & Payments](#installments--payments)
7. [Financial Reports](#financial-reports)
8. [Debt Management](#debt-management)
9. [User Management](#user-management)
10. [Security & Audit Logs](#security--audit-logs)

---

## 🏠 Dashboard

The dashboard provides an overview of your business at a glance.

### What You'll See

- **Total Land Pieces** - Count of all land pieces
- **Available Pieces** - Pieces ready for sale
- **Total Clients** - Number of registered clients
- **Total Sales** - All sales count
- **Overdue Installments** - Payments that are late
- **Recent Activity** - Latest operations

### Navigation

- Click any card to go to the related page
- Use sidebar to navigate to specific sections

---

## 🗺️ Land Management

Manage land batches and individual pieces.

### Creating a Land Batch

1. Click **"إدارة الأراضي"** (Land Management) in sidebar
2. Click **"إضافة دفعة جديدة"** (Add New Batch)
3. Fill in batch information:
   - **اسم الدفعة** (Batch Name) - Required
   - **إجمالي المساحة (م²)** (Total Surface) - Optional for flexible mode
   - **إجمالي التكلفة (DT)** (Total Cost) - Optional for flexible mode
   - **تاريخ الشراء** (Purchase Date) - Required
   - **رقم الضريبة العقارية** (Real Estate Tax Number) - Optional
   - **سعر المتر المربع (دفع كامل)** (Price per m² - Full Payment)
   - **سعر المتر المربع (أقساط)** (Price per m² - Installments)
   - **ملاحظات** (Notes) - Optional

### Piece Generation Modes

#### 1. **بدون تقسيم** (No Division)
- Manually add pieces later
- No automatic generation

#### 2. **موحد (نفس الحجم)** (Uniform - Same Size)
- All pieces have the same size
- Enter piece size (e.g., 400 m²)
- System calculates number of pieces

**Example**: 10,000 m² ÷ 400 m² = 25 pieces

#### 3. **مخصص مرن (تحكم كامل في الترقيم)** (Custom Flexible - Full Control)
Most flexible option - create pieces with different types:

**Available Types:**

- **نطاق تلقائي** (Auto Range)
  - Creates pieces from number X to number Y
  - All same size
  - Example: Pieces #1 to #10, each 400 m²

- **قطعة مخصصة** (Custom Piece)
  - Create a specific piece with custom number
  - Custom size
  - Example: Piece #25, 350 m²

- **موحد (نفس الحجم)** (Uniform)
  - Multiple pieces of same size
  - Example: 5 pieces, each 500 m²

- **تلقائي ذكي** (Auto Smart)
  - Automatically creates pieces with sizes between min and max
  - Uses preferred size when possible
  - Example: Min 200, Max 600, Preferred 400

- **محسّن** (Smart/Optimized)
  - Optimizes piece sizes to minimize waste
  - Strategies: Balanced, Max Pieces, Min Waste

**How to Use Flexible Mode:**

1. Select **"مخصص مرن"** as generation mode
2. Click **"إضافة تكوين"** (Add Configuration)
3. Select piece type
4. Fill in details:
   - For Auto Range: Start number, count, size
   - For Custom: Piece number, size
   - For Uniform: Count, size
   - For Auto Smart: Min, max, preferred sizes
5. Click **"إضافة"** (Add)
6. Repeat to add more piece types
7. Review preview at bottom
8. Click **"حفظ"** (Save)

**Note**: In flexible mode, total surface and cost are optional - they're calculated from pieces.

#### 4. **مختلط** (Mixed)
- Define multiple piece configurations
- Each configuration: count and size
- Remaining area becomes "rest" pieces

**Example**:
- 50 pieces × 900 m² = 45,000 m²
- 20 pieces × 200 m² = 4,000 m²
- Rest: 1,000 m² ÷ 400 m² = 2.5 → 2 pieces

#### 5. **تلقائي** (Auto)
- Automatically generates pieces
- Sizes between min and max
- Prefers preferred size

**Settings**:
- **الحد الأدنى** (Min Size): e.g., 200 m²
- **الحد الأقصى** (Max Size): e.g., 600 m²
- **الحجم المفضل** (Preferred Size): e.g., 400 m²

#### 6. **ذكي** (Smart)
- Optimizes piece distribution
- Minimizes waste
- Maximizes piece count

**Optimization Strategies**:
- **متوازن** (Balanced) - Best overall
- **أقصى عدد قطع** (Max Pieces) - More pieces
- **أقل هدر** (Min Waste) - Less waste

### Editing a Batch

1. Click **"تعديل"** (Edit) on the batch
2. Modify information
3. Click **"حفظ"** (Save)

**Note**: Changing generation mode will regenerate pieces (may delete existing pieces).

### Deleting a Batch

1. Click **"حذف"** (Delete) on the batch
2. Confirm deletion
3. **Warning**: This deletes all pieces in the batch!

**Permissions**: Only Owners can delete batches.

### Viewing Pieces

1. Click **"عرض"** (View) or expand batch
2. See all pieces with:
   - Piece number
   - Surface area
   - Status (Available, Reserved, Sold, Cancelled)
   - Cost
   - Prices (Full/Installment)

### Editing Individual Pieces

1. Expand batch to see pieces
2. Click **"تعديل"** (Edit) on a piece
3. Modify:
   - Surface area
   - Status
   - Cost
   - Prices
4. Click **"حفظ"** (Save)

---

## 📍 Land Availability

View and search available land pieces.

### Features

- **Search** by piece number or batch name
- **Filter** by status (Available, Reserved, Sold)
- **Sort** by piece number, surface, or price
- **View Details** - Click piece to see full information

### Using Availability Page

1. Go to **"توفر الأراضي"** (Land Availability)
2. Use search bar to find specific pieces
3. Use filters to narrow results
4. Click piece to view details
5. Use in sales creation (pieces appear in sales dialog)

---

## 👥 Client Management

Manage client information and track their purchases.

### Creating a Client

1. Go to **"العملاء"** (Clients)
2. Click **"إضافة عميل جديد"** (Add New Client)
3. Fill in:
   - **الاسم** (Name) - Required
   - **الهاتف** (Phone) - Required
   - **العنوان** (Address) - Optional
   - **رقم البطاقة الوطنية** (CIN) - Optional
   - **ملاحظات** (Notes) - Optional
4. Click **"حفظ"** (Save)

### Editing a Client

1. Find client in list
2. Click **"تعديل"** (Edit)
3. Modify information
4. Click **"حفظ"** (Save)

### Viewing Client Details

1. Click on client name or **"عرض"** (View)
2. See:
   - Contact information
   - Sales history
   - Total purchases
   - Payment status
   - Installments

### Deleting a Client

1. Click **"حذف"** (Delete)
2. Confirm deletion
3. **Warning**: This removes client and their sales history!

**Permissions**: Only Owners can delete clients.

### Searching Clients

- Use search bar to find by:
  - Name
  - Phone number
  - CIN number
  - Address

---

## 💰 Sales Management

Create and manage sales transactions.

### Creating a Sale

1. Go to **"المبيعات"** (Sales)
2. Click **"إضافة بيع جديد"** (Add New Sale)
3. Select or create client:
   - **Search** existing client by name, phone, or ID
   - Or click **"إضافة عميل جديد"** to create new client
4. Select land pieces:
   - **Search** by piece number
   - Click pieces to select (can select multiple)
   - Selected pieces show in list below
5. Choose payment type:
   - **دفع كامل** (Full Payment)
   - **أقساط** (Installments)
6. If Installments:
   - **عدد الأشهر** (Number of Months) - Enter custom number
   - **عربون كبير** (Big Advance) - Amount paid upfront
   - **عربون صغير** (Small Advance/Reservation) - Optional
7. If Full Payment:
   - **عربون** (Reservation) - Optional upfront payment
8. Click **"حفظ"** (Save)

### Sale Statuses

- **Pending** - Created but not confirmed
- **AwaitingPayment** - Waiting for payment
- **InstallmentsOngoing** - Installments active
- **Completed** - Fully paid
- **Cancelled** - Sale cancelled

### Viewing Sales

Sales are displayed in a table showing:
- Client name
- Piece numbers
- Total price
- Payment type
- Status
- Date

### Editing Sales

1. Find sale in list
2. Click **"تعديل"** (Edit)
3. Modify:
   - Client
   - Pieces
   - Payment type
   - Prices
4. Click **"حفظ"** (Save)

**Note**: Some fields may be locked after payments are recorded.

### Confirming Full Payment

1. Open sale details
2. If payment type is "Full Payment"
3. Click **"تأكيد الدفع الكامل"** (Confirm Full Payment)
4. Enter payment amount
5. Click **"تأكيد"** (Confirm)

### Viewing Sale Details

Click on a sale to see:
- Client information
- Piece details
- Payment history
- Installment schedule (if applicable)
- Profit calculation

---

## 💳 Installments & Payments

Track and record installment payments.

### Viewing Installments

1. Go to **"الأقساط"** (Installments)
2. See all upcoming and overdue installments
3. Filter by:
   - Month
   - Client
   - Status (Unpaid, Paid, Late, Partial)

### Recording a Payment

1. Find the installment
2. Click **"تسجيل دفعة"** (Record Payment)
3. Enter:
   - **المبلغ** (Amount)
   - **تاريخ الدفع** (Payment Date)
   - **نوع الدفعة** (Payment Type):
     - **قسط** (Installment) - Regular monthly payment
     - **عربون كبير** (Big Advance) - Large upfront payment
     - **عربون صغير** (Small Advance) - Small reservation
     - **دفع كامل** (Full Payment) - Complete payment
     - **جزئي** (Partial) - Partial payment
     - **ميداني** (Field) - Field payment
     - **استرداد** (Refund) - Refund
4. Click **"حفظ"** (Save)

### Payment Stacking

The system supports **payment stacking**:
- Multiple payments can be recorded for the same installment
- System automatically calculates remaining balance
- Example: If installment is 500 DT and you pay 200 DT, remaining is 300 DT

### Installment Status

- **Unpaid** - Not yet paid
- **Paid** - Fully paid
- **Late** - Past due date
- **Partial** - Partially paid

### Viewing Payment History

1. Click on installment
2. See all payments recorded
3. View:
   - Payment dates
   - Amounts
   - Payment types
   - Remaining balance

### Monthly Summary

The installments page shows:
- **Total Due This Month** - All installments due
- **Overdue Amount** - Past due payments
- **Client Summary** - Per-client breakdown

---

## 📊 Financial Reports

View financial analytics and reports.

### Financial Dashboard

Shows:
- **Total Revenue** - All sales income
- **Total Profit** - Revenue minus costs
- **Profit Margin** - Percentage
- **Monthly Trends** - Revenue over time
- **Payment Status** - Paid vs. pending

### Reports Available

1. **Revenue Report**
   - Total sales
   - By month
   - By client
   - By payment type

2. **Profit Analysis**
   - Profit per sale
   - Profit margin
   - Cost breakdown

3. **Payment Tracking**
   - Received payments
   - Pending payments
   - Overdue amounts

### Viewing Reports

1. Go to **"المالية"** (Financial)
2. Select report type
3. Choose date range
4. View charts and tables
5. Export data (if available)

**Permissions**: Profit details visible only to Owners and Managers.

---

## 📉 Debt Management

Track and manage debts.

### Creating a Debt

1. Go to **"الديون"** (Debts)
2. Click **"إضافة دين جديد"** (Add New Debt)
3. Fill in:
   - **العميل** (Client) - Select client
   - **المبلغ** (Amount) - Debt amount
   - **التاريخ** (Date) - Debt date
   - **الوصف** (Description) - Optional notes
4. Click **"حفظ"** (Save)

### Recording Debt Payments

1. Find debt in list
2. Click **"تسجيل دفعة"** (Record Payment)
3. Enter:
   - **المبلغ** (Amount)
   - **التاريخ** (Date)
   - **الوصف** (Description)
4. Click **"حفظ"** (Save)

### Viewing Debt History

- Total debt amount
- Paid amount
- Remaining balance
- Payment history
- Payment dates

---

## 👤 User Management

Manage user accounts and permissions.

**Note**: Only Owners can access this page.

### Creating a User

1. Go to **"المستخدمين"** (Users)
2. Click **"إضافة مستخدم جديد"** (Add New User)
3. Fill in:
   - **الاسم** (Name)
   - **البريد الإلكتروني** (Email)
   - **الدور** (Role):
     - **Owner** - Full access
     - **Manager** - Operational access
     - **FieldStaff** - Limited access
4. Click **"حفظ"** (Save)
5. User will receive email to set password (if email configured)

### Editing a User

1. Find user in list
2. Click **"تعديل"** (Edit)
3. Modify:
   - Name
   - Email
   - Role
   - Status (Active/Inactive)
4. Click **"حفظ"** (Save)

### Deactivating a User

1. Edit user
2. Change status to **"Inactive"**
3. Save
4. User cannot login while inactive

### User Roles

- **Owner**: Full system access
- **Manager**: Most features, no delete/price editing
- **FieldStaff**: View and create sales only

See [03_Admin_Guide.md](./03_Admin_Guide.md) for detailed permissions.

---

## 🔒 Security & Audit Logs

View system activity and security logs.

**Note**: Only Owners and Managers can access this page.

### Audit Logs

View all system activities:
- User logins
- Data changes
- Sales creation
- Payment recordings
- User management actions

### Login Attempts

Track login attempts:
- Successful logins
- Failed attempts
- Account lockouts
- IP addresses (if configured)

### Security Features

- **Session Timeout**: Auto-logout after 24 hours
- **Inactivity Timeout**: Auto-logout after 30 minutes of inactivity
- **Rate Limiting**: Account lockout after 5 failed login attempts
- **Audit Trail**: All actions logged

---

## 💡 Tips & Best Practices

### Land Management

- Use **flexible mode** for complex piece distributions
- Always verify piece preview before saving
- Keep batch names descriptive and unique
- Document important notes in batch notes field

### Sales Management

- Always verify client information before creating sale
- Double-check piece selection
- Record payments immediately after receiving them
- Use appropriate payment types for accurate tracking

### Financial Tracking

- Review financial reports regularly
- Monitor overdue installments
- Track profit margins per sale
- Keep cost information up to date

### Security

- Use strong passwords
- Don't share login credentials
- Review audit logs regularly
- Deactivate unused user accounts

---

## 🆘 Need Help?

- Check [10_Troubleshooting.md](./10_Troubleshooting.md) for common issues
- Review [03_Admin_Guide.md](./03_Admin_Guide.md) for admin features
- See [06_Security.md](./06_Security.md) for security information

---

**Last Updated**: January 2026

