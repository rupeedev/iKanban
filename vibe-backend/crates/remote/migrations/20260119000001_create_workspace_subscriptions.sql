-- IKA-177: Create workspace_subscriptions table for Stripe billing integration

-- Subscription tracking for tenant workspaces
CREATE TABLE IF NOT EXISTS workspace_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES tenant_workspaces(id) ON DELETE CASCADE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'trialing',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_workspace_id ON workspace_subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_status ON workspace_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_stripe_customer_id ON workspace_subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_workspace_subscriptions_stripe_subscription_id ON workspace_subscriptions(stripe_subscription_id);

-- Comment on table
COMMENT ON TABLE workspace_subscriptions IS 'Tracks Stripe subscription data for tenant workspaces';
COMMENT ON COLUMN workspace_subscriptions.status IS 'Stripe subscription status: trialing, active, canceled, past_due, unpaid, incomplete, incomplete_expired, paused';
