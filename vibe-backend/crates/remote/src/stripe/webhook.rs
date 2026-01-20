//! Stripe webhook signature verification and event parsing (IKA-181)

use std::time::{SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use secrecy::ExposeSecret;
use sha2::Sha256;

use crate::config::StripeConfig;

/// Webhook event types we care about
#[derive(Debug, Clone)]
pub enum StripeWebhookEvent {
    /// checkout.session.completed - User completed checkout
    CheckoutSessionCompleted {
        session_id: String,
        customer_id: String,
        subscription_id: Option<String>,
        workspace_id: Option<String>,
    },
    /// customer.subscription.created
    SubscriptionCreated {
        subscription_id: String,
        customer_id: String,
        status: String,
        workspace_id: Option<String>,
    },
    /// customer.subscription.updated
    SubscriptionUpdated {
        subscription_id: String,
        customer_id: String,
        status: String,
        workspace_id: Option<String>,
        current_period_start: Option<i64>,
        current_period_end: Option<i64>,
    },
    /// customer.subscription.deleted
    SubscriptionDeleted {
        subscription_id: String,
        customer_id: String,
        workspace_id: Option<String>,
    },
    /// invoice.paid
    InvoicePaid {
        invoice_id: String,
        subscription_id: Option<String>,
        customer_id: String,
    },
    /// invoice.payment_failed
    InvoicePaymentFailed {
        invoice_id: String,
        subscription_id: Option<String>,
        customer_id: String,
    },
    /// Unknown event type
    Unknown { event_type: String },
}

/// Error types for webhook processing
#[derive(Debug, thiserror::Error)]
pub enum WebhookError {
    #[error("Invalid signature")]
    InvalidSignature,
    #[error("Timestamp too old")]
    TimestampTooOld,
    #[error("Missing header: {0}")]
    MissingHeader(String),
    #[error("Invalid payload: {0}")]
    InvalidPayload(String),
}

/// Verify Stripe webhook signature
///
/// Stripe sends a `Stripe-Signature` header with format:
/// `t=timestamp,v1=signature`
pub fn verify_webhook_signature(
    payload: &[u8],
    signature_header: &str,
    config: &StripeConfig,
) -> Result<(), WebhookError> {
    // Parse signature header
    let mut timestamp: Option<i64> = None;
    let mut signature: Option<String> = None;

    for part in signature_header.split(',') {
        let kv: Vec<&str> = part.splitn(2, '=').collect();
        if kv.len() == 2 {
            match kv[0] {
                "t" => timestamp = kv[1].parse().ok(),
                "v1" => signature = Some(kv[1].to_string()),
                _ => {}
            }
        }
    }

    let timestamp = timestamp.ok_or(WebhookError::MissingHeader("timestamp".into()))?;
    let signature = signature.ok_or(WebhookError::MissingHeader("signature".into()))?;

    // Check timestamp is within tolerance (5 minutes)
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;

    if (now - timestamp).abs() > 300 {
        return Err(WebhookError::TimestampTooOld);
    }

    // Compute expected signature
    let signed_payload = format!("{}.{}", timestamp, String::from_utf8_lossy(payload));

    let mut mac = Hmac::<Sha256>::new_from_slice(config.webhook_secret.expose_secret().as_bytes())
        .expect("HMAC can take key of any size");
    mac.update(signed_payload.as_bytes());

    let expected_signature = hex::encode(mac.finalize().into_bytes());

    // Constant-time comparison
    if !constant_time_eq(signature.as_bytes(), expected_signature.as_bytes()) {
        return Err(WebhookError::InvalidSignature);
    }

    Ok(())
}

/// Parse a webhook event from JSON payload
pub fn parse_webhook_event(payload: &[u8]) -> Result<StripeWebhookEvent, WebhookError> {
    let json: serde_json::Value =
        serde_json::from_slice(payload).map_err(|e| WebhookError::InvalidPayload(e.to_string()))?;

    let event_type = json["type"]
        .as_str()
        .ok_or_else(|| WebhookError::InvalidPayload("missing type".into()))?;

    let data = &json["data"]["object"];

    match event_type {
        "checkout.session.completed" => {
            let session_id = data["id"].as_str().unwrap_or_default().to_string();
            let customer_id = data["customer"].as_str().unwrap_or_default().to_string();
            let subscription_id = data["subscription"].as_str().map(|s| s.to_string());
            let workspace_id = data["metadata"]["workspace_id"]
                .as_str()
                .map(|s| s.to_string());

            Ok(StripeWebhookEvent::CheckoutSessionCompleted {
                session_id,
                customer_id,
                subscription_id,
                workspace_id,
            })
        }
        "customer.subscription.created" => {
            let subscription_id = data["id"].as_str().unwrap_or_default().to_string();
            let customer_id = data["customer"].as_str().unwrap_or_default().to_string();
            let status = data["status"].as_str().unwrap_or("unknown").to_string();
            let workspace_id = data["metadata"]["workspace_id"]
                .as_str()
                .map(|s| s.to_string());

            Ok(StripeWebhookEvent::SubscriptionCreated {
                subscription_id,
                customer_id,
                status,
                workspace_id,
            })
        }
        "customer.subscription.updated" => {
            let subscription_id = data["id"].as_str().unwrap_or_default().to_string();
            let customer_id = data["customer"].as_str().unwrap_or_default().to_string();
            let status = data["status"].as_str().unwrap_or("unknown").to_string();
            let workspace_id = data["metadata"]["workspace_id"]
                .as_str()
                .map(|s| s.to_string());
            let current_period_start = data["current_period_start"].as_i64();
            let current_period_end = data["current_period_end"].as_i64();

            Ok(StripeWebhookEvent::SubscriptionUpdated {
                subscription_id,
                customer_id,
                status,
                workspace_id,
                current_period_start,
                current_period_end,
            })
        }
        "customer.subscription.deleted" => {
            let subscription_id = data["id"].as_str().unwrap_or_default().to_string();
            let customer_id = data["customer"].as_str().unwrap_or_default().to_string();
            let workspace_id = data["metadata"]["workspace_id"]
                .as_str()
                .map(|s| s.to_string());

            Ok(StripeWebhookEvent::SubscriptionDeleted {
                subscription_id,
                customer_id,
                workspace_id,
            })
        }
        "invoice.paid" => {
            let invoice_id = data["id"].as_str().unwrap_or_default().to_string();
            let subscription_id = data["subscription"].as_str().map(|s| s.to_string());
            let customer_id = data["customer"].as_str().unwrap_or_default().to_string();

            Ok(StripeWebhookEvent::InvoicePaid {
                invoice_id,
                subscription_id,
                customer_id,
            })
        }
        "invoice.payment_failed" => {
            let invoice_id = data["id"].as_str().unwrap_or_default().to_string();
            let subscription_id = data["subscription"].as_str().map(|s| s.to_string());
            let customer_id = data["customer"].as_str().unwrap_or_default().to_string();

            Ok(StripeWebhookEvent::InvoicePaymentFailed {
                invoice_id,
                subscription_id,
                customer_id,
            })
        }
        _ => Ok(StripeWebhookEvent::Unknown {
            event_type: event_type.to_string(),
        }),
    }
}

/// Constant-time comparison to prevent timing attacks
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b.iter()).fold(0, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_unknown_event() {
        let payload = br#"{"type": "some.unknown.event", "data": {"object": {}}}"#;
        let event = parse_webhook_event(payload).unwrap();
        assert!(
            matches!(event, StripeWebhookEvent::Unknown { event_type } if event_type == "some.unknown.event")
        );
    }

    #[test]
    fn test_parse_checkout_completed() {
        let payload = br#"{
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_test_123",
                    "customer": "cus_123",
                    "subscription": "sub_123",
                    "metadata": {
                        "workspace_id": "550e8400-e29b-41d4-a716-446655440000"
                    }
                }
            }
        }"#;

        let event = parse_webhook_event(payload).unwrap();
        match event {
            StripeWebhookEvent::CheckoutSessionCompleted {
                session_id,
                customer_id,
                subscription_id,
                workspace_id,
            } => {
                assert_eq!(session_id, "cs_test_123");
                assert_eq!(customer_id, "cus_123");
                assert_eq!(subscription_id, Some("sub_123".to_string()));
                assert_eq!(
                    workspace_id,
                    Some("550e8400-e29b-41d4-a716-446655440000".to_string())
                );
            }
            _ => panic!("Expected CheckoutSessionCompleted event"),
        }
    }

    #[test]
    fn test_parse_subscription_updated() {
        let payload = br#"{
            "type": "customer.subscription.updated",
            "data": {
                "object": {
                    "id": "sub_123",
                    "customer": "cus_456",
                    "status": "active",
                    "current_period_start": 1704067200,
                    "current_period_end": 1706745600,
                    "metadata": {
                        "workspace_id": "550e8400-e29b-41d4-a716-446655440000"
                    }
                }
            }
        }"#;

        let event = parse_webhook_event(payload).unwrap();
        match event {
            StripeWebhookEvent::SubscriptionUpdated {
                subscription_id,
                customer_id,
                status,
                workspace_id,
                current_period_start,
                current_period_end,
            } => {
                assert_eq!(subscription_id, "sub_123");
                assert_eq!(customer_id, "cus_456");
                assert_eq!(status, "active");
                assert_eq!(
                    workspace_id,
                    Some("550e8400-e29b-41d4-a716-446655440000".to_string())
                );
                assert_eq!(current_period_start, Some(1704067200));
                assert_eq!(current_period_end, Some(1706745600));
            }
            _ => panic!("Expected SubscriptionUpdated event"),
        }
    }

    #[test]
    fn test_constant_time_eq() {
        assert!(constant_time_eq(b"hello", b"hello"));
        assert!(!constant_time_eq(b"hello", b"world"));
        assert!(!constant_time_eq(b"hello", b"hell"));
    }
}
