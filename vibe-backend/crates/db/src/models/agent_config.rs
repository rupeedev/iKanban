use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use ts_rs::TS;

/// Storage location for agent configuration
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[ts(export)]
pub enum StorageLocation {
    #[serde(rename = "local")]
    Local,
    #[serde(rename = "database")]
    Database,
}

impl StorageLocation {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Local => "local",
            Self::Database => "database",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "local" => Self::Local,
            "database" => Self::Database,
            _ => Self::Local,
        }
    }
}

/// Agent configuration with dual storage support
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct AgentConfig {
    pub id: i64,
    pub team_id: i64,
    pub agent_type: String, // e.g., 'CLAUDE_CODE', 'COPILOT', 'DROID'
    pub storage_location: StorageLocation,
    pub local_path: Option<String>, // e.g., '.claude/profiles.json'
    #[serde(default)]
    pub config_data: serde_json::Value,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
    #[ts(type = "Date")]
    pub updated_at: DateTime<Utc>,
    #[ts(optional, type = "Date | null")]
    pub synced_at: Option<DateTime<Utc>>,
}

/// Request to create or update agent config
#[derive(Debug, Deserialize, TS)]
#[ts(export)]
pub struct UpsertAgentConfig {
    pub agent_type: String,
    pub storage_location: String, // 'local' or 'database'
    pub local_path: Option<String>,
    pub config_data: Option<serde_json::Value>,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct AgentConfigRow {
    id: i64,
    team_id: i64,
    agent_type: String,
    storage_location: String,
    local_path: Option<String>,
    config_data: serde_json::Value,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    synced_at: Option<DateTime<Utc>>,
}

impl From<AgentConfigRow> for AgentConfig {
    fn from(row: AgentConfigRow) -> Self {
        Self {
            id: row.id,
            team_id: row.team_id,
            agent_type: row.agent_type,
            storage_location: StorageLocation::parse(&row.storage_location),
            local_path: row.local_path,
            config_data: row.config_data,
            created_at: row.created_at,
            updated_at: row.updated_at,
            synced_at: row.synced_at,
        }
    }
}

impl AgentConfig {
    /// Get agent config for a team and agent type
    pub async fn get_by_team_and_agent(
        pool: &PgPool,
        team_id: i64,
        agent_type: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        let row = sqlx::query_as::<_, AgentConfigRow>(
            r#"
            SELECT id, team_id, agent_type, storage_location, local_path, 
                   config_data, created_at, updated_at, synced_at
            FROM agent_configs
            WHERE team_id = $1 AND agent_type = $2
            "#,
        )
        .bind(team_id)
        .bind(agent_type)
        .fetch_optional(pool)
        .await?;

        Ok(row.map(Into::into))
    }

    /// Get all agent configs for a team
    pub async fn get_by_team(pool: &PgPool, team_id: i64) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as::<_, AgentConfigRow>(
            r#"
            SELECT id, team_id, agent_type, storage_location, local_path, 
                   config_data, created_at, updated_at, synced_at
            FROM agent_configs
            WHERE team_id = $1
            ORDER BY agent_type
            "#,
        )
        .bind(team_id)
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(Into::into).collect())
    }

    /// Create or update agent config
    pub async fn upsert(
        pool: &PgPool,
        team_id: i64,
        request: &UpsertAgentConfig,
    ) -> Result<Self, sqlx::Error> {
        let row = sqlx::query_as::<_, AgentConfigRow>(
            r#"
            INSERT INTO agent_configs (
                team_id, agent_type, storage_location, local_path, config_data, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, NOW())
            ON CONFLICT (team_id, agent_type)
            DO UPDATE SET
                storage_location = EXCLUDED.storage_location,
                local_path = EXCLUDED.local_path,
                config_data = EXCLUDED.config_data,
                updated_at = NOW()
            RETURNING id, team_id, agent_type, storage_location, local_path, 
                      config_data, created_at, updated_at, synced_at
            "#,
        )
        .bind(team_id)
        .bind(&request.agent_type)
        .bind(&request.storage_location)
        .bind(&request.local_path)
        .bind(
            request
                .config_data
                .as_ref()
                .unwrap_or(&serde_json::json!({})),
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Update synced_at timestamp
    pub async fn mark_synced(
        pool: &PgPool,
        team_id: i64,
        agent_type: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            UPDATE agent_configs
            SET synced_at = NOW()
            WHERE team_id = $1 AND agent_type = $2
            "#,
        )
        .bind(team_id)
        .bind(agent_type)
        .execute(pool)
        .await?;

        Ok(())
    }

    /// Delete agent config
    pub async fn delete(pool: &PgPool, team_id: i64, agent_type: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            DELETE FROM agent_configs
            WHERE team_id = $1 AND agent_type = $2
            "#,
        )
        .bind(team_id)
        .bind(agent_type)
        .execute(pool)
        .await?;

        Ok(())
    }
}
