//! GitLab connections database operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabConnection {
    pub id: Uuid,
    pub team_id: Option<Uuid>,
    pub access_token: String,
    pub gitlab_username: Option<String>,
    pub gitlab_url: String,
    pub connected_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabRepository {
    pub id: Uuid,
    pub connection_id: Uuid,
    pub repo_full_name: String,
    pub repo_name: String,
    pub repo_namespace: String,
    pub repo_url: String,
    pub default_branch: Option<String>,
    pub is_private: bool,
    pub linked_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabConnectionWithRepos {
    pub connection: GitLabConnection,
    pub repositories: Vec<GitLabRepository>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateGitLabConnection {
    pub access_token: String,
    pub gitlab_username: Option<String>,
    pub gitlab_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateGitLabConnection {
    pub access_token: Option<String>,
    pub gitlab_username: Option<String>,
    pub gitlab_url: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LinkGitLabRepository {
    pub repo_full_name: String,
    pub repo_name: String,
    pub repo_namespace: String,
    pub repo_url: String,
    pub default_branch: Option<String>,
    pub is_private: bool,
}

#[derive(Debug, Error)]
pub enum GitLabConnectionError {
    #[error("connection not found")]
    NotFound,
    #[error("connection already exists")]
    AlreadyExists,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct GitLabConnectionRepository;

impl GitLabConnectionRepository {
    /// Find workspace-level connection (team_id IS NULL)
    pub async fn find_workspace_connection(
        pool: &PgPool,
    ) -> Result<Option<GitLabConnection>, GitLabConnectionError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                team_id AS "team_id: Uuid",
                access_token AS "access_token!",
                gitlab_username,
                gitlab_url AS "gitlab_url!",
                connected_at AS "connected_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM gitlab_connections
            WHERE team_id IS NULL
            "#
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| GitLabConnection {
            id: r.id,
            team_id: r.team_id,
            access_token: r.access_token,
            gitlab_username: r.gitlab_username,
            gitlab_url: r.gitlab_url,
            connected_at: r.connected_at,
            updated_at: r.updated_at,
        }))
    }

    /// Create workspace-level connection
    pub async fn create_workspace_connection(
        pool: &PgPool,
        payload: &CreateGitLabConnection,
    ) -> Result<GitLabConnection, GitLabConnectionError> {
        let gitlab_url = payload
            .gitlab_url
            .as_deref()
            .unwrap_or("https://gitlab.com");

        let row = sqlx::query!(
            r#"
            INSERT INTO gitlab_connections (team_id, access_token, gitlab_username, gitlab_url)
            VALUES (NULL, $1, $2, $3)
            RETURNING
                id AS "id!: Uuid",
                team_id AS "team_id: Uuid",
                access_token AS "access_token!",
                gitlab_username,
                gitlab_url AS "gitlab_url!",
                connected_at AS "connected_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            payload.access_token,
            payload.gitlab_username,
            gitlab_url
        )
        .fetch_one(pool)
        .await?;

        Ok(GitLabConnection {
            id: row.id,
            team_id: row.team_id,
            access_token: row.access_token,
            gitlab_username: row.gitlab_username,
            gitlab_url: row.gitlab_url,
            connected_at: row.connected_at,
            updated_at: row.updated_at,
        })
    }

    /// Update a connection
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        payload: &UpdateGitLabConnection,
    ) -> Result<GitLabConnection, GitLabConnectionError> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(GitLabConnectionError::NotFound)?;

        let access_token = payload
            .access_token
            .as_ref()
            .unwrap_or(&existing.access_token);
        let gitlab_username = payload
            .gitlab_username
            .as_ref()
            .or(existing.gitlab_username.as_ref());
        let gitlab_url = payload.gitlab_url.as_ref().unwrap_or(&existing.gitlab_url);

        let row = sqlx::query!(
            r#"
            UPDATE gitlab_connections
            SET access_token = $2, gitlab_username = $3, gitlab_url = $4, updated_at = NOW()
            WHERE id = $1
            RETURNING
                id AS "id!: Uuid",
                team_id AS "team_id: Uuid",
                access_token AS "access_token!",
                gitlab_username,
                gitlab_url AS "gitlab_url!",
                connected_at AS "connected_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            access_token,
            gitlab_username,
            gitlab_url
        )
        .fetch_one(pool)
        .await?;

        Ok(GitLabConnection {
            id: row.id,
            team_id: row.team_id,
            access_token: row.access_token,
            gitlab_username: row.gitlab_username,
            gitlab_url: row.gitlab_url,
            connected_at: row.connected_at,
            updated_at: row.updated_at,
        })
    }

    /// Delete workspace connection
    pub async fn delete_workspace_connection(pool: &PgPool) -> Result<u64, GitLabConnectionError> {
        let result = sqlx::query!("DELETE FROM gitlab_connections WHERE team_id IS NULL")
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }

    /// Find connection by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<GitLabConnection>, GitLabConnectionError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                team_id AS "team_id: Uuid",
                access_token AS "access_token!",
                gitlab_username,
                gitlab_url AS "gitlab_url!",
                connected_at AS "connected_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM gitlab_connections
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| GitLabConnection {
            id: r.id,
            team_id: r.team_id,
            access_token: r.access_token,
            gitlab_username: r.gitlab_username,
            gitlab_url: r.gitlab_url,
            connected_at: r.connected_at,
            updated_at: r.updated_at,
        }))
    }
}

