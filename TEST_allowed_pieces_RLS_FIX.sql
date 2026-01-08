-- ============================================
-- TEST SCRIPT: Verify allowed_pieces RLS Security Fix
-- ============================================
-- Run this AFTER applying FIX_allowed_pieces_RLS_SECURITY.sql
-- ============================================

-- ============================================
-- Test 1: Verify helper functions exist
-- ============================================
SELECT 'Test 1: Checking helper functions...' as test;

SELECT 
    proname as function_name,
    CASE 
        WHEN proname = 'can_access_land_piece' THEN '✅ Found'
        WHEN proname = 'can_access_land_batch' THEN '✅ Found'
        ELSE '❌ Missing'
    END as status
FROM pg_proc
WHERE proname IN ('can_access_land_piece', 'can_access_land_batch');

-- ============================================
-- Test 2: Verify RLS is enabled
-- ============================================
SELECT 'Test 2: Checking RLS status...' as test;

SELECT 
    tablename,
    CASE 
        WHEN rowsecurity THEN '✅ RLS Enabled'
        ELSE '❌ RLS Disabled'
    END as rls_status
FROM pg_tables 
WHERE tablename IN ('land_pieces', 'land_batches');

-- ============================================
-- Test 3: Verify policies exist
-- ============================================
SELECT 'Test 3: Checking RLS policies...' as test;

SELECT 
    tablename,
    policyname,
    cmd as operation,
    CASE 
        WHEN qual LIKE '%can_access_land_piece%' OR qual LIKE '%can_access_land_batch%' THEN '✅ Using access functions'
        WHEN qual LIKE '%USING (true)%' THEN '⚠️ WARNING: Permissive policy (no restrictions)'
        ELSE '✅ Policy exists'
    END as status
FROM pg_policies 
WHERE tablename IN ('land_pieces', 'land_batches')
ORDER BY tablename, cmd;

-- ============================================
-- Test 4: Check for old permissive policies
-- ============================================
SELECT 'Test 4: Checking for old permissive policies...' as test;

SELECT 
    tablename,
    policyname,
    '⚠️ WARNING: Old permissive policy found!' as warning
FROM pg_policies 
WHERE tablename IN ('land_pieces', 'land_batches')
  AND (qual LIKE '%USING (true)%' OR qual IS NULL)
  AND cmd = 'SELECT';

-- ============================================
-- Test 5: Verify function security settings
-- ============================================
SELECT 'Test 5: Checking function security...' as test;

SELECT 
    proname as function_name,
    prosecdef as is_security_definer,
    CASE 
        WHEN prosecdef THEN '✅ SECURITY DEFINER (correct)'
        ELSE '⚠️ SECURITY INVOKER (may cause issues)'
    END as status
FROM pg_proc
WHERE proname IN ('can_access_land_piece', 'can_access_land_batch');

-- ============================================
-- Test 6: Manual test instructions
-- ============================================
SELECT 'Test 6: Manual Testing Required' as test;

-- To manually test:
-- 1. Create a test user with restricted allowed_pieces:
--    UPDATE users SET allowed_pieces = ARRAY['piece-uuid-1', 'piece-uuid-2']::UUID[] 
--    WHERE email = 'test-worker@example.com';
--
-- 2. Authenticate as that user in your application
--
-- 3. Try to query all pieces:
--    SELECT * FROM land_pieces;
--    Expected: Only returns piece-uuid-1 and piece-uuid-2
--
-- 4. Try to access a restricted piece:
--    SELECT * FROM land_pieces WHERE id = 'restricted-piece-uuid';
--    Expected: Returns empty (access denied)
--
-- 5. Authenticate as Owner:
--    SELECT * FROM land_pieces;
--    Expected: Returns ALL pieces

-- ============================================
-- Test 7: Count policies per table
-- ============================================
SELECT 'Test 7: Policy count verification...' as test;

SELECT 
    tablename,
    COUNT(*) as policy_count,
    CASE 
        WHEN tablename = 'land_pieces' AND COUNT(*) >= 4 THEN '✅ Expected (4 policies: SELECT, INSERT, UPDATE, DELETE)'
        WHEN tablename = 'land_batches' AND COUNT(*) >= 4 THEN '✅ Expected (4 policies: SELECT, INSERT, UPDATE, DELETE)'
        ELSE '⚠️ Unexpected policy count'
    END as status
FROM pg_policies 
WHERE tablename IN ('land_pieces', 'land_batches')
GROUP BY tablename;

-- ============================================
-- Summary
-- ============================================
SELECT '============================================' as summary;
SELECT 'TEST SUMMARY' as summary;
SELECT '============================================' as summary;
SELECT 'If all tests show ✅, the fix is correctly applied.' as summary;
SELECT 'If you see ⚠️ warnings, review those policies.' as summary;
SELECT 'Manual testing with real users is required!' as summary;
SELECT '============================================' as summary;

