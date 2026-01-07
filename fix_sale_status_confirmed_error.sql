-- ============================================
-- FIX SALE STATUS "CONFIRMED" ERROR
-- ============================================
-- This script fixes the issue where the database is trying to use
-- "Confirmed" as a sale_status value, which doesn't exist in the enum.
-- Run this script in Supabase SQL Editor.
-- ============================================

-- Step 1: Check current sale_status enum values
SELECT enumlabel, enumsortorder 
FROM pg_enum 
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'sale_status')
ORDER BY enumsortorder;

-- Step 2: Check for any triggers on the sales table
SELECT 
    trigger_name,
    event_manipulation,
    action_statement,
    action_timing
FROM information_schema.triggers
WHERE event_object_table = 'sales';

-- Step 3: FIX - Drop triggers that might be causing the issue
DROP TRIGGER IF EXISTS update_sale_status_on_confirm ON sales;
DROP TRIGGER IF EXISTS set_sale_confirmed ON sales;
DROP TRIGGER IF EXISTS on_sale_confirm ON sales;
DROP TRIGGER IF EXISTS trigger_sale_status ON sales;

-- Step 4: Fix land pieces status - set to 'Reserved' for pieces with non-completed sales
UPDATE land_pieces lp
SET status = 'Reserved'
WHERE lp.id IN (
    SELECT unnest(s.land_piece_ids)
    FROM sales s
    WHERE s.status != 'Completed'
    AND s.status != 'Cancelled'
)
AND lp.status = 'Sold';

-- Step 5: Create a fixed trigger function (replaces any problematic one)
CREATE OR REPLACE FUNCTION handle_sale_confirmation()
RETURNS TRIGGER AS $$
BEGIN
    -- If is_confirmed is being set to true, update status to Completed (NOT Confirmed)
    IF TG_OP = 'UPDATE' AND NEW.is_confirmed = true AND (OLD.is_confirmed IS NULL OR OLD.is_confirmed = false) THEN
        NEW.status = 'Completed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Verify pieces status
SELECT 
    lp.id as piece_id,
    lp.piece_number,
    lp.status as piece_status,
    s.id as sale_id,
    s.status as sale_status,
    s.payment_type
FROM land_pieces lp
LEFT JOIN sales s ON lp.id = ANY(s.land_piece_ids) AND s.status != 'Cancelled'
WHERE s.id IS NOT NULL
ORDER BY lp.piece_number
LIMIT 20;

-- Step 7: Show summary of sales statuses
SELECT 
    status,
    COUNT(*) as count
FROM sales
GROUP BY status
ORDER BY count DESC;

-- Step 8: Show summary of land pieces statuses
SELECT 
    status,
    COUNT(*) as count
FROM land_pieces
GROUP BY status
ORDER BY count DESC;
