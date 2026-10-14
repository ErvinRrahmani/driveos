import {
  type PaymentWebhookParams,
  paymentWebhookParamsSchema,
  type PaymentWebhookResponse,
} from '@driveos/shared';
import { Controller, Headers, Param, Post, type RawBodyRequest, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../../kernel/auth/public.decorator.js';
import { CommandBus } from '../../../kernel/cqrs/index.js';
import { RateLimit } from '../../../kernel/http/rate-limit.decorator.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { HandlePaymentWebhookCommand } from '../commands/handle-payment-webhook.command.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('billing')
@Controller('webhooks/payments')
export class PaymentWebhooksController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post(':provider')
  @Public()
  @RateLimit({ name: 'webhooks', keyBy: 'ip+route' })
  @ApiRoute({
    operationId: 'paymentWebhooks.receive',
    summary: 'Payment provider webhook (authenticated by its signature)',
    status: StatusCodes.OK,
    params: 'PaymentWebhookParams',
    body: 'FakePaymentWebhookEvent',
    response: 'PaymentWebhookResponse',
    public: true,
  })
  receive(
    @Param(new ZodValidationPipe(paymentWebhookParamsSchema)) params: PaymentWebhookParams,
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<PaymentWebhookResponse> {
    return this.commandBus.execute(
      new HandlePaymentWebhookCommand(
        params.provider,
        new Uint8Array(req.rawBody ?? Buffer.alloc(0)),
        headers,
      ),
    );
  }
}
