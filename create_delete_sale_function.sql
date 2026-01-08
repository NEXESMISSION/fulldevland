-- ============================================
-- FUNCTION: Delete sale and all related data
-- This function bypasses RLS to ensure complete deletion
-- ============================================

CREATE OR REPLACE FUNCTION delete_sale_completely(sale_id_to_delete UUID)
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
        RAISE EXCEPTION 'Only Owners can delete sales completely';
    END IF;
    
    -- Get the sale record
    SELECT id, land_piece_ids INTO sale_record
    FROM sales 
    WHERE id = sale_id_to_delete;
    
    -- If sale doesn't exist, return false
    IF sale_record.id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Delete payments for this sale
    DELETE FROM payments WHERE sale_id = sale_id_to_delete;
    
    -- Delete installments for this sale
    DELETE FROM installments WHERE sale_id = sale_id_to_delete;
    
    -- Reset piece status if land_piece_ids exist
    IF sale_record.land_piece_ids IS NOT NULL AND array_length(sale_record.land_piece_ids, 1) > 0 THEN
        UPDATE land_pieces 
        SET status = 'Available', reservation_client_id = NULL
        WHERE id = ANY(sale_record.land_piece_ids);
    END IF;
    
    -- Finally, delete the sale
    DELETE FROM sales WHERE id = sale_id_to_delete;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error deleting sale: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION delete_sale_completely(UUID) TO authenticated;

-- Test the function exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM pg_proc 
        WHERE proname = 'delete_sale_completely'
    ) THEN
        RAISE NOTICE 'delete_sale_completely() function created successfully';
    ELSE
        RAISE WARNING 'delete_sale_completely() function may not have been created';
    END IF;
END $$;

