-- ============================================
-- UNDO SALE - RETURN TO CONFIRMATION PAGE
-- ============================================
-- This script will:
-- 1. Reset sale status from 'Completed' to 'Pending'
-- 2. Reset piece status from 'Sold' to 'Reserved'
-- 3. Reset all installments to unpaid
-- 4. Delete payment records (optional)
-- 5. Reset big_advance and other payment fields
-- ============================================

-- STEP 1: Find the client and their sales
-- Replace '11075951' with the client's CIN
SELECT 
    c.id as client_id,
    c.name as client_name,
    c.cin,
    s.id as sale_id,
    s.status as sale_status,
    s.payment_type,
    s.total_selling_price,
    s.big_advance_amount,
    s.small_advance_amount
FROM clients c
JOIN sales s ON s.client_id = c.id
WHERE c.cin = '11075951';

-- STEP 2: Find the pieces associated with the sale
SELECT 
    sp.sale_id,
    sp.land_piece_id,
    lp.piece_number,
    lp.area,
    lp.status as piece_status,
    lb.name as batch_name
FROM sale_pieces sp
JOIN land_pieces lp ON sp.land_piece_id = lp.id
JOIN land_batches lb ON lp.land_batch_id = lb.id
JOIN sales s ON sp.sale_id = s.id
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951';

-- STEP 3: Find all payments for this client's sales
SELECT 
    pr.id,
    pr.sale_id,
    pr.payment_type,
    pr.amount,
    pr.payment_date,
    pr.notes
FROM payment_records pr
JOIN sales s ON pr.sale_id = s.id
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951'
ORDER BY pr.payment_date;

-- STEP 4: Find all installments
SELECT 
    i.id,
    i.sale_id,
    i.installment_number,
    i.amount_due,
    i.amount_paid,
    i.stacked_amount,
    i.status,
    i.due_date
FROM installments i
JOIN sales s ON i.sale_id = s.id
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951'
ORDER BY i.installment_number;

-- ============================================
-- EXECUTE THE UNDO (UNCOMMENT TO RUN)
-- ============================================

/*
-- IMPORTANT: Replace 'SALE_ID_HERE' with the actual sale ID from Step 1
-- Or use the client CIN to affect all sales for that client

DO $$
DECLARE
    v_client_cin VARCHAR := '11075951';  -- Change this to the client's CIN
    v_sale_record RECORD;
BEGIN
    -- Loop through all sales for this client
    FOR v_sale_record IN 
        SELECT s.id as sale_id
        FROM sales s
        JOIN clients c ON s.client_id = c.id
        WHERE c.cin = v_client_cin
    LOOP
        RAISE NOTICE 'Processing sale: %', v_sale_record.sale_id;
        
        -- 1. Reset installments to unpaid
        UPDATE installments
        SET 
            amount_paid = 0,
            stacked_amount = 0,
            status = 'Unpaid',
            paid_date = NULL
        WHERE sale_id = v_sale_record.sale_id;
        
        RAISE NOTICE 'Reset installments for sale: %', v_sale_record.sale_id;
        
        -- 2. Delete payment records (except reservation/small_advance if you want to keep it)
        -- Option A: Delete ALL payment records
        DELETE FROM payment_records WHERE sale_id = v_sale_record.sale_id;
        
        -- Option B: Keep only SmallAdvance (reservation), delete the rest
        -- DELETE FROM payment_records WHERE sale_id = v_sale_record.sale_id AND payment_type != 'SmallAdvance';
        
        RAISE NOTICE 'Deleted payment records for sale: %', v_sale_record.sale_id;
        
        -- 3. Reset sale status and payment fields
        UPDATE sales
        SET 
            status = 'Pending',
            big_advance_amount = 0,
            promise_completed = FALSE,
            promise_initial_payment = 0
        WHERE id = v_sale_record.sale_id;
        
        RAISE NOTICE 'Reset sale status to Pending: %', v_sale_record.sale_id;
        
        -- 4. Reset piece status from 'Sold' to 'Reserved'
        UPDATE land_pieces lp
        SET status = 'Reserved'
        FROM sale_pieces sp
        WHERE sp.land_piece_id = lp.id
        AND sp.sale_id = v_sale_record.sale_id
        AND lp.status = 'Sold';
        
        RAISE NOTICE 'Reset piece status to Reserved for sale: %', v_sale_record.sale_id;
        
    END LOOP;
    
    RAISE NOTICE 'DONE! All sales for client % have been reset to Pending status.', v_client_cin;
END $$;
*/

-- ============================================
-- ALTERNATIVE: UNDO A SPECIFIC SALE BY ID
-- ============================================

/*
-- Replace 'YOUR_SALE_ID' with the actual sale UUID
DO $$
DECLARE
    v_sale_id UUID := 'YOUR_SALE_ID';  -- Change this!
BEGIN
    -- 1. Reset installments
    UPDATE installments
    SET amount_paid = 0, stacked_amount = 0, status = 'Unpaid', paid_date = NULL
    WHERE sale_id = v_sale_id;
    
    -- 2. Delete payment records
    DELETE FROM payment_records WHERE sale_id = v_sale_id;
    
    -- 3. Reset sale status
    UPDATE sales
    SET status = 'Pending', big_advance_amount = 0, promise_completed = FALSE
    WHERE id = v_sale_id;
    
    -- 4. Reset piece status
    UPDATE land_pieces lp
    SET status = 'Reserved'
    FROM sale_pieces sp
    WHERE sp.land_piece_id = lp.id AND sp.sale_id = v_sale_id;
    
    RAISE NOTICE 'Sale % has been reset to Pending!', v_sale_id;
END $$;
*/

-- ============================================
-- VERIFY AFTER RUNNING
-- ============================================
/*
-- Check sale status
SELECT id, status, payment_type, total_selling_price, big_advance_amount 
FROM sales s
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951';

-- Check piece status
SELECT lp.piece_number, lp.status, lb.name
FROM land_pieces lp
JOIN sale_pieces sp ON sp.land_piece_id = lp.id
JOIN sales s ON sp.sale_id = s.id
JOIN clients c ON s.client_id = c.id
JOIN land_batches lb ON lp.land_batch_id = lb.id
WHERE c.cin = '11075951';

-- Check installments
SELECT installment_number, amount_due, amount_paid, status
FROM installments i
JOIN sales s ON i.sale_id = s.id
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951';
*/

