CREATE TABLE IF NOT EXISTS "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"team_member_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"tenant_workspace_id" uuid NOT NULL,
	"name" text,
	"conversation_type" text DEFAULT 'direct' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "copilot_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"github_issue_id" bigint,
	"github_issue_url" text,
	"github_pr_id" bigint,
	"github_pr_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"prompt" text NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_conversation" ON "chat_messages" ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_sender" ON "chat_messages" ("sender_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_created" ON "chat_messages" ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chat_messages_not_deleted" ON "chat_messages" ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_participants_conversation" ON "conversation_participants" ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_participants_user" ON "conversation_participants" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversation_participants_team_member" ON "conversation_participants" ("team_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_conversation_participant" ON "conversation_participants" ("conversation_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_team" ON "conversations" ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_workspace" ON "conversations" ("tenant_workspace_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_type" ON "conversations" ("conversation_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_conversations_created_by" ON "conversations" ("created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_copilot_assignments_task_id" ON "copilot_assignments" ("task_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_copilot_assignments_status" ON "copilot_assignments" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_copilot_assignments_created_at" ON "copilot_assignments" ("created_at");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "team_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_workspace_id_tenant_workspaces_id_fk" FOREIGN KEY ("tenant_workspace_id") REFERENCES "tenant_workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "copilot_assignments" ADD CONSTRAINT "copilot_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
