-- Add user tracking columns to tables for activity monitoring
-- Run this in Supabase SQL Editor

-- Add confirmed_by column to sales table (tracks who confirmed the sale)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id);

-- Ensure created_by exists on all relevant tables
ALTER TABLE land_batches ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS recorded_by UUID REFERENCES users(id);

-- Add indexes for faster user activity queries
CREATE INDEX IF NOT EXISTS idx_sales_created_by ON sales(created_by);
CREATE INDEX IF NOT EXISTS idx_sales_confirmed_by ON sales(confirmed_by);
CREATE INDEX IF NOT EXISTS idx_payments_recorded_by ON payments(recorded_by);
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);
CREATE INDEX IF NOT EXISTS idx_land_batches_created_by ON land_batches(created_by);
CREATE INDEX IF NOT EXISTS idx_reservations_created_by ON reservations(created_by);

-- Verify the columns were added
SELECT 
  table_name, 
  column_name, 
  data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND column_name IN ('created_by', 'confirmed_by', 'recorded_by')
ORDER BY table_name, column_name;

