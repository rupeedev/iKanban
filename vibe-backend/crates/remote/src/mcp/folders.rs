//! Folders MCP tools - CRUD operations for team document folders

use rmcp::{ErrorData, handler::server::tool::Parameters, model::CallToolResult, tool};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{task_server::TaskServer, teams::resolve_team, types::*};

/// Folder from API response
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ApiFolder {
    pub id: Uuid,
    pub team_id: Uuid,
    pub name: String,
    pub parent_id: Option<Uuid>,
    pub created_at: String,
    pub updated_at: String,
}

impl TaskServer {
    /// List folders for a team
    #[tool(
        description = "List document folders for a team by team identifier (e.g., 'IKA') or team UUID."
    )]
    pub async fn list_folders(
        &self,
        Parameters(ListFoldersRequest { team }): Parameters<ListFoldersRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Resolve team
        let resolved_team = match resolve_team(self, &team).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        // Get folders
        let url = format!("/api/folders?team_id={}", resolved_team.id);
        let folders: Vec<ApiFolder> = match self.send_json(self.client().get(self.url(&url))).await
        {
            Ok(f) => f,
            Err(e) => return Ok(e),
        };

        let folder_summaries: Vec<FolderSummary> = folders
            .into_iter()
            .map(|f| FolderSummary {
                id: f.id.to_string(),
                name: f.name,
                parent_id: f.parent_id.map(|p| p.to_string()),
                created_at: f.created_at,
            })
            .collect();

        let response = ListFoldersResponse {
            count: folder_summaries.len(),
            folders: folder_summaries,
            team_identifier: resolved_team.identifier,
        };

        TaskServer::success(&response)
    }

    /// Get a specific folder
    #[tool(description = "Get a folder by its ID")]
    pub async fn get_folder(
        &self,
        Parameters(GetFolderRequest { folder_id }): Parameters<GetFolderRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/folders/{}", folder_id));
        let folder: ApiFolder = match self.send_json(self.client().get(&url)).await {
            Ok(f) => f,
            Err(e) => return Ok(e),
        };

        let response = FolderSummary {
            id: folder.id.to_string(),
            name: folder.name,
            parent_id: folder.parent_id.map(|p| p.to_string()),
            created_at: folder.created_at,
        };

        TaskServer::success(&response)
    }

    /// Create a new folder
    #[tool(description = "Create a new folder in a team. Team can be identifier (IKA) or UUID.")]
    pub async fn create_folder(
        &self,
        Parameters(CreateFolderRequest {
            team,
            name,
            parent_id,
        }): Parameters<CreateFolderRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Resolve team
        let resolved_team = match resolve_team(self, &team).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        // Build create payload
        #[derive(Serialize)]
        struct CreatePayload {
            team_id: Uuid,
            name: String,
            #[serde(skip_serializing_if = "Option::is_none")]
            parent_id: Option<Uuid>,
        }

        let payload = CreatePayload {
            team_id: resolved_team.id,
            name,
            parent_id,
        };

        let url = self.url("/api/folders");
        let folder: ApiFolder = match self
            .send_json(self.client().post(&url).json(&payload))
            .await
        {
            Ok(f) => f,
            Err(e) => return Ok(e),
        };

        let response = FolderSummary {
            id: folder.id.to_string(),
            name: folder.name,
            parent_id: folder.parent_id.map(|p| p.to_string()),
            created_at: folder.created_at,
        };

        TaskServer::success(&response)
    }

    /// Update a folder
    #[tool(description = "Update a folder's name or parent folder")]
    pub async fn update_folder(
        &self,
        Parameters(UpdateFolderRequest {
            folder_id,
            name,
            parent_id,
        }): Parameters<UpdateFolderRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Build update payload
        #[derive(Serialize)]
        struct UpdatePayload {
            #[serde(skip_serializing_if = "Option::is_none")]
            name: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            parent_id: Option<Uuid>,
        }

        let payload = UpdatePayload { name, parent_id };

        let url = self.url(&format!("/api/folders/{}", folder_id));
        let folder: ApiFolder = match self.send_json(self.client().put(&url).json(&payload)).await {
            Ok(f) => f,
            Err(e) => return Ok(e),
        };

        let response = FolderSummary {
            id: folder.id.to_string(),
            name: folder.name,
            parent_id: folder.parent_id.map(|p| p.to_string()),
            created_at: folder.created_at,
        };

        TaskServer::success(&response)
    }

    /// Delete a folder
    #[tool(description = "Delete a folder by its ID")]
    pub async fn delete_folder(
        &self,
        Parameters(DeleteFolderRequest { folder_id }): Parameters<DeleteFolderRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/folders/{}", folder_id));
        if let Err(e) = self
            .send_json::<serde_json::Value>(self.client().delete(&url))
            .await
        {
            return Ok(e);
        }

        #[derive(Serialize)]
        struct DeleteResponse {
            deleted_folder_id: String,
            success: bool,
        }

        let response = DeleteResponse {
            deleted_folder_id: folder_id.to_string(),
            success: true,
        };

        TaskServer::success(&response)
    }
}
