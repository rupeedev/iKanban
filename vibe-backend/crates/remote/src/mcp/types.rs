//! Shared types for MCP tools

use executors::profile::ExecutorProfileId;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Generic API response envelope used by the backend
#[derive(Debug, Deserialize)]
pub struct ApiResponseEnvelope<T> {
    pub success: bool,
    pub data: Option<T>,
    pub message: Option<String>,
}

// ============================================================================
// Types moved from crates/server/src/routes/ for MCP self-containment
// ============================================================================

/// Query parameters for container context lookup
#[derive(Debug, Deserialize, Serialize)]
pub struct ContainerQuery {
    #[serde(rename = "ref")]
    pub container_ref: String,
}

/// Repository input for workspace creation
#[derive(Debug, Serialize, Deserialize)]
pub struct WorkspaceRepoInput {
    pub repo_id: Uuid,
    pub target_branch: String,
}

/// Request body for creating a task attempt/workspace
#[derive(Debug, Serialize, Deserialize)]
pub struct CreateTaskAttemptBody {
    pub task_id: Uuid,
    pub executor_profile_id: ExecutorProfileId,
    pub repos: Vec<WorkspaceRepoInput>,
}

// ============================================================================
// Team & Issue types
// ============================================================================

/// Team summary for list_teams response
#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct TeamSummary {
    #[schemars(description = "The unique identifier of the team")]
    pub id: String,
    #[schemars(description = "The team identifier (e.g., 'IKA', 'BLA')")]
    pub identifier: String,
    #[schemars(description = "The name of the team")]
    pub name: String,
}

/// Issue summary for list_issues response
#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct IssueSummary {
    #[schemars(description = "The unique identifier of the issue")]
    pub id: String,
    #[schemars(description = "The issue key (e.g., 'IKA-123')")]
    pub issue_key: String,
    #[schemars(description = "The title of the issue")]
    pub title: String,
    #[schemars(description = "Current status of the issue")]
    pub status: String,
    #[schemars(description = "Priority level (1=highest, 4=lowest)")]
    pub priority: Option<i32>,
}

/// Request for listing teams
#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct ListTeamsRequest {}

/// Response for listing teams
#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct ListTeamsResponse {
    pub count: usize,
    pub teams: Vec<TeamSummary>,
}

/// Request for listing issues by team
#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct ListTeamIssuesRequest {
    #[schemars(description = "Team identifier (e.g., 'IKA') or team UUID")]
    pub team: String,
    #[schemars(
        description = "Optional status filter: 'todo', 'inprogress', 'inreview', 'done', 'cancelled'"
    )]
    pub status: Option<String>,
    #[schemars(description = "Maximum number of issues to return (default: 50)")]
    pub limit: Option<i32>,
}

/// Response for listing issues
#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct ListTeamIssuesResponse {
    pub count: usize,
    pub issues: Vec<IssueSummary>,
    pub team_identifier: String,
}

/// Request for getting/updating issue by key
#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct IssueKeyRequest {
    #[schemars(description = "Issue key in format 'IKA-123'")]
    pub issue_key: String,
}

/// Request for updating an issue by key
#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct UpdateIssueByKeyRequest {
    #[schemars(description = "Issue key in format 'IKA-123'")]
    pub issue_key: String,
    #[schemars(description = "New title for the issue")]
    pub title: Option<String>,
    #[schemars(description = "New description for the issue")]
    pub description: Option<String>,
    #[schemars(description = "New status: 'todo', 'inprogress', 'inreview', 'done', 'cancelled'")]
    pub status: Option<String>,
    #[schemars(description = "Priority level (1=highest, 4=lowest)")]
    pub priority: Option<i32>,
}

/// Issue details for get_issue response
#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct IssueDetails {
    #[schemars(description = "The unique identifier of the issue")]
    pub id: String,
    #[schemars(description = "The issue key (e.g., 'IKA-123')")]
    pub issue_key: String,
    #[schemars(description = "The title of the issue")]
    pub title: String,
    #[schemars(description = "The description of the issue")]
    pub description: Option<String>,
    #[schemars(description = "Current status of the issue")]
    pub status: String,
    #[schemars(description = "Priority level (1=highest, 4=lowest)")]
    pub priority: Option<i32>,
    #[schemars(description = "When the issue was created")]
    pub created_at: String,
    #[schemars(description = "When the issue was last updated")]
    pub updated_at: String,
}

/// Response for get_issue
#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct GetIssueResponse {
    pub issue: IssueDetails,
}

/// Response for update_issue
#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct UpdateIssueResponse {
    pub issue: IssueDetails,
}

// ============================================================================
// Document types
// ============================================================================

/// Document summary for list response
#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct DocumentSummary {
    #[schemars(description = "The unique identifier of the document")]
    pub id: String,
    #[schemars(description = "The name of the document")]
    pub name: String,
    #[schemars(description = "The folder ID if in a folder")]
    pub folder_id: Option<String>,
    #[schemars(description = "When the document was created")]
    pub created_at: String,
    #[schemars(description = "When the document was last updated")]
    pub updated_at: String,
}

