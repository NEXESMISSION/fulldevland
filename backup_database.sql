-- ============================================
-- FULLLANDDEV - Database Backup Query
-- This query exports all important data for backup
-- Run this before any reset operations
-- ============================================

-- Backup Users (keep saifelleuchi127@gmail.com and abir@gmail.com)
SELECT 
    'users' as table_name,
    id,
    name,
    email,
    role,
    status,
    allowed_pages,
    page_order,
    sidebar_order,
    created_at,
    updated_at
FROM users
ORDER BY email;

-- Backup Land Batches
SELECT 
    'land_batches' as table_name,
    id,
    name,
    total_surface,
    total_cost,
    date_acquired,
    price_per_m2_full,
    price_per_m2_installment,
    company_fee_percentage,
    company_fee_percentage_full,
    location,
    image_url,
    notes,
    created_by,
    created_at,
    updated_at
FROM land_batches
ORDER BY name, created_at;

-- Backup Land Pieces (الأراضي) - KEEP ALL OF THESE
SELECT 
    'land_pieces' as table_name,
    id,
    land_batch_id,
    piece_number,
    surface_area,
    purchase_cost,
    selling_price_full,
    selling_price_installment,
    status,
    reserved_until,
    reservation_client_id,
    notes,
    created_at,
    updated_at
FROM land_pieces
ORDER BY land_batch_id, piece_number;

-- Backup Clients
SELECT 
    'clients' as table_name,
    id,
    name,
    cin,
    phone,
    email,
    address,
    client_type,
    notes,
    created_by,
    created_at,
    updated_at
FROM clients
ORDER BY name;

-- Backup Sales
SELECT 
    'sales' as table_name,
    id,
    client_id,
    land_piece_ids,
    reservation_id,
    payment_type,
    total_purchase_cost,
    total_selling_price,
    profit_margin,
    small_advance_amount,
    big_advance_amount,
    installment_start_date,
    installment_end_date,
    number_of_installments,
    monthly_installment_amount,
    status,
    sale_date,
    deadline_date,
    selected_offer_id,
    notes,
    created_by,
    created_at,
    updated_at
FROM sales
ORDER BY sale_date DESC;

-- Backup Installments
SELECT 
    'installments' as table_name,
    id,
    sale_id,
    installment_number,
    amount_due,
    amount_paid,
    stacked_amount,
    due_date,
    paid_date,
    status,
    notes,
    created_at,
    updated_at
FROM installments
ORDER BY sale_id, installment_number;

-- Backup Payments
SELECT 
    'payments' as table_name,
    id,
    client_id,
    sale_id,
    installment_id,
    reservation_id,
    amount_paid,
    payment_type,
    payment_date,
    payment_method,
    notes,
    recorded_by,
    created_at,
    updated_at
FROM payments
ORDER BY payment_date DESC;

-- Backup Reservations
SELECT 
    'reservations' as table_name,
    id,
    client_id,
    land_piece_ids,
    small_advance_amount,
    reservation_date,
    reserved_until,
    status,
    notes,
    created_by,
    created_at,
    updated_at
FROM reservations
ORDER BY reservation_date DESC;

-- Backup Payment Offers
SELECT 
    'payment_offers' as table_name,
    id,
    land_batch_id,
    land_piece_id,
    offer_name,
    price_per_m2_installment,
    company_fee_percentage,
    advance_amount,
    advance_is_percentage,
    monthly_payment,
    number_of_months,
    calculation_method,
    is_default,
    notes,
    created_by,
    created_at,
    updated_at
FROM payment_offers
ORDER BY created_at DESC;

-- Backup Expenses
SELECT 
    'expenses' as table_name,
    id,
    amount,
    category,
    description,
    expense_date,
    payment_method,
    notes,
    created_by,
    created_at,
    updated_at
FROM expenses
ORDER BY expense_date DESC;

-- Backup Debts
SELECT 
    'debts' as table_name,
    id,
    creditor_name,
    amount_owed,
    due_date,
    check_number,
    reference_number,
    notes,
    status,
    created_by,
    created_at,
    updated_at
FROM debts
ORDER BY due_date;

-- Summary Counts
SELECT 
    'summary' as table_name,
    (SELECT COUNT(*) FROM users) as users_count,
    (SELECT COUNT(*) FROM land_batches) as batches_count,
    (SELECT COUNT(*) FROM land_pieces) as pieces_count,
    (SELECT COUNT(*) FROM clients) as clients_count,
    (SELECT COUNT(*) FROM sales) as sales_count,
    (SELECT COUNT(*) FROM installments) as installments_count,
    (SELECT COUNT(*) FROM payments) as payments_count,
    (SELECT COUNT(*) FROM reservations) as reservations_count;

