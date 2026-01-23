-- Execution Shares Migration (IKA-257)
-- Enables sharing task executions between users/teams

-- ============================================================================
-- Execution Shares - Share task executions with other users or teams
-- ============================================================================
CREATE TABLE IF NOT EXISTS execution_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- The execution being shared
    execution_id UUID NOT NULL REFERENCES task_executions(id) ON DELETE CASCADE,

    -- Who shared it
    shared_by UUID NOT NULL REFERENCES users(id),

    -- Share target (either user_id OR team_id, not both)
    shared_with_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    shared_with_team_id UUID REFERENCES teams(id) ON DELETE CASCADE,

    -- Share type
    share_type VARCHAR(32) NOT NULL DEFAULT 'view',
    -- Types: view, comment, collaborate, admin

    -- Optional message from sharer
    message TEXT,

    -- Share status
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    -- Statuses: active, revoked, expired

    -- Expiration (optional)
    expires_at TIMESTAMPTZ,

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,

    -- Ensure shared with either user or team, not both or neither
    CONSTRAINT chk_execution_share_target CHECK (
        (shared_with_user_id IS NOT NULL AND shared_with_team_id IS NULL) OR
        (shared_with_user_id IS NULL AND shared_with_team_id IS NOT NULL)
    ),

    -- Prevent duplicate shares
    CONSTRAINT uq_execution_share_user UNIQUE (execution_id, shared_with_user_id),
    CONSTRAINT uq_execution_share_team UNIQUE (execution_id, shared_with_team_id)
);

-- Indexes for execution_shares
CREATE INDEX IF NOT EXISTS idx_execution_shares_execution_id ON execution_shares(execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_shares_shared_by ON execution_shares(shared_by);
CREATE INDEX IF NOT EXISTS idx_execution_shares_shared_with_user ON execution_shares(shared_with_user_id) WHERE shared_with_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_execution_shares_shared_with_team ON execution_shares(shared_with_team_id) WHERE shared_with_team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_execution_shares_status ON execution_shares(status);
CREATE INDEX IF NOT EXISTS idx_execution_shares_created_at ON execution_shares(created_at DESC);

-- Comment
COMMENT ON TABLE execution_shares IS 'Shares task executions with other users or teams';
