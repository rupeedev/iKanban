CREATE TABLE IF NOT EXISTS "copilot_deployment_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"auto_merge_enabled" boolean DEFAULT true NOT NULL,
	"merge_method" text DEFAULT 'squash' NOT NULL,
	"deploy_workflow_enabled" boolean DEFAULT false NOT NULL,
	"deploy_workflow_name" text,
	"deploy_workflow_ref" text DEFAULT 'main',
	"required_ci_checks" text[],
	"wait_for_all_checks" boolean DEFAULT true NOT NULL,
	"auto_mark_task_done" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "copilot_deployment_config_repository_id_unique" UNIQUE("repository_id")
);
--> statement-breakpoint
ALTER TABLE "copilot_assignments" ADD COLUMN "github_repo_owner" text;--> statement-breakpoint
ALTER TABLE "copilot_assignments" ADD COLUMN "github_repo_name" text;--> statement-breakpoint
ALTER TABLE "copilot_assignments" ADD COLUMN "ci_status" text;--> statement-breakpoint
ALTER TABLE "copilot_assignments" ADD COLUMN "ci_checks_url" text;--> statement-breakpoint
ALTER TABLE "copilot_assignments" ADD COLUMN "ci_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "copilot_assignments" ADD COLUMN "deployment_workflow_run_id" bigint;--> statement-breakpoint
ALTER TABLE "copilot_assignments" ADD COLUMN "deployment_url" text;--> statement-breakpoint
ALTER TABLE "copilot_assignments" ADD COLUMN "deployed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_copilot_deployment_config_repo_id" ON "copilot_deployment_config" ("repository_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_copilot_assignments_pr" ON "copilot_assignments" ("github_repo_owner","github_repo_name","github_pr_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_copilot_assignments_workflow_run" ON "copilot_assignments" ("deployment_workflow_run_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "copilot_deployment_config" ADD CONSTRAINT "copilot_deployment_config_repository_id_github_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "github_repositories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
