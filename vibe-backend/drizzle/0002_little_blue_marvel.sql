CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "coding_agent_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_process_id" uuid NOT NULL,
	"agent_session_id" text,
	"prompt" text,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"icon" text,
	"color" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"local_path" text,
	"storage_path" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"folder_id" uuid,
	"title" text NOT NULL,
	"content" text,
	"file_path" text,
	"file_type" text DEFAULT 'markdown' NOT NULL,
	"file_size" bigint,
	"mime_type" text,
	"icon" text,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"slug" text,
	"storage_key" text,
	"storage_bucket" text,
	"storage_metadata" jsonb,
	"storage_provider" text DEFAULT 'local' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "execution_process_logs" (
	"execution_id" uuid NOT NULL,
	"logs" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"inserted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "execution_process_repo_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"execution_process_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"before_head_commit" text,
	"after_head_commit" text,
	"merge_commit" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid,
	"access_token" text NOT NULL,
	"github_username" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_repo_sync_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" uuid NOT NULL,
	"folder_id" text NOT NULL,
	"github_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "github_repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"repo_full_name" text NOT NULL,
	"repo_name" text NOT NULL,
	"repo_owner" text NOT NULL,
	"repo_url" text NOT NULL,
	"default_branch" text,
	"is_private" boolean DEFAULT false NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sync_path" text,
	"sync_folder_id" text,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_path" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_type" text DEFAULT 'task_assigned' NOT NULL,
	"title" text NOT NULL,
	"message" text,
	"task_id" uuid,
	"project_id" uuid,
	"workspace_id" uuid,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "member_project_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"merge_type" text NOT NULL,
	"merge_commit" text,
	"pr_number" bigint,
	"pr_url" text,
	"pr_status" text,
	"pr_merged_at" timestamp with time zone,
	"pr_merge_commit_sha" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_branch_name" text NOT NULL,
	"repo_id" uuid DEFAULT '00000000-0000-0000-0000-000000000000' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_date" timestamp with time zone,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"depends_on_project_id" uuid NOT NULL,
	"dependency_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_label_assignments" (
	"project_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	CONSTRAINT "project_label_assignments_label_id_project_id_pk" PRIMARY KEY("label_id","project_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"setup_script" text,
	"cleanup_script" text,
	"copy_files" text,
	"parallel_setup_script" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tag_name" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"author_id" uuid,
	"author_name" text NOT NULL,
	"author_email" text,
	"content" text NOT NULL,
	"is_internal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_document_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"image_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'contributor' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"token" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_projects" (
	"team_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_projects_project_id_team_id_pk" PRIMARY KEY("project_id","team_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_registry" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"db_path" text NOT NULL,
	"turso_db" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone,
	CONSTRAINT "team_registry_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"setup_script" text,
	"cleanup_script" text,
	"copy_files" text,
	"parallel_setup_script" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_storage_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"folder_id" text,
	"config_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"connected_email" text,
	"connected_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"icon" text,
	"color" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_user_id" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"workspace_name" text NOT NULL,
	"planned_teams" integer DEFAULT 1,
	"planned_projects" integer DEFAULT 1,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_registrations_clerk_user_id_unique" UNIQUE("clerk_user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workspace_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"target_branch" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "execution_processes" DROP CONSTRAINT "execution_processes_session_id_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "sessions_workspace_id_workspaces_id_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "team_members" DROP CONSTRAINT "team_members_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_task_id_tasks_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_execution_processes_session_run_reason_created";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_execution_processes_session_status_run_reason";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_sessions_workspace_id_created_at";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tasks_team_issue_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tasks_team_issue_number";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_tasks_project_created_at";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_task_attempts_task_id_created_at";--> statement-breakpoint
ALTER TABLE "execution_processes" ALTER COLUMN "started_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "execution_processes" ALTER COLUMN "completed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "execution_processes" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "execution_processes" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "start_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "target_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repos" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repos" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "due_date" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "joined_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_members" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "setup_completed_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scratch" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scratch" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "metadata" text DEFAULT '{}';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "tenant_workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "tenant_workspace_id" uuid;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_user_id" ON "api_keys" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_api_keys_key_hash" ON "api_keys" ("key_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_api_keys_key_prefix" ON "api_keys" ("key_prefix");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coding_agent_turns_agent_session_id" ON "coding_agent_turns" ("agent_session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_coding_agent_turns_execution_process_id" ON "coding_agent_turns" ("execution_process_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_folders_parent_id" ON "document_folders" ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_document_folders_team_id" ON "document_folders" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_team_slug" ON "documents" ("team_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_is_archived" ON "documents" ("is_archived");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_is_pinned" ON "documents" ("is_pinned");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_file_type" ON "documents" ("file_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_folder_id" ON "documents" ("folder_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_team_id" ON "documents" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_storage_key" ON "documents" ("storage_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_storage_provider" ON "documents" ("storage_provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_documents_storage_bucket" ON "documents" ("storage_bucket");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_execution_process_logs_execution_id_inserted_at" ON "execution_process_logs" ("execution_id","inserted_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eprs_process_repo" ON "execution_process_repo_states" ("execution_process_id","repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eprs_repo_id" ON "execution_process_repo_states" ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_eprs_process_id" ON "execution_process_repo_states" ("execution_process_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_github_connections_workspace" ON "github_connections" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_github_connections_team_id" ON "github_connections" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_configs_folder" ON "github_repo_sync_configs" ("folder_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sync_configs_repo" ON "github_repo_sync_configs" ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_github_repo_sync_configs_unique" ON "github_repo_sync_configs" ("repo_id","folder_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_github_repositories_sync_folder_id" ON "github_repositories" ("sync_folder_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_github_repositories_unique" ON "github_repositories" ("connection_id","repo_full_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_github_repositories_connection_id" ON "github_repositories" ("connection_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_images_hash" ON "images" ("hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbox_items_created_at" ON "inbox_items" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbox_items_workspace_id" ON "inbox_items" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbox_items_project_id" ON "inbox_items" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbox_items_task_id" ON "inbox_items" ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_inbox_items_is_read" ON "inbox_items" ("is_read");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_member_project_access_project" ON "member_project_access" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_member_project_access_member" ON "member_project_access" ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_member_project_access_unique" ON "member_project_access" ("member_id","project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_merges_open_pr" ON "merges" ("workspace_id","pr_status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_merges_workspace_id" ON "merges" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_merges_repo_id" ON "merges" ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_milestones_project_id" ON "milestones" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_dependencies_depends_on" ON "project_dependencies" ("depends_on_project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_dependencies_project_id" ON "project_dependencies" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_label_assignments_label" ON "project_label_assignments" ("label_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_label_assignments_project" ON "project_label_assignments" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_repos_repo_id" ON "project_repos" ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_project_repos_project_id" ON "project_repos" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_comments_created_at" ON "task_comments" ("task_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_comments_author_id" ON "task_comments" ("author_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_comments_task_id" ON "task_comments" ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_document_links_document_id" ON "task_document_links" ("document_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_document_links_task_id" ON "task_document_links" ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_images_image_id" ON "task_images" ("image_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_images_task_id" ON "task_images" ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_invitations_token" ON "team_invitations" ("token");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_invitations_pending" ON "team_invitations" ("team_id","email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_invitations_status" ON "team_invitations" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_invitations_email" ON "team_invitations" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_invitations_team_id" ON "team_invitations" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_projects_project_id" ON "team_projects" ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_projects_team_id" ON "team_projects" ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_team_registry_slug" ON "team_registry" ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_repos_repo_id" ON "team_repos" ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_repos_team_id" ON "team_repos" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_storage_configs_team_id" ON "team_storage_configs" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_team_storage_configs_provider" ON "team_storage_configs" ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_team_storage_configs_team_provider" ON "team_storage_configs" ("team_id","provider");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_workspace_members_workspace_id" ON "tenant_workspace_members" ("tenant_workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tenant_workspace_members_user_id" ON "tenant_workspace_members" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_tenant_workspace_member_user" ON "tenant_workspace_members" ("tenant_workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_registrations_clerk_user_id" ON "user_registrations" ("clerk_user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_registrations_status" ON "user_registrations" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_registrations_email" ON "user_registrations" ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_repos_repo_id" ON "workspace_repos" ("repo_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_workspace_repos_workspace_id" ON "workspace_repos" ("workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_projects_tenant_workspace_id" ON "projects" ("tenant_workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_repos_path" ON "repos" ("path");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_teams_tenant_workspace_id" ON "teams" ("tenant_workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_execution_processes_session_run_reason_created" ON "execution_processes" ("session_id","run_reason","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_execution_processes_session_status_run_reason" ON "execution_processes" ("session_id","status","run_reason");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_sessions_workspace_id_created_at" ON "sessions" ("workspace_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_tasks_team_issue_unique" ON "tasks" ("team_id","issue_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_team_issue_number" ON "tasks" ("team_id","issue_number");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tasks_project_created_at" ON "tasks" ("project_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_task_attempts_task_id_created_at" ON "workspaces" ("task_id","created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "execution_processes" ADD CONSTRAINT "execution_processes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "coding_agent_turns" ADD CONSTRAINT "coding_agent_turns_execution_process_id_execution_processes_id_fk" FOREIGN KEY ("execution_process_id") REFERENCES "execution_processes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_parent_id_document_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "document_folders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_folder_id_document_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "document_folders"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "execution_process_logs" ADD CONSTRAINT "execution_process_logs_execution_id_execution_processes_id_fk" FOREIGN KEY ("execution_id") REFERENCES "execution_processes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "execution_process_repo_states" ADD CONSTRAINT "execution_process_repo_states_execution_process_id_execution_processes_id_fk" FOREIGN KEY ("execution_process_id") REFERENCES "execution_processes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "execution_process_repo_states" ADD CONSTRAINT "execution_process_repo_states_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_connections" ADD CONSTRAINT "github_connections_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_repo_sync_configs" ADD CONSTRAINT "github_repo_sync_configs_repo_id_github_repositories_id_fk" FOREIGN KEY ("repo_id") REFERENCES "github_repositories"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "github_repositories" ADD CONSTRAINT "github_repositories_connection_id_github_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "github_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "member_project_access" ADD CONSTRAINT "member_project_access_member_id_team_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "member_project_access" ADD CONSTRAINT "member_project_access_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "merges" ADD CONSTRAINT "merges_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_depends_on_project_id_projects_id_fk" FOREIGN KEY ("depends_on_project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_label_assignments" ADD CONSTRAINT "project_label_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_label_assignments" ADD CONSTRAINT "project_label_assignments_label_id_project_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "project_labels"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_repos" ADD CONSTRAINT "project_repos_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_author_id_team_members_id_fk" FOREIGN KEY ("author_id") REFERENCES "team_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_document_links" ADD CONSTRAINT "task_document_links_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_document_links" ADD CONSTRAINT "task_document_links_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_images" ADD CONSTRAINT "task_images_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_images" ADD CONSTRAINT "task_images_image_id_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "images"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_projects" ADD CONSTRAINT "team_projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_projects" ADD CONSTRAINT "team_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_repos" ADD CONSTRAINT "team_repos_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_repos" ADD CONSTRAINT "team_repos_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "team_storage_configs" ADD CONSTRAINT "team_storage_configs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_workspace_members" ADD CONSTRAINT "tenant_workspace_members_tenant_workspace_id_tenant_workspaces_id_fk" FOREIGN KEY ("tenant_workspace_id") REFERENCES "tenant_workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_registrations" ADD CONSTRAINT "user_registrations_reviewed_by_team_members_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "team_members"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_repos" ADD CONSTRAINT "workspace_repos_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "workspace_repos" ADD CONSTRAINT "workspace_repos_repo_id_repos_id_fk" FOREIGN KEY ("repo_id") REFERENCES "repos"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
