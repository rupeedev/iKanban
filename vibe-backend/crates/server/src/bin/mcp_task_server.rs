use std::{net::SocketAddr, sync::Arc};

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
use remote::mcp::TaskServer;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use tracing_subscriber::{EnvFilter, prelude::*};
use utils::{
    port_file::read_port_file,
    sentry::{self as sentry_utils, SentrySource, sentry_layer},
};

/// Configuration for MCP authentication - validates tokens against backend
#[derive(Clone)]
struct McpAuthConfig {
    backend_url: String,
    http_client: reqwest::Client,
    /// Cache of validated tokens (token -> is_valid, expires_at)
    token_cache: Arc<RwLock<std::collections::HashMap<String, (bool, std::time::Instant)>>>,
}

impl McpAuthConfig {
    fn new(backend_url: String) -> Self {
        Self {
            backend_url,
            http_client: reqwest::Client::new(),
            token_cache: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }

    /// Validate a token by calling the backend API
    /// Caches results for 5 minutes to reduce backend load
    async fn validate_token(&self, token: &str) -> bool {
        // Check cache first
        {
            let cache = self.token_cache.read().await;
            if let Some((is_valid, expires_at)) = cache.get(token)
                && std::time::Instant::now() < *expires_at
            {
                tracing::debug!("[MCP Auth] Token validation from cache: {}", is_valid);
                return *is_valid;
            }
        }

        // Call backend to validate - use /api/projects as a simple auth check
        let result = self
            .http_client
            .get(format!("{}/api/projects", self.backend_url))
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await;

        let is_valid = match result {
            Ok(response) => {
                let status = response.status();
                tracing::debug!("[MCP Auth] Backend validation response: {}", status);
                status.is_success()
            }
            Err(e) => {
                tracing::error!("[MCP Auth] Backend validation request failed: {}", e);
                false
            }
        };

        // Cache the result for 5 minutes
        {
            let mut cache = self.token_cache.write().await;
            let expires_at = std::time::Instant::now() + std::time::Duration::from_secs(300);
            cache.insert(token.to_string(), (is_valid, expires_at));

            // Clean up expired entries if cache is getting large
            if cache.len() > 1000 {
                let now = std::time::Instant::now();
                cache.retain(|_, (_, exp)| *exp > now);
            }
        }

        is_valid
    }
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

            // Get backend URL
            let base_url = get_backend_url().await?;

            // For stdio mode, we can use an API token for the TaskServer's backend calls
            // For SSE mode, each client provides their own token which we validate against backend
            let api_token = std::env::var("MCP_API_KEY")
                .or_else(|_| std::env::var("VIBE_API_TOKEN"))
                .ok()
                .filter(|s| !s.is_empty());

            // Create service (for stdio, uses the configured token; for SSE, tokens come from clients)
            let service = TaskServer::with_token(&base_url, api_token).init().await;

            match transport_mode.to_lowercase().as_str() {
                "http" | "sse" => {
                    tracing::info!("[MCP] SSE mode: tokens validated against backend database");
                    run_sse_server(service, base_url.clone()).await?;
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
/// Validates API key against the backend database via HTTP call
async fn auth_middleware(
    headers: HeaderMap,
    Extension(config): Extension<McpAuthConfig>,
    request: Request,
    next: Next,
) -> Response {
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
        Some(key) => {
            // Validate token against backend database
            if config.validate_token(&key).await {
                tracing::debug!("[MCP Auth] Token validated successfully");
                next.run(request).await
            } else {
                tracing::warn!("[MCP Auth] Invalid or expired API key");
                (
                    StatusCode::UNAUTHORIZED,
                    axum::Json(serde_json::json!({
                        "error": "unauthorized",
                        "message": "Invalid or expired API key"
                    })),
                )
                    .into_response()
            }
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

async fn run_sse_server<S>(service: S, backend_url: String) -> anyhow::Result<()>
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

    // Create auth config that validates tokens against backend
    let auth_config = McpAuthConfig::new(backend_url.clone());
    tracing::info!(
        "[MCP] SSE endpoint authentication enabled (validating against {})",
        backend_url
    );

    // Build router with auth middleware
    let app = Router::new()
        .route("/health", get(health_handler))
        .merge(sse_router)
        .layer(Extension(auth_config))
        .layer(middleware::from_fn(auth_middleware));

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
