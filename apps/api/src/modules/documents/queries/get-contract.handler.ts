import type { ContractResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { AUDIT_WRITER, type AuditWriter } from '../../platform/index.js';
import { ContractViews } from '../infra/contract-views.js';
import { DocumentAccess } from '../infra/document-access.js';
import { contracts } from '../infra/schema.js';
import { GetContractQuery } from './get-contract.query.js';

@QueryHandler(GetContractQuery)
export class GetContractHandler implements IQueryHandler<GetContractQuery, ContractResponse> {
  constructor(
    private readonly tenant: TenantContext,
    private readonly access: DocumentAccess,
    private readonly views: ContractViews,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async execute({ actor, contractId }: GetContractQuery): Promise<ContractResponse> {
    const [row] = await this.tenant.tx.select().from(contracts).where(eq(contracts.id, contractId));
    if (!row) throw notFound();
    const scope = await this.access.contracts(actor);
    if (scope !== 'all' && !scope.has(row.studentId)) throw notFound();
    if (scope === 'all') {
      await this.audit.record({
        action: 'contract.read',
        targetType: 'contract',
        targetId: row.id,
      });
    }
    return this.views.detail(row);
  }
}
