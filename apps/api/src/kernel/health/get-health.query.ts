import { Query } from '@nestjs/cqrs';
import type { HealthResponse } from '@driveos/shared';

export class GetHealthQuery extends Query<HealthResponse> {}
