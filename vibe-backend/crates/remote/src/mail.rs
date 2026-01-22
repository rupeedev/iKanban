use std::time::Duration;

use async_trait::async_trait;
use serde_json::json;

use crate::db::organization_members::MemberRole;

const LOOPS_INVITE_TEMPLATE_ID: &str = "cmhvy2wgs3s13z70i1pxakij9";
const LOOPS_REVIEW_READY_TEMPLATE_ID: &str = "cmj47k5ge16990iylued9by17";
const LOOPS_REVIEW_FAILED_TEMPLATE_ID: &str = "cmj49ougk1c8s0iznavijdqpo";
const LOOPS_EMAIL_VERIFICATION_TEMPLATE_ID: &str = "cm70vmnpx02y40mi0vry4ej3f";
// Registration notification templates (IKA-232)
// Note: Create templates in Loops.so dashboard and update IDs here
const LOOPS_REGISTRATION_SUBMITTED_TEMPLATE_ID: &str = "cm7xxxxxxx";
const LOOPS_REGISTRATION_APPROVED_TEMPLATE_ID: &str = "cm7xxxxxxy";
const LOOPS_REGISTRATION_REJECTED_TEMPLATE_ID: &str = "cm7xxxxxxxz";

const LOOPS_API_URL: &str = "https://app.loops.so/api/v1/transactional";

#[async_trait]
pub trait Mailer: Send + Sync {
    async fn send_org_invitation(
        &self,
        org_name: &str,
        email: &str,
        accept_url: &str,
        role: MemberRole,
        invited_by: Option<&str>,
    );

    async fn send_review_ready(&self, email: &str, review_url: &str, pr_name: &str);

    async fn send_review_failed(&self, email: &str, pr_name: &str, review_id: &str);

    /// Send email verification email (IKA-189)
    async fn send_email_verification(&self, email: &str, verify_url: &str);

    /// Notify superadmins that a new registration has been submitted (IKA-232)
    async fn send_registration_submitted_to_admin(
        &self,
        admin_email: &str,
        user_email: &str,
        user_name: &str,
        workspace_name: &str,
        review_url: &str,
    );

    /// Notify user that their registration has been approved (IKA-232)
    async fn send_registration_approved(
        &self,
        email: &str,
        user_name: &str,
        workspace_name: &str,
        login_url: &str,
    );

    /// Notify user that their registration has been rejected (IKA-232)
    async fn send_registration_rejected(&self, email: &str, user_name: &str, reason: Option<&str>);
}

pub struct LoopsMailer {
    client: reqwest::Client,
    api_key: String,
}

impl LoopsMailer {
    pub fn new(api_key: String) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(5))
            .build()
            .expect("failed to build reqwest client");

        Self { client, api_key }
    }

    async fn send_email(&self, payload: serde_json::Value, context: &str) {
        let res = self
            .client
            .post(LOOPS_API_URL)
            .bearer_auth(&self.api_key)
            .json(&payload)
            .send()
            .await;

        match res {
            Ok(resp) if resp.status().is_success() => {
                tracing::debug!("{context} sent successfully");
            }
            Ok(resp) => {
                let status = resp.status();
                let body = resp.text().await.unwrap_or_default();
                tracing::warn!(status = %status, body = %body, "Loops send failed for {context}");
            }
            Err(err) => {
                tracing::error!(error = ?err, "Loops request error for {context}");
            }
        }
    }
}

