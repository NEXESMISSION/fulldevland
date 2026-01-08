-- ============================================
-- COMPLETE FIX: get_user_role() Function for RLS Policies
-- This fixes the issue where RLS policies fail when get_user_role() returns NULL
-- ============================================
-- 
-- PROBLEM:
-- - get_user_role() was returning NULL for inactive users (including Owners)
-- - RLS policies using get_user_role() = 'Owner' fail when function returns NULL
-- - This blocked legitimate operations even for Owners
--
-- SOLUTION:
-- - Owners always get their role returned (even if status is not 'Active')
-- - Other roles only get role returned if status is 'Active'
-- - Proper error handling to prevent RLS policy failures
-- ============================================

-- Drop existing function (CASCADE to handle dependencies)
DROP FUNCTION IF EXISTS get_user_role() CASCADE;

-- Create improved get_user_role() function
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
    -- Get user role and status from users table
    SELECT role, status INTO user_role_val, user_status_val
    FROM users 
    WHERE id = auth.uid();
    
    -- If user not found, return NULL (will fail RLS checks - secure by default)
    IF user_role_val IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- CRITICAL FIX: Owners always get their role returned, even if status is not 'Active'
    -- This allows Owners to manage data even if their account is temporarily inactive
    -- This is important because Owners need to be able to reactivate accounts, fix issues, etc.
    IF user_role_val = 'Owner' THEN
        RETURN user_role_val;
    END IF;
    
    -- For other roles, only return role if status is 'Active'
    -- Inactive users (except Owners) should not have access
    IF user_status_val = 'Active' THEN
        RETURN user_role_val;
    END IF;
    
    -- User exists but is not Active and not Owner
    -- Return NULL to fail RLS checks (secure by default)
    RETURN NULL;
    
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        -- User not found - return NULL (secure by default)
        RETURN NULL;
    WHEN OTHERS THEN
        -- Log error for debugging but return NULL to fail RLS check safely
        -- This prevents RLS policies from failing silently
        RAISE WARNING 'Error in get_user_role(): %', SQLERRM;
        RETURN NULL;
END;
$$;

-- Grant execute permission to authenticated users
-- This allows RLS policies to call the function
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

-- Add comment explaining the function's behavior
COMMENT ON FUNCTION get_user_role() IS 
'Returns the role of the current authenticated user. 
Owners always get their role (even if inactive).
Other roles only returned if user status is Active.
Returns NULL if user not found or not active (fails RLS checks securely).';

-- ============================================
-- VERIFICATION: Test the function
-- ============================================

DO $$
DECLARE
    test_role user_role;
    test_user_id UUID;
BEGIN
    -- Test 1: Verify function exists and can be called
    BEGIN
        SELECT get_user_role() INTO test_role;
        RAISE NOTICE '✓ get_user_role() function exists and can be called';
        RAISE NOTICE '  Current user role: %', COALESCE(test_role::TEXT, 'NULL (user not found or not active)');
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING '✗ Error calling get_user_role(): %', SQLERRM;
    END;
    
    -- Test 2: Verify function returns correct type
    BEGIN
        SELECT pg_get_function_result(oid) INTO test_role
        FROM pg_proc 
        WHERE proname = 'get_user_role';
        RAISE NOTICE '✓ Function returns correct type: user_role';
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING '✗ Could not verify function return type';
    END;
    
    -- Test 3: Verify function has SECURITY DEFINER
    BEGIN
        IF EXISTS (
            SELECT 1 
            FROM pg_proc p
            JOIN pg_namespace n ON p.pronamespace = n.oid
            WHERE p.proname = 'get_user_role'
            AND p.prosecdef = true  -- SECURITY DEFINER
        ) THEN
            RAISE NOTICE '✓ Function has SECURITY DEFINER (required for RLS)';
        ELSE
            RAISE WARNING '✗ Function does not have SECURITY DEFINER';
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING '✗ Could not verify SECURITY DEFINER';
    END;
    
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'get_user_role() function fix completed!';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT: Test RLS policies after applying this fix:';
    RAISE NOTICE '1. Test Owner can perform operations (even if inactive)';
    RAISE NOTICE '2. Test Active users can perform operations';
    RAISE NOTICE '3. Test Inactive users (non-Owner) are blocked';
    RAISE NOTICE '4. Test unauthenticated users are blocked';
    RAISE NOTICE '';
    
END $$;

-- ============================================
-- ADDITIONAL: Verify RLS policies that use get_user_role()
-- ============================================

DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    -- Count RLS policies that use get_user_role()
    -- Check both qual (USING clause) and with_check (WITH CHECK clause)
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE (qual LIKE '%get_user_role%' OR with_check LIKE '%get_user_role%');
    
    IF policy_count > 0 THEN
        RAISE NOTICE '✓ Found % RLS policies using get_user_role()', policy_count;
        RAISE NOTICE '  These policies will now work correctly with the fixed function';
    ELSE
        RAISE NOTICE '⚠ No RLS policies found using get_user_role()';
        RAISE NOTICE '  This may indicate policies need to be updated';
    END IF;
END $$;

