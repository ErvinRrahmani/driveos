ALTER TABLE "questions" ADD COLUMN "instant_fail" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "question_packs_country_class_language_version_key" ON "question_packs" USING btree ("country_code","licence_class","language","version");--> statement-breakpoint
CREATE UNIQUE INDEX "questions_pack_ref_key" ON "questions" USING btree ("pack_id","external_ref");