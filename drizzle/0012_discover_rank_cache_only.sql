CREATE TABLE IF NOT EXISTS "discover_rank_cache" (
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
CREATE INDEX IF NOT EXISTS "discover_rank_cache_platform_idx" ON "discover_rank_cache" USING btree ("platform");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "discover_rank_cache_crawled_at_idx" ON "discover_rank_cache" USING btree ("crawled_at");