import { createHash } from 'node:crypto';
import {
  type CaptureLeadRequest,
  captureLeadRequestSchema,
  type CaptureLeadResponse,
  type PublicSlugParams,
  publicSlugParamsSchema,
} from '@driveos/shared';
import { Body, Controller, Ip, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { StatusCodes } from 'http-status-codes';
import { Public } from '../../../kernel/auth/public.decorator.js';
import { CommandBus, QueryBus } from '../../../kernel/cqrs/index.js';
import { newId } from '../../../kernel/db/columns.js';
import { RateLimit } from '../../../kernel/http/rate-limit.decorator.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { TenantContext } from '../../../kernel/tenant/tenant-context.js';
import { ResolvePublicSchoolQuery } from '../../school/index.js';
import { CaptureLeadCommand } from '../commands/capture-lead.command.js';

/**
 * The enrolment form on a school's public page (design §5.2). `@Public()` routes get no tenant
 * scope: the school is resolved in a school-less transaction (SECURITY DEFINER
 * `school_id_for_public_slug` + the `enrolment_page` feature, 404 `school_not_found` otherwise),
 * then the lead is written in that school's own transaction without a user.
 */
@ApiTags('leads')
@Controller('public/schools')
export class PublicLeadsController {
  constructor(
    private readonly tenant: TenantContext,
    private readonly queryBus: QueryBus,
    private readonly commandBus: CommandBus,
  ) {}

  @Post(':slug/leads')
  @Public()
  @RateLimit({ name: 'leads', keyBy: 'ip+route' })
  @ApiRoute({
    operationId: 'publicLeads.capture',
    summary:
      'Send an enquiry from the public enrolment page (no login; 404 school_not_found when not published)',
    status: StatusCodes.CREATED,
    params: 'PublicSlugParams',
    body: 'CaptureLeadRequest',
    response: 'CaptureLeadResponse',
    public: true,
  })
  async capture(
    @Param(new ZodValidationPipe(publicSlugParamsSchema)) { slug }: PublicSlugParams,
    @Body(new ZodValidationPipe(captureLeadRequestSchema)) body: CaptureLeadRequest,
    @Ip() ip: string | undefined,
  ): Promise<CaptureLeadResponse> {
    const { website, ...lead } = body;
    // Honeypot: a bot filled the hidden field. Answer like a success and write nothing.
    if (website) return { id: newId() };
    const schoolId = await this.tenant.runInTenant({ schoolId: null, userId: null }, () =>
      this.queryBus.execute(new ResolvePublicSchoolQuery(slug)),
    );
    const requestIpHash = ip ? createHash('sha256').update(ip).digest('hex') : null;
    const { id } = await this.tenant.runInTenant({ schoolId, userId: null }, () =>
      this.commandBus.execute(
        new CaptureLeadCommand({ source: 'page', body: lead, requestIpHash }),
      ),
    );
    return { id };
  }
}
