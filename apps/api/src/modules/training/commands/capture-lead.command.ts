import type { CaptureLeadRequest, CreateLeadRequest, LeadSource } from '@driveos/shared';
import { Command, type CommandResult } from '../../../kernel/cqrs/index.js';

export interface CaptureLeadInput {
  /** `page` from the public enrolment form, `manual` when staff type it in. */
  source: LeadSource;
  body: Omit<CaptureLeadRequest, 'website'> | CreateLeadRequest;
  /** sha256 hex of the submitting IP (public form only), nulled by the purge job after 30 days. */
  requestIpHash: string | null;
}

/**
 * Records an enquiry in the current school. A repeat enquiry (same phone or email within 30 days,
 * lead not lost) returns the earlier lead's id and appends the message to its note, without an event.
 * The event actor is the tenant scope's user (null on the public form).
 */
export class CaptureLeadCommand extends Command<CommandResult> {
  constructor(readonly input: CaptureLeadInput) {
    super();
  }
}
