-- ============================================
-- UPDATE INSTALLMENT END DATES
-- ============================================
-- This script calculates and updates installment_end_date for existing sales
-- that have installment_start_date and number_of_installments set
-- ============================================

-- Step 1: Check if installment_end_date column exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'installment_end_date'
    ) THEN
        -- Add the column if it doesn't exist
        ALTER TABLE sales ADD COLUMN installment_end_date DATE;
        RAISE NOTICE 'Added installment_end_date column to sales table';
    ELSE
        RAISE NOTICE 'installment_end_date column already exists';
    END IF;
END $$;

-- Step 2: Update existing sales to calculate end date
-- End date = Start date + (number_of_installments - 1) months
UPDATE sales
SET installment_end_date = (installment_start_date + ((number_of_installments - 1) * INTERVAL '1 month'))::DATE
WHERE 
    payment_type = 'Installment'
    AND installment_start_date IS NOT NULL
    AND number_of_installments IS NOT NULL
    AND number_of_installments > 0
    AND installment_end_date IS NULL;

-- Step 3: Show results
SELECT 
    id,
    payment_type,
    installment_start_date,
    number_of_installments,
    installment_end_date
FROM sales
WHERE 
    payment_type = 'Installment'
    AND installment_start_date IS NOT NULL
ORDER BY sale_date DESC
LIMIT 20;

-- Step 4: Add comment to the column
COMMENT ON COLUMN sales.installment_end_date IS 'End date of installment period (calculated from start_date + number_of_installments - 1 months)';

-- Summary
SELECT 
    COUNT(*) FILTER (WHERE installment_end_date IS NOT NULL) as with_end_date,
    COUNT(*) FILTER (WHERE installment_end_date IS NULL AND payment_type = 'Installment' AND installment_start_date IS NOT NULL) as missing_end_date
FROM sales
WHERE payment_type = 'Installment';

