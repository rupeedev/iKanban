//! Teams MCP tools - list teams, issues, and issue operations by key (IKA-123)

use std::str::FromStr;

use db_crate::models::task::{Task, TaskStatus, UpdateTask};
use rmcp::{
    ErrorData,
    handler::server::tool::Parameters,
    model::CallToolResult,
    tool,
};
use serde::Deserialize;
use uuid::Uuid;

use super::task_server::TaskServer;
use super::types::*;

/// Team from API response
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ApiTeam {
    pub id: Uuid,
    pub name: String,
    pub identifier: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Issue from API response (task with issue_number)
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ApiIssue {
    pub id: Uuid,
    pub title: String,
    pub description: Option<String>,
    pub status: String,
    pub issue_number: Option<i64>,
    pub priority: Option<i32>,
    pub created_at: String,
    pub updated_at: String,
}

/// Parse an issue key like "IKA-123" into (team_identifier, issue_number)
pub fn parse_issue_key(key: &str) -> Option<(String, i64)> {
    let key = key.trim().to_uppercase();

    // Try format with dash: IKA-123
    if let Some(pos) = key.find('-') {
        let identifier = &key[..pos];
        let number_str = &key[pos + 1..];
        if let Ok(number) = number_str.parse::<i64>() {
            return Some((identifier.to_string(), number));
        }
    }

    // Try format without dash: IKA123 (letters followed by digits)
    let letter_end = key.chars().take_while(|c| c.is_ascii_alphabetic()).count();
    if letter_end > 0 && letter_end < key.len() {
        let identifier = &key[..letter_end];
        let number_str = &key[letter_end..];
        if let Ok(number) = number_str.parse::<i64>() {
            return Some((identifier.to_string(), number));
        }
    }

    None
}

/// Resolve a team by identifier (IKA) or UUID
pub async fn resolve_team(server: &TaskServer, team: &str) -> Result<ResolvedTeam, CallToolResult> {
    // Try as UUID first
    if let Ok(uuid) = Uuid::parse_str(team) {
        // Fetch team by ID to get identifier
        let url = server.url(&format!("/api/teams/{}", uuid));
        let api_team: ApiTeam = match server.send_json(server.client().get(&url)).await {
            Ok(t) => t,
            Err(e) => return Err(e),
        };
        return Ok(ResolvedTeam {
            id: api_team.id,
            identifier: api_team.identifier,
        });
    }

    // Otherwise treat as identifier and search teams
    let url = server.url("/api/teams");
    let teams: Vec<ApiTeam> = match server.send_json(server.client().get(&url)).await {
        Ok(t) => t,
        Err(e) => return Err(e),
    };

    let team_upper = team.to_uppercase();
    for t in teams {
        if t.identifier.to_uppercase() == team_upper {
            return Ok(ResolvedTeam {
                id: t.id,
                identifier: t.identifier,
            });
        }
    }

    Err(
        TaskServer::err(format!("Team '{}' not found", team), None::<String>)
            .unwrap(),
    )
}

/// Resolve an issue key (IKA-123) to (task_uuid, issue_key)
pub async fn resolve_issue_key(
    server: &TaskServer,
    key: &str,
) -> Result<(Uuid, String), CallToolResult> {
    let (identifier, number) = parse_issue_key(key).ok_or_else(|| {
        TaskServer::err(
            format!(
                "Invalid issue key '{}'. Use format like 'IKA-123'.",
                key
            ),
            None::<String>,
        )
        .unwrap()
    })?;

    // Resolve team
    let team = resolve_team(server, &identifier).await?;

    // Fetch issues for this team and find by issue_number
    let url = server.url(&format!("/api/teams/{}/issues", team.id));
    let issues: Vec<ApiIssue> = match server.send_json(server.client().get(&url)).await {
        Ok(i) => i,
        Err(e) => return Err(e),
    };

    for issue in issues {
        if issue.issue_number == Some(number) {
            let issue_key = format!("{}-{}", team.identifier, number);
            return Ok((issue.id, issue_key));
        }
    }

    Err(TaskServer::err(
        format!("Issue '{}' not found", key),
        None::<String>,
    )
    .unwrap())
}

impl TaskServer {
    /// List all teams
    #[tool(description = "List all teams. Returns team identifiers (e.g., 'IKA', 'BLA') and names.")]
    pub async fn list_teams(
        &self,
        #[allow(unused)] Parameters(_req): Parameters<ListTeamsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url("/api/teams");
        let teams: Vec<ApiTeam> = match self.send_json(self.client().get(&url)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let team_summaries: Vec<TeamSummary> = teams
            .into_iter()
            .map(|t| TeamSummary {
                id: t.id.to_string(),
                identifier: t.identifier,
                name: t.name,
            })
            .collect();

        let response = ListTeamsResponse {
            count: team_summaries.len(),
            teams: team_summaries,
        };

        TaskServer::success(&response)
    }

    /// List issues for a team
    #[tool(
        description = "List issues/tasks for a team by team identifier (e.g., 'IKA') or team UUID. Returns issue keys like 'IKA-123'."
    )]
    pub async fn list_issues(
        &self,
        Parameters(ListTeamIssuesRequest { team, status, limit }): Parameters<ListTeamIssuesRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Resolve team
        let resolved_team = match resolve_team(self, &team).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        // Parse status filter if provided
        let status_filter = if let Some(ref status_str) = status {
            match TaskStatus::from_str(status_str) {
                Ok(s) => Some(s),
                Err(_) => {
                    return TaskServer::err(
                        "Invalid status. Use: 'todo', 'inprogress', 'inreview', 'done', 'cancelled'",
                        Some(status_str.as_str()),
                    );
                }
            }
        } else {
            None
        };

        // Get issues
        let url = self.url(&format!("/api/teams/{}/issues", resolved_team.id));
        let issues: Vec<ApiIssue> = match self.send_json(self.client().get(&url)).await {
            Ok(i) => i,
            Err(e) => return Ok(e),
        };

        // Filter and limit
        let task_limit = limit.unwrap_or(50).max(0) as usize;
        let filtered: Vec<ApiIssue> = issues
            .into_iter()
            .filter(|i| {
                if let Some(ref want) = status_filter {
                    TaskStatus::from_str(&i.status).ok().as_ref() == Some(want)
                } else {
                    true
                }
            })
            .take(task_limit)
            .collect();

        let issue_summaries: Vec<IssueSummary> = filtered
            .into_iter()
            .map(|i| {
                let issue_key = match i.issue_number {
                    Some(n) => format!("{}-{}", resolved_team.identifier, n),
                    None => i.id.to_string(),
                };
                IssueSummary {
                    id: i.id.to_string(),
                    issue_key,
                    title: i.title,
                    status: i.status,
                    priority: i.priority,
                }
            })
            .collect();

        let response = ListTeamIssuesResponse {
            count: issue_summaries.len(),
            issues: issue_summaries,
            team_identifier: resolved_team.identifier,
        };

        TaskServer::success(&response)
    }

    /// Get an issue by its key (IKA-123)
    #[tool(
        description = "Get an issue by its key (e.g., 'IKA-123'). Returns full issue details including description."
    )]
    pub async fn get_issue_by_key(
        &self,
        Parameters(IssueKeyRequest { issue_key }): Parameters<IssueKeyRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Resolve issue key to UUID
        let (task_id, resolved_key) = match resolve_issue_key(self, &issue_key).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        // Get full task details
        let url = self.url(&format!("/api/tasks/{}", task_id));
        let task: Task = match self.send_json(self.client().get(&url)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let response = GetIssueResponse {
            issue: IssueDetails {
                id: task.id.to_string(),
                issue_key: resolved_key,
                title: task.title,
                description: task.description,
                status: task.status.to_string(),
                priority: task.priority,
                created_at: task.created_at.to_rfc3339(),
                updated_at: task.updated_at.to_rfc3339(),
            },
        };

        TaskServer::success(&response)
    }

    /// Update an issue by its key (IKA-123)
    #[tool(
        description = "Update an issue by its key (e.g., 'IKA-123'). Can update title, description, status, and priority."
    )]
    pub async fn update_issue_by_key(
        &self,
        Parameters(UpdateIssueByKeyRequest {
            issue_key,
            title,
            description,
            status,
            priority,
        }): Parameters<UpdateIssueByKeyRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Resolve issue key to UUID
        let (task_id, resolved_key) = match resolve_issue_key(self, &issue_key).await {
            Ok(r) => r,
            Err(e) => return Ok(e),
        };

        // Parse status if provided
        let parsed_status = if let Some(ref status_str) = status {
            match TaskStatus::from_str(status_str) {
                Ok(s) => Some(s),
                Err(_) => {
                    return TaskServer::err(
                        "Invalid status. Use: 'todo', 'inprogress', 'inreview', 'done', 'cancelled'",
                        Some(status_str.as_str()),
                    );
                }
            }
        } else {
            None
        };

        // Build update payload
        let payload = UpdateTask {
            title,
            description,
            status: parsed_status,
            priority,
            parent_workspace_id: None,
            image_ids: None,
            due_date: None,
            assignee_id: None,
        };

        // Update task
        let url = self.url(&format!("/api/tasks/{}", task_id));
        let task: Task = match self.send_json(self.client().put(&url).json(&payload)).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        let response = UpdateIssueResponse {
            issue: IssueDetails {
                id: task.id.to_string(),
                issue_key: resolved_key,
                title: task.title,
                description: task.description,
                status: task.status.to_string(),
                priority: task.priority,
                created_at: task.created_at.to_rfc3339(),
                updated_at: task.updated_at.to_rfc3339(),
            },
        };

        TaskServer::success(&response)
    }
}
