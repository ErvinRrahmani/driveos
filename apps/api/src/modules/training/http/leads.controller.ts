import {
  type ConvertLeadRequest,
  convertLeadRequestSchema,
  type ConvertLeadResponse,
  type CreateLeadRequest,
  createLeadRequestSchema,
  type IdParams,
  idParamsSchema,
  type Lead,
  type LeadListResponse,
  type ListLeadsQuery as ListLeadsParams,
  listLeadsQuerySchema,
  type UpdateLeadRequest,
  updateLeadRequestSchema,
} from '@driveos/shared';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { Idempotent } from '../../../kernel/idempotency/index.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { CaptureLeadCommand } from '../commands/capture-lead.command.js';
import { ConvertLeadCommand } from '../commands/convert-lead.command.js';
import { UpdateLeadCommand } from '../commands/update-lead.command.js';
import { GetLeadQuery } from '../queries/get-lead.query.js';
import { ListLeadsQuery } from '../queries/list-leads.query.js';

const params = new ZodValidationPipe(idParamsSchema);

@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermission('leads.read')
  @ApiRoute({
    operationId: 'leads.list',
    summary: 'Enquiries from the enrolment page and staff, newest first',
    status: StatusCodes.OK,
    query: 'ListLeadsQuery',
    response: 'LeadListResponse',
  })
  list(
    @Query(new ZodValidationPipe(listLeadsQuerySchema)) query: ListLeadsParams,
  ): Promise<LeadListResponse> {
    return this.queryBus.execute(new ListLeadsQuery(query));
  }

  @Post()
  @RequirePermission('leads.manage')
  @ApiRoute({
    operationId: 'leads.create',
    summary: 'Add a lead by hand (phone call, walk-in); needs the enrolment_page plan feature',
    status: StatusCodes.CREATED,
    body: 'CreateLeadRequest',
    response: 'CommandResult',
  })
  create(
    @Body(new ZodValidationPipe(createLeadRequestSchema)) body: CreateLeadRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(
      new CaptureLeadCommand({ source: 'manual', body, requestIpHash: null }),
    );
  }

  @Get(':id')
  @RequirePermission('leads.read')
  @ApiRoute({
    operationId: 'leads.get',
    summary: 'A lead',
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'Lead',
  })
  get(@Param(params) { id }: IdParams): Promise<Lead> {
    return this.queryBus.execute(new GetLeadQuery(id));
  }

  @Patch(':id')
  @RequirePermission('leads.manage')
  @ApiRoute({
    operationId: 'leads.update',
    summary: 'Mark a lead contacted or lost, or change its note',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'UpdateLeadRequest',
    response: 'CommandResult',
  })
  update(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
    @Body(new ZodValidationPipe(updateLeadRequestSchema)) body: UpdateLeadRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new UpdateLeadCommand(actor, id, body));
  }

  @Post(':id/convert')
  @Idempotent()
  @RequirePermission('leads.manage')
  @ApiRoute({
    operationId: 'leads.convert',
    summary: "Turn a lead into a student and invite them (and a minor's guardian)",
    status: StatusCodes.CREATED,
    params: 'IdParams',
    body: 'ConvertLeadRequest',
    response: 'ConvertLeadResponse',
  })
  convert(
    @CurrentPrincipal() actor: Principal,
    @Param(params) { id }: IdParams,
    @Body(new ZodValidationPipe(convertLeadRequestSchema)) body: ConvertLeadRequest,
  ): Promise<ConvertLeadResponse> {
    return this.commandBus.execute(new ConvertLeadCommand(actor, id, body));
  }
}
