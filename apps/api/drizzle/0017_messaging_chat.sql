ALTER TABLE "conversation_members" DROP CONSTRAINT "conversation_members_last_read_message_id_messages_id_fk";
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_message_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_last_read_message_id_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_members_conversation_membership_key" ON "conversation_members" USING btree ("conversation_id","membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_student_school_key" ON "conversations" USING btree ("school_id","student_id") WHERE "conversations"."kind" = 'student_school';--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_student_instructor_key" ON "conversations" USING btree ("school_id","student_id","instructor_membership_id") WHERE "conversations"."kind" = 'student_instructor';--> statement-breakpoint
CREATE INDEX "conversations_instructor_idx" ON "conversations" USING btree ("school_id","instructor_membership_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_sent_idx" ON "messages" USING btree ("conversation_id","sent_at","id");--> statement-breakpoint
CREATE INDEX "messages_school_sent_idx" ON "messages" USING btree ("school_id","sent_at");