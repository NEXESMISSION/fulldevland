-- ============================================
-- Fix project_expenses enum type
-- ============================================
-- This script fixes the category column in project_expenses table
-- to use project_expense_category instead of expense_category

-- First, ensure project_expense_category enum exists
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

-- Check if project_expenses table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_expenses') THEN
        -- Table exists, check current column type
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'project_expenses' 
            AND column_name = 'category'
            AND udt_name = 'expense_category'
        ) THEN
            -- Column exists with wrong enum type, need to convert
            RAISE NOTICE 'Converting category column from expense_category to project_expense_category...';
            
            -- Drop the column and recreate it with the new type
            -- First, backup any existing data (if any exists, we'll need to handle it)
            -- For now, we'll just alter the column type if possible
            
            -- Try to alter the column type directly
            -- Note: This will fail if there's data with values not in the new enum
            -- But since the values match, it should work
            BEGIN
                ALTER TABLE project_expenses 
                ALTER COLUMN category TYPE project_expense_category 
                USING category::text::project_expense_category;
                
                RAISE NOTICE 'Successfully converted category column type';
            EXCEPTION
                WHEN OTHERS THEN
                    RAISE NOTICE 'Could not convert column type directly. Dropping and recreating column...';
                    -- Drop and recreate (THIS WILL DELETE DATA - use with caution)
                    ALTER TABLE project_expenses DROP COLUMN IF EXISTS category;
                    ALTER TABLE project_expenses ADD COLUMN category project_expense_category NOT NULL DEFAULT 'Materials';
                    RAISE NOTICE 'Column recreated with new type';
            END;
        ELSIF NOT EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'project_expenses' 
            AND column_name = 'category'
        ) THEN
            -- Column doesn't exist, add it
            RAISE NOTICE 'Adding category column with project_expense_category type...';
            ALTER TABLE project_expenses ADD COLUMN category project_expense_category NOT NULL DEFAULT 'Materials';
        ELSE
            -- Column exists with correct type
            RAISE NOTICE 'Category column already has correct type (project_expense_category)';
        END IF;
    ELSE
        RAISE NOTICE 'project_expenses table does not exist yet. Run CREATE_REAL_ESTATE_PROJECTS_TABLES.sql first.';
    END IF;
END $$;

-- Verify the column type
SELECT 
    'Column type verification:' as info,
    column_name,
    udt_name as enum_type
FROM information_schema.columns
WHERE table_name = 'project_expenses' 
AND column_name = 'category';

