import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type MeResponse,
  type SessionResponse,
  type SwitchSchoolRequest,
  switchSchoolRequestSchema,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { schemaRef } from '../../../kernel/openapi/schemas.js';
import { SwitchSchoolCommand } from '../commands/switch-school.command.js';
import { GetMeQuery } from '../queries/get-me.query.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('me')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ schema: schemaRef('ErrorResponse') })
@Controller('me')
export class MeController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @ApiOperation({
    operationId: 'getMe',
    summary: 'The caller, their memberships and the active one',
  })
  @ApiOkResponse({ schema: schemaRef('MeResponse') })
  getMe(@CurrentPrincipal() principal: Principal): Promise<MeResponse> {
    return this.queryBus.execute(
      new GetMeQuery(principal.userId, principal.membershipId, principal.schoolId),
    );
  }

  @Post('switch-school')
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    operationId: 'switchSchool',
    summary: "Start a session bound to one of the caller's active memberships",
  })
  @ApiBody({ schema: schemaRef('SwitchSchoolRequest') })
  @ApiOkResponse({ schema: schemaRef('SessionResponse') })
  @ApiNotFoundResponse({ schema: schemaRef('ErrorResponse') })
  switchSchool(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(switchSchoolRequestSchema)) body: SwitchSchoolRequest,
  ): Promise<SessionResponse> {
    return this.commandBus.execute(
      new SwitchSchoolCommand(principal.userId, body.membershipId, body.client),
    );
  }
}
