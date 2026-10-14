ALTER TABLE "invitations" ADD COLUMN "branch_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;