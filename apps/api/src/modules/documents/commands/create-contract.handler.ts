import { ContractCreated } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import {
  CommandHandler,
  type CommandResult,
  EventPublisher,
  type ICommandHandler,
  newEvent,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { GetStudentMinorStatusQuery, GetStudentRecipientsQuery } from '../../training/index.js';
import { templateInactive } from '../infra/documents-errors.js';
import { contracts, contractTemplates } from '../infra/schema.js';
import { CreateContractCommand } from './create-contract.command.js';

export const CONTRACT_AGGREGATE = 'contract';

@CommandHandler(CreateContractCommand)
export class CreateContractHandler implements ICommandHandler<
  CreateContractCommand,
  CommandResult
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({ body }: CreateContractCommand): Promise<CommandResult> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Contracts need a school scope');
    const minor = await this.queryBus.execute(new GetStudentMinorStatusQuery(body.studentId));
    const recipients = await this.queryBus.execute(new GetStudentRecipientsQuery(body.studentId));
    if (!minor || !recipients) throw notFound();
    const [template] = await this.tenant.tx
      .select()
      .from(contractTemplates)
      .where(eq(contractTemplates.id, body.templateId));
    if (!template) throw notFound();
    if (!template.active) throw templateInactive();
    const id = newId();
    const requiresGuardian = minor.isMinor;
    await this.tenant.tx.insert(contracts).values({
      id,
      schoolId,
      studentId: body.studentId,
      templateId: template.id,
      templateVersion: template.version,
      bodySnapshot: template.body,
      requiresGuardian,
      status: 'pending',
    });
    const signerUserIds = [
      ...(recipients.studentUserId ? [recipients.studentUserId] : []),
      ...(requiresGuardian ? recipients.guardianUserIds : []),
    ];
    await this.publisher.append([
      newEvent(ContractCreated, {
        aggregateType: CONTRACT_AGGREGATE,
        aggregateId: id,
        aggregateVersion: 1,
        payload: {
          contractId: id,
          studentId: body.studentId,
          templateId: template.id,
          templateVersion: template.version,
          requiresGuardian,
          signerUserIds: [...new Set(signerUserIds)],
        },
      }),
    ]);
    return { id, version: 1 };
  }
}
