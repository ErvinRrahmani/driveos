import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type PublicProfile,
  type UpdatePublicProfileRequest,
  updatePublicProfileRequestSchema,
} from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import { CurrentPrincipal } from '../../../kernel/auth/current-principal.decorator.js';
import type { Principal } from '../../../kernel/auth/principal.js';
import { CommandBus, type CommandResult, QueryBus } from '../../../kernel/cqrs/index.js';
import { notFound } from '../../../kernel/http/errors.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { RequirePermission } from '../../identity/index.js';
import { UpdatePublicProfileCommand } from '../commands/update-public-profile.command.js';
import { GetPublicProfileQuery } from '../queries/get-public-profile.query.js';

@ApiTags('school')
@Controller('school/public-profile')
export class PublicProfileController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Get()
  @RequirePermission('public_page.manage')
  @ApiRoute({
    operationId: 'publicProfile.get',
    summary: "The school's public enrolment page settings (404 until first saved)",
    status: StatusCodes.OK,
    response: 'PublicProfile',
  })
  async get(): Promise<PublicProfile> {
    const profile = await this.queryBus.execute(new GetPublicProfileQuery());
    if (!profile) throw notFound();
    return profile;
  }

  @Put()
  @RequirePermission('public_page.manage')
  @ApiRoute({
    operationId: 'publicProfile.update',
    summary:
      'Create or change the public page settings (slug required the first time; publishing needs the enrolment_page plan feature)',
    status: StatusCodes.OK,
    body: 'UpdatePublicProfileRequest',
    response: 'CommandResult',
  })
  update(
    @CurrentPrincipal() actor: Principal,
    @Body(new ZodValidationPipe(updatePublicProfileRequestSchema)) body: UpdatePublicProfileRequest,
  ): Promise<CommandResult> {
    return this.commandBus.execute(new UpdatePublicProfileCommand(actor, body));
  }
}
