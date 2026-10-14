import { Body, Controller, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type UpdateMembershipRequest, updateMembershipRequestSchema } from '@driveos/shared';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import type { CommandResult } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { schemaRef } from '../../../kernel/openapi/schemas.js';
import { UpdateMembershipCommand } from '../commands/update-membership.command.js';
import { RequirePermission } from './require-permission.decorator.js';

@ApiTags('memberships')
@ApiBearerAuth()
@Controller('memberships')
export class MembershipsController {
  constructor(private readonly commandBus: CommandBus) {}

  @Patch(':id')
  @RequirePermission('memberships.manage')
  @ApiOperation({
    operationId: 'updateMembership',
    summary: "Change a membership's roles, branches or permission grants, or disable it",
    description:
      'Only an owner may give or take the owner role; the last active owner cannot lose it or be disabled. Disabling revokes the sessions bound to the membership.',
  })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: schemaRef('UpdateMembershipRequest') })
  @ApiOkResponse({ schema: schemaRef('CommandResult') })
  @ApiUnauthorizedResponse({ schema: schemaRef('ErrorResponse') })
  @ApiNotFoundResponse({ schema: schemaRef('ErrorResponse') })
  @ApiConflictResponse({ schema: schemaRef('ErrorResponse') })
  update(
    @CurrentPrincipal() principal: Principal,
    @Param('id', new ParseUUIDPipe({ exceptionFactory: () => notFound() })) id: string,
    @Body(new ZodValidationPipe(updateMembershipRequestSchema)) body: UpdateMembershipRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new UpdateMembershipCommand(id, principal.roles, body));
  }
}
