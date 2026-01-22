use remote::{Server, config::RemoteServerConfig, init_tracing, sentry_init_once};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    sentry_init_once();
    init_tracing();

    eprintln!("remote-server starting...");

    let config = match RemoteServerConfig::from_env() {
        Ok(c) => {
            eprintln!("Config loaded successfully, listen_addr={}", c.listen_addr);
            c
        }
        Err(e) => {
            eprintln!("Config error: {}", e);
            return Err(e.into());
        }
    };

    if let Err(e) = Server::run(config).await {
        eprintln!("Server error: {}", e);
        return Err(e);
    }

    Ok(())
}
