//! Rate limiting middleware (TENANCY-QW-03: IKA-203)
//!
//! Uses tower-governor for token-bucket based rate limiting.
//! Protects against abuse and ensures fair usage across tenants.

use std::{net::SocketAddr, sync::Arc};

use axum::extract::Request;
use governor::middleware::NoOpMiddleware;
use tower_governor::{
    GovernorError, GovernorLayer, governor::GovernorConfigBuilder, key_extractor::KeyExtractor,
};

/// Extract the client IP address for rate limiting key.
///
/// Falls back to "unknown" if IP cannot be determined.
#[derive(Clone)]
pub struct PeerIpKeyExtractor;

impl KeyExtractor for PeerIpKeyExtractor {
    type Key = String;

    fn extract<T>(&self, req: &Request<T>) -> Result<Self::Key, GovernorError> {
        // Try to get the client IP from various sources
        let ip = req
            .extensions()
            .get::<axum::extract::ConnectInfo<SocketAddr>>()
            .map(|ci| ci.0.ip().to_string())
            .or_else(|| {
                req.headers()
                    .get("x-forwarded-for")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|s| s.split(',').next())
                    .map(|s| s.trim().to_string())
            })
            .or_else(|| {
                req.headers()
                    .get("x-real-ip")
                    .and_then(|v| v.to_str().ok())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| "unknown".to_string());

        Ok(ip)
    }
}

/// Configuration for rate limiting.
#[derive(Clone, Debug)]
pub struct RateLimitConfig {
    /// Maximum requests per second
    pub per_second: u64,
    /// Maximum burst size (requests allowed in a burst)
    pub burst_size: u32,
}

impl Default for RateLimitConfig {
    fn default() -> Self {
        Self {
            per_second: 10,
            burst_size: 50,
        }
    }
}

/// Create a rate limiting layer with default configuration.
///
/// Default: 10 requests/second with burst of 50.
pub fn rate_limit_layer() -> GovernorLayer<PeerIpKeyExtractor, NoOpMiddleware> {
    rate_limit_layer_with_config(RateLimitConfig::default())
}

/// Create a rate limiting layer with custom configuration.
pub fn rate_limit_layer_with_config(
    config: RateLimitConfig,
) -> GovernorLayer<PeerIpKeyExtractor, NoOpMiddleware> {
    let governor_config = Arc::new(
        GovernorConfigBuilder::default()
            .per_second(config.per_second)
            .burst_size(config.burst_size)
            .key_extractor(PeerIpKeyExtractor)
            .finish()
            .expect("Invalid rate limit configuration"),
    );

    GovernorLayer {
        config: governor_config,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = RateLimitConfig::default();
        assert_eq!(config.per_second, 10);
        assert_eq!(config.burst_size, 50);
    }

    #[test]
    fn test_custom_config() {
        let config = RateLimitConfig {
            per_second: 20,
            burst_size: 100,
        };
        assert_eq!(config.per_second, 20);
        assert_eq!(config.burst_size, 100);
    }
}
