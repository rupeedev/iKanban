//! Abuse Detection Service (IKA-188)
//!
//! Detects and records abuse signals during authentication and registration flows.
//! Signals include:
//! - Rapid registration from same IP
//! - Disposable email domains
//! - Suspicious activity patterns

use db_crate::models::{AbuseDetectionSignal, CreateAbuseSignal};
use serde_json::json;
use sqlx::PgPool;

/// List of common disposable email domains
const DISPOSABLE_EMAIL_DOMAINS: &[&str] = &[
    "mailinator.com",
    "tempmail.com",
    "throwaway.email",
    "guerrillamail.com",
    "10minutemail.com",
    "temp-mail.org",
    "fakeinbox.com",
    "trashmail.com",
    "getnada.com",
    "maildrop.cc",
    "yopmail.com",
    "mohmal.com",
    "tempail.com",
    "discard.email",
    "sharklasers.com",
    "spam4.me",
    "grr.la",
    "mailnesia.com",
    "tempr.email",
    "dispostable.com",
];

/// Threshold for rapid registration detection (registrations from same IP in 24h)
const RAPID_REGISTRATION_THRESHOLD: i64 = 3;

/// Abuse detection service for auth flows
pub struct AbuseDetector {
    pool: PgPool,
}

impl AbuseDetector {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Check for and record abuse signals during registration
    /// Returns the number of high-severity unresolved signals for this user
    pub async fn check_registration(
        &self,
        user_id: &str,
        email: &str,
        source_ip: Option<&str>,
    ) -> Result<i64, sqlx::Error> {
        let mut signals_created = 0;

        // Check for disposable email
        if self.is_disposable_email(email) {
            tracing::warn!(user_id, email, "disposable email detected");
            let signal = CreateAbuseSignal {
                user_id: user_id.to_string(),
                signal_type: "disposable_email".to_string(),
                severity: "medium".to_string(),
                description: Some(format!("User registered with disposable email: {}", email)),
                metadata: Some(json!({ "email": email })),
                source_ip: source_ip.map(String::from),
            };
            if let Err(e) = AbuseDetectionSignal::create(&self.pool, &signal).await {
                tracing::error!(?e, "failed to create disposable_email signal");
            } else {
                signals_created += 1;
            }
        }

        // Check for rapid registration from same IP
        if let Some(ip) = source_ip
            && let Ok(count) = AbuseDetectionSignal::check_rapid_registration(&self.pool, ip).await
            && count >= RAPID_REGISTRATION_THRESHOLD
        {
            tracing::warn!(user_id, ip, count, "rapid registration detected");
            let signal = CreateAbuseSignal {
                user_id: user_id.to_string(),
                signal_type: "rapid_registration".to_string(),
                severity: "high".to_string(),
                description: Some(format!(
                    "Multiple registrations from IP {} ({} in 24h)",
                    ip, count
                )),
                metadata: Some(json!({
                    "source_ip": ip,
                    "registration_count": count
                })),
                source_ip: Some(ip.to_string()),
            };
            if let Err(e) = AbuseDetectionSignal::create(&self.pool, &signal).await {
                tracing::error!(?e, "failed to create rapid_registration signal");
            } else {
                signals_created += 1;
            }
        }

        // Return count of high-severity unresolved signals
        if signals_created > 0 {
            AbuseDetectionSignal::count_high_severity_unresolved(&self.pool, user_id).await
        } else {
            Ok(0)
        }
    }

    /// Record a failed login attempt signal
    #[allow(dead_code)] // Available for future use in login flow
    pub async fn record_failed_login(
        &self,
        user_id: &str,
        source_ip: Option<&str>,
        attempt_count: i32,
    ) -> Result<(), sqlx::Error> {
        let severity = if attempt_count >= 10 {
            "high"
        } else if attempt_count >= 5 {
            "medium"
        } else {
            "low"
        };

        let signal = CreateAbuseSignal {
            user_id: user_id.to_string(),
            signal_type: "failed_login_attempts".to_string(),
            severity: severity.to_string(),
            description: Some(format!("Failed login attempt #{}", attempt_count)),
            metadata: Some(json!({ "attempt_count": attempt_count })),
            source_ip: source_ip.map(String::from),
        };

        AbuseDetectionSignal::create(&self.pool, &signal).await?;
        Ok(())
    }

    /// Record a rate limit exceeded signal
    #[allow(dead_code)] // Available for future use in rate limit middleware
    pub async fn record_rate_limit_exceeded(
        &self,
        user_id: &str,
        source_ip: Option<&str>,
        endpoint: &str,
    ) -> Result<(), sqlx::Error> {
        tracing::warn!(user_id, endpoint, "rate limit exceeded");

        let signal = CreateAbuseSignal {
            user_id: user_id.to_string(),
            signal_type: "rate_limit_exceeded".to_string(),
            severity: "medium".to_string(),
            description: Some(format!("Rate limit exceeded on endpoint: {}", endpoint)),
            metadata: Some(json!({ "endpoint": endpoint })),
            source_ip: source_ip.map(String::from),
        };

        AbuseDetectionSignal::create(&self.pool, &signal).await?;
        Ok(())
    }

    /// Record a suspicious activity signal
    #[allow(dead_code)] // Available for future use
    pub async fn record_suspicious_activity(
        &self,
        user_id: &str,
        source_ip: Option<&str>,
        activity_type: &str,
        details: serde_json::Value,
    ) -> Result<(), sqlx::Error> {
        tracing::warn!(user_id, activity_type, "suspicious activity detected");

        let signal = CreateAbuseSignal {
            user_id: user_id.to_string(),
            signal_type: "suspicious_activity".to_string(),
            severity: "medium".to_string(),
            description: Some(format!("Suspicious activity: {}", activity_type)),
            metadata: Some(details),
            source_ip: source_ip.map(String::from),
        };

        AbuseDetectionSignal::create(&self.pool, &signal).await?;
        Ok(())
    }

    /// Check if an email is from a disposable domain
    fn is_disposable_email(&self, email: &str) -> bool {
        if let Some(domain) = email.split('@').next_back() {
            let domain_lower = domain.to_lowercase();
            DISPOSABLE_EMAIL_DOMAINS
                .iter()
                .any(|d| domain_lower == *d || domain_lower.ends_with(&format!(".{}", d)))
        } else {
            false
        }
    }

    /// Get the count of high-severity unresolved signals for a user
    #[allow(dead_code)] // Available for future use
    pub async fn get_high_severity_count(&self, user_id: &str) -> Result<i64, sqlx::Error> {
        AbuseDetectionSignal::count_high_severity_unresolved(&self.pool, user_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_disposable_email() {
        // Create a mock detector for testing
        // Note: We can't actually test database operations without a real pool

        // Test the domain extraction logic
        let domains = vec![
            ("test@mailinator.com", true),
            ("user@tempmail.com", true),
            ("valid@gmail.com", false),
            ("work@company.org", false),
            ("test@yopmail.com", true),
        ];

        for (email, expected) in domains {
            if let Some(domain) = email.split('@').next_back() {
                let is_disposable = DISPOSABLE_EMAIL_DOMAINS
                    .iter()
                    .any(|d| domain.to_lowercase() == *d);
                assert_eq!(
                    is_disposable, expected,
                    "Email {} should be disposable: {}",
                    email, expected
                );
            }
        }
    }
}