/// Document details including content
#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct DocumentDetails {
    #[schemars(description = "The unique identifier of the document")]
    pub id: String,
    #[schemars(description = "The name of the document")]
    pub name: String,
    #[schemars(description = "The content of the document")]
    pub content: Option<String>,
    #[schemars(description = "The folder ID if in a folder")]
    pub folder_id: Option<String>,
    #[schemars(description = "When the document was created")]
    pub created_at: String,
    #[schemars(description = "When the document was last updated")]
    pub updated_at: String,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct ListDocumentsRequest {
    #[schemars(description = "Team identifier (e.g., 'IKA') or team UUID")]
    pub team: String,
    #[schemars(description = "Optional folder ID to filter by")]
    pub folder_id: Option<Uuid>,
}

#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct ListDocumentsResponse {
    pub count: usize,
    pub documents: Vec<DocumentSummary>,
    pub team_identifier: String,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct GetDocumentRequest {
    #[schemars(description = "The document ID")]
    pub document_id: Uuid,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct CreateDocumentRequest {
    #[schemars(description = "Team identifier (e.g., 'IKA') or team UUID")]
    pub team: String,
    #[schemars(description = "The name of the document")]
    pub name: String,
    #[schemars(description = "Optional content of the document")]
    pub content: Option<String>,
    #[schemars(description = "Optional folder ID to place the document in")]
    pub folder_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct UpdateDocumentRequest {
    #[schemars(description = "The document ID")]
    pub document_id: Uuid,
    #[schemars(description = "New name for the document")]
    pub name: Option<String>,
    #[schemars(description = "New content for the document")]
    pub content: Option<String>,
    #[schemars(description = "New folder ID for the document")]
    pub folder_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct DeleteDocumentRequest {
    #[schemars(description = "The document ID")]
    pub document_id: Uuid,
}

// ============================================================================
// Folder types
// ============================================================================

/// Folder summary for list response
#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct FolderSummary {
    #[schemars(description = "The unique identifier of the folder")]
    pub id: String,
    #[schemars(description = "The name of the folder")]
    pub name: String,
    #[schemars(description = "The parent folder ID if nested")]
    pub parent_id: Option<String>,
    #[schemars(description = "When the folder was created")]
    pub created_at: String,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct ListFoldersRequest {
    #[schemars(description = "Team identifier (e.g., 'IKA') or team UUID")]
    pub team: String,
}

#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct ListFoldersResponse {
    pub count: usize,
    pub folders: Vec<FolderSummary>,
    pub team_identifier: String,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct GetFolderRequest {
    #[schemars(description = "The folder ID")]
    pub folder_id: Uuid,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct CreateFolderRequest {
    #[schemars(description = "Team identifier (e.g., 'IKA') or team UUID")]
    pub team: String,
    #[schemars(description = "The name of the folder")]
    pub name: String,
    #[schemars(description = "Optional parent folder ID for nesting")]
    pub parent_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct UpdateFolderRequest {
    #[schemars(description = "The folder ID")]
    pub folder_id: Uuid,
    #[schemars(description = "New name for the folder")]
    pub name: Option<String>,
    #[schemars(description = "New parent folder ID")]
    pub parent_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct DeleteFolderRequest {
    #[schemars(description = "The folder ID")]
    pub folder_id: Uuid,
}

// ============================================================================
// Comment types
// ============================================================================

/// Comment summary for list response
#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct CommentSummary {
    #[schemars(description = "The unique identifier of the comment")]
    pub id: String,
    #[schemars(description = "The content of the comment")]
    pub content: String,
    #[schemars(description = "The name of the comment author")]
    pub author_name: Option<String>,
    #[schemars(description = "When the comment was created")]
    pub created_at: String,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct ListCommentsRequest {
    #[schemars(description = "Task ID (UUID) or issue key (e.g., 'IKA-123')")]
    pub task_id: String,
}

#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct ListCommentsResponse {
    pub count: usize,
    pub comments: Vec<CommentSummary>,
    pub task_id: String,
}

#[derive(Debug, Deserialize, rmcp::schemars::JsonSchema)]
pub struct AddCommentRequest {
    #[schemars(description = "Task ID (UUID) or issue key (e.g., 'IKA-123')")]
    pub task_id: String,
    #[schemars(description = "The content of the comment")]
    pub content: String,
}

#[derive(Debug, Serialize, rmcp::schemars::JsonSchema)]
pub struct AddCommentResponse {
    pub comment_id: String,
    pub task_id: String,
}

// ============================================================================
// Resolved team info (internal use)
// ============================================================================

/// Resolved team information
pub struct ResolvedTeam {
    pub id: Uuid,
    pub identifier: String,
}
