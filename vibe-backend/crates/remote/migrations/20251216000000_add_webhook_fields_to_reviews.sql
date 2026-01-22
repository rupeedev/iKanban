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
