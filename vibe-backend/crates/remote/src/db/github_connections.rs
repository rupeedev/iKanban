//! GitHub connections database operations

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubConnection {
    pub id: Uuid,
    pub team_id: Option<Uuid>,
    pub access_token: String,
    pub github_username: Option<String>,
    pub connected_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubRepository {
    pub id: Uuid,
    pub connection_id: Uuid,
    pub repo_full_name: String,
    pub repo_name: String,
    pub repo_owner: String,
    pub repo_url: String,
    pub default_branch: Option<String>,
    pub is_private: bool,
    pub linked_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubConnectionWithRepos {
    #[serde(flatten)]
    pub connection: GitHubConnection,
    pub repositories: Vec<GitHubRepository>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateGitHubConnection {
    pub access_token: String,
    pub github_username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateGitHubConnection {
    pub access_token: Option<String>,
    pub github_username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct LinkGitHubRepository {
    pub repo_full_name: String,
    pub repo_name: String,
    pub repo_owner: String,
    pub repo_url: String,
    pub default_branch: Option<String>,
    pub is_private: bool,
}

#[derive(Debug, Error)]
pub enum GitHubConnectionError {
    #[error("connection not found")]
    NotFound,
    #[error("connection already exists")]
    AlreadyExists,
    #[error(transparent)]
    Database(#[from] sqlx::Error),
}

pub struct GitHubConnectionRepository;

impl GitHubConnectionRepository {
    /// Find workspace-level connection (team_id IS NULL)
    pub async fn find_workspace_connection(
        pool: &PgPool,
    ) -> Result<Option<GitHubConnection>, GitHubConnectionError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                team_id AS "team_id: Uuid",
                access_token AS "access_token!",
                github_username,
                connected_at AS "connected_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM github_connections
            WHERE team_id IS NULL
            "#
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| GitHubConnection {
            id: r.id,
            team_id: r.team_id,
            access_token: r.access_token,
            github_username: r.github_username,
            connected_at: r.connected_at,
            updated_at: r.updated_at,
        }))
    }

    /// Create workspace-level connection
    pub async fn create_workspace_connection(
        pool: &PgPool,
        payload: &CreateGitHubConnection,
    ) -> Result<GitHubConnection, GitHubConnectionError> {
        let row = sqlx::query!(
            r#"
            INSERT INTO github_connections (team_id, access_token, github_username)
            VALUES (NULL, $1, $2)
            RETURNING
                id AS "id!: Uuid",
                team_id AS "team_id: Uuid",
                access_token AS "access_token!",
                github_username,
                connected_at AS "connected_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            payload.access_token,
            payload.github_username
        )
        .fetch_one(pool)
        .await?;

        Ok(GitHubConnection {
            id: row.id,
            team_id: row.team_id,
            access_token: row.access_token,
            github_username: row.github_username,
            connected_at: row.connected_at,
            updated_at: row.updated_at,
        })
    }

    /// Update a connection
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        payload: &UpdateGitHubConnection,
    ) -> Result<GitHubConnection, GitHubConnectionError> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(GitHubConnectionError::NotFound)?;

        let access_token = payload
            .access_token
            .as_ref()
            .unwrap_or(&existing.access_token);
        let github_username = payload
            .github_username
            .as_ref()
            .or(existing.github_username.as_ref());

        let row = sqlx::query!(
            r#"
            UPDATE github_connections
            SET access_token = $2, github_username = $3, updated_at = NOW()
            WHERE id = $1
            RETURNING
                id AS "id!: Uuid",
                team_id AS "team_id: Uuid",
                access_token AS "access_token!",
                github_username,
                connected_at AS "connected_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            "#,
            id,
            access_token,
            github_username
        )
        .fetch_one(pool)
        .await?;

        Ok(GitHubConnection {
            id: row.id,
            team_id: row.team_id,
            access_token: row.access_token,
            github_username: row.github_username,
            connected_at: row.connected_at,
            updated_at: row.updated_at,
        })
    }

    /// Delete workspace connection
    pub async fn delete_workspace_connection(pool: &PgPool) -> Result<u64, GitHubConnectionError> {
        let result = sqlx::query!("DELETE FROM github_connections WHERE team_id IS NULL")
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }

    /// Find connection by ID
    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<GitHubConnection>, GitHubConnectionError> {
        let row = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                team_id AS "team_id: Uuid",
                access_token AS "access_token!",
                github_username,
                connected_at AS "connected_at!: DateTime<Utc>",
                updated_at AS "updated_at!: DateTime<Utc>"
            FROM github_connections
            WHERE id = $1
            "#,
            id
        )
        .fetch_optional(pool)
        .await?;

        Ok(row.map(|r| GitHubConnection {
            id: r.id,
            team_id: r.team_id,
            access_token: r.access_token,
            github_username: r.github_username,
            connected_at: r.connected_at,
            updated_at: r.updated_at,
        }))
    }
}

pub struct GitHubRepositoryOps;

impl GitHubRepositoryOps {
    /// Find repositories by connection ID
    pub async fn find_by_connection_id(
        pool: &PgPool,
        connection_id: Uuid,
    ) -> Result<Vec<GitHubRepository>, GitHubConnectionError> {
        let rows = sqlx::query!(
            r#"
            SELECT
                id AS "id!: Uuid",
                connection_id AS "connection_id!: Uuid",
                repo_full_name AS "repo_full_name!",
                repo_name AS "repo_name!",
                repo_owner AS "repo_owner!",
                repo_url AS "repo_url!",
                default_branch,
                is_private AS "is_private!",
                linked_at AS "linked_at!: DateTime<Utc>"
            FROM github_repositories
            WHERE connection_id = $1
            ORDER BY repo_full_name ASC
            "#,
            connection_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows
            .into_iter()
            .map(|r| GitHubRepository {
                id: r.id,
                connection_id: r.connection_id,
                repo_full_name: r.repo_full_name,
                repo_name: r.repo_name,
                repo_owner: r.repo_owner,
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
        payload: &LinkGitHubRepository,
    ) -> Result<GitHubRepository, GitHubConnectionError> {
        let row = sqlx::query!(
            r#"
            INSERT INTO github_repositories
                (connection_id, repo_full_name, repo_name, repo_owner, repo_url, default_branch, is_private)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING
                id AS "id!: Uuid",
                connection_id AS "connection_id!: Uuid",
                repo_full_name AS "repo_full_name!",
                repo_name AS "repo_name!",
                repo_owner AS "repo_owner!",
                repo_url AS "repo_url!",
                default_branch,
                is_private AS "is_private!",
                linked_at AS "linked_at!: DateTime<Utc>"
            "#,
            connection_id,
            payload.repo_full_name,
            payload.repo_name,
            payload.repo_owner,
            payload.repo_url,
            payload.default_branch,
            payload.is_private
        )
        .fetch_one(pool)
        .await?;

        Ok(GitHubRepository {
            id: row.id,
            connection_id: row.connection_id,
            repo_full_name: row.repo_full_name,
            repo_name: row.repo_name,
            repo_owner: row.repo_owner,
            repo_url: row.repo_url,
            default_branch: row.default_branch,
            is_private: row.is_private,
            linked_at: row.linked_at,
        })
    }

    /// Unlink a repository
    pub async fn unlink(pool: &PgPool, repo_id: Uuid) -> Result<u64, GitHubConnectionError> {
        let result = sqlx::query!("DELETE FROM github_repositories WHERE id = $1", repo_id)
            .execute(pool)
            .await?;

        Ok(result.rows_affected())
    }
}
