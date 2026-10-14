import type { StudentBalanceResponse } from '@driveos/shared';
import { Inject } from '@nestjs/common';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { EntitlementReader } from '../infra/entitlement-records.js';
import { LEDGER_WRITER, type LedgerWriter } from '../infra/ledger-writer.js';
import { StudentAccess } from '../infra/student-access.js';
import { GetBalanceQuery } from './get-balance.query.js';

@QueryHandler(GetBalanceQuery)
export class GetBalanceHandler implements IQueryHandler<GetBalanceQuery, StudentBalanceResponse> {
  constructor(
    private readonly access: StudentAccess,
    private readonly entitlements: EntitlementReader,
    @Inject(LEDGER_WRITER) private readonly ledger: LedgerWriter,
  ) {}

  async execute({ actor, studentId }: GetBalanceQuery): Promise<StudentBalanceResponse> {
    const id = await this.access.resolve(actor, studentId);
    return {
      studentId: id,
      balanceMinutes: await this.ledger.balance(id),
      entitlements: await this.entitlements.active(id),
    };
  }
}
