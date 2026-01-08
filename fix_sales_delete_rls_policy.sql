-- ============================================
-- FIX: Update sales DELETE RLS policy and get_user_role() function
-- This ensures Owners can delete sales properly
-- ============================================

-- Update the get_user_role() function to be more robust
DROP FUNCTION IF EXISTS get_user_role() CASCADE;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role_val user_role;
    user_status_val user_status;
BEGIN
    -- Get user role and status
    SELECT role, status INTO user_role_val, user_status_val
    FROM users 
    WHERE id = auth.uid();
    
    -- If user not found, return NULL
    IF user_role_val IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- For Owners, always return the role (even if status is not Active)
    -- This allows Owners to manage data even if their account is temporarily inactive
    IF user_role_val = 'Owner' THEN
        RETURN user_role_val;
    END IF;
    
    -- For other roles, only return role if status is Active
    IF user_status_val = 'Active' THEN
        RETURN user_role_val;
    END IF;
    
    -- User exists but is not Active and not Owner
    RETURN NULL;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN NULL;
    WHEN OTHERS THEN
        -- Log error but return NULL to fail RLS check safely
        RAISE WARNING 'Error in get_user_role(): %', SQLERRM;
        RETURN NULL;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

-- Drop and recreate the sales DELETE policy
DROP POLICY IF EXISTS "Owners can delete sales" ON sales;

CREATE POLICY "Owners can delete sales"
    ON sales FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- Verify the policy exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_policies 
        WHERE tablename = 'sales' 
        AND policyname = 'Owners can delete sales'
    ) THEN
        RAISE NOTICE 'Sales DELETE policy updated successfully';
    ELSE
        RAISE WARNING 'Sales DELETE policy may not have been created';
    END IF;
END $$;

-- Diagnostic query to check current user's role (run this manually to debug)
-- SELECT auth.uid() as current_user_id, get_user_role() as user_role, 
--        (SELECT role FROM users WHERE id = auth.uid()) as direct_role,
--        (SELECT status FROM users WHERE id = auth.uid()) as user_status;

