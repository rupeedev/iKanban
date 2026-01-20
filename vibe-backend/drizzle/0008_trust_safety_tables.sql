-- IKA-186 - IKA-190: Trust & Safety System
-- Implements user trust profiles, abuse detection signals, and email verifications

-- User Trust Profiles (IKA-186: Trust level tracking per user)
CREATE TABLE IF NOT EXISTS "user_trust_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL UNIQUE,
	"trust_level" integer DEFAULT 0 NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"email_verified_at" timestamp with time zone,
	"account_age_days" integer DEFAULT 0 NOT NULL,
	"total_tasks_created" integer DEFAULT 0 NOT NULL,
	"members_invited" integer DEFAULT 0 NOT NULL,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"flagged_reason" text,
	"flagged_at" timestamp with time zone,
	"flagged_by" text,
	"is_banned" boolean DEFAULT false NOT NULL,
	"banned_at" timestamp with time zone,
	"banned_by" text,
	"ban_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Abuse Detection Signals (IKA-188: Track suspicious activity)
CREATE TABLE IF NOT EXISTS "abuse_detection_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"signal_type" text NOT NULL,
	"severity" text NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"source_ip" text,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Email Verifications (IKA-189: Email verification tokens)
CREATE TABLE IF NOT EXISTS "email_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Indexes for user_trust_profiles
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_trust_profiles_user_id" ON "user_trust_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_trust_profiles_trust_level" ON "user_trust_profiles" USING btree ("trust_level");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_trust_profiles_is_flagged" ON "user_trust_profiles" USING btree ("is_flagged");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_trust_profiles_is_banned" ON "user_trust_profiles" USING btree ("is_banned");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_trust_profiles_email_verified" ON "user_trust_profiles" USING btree ("email_verified");--> statement-breakpoint

-- Indexes for abuse_detection_signals
CREATE INDEX IF NOT EXISTS "idx_abuse_detection_signals_user_id" ON "abuse_detection_signals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_abuse_detection_signals_type" ON "abuse_detection_signals" USING btree ("signal_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_abuse_detection_signals_severity" ON "abuse_detection_signals" USING btree ("severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_abuse_detection_signals_is_resolved" ON "abuse_detection_signals" USING btree ("is_resolved");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_abuse_detection_signals_created_at" ON "abuse_detection_signals" USING btree ("created_at");--> statement-breakpoint

-- Indexes for email_verifications
CREATE INDEX IF NOT EXISTS "idx_email_verifications_user_id" ON "email_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_email_verifications_token_hash" ON "email_verifications" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_verifications_email" ON "email_verifications" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_email_verifications_expires_at" ON "email_verifications" USING btree ("expires_at");
