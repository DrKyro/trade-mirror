ALTER TABLE "discover_rank_cache" ALTER COLUMN "yield_ratio_milli" SET DATA TYPE bigint;
--> statement-breakpoint
ALTER TABLE "discover_rank_cache" ALTER COLUMN "pnl_milli" SET DATA TYPE bigint;
--> statement-breakpoint
ALTER TABLE "discover_rank_cache" ALTER COLUMN "aum_milli" SET DATA TYPE bigint;
--> statement-breakpoint
ALTER TABLE "discover_rank_cache" ALTER COLUMN "max_drawdown_milli" SET DATA TYPE bigint;
--> statement-breakpoint
ALTER TABLE "discover_rank_cache" ALTER COLUMN "win_rate_milli" SET DATA TYPE bigint;