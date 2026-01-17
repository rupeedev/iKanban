use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct GitLabConnection {
    pub id: Uuid,
    /// Team ID - NULL for workspace-level connection
    pub team_id: Option<Uuid>,
    #[serde(skip_serializing)] // Never expose the access token
    pub access_token: String,
    pub gitlab_username: Option<String>,
    /// GitLab instance URL (for self-hosted instances)
    pub gitlab_url: String,
    #[ts(type = "Date")]
    pub connected_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow, Serialize, Deserialize, TS)]
pub struct GitLabRepository {
    pub id: Uuid,
    pub connection_id: Uuid,
    pub repo_full_name: String,
    pub repo_name: String,
    pub repo_namespace: String,
    pub repo_url: String,
    pub default_branch: Option<String>,
    pub is_private: bool,
    #[ts(type = "Date")]
    pub linked_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, TS)]
pub struct CreateGitLabConnection {
    pub access_token: String,
    /// GitLab instance URL - defaults to https://gitlab.com
    pub gitlab_url: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct UpdateGitLabConnection {
    pub access_token: Option<String>,
    pub gitlab_username: Option<String>,
    pub gitlab_url: Option<String>,
}

#[derive(Debug, Deserialize, TS)]
pub struct LinkGitLabRepository {
    pub repo_full_name: String,
    pub repo_name: String,
    pub repo_namespace: String,
    pub repo_url: String,
    pub default_branch: Option<String>,
    pub is_private: bool,
}

/// Response type for GitLab connection with repositories
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct GitLabConnectionWithRepos {
    #[serde(flatten)]
    pub connection: GitLabConnection,
    pub repositories: Vec<GitLabRepository>,
}

impl GitLabConnection {
    /// Find workspace-level connection (team_id IS NULL)
    pub async fn find_workspace_connection(pool: &PgPool) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitLabConnection,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id: Uuid",
                      access_token,
                      gitlab_username,
                      gitlab_url,
                      connected_at as "connected_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM gitlab_connections
               WHERE team_id IS NULL"#
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_team_id(
        pool: &PgPool,
        team_id: Uuid,
    ) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitLabConnection,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id: Uuid",
                      access_token,
                      gitlab_username,
                      gitlab_url,
                      connected_at as "connected_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM gitlab_connections
               WHERE team_id = $1"#,
            team_id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitLabConnection,
            r#"SELECT id as "id!: Uuid",
                      team_id as "team_id: Uuid",
                      access_token,
                      gitlab_username,
                      gitlab_url,
                      connected_at as "connected_at!: DateTime<Utc>",
                      updated_at as "updated_at!: DateTime<Utc>"
               FROM gitlab_connections
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    /// Create a workspace-level connection (no team_id)
    pub async fn create_workspace_connection(
        pool: &PgPool,
        data: &CreateGitLabConnection,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let gitlab_url = data
            .gitlab_url
            .clone()
            .unwrap_or_else(|| "https://gitlab.com".to_string());

        sqlx::query_as!(
            GitLabConnection,
            r#"INSERT INTO gitlab_connections (id, team_id, access_token, gitlab_url)
               VALUES ($1, NULL, $2, $3)
               RETURNING id as "id!: Uuid",
                         team_id as "team_id: Uuid",
                         access_token,
                         gitlab_username,
                         gitlab_url,
                         connected_at as "connected_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            data.access_token,
            gitlab_url
        )
        .fetch_one(pool)
        .await
    }

