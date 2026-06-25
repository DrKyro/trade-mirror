CREATE TABLE "market_candle" (
	"platform" text NOT NULL,
	"symbol" text NOT NULL,
	"interval" text NOT NULL,
	"datetime" timestamp NOT NULL,
	"open_milli" integer NOT NULL,
	"high_milli" integer NOT NULL,
	"low_milli" integer NOT NULL,
	"close_milli" integer NOT NULL,
	"volume_milli" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "market_candle_platform_symbol_interval_datetime_pk" PRIMARY KEY("platform","symbol","interval","datetime")
);
