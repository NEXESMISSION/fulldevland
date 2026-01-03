# SQL Migrations Guide

Complete guide to all SQL migration scripts and database setup.

---

## 📋 Table of Contents

1. [Migration Overview](#migration-overview)
2. [Core Schema](#core-schema)
3. [Security Migrations](#security-migrations)
4. [Feature Migrations](#feature-migrations)
5. [Data Management Scripts](#data-management-scripts)
6. [Migration Order](#migration-order)
7. [Running Migrations](#running-migrations)

---

## 🎯 Migration Overview

### What are Migrations?

Migrations are SQL scripts that modify your database structure:
- Create tables
- Add columns
- Modify constraints
- Add indexes
- Create functions
- Set up security policies

### Migration Files Location

All migration files are in the project root directory:
```
FULLLANDDEV/
├── supabase_schema.sql          # Main schema (run first!)
├── security_database_fixes.sql  # Security enhancements
├── create_debts_table.sql       # Debt management
├── add_debt_payments_table.sql   # Debt payments
├── add_real_estate_tax_number.sql
├── add_login_attempts_tracking.sql
└── ... (other migrations)
```

---

## 🏗️ Core Schema

### `supabase_schema.sql`

**Purpose**: Main database schema - foundation of the system.

**What it creates**:
- All enum types (land_status, payment_type, etc.)
- All core tables (users, land_batches, clients, sales, etc.)
- All indexes
- All foreign key constraints
- Row Level Security (RLS) policies
- Audit logging functions and triggers
- Permission checking functions
- Update timestamp triggers

**When to run**: 
- **First time setup** - Run this first!
- **New database** - Always start here

**How to run**:
1. Open Supabase Dashboard → SQL Editor
2. Create new query
3. Copy entire contents of `supabase_schema.sql`
4. Paste into SQL Editor
5. Click "Run" (or Ctrl+Enter)
6. Wait for "Success" message

**⚠️ Important**: 
- This is the foundation - run before any other migrations
- Don't modify this file - it's the source of truth
- If you need changes, create a new migration file

**Expected time**: 30-60 seconds

---

## 🔒 Security Migrations

### `security_database_fixes.sql`

**Purpose**: Security enhancements and validation.

**What it adds**:
- Database-level input validation
- Additional constraints
- Server-side validation functions
- Completes audit trail
- Enhanced security checks

**When to run**: 
- After `supabase_schema.sql`
- For existing databases that need security updates

**Dependencies**: Requires `supabase_schema.sql` to be run first.

**How to run**:
1. Run `supabase_schema.sql` first
2. Open SQL Editor
3. Copy contents of `security_database_fixes.sql`
4. Paste and run
5. Verify no errors

---

### `add_login_attempts_tracking.sql`

**Purpose**: Track login attempts for security.

**What it creates**:
- `login_attempts` table
- Indexes for performance
- RLS policies for access control

**When to run**: 
- For enhanced security monitoring
- After core schema is set up

**Dependencies**: Requires `supabase_schema.sql`.

**Features**:
- Tracks successful and failed logins
- Records IP addresses
- Records user agents
- Used for rate limiting

---

## 🆕 Feature Migrations

### `create_debts_table.sql`

**Purpose**: Add debt management functionality.

**What it creates**:
- `debts` table
- Indexes
- RLS policies
- Audit triggers

**When to run**: 
- If you need debt tracking features
- After core schema

**Dependencies**: Requires `supabase_schema.sql` (clients table).

---

### `add_debt_payments_table.sql`

**Purpose**: Track debt payments.

**What it creates**:
- `debt_payments` table
- Foreign key to `debts`
- Indexes
- RLS policies

**When to run**: 
- After `create_debts_table.sql`
- If using debt management

**Dependencies**: Requires `create_debts_table.sql`.

---

### `add_real_estate_tax_number.sql`

**Purpose**: Add tax number field to land batches.

**What it does**:
- Adds `real_estate_tax_number` column to `land_batches`
- Makes it optional (nullable)

**When to run**: 
- For existing databases
- If you need to track tax numbers

**Dependencies**: Requires `land_batches` table.

---

## 🗄️ Data Management Scripts

### `database_full_reset.sql`

**Purpose**: Complete database reset (keeps users and roles).

**What it does**:
- Deletes all data from all tables
- Keeps users and roles
- Keeps table structure
- **⚠️ DESTRUCTIVE** - Use with caution!

**When to use**:
- Development/testing
- Starting fresh
- **Never use in production without backup!**

**How to use**:
1. **BACKUP FIRST!**
2. Review script to understand what will be deleted
3. Run in SQL Editor
4. Verify reset completed

---

### `database_full_reset_keep_users.sql`

**Purpose**: Reset database keeping users.

**What it does**:
- Deletes all business data
- Keeps users table
- Keeps roles
- Resets all other tables

**When to use**:
- Development/testing
- Keep user accounts but reset data

**⚠️ Warning**: Still destructive - backup first!

---

### `database_full_reset_with_test_data.sql`

**Purpose**: Reset and populate with test data.

**What it does**:
- Resets database
- Inserts sample data:
  - Test land batches
  - Test clients
  - Test sales
  - Test installments

**When to use**:
- Development
- Testing
- Demo purposes

**⚠️ Warning**: Contains test data - don't use in production!

---

### `database_reset_keep_land_clients.sql`

**Purpose**: Reset keeping land and clients.

**What it does**:
- Deletes sales, installments, payments
- Keeps land batches and pieces
- Keeps clients
- Resets financial data

**When to use**:
- Reset financial data
- Keep inventory and clients

---

### `database_cleanup.sql`

**Purpose**: Clean up test data.

**What it does**:
- Removes test records
- Cleans up orphaned data
- Removes expired reservations

**When to use**:
- After testing
- Regular maintenance
- Cleanup before production

---

### `fix_sale_prices.sql`

**Purpose**: Diagnostic script for price issues.

**What it does**:
- Checks for price inconsistencies
- Identifies problematic sales
- Provides diagnostic information

**When to use**:
- Troubleshooting price issues
- Data validation
- Diagnostic purposes

---

## 📅 Migration Order

### For New Database Setup

```sql
1. supabase_schema.sql              -- Foundation (REQUIRED)
2. security_database_fixes.sql      -- Security (REQUIRED)
3. add_login_attempts_tracking.sql  -- Security (Optional)
4. create_debts_table.sql          -- Feature (Optional)
5. add_debt_payments_table.sql       -- Feature (Optional, requires #4)
6. add_real_estate_tax_number.sql   -- Feature (Optional)
```

### For Existing Database

1. Check which migrations you've already run
2. Run missing migrations in order
3. Always run `security_database_fixes.sql` if not applied
4. Test each migration before proceeding

---

## 🚀 Running Migrations

### Method 1: Supabase SQL Editor (Recommended)

1. **Open Supabase Dashboard**
   - Go to your project
   - Click "SQL Editor" in sidebar

2. **Create New Query**
   - Click "New query" button
   - Or use keyboard shortcut

3. **Copy Migration Content**
   - Open migration file in text editor
   - Copy entire contents
   - Make sure to copy everything (including comments)

4. **Paste and Review**
   - Paste into SQL Editor
   - Review the SQL (especially for destructive operations)
   - Check for any customizations needed

5. **Run Migration**
   - Click "Run" button
   - Or press `Ctrl+Enter` (Windows) / `Cmd+Enter` (Mac)
   - Wait for execution

6. **Verify Success**
   - Check for "Success" message
   - Review any warnings
   - Verify tables/columns were created (use Table Editor)

### Method 2: Command Line (Advanced)

If you have `psql` installed:

```bash
# Connect to Supabase
psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"

# Run migration
\i supabase_schema.sql
```

**Note**: Requires database connection string from Supabase.

---

## ✅ Migration Checklist

Before running any migration:

- [ ] **Backup database** (if production)
- [ ] **Read migration file** to understand changes
- [ ] **Check dependencies** - ensure prerequisites are met
- [ ] **Test in development** first
- [ ] **Verify no conflicts** with existing data
- [ ] **Have rollback plan** if something goes wrong

After running migration:

- [ ] **Verify success** - check for errors
- [ ] **Test functionality** - ensure features still work
- [ ] **Check data integrity** - verify no data loss
- [ ] **Update application code** if schema changed
- [ ] **Document changes** for team

---

## 🐛 Troubleshooting Migrations

### Error: "relation already exists"

**Cause**: Table/column already exists in database.

**Solution**:
- Check if migration was already run
- Use `IF NOT EXISTS` in migration (if applicable)
- Or drop existing object first (careful!)

### Error: "foreign key constraint violation"

**Cause**: Trying to delete/modify data that's referenced.

**Solution**:
- Check foreign key relationships
- Delete/reference child records first
- Or modify constraint to allow operation

### Error: "permission denied"

**Cause**: Insufficient database permissions.

**Solution**:
- Ensure you're using correct database user
- Check RLS policies
- Verify you have necessary permissions

### Error: "syntax error"

**Cause**: SQL syntax issue in migration file.

**Solution**:
- Check SQL syntax
- Verify all quotes are matched
- Check for typos
- Test query in smaller parts

### Migration Partially Applied

**Cause**: Migration failed partway through.

**Solution**:
1. **Don't re-run** - may cause conflicts
2. **Check what was created** - use Table Editor
3. **Manually complete** - run remaining SQL
4. **Or rollback** - restore from backup and retry

---

## 📝 Creating New Migrations

### Migration File Naming

Use descriptive names:
- `add_[feature]_table.sql`
- `modify_[table]_[column].sql`
- `add_[feature]_indexes.sql`

### Migration Structure

```sql
-- ============================================
-- TITLE AND PURPOSE
-- Brief description of what this migration does
-- ============================================
-- Dependencies: List required migrations
-- Run after: Previous migration name
-- ============================================

-- Step 1: Create table/column
CREATE TABLE IF NOT EXISTS new_table (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ...
);

-- Step 2: Add indexes
CREATE INDEX IF NOT EXISTS idx_new_table_column 
ON new_table(column);

-- Step 3: Add RLS
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Policy name"
    ON new_table FOR SELECT
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'));

-- Step 4: Add audit triggers (if needed)
-- (Use existing audit trigger function)

-- Verification query
SELECT * FROM new_table LIMIT 1;
```

### Best Practices

1. **Use IF NOT EXISTS** - Prevents errors if already exists
2. **Add comments** - Explain what and why
3. **Test thoroughly** - Test in development first
4. **Keep atomic** - One logical change per migration
5. **Document dependencies** - List required migrations
6. **Add verification** - Include test queries

---

## 📚 Migration Reference

### Common Operations

**Add Column**:
```sql
ALTER TABLE table_name 
ADD COLUMN IF NOT EXISTS column_name TYPE;
```

**Add Index**:
```sql
CREATE INDEX IF NOT EXISTS idx_name 
ON table_name(column_name);
```

**Add Foreign Key**:
```sql
ALTER TABLE child_table
ADD CONSTRAINT fk_name
FOREIGN KEY (column) REFERENCES parent_table(id);
```

**Enable RLS**:
```sql
ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;
```

**Create Policy**:
```sql
CREATE POLICY "Policy name"
    ON table_name FOR SELECT
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'));
```

---

## 🔍 Verifying Migrations

### Check Tables Exist

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

### Check Columns Exist

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'table_name';
```

### Check Indexes Exist

```sql
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'table_name';
```

### Check RLS Enabled

```sql
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

---

## 📞 Need Help?

- Check [Database Schema](./04_Database_Schema.md) for table structures
- Review [Troubleshooting Guide](./10_Troubleshooting.md) for common issues
- See Supabase documentation: https://supabase.com/docs

---

**Last Updated**: January 2026

