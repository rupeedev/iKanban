//! MCP (Model Context Protocol) server implementation
//!
//! This module provides MCP tools for task and project management.
//! Tools are organized by domain:
//!
//! - `task_server.rs` - Core task operations (create, update, delete, list)
//! - `teams.rs` - Team and issue operations with IKA-123 format support
//! - `documents.rs` - Document CRUD operations
//! - `folders.rs` - Folder CRUD operations
//! - `comments.rs` - Task comment operations
//! - `types.rs` - Shared request/response types

pub mod comments;
pub mod documents;
pub mod folders;
pub mod task_server;
pub mod teams;
pub mod types;

pub use task_server::TaskServer;
