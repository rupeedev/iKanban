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
