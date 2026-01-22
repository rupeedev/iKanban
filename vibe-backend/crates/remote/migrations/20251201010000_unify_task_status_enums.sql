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
