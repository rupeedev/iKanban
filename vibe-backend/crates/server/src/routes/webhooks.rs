//! GitHub Webhook Handlers (IKA-93 + IKA-94: Copilot Integration Phases 1 & 2)
//!
//! Handles GitHub webhook events for PR tracking, CI status, auto-merge, and deployment.

use axum::{
    Router,
    extract::State,
    http::{HeaderMap, StatusCode},
    response::Json as ResponseJson,
    routing::post,
};
use chrono::Utc;
use db::models::{
    copilot_assignment::{CopilotAssignment, UpdateCopilotAssignment},
    copilot_deployment_config::CopilotDeploymentConfig,
    github_connection::GitHubConnection,
    task::{Task, TaskStatus},
    task_comment::{CreateTaskComment, TaskComment},
};
use deployment::Deployment;
use serde::{Deserialize, Serialize};
use tracing::{error, info};

use crate::DeploymentImpl;

/// GitHub webhook payload for pull request events
#[derive(Debug, Deserialize)]
pub struct GitHubPullRequestEvent {
    pub action: String,
    pub pull_request: GitHubPullRequest,
    pub repository: GitHubRepository,
}

#[derive(Debug, Deserialize)]
pub struct GitHubPullRequest {
    pub id: i64,
    pub number: i64,
    pub html_url: String,
    pub state: String,
    pub merged: Option<bool>,
    pub head: GitHubPullRequestHead,
}

#[derive(Debug, Deserialize)]
pub struct GitHubPullRequestHead {
    #[serde(rename = "ref")]
    pub branch_ref: String,
}

#[derive(Debug, Deserialize)]
pub struct GitHubRepository {
    pub id: i64,
    pub name: String,
    pub full_name: String,
    pub owner: GitHubOwner,
}

#[derive(Debug, Deserialize)]
pub struct GitHubOwner {
    pub login: String,
}

/// GitHub webhook payload for check suite events
#[derive(Debug, Deserialize)]
pub struct GitHubCheckSuiteEvent {
    pub action: String,
    pub check_suite: GitHubCheckSuite,
    pub repository: GitHubRepository,
}

#[derive(Debug, Deserialize)]
pub struct GitHubCheckSuite {
    pub id: i64,
    pub conclusion: Option<String>,
    pub status: String,
    pub head_branch: Option<String>,
    pub pull_requests: Vec<GitHubCheckSuitePR>,
}

#[derive(Debug, Deserialize)]
pub struct GitHubCheckSuitePR {
    pub id: i64,
    pub number: i64,
}

/// GitHub webhook payload for workflow run events
#[derive(Debug, Deserialize)]
pub struct GitHubWorkflowRunEvent {
    pub action: String,
    pub workflow_run: GitHubWorkflowRun,
    pub repository: GitHubRepository,
}

#[derive(Debug, Deserialize)]
pub struct GitHubWorkflowRun {
    pub id: i64,
    pub name: String,
    pub conclusion: Option<String>,
    pub status: String,
    pub html_url: String,
}

/// Response for webhook endpoints
#[derive(Debug, Serialize)]
pub struct WebhookResponse {
    pub received: bool,
    pub message: String,
}

/// Handle GitHub webhooks
pub async fn handle_github_webhook(
    State(deployment): State<DeploymentImpl>,
    headers: HeaderMap,
    body: String,
) -> Result<(StatusCode, ResponseJson<WebhookResponse>), StatusCode> {
    // Get the event type from headers
    let event_type = headers
        .get("x-github-event")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("unknown");

    info!("Received GitHub webhook event: {}", event_type);

    // TODO: Verify webhook signature using GITHUB_WEBHOOK_SECRET
    // let signature = headers.get("x-hub-signature-256");

    match event_type {
        "pull_request" => {
            let event: GitHubPullRequestEvent = serde_json::from_str(&body).map_err(|e| {
                error!("Failed to parse pull_request event: {}", e);
                StatusCode::BAD_REQUEST
            })?;

            handle_pull_request_event(&deployment, event).await?;
        }
        "check_suite" => {
            let event: GitHubCheckSuiteEvent = serde_json::from_str(&body).map_err(|e| {
                error!("Failed to parse check_suite event: {}", e);
                StatusCode::BAD_REQUEST
            })?;

            handle_check_suite_event(&deployment, event).await?;
        }
        "workflow_run" => {
            let event: GitHubWorkflowRunEvent = serde_json::from_str(&body).map_err(|e| {
                error!("Failed to parse workflow_run event: {}", e);
                StatusCode::BAD_REQUEST
            })?;

            handle_workflow_run_event(&deployment, event).await?;
        }
        _ => {
            info!("Ignoring GitHub event type: {}", event_type);
        }
    }

    Ok((
        StatusCode::OK,
        ResponseJson(WebhookResponse {
            received: true,
            message: format!("Processed {} event", event_type),
        }),
    ))
}

