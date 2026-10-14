CREATE UNIQUE INDEX "contract_signatures_contract_role_key" ON "contract_signatures" USING btree ("contract_id","signer_role");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_templates_name_version_key" ON "contract_templates" USING btree ("school_id","name","version");--> statement-breakpoint
CREATE INDEX "contracts_student_idx" ON "contracts" USING btree ("school_id","student_id");--> statement-breakpoint
CREATE INDEX "documents_owner_student_idx" ON "documents" USING btree ("school_id","owner_student_id");