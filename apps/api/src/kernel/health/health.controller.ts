import { Controller, Get } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiDefaultResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { HealthResponse } from '@driveos/shared';
import { Public } from '../auth/public.decorator.js';
import { RateLimit } from '../http/rate-limit.decorator.js';
import { schemaRef } from '../openapi/schemas.js';
import { GetHealthQuery } from './get-health.query.js';

@Public()
@RateLimit({ name: 'health', keyBy: 'ip' })
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @ApiOperation({ operationId: 'getHealth', summary: 'Liveness check' })
  @ApiOkResponse({ schema: schemaRef('HealthResponse') })
  @ApiDefaultResponse({ schema: schemaRef('ErrorResponse') })
  getHealth(): Promise<HealthResponse> {
    return this.queryBus.execute(new GetHealthQuery());
  }
}
