mod abuse_detector;
mod clerk;
mod handoff;
mod jwt;
mod middleware;
mod oauth_token_validator;
mod provider;
mod saml;
mod superadmin;

pub use abuse_detector::AbuseDetector;
pub use clerk::{ClerkAuthState, ClerkRequestContext, require_clerk_session};
pub use handoff::{CallbackResult, HandoffError, OAuthHandoffService};
pub use jwt::{JwtError, JwtService};
pub use middleware::RequestContext;
pub use oauth_token_validator::{OAuthTokenValidationError, OAuthTokenValidator};
pub use provider::{
    GitHubOAuthProvider, GoogleOAuthProvider, ProviderRegistry, ProviderTokenDetails,
};
pub use saml::{
    JitProvisioningService, ProvisionedUser, SamlServiceProvider, SamlUserAttributes,
    parse_saml_response,
};
pub use superadmin::require_superadmin;
