-- ============================================
-- ADD ALLOWED_BATCHES COLUMN TO USERS TABLE
-- ============================================
-- This column stores the IDs of land batches a user can access
-- If NULL or empty, user can access all batches
-- ============================================

-- Step 1: Add the column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'allowed_batches'
    ) THEN
        ALTER TABLE users ADD COLUMN allowed_batches UUID[] DEFAULT NULL;
        RAISE NOTICE 'Added allowed_batches column to users table';
    ELSE
        RAISE NOTICE 'allowed_batches column already exists';
    END IF;
END $$;

-- Step 2: Add comment
COMMENT ON COLUMN users.allowed_batches IS 'Array of land_batch IDs the user can access. NULL or empty means access to all batches.';

-- Step 3: Verify the column
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'allowed_batches';

-- Step 4: Example usage - restrict user to specific batches
-- UPDATE users SET allowed_batches = ARRAY['batch-uuid-1', 'batch-uuid-2']::UUID[] WHERE id = 'user-uuid';

-- Step 5: Example query to check if user has access to a batch
-- SELECT * FROM users WHERE id = 'user-uuid' AND (allowed_batches IS NULL OR 'batch-uuid' = ANY(allowed_batches));

