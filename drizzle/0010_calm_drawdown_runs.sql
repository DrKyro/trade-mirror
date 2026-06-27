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
ALTER TABLE "trader_backtest_run" ADD CONSTRAINT "trader_backtest_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "trader_backtest_run_user_id_idx" ON "trader_backtest_run" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "trader_backtest_run_platform_trader_idx" ON "trader_backtest_run" USING btree ("platform","trader_id");
--> statement-breakpoint
CREATE INDEX "trader_backtest_run_created_at_idx" ON "trader_backtest_run" USING btree ("created_at");
