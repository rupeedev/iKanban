-- Inbox notification system
-- Phase 3.1: Create inbox_items table for user notifications

-- Drop table if exists with wrong structure (cleanup from failed migration)
DROP TABLE IF EXISTS inbox_items CASCADE;

-- Create enum for notification types
DO $$
BEGIN
    CREATE TYPE inbox_notification_type AS ENUM (
        'task_assigned',
        'task_mentioned',
        'task_comment',
        'task_status_changed',
        'task_completed',
        'workspace_created',
        'system_notification'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Create inbox_items table
CREATE TABLE IF NOT EXISTS inbox_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type inbox_notification_type NOT NULL DEFAULT 'system_notification',
    title             TEXT NOT NULL,
    message           TEXT,
    task_id           UUID REFERENCES shared_tasks(id) ON DELETE CASCADE,
    project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
    workspace_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
    is_read           BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inbox_items_user_unread
    ON inbox_items (user_id, is_read)
    WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_inbox_items_user_created
    ON inbox_items (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inbox_items_task
    ON inbox_items (task_id)
    WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inbox_items_project
    ON inbox_items (project_id)
    WHERE project_id IS NOT NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_inbox_items_updated_at ON inbox_items;
CREATE TRIGGER trg_inbox_items_updated_at
    BEFORE UPDATE ON inbox_items
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
