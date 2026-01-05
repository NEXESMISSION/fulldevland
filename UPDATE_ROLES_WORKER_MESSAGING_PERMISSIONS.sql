-- ============================================
-- UPDATE ROLES PERMISSIONS
-- Add worker and messaging permissions to roles
-- ============================================
-- Purpose: Adds view_workers and view_messages permissions to existing roles
-- Run this in Supabase SQL Editor after CREATE_WORKER_MESSAGING_SYSTEM.sql
-- ============================================

-- Update Owner role permissions
UPDATE roles
SET permissions = jsonb_set(
  jsonb_set(
    permissions,
    '{view_workers}',
    'true'::jsonb
  ),
  '{view_messages}',
  'true'::jsonb
)
WHERE name = 'Owner';

-- Update Manager role permissions
UPDATE roles
SET permissions = jsonb_set(
  jsonb_set(
    permissions,
    '{view_workers}',
    'true'::jsonb
  ),
  '{view_messages}',
  'true'::jsonb
)
WHERE name = 'Manager';

-- Update FieldStaff role permissions
UPDATE roles
SET permissions = jsonb_set(
  jsonb_set(
    permissions,
    '{view_workers}',
    'false'::jsonb
  ),
  '{view_messages}',
    'true'::jsonb
)
WHERE name = 'FieldStaff';

-- ============================================
-- END OF UPDATE
-- ============================================

