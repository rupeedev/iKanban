use axum::{
    Router,
    http::{Request, header::HeaderName},
    middleware,
    routing::get,
};
use tower_http::{
    cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer},
    request_id::{MakeRequestUuid, PropagateRequestIdLayer, RequestId, SetRequestIdLayer},
    services::{ServeDir, ServeFile},
    trace::{DefaultOnFailure, DefaultOnResponse, TraceLayer},
};
use tracing::{Level, field};

use crate::{
    AppState,
    auth::{require_clerk_session, require_superadmin},
};

mod abuse_signals;
mod admin;
mod billing;
mod documents;
mod electric_proxy;
mod email_verification;
mod error;
mod github_app;
mod identity;
mod oauth;
pub(crate) mod organization_members;
mod organizations;
mod projects;
pub mod registrations;
mod review;
mod stripe;
mod superadmins;
pub mod tasks;
mod teams;
mod tenant_workspaces;
mod tokens;
mod trust_profiles;

pub fn router(state: AppState) -> Router {
    let trace_layer = TraceLayer::new_for_http()
        .make_span_with(|request: &Request<_>| {
            let request_id = request
                .extensions()
                .get::<RequestId>()
                .and_then(|id| id.header_value().to_str().ok());
            let span = tracing::info_span!(
                "http_request",
                method = %request.method(),
                uri = %request.uri(),
                request_id = field::Empty
            );
            if let Some(request_id) = request_id {
                span.record("request_id", field::display(request_id));
            }
            span
        })
        .on_response(DefaultOnResponse::new().level(Level::INFO))
        .on_failure(DefaultOnFailure::new().level(Level::ERROR));

    let v1_public = Router::<AppState>::new()
        .route("/health", get(health))
        .route("/info", get(server_info))
        .merge(oauth::public_router())
        .merge(organization_members::public_router())
        .merge(tokens::public_router())
        .merge(review::public_router())
        .merge(github_app::public_router())
        .merge(stripe::public_router())
        .merge(email_verification::public_router())
        .merge(billing::public_router())
        .merge(tenant_workspaces::public_router());

    let v1_protected = Router::<AppState>::new()
        .merge(identity::router())
        .merge(projects::router())
        .merge(tasks::router())
        .merge(teams::router())
        .merge(documents::router())
        .merge(admin::router())
        .merge(organizations::router())
        .merge(organization_members::protected_router())
        .merge(oauth::protected_router())
        .merge(electric_proxy::router())
        .merge(github_app::protected_router())
        .merge(stripe::protected_router())
        .merge(billing::protected_router())
        .merge(trust_profiles::protected_router())
        .merge(abuse_signals::protected_router())
        .merge(email_verification::protected_router())
        .merge(tenant_workspaces::protected_router())
        .merge(superadmins::public_router()) // Check endpoint - any authed user
        .merge(registrations::user_router()) // User's own registration status
        .layer(middleware::from_fn_with_state(
            state.clone(),
            require_clerk_session,
        ));

    // Superadmin-only routes (require superadmin status, not just auth)
    let v1_superadmin = Router::<AppState>::new()
        .merge(superadmins::protected_router())
        .merge(registrations::router())
        .layer(middleware::from_fn_with_state(
            state.clone(),
            require_superadmin,
        ));

    let static_dir = "/srv/static";
    let spa =
        ServeDir::new(static_dir).fallback(ServeFile::new(format!("{static_dir}/index.html")));

    // Clone routers for /api prefix alias (frontend compatibility)
    let api_public = v1_public.clone();
    let api_protected = v1_protected.clone();
    let api_superadmin = v1_superadmin.clone();

    Router::<AppState>::new()
        // Primary routes under /v1
        .nest("/v1", v1_public)
        .nest("/v1", v1_protected)
        .nest("/v1", v1_superadmin)
        // Alias under /api for frontend compatibility
        .nest("/api", api_public)
        .nest("/api", api_protected)
        .nest("/api", api_superadmin)
        .fallback_service(spa)
        .layer(
            CorsLayer::new()
                .allow_origin(AllowOrigin::mirror_request())
                .allow_methods(AllowMethods::mirror_request())
                .allow_headers(AllowHeaders::mirror_request())
                .allow_credentials(true),
        )
        .layer(trace_layer)
        .layer(PropagateRequestIdLayer::new(HeaderName::from_static(
            "x-request-id",
        )))
        .layer(SetRequestIdLayer::new(
            HeaderName::from_static("x-request-id"),
            MakeRequestUuid {},
        ))
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}

/// Server info endpoint
async fn server_info() -> axum::Json<serde_json::Value> {
    axum::Json(serde_json::json!({
        "success": true,
        "data": {
            "name": "iKanban API",
            "version": env!("CARGO_PKG_VERSION"),
            "status": "operational"
        }
    }))
}
