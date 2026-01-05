-- ============================================
-- ENABLE REAL-TIME REPLICATION FOR MESSAGING
-- ============================================
-- This ensures that the messages, conversations, and notifications tables
-- are included in Supabase's real-time publication
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable real-time for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Enable real-time for conversations table
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;

-- Enable real-time for notifications table
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

-- Enable real-time for worker_profiles table (optional, for worker updates)
ALTER PUBLICATION supabase_realtime ADD TABLE worker_profiles;

-- Note: If you get an error that the publication doesn't exist or the table
-- is already in the publication, that's fine - it means real-time is already enabled.

