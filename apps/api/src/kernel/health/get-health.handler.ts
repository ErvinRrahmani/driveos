import { type IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { HealthResponse } from '@driveos/shared';
import { GetHealthQuery } from './get-health.query.js';

@QueryHandler(GetHealthQuery)
export class GetHealthHandler implements IQueryHandler<GetHealthQuery, HealthResponse> {
  async execute(): Promise<HealthResponse> {
    return { status: 'ok', service: 'api' };
  }
}
