import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type SyncPullQuery,
  syncPullQuerySchema,
  type SyncPullResponse,
  type SyncPushRequest,
  syncPushRequestSchema,
  type SyncPushResponse,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { ApplySyncOperationsCommand } from '../commands/apply-sync-operations.command.js';
import { ListSyncChangesQuery } from '../queries/list-sync-changes.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('scheduling')
@RequirePermission('sync.use')
@Controller('sync')
export class SyncController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiRoute({
    operationId: 'sync.pull',
    summary: "Changes to the instructor's offline diary since a cursor",
    status: StatusCodes.OK,
    query: 'SyncPullQuery',
    response: 'SyncPullResponse',
  })
  pull(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(syncPullQuerySchema)) query: SyncPullQuery,
  ): Promise<SyncPullResponse> {
    return this.queryBus.execute(new ListSyncChangesQuery(actor, query));
  }

  @Post()
  @ApiRoute({
    operationId: 'sync.push',
    summary: 'Apply operations recorded offline (idempotent on opId)',
    status: StatusCodes.OK,
    body: 'SyncPushRequest',
    response: 'SyncPushResponse',
  })
  push(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(syncPushRequestSchema)) body: SyncPushRequest,
  ): Promise<SyncPushResponse> {
    return this.commandBus.execute(new ApplySyncOperationsCommand(actor, body));
  }
}