pub struct GitLabRepositoryOps;

impl GitLabRepositoryOps {
    /// Find repositories by connection ID
    pub async fn find_by_connection_id(
        pool: &PgPool,
        connection_id: Uuid,
    ) -> Result<Vec<GitLabRepository>, GitLabConnectionError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                connection_id AS "connection_id!: Uuid",
                repo_full_name AS "repo_full_name!",
                repo_name AS "repo_name!",
                repo_namespace AS "repo_namespace!",
                repo_url AS "repo_url!",
                default_branch,
                is_private AS "is_private!",
                linked_at AS "linked_at!: DateTime<Utc>"
            FROM gitlab_repositories
            WHERE connection_id = $1
            ORDER BY repo_full_name ASC
            "#,
            connection_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| GitLabRepository {
                id: r.id,
                connection_id: r.connection_id,
                repo_full_name: r.repo_full_name,
                repo_name: r.repo_name,
                repo_namespace: r.repo_namespace,
                repo_url: r.repo_url,
                default_branch: r.default_branch,
                is_private: r.is_private,
                linked_at: r.linked_at,
            })
            .collect())
    }

    /// Link a repository to a connection
    pub async fn link(
        pool: &PgPool,
        connection_id: Uuid,
        payload: &LinkGitLabRepository,
    ) -> Result<GitLabRepository, GitLabConnectionError> {
        let row = sqlx::query!(
            r#"
            INSERT INTO gitlab_repositories
                (connection_id, repo_full_name, repo_name, repo_namespace, repo_url, default_branch, is_private)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
                id AS "id!: Uuid",
                connection_id AS "connection_id!: Uuid",
                repo_full_name AS "repo_full_name!",
                repo_name AS "repo_name!",
                repo_namespace AS "repo_namespace!",
                repo_url AS "repo_url!",
                default_branch,
                is_private AS "is_private!",
                linked_at AS "linked_at!: DateTime<Utc>"
            "#,
            connection_id,
            payload.repo_full_name,
            payload.repo_name,
            payload.repo_namespace,
            payload.repo_url,
            payload.default_branch,
            payload.is_private
        )
        .fetch_one(pool)
        .await?;

        Ok(GitLabRepository {
            id: row.id,
            connection_id: row.connection_id,
            repo_full_name: row.repo_full_name,
            repo_name: row.repo_name,
            repo_namespace: row.repo_namespace,
            repo_url: row.repo_url,
            default_branch: row.default_branch,
            is_private: row.is_private,
            linked_at: row.linked_at,
        })
    }

    /// Unlink a repository
    pub async fn unlink(pool: &PgPool, repo_id: Uuid) -> Result<u64, GitLabConnectionError> {
        let result = sqlx::query!("DELETE FROM gitlab_repositories WHERE id = $1", repo_id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }
}
