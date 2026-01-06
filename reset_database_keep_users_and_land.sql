-- ============================================
-- FULLLANDDEV - Database Reset Script
-- Keeps: 
--   - Users: saifelleuchi127@gmail.com and abir@gmail.com
--   - All Land Pieces (الأراضي) - keeps piece_number and surface_area
--   - Cleans up status of land pieces (sets to 'Available')
-- ============================================
-- WARNING: This will delete most data except specified users and land pieces
-- Run backup_database.sql FIRST to backup your data!
-- ============================================

BEGIN;

-- Step 1: Store the users we want to keep
CREATE TEMP TABLE users_to_keep AS
SELECT id, email, name, role, status, allowed_pages, page_order, sidebar_order, created_at, updated_at
FROM users
WHERE email IN ('saifelleuchi127@gmail.com', 'abir@gmail.com');

-- Step 2: Store all land pieces data (we want to keep ALL of them)
CREATE TEMP TABLE land_pieces_backup AS
SELECT 
    id,
    land_batch_id,
    piece_number,
    surface_area,
    purchase_cost,
    selling_price_full,
    selling_price_installment,
    notes,
    created_at,
    updated_at
FROM land_pieces;

-- Step 3: Store land batches that have pieces we're keeping
CREATE TEMP TABLE land_batches_to_keep AS
SELECT DISTINCT lb.*
FROM land_batches lb
INNER JOIN land_pieces_backup lpb ON lb.id = lpb.land_batch_id;

-- Step 4: Delete all data (in correct order to respect foreign keys)

-- Delete installments first (depends on sales)
DELETE FROM installments;

-- Delete payments (depends on sales, installments, reservations)
DELETE FROM payments;

-- Delete sales (depends on clients, land_pieces, reservations)
DELETE FROM sales;

-- Delete reservations (depends on clients, land_pieces)
DELETE FROM reservations;

-- Delete payment offers (depends on land_batches, land_pieces)
DELETE FROM payment_offers;

-- Delete expenses
DELETE FROM expenses;

-- Delete debts
DELETE FROM debts;

-- Delete clients
DELETE FROM clients;

-- Delete land pieces (we'll restore them)
DELETE FROM land_pieces;

-- Delete land batches (we'll restore the ones we need)
DELETE FROM land_batches;

-- Delete all users except the ones we're keeping
DELETE FROM users
WHERE email NOT IN ('saifelleuchi127@gmail.com', 'abir@gmail.com');

-- Step 5: Restore land batches
INSERT INTO land_batches (
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
)
SELECT 
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
FROM land_batches_to_keep;

-- Step 6: Restore land pieces with cleaned status
INSERT INTO land_pieces (
    id,
    land_batch_id,
    piece_number,
    surface_area,
    purchase_cost,
    selling_price_full,
    selling_price_installment,
    status,  -- Set to 'Available' (cleaned)
    reserved_until,
    reservation_client_id,
    notes,
    created_at,
    updated_at
)
SELECT 
    id,
    land_batch_id,
    piece_number,
    surface_area,  -- KEEP surface_area
    purchase_cost,
    selling_price_full,
    selling_price_installment,
    'Available' as status,  -- CLEAN STATUS - set to Available
    NULL as reserved_until,  -- Clear reservation dates
    NULL as reservation_client_id,  -- Clear reservation client
    notes,
    created_at,
    updated_at
FROM land_pieces_backup;

-- Step 7: Clean up temp tables
DROP TABLE IF EXISTS users_to_keep;
DROP TABLE IF EXISTS land_pieces_backup;
DROP TABLE IF EXISTS land_batches_to_keep;

COMMIT;

-- Verification queries
SELECT 
    'Users kept' as info,
    COUNT(*) as count,
    STRING_AGG(email, ', ') as emails
FROM users;

SELECT 
    'Land batches kept' as info,
    COUNT(*) as count
FROM land_batches;

SELECT 
    'Land pieces kept' as info,
    COUNT(*) as count,
    COUNT(DISTINCT land_batch_id) as batches_count
FROM land_pieces;

SELECT 
    'Land pieces status' as info,
    status,
    COUNT(*) as count
FROM land_pieces
GROUP BY status;

-- Summary
SELECT 
    'RESET COMPLETE' as status,
    (SELECT COUNT(*) FROM users) as users_count,
    (SELECT COUNT(*) FROM land_batches) as batches_count,
    (SELECT COUNT(*) FROM land_pieces) as pieces_count,
    (SELECT COUNT(*) FROM land_pieces WHERE status = 'Available') as available_pieces;

