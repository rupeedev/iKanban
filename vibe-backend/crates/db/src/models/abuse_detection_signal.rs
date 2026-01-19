use std::str::FromStr;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use sqlx::{FromRow, PgPool};
use ts_rs::TS;
use uuid::Uuid;

/// Signal type for abuse detection (IKA-188)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum SignalType {
    RapidRegistration,
    DisposableEmail,
    SuspiciousActivity,
    RateLimitExceeded,
    ReportedSpam,
    FailedLoginAttempts,
    Other(String),
}

impl std::fmt::Display for SignalType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::RapidRegistration => write!(f, "rapid_registration"),
            Self::DisposableEmail => write!(f, "disposable_email"),
            Self::SuspiciousActivity => write!(f, "suspicious_activity"),
            Self::RateLimitExceeded => write!(f, "rate_limit_exceeded"),
            Self::ReportedSpam => write!(f, "reported_spam"),
            Self::FailedLoginAttempts => write!(f, "failed_login_attempts"),
            Self::Other(s) => write!(f, "{}", s),
        }
    }
}

impl FromStr for SignalType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "rapid_registration" => Ok(Self::RapidRegistration),
            "disposable_email" => Ok(Self::DisposableEmail),
            "suspicious_activity" => Ok(Self::SuspiciousActivity),
            "rate_limit_exceeded" => Ok(Self::RateLimitExceeded),
            "reported_spam" => Ok(Self::ReportedSpam),
            "failed_login_attempts" => Ok(Self::FailedLoginAttempts),
            other => Ok(Self::Other(other.to_string())),
        }
    }
}

/// Severity level for abuse signals
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, TS, Default)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    #[default]
    Low,
    Medium,
    High,
}

impl std::fmt::Display for Severity {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Low => write!(f, "low"),
            Self::Medium => write!(f, "medium"),
            Self::High => write!(f, "high"),
        }
    }
}

impl FromStr for Severity {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "low" => Ok(Self::Low),
            "medium" => Ok(Self::Medium),
            "high" => Ok(Self::High),
            _ => Ok(Self::Low),
        }
    }
}

/// Abuse detection signal (IKA-188)
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct AbuseDetectionSignal {
    pub id: Uuid,
    pub user_id: String,
    pub signal_type: SignalType,
    pub severity: Severity,
    pub description: Option<String>,
    #[ts(type = "Record<string, any>")]
    pub metadata: JsonValue,
    pub source_ip: Option<String>,
    pub is_resolved: bool,
    #[ts(type = "Date | null")]
    pub resolved_at: Option<DateTime<Utc>>,
    pub resolved_by: Option<String>,
    pub resolution_notes: Option<String>,
    #[ts(type = "Date")]
    pub created_at: DateTime<Utc>,
}

/// Request to create an abuse signal
#[derive(Debug, Deserialize, TS)]
pub struct CreateAbuseSignal {
    pub user_id: String,
    pub signal_type: String,
    pub severity: String,
    pub description: Option<String>,
    pub metadata: Option<JsonValue>,
    pub source_ip: Option<String>,
}

/// Request to resolve an abuse signal
#[derive(Debug, Deserialize, TS)]
pub struct ResolveAbuseSignal {
    pub resolution_notes: Option<String>,
}

// Helper struct for raw DB rows
#[derive(FromRow)]
struct AbuseDetectionSignalRow {
    id: Uuid,
    user_id: String,
    signal_type: String,
    severity: String,
    description: Option<String>,
    metadata: JsonValue,
    source_ip: Option<String>,
    is_resolved: bool,
    resolved_at: Option<DateTime<Utc>>,
    resolved_by: Option<String>,
    resolution_notes: Option<String>,
    created_at: DateTime<Utc>,
}

impl From<AbuseDetectionSignalRow> for AbuseDetectionSignal {
    fn from(row: AbuseDetectionSignalRow) -> Self {
        Self {
            id: row.id,
            user_id: row.user_id,
            signal_type: SignalType::from_str(&row.signal_type).unwrap_or(SignalType::Other(row.signal_type)),
            severity: Severity::from_str(&row.severity).unwrap_or_default(),
            description: row.description,
            metadata: row.metadata,
            source_ip: row.source_ip,
            is_resolved: row.is_resolved,
            resolved_at: row.resolved_at,
            resolved_by: row.resolved_by,
            resolution_notes: row.resolution_notes,
            created_at: row.created_at,
        }
    }
}

