import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type IdParams,
  idParamsSchema,
  type JoinWaitingListRequest,
  joinWaitingListRequestSchema,
  type ListWaitingListQuery as ListWaitingListParams,
  listWaitingListQuerySchema,
  type WaitingListResponse,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission } from '../../identity/index.js';
import { JoinWaitingListCommand } from '../commands/join-waiting-list.command.js';
import { LeaveWaitingListCommand } from '../commands/leave-waiting-list.command.js';
import { ListWaitingListQuery } from '../queries/list-waiting-list.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('scheduling')
@RequireAnyPermission('waiting_list.manage', 'waiting_list.manage.own')
@Controller('waiting-list')
export class WaitingListController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiRoute({
    operationId: 'waitingList.list',
    summary: 'Waiting-list entries (own or linked students for students and parents)',
    status: StatusCodes.OK,
    query: 'ListWaitingListQuery',
    response: 'WaitingListResponse',
  })
  list(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(listWaitingListQuerySchema)) query: ListWaitingListParams,
  ): Promise<WaitingListResponse> {
    return this.queryBus.execute(new ListWaitingListQuery(actor, query));
  }

  @Post()
  @ApiRoute({
    operationId: 'waitingList.join',
    summary: 'Join the waiting list for earlier lessons',
    status: StatusCodes.CREATED,
    body: 'JoinWaitingListRequest',
    response: 'CommandResult',
  })
  join(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(joinWaitingListRequestSchema)) body: JoinWaitingListRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new JoinWaitingListCommand(actor, body));
  }

  @Delete(':id')
  @ApiRoute({
    operationId: 'waitingList.leave',
    summary: 'Leave the waiting list',
    status: StatusCodes.NO_CONTENT,
    params: 'IdParams',
  })
  async leave(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
  ): Promise<void> {
    await this.commandBus.execute(new LeaveWaitingListCommand(actor, params.id));
  }
}
