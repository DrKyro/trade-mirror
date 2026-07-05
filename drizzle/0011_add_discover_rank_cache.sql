CREATE TABLE "discover_rank_cache" (
	"platform" text NOT NULL,
	"trader_id" text NOT NULL,
	"unique_name" text NOT NULL,
	"nick_name" text NOT NULL,
	"avatar" text DEFAULT '' NOT NULL,
	"sign" text DEFAULT '' NOT NULL,
	"link" text NOT NULL,
	"yield_ratio_milli" integer DEFAULT 0 NOT NULL,
	"pnl_milli" integer DEFAULT 0 NOT NULL,
	"aum_milli" integer DEFAULT 0 NOT NULL,
	"followers" integer DEFAULT 0 NOT NULL,
	"max_drawdown_milli" integer,
	"win_rate_milli" integer,
	"inst_num" integer,
	"yield_curve" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rank_data" jsonb NOT NULL,
	"crawled_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discover_rank_cache_platform_trader_id_pk" PRIMARY KEY("platform","trader_id")
);
--> statement-breakpoint
CREATE TABLE "trader_backtest_run" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"trader_id" text NOT NULL,
	"unique_name" text NOT NULL,
	"nick_name" text NOT NULL,
	"mode" text NOT NULL,
	"window" text NOT NULL,
	"initial_balance_milli" integer NOT NULL,
	"summary" jsonb NOT NULL,
	"timeline" jsonb NOT NULL,
	"trades" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "trader_backtest_run" ADD CONSTRAINT "trader_backtest_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trader_sync_state" ADD CONSTRAINT "trader_sync_state_trader_id_trader_id_fk" FOREIGN KEY ("trader_id") REFERENCES "public"."trader"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discover_rank_cache_platform_idx" ON "discover_rank_cache" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "discover_rank_cache_crawled_at_idx" ON "discover_rank_cache" USING btree ("crawled_at");--> statement-breakpoint
CREATE INDEX "trader_backtest_run_user_id_idx" ON "trader_backtest_run" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trader_backtest_run_platform_trader_idx" ON "trader_backtest_run" USING btree ("platform","trader_id");--> statement-breakpoint
CREATE INDEX "trader_backtest_run_created_at_idx" ON "trader_backtest_run" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trader_sync_state_priority_idx" ON "trader_sync_state" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "trader_sync_state_next_fetch_at_idx" ON "trader_sync_state" USING btree ("next_fetch_at");--> statement-breakpoint
CREATE INDEX "trader_sync_state_locked_until_idx" ON "trader_sync_state" USING btree ("locked_until");