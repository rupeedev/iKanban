//! Stripe service for subscription management (IKA-181)
//!
//! Provides methods to interact with Stripe API for:
//! - Creating checkout sessions for plan upgrades
//! - Creating billing portal sessions for subscription management
//! - Syncing subscription data from webhooks

use secrecy::ExposeSecret;
use sqlx::PgPool;
use stripe::{
    BillingPortalSession, CheckoutSession, CheckoutSessionMode, Client, CreateBillingPortalSession,
    CreateCheckoutSession, CreateCheckoutSessionLineItems, Subscription,
};
use uuid::Uuid;

use crate::config::StripeConfig;
use db::models::workspace_subscription::{
    CreateWorkspaceSubscription, SubscriptionStatus, UpdateWorkspaceSubscription,
    WorkspaceSubscription,
};

/// Stripe service for handling subscription operations
#[derive(Clone)]
pub struct StripeService {
    client: Client,
    config: StripeConfig,
}

/// Error types for Stripe operations
#[derive(Debug, thiserror::Error)]
pub enum StripeError {
    #[error("Stripe API error: {0}")]
    Api(#[from] stripe::StripeError),
    #[error("Database error: {0}")]
    Database(String),
    #[error("Subscription not found")]
    SubscriptionNotFound,
    #[error("Workspace not found")]
    WorkspaceNotFound,
    #[error("Invalid plan: {0}")]
    InvalidPlan(String),
    #[error("Missing Stripe customer ID")]
    MissingCustomerId,
}

impl StripeService {
    /// Create a new Stripe service from config
    pub fn new(config: &StripeConfig) -> Self {
        let client = Client::new(config.secret_key.expose_secret());
        Self {
            client,
            config: config.clone(),
        }
    }

    /// Get the Stripe client
    pub fn client(&self) -> &Client {
        &self.client
    }

    /// Get the price ID for a given plan
    pub fn get_price_id(&self, plan: &str) -> Result<&str, StripeError> {
        match plan {
            "pro" => Ok(&self.config.pro_price_id),
            "enterprise" => Ok(&self.config.enterprise_price_id),
            _ => Err(StripeError::InvalidPlan(plan.to_string())),
        }
    }

    /// Create a checkout session for upgrading to a paid plan
    ///
    /// Returns the checkout URL where the user should be redirected
    pub async fn create_checkout_session(
        &self,
        workspace_id: Uuid,
        plan: &str,
        customer_email: &str,
    ) -> Result<String, StripeError> {
        let price_id = self.get_price_id(plan)?;

        let success_url = format!(
            "{}/settings/billing?session_id={{CHECKOUT_SESSION_ID}}&success=true",
            self.config.frontend_url
        );
        let cancel_url = format!(
            "{}/settings/billing?canceled=true",
            self.config.frontend_url
        );

        let mut params = CreateCheckoutSession::new();
        params.mode = Some(CheckoutSessionMode::Subscription);
        params.success_url = Some(&success_url);
        params.cancel_url = Some(&cancel_url);
        params.customer_email = Some(customer_email);
        params.line_items = Some(vec![CreateCheckoutSessionLineItems {
            price: Some(price_id.to_string()),
            quantity: Some(1),
            ..Default::default()
        }]);
        params.metadata = Some(
            [("workspace_id".to_string(), workspace_id.to_string())]
                .into_iter()
                .collect(),
        );
        params.subscription_data = Some(stripe::CreateCheckoutSessionSubscriptionData {
            metadata: Some(
                [("workspace_id".to_string(), workspace_id.to_string())]
                    .into_iter()
                    .collect(),
            ),
            ..Default::default()
        });

        let session = CheckoutSession::create(&self.client, params).await?;

        session
            .url
            .ok_or_else(|| StripeError::Api(stripe::StripeError::ClientError("No checkout URL returned".into())))
    }

    /// Create a billing portal session for managing an existing subscription
    ///
    /// Returns the portal URL where the user should be redirected
    pub async fn create_portal_session(
        &self,
        pool: &PgPool,
        workspace_id: Uuid,
    ) -> Result<String, StripeError> {
        // Get the subscription record to find the Stripe customer ID
        let subscription = WorkspaceSubscription::find_by_workspace_id(pool, workspace_id)
            .await
            .map_err(|e| StripeError::Database(e.to_string()))?
            .ok_or(StripeError::SubscriptionNotFound)?;

        let customer_id = subscription
            .stripe_customer_id
            .ok_or(StripeError::MissingCustomerId)?;

        let return_url = format!("{}/settings/billing", self.config.frontend_url);

        let params = CreateBillingPortalSession {
            customer: customer_id.parse().map_err(|_| {
                StripeError::Api(stripe::StripeError::ClientError("Invalid customer ID".into()))
            })?,
            return_url: Some(&return_url),
            configuration: None,
            expand: &[],
            flow_data: None,
            locale: None,
            on_behalf_of: None,
        };

        let session = BillingPortalSession::create(&self.client, params).await?;

        Ok(session.url)
    }

