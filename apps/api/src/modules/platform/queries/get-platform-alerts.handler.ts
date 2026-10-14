import type { PlatformAlertListResponse } from '@driveos/shared';
import { AlertStore } from '../../../kernel/alerts/alert-store.js';
import { type IQueryHandler, QueryHandler } from '../../../kernel/cqrs/index.js';
import { GetPlatformAlertsQuery } from './get-platform-alerts.query.js';

@QueryHandler(GetPlatformAlertsQuery)
export class GetPlatformAlertsHandler implements IQueryHandler<
  GetPlatformAlertsQuery,
  PlatformAlertListResponse
> {
  constructor(private readonly store: AlertStore) {}

  execute(): Promise<PlatformAlertListResponse> {
    return this.store.current();
  }
}