/// Handle pull request events
async fn handle_pull_request_event(
    deployment: &DeploymentImpl,
    event: GitHubPullRequestEvent,
) -> Result<(), StatusCode> {
    let pool = &deployment.db().pool;
    let repo_owner = &event.repository.owner.login;
    let repo_name = &event.repository.name;
    let pr_number = event.pull_request.number;

    info!(
        "Processing PR event: {} for {}/{} PR #{}",
        event.action, repo_owner, repo_name, pr_number
    );

    // Find assignment by PR
    let assignment = CopilotAssignment::find_by_pr(pool, repo_owner, repo_name, pr_number)
        .await
        .map_err(|e| {
            error!("Failed to find assignment by PR: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let Some(assignment) = assignment else {
        info!(
            "No assignment found for PR {}/{} #{}",
            repo_owner, repo_name, pr_number
        );
        return Ok(());
    };

    match event.action.as_str() {
        "opened" | "synchronize" => {
            // PR was opened or updated
            CopilotAssignment::update(
                pool,
                assignment.id,
                &UpdateCopilotAssignment {
                    github_pr_id: Some(event.pull_request.number),
                    github_pr_url: Some(event.pull_request.html_url.clone()),
                    status: Some("pr_created".to_string()),
                    ..Default::default()
                },
            )
            .await
            .map_err(|e| {
                error!("Failed to update assignment: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
        "closed" => {
            if event.pull_request.merged == Some(true) {
                // PR was merged - handle deployment trigger
                handle_pr_merged(deployment, &assignment, repo_owner, repo_name).await?;
            } else {
                // PR was closed without merging
                CopilotAssignment::update(
                    pool,
                    assignment.id,
                    &UpdateCopilotAssignment {
                        status: Some("completed".to_string()),
                        completed_at: Some(Utc::now()),
                        ..Default::default()
                    },
                )
                .await
                .map_err(|e| {
                    error!("Failed to update assignment: {}", e);
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;

                post_task_comment(
                    pool,
                    assignment.task_id,
                    &format!(
                        "PR [#{}]({}) was closed without merging.",
                        pr_number,
                        event.pull_request.html_url
                    ),
                )
                .await;
            }
        }
        _ => {}
    }

    Ok(())
}

/// Handle PR merged event (Phase 2)
async fn handle_pr_merged(
    deployment: &DeploymentImpl,
    assignment: &CopilotAssignment,
    repo_owner: &str,
    repo_name: &str,
) -> Result<(), StatusCode> {
    let pool = &deployment.db().pool;

    // Update status to merged
    CopilotAssignment::update(
        pool,
        assignment.id,
        &UpdateCopilotAssignment {
            status: Some("merged".to_string()),
            ..Default::default()
        },
    )
    .await
    .map_err(|e| {
        error!("Failed to update assignment: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Post merge comment
    post_task_comment(
        pool,
        assignment.task_id,
        &format!(
            "PR [#{}]({}) has been merged successfully!",
            assignment.github_pr_id.unwrap_or(0),
            assignment.github_pr_url.as_deref().unwrap_or("")
        ),
    )
    .await;

    // Check deployment configuration
    let config = CopilotDeploymentConfig::find_by_assignment_repo(pool, repo_owner, repo_name)
        .await
        .map_err(|e| {
            error!("Failed to fetch deployment config: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if let Some(cfg) = config {
        if cfg.deploy_workflow_enabled && cfg.deploy_workflow_name.is_some() {
            // Trigger deployment workflow
            trigger_deployment(deployment, assignment, &cfg, repo_owner, repo_name).await?;
        } else if cfg.auto_mark_task_done {
            // No deployment, mark task done
            mark_task_done(pool, assignment).await?;
        }
    } else {
        // No config, mark task done
        mark_task_done(pool, assignment).await?;
    }

    Ok(())
}

/// Handle check suite events (CI status)
async fn handle_check_suite_event(
    deployment: &DeploymentImpl,
    event: GitHubCheckSuiteEvent,
) -> Result<(), StatusCode> {
    let pool = &deployment.db().pool;
    let repo_owner = &event.repository.owner.login;
    let repo_name = &event.repository.name;

    info!(
        "Processing check_suite event: {} for {}/{}",
        event.action, repo_owner, repo_name
    );

    // Find assignments for any PRs in this check suite
    for pr in &event.check_suite.pull_requests {
        let assignment = CopilotAssignment::find_by_pr(pool, repo_owner, repo_name, pr.number)
            .await
            .map_err(|e| {
                error!("Failed to find assignment: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

        let Some(assignment) = assignment else {
            continue;
        };

        // Only process if in pr_created or ci_pending status
        let status_str = assignment.status.as_str();
        if !["pr_created", "ci_pending"].contains(&status_str) {
            info!(
                "Skipping CI event for assignment {} in status {}",
                assignment.id, status_str
            );
            continue;
        }

        let checks_url = format!(
            "https://github.com/{}/{}/pull/{}/checks",
            repo_owner, repo_name, pr.number
        );

        match event.action.as_str() {
            "completed" => {
                let conclusion = event.check_suite.conclusion.as_deref().unwrap_or("unknown");
                match conclusion {
                    "success" => {
                        handle_ci_success(deployment, &assignment, &checks_url, repo_owner, repo_name)
                            .await?;
                    }
                    "failure" | "cancelled" | "timed_out" => {
                        handle_ci_failure(pool, &assignment, conclusion, &checks_url).await?;
                    }
                    _ => {
                        info!("Ignoring check_suite conclusion: {}", conclusion);
                    }
                }
            }
            "requested" | "rerequested" => {
                CopilotAssignment::update(
                    pool,
                    assignment.id,
                    &UpdateCopilotAssignment {
                        status: Some("ci_pending".to_string()),
                        ci_status: Some("pending".to_string()),
                        ..Default::default()
                    },
                )
                .await
                .map_err(|e| {
                    error!("Failed to update assignment: {}", e);
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;
            }
            _ => {}
        }
    }

    Ok(())
}

/// Handle CI success (Phase 2)
async fn handle_ci_success(
    deployment: &DeploymentImpl,
    assignment: &CopilotAssignment,
    checks_url: &str,
    repo_owner: &str,
    repo_name: &str,
) -> Result<(), StatusCode> {
    let pool = &deployment.db().pool;

    // Update status to ci_passed
    CopilotAssignment::update(
        pool,
        assignment.id,
        &UpdateCopilotAssignment {
            status: Some("ci_passed".to_string()),
            ci_status: Some("success".to_string()),
            ci_checks_url: Some(checks_url.to_string()),
            ci_completed_at: Some(Utc::now()),
            ..Default::default()
        },
    )
    .await
    .map_err(|e| {
        error!("Failed to update assignment: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Post success comment
    post_task_comment(
        pool,
        assignment.task_id,
        &format!(
            "CI checks [passed]({}) on PR [#{}]({}).",
            checks_url,
            assignment.github_pr_id.unwrap_or(0),
            assignment.github_pr_url.as_deref().unwrap_or("")
        ),
    )
    .await;

    // Check if auto-merge is enabled
    let config = CopilotDeploymentConfig::find_by_assignment_repo(pool, repo_owner, repo_name)
        .await
        .map_err(|e| {
            error!("Failed to fetch deployment config: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    if let Some(cfg) = config {
        if cfg.auto_merge_enabled {
            trigger_auto_merge(deployment, assignment, &cfg).await?;
        } else {
            post_task_comment(
                pool,
                assignment.task_id,
                "Auto-merge is disabled. Please merge the PR manually when ready.",
            )
            .await;
        }
    }

    Ok(())
}

/// Handle CI failure
async fn handle_ci_failure(
    pool: &sqlx::PgPool,
    assignment: &CopilotAssignment,
    conclusion: &str,
    checks_url: &str,
) -> Result<(), StatusCode> {
    CopilotAssignment::update(
        pool,
        assignment.id,
        &UpdateCopilotAssignment {
            status: Some("ci_failed".to_string()),
            ci_status: Some(conclusion.to_string()),
            ci_checks_url: Some(checks_url.to_string()),
            ci_completed_at: Some(Utc::now()),
            error_message: Some(format!("CI {}", conclusion)),
            ..Default::default()
        },
    )
    .await
    .map_err(|e| {
        error!("Failed to update assignment: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    post_task_comment(
        pool,
        assignment.task_id,
        &format!(
            "CI checks [{}]({}) on PR [#{}]({}). Please review and fix the issues.",
            conclusion,
            checks_url,
            assignment.github_pr_id.unwrap_or(0),
            assignment.github_pr_url.as_deref().unwrap_or("")
        ),
    )
    .await;

    Ok(())
}

/// Trigger auto-merge (Phase 2)
async fn trigger_auto_merge(
    deployment: &DeploymentImpl,
    assignment: &CopilotAssignment,
    config: &CopilotDeploymentConfig,
) -> Result<(), StatusCode> {
    let pool = &deployment.db().pool;

    // Update status to merging
    CopilotAssignment::update_status(pool, assignment.id, "merging")
        .await
        .map_err(|e| {
            error!("Failed to update assignment: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Get GitHub token
    let token = match get_github_token(pool).await {
        Ok(t) => t,
        Err(e) => {
            error!("Failed to get GitHub token: {}", e);
            CopilotAssignment::update(
                pool,
                assignment.id,
                &UpdateCopilotAssignment {
                    status: Some("merge_failed".to_string()),
                    error_message: Some("No GitHub token configured".to_string()),
                    ..Default::default()
                },
            )
            .await
            .ok();

            post_task_comment(
                pool,
                assignment.task_id,
                "Failed to auto-merge: No GitHub connection configured.",
            )
            .await;

            return Ok(());
        }
    };

    // Parse PR URL
    let pr_url = assignment.github_pr_url.as_deref().unwrap_or("");
    let (owner, repo, pr_number) = match parse_pr_url(pr_url) {
        Ok(parsed) => parsed,
        Err(e) => {
            error!("Invalid PR URL: {}", e);
            return Ok(());
        }
    };

    let merge_method = config.merge_method.as_str();

    // Call GitHub API to merge
    match merge_pr(&token, &owner, &repo, pr_number, merge_method).await {
        Ok(_) => {
            info!("Successfully triggered merge for PR {}", pr_url);
            // Status will be updated by the pull_request webhook when merged
        }
        Err(e) => {
            error!("Failed to merge PR: {}", e);

            CopilotAssignment::update(
                pool,
                assignment.id,
                &UpdateCopilotAssignment {
                    status: Some("merge_failed".to_string()),
                    error_message: Some(e.clone()),
                    ..Default::default()
                },
            )
            .await
            .ok();

            post_task_comment(
                pool,
                assignment.task_id,
                &format!(
                    "Failed to auto-merge PR [#{}]({}): {}. Please merge manually.",
                    pr_number, pr_url, e
                ),
            )
            .await;
        }
    }

    Ok(())
}

/// Trigger deployment workflow (Phase 2)
async fn trigger_deployment(
    deployment: &DeploymentImpl,
    assignment: &CopilotAssignment,
    config: &CopilotDeploymentConfig,
    repo_owner: &str,
    repo_name: &str,
) -> Result<(), StatusCode> {
    let pool = &deployment.db().pool;

    // Update status to deploying
    CopilotAssignment::update_status(pool, assignment.id, "deploying")
        .await
        .map_err(|e| {
            error!("Failed to update assignment: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    // Get GitHub token
    let token = match get_github_token(pool).await {
        Ok(t) => t,
        Err(e) => {
            error!("Failed to get GitHub token: {}", e);
            CopilotAssignment::update(
                pool,
                assignment.id,
                &UpdateCopilotAssignment {
                    status: Some("deploy_failed".to_string()),
                    error_message: Some("No GitHub token configured".to_string()),
                    ..Default::default()
                },
            )
            .await
            .ok();

            post_task_comment(
                pool,
                assignment.task_id,
                "Failed to trigger deployment: No GitHub connection configured.",
            )
            .await;

            return Ok(());
        }
    };

    let workflow_name = config.deploy_workflow_name.as_deref().unwrap_or("deploy.yml");
    let workflow_ref = config.deploy_workflow_ref.as_deref().unwrap_or("main");

    match trigger_workflow_dispatch(
        &token,
        repo_owner,
        repo_name,
        workflow_name,
        workflow_ref,
        assignment.task_id.to_string(),
    )
    .await
    {
        Ok(run_id) => {
            info!("Triggered deployment workflow, run_id: {:?}", run_id);

            if let Some(run_id) = run_id {
                CopilotAssignment::update(
                    pool,
                    assignment.id,
                    &UpdateCopilotAssignment {
                        deployment_workflow_run_id: Some(run_id),
                        ..Default::default()
                    },
                )
                .await
                .ok();
            }

            post_task_comment(
                pool,
                assignment.task_id,
                &format!("Deployment workflow '{}' triggered.", workflow_name),
            )
            .await;
        }
        Err(e) => {
            error!("Failed to trigger deployment: {}", e);

            CopilotAssignment::update(
                pool,
                assignment.id,
                &UpdateCopilotAssignment {
                    status: Some("deploy_failed".to_string()),
                    error_message: Some(e.clone()),
                    ..Default::default()
                },
            )
            .await
            .ok();

            post_task_comment(
                pool,
                assignment.task_id,
                &format!("Failed to trigger deployment: {}. Please deploy manually.", e),
            )
            .await;
        }
    }

    Ok(())
}

/// Handle workflow run events (deployment completion)
async fn handle_workflow_run_event(
    deployment: &DeploymentImpl,
    event: GitHubWorkflowRunEvent,
) -> Result<(), StatusCode> {
    let pool = &deployment.db().pool;

    info!(
        "Processing workflow_run event: {} for workflow '{}' (id: {})",
        event.action, event.workflow_run.name, event.workflow_run.id
    );

    // Find assignment by workflow run ID
    let assignment = CopilotAssignment::find_by_workflow_run(pool, event.workflow_run.id)
        .await
        .map_err(|e| {
            error!("Failed to find assignment by workflow run: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    let Some(assignment) = assignment else {
        info!(
            "No assignment found for workflow run {}",
            event.workflow_run.id
        );
        return Ok(());
    };

    let repo_owner = assignment.github_repo_owner.as_deref().unwrap_or("");
    let repo_name = assignment.github_repo_name.as_deref().unwrap_or("");

    match event.action.as_str() {
        "completed" => {
            let conclusion = event.workflow_run.conclusion.as_deref().unwrap_or("unknown");
            match conclusion {
                "success" => {
                    handle_deploy_success(pool, &assignment, &event.workflow_run.html_url, repo_owner, repo_name).await?;
                }
                "failure" | "cancelled" | "timed_out" => {
                    handle_deploy_failure(pool, &assignment, conclusion, &event.workflow_run.html_url).await?;
                }
                _ => {}
            }
        }
        "requested" | "in_progress" => {
            CopilotAssignment::update(
                pool,
                assignment.id,
                &UpdateCopilotAssignment {
                    status: Some("deploying".to_string()),
                    deployment_workflow_run_id: Some(event.workflow_run.id),
                    ..Default::default()
                },
            )
            .await
            .map_err(|e| {
                error!("Failed to update assignment: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;
        }
        _ => {}
    }

    Ok(())
}

/// Handle deployment success (Phase 2)
async fn handle_deploy_success(
    pool: &sqlx::PgPool,
    assignment: &CopilotAssignment,
    workflow_url: &str,
    repo_owner: &str,
    repo_name: &str,
) -> Result<(), StatusCode> {
    CopilotAssignment::update(
        pool,
        assignment.id,
        &UpdateCopilotAssignment {
            status: Some("deployed".to_string()),
            deployment_url: Some(workflow_url.to_string()),
            deployed_at: Some(Utc::now()),
            completed_at: Some(Utc::now()),
            ..Default::default()
        },
    )
    .await
    .map_err(|e| {
        error!("Failed to update assignment: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    post_task_comment(
        pool,
        assignment.task_id,
        &format!("Deployment [successful]({})!", workflow_url),
    )
    .await;

    // Check if we should auto-mark task as done
    let config = CopilotDeploymentConfig::find_by_assignment_repo(pool, repo_owner, repo_name)
        .await
        .ok()
        .flatten();

    if config.map(|c| c.auto_mark_task_done).unwrap_or(true) {
        mark_task_done(pool, assignment).await?;
    }

    Ok(())
}

/// Handle deployment failure
async fn handle_deploy_failure(
    pool: &sqlx::PgPool,
    assignment: &CopilotAssignment,
    conclusion: &str,
    workflow_url: &str,
) -> Result<(), StatusCode> {
    CopilotAssignment::update(
        pool,
        assignment.id,
        &UpdateCopilotAssignment {
            status: Some("deploy_failed".to_string()),
            deployment_url: Some(workflow_url.to_string()),
            error_message: Some(format!("Deployment {}", conclusion)),
            ..Default::default()
        },
    )
    .await
    .map_err(|e| {
        error!("Failed to update assignment: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    post_task_comment(
        pool,
        assignment.task_id,
        &format!(
            "Deployment [{}]({}). Please check the workflow logs and retry.",
            conclusion, workflow_url
        ),
    )
    .await;

    Ok(())
}

/// Mark task as done
async fn mark_task_done(
    pool: &sqlx::PgPool,
    assignment: &CopilotAssignment,
) -> Result<(), StatusCode> {
    // Update assignment to completed
    CopilotAssignment::update(
        pool,
        assignment.id,
        &UpdateCopilotAssignment {
            status: Some("completed".to_string()),
            completed_at: Some(Utc::now()),
            ..Default::default()
        },
    )
    .await
    .map_err(|e| {
        error!("Failed to update assignment: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    // Update task status to done
    Task::update_status(pool, assignment.task_id, TaskStatus::Done)
        .await
        .map_err(|e| {
            error!("Failed to update task status: {}", e);
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    info!("Marked task {} as done", assignment.task_id);

    post_task_comment(
        pool,
        assignment.task_id,
        "Task automatically marked as done after successful deployment.",
    )
    .await;

    Ok(())
}

/// Post a comment to a task
async fn post_task_comment(pool: &sqlx::PgPool, task_id: uuid::Uuid, content: &str) {
    if let Err(e) = TaskComment::create(
        pool,
        task_id,
        &CreateTaskComment {
            content: content.to_string(),
            is_internal: false,
            author_name: "GitHub Copilot".to_string(),
            author_email: None,
            author_id: None,
        },
    )
    .await
    {
        error!("Failed to create task comment: {}", e);
    }
}

/// Get GitHub token from workspace connection
async fn get_github_token(pool: &sqlx::PgPool) -> Result<String, String> {
    let connection = GitHubConnection::find_workspace_connection(pool)
        .await
        .map_err(|e| format!("DB error: {}", e))?
        .ok_or_else(|| "No GitHub connection configured".to_string())?;

    Ok(connection.access_token)
}

/// Parse PR URL to extract owner, repo, and PR number
fn parse_pr_url(url: &str) -> Result<(String, String, i64), String> {
    // Expected format: https://github.com/{owner}/{repo}/pull/{number}
    let parts: Vec<&str> = url.split('/').collect();
    if parts.len() < 7 {
        return Err("Invalid PR URL format".into());
    }

    let owner = parts[3].to_string();
    let repo = parts[4].to_string();
    let number = parts[6]
        .parse::<i64>()
        .map_err(|_| "Invalid PR number".to_string())?;

    Ok((owner, repo, number))
}

/// Merge a PR via GitHub API
async fn merge_pr(
    token: &str,
    owner: &str,
    repo: &str,
    pr_number: i64,
    merge_method: &str,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.github.com/repos/{}/{}/pulls/{}/merge",
        owner, repo, pr_number
    );

    let body = serde_json::json!({
        "merge_method": merge_method,
    });

    let response = client
        .put(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "iKanban-Copilot")
        .header("Accept", "application/vnd.github+json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() {
        Ok(())
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(format!("GitHub API error ({}): {}", status, body))
    }
}

/// Trigger a workflow dispatch
async fn trigger_workflow_dispatch(
    token: &str,
    owner: &str,
    repo: &str,
    workflow_file: &str,
    ref_name: &str,
    task_id: String,
) -> Result<Option<i64>, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://api.github.com/repos/{}/{}/actions/workflows/{}/dispatches",
        owner, repo, workflow_file
    );

    let body = serde_json::json!({
        "ref": ref_name,
        "inputs": {
            "task_id": task_id,
            "trigger_source": "ikanban"
        }
    });

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", token))
        .header("User-Agent", "iKanban-Copilot")
        .header("Accept", "application/vnd.github+json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    if response.status().is_success() || response.status() == StatusCode::NO_CONTENT {
        Ok(None) // workflow_dispatch returns 204 No Content
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(format!("GitHub API error ({}): {}", status, body))
    }
}

pub fn router(deployment: &DeploymentImpl) -> Router<DeploymentImpl> {
    Router::new()
        .route("/github", post(handle_github_webhook))
        .with_state(deployment.clone())
}
