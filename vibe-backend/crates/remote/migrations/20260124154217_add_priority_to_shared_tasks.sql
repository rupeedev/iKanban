-- Add priority column to shared_tasks
ALTER TABLE shared_tasks ADD COLUMN IF NOT EXISTS priority INTEGER;