impl AbuseDetectionSignal {
    /// Create a new abuse signal
    pub async fn create(pool: &PgPool, data: &CreateAbuseSignal) -> Result<Self, sqlx::Error> {
        let id = Uuid::new_v4();
        let metadata = data.metadata.clone().unwrap_or(serde_json::json!({}));

        let row = sqlx::query_as!(
            AbuseDetectionSignalRow,
            r#"INSERT INTO abuse_detection_signals
               (id, user_id, signal_type, severity, description, metadata, source_ip)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id as "id!: Uuid",
                         user_id,
                         signal_type,
                         severity,
                         description,
                         metadata as "metadata!: JsonValue",
                         source_ip,
                         is_resolved,
                         resolved_at as "resolved_at: DateTime<Utc>",
                         resolved_by,
                         resolution_notes,
                         created_at as "created_at!: DateTime<Utc>""#,
            id,
            data.user_id,
            data.signal_type,
            data.severity,
            data.description,
            metadata,
            data.source_ip
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// Find signals by user ID
    pub async fn find_by_user_id(
        pool: &PgPool,
        user_id: &str,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            AbuseDetectionSignalRow,
            r#"SELECT id as "id!: Uuid",
                      user_id,
                      signal_type,
                      severity,
                      description,
                      metadata as "metadata!: JsonValue",
                      source_ip,
                      is_resolved,
                      resolved_at as "resolved_at: DateTime<Utc>",
                      resolved_by,
                      resolution_notes,
                      created_at as "created_at!: DateTime<Utc>"
               FROM abuse_detection_signals
               WHERE user_id = $1
               ORDER BY created_at DESC"#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Find unresolved signals by user ID
    pub async fn find_unresolved_by_user_id(
        pool: &PgPool,
        user_id: &str,
    ) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            AbuseDetectionSignalRow,
            r#"SELECT id as "id!: Uuid",
                      user_id,
                      signal_type,
                      severity,
                      description,
                      metadata as "metadata!: JsonValue",
                      source_ip,
                      is_resolved,
                      resolved_at as "resolved_at: DateTime<Utc>",
                      resolved_by,
                      resolution_notes,
                      created_at as "created_at!: DateTime<Utc>"
               FROM abuse_detection_signals
               WHERE user_id = $1 AND is_resolved = false
               ORDER BY created_at DESC"#,
            user_id
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Count unresolved high severity signals for a user
    pub async fn count_high_severity_unresolved(
        pool: &PgPool,
        user_id: &str,
    ) -> Result<i64, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!"
               FROM abuse_detection_signals
               WHERE user_id = $1
                 AND is_resolved = false
                 AND severity = 'high'"#,
            user_id
        )
        .fetch_one(pool)
        .await?;

        Ok(result)
    }

    /// Resolve a signal
    pub async fn resolve(
        pool: &PgPool,
        id: Uuid,
        resolved_by: &str,
        notes: Option<&str>,
    ) -> Result<Self, sqlx::Error> {
        let row = sqlx::query_as!(
            AbuseDetectionSignalRow,
            r#"UPDATE abuse_detection_signals
               SET is_resolved = true,
                   resolved_at = NOW(),
                   resolved_by = $2,
                   resolution_notes = $3
               WHERE id = $1
               RETURNING id as "id!: Uuid",
                         user_id,
                         signal_type,
                         severity,
                         description,
                         metadata as "metadata!: JsonValue",
                         source_ip,
                         is_resolved,
                         resolved_at as "resolved_at: DateTime<Utc>",
                         resolved_by,
                         resolution_notes,
                         created_at as "created_at!: DateTime<Utc>""#,
            id,
            resolved_by,
            notes
        )
        .fetch_one(pool)
        .await?;

        Ok(row.into())
    }

    /// List all unresolved signals (for admin)
    pub async fn list_unresolved(pool: &PgPool) -> Result<Vec<Self>, sqlx::Error> {
        let rows = sqlx::query_as!(
            AbuseDetectionSignalRow,
            r#"SELECT id as "id!: Uuid",
                      user_id,
                      signal_type,
                      severity,
                      description,
                      metadata as "metadata!: JsonValue",
                      source_ip,
                      is_resolved,
                      resolved_at as "resolved_at: DateTime<Utc>",
                      resolved_by,
                      resolution_notes,
                      created_at as "created_at!: DateTime<Utc>"
               FROM abuse_detection_signals
               WHERE is_resolved = false
               ORDER BY
                 CASE severity
                   WHEN 'high' THEN 1
                   WHEN 'medium' THEN 2
                   ELSE 3
                 END,
                 created_at DESC"#
        )
        .fetch_all(pool)
        .await?;

        Ok(rows.into_iter().map(|r| r.into()).collect())
    }

    /// Check if IP has multiple registrations in the last 24 hours
    pub async fn check_rapid_registration(
        pool: &PgPool,
        source_ip: &str,
    ) -> Result<i64, sqlx::Error> {
        let result = sqlx::query_scalar!(
            r#"SELECT COUNT(*) as "count!"
               FROM abuse_detection_signals
               WHERE source_ip = $1
                 AND signal_type = 'rapid_registration'
                 AND created_at > NOW() - INTERVAL '24 hours'"#,
            source_ip
        )
        .fetch_one(pool)
        .await?;

        Ok(result)
    }
}
