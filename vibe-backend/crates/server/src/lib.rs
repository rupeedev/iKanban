//! # DEPRECATED - Local Server Crate
//!
//! **This crate is in maintenance mode. Do NOT add new features here.**
//!
//! All new backend development should go to `crates/remote`.
//! See `DEPRECATED.md` in this crate for details.
//!
//! ## What remains here:
//! - `bin/mcp_task_server.rs` - MCP binary (uses `remote::mcp::TaskServer`)
//! - Legacy local server code (frozen)

#![deprecated(since = "0.1.0", note = "Use crates/remote for new development")]

pub mod error;
pub mod file_reader;
pub mod middleware;
pub mod routes;

// #[cfg(feature = "cloud")]
// type DeploymentImpl = vibe_kanban_cloud::deployment::CloudDeployment;
// #[cfg(not(feature = "cloud"))]
pub type DeploymentImpl = local_deployment::LocalDeployment;
