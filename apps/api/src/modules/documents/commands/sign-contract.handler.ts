import { isIP } from 'node:net';
import { ContractCompleted, ContractSigned, type SignContractResponse } from '@driveos/shared';
import { eq } from 'drizzle-orm';
import {
  CommandHandler,
  EventPublisher,
  type ICommandHandler,
  newEvent,
  type NewDomainEvent,
  QueryBus,
} from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { GetStudentRecipientsQuery } from '../../training/index.js';
import {
  heldSignerRoles,
  isContractComplete,
  requiredSignerRoles,
  signerRoleFor,
} from '../domain/contract-signing.js';
import { DocumentAccess } from '../infra/document-access.js';
import { alreadySigned, forbidden } from '../infra/documents-errors.js';
import { contractSignatures, contracts } from '../infra/schema.js';
import { CONTRACT_AGGREGATE } from './create-contract.handler.js';
import { SignContractCommand, type SigningClient } from './sign-contract.command.js';

const UNKNOWN_IP = '0.0.0.0';

function clientIp(client: SigningClient): string {
  return client.ip && isIP(client.ip) !== 0 ? client.ip : UNKNOWN_IP;
}

@CommandHandler(SignContractCommand)
export class SignContractHandler implements ICommandHandler<
  SignContractCommand,
  SignContractResponse
> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: DocumentAccess,
    private readonly queryBus: QueryBus,
    private readonly publisher: EventPublisher,
  ) {}

  async execute({
    actor,
    contractId,
    body,
    client,
  }: SignContractCommand): Promise<SignContractResponse> {
    const schoolId = this.tenant.schoolId;
    if (!schoolId) throw new Error('Signing needs a school scope');
    const [contract] = await this.tenant.tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, contractId))
      .for('update');
    if (!contract) throw notFound();
    const scope = await this.access.contracts(actor);
    if (scope !== 'all' && !scope.has(contract.studentId)) throw notFound();
    const recipients = await this.queryBus.execute(
      new GetStudentRecipientsQuery(contract.studentId),
    );
    const signed = await this.tenant.tx
      .select({ role: contractSignatures.signerRole })
      .from(contractSignatures)
      .where(eq(contractSignatures.contractId, contract.id));
    const signedRoles = signed.map((row) => row.role);
    const decision = signerRoleFor({
      held: recipients ? heldSignerRoles(actor.userId, recipients) : [],
      required: requiredSignerRoles(contract.requiresGuardian),
      signed: signedRoles,
      requested: body.role,
    });
    if (!decision.ok) {
      throw decision.reason === 'already_signed' ? alreadySigned() : forbidden();
    }
    const signatureId = newId();
    const signedAt = new Date();
    await this.tenant.tx.insert(contractSignatures).values({
      id: signatureId,
      schoolId,
      contractId: contract.id,
      signerUserId: actor.userId,
      signerRole: decision.role,
      signedAt,
      ip: clientIp(client),
      userAgent: client.userAgent ?? '',
    });
    const version = signedRoles.length + 2;
    const events: NewDomainEvent[] = [
      newEvent(ContractSigned, {
        aggregateType: CONTRACT_AGGREGATE,
        aggregateId: contract.id,
        aggregateVersion: version,
        payload: {
          contractId: contract.id,
          studentId: contract.studentId,
          signatureId,
          signerUserId: actor.userId,
          signerRole: decision.role,
          signedAt: signedAt.toISOString(),
        },
      }),
    ];
    const complete = isContractComplete(contract.requiresGuardian, [...signedRoles, decision.role]);
    if (complete) {
      await this.tenant.tx
        .update(contracts)
        .set({ status: 'signed', completedAt: signedAt })
        .where(eq(contracts.id, contract.id));
      events.push(
        newEvent(ContractCompleted, {
          aggregateType: CONTRACT_AGGREGATE,
          aggregateId: contract.id,
          aggregateVersion: version + 1,
          payload: {
            contractId: contract.id,
            studentId: contract.studentId,
            completedAt: signedAt.toISOString(),
          },
        }),
      );
    }
    await this.publisher.append(events);
    return {
      contractId: contract.id,
      signatureId,
      status: complete ? 'signed' : 'pending',
      completedAt: complete ? signedAt.toISOString() : null,
    };
  }
}
