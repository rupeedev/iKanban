-- Create user_subscriptions table for Pulse digest preferences
-- IKA-338: Pulse - subscription and digest settings

-- Digest frequency enum
DO $$
BEGIN
    CREATE TYPE digest_frequency AS ENUM ('daily', 'weekly', 'never');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id          UUID REFERENCES projects(id) ON DELETE CASCADE,
    tenant_workspace_id UUID REFERENCES tenant_workspaces(id) ON DELETE CASCADE,
    digest_frequency    digest_frequency NOT NULL DEFAULT 'daily',
    subscribed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique subscription per user per project
    UNIQUE(user_id, project_id)
);

-- Primary query: Get user's subscriptions
CREATE INDEX idx_user_subscriptions_user
    ON user_subscriptions(user_id);

-- For "For me" filter: Find projects user is subscribed to
CREATE INDEX idx_user_subscriptions_user_project
    ON user_subscriptions(user_id, project_id)
    WHERE project_id IS NOT NULL;

-- For digest job: Find users with specific frequency
CREATE INDEX idx_user_subscriptions_digest
    ON user_subscriptions(digest_frequency)
    WHERE digest_frequency != 'never';

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_user_subscriptions_updated_at ON user_subscriptions;
CREATE TRIGGER trg_user_subscriptions_updated_at
    BEFORE UPDATE ON user_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE user_subscriptions IS 'User subscription preferences for Pulse digests';
COMMENT ON COLUMN user_subscriptions.digest_frequency IS 'How often to receive Pulse summary: daily, weekly, never';
