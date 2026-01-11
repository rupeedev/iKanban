//! API Streaming Module
//!
//! Provides infrastructure for streaming AI provider API responses:
//! - SSE to LogMsg bridge for converting provider-specific events
//! - API log writer for persisting and broadcasting responses

mod log_writer;
mod sse_bridge;

pub use log_writer::ApiLogWriter;
pub use sse_bridge::{AiProvider, SseBridge, SseBridgeError, SseEvent};
