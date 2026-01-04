-- ===========================================
-- FULL DATABASE RESET SCRIPT
-- ===========================================
-- This script will:
-- 1. Delete all data EXCEPT the user saifelleuchi127@gmail.com
-- 2. Reset all tables to a clean state
-- 3. Fix all RLS policies
-- 4. Ensure the kept user has Owner role
--
-- RUN THIS IN SUPABASE SQL EDITOR
-- ===========================================

-- STEP 1: Disable RLS temporarily to allow cleanup
-- ===========================================
ALTER TABLE installments DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE reservations DISABLE ROW LEVEL SECURITY;
ALTER TABLE land_pieces DISABLE ROW LEVEL SECURITY;
ALTER TABLE land_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- Also disable on debt tables if they exist
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'debts') THEN
    EXECUTE 'ALTER TABLE debts DISABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'debt_payments') THEN
    EXECUTE 'ALTER TABLE debt_payments DISABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'expenses') THEN
    EXECUTE 'ALTER TABLE expenses DISABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- STEP 2: Delete all data in proper order (respecting foreign keys)
-- ===========================================

-- Delete audit logs
DELETE FROM audit_logs;

-- Delete payments
DELETE FROM payments;

-- Delete installments
DELETE FROM installments;

-- Delete sales
DELETE FROM sales;

-- Delete reservations
DELETE FROM reservations;

-- Delete land pieces
DELETE FROM land_pieces;

-- Delete land batches
DELETE FROM land_batches;

-- Delete clients
DELETE FROM clients;

-- Delete debt payments if exists
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'debt_payments') THEN
    EXECUTE 'DELETE FROM debt_payments';
  END IF;
END $$;

-- Delete debts if exists
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'debts') THEN
    EXECUTE 'DELETE FROM debts';
  END IF;
END $$;

-- Delete expenses if exists
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'expenses') THEN
    EXECUTE 'DELETE FROM expenses';
  END IF;
END $$;

-- STEP 3: Delete all users EXCEPT saifelleuchi127@gmail.com
-- ===========================================
DELETE FROM users WHERE email != 'saifelleuchi127@gmail.com';

-- Ensure the remaining user is set as Owner
UPDATE users 
SET role = 'Owner', status = 'Active'
WHERE email = 'saifelleuchi127@gmail.com';

-- STEP 4: Re-enable RLS on all tables
-- ===========================================
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'debts') THEN
    EXECUTE 'ALTER TABLE debts ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'debt_payments') THEN
    EXECUTE 'ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY';
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'expenses') THEN
    EXECUTE 'ALTER TABLE expenses ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- STEP 5: Fix RLS policies for users table (prevent circular dependency)
-- ===========================================

-- Drop all existing policies on users table
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Owners and Managers can view all users" ON users;
DROP POLICY IF EXISTS "Owners can view all users" ON users;
DROP POLICY IF EXISTS "Owners can manage users" ON users;
DROP POLICY IF EXISTS "Owners can insert users" ON users;
DROP POLICY IF EXISTS "Owners can update users" ON users;
DROP POLICY IF EXISTS "Owners can delete users" ON users;
DROP POLICY IF EXISTS "users_select_own" ON users;
DROP POLICY IF EXISTS "users_select_all_for_owners" ON users;
DROP POLICY IF EXISTS "users_insert_for_owners" ON users;
DROP POLICY IF EXISTS "users_update_for_owners" ON users;
DROP POLICY IF EXISTS "users_delete_for_owners" ON users;

-- Create SECURITY DEFINER function to check if current user is owner
CREATE OR REPLACE FUNCTION is_current_user_owner()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role_val user_role;
BEGIN
  SELECT role INTO user_role_val 
  FROM users 
  WHERE id = auth.uid() 
  AND status = 'Active';
  
  RETURN COALESCE(user_role_val = 'Owner', FALSE);
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RETURN FALSE;
  WHEN OTHERS THEN
    RETURN FALSE;
