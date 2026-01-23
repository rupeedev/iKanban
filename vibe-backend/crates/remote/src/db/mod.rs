pub mod ai_provider_keys;
pub mod ai_session_messages;
pub mod ai_sessions;
pub mod ai_usage_records;
pub mod api_keys;
pub mod auth;
pub mod copilot_assignments;
pub mod document_folders;
pub mod documents;
pub mod execution_approvals;
pub mod execution_attempts;
pub mod execution_logs;
pub mod github_app;
pub mod github_connections;
pub mod gitlab_connections;
pub mod identity_errors;
pub mod inbox;
pub mod invitations;
pub mod oauth;
pub mod oauth_accounts;
pub mod organization_members;
pub mod organizations;
pub mod projects;
pub mod reviews;
pub mod execution_shares;
pub mod superadmins;
pub mod tags;
pub mod task_comments;
pub mod task_document_links;
pub mod task_executions;
pub mod task_tags;
pub mod tasks;
pub mod teams;
pub mod users;

use sqlx::{PgPool, Postgres, Transaction, migrate::MigrateError, postgres::PgPoolOptions};

pub(crate) type Tx<'a> = Transaction<'a, Postgres>;

pub(crate) async fn migrate(pool: &PgPool) -> Result<(), MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

pub(crate) async fn create_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}

pub(crate) async fn ensure_electric_role_password(
    pool: &PgPool,
    password: &str,
) -> Result<(), sqlx::Error> {
    if password.is_empty() {
        return Ok(());
    }

    // PostgreSQL doesn't support parameter binding for ALTER ROLE PASSWORD
    // We need to escape the password properly and embed it directly in the SQL
    let escaped_password = password.replace("'", "''");
    let sql = format!("ALTER ROLE electric_sync WITH PASSWORD '{escaped_password}'");

    sqlx::query(&sql).execute(pool).await?;

    Ok(())
}
