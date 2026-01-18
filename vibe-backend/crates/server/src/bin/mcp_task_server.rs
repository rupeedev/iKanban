use std::net::SocketAddr;

use axum::{
    Extension, Router,
    extract::Request,
    http::{HeaderMap, StatusCode, header::AUTHORIZATION},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
};
use rmcp::{
    ServiceExt,
    transport::{
        sse_server::{SseServer, SseServerConfig},
        stdio,
    },
};
use server::mcp::task_server::TaskServer;
use tokio_util::sync::CancellationToken;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    port_file::read_port_file,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
};

/// Configuration for MCP authentication
#[derive(Clone)]
struct McpAuthConfig {
    api_key: String,
}

/// Get API token from environment (MCP_API_KEY or VIBE_API_TOKEN)
fn get_api_token() -> Option<String> {
    std::env::var("MCP_API_KEY")
        .or_else(|_| std::env::var("VIBE_API_TOKEN"))
        .ok()
        .filter(|s| !s.is_empty())
}

/// Constant-time string comparison to prevent timing attacks
/// Returns true if both strings are equal, using XOR to avoid early exit
fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }

    let mut result: u8 = 0;
    for (x, y) in a.bytes().zip(b.bytes()) {
        result |= x ^ y;
    }

    result == 0
}

fn main() -> anyhow::Result<()> {
    sentry_utils::init_once(SentrySource::Mcp);
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .unwrap()
        .block_on(async {
            tracing_subscriber::registry()
                .with(
                    tracing_subscriber::fmt::layer()
                        .with_writer(std::io::stderr)
                        .with_filter(EnvFilter::new("debug")),
                )
                .with(sentry_layer())
                .init();

            let version = env!("CARGO_PKG_VERSION");
            tracing::debug!("[MCP] Starting MCP task server version {version}...");

            // Determine transport mode from environment
            let transport_mode =
                std::env::var("MCP_TRANSPORT").unwrap_or_else(|_| "stdio".to_string());

            // Get API token for backend auth
            let api_token = get_api_token();
            if api_token.is_some() {
                tracing::info!("[MCP] API token configured for backend authentication");
            } else {
                tracing::warn!("[MCP] No API token configured (set MCP_API_KEY or VIBE_API_TOKEN)");
            }

            // Get backend URL
            let base_url = get_backend_url().await?;

            // Create service with API token
            let service = TaskServer::with_token(&base_url, api_token.clone())
                .init()
                .await;

            match transport_mode.to_lowercase().as_str() {
                "http" | "sse" => {
                    run_sse_server(service, api_token).await?;
                }
                _ => {
                    tracing::info!("[MCP] Starting stdio transport");
                    service
                        .serve(stdio())
                        .await
                        .map_err(|e| {
                            tracing::error!("serving error: {:?}", e);
                            e
                        })?
                        .waiting()
                        .await?;
                }
            }

            Ok(())
        })
}

async fn health_handler() -> &'static str {
    "OK"
}

