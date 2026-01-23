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
