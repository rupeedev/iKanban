use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

use super::{
    identity_errors::IdentityError,
    projects::{ProjectError, ProjectRepository},
    users::{UserData, fetch_user},
};

pub const MAX_SHARED_TASK_TEXT_BYTES: usize = 50 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, sqlx::Type, TS)]
#[serde(rename_all = "kebab-case")]
#[sqlx(type_name = "task_status", rename_all = "kebab-case")]
#[ts(export)]
pub enum TaskStatus {
    Todo,
    InProgress,
    InReview,
    Done,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SharedTaskWithUser {
    pub task: SharedTask,
    pub user: Option<UserData>,
}

impl SharedTaskWithUser {
    pub fn new(task: SharedTask, user: Option<UserData>) -> Self {
        Self { task, user }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct SharedTask {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub project_id: Uuid,
    pub creator_user_id: Option<Uuid>,
    pub assignee_user_id: Option<Uuid>,
    pub deleted_by_user_id: Option<Uuid>,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub priority: Option<i32>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub shared_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSharedTaskData {
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub creator_user_id: Uuid,
    pub assignee_user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateSharedTaskData {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub priority: Option<i32>,
    pub acting_user_id: Uuid,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AssignTaskData {
    pub new_assignee_user_id: Option<Uuid>,
    pub previous_assignee_user_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteTaskData {
    pub acting_user_id: Uuid,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MoveTaskData {
    pub new_project_id: Uuid,
    pub acting_user_id: Uuid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskMetadata {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub description: Option<String>,
}

#[derive(Debug, Error)]
pub enum SharedTaskError {
    #[error("shared task not found")]
    NotFound,
    #[error("operation forbidden")]
    Forbidden,
    #[error("shared task conflict: {0}")]
    Conflict(String),
    #[error("shared task title and description are too large")]
    PayloadTooLarge,
    #[error(transparent)]
    Project(#[from] ProjectError),
    #[error(transparent)]
    Identity(#[from] IdentityError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error(transparent)]
    Serialization(#[from] serde_json::Error),
}

pub struct SharedTaskRepository<'a> {
    pool: &'a PgPool,
}

impl<'a> SharedTaskRepository<'a> {
    pub fn new(pool: &'a PgPool) -> Self {
        Self { pool }
    }

    pub async fn find_by_id(&self, task_id: Uuid) -> Result<Option<SharedTask>, SharedTaskError> {
        let task = sqlx::query_as!(
            SharedTask,
            r#"
            SELECT
                id                  AS "id!",
                organization_id     AS "organization_id!: Uuid",
                project_id          AS "project_id!",
                creator_user_id     AS "creator_user_id?: Uuid",
                assignee_user_id    AS "assignee_user_id?: Uuid",
                deleted_by_user_id  AS "deleted_by_user_id?: Uuid",
                title               AS "title!",
                description         AS "description?",
                status              AS "status!: TaskStatus",
                priority            AS "priority?",
                deleted_at          AS "deleted_at?",
                shared_at           AS "shared_at?",
                created_at          AS "created_at!",
                updated_at          AS "updated_at!"
            FROM shared_tasks
            WHERE id = $1
              AND deleted_at IS NULL
            "#,
            task_id
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(task)
    }

    pub async fn find_any_task_by_id(
        &self,
        task_id: Uuid,
    ) -> Result<Option<TaskMetadata>, SharedTaskError> {
        // 1. Try shared_tasks first
        let shared = sqlx::query!(
            r#"
            SELECT id, project_id, title, description
            FROM shared_tasks
            WHERE id = $1 AND deleted_at IS NULL
            "#,
            task_id
        )
        .fetch_optional(self.pool)
        .await?;

        if let Some(s) = shared {
            return Ok(Some(TaskMetadata {
                id: s.id,
                project_id: s.project_id,
                title: s.title,
                description: s.description,
            }));
        }

        // 2. Fallback to tasks table
        let internal = sqlx::query!(
            r#"
            SELECT id, project_id, title, description
            FROM tasks
            WHERE id = $1
            "#,
            task_id
        )
        .fetch_optional(self.pool)
        .await?;

        Ok(internal.map(|i| TaskMetadata {
            id: i.id,
            project_id: i.project_id,
            title: i.title,
            description: i.description,
        }))
    }

    pub async fn create(
        &self,
        data: CreateSharedTaskData,
    ) -> Result<SharedTaskWithUser, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        let CreateSharedTaskData {
            project_id,
            title,
            description,
            creator_user_id,
            assignee_user_id,
        } = data;

        ensure_text_size(&title, description.as_deref())?;

        let project = ProjectRepository::find_by_id(&mut tx, project_id)
            .await?
            .ok_or_else(|| {
                tracing::warn!(%project_id, "remote project not found when creating shared task");
                SharedTaskError::NotFound
            })?;

        let organization_id = project.organization_id;

        let task = sqlx::query_as!(
            SharedTask,
            r#"
            INSERT INTO shared_tasks (
                organization_id,
                project_id,
                creator_user_id,
                assignee_user_id,
                title,
                description,
                shared_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id                 AS "id!",
                      organization_id    AS "organization_id!: Uuid",
                      project_id         AS "project_id!",
                      creator_user_id    AS "creator_user_id?: Uuid",
                      assignee_user_id   AS "assignee_user_id?: Uuid",
                      deleted_by_user_id AS "deleted_by_user_id?: Uuid",
                      title              AS "title!",
                      description        AS "description?",
                      status             AS "status!: TaskStatus",
                      priority           AS "priority?",
                      deleted_at         AS "deleted_at?",
                      shared_at          AS "shared_at?",
                      created_at         AS "created_at!",
                      updated_at         AS "updated_at!"
            "#,
            organization_id,
            project_id,
            creator_user_id,
            assignee_user_id,
            title,
            description
        )
        .fetch_one(&mut *tx)
        .await?;

        let user = match assignee_user_id {
            Some(user_id) => fetch_user(&mut tx, user_id).await?,
            None => None,
        };

        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, user))
    }

    pub async fn update(
        &self,
        task_id: Uuid,
        data: UpdateSharedTaskData,
    ) -> Result<SharedTaskWithUser, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        let task = sqlx::query_as!(
            SharedTask,
            r#"
        UPDATE shared_tasks AS t
        SET title       = COALESCE($2, t.title),
            description = COALESCE($3, t.description),
            status      = COALESCE($4, t.status),
            priority    = COALESCE($5, t.priority),
            updated_at  = NOW()
        WHERE t.id = $1
          AND t.deleted_at IS NULL
        RETURNING
            t.id                AS "id!",
            t.organization_id   AS "organization_id!: Uuid",
            t.project_id        AS "project_id!",
            t.creator_user_id   AS "creator_user_id?: Uuid",
            t.assignee_user_id  AS "assignee_user_id?: Uuid",
            t.deleted_by_user_id AS "deleted_by_user_id?: Uuid",
            t.title             AS "title!",
            t.description       AS "description?",
            t.status            AS "status!: TaskStatus",
            t.priority          AS "priority?",
            t.deleted_at        AS "deleted_at?",
            t.shared_at         AS "shared_at?",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            data.title,
            data.description,
            data.status as Option<TaskStatus>,
            data.priority,
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| SharedTaskError::NotFound)?;

        ensure_text_size(&task.title, task.description.as_deref())?;

        let user = match task.assignee_user_id {
            Some(user_id) => fetch_user(&mut tx, user_id).await?,
            None => None,
        };

        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, user))
    }

    pub async fn assign_task(
        &self,
        task_id: Uuid,
        data: AssignTaskData,
    ) -> Result<SharedTaskWithUser, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        let task = sqlx::query_as!(
            SharedTask,
            r#"
        UPDATE shared_tasks AS t
        SET assignee_user_id = $2
        WHERE t.id = $1
          AND ($3::uuid IS NULL OR t.assignee_user_id = $3::uuid)
          AND t.deleted_at IS NULL
        RETURNING
            t.id                AS "id!",
            t.organization_id   AS "organization_id!: Uuid",
            t.project_id        AS "project_id!",
            t.creator_user_id   AS "creator_user_id?: Uuid",
            t.assignee_user_id  AS "assignee_user_id?: Uuid",
            t.deleted_by_user_id AS "deleted_by_user_id?: Uuid",
            t.title             AS "title!",
            t.description       AS "description?",
            t.status            AS "status!: TaskStatus",
            t.priority          AS "priority?",
            t.deleted_at        AS "deleted_at?",
            t.shared_at         AS "shared_at?",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            data.new_assignee_user_id,
            data.previous_assignee_user_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| SharedTaskError::NotFound)?;

        let user = match data.new_assignee_user_id {
            Some(user_id) => fetch_user(&mut tx, user_id).await?,
            None => None,
        };

        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, user))
    }

    pub async fn delete_task(
        &self,
        task_id: Uuid,
        data: DeleteTaskData,
    ) -> Result<SharedTaskWithUser, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        let task = sqlx::query_as!(
            SharedTask,
            r#"
        UPDATE shared_tasks AS t
        SET deleted_at = NOW(),
            deleted_by_user_id = $2
        WHERE t.id = $1
          AND t.deleted_at IS NULL
        RETURNING
            t.id                AS "id!",
            t.organization_id   AS "organization_id!: Uuid",
            t.project_id        AS "project_id!",
            t.creator_user_id   AS "creator_user_id?: Uuid",
            t.assignee_user_id  AS "assignee_user_id?: Uuid",
            t.deleted_by_user_id AS "deleted_by_user_id?: Uuid",
            t.title             AS "title!",
            t.description       AS "description?",
            t.status            AS "status!: TaskStatus",
            t.priority          AS "priority?",
            t.deleted_at        AS "deleted_at?",
            t.shared_at         AS "shared_at?",
            t.created_at        AS "created_at!",
            t.updated_at        AS "updated_at!"
        "#,
            task_id,
            data.acting_user_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| SharedTaskError::NotFound)?;

        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, None))
    }

