use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use ts_rs::TS;
use uuid::Uuid;

use super::organizations::OrganizationMemberWithProfile;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RemoteProject {
    pub id: Uuid,
    pub organization_id: Uuid,
    pub name: String,
    #[ts(type = "Record<string, unknown>")]
    pub metadata: Value,
    /// Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lead_id: Option<Uuid>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_date: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_date: Option<DateTime<Utc>>,
    /// Status: backlog, planned, in_progress, paused, completed, cancelled
    pub status: String,
    /// Health percentage 0-100
    #[serde(skip_serializing_if = "Option::is_none")]
    pub health: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ListProjectsResponse {
    pub projects: Vec<RemoteProject>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
pub struct RemoteProjectMembersResponse {
    pub organization_id: Uuid,
    pub members: Vec<OrganizationMemberWithProfile>,
}
