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
