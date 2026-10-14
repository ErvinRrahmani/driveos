import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  type BranchListResponse,
  type CreateBranchRequest,
  createBranchRequestSchema,
  type IdParams,
  idParamsSchema,
  type ListBranchesQuery as ListBranchesParams,
  listBranchesQuerySchema,
  type UpdateBranchRequest,
  updateBranchRequestSchema,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import type { CommandResult } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { CreateBranchCommand } from '../commands/create-branch.command.js';
import { UpdateBranchCommand } from '../commands/update-branch.command.js';
import { ListBranchesQuery } from '../queries/list-branches.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('school')
@Controller('branches')
export class BranchesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermission('school.read')
  @ApiRoute({
    operationId: 'branches.list',
    summary: "The school's branches",
    status: StatusCodes.OK,
    query: 'ListBranchesQuery',
    response: 'BranchListResponse',
  })
  list(
    @Query(new ZodValidationPipe(listBranchesQuerySchema)) query: ListBranchesParams,
  ): Promise<BranchListResponse> {
    return this.queryBus.execute(new ListBranchesQuery(query));
  }

  @Post()
  @RequirePermission('branches.manage')
  @ApiRoute({
    operationId: 'branches.create',
    summary: 'Add a branch',
    status: StatusCodes.CREATED,
    body: 'CreateBranchRequest',
    response: 'CommandResult',
  })
  create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createBranchRequestSchema)) body: CreateBranchRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new CreateBranchCommand(actor, body));
  }

  @Patch(':id')
  @RequirePermission('branches.manage')
  @ApiRoute({
    operationId: 'branches.update',
    summary: 'Change a branch',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'UpdateBranchRequest',
    response: 'CommandResult',
  })
  update(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(updateBranchRequestSchema)) body: UpdateBranchRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new UpdateBranchCommand(actor, params.id, body));
  }
}
