//! Dropbox Storage Provider
//!
//! Implements OAuth 2.0 flow and file operations for Dropbox.

use super::{CloudStorageError, ConnectionStatus, DownloadLinkResult, UploadResult};
use serde::{Deserialize, Serialize};

const DROPBOX_AUTH_URL: &str = "https://www.dropbox.com/oauth2/authorize";
const DROPBOX_TOKEN_URL: &str = "https://api.dropbox.com/oauth2/token";
const DROPBOX_API_URL: &str = "https://api.dropboxapi.com/2";
const DROPBOX_CONTENT_URL: &str = "https://content.dropboxapi.com/2";

/// OAuth token response from Dropbox
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
    pub token_type: String,
    pub account_id: String,
    pub uid: Option<String>,
}

/// Account info from Dropbox
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInfo {
    pub account_id: String,
    pub name: AccountName,
    pub email: String,
    pub email_verified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountName {
    pub given_name: String,
    pub surname: String,
    pub familiar_name: String,
    pub display_name: String,
}

/// File metadata from Dropbox
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DropboxFile {
    #[serde(rename = ".tag")]
    pub tag: String,
    pub id: Option<String>,
    pub name: String,
    pub path_lower: Option<String>,
    pub path_display: Option<String>,
    pub size: Option<u64>,
}

/// Temporary link response
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TempLinkResponse {
    pub metadata: DropboxFile,
    pub link: String,
}

/// Dropbox client
#[derive(Clone)]
pub struct DropboxClient {
    client: reqwest::Client,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
}

impl DropboxClient {
    /// Create a new Dropbox client from environment variables
    pub fn from_env() -> Result<Self, CloudStorageError> {
        let client_id = std::env::var("DROPBOX_CLIENT_ID")
            .map_err(|_| CloudStorageError::Config("DROPBOX_CLIENT_ID not set".to_string()))?;
        let client_secret = std::env::var("DROPBOX_CLIENT_SECRET")
            .map_err(|_| CloudStorageError::Config("DROPBOX_CLIENT_SECRET not set".to_string()))?;
        let redirect_uri = std::env::var("DROPBOX_REDIRECT_URI")
            .unwrap_or_else(|_| "http://localhost:3001/api/storage/dropbox/callback".to_string());

        Self::new(&client_id, &client_secret, &redirect_uri)
    }

    /// Create a new Dropbox client
    pub fn new(client_id: &str, client_secret: &str, redirect_uri: &str) -> Result<Self, CloudStorageError> {
        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        Ok(Self {
            client,
            client_id: client_id.to_string(),
            client_secret: client_secret.to_string(),
            redirect_uri: redirect_uri.to_string(),
        })
    }

    /// Generate OAuth authorization URL
    pub fn get_auth_url(&self, state: &str) -> String {
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&token_access_type=offline&state={}",
            DROPBOX_AUTH_URL,
            urlencoding::encode(&self.client_id),
            urlencoding::encode(&self.redirect_uri),
            urlencoding::encode(state)
        )
    }

    /// Exchange authorization code for tokens
    pub async fn exchange_code(&self, code: &str) -> Result<TokenResponse, CloudStorageError> {
        let params = [
            ("code", code),
            ("client_id", &self.client_id),
            ("client_secret", &self.client_secret),
            ("redirect_uri", &self.redirect_uri),
            ("grant_type", "authorization_code"),
        ];

        let response = self
            .client
            .post(DROPBOX_TOKEN_URL)
            .form(&params)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::OAuth(format!("Token exchange failed: {}", error_body)));
        }

        response
            .json()
            .await
            .map_err(|e| CloudStorageError::OAuth(format!("Failed to parse token response: {}", e)))
    }

    /// Refresh an access token
    pub async fn refresh_token(&self, refresh_token: &str) -> Result<TokenResponse, CloudStorageError> {
        let params = [
            ("refresh_token", refresh_token),
            ("client_id", &self.client_id),
            ("client_secret", &self.client_secret),
            ("grant_type", "refresh_token"),
        ];

        let response = self
            .client
            .post(DROPBOX_TOKEN_URL)
            .form(&params)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::OAuth(format!("Token refresh failed: {}", error_body)));
        }

        response
            .json()
            .await
            .map_err(|e| CloudStorageError::OAuth(format!("Failed to parse token response: {}", e)))
    }

    /// Revoke access token
    pub async fn revoke_token(&self, access_token: &str) -> Result<(), CloudStorageError> {
        let response = self
            .client
            .post(&format!("{}/auth/token/revoke", DROPBOX_API_URL))
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::Api(format!("Token revoke failed: {}", error_body)));
        }

        Ok(())
    }

    /// Get current account info
    pub async fn get_current_account(&self, access_token: &str) -> Result<AccountInfo, CloudStorageError> {
        let response = self
            .client
            .post(&format!("{}/users/get_current_account", DROPBOX_API_URL))
            .bearer_auth(access_token)
            .header("Content-Type", "application/json")
            .body("null")
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::Api(format!("Failed to get account info: {}", error_body)));
        }

        response
            .json()
            .await
            .map_err(|e| CloudStorageError::Api(format!("Failed to parse account info: {}", e)))
    }

    /// Create a folder in Dropbox
    pub async fn create_folder(
        &self,
        access_token: &str,
        path: &str,
    ) -> Result<DropboxFile, CloudStorageError> {
        let body = serde_json::json!({
            "path": path,
            "autorename": false
        });

        let response = self
            .client
            .post(&format!("{}/files/create_folder_v2", DROPBOX_API_URL))
            .bearer_auth(access_token)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        // If folder already exists, that's OK
        if response.status() == reqwest::StatusCode::CONFLICT {
            // Return a placeholder response
            return Ok(DropboxFile {
                tag: "folder".to_string(),
                id: None,
                name: path.split('/').last().unwrap_or(path).to_string(),
                path_lower: Some(path.to_lowercase()),
                path_display: Some(path.to_string()),
                size: None,
            });
        }

        if !response.status().is_success() {
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::Api(format!("Failed to create folder: {}", error_body)));
        }

        #[derive(Deserialize)]
        struct FolderResponse {
            metadata: DropboxFile,
        }

        let result: FolderResponse = response
            .json()
            .await
            .map_err(|e| CloudStorageError::Api(format!("Failed to parse folder response: {}", e)))?;

        Ok(result.metadata)
    }

    /// Upload a file to Dropbox
    pub async fn upload_file(
        &self,
        access_token: &str,
        path: &str,
        content: Vec<u8>,
    ) -> Result<UploadResult, CloudStorageError> {
        let api_arg = serde_json::json!({
            "path": path,
            "mode": "add",
            "autorename": true,
            "mute": false
        });

        let response = self
            .client
            .post(&format!("{}/files/upload", DROPBOX_CONTENT_URL))
            .bearer_auth(access_token)
            .header("Content-Type", "application/octet-stream")
            .header("Dropbox-API-Arg", api_arg.to_string())
            .body(content.clone())
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::UploadFailed(format!("Upload failed: {}", error_body)));
        }

        let file: DropboxFile = response
            .json()
            .await
            .map_err(|e| CloudStorageError::Api(format!("Failed to parse upload response: {}", e)))?;

        Ok(UploadResult {
            file_id: file.id.unwrap_or_else(|| path.to_string()),
            name: file.name,
            size: content.len() as i64,
            mime_type: "application/octet-stream".to_string(), // Dropbox doesn't return MIME type
            web_link: None,
        })
    }

    /// Get a temporary download link (valid for 4 hours)
    pub async fn get_temporary_link(
        &self,
        access_token: &str,
        path: &str,
    ) -> Result<DownloadLinkResult, CloudStorageError> {
        let body = serde_json::json!({
            "path": path
        });

        let response = self
            .client
            .post(&format!("{}/files/get_temporary_link", DROPBOX_API_URL))
            .bearer_auth(access_token)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::CONFLICT {
            // Path not found
            return Err(CloudStorageError::NotFound(path.to_string()));
        }

        if !response.status().is_success() {
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::Api(format!("Failed to get download link: {}", error_body)));
        }

        let result: TempLinkResponse = response
            .json()
            .await
            .map_err(|e| CloudStorageError::Api(format!("Failed to parse link response: {}", e)))?;

        Ok(DownloadLinkResult {
            url: result.link,
            expires_in: Some(4 * 60 * 60), // 4 hours in seconds
        })
    }

    /// Delete a file from Dropbox
    pub async fn delete_file(&self, access_token: &str, path: &str) -> Result<(), CloudStorageError> {
        let body = serde_json::json!({
            "path": path
        });

        let response = self
            .client
            .post(&format!("{}/files/delete_v2", DROPBOX_API_URL))
            .bearer_auth(access_token)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        // 409 Conflict with path_lookup/not_found is OK for delete (idempotent)
        if response.status() == reqwest::StatusCode::CONFLICT {
            return Ok(());
        }

        if !response.status().is_success() {
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::Api(format!("Failed to delete file: {}", error_body)));
        }

        Ok(())
    }

    /// Get connection status
    pub async fn get_status(&self, access_token: &str) -> Result<ConnectionStatus, CloudStorageError> {
        match self.get_current_account(access_token).await {
            Ok(account) => Ok(ConnectionStatus {
                connected: true,
                provider: "dropbox".to_string(),
                email: Some(account.email),
                account_id: Some(account.account_id),
                folder_id: None,
                folder_name: None,
            }),
            Err(_) => Ok(ConnectionStatus {
                connected: false,
                provider: "dropbox".to_string(),
                email: None,
                account_id: None,
                folder_id: None,
                folder_name: None,
            }),
        }
    }
}

/// URL encoding helper
mod urlencoding {
    pub fn encode(s: &str) -> String {
        url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
    }
}
