import { type ShopQuery, shopQuerySchema, type ShopResponse } from '@driveos/shared';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { GetShopQuery } from '../queries/get-shop.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('billing')
@Controller('shop')
export class ShopController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @RequirePermission('shop.read')
  @ApiRoute({
    operationId: 'shop.get',
    summary: 'What a student can buy',
    status: StatusCodes.OK,
    query: 'ShopQuery',
    response: 'ShopResponse',
  })
  get(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(shopQuerySchema)) query: ShopQuery,
  ): Promise<ShopResponse> {
    return this.queryBus.execute(new GetShopQuery(actor, query));
  }
}
