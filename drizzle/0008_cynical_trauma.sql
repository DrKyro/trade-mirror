CREATE TABLE "legacy_chain_info" (
	"id" text PRIMARY KEY NOT NULL,
	"transaction_hash" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_message" (
	"id" text PRIMARY KEY NOT NULL,
	"msg_class" text NOT NULL,
	"msg_source" text NOT NULL,
	"unique_id" text,
	"message_time" timestamp,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legacy_user_account_setting" (
	"user_id" text PRIMARY KEY NOT NULL,
	"binance_api_key" text DEFAULT '' NOT NULL,
	"binance_secret_key" text DEFAULT '' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "legacy_user_account_setting" ADD CONSTRAINT "legacy_user_account_setting_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "legacy_chain_info_hash_idx" ON "legacy_chain_info" USING btree ("transaction_hash");--> statement-breakpoint
CREATE INDEX "legacy_chain_info_created_at_idx" ON "legacy_chain_info" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "legacy_message_class_idx" ON "legacy_message" USING btree ("msg_class");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_message_unique_id_idx" ON "legacy_message" USING btree ("unique_id");--> statement-breakpoint
CREATE INDEX "legacy_message_time_idx" ON "legacy_message" USING btree ("message_time");