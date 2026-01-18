use std::path::PathBuf;

use crate::executors::BaseCodingAgent;

/// Storage location type for agent configurations
#[derive(Debug, Clone, PartialEq)]
pub enum AgentStorageLocation {
    /// Local project file (e.g., .claude/profiles.json, .github/profiles.json)
    Local(PathBuf),
    /// Database storage (for remote/API agents)
    Database,
}

/// Detect recommended storage location for an agent type
pub fn detect_recommended_storage(agent: &BaseCodingAgent) -> AgentStorageLocation {
    match agent {
        // Local agents that work with project-specific configs
        BaseCodingAgent::ClaudeCode => {
            AgentStorageLocation::Local(PathBuf::from(".claude/profiles.json"))
        }
        BaseCodingAgent::Copilot => {
            AgentStorageLocation::Local(PathBuf::from(".github/profiles.json"))
        }
        // Remote/API agents that need cross-session persistence
        BaseCodingAgent::Droid
        | BaseCodingAgent::Amp
        | BaseCodingAgent::Gemini
        | BaseCodingAgent::Codex
        | BaseCodingAgent::Opencode
        | BaseCodingAgent::QwenCode
        | BaseCodingAgent::CursorAgent
        | BaseCodingAgent::Claude => AgentStorageLocation::Database,
    }
}

/// Get the local config path for an agent type if it uses local storage
pub fn get_local_config_path(agent: &BaseCodingAgent) -> Option<PathBuf> {
    match detect_recommended_storage(agent) {
        AgentStorageLocation::Local(path) => Some(path),
        AgentStorageLocation::Database => None,
    }
}

/// Check if agent type is recommended for local storage
pub fn is_local_agent(agent: &BaseCodingAgent) -> bool {
    matches!(
        detect_recommended_storage(agent),
        AgentStorageLocation::Local(_)
    )
}

/// Check if agent type is recommended for database storage
pub fn is_database_agent(agent: &BaseCodingAgent) -> bool {
    matches!(
        detect_recommended_storage(agent),
        AgentStorageLocation::Database
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_claude_code_uses_local_storage() {
        let storage = detect_recommended_storage(&BaseCodingAgent::ClaudeCode);
        assert_eq!(
            storage,
            AgentStorageLocation::Local(PathBuf::from(".claude/profiles.json"))
        );
        assert!(is_local_agent(&BaseCodingAgent::ClaudeCode));
        assert!(!is_database_agent(&BaseCodingAgent::ClaudeCode));
    }

    #[test]
    fn test_copilot_uses_local_storage() {
        let storage = detect_recommended_storage(&BaseCodingAgent::Copilot);
        assert_eq!(
            storage,
            AgentStorageLocation::Local(PathBuf::from(".github/profiles.json"))
        );
        assert!(is_local_agent(&BaseCodingAgent::Copilot));
        assert!(!is_database_agent(&BaseCodingAgent::Copilot));
    }

    #[test]
    fn test_droid_uses_database_storage() {
        let storage = detect_recommended_storage(&BaseCodingAgent::Droid);
        assert_eq!(storage, AgentStorageLocation::Database);
        assert!(!is_local_agent(&BaseCodingAgent::Droid));
        assert!(is_database_agent(&BaseCodingAgent::Droid));
    }

    #[test]
    fn test_get_local_config_path() {
        assert_eq!(
            get_local_config_path(&BaseCodingAgent::ClaudeCode),
            Some(PathBuf::from(".claude/profiles.json"))
        );
        assert_eq!(
            get_local_config_path(&BaseCodingAgent::Copilot),
            Some(PathBuf::from(".github/profiles.json"))
        );
        assert_eq!(get_local_config_path(&BaseCodingAgent::Droid), None);
    }
}
