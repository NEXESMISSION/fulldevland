-- ============================================
-- TEST SCRIPT: Verify get_user_role() and RLS Policies
-- Run this after applying fix_get_user_role_rls_complete.sql
-- ============================================
--
-- This script helps verify that:
-- 1. get_user_role() works correctly for different user states
-- 2. RLS policies work correctly with the fixed function
-- 3. Owners can perform operations even if inactive
-- 4. Active users can perform operations
-- 5. Inactive users (non-Owner) are blocked
-- ============================================

-- ============================================
-- TEST 1: Verify get_user_role() function exists and works
-- ============================================

DO $$
DECLARE
    test_result user_role;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST 1: Verify get_user_role() function';
    RAISE NOTICE '========================================';
    
    -- Test function call
    BEGIN
        SELECT get_user_role() INTO test_result;
        IF test_result IS NULL THEN
            RAISE NOTICE '✓ Function returns NULL (user not authenticated or not active)';
        ELSE
            RAISE NOTICE '✓ Function returns role: %', test_result;
        END IF;
    EXCEPTION
        WHEN OTHERS THEN
            RAISE WARNING '✗ Error calling get_user_role(): %', SQLERRM;
    END;
    
    RAISE NOTICE '';
END $$;

-- ============================================
-- TEST 2: Check RLS policies using get_user_role()
-- ============================================

DO $$
DECLARE
    policy_record RECORD;
    policy_count INTEGER := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST 2: List RLS policies using get_user_role()';
    RAISE NOTICE '========================================';
    
    FOR policy_record IN
        SELECT 
            schemaname,
            tablename,
            policyname,
            cmd,
            qual,
            with_check
        FROM pg_policies
        WHERE (qual LIKE '%get_user_role%' OR with_check LIKE '%get_user_role%')
        ORDER BY tablename, policyname
    LOOP
        policy_count := policy_count + 1;
        RAISE NOTICE '';
        RAISE NOTICE 'Policy #%: % on %.%', 
            policy_count,
            policy_record.policyname,
            policy_record.schemaname,
            policy_record.tablename;
        RAISE NOTICE '  Command: %', policy_record.cmd;
        IF policy_record.qual IS NOT NULL THEN
            RAISE NOTICE '  USING clause: %', policy_record.qual;
        END IF;
        IF policy_record.with_check IS NOT NULL THEN
            RAISE NOTICE '  WITH CHECK clause: %', policy_record.with_check;
        END IF;
    END LOOP;
    
    IF policy_count = 0 THEN
        RAISE NOTICE '⚠ No RLS policies found using get_user_role()';
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '✓ Found % policies using get_user_role()', policy_count;
    END IF;
    
    RAISE NOTICE '';
END $$;

-- ============================================
-- TEST 3: Verify function behavior for different scenarios
-- ============================================
-- Note: These tests require actual user accounts to be meaningful
-- Run these manually with different user accounts

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST 3: Manual Testing Instructions';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'To fully test get_user_role() and RLS policies:';
    RAISE NOTICE '';
    RAISE NOTICE '1. Test as Owner (Active):';
    RAISE NOTICE '   - Should return "Owner"';
    RAISE NOTICE '   - Should be able to perform all operations';
    RAISE NOTICE '';
    RAISE NOTICE '2. Test as Owner (Inactive):';
    RAISE NOTICE '   - Should return "Owner" (FIXED: was returning NULL)';
    RAISE NOTICE '   - Should be able to perform all operations';
    RAISE NOTICE '';
    RAISE NOTICE '3. Test as Active User (non-Owner):';
    RAISE NOTICE '   - Should return their role (e.g., "Manager", "FieldStaff")';
    RAISE NOTICE '   - Should be able to perform operations based on their role';
    RAISE NOTICE '';
    RAISE NOTICE '4. Test as Inactive User (non-Owner):';
    RAISE NOTICE '   - Should return NULL';
    RAISE NOTICE '   - Should be blocked from operations (RLS should deny)';
    RAISE NOTICE '';
    RAISE NOTICE '5. Test as Unauthenticated User:';
    RAISE NOTICE '   - Should return NULL';
    RAISE NOTICE '   - Should be blocked from all operations';
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
END $$;

-- ============================================
-- TEST 4: Verify function security settings
-- ============================================

DO $$
DECLARE
    has_security_definer BOOLEAN;
    has_search_path BOOLEAN;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST 4: Verify function security settings';
    RAISE NOTICE '========================================';
    
    -- Check SECURITY DEFINER
    SELECT p.prosecdef INTO has_security_definer
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.proname = 'get_user_role'
    AND n.nspname = 'public';
    
    IF has_security_definer THEN
        RAISE NOTICE '✓ Function has SECURITY DEFINER (required)';
    ELSE
        RAISE WARNING '✗ Function does NOT have SECURITY DEFINER';
    END IF;
    
    -- Check search_path setting
    SELECT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'get_user_role'
        AND n.nspname = 'public'
        AND p.proconfig IS NOT NULL
        AND 'search_path=public' = ANY(p.proconfig)
    ) INTO has_search_path;
    
    IF has_search_path THEN
        RAISE NOTICE '✓ Function has search_path set to public';
    ELSE
        RAISE WARNING '⚠ Function may not have search_path set (check manually)';
    END IF;
    
    RAISE NOTICE '';
END $$;

-- ============================================
-- SUMMARY
-- ============================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'TEST SUMMARY';
    RAISE NOTICE '========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'If all tests passed:';
    RAISE NOTICE '  ✓ get_user_role() function is fixed';
    RAISE NOTICE '  ✓ RLS policies should work correctly';
    RAISE NOTICE '';
    RAISE NOTICE 'Next steps:';
    RAISE NOTICE '  1. Test with actual user accounts (see TEST 3)';
    RAISE NOTICE '  2. Verify Owners can perform operations';
    RAISE NOTICE '  3. Verify Active users can perform operations';
    RAISE NOTICE '  4. Verify Inactive users are blocked';
    RAISE NOTICE '  5. Monitor for any RLS policy issues';
    RAISE NOTICE '';
    RAISE NOTICE 'If issues persist:';
    RAISE NOTICE '  - Check audit_logs table for RLS denials';
    RAISE NOTICE '  - Review specific RLS policy definitions';
    RAISE NOTICE '  - Verify user status and role in users table';
    RAISE NOTICE '';
END $$;

