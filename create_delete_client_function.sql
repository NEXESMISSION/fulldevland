-- ============================================
-- FUNCTION: Delete client and all related data
-- This function bypasses RLS to ensure complete deletion
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

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_client_completely(UUID) TO authenticated;

-- Test the function exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_proc 
        WHERE proname = 'delete_client_completely'
    ) THEN
        RAISE NOTICE 'delete_client_completely() function created successfully';
    ELSE
        RAISE WARNING 'delete_client_completely() function may not have been created';
    END IF;
END $$;

