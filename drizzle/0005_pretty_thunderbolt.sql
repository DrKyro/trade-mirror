ALTER TABLE "teacher"
ADD COLUMN "equity_history" jsonb NOT NULL DEFAULT '{"min":[],"hour":[],"day":[]}'::jsonb;--> statement-breakpoint
ALTER TABLE "teacher"
ADD COLUMN "position_history" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "teacher" ALTER COLUMN "equity_history" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "teacher" ALTER COLUMN "position_history" DROP DEFAULT;
