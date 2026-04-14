CREATE TABLE "report_status_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_user_id" integer,
	"actor_email" text,
	"actor_name" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"property_id" integer,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"stripe_session_id" text,
	"stripe_job_id" text,
	"pdf_url" text,
	"referencia_catastral" text,
	"address" text,
	"cadastral_json" text,
	"financial_json" text,
	"nota_simple_json" text,
	"report_json" text,
	"provider_name" text,
	"provider_order_id" text,
	"provider_status" text,
	"provider_raw_json" text,
	"requested_at" text,
	"completed_at" text,
	"map_lat" text,
	"map_lon" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"referencia_catastral" text,
	"address" text,
	"lat" text,
	"lon" text,
	"price_per_sqm" text,
	"avg_rent_per_sqm" text,
	"gross_yield" text,
	"net_yield" text,
	"roi" text,
	"opportunity_score" text,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "report_status_events" ADD CONSTRAINT "report_status_events_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_status_events" ADD CONSTRAINT "report_status_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_properties" ADD CONSTRAINT "saved_properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;