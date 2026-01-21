mod abuse_detector;
mod handoff;
mod jwt;
mod middleware;
mod oauth_token_validator;
mod provider;
mod superadmin;

pub use abuse_detector::AbuseDetector;
pub use handoff::{CallbackResult, HandoffError, OAuthHandoffService};
pub use jwt::{JwtError, JwtService};
pub use middleware::{RequestContext, require_session};
pub use oauth_token_validator::{OAuthTokenValidationError, OAuthTokenValidator};
pub use provider::{
    GitHubOAuthProvider, GoogleOAuthProvider, ProviderRegistry, ProviderTokenDetails,
};
#[allow(unused_imports)]
pub use superadmin::require_superadmin;
