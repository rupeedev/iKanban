//! AI Usage Records Repository
//! Token tracking for billing and analytics

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use thiserror::Error;
use ts_rs::TS;
use uuid::Uuid;

/// AI usage record
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct AiUsageRecord {
    pub id: Uuid,
    pub execution_id: Option<Uuid>,
    pub attempt_id: Option<Uuid>,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub ai_provider: String,
    pub ai_model: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cache_read_tokens: Option<i32>,
    pub cache_write_tokens: Option<i32>,
    pub input_cost_microdollars: Option<i64>,
    pub output_cost_microdollars: Option<i64>,
    pub total_cost_microdollars: Option<i64>,
    pub request_type: Option<String>,
    pub created_at: DateTime<Utc>,
    pub billing_period: Option<String>,
}

/// Data for creating a new usage record
#[derive(Debug, Clone, Deserialize)]
pub struct CreateUsageRecord {
    pub execution_id: Option<Uuid>,
    pub attempt_id: Option<Uuid>,
    pub organization_id: Uuid,
    pub user_id: Uuid,
    pub ai_provider: String,
    pub ai_model: String,
    pub input_tokens: i32,
    pub output_tokens: i32,
    pub cache_read_tokens: Option<i32>,
    pub cache_write_tokens: Option<i32>,
    pub request_type: Option<String>,
}

/// Usage summary for a period
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct UsageSummary {
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cache_read_tokens: i64,
    pub total_cache_write_tokens: i64,
    pub total_cost_microdollars: i64,
    pub request_count: i64,
}

/// Usage by model
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow, TS)]
#[ts(export)]
pub struct UsageByModel {
    pub ai_provider: String,
    pub ai_model: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub total_cost_microdollars: i64,
    pub request_count: i64,
}

