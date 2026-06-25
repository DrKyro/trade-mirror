CREATE TABLE "user_trader_workspace" (
	"user_id" text PRIMARY KEY NOT NULL,
	"initialized_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_trader_workspace" ADD CONSTRAINT "user_trader_workspace_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;