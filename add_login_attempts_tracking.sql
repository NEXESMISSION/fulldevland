-- ============================================
-- ADD LOGIN ATTEMPTS TRACKING
-- Migration: Add security features for login protection
-- ============================================
-- Purpose: Tracks failed login attempts to prevent brute force attacks
-- Run this in Supabase SQL Editor
-- Dependencies: Requires users table
-- ============================================

-- Create login_attempts table to track failed login attempts
CREATE TABLE IF NOT EXISTS login_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45), -- IPv6 can be up to 45 chars
    success BOOLEAN DEFAULT FALSE,
    attempted_at TIMESTAMPTZ DEFAULT NOW(),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, attempted_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, attempted_at);

-- Function to check if account should be locked
CREATE OR REPLACE FUNCTION should_lock_account(email_address VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    failed_attempts INTEGER;
    lockout_threshold INTEGER := 5; -- Lock after 5 failed attempts
    lockout_window INTERVAL := '15 minutes'; -- Lock for 15 minutes
BEGIN
    -- Count failed attempts in the last lockout window
    SELECT COUNT(*) INTO failed_attempts
    FROM login_attempts
    WHERE email = email_address
      AND success = FALSE
      AND attempted_at > NOW() - lockout_window;
    
    RETURN failed_attempts >= lockout_threshold;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get failed attempt count
CREATE OR REPLACE FUNCTION get_failed_attempts(email_address VARCHAR)
RETURNS INTEGER AS $$
DECLARE
    failed_count INTEGER;
    lockout_window INTERVAL := '15 minutes';
BEGIN
    SELECT COUNT(*) INTO failed_count
    FROM login_attempts
    WHERE email = email_address
      AND success = FALSE
      AND attempted_at > NOW() - lockout_window;
    
    RETURN COALESCE(failed_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on login_attempts
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to allow re-running this script)
DROP POLICY IF EXISTS "Users can view own login attempts" ON login_attempts;
DROP POLICY IF EXISTS "System can insert login attempts" ON login_attempts;

-- Only authenticated users can view their own login attempts
-- Owners can view all login attempts
CREATE POLICY "Users can view own login attempts"
    ON login_attempts FOR SELECT
    TO authenticated
    USING (
        email = (SELECT email FROM users WHERE id = auth.uid())
        OR get_user_role() = 'Owner'
    );

-- Allow system to insert login attempts (via trigger or API)
CREATE POLICY "System can insert login attempts"
    ON login_attempts FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Clean up old login attempts (older than 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_login_attempts()
RETURNS void AS $$
BEGIN
    DELETE FROM login_attempts
    WHERE attempted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- END OF MIGRATION
-- ============================================
-- Note: This migration adds login attempt tracking
-- The frontend will use these functions to implement rate limiting
-- ============================================

