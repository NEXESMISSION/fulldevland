-- ============================================
-- WORKER IDENTITY & MESSAGING SYSTEM
-- Migration: Add worker profiles, conversations, messages, and notifications
-- ============================================
-- Purpose: Implements clean separation of user identity from worker roles,
--          task-oriented messaging system, and simple notifications
-- Run this in Supabase SQL Editor
-- Dependencies: Requires users table (from supabase_schema.sql)
-- ============================================

-- ============================================
-- ENUM TYPES
-- ============================================

-- Worker availability status
CREATE TYPE worker_availability_status AS ENUM ('Available', 'Busy', 'Unavailable');

-- Conversation status
CREATE TYPE conversation_status AS ENUM ('open', 'closed');

-- Notification type
CREATE TYPE notification_type AS ENUM ('new_message', 'task_update', 'system');

-- ============================================
-- TABLE: worker_profiles
-- Worker role metadata separate from user identity
-- ============================================
CREATE TABLE worker_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    worker_type TEXT NOT NULL,  -- electrician, surveyor, agent, etc
    region TEXT,                -- governorate / city
    skills TEXT[],              -- array of skills
    availability worker_availability_status NOT NULL DEFAULT 'Available',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)  -- One worker profile per user
);

-- Create indexes for filtering
CREATE INDEX idx_worker_profiles_user_id ON worker_profiles(user_id);
CREATE INDEX idx_worker_profiles_worker_type ON worker_profiles(worker_type);
CREATE INDEX idx_worker_profiles_region ON worker_profiles(region);
CREATE INDEX idx_worker_profiles_availability ON worker_profiles(availability);

-- ============================================
-- TABLE: conversations
-- Task-oriented conversation threads
-- ============================================
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    subject TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    worker_id UUID NOT NULL REFERENCES users(id),  -- References users, not worker_profiles
    status conversation_status NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_conversations_created_by ON conversations(created_by);
CREATE INDEX idx_conversations_worker_id ON conversations(worker_id);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at DESC);

-- ============================================
-- TABLE: messages
-- Messages within conversations (directive/task-oriented)
-- ============================================
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_sender_id ON messages(sender_id);
CREATE INDEX idx_messages_created_at ON messages(created_at DESC);

-- ============================================
-- TABLE: notifications
-- Simple notification system (no real-time push yet)
-- ============================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    reference_id UUID,  -- message or conversation id
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- ============================================
-- TRIGGERS
-- ============================================

-- Update updated_at for worker_profiles
CREATE TRIGGER update_worker_profiles_updated_at BEFORE UPDATE ON worker_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update updated_at for conversations (when new message is added)
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update conversation updated_at when message is inserted
CREATE OR REPLACE FUNCTION update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations
    SET updated_at = NOW()
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversation_timestamp_on_message
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_on_message();

-- Trigger to create notification when new message is sent
CREATE OR REPLACE FUNCTION create_message_notification()
RETURNS TRIGGER AS $$
DECLARE
    conv_record RECORD;
BEGIN
    -- Get conversation details
    SELECT created_by, worker_id INTO conv_record
    FROM conversations
    WHERE id = NEW.conversation_id;
    
    -- Create notification for the recipient (not the sender)
    IF NEW.sender_id = conv_record.created_by THEN
        -- Message from creator, notify worker
        INSERT INTO notifications (user_id, type, reference_id)
        VALUES (conv_record.worker_id, 'new_message', NEW.conversation_id);
    ELSE
        -- Message from worker, notify creator
        INSERT INTO notifications (user_id, type, reference_id)
        VALUES (conv_record.created_by, 'new_message', NEW.conversation_id);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER create_notification_on_message
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION create_message_notification();

-- Audit triggers
CREATE TRIGGER audit_worker_profiles AFTER INSERT OR UPDATE OR DELETE ON worker_profiles
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_conversations AFTER INSERT OR UPDATE OR DELETE ON conversations
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_messages AFTER INSERT OR UPDATE OR DELETE ON messages
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE worker_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES: worker_profiles
-- ============================================
-- All authenticated users can view worker profiles
CREATE POLICY "Worker profiles are viewable by authenticated users"
    ON worker_profiles FOR SELECT
    TO authenticated
    USING (true);

-- Owners and Managers can create/update worker profiles
CREATE POLICY "Owners and Managers can manage worker profiles"
    ON worker_profiles FOR INSERT
    TO authenticated
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

CREATE POLICY "Owners and Managers can update worker profiles"
    ON worker_profiles FOR UPDATE
    TO authenticated
    USING (get_user_role() IN ('Owner', 'Manager'))
    WITH CHECK (get_user_role() IN ('Owner', 'Manager'));

-- Only Owners can delete worker profiles
CREATE POLICY "Owners can delete worker profiles"
    ON worker_profiles FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- ============================================
-- RLS POLICIES: conversations
-- ============================================
-- Users can view conversations they created or are assigned to
CREATE POLICY "Users can view own conversations"
    ON conversations FOR SELECT
    TO authenticated
    USING (created_by = auth.uid() OR worker_id = auth.uid());

-- All authenticated users can create conversations
CREATE POLICY "Authenticated users can create conversations"
    ON conversations FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Users can update conversations they created
CREATE POLICY "Users can update own conversations"
    ON conversations FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- Only Owners can delete conversations
CREATE POLICY "Owners can delete conversations"
    ON conversations FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- ============================================
-- RLS POLICIES: messages
-- ============================================
-- Users can view messages in conversations they're part of
CREATE POLICY "Users can view messages in own conversations"
    ON messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND (conversations.created_by = auth.uid() OR conversations.worker_id = auth.uid())
        )
    );

-- Users can send messages in conversations they're part of
CREATE POLICY "Users can send messages in own conversations"
    ON messages FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversations
            WHERE conversations.id = messages.conversation_id
            AND (conversations.created_by = auth.uid() OR conversations.worker_id = auth.uid())
        )
        AND sender_id = auth.uid()
    );

-- Users can update their own messages (for corrections)
CREATE POLICY "Users can update own messages"
    ON messages FOR UPDATE
    TO authenticated
    USING (sender_id = auth.uid())
    WITH CHECK (sender_id = auth.uid());

-- Only Owners can delete messages
CREATE POLICY "Owners can delete messages"
    ON messages FOR DELETE
    TO authenticated
    USING (get_user_role() = 'Owner');

-- ============================================
-- RLS POLICIES: notifications
-- ============================================
-- Users can only view their own notifications
CREATE POLICY "Users can view own notifications"
    ON notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- System can create notifications (via trigger)
CREATE POLICY "System can create notifications"
    ON notifications FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
    ON notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Users can delete their own notifications
CREATE POLICY "Users can delete own notifications"
    ON notifications FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get unread notification count for current user
CREATE OR REPLACE FUNCTION get_unread_notification_count()
RETURNS INTEGER AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM notifications
        WHERE user_id = auth.uid()
        AND is_read = FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- END OF MIGRATION
-- ============================================

