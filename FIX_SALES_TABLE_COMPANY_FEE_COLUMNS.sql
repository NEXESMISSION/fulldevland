-- ============================================
-- Add company_fee columns to sales table
-- ============================================
-- The sales table is missing company_fee_percentage and company_fee_amount columns
-- that are being used in the SaleConfirmation code

-- Add company_fee_percentage column
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS company_fee_percentage DECIMAL(5, 2) DEFAULT NULL;

-- Add company_fee_amount column  
ALTER TABLE sales 
ADD COLUMN IF NOT EXISTS company_fee_amount DECIMAL(15, 2) DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN sales.company_fee_percentage IS 'Company fee percentage (e.g., 2.00 for 2%)';
COMMENT ON COLUMN sales.company_fee_amount IS 'Calculated company fee amount in currency';

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'sales' 
  AND column_name IN ('company_fee_percentage', 'company_fee_amount');

