use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::Tx;

/// Project status options
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum ProjectStatus {
    #[default]
    Backlog,
    Planned,
    InProgress,
    Paused,
    Completed,
    Cancelled,
}

impl ProjectStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Backlog => "backlog",
            Self::Planned => "planned",
            Self::InProgress => "in_progress",
            Self::Paused => "paused",
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "backlog" => Self::Backlog,
            "planned" => Self::Planned,
            "in_progress" => Self::InProgress,
            "paused" => Self::Paused,
            "completed" => Self::Completed,
            "cancelled" => Self::Cancelled,
            _ => Self::Backlog,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    pub metadata: Value,
    /// Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low
    pub priority: Option<i32>,
    pub lead_id: Option<Uuid>,
    pub start_date: Option<DateTime<Utc>>,
    pub target_date: Option<DateTime<Utc>>,
    pub status: ProjectStatus,
    /// Health percentage 0-100
    pub health: Option<i32>,
    pub description: Option<String>,
    pub summary: Option<String>,
    pub icon: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectData {
    pub organization_id: Uuid,
    pub name: String,
    #[serde(default)]
    pub metadata: Value,
    #[serde(default)]
    pub priority: Option<i32>,
    #[serde(default)]
    pub lead_id: Option<Uuid>,
    #[serde(default)]
    pub start_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub target_date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub health: Option<i32>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateProjectData {
    pub name: Option<String>,
    pub metadata: Option<Value>,
    pub priority: Option<i32>,
    pub lead_id: Option<Uuid>,
    pub start_date: Option<DateTime<Utc>>,
    pub target_date: Option<DateTime<Utc>>,
    pub status: Option<String>,
    pub health: Option<i32>,
    pub description: Option<String>,
    pub summary: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error("project conflict: {0}")]
    Conflict(String),
    #[error("invalid project metadata")]
    InvalidMetadata,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct ProjectRepository;

/// Helper to map query row to Project
#[allow(clippy::too_many_arguments)]
fn map_row_to_project(
    id: Uuid,
    organization_id: Uuid,
    name: String,
    metadata: Value,
    priority: Option<i32>,
    lead_id: Option<Uuid>,
    start_date: Option<DateTime<Utc>>,
    target_date: Option<DateTime<Utc>>,
    status: Option<String>,
    health: Option<i32>,
    description: Option<String>,
    summary: Option<String>,
    icon: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
) -> Project {
    Project {
        id,
        organization_id,
        name,
        metadata,
        priority,
        lead_id,
        start_date,
        target_date,
        status: ProjectStatus::parse(status.as_deref().unwrap_or("backlog")),
        health,
        description,
        summary,
        icon,
        created_at,
        updated_at,
    }
}

impl ProjectRepository {
    pub async fn find_by_id(tx: &mut Tx<'_>, id: Uuid) -> Result<Option<Project>, ProjectError> {
        let record = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                COALESCE(tenant_workspace_id, organization_id) AS "organization_id!: Uuid",
                name             AS "name!",
                metadata         AS "metadata!: Value",
                priority         AS "priority: i32",
                lead_id          AS "lead_id: Uuid",
                start_date       AS "start_date: DateTime<Utc>",
                target_date      AS "target_date: DateTime<Utc>",
                status::TEXT     AS "status",
                health           AS "health: i32",
                description,
                summary,
                icon,
                created_at       AS "created_at!: DateTime<Utc>",
                COALESCE(updated_at, created_at) AS "updated_at!: DateTime<Utc>"
            FROM projects
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(&mut **tx)
        .await?;

        Ok(record.map(|r| {
            map_row_to_project(
                r.id,
                r.organization_id,
                r.name,
                r.metadata,
                r.priority,
                r.lead_id,
                r.start_date,
                r.target_date,
                r.status,
                r.health,
                r.description,
                r.summary,
                r.icon,
                r.created_at,
                r.updated_at,
            )
        }))
    }

    pub async fn insert(tx: &mut Tx<'_>, data: CreateProjectData) -> Result<Project, ProjectError> {
        let metadata = if data.metadata.is_null() {
            Value::Object(serde_json::Map::new())
        } else if !data.metadata.is_object() {
            return Err(ProjectError::InvalidMetadata);
        } else {
            data.metadata
        };

        let status_str = data.status.as_deref().unwrap_or("backlog");

        // Use subquery to avoid enum type mapping issues
        let record = sqlx::query!(
            r#"
            INSERT INTO projects (
                tenant_workspace_id, name, metadata, priority, lead_id,
                start_date, target_date, status, health, description, summary, icon
            )
            SELECT $1, $2, $3, $4, $5, $6, $7, t.s::project_status, $9, $10, $11, $12
            FROM (SELECT $8::TEXT AS s) t
            RETURNING
                id               AS "id!: Uuid",
                tenant_workspace_id AS "organization_id!: Uuid",
                name             AS "name!",
                metadata         AS "metadata!: Value",
                priority         AS "priority: i32",
                lead_id          AS "lead_id: Uuid",
                start_date       AS "start_date: DateTime<Utc>",
                target_date      AS "target_date: DateTime<Utc>",
                status::TEXT     AS "status",
                health           AS "health: i32",
                description,
                summary,
                icon,
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            "#,
            data.organization_id,
            data.name,
            metadata as _,
            data.priority,
            data.lead_id,
            data.start_date,
            data.target_date,
            status_str,
            data.health,
            data.description,
            data.summary,
            data.icon
        )
        .fetch_one(&mut **tx)
        .await
        .map_err(ProjectError::from)?;

        Ok(map_row_to_project(
            record.id,
            record.organization_id,
            record.name,
            record.metadata,
            record.priority,
            record.lead_id,
            record.start_date,
            record.target_date,
            record.status,
            record.health,
            record.description,
            record.summary,
            record.icon,
            record.created_at,
            record.updated_at,
        ))
    }

    pub async fn list_by_organization(
        pool: &PgPool,
        organization_id: Uuid,
    ) -> Result<Vec<Project>, ProjectError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                COALESCE(tenant_workspace_id, organization_id) AS "organization_id!: Uuid",
                name             AS "name!",
                metadata         AS "metadata!: Value",
                priority         AS "priority: i32",
                lead_id          AS "lead_id: Uuid",
                start_date       AS "start_date: DateTime<Utc>",
                target_date      AS "target_date: DateTime<Utc>",
                status::TEXT     AS "status",
                health           AS "health: i32",
                description,
                summary,
                icon,
                created_at       AS "created_at!: DateTime<Utc>",
                COALESCE(updated_at, created_at) AS "updated_at!: DateTime<Utc>"
            FROM projects
            WHERE tenant_workspace_id = $1 OR organization_id = $1
            ORDER BY created_at DESC
            "#,
            organization_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| {
                map_row_to_project(
                    r.id,
                    r.organization_id,
                    r.name,
                    r.metadata,
                    r.priority,
                    r.lead_id,
                    r.start_date,
                    r.target_date,
                    r.status,
                    r.health,
                    r.description,
                    r.summary,
                    r.icon,
                    r.created_at,
                    r.updated_at,
                )
            })
            .collect())
    }

    pub async fn fetch_by_id(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Option<Project>, ProjectError> {
        let record = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                COALESCE(tenant_workspace_id, organization_id) AS "organization_id!: Uuid",
                name             AS "name!",
                metadata         AS "metadata!: Value",
                priority         AS "priority: i32",
                lead_id          AS "lead_id: Uuid",
                start_date       AS "start_date: DateTime<Utc>",
                target_date      AS "target_date: DateTime<Utc>",
                status::TEXT     AS "status",
                health           AS "health: i32",
                description,
                summary,
                icon,
                created_at       AS "created_at!: DateTime<Utc>",
                COALESCE(updated_at, created_at) AS "updated_at!: DateTime<Utc>"
            FROM projects
            WHERE id = $1
            "#,
            project_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(record.map(|r| {
            map_row_to_project(
                r.id,
                r.organization_id,
                r.name,
                r.metadata,
                r.priority,
                r.lead_id,
                r.start_date,
                r.target_date,
                r.status,
                r.health,
                r.description,
                r.summary,
                r.icon,
                r.created_at,
                r.updated_at,
            )
        }))
    }

    pub async fn organization_id(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Option<Uuid>, ProjectError> {
        sqlx::query_scalar::<_, Uuid>(
            r#"SELECT COALESCE(tenant_workspace_id, organization_id) FROM projects WHERE id = $1"#,
        )
        .bind(project_id)
        .fetch_optional(pool)
        .await
        .map_err(ProjectError::from)
    }

    /// Batch fetch multiple projects by their IDs (avoids N+1 queries)
    pub async fn fetch_by_ids(
        pool: &PgPool,
        project_ids: &[Uuid],
    ) -> Result<Vec<Project>, ProjectError> {
        if project_ids.is_empty() {
            return Ok(Vec::new());
        }

        let rows = sqlx::query!(
            r#"
            SELECT
                id               AS "id!: Uuid",
                COALESCE(tenant_workspace_id, organization_id) AS "organization_id!: Uuid",
                name             AS "name!",
                metadata         AS "metadata!: Value",
                priority         AS "priority: i32",
                lead_id          AS "lead_id: Uuid",
                start_date       AS "start_date: DateTime<Utc>",
                target_date      AS "target_date: DateTime<Utc>",
                status::TEXT     AS "status",
                health           AS "health: i32",
                description,
                summary,
                icon,
                created_at       AS "created_at!: DateTime<Utc>",
                COALESCE(updated_at, created_at) AS "updated_at!: DateTime<Utc>"
            FROM projects
            WHERE id = ANY($1)
            ORDER BY created_at DESC
            "#,
            project_ids
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| {
                map_row_to_project(
                    r.id,
                    r.organization_id,
                    r.name,
                    r.metadata,
                    r.priority,
                    r.lead_id,
                    r.start_date,
                    r.target_date,
                    r.status,
                    r.health,
                    r.description,
                    r.summary,
                    r.icon,
                    r.created_at,
                    r.updated_at,
                )
            })
            .collect())
    }

    /// Update a project
    pub async fn update(
        pool: &PgPool,
        project_id: Uuid,
        data: &UpdateProjectData,
    ) -> Result<Option<Project>, ProjectError> {
        let existing = Self::fetch_by_id(pool, project_id).await?;
        let Some(existing) = existing else {
            return Ok(None);
        };

        let name = data.name.as_ref().unwrap_or(&existing.name);
        let metadata = data.metadata.as_ref().unwrap_or(&existing.metadata);
        let priority = data.priority.or(existing.priority);
        let lead_id = data.lead_id.or(existing.lead_id);
        let start_date = data.start_date.or(existing.start_date);
        let target_date = data.target_date.or(existing.target_date);
        let status_str = data.status.as_deref().unwrap_or(existing.status.as_str());
        let health = data.health.or(existing.health);
        let description = data.description.as_ref().or(existing.description.as_ref());
        let summary = data.summary.as_ref().or(existing.summary.as_ref());
        let icon = data.icon.as_ref().or(existing.icon.as_ref());

        // Use subquery to avoid enum type mapping issues
        let record = sqlx::query!(
            r#"
            UPDATE projects SET
                name = $2, metadata = $3, priority = $4, lead_id = $5,
                start_date = $6, target_date = $7,
                status = (SELECT $8::TEXT::project_status),
                health = $9, description = $10, summary = $11, icon = $12,
                updated_at = NOW()
            WHERE id = $1
            RETURNING
                id               AS "id!: Uuid",
                COALESCE(tenant_workspace_id, organization_id) AS "organization_id!: Uuid",
                name             AS "name!",
                metadata         AS "metadata!: Value",
                priority         AS "priority: i32",
                lead_id          AS "lead_id: Uuid",
                start_date       AS "start_date: DateTime<Utc>",
                target_date      AS "target_date: DateTime<Utc>",
                status::TEXT     AS "status",
                health           AS "health: i32",
                description,
                summary,
                icon,
                created_at       AS "created_at!: DateTime<Utc>",
                updated_at       AS "updated_at!: DateTime<Utc>"
            "#,
            project_id,
            name,
            metadata as _,
            priority,
            lead_id,
            start_date,
            target_date,
            status_str,
            health,
            description,
            summary,
            icon
        )
        .fetch_one(pool)
        .await?;

        Ok(Some(map_row_to_project(
            record.id,
            record.organization_id,
            record.name,
            record.metadata,
            record.priority,
            record.lead_id,
            record.start_date,
            record.target_date,
            record.status,
            record.health,
            record.description,
            record.summary,
            record.icon,
            record.created_at,
            record.updated_at,
        )))
    }
}
