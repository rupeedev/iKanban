-- Cloud AI Execution Schema Migration
-- Phase 1: Database foundation for cloud-based AI code execution
-- Epic: IKA-246 (Cloud AI Execution Platform)
-- Task: IKA-247 (Phase 1: Database Schema)

-- ============================================================================
-- Task Executions - Main execution records linking tasks to execution status
-- ============================================================================
CREATE TABLE IF NOT EXISTS task_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Execution state
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    -- Possible statuses: pending, queued, running, paused, completed, failed, cancelled, timeout

    -- User who initiated the execution
    initiated_by UUID NOT NULL REFERENCES users(id),

    -- Execution configuration
    execution_mode VARCHAR(32) NOT NULL DEFAULT 'standard',
    -- Modes: standard, fast, thorough, custom

    max_attempts INT NOT NULL DEFAULT 3,
    current_attempt INT NOT NULL DEFAULT 0,

    -- Resource limits
    max_duration_seconds INT DEFAULT 3600, -- 1 hour default
    max_tokens INT DEFAULT 100000,

    -- Results summary (populated on completion)
    result_summary TEXT,
    error_message TEXT,

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

-- Indexes for task_executions
CREATE INDEX IF NOT EXISTS idx_task_executions_task_id ON task_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_project_id ON task_executions(project_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_organization_id ON task_executions(organization_id);
CREATE INDEX IF NOT EXISTS idx_task_executions_initiated_by ON task_executions(initiated_by);
CREATE INDEX IF NOT EXISTS idx_task_executions_status ON task_executions(status);
CREATE INDEX IF NOT EXISTS idx_task_executions_created_at ON task_executions(created_at DESC);

-- ============================================================================
-- Execution Attempts - Individual execution attempts (supports retries)
-- ============================================================================
CREATE TABLE IF NOT EXISTS execution_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES task_executions(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL,

    -- Attempt state
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    -- Statuses: pending, running, completed, failed, cancelled, timeout

    -- Worker assignment
    worker_id VARCHAR(255),
    worker_region VARCHAR(64),

    -- Results
    exit_code INT,
    error_message TEXT,

    -- AI model used
    ai_model VARCHAR(128),
    ai_provider VARCHAR(64),

    -- Token usage for this attempt
    input_tokens INT DEFAULT 0,
    output_tokens INT DEFAULT 0,
    cache_read_tokens INT DEFAULT 0,
    cache_write_tokens INT DEFAULT 0,

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    -- Unique constraint: one attempt number per execution
    CONSTRAINT uq_execution_attempt UNIQUE (execution_id, attempt_number)
);

-- Indexes for execution_attempts
CREATE INDEX IF NOT EXISTS idx_execution_attempts_execution_id ON execution_attempts(execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_attempts_status ON execution_attempts(status);
CREATE INDEX IF NOT EXISTS idx_execution_attempts_worker_id ON execution_attempts(worker_id);
CREATE INDEX IF NOT EXISTS idx_execution_attempts_created_at ON execution_attempts(created_at DESC);

-- ============================================================================
-- Execution Logs - Log output from executions (streaming support)
-- ============================================================================
CREATE TABLE IF NOT EXISTS execution_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id UUID NOT NULL REFERENCES execution_attempts(id) ON DELETE CASCADE,

    -- Log metadata
    log_type VARCHAR(32) NOT NULL DEFAULT 'stdout',
    -- Types: stdout, stderr, system, tool_call, tool_result, thinking, assistant

    sequence_number BIGINT NOT NULL,

    -- Content
    content TEXT NOT NULL,
    content_type VARCHAR(64) DEFAULT 'text/plain',

    -- Tool call context (if applicable)
    tool_name VARCHAR(255),
    tool_input JSONB,
    tool_output JSONB,

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Index for efficient log retrieval
    CONSTRAINT uq_log_sequence UNIQUE (attempt_id, sequence_number)
);

-- Indexes for execution_logs
CREATE INDEX IF NOT EXISTS idx_execution_logs_attempt_id ON execution_logs(attempt_id);
CREATE INDEX IF NOT EXISTS idx_execution_logs_sequence ON execution_logs(attempt_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_execution_logs_log_type ON execution_logs(log_type);
CREATE INDEX IF NOT EXISTS idx_execution_logs_tool_name ON execution_logs(tool_name) WHERE tool_name IS NOT NULL;

-- ============================================================================
-- AI Usage Records - Token tracking for billing and analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_usage_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links to execution context
    execution_id UUID REFERENCES task_executions(id) ON DELETE SET NULL,
    attempt_id UUID REFERENCES execution_attempts(id) ON DELETE SET NULL,

    -- Organization/user for billing
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),

    -- AI model details
    ai_provider VARCHAR(64) NOT NULL,
    ai_model VARCHAR(128) NOT NULL,

    -- Token counts
    input_tokens INT NOT NULL DEFAULT 0,
    output_tokens INT NOT NULL DEFAULT 0,
    cache_read_tokens INT DEFAULT 0,
    cache_write_tokens INT DEFAULT 0,

    -- Cost tracking (in microdollars - millionths of a dollar)
    input_cost_microdollars BIGINT DEFAULT 0,
    output_cost_microdollars BIGINT DEFAULT 0,
    total_cost_microdollars BIGINT DEFAULT 0,

    -- Request metadata
    request_type VARCHAR(64),
    -- Types: chat, completion, tool_use, embedding

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Billing period reference (for aggregation)
    billing_period VARCHAR(7) -- Format: YYYY-MM
);

