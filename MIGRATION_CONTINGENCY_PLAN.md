# Migration Contingency Plan

## Overview
This document outlines the contingency plan for migrating the FULLLANDDEV application to a new Supabase project or database instance, including authentication and data export procedures.

## Table of Contents
1. [Pre-Migration Checklist](#pre-migration-checklist)
2. [Authentication Migration](#authentication-migration)
3. [Data Export Procedures](#data-export-procedures)
4. [Data Import Procedures](#data-import-procedures)
5. [Verification Steps](#verification-steps)
6. [Rollback Procedures](#rollback-procedures)
7. [Post-Migration Tasks](#post-migration-tasks)

---

## Pre-Migration Checklist

### 1. Backup Current System
- [ ] Create full database backup using `backup_database.sql`
- [ ] Export all storage buckets (images, documents)
- [ ] Document current environment variables
- [ ] Take screenshots of current dashboard/metrics
- [ ] Export audit logs for compliance

### 2. Prepare New Environment
- [ ] Create new Supabase project
- [ ] Set up Edge Functions in new project
- [ ] Configure storage buckets
- [ ] Set up environment variables
- [ ] Test new project connectivity

### 3. Communication
- [ ] Notify all users of maintenance window
- [ ] Schedule migration during low-traffic period
- [ ] Prepare rollback communication plan

---

## Authentication Migration

### Step 1: Export Users from Auth Schema

```sql
-- Export users from auth.users table
-- Note: This requires service role access
COPY (
    SELECT 
        id,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        raw_user_meta_data,
        raw_app_meta_data
    FROM auth.users
) TO '/tmp/auth_users_export.csv' WITH CSV HEADER;
```

### Step 2: Export User Metadata

```sql
-- Export from public.users table
COPY (
    SELECT 
        id,
        name,
        email,
        role,
        status,
        created_at,
        updated_at,
        allowed_batches,
        allowed_pieces,
        allowed_pages,
        sidebar_order,
        page_order
    FROM users
) TO '/tmp/users_export.csv' WITH CSV HEADER;
```

### Step 3: Import Users to New Project

**Option A: Using Supabase CLI (Recommended)**
```bash
# Export from old project
supabase db dump --data-only -f auth_users.sql

# Import to new project
supabase db reset
supabase db push
```

**Option B: Manual Import via SQL**
```sql
-- Import auth users (requires service role)
-- Note: Passwords need to be re-encrypted or users need to reset passwords
INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_user_meta_data, raw_app_meta_data
) VALUES (...);

-- Import public users
INSERT INTO users (
    id, name, email, role, status, created_at, updated_at,
    allowed_batches, allowed_pieces, allowed_pages, sidebar_order, page_order
) VALUES (...);
```

### Step 4: Handle Password Migration

**Important**: Supabase encrypts passwords, so direct migration may not work.

**Options:**
1. **Force Password Reset** (Recommended for security)
   - After migration, send password reset emails to all users
   - Users reset passwords on first login

2. **Manual Password Sync** (If needed)
   - Export password hashes (requires special access)
   - Import to new project (may require custom script)

---

## Data Export Procedures

### 1. Export Database Schema

```bash
# Using Supabase CLI
supabase db dump --schema-only -f schema.sql

# Or using pg_dump
pg_dump -h [host] -U [user] -d [database] --schema-only > schema.sql
```

### 2. Export All Data

```bash
# Export data only (no schema)
supabase db dump --data-only -f data.sql

# Or using pg_dump
pg_dump -h [host] -U [user] -d [database] --data-only > data.sql
```

### 3. Export Storage Buckets

```bash
# List all buckets
supabase storage list

# Download each bucket
supabase storage download [bucket-name] [local-path]
```

### 4. Export Specific Tables (if needed)

```sql
-- Export critical tables individually
COPY land_batches TO '/tmp/land_batches.csv' WITH CSV HEADER;
COPY land_pieces TO '/tmp/land_pieces.csv' WITH CSV HEADER;
COPY clients TO '/tmp/clients.csv' WITH CSV HEADER;
COPY sales TO '/tmp/sales.csv' WITH CSV HEADER;
COPY payments TO '/tmp/payments.csv' WITH CSV HEADER;
COPY installments TO '/tmp/installments.csv' WITH CSV HEADER;
COPY reservations TO '/tmp/reservations.csv' WITH CSV HEADER;
```

### 5. Export Configuration Data

```sql
-- Export roles and permissions
COPY roles TO '/tmp/roles.csv' WITH CSV HEADER;
COPY user_permissions TO '/tmp/user_permissions.csv' WITH CSV HEADER;

-- Export settings (if any)
-- Add any custom configuration tables
```

---

## Data Import Procedures

### 1. Import Schema

```bash
# Apply schema to new database
psql -h [new-host] -U [user] -d [database] -f schema.sql
```

### 2. Import Data

```bash
# Import data
psql -h [new-host] -U [user] -d [database] -f data.sql
```

### 3. Import Storage

```bash
# Upload to new project
supabase storage upload [bucket-name] [local-path]
```

### 4. Verify Data Integrity

```sql
-- Count records in each table
SELECT 'land_batches' as table_name, COUNT(*) as count FROM land_batches
UNION ALL
SELECT 'land_pieces', COUNT(*) FROM land_pieces
UNION ALL
SELECT 'clients', COUNT(*) FROM clients
UNION ALL
SELECT 'sales', COUNT(*) FROM sales
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'installments', COUNT(*) FROM installments
UNION ALL
SELECT 'users', COUNT(*) FROM users;
```

---

## Verification Steps

### 1. Data Verification

- [ ] Verify record counts match between old and new database
- [ ] Check foreign key relationships are intact
- [ ] Verify UUIDs are preserved
- [ ] Test sample queries return expected results

### 2. Authentication Verification

- [ ] Test login with sample users
- [ ] Verify user roles are correct
- [ ] Check RLS policies are working
- [ ] Test permission checks

### 3. Application Verification

- [ ] Test all major features
- [ ] Verify Edge Functions work
- [ ] Check storage bucket access
- [ ] Test realtime subscriptions (if used)
- [ ] Verify API endpoints

### 4. Performance Verification

- [ ] Check query performance
- [ ] Verify indexes are created
- [ ] Test Edge Functions latency
- [ ] Monitor error rates

---

## Rollback Procedures

### If Migration Fails

1. **Immediate Actions**
   - Revert DNS/domain to old project
   - Notify users of issue
   - Keep old project running

2. **Data Recovery**
   - Old database remains intact
   - No data loss if export was successful
   - Can retry migration after fixing issues

3. **Communication**
   - Inform users of rollback
   - Provide timeline for retry
   - Update status page

---

## Post-Migration Tasks

### 1. Update Environment Variables

```bash
# Update .env files
VITE_SUPABASE_URL=[new-project-url]
VITE_SUPABASE_ANON_KEY=[new-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[new-service-role-key]
```

### 2. Update Application Configuration

- [ ] Update Supabase client URLs
- [ ] Update Edge Function endpoints
- [ ] Update storage bucket references
- [ ] Update webhook URLs (if any)

### 3. Rebuild Caches

```sql
-- Refresh all materialized views
SELECT refresh_dashboard_stats_cache();
SELECT refresh_clients_summary_cache();
SELECT refresh_active_users_cache();
```

### 4. Monitor Performance

- [ ] Set up monitoring alerts
- [ ] Check query performance logs
- [ ] Monitor error rates
- [ ] Review slow queries

### 5. Cleanup

- [ ] Archive old project backups
- [ ] Document migration process
- [ ] Update runbooks
- [ ] Schedule old project decommission (after verification period)

---

## Automated Migration Script

Create a script to automate the migration process:

```bash
#!/bin/bash
# migration.sh - Automated migration script

set -e

echo "Starting migration..."

# 1. Export from old project
echo "Exporting data from old project..."
supabase db dump --data-only -f old_data.sql

# 2. Export storage
echo "Exporting storage..."
supabase storage download all_buckets ./storage_backup

# 3. Import to new project
echo "Importing to new project..."
# Update connection details
psql -h [new-host] -U [user] -d [database] -f old_data.sql

# 4. Upload storage
echo "Uploading storage..."
supabase storage upload [bucket] ./storage_backup/[bucket]

# 5. Verify
echo "Running verification..."
psql -h [new-host] -U [user] -d [database] -f verify_migration.sql

echo "Migration complete!"
```

---

## Emergency Contacts

- **Database Admin**: [Contact]
- **DevOps Team**: [Contact]
- **Supabase Support**: support@supabase.com

---

## Notes

- Always test migration on a staging environment first
- Keep old project running for at least 7 days after migration
- Document any issues encountered during migration
- Update this plan based on lessons learned

