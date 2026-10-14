import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type PublicSchoolPage,
  type PublicSlugParams,
  publicSlugParamsSchema,
} from '@driveos/shared';
import { StatusCodes } from 'http-status-codes';
import { Public } from '../../../kernel/auth/public.decorator.js';
import { RateLimit } from '../../../kernel/http/rate-limit.decorator.js';
import { ZodValidationPipe } from '../../../kernel/http/validation.js';
import { ApiRoute } from '../../../kernel/openapi/api-route.decorator.js';
import { PublicPages } from '../infra/public-pages.js';

@ApiTags('school')
@Controller('public/schools')
export class PublicSchoolController {
  constructor(private readonly publicPages: PublicPages) {}

  @Get(':slug')
  @Public()
  @RateLimit({ name: 'public-page', keyBy: 'ip+route' })
  @ApiRoute({
    operationId: 'publicSchools.get',
    summary: "A school's public enrolment page (no login; 404 school_not_found when not published)",
    status: StatusCodes.OK,
    params: 'PublicSlugParams',
    response: 'PublicSchoolPage',
    public: true,
  })
  @Header('Cache-Control', 'public, max-age=60')
  get(
    @Param(new ZodValidationPipe(publicSlugParamsSchema)) { slug }: PublicSlugParams,
  ): Promise<PublicSchoolPage> {
    return this.publicPages.render(slug);
  }
}
