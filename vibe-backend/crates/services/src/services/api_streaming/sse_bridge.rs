//! SSE to LogMsg Bridge (IKA-51)
//!
//! Converts Server-Sent Events from AI provider APIs to LogMsg format
//! for integration with the existing WebSocket streaming system.

use serde::{Deserialize, Serialize};
use thiserror::Error;
use utils::log_msg::LogMsg;

/// Supported AI providers
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AiProvider {
    Anthropic,
    Google,
    OpenAI,
}

impl std::fmt::Display for AiProvider {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AiProvider::Anthropic => write!(f, "anthropic"),
            AiProvider::Google => write!(f, "google"),
            AiProvider::OpenAI => write!(f, "openai"),
        }
    }
}

/// SSE event representation
#[derive(Debug, Clone)]
pub struct SseEvent {
    /// Event type (optional, may be empty)
    pub event: Option<String>,
    /// Event data (JSON string)
    pub data: String,
}

impl SseEvent {
    pub fn new(data: impl Into<String>) -> Self {
        Self {
            event: None,
            data: data.into(),
        }
    }

    pub fn with_event(mut self, event: impl Into<String>) -> Self {
        self.event = Some(event.into());
        self
    }
}

/// Errors from SSE bridge operations
#[derive(Debug, Error)]
pub enum SseBridgeError {
    #[error("Failed to parse SSE data: {0}")]
    ParseError(String),

    #[error("JSON parsing error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("Unknown event type: {0}")]
    UnknownEvent(String),

    #[error("Stream error: {0}")]
    StreamError(String),
}

/// SSE to LogMsg bridge
///
/// Converts provider-specific SSE events to standardized LogMsg format
pub struct SseBridge {
    provider: AiProvider,
}

impl SseBridge {
    pub fn new(provider: AiProvider) -> Self {
        Self { provider }
    }

    /// Parse an SSE event and convert to LogMsg
    ///
    /// Returns None for events that should be ignored (e.g., keep-alive)
    pub fn parse_event(&self, event: &SseEvent) -> Result<Option<LogMsg>, SseBridgeError> {
        match self.provider {
            AiProvider::Anthropic => self.parse_anthropic(event),
            AiProvider::Google => self.parse_google(event),
            AiProvider::OpenAI => self.parse_openai(event),
        }
    }

    /// Parse Anthropic (Claude) SSE events
    ///
    /// Event types:
    /// - message_start: Contains message_id
    /// - content_block_start: Start of content block (ignored)
    /// - content_block_delta: Text content delta
    /// - content_block_stop: End of content block (ignored)
    /// - message_delta: Message metadata updates (ignored)
    /// - message_stop: End of message
    /// - error: Error event
    fn parse_anthropic(&self, event: &SseEvent) -> Result<Option<LogMsg>, SseBridgeError> {
        let event_type = event.event.as_deref().unwrap_or("");

        // Handle ping/keep-alive
        if event.data.trim().is_empty() || event_type == "ping" {
            return Ok(None);
        }

        match event_type {
            "message_start" => {
                // Extract message ID
                let data: serde_json::Value = serde_json::from_str(&event.data)?;
                if let Some(id) = data
                    .get("message")
                    .and_then(|m| m.get("id"))
                    .and_then(|id| id.as_str())
                {
                    return Ok(Some(LogMsg::SessionId(id.to_string())));
                }
                Ok(None)
            }
            "content_block_delta" => {
                // Extract text delta
                let data: serde_json::Value = serde_json::from_str(&event.data)?;
                if let Some(text) = data
                    .get("delta")
                    .and_then(|d| d.get("text"))
                    .and_then(|t| t.as_str())
                {
                    return Ok(Some(LogMsg::Stdout(text.to_string())));
                }
                Ok(None)
            }
            "message_stop" => Ok(Some(LogMsg::Finished)),
            "error" => {
                let data: serde_json::Value = serde_json::from_str(&event.data)?;
                let error_msg = data
                    .get("error")
                    .and_then(|e| e.get("message"))
                    .and_then(|m| m.as_str())
                    .unwrap_or("Unknown error");
                Ok(Some(LogMsg::Stderr(format!(
                    "Anthropic error: {}",
                    error_msg
                ))))
            }
            // Ignore other event types
            "content_block_start" | "content_block_stop" | "message_delta" => Ok(None),
            _ => {
                tracing::debug!("Ignoring unknown Anthropic event type: {}", event_type);
                Ok(None)
            }
        }
    }

    /// Parse Google (Gemini) SSE events
    ///
    /// Gemini uses a simpler format with candidates array
    fn parse_google(&self, event: &SseEvent) -> Result<Option<LogMsg>, SseBridgeError> {
        // Handle empty data
        if event.data.trim().is_empty() {
            return Ok(None);
        }

        let data: serde_json::Value = serde_json::from_str(&event.data)?;

        // Check for prompt feedback (usually an error or safety issue)
        if let Some(feedback) = data.get("promptFeedback")
            && let Some(block_reason) = feedback.get("blockReason").and_then(|r| r.as_str())
        {
            return Ok(Some(LogMsg::Stderr(format!(
                "Gemini blocked: {}",
                block_reason
            ))));
        }

        // Extract text from candidates
        if let Some(candidates) = data.get("candidates").and_then(|c| c.as_array()) {
            for candidate in candidates {
                // Check for finish reason
                if let Some(finish_reason) = candidate.get("finishReason").and_then(|r| r.as_str())
                {
                    if finish_reason == "STOP" || finish_reason == "END_TURN" {
                        return Ok(Some(LogMsg::Finished));
                    }
                    if finish_reason == "SAFETY" {
                        return Ok(Some(LogMsg::Stderr(
                            "Gemini: Safety filter triggered".into(),
                        )));
                    }
                }

                // Extract text content
                if let Some(parts) = candidate
                    .get("content")
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.as_array())
                {
                    for part in parts {
                        if let Some(text) = part.get("text").and_then(|t| t.as_str()) {
                            return Ok(Some(LogMsg::Stdout(text.to_string())));
                        }
                    }
                }
            }
        }