    pub async fn move_task(
        &self,
        task_id: Uuid,
        data: MoveTaskData,
    ) -> Result<SharedTaskWithUser, SharedTaskError> {
        let mut tx = self.pool.begin().await.map_err(SharedTaskError::from)?;

        // Verify the new project exists and belongs to the same organization as the task
        let project = ProjectRepository::find_by_id(&mut tx, data.new_project_id)
            .await
            .map_err(|_| SharedTaskError::Forbidden)?
            .ok_or(SharedTaskError::Forbidden)?;

        // Get the current task to verify organization match
        let current_task = sqlx::query_as!(
            SharedTask,
            r#"
            SELECT
                id                AS "id!",
                organization_id   AS "organization_id!: Uuid",
                project_id        AS "project_id!",
                creator_user_id   AS "creator_user_id?: Uuid",
                assignee_user_id  AS "assignee_user_id?: Uuid",
                deleted_by_user_id AS "deleted_by_user_id?: Uuid",
                title             AS "title!",
                description       AS "description?",
                status            AS "status!: TaskStatus",
                priority          AS "priority?",
                deleted_at        AS "deleted_at?",
                shared_at         AS "shared_at?",
                created_at        AS "created_at!",
                updated_at        AS "updated_at!"
            FROM shared_tasks
            WHERE id = $1 AND deleted_at IS NULL
            "#,
            task_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| SharedTaskError::NotFound)?;

        // Verify both belong to same organization
        if current_task.organization_id != project.organization_id {
            return Err(SharedTaskError::Forbidden);
        }

        // Update the task's project_id
        let task = sqlx::query_as!(
            SharedTask,
            r#"
            UPDATE shared_tasks AS t
            SET project_id = $2,
                updated_at = NOW()
            WHERE t.id = $1
              AND t.deleted_at IS NULL
            RETURNING
                t.id                AS "id!",
                t.organization_id   AS "organization_id!: Uuid",
                t.project_id        AS "project_id!",
                t.creator_user_id   AS "creator_user_id?: Uuid",
                t.assignee_user_id  AS "assignee_user_id?: Uuid",
                t.deleted_by_user_id AS "deleted_by_user_id?: Uuid",
                t.title             AS "title!",
                t.description       AS "description?",
                t.status            AS "status!: TaskStatus",
                t.priority          AS "priority?",
                t.deleted_at        AS "deleted_at?",
                t.shared_at         AS "shared_at?",
                t.created_at        AS "created_at!",
                t.updated_at        AS "updated_at!"
            "#,
            task_id,
            data.new_project_id
        )
        .fetch_optional(&mut *tx)
        .await?
        .ok_or_else(|| SharedTaskError::NotFound)?;

        let user = match task.assignee_user_id {
            Some(user_id) => fetch_user(&mut tx, user_id).await?,
            None => None,
        };

        tx.commit().await.map_err(SharedTaskError::from)?;
        Ok(SharedTaskWithUser::new(task, user))
    }

