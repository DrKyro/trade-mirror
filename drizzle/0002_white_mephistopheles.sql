CREATE TABLE "user_trader" (
	"user_id" text NOT NULL,
	"trader_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_trader_user_id_trader_id_pk" PRIMARY KEY("user_id","trader_id")
);
--> statement-breakpoint
ALTER TABLE "user_trader" ADD CONSTRAINT "user_trader_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_trader" ADD CONSTRAINT "user_trader_trader_id_trader_id_fk" FOREIGN KEY ("trader_id") REFERENCES "public"."trader"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_trader_user_id_idx" ON "user_trader" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_trader_trader_id_idx" ON "user_trader" USING btree ("trader_id");