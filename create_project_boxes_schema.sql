-- ============================================
-- PROJECT BOXES SCHEMA
-- Simplified structure: Projects -> Boxes -> Expenses
-- ============================================

-- TABLE: projects
-- Simple project tracking
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE: project_boxes
-- Boxes within projects (can be company, person, worker, etc.)
CREATE TABLE IF NOT EXISTS project_boxes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE: box_expenses
-- Expenses for each box with optional image
CREATE TABLE IF NOT EXISTS box_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    box_id UUID NOT NULL REFERENCES project_boxes(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    image_url TEXT, -- URL to image in Supabase Storage
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_project_boxes_project ON project_boxes(project_id);
CREATE INDEX IF NOT EXISTS idx_box_expenses_box ON box_expenses(box_id);
CREATE INDEX IF NOT EXISTS idx_box_expenses_date ON box_expenses(expense_date);

-- Enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_boxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE box_expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for projects
DROP POLICY IF EXISTS "Users can view all projects" ON projects;
CREATE POLICY "Users can view all projects" ON projects
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create projects" ON projects;
CREATE POLICY "Users can create projects" ON projects
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update projects" ON projects;
CREATE POLICY "Users can update projects" ON projects
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete projects" ON projects;
CREATE POLICY "Users can delete projects" ON projects
    FOR DELETE USING (true);

-- RLS Policies for project_boxes
DROP POLICY IF EXISTS "Users can view all boxes" ON project_boxes;
CREATE POLICY "Users can view all boxes" ON project_boxes
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create boxes" ON project_boxes;
CREATE POLICY "Users can create boxes" ON project_boxes
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update boxes" ON project_boxes;
CREATE POLICY "Users can update boxes" ON project_boxes
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete boxes" ON project_boxes;
CREATE POLICY "Users can delete boxes" ON project_boxes
    FOR DELETE USING (true);

-- RLS Policies for box_expenses
DROP POLICY IF EXISTS "Users can view all expenses" ON box_expenses;
CREATE POLICY "Users can view all expenses" ON box_expenses
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create expenses" ON box_expenses;
CREATE POLICY "Users can create expenses" ON box_expenses
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update expenses" ON box_expenses;
CREATE POLICY "Users can update expenses" ON box_expenses
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Users can delete expenses" ON box_expenses;
CREATE POLICY "Users can delete expenses" ON box_expenses
    FOR DELETE USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_boxes_updated_at ON project_boxes;
CREATE TRIGGER update_project_boxes_updated_at BEFORE UPDATE ON project_boxes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_box_expenses_updated_at ON box_expenses;
CREATE TRIGGER update_box_expenses_updated_at BEFORE UPDATE ON box_expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

