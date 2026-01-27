-- Add parent_id column to tasks table for sub-issue linking (IKA-317)
-- This allows hierarchical issue relationships where one issue can be a sub-issue of another

-- Add parent_id column (nullable self-referencing FK)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Create index for efficient lookup of sub-issues by parent
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id) WHERE parent_id IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN tasks.parent_id IS 'Reference to parent task for sub-issue hierarchy';
