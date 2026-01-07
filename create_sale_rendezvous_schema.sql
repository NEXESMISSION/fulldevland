-- Create sale_rendezvous table for managing sale appointments
CREATE TABLE IF NOT EXISTS sale_rendezvous (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  rendezvous_date DATE NOT NULL,
  rendezvous_time TIME NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
  rescheduled_from_id UUID REFERENCES sale_rendezvous(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_sale_rendezvous_date ON sale_rendezvous(rendezvous_date);
CREATE INDEX IF NOT EXISTS idx_sale_rendezvous_sale_id ON sale_rendezvous(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_rendezvous_status ON sale_rendezvous(status);

-- Enable RLS
ALTER TABLE sale_rendezvous ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all sale rendezvous" ON sale_rendezvous;
DROP POLICY IF EXISTS "Users can create sale rendezvous" ON sale_rendezvous;
DROP POLICY IF EXISTS "Users can update sale rendezvous" ON sale_rendezvous;
DROP POLICY IF EXISTS "Users can delete sale rendezvous" ON sale_rendezvous;

-- RLS Policies
CREATE POLICY "Users can view all sale rendezvous"
  ON sale_rendezvous FOR SELECT
  USING (true);

CREATE POLICY "Users can create sale rendezvous"
  ON sale_rendezvous FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update sale rendezvous"
  ON sale_rendezvous FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete sale rendezvous"
  ON sale_rendezvous FOR DELETE
  USING (true);

-- Trigger to update updated_at
DROP TRIGGER IF EXISTS update_sale_rendezvous_updated_at ON sale_rendezvous;

CREATE TRIGGER update_sale_rendezvous_updated_at
  BEFORE UPDATE ON sale_rendezvous
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

