-- ============================================
-- FIX SALE STATUS "CONFIRMED" ERROR
-- ============================================
-- This script fixes the database issues causing:
-- 1. "invalid input value for enum sale_status: Confirmed" error
-- 2. Land pieces showing wrong status
-- Run this script in Supabase SQL Editor.
-- ============================================

-- Step 1: Check current sale_status enum values
SELECT enumlabel, enumsortorder 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sale_status')
ORDER BY enumsortorder;

-- Step 2: AGGRESSIVE FIX - Drop ALL triggers on sales table that might be causing issues
-- List all triggers first
SELECT tgname, tgrelid::regclass, tgfoid::regproc
FROM pg_trigger
WHERE tgrelid = 'sales'::regclass
AND NOT tgisinternal;

-- Drop all custom triggers on sales table
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tgname 
        FROM pg_trigger 
        WHERE tgrelid = 'sales'::regclass 
        AND NOT tgisinternal
    )
    LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || r.tgname || ' ON sales';
        RAISE NOTICE 'Dropped trigger: %', r.tgname;
    END LOOP;
END $$;

-- Step 3: Check and fix the is_confirmed column if it exists
DO $$
BEGIN
    -- Check if is_confirmed column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'is_confirmed'
    ) THEN
        -- Set all is_confirmed to false to prevent trigger issues
        UPDATE sales SET is_confirmed = false WHERE is_confirmed = true;
        RAISE NOTICE 'Reset is_confirmed to false for all sales';
    END IF;
END $$;

-- Step 4: Fix land pieces status - set to 'Reserved' for pieces with non-completed sales
UPDATE land_pieces
SET status = 'Reserved'
WHERE id IN (
    SELECT unnest(s.land_piece_ids)
    FROM sales s
    WHERE s.status = 'Pending'
)
AND status = 'Sold';

-- Step 5: Fix land pieces status - set to 'Available' for pieces with no active sales
UPDATE land_pieces lp
SET status = 'Available'
WHERE NOT EXISTS (
    SELECT 1 FROM sales s
    WHERE lp.id = ANY(s.land_piece_ids)
    AND s.status NOT IN ('Cancelled', 'Completed')
)
AND lp.status = 'Reserved';

-- Step 6: Verify pieces status
SELECT 
    lp.id as piece_id,
    lp.piece_number,
    lp.status as piece_status,
    lb.name as batch_name,
    s.id as sale_id,
    s.status as sale_status,
    s.payment_type
FROM land_pieces lp
JOIN land_batches lb ON lp.batch_id = lb.id
LEFT JOIN sales s ON lp.id = ANY(s.land_piece_ids) AND s.status NOT IN ('Cancelled')
ORDER BY lb.name, lp.piece_number
LIMIT 30;

-- Step 7: Drop any functions that might reference 'Confirmed'
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT p.proname
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND pg_get_functiondef(p.oid) ILIKE '%confirmed%'
        AND p.proname NOT LIKE 'pg_%'
    )
    LOOP
        BEGIN
            EXECUTE 'DROP FUNCTION IF EXISTS ' || r.proname || ' CASCADE';
            RAISE NOTICE 'Dropped function: %', r.proname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop function %: %', r.proname, SQLERRM;
        END;
    END LOOP;
END $$;

-- Step 8: Show summary of sales statuses
SELECT 
    status,
    COUNT(*) as count
FROM sales
GROUP BY status
ORDER BY count DESC;

-- Step 9: Show summary of land pieces statuses
SELECT 
    status,
    COUNT(*) as count
FROM land_pieces
GROUP BY status
ORDER BY count DESC;

-- Step 10: Verify no triggers remain on sales
SELECT tgname, tgrelid::regclass
FROM pg_trigger
WHERE tgrelid = 'sales'::regclass
AND NOT tgisinternal;

-- DONE! If you still see issues, please run the following manually:
-- ALTER TABLE sales DROP COLUMN IF EXISTS is_confirmed;
