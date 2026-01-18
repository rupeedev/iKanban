//! Cloud Storage Provider Services
//!
//! This module provides integrations with various cloud storage providers:
//! - Google Drive (OAuth 2.0)
//! - AWS S3 (API credentials)
//! - Dropbox (OAuth 2.0)

pub mod dropbox;
pub mod encryption;
pub mod google_drive;
pub mod s3;

use serde::{Deserialize, Serialize};
use thiserror::Error;
use uuid::Uuid;

#[derive(Error, Debug)]
pub enum CloudStorageError {
    #[error("HTTP error: {0}")]
    Http(String),
    #[error("API error: {0}")]
    Api(String),
    #[error("OAuth error: {0}")]
    OAuth(String),
    #[error("Configuration error: {0}")]
    Config(String),
    #[error("Not connected: {0}")]
    NotConnected(String),
    #[error("Upload failed: {0}")]
    UploadFailed(String),
    #[error("Download failed: {0}")]
    DownloadFailed(String),
    #[error("File not found: {0}")]
    NotFound(String),
    #[error("Encryption error: {0}")]
    Encryption(String),
    #[error("Database error: {0}")]
    Database(String),
}

/// Storage provider type
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum StorageProvider {
    GoogleDrive,
    S3,
    Dropbox,
}

impl StorageProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            StorageProvider::GoogleDrive => "google_drive",
            StorageProvider::S3 => "s3",
            StorageProvider::Dropbox => "dropbox",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "google_drive" => Some(StorageProvider::GoogleDrive),
            "s3" => Some(StorageProvider::S3),
            "dropbox" => Some(StorageProvider::Dropbox),
            _ => None,
        }
    }
}

/// Result of an upload operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadResult {
    /// Provider-specific file ID or key
    pub file_id: String,
    /// Display name of the file
    pub name: String,
    /// File size in bytes
    pub size: i64,
    /// MIME type
    pub mime_type: String,
    /// Web view link (if available)
    pub web_link: Option<String>,
}

/// Result of getting a download link
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadLinkResult {
    /// Direct download URL
    pub url: String,
    /// Expiration time in seconds (if applicable)
    pub expires_in: Option<u64>,
}

/// Storage connection status
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionStatus {
    pub connected: bool,
    pub provider: String,
    pub email: Option<String>,
    pub account_id: Option<String>,
    pub folder_id: Option<String>,
    pub folder_name: Option<String>,
}

/// Generate a storage key/path for a file
pub fn generate_storage_path(team_id: Uuid, folder_id: Option<Uuid>, filename: &str) -> String {
    let file_uuid = Uuid::new_v4();
    let sanitized = sanitize_filename(filename);

    match folder_id {
        Some(fid) => format!(
            "teams/{}/folders/{}/{}_{}",
            team_id, fid, file_uuid, sanitized
        ),
        None => format!("teams/{}/documents/{}_{}", team_id, file_uuid, sanitized),
    }
}

/// Sanitize a filename for storage
fn sanitize_filename(filename: &str) -> String {
    filename
        .chars()
        .map(|c| match c {
            c if c.is_alphanumeric() || c == '.' || c == '-' || c == '_' => c,
            ' ' => '_',
            '(' | ')' => '_',
            _ => '_',
        })
        .collect::<String>()
        .split('_')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_storage_provider_from_str() {
        assert_eq!(
            StorageProvider::from_str("google_drive"),
            Some(StorageProvider::GoogleDrive)
        );
        assert_eq!(StorageProvider::from_str("s3"), Some(StorageProvider::S3));
        assert_eq!(
            StorageProvider::from_str("dropbox"),
            Some(StorageProvider::Dropbox)
        );
        assert_eq!(StorageProvider::from_str("unknown"), None);
    }

    #[test]
    fn test_storage_provider_as_str() {
        assert_eq!(StorageProvider::GoogleDrive.as_str(), "google_drive");
        assert_eq!(StorageProvider::S3.as_str(), "s3");
        assert_eq!(StorageProvider::Dropbox.as_str(), "dropbox");
    }

    #[test]
    fn test_generate_storage_path() {
        let team_id = Uuid::parse_str("550e8400-e29b-41d4-a716-446655440000").unwrap();
        let path = generate_storage_path(team_id, None, "test.pdf");
        assert!(path.starts_with(&format!("teams/{}/documents/", team_id)));
        assert!(path.ends_with("_test.pdf"));
    }
}
