import { Body, Controller, HttpCode, Ip, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type LogoutRequest,
  logoutRequestSchema,
  type RefreshSessionRequest,
  refreshSessionRequestSchema,
  type RequestLoginCodeRequest,
  requestLoginCodeRequestSchema,
  type RequestLoginCodeResponse,
  type SessionResponse,
  type VerifyLoginCodeRequest,
  verifyLoginCodeRequestSchema,
} from '@driveos/shared';
import { Public } from '../../../kernel/auth/public.decorator.js';
import { RateLimit } from '../../../kernel/http/rate-limit.decorator.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { schemaRef } from '../../../kernel/openapi/schemas.js';
import { RefreshSessionCommand } from '../commands/refresh-session.command.js';
import { RequestLoginCodeCommand } from '../commands/request-login-code.command.js';
import { RevokeSessionCommand } from '../commands/revoke-session.command.js';
import { VerifyLoginCodeCommand } from '../commands/verify-login-code.command.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('auth')
@Public()
@RateLimit({ name: 'auth', keyBy: 'ip+route' })
@Controller('auth')
export class AuthController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('code')
  @HttpCode(StatusCodes.ACCEPTED)
  @ApiOperation({
    operationId: 'requestLoginCode',
    summary: 'Send a one-time sign-in code to a phone or email; always 202',
  })
  @ApiBody({ schema: schemaRef('RequestLoginCodeRequest') })
  @ApiAcceptedResponse({ schema: schemaRef('RequestLoginCodeResponse') })
  @ApiBadRequestResponse({ schema: schemaRef('ErrorResponse') })
  async requestCode(
    @Body(new ZodValidationPipe(requestLoginCodeRequestSchema)) body: RequestLoginCodeRequest,
    @Ip() ip: string,
  ): Promise<RequestLoginCodeResponse> {
    await this.commandBus.execute(new RequestLoginCodeCommand(body.contact, ip));
    return {};
  }

  @Post('verify')
  @RateLimit({ name: 'auth-contact', keyBy: 'contact' })
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ operationId: 'verifyLoginCode', summary: 'Exchange a code for a session' })
  @ApiBody({ schema: schemaRef('VerifyLoginCodeRequest') })
  @ApiOkResponse({ schema: schemaRef('SessionResponse') })
  @ApiUnauthorizedResponse({ schema: schemaRef('ErrorResponse') })
  @ApiForbiddenResponse({ schema: schemaRef('ErrorResponse') })
  verify(
    @Body(new ZodValidationPipe(verifyLoginCodeRequestSchema)) body: VerifyLoginCodeRequest,
  ): Promise<SessionResponse> {
    return this.commandBus.execute(
      new VerifyLoginCodeCommand(body.contact, body.code, body.client),
    );
  }

  @Post('refresh')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({ operationId: 'refreshSession', summary: 'Rotate the refresh token' })
  @ApiBody({ schema: schemaRef('RefreshSessionRequest') })
  @ApiOkResponse({ schema: schemaRef('SessionResponse') })
  @ApiUnauthorizedResponse({ schema: schemaRef('ErrorResponse') })
  refresh(
    @Body(new ZodValidationPipe(refreshSessionRequestSchema)) body: RefreshSessionRequest,
  ): Promise<SessionResponse> {
    return this.commandBus.execute(new RefreshSessionCommand(body.refreshToken));
  }

  @Post('logout')
  @HttpCode(StatusCodes.NO_CONTENT)
  @ApiOperation({ operationId: 'logout', summary: 'Revoke the refresh token family' })
  @ApiBody({ schema: schemaRef('LogoutRequest') })
  @ApiNoContentResponse()
  async logout(
    @Body(new ZodValidationPipe(logoutRequestSchema)) body: LogoutRequest,
  ): Promise<void> {
    await this.commandBus.execute(new RevokeSessionCommand(body.refreshToken));
  }
}
