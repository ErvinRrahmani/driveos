import type { CaptureLeadRequest, CreateLeadRequest, LeadSource } from '@driveos/shared';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export interface CaptureLeadInput {
  /** `page` from the public enrolment form, `manual` when staff type it in. */
  source: LeadSource;
  body: Omit<CaptureLeadRequest, 'website'> | CreateLeadRequest;
  /** HMAC-SHA256 hex of the submitting IP (public form only), nulled by the purge job after 30 days. */
  requestIpHash: string | null;
}

export interface CaptureLeadResult extends CommandResult {
  /** True when the enquiry was added to an existing open lead instead of creating one. */
  repeated: boolean;
}

/**
 * Records an enquiry in the current school. A repeat enquiry (same phone or email and the same
 * normalized name within 30 days, lead `new` or `contacted`) is appended to that lead's
 * `enquiries`, bumps its version and `updated_at` and emits `LeadEnquiryRepeated`; otherwise a new
 * lead is created (`LeadCaptured`). The staff `note` is never touched. The event actor is the
 * tenant scope's user (null on the public form).
 */
export class CaptureLeadCommand extends Command<CaptureLeadResult> {
  constructor(readonly input: CaptureLeadInput) {
    super();
  }
}
