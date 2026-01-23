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
