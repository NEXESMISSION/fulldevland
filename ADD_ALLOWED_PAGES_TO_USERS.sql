-- ===========================================
-- ADD ALLOWED_PAGES COLUMN TO USERS TABLE
-- ===========================================
-- This allows Owner to configure which pages each user can access

-- Add the column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'users' AND column_name = 'allowed_pages') THEN
        ALTER TABLE users ADD COLUMN allowed_pages TEXT[] DEFAULT NULL;
    END IF;
END $$;

-- Set default allowed pages for existing users based on role
-- NULL means all pages (for Owners)
-- Empty array [] means no pages (disabled user)
-- Specific pages restrict access to only those pages

-- All available page IDs:
-- home, land, availability, clients, sales, confirm-sales, installments, finance, expenses, debts, users, security, real-estate

-- Owners get NULL (all access)
UPDATE users SET allowed_pages = NULL WHERE role = 'Owner';

-- Managers get most pages except user management
UPDATE users SET allowed_pages = ARRAY['home', 'land', 'availability', 'clients', 'sales', 'confirm-sales', 'installments', 'finance', 'expenses', 'debts']
WHERE role = 'Manager' AND allowed_pages IS NULL;

-- FieldStaff get limited pages
UPDATE users SET allowed_pages = ARRAY['home', 'land', 'availability', 'clients', 'sales', 'installments']
WHERE role = 'FieldStaff' AND allowed_pages IS NULL;

-- Verify
SELECT id, email, role, allowed_pages FROM users;

