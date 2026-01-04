-- ============================================
-- Fix project_expenses enum type (Simple Version)
-- ============================================
-- This script fixes the category column in project_expenses table
-- to use project_expense_category instead of expense_category
-- WARNING: This will drop the table if it has the wrong enum type

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

-- Check if table exists with wrong enum type and drop it
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'project_expenses') THEN
        -- Check if column uses wrong enum type
        IF EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'project_expenses' 
            AND column_name = 'category'
            AND udt_name = 'expense_category'
        ) THEN
            RAISE NOTICE 'Dropping project_expenses table to recreate with correct enum type...';
            DROP TABLE IF EXISTS project_expenses CASCADE;
            RAISE NOTICE 'Table dropped. Please run CREATE_REAL_ESTATE_PROJECTS_TABLES.sql to recreate it.';
        ELSE
            RAISE NOTICE 'Table exists with correct enum type (project_expense_category) or column doesn''t exist yet.';
        END IF;
    ELSE
        RAISE NOTICE 'Table does not exist. Run CREATE_REAL_ESTATE_PROJECTS_TABLES.sql to create it.';
    END IF;
END $$;

