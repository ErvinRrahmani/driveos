import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AddTimeOffRequest,
  addTimeOffRequestSchema,
  type AvailabilityResponse,
  type IdParams,
  idParamsSchema,
  type ReplaceAvailabilityRequest,
  replaceAvailabilityRequestSchema,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission } from '../../identity/index.js';
import { AddTimeOffCommand } from '../commands/add-time-off.command.js';
import { ReplaceAvailabilityCommand } from '../commands/replace-availability.command.js';
import { GetAvailabilityQuery } from '../queries/get-availability.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('scheduling')
@Controller('instructors')
export class AvailabilityController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get(':id/availability')
  @RequireAnyPermission('availability.manage', 'availability.manage.own', 'calendar.read')
  @ApiRoute({
    operationId: 'availability.get',
    summary: "An instructor's weekly availability and upcoming time off",
    status: StatusCodes.OK,
    params: 'IdParams',
    response: 'AvailabilityResponse',
  })
  get(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
  ): Promise<AvailabilityResponse> {
    return this.queryBus.execute(new GetAvailabilityQuery(actor, params.id));
  }

  @Put(':id/availability')
  @RequireAnyPermission('availability.manage', 'availability.manage.own')
  @ApiRoute({
    operationId: 'availability.replace',
    summary: "Replace an instructor's weekly availability from a date on",
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'ReplaceAvailabilityRequest',
    response: 'AvailabilityResponse',
  })
  replace(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(replaceAvailabilityRequestSchema)) body: ReplaceAvailabilityRequest,
  ): Promise<AvailabilityResponse> {
    return this.commandBus.execute(new ReplaceAvailabilityCommand(actor, params.id, body));
  }

  @Post(':id/time-off')
  @RequireAnyPermission('availability.manage', 'availability.manage.own')
  @ApiRoute({
    operationId: 'timeOff.add',
    summary: 'Add time off for an instructor',
    status: StatusCodes.CREATED,
    params: 'IdParams',
    body: 'AddTimeOffRequest',
    response: 'CommandResult',
  })
  addTimeOff(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(addTimeOffRequestSchema)) body: AddTimeOffRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new AddTimeOffCommand(actor, params.id, body));
  }
}
