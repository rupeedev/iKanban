//! Documents MCP tools - CRUD operations for team documents

use rmcp::{
    ErrorData,
    handler::server::tool::Parameters,
    model::CallToolResult,
    tool,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::task_server::TaskServer;
use super::teams::resolve_team;
use super::types::*;

/// Document from API response
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct ApiDocument {
    pub id: Uuid,
    pub team_id: Uuid,
    pub name: String,
    pub content: Option<String>,
    pub folder_id: Option<Uuid>,
    pub is_archived: Option<bool>,
    pub created_at: String,
    pub updated_at: String,
}

impl TaskServer {
    /// List documents for a team
    #[tool(
        description = "List documents for a team by team identifier (e.g., 'IKA') or team UUID. Optionally filter by folder."
    )]
    pub async fn list_documents(
        &self,
        Parameters(ListDocumentsRequest { team, folder_id }): Parameters<ListDocumentsRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Resolve team
        let resolved_team = match resolve_team(self, &team).await {
            Ok(t) => t,
            Err(e) => return Ok(e),
        };

        // Build query params
        let mut url = format!("/api/documents?team_id={}", resolved_team.id);
        if let Some(fid) = folder_id {
            url = format!("{}&folder_id={}", url, fid);
        }

        // Get documents
        let documents: Vec<ApiDocument> = match self
            .send_json(self.client().get(&self.url(&url)))
            .await
        {
            Ok(d) => d,
            Err(e) => return Ok(e),
        };

        let doc_summaries: Vec<DocumentSummary> = documents
            .into_iter()
            .map(|d| DocumentSummary {
                id: d.id.to_string(),
                name: d.name,
                folder_id: d.folder_id.map(|f| f.to_string()),
                created_at: d.created_at,
                updated_at: d.updated_at,
            })
            .collect();

        let response = ListDocumentsResponse {
            count: doc_summaries.len(),
            documents: doc_summaries,
            team_identifier: resolved_team.identifier,
        };

        TaskServer::success(&response)
    }

    /// Get a specific document
    #[tool(description = "Get a document by its ID")]
    pub async fn get_document(
        &self,
        Parameters(GetDocumentRequest { document_id }): Parameters<GetDocumentRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/documents/{}", document_id));
        let document: ApiDocument = match self
            .send_json(self.client().get(&url))
            .await
        {
            Ok(d) => d,
            Err(e) => return Ok(e),
        };

        let response = DocumentDetails {
            id: document.id.to_string(),
            name: document.name,
            content: document.content,
            folder_id: document.folder_id.map(|f| f.to_string()),
            created_at: document.created_at,
            updated_at: document.updated_at,
        };

        TaskServer::success(&response)
    }

    /// Create a new document
    #[tool(description = "Create a new document in a team. Team can be identifier (IKA) or UUID.")]
    pub async fn create_document(
        &self,
        Parameters(CreateDocumentRequest {
            team,
            name,
            content,
            folder_id,
        }): Parameters<CreateDocumentRequest>,
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
            content: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            folder_id: Option<Uuid>,
        }

        let payload = CreatePayload {
            team_id: resolved_team.id,
            name,
            content,
            folder_id,
        };

        let url = self.url("/api/documents");
        let document: ApiDocument = match self
            .send_json(self.client().post(&url).json(&payload))
            .await
        {
            Ok(d) => d,
            Err(e) => return Ok(e),
        };

        let response = DocumentDetails {
            id: document.id.to_string(),
            name: document.name,
            content: document.content,
            folder_id: document.folder_id.map(|f| f.to_string()),
            created_at: document.created_at,
            updated_at: document.updated_at,
        };

        TaskServer::success(&response)
    }

    /// Update a document
    #[tool(description = "Update a document's name, content, or folder")]
    pub async fn update_document(
        &self,
        Parameters(UpdateDocumentRequest {
            document_id,
            name,
            content,
            folder_id,
        }): Parameters<UpdateDocumentRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        // Build update payload
        #[derive(Serialize)]
        struct UpdatePayload {
            #[serde(skip_serializing_if = "Option::is_none")]
            name: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            content: Option<String>,
            #[serde(skip_serializing_if = "Option::is_none")]
            folder_id: Option<Uuid>,
        }

        let payload = UpdatePayload {
            name,
            content,
            folder_id,
        };

        let url = self.url(&format!("/api/documents/{}", document_id));
        let document: ApiDocument = match self
            .send_json(self.client().put(&url).json(&payload))
            .await
        {
            Ok(d) => d,
            Err(e) => return Ok(e),
        };

        let response = DocumentDetails {
            id: document.id.to_string(),
            name: document.name,
            content: document.content,
            folder_id: document.folder_id.map(|f| f.to_string()),
            created_at: document.created_at,
            updated_at: document.updated_at,
        };

        TaskServer::success(&response)
    }

    /// Delete a document
    #[tool(description = "Delete a document by its ID")]
    pub async fn delete_document(
        &self,
        Parameters(DeleteDocumentRequest { document_id }): Parameters<DeleteDocumentRequest>,
    ) -> Result<CallToolResult, ErrorData> {
        let url = self.url(&format!("/api/documents/{}", document_id));
        if let Err(e) = self
            .send_json::<serde_json::Value>(self.client().delete(&url))
            .await
        {
            return Ok(e);
        }

        #[derive(Serialize)]
        struct DeleteResponse {
            deleted_document_id: String,
            success: bool,
        }

        let response = DeleteResponse {
            deleted_document_id: document_id.to_string(),
            success: true,
        };

        TaskServer::success(&response)
    }
}
