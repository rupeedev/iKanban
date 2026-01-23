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
