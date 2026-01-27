-- Add new notification types to inbox_notification_type enum
-- IKA-338: Inbox feature - additional event types

DO $$
BEGIN
    ALTER TYPE inbox_notification_type ADD VALUE IF NOT EXISTS 'task_unassigned';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TYPE inbox_notification_type ADD VALUE IF NOT EXISTS 'mentioned_in_update';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TYPE inbox_notification_type ADD VALUE IF NOT EXISTS 'project_role_added';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TYPE inbox_notification_type ADD VALUE IF NOT EXISTS 'due_date_approaching';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Index for filtering by notification type (useful for "show only mentions")
CREATE INDEX IF NOT EXISTS idx_inbox_items_user_type
    ON inbox_items(user_id, notification_type);
