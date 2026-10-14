import {
  type IdParams,
  idParamsSchema,
  type LedgerListResponse,
  type ListLedgerQuery,
  listLedgerQuerySchema,
  type StudentBalanceResponse,
} from '@driveos/shared';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission } from '../../identity/index.js';
import { GetBalanceQuery } from '../queries/get-balance.query.js';
import { ListLedgerEntriesQuery } from '../queries/list-ledger-entries.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('billing')
@RequireAnyPermission('balance.read', 'balance.read.own')
@Controller('students')
export class StudentAccountsController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get(':id/balance')
  @ApiRoute({
    operationId: 'balance.get',
    summary: "A student's lesson-credit balance and entitlements",
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'StudentBalanceResponse',
  })
  balance(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
  ): Promise<StudentBalanceResponse> {
    return this.queryBus.execute(new GetBalanceQuery(actor, params.id));
  }

  @Get(':id/ledger')
  @ApiRoute({
    operationId: 'ledger.list',
    summary: "A student's credit ledger, newest first",
    status: StatusCodes.OK,
    params: 'IdParams',
    query: 'ListLedgerQuery',
    response: 'LedgerListResponse',
  })
  ledger(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Query(new ZodValidationPipe(listLedgerQuerySchema)) query: ListLedgerQuery,
  ): Promise<LedgerListResponse> {
    return this.queryBus.execute(new ListLedgerEntriesQuery(actor, params.id, query));
  }
}
