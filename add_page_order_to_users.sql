-- ============================================
-- SQL Migration: Add page_order to users table
-- ============================================
-- This script adds a new column `page_order` to the `users` table
-- to track the custom order of pages for each user.
--
-- IMPORTANT: Run this script in Supabase SQL Editor
-- ============================================

DO $$
BEGIN
    -- Step 1: Add the new column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'page_order'
    ) THEN
        ALTER TABLE public.users 
        ADD COLUMN page_order TEXT[] DEFAULT NULL;
        
        RAISE NOTICE 'Column "page_order" added to "users" table.';
    ELSE
        RAISE NOTICE 'Column "page_order" already exists in "users" table.';
    END IF;

    -- Step 2: Initialize page_order from allowed_pages for existing users
    -- This ensures that existing users have their page_order set based on their current allowed_pages
    UPDATE public.users
    SET page_order = allowed_pages
    WHERE allowed_pages IS NOT NULL 
    AND array_length(allowed_pages, 1) > 0
    AND page_order IS NULL;
    
    RAISE NOTICE 'Initialized page_order from allowed_pages for existing users.';

END $$;

-- Step 3: Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'users' 
AND column_name = 'page_order';

-- Expected result:
-- column_name  | data_type | is_nullable | column_default
-- -------------+-----------+-------------+---------------
-- page_order   | ARRAY     | YES         | NULL

