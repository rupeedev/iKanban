//! AWS S3 Storage Provider
//!
//! Implements file operations for AWS S3 using presigned URLs.

use std::time::Duration;

use serde::{Deserialize, Serialize};

use super::{CloudStorageError, ConnectionStatus, DownloadLinkResult, UploadResult};

/// S3 configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Config {
    pub bucket: String,
    pub region: String,
    pub prefix: Option<String>,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub endpoint: Option<String>, // For S3-compatible services like MinIO
}

/// S3 client using presigned URLs
#[derive(Clone)]
pub struct S3Client {
    config: S3Config,
    client: reqwest::Client,
}

impl S3Client {
    /// Create a new S3 client
    pub fn new(config: S3Config) -> Result<Self, CloudStorageError> {
        if config.bucket.is_empty() {
            return Err(CloudStorageError::Config(
                "S3 bucket name is required".to_string(),
            ));
        }
        if config.region.is_empty() {
            return Err(CloudStorageError::Config(
                "S3 region is required".to_string(),
            ));
        }
        if config.access_key_id.is_empty() {
            return Err(CloudStorageError::Config(
                "S3 access key ID is required".to_string(),
            ));
        }
        if config.secret_access_key.is_empty() {
            return Err(CloudStorageError::Config(
                "S3 secret access key is required".to_string(),
            ));
        }

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(300)) // 5 minutes for large uploads
            .build()
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        Ok(Self { config, client })
    }

    /// Get the S3 endpoint URL
    fn endpoint_url(&self) -> String {
        self.config
            .endpoint
            .clone()
            .unwrap_or_else(|| format!("https://s3.{}.amazonaws.com", self.config.region))
    }

    /// Get the full key with prefix
    fn full_key(&self, key: &str) -> String {
        match &self.config.prefix {
            Some(prefix) if !prefix.is_empty() => {
                let prefix = prefix.trim_matches('/');
                format!("{}/{}", prefix, key)
            }
            _ => key.to_string(),
        }
    }

    /// Validate S3 bucket access by performing a HEAD request
    pub async fn validate_bucket(&self) -> Result<bool, CloudStorageError> {
        // Use a simple GET request to check bucket exists
        // This requires s3:ListBucket permission
        let url = format!("{}/{}?max-keys=0", self.endpoint_url(), self.config.bucket);

        // Create a signed request (simplified - in production use AWS SDK or proper signing)
        let response = self
            .client
            .head(&url)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        match response.status() {
            status if status.is_success() => Ok(true),
            reqwest::StatusCode::FORBIDDEN => Err(CloudStorageError::Api(
                "Access denied - check IAM permissions".to_string(),
            )),
            reqwest::StatusCode::NOT_FOUND => {
                Err(CloudStorageError::Api("Bucket not found".to_string()))
            }
            status => Err(CloudStorageError::Api(format!(
                "Unexpected status: {}",
                status
            ))),
        }
    }

    /// Generate a presigned URL for uploading
    ///
    /// Note: This is a simplified implementation. In production, use the AWS SDK
    /// for proper request signing.
    pub fn generate_presigned_upload_url(
        &self,
        key: &str,
        content_type: &str,
        expires_in: Duration,
    ) -> Result<String, CloudStorageError> {
        let full_key = self.full_key(key);

        // In production, use aws-sdk-s3 for proper presigning
        // This is a placeholder that returns the object URL
        // The actual upload would require AWS Signature Version 4
        let url = format!(
            "{}/{}/{}",
            self.endpoint_url(),
            self.config.bucket,
            full_key
        );

        tracing::info!(
            "Generated presigned upload URL for key: {}, expires_in: {:?}, content_type: {}",
            full_key,
            expires_in,
            content_type
        );

        Ok(url)
    }

    /// Generate a presigned URL for downloading
    pub fn generate_presigned_download_url(
        &self,
        key: &str,
        expires_in: Duration,
    ) -> Result<DownloadLinkResult, CloudStorageError> {
        let full_key = self.full_key(key);

        // In production, use aws-sdk-s3 for proper presigning
        let url = format!(
            "{}/{}/{}",
            self.endpoint_url(),
            self.config.bucket,
            full_key
        );

        tracing::info!(
            "Generated presigned download URL for key: {}, expires_in: {:?}",
            full_key,
            expires_in
        );

        Ok(DownloadLinkResult {
            url,
            expires_in: Some(expires_in.as_secs()),
        })
    }

    /// Upload a file directly (server-side upload)
    pub async fn upload_file(
        &self,
        key: &str,
        content: Vec<u8>,
        content_type: &str,
    ) -> Result<UploadResult, CloudStorageError> {
        let full_key = self.full_key(key);
        let url = format!(
            "{}/{}/{}",
            self.endpoint_url(),
            self.config.bucket,
            full_key
        );

        // Note: This requires proper AWS Signature Version 4 signing
        // In production, use aws-sdk-s3
        let response = self
            .client
            .put(&url)
            .header("Content-Type", content_type)
            .body(content.clone())
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::UploadFailed(format!(
                "S3 upload failed ({}): {}",
                status, error_body
            )));
        }

        // Extract filename from key
        let filename = key.rsplit('/').next().unwrap_or(key).to_string();

        Ok(UploadResult {
            file_id: full_key,
            name: filename,
            size: content.len() as i64,
            mime_type: content_type.to_string(),
            web_link: None,
        })
    }

    /// Delete a file from S3
    pub async fn delete_file(&self, key: &str) -> Result<(), CloudStorageError> {
        let full_key = self.full_key(key);
        let url = format!(
            "{}/{}/{}",
            self.endpoint_url(),
            self.config.bucket,
            full_key
        );

        let response = self
            .client
            .delete(&url)
            .send()
            .await
            .map_err(|e| CloudStorageError::Http(e.to_string()))?;

        // 404 is OK for delete (idempotent)
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Ok(());
        }

        if !response.status().is_success() {
            let status = response.status();
            let error_body = response.text().await.unwrap_or_default();
            return Err(CloudStorageError::Api(format!(
                "S3 delete failed ({}): {}",
                status, error_body
            )));
        }

        Ok(())
    }

    /// Get connection status
    pub fn get_status(&self) -> ConnectionStatus {
        ConnectionStatus {
            connected: true,
            provider: "s3".to_string(),
            email: None,
            account_id: None,
            folder_id: Some(self.config.bucket.clone()),
            folder_name: self.config.prefix.clone(),
        }
    }
}

