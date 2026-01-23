//! Teams database operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

/// Team member roles with increasing permissions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TeamMemberRole {
    /// Can view issues and documents
    Viewer,
    /// Can create/edit issues, comment, update status
    #[default]
    Contributor,
    /// Can manage issues, docs, assign tasks
    Maintainer,
    /// Full control: manage roles, invite/remove members, team settings
    Owner,
}

impl TeamMemberRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Viewer => "viewer",
            Self::Contributor => "contributor",
            Self::Maintainer => "maintainer",
            Self::Owner => "owner",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "viewer" => Self::Viewer,
            "contributor" => Self::Contributor,
            "maintainer" => Self::Maintainer,
            "owner" => Self::Owner,
            _ => Self::Contributor,
        }
    }

    /// Check if this role has at least the required permission level
    pub fn has_permission(&self, required: TeamMemberRole) -> bool {
        match (*self, required) {
            (Self::Owner, _) => true,
            (Self::Maintainer, Self::Owner) => false,
            (Self::Maintainer, _) => true,
            (Self::Contributor, Self::Owner | Self::Maintainer) => false,
            (Self::Contributor, _) => true,
            (Self::Viewer, Self::Viewer) => true,
            (Self::Viewer, _) => false,
        }
    }
}

/// Invitation status
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum TeamInvitationStatus {
    #[default]
    Pending,
    Accepted,
    Declined,
    Expired,
}