    /// Get a Stripe subscription by ID
    pub async fn get_subscription(&self, subscription_id: &str) -> Result<Subscription, StripeError> {
        let id = subscription_id.parse().map_err(|_| {
            StripeError::Api(stripe::StripeError::ClientError("Invalid subscription ID".into()))
        })?;
        let subscription = Subscription::retrieve(&self.client, &id, &[]).await?;
        Ok(subscription)
    }

    /// Sync subscription data from Stripe to database
    ///
    /// Called after webhook events to update the local subscription record
    pub async fn sync_subscription(
        &self,
        pool: &PgPool,
        stripe_subscription: &Subscription,
        workspace_id: Uuid,
    ) -> Result<WorkspaceSubscription, StripeError> {
        let status = Self::map_stripe_status(&stripe_subscription.status);
        // Expandable<Customer> has id() method that returns CustomerId directly
        let customer_id = Some(stripe_subscription.customer.id().to_string());

        // current_period_start/end are Timestamp (i64), not Option
        let period_start = chrono::DateTime::from_timestamp(stripe_subscription.current_period_start, 0);
        let period_end = chrono::DateTime::from_timestamp(stripe_subscription.current_period_end, 0);

        // Try to find existing subscription by workspace
        let existing = WorkspaceSubscription::find_by_workspace_id(pool, workspace_id)
            .await
            .map_err(|e| StripeError::Database(e.to_string()))?;

        if let Some(sub) = existing {
            // Update existing subscription
            let update = UpdateWorkspaceSubscription {
                stripe_customer_id: customer_id,
                stripe_subscription_id: Some(stripe_subscription.id.to_string()),
                current_period_start: period_start,
                current_period_end: period_end,
                status: Some(status),
            };

            WorkspaceSubscription::update(pool, sub.id, &update)
                .await
                .map_err(|e| StripeError::Database(e.to_string()))
        } else {
            // Create new subscription record
            let create = CreateWorkspaceSubscription {
                workspace_id,
                stripe_customer_id: customer_id,
                stripe_subscription_id: Some(stripe_subscription.id.to_string()),
                current_period_start: period_start,
                current_period_end: period_end,
                status: Some(status),
            };

            WorkspaceSubscription::create(pool, &create)
                .await
                .map_err(|e| StripeError::Database(e.to_string()))
        }
    }

    /// Map Stripe subscription status to our internal status
    fn map_stripe_status(status: &stripe::SubscriptionStatus) -> SubscriptionStatus {
        match status {
            stripe::SubscriptionStatus::Trialing => SubscriptionStatus::Trialing,
            stripe::SubscriptionStatus::Active => SubscriptionStatus::Active,
            stripe::SubscriptionStatus::Canceled => SubscriptionStatus::Canceled,
            stripe::SubscriptionStatus::PastDue => SubscriptionStatus::PastDue,
            stripe::SubscriptionStatus::Unpaid => SubscriptionStatus::Unpaid,
            stripe::SubscriptionStatus::Incomplete => SubscriptionStatus::Incomplete,
            stripe::SubscriptionStatus::IncompleteExpired => SubscriptionStatus::IncompleteExpired,
            stripe::SubscriptionStatus::Paused => SubscriptionStatus::Paused,
        }
    }

    /// Update workspace plan based on Stripe subscription
    ///
    /// This should be called after subscription changes to update the workspace plan
    pub async fn update_workspace_plan(
        &self,
        pool: &PgPool,
        workspace_id: Uuid,
        plan: &str,
    ) -> Result<(), StripeError> {
        // Use runtime type checking for SQLx cache compatibility
        sqlx::query(
            r#"UPDATE tenant_workspaces SET plan = $1, updated_at = NOW() WHERE id = $2"#
        )
        .bind(plan)
        .bind(workspace_id)
        .execute(pool)
        .await
        .map_err(|e| StripeError::Database(e.to_string()))?;

        Ok(())
    }

    /// Get the plan name from a Stripe price ID
    pub fn plan_from_price_id(&self, price_id: &str) -> Option<&'static str> {
        if price_id == self.config.pro_price_id {
            Some("pro")
        } else if price_id == self.config.enterprise_price_id {
            Some("enterprise")
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_map_stripe_status() {
        assert!(matches!(
            StripeService::map_stripe_status(&stripe::SubscriptionStatus::Active),
            SubscriptionStatus::Active
        ));
        assert!(matches!(
            StripeService::map_stripe_status(&stripe::SubscriptionStatus::Canceled),
            SubscriptionStatus::Canceled
        ));
        assert!(matches!(
            StripeService::map_stripe_status(&stripe::SubscriptionStatus::PastDue),
            SubscriptionStatus::PastDue
        ));
    }
}
