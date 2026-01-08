-- ============================================
-- UNDO SALE FOR: Rami bahloul (CIN: 11075951)
-- This will return the sale to confirmation page
-- ============================================

-- First, let's see what we're dealing with:
SELECT 
    'CLIENT' as type,
    c.id::text as id,
    c.name as name,
    c.cin as info,
    NULL as status,
    NULL as amount
FROM clients c WHERE c.cin = '11075951'

UNION ALL

SELECT 
    'SALE' as type,
    s.id::text as id,
    s.payment_type::text as name,
    s.status::text as info,
    s.status::text as status,
    s.total_selling_price::text as amount
FROM sales s
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951'

UNION ALL

SELECT 
    'PIECE' as type,
    lp.id::text as id,
    lp.piece_number as name,
    lb.name as info,
    lp.status::text as status,
    lp.surface_area::text as amount
FROM land_pieces lp
JOIN land_batches lb ON lp.land_batch_id = lb.id
JOIN sales s ON lp.id = ANY(s.land_piece_ids)
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951';

-- ============================================
-- RUN THIS TO UNDO THE SALE:
-- ============================================

-- Step 1: Reset all installments to unpaid
UPDATE installments i
SET 
    amount_paid = 0,
    stacked_amount = 0,
    status = 'Unpaid',
    paid_date = NULL
FROM sales s
JOIN clients c ON s.client_id = c.id
WHERE i.sale_id = s.id
AND c.cin = '11075951';

-- Step 2: Delete all payment records (BigAdvance, Installment payments, etc.)
DELETE FROM payments p
USING sales s, clients c
WHERE p.sale_id = s.id
AND s.client_id = c.id
AND c.cin = '11075951';

-- Step 3: Reset sale status to 'Pending' (so it appears in confirmation page)
UPDATE sales s
SET 
    status = 'Pending',
    big_advance_amount = 0,
    promise_completed = FALSE,
    promise_initial_payment = 0
FROM clients c
WHERE s.client_id = c.id
AND c.cin = '11075951';

-- Step 4: Reset piece status from 'Sold' to 'Reserved'
UPDATE land_pieces lp
SET status = 'Reserved'
FROM sales s, clients c
WHERE lp.id = ANY(s.land_piece_ids)
AND s.client_id = c.id
AND c.cin = '11075951'
AND lp.status = 'Sold';

-- ============================================
-- VERIFY THE CHANGES:
-- ============================================

SELECT 
    'AFTER - SALE' as check_type,
    s.id::text as id,
    s.status::text as status,
    s.payment_type::text as payment_type,
    s.total_selling_price::text as amount
FROM sales s
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951'

UNION ALL

SELECT 
    'AFTER - PIECE' as check_type,
    lp.piece_number as id,
    lp.status::text as status,
    lb.name as payment_type,
    lp.surface_area::text as amount
FROM land_pieces lp
JOIN land_batches lb ON lp.land_batch_id = lb.id
JOIN sales s ON lp.id = ANY(s.land_piece_ids)
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951'

UNION ALL

SELECT 
    'AFTER - INSTALLMENTS' as check_type,
    COUNT(*)::text as id,
    CASE WHEN SUM(amount_paid) = 0 THEN 'All Reset' ELSE 'Has Payments' END as status,
    NULL as payment_type,
    COALESCE(SUM(amount_paid), 0)::text as amount
FROM installments i
JOIN sales s ON i.sale_id = s.id
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951';
