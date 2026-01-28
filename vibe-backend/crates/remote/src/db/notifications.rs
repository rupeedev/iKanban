//! Notification helper functions for creating inbox items
//!
//! This module provides helper functions that are called when various events occur
//! (task assignment, comments, status changes, etc.) to create inbox notifications.

use sqlx::PgPool;
use uuid::Uuid;

use super::inbox::{CreateInboxItem, InboxNotificationType, InboxRepository};

/// Create a notification when a task is assigned to a user
///
/// # Arguments
/// * `pool` - Database connection pool
/// * `recipient_id` - User who should receive the notification (the assignee)
/// * `actor_id` - User who performed the assignment
/// * `task_id` - The task being assigned
/// * `task_title` - Title of the task (for display)
/// * `project_id` - Project the task belongs to
/// * `workspace_id` - Workspace the task belongs to
pub async fn notify_task_assigned(
    pool: &PgPool,
    recipient_id: Uuid,
    actor_id: Uuid,
    task_id: Uuid,
    task_title: &str,
    project_id: Option<Uuid>,
    workspace_id: Option<Uuid>,
) -> Result<(), super::inbox::InboxError> {
    // Don't notify if user assigned to themselves
    if recipient_id == actor_id {
        return Ok(());
    }

    let payload = CreateInboxItem {
        notification_type: InboxNotificationType::TaskAssigned,
        title: format!("You were assigned to: {}", task_title),
        message: Some("You have been assigned to this task.".to_string()),
        actor_id: Some(actor_id),
        task_id: Some(task_id),
        project_id,
        workspace_id,
    };

    InboxRepository::create(pool, recipient_id, &payload).await?;
    Ok(())
}

/// Create a notification when a task is unassigned from a user
pub async fn notify_task_unassigned(
    pool: &PgPool,
    recipient_id: Uuid,
    actor_id: Uuid,
    task_id: Uuid,
    task_title: &str,
    project_id: Option<Uuid>,
    workspace_id: Option<Uuid>,
) -> Result<(), super::inbox::InboxError> {
    // Don't notify if user unassigned themselves
    if recipient_id == actor_id {
        return Ok(());
    }

    let payload = CreateInboxItem {
        notification_type: InboxNotificationType::TaskUnassigned,
        title: format!("You were unassigned from: {}", task_title),
        message: Some("You have been removed from this task.".to_string()),
        actor_id: Some(actor_id),
        task_id: Some(task_id),
        project_id,
        workspace_id,
    };

    InboxRepository::create(pool, recipient_id, &payload).await?;
    Ok(())
}

/// Create a notification when a user is mentioned in a comment
#[allow(clippy::too_many_arguments)]
pub async fn notify_task_mentioned(
    pool: &PgPool,
    recipient_id: Uuid,
    actor_id: Uuid,
    task_id: Uuid,
    task_title: &str,
    mention_context: &str,
    project_id: Option<Uuid>,
    workspace_id: Option<Uuid>,
) -> Result<(), super::inbox::InboxError> {
    // Don't notify if user mentioned themselves
    if recipient_id == actor_id {
        return Ok(());
    }

    let payload = CreateInboxItem {
        notification_type: InboxNotificationType::TaskMentioned,
        title: format!("You were mentioned in: {}", task_title),
        message: Some(truncate_message(mention_context, 200)),
        actor_id: Some(actor_id),
        task_id: Some(task_id),
        project_id,
        workspace_id,
    };

    InboxRepository::create(pool, recipient_id, &payload).await?;
    Ok(())
}

/// Create a notification when someone comments on a task
#[allow(clippy::too_many_arguments)]
pub async fn notify_task_comment(
    pool: &PgPool,
    recipient_id: Uuid,
    actor_id: Uuid,
    task_id: Uuid,
    task_title: &str,
    comment_preview: &str,
    project_id: Option<Uuid>,
    workspace_id: Option<Uuid>,
) -> Result<(), super::inbox::InboxError> {
    // Don't notify if user commented on their own task
    if recipient_id == actor_id {
        return Ok(());
    }

    let payload = CreateInboxItem {
        notification_type: InboxNotificationType::TaskComment,
        title: format!("New comment on: {}", task_title),
        message: Some(truncate_message(comment_preview, 200)),
        actor_id: Some(actor_id),
        task_id: Some(task_id),
        project_id,
        workspace_id,
    };

    InboxRepository::create(pool, recipient_id, &payload).await?;
    Ok(())
}

/// Create a notification when a task status changes
#[allow(clippy::too_many_arguments)]
pub async fn notify_task_status_changed(
    pool: &PgPool,
    recipient_id: Uuid,
    actor_id: Uuid,
    task_id: Uuid,
    task_title: &str,
    old_status: &str,
    new_status: &str,
    project_id: Option<Uuid>,
    workspace_id: Option<Uuid>,
) -> Result<(), super::inbox::InboxError> {
    // Don't notify if user changed their own task status
    if recipient_id == actor_id {
        return Ok(());
    }

    let payload = CreateInboxItem {
        notification_type: InboxNotificationType::TaskStatusChanged,
        title: format!("Status changed: {}", task_title),
        message: Some(format!("{} → {}", old_status, new_status)),
        actor_id: Some(actor_id),
        task_id: Some(task_id),
        project_id,
        workspace_id,
    };

    InboxRepository::create(pool, recipient_id, &payload).await?;
    Ok(())
}

