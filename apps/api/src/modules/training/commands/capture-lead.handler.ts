import { LeadCaptured } from '@driveos/shared';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { SchoolHasFeatureQuery } from '../../platform/index.js';
import {
  appendLeadMessage,
  findDuplicate,
  LEAD_DEDUPE_WINDOW_DAYS,
  MANUAL_LEAD_CONSENT_VERSION,
} from '../domain/leads.js';
import { LeadStream } from '../events/lead-stream.js';
import { LeadRecords } from '../infra/lead-records.js';
import { featureNotInPlan } from '../infra/training-errors.js';
import { CaptureLeadCommand } from './capture-lead.command.js';

const DAY_MS = 86_400_000;

@CommandHandler(CaptureLeadCommand)
export class CaptureLeadHandler implements ICommandHandler<CaptureLeadCommand, CommandResult> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly leads: LeadRecords,
    private readonly publisher: EventPublisher,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({ input }: CaptureLeadCommand): Promise<CommandResult> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Capturing a lead needs a school scope');
    // The public route checks the feature while resolving the slug; staff entry checks it here.
    if (
      input.source === 'manual' &&
      !(await this.queryBus.execute(new SchoolHasFeatureQuery('enrolment_page')))
    ) {
      throw featureNotInPlan();
    }
    const { body } = input;
    const now = new Date();
    const contact = { phone: body.phone ?? null, email: body.email?.toLowerCase() ?? null };
    const since = new Date(now.getTime() - LEAD_DEDUPE_WINDOW_DAYS * DAY_MS);
    const duplicate = findDuplicate(
      await this.leads.lockOpenByContact(contact, since),
      contact,
      now,
    );
    if (duplicate) {
      const version = duplicate.version + 1;
      await this.leads.update(duplicate.id, {
        note: appendLeadMessage(duplicate.note, body.message),
        version,
      });
      return { id: duplicate.id, version };
    }

    const id = newId();
    const fullName = body.fullName.trim();
    const stream = new LeadStream(id, 0);
    stream.add(LeadCaptured, {
      leadId: id,
      source: input.source,
      licenceClass: body.licenceClass,
      isMinor: body.isMinor,
      fullName,
      capturedAt: now.toISOString(),
    });
    await this.leads.insert({
      id,
      schoolId,
      source: input.source,
      fullName,
      phone: contact.phone,
      email: contact.email,
      licenceClass: body.licenceClass,
      message: body.message ?? null,
      isMinor: body.isMinor,
      guardianName: body.guardianName ?? null,
      guardianContact: body.guardianContact ?? null,
      consentTextVersion: body.consentTextVersion ?? MANUAL_LEAD_CONSENT_VERSION,
      consentedAt: now,
      requestIpHash: input.requestIpHash,
      version: stream.version,
      createdAt: now,
      updatedAt: now,
    });
    await this.publisher.append(stream.events);
    return { id, version: stream.version };
  }
}
