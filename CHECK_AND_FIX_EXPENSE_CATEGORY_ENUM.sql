-- ============================================
-- Check and Fix expense_category Enum
-- ============================================
-- This script checks what values exist in the expense_category enum
-- and recreates it if needed with the correct values for project expenses

-- First, let's see what the enum currently has
SELECT 'Current enum values:' as info;
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = 'expense_category'::regtype
ORDER BY enumsortorder;

-- Check if enum exists and has correct values
DO $$
DECLARE
    enum_exists boolean;
    enum_values text[];
    correct_values text[] := ARRAY['Materials', 'Labor', 'Equipment', 'Permits', 'Design', 'Utilities', 'Insurance', 'Other'];
    enum_value text;
    missing_values text[];
BEGIN
    -- Check if enum exists
    SELECT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'expense_category'
    ) INTO enum_exists;
    
    IF NOT enum_exists THEN
        -- Enum doesn't exist, create it
        RAISE NOTICE 'Creating expense_category enum...';
        CREATE TYPE expense_category AS ENUM (
            'Materials',
            'Labor',
            'Equipment',
            'Permits',
            'Design',
            'Utilities',
            'Insurance',
            'Other'
        );
        RAISE NOTICE 'expense_category enum created successfully';
    ELSE
        -- Enum exists, check values
        SELECT array_agg(enumlabel::text ORDER BY enumsortorder)
        INTO enum_values
        FROM pg_enum
        WHERE enumtypid = 'expense_category'::regtype;
        
        RAISE NOTICE 'expense_category enum exists with values: %', enum_values;
        
        -- Check if all correct values exist
        FOREACH enum_value IN ARRAY correct_values
        LOOP
            IF NOT (enum_value = ANY(enum_values)) THEN
                missing_values := array_append(missing_values, enum_value);
            END IF;
        END LOOP;
        
        IF array_length(missing_values, 1) > 0 THEN
            RAISE NOTICE 'Missing enum values: %. Enum needs to be recreated manually if these values are required.', missing_values;
            RAISE NOTICE 'WARNING: Cannot automatically add values to existing enum.';
            RAISE NOTICE 'If you need to add values, you must:';
            RAISE NOTICE '1. Drop the enum (if no data depends on it)';
            RAISE NOTICE '2. Or use ALTER TYPE expense_category ADD VALUE for each missing value';
        ELSE
            RAISE NOTICE 'All required enum values exist!';
        END IF;
    END IF;
END $$;

-- Show final enum values
SELECT 'Final enum values:' as info;
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = 'expense_category'::regtype
ORDER BY enumsortorder;