    pub async fn create(
        pool: &PgPool,
        team_id: Uuid,
        data: &CreateGitLabConnection,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let gitlab_url = data
            .gitlab_url
            .clone()
            .unwrap_or_else(|| "https://gitlab.com".to_string());

        sqlx::query_as!(
            GitLabConnection,
            r#"INSERT INTO gitlab_connections (id, team_id, access_token, gitlab_url)
               VALUES ($1, $2, $3, $4)
               RETURNING id as "id!: Uuid",
                         team_id as "team_id: Uuid",
                         access_token,
                         gitlab_username,
                         gitlab_url,
                         connected_at as "connected_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            team_id,
            data.access_token,
            gitlab_url
        )
        .fetch_one(pool)
        .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        data: &UpdateGitLabConnection,
    ) -> Result<Self, sqlx::Error> {
        let existing = Self::find_by_id(pool, id)
            .await?
            .ok_or(sqlx::Error::RowNotFound)?;

        let access_token = data.access_token.as_ref().unwrap_or(&existing.access_token);
        let gitlab_username = data.gitlab_username.clone().or(existing.gitlab_username);
        let gitlab_url = data.gitlab_url.as_ref().unwrap_or(&existing.gitlab_url);

        sqlx::query_as!(
            GitLabConnection,
            r#"UPDATE gitlab_connections
               SET access_token = $2, gitlab_username = $3, gitlab_url = $4, updated_at = NOW()
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         team_id as "team_id: Uuid",
                         access_token,
                         gitlab_username,
                         gitlab_url,
                         connected_at as "connected_at!: DateTime<Utc>",
                         updated_at as "updated_at!: DateTime<Utc>""#,
            id,
            access_token,
            gitlab_username,
            gitlab_url
        )
        .fetch_one(pool)
        .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM gitlab_connections WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    /// Delete workspace-level connection
    pub async fn delete_workspace_connection(pool: &PgPool) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM gitlab_connections WHERE team_id IS NULL")
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete_by_team_id(pool: &PgPool, team_id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM gitlab_connections WHERE team_id = $1", team_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}

impl GitLabRepository {
    pub async fn find_by_connection_id(
        pool: &PgPool,
        connection_id: Uuid,
    ) -> Result<Vec<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitLabRepository,
            r#"SELECT id as "id!: Uuid",
                      connection_id as "connection_id!: Uuid",
                      repo_full_name,
                      repo_name,
                      repo_namespace,
                      repo_url,
                      default_branch,
                      is_private as "is_private!: bool",
                      linked_at as "linked_at!: DateTime<Utc>"
               FROM gitlab_repositories
               WHERE connection_id = $1
               ORDER BY repo_full_name ASC"#,
            connection_id
        )
        .fetch_all(pool)
        .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Self>, sqlx::Error> {
        sqlx::query_as!(
            GitLabRepository,
            r#"SELECT id as "id!: Uuid",
                      connection_id as "connection_id!: Uuid",
                      repo_full_name,
                      repo_name,
                      repo_namespace,
                      repo_url,
                      default_branch,
                      is_private as "is_private!: bool",
                      linked_at as "linked_at!: DateTime<Utc>"
               FROM gitlab_repositories
               WHERE id = $1"#,
            id
        )
        .fetch_optional(pool)
        .await
    }

    pub async fn link(
        pool: &PgPool,
        connection_id: Uuid,
        data: &LinkGitLabRepository,
    ) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();

        sqlx::query_as!(
            GitLabRepository,
            r#"INSERT INTO gitlab_repositories (id, connection_id, repo_full_name, repo_name, repo_namespace, repo_url, default_branch, is_private)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
               ON CONFLICT (connection_id, repo_full_name) DO UPDATE SET
                   repo_name = $4, repo_namespace = $5, repo_url = $6, default_branch = $7, is_private = $8
               RETURNING id as "id!: Uuid",
                         connection_id as "connection_id!: Uuid",
                         repo_full_name,
                         repo_name,
                         repo_namespace,
                         repo_url,
                         default_branch,
                         is_private as "is_private!: bool",
                         linked_at as "linked_at!: DateTime<Utc>""#,
            id,
            connection_id,
            data.repo_full_name,
            data.repo_name,
            data.repo_namespace,
            data.repo_url,
            data.default_branch,
            data.is_private
        )
        .fetch_one(pool)
        .await
    }

    pub async fn unlink(pool: &PgPool, id: Uuid) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!("DELETE FROM gitlab_repositories WHERE id = $1", id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }

    pub async fn unlink_by_full_name(
        pool: &PgPool,
        connection_id: Uuid,
        repo_full_name: &str,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query!(
            "DELETE FROM gitlab_repositories WHERE connection_id = $1 AND repo_full_name = $2",
            connection_id,
            repo_full_name
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}
