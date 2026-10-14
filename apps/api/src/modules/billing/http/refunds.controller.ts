import {
  type IssueRefundRequest,
  issueRefundRequestSchema,
  type IssueRefundResponse,
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
import { IssueRefundCommand } from '../commands/issue-refund.command.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('billing')
@Controller('refunds')
export class RefundsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @Idempotent()
  @RequirePermission('refunds.create')
  @ApiRoute({
    operationId: 'refunds.issue',
    summary: 'Refund a payment, with a credit note and removed credits',
    status: StatusCodes.CREATED,
    body: 'IssueRefundRequest',
    response: 'IssueRefundResponse',
  })
  issue(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(issueRefundRequestSchema)) body: IssueRefundRequest,
  ): Promise<IssueRefundResponse> {
    return this.commandBus.execute(new IssueRefundCommand(actor, body));
  }
}
