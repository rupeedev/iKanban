//! Cloud Storage Routes
//!
//! API endpoints for cloud storage provider integrations:
//! - Google Drive
//! - AWS S3
//! - Dropbox

pub mod dropbox;
pub mod google_drive;
pub mod s3;

use axum::{
    Router,
    routing::{get, post},
};

use crate::DeploymentImpl;

/// Create the storage router with all provider routes
pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        // Google Drive routes
        .route(
            "/storage/google-drive/auth-url",
            post(google_drive::get_auth_url),
        )
        .route(
            "/storage/google-drive/callback",
            get(google_drive::oauth_callback),
        )
        .route(
            "/storage/google-drive/disconnect",
            post(google_drive::disconnect),
        )
        .route(
            "/storage/google-drive/status",
            get(google_drive::get_status),
        )
        // S3 routes
        .route("/storage/s3/validate", post(s3::validate))
        .route("/storage/s3/configure", post(s3::configure))
        .route("/storage/s3/disconnect", post(s3::disconnect))
        .route("/storage/s3/status", get(s3::get_status))
        // Dropbox routes
        .route("/storage/dropbox/auth-url", post(dropbox::get_auth_url))
        .route("/storage/dropbox/callback", get(dropbox::oauth_callback))
        .route("/storage/dropbox/disconnect", post(dropbox::disconnect))
        .route("/storage/dropbox/status", get(dropbox::get_status))
        .with_state(deployment.clone())
}