/// Authentication middleware for MCP SSE endpoints
/// Validates API key from Authorization header or api_key query parameter
async fn auth_middleware(
    headers: HeaderMap,
    Extension(config): Extension<Option<McpAuthConfig>>,
    request: Request,
    next: Next,
) -> Response {
    // Skip auth if no config (development mode)
    let config = match config {
        Some(c) => c,
        None => {
            tracing::debug!("[MCP Auth] No auth config, allowing request (dev mode)");
            return next.run(request).await;
        }
    };

    // Skip auth for health endpoint
    if request.uri().path() == "/health" {
        return next.run(request).await;
    }

    // Extract API key from Authorization header
    let provided_key = headers
        .get(AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .map(|s| {
            s.strip_prefix("Bearer ")
                .map(|stripped| stripped.to_string())
                .unwrap_or_else(|| s.to_string())
        })
        // Or from query parameter
        .or_else(|| {
            request.uri().query().and_then(|q| {
                url::form_urlencoded::parse(q.as_bytes())
                    .find(|(k, _)| k == "api_key")
                    .map(|(_, v)| v.to_string())
            })
        });

    match provided_key {
        Some(key) if constant_time_eq(&key, &config.api_key) => {
            tracing::debug!("[MCP Auth] Valid API key");
            next.run(request).await
        }
        Some(_) => {
            tracing::warn!("[MCP Auth] Invalid API key provided");
            (
                StatusCode::UNAUTHORIZED,
                axum::Json(serde_json::json!({
                    "error": "unauthorized",
                    "message": "Invalid API key"
                })),
            )
                .into_response()
        }
        None => {
            tracing::warn!("[MCP Auth] No API key provided");
            (
                StatusCode::UNAUTHORIZED,
                axum::Json(serde_json::json!({
                    "error": "unauthorized",
                    "message": "API key required. Provide via Authorization header (Bearer token) or api_key query parameter"
                })),
            )
                .into_response()
        }
    }
}

async fn run_sse_server<S>(service: S, api_token: Option<String>) -> anyhow::Result<()>
where
    S: rmcp::Service<rmcp::RoleServer> + Send + Sync + Clone + 'static,
{
    let port: u16 = std::env::var("MCP_PORT")
        .or_else(|_| std::env::var("PORT"))
        .unwrap_or_else(|_| "3001".to_string())
        .parse()
        .map_err(|e| anyhow::anyhow!("Invalid port: {}", e))?;

    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse()?;
    tracing::info!("[MCP] Starting HTTP/SSE transport on {}", addr);

    // Create SSE server with custom config
    let ct = CancellationToken::new();
    let config = SseServerConfig {
        bind: addr,
        sse_path: "/sse".to_string(),
        post_path: "/message".to_string(),
        ct: ct.clone(),
        sse_keep_alive: None,
    };

    let (mut sse_server, sse_router) = SseServer::new(config);

    // Create auth config if token is provided
    let auth_config = api_token.map(|key| McpAuthConfig { api_key: key });

    // Build router with optional auth middleware
    let app = Router::new()
        .route("/health", get(health_handler))
        .merge(sse_router)
        .layer(Extension(auth_config.clone()))
        .layer(middleware::from_fn(auth_middleware));

    if auth_config.is_some() {
        tracing::info!("[MCP] SSE endpoint authentication enabled");
    } else {
        tracing::warn!("[MCP] SSE endpoint running WITHOUT authentication (dev mode)");
    }

    // Start the HTTP server
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("[MCP] SSE server listening on http://{}/sse", addr);
    tracing::info!("[MCP] Health check available at http://{}/health", addr);

    let server_ct = ct.child_token();
    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app)
            .with_graceful_shutdown(async move {
                server_ct.cancelled().await;
                tracing::info!("[MCP] SSE server shutting down");
            })
            .await
        {
            tracing::error!("[MCP] HTTP server error: {:?}", e);
        }
    });

    // Accept and serve connections
    while let Some(transport) = sse_server.next_transport().await {
        let svc = service.clone();
        tokio::spawn(async move {
            if let Err(e) = svc.serve(transport).await {
                tracing::error!("[MCP] Connection error: {:?}", e);
            }
        });
    }

    Ok(())
}

async fn get_backend_url() -> anyhow::Result<String> {
    if let Ok(url) = std::env::var("VIBE_BACKEND_URL") {
        tracing::info!("[MCP] Using backend URL from VIBE_BACKEND_URL: {}", url);
        return Ok(url);
    }

    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());

    // Get port from environment variables or fall back to port file
    let port = match std::env::var("BACKEND_PORT").or_else(|_| std::env::var("PORT")) {
        Ok(port_str) => {
            tracing::info!("[MCP] Using port from environment: {}", port_str);
            port_str
                .parse::<u16>()
                .map_err(|e| anyhow::anyhow!("Invalid port value '{}': {}", port_str, e))?
        }
        Err(_) => {
            let port = read_port_file("vibe-kanban").await?;
            tracing::info!("[MCP] Using port from port file: {}", port);
            port
        }
    };

    let url = format!("http://{}:{}", host, port);
    tracing::info!("[MCP] Using backend URL: {}", url);
    Ok(url)
}
