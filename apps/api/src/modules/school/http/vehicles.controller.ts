import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission, RequirePermission } from '../../identity/index.js';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  type CreateVehicleRequest,
  createVehicleRequestSchema,
  type IdParams,
  idParamsSchema,
  type ListVehiclesQuery as ListVehiclesParams,
  listVehiclesQuerySchema,
  type UpdateVehicleRequest,
  updateVehicleRequestSchema,
  type VehicleListResponse,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import type { CommandResult } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { CreateVehicleCommand } from '../commands/create-vehicle.command.js';
import { UpdateVehicleCommand } from '../commands/update-vehicle.command.js';
import { ListVehiclesQuery } from '../queries/list-vehicles.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('school')
@Controller('vehicles')
export class VehiclesController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequireAnyPermission('vehicles.manage', 'calendar.read', 'calendar.read.own')
  @ApiRoute({
    operationId: 'vehicles.list',
    summary: "The school's vehicles",
    status: StatusCodes.OK,
    query: 'ListVehiclesQuery',
    response: 'VehicleListResponse',
  })
  list(
    @Query(new ZodValidationPipe(listVehiclesQuerySchema)) query: ListVehiclesParams,
  ): Promise<VehicleListResponse> {
    return this.queryBus.execute(new ListVehiclesQuery(query));
  }

  @Post()
  @RequirePermission('vehicles.manage')
  @ApiRoute({
    operationId: 'vehicles.create',
    summary: 'Add a vehicle',
    status: StatusCodes.CREATED,
    body: 'CreateVehicleRequest',
    response: 'CommandResult',
  })
  create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createVehicleRequestSchema)) body: CreateVehicleRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new CreateVehicleCommand(actor, body));
  }

  @Patch(':id')
  @RequirePermission('vehicles.manage')
  @ApiRoute({
    operationId: 'vehicles.update',
    summary: 'Change a vehicle',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'UpdateVehicleRequest',
    response: 'CommandResult',
  })
  update(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(updateVehicleRequestSchema)) body: UpdateVehicleRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new UpdateVehicleCommand(actor, params.id, body));
  }
}