#[async_trait]
impl Mailer for LoopsMailer {
    async fn send_org_invitation(
        &self,
        org_name: &str,
        email: &str,
        accept_url: &str,
        role: MemberRole,
        invited_by: Option<&str>,
    ) {
        let role_str = match role {
            MemberRole::Admin => "admin",
            MemberRole::Member => "member",
        };
        let inviter = invited_by.unwrap_or("someone");

        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending invitation email to {email}\n\
                 Organization: {org_name}\n\
                 Role: {role_str}\n\
                 Invited by: {inviter}\n\
                 Accept URL: {accept_url}"
            );
        }

        let payload = json!({
            "transactionalId": LOOPS_INVITE_TEMPLATE_ID,
            "email": email,
            "dataVariables": {
                "org_name": org_name,
                "accept_url": accept_url,
                "invited_by": inviter,
            }
        });
        self.send_email(payload, &format!("invitation to {email}"))
            .await;
    }

    async fn send_review_ready(&self, email: &str, review_url: &str, pr_name: &str) {
        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending review ready email to {email}\n\
                 PR: {pr_name}\n\
                 Review URL: {review_url}"
            );
        }

        let payload = json!({
            "transactionalId": LOOPS_REVIEW_READY_TEMPLATE_ID,
            "email": email,
            "dataVariables": {
                "review_url": review_url,
                "pr_name": pr_name,
            }
        });
        self.send_email(payload, &format!("review ready to {email}"))
            .await;
    }

    async fn send_review_failed(&self, email: &str, pr_name: &str, review_id: &str) {
        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending review failed email to {email}\n\
                 PR: {pr_name}\n\
                 Review ID: {review_id}"
            );
        }

        let payload = json!({
            "transactionalId": LOOPS_REVIEW_FAILED_TEMPLATE_ID,
            "email": email,
            "dataVariables": {
                "pr_name": pr_name,
                "review_id": review_id,
            }
        });
        self.send_email(payload, &format!("review failed to {email}"))
            .await;
    }

    async fn send_email_verification(&self, email: &str, verify_url: &str) {
        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending email verification to {email}\n\
                 Verify URL: {verify_url}"
            );
        }

        let payload = json!({
            "transactionalId": LOOPS_EMAIL_VERIFICATION_TEMPLATE_ID,
            "email": email,
            "dataVariables": {
                "verify_url": verify_url,
            }
        });
        self.send_email(payload, &format!("email verification to {email}"))
            .await;
    }

    async fn send_registration_submitted_to_admin(
        &self,
        admin_email: &str,
        user_email: &str,
        user_name: &str,
        workspace_name: &str,
        review_url: &str,
    ) {
        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending registration notification to admin {admin_email}\n\
                 User: {user_name} ({user_email})\n\
                 Workspace: {workspace_name}\n\
                 Review URL: {review_url}"
            );
        }

        let payload = json!({
            "transactionalId": LOOPS_REGISTRATION_SUBMITTED_TEMPLATE_ID,
            "email": admin_email,
            "dataVariables": {
                "user_email": user_email,
                "user_name": user_name,
                "workspace_name": workspace_name,
                "review_url": review_url,
            }
        });
        self.send_email(
            payload,
            &format!("registration submitted to admin {admin_email}"),
        )
        .await;
    }

    async fn send_registration_approved(
        &self,
        email: &str,
        user_name: &str,
        workspace_name: &str,
        login_url: &str,
    ) {
        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending registration approved email to {email}\n\
                 User: {user_name}\n\
                 Workspace: {workspace_name}\n\
                 Login URL: {login_url}"
            );
        }

        let payload = json!({
            "transactionalId": LOOPS_REGISTRATION_APPROVED_TEMPLATE_ID,
            "email": email,
            "dataVariables": {
                "user_name": user_name,
                "workspace_name": workspace_name,
                "login_url": login_url,
            }
        });
        self.send_email(payload, &format!("registration approved to {email}"))
            .await;
    }

    async fn send_registration_rejected(&self, email: &str, user_name: &str, reason: Option<&str>) {
        let rejection_reason = reason.unwrap_or("No specific reason provided");

        if cfg!(debug_assertions) {
            tracing::info!(
                "Sending registration rejected email to {email}\n\
                 User: {user_name}\n\
                 Reason: {rejection_reason}"
            );
        }

        let payload = json!({
            "transactionalId": LOOPS_REGISTRATION_REJECTED_TEMPLATE_ID,
            "email": email,
            "dataVariables": {
                "user_name": user_name,
                "reason": rejection_reason,
            }
        });
        self.send_email(payload, &format!("registration rejected to {email}"))
            .await;
    }
}
