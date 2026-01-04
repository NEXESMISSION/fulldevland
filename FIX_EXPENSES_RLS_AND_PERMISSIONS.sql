-- ============================================
-- Fix Expenses Table RLS and Permissions
-- ============================================

-- Drop existing policies on expenses table if they exist
DROP POLICY IF EXISTS "Expenses are viewable by authenticated users" ON expenses;
DROP POLICY IF EXISTS "Authenticated users can create expenses" ON expenses;
DROP POLICY IF EXISTS "Authenticated users can insert expenses" ON expenses;
DROP POLICY IF EXISTS "Owners and Managers can update expenses" ON expenses;
DROP POLICY IF EXISTS "Owners can delete expenses" ON expenses;

-- All authenticated users can view expenses
CREATE POLICY "Expenses are viewable by authenticated users"
ON expenses FOR SELECT
TO authenticated
USING (true);

-- All authenticated users can create expenses (if they have page access)
CREATE POLICY "Authenticated users can create expenses"
ON expenses FOR INSERT
TO authenticated
WITH CHECK (true);

-- All authenticated users can update their own expenses
-- Owners and Managers can update any expense
CREATE POLICY "Users can update expenses"
ON expenses FOR UPDATE
TO authenticated
USING (
    submitted_by = auth.uid() OR
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role IN ('Owner', 'Manager')
        AND users.status = 'Active'
    )
)
WITH CHECK (
    submitted_by = auth.uid() OR
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role IN ('Owner', 'Manager')
        AND users.status = 'Active'
    )
);

-- Only Owners can delete expenses
CREATE POLICY "Owners can delete expenses"
ON expenses FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role = 'Owner'
        AND users.status = 'Active'
    )
);

-- Verify policies
SELECT 'Expenses policies:' as info;
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'expenses';