#[derive(Debug, Error)]
pub enum UsageRecordError {
    #[error("usage record not found")]
    NotFound,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

/// Pricing configuration (in microdollars per token)
pub struct ModelPricing {
    pub input_price_per_million: i64,  // microdollars per million tokens
    pub output_price_per_million: i64, // microdollars per million tokens
}

impl ModelPricing {
    /// Calculate cost for tokens
    pub fn calculate_cost(&self, input_tokens: i32, output_tokens: i32) -> (i64, i64, i64) {
        let input_cost = (input_tokens as i64 * self.input_price_per_million) / 1_000_000;
        let output_cost = (output_tokens as i64 * self.output_price_per_million) / 1_000_000;
        (input_cost, output_cost, input_cost + output_cost)
    }
}

/// Get pricing for a model (placeholder - should be configurable)
pub fn get_model_pricing(provider: &str, model: &str) -> ModelPricing {
    // Prices in microdollars per million tokens
    match (provider, model) {
        ("anthropic", "claude-3-opus") => ModelPricing {
            input_price_per_million: 15_000_000,  // $15/M
            output_price_per_million: 75_000_000, // $75/M
        },
        ("anthropic", "claude-3-sonnet") | ("anthropic", "claude-sonnet-4") => ModelPricing {
            input_price_per_million: 3_000_000,   // $3/M
            output_price_per_million: 15_000_000, // $15/M
        },
        ("anthropic", "claude-3-haiku") => ModelPricing {
            input_price_per_million: 250_000,    // $0.25/M
            output_price_per_million: 1_250_000, // $1.25/M
        },
        ("openai", "gpt-4") => ModelPricing {
            input_price_per_million: 30_000_000,  // $30/M
            output_price_per_million: 60_000_000, // $60/M
        },
        ("openai", "gpt-4-turbo") => ModelPricing {
            input_price_per_million: 10_000_000,  // $10/M
            output_price_per_million: 30_000_000, // $30/M
        },
        ("openai", "gpt-3.5-turbo") => ModelPricing {
            input_price_per_million: 500_000,    // $0.50/M
            output_price_per_million: 1_500_000, // $1.50/M
        },
        _ => ModelPricing {
            input_price_per_million: 1_000_000,  // $1/M default
            output_price_per_million: 3_000_000, // $3/M default
        },
    }
}

pub struct AiUsageRepository;

impl AiUsageRepository {
    /// Create a new usage record with automatic cost calculation
    pub async fn create(
        pool: &PgPool,
        data: CreateUsageRecord,
    ) -> Result<AiUsageRecord, UsageRecordError> {
        // Calculate costs
        let pricing = get_model_pricing(&data.ai_provider, &data.ai_model);
        let (input_cost, output_cost, total_cost) =
            pricing.calculate_cost(data.input_tokens, data.output_tokens);

        // Get billing period (YYYY-MM format)
        let billing_period = Utc::now().format("%Y-%m").to_string();

        let record = sqlx::query_as!(
            AiUsageRecord,
            r#"
            INSERT INTO ai_usage_records (
                execution_id, attempt_id, organization_id, user_id,
                ai_provider, ai_model,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                input_cost_microdollars, output_cost_microdollars, total_cost_microdollars,
                request_type, billing_period
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING
                id, execution_id, attempt_id, organization_id, user_id,
                ai_provider, ai_model,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                input_cost_microdollars, output_cost_microdollars, total_cost_microdollars,
                request_type, created_at, billing_period
            "#,
            data.execution_id,
            data.attempt_id,
            data.organization_id,
            data.user_id,
            data.ai_provider,
            data.ai_model,
            data.input_tokens,
            data.output_tokens,
            data.cache_read_tokens,
            data.cache_write_tokens,
            input_cost,
            output_cost,
            total_cost,
            data.request_type,
            billing_period
        )
        .fetch_one(pool)
        .await?;

        Ok(record)
    }

    /// Get usage summary for an organization in a billing period
    pub async fn get_organization_summary(
        pool: &PgPool,
        organization_id: Uuid,
        billing_period: &str,
    ) -> Result<UsageSummary, UsageRecordError> {
        let summary = sqlx::query_as!(
            UsageSummary,
            r#"
            SELECT
                COALESCE(SUM(input_tokens), 0)::bigint AS "total_input_tokens!",
                COALESCE(SUM(output_tokens), 0)::bigint AS "total_output_tokens!",
                COALESCE(SUM(cache_read_tokens), 0)::bigint AS "total_cache_read_tokens!",
                COALESCE(SUM(cache_write_tokens), 0)::bigint AS "total_cache_write_tokens!",
                COALESCE(SUM(total_cost_microdollars), 0)::bigint AS "total_cost_microdollars!",
                COUNT(*) AS "request_count!"
            FROM ai_usage_records
            WHERE organization_id = $1 AND billing_period = $2
            "#,
            organization_id,
            billing_period
        )
        .fetch_one(pool)
        .await?;

        Ok(summary)
    }

    /// Get usage summary for a user in a billing period
    pub async fn get_user_summary(
        pool: &PgPool,
        user_id: Uuid,
        billing_period: &str,
    ) -> Result<UsageSummary, UsageRecordError> {
        let summary = sqlx::query_as!(
            UsageSummary,
            r#"
            SELECT
                COALESCE(SUM(input_tokens), 0)::bigint AS "total_input_tokens!",
                COALESCE(SUM(output_tokens), 0)::bigint AS "total_output_tokens!",
                COALESCE(SUM(cache_read_tokens), 0)::bigint AS "total_cache_read_tokens!",
                COALESCE(SUM(cache_write_tokens), 0)::bigint AS "total_cache_write_tokens!",
                COALESCE(SUM(total_cost_microdollars), 0)::bigint AS "total_cost_microdollars!",
                COUNT(*) AS "request_count!"
            FROM ai_usage_records
            WHERE user_id = $1 AND billing_period = $2
            "#,
            user_id,
            billing_period
        )
        .fetch_one(pool)
        .await?;

        Ok(summary)
    }

    /// Get usage breakdown by model for an organization
    pub async fn get_usage_by_model(
        pool: &PgPool,
        organization_id: Uuid,
        billing_period: &str,
    ) -> Result<Vec<UsageByModel>, UsageRecordError> {
        let usage = sqlx::query_as!(
            UsageByModel,
            r#"
            SELECT
                ai_provider AS "ai_provider!",
                ai_model AS "ai_model!",
                COALESCE(SUM(input_tokens), 0)::bigint AS "input_tokens!",
                COALESCE(SUM(output_tokens), 0)::bigint AS "output_tokens!",
                COALESCE(SUM(total_cost_microdollars), 0)::bigint AS "total_cost_microdollars!",
                COUNT(*) AS "request_count!"
            FROM ai_usage_records
            WHERE organization_id = $1 AND billing_period = $2
            GROUP BY ai_provider, ai_model
            ORDER BY COALESCE(SUM(total_cost_microdollars), 0) DESC
            "#,
            organization_id,
            billing_period
        )
        .fetch_all(pool)
        .await?;

        Ok(usage)
    }

    /// Get usage for an execution
    pub async fn get_execution_usage(
        pool: &PgPool,
        execution_id: Uuid,
    ) -> Result<UsageSummary, UsageRecordError> {
        let summary = sqlx::query_as!(
            UsageSummary,
            r#"
            SELECT
                COALESCE(SUM(input_tokens), 0)::bigint AS "total_input_tokens!",
                COALESCE(SUM(output_tokens), 0)::bigint AS "total_output_tokens!",
                COALESCE(SUM(cache_read_tokens), 0)::bigint AS "total_cache_read_tokens!",
                COALESCE(SUM(cache_write_tokens), 0)::bigint AS "total_cache_write_tokens!",
                COALESCE(SUM(total_cost_microdollars), 0)::bigint AS "total_cost_microdollars!",
                COUNT(*) AS "request_count!"
            FROM ai_usage_records
            WHERE execution_id = $1
            "#,
            execution_id
        )
        .fetch_one(pool)
        .await?;

        Ok(summary)
    }

    /// List records for an organization (paginated)
    pub async fn list_by_organization(
        pool: &PgPool,
        organization_id: Uuid,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<AiUsageRecord>, UsageRecordError> {
        let records = sqlx::query_as!(
            AiUsageRecord,
            r#"
            SELECT
                id, execution_id, attempt_id, organization_id, user_id,
                ai_provider, ai_model,
                input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                input_cost_microdollars, output_cost_microdollars, total_cost_microdollars,
                request_type, created_at, billing_period
            FROM ai_usage_records
            WHERE organization_id = $1
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            "#,
            organization_id,
            limit,
            offset
        )
        .fetch_all(pool)
        .await?;

        Ok(records)
    }

    /// Get current billing period (YYYY-MM format)
    pub fn current_billing_period() -> String {
        Utc::now().format("%Y-%m").to_string()
    }
}
