import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type RegisterDeviceRequest,
  registerDeviceRequestSchema,
  type RegisterDeviceResponse,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { schemaRef } from '../../../kernel/openapi/schemas.js';
import { RegisterDeviceCommand } from '../commands/register-device.command.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices')
export class DevicesController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post()
  @HttpCode(StatusCodes.CREATED)
  @ApiOperation({ operationId: 'registerDevice', summary: "Register the caller's push token" })
  @ApiBody({ schema: schemaRef('RegisterDeviceRequest') })
  @ApiCreatedResponse({ schema: schemaRef('RegisterDeviceResponse') })
  @ApiUnauthorizedResponse({ schema: schemaRef('ErrorResponse') })
  register(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(registerDeviceRequestSchema)) body: RegisterDeviceRequest,
  ): Promise<RegisterDeviceResponse> {
    return this.commandBus.execute(
      new RegisterDeviceCommand(principal.userId, body.platform, body.pushToken, body.locale),
    );
  }
}
