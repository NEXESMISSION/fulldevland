-- ===========================================
-- QUICK FIX: RLS Policies for All Tables
-- ===========================================
-- Run this to fix RLS policies WITHOUT resetting data
-- This allows all authenticated users to perform operations
-- ===========================================

-- Disable RLS temporarily
ALTER TABLE land_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE land_pieces DISABLE ROW LEVEL SECURITY;
ALTER TABLE installments DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- ===========================================
-- FIX: land_batches policies
-- ===========================================
DROP POLICY IF EXISTS "Owners and Managers can insert land batches" ON land_batches;
DROP POLICY IF EXISTS "Owners and Managers can update land batches" ON land_batches;
DROP POLICY IF EXISTS "Owners can delete land batches" ON land_batches;
DROP POLICY IF EXISTS "Authenticated users can insert land batches" ON land_batches;
DROP POLICY IF EXISTS "Authenticated users can update land batches" ON land_batches;

CREATE POLICY "Authenticated users can insert land batches"
ON land_batches FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update land batches"
ON land_batches FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete land batches" ON land_batches;
CREATE POLICY "Authenticated users can delete land batches"
ON land_batches FOR DELETE
TO authenticated
USING (true);

-- ===========================================
-- FIX: land_pieces policies
-- ===========================================
DROP POLICY IF EXISTS "Owners and Managers can insert land pieces" ON land_pieces;
DROP POLICY IF EXISTS "Owners and Managers can update land pieces" ON land_pieces;
DROP POLICY IF EXISTS "Owners can delete land pieces" ON land_pieces;
DROP POLICY IF EXISTS "Authenticated users can insert land pieces" ON land_pieces;
DROP POLICY IF EXISTS "Authenticated users can update land pieces" ON land_pieces;

CREATE POLICY "Authenticated users can insert land pieces"
ON land_pieces FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update land pieces"
ON land_pieces FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete land pieces" ON land_pieces;
CREATE POLICY "Authenticated users can delete land pieces"
ON land_pieces FOR DELETE
TO authenticated
USING (true);

-- ===========================================
-- FIX: installments policies
-- ===========================================
DROP POLICY IF EXISTS "Owners and Managers can update installments" ON installments;
DROP POLICY IF EXISTS "Authenticated users can update installments" ON installments;

CREATE POLICY "Authenticated users can update installments"
ON installments FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- ===========================================
-- FIX: payments policies
-- ===========================================
DROP POLICY IF EXISTS "Owners and Managers can update payments" ON payments;
DROP POLICY IF EXISTS "Authenticated users can update payments" ON payments;

CREATE POLICY "Authenticated users can update payments"
ON payments FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- ===========================================
-- FIX: sales policies
-- ===========================================
DROP POLICY IF EXISTS "Owners and Managers can update sales" ON sales;
DROP POLICY IF EXISTS "Authenticated users can update sales" ON sales;

CREATE POLICY "Authenticated users can update sales"
ON sales FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- ===========================================
-- FIX: users table policies (for user management)
-- ===========================================
-- First create the helper function if it doesn't exist
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

-- Drop old policies
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Owners and Managers can view all users" ON users;
DROP POLICY IF EXISTS "Owners can view all users" ON users;
DROP POLICY IF EXISTS "Owners can manage users" ON users;
DROP POLICY IF EXISTS "Owners can insert users" ON users;
DROP POLICY IF EXISTS "Owners can update users" ON users;
DROP POLICY IF EXISTS "Owners can delete users" ON users;

-- Create new policies
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

-- ===========================================
-- Re-enable RLS
-- ===========================================
ALTER TABLE land_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- ===========================================
-- Verify your user is Owner
-- ===========================================
UPDATE users SET role = 'Owner', status = 'Active' 
WHERE email = 'saifelleuchi127@gmail.com';

-- Show results
SELECT 'Your user:' as info;
SELECT id, email, role, status FROM users WHERE email = 'saifelleuchi127@gmail.com';

SELECT 'land_batches policies:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'land_batches';

SELECT 'land_pieces policies:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'land_pieces';

-- ===========================================
-- ADD allowed_pages column to users table
-- ===========================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'allowed_pages') THEN
        ALTER TABLE users ADD COLUMN allowed_pages TEXT[] DEFAULT NULL;
    END IF;
END $$;

-- Set default allowed pages for existing users based on role
-- NULL means all pages (for Owners)
-- All page IDs: home, land, availability, clients, sales, confirm-sales, installments, finance, expenses, debts, users, security, real-estate
UPDATE users SET allowed_pages = NULL WHERE role = 'Owner';

UPDATE users SET allowed_pages = ARRAY['home', 'land', 'availability', 'clients', 'sales', 'confirm-sales', 'installments', 'finance', 'expenses', 'debts']
WHERE role = 'Manager' AND allowed_pages IS NULL;

UPDATE users SET allowed_pages = ARRAY['home', 'land', 'availability', 'clients', 'sales', 'installments']
WHERE role = 'FieldStaff' AND allowed_pages IS NULL;

-- ===========================================
-- DONE! All RLS policies fixed.
-- ===========================================

