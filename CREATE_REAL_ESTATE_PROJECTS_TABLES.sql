-- ============================================
-- Real Estate Projects & Cost Management
-- ============================================

-- Project type enum (only create if it doesn't exist)
DO $$ BEGIN
    CREATE TYPE project_type AS ENUM ('Building', 'House', 'Apartment');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Project status enum (only create if it doesn't exist)
DO $$ BEGIN
    CREATE TYPE project_status AS ENUM ('Planning', 'InProgress', 'OnHold', 'Completed', 'Cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Project expense category enum (separate from expenses table categories)
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

-- ============================================
-- TABLE: real_estate_projects
-- Real estate development projects
-- ============================================
CREATE TABLE IF NOT EXISTS real_estate_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    project_type project_type NOT NULL,
    status project_status NOT NULL DEFAULT 'Planning',
    location TEXT,
    description TEXT,
    start_date DATE,
    expected_completion_date DATE,
    actual_completion_date DATE,
    -- Budget information
    estimated_budget DECIMAL(15, 2) DEFAULT 0,
    total_expenses DECIMAL(15, 2) DEFAULT 0,
    -- Additional details
    units_count INTEGER DEFAULT 1, -- Number of units (apartments, houses, etc.)
    total_area DECIMAL(15, 2), -- Total area in m²
    notes TEXT,
    -- Tracking
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLE: project_expenses
-- Expenses for each project
-- ============================================
-- Drop table if it exists with wrong enum type (expense_category)
DROP TABLE IF EXISTS project_expenses CASCADE;

CREATE TABLE project_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES real_estate_projects(id) ON DELETE CASCADE,
    category project_expense_category NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    supplier_name VARCHAR(255),
    invoice_number VARCHAR(100),
    payment_method VARCHAR(50) DEFAULT 'Cash',
    notes TEXT,
    -- Tracking
    recorded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance (only if they don't exist)
CREATE INDEX IF NOT EXISTS idx_projects_type ON real_estate_projects(project_type);
CREATE INDEX IF NOT EXISTS idx_projects_status ON real_estate_projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON real_estate_projects(created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_project ON project_expenses(project_id);
CREATE INDEX IF NOT EXISTS idx_project_expenses_category ON project_expenses(category);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON project_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_recorded_by ON project_expenses(recorded_by);

-- Function to update project total_expenses when expenses change
CREATE OR REPLACE FUNCTION update_project_total_expenses()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE real_estate_projects
    SET total_expenses = (
        SELECT COALESCE(SUM(amount), 0)
        FROM project_expenses
        WHERE project_id = COALESCE(NEW.project_id, OLD.project_id)
    ),
    updated_at = NOW()
    WHERE id = COALESCE(NEW.project_id, OLD.project_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update total_expenses (drop if exists first)
DROP TRIGGER IF EXISTS trigger_update_project_expenses ON project_expenses;
CREATE TRIGGER trigger_update_project_expenses
AFTER INSERT OR UPDATE OR DELETE ON project_expenses
FOR EACH ROW
EXECUTE FUNCTION update_project_total_expenses();

-- RLS Policies
ALTER TABLE real_estate_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_expenses ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist, then create new ones
DROP POLICY IF EXISTS "Authenticated users can view projects" ON real_estate_projects;
DROP POLICY IF EXISTS "Only Owners can create projects" ON real_estate_projects;
DROP POLICY IF EXISTS "Only Owners can update projects" ON real_estate_projects;
DROP POLICY IF EXISTS "Only Owners can delete projects" ON real_estate_projects;
DROP POLICY IF EXISTS "Authenticated users can view expenses" ON project_expenses;
DROP POLICY IF EXISTS "Only Owners can create expenses" ON project_expenses;
DROP POLICY IF EXISTS "Only Owners can update expenses" ON project_expenses;
DROP POLICY IF EXISTS "Only Owners can delete expenses" ON project_expenses;

-- All authenticated users can view projects
CREATE POLICY "Authenticated users can view projects"
ON real_estate_projects FOR SELECT
TO authenticated
USING (true);

-- Only Owners can create projects
CREATE POLICY "Only Owners can create projects"
ON real_estate_projects FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role = 'Owner'
        AND users.status = 'Active'
    )
);

-- Only Owners can update projects
CREATE POLICY "Only Owners can update projects"
ON real_estate_projects FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role = 'Owner'
        AND users.status = 'Active'
    )
);

-- Only Owners can delete projects
CREATE POLICY "Only Owners can delete projects"
ON real_estate_projects FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role = 'Owner'
        AND users.status = 'Active'
    )
);

-- All authenticated users can view expenses
CREATE POLICY "Authenticated users can view expenses"
ON project_expenses FOR SELECT
TO authenticated
USING (true);

-- Only Owners can create expenses
CREATE POLICY "Only Owners can create expenses"
ON project_expenses FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role = 'Owner'
        AND users.status = 'Active'
    )
);

-- Only Owners can update expenses
CREATE POLICY "Only Owners can update expenses"
ON project_expenses FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role = 'Owner'
        AND users.status = 'Active'
    )
);

-- Only Owners can delete expenses
CREATE POLICY "Only Owners can delete expenses"
ON project_expenses FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
        AND users.role = 'Owner'
        AND users.status = 'Active'
    )
);

