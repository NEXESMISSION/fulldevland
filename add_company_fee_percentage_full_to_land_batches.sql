-- Add company_fee_percentage_full column to land_batches table
-- This column stores the company fee percentage for full payment sales

-- Add the column
ALTER TABLE land_batches
ADD COLUMN IF NOT EXISTS company_fee_percentage_full NUMERIC(5, 2) DEFAULT NULL;

-- Add comment to explain the column
COMMENT ON COLUMN land_batches.company_fee_percentage_full IS 'Company fee percentage for full payment sales (0-100). This is separate from installment offers which have their own company_fee_percentage.';

-- Create index for better query performance (optional)
CREATE INDEX IF NOT EXISTS idx_land_batches_company_fee_percentage_full 
ON land_batches(company_fee_percentage_full) 
WHERE company_fee_percentage_full IS NOT NULL;

