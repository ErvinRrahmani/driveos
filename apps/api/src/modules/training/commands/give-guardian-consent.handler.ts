import { GuardianConsentGiven } from '@driveos/shared';
import { and, eq, isNull } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
} from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { StudentStream } from '../events/student-stream.js';
import { guardianLinks } from '../infra/schema.js';
import { StudentRecords } from '../infra/student-records.js';
import { GiveGuardianConsentCommand } from './give-guardian-consent.command.js';

@CommandHandler(GiveGuardianConsentCommand)
export class GiveGuardianConsentHandler implements ICommandHandler<
  GiveGuardianConsentCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly records: StudentRecords,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ actor, linkId, body }: GiveGuardianConsentCommand): Promise<CommandResult> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Consent needs a school scope');
    const [found] = await this.tenant.tx
      .select({ studentId: guardianLinks.studentId })
      .from(guardianLinks)
      .where(
        and(
          eq(guardianLinks.id, linkId),
          eq(guardianLinks.guardianUserId, actor.userId),
          isNull(guardianLinks.revokedAt),
        ),
      );
    if (!found) throw notFound();
    const student = await this.records.lock(found.studentId);
    const [link] = await this.tenant.tx
      .select()
      .from(guardianLinks)
      .where(eq(guardianLinks.id, linkId))
      .for('update');
    if (!link || link.revokedAt) throw notFound();
    if (link.consentAt) return { id: link.id, version: link.version };
    const version = link.version + 1;
    await this.tenant.tx
      .update(guardianLinks)
      .set({ consentAt: new Date(), consentTextVersion: body.consentTextVersion, version })
      .where(eq(guardianLinks.id, linkId));
    const stream = new StudentStream(student.id, student.version);
    stream.add(GuardianConsentGiven, {
      schoolId,
      studentId: student.id,
      guardianLinkId: link.id,
      guardianUserId: link.guardianUserId,
      studentUserId: student.userId,
      consentTextVersion: body.consentTextVersion,
    });
    await this.records.setVersion(student.id, stream.version);
    await this.publisher.append(stream.events);
    return { id: link.id, version };
  }
}
