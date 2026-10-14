ALTER TABLE "payments" ADD COLUMN "price_item_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "refunds" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_price_item_id_price_items_id_fk" FOREIGN KEY ("price_item_id") REFERENCES "public"."price_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE FUNCTION billing_invoice_immutable() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.issued_at IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'issued' AND NEW.status = 'paid'
     AND (to_jsonb(NEW) - 'status' - 'updated_at') = (to_jsonb(OLD) - 'status' - 'updated_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'invoice % is issued and cannot be changed', OLD.id
    USING ERRCODE = 'P0001', HINT = 'Issue a credit note instead.';
END
$$;
--> statement-breakpoint
CREATE TRIGGER invoices_immutable_after_issue BEFORE UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION billing_invoice_immutable();
--> statement-breakpoint
CREATE FUNCTION billing_invoice_line_immutable() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM invoices i WHERE i.id = OLD.invoice_id AND i.issued_at IS NOT NULL) THEN
    RAISE EXCEPTION 'lines of issued invoice % cannot be changed', OLD.invoice_id
      USING ERRCODE = 'P0001', HINT = 'Issue a credit note instead.';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;
--> statement-breakpoint
CREATE TRIGGER invoice_lines_immutable_after_issue BEFORE UPDATE OR DELETE ON invoice_lines
  FOR EACH ROW EXECUTE FUNCTION billing_invoice_line_immutable();
