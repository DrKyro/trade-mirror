CREATE TABLE "user_discover_favorite" (
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"trader_id" text NOT NULL,
	"unique_name" text NOT NULL,
	"nick_name" text NOT NULL,
	"avatar" text DEFAULT '' NOT NULL,
	"link" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_discover_favorite_user_id_platform_trader_id_pk" PRIMARY KEY("user_id","platform","trader_id")
);
--> statement-breakpoint
ALTER TABLE "user_discover_favorite" ADD CONSTRAINT "user_discover_favorite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "user_discover_favorite_user_id_idx" ON "user_discover_favorite" USING btree ("user_id");