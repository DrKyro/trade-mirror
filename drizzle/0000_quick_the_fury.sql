CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runtime_event" (
	"id" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"level" text NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"timestamp" timestamp NOT NULL,
	"payload" jsonb DEFAULT 'null'::jsonb
);
--> statement-breakpoint
CREATE TABLE "runtime_state" (
	"id" text PRIMARY KEY NOT NULL,
	"mongo_connected" boolean NOT NULL,
	"trader_spy_connected" boolean NOT NULL,
	"follow_engine_running" boolean NOT NULL,
	"ws_server_url" text NOT NULL,
	"http_port" integer NOT NULL,
	"last_heartbeat" timestamp,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text,
	"name" text NOT NULL,
	"platform" text NOT NULL,
	"balance_milli" integer NOT NULL,
	"equity_milli" integer NOT NULL,
	"free_usdt_milli" integer NOT NULL,
	"unrealized_pnl_milli" integer NOT NULL,
	"max_risk_ratio_basis_points" integer NOT NULL,
	"now_risk_ratio_basis_points" integer NOT NULL,
	"positions" jsonb NOT NULL,
	"teacher_positions" jsonb NOT NULL,
	"follow_relations" jsonb NOT NULL,
	"trace_trader_list" jsonb NOT NULL,
	"settings" jsonb NOT NULL,
	"last_signal_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trader" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"nick_name" text,
	"platform" text NOT NULL,
	"link" text NOT NULL,
	"avatar" text NOT NULL,
	"sign" text,
	"strategy_status" text NOT NULL,
	"strategy_name" text NOT NULL,
	"strategy_risk_rate_basis_points" integer NOT NULL,
	"balance_milli" integer NOT NULL,
	"monthly_average_position_value_milli" integer NOT NULL,
	"three_month_max_drawdown_milli" integer NOT NULL,
	"position_update_time" timestamp,
	"positions" jsonb NOT NULL,
	"raw_payload" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "runtime_event_timestamp_idx" ON "runtime_event" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "teacher_owner_user_id_idx" ON "teacher" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "trader_platform_idx" ON "trader" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "trader_strategy_status_idx" ON "trader" USING btree ("strategy_status");