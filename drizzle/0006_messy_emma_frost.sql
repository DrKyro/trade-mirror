ALTER TABLE "trader"
ADD COLUMN "history_positions" jsonb NOT NULL DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "trader" ALTER COLUMN "history_positions" DROP DEFAULT;