    pub async fn check_existence(
        &self,
        task_ids: &[Uuid],
        user_id: Uuid,
    ) -> Result<Vec<Uuid>, SharedTaskError> {
        // Check membership using email as the common key between users table and tenant_workspace_members
        // tenant_workspace_members stores Clerk IDs, but we receive database UUIDs from auth
        let tasks = sqlx::query!(
            r#"
            SELECT t.id
            FROM shared_tasks t
            WHERE t.id = ANY($1)
              AND t.deleted_at IS NULL
              AND (
                EXISTS (
                    SELECT 1 FROM tenant_workspace_members twm
                    JOIN users u ON twm.email = u.email
                    WHERE twm.tenant_workspace_id = t.organization_id
                      AND u.id = $2
                )
                OR EXISTS (
                    SELECT 1 FROM organization_member_metadata om
                    WHERE om.organization_id = t.organization_id
                      AND om.user_id = $2
                )
              )
            "#,
            task_ids,
            user_id
        )
        .fetch_all(self.pool)
        .await?;

        Ok(tasks.into_iter().map(|r| r.id).collect())
    }
}

pub(crate) fn ensure_text_size(
    title: &str,
    description: Option<&str>,
) -> Result<(), SharedTaskError> {
    let total = title.len() + description.map(|value| value.len()).unwrap_or(0);

    if total > MAX_SHARED_TASK_TEXT_BYTES {
        return Err(SharedTaskError::PayloadTooLarge);
    }

    Ok(())
}

impl SharedTaskRepository<'_> {
    pub async fn organization_id(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Option<Uuid>, sqlx::Error> {
        sqlx::query_scalar!(
            r#"
            SELECT organization_id
            FROM shared_tasks
            WHERE id = $1
            "#,
            task_id
        )
        .fetch_optional(pool)
        .await
    }

    /// Get organization_id for a task from the `tasks` table via team relationship.
    /// This is used as a fallback when the task is not in `shared_tasks`.
    /// Path: tasks.team_id -> teams.tenant_workspace_id
    pub async fn organization_id_from_tasks_table(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Option<Uuid>, sqlx::Error> {
        sqlx::query_scalar!(
            r#"
            SELECT t2.tenant_workspace_id
            FROM tasks t
            JOIN teams t2 ON t.team_id = t2.id
            WHERE t.id = $1
              AND t2.tenant_workspace_id IS NOT NULL
            "#,
            task_id
        )
        .fetch_optional(pool)
        .await
        .map(|opt| opt.flatten())
    }

    /// Get team_id for a task from the `tasks` table.
    pub async fn get_team_id(
        pool: &PgPool,
        task_id: Uuid,
    ) -> Result<Option<Uuid>, sqlx::Error> {
        sqlx::query_scalar!(
            r#"
            SELECT team_id
            FROM tasks
            WHERE id = $1
            "#,
            task_id
        )
        .fetch_optional(pool)
        .await
        .map(|opt| opt.flatten())
    }
}
