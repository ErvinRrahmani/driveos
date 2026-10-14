import {
  type RecordCashPaymentRequest,
  recordCashPaymentRequestSchema,
  type RecordCashPaymentResponse,
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
import { RecordCashPaymentCommand } from '../commands/record-cash-payment.command.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('billing')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('cash')
  @Idempotent()
  @RequirePermission('payments.cash.record')
  @ApiRoute({
    operationId: 'payments.recordCash',
    summary: 'Record a cash or bank-transfer payment',
    status: StatusCodes.CREATED,
    body: 'RecordCashPaymentRequest',
    response: 'RecordCashPaymentResponse',
  })
  recordCash(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(recordCashPaymentRequestSchema)) body: RecordCashPaymentRequest,
  ): Promise<RecordCashPaymentResponse> {
    return this.commandBus.execute(new RecordCashPaymentCommand(actor, body));
  }
}
