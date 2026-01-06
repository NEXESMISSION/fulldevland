-- ============================================
-- SQL Script: Verify selected_offer_id column exists
-- ============================================
-- This script verifies that the selected_offer_id column exists in the sales table
-- and checks if there are any sales with selected offers.
--
-- IMPORTANT: Run this script in Supabase SQL Editor
-- ============================================

-- Step 1: Check if column exists
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'sales' 
AND column_name = 'selected_offer_id';

-- Step 2: Check if there are any sales with selected offers
SELECT 
    COUNT(*) as total_sales,
    COUNT(selected_offer_id) as sales_with_selected_offer,
    COUNT(*) - COUNT(selected_offer_id) as sales_without_selected_offer
FROM public.sales
WHERE status = 'Pending' AND payment_type = 'Installment';

-- Step 3: Show sample sales with selected offers
SELECT 
    s.id,
    s.status,
    s.payment_type,
    s.selected_offer_id,
    po.offer_name,
    po.company_fee_percentage,
    po.monthly_payment
FROM public.sales s
LEFT JOIN public.payment_offers po ON s.selected_offer_id = po.id
WHERE s.status = 'Pending' 
AND s.payment_type = 'Installment'
LIMIT 10;

-- Expected results:
-- 1. Column should exist with type UUID, nullable, no default
-- 2. Should show count of sales with/without selected offers
-- 3. Should show sample sales with their selected offer details

