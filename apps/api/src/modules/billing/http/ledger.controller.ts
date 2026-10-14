import {
  type AdjustLedgerRequest,
  adjustLedgerRequestSchema,
  type AdjustLedgerResponse,
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
import { AdjustLedgerCommand } from '../commands/adjust-ledger.command.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('billing')
@Controller('ledger')
export class LedgerController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('adjustments')
  @Idempotent()
  @RequirePermission('ledger.adjust')
  @ApiRoute({
    operationId: 'ledger.adjust',
    summary: "Adjust a student's credits by hand (audited)",
    status: StatusCodes.CREATED,
    body: 'AdjustLedgerRequest',
    response: 'AdjustLedgerResponse',
  })
  adjust(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(adjustLedgerRequestSchema)) body: AdjustLedgerRequest,
  ): Promise<AdjustLedgerResponse> {
    return this.commandBus.execute(new AdjustLedgerCommand(actor, body));
  }
}
