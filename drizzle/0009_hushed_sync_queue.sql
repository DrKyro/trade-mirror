CREATE TABLE "trader_sync_state" (
	"trader_id" text PRIMARY KEY NOT NULL,
	"priority" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"fetch_interval_ms" integer NOT NULL,
	"next_fetch_at" timestamp,
	"last_attempt_at" timestamp,
	"last_success_at" timestamp,
	"last_status" text NOT NULL,
	"last_error" text,
	"fail_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trader_sync_state" ADD CONSTRAINT "trader_sync_state_trader_id_trader_id_fk" FOREIGN KEY ("trader_id") REFERENCES "public"."trader"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "trader_sync_state_priority_idx" ON "trader_sync_state" USING btree ("priority");
--> statement-breakpoint
CREATE INDEX "trader_sync_state_next_fetch_at_idx" ON "trader_sync_state" USING btree ("next_fetch_at");
--> statement-breakpoint
CREATE INDEX "trader_sync_state_locked_until_idx" ON "trader_sync_state" USING btree ("locked_until");