        Ok(None)
    }

    /// Parse OpenAI SSE events
    ///
    /// OpenAI uses choices array with delta objects
    fn parse_openai(&self, event: &SseEvent) -> Result<Option<LogMsg>, SseBridgeError> {
        let data = event.data.trim();

        // Handle [DONE] marker
        if data == "[DONE]" {
            return Ok(Some(LogMsg::Finished));
        }

        // Handle empty data
        if data.is_empty() {
            return Ok(None);
        }

        let parsed: serde_json::Value = serde_json::from_str(data)?;

        // Check for error
        if let Some(error) = parsed.get("error") {
            let error_msg = error
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown error");
            return Ok(Some(LogMsg::Stderr(format!("OpenAI error: {}", error_msg))));
        }

        // Extract content from choices
        if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
            for choice in choices {
                // Check for finish reason
                if let Some(finish_reason) = choice.get("finish_reason").and_then(|r| r.as_str())
                    && (finish_reason == "stop" || finish_reason == "length")
                {
                    return Ok(Some(LogMsg::Finished));
                }

                // Extract delta content
                if let Some(content) = choice
                    .get("delta")
                    .and_then(|d| d.get("content"))
                    .and_then(|c| c.as_str())
                    && !content.is_empty()
                {
                    return Ok(Some(LogMsg::Stdout(content.to_string())));
                }
            }
        }

        // Extract session/message ID if available
        if let Some(id) = parsed.get("id").and_then(|id| id.as_str()) {
            return Ok(Some(LogMsg::SessionId(id.to_string())));
        }

        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_anthropic_content_delta() {
        let bridge = SseBridge::new(AiProvider::Anthropic);
        let event = SseEvent::new(r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#)
            .with_event("content_block_delta");

        let result = bridge.parse_event(&event).unwrap();
        assert!(matches!(result, Some(LogMsg::Stdout(text)) if text == "Hello"));
    }

    #[test]
    fn test_anthropic_message_stop() {
        let bridge = SseBridge::new(AiProvider::Anthropic);
        let event = SseEvent::new(r#"{"type":"message_stop"}"#).with_event("message_stop");

        let result = bridge.parse_event(&event).unwrap();
        assert!(matches!(result, Some(LogMsg::Finished)));
    }

    #[test]
    fn test_anthropic_message_start_session_id() {
        let bridge = SseBridge::new(AiProvider::Anthropic);
        let event = SseEvent::new(
            r#"{"type":"message_start","message":{"id":"msg_123","type":"message","role":"assistant"}}"#,
        )
        .with_event("message_start");

        let result = bridge.parse_event(&event).unwrap();
        assert!(matches!(result, Some(LogMsg::SessionId(id)) if id == "msg_123"));
    }

    #[test]
    fn test_google_text_content() {
        let bridge = SseBridge::new(AiProvider::Google);
        let event = SseEvent::new(
            r#"{"candidates":[{"content":{"parts":[{"text":"Hello from Gemini"}],"role":"model"}}]}"#,
        );

        let result = bridge.parse_event(&event).unwrap();
        assert!(matches!(result, Some(LogMsg::Stdout(text)) if text == "Hello from Gemini"));
    }

    #[test]
    fn test_google_finish_reason() {
        let bridge = SseBridge::new(AiProvider::Google);
        let event = SseEvent::new(r#"{"candidates":[{"finishReason":"STOP"}]}"#);

        let result = bridge.parse_event(&event).unwrap();
        assert!(matches!(result, Some(LogMsg::Finished)));
    }

    #[test]
    fn test_openai_delta_content() {
        let bridge = SseBridge::new(AiProvider::OpenAI);
        let event = SseEvent::new(
            r#"{"id":"chatcmpl-123","choices":[{"index":0,"delta":{"content":"Hello"}}]}"#,
        );

        let result = bridge.parse_event(&event).unwrap();
        assert!(matches!(result, Some(LogMsg::Stdout(text)) if text == "Hello"));
    }

    #[test]
    fn test_openai_done_marker() {
        let bridge = SseBridge::new(AiProvider::OpenAI);
        let event = SseEvent::new("[DONE]");

        let result = bridge.parse_event(&event).unwrap();
        assert!(matches!(result, Some(LogMsg::Finished)));
    }

    #[test]
    fn test_openai_finish_reason() {
        let bridge = SseBridge::new(AiProvider::OpenAI);
        let event = SseEvent::new(r#"{"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}"#);

        let result = bridge.parse_event(&event).unwrap();
        assert!(matches!(result, Some(LogMsg::Finished)));
    }

    #[test]
    fn test_empty_data_ignored() {
        let bridge = SseBridge::new(AiProvider::Anthropic);
        let event = SseEvent::new("").with_event("ping");

        let result = bridge.parse_event(&event).unwrap();
        assert!(result.is_none());
    }
}
