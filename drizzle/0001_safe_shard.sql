ALTER TABLE "teacher" ADD COLUMN "credentials" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "teacher" ADD COLUMN "execution_mode" text DEFAULT 'dry-run' NOT NULL;