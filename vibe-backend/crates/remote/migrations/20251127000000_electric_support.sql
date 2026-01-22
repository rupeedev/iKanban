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
