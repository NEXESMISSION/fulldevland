-- ============================================
-- RESET INSTALLMENTS FOR CLIENT: Rami bahloul
-- CIN: 11075951
-- ============================================

-- Step 1: Find the client
SELECT id, name, cin, phone FROM clients WHERE cin = '11075951';

-- Step 2: Find all sales for this client
SELECT 
    s.id as sale_id,
    s.payment_type,
    s.total_selling_price,
    s.status,
    s.number_of_installments,
    s.monthly_installment_amount,
    s.installment_start_date,
    s.installment_end_date
FROM sales s
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951';

-- Step 3: Find all installments for this client's sales
SELECT 
    i.id,
    i.sale_id,
    i.installment_number,
    i.amount_due,
    i.amount_paid,
    i.stacked_amount,
    i.due_date,
    i.status
FROM installments i
JOIN sales s ON i.sale_id = s.id
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951'
ORDER BY i.sale_id, i.installment_number;

-- ============================================
-- RESET OPTIONS (uncomment the one you need):
-- ============================================

-- Option 1: Reset all installments to unpaid (keep amounts)
/*
UPDATE installments i
SET 
    amount_paid = 0,
    stacked_amount = 0,
    status = 'Unpaid'
FROM sales s
JOIN clients c ON s.client_id = c.id
WHERE i.sale_id = s.id
AND c.cin = '11075951';
*/

-- Option 2: Delete all installments and recreate them
/*
DELETE FROM installments i
USING sales s, clients c
WHERE i.sale_id = s.id
AND s.client_id = c.id
AND c.cin = '11075951';
*/

-- Option 3: Reset specific sale's installments (replace SALE_ID)
/*
UPDATE installments
SET 
    amount_paid = 0,
    stacked_amount = 0,
    status = 'Unpaid'
WHERE sale_id = 'SALE_ID_HERE';
*/

-- ============================================
-- EXECUTE THIS TO RESET ALL INSTALLMENTS FOR RAMI BAHLOUL:
-- ============================================

-- First, let's see what will be affected:
SELECT 
    c.name as client_name,
    c.cin,
    s.id as sale_id,
    COUNT(i.id) as installment_count,
    SUM(i.amount_paid) as total_paid,
    SUM(i.amount_due) as total_due
FROM clients c
JOIN sales s ON s.client_id = c.id
LEFT JOIN installments i ON i.sale_id = s.id
WHERE c.cin = '11075951'
GROUP BY c.name, c.cin, s.id;

-- UNCOMMENT BELOW TO EXECUTE THE RESET:
/*
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

-- Also reset the big_advance_amount on sales if needed:
UPDATE sales s
SET big_advance_amount = 0
FROM clients c
WHERE s.client_id = c.id
AND c.cin = '11075951'
AND s.payment_type = 'Installment';

-- Verify the reset:
SELECT 
    c.name,
    i.installment_number,
    i.amount_due,
    i.amount_paid,
    i.status
FROM installments i
JOIN sales s ON i.sale_id = s.id
JOIN clients c ON s.client_id = c.id
WHERE c.cin = '11075951'
ORDER BY s.id, i.installment_number;
*/

