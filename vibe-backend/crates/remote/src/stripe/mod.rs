//! Stripe integration for subscription management (IKA-181)
//!
//! This module provides Stripe payment integration for workspace subscriptions.

mod service;
mod webhook;

pub use service::StripeService;
pub use webhook::{StripeWebhookEvent, parse_webhook_event, verify_webhook_signature};
