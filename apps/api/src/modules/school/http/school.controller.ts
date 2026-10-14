import { Body, Controller, Get, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  type ConnectPaymentAccountRequest,
  connectPaymentAccountRequestSchema,
  type ConnectPaymentAccountResponse,
  type OpeningHoursResponse,
  type ReplaceOpeningHoursRequest,
  replaceOpeningHoursRequestSchema,
  type SchoolResponse,
  type SchoolSettings,
  type UpdateSchoolRequest,
  updateSchoolRequestSchema,
  type UpdateSchoolSettingsRequest,
  updateSchoolSettingsRequestSchema,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import type { CommandResult } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ConnectPaymentAccountCommand } from '../commands/connect-payment-account.command.js';
import { ReplaceOpeningHoursCommand } from '../commands/replace-opening-hours.command.js';
import { UpdateSchoolSettingsCommand } from '../commands/update-school-settings.command.js';
import { UpdateSchoolCommand } from '../commands/update-school.command.js';
import { GetOpeningHoursQuery } from '../queries/get-opening-hours.query.js';
import { GetSchoolSettingsQuery } from '../queries/get-school-settings.query.js';
import { GetSchoolQuery } from '../queries/get-school.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('school')
@Controller('school')
export class SchoolController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermission('school.read')
  @ApiRoute({
    operationId: 'school.get',
    summary: "The school's profile",
    status: StatusCodes.OK,
    response: 'SchoolResponse',
  })
  get(): Promise<SchoolResponse> {
    return this.queryBus.execute(new GetSchoolQuery());
  }

  @Patch()
  @RequirePermission('school.manage')
  @ApiRoute({
    operationId: 'school.update',
    summary: "Change the school's profile and legal details",
    status: StatusCodes.OK,
    body: 'UpdateSchoolRequest',
    response: 'CommandResult',
  })
  update(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(updateSchoolRequestSchema)) body: UpdateSchoolRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new UpdateSchoolCommand(actor, body));
  }

  @Get('settings')
  @RequirePermission('school.read')
  @ApiRoute({
    operationId: 'schoolSettings.get',
    summary: "The school's booking, cancellation and notification settings",
    status: StatusCodes.OK,
    response: 'SchoolSettings',
  })
  getSettings(): Promise<SchoolSettings> {
    return this.queryBus.execute(new GetSchoolSettingsQuery());
  }

  @Patch('settings')
  @RequirePermission('settings.manage')
  @ApiRoute({
    operationId: 'schoolSettings.update',
    summary: "Change the school's settings",
    status: StatusCodes.OK,
    body: 'UpdateSchoolSettingsRequest',
    response: 'CommandResult',
  })
  updateSettings(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(updateSchoolSettingsRequestSchema))
    body: UpdateSchoolSettingsRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new UpdateSchoolSettingsCommand(actor, body));
  }

  @Get('opening-hours')
  @RequirePermission('school.read')
  @ApiRoute({
    operationId: 'openingHours.get',
    summary: 'Weekly opening hours (local wall-clock times)',
    status: StatusCodes.OK,
    response: 'OpeningHoursResponse',
  })
  getOpeningHours(): Promise<OpeningHoursResponse> {
    return this.queryBus.execute(new GetOpeningHoursQuery(null));
  }

  @Put('opening-hours')
  @RequirePermission('settings.manage')
  @ApiRoute({
    operationId: 'openingHours.replace',
    summary: 'Replace the weekly opening hours',
    status: StatusCodes.OK,
    body: 'ReplaceOpeningHoursRequest',
    response: 'OpeningHoursResponse',
  })
  replaceOpeningHours(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(replaceOpeningHoursRequestSchema))
    body: ReplaceOpeningHoursRequest,
  ): Promise<OpeningHoursResponse> {
    return this.commandBus.execute(new ReplaceOpeningHoursCommand(actor, body));
  }

  @Post('payment-account')
  @RequirePermission('payment_account.manage')
  @ApiRoute({
    operationId: 'paymentAccount.connect',
    summary: "Connect the school's payment provider account (fake in dev)",
    status: StatusCodes.OK,
    body: 'ConnectPaymentAccountRequest',
    response: 'ConnectPaymentAccountResponse',
  })
  connectPaymentAccount(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(connectPaymentAccountRequestSchema))
    body: ConnectPaymentAccountRequest,
  ): Promise<ConnectPaymentAccountResponse> {
    return this.commandBus.execute(new ConnectPaymentAccountCommand(actor, body));
  }
}
