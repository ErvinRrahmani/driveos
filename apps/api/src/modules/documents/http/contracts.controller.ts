import {
  type ContractListResponse,
  type ContractResponse,
  type CreateContractRequest,
  createContractRequestSchema,
  type IdParams,
  idParamsSchema,
  type ListContractsQuery as ListContractsParams,
  listContractsQuerySchema,
  type SignContractRequest,
  signContractRequestSchema,
  type SignContractResponse,
} from '@driveos/shared';
import { Body, Controller, Get, Headers, Ip, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission, RequirePermission } from '../../identity/index.js';
import { CreateContractCommand } from '../commands/create-contract.command.js';
import { SignContractCommand } from '../commands/sign-contract.command.js';
import { GetContractQuery } from '../queries/get-contract.query.js';
import { ListContractsQuery } from '../queries/list-contracts.query.js';

@ApiTags('documents')
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequireAnyPermission('contracts.manage', 'contracts.sign', 'documents.read')
  @ApiRoute({
    operationId: 'contracts.list',
    summary: 'Contracts (own or linked students for students and parents)',
    status: StatusCodes.OK,
    query: 'ListContractsQuery',
    response: 'ContractListResponse',
  })
  list(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(listContractsQuerySchema)) query: ListContractsParams,
  ): Promise<ContractListResponse> {
    return this.queryBus.execute(new ListContractsQuery(actor, query));
  }

  @Post()
  @RequirePermission('contracts.manage')
  @ApiRoute({
    operationId: 'contracts.create',
    summary: 'Create a contract for a student from a template',
    status: StatusCodes.CREATED,
    body: 'CreateContractRequest',
    response: 'CommandResult',
  })
  create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createContractRequestSchema)) body: CreateContractRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new CreateContractCommand(actor, body));
  }

  @Get(':id')
  @RequireAnyPermission('contracts.manage', 'contracts.sign', 'documents.read')
  @ApiRoute({
    operationId: 'contracts.get',
    summary: 'A contract with its signatures',
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'ContractResponse',
  })
  get(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) { id }: IdParams,
  ): Promise<ContractResponse> {
    return this.queryBus.execute(new GetContractQuery(actor, id));
  }

  @Post(':id/sign')
  @RequirePermission('contracts.sign')
  @ApiRoute({
    operationId: 'contracts.sign',
    summary: 'Sign a contract as the student or a guardian',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'SignContractRequest',
    response: 'SignContractResponse',
  })
  sign(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) { id }: IdParams,
    @Body(new ZodValidationPipe(signContractRequestSchema)) body: SignContractRequest,
    @Ip() ip: string | undefined,
    @Headers('user-agent') userAgent: string | undefined,
  ): Promise<SignContractResponse> {
    return this.commandBus.execute(
      new SignContractCommand(actor, id, body, { ip: ip ?? null, userAgent: userAgent ?? null }),
    );
  }
}
