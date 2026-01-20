//! Trust level automatic progression logic (IKA-187)
//!
//! Implements automatic trust level progression based on user activity:
//! - New (0): Default
//! - Basic (1): email_verified + account_age_days >= 7
//! - Standard (2): account_age_days >= 30 + total_tasks_created >= 5 + no abuse signals
//! - Trusted (3): account_age_days >= 90 + total_tasks_created >= 20 + members_invited >= 1
//! - Verified (4): Manual admin approval only

use sqlx::PgPool;

use super::{
    abuse_detection_signal::AbuseDetectionSignal,
    user_trust_profile::{TrustLevel, UserTrustProfile},
};

/// Progression thresholds
pub mod thresholds {
    /// Days for Basic level eligibility
    pub const BASIC_DAYS: i32 = 7;
    /// Days for Standard level eligibility
    pub const STANDARD_DAYS: i32 = 30;
    /// Tasks for Standard level eligibility
    pub const STANDARD_TASKS: i32 = 5;
    /// Days for Trusted level eligibility
    pub const TRUSTED_DAYS: i32 = 90;
    /// Tasks for Trusted level eligibility
    pub const TRUSTED_TASKS: i32 = 20;
    /// Invites for Trusted level eligibility
    pub const TRUSTED_INVITES: i32 = 1;
}

impl UserTrustProfile {
    /// Compute the maximum trust level this user is eligible for (IKA-187)
    ///
    /// Criteria:
    /// - New (0): Default
    /// - Basic (1): email_verified + account_age_days >= 7
    /// - Standard (2): account_age_days >= 30 + total_tasks_created >= 5 + no unresolved abuse signals
    /// - Trusted (3): account_age_days >= 90 + total_tasks_created >= 20 + members_invited >= 1
    /// - Verified (4): Manual admin approval only (never auto-computed)
    pub fn compute_eligible_trust_level(&self, has_unresolved_abuse_signals: bool) -> TrustLevel {
        use thresholds::*;

        // Flagged or banned users cannot progress
        if self.is_flagged || self.is_banned {
            return self.trust_level;
        }

        // Check Trusted (3) criteria
        if self.account_age_days >= TRUSTED_DAYS
            && self.total_tasks_created >= TRUSTED_TASKS
            && self.members_invited >= TRUSTED_INVITES
            && !has_unresolved_abuse_signals
        {
            return TrustLevel::Trusted;
        }

        // Check Standard (2) criteria
        if self.account_age_days >= STANDARD_DAYS
            && self.total_tasks_created >= STANDARD_TASKS
            && !has_unresolved_abuse_signals
        {
            return TrustLevel::Standard;
        }

        // Check Basic (1) criteria
        if self.email_verified && self.account_age_days >= BASIC_DAYS {
            return TrustLevel::Basic;
        }

        TrustLevel::New
    }

    /// Evaluate and progress trust level if eligible (IKA-187)
    ///
    /// Returns Some(new_profile) if upgraded, None if no change.
    /// Never demotes - only promotes to higher levels.
    pub async fn evaluate_and_progress(
        pool: &PgPool,
        user_id: &str,
    ) -> Result<Option<Self>, sqlx::Error> {
        // Get current profile
        let profile = match Self::find_by_user_id(pool, user_id).await? {
            Some(p) => p,
            None => return Ok(None),
        };

        // Flagged or banned users cannot progress
        if profile.is_flagged || profile.is_banned {
            return Ok(None);
        }

        // Verified level is manual only - no auto-progression
        if profile.trust_level == TrustLevel::Verified {
            return Ok(None);
        }

        // Check for unresolved abuse signals
        let unresolved_signals =
            AbuseDetectionSignal::find_unresolved_by_user_id(pool, user_id).await?;
        let has_abuse_signals = !unresolved_signals.is_empty();

        // Compute eligible level
        let eligible_level = profile.compute_eligible_trust_level(has_abuse_signals);

        // Only promote, never demote
        if (eligible_level as i32) > (profile.trust_level as i32) {
            let updated = Self::update_trust_level(pool, user_id, eligible_level).await?;
            return Ok(Some(updated));
        }

        Ok(None)
    }

