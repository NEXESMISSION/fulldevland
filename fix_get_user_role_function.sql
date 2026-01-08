-- ============================================
-- FIX: Update get_user_role() function to properly check user status
-- This ensures RLS policies work correctly for Owners
-- ============================================

-- Drop and recreate get_user_role() function with proper status check
DROP FUNCTION IF EXISTS get_user_role() CASCADE;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role_val user_role;
BEGIN
    -- Check user role and status
    SELECT role INTO user_role_val 
    FROM users 
    WHERE id = auth.uid() 
    AND status = 'Active';
    
    -- Return the role, or NULL if not found (which will fail RLS checks appropriately)
    RETURN user_role_val;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN NULL;
    WHEN OTHERS THEN
        -- Log error but return NULL to fail RLS check safely
        RAISE WARNING 'Error in get_user_role(): %', SQLERRM;
        RETURN NULL;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

-- Verify the function works
DO $$
DECLARE
    test_role user_role;
BEGIN
    -- Test that function exists and can be called
    SELECT get_user_role() INTO test_role;
    RAISE NOTICE 'get_user_role() function updated successfully. Current user role: %', test_role;
END $$;

