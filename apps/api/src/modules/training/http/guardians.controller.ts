import {
  type GiveGuardianConsentRequest,
  giveGuardianConsentRequestSchema,
  type GuardianLinkListResponse,
  type ListGuardianLinksQuery,
  listGuardianLinksQuerySchema,
} from '@driveos/shared';
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute, UUID_PARAM } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { GiveGuardianConsentCommand } from '../commands/give-guardian-consent.command.js';
import { ListMyGuardianLinksQuery } from '../queries/list-my-guardian-links.query.js';
import { StatusCodes } from 'http-status-codes';

const linkParamsSchema = z.object({ linkId: z.uuid() });

@ApiTags('training')
@Controller('guardians')
export class GuardiansController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post(':linkId/consent')
  @RequirePermission('consent.give')
  @ApiRoute({
    operationId: 'guardians.giveConsent',
    summary: "A guardian's consent for a minor student",
    status: StatusCodes.OK,
    params: { linkId: UUID_PARAM },
    body: 'GiveGuardianConsentRequest',
    response: 'CommandResult',
  })
  giveConsent(
    @CurrentPrincipal() actor: Principal,
    @Param(new ZodValidationPipe(linkParamsSchema)) { linkId }: z.infer<typeof linkParamsSchema>,
    @Body(new ZodValidationPipe(giveGuardianConsentRequestSchema))
    body: GiveGuardianConsentRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new GiveGuardianConsentCommand(actor, linkId, body));
  }
}

@ApiTags('training')
@Controller('guardian-links')
export class GuardianLinksController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @RequirePermission('consent.give')
  @ApiRoute({
    operationId: 'guardians.listMine',
    summary: "The caller's guardian links in the school, with each student's consent state",
    status: StatusCodes.OK,
    query: 'ListGuardianLinksQuery',
    response: 'GuardianLinkListResponse',
  })
  listMine(
    @CurrentPrincipal() actor: Principal,
    @Query(new ZodValidationPipe(listGuardianLinksQuerySchema)) query: ListGuardianLinksQuery,
  ): Promise<GuardianLinkListResponse> {
    return this.queryBus.execute(new ListMyGuardianLinksQuery(actor.userId, query));
  }
}