/// Create a notification when a task is completed
pub async fn notify_task_completed(
    pool: &PgPool,
    recipient_id: Uuid,
    actor_id: Uuid,
    task_id: Uuid,
    task_title: &str,
    project_id: Option<Uuid>,
    workspace_id: Option<Uuid>,
) -> Result<(), super::inbox::InboxError> {
    // Don't notify if user completed their own task
    if recipient_id == actor_id {
        return Ok(());
    }

    let payload = CreateInboxItem {
        notification_type: InboxNotificationType::TaskCompleted,
        title: format!("Task completed: {}", task_title),
        message: Some("This task has been marked as done.".to_string()),
        actor_id: Some(actor_id),
        task_id: Some(task_id),
        project_id,
        workspace_id,
    };

    InboxRepository::create(pool, recipient_id, &payload).await?;
    Ok(())
}

/// Create a notification when a user is mentioned in a project update
pub async fn notify_mentioned_in_update(
    pool: &PgPool,
    recipient_id: Uuid,
    actor_id: Uuid,
    update_content: &str,
    project_id: Uuid,
    workspace_id: Option<Uuid>,
) -> Result<(), super::inbox::InboxError> {
    // Don't notify if user mentioned themselves
    if recipient_id == actor_id {
        return Ok(());
    }

    let payload = CreateInboxItem {
        notification_type: InboxNotificationType::MentionedInUpdate,
        title: "You were mentioned in a project update".to_string(),
        message: Some(truncate_message(update_content, 200)),
        actor_id: Some(actor_id),
        task_id: None,
        project_id: Some(project_id),
        workspace_id,
    };

    InboxRepository::create(pool, recipient_id, &payload).await?;
    Ok(())
}

/// Create a notification for approaching due date
/// Note: This is typically called from a scheduled job, so actor_id is None (system notification)
pub async fn notify_due_date_approaching(
    pool: &PgPool,
    recipient_id: Uuid,
    task_id: Uuid,
    task_title: &str,
    due_date: &str,
    project_id: Option<Uuid>,
    workspace_id: Option<Uuid>,
) -> Result<(), super::inbox::InboxError> {
    let payload = CreateInboxItem {
        notification_type: InboxNotificationType::DueDateApproaching,
        title: format!("Due soon: {}", task_title),
        message: Some(format!("This task is due on {}", due_date)),
        actor_id: None, // System notification
        task_id: Some(task_id),
        project_id,
        workspace_id,
    };

    InboxRepository::create(pool, recipient_id, &payload).await?;
    Ok(())
}

/// Extract @mentions from text content
/// Returns a list of usernames (without the @ prefix)
pub fn extract_mentions(text: &str) -> Vec<String> {
    let mut mentions = Vec::new();
    let mut chars = text.chars().peekable();

    while let Some(c) = chars.next() {
        if c == '@' {
            let mut username = String::new();
            while let Some(&next) = chars.peek() {
                if next.is_alphanumeric() || next == '_' || next == '-' || next == '.' {
                    username.push(chars.next().unwrap());
                } else {
                    break;
                }
            }
            if !username.is_empty() {
                mentions.push(username);
            }
        }
    }

    mentions
}

/// Resolve a username/email to a user ID
/// Looks up in the users table by email
pub async fn resolve_mention_to_user_id(
    pool: &PgPool,
    mention: &str,
) -> Result<Option<Uuid>, sqlx::Error> {
    // Try to find by email (mentions could be email addresses)
    let result = sqlx::query_scalar!(
        r#"SELECT id AS "id!: Uuid" FROM users WHERE email = $1"#,
        mention
    )
    .fetch_optional(pool)
    .await?;

    Ok(result)
}

/// Truncate a message to a maximum length, adding ellipsis if needed
fn truncate_message(msg: &str, max_len: usize) -> String {
    if msg.len() <= max_len {
        msg.to_string()
    } else {
        format!("{}...", &msg[..max_len.saturating_sub(3)])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_mentions_single() {
        let mentions = extract_mentions("Hello @john.doe how are you?");
        assert_eq!(mentions, vec!["john.doe"]);
    }

    #[test]
    fn test_extract_mentions_multiple() {
        let mentions = extract_mentions("@alice and @bob please review");
        assert_eq!(mentions, vec!["alice", "bob"]);
    }

    #[test]
    fn test_extract_mentions_with_underscore() {
        let mentions = extract_mentions("Thanks @john_smith for the help");
        assert_eq!(mentions, vec!["john_smith"]);
    }

    #[test]
    fn test_extract_mentions_empty() {
        let mentions = extract_mentions("No mentions here");
        assert!(mentions.is_empty());
    }

    #[test]
    fn test_extract_mentions_at_end() {
        let mentions = extract_mentions("Check with @admin");
        assert_eq!(mentions, vec!["admin"]);
    }

    #[test]
    fn test_truncate_message_short() {
        let result = truncate_message("Short message", 50);
        assert_eq!(result, "Short message");
    }

    #[test]
    fn test_truncate_message_long() {
        let long_msg = "This is a very long message that exceeds the limit";
        let result = truncate_message(long_msg, 20);
        assert_eq!(result, "This is a very lo...");
    }
}
