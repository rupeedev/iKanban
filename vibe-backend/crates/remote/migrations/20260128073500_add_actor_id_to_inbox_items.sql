-- Add actor_id to inbox_items for "Dan Biagini assigned..." display
-- IKA-338: Inbox feature enhancement

-- Add actor_id column (who triggered the notification)
ALTER TABLE inbox_items
ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Index for querying by actor (e.g., "notifications from user X")
CREATE INDEX IF NOT EXISTS idx_inbox_items_actor
    ON inbox_items(actor_id)
    WHERE actor_id IS NOT NULL;

-- Composite index for efficient inbox queries: user's unread notifications
-- Covers: SELECT * FROM inbox_items WHERE user_id = ? AND is_read = false ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_inbox_items_user_unread_created
    ON inbox_items(user_id, created_at DESC)
    WHERE is_read = FALSE;

COMMENT ON COLUMN inbox_items.actor_id IS 'User who triggered this notification (e.g., who assigned the task)';