impl TeamInvitationStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Accepted => "accepted",
            Self::Declined => "declined",
            Self::Expired => "expired",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "pending" => Self::Pending,
            "accepted" => Self::Accepted,
            "declined" => Self::Declined,
            "expired" => Self::Expired,
            _ => Self::Pending,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Team {
    pub id: Uuid,
    pub name: String,
    pub slug: Option<String>,
    pub identifier: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub document_storage_path: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTeamData {
    pub name: String,
    pub slug: String,
    pub identifier: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub tenant_workspace_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamProject {
    pub team_id: Uuid,
    pub project_id: Uuid,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateTeamData {
    pub name: Option<String>,
    pub identifier: Option<String>,
    pub icon: Option<String>,
    pub color: Option<String>,
    pub document_storage_path: Option<String>,
}

#[derive(Debug, Error)]
pub enum TeamError {
    #[error("team not found")]
    NotFound,
    #[error("team slug already exists")]
    SlugConflict,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct TeamRepository;

impl TeamRepository {
    /// List teams by workspace (tenant_workspace_id)
    pub async fn list_by_workspace(
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<Vec<Team>, TeamError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                name             AS "name!",
                slug,
                identifier,
                icon,
                color,
                document_storage_path,
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            FROM teams
            WHERE tenant_workspace_id = $1
            ORDER BY name ASC
            "#,
            workspace_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| Team {
                id: row.id,
                name: row.name,
                slug: row.slug,
                identifier: row.identifier,
                icon: row.icon,
                color: row.color,
                document_storage_path: row.document_storage_path,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect())
    }

    /// List all teams (no workspace filter)
    pub async fn list_all(pool: &PgPool) -> Result<Vec<Team>, TeamError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                name             AS "name!",
                slug,
                identifier,
                icon,
                color,
                document_storage_path,
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            FROM teams
            ORDER BY name ASC
            "#
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|row| Team {
                id: row.id,
                name: row.name,
                slug: row.slug,
                identifier: row.identifier,
                icon: row.icon,
                color: row.color,
                document_storage_path: row.document_storage_path,
                created_at: row.created_at,
                updated_at: row.updated_at,
            })
            .collect())
    }

    /// Get a team by ID
    pub async fn get_by_id(pool: &PgPool, team_id: Uuid) -> Result<Option<Team>, TeamError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                name             AS "name!",
                slug,
                identifier,
                icon,
                color,
                document_storage_path,
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            FROM teams
            WHERE id = $1
            "#,
            team_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| Team {
            id: r.id,
            name: r.name,
            slug: r.slug,
            identifier: r.identifier,
            icon: r.icon,
            color: r.color,
            document_storage_path: r.document_storage_path,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Get a team by slug
    pub async fn get_by_slug(pool: &PgPool, slug: &str) -> Result<Option<Team>, TeamError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                name             AS "name!",
                slug,
                identifier,
                icon,
                color,
                document_storage_path,
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            FROM teams
            WHERE slug = $1
            "#,
            slug
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| Team {
            id: r.id,
            name: r.name,
            slug: r.slug,
            identifier: r.identifier,
            icon: r.icon,
            color: r.color,
            document_storage_path: r.document_storage_path,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Get a team by ID, slug, or identifier
    pub async fn get_by_id_or_slug(
        pool: &PgPool,
        id_or_slug: &str,
    ) -> Result<Option<Team>, TeamError> {
        // Try parsing as UUID first
        if let Ok(uuid) = Uuid::parse_str(id_or_slug) {
            return Self::get_by_id(pool, uuid).await;
        }
        // Try slug or identifier lookup
        let row = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                name             AS "name!",
                slug,
                identifier,
                icon,
                color,
                document_storage_path,
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            FROM teams
            WHERE slug = $1 OR identifier = $1
            "#,
            id_or_slug
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| Team {
            id: r.id,
            name: r.name,
            slug: r.slug,
            identifier: r.identifier,
            icon: r.icon,
            color: r.color,
            document_storage_path: r.document_storage_path,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Get a team's workspace ID
    pub async fn workspace_id(pool: &PgPool, team_id: Uuid) -> Result<Option<Uuid>, TeamError> {
        sqlx::query_scalar::<_, Option<Uuid>>(
            r#"SELECT tenant_workspace_id FROM teams WHERE id = $1"#,
        )
        .bind(team_id)
        .fetch_optional(pool)
        .await
        .map(|opt| opt.flatten())
        .map_err(TeamError::from)
    }

    /// Get team members
    pub async fn get_members(pool: &PgPool, team_id: Uuid) -> Result<Vec<TeamMember>, TeamError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                tm.id            AS "id!: Uuid",
                tm.team_id       AS "team_id!: Uuid",
                tm.email         AS "email!",
                tm.display_name,
                tm.role          AS "role!",
                tm.invited_by,
                tm.clerk_user_id,
                tm.avatar_url,
                tm.joined_at     AS "joined_at!: DateTime<Utc>",
                tm.created_at    AS "created_at!: DateTime<Utc>",
                tm.updated_at    AS "updated_at!: DateTime<Utc>",
                COALESCE(
                    (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = tm.id)::integer,
                    0
                ) AS "assigned_task_count!: i32"
            FROM team_members tm
            WHERE tm.team_id = $1
            ORDER BY tm.display_name ASC NULLS LAST, tm.email ASC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| TeamMember {
                id: r.id,
                team_id: r.team_id,
                email: r.email,
                display_name: r.display_name,
                role: r.role,
                invited_by: r.invited_by,
                clerk_user_id: r.clerk_user_id,
                avatar_url: r.avatar_url,
                assigned_task_count: r.assigned_task_count,
                joined_at: r.joined_at,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Get project IDs for a team via the team_projects junction table
    pub async fn get_project_ids(pool: &PgPool, team_id: Uuid) -> Result<Vec<Uuid>, TeamError> {
        let rows = sqlx::query_scalar!(
            r#"
            SELECT project_id AS "project_id!: Uuid"
            FROM team_projects
            WHERE team_id = $1
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows)
    }

    /// Assign a project to a team (creates the team_projects relationship)
    pub async fn assign_project(
        pool: &PgPool,
        team_id: Uuid,
        project_id: Uuid,
    ) -> Result<TeamProject, TeamError> {
        let row = sqlx::query!(
            r#"
            INSERT INTO team_projects (team_id, project_id)
            VALUES ($1, $2)
            ON CONFLICT (team_id, project_id) DO UPDATE SET team_id = team_projects.team_id
            RETURNING
                team_id AS "team_id!: Uuid",
                project_id AS "project_id!: Uuid",
                created_at AS "created_at!: DateTime<Utc>"
            "#,
            team_id,
            project_id
        )
        .fetch_one(pool)
        .await?;

        Ok(TeamProject {
            team_id: row.team_id,
            project_id: row.project_id,
            created_at: row.created_at,
        })
    }

    /// Remove a project from a team
    pub async fn remove_project(
        pool: &PgPool,
        team_id: Uuid,
        project_id: Uuid,
    ) -> Result<bool, TeamError> {
        let result = sqlx::query!(
            r#"DELETE FROM team_projects WHERE team_id = $1 AND project_id = $2"#,
            team_id,
            project_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Get projects for a team (full project objects)
    pub async fn get_projects(
        pool: &PgPool,
        team_id: Uuid,
    ) -> Result<Vec<TeamProjectInfo>, TeamError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                p.id AS "id!: Uuid",
                p.name AS "name!",
                p.metadata AS "metadata!: serde_json::Value",
                p.created_at AS "created_at!: DateTime<Utc>"
            FROM projects p
            INNER JOIN team_projects tp ON p.id = tp.project_id
            WHERE tp.team_id = $1
            ORDER BY p.name ASC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| TeamProjectInfo {
                id: r.id,
                name: r.name,
                metadata: r.metadata,
                created_at: r.created_at,
            })
            .collect())
    }

    /// Get issues (tasks) for a team
    pub async fn get_issues(pool: &PgPool, team_id: Uuid) -> Result<Vec<TeamIssue>, TeamError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                t.id             AS "id!: Uuid",
                t.project_id     AS "project_id!: Uuid",
                t.title          AS "title!",
                t.description,
                t.status         AS "status!",
                t.priority,
                t.due_date,
                t.assignee_id,
                t.issue_number,
                t.created_at     AS "created_at!: DateTime<Utc>",
                t.updated_at     AS "updated_at!: DateTime<Utc>"
            FROM tasks t
            WHERE t.team_id = $1
            ORDER BY t.created_at DESC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| TeamIssue {
                id: r.id,
                project_id: Some(r.project_id),
                title: r.title,
                description: r.description,
                status: r.status,
                priority: r.priority,
                due_date: r.due_date,
                assignee_id: r.assignee_id,
                issue_number: r.issue_number,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Create a new issue (task) for a team
    pub async fn create_issue(
        pool: &PgPool,
        team_id: Uuid,
        project_id: Uuid,
        data: CreateTeamIssue,
    ) -> Result<TeamIssue, TeamError> {
        // Get next issue number for this team
        let next_number = sqlx::query_scalar!(
            r#"
            SELECT COALESCE(MAX(issue_number), 0) + 1 AS "next!"
            FROM tasks
            WHERE team_id = $1
            "#,
            team_id
        )
        .fetch_one(pool)
        .await?;

        let id = Uuid::new_v4();
        let status = data.status.unwrap_or_else(|| "todo".to_string());

        let row = sqlx::query!(
            r#"
            INSERT INTO tasks (id, team_id, project_id, title, description, status, priority, due_date, assignee_id, issue_number, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
            RETURNING
                id             AS "id!: Uuid",
                project_id     AS "project_id!: Uuid",
                title          AS "title!",
                description,
                status         AS "status!",
                priority,
                due_date,
                assignee_id,
                issue_number,
                created_at     AS "created_at!: DateTime<Utc>",
                updated_at     AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            team_id,
            project_id,
            data.title,
            data.description,
            status,
            data.priority,
            data.due_date,
            data.assignee_id,
            next_number
        )
        .fetch_one(pool)
        .await?;

        Ok(TeamIssue {
            id: row.id,
            project_id: Some(row.project_id),
            title: row.title,
            description: row.description,
            status: row.status,
            priority: row.priority,
            due_date: row.due_date,
            assignee_id: row.assignee_id,
            issue_number: row.issue_number,
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }

    /// Get team invitations
    pub async fn get_invitations(
        pool: &PgPool,
        team_id: Uuid,
    ) -> Result<Vec<TeamInvitation>, TeamError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id           AS "id!: Uuid",
                team_id      AS "team_id!: Uuid",
                email        AS "email!",
                role         AS "role!",
                status       AS "status!",
                invited_by,
                token,
                expires_at   AS "expires_at!: DateTime<Utc>",
                created_at   AS "created_at!: DateTime<Utc>"
            FROM team_invitations
            WHERE team_id = $1
            ORDER BY created_at DESC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| TeamInvitation {
                id: r.id,
                team_id: r.team_id,
                email: r.email,
                role: r.role,
                status: r.status,
                invited_by: r.invited_by,
                token: r.token,
                expires_at: r.expires_at,
                created_at: r.created_at,
            })
            .collect())
    }

    /// Create a new team invitation
    pub async fn create_invitation(
        pool: &PgPool,
        team_id: Uuid,
        email: &str,
        role: &str,
        invited_by: Option<Uuid>,
    ) -> Result<TeamInvitation, TeamError> {
        let id = Uuid::new_v4();
        let token = Uuid::new_v4().to_string();
        // Invitation expires in 7 days
        let expires_at = Utc::now() + chrono::Duration::days(7);

        let row = sqlx::query!(
            r#"
            INSERT INTO team_invitations (id, team_id, email, role, status, invited_by, token, expires_at)
            VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7)
            RETURNING
                id           AS "id!: Uuid",
                team_id      AS "team_id!: Uuid",
                email        AS "email!",
                role         AS "role!",
                status       AS "status!",
                invited_by,
                token,
                expires_at   AS "expires_at!: DateTime<Utc>",
                created_at   AS "created_at!: DateTime<Utc>"
            "#,
            id,
            team_id,
            email,
            role,
            invited_by,
            token,
            expires_at
        )
        .fetch_one(pool)
        .await?;

        Ok(TeamInvitation {
            id: row.id,
            team_id: row.team_id,
            email: row.email,
            role: row.role,
            status: row.status,
            invited_by: row.invited_by,
            token: row.token,
            expires_at: row.expires_at,
            created_at: row.created_at,
        })
    }

    /// Update an invitation's role
    pub async fn update_invitation_role(
        pool: &PgPool,
        team_id: Uuid,
        invitation_id: Uuid,
        role: &str,
    ) -> Result<Option<TeamInvitation>, TeamError> {
        let row = sqlx::query!(
            r#"
            UPDATE team_invitations
            SET role = $3
            WHERE team_id = $1 AND id = $2 AND status = 'pending'
            RETURNING
                id           AS "id!: Uuid",
                team_id      AS "team_id!: Uuid",
                email        AS "email!",
                role         AS "role!",
                status       AS "status!",
                invited_by,
                token,
                expires_at   AS "expires_at!: DateTime<Utc>",
                created_at   AS "created_at!: DateTime<Utc>"
            "#,
            team_id,
            invitation_id,
            role
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| TeamInvitation {
            id: r.id,
            team_id: r.team_id,
            email: r.email,
            role: r.role,
            status: r.status,
            invited_by: r.invited_by,
            token: r.token,
            expires_at: r.expires_at,
            created_at: r.created_at,
        }))
    }

    /// Cancel (delete) an invitation
    pub async fn cancel_invitation(
        pool: &PgPool,
        team_id: Uuid,
        invitation_id: Uuid,
    ) -> Result<bool, TeamError> {
        let result = sqlx::query!(
            r#"DELETE FROM team_invitations WHERE team_id = $1 AND id = $2"#,
            team_id,
            invitation_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Get team documents
    pub async fn get_documents(
        pool: &PgPool,
        team_id: Uuid,
    ) -> Result<Vec<TeamDocument>, TeamError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                team_id AS "team_id!: Uuid",
                folder_id AS "folder_id: Uuid",
                title AS "name!",
                slug,
                content,
                file_path AS "storage_path",
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM documents
            WHERE team_id = $1 AND is_archived = FALSE
            ORDER BY position ASC, updated_at DESC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| TeamDocument {
                id: r.id,
                team_id: r.team_id,
                folder_id: r.folder_id,
                name: r.name,
                slug: r.slug,
                content: r.content,
                storage_path: r.storage_path,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Get team folders
    pub async fn get_folders(pool: &PgPool, team_id: Uuid) -> Result<Vec<TeamFolder>, TeamError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                team_id AS "team_id!: Uuid",
                parent_id AS "parent_id: Uuid",
                name,
                local_path,
                created_at AS "created_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM document_folders
            WHERE team_id = $1
            ORDER BY position ASC, name ASC
            "#,
            team_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| TeamFolder {
                id: r.id,
                team_id: r.team_id,
                parent_id: r.parent_id,
                name: r.name,
                local_path: r.local_path,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Get a specific team member by ID
    pub async fn get_member(
        pool: &PgPool,
        team_id: Uuid,
        member_id: Uuid,
    ) -> Result<Option<TeamMember>, TeamError> {
        let row = sqlx::query!(
            r#"
            SELECT
                tm.id            AS "id!: Uuid",
                tm.team_id       AS "team_id!: Uuid",
                tm.email         AS "email!",
                tm.display_name,
                tm.role          AS "role!",
                tm.invited_by,
                tm.clerk_user_id,
                tm.avatar_url,
                tm.joined_at     AS "joined_at!: DateTime<Utc>",
                tm.created_at    AS "created_at!: DateTime<Utc>",
                tm.updated_at    AS "updated_at!: DateTime<Utc>",
                COALESCE(
                    (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = tm.id)::integer,
                    0
                ) AS "assigned_task_count!: i32"
            FROM team_members tm
            WHERE tm.team_id = $1 AND tm.id = $2
            "#,
            team_id,
            member_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| TeamMember {
            id: r.id,
            team_id: r.team_id,
            email: r.email,
            display_name: r.display_name,
            role: r.role,
            invited_by: r.invited_by,
            clerk_user_id: r.clerk_user_id,
            avatar_url: r.avatar_url,
            assigned_task_count: r.assigned_task_count,
            joined_at: r.joined_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }

    /// Remove a member from a team
    pub async fn remove_member(
        pool: &PgPool,
        team_id: Uuid,
        member_id: Uuid,
    ) -> Result<bool, TeamError> {
        let result = sqlx::query!(
            r#"DELETE FROM team_members WHERE team_id = $1 AND id = $2"#,
            team_id,
            member_id
        )
        .execute(pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    /// Update a team member's role
    pub async fn update_member_role(
        pool: &PgPool,
        team_id: Uuid,
        member_id: Uuid,
        role: &str,
    ) -> Result<Option<TeamMember>, TeamError> {
        let row = sqlx::query!(
            r#"
            UPDATE team_members
            SET role = $3, updated_at = NOW()
            WHERE team_id = $1 AND id = $2
            RETURNING
                id            AS "id!: Uuid",
                team_id       AS "team_id!: Uuid",
                email         AS "email!",
                display_name,
                role          AS "role!",
                invited_by,
                clerk_user_id,
                avatar_url,
                joined_at     AS "joined_at!: DateTime<Utc>",
                created_at    AS "created_at!: DateTime<Utc>",
                updated_at    AS "updated_at!: DateTime<Utc>"
            "#,
            team_id,
            member_id,
            role
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| TeamMember {
            id: r.id,
            team_id: r.team_id,
            email: r.email,
            display_name: r.display_name,
            role: r.role,
            invited_by: r.invited_by,
            clerk_user_id: r.clerk_user_id,
            avatar_url: r.avatar_url,
            assigned_task_count: 0, // Not fetched in update
            joined_at: r.joined_at,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamMember {
    pub id: Uuid,
    pub team_id: Uuid,
    pub email: String,
    pub display_name: Option<String>,
    pub role: String,
    pub invited_by: Option<Uuid>,
    pub clerk_user_id: Option<String>,
    pub avatar_url: Option<String>,
    pub assigned_task_count: i32,
    pub joined_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl TeamMember {
    /// Get the parsed TeamMemberRole
    pub fn role_enum(&self) -> TeamMemberRole {
        TeamMemberRole::parse(&self.role)
    }

    /// Check if member has at least the given permission level
    pub fn has_permission(&self, required: TeamMemberRole) -> bool {
        self.role_enum().has_permission(required)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamIssue {
    pub id: Uuid,
    pub project_id: Option<Uuid>,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub priority: Option<i32>,
    pub due_date: Option<DateTime<Utc>>,
    pub assignee_id: Option<Uuid>,
    pub issue_number: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Request payload for creating a new team issue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateTeamIssue {
    pub title: String,
    pub description: Option<String>,
    pub status: Option<String>,
    pub priority: Option<i32>,
    pub due_date: Option<DateTime<Utc>>,
    pub assignee_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamInvitation {
    pub id: Uuid,
    pub team_id: Uuid,
    pub email: String,
    pub role: String,
    pub status: String,
    pub invited_by: Option<Uuid>,
    pub token: Option<String>,
    pub expires_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamDocument {
    pub id: Uuid,
    pub team_id: Uuid,
    pub folder_id: Option<Uuid>,
    pub name: String,
    pub slug: Option<String>,
    pub content: Option<String>,
    pub storage_path: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamFolder {
    pub id: Uuid,
    pub team_id: Uuid,
    pub parent_id: Option<Uuid>,
    pub name: String,
    pub local_path: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TeamProjectInfo {
    pub id: Uuid,
    pub name: String,
    pub metadata: serde_json::Value,
    pub created_at: DateTime<Utc>,
}
