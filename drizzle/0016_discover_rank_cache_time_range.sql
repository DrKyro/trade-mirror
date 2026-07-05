ALTER TABLE "discover_rank_cache" ADD COLUMN "time_range" text DEFAULT '90' NOT NULL;--> statement-breakpoint
ALTER TABLE "discover_rank_cache" DROP CONSTRAINT "discover_rank_cache_pkey";--> statement-breakpoint
ALTER TABLE "discover_rank_cache" ADD CONSTRAINT "discover_rank_cache_pkey" PRIMARY KEY("platform","trader_id","time_range");--> statement-breakpoint
CREATE INDEX "discover_rank_cache_time_range_idx" ON "discover_rank_cache" USING btree ("time_range");