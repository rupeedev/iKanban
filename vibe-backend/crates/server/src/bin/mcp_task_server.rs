use std::net::SocketAddr;

use axum::{Router, routing::get};
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

            let service = TaskServer::new(&base_url).init().await;

            match transport_mode.to_lowercase().as_str() {
                "http" | "sse" => {
                    run_sse_server(service).await?;
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

async fn run_sse_server<S>(service: S) -> anyhow::Result<()>
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

    // Add health check endpoint
    let app = Router::new()
        .route("/health", get(health_handler))
        .merge(sse_router);

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
