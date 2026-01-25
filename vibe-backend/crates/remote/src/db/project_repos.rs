//! Project repos database operations for remote crate

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

use super::repos::Repo;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRepo {
    pub id: Uuid,
    pub project_id: Uuid,
    pub repo_id: Uuid,
    pub setup_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
    pub parallel_setup_script: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateProjectRepo {
    pub display_name: String,
    pub git_repo_path: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateProjectRepo {
    pub setup_script: Option<String>,
    pub cleanup_script: Option<String>,
    pub copy_files: Option<String>,
    pub parallel_setup_script: Option<bool>,
}

#[derive(Debug, Error)]
pub enum ProjectRepoError {
    #[error("project repo not found")]
    NotFound,
    #[error("repo already linked to project")]
    AlreadyLinked,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct ProjectRepoRepository;

impl ProjectRepoRepository {
    /// List all repos for a project
    pub async fn list_by_project(
        pool: &PgPool,
        project_id: Uuid,
    ) -> Result<Vec<Repo>, ProjectRepoError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                r.id AS "id!: Uuid",
                r.path AS "path!",
                r.name AS "name!",
                r.display_name AS "display_name!",
                r.created_at AS "created_at!: DateTime<Utc>",
                r.updated_at AS "updated_at!: DateTime<Utc>"
            FROM repos r
            INNER JOIN project_repos pr ON pr.repo_id = r.id
            WHERE pr.project_id = $1
            ORDER BY r.display_name ASC
            "#,
            project_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| Repo {
                id: r.id,
                path: r.path,
                name: r.name,
                display_name: r.display_name,
                created_at: r.created_at,
                updated_at: r.updated_at,
            })
            .collect())
    }

    /// Get a project repo link
    pub async fn get(
        pool: &PgPool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<Option<ProjectRepo>, ProjectRepoError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                repo_id AS "repo_id!: Uuid",
                setup_script,
                cleanup_script,
                copy_files,
                parallel_setup_script AS "parallel_setup_script!"
            FROM project_repos
            WHERE project_id = $1 AND repo_id = $2
            "#,
            project_id,
            repo_id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| ProjectRepo {
            id: r.id,
            project_id: r.project_id,
            repo_id: r.repo_id,
            setup_script: r.setup_script,
            cleanup_script: r.cleanup_script,
            copy_files: r.copy_files,
            parallel_setup_script: r.parallel_setup_script,
        }))
    }

    /// Link a repo to a project
    pub async fn link(
        pool: &PgPool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<ProjectRepo, ProjectRepoError> {
        let row = sqlx::query!(
            r#"
            INSERT INTO project_repos (project_id, repo_id)
            VALUES ($1, $2)
            RETURNING
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                repo_id AS "repo_id!: Uuid",
                setup_script,
                cleanup_script,
                copy_files,
                parallel_setup_script AS "parallel_setup_script!"
            "#,
            project_id,
            repo_id
        )
        .fetch_one(pool)
        .await
        .map_err(|e| {
            if let sqlx::Error::Database(ref db_err) = e
                && db_err.constraint() == Some("project_repos_project_id_repo_id_key")
            {
                return ProjectRepoError::AlreadyLinked;
            }
            ProjectRepoError::Database(e)
        })?;

        Ok(ProjectRepo {
            id: row.id,
            project_id: row.project_id,
            repo_id: row.repo_id,
            setup_script: row.setup_script,
            cleanup_script: row.cleanup_script,
            copy_files: row.copy_files,
            parallel_setup_script: row.parallel_setup_script,
        })
    }

    /// Update a project repo link
    pub async fn update(
        pool: &PgPool,
        project_id: Uuid,
        repo_id: Uuid,
        payload: &UpdateProjectRepo,
    ) -> Result<ProjectRepo, ProjectRepoError> {
        let existing = Self::get(pool, project_id, repo_id)
            .await?
            .ok_or(ProjectRepoError::NotFound)?;

        let setup_script = payload
            .setup_script
            .as_ref()
            .or(existing.setup_script.as_ref());
        let cleanup_script = payload
            .cleanup_script
            .as_ref()
            .or(existing.cleanup_script.as_ref());
        let copy_files = payload.copy_files.as_ref().or(existing.copy_files.as_ref());
        let parallel_setup_script = payload
            .parallel_setup_script
            .unwrap_or(existing.parallel_setup_script);

        let row = sqlx::query!(
            r#"
            UPDATE project_repos
            SET setup_script = $3, cleanup_script = $4, copy_files = $5, parallel_setup_script = $6
            WHERE project_id = $1 AND repo_id = $2
            RETURNING
                id AS "id!: Uuid",
                project_id AS "project_id!: Uuid",
                repo_id AS "repo_id!: Uuid",
                setup_script,
                cleanup_script,
                copy_files,
                parallel_setup_script AS "parallel_setup_script!"
            "#,
            project_id,
            repo_id,
            setup_script,
            cleanup_script,
            copy_files,
            parallel_setup_script
        )
        .fetch_one(pool)
        .await?;

        Ok(ProjectRepo {
            id: row.id,
            project_id: row.project_id,
            repo_id: row.repo_id,
            setup_script: row.setup_script,
            cleanup_script: row.cleanup_script,
            copy_files: row.copy_files,
            parallel_setup_script: row.parallel_setup_script,
        })
    }

    /// Unlink a repo from a project
    pub async fn unlink(
        pool: &PgPool,
        project_id: Uuid,
        repo_id: Uuid,
    ) -> Result<u64, ProjectRepoError> {
        let result = sqlx::query!(
            "DELETE FROM project_repos WHERE project_id = $1 AND repo_id = $2",
            project_id,
            repo_id
        )
        .execute(pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(ProjectRepoError::NotFound);
        }

        Ok(result.rows_affected())
    }
}
