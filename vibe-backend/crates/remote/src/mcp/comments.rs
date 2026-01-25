//! Comments MCP tools - list and add comments on tasks

use rmcp::{ErrorData, handler::server::tool::Parameters, model::CallToolResult, tool};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{
    task_server::TaskServer,
    teams::{parse_issue_key, resolve_issue_key},
    types::*,
};

/// Comment from API response
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ApiComment {
    pub id: Uuid,
    pub task_id: Uuid,
    pub content: String,
    pub author_id: Option<Uuid>,
    pub author_name: Option<String>,
    pub author_avatar: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl TaskServer {
    /// Resolve task_id parameter - can be UUID or issue key (IKA-123)
    async fn resolve_task_id(&self, task_id: &str) -> Result<Uuid, CallToolResult> {
        // Try as UUID first
        if let Ok(uuid) = Uuid::parse_str(task_id) {
            return Ok(uuid);
        }

        // Try as issue key
        if parse_issue_key(task_id).is_some() {
            let (uuid, _key) = resolve_issue_key(self, task_id).await?;
            return Ok(uuid);
        }

        Err(TaskServer::err(
            format!(
                "Invalid task_id '{}'. Use UUID or issue key format (e.g., 'IKA-123').",
                task_id
            ),
            None::<String>,
        )
        .unwrap())
    }

    /// List comments on a task
    #[tool(
        description = "List comments on a task. Task can be specified by UUID or issue key (e.g., 'IKA-123')."
    )]
    pub async fn list_comments(
        &self,
        Parameters(ListCommentsRequest { task_id }): Parameters<ListCommentsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Resolve task ID
        let resolved_task_id = match self.resolve_task_id(&task_id).await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        // Get comments
        let url = self.url(&format!("/api/tasks/{}/comments", resolved_task_id));
        let comments: Vec<ApiComment> = match self.send_json(self.client().get(&url)).await {
            Ok(c) => c,
            Err(e) => return Ok(e),
        };

        let comment_summaries: Vec<CommentSummary> = comments
            .into_iter()
            .map(|c| CommentSummary {
                id: c.id.to_string(),
                content: c.content,
                author_name: c.author_name,
                created_at: c.created_at,
            })
            .collect();

        let response = ListCommentsResponse {
            count: comment_summaries.len(),
            comments: comment_summaries,
            task_id: resolved_task_id.to_string(),
        };

        TaskServer::success(&response)
    }

    /// Add a comment to a task
    #[tool(
        description = "Add a comment to a task. Task can be specified by UUID or issue key (e.g., 'IKA-123')."
    )]
    pub async fn add_comment(
        &self,
        Parameters(AddCommentRequest { task_id, content }): Parameters<AddCommentRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Resolve task ID
        let resolved_task_id = match self.resolve_task_id(&task_id).await {
            Ok(id) => id,
            Err(e) => return Ok(e),
        };

        // Build create payload
        #[derive(Serialize)]
        struct CreateCommentPayload {
            content: String,
        }

        let payload = CreateCommentPayload { content };

        // Create comment
        let url = self.url(&format!("/api/tasks/{}/comments", resolved_task_id));
        let comment: ApiComment = match self
            .send_json(self.client().post(&url).json(&payload))
            .await
        {
            Ok(c) => c,
            Err(e) => return Ok(e),
        };

        let response = AddCommentResponse {
            comment_id: comment.id.to_string(),
            task_id: resolved_task_id.to_string(),
        };

        TaskServer::success(&response)
    }
}