    /// Convenience: refresh account age and evaluate progression in one call
    pub async fn refresh_and_evaluate(pool: &PgPool, user_id: &str) -> Result<Self, sqlx::Error> {
        // Refresh account age first
        let profile = Self::refresh_account_age(pool, user_id).await?;

        // Evaluate and progress if eligible
        if let Some(updated) = Self::evaluate_and_progress(pool, user_id).await? {
            return Ok(updated);
        }

        Ok(profile)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_profile(
        email_verified: bool,
        account_age_days: i32,
        total_tasks_created: i32,
        members_invited: i32,
        is_flagged: bool,
        is_banned: bool,
        trust_level: TrustLevel,
    ) -> UserTrustProfile {
        use chrono::Utc;
        use uuid::Uuid;

        UserTrustProfile {
            id: Uuid::new_v4(),
            user_id: "test_user".to_string(),
            trust_level,
            email_verified,
            email_verified_at: None,
            account_age_days,
            total_tasks_created,
            members_invited,
            is_flagged,
            flagged_reason: None,
            flagged_at: None,
            flagged_by: None,
            is_banned,
            banned_at: None,
            banned_by: None,
            ban_reason: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn test_new_user_stays_new() {
        let profile = make_profile(false, 0, 0, 0, false, false, TrustLevel::New);
        assert_eq!(profile.compute_eligible_trust_level(false), TrustLevel::New);
    }

    #[test]
    fn test_basic_requires_email_and_days() {
        // Not verified, enough days
        let p1 = make_profile(false, 10, 0, 0, false, false, TrustLevel::New);
        assert_eq!(p1.compute_eligible_trust_level(false), TrustLevel::New);

        // Verified, not enough days
        let p2 = make_profile(true, 5, 0, 0, false, false, TrustLevel::New);
        assert_eq!(p2.compute_eligible_trust_level(false), TrustLevel::New);

        // Verified + enough days = Basic
        let p3 = make_profile(true, 7, 0, 0, false, false, TrustLevel::New);
        assert_eq!(p3.compute_eligible_trust_level(false), TrustLevel::Basic);
    }

    #[test]
    fn test_standard_requires_tasks_and_no_abuse() {
        // Enough days + tasks = Standard
        let p1 = make_profile(true, 30, 5, 0, false, false, TrustLevel::New);
        assert_eq!(p1.compute_eligible_trust_level(false), TrustLevel::Standard);

        // Abuse signals block Standard
        let p2 = make_profile(true, 30, 5, 0, false, false, TrustLevel::New);
        assert_eq!(p2.compute_eligible_trust_level(true), TrustLevel::Basic);
    }

    #[test]
    fn test_trusted_requires_invites() {
        // 90 days + 20 tasks + 1 invite = Trusted
        let p1 = make_profile(true, 90, 20, 1, false, false, TrustLevel::New);
        assert_eq!(p1.compute_eligible_trust_level(false), TrustLevel::Trusted);

        // No invites = stays at Standard
        let p2 = make_profile(true, 90, 20, 0, false, false, TrustLevel::New);
        assert_eq!(p2.compute_eligible_trust_level(false), TrustLevel::Standard);
    }

    #[test]
    fn test_flagged_user_cannot_progress() {
        let profile = make_profile(true, 90, 20, 1, true, false, TrustLevel::New);
        assert_eq!(profile.compute_eligible_trust_level(false), TrustLevel::New);
    }

    #[test]
    fn test_banned_user_cannot_progress() {
        let profile = make_profile(true, 90, 20, 1, false, true, TrustLevel::New);
        assert_eq!(profile.compute_eligible_trust_level(false), TrustLevel::New);
    }
}
