-- IKA-186 - IKA-190: Trust & Safety System
-- Implements user trust profiles, abuse detection signals, and email verifications

-- User Trust Profiles (IKA-186: Trust level tracking per user)
CREATE TABLE IF NOT EXISTS user_trust_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,
    trust_level INTEGER DEFAULT 0 NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE NOT NULL,
    email_verified_at TIMESTAMPTZ,
    account_age_days INTEGER DEFAULT 0 NOT NULL,
    total_tasks_created INTEGER DEFAULT 0 NOT NULL,
    members_invited INTEGER DEFAULT 0 NOT NULL,
    is_flagged BOOLEAN DEFAULT FALSE NOT NULL,
    flagged_reason TEXT,
    flagged_at TIMESTAMPTZ,
    flagged_by TEXT,
    is_banned BOOLEAN DEFAULT FALSE NOT NULL,
    banned_at TIMESTAMPTZ,
    banned_by TEXT,
    ban_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for user_trust_profiles
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_trust_profiles_user_id ON user_trust_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_trust_profiles_trust_level ON user_trust_profiles(trust_level);
CREATE INDEX IF NOT EXISTS idx_user_trust_profiles_is_flagged ON user_trust_profiles(is_flagged);
CREATE INDEX IF NOT EXISTS idx_user_trust_profiles_is_banned ON user_trust_profiles(is_banned);
CREATE INDEX IF NOT EXISTS idx_user_trust_profiles_email_verified ON user_trust_profiles(email_verified);

-- Abuse Detection Signals (IKA-188: Track suspicious activity)
CREATE TABLE IF NOT EXISTS abuse_detection_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    description TEXT,
    metadata JSONB DEFAULT '{}' NOT NULL,
    source_ip TEXT,
    is_resolved BOOLEAN DEFAULT FALSE NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    resolution_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for abuse_detection_signals
CREATE INDEX IF NOT EXISTS idx_abuse_detection_signals_user_id ON abuse_detection_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_abuse_detection_signals_type ON abuse_detection_signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_abuse_detection_signals_severity ON abuse_detection_signals(severity);
CREATE INDEX IF NOT EXISTS idx_abuse_detection_signals_is_resolved ON abuse_detection_signals(is_resolved);
CREATE INDEX IF NOT EXISTS idx_abuse_detection_signals_created_at ON abuse_detection_signals(created_at);

-- Email Verifications (IKA-189: Email verification tokens)
CREATE TABLE IF NOT EXISTS email_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for email_verifications
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_verifications_token_hash ON email_verifications(token_hash);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires_at ON email_verifications(expires_at);
