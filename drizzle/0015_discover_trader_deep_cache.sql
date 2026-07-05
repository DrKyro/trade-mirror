CREATE TABLE "discover_trader_deep_cache" (
	"platform" text NOT NULL,
	"trader_id" text NOT NULL,
	"analysis_data" jsonb NOT NULL,
	"crawled_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discover_trader_deep_cache_platform_trader_id_pk" PRIMARY KEY("platform","trader_id")
);
--> statement-breakpoint
CREATE INDEX "discover_trader_deep_cache_platform_idx" ON "discover_trader_deep_cache" USING btree ("platform");
--> statement-breakpoint
CREATE INDEX "discover_trader_deep_cache_crawled_at_idx" ON "discover_trader_deep_cache" USING btree ("crawled_at");