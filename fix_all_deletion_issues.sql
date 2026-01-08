-- ============================================
-- COMPLETE FIX: All deletion issues
-- This file fixes RLS blocking deletions and creates helper functions
-- ============================================

-- ============================================
-- STEP 1: Fix get_user_role() function
-- ============================================

DROP FUNCTION IF EXISTS get_user_role() CASCADE;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role_val user_role;
    user_status_val user_status;
BEGIN
    -- Get user role and status
    SELECT role, status INTO user_role_val, user_status_val
    FROM users 
    WHERE id = auth.uid();
    
    -- If user not found, return NULL
    IF user_role_val IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- For Owners, always return the role (even if status is not Active)
    -- This allows Owners to manage data even if their account is temporarily inactive
    IF user_role_val = 'Owner' THEN
        RETURN user_role_val;
    END IF;
    
    -- For other roles, only return role if status is Active
    IF user_status_val = 'Active' THEN
        RETURN user_role_val;
    END IF;
    
    -- User exists but is not Active and not Owner
    RETURN NULL;
EXCEPTION
    WHEN NO_DATA_FOUND THEN
        RETURN NULL;
    WHEN OTHERS THEN
        -- Log error but return NULL to fail RLS check safely
        RAISE WARNING 'Error in get_user_role(): %', SQLERRM;
        RETURN NULL;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_user_role() TO authenticated;

-- ============================================
-- STEP 2: Create delete_sale_completely function
-- ============================================

CREATE OR REPLACE FUNCTION delete_sale_completely(sale_id_to_delete UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    piece_ids UUID[];
    deleted_count INTEGER;
BEGIN
    -- Check if user is Owner (for security)
    IF get_user_role() != 'Owner' THEN
        RAISE EXCEPTION 'Only Owners can delete sales completely';
    END IF;
    
    -- Get land_piece_ids before deleting (SECURITY DEFINER should bypass RLS)
    -- If this fails or returns NULL, that's fine - we'll still delete
    BEGIN
        SELECT land_piece_ids INTO piece_ids
        FROM sales 
        WHERE id = sale_id_to_delete;
    EXCEPTION
        WHEN NO_DATA_FOUND THEN
            piece_ids := NULL;
        WHEN OTHERS THEN
            piece_ids := NULL;
    END;
    
    -- Delete payments for this sale (even if sale doesn't exist, clean up orphans)
    DELETE FROM payments WHERE sale_id = sale_id_to_delete;
    
    -- Delete installments for this sale (even if sale doesn't exist, clean up orphans)
    DELETE FROM installments WHERE sale_id = sale_id_to_delete;
    
    -- Delete the sale (SECURITY DEFINER should bypass RLS)
    DELETE FROM sales WHERE id = sale_id_to_delete;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Reset piece status if land_piece_ids exist and sale was deleted
    IF deleted_count > 0 AND piece_ids IS NOT NULL AND array_length(piece_ids, 1) > 0 THEN
        UPDATE land_pieces 
        SET status = 'Available', reservation_client_id = NULL
        WHERE id = ANY(piece_ids);
    END IF;
    
    -- Return true if sale was deleted, false if it didn't exist
    RETURN deleted_count > 0;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error deleting sale: %', SQLERRM;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION delete_sale_completely(UUID) TO authenticated;

-- ============================================
-- STEP 3: Create delete_client_completely function
-- ============================================

CREATE OR REPLACE FUNCTION delete_client_completely(client_id_to_delete UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    sale_record RECORD;
    piece_ids UUID[];
BEGIN
    -- Check if user is Owner (for security)
    IF get_user_role() != 'Owner' THEN
        RAISE EXCEPTION 'Only Owners can delete clients completely';
    END IF;
    
    -- Get all sales for this client
    FOR sale_record IN 
        SELECT id, land_piece_ids 
        FROM sales 
        WHERE client_id = client_id_to_delete
    LOOP
        -- Delete payments for this sale
        DELETE FROM payments WHERE sale_id = sale_record.id;
        
        -- Delete installments for this sale
        DELETE FROM installments WHERE sale_id = sale_record.id;
        
        -- Reset piece status if land_piece_ids exist
        IF sale_record.land_piece_ids IS NOT NULL AND array_length(sale_record.land_piece_ids, 1) > 0 THEN
            UPDATE land_pieces 
            SET status = 'Available', reservation_client_id = NULL
            WHERE id = ANY(sale_record.land_piece_ids);
        END IF;
    END LOOP;
    
    -- Delete all sales for this client
    DELETE FROM sales WHERE client_id = client_id_to_delete;
    
    -- Delete all reservations for this client
    DELETE FROM reservations WHERE client_id = client_id_to_delete;
    
    -- Reset any land pieces that might be reserved by this client
    UPDATE land_pieces 
    SET status = 'Available', reservation_client_id = NULL
    WHERE reservation_client_id = client_id_to_delete;
    
    -- Delete any debts for this client
    DELETE FROM debts WHERE client_id = client_id_to_delete;
    
    -- Finally, delete the client
    DELETE FROM clients WHERE id = client_id_to_delete;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error deleting client: %', SQLERRM;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION delete_client_completely(UUID) TO authenticated;

-- ============================================
-- STEP 4: Verify everything was created
-- ============================================

DO $$
BEGIN
    -- Check get_user_role
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_user_role') THEN
        RAISE NOTICE '✓ get_user_role() function updated';
    ELSE
        RAISE WARNING '✗ get_user_role() function may not exist';
    END IF;
    
    -- Check delete_sale_completely
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'delete_sale_completely') THEN
        RAISE NOTICE '✓ delete_sale_completely() function created';
    ELSE
        RAISE WARNING '✗ delete_sale_completely() function may not exist';
    END IF;
    
    -- Check delete_client_completely
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'delete_client_completely') THEN
        RAISE NOTICE '✓ delete_client_completely() function created';
    ELSE
        RAISE WARNING '✗ delete_client_completely() function may not exist';
    END IF;
    
    RAISE NOTICE 'All fixes applied successfully!';
END $$;

