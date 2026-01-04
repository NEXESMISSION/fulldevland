-- ============================================
-- Fix project_expenses table enum type
-- ============================================
-- This script verifies and fixes the category column type
-- Run this if you're getting enum type errors

-- Ensure project_expense_category enum exists
DO $$ BEGIN
    CREATE TYPE project_expense_category AS ENUM (
      'Materials',
      'Labor',
      'Equipment',
      'Permits',
      'Design',
      'Utilities',
      'Insurance',
      'Other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Check current column type
SELECT 
    'Current column type check:' as info,
    column_name,
    udt_name as current_type
FROM information_schema.columns
WHERE table_name = 'project_expenses' 
AND column_name = 'category';

-- If table exists with wrong enum type, we need to drop and recreate
-- Since this is a new feature, it's safe to drop
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_expenses') THEN
        -- Check current enum type
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'project_expenses' 
            AND column_name = 'category'
            AND udt_name = 'expense_category'
        ) THEN
            RAISE NOTICE 'Table has wrong enum type (expense_category). Dropping table...';
            DROP TABLE IF EXISTS project_expenses CASCADE;
            RAISE NOTICE 'Table dropped. Run CREATE_REAL_ESTATE_PROJECTS_TABLES.sql to recreate it.';
        ELSIF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'project_expenses' 
            AND column_name = 'category'
            AND udt_name = 'project_expense_category'
        ) THEN
            RAISE NOTICE 'Table already has correct enum type (project_expense_category).';
        ELSE
            RAISE NOTICE 'Table exists but category column not found. Run CREATE_REAL_ESTATE_PROJECTS_TABLES.sql.';
        END IF;
    ELSE
        RAISE NOTICE 'Table does not exist. Run CREATE_REAL_ESTATE_PROJECTS_TABLES.sql to create it.';
    END IF;
END $$;

