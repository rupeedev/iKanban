//! Google Drive Storage Provider
//!
//! Implements OAuth 2.0 flow and file operations for Google Drive.

use super::{CloudStorageError, ConnectionStatus, DownloadLinkResult, UploadResult};
use serde::{Deserialize, Serialize};

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_API_URL: &str = "https://www.googleapis.com/drive/v3";
const GOOGLE_UPLOAD_URL: &str = "https://www.googleapis.com/upload/drive/v3";
const GOOGLE_USERINFO_URL: &str = "https://www.googleapis.com/oauth2/v2/userinfo";

/// Scopes required for Google Drive access
const SCOPES: &[&str] = &[
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
];

/// OAuth token response from Google
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i64,
    pub token_type: String,
    pub scope: Option<String>,
}

/// User info from Google
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserInfo {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub picture: Option<String>,
}

/// File metadata from Google Drive
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriveFile {
    pub id: String,
    pub name: String,
    #[serde(rename = "mimeType")]
    pub mime_type: String,
    pub size: Option<String>,
    #[serde(rename = "webViewLink")]
    pub web_view_link: Option<String>,
    #[serde(rename = "webContentLink")]
    pub web_content_link: Option<String>,
}

/// Google Drive client
#[derive(Clone)]
pub struct GoogleDriveClient {
    client: reqwest::Client,
    client_id: String,
    client_secret: String,
    redirect_uri: String,
}

impl GoogleDriveClient {
    /// Create a new Google Drive client from environment variables
    pub fn from_env() -> Result<Self, CloudStorageError> {
        let client_id = std::env::var("GOOGLE_CLIENT_ID")
            .map_err(|_| CloudStorageError::Config("GOOGLE_CLIENT_ID not set".to_string()))?;
        let client_secret = std::env::var("GOOGLE_CLIENT_SECRET")
            .map_err(|_| CloudStorageError::Config("GOOGLE_CLIENT_SECRET not set".to_string()))?;
        let redirect_uri = std::env::var("GOOGLE_REDIRECT_URI")
            .unwrap_or_else(|_| "http://localhost:3001/api/storage/google-drive/callback".to_string());

        Self::new(&client_id, &client_secret, &redirect_uri)
    }

    /// Create a new Google Drive client
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
        let scope = SCOPES.join(" ");
        format!(
            "{}?client_id={}&redirect_uri={}&response_type=code&scope={}&access_type=offline&prompt=consent&state={}",
            GOOGLE_AUTH_URL,
            urlencoding::encode(&self.client_id),
            urlencoding::encode(&self.redirect_uri),
            urlencoding::encode(&scope),
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
            .post(GOOGLE_TOKEN_URL)
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
            .post(GOOGLE_TOKEN_URL)
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

    /// Get user info using access token
    pub async fn get_user_info(&self, access_token: &str) -> Result<UserInfo, CloudStorageError> {
        let response = self
            .client
            .get(GOOGLE_USERINFO_URL)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::Api(format!("Failed to get user info: {}", error_body)));
        }

        response
            .json()
            .await
            .map_err(|e| CloudStorageError::Api(format!("Failed to parse user info: {}", e)))
    }

    /// Create a folder in Google Drive
    pub async fn create_folder(
        &self,
        access_token: &str,
        name: &str,
        parent_id: Option<&str>,
    ) -> Result<DriveFile, CloudStorageError> {
        let mut metadata = serde_json::json!({
            "name": name,
            "mimeType": "application/vnd.google-apps.folder"
        });

        if let Some(parent) = parent_id {
            metadata["parents"] = serde_json::json!([parent]);
        }

        let response = self
            .client
            .post(&format!("{}/files", GOOGLE_DRIVE_API_URL))
            .bearer_auth(access_token)
            .json(&metadata)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::Api(format!("Failed to create folder: {}", error_body)));
        }

        response
            .json()
            .await
            .map_err(|e| CloudStorageError::Api(format!("Failed to parse folder response: {}", e)))
    }

    /// Upload a file to Google Drive
    pub async fn upload_file(
        &self,
        access_token: &str,
        filename: &str,
        content: Vec<u8>,
        mime_type: &str,
        parent_id: Option<&str>,
    ) -> Result<UploadResult, CloudStorageError> {
        // Create file metadata
        let mut metadata = serde_json::json!({
            "name": filename
        });

        if let Some(parent) = parent_id {
            metadata["parents"] = serde_json::json!([parent]);
        }

        // Use multipart upload
        let metadata_part = reqwest::multipart::Part::text(metadata.to_string())
            .mime_str("application/json")
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        let file_part = reqwest::multipart::Part::bytes(content.clone())
            .mime_str(mime_type)
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        let form = reqwest::multipart::Form::new()
            .part("metadata", metadata_part)
            .part("file", file_part);

        let response = self
            .client
            .post(&format!("{}/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,webContentLink", GOOGLE_UPLOAD_URL))
            .bearer_auth(access_token)
            .multipart(form)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::UploadFailed(format!("Upload failed: {}", error_body)));
        }

        let file: DriveFile = response
            .json()
            .await
            .map_err(|e| CloudStorageError::Api(format!("Failed to parse upload response: {}", e)))?;

        Ok(UploadResult {
            file_id: file.id,
            name: file.name,
            size: content.len() as i64,
            mime_type: file.mime_type,
            web_link: file.web_view_link,
        })
    }

    /// Get a download link for a file
    pub async fn get_download_link(
        &self,
        access_token: &str,
        file_id: &str,
    ) -> Result<DownloadLinkResult, CloudStorageError> {
        // Get file metadata with download link
        let response = self
            .client
            .get(&format!("{}/files/{}?fields=webContentLink", GOOGLE_DRIVE_API_URL, file_id))
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(CloudStorageError::NotFound(file_id.to_string()));
        }

        if !response.status().is_success() {
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::Api(format!("Failed to get file: {}", error_body)));
        }

        let file: DriveFile = response
            .json()
            .await
            .map_err(|e| CloudStorageError::Api(format!("Failed to parse file response: {}", e)))?;

        // Use webContentLink if available, otherwise construct download URL
        let url = file
            .web_content_link
            .unwrap_or_else(|| format!("{}/files/{}?alt=media", GOOGLE_DRIVE_API_URL, file_id));

        Ok(DownloadLinkResult {
            url,
            expires_in: None, // Google Drive links don't expire
        })
    }

    /// Delete a file from Google Drive
    pub async fn delete_file(&self, access_token: &str, file_id: &str) -> Result<(), CloudStorageError> {
        let response = self
            .client
            .delete(&format!("{}/files/{}", GOOGLE_DRIVE_API_URL, file_id))
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        // 404 is OK for delete (idempotent)
        if response.status() == reqwest::StatusCode::NOT_FOUND {
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
        match self.get_user_info(access_token).await {
            Ok(user) => Ok(ConnectionStatus {
                connected: true,
                provider: "google_drive".to_string(),
                email: Some(user.email),
                account_id: Some(user.id),
                folder_id: None,
                folder_name: None,
            }),
            Err(_) => Ok(ConnectionStatus {
                connected: false,
                provider: "google_drive".to_string(),
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
