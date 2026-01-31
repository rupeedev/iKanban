-- Migration: 20251001000000_shared_tasks_activity.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS organizations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    is_personal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT NOT NULL UNIQUE,
    first_name   TEXT,
    last_name    TEXT,
    username     TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    CREATE TYPE member_role AS ENUM ('admin', 'member');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS organization_member_metadata (
        organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role            member_role NOT NULL DEFAULT 'member',
        joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at    TIMESTAMPTZ,
        PRIMARY KEY (organization_id, user_id)
    );

CREATE INDEX IF NOT EXISTS idx_member_metadata_user
    ON organization_member_metadata (user_id);

CREATE INDEX IF NOT EXISTS idx_member_metadata_org_role
    ON organization_member_metadata (organization_id, role);

DO $$
BEGIN
    CREATE TYPE task_status AS ENUM ('todo', 'in-progress', 'in-review', 'done', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_org_name
    ON projects (organization_id, name);

CREATE TABLE IF NOT EXISTS project_activity_counters (
    project_id UUID PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    last_seq BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_tasks (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    creator_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
    assignee_user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
    deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    title              TEXT NOT NULL,
    description        TEXT,
    status             task_status NOT NULL DEFAULT 'todo'::task_status,
    version            BIGINT NOT NULL DEFAULT 1,
    deleted_at         TIMESTAMPTZ,
    shared_at          TIMESTAMPTZ DEFAULT NOW(),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_org_status
    ON shared_tasks (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_tasks_org_assignee
    ON shared_tasks (organization_id, assignee_user_id);

CREATE INDEX IF NOT EXISTS idx_tasks_project
    ON shared_tasks (project_id);

CREATE INDEX IF NOT EXISTS idx_shared_tasks_org_deleted_at
    ON shared_tasks (organization_id, deleted_at)
    WHERE deleted_at IS NOT NULL;

-- Partitioned activity feed (24-hour range partitions on created_at).
CREATE TABLE IF NOT EXISTS activity (
    seq               BIGINT NOT NULL,
    event_id          UUID NOT NULL DEFAULT gen_random_uuid(),
    project_id        UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    assignee_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    event_type        TEXT NOT NULL,
    payload           JSONB NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (created_at, project_id, seq),
    UNIQUE (created_at, event_id)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_activity_project_seq
    ON activity (project_id, seq DESC);

-- Create partitions on demand for the 24-hour window that contains target_ts.
CREATE FUNCTION ensure_activity_partition(target_ts TIMESTAMPTZ)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    bucket_seconds CONSTANT INTEGER := 24 * 60 * 60;
    bucket_start   TIMESTAMPTZ;
    bucket_end     TIMESTAMPTZ;
    partition_name TEXT;
BEGIN
    bucket_start := to_timestamp(
        floor(EXTRACT(EPOCH FROM target_ts) / bucket_seconds) * bucket_seconds
    );
    bucket_end := bucket_start + INTERVAL '24 hours';
    partition_name := format(
        'activity_p_%s',
        to_char(bucket_start AT TIME ZONE 'UTC', 'YYYYMMDD')
    );

    BEGIN
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF activity FOR VALUES FROM (%L) TO (%L)',
            partition_name,
            bucket_start,
            bucket_end
        );
    EXCEPTION
        WHEN duplicate_table THEN
            NULL;
    END;
END;
$$;

-- Seed partitions for the current and next 2 days (48 hours) for safety.
-- This ensures partitions exist even if cron job fails temporarily.
SELECT ensure_activity_partition(NOW());
SELECT ensure_activity_partition(NOW() + INTERVAL '24 hours');
SELECT ensure_activity_partition(NOW() + INTERVAL '48 hours');

DO $$
BEGIN
    DROP TRIGGER IF EXISTS trg_activity_notify ON activity;
EXCEPTION
    WHEN undefined_object THEN NULL;
END
$$;

DO $$
BEGIN
    DROP FUNCTION IF EXISTS activity_notify();
EXCEPTION
    WHEN undefined_function THEN NULL;
END
$$;

CREATE FUNCTION activity_notify() RETURNS trigger AS $$
BEGIN
    PERFORM pg_notify(
        'activity',
        json_build_object(
            'seq', NEW.seq,
            'event_id', NEW.event_id,
            'project_id', NEW.project_id,
            'event_type', NEW.event_type,
            'created_at', NEW.created_at
        )::text
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_activity_notify ON activity;
CREATE TRIGGER trg_activity_notify
    AFTER INSERT ON activity
    FOR EACH ROW
    EXECUTE FUNCTION activity_notify();

DO $$
BEGIN
    CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'declined', 'expired');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS organization_invitations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invited_by_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    email               TEXT NOT NULL,
    role                member_role NOT NULL DEFAULT 'member',
    status              invitation_status NOT NULL DEFAULT 'pending',
    token               TEXT NOT NULL UNIQUE,
    expires_at          TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_invites_org
    ON organization_invitations (organization_id);

CREATE INDEX IF NOT EXISTS idx_org_invites_status_expires
    ON organization_invitations (status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_invite_per_email_per_org
    ON organization_invitations (organization_id, lower(email))
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS auth_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_secret_hash TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at        TIMESTAMPTZ,
    revoked_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
    ON auth_sessions (user_id);

CREATE TABLE IF NOT EXISTS oauth_accounts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider          TEXT NOT NULL,
    provider_user_id  TEXT NOT NULL,
    email             TEXT,
    username          TEXT,
    display_name      TEXT,
    avatar_url        TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user
    ON oauth_accounts (user_id);

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_provider_user
    ON oauth_accounts (provider, provider_user_id);

CREATE TABLE IF NOT EXISTS oauth_handoffs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        TEXT NOT NULL,
    state           TEXT NOT NULL,
    return_to       TEXT NOT NULL,
    app_challenge   TEXT NOT NULL,
    app_code_hash   TEXT,
    status          TEXT NOT NULL DEFAULT 'pending',
    error_code      TEXT,
    expires_at      TIMESTAMPTZ NOT NULL,
    authorized_at   TIMESTAMPTZ,
    redeemed_at     TIMESTAMPTZ,
    user_id         UUID REFERENCES users(id),
    session_id      UUID REFERENCES auth_sessions(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_handoffs_status
    ON oauth_handoffs (status);

CREATE INDEX IF NOT EXISTS idx_oauth_handoffs_user
    ON oauth_handoffs (user_id);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_shared_tasks_updated_at ON shared_tasks;
CREATE TRIGGER trg_shared_tasks_updated_at
    BEFORE UPDATE ON shared_tasks
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_org_invites_updated_at ON organization_invitations;
CREATE TRIGGER trg_org_invites_updated_at
    BEFORE UPDATE ON organization_invitations
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_oauth_accounts_updated_at ON oauth_accounts;
CREATE TRIGGER trg_oauth_accounts_updated_at
    BEFORE UPDATE ON oauth_accounts
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_oauth_handoffs_updated_at ON oauth_handoffs;
CREATE TRIGGER trg_oauth_handoffs_updated_at
    BEFORE UPDATE ON oauth_handoffs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION set_last_used_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.last_used_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auth_sessions_last_used_at ON auth_sessions;
CREATE TRIGGER trg_auth_sessions_last_used_at
BEFORE UPDATE ON auth_sessions
FOR EACH ROW
EXECUTE FUNCTION set_last_used_at();

-- Migration: 20251117000000_jwt_refresh_tokens.sql
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS refresh_token_id UUID;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS refresh_token_issued_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_refresh_id
    ON auth_sessions (refresh_token_id);

CREATE TABLE IF NOT EXISTS revoked_refresh_tokens (
    token_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user
    ON revoked_refresh_tokens (user_id);

-- Migration: 20251120121307_oauth_handoff_tokens.sql
ALTER TABLE oauth_handoffs
ADD COLUMN IF NOT EXISTS encrypted_provider_tokens TEXT;

-- Migration: 20251127000000_electric_support.sql
-- Create role if not exists (PostgreSQL doesn't have CREATE ROLE IF NOT EXISTS)
DO $$
BEGIN
    CREATE ROLE electric_sync WITH LOGIN REPLICATION;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Grant connect on current database (works regardless of database name)
DO $$
BEGIN
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO electric_sync', current_database());
    EXECUTE 'GRANT USAGE ON SCHEMA public TO electric_sync';
EXCEPTION
    WHEN OTHERS THEN NULL; -- Ignore if already granted or role issues
END
$$;

-- Create publication if not exists
DO $$
BEGIN
    CREATE PUBLICATION electric_publication_default;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE OR REPLACE FUNCTION electric_sync_table(p_schema text, p_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    qualified text := format('%I.%I', p_schema, p_table);
BEGIN
    EXECUTE format('ALTER TABLE %s REPLICA IDENTITY FULL', qualified);
    EXECUTE format('GRANT SELECT ON TABLE %s TO electric_sync', qualified);
    EXECUTE format('ALTER PUBLICATION %I ADD TABLE %s', 'electric_publication_default', qualified);
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'electric_sync_table failed for %: %', qualified, SQLERRM;
END;
$$;

-- Apply to shared_tasks if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'shared_tasks') THEN
        PERFORM electric_sync_table('public', 'shared_tasks');
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END
$$;

-- Migration: 20251201000000_drop_unused_activity_and_columns.sql
-- Drop activity feed tables and functions
DROP TABLE IF EXISTS activity CASCADE;
DROP TABLE IF EXISTS project_activity_counters;
DROP FUNCTION IF EXISTS ensure_activity_partition;
DROP FUNCTION IF EXISTS activity_notify;

-- Drop unused columns from shared_tasks
ALTER TABLE shared_tasks DROP COLUMN IF EXISTS version;
ALTER TABLE shared_tasks DROP COLUMN IF EXISTS last_event_seq;

-- Migration: 20251201010000_unify_task_status_enums.sql
-- Rename enum values only if old names exist (idempotent)
DO $$
BEGIN
    -- Check if 'in-progress' exists before renaming
    IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'in-progress' AND enumtypid = 'task_status'::regtype) THEN
        ALTER TYPE task_status RENAME VALUE 'in-progress' TO 'inprogress';
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END
$$;

DO $$
BEGIN
    -- Check if 'in-review' exists before renaming
    IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'in-review' AND enumtypid = 'task_status'::regtype) THEN
        ALTER TYPE task_status RENAME VALUE 'in-review' TO 'inreview';
    END IF;
EXCEPTION
    WHEN OTHERS THEN NULL;
END
$$;

-- Migration: 20251212000000_create_reviews_table.sql
CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    gh_pr_url TEXT NOT NULL,
    claude_code_session_id TEXT,
    ip_address INET NOT NULL,
    review_cache JSONB,
    last_viewed_at TIMESTAMPTZ,
    r2_path TEXT NOT NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    email TEXT NOT NULL,
    pr_title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
);

-- Index for rate limiting queries (IP + time range)
CREATE INDEX IF NOT EXISTS idx_reviews_ip_created ON reviews (ip_address, created_at);

-- Migration: 20251215000000_github_app_installations.sql
-- GitHub App installations linked to organizations
CREATE TABLE IF NOT EXISTS github_app_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    github_installation_id BIGINT NOT NULL UNIQUE,
    github_account_login TEXT NOT NULL,
    github_account_type TEXT NOT NULL,  -- 'Organization' or 'User'
    repository_selection TEXT NOT NULL, -- 'all' or 'selected'
    installed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    suspended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_github_app_installations_org ON github_app_installations(organization_id);

-- Repositories accessible via an installation
CREATE TABLE IF NOT EXISTS github_app_repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id UUID NOT NULL REFERENCES github_app_installations(id) ON DELETE CASCADE,
    github_repo_id BIGINT NOT NULL,
    repo_full_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(installation_id, github_repo_id)
);

CREATE INDEX IF NOT EXISTS idx_github_app_repos_installation ON github_app_repositories(installation_id);

-- Track pending installations (before callback completes)
CREATE TABLE IF NOT EXISTS github_app_pending_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    state_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_installations_state ON github_app_pending_installations(state_token);
CREATE INDEX IF NOT EXISTS idx_pending_installations_expires ON github_app_pending_installations(expires_at);

-- Migration: 20251216000000_add_webhook_fields_to_reviews.sql
-- Make email and ip_address nullable for webhook-triggered reviews (idempotent)
DO $$
BEGIN
    -- Check if email column is NOT NULL before dropping constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reviews' AND column_name = 'email' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE reviews ALTER COLUMN email DROP NOT NULL;
    END IF;

    -- Check if ip_address column is NOT NULL before dropping constraint
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'reviews' AND column_name = 'ip_address' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE reviews ALTER COLUMN ip_address DROP NOT NULL;
    END IF;
END
$$;

-- Add webhook-specific columns (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'github_installation_id') THEN
        ALTER TABLE reviews ADD COLUMN github_installation_id BIGINT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'pr_owner') THEN
        ALTER TABLE reviews ADD COLUMN pr_owner TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'pr_repo') THEN
        ALTER TABLE reviews ADD COLUMN pr_repo TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reviews' AND column_name = 'pr_number') THEN
        ALTER TABLE reviews ADD COLUMN pr_number INTEGER;
    END IF;
END
$$;

-- Index for webhook reviews
CREATE INDEX IF NOT EXISTS idx_reviews_webhook ON reviews (github_installation_id)
WHERE github_installation_id IS NOT NULL;

-- Migration: 20251216100000_add_review_enabled_to_repos.sql
-- Add review_enabled column to allow users to toggle which repos are reviewed (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'github_app_repositories' AND column_name = 'review_enabled') THEN
        ALTER TABLE github_app_repositories ADD COLUMN review_enabled BOOLEAN NOT NULL DEFAULT true;
    END IF;
END
$$;

-- Index for efficient filtering during webhook processing
CREATE INDEX IF NOT EXISTS idx_github_app_repos_review_enabled
ON github_app_repositories(installation_id, review_enabled)
WHERE review_enabled = true;

-- Migration: 20260102000000_add_document_storage_path_to_teams.sql
-- Add document_storage_path column to teams table (idempotent)
-- This allows teams to configure a custom directory path for document storage

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'document_storage_path') THEN
        ALTER TABLE teams ADD COLUMN document_storage_path TEXT;
    END IF;
END
$$;

-- The path can be:
-- NULL: Use default application storage (dev_assets/documents/{team_id}/)
-- Absolute path: Store documents in the specified directory

-- Migration: 20260102100000_create_github_connections.sql
-- Create github_connections table for storing GitHub PAT connections
CREATE TABLE IF NOT EXISTS github_connections (
    id              BLOB PRIMARY KEY,
    team_id         BLOB NOT NULL,
    access_token    TEXT NOT NULL,  -- GitHub Personal Access Token (should be encrypted in production)
    github_username TEXT,           -- GitHub username associated with token
    connected_at    TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create github_repositories table for linked repos
CREATE TABLE IF NOT EXISTS github_repositories (
    id                  BLOB PRIMARY KEY,
    connection_id       BLOB NOT NULL,
    repo_full_name      TEXT NOT NULL,  -- e.g., "owner/repo"
    repo_name           TEXT NOT NULL,  -- e.g., "repo"
    repo_owner          TEXT NOT NULL,  -- e.g., "owner"
    repo_url            TEXT NOT NULL,
    default_branch      TEXT,
    is_private          INTEGER NOT NULL DEFAULT 0,
    linked_at           TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (connection_id) REFERENCES github_connections(id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_github_connections_team_id ON github_connections(team_id);
CREATE INDEX IF NOT EXISTS idx_github_repositories_connection_id ON github_repositories(connection_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_repositories_unique ON github_repositories(connection_id, repo_full_name);

-- Migration: 20260102200000_add_github_sync_fields.sql
-- Add sync configuration fields to github_repositories (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'github_repositories' AND column_name = 'sync_path') THEN
        ALTER TABLE github_repositories ADD COLUMN sync_path TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'github_repositories' AND column_name = 'sync_folder_id') THEN
        ALTER TABLE github_repositories ADD COLUMN sync_folder_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'github_repositories' AND column_name = 'last_synced_at') THEN
        ALTER TABLE github_repositories ADD COLUMN last_synced_at TIMESTAMPTZ;
    END IF;
END
$$;

-- Create index for sync_folder_id lookups
CREATE INDEX IF NOT EXISTS idx_github_repositories_sync_folder_id ON github_repositories(sync_folder_id);

-- Migration: 20260102300000_create_repo_sync_configs.sql
-- Multi-folder sync configuration for GitHub repositories
CREATE TABLE IF NOT EXISTS github_repo_sync_configs (
    id BLOB PRIMARY KEY NOT NULL,
    repo_id BLOB NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
    folder_id TEXT NOT NULL,  -- References document_folders.id
    github_path TEXT,         -- Path in repo (null = use folder name)
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE(repo_id, folder_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_configs_repo ON github_repo_sync_configs(repo_id);
CREATE INDEX IF NOT EXISTS idx_sync_configs_folder ON github_repo_sync_configs(folder_id);

-- Migration: 20260103000000_add_team_configuration.sql
-- Add team configuration columns for agent execution (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'dev_script') THEN
        ALTER TABLE teams ADD COLUMN dev_script TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'dev_script_working_dir') THEN
        ALTER TABLE teams ADD COLUMN dev_script_working_dir TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'default_agent_working_dir') THEN
        ALTER TABLE teams ADD COLUMN default_agent_working_dir TEXT;
    END IF;
END
$$;

-- Migration: 20260103000001_create_team_repos.sql
-- Create team_repos table for team-level repository configuration
-- This mirrors project_repos structure to enable agent execution for team tasks
CREATE TABLE IF NOT EXISTS team_repos (
    id                    BLOB PRIMARY KEY,
    team_id               BLOB NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    repo_id               BLOB NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    setup_script          TEXT,
    cleanup_script        TEXT,
    copy_files            TEXT,
    parallel_setup_script INTEGER NOT NULL DEFAULT 0,
    created_at            TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE (team_id, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_team_repos_team_id ON team_repos(team_id);
CREATE INDEX IF NOT EXISTS idx_team_repos_repo_id ON team_repos(repo_id);

-- Migration: 20260103100000_workspace_github_connection.sql
-- Migration: Move GitHub connections from team-level to workspace-level (idempotent)
-- A workspace-level connection has team_id = NULL
-- This migration only runs if team_id column is NOT NULL (not yet migrated)

DO $$
BEGIN
    -- Check if migration is needed by seeing if team_id is nullable
    -- If team_id is already nullable, migration was already applied
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'github_connections'
        AND column_name = 'team_id'
        AND is_nullable = 'NO'
    ) THEN
        -- Drop the NOT NULL constraint on team_id to allow workspace-level connections
        ALTER TABLE github_connections ALTER COLUMN team_id DROP NOT NULL;
    END IF;
END
$$;

-- Recreate indexes (idempotent)
CREATE INDEX IF NOT EXISTS idx_github_connections_team_id ON github_connections(team_id);

-- Add unique constraint for workspace-level connection
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_connections_workspace ON github_connections(team_id) WHERE team_id IS NULL;

-- Migration: 20260103200000_add_folder_local_path.sql
-- Add local_path field to document_folders for filesystem sync (idempotent)
-- This allows users to specify a local directory path that will be scanned
-- for markdown documents when the Scan button is clicked
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_folders' AND column_name = 'local_path') THEN
        ALTER TABLE document_folders ADD COLUMN local_path TEXT;
    END IF;
END
$$;

-- Migration: 20260103300000_create_team_members.sql
-- Create team_members table for storing team membership with roles
CREATE TABLE IF NOT EXISTS team_members (
    id          BLOB PRIMARY KEY,
    team_id     BLOB NOT NULL,
    email       TEXT NOT NULL,
    display_name TEXT,
    role        TEXT NOT NULL DEFAULT 'contributor' CHECK(role IN ('viewer', 'contributor', 'maintainer', 'owner')),
    invited_by  BLOB,
    joined_at   TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE(team_id, email),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email);

-- Migration: 20260103300001_create_team_invitations.sql
-- Create team_invitations table for pending invitations
CREATE TABLE IF NOT EXISTS team_invitations (
    id          BLOB PRIMARY KEY,
    team_id     BLOB NOT NULL,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'contributor' CHECK(role IN ('viewer', 'contributor', 'maintainer', 'owner')),
    status      TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'declined', 'expired')),
    invited_by  BLOB,
    expires_at  TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_team_invitations_team_id ON team_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status);

-- Unique constraint: only one pending invitation per email per team
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_pending ON team_invitations(team_id, email) WHERE status = 'pending';

-- Migration: 20260103400000_add_invitation_token.sql
-- Add token column to team_invitations for shareable invite links (idempotent)
-- Note: PostgreSQL supports ADD COLUMN IF NOT EXISTS syntax since version 11
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_invitations' AND column_name = 'token') THEN
        ALTER TABLE team_invitations ADD COLUMN token TEXT;
    END IF;
END
$$;

-- Create unique index for faster token lookups and uniqueness constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(token) WHERE token IS NOT NULL;

-- Migration: 20260104100000_create_task_comments.sql
-- Task comments for Jira-style commenting functionality
CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id TEXT REFERENCES team_members(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    author_email TEXT,
    content TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_author_id ON task_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments(task_id, created_at);

-- Migration: 20260104200000_create_task_document_links.sql
-- Task-Document Links: Links tasks/issues to team documents
CREATE TABLE IF NOT EXISTS task_document_links (
    id TEXT PRIMARY KEY NOT NULL,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    UNIQUE(task_id, document_id)
);

-- Index for fast lookups by task
CREATE INDEX IF NOT EXISTS idx_task_document_links_task_id ON task_document_links(task_id);

-- Index for fast lookups by document
CREATE INDEX IF NOT EXISTS idx_task_document_links_document_id ON task_document_links(document_id);

-- Migration: 20260104300000_add_team_slug.sql
-- Add slug field to teams for multi-tenant database naming (idempotent)
-- Slug is used for database file naming: team-{slug}.sqlite

-- Add slug column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'slug') THEN
        ALTER TABLE teams ADD COLUMN slug TEXT;
    END IF;
END
$$;

-- Create unique index for slug
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);

-- Generate initial slugs from existing team names
-- Convert name to lowercase, replace spaces with dashes, remove non-alphanumeric except dashes
UPDATE teams
SET slug = LOWER(REPLACE(REPLACE(REPLACE(name, ' ', '-'), '_', '-'), '.', '-'))
WHERE slug IS NULL;

-- Migration: 20260105100000_add_clerk_fields_to_members.sql
-- Add Clerk integration fields to team_members (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_members' AND column_name = 'clerk_user_id') THEN
        ALTER TABLE team_members ADD COLUMN clerk_user_id TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_members' AND column_name = 'avatar_url') THEN
        ALTER TABLE team_members ADD COLUMN avatar_url TEXT;
    END IF;
END
$$;

-- Create index for fast Clerk user lookups
CREATE INDEX IF NOT EXISTS idx_team_members_clerk_user_id ON team_members(clerk_user_id);

-- Migration: 20260105200000_create_member_project_access.sql
-- Member Project Access: Controls which projects each team member can access
CREATE TABLE IF NOT EXISTS member_project_access (
    id TEXT PRIMARY KEY NOT NULL,
    member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'subsec')),
    UNIQUE(member_id, project_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_member_project_access_member ON member_project_access(member_id);
CREATE INDEX IF NOT EXISTS idx_member_project_access_project ON member_project_access(project_id);

-- Migration: 20260105300000_add_document_slug.sql
-- Add slug column to documents table for human-readable URLs (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'slug') THEN
        ALTER TABLE documents ADD COLUMN slug TEXT;
    END IF;
END
$$;

-- Create index for fast slug lookups within a team
CREATE INDEX IF NOT EXISTS idx_documents_team_slug ON documents(team_id, slug);

-- Backfill existing documents with slugs generated from titles
-- Slug format: lowercase, spaces to hyphens, remove special chars
UPDATE documents SET slug = LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    title, ' ', '-'), '/', '-'), ':', ''), '.', ''), ',', ''), '''', ''))
WHERE slug IS NULL;

-- Migration: 20260108000000_create_api_keys.sql
-- API keys for programmatic access (MCP servers, CLI tools, etc.)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,           -- Clerk user ID
    name TEXT NOT NULL,              -- Human-readable name for the key
    key_prefix TEXT NOT NULL,        -- First 8 chars of key for identification (e.g., "vk_abc123")
    key_hash TEXT NOT NULL,          -- SHA-256 hash of the full key
    scopes TEXT[] DEFAULT '{}',      -- Optional: specific permissions (future use)
    last_used_at TIMESTAMPTZ,        -- Track usage
    expires_at TIMESTAMPTZ,          -- Optional expiration
    is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for looking up keys by hash (primary lookup path)
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash) WHERE NOT is_revoked;

-- Index for listing user's keys
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_api_keys_updated_at();

-- Migration: 20260110095208_add_supabase_storage_columns.sql
-- Add Supabase Storage columns to documents table
-- Supports both local filesystem and Supabase Storage backends

-- Add storage columns to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS storage_key TEXT,
ADD COLUMN IF NOT EXISTS storage_bucket TEXT,
ADD COLUMN IF NOT EXISTS storage_metadata JSONB,
ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'local';

-- Add storage_path to document_folders for tracking folder location in bucket
ALTER TABLE document_folders
ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Create indexes for storage lookups
CREATE INDEX IF NOT EXISTS idx_documents_storage_key ON documents(storage_key);
CREATE INDEX IF NOT EXISTS idx_documents_storage_provider ON documents(storage_provider);
CREATE INDEX IF NOT EXISTS idx_documents_storage_bucket ON documents(storage_bucket);

-- Add comments for documentation
COMMENT ON COLUMN documents.storage_key IS 'Supabase Storage object key (path in bucket). Format: {team_id}/root/{uuid}_{filename} or {team_id}/folders/{folder_id}/{uuid}_{filename}';
COMMENT ON COLUMN documents.storage_bucket IS 'Supabase Storage bucket name (e.g., ikanban-bucket)';
COMMENT ON COLUMN documents.storage_metadata IS 'Supabase file metadata JSON (etag, version, lastModified, etc.)';
COMMENT ON COLUMN documents.storage_provider IS 'Storage backend: local (filesystem) or supabase (Supabase Storage)';
COMMENT ON COLUMN document_folders.storage_path IS 'Full path in Supabase Storage bucket for this folder';

-- Migration: 20260110111436_create_tenant_workspaces.sql
-- Create tenant_workspaces table (top-level organizational unit)
-- This is the tenant container for multi-tenancy - each workspace is an isolated organization

CREATE TABLE IF NOT EXISTS tenant_workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    icon TEXT,
    color TEXT,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create tenant_workspace_members table (who has access to which workspace)
CREATE TABLE IF NOT EXISTS tenant_workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_workspace_id UUID NOT NULL REFERENCES tenant_workspaces(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_workspace_id, user_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_tenant_workspaces_slug ON tenant_workspaces(slug);
CREATE INDEX IF NOT EXISTS idx_tenant_workspace_members_workspace ON tenant_workspace_members(tenant_workspace_id);
CREATE INDEX IF NOT EXISTS idx_tenant_workspace_members_user ON tenant_workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_workspace_members_email ON tenant_workspace_members(email);

-- Add workspace_id to teams table (optional - for scoping teams to workspaces)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS tenant_workspace_id UUID REFERENCES tenant_workspaces(id);
CREATE INDEX IF NOT EXISTS idx_teams_tenant_workspace ON teams(tenant_workspace_id);

-- Add workspace_id to projects table (optional - for scoping projects to workspaces)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS tenant_workspace_id UUID REFERENCES tenant_workspaces(id);
CREATE INDEX IF NOT EXISTS idx_projects_tenant_workspace ON projects(tenant_workspace_id);

-- Comments for documentation
COMMENT ON TABLE tenant_workspaces IS 'Top-level organizational workspaces (tenants) for multi-tenancy';
COMMENT ON TABLE tenant_workspace_members IS 'Members belonging to tenant workspaces with role-based access';
COMMENT ON COLUMN tenant_workspaces.slug IS 'URL-friendly unique identifier (e.g., acme-corp)';
COMMENT ON COLUMN tenant_workspaces.settings IS 'JSON configuration for workspace-level settings';
COMMENT ON COLUMN tenant_workspace_members.role IS 'Member role: owner, admin, or member';

-- Migration: 20260110120000_add_workspace_to_projects.sql
-- Add tenant_workspace_id to projects table for workspace scoping (idempotent)
-- This allows filtering projects by workspace

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'tenant_workspace_id') THEN
        ALTER TABLE projects ADD COLUMN tenant_workspace_id UUID REFERENCES tenant_workspaces(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- Index for efficient workspace filtering
CREATE INDEX IF NOT EXISTS idx_projects_tenant_workspace ON projects(tenant_workspace_id);

-- Comment for documentation
COMMENT ON COLUMN projects.tenant_workspace_id IS 'The tenant workspace this project belongs to. NULL means legacy project without workspace.';

-- Migration: 20260111100000_create_team_storage_configs.sql
-- Team Storage Configs table for cloud storage provider configurations
-- Supports Google Drive, AWS S3, and Dropbox integrations

CREATE TABLE IF NOT EXISTS team_storage_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,  -- 'google_drive', 's3', 'dropbox'
    access_token TEXT,  -- Encrypted OAuth access token
    refresh_token TEXT,  -- Encrypted OAuth refresh token
    token_expires_at TIMESTAMPTZ,
    folder_id TEXT,  -- Provider-specific folder/bucket path
    config_data JSONB NOT NULL DEFAULT '{}',  -- Provider-specific config (bucket, region, etc.)
    is_active BOOLEAN NOT NULL DEFAULT true,
    connected_email TEXT,  -- Email of connected account
    connected_account_id TEXT,  -- Provider account ID
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_storage_configs_team_id ON team_storage_configs(team_id);
CREATE INDEX IF NOT EXISTS idx_team_storage_configs_provider ON team_storage_configs(provider);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_team_storage_configs_team_provider ON team_storage_configs(team_id, provider);

-- Comments
COMMENT ON TABLE team_storage_configs IS 'Cloud storage provider configurations for teams';
COMMENT ON COLUMN team_storage_configs.provider IS 'Storage provider type: google_drive, s3, or dropbox';
COMMENT ON COLUMN team_storage_configs.config_data IS 'Provider-specific configuration as JSONB (bucket name, region, prefix for S3, etc.)';

-- Migration: 20260111141105_create_chat_tables.sql
-- Create chat tables for team messaging with privacy controls
-- Privacy: Only same-team members within same workspace can chat

-- Conversations table (DMs and group chats)
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    tenant_workspace_id UUID NOT NULL REFERENCES tenant_workspaces(id) ON DELETE CASCADE,
    name TEXT, -- NULL for direct messages, required for groups
    conversation_type TEXT NOT NULL DEFAULT 'direct' CHECK(conversation_type IN ('direct', 'group')),
    created_by TEXT NOT NULL, -- Clerk user ID
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for conversations
CREATE INDEX IF NOT EXISTS idx_conversations_team ON conversations(team_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON conversations(tenant_workspace_id);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(conversation_type);
CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations(created_by);

-- Conversation participants (who's in each conversation)
CREATE TABLE IF NOT EXISTS conversation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, -- Clerk user ID
    team_member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_read_at TIMESTAMPTZ, -- For unread message tracking
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- Indexes for participants
CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation ON conversation_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_user ON conversation_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_participants_team_member ON conversation_participants(team_member_id);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL, -- Clerk user ID
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ -- Soft delete
);

-- Indexes for messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_not_deleted ON chat_messages(conversation_id) WHERE deleted_at IS NULL;

-- Comments for documentation
COMMENT ON TABLE conversations IS 'Chat conversations (DMs and group chats) within a team';
COMMENT ON TABLE conversation_participants IS 'Members participating in a conversation';
COMMENT ON TABLE chat_messages IS 'Individual chat messages within conversations';
COMMENT ON COLUMN conversations.team_id IS 'Team this conversation belongs to - enforces same-team only messaging';
COMMENT ON COLUMN conversations.conversation_type IS 'Type: direct (2 people) or group (3+ people)';
COMMENT ON COLUMN conversation_participants.last_read_at IS 'Timestamp of last read message for unread tracking';
COMMENT ON COLUMN chat_messages.deleted_at IS 'Soft delete timestamp - message hidden but preserved';

-- Migration: 20260117223923_create_gitlab_connections.sql
-- Create gitlab_connections table for storing GitLab PAT connections
-- Supports both workspace-level (team_id IS NULL) and team-level connections

CREATE TABLE IF NOT EXISTS gitlab_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID,  -- NULL for workspace-level connection
    access_token TEXT NOT NULL,  -- GitLab Personal Access Token
    gitlab_username TEXT,  -- GitLab username associated with token
    gitlab_url TEXT NOT NULL DEFAULT 'https://gitlab.com',  -- GitLab instance URL (for self-hosted)
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_gitlab_connections_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create gitlab_repositories table for linked repos
CREATE TABLE IF NOT EXISTS gitlab_repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES gitlab_connections(id) ON DELETE CASCADE,
    repo_full_name TEXT NOT NULL,  -- e.g., "namespace/project"
    repo_name TEXT NOT NULL,  -- e.g., "project"
    repo_namespace TEXT NOT NULL,  -- e.g., "namespace" (user or group)
    repo_url TEXT NOT NULL,
    default_branch TEXT,
    is_private BOOLEAN NOT NULL DEFAULT false,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_gitlab_connections_team_id ON gitlab_connections(team_id);
CREATE INDEX IF NOT EXISTS idx_gitlab_repositories_connection_id ON gitlab_repositories(connection_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gitlab_repositories_unique ON gitlab_repositories(connection_id, repo_full_name);

-- Comments
COMMENT ON TABLE gitlab_connections IS 'GitLab connections for workspace or team-level integrations';
COMMENT ON COLUMN gitlab_connections.team_id IS 'NULL for workspace-level connection';
COMMENT ON COLUMN gitlab_connections.gitlab_url IS 'GitLab instance URL, defaults to gitlab.com, can be self-hosted URL';
COMMENT ON TABLE gitlab_repositories IS 'Linked GitLab repositories for a connection';

-- Migration: 20260118133220_create_agent_configs.sql
-- Create agent_configs table for storing agent configurations (idempotent)
-- This enables dual storage: local files (.claude/, .github/) AND database storage

CREATE TABLE IF NOT EXISTS agent_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

    -- Agent identification
    agent_type TEXT NOT NULL, -- e.g., 'CLAUDE_CODE', 'COPILOT', 'DROID'

    -- Storage metadata
    storage_location TEXT NOT NULL, -- 'local' or 'database'
    local_path TEXT, -- Path to local config file if storage_location='local' (e.g., '.claude/profiles.json')

    -- Configuration data (JSON)
    config_data JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ, -- Last sync time between local and database

    -- Constraints
    CONSTRAINT uniq_agent_configs_team_agent UNIQUE (team_id, agent_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_configs_team_id ON agent_configs(team_id);
CREATE INDEX IF NOT EXISTS idx_agent_configs_agent_type ON agent_configs(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_configs_storage_location ON agent_configs(storage_location);

-- Migration: 20260118223609_add_tenancy_performance_indexes.sql
-- Add performance indexes for tenancy queries (TENANCY-QW-01: IKA-201)
-- These composite indexes optimize frequently-used tenant-scoped queries.
-- Note: CONCURRENTLY cannot be used inside transactions (SQLx migrations run in transactions)

-- Tasks: indexed by team + status for filtering issues by status within a team
-- (tasks.team_id -> teams.tenant_workspace_id for full tenant scoping)
CREATE INDEX IF NOT EXISTS idx_tasks_team_status
    ON tasks(team_id, status);

-- Projects: indexed by workspace for workspace-filtered project lists
CREATE INDEX IF NOT EXISTS idx_projects_workspace_id
    ON projects(tenant_workspace_id)
    WHERE tenant_workspace_id IS NOT NULL;

-- Team members: composite index for efficient workspace + user lookups
-- Complements existing idx_tenant_workspace_members_workspace with user-specific queries
CREATE INDEX IF NOT EXISTS idx_team_members_workspace_user
    ON tenant_workspace_members(tenant_workspace_id, user_id);

-- Teams: indexed by workspace for listing teams within a tenant
CREATE INDEX IF NOT EXISTS idx_teams_workspace_id
    ON teams(tenant_workspace_id)
    WHERE tenant_workspace_id IS NOT NULL;

-- Tasks: indexed by project for efficient task listing within projects
-- (complements existing idx_tasks_project_created_at)
CREATE INDEX IF NOT EXISTS idx_tasks_project_status
    ON tasks(project_id, status);

-- Comments for documentation
COMMENT ON INDEX idx_tasks_team_status IS 'Optimizes filtering tasks by status within a team (10-100x speedup)';
COMMENT ON INDEX idx_projects_workspace_id IS 'Optimizes listing projects in a workspace';
COMMENT ON INDEX idx_team_members_workspace_user IS 'Optimizes user permission lookups within workspaces';
COMMENT ON INDEX idx_teams_workspace_id IS 'Optimizes listing teams within a workspace';
COMMENT ON INDEX idx_tasks_project_status IS 'Optimizes filtering tasks by status within a project';

-- Migration: 20260119000000_add_tenant_workspace_plan_limits.sql
-- IKA-176: Add plan and limits columns to tenant_workspaces (idempotent)
-- Adds subscription plan tracking and resource limits for multi-tenancy

-- Add plan column (subscription tier: free, pro, enterprise)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_workspaces' AND column_name = 'plan') THEN
        ALTER TABLE tenant_workspaces ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_workspaces' AND column_name = 'max_teams') THEN
        ALTER TABLE tenant_workspaces ADD COLUMN max_teams BIGINT NOT NULL DEFAULT 2;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_workspaces' AND column_name = 'max_projects') THEN
        ALTER TABLE tenant_workspaces ADD COLUMN max_projects BIGINT NOT NULL DEFAULT 5;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_workspaces' AND column_name = 'max_members') THEN
        ALTER TABLE tenant_workspaces ADD COLUMN max_members BIGINT NOT NULL DEFAULT 3;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenant_workspaces' AND column_name = 'max_storage_gb') THEN
        ALTER TABLE tenant_workspaces ADD COLUMN max_storage_gb BIGINT NOT NULL DEFAULT 1;
    END IF;
END
$$;

-- Add index for plan column (useful for filtering by subscription tier)
CREATE INDEX IF NOT EXISTS idx_tenant_workspaces_plan ON tenant_workspaces(plan);

-- Migration: 20260119000001_create_workspace_subscriptions.sql
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

-- Migration: 20260119101718_create_plan_limits.sql
-- Create plan_limits table for subscription plan resource limits (IKA-178)
-- NOTE: Table may already exist from earlier migration with different plan names
-- This migration is idempotent - it only creates if not exists

-- Only create table if it doesn't exist
-- The earlier migration (20260119000000) may have created it with different plan names
CREATE TABLE IF NOT EXISTS plan_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_name TEXT NOT NULL UNIQUE,
    max_teams BIGINT NOT NULL DEFAULT 2,
    max_projects BIGINT NOT NULL DEFAULT 5,
    max_members BIGINT NOT NULL DEFAULT 3,
    max_storage_gb BIGINT NOT NULL DEFAULT 1,
    max_ai_requests_per_month BIGINT NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups (IF NOT EXISTS handles idempotency)
CREATE INDEX IF NOT EXISTS idx_plan_limits_plan_name ON plan_limits(plan_name);

-- NOTE: Not inserting seed data here as the table may already have data
-- with different plan names (hobby, starter, pro vs free, pro, enterprise)
-- The existing data and constraints should be preserved

-- Migration: 20260119122720_create_workspace_usage.sql
-- Create workspace_usage table for tracking resource consumption per workspace (IKA-179)
-- Tracks teams, projects, members, tasks, AI requests, and storage usage per billing period

CREATE TABLE IF NOT EXISTS workspace_usage (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Key to tenant workspace
    tenant_workspace_id UUID NOT NULL REFERENCES tenant_workspaces(id) ON DELETE CASCADE,

    -- Billing Period
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Usage Counters
    teams_count INTEGER NOT NULL DEFAULT 0,
    projects_count INTEGER NOT NULL DEFAULT 0,
    members_count INTEGER NOT NULL DEFAULT 0,
    tasks_count INTEGER NOT NULL DEFAULT 0,
    ai_requests_count INTEGER NOT NULL DEFAULT 0,
    storage_bytes BIGINT NOT NULL DEFAULT 0,

    -- Audit Trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints: One record per workspace per billing period
    CONSTRAINT unique_workspace_period UNIQUE(tenant_workspace_id, period_start)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_workspace_usage_workspace
    ON workspace_usage(tenant_workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_usage_period
    ON workspace_usage(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_workspace_usage_workspace_period
    ON workspace_usage(tenant_workspace_id, period_start DESC);

-- Trigger to update updated_at on modification
CREATE OR REPLACE FUNCTION update_workspace_usage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists to make migration idempotent
DROP TRIGGER IF EXISTS workspace_usage_updated_at ON workspace_usage;

CREATE TRIGGER workspace_usage_updated_at
    BEFORE UPDATE ON workspace_usage
    FOR EACH ROW
    EXECUTE FUNCTION update_workspace_usage_updated_at();

-- Comment on table
COMMENT ON TABLE workspace_usage IS 'Tracks resource usage per workspace per billing period for limit enforcement';
COMMENT ON COLUMN workspace_usage.teams_count IS 'Current number of teams in the workspace';
COMMENT ON COLUMN workspace_usage.projects_count IS 'Current number of projects in the workspace';
COMMENT ON COLUMN workspace_usage.members_count IS 'Current number of members in the workspace';
COMMENT ON COLUMN workspace_usage.tasks_count IS 'Current number of tasks in the workspace';
COMMENT ON COLUMN workspace_usage.ai_requests_count IS 'AI requests made during this billing period';
COMMENT ON COLUMN workspace_usage.storage_bytes IS 'Total storage used in bytes';

-- Migration: 20260119130000_create_trust_safety_tables.sql
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

-- Migration: 20260120000000_create_plan_limits.sql
-- Create plan_limits table for defining resource limits per subscription plan (IKA-179)
-- This table defines what each plan (free, starter, pro, enterprise) allows

CREATE TABLE IF NOT EXISTS plan_limits (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Plan name (unique identifier)
    plan_name TEXT NOT NULL UNIQUE,

    -- Resource limits (-1 = unlimited)
    max_teams BIGINT NOT NULL DEFAULT 2,
    max_projects BIGINT NOT NULL DEFAULT 5,
    max_members BIGINT NOT NULL DEFAULT 3,
    max_storage_gb BIGINT NOT NULL DEFAULT 1,
    max_ai_requests_per_month BIGINT NOT NULL DEFAULT 50,

    -- Audit Trail
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- NOTE: Not inserting default plan limits here
-- The table already has data with plan names: 'hobby', 'starter', 'pro'
-- These were inserted by migration 20260119000000
-- The CHECK constraint valid_plan_name only allows these values

-- Index for plan lookups
CREATE INDEX IF NOT EXISTS idx_plan_limits_plan_name ON plan_limits(plan_name);

-- Comment on table
COMMENT ON TABLE plan_limits IS 'Defines resource limits for each subscription plan';
COMMENT ON COLUMN plan_limits.max_teams IS 'Maximum teams allowed (-1 = unlimited)';
COMMENT ON COLUMN plan_limits.max_projects IS 'Maximum projects allowed (-1 = unlimited)';
COMMENT ON COLUMN plan_limits.max_members IS 'Maximum members allowed (-1 = unlimited)';
COMMENT ON COLUMN plan_limits.max_storage_gb IS 'Maximum storage in GB (-1 = unlimited)';
COMMENT ON COLUMN plan_limits.max_ai_requests_per_month IS 'Maximum AI requests per month (-1 = unlimited)';

-- Migration: 20260120213919_create_superadmins.sql
-- Create superadmins table for app-level administrators
-- Superadmins can approve/reject registration requests and access /superadmin/* routes

CREATE TABLE IF NOT EXISTS superadmins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,           -- Clerk user ID
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_superadmins_user_id ON superadmins(user_id);
CREATE INDEX IF NOT EXISTS idx_superadmins_email ON superadmins(email);
CREATE INDEX IF NOT EXISTS idx_superadmins_active ON superadmins(is_active) WHERE is_active = true;

-- Comments for documentation
COMMENT ON TABLE superadmins IS 'App-level administrators who can approve registrations and access /superadmin/* routes';
COMMENT ON COLUMN superadmins.user_id IS 'Clerk user ID for authentication';
COMMENT ON COLUMN superadmins.is_active IS 'Whether the superadmin can currently perform admin actions';

-- Migration: 20260121133257_add_superadmin_rupesh.sql
-- Add rupeshpanwar43@gmail.com as superadmin
-- This finds the Clerk user_id from tenant_workspace_members

INSERT INTO superadmins (user_id, email, name, is_active)
SELECT
    user_id,
    'rupeshpanwar43@gmail.com',
    'Rupesh Panwar',
    true
FROM tenant_workspace_members
WHERE email = 'rupeshpanwar43@gmail.com'
LIMIT 1
ON CONFLICT (email) DO UPDATE SET
    is_active = true,
    updated_at = NOW();

-- Migration: 20260121155700_update_plan_limits_3tier.sql
-- IKA-215: Update plan_limits to 3-tier structure (Hobby/Starter/Pro)
-- Reference: docs-ikanban/tenancy/signup/SIGNUP-EPIC-TASKS.md

-- Step 1: Add max_workspaces column if it doesn't exist
ALTER TABLE plan_limits ADD COLUMN IF NOT EXISTS max_workspaces BIGINT NOT NULL DEFAULT 1;

-- Step 2: Drop the old valid_plan_name constraint that only allows free/pro/enterprise
ALTER TABLE plan_limits DROP CONSTRAINT IF EXISTS valid_plan_name;

-- Step 3: Drop the positive_limits constraint since we need to handle -1 for unlimited
ALTER TABLE plan_limits DROP CONSTRAINT IF EXISTS positive_limits;

-- Step 4: Remove old plans (free, enterprise)
DELETE FROM plan_limits WHERE plan_name IN ('free', 'enterprise');

-- Step 5: Insert/update the 3-tier plans
INSERT INTO plan_limits (
    plan_name,
    max_workspaces,
    max_teams,
    max_projects,
    max_members,
    max_storage_gb,
    max_ai_requests_per_month
) VALUES
    -- HOBBY PLAN: Free tier for personal projects
    -- 1 workspace, 7 teams, 3 projects, 5 members, 1 GB storage, 50 AI requests
    ('hobby', 1, 7, 3, 5, 1, 50),

    -- STARTER PLAN: Small teams ($19/mo)
    -- 1 workspace, 5 teams, 10 projects, 10 members, 5 GB storage, 100 AI requests
    ('starter', 1, 5, 10, 10, 5, 100),

    -- PRO PLAN: Growing organizations ($39/mo)
    -- 3 workspaces, 10 teams, 25 projects, 25 members, 50 GB storage, 1000 AI requests
    ('pro', 3, 10, 25, 25, 50, 1000)
ON CONFLICT (plan_name) DO UPDATE SET
    max_workspaces = EXCLUDED.max_workspaces,
    max_teams = EXCLUDED.max_teams,
    max_projects = EXCLUDED.max_projects,
    max_members = EXCLUDED.max_members,
    max_storage_gb = EXCLUDED.max_storage_gb,
    max_ai_requests_per_month = EXCLUDED.max_ai_requests_per_month,
    updated_at = NOW();

-- Step 6: Add new constraint for valid plan names (hobby, starter, pro)
-- Use DO block to check if constraint exists first (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'valid_plan_name'
        AND table_name = 'plan_limits'
    ) THEN
        ALTER TABLE plan_limits ADD CONSTRAINT valid_plan_name
            CHECK (plan_name IN ('hobby', 'starter', 'pro'));
    END IF;
END
$$;

-- Step 7: Add comment for new column
COMMENT ON COLUMN plan_limits.max_workspaces IS 'Maximum workspaces allowed per plan';

-- Migration: 20260121180000_add_plan_to_registrations.sql
-- IKA-220: Add selected_plan and related columns to user_registrations
-- Reference: docs-ikanban/tenancy/signup/SIGNUP-EPIC-TASKS.md

-- Add new columns for plan selection during registration
ALTER TABLE user_registrations
ADD COLUMN IF NOT EXISTS selected_plan TEXT DEFAULT 'hobby',
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS use_case TEXT,
ADD COLUMN IF NOT EXISTS requested_workspace_name TEXT;

-- Add index for filtering registrations by plan
CREATE INDEX IF NOT EXISTS idx_user_registrations_selected_plan
ON user_registrations(selected_plan);

-- Add constraint for valid plan names (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'valid_registration_plan'
        AND table_name = 'user_registrations'
    ) THEN
        ALTER TABLE user_registrations
        ADD CONSTRAINT valid_registration_plan
        CHECK (selected_plan IN ('hobby', 'starter', 'pro'));
    END IF;
END
$$;

-- Add comments for documentation
COMMENT ON COLUMN user_registrations.selected_plan IS 'Plan selected during registration: hobby, starter, or pro';
COMMENT ON COLUMN user_registrations.company_name IS 'Optional company/organization name';
COMMENT ON COLUMN user_registrations.use_case IS 'Optional description of intended use case';
COMMENT ON COLUMN user_registrations.requested_workspace_name IS 'User-requested name for their workspace';

-- Migration: 20260122120510_fix_superadmin_rupesh.sql
-- Fix superadmin entry for rupeshpanwar43@gmail.com
-- Previous migration may have failed if email wasn't in tenant_workspace_members
-- This migration directly inserts/updates using the Clerk user_id from users table

-- First try to get user_id from users table (more reliable than tenant_workspace_members)
INSERT INTO superadmins (user_id, email, name, is_active)
SELECT
    id AS user_id,
    'rupeshpanwar43@gmail.com',
    'Rupesh Panwar',
    true
FROM users
WHERE email = 'rupeshpanwar43@gmail.com'
LIMIT 1
ON CONFLICT (email) DO UPDATE SET
    is_active = true,
    updated_at = NOW();

-- If still not found (user may have different email in users table),
-- try to insert with a direct Clerk ID lookup pattern
-- This is a fallback that uses the known Clerk user_id pattern
INSERT INTO superadmins (user_id, email, name, is_active)
SELECT
    user_id,
    'rupeshpanwar43@gmail.com',
    'Rupesh Panwar',
    true
FROM tenant_workspace_members
WHERE email = 'rupeshpanwar43@gmail.com'
LIMIT 1
ON CONFLICT (email) DO UPDATE SET
    is_active = true,
    updated_at = NOW();

-- Migration: 20260123075656_create_team_projects.sql
-- Create team_projects junction table for team-project relationships
-- This enables the many-to-many relationship between teams and projects

CREATE TABLE IF NOT EXISTS team_projects (
    team_id     UUID NOT NULL,
    project_id  UUID NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (team_id, project_id),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_team_projects_team_id ON team_projects(team_id);
CREATE INDEX IF NOT EXISTS idx_team_projects_project_id ON team_projects(project_id);

-- Auto-populate team_projects from existing tasks that have both team_id and project_id
-- This backfills the relationship based on existing task assignments
INSERT INTO team_projects (team_id, project_id)
SELECT DISTINCT team_id, project_id
FROM tasks
WHERE team_id IS NOT NULL AND project_id IS NOT NULL
ON CONFLICT (team_id, project_id) DO NOTHING;

-- Migration: 20260123081242_fix_task_comments_types.sql
-- Fix task_comments table to use proper PostgreSQL types
-- The original migration used TEXT types (SQLite format)

-- Drop existing table if it has wrong types and recreate
DROP TABLE IF EXISTS task_comments;

CREATE TABLE task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
    author_name TEXT NOT NULL,
    author_email TEXT,
    content TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_author_id ON task_comments(author_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments(task_id, created_at);

-- Migration: 20260123081839_create_tags_and_task_tags.sql
-- Create tags table for task tagging feature
-- Tags are scoped to teams/organizations

CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tag_name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    color TEXT DEFAULT '#6B7280',
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create junction table for task-tag relationships
CREATE TABLE IF NOT EXISTS task_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(task_id, tag_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_tags_team_id ON tags(team_id);
CREATE INDEX IF NOT EXISTS idx_tags_tag_name ON tags(tag_name);
CREATE INDEX IF NOT EXISTS idx_task_tags_task_id ON task_tags(task_id);
CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id ON task_tags(tag_id);

-- Migration: 20260123082245_create_documents_and_task_links.sql
-- Create document folders table for organizing documents
CREATE TABLE IF NOT EXISTS document_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES document_folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    local_path TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    slug TEXT,
    content TEXT,
    file_path TEXT,
    file_type TEXT NOT NULL DEFAULT 'markdown',
    file_size BIGINT,
    mime_type TEXT,
    icon TEXT,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER NOT NULL DEFAULT 0,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Drop and recreate task_document_links with proper PostgreSQL types
DROP TABLE IF EXISTS task_document_links;

CREATE TABLE task_document_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(task_id, document_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_document_folders_team_id ON document_folders(team_id);
CREATE INDEX IF NOT EXISTS idx_document_folders_parent_id ON document_folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_documents_team_id ON documents(team_id);
CREATE INDEX IF NOT EXISTS idx_documents_folder_id ON documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_slug ON documents(slug);
CREATE INDEX IF NOT EXISTS idx_task_document_links_task_id ON task_document_links(task_id);
CREATE INDEX IF NOT EXISTS idx_task_document_links_document_id ON task_document_links(document_id);

-- Migration: 20260123100249_add_document_storage_columns.sql
-- Add storage backend columns to documents table
-- Supports local storage and cloud providers (Supabase, S3, etc.)

ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_key TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_bucket TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_metadata JSONB;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'local';

-- Index for storage lookups
CREATE INDEX IF NOT EXISTS idx_documents_storage_key ON documents(storage_key);
CREATE INDEX IF NOT EXISTS idx_documents_storage_provider ON documents(storage_provider);

-- Migration: 20260123104753_create_inbox_items.sql
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

-- Migration: 20260123105017_enhance_projects.sql
-- Enhance projects table with additional fields
-- Phase 3.4: Add priority, lead, dates, status, health, description, summary, icon

-- Add priority column (0=none, 1=urgent, 2=high, 3=medium, 4=low)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'priority') THEN
        ALTER TABLE projects ADD COLUMN priority INTEGER DEFAULT 0;
    END IF;
END
$$;

-- Add lead_id column (project lead)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'lead_id') THEN
        ALTER TABLE projects ADD COLUMN lead_id UUID REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END
$$;

-- Add date columns
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'start_date') THEN
        ALTER TABLE projects ADD COLUMN start_date TIMESTAMPTZ;
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'target_date') THEN
        ALTER TABLE projects ADD COLUMN target_date TIMESTAMPTZ;
    END IF;
END
$$;

-- Create project_status enum
DO $$
BEGIN
    CREATE TYPE project_status AS ENUM ('backlog', 'planned', 'in_progress', 'paused', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

-- Add status column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'status') THEN
        ALTER TABLE projects ADD COLUMN status project_status NOT NULL DEFAULT 'backlog';
    END IF;
END
$$;

-- Add health column (0-100 percentage)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'health') THEN
        ALTER TABLE projects ADD COLUMN health INTEGER DEFAULT 100;
    END IF;
END
$$;

-- Add description column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'description') THEN
        ALTER TABLE projects ADD COLUMN description TEXT;
    END IF;
END
$$;

-- Add summary column (short summary for listing)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'summary') THEN
        ALTER TABLE projects ADD COLUMN summary TEXT;
    END IF;
END
$$;

-- Add icon column (emoji or icon identifier)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'icon') THEN
        ALTER TABLE projects ADD COLUMN icon TEXT;
    END IF;
END
$$;

-- Add updated_at column
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'updated_at') THEN
        ALTER TABLE projects ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    END IF;
END
$$;

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_projects_lead ON projects(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_priority ON projects(priority) WHERE priority > 0;

-- Migration: 20260123141524_fix_github_connections_postgresql.sql
-- Fix github_connections table for PostgreSQL (original migration used SQLite syntax)
-- This migration ensures the table exists with correct PostgreSQL types

-- Drop old SQLite-style table if it exists (won't work with PostgreSQL BLOB type)
DROP TABLE IF EXISTS github_repositories CASCADE;
DROP TABLE IF EXISTS github_connections CASCADE;

-- Create github_connections table with PostgreSQL types
CREATE TABLE IF NOT EXISTS github_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID,  -- NULL for workspace-level connection
    access_token TEXT NOT NULL,  -- GitHub Personal Access Token
    github_username TEXT,  -- GitHub username associated with token
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_github_connections_team FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

-- Create github_repositories table for linked repos
CREATE TABLE IF NOT EXISTS github_repositories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES github_connections(id) ON DELETE CASCADE,
    repo_full_name TEXT NOT NULL,  -- e.g., "owner/repo"
    repo_name TEXT NOT NULL,  -- e.g., "repo"
    repo_owner TEXT NOT NULL,  -- e.g., "owner"
    repo_url TEXT NOT NULL,
    default_branch TEXT,
    is_private BOOLEAN NOT NULL DEFAULT false,
    linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_github_connections_team_id ON github_connections(team_id);
CREATE INDEX IF NOT EXISTS idx_github_repositories_connection_id ON github_repositories(connection_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_repositories_unique ON github_repositories(connection_id, repo_full_name);

-- Add unique constraint for workspace-level connection (only one per workspace)
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_connections_workspace ON github_connections(team_id) WHERE team_id IS NULL;

-- Comments
COMMENT ON TABLE github_connections IS 'GitHub connections for workspace or team-level integrations';
COMMENT ON COLUMN github_connections.team_id IS 'NULL for workspace-level connection';
COMMENT ON TABLE github_repositories IS 'Linked GitHub repositories for a connection';

-- Migration: 20260123202639_cloud_ai_execution_schema.sql
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
-- AI Session Messages - Conversation history within AI sessions
-- (Named ai_session_messages to avoid conflict with team chat_messages table)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_session_messages (
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
    CONSTRAINT uq_ai_session_message_sequence UNIQUE (session_id, sequence_number)
);

-- Indexes for ai_session_messages
CREATE INDEX IF NOT EXISTS idx_ai_session_messages_session_id ON ai_session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_session_messages_sequence ON ai_session_messages(session_id, sequence_number);
CREATE INDEX IF NOT EXISTS idx_ai_session_messages_role ON ai_session_messages(role);
CREATE INDEX IF NOT EXISTS idx_ai_session_messages_created_at ON ai_session_messages(created_at DESC);

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
COMMENT ON TABLE ai_session_messages IS 'Conversation history within AI sessions';
COMMENT ON TABLE execution_approvals IS 'Human-in-the-loop approval workflow for sensitive actions';

-- Migration: 20260123220225_create_execution_shares.sql
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

-- Migration: 20260123220721_add_unique_team_clerk_user.sql
-- Add unique constraint on (team_id, clerk_user_id) to support upsert for member sync
-- This allows a Clerk user to only be a member of a team once

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_team_clerk_user
    ON team_members (team_id, clerk_user_id)
    WHERE clerk_user_id IS NOT NULL;

-- Migration: 20260123225859_create_project_repos.sql
-- Create repos table for storing repository metadata in remote
-- This stores repository info (GitHub URLs, names) rather than local filesystem paths
CREATE TABLE IF NOT EXISTS repos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    path            TEXT NOT NULL,          -- GitHub URL or local path
    name            TEXT NOT NULL,          -- Repository short name
    display_name    TEXT NOT NULL,          -- Full display name (e.g., owner/repo)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create project_repos table to link projects to repositories
CREATE TABLE IF NOT EXISTS project_repos (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id            UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    repo_id               UUID NOT NULL REFERENCES repos(id) ON DELETE CASCADE,
    setup_script          TEXT,
    cleanup_script        TEXT,
    copy_files            TEXT,
    parallel_setup_script BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, repo_id)
);

CREATE INDEX IF NOT EXISTS idx_project_repos_project_id ON project_repos(project_id);
CREATE INDEX IF NOT EXISTS idx_project_repos_repo_id ON project_repos(repo_id);

-- Migration: 20260124154217_add_priority_to_shared_tasks.sql
-- Add priority column to shared_tasks
ALTER TABLE shared_tasks ADD COLUMN IF NOT EXISTS priority INTEGER;

-- Migration: 20260125203554_create_activity_logs.sql
-- Create activity_logs table for tracking user actions
-- IKA-286: Admin activity tracking

CREATE TABLE IF NOT EXISTS activity_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    user_email      TEXT,
    action          TEXT NOT NULL,  -- create, update, delete, login, etc.
    resource_type   TEXT NOT NULL,  -- task, project, team, member, etc.
    resource_id     UUID,
    resource_name   TEXT,           -- Human-readable resource name
    workspace_id    UUID,
    team_id         UUID,
    details         JSONB,          -- Additional action details
    ip_address      TEXT,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_workspace_id ON activity_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_team_id ON activity_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource ON activity_logs(resource_type, resource_id);

-- Compound index for common query pattern
CREATE INDEX IF NOT EXISTS idx_activity_logs_workspace_time
    ON activity_logs(workspace_id, created_at DESC);

-- Migration: 20260126181452_add_performance_indexes.sql
-- Add performance indexes for dashboard queries
-- Reference: docs-ikanban/architecture/PERFORMANCE-OPTIMIZATION.md (IKA-301)
--
-- NOTE (2026-01-26): These indexes are on shared_tasks, but dashboard queries
-- actually use the separate "tasks" table which ALREADY HAS these indexes:
--   - idx_tasks_team_status, idx_tasks_assignee_id, idx_tasks_team_id, etc.
-- These indexes are harmless but unused. Left in place to avoid migration conflicts.
--
-- The "tasks" table has: team_id, assignee_id, issue_number, due_date
-- The "shared_tasks" table has: organization_id, assignee_user_id (different columns)

-- Index for faster assignee lookups on shared_tasks table
CREATE INDEX IF NOT EXISTS idx_shared_tasks_assignee_user_id ON shared_tasks(assignee_user_id);

-- Index for faster organization_id lookups on shared_tasks table (team filtering)
CREATE INDEX IF NOT EXISTS idx_shared_tasks_organization_id ON shared_tasks(organization_id);

-- Composite index for dashboard queries filtering by organization, status, and ordering by created_at
CREATE INDEX IF NOT EXISTS idx_shared_tasks_org_status_created ON shared_tasks(organization_id, status, created_at DESC);

-- Migration: 20260127112604_add_parent_id_to_tasks.sql
-- Add parent_id column to tasks table for sub-issue linking (IKA-317)
-- This allows hierarchical issue relationships where one issue can be a sub-issue of another

-- Add parent_id column (nullable self-referencing FK)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Create index for efficient lookup of sub-issues by parent
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id) WHERE parent_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN tasks.parent_id IS 'Reference to parent task for sub-issue hierarchy';

-- Migration: 20260127122554_fix_member_project_access_postgres.sql
-- IKA-319: Fix member_project_access table for PostgreSQL
-- The original migration used SQLite syntax; this creates the proper PostgreSQL version

-- Drop the SQLite-style table if it exists (safe to run)
DROP TABLE IF EXISTS member_project_access;

-- Create proper PostgreSQL table with UUID types
CREATE TABLE IF NOT EXISTS member_project_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(member_id, project_id)
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_member_project_access_member ON member_project_access(member_id);
CREATE INDEX IF NOT EXISTS idx_member_project_access_project ON member_project_access(project_id);

COMMENT ON TABLE member_project_access IS 'Controls which projects each team member can access';

-- Migration: 20260128073500_add_actor_id_to_inbox_items.sql
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

-- Migration: 20260128073501_add_inbox_notification_types.sql
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

-- Migration: 20260128073502_create_project_updates.sql
-- Create project_updates table for Pulse feature
-- IKA-338: Pulse - project status updates feed

-- Health status enum for project updates
DO $$
BEGIN
    CREATE TYPE project_health_status AS ENUM (
        'on_track',
        'at_risk',
        'off_track',
        'completed',
        'paused'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Main project updates table
CREATE TABLE IF NOT EXISTS project_updates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    health_status   project_health_status,
    progress_data   JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary query: Get updates for a project, newest first
CREATE INDEX idx_project_updates_project_created
    ON project_updates(project_id, created_at DESC);

-- For "Recent" tab: All updates sorted by time
CREATE INDEX idx_project_updates_created
    ON project_updates(created_at DESC);

-- For "For me" tab: Updates by author
CREATE INDEX idx_project_updates_author_created
    ON project_updates(author_id, created_at DESC);

-- Partial index for health status filtering
CREATE INDEX idx_project_updates_health
    ON project_updates(health_status)
    WHERE health_status IS NOT NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trg_project_updates_updated_at ON project_updates;
CREATE TRIGGER trg_project_updates_updated_at
    BEFORE UPDATE ON project_updates
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE project_updates IS 'Project status updates for Pulse feed';
COMMENT ON COLUMN project_updates.progress_data IS 'JSON: {"milestones": [{"name": "...", "progress": 50}]}';

-- Migration: 20260128073503_create_update_reactions.sql
-- Create update_reactions table for Pulse emoji reactions
-- IKA-338: Pulse - reactions on project updates

CREATE TABLE IF NOT EXISTS update_reactions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    update_id   UUID NOT NULL REFERENCES project_updates(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji       TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One reaction type per user per update
    UNIQUE(update_id, user_id, emoji)
);

-- Primary query: Count reactions per update
-- Covers: SELECT emoji, COUNT(*) FROM update_reactions WHERE update_id = ? GROUP BY emoji
CREATE INDEX idx_update_reactions_update
    ON update_reactions(update_id);

-- For user's reactions (check if already reacted)
CREATE INDEX idx_update_reactions_update_user
    ON update_reactions(update_id, user_id);

-- For "Popular" sorting: count reactions in time window
CREATE INDEX idx_update_reactions_created
    ON update_reactions(created_at DESC);

COMMENT ON TABLE update_reactions IS 'Emoji reactions on project updates';
COMMENT ON COLUMN update_reactions.emoji IS 'Emoji identifier: thumbs_up, heart, prayer_hands, etc.';

-- Migration: 20260128073504_create_user_subscriptions.sql
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

-- Migration: 20260128145254_add_pulse_is_read.sql
-- Add is_read column to project_updates for tracking read status
-- IKA-343: Add red dot notification badges to Activity and Triage sidebar items

ALTER TABLE project_updates ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient summary queries (user_id comes from author_id for now)
CREATE INDEX IF NOT EXISTS idx_project_updates_author_read
ON project_updates(author_id, is_read, created_at DESC);