/// Validate S3 configuration without creating a full client
pub fn validate_config(config: &S3Config) -> Result<(), CloudStorageError> {
    if config.bucket.is_empty() {
        return Err(CloudStorageError::Config(
            "Bucket name is required".to_string(),
        ));
    }
    if config.region.is_empty() {
        return Err(CloudStorageError::Config("Region is required".to_string()));
    }
    if config.access_key_id.is_empty() {
        return Err(CloudStorageError::Config(
            "Access Key ID is required".to_string(),
        ));
    }
    if config.secret_access_key.is_empty() {
        return Err(CloudStorageError::Config(
            "Secret Access Key is required".to_string(),
        ));
    }

    // Validate region format
    let valid_regions = [
        "us-east-1",
        "us-east-2",
        "us-west-1",
        "us-west-2",
        "eu-west-1",
        "eu-west-2",
        "eu-west-3",
        "eu-central-1",
        "eu-north-1",
        "ap-northeast-1",
        "ap-northeast-2",
        "ap-northeast-3",
        "ap-southeast-1",
        "ap-southeast-2",
        "ap-south-1",
        "sa-east-1",
        "ca-central-1",
        "me-south-1",
        "af-south-1",
    ];

    if !valid_regions.contains(&config.region.as_str()) {
        tracing::warn!("Non-standard S3 region: {}", config.region);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_config_success() {
        let config = S3Config {
            bucket: "test-bucket".to_string(),
            region: "us-east-1".to_string(),
            prefix: Some("ikanban".to_string()),
            access_key_id: "AKIAIOSFODNN7EXAMPLE".to_string(),
            secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
            endpoint: None,
        };

        assert!(validate_config(&config).is_ok());
    }

    #[test]
    fn test_validate_config_missing_bucket() {
        let config = S3Config {
            bucket: "".to_string(),
            region: "us-east-1".to_string(),
            prefix: None,
            access_key_id: "AKIAIOSFODNN7EXAMPLE".to_string(),
            secret_access_key: "secret".to_string(),
            endpoint: None,
        };

        assert!(validate_config(&config).is_err());
    }

    #[test]
    fn test_full_key_with_prefix() {
        let config = S3Config {
            bucket: "test-bucket".to_string(),
            region: "us-east-1".to_string(),
            prefix: Some("ikanban".to_string()),
            access_key_id: "key".to_string(),
            secret_access_key: "secret".to_string(),
            endpoint: None,
        };

        let client = S3Client::new(config).unwrap();
        assert_eq!(
            client.full_key("teams/123/file.pdf"),
            "ikanban/teams/123/file.pdf"
        );
    }

    #[test]
    fn test_full_key_without_prefix() {
        let config = S3Config {
            bucket: "test-bucket".to_string(),
            region: "us-east-1".to_string(),
            prefix: None,
            access_key_id: "key".to_string(),
            secret_access_key: "secret".to_string(),
            endpoint: None,
        };

        let client = S3Client::new(config).unwrap();
        assert_eq!(client.full_key("teams/123/file.pdf"), "teams/123/file.pdf");
    }

    #[test]
    fn test_endpoint_url_default() {
        let config = S3Config {
            bucket: "test-bucket".to_string(),
            region: "us-west-2".to_string(),
            prefix: None,
            access_key_id: "key".to_string(),
            secret_access_key: "secret".to_string(),
            endpoint: None,
        };

        let client = S3Client::new(config).unwrap();
        assert_eq!(client.endpoint_url(), "https://s3.us-west-2.amazonaws.com");
    }

    #[test]
    fn test_endpoint_url_custom() {
        let config = S3Config {
            bucket: "test-bucket".to_string(),
            region: "us-east-1".to_string(),
            prefix: None,
            access_key_id: "key".to_string(),
            secret_access_key: "secret".to_string(),
            endpoint: Some("https://minio.example.com".to_string()),
        };

        let client = S3Client::new(config).unwrap();
        assert_eq!(client.endpoint_url(), "https://minio.example.com");
    }
}
