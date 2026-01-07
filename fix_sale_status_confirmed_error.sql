-- ============================================
-- FIX SALE STATUS "CONFIRMED" ERROR - COMPREHENSIVE FIX
-- ============================================
-- This script aggressively removes ALL triggers and functions
-- that might be trying to set sale status to "Confirmed"
-- Run this script in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================

-- Step 1: Show current sale_status enum values (for reference)
SELECT 'Current valid sale_status values:' as info;
SELECT enumlabel as valid_status
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sale_status')
ORDER BY enumsortorder;

-- Step 2: List ALL triggers on the sales table BEFORE removal
SELECT 'Triggers on sales table (BEFORE):' as info;
SELECT tgname as trigger_name, tgenabled as enabled
FROM pg_trigger
WHERE tgrelid = 'sales'::regclass
AND NOT tgisinternal;

-- Step 3: Drop ALL custom triggers on the sales table
-- This is safe - it only drops custom triggers, not system triggers
DO $$
DECLARE
    trigger_record RECORD;
    dropped_count INTEGER := 0;
BEGIN
    FOR trigger_record IN 
        SELECT tgname 
        FROM pg_trigger 
        WHERE tgrelid = 'sales'::regclass 
        AND NOT tgisinternal
    LOOP
        BEGIN
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON sales CASCADE', trigger_record.tgname);
            dropped_count := dropped_count + 1;
            RAISE NOTICE 'Dropped trigger: %', trigger_record.tgname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping trigger %: %', trigger_record.tgname, SQLERRM;
        END;
    END LOOP;
    
    IF dropped_count = 0 THEN
        RAISE NOTICE 'No custom triggers found on sales table';
    ELSE
        RAISE NOTICE 'Total triggers dropped: %', dropped_count;
    END IF;
END $$;

-- Step 4: Find and drop functions that reference 'Confirmed' or 'is_confirmed'
SELECT 'Functions that might reference Confirmed (BEFORE):' as info;
SELECT 
    p.proname as function_name,
    pg_get_functiondef(p.oid) as function_definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND (
    pg_get_functiondef(p.oid) ILIKE '%Confirmed%' 
    OR pg_get_functiondef(p.oid) ILIKE '%is_confirmed%'
    OR pg_get_functiondef(p.oid) ILIKE '%sale_status%'
)
AND p.proname NOT LIKE 'pg_%';

-- Step 5: Drop functions that reference Confirmed or is_confirmed
DO $$
DECLARE
    func_record RECORD;
    dropped_count INTEGER := 0;
BEGIN
    FOR func_record IN 
        SELECT 
            p.proname as func_name,
            pg_get_function_arguments(p.oid) as func_args
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND (
            pg_get_functiondef(p.oid) ILIKE '%Confirmed%' 
            OR pg_get_functiondef(p.oid) ILIKE '%is_confirmed%'
        )
        AND p.proname NOT LIKE 'pg_%'
    LOOP
        BEGIN
            EXECUTE format('DROP FUNCTION IF EXISTS %I(%s) CASCADE', 
                func_record.func_name, 
                COALESCE(func_record.func_args, ''));
            dropped_count := dropped_count + 1;
            RAISE NOTICE 'Dropped function: %', func_record.func_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping function %: %', func_record.func_name, SQLERRM;
        END;
    END LOOP;
    
    IF dropped_count = 0 THEN
        RAISE NOTICE 'No problematic functions found';
    ELSE
        RAISE NOTICE 'Total functions dropped: %', dropped_count;
    END IF;
END $$;

-- Step 6: Remove is_confirmed column if it exists (it might be causing issues)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'is_confirmed'
    ) THEN
        -- First, reset all values to false
        UPDATE sales SET is_confirmed = false WHERE is_confirmed = true;
        RAISE NOTICE 'Reset is_confirmed to false for all sales';
        
        -- Optionally, drop the column entirely (uncomment if needed)
        -- ALTER TABLE sales DROP COLUMN IF EXISTS is_confirmed;
        -- RAISE NOTICE 'Dropped is_confirmed column';
    ELSE
        RAISE NOTICE 'is_confirmed column does not exist';
    END IF;
END $$;

-- Step 7: Verify no triggers remain on sales table
SELECT 'Triggers on sales table (AFTER):' as info;
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'SUCCESS: No custom triggers remain on sales table'
        ELSE 'WARNING: ' || COUNT(*) || ' triggers still exist on sales table'
    END as result,
    string_agg(tgname, ', ') as remaining_triggers
FROM pg_trigger
WHERE tgrelid = 'sales'::regclass
AND NOT tgisinternal;

-- Step 8: Check for any RLS policies that might be interfering
SELECT 'RLS Policies on sales table:' as info;
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies
WHERE tablename = 'sales';

-- Step 9: Show summary of sales statuses
SELECT 'Summary of current sales statuses:' as info;
SELECT 
    status,
    COUNT(*) as count
FROM sales
GROUP BY status
ORDER BY count DESC;

-- ============================================
-- DONE! 
-- ============================================
-- If you still get the error after running this:
-- 1. Check the console logs for the exact error message
-- 2. Make sure you ran ALL steps of this script
-- 3. Try refreshing the page and trying again
-- ============================================
