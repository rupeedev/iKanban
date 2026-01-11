CREATE TABLE IF NOT EXISTS "ai_provider_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_workspace_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"key_prefix" text NOT NULL,
	"encrypted_key" text NOT NULL,
	"is_valid" boolean DEFAULT true NOT NULL,
	"last_validated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ai_provider_keys_tenant_workspace" ON "ai_provider_keys" ("tenant_workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_ai_provider_keys_tenant_provider" ON "ai_provider_keys" ("tenant_workspace_id","provider");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_provider_keys" ADD CONSTRAINT "ai_provider_keys_tenant_workspace_id_tenant_workspaces_id_fk" FOREIGN KEY ("tenant_workspace_id") REFERENCES "tenant_workspaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
