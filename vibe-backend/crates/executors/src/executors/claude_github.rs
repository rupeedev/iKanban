use std::{path::Path, sync::Arc};

use async_trait::async_trait;
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use ts_rs::TS;
use workspace_utils::msg_store::MsgStore;

use crate::{
    env::ExecutionEnv,
    executors::{AvailabilityInfo, ExecutorError, SpawnedChild, StandardCodingAgentExecutor},
};

/// Claude Code Action - marker executor for GitHub issue-based Claude integration (IKA-171).
/// This is not a local executor - it's used to identify @claude mentions that should
/// create GitHub issues and trigger Claude Code Action.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS, JsonSchema)]
pub struct Claude {
    // No configuration needed - this is just a marker
}

impl Default for Claude {
    fn default() -> Self {
        Self {}
    }
}

#[async_trait]
impl StandardCodingAgentExecutor for Claude {
    async fn spawn(
        &self,
        _current_dir: &Path,
        _prompt: &str,
        _env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        // Claude Code Action is not meant to be spawned locally.
        // It's triggered via GitHub issue creation.
        Err(ExecutorError::UnknownExecutorType(
            "Claude Code Action is not a local executor. Use GitHub issue assignment instead."
                .to_string(),
        ))
    }

    async fn spawn_follow_up(
        &self,
        _current_dir: &Path,
        _prompt: &str,
        _session_id: &str,
        _env: &ExecutionEnv,
    ) -> Result<SpawnedChild, ExecutorError> {
        Err(ExecutorError::FollowUpNotSupported(
            "Claude Code Action does not support follow-up".to_string(),
        ))
    }

    fn normalize_logs(&self, _raw_logs_event_store: Arc<MsgStore>, _worktree_path: &Path) {
        // No-op - Claude Code Action doesn't produce logs
    }

    fn default_mcp_config_path(&self) -> Option<std::path::PathBuf> {
        // No MCP config - Claude Code Action works via GitHub
        None
    }

    fn get_availability_info(&self) -> AvailabilityInfo {
        // Always report as available since it works through GitHub
        AvailabilityInfo::InstallationFound
    }
}
