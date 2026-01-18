-- IKA-176: Add plan and limits columns to tenant_workspaces
-- Adds subscription plan tracking and resource limits for multi-tenancy

ALTER TABLE "tenant_workspaces" ADD COLUMN "plan" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_workspaces" ADD COLUMN "max_teams" bigint DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_workspaces" ADD COLUMN "max_projects" bigint DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_workspaces" ADD COLUMN "max_members" bigint DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_workspaces" ADD COLUMN "max_storage_gb" bigint DEFAULT 1 NOT NULL;