END;
$$;

-- Create SECURITY DEFINER function to get current user role
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role_val user_role;
BEGIN
  SELECT role INTO user_role_val 
  FROM users 
  WHERE id = auth.uid() 
  AND status = 'Active';
  
  RETURN COALESCE(user_role_val, 'FieldStaff'::user_role);
EXCEPTION
  WHEN NO_DATA_FOUND THEN
    RETURN 'FieldStaff'::user_role;
  WHEN OTHERS THEN
    RETURN 'FieldStaff'::user_role;
END;
$$;

-- Create new RLS policies for users table
CREATE POLICY "Users can view own profile"
ON users FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Owners can view all users"
ON users FOR SELECT
TO authenticated
USING (is_current_user_owner());

CREATE POLICY "Owners can insert users"
ON users FOR INSERT
TO authenticated
WITH CHECK (is_current_user_owner());

CREATE POLICY "Owners can update users"
ON users FOR UPDATE
TO authenticated
USING (is_current_user_owner())
WITH CHECK (is_current_user_owner());

CREATE POLICY "Owners can delete users"
ON users FOR DELETE
TO authenticated
USING (is_current_user_owner());

-- STEP 6: Fix RLS policies to allow proper access
-- ===========================================

-- Fix installments policies
DROP POLICY IF EXISTS "Owners and Managers can update installments" ON installments;
CREATE POLICY "Authenticated users can update installments"
ON installments FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Fix land_batches policies - allow all authenticated users
DROP POLICY IF EXISTS "Owners and Managers can insert land batches" ON land_batches;
DROP POLICY IF EXISTS "Owners and Managers can update land batches" ON land_batches;
DROP POLICY IF EXISTS "Owners can delete land batches" ON land_batches;

CREATE POLICY "Authenticated users can insert land batches"
ON land_batches FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update land batches"
ON land_batches FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Owners can delete land batches"
ON land_batches FOR DELETE
TO authenticated
USING (is_current_user_owner());

-- Fix land_pieces policies - allow all authenticated users
DROP POLICY IF EXISTS "Owners and Managers can insert land pieces" ON land_pieces;
DROP POLICY IF EXISTS "Owners and Managers can update land pieces" ON land_pieces;
DROP POLICY IF EXISTS "Owners can delete land pieces" ON land_pieces;

CREATE POLICY "Authenticated users can insert land pieces"
ON land_pieces FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update land pieces"
ON land_pieces FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Owners can delete land pieces"
ON land_pieces FOR DELETE
TO authenticated
USING (is_current_user_owner());

-- Fix sales policies
DROP POLICY IF EXISTS "Owners and Managers can update sales" ON sales;
CREATE POLICY "Authenticated users can update sales"
ON sales FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Fix payments policies
DROP POLICY IF EXISTS "Owners and Managers can update payments" ON payments;
CREATE POLICY "Authenticated users can update payments"
ON payments FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- STEP 7: Verification
-- ===========================================
SELECT 'Users remaining:' as info;
SELECT id, email, name, role, status FROM users;

SELECT 'Installments count:' as info, COUNT(*) as count FROM installments;
SELECT 'Payments count:' as info, COUNT(*) as count FROM payments;
SELECT 'Sales count:' as info, COUNT(*) as count FROM sales;
SELECT 'Clients count:' as info, COUNT(*) as count FROM clients;
SELECT 'Land pieces count:' as info, COUNT(*) as count FROM land_pieces;

SELECT 'RLS Policies on users table:' as info;
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'users';

SELECT 'RLS Policies on installments table:' as info;
SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'installments';

-- ===========================================
-- DONE!
-- ===========================================
-- Your database is now reset with:
-- 1. Only saifelleuchi127@gmail.com as Owner
-- 2. All data cleared
-- 3. Fixed RLS policies
-- 4. Installments can now be updated by any authenticated user
-- ===========================================

