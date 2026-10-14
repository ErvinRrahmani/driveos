import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  type AcceptInvitationRequest,
  acceptInvitationRequestSchema,
  type AcceptInvitationResponse,
  type CreateInvitationRequest,
  createInvitationRequestSchema,
  type CreateInvitationResponse,
  type InvitationListResponse,
  type ListInvitationsQuery as ListInvitationsQueryParams,
  listInvitationsQuerySchema,
  membershipRoleSchema,
} from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { RateLimit } from '../../../kernel/http/rate-limit.decorator.js';
import { Public } from '../../../kernel/auth/public.decorator.js';
import type { Env } from '../../../kernel/config/env.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { schemaRef } from '../../../kernel/openapi/schemas.js';
import { AcceptInvitationCommand } from '../commands/accept-invitation.command.js';
import { CreateInvitationCommand } from '../commands/create-invitation.command.js';
import { ListInvitationsQuery } from '../queries/list-invitations.query.js';
import { RequirePermission } from './require-permission.decorator.js';
import { StatusCodes } from 'http-status-codes';

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  private readonly exposeAcceptToken: boolean;

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    config: ConfigService<Env, true>,
  ) {
    this.exposeAcceptToken = config.get('NODE_ENV', { infer: true }) !== 'production';
  }

  @Post()
  @HttpCode(StatusCodes.CREATED)
  @ApiBearerAuth()
  @RequirePermission('invitations.manage')
  @ApiOperation({
    operationId: 'createInvitation',
    summary: 'Invite someone to the school with a set of roles',
    description:
      'Owners are never invited here (platform onboarding creates them). Student and parent invitations need a studentId. `acceptToken` is returned outside production only.',
  })
  @ApiBody({ schema: schemaRef('CreateInvitationRequest') })
  @ApiCreatedResponse({ schema: schemaRef('CreateInvitationResponse') })
  @ApiUnauthorizedResponse({ schema: schemaRef('ErrorResponse') })
  @ApiNotFoundResponse({ schema: schemaRef('ErrorResponse') })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(new ZodValidationPipe(createInvitationRequestSchema)) body: CreateInvitationRequest,
  ): Promise<CreateInvitationResponse> {
    const created = await this.commandBus.execute(
      new CreateInvitationCommand(
        principal.userId,
        body.roles,
        { phone: body.phone, email: body.email },
        body.studentId ?? null,
        body.branchIds ?? [],
      ),
    );
    return this.exposeAcceptToken ? created : { id: created.id, version: created.version };
  }

  @Get()
  @ApiBearerAuth()
  @RequirePermission('invitations.manage')
  @ApiOperation({
    operationId: 'listInvitations',
    summary: "The school's open invitations, newest first",
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({ name: 'studentId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'role',
    required: false,
    schema: { type: 'string', enum: [...membershipRoleSchema.options] },
  })
  @ApiOkResponse({ schema: schemaRef('InvitationListResponse') })
  @ApiBadRequestResponse({ schema: schemaRef('ErrorResponse') })
  @ApiUnauthorizedResponse({ schema: schemaRef('ErrorResponse') })
  list(
    @Query(new ZodValidationPipe(listInvitationsQuerySchema)) query: ListInvitationsQueryParams,
  ): Promise<InvitationListResponse> {
    return this.queryBus.execute(
      new ListInvitationsQuery(query.limit, query.cursor, {
        studentId: query.studentId,
        role: query.role,
      }),
    );
  }

  @Post(':token/accept')
  @Public()
  @RateLimit({ name: 'invitations', keyBy: 'ip+route' })
  @HttpCode(StatusCodes.OK)
  @ApiOperation({
    operationId: 'acceptInvitation',
    summary: 'Accept an invitation: creates the account if needed and joins the school',
    description:
      "fullName is required when no account exists for the invitation's contact. Afterwards the client signs in with the one-time-code flow.",
  })
  @ApiParam({ name: 'token', schema: { type: 'string' } })
  @ApiBody({ schema: schemaRef('AcceptInvitationRequest') })
  @ApiOkResponse({ schema: schemaRef('AcceptInvitationResponse') })
  @ApiNotFoundResponse({ schema: schemaRef('ErrorResponse') })
  @ApiConflictResponse({ schema: schemaRef('ErrorResponse') })
  @ApiGoneResponse({ schema: schemaRef('ErrorResponse') })
  accept(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(acceptInvitationRequestSchema)) body: AcceptInvitationRequest,
  ): Promise<AcceptInvitationResponse> {
    return this.commandBus.execute(new AcceptInvitationCommand(token, body.fullName, body.locale));
  }
}
