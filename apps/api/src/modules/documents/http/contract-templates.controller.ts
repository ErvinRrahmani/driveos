import {
  type ContractTemplateListResponse,
  type CreateContractTemplateRequest,
  createContractTemplateRequestSchema,
  type ListContractTemplatesQuery as ListContractTemplatesParams,
  listContractTemplatesQuerySchema,
} from '@driveos/shared';
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { CreateContractTemplateCommand } from '../commands/create-contract-template.command.js';
import { ListContractTemplatesQuery } from '../queries/list-contract-templates.query.js';

@ApiTags('documents')
@RequirePermission('contracts.manage')
@Controller('contract-templates')
export class ContractTemplatesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiRoute({
    operationId: 'contractTemplates.list',
    summary: 'Contract templates',
    status: StatusCodes.OK,
    query: 'ListContractTemplatesQuery',
    response: 'ContractTemplateListResponse',
  })
  list(
    @Query(new ZodValidationPipe(listContractTemplatesQuerySchema))
    query: ListContractTemplatesParams,
  ): Promise<ContractTemplateListResponse> {
    return this.queryBus.execute(new ListContractTemplatesQuery(query));
  }

  @Post()
  @ApiRoute({
    operationId: 'contractTemplates.create',
    summary: 'Add a contract template',
    status: StatusCodes.CREATED,
    body: 'CreateContractTemplateRequest',
    response: 'CommandResult',
  })
  create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createContractTemplateRequestSchema))
    body: CreateContractTemplateRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new CreateContractTemplateCommand(actor, body));
  }
}
