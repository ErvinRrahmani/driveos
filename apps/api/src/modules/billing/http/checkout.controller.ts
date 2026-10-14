import {
  type CheckoutRequest,
  checkoutRequestSchema,
  type CheckoutResponse,
} from '@driveos/shared';
import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { Idempotent } from '../../../kernel/idempotency/index.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { StartCheckoutCommand } from '../commands/start-checkout.command.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('billing')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @Idempotent()
  @RequirePermission('checkout.create')
  @ApiRoute({
    operationId: 'checkout.start',
    summary: 'Start paying for shop items with the payment provider',
    status: StatusCodes.CREATED,
    body: 'CheckoutRequest',
    response: 'CheckoutResponse',
  })
  start(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(checkoutRequestSchema)) body: CheckoutRequest,
  ): Promise<CheckoutResponse> {
    return this.commandBus.execute(new StartCheckoutCommand(actor, body));
  }
}