-- Indexes for ai_usage_records
CREATE INDEX IF NOT EXISTS idx_ai_usage_organization_id ON ai_usage_records(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_id ON ai_usage_records(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_execution_id ON ai_usage_records(execution_id) WHERE execution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_usage_billing_period ON ai_usage_records(billing_period);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created_at ON ai_usage_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_model ON ai_usage_records(ai_provider, ai_model);

-- ============================================================================
-- Sessions - User sessions for AI execution (from server crate)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    project_id UUID REFERENCES projects(id) ON DELETE SET NULL,

    -- Session metadata
    name VARCHAR(255),
    session_type VARCHAR(64) NOT NULL DEFAULT 'coding',
    -- Types: coding, review, chat, debugging

    -- Status
    status VARCHAR(32) NOT NULL DEFAULT 'active',
    -- Statuses: active, paused, completed, archived

    -- Context
    working_directory TEXT,
    git_branch VARCHAR(255),
    git_commit VARCHAR(64),

    -- Session configuration
    config JSONB DEFAULT '{}',

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,

    -- Soft delete
    deleted_at TIMESTAMPTZ
);

-- Indexes for ai_sessions
CREATE INDEX IF NOT EXISTS idx_ai_sessions_organization_id ON ai_sessions(organization_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_id ON ai_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_project_id ON ai_sessions(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_sessions_status ON ai_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_created_at ON ai_sessions(created_at DESC);

-- ============================================================================
-- Chat Messages - Conversation history within sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,

    -- Message details
    role VARCHAR(32) NOT NULL,
    -- Roles: user, assistant, system, tool

    content TEXT NOT NULL,
    content_type VARCHAR(64) DEFAULT 'text/plain',

    -- For tool messages
    tool_use_id VARCHAR(255),
    tool_name VARCHAR(255),

    -- Token tracking for this message
    input_tokens INT,
    output_tokens INT,

    -- Message metadata
    metadata JSONB DEFAULT '{}',

    -- Ordering
    sequence_number BIGINT NOT NULL,

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Unique sequence per session
    CONSTRAINT uq_chat_message_sequence UNIQUE (session_id, sequence_number)
);

-- Indexes for chat_messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sequence ON chat_messages(session_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON chat_messages(role);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- ============================================================================
-- Approvals - Human-in-the-loop approval workflow
-- ============================================================================
CREATE TABLE IF NOT EXISTS execution_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL REFERENCES task_executions(id) ON DELETE CASCADE,
    attempt_id UUID REFERENCES execution_attempts(id) ON DELETE SET NULL,

    -- Approval context
    approval_type VARCHAR(64) NOT NULL,
    -- Types: tool_execution, file_write, destructive_action, external_api, custom

    -- What needs approval
    action_description TEXT NOT NULL,
    action_details JSONB DEFAULT '{}',

    -- Tool-specific details
    tool_name VARCHAR(255),
    tool_input JSONB,

    -- Risk assessment
    risk_level VARCHAR(32) DEFAULT 'medium',
    -- Levels: low, medium, high, critical

    -- Status
    status VARCHAR(32) NOT NULL DEFAULT 'pending',
    -- Statuses: pending, approved, rejected, expired, auto_approved

    -- Who approved/rejected
    decided_by UUID REFERENCES users(id),
    decision_reason TEXT,

    -- Auto-approval rules
    auto_approve_rule VARCHAR(255),

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    decided_at TIMESTAMPTZ
);

-- Indexes for execution_approvals
CREATE INDEX IF NOT EXISTS idx_execution_approvals_execution_id ON execution_approvals(execution_id);
CREATE INDEX IF NOT EXISTS idx_execution_approvals_attempt_id ON execution_approvals(attempt_id) WHERE attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_execution_approvals_status ON execution_approvals(status);
CREATE INDEX IF NOT EXISTS idx_execution_approvals_decided_by ON execution_approvals(decided_by) WHERE decided_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_execution_approvals_pending ON execution_approvals(created_at) WHERE status = 'pending';

-- ============================================================================
-- Helper: Update timestamp trigger function (if not exists)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
DO $$
BEGIN
    -- task_executions trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_task_executions_updated_at') THEN
        CREATE TRIGGER update_task_executions_updated_at
            BEFORE UPDATE ON task_executions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    -- ai_sessions trigger
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ai_sessions_updated_at') THEN
        CREATE TRIGGER update_ai_sessions_updated_at
            BEFORE UPDATE ON ai_sessions
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- Comments for documentation
-- ============================================================================
COMMENT ON TABLE task_executions IS 'Main execution records for AI-assisted task completion';
COMMENT ON TABLE execution_attempts IS 'Individual execution attempts with retry support';
COMMENT ON TABLE execution_logs IS 'Streaming logs from execution attempts';
COMMENT ON TABLE ai_usage_records IS 'Token usage tracking for billing and analytics';
COMMENT ON TABLE ai_sessions IS 'User sessions for interactive AI coding assistance';
COMMENT ON TABLE chat_messages IS 'Conversation history within AI sessions';
COMMENT ON TABLE execution_approvals IS 'Human-in-the-loop approval workflow for sensitive actions';
