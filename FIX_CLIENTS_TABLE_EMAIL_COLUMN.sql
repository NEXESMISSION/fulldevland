-- ============================================
-- Add email column to clients table if it doesn't exist
-- ============================================

-- Check if email column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'clients' 
        AND column_name = 'email'
    ) THEN
        -- Add email column
        ALTER TABLE clients 
        ADD COLUMN email TEXT;
        
        -- Add comment
        COMMENT ON COLUMN clients.email IS 'Client email address (optional)';
        
        RAISE NOTICE 'Email column added to clients table';
    ELSE
        RAISE NOTICE 'Email column already exists in clients table';
    END IF;
END $$;

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'clients' 
  AND column_name = 'email';

