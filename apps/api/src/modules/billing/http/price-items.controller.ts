import {
  type CreatePriceItemRequest,
  createPriceItemRequestSchema,
  type IdParams,
  idParamsSchema,
  type ListPriceItemsQuery as ListPriceItemsParams,
  listPriceItemsQuerySchema,
  type PriceItemListResponse,
  type UpdatePriceItemRequest,
  updatePriceItemRequestSchema,
} from '@driveos/shared';
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequireAnyPermission, RequirePermission } from '../../identity/index.js';
import { CreatePriceItemCommand } from '../commands/create-price-item.command.js';
import { UpdatePriceItemCommand } from '../commands/update-price-item.command.js';
import { ListPriceItemsQuery } from '../queries/list-price-items.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('billing')
@Controller('price-items')
export class PriceItemsController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequireAnyPermission('prices.read', 'prices.manage')
  @ApiRoute({
    operationId: 'priceItems.list',
    summary: 'Price items (lessons, packages, exam fees, products)',
    status: StatusCodes.OK,
    query: 'ListPriceItemsQuery',
    response: 'PriceItemListResponse',
  })
  list(
    @Query(new ZodValidationPipe(listPriceItemsQuerySchema)) query: ListPriceItemsParams,
  ): Promise<PriceItemListResponse> {
    return this.queryBus.execute(new ListPriceItemsQuery(query));
  }

  @Post()
  @RequirePermission('prices.manage')
  @ApiRoute({
    operationId: 'priceItems.create',
    summary: 'Add a price item',
    status: StatusCodes.CREATED,
    body: 'CreatePriceItemRequest',
    response: 'CommandResult',
  })
  create(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(createPriceItemRequestSchema)) body: CreatePriceItemRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new CreatePriceItemCommand(actor, body));
  }

  @Patch(':id')
  @RequirePermission('prices.manage')
  @ApiRoute({
    operationId: 'priceItems.update',
    summary: 'Change a price item (applies to future purchases only)',
    status: StatusCodes.OK,
    params: 'IdParams',
    body: 'UpdatePriceItemRequest',
    response: 'CommandResult',
  })
  update(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(idParamsSchema)) params: IdParams,
    @Body(new ZodValidationPipe(updatePriceItemRequestSchema)) body: UpdatePriceItemRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new UpdatePriceItemCommand(actor, params.id, body));
  }
}
