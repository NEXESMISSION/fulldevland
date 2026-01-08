-- ============================================
-- FIX: Secure RLS Policies for allowed_pieces and allowed_batches
-- ============================================
-- This script fixes CRITICAL security vulnerabilities where
-- allowed_pieces and allowed_batches were not enforced at database level
-- ============================================

-- ============================================
-- Step 1: Create helper function to check land piece access
-- ============================================
CREATE OR REPLACE FUNCTION can_access_land_piece(piece_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role_val TEXT;
    user_allowed_pieces UUID[];
    user_allowed_batches UUID[];
    piece_batch_id UUID;
BEGIN
    -- Get user role
    user_role_val := get_user_role();
    
    -- Owners can access everything
    IF user_role_val = 'Owner' THEN
        RETURN TRUE;
    END IF;
    
    -- Get user's allowed pieces and batches
    SELECT allowed_pieces, allowed_batches 
    INTO user_allowed_pieces, user_allowed_batches
    FROM users
    WHERE id = auth.uid();
    
    -- If user not found in users table, deny access (data integrity issue)
    -- Note: NULL values mean "no restrictions" (access all), not "user not found"
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- Get the batch ID for this piece
    SELECT land_batch_id INTO piece_batch_id
    FROM land_pieces
    WHERE id = piece_id;
    
    -- If piece doesn't exist, deny access
    IF piece_batch_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check batch access first (if batch restrictions exist)
    IF user_allowed_batches IS NOT NULL AND array_length(user_allowed_batches, 1) > 0 THEN
        -- User has batch restrictions
        IF piece_batch_id IS NULL OR NOT (piece_batch_id = ANY(user_allowed_batches)) THEN
            RETURN FALSE; -- Piece's batch is not in allowed_batches
        END IF;
    END IF;
    
    -- Check piece access
    IF user_allowed_pieces IS NULL OR array_length(user_allowed_pieces, 1) = 0 THEN
        -- No piece restrictions, user can access all pieces (within allowed batches)
        RETURN TRUE;
    ELSE
        -- User has piece restrictions, check if this piece is allowed
        RETURN piece_id = ANY(user_allowed_pieces);
    END IF;
END;
$$;

-- Add comment
COMMENT ON FUNCTION can_access_land_piece(UUID) IS 'Checks if the current user can access a specific land piece based on their role, allowed_batches, and allowed_pieces. Owners always return TRUE.';

-- ============================================
-- Step 2: Create helper function to check land batch access
-- ============================================
CREATE OR REPLACE FUNCTION can_access_land_batch(batch_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_role_val TEXT;
    user_allowed_batches UUID[];
BEGIN
    -- Get user role
    user_role_val := get_user_role();
    
    -- Owners can access everything
    IF user_role_val = 'Owner' THEN
        RETURN TRUE;
    END IF;
    
    -- Get user's allowed batches
    SELECT allowed_batches INTO user_allowed_batches
    FROM users
    WHERE id = auth.uid();
    
    -- If user not found in users table, deny access (data integrity issue)
    -- Note: NULL values mean "no restrictions" (access all), not "user not found"
    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;
    
    -- If allowed_batches is NULL or empty, user can access all batches
    IF user_allowed_batches IS NULL OR array_length(user_allowed_batches, 1) = 0 THEN
        RETURN TRUE;
    ELSE
        -- Check if batch_id is in allowed_batches
        RETURN batch_id = ANY(user_allowed_batches);
    END IF;
END;
$$;

-- Add comment
COMMENT ON FUNCTION can_access_land_batch(UUID) IS 'Checks if the current user can access a specific land batch based on their role and allowed_batches. Owners always return TRUE.';

-- ============================================
-- Step 3: Fix land_pieces SELECT policy
-- ============================================
DROP POLICY IF EXISTS "Land pieces are viewable by authenticated users" ON land_pieces;

CREATE POLICY "Land pieces access based on allowed_pieces"
    ON land_pieces FOR SELECT
    TO authenticated
    USING (can_access_land_piece(id));

-- ============================================
-- Step 4: Fix land_pieces UPDATE policy
-- ============================================
DROP POLICY IF EXISTS "Owners and Managers can update land pieces" ON land_pieces;

CREATE POLICY "Update land pieces based on role and access"
    ON land_pieces FOR UPDATE
    TO authenticated
    USING (
        get_user_role() IN ('Owner', 'Worker') AND
        can_access_land_piece(id)
    )
    WITH CHECK (
        get_user_role() IN ('Owner', 'Worker') AND
        can_access_land_piece(id)
    );

-- ============================================
-- Step 5: Fix land_pieces INSERT policy
-- ============================================
DROP POLICY IF EXISTS "Owners and Managers can insert land pieces" ON land_pieces;

CREATE POLICY "Insert land pieces based on role and batch access"
    ON land_pieces FOR INSERT
    TO authenticated
    WITH CHECK (
        get_user_role() IN ('Owner', 'Worker') AND
        (
            get_user_role() = 'Owner' OR
            -- Check if user can access the batch they're inserting into
            land_batch_id IS NULL OR
            can_access_land_batch(land_batch_id)
        )
    );

-- ============================================
-- Step 6: Fix land_pieces DELETE policy
-- ============================================
DROP POLICY IF EXISTS "Owners can delete land pieces" ON land_pieces;

CREATE POLICY "Owners can delete land pieces they can access"
    ON land_pieces FOR DELETE
    TO authenticated
    USING (
        get_user_role() = 'Owner' AND
        can_access_land_piece(id)
    );

-- ============================================
-- Step 7: Fix land_batches SELECT policy
-- ============================================
DROP POLICY IF EXISTS "Land batches are viewable by authenticated users" ON land_batches;

CREATE POLICY "Land batches access based on allowed_batches"
    ON land_batches FOR SELECT
    TO authenticated
    USING (can_access_land_batch(id));

-- ============================================
-- Step 8: Fix land_batches UPDATE policy
-- ============================================
DROP POLICY IF EXISTS "Owners and Managers can update land batches" ON land_batches;

CREATE POLICY "Update land batches based on role and access"
    ON land_batches FOR UPDATE
    TO authenticated
    USING (
        get_user_role() IN ('Owner', 'Worker') AND
        can_access_land_batch(id)
    )
    WITH CHECK (
        get_user_role() IN ('Owner', 'Worker') AND
        can_access_land_batch(id)
    );

-- ============================================
-- Step 9: Fix land_batches INSERT policy
-- ============================================
DROP POLICY IF EXISTS "Owners and Managers can insert land batches" ON land_batches;

CREATE POLICY "Insert land batches based on role"
    ON land_batches FOR INSERT
    TO authenticated
    WITH CHECK (get_user_role() IN ('Owner', 'Worker'));

-- ============================================
-- Step 10: Fix land_batches DELETE policy
-- ============================================
DROP POLICY IF EXISTS "Owners can delete land batches" ON land_batches;

CREATE POLICY "Owners can delete land batches they can access"
    ON land_batches FOR DELETE
    TO authenticated
    USING (
        get_user_role() = 'Owner' AND
        can_access_land_batch(id)
    );

-- ============================================
-- Step 11: Ensure RLS is enabled
-- ============================================
ALTER TABLE land_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE land_batches ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Step 12: Verify policies
-- ============================================
SELECT 'land_pieces policies:' as info;
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'land_pieces'
ORDER BY policyname;

SELECT 'land_batches policies:' as info;
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'land_batches'
ORDER BY policyname;

SELECT 'RLS Status:' as info;
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('land_pieces', 'land_batches');

-- ============================================
-- Step 13: Test queries (commented out - run manually)
-- ============================================
-- Test 1: Check if helper functions exist
-- SELECT can_access_land_piece('test-uuid'::UUID);
-- SELECT can_access_land_batch('test-uuid'::UUID);

-- Test 2: Verify RLS is enabled
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE tablename IN ('land_pieces', 'land_batches');

-- ============================================
-- DONE! Security fixes applied.
-- ============================================
-- IMPORTANT: Test thoroughly with different user roles:
-- 1. Owner - should see everything
-- 2. Manager with allowed_batches - should only see allowed batches
-- 3. FieldStaff with allowed_pieces - should only see allowed pieces
-- 4. FieldStaff with both - should see intersection
-- ============================================

