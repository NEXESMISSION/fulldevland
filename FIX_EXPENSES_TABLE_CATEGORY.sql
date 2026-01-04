-- ============================================
-- Fix expenses table - Change category from enum to foreign key
-- ============================================
-- The current setup uses expense_category enum, but the app sends category UUIDs
-- This script converts the category column to use foreign key reference

-- Step 1: Check current structure
SELECT 
    column_name, 
    udt_name as data_type
FROM information_schema.columns 
WHERE table_name = 'expenses' AND column_name = 'category';

-- Step 2: If using enum, we need to migrate to foreign key
-- First, add a new column for the foreign key
ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES expense_categories(id);

-- Step 3: If you have existing data with enum values, you'll need to map them
-- This maps enum values to category IDs (run this only if you have existing data)
-- UPDATE expenses e
-- SET category_id = ec.id
-- FROM expense_categories ec
-- WHERE e.category = ec.name::expense_category;

-- Step 4: Drop the old enum column (CAREFUL - backup first!)
-- ALTER TABLE expenses DROP COLUMN IF EXISTS category;

-- Step 5: Rename the new column
-- ALTER TABLE expenses RENAME COLUMN category_id TO category;

-- ============================================
-- ALTERNATIVE: If you prefer to keep using enum
-- ============================================
-- Make sure expense_categories match the enum values

-- Check existing enum values
SELECT unnest(enum_range(NULL::expense_category)) as enum_values;

-- Check expense_categories table
SELECT * FROM expense_categories ORDER BY name;

-- ============================================
-- SIMPLEST FIX: Drop the constraint and use text
-- ============================================
-- This allows any value in the category column

-- Option A: Change column type to TEXT (most flexible)
ALTER TABLE expenses ALTER COLUMN category TYPE TEXT;

-- Option B: Change column type to UUID with foreign key
-- ALTER TABLE expenses ALTER COLUMN category TYPE UUID USING category::UUID;
-- ALTER TABLE expenses ADD CONSTRAINT fk_expense_category 
--   FOREIGN KEY (category) REFERENCES expense_categories(id);

-- After running Option A, the app should work with category UUIDs

